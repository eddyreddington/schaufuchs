/**
 * Entwurf des Hallenplan-Editors und alles, was ihn speichert: jede Änderung wirkt sofort im Entwurf und geht der Reihe
 * nach an den Server (`kette`), dazu der Verlauf für Rückgängig/Wiederholen, das automatische Festschreiben vor dem
 * ersten Verschieben und „Plan neu setzen“. Alle teilen dieselben Zähler und Sperren – deshalb ein Hook.
 */
import { type Halle, halleSchluessel, plattenStand } from "@schau/domain";
import { useEffect, useRef, useState } from "react";
import { fehlerText } from "../lib";
import { trpc } from "../trpc";
import { useMeldung } from "../ui";
import { type Aendern, anzahl, type Plan, type Schritt, vollstaendig, vonHandBewegt } from "./hallenplan-geometrie";

/** Zustand und Speicherwege des Entwurfs (Rückgabe von `useHallenEntwurf`). */
export type HallenEntwurf = ReturnType<typeof useHallenEntwurf>;

export function useHallenEntwurf({ schauId, halle, plan, auswahlAufheben }: { schauId: number; halle: Halle; plan: Plan; auswahlAufheben: () => void }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  /** Festschreiben ist unterwegs (automatisch vor dem ersten Verschieben). */
  const festUnterwegs = useRef(false);
  const setzen = trpc.katalog.halleSetzen.useMutation({
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  // Entwurf: jede Änderung wirkt sofort hier; gespeichert wird der Reihe nach (keine Änderung überschreibt eine andere).
  const entwurfRef = useRef<Halle>(vollstaendig(halle));
  const [entwurf, setEntwurf] = useState<Halle>(entwurfRef.current);
  const offen = useRef(0);
  /** Für die Anzeige oben rechts: wie viele Änderungen noch auf dem Weg sind (auch die, die in der Reihe warten). */
  const [offenZahl, setOffenZahl] = useState(0);
  /** „Plan neu setzen“ ist unterwegs: der Server speichert eine andere Halle als den Entwurf (siehe `neuSetzenMit`). */
  const neuUnterwegs = useRef(false);
  const kette = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    // Neuer Stand vom Server (auch von anderen): übernehmen, wenn nichts mehr auf dem Weg ist.
    if (offen.current === 0) {
      entwurfRef.current = vollstaendig(halle);
      setEntwurf(entwurfRef.current);
    }
  }, [halle]);
  /**
   * Verlauf für Rückgängig/Wiederholen: je Änderung im Editor die Halle davor und danach. Rückgängig speichert die Halle
   * von davor wie jede andere Änderung – nur, solange der Plan seitdem nicht anders geändert wurde (auch nicht von anderen).
   */
  const verlauf = useRef<{ zurueck: Schritt[]; vor: Schritt[] }>({ zurueck: [], vor: [] });
  const [, setVerlaufStand] = useState(0);
  const verlaufSetzen = (v: { zurueck: Schritt[]; vor: Schritt[] }) => {
    verlauf.current = v;
    setVerlaufStand((n) => n + 1);
  };
  const aendern: Aendern = (f, opt = {}) => {
    // Während der Plan neu gesetzt wird, ist der Stand auf dem Server ein anderer als hier – erst danach weiter ändern.
    if (neuUnterwegs.current) {
      meldung("Der Plan wird gerade neu gesetzt – bitte gleich noch einmal.", "warnung");
      return entwurfRef.current;
    }
    // Stand, auf dem die Änderung beruht: hat inzwischen jemand anders gespeichert, lehnt der Server ab.
    const basis = halleSchluessel(entwurfRef.current);
    const vorher = entwurfRef.current;
    const neu = vonHandBewegt(vorher, vollstaendig(f(entwurfRef.current)));
    if (halleSchluessel(neu) === basis) return neu;
    const schritt: Schritt | null = opt.ohneVerlauf ? null : { vorher, nachher: neu, was: opt.was ?? "Änderung" };
    if (schritt) verlaufSetzen({ zurueck: [...verlauf.current.zurueck.slice(-99), schritt], vor: [] });
    entwurfRef.current = neu;
    setEntwurf(neu);
    offen.current++;
    setOffenZahl(offen.current);
    // Erstes Verschieben, Drehen oder Ausrichten von Reihen und Platten: vorher den gerechneten Plan festschreiben (sonst
    // stellte die Software die Käfige gleich wieder um). Die Nummern der Platten sind dabei dieselben.
    const vorher_fest = opt.festschreiben && !plan.fest && !festUnterwegs.current;
    if (vorher_fest) festUnterwegs.current = true;
    kette.current = kette.current
      .then(() => (vorher_fest ? festMachen() : undefined))
      .then(() => setzen.mutateAsync({ schauId, halle: neu, basis, ...(opt.grund ? { grund: opt.grund } : {}) }))
      .catch(() => {
        // Meldung kommt über onError. Nicht gespeichert: dieser Schritt fällt aus dem Verlauf (die übrigen bleiben); ging ein
        // Rückgängig oder Wiederholen schief, passt der Verlauf nicht mehr.
        verlaufSetzen(schritt ? { zurueck: verlauf.current.zurueck.filter((x) => x !== schritt), vor: verlauf.current.vor } : { zurueck: [], vor: [] });
      })
      .finally(async () => {
        offen.current--;
        setOffenZahl(offen.current);
        if (offen.current > 0) return;
        await utils.katalog.hallenplan.invalidate();
        // Gespeicherten Stand übernehmen – nach einem Fehler springt der Entwurf so auf den Server zurück.
        const server = utils.katalog.hallenplan.getData({ schauId })?.halle;
        if (server && offen.current === 0) {
          entwurfRef.current = vollstaendig(server);
          setEntwurf(entwurfRef.current);
        }
      });
    return neu;
  };
  /**
   * Automatisch festschreiben (vor dem ersten Verschieben bzw. Entfernen): nur, solange der Plan nicht inzwischen anderswo
   * festgeschrieben ist, und nur, wenn die Grundplatten noch dieselben sind wie im Editor – sonst lehnt der Server ab.
   */
  const festMachen = () => festschreiben.mutateAsync({ schauId, nurWennLose: true, plattenStand: plattenStand(plan) });
  const festschreiben = trpc.katalog.planFestschreiben.useMutation({
    onSuccess: async () => {
      await utils.katalog.hallenplan.invalidate({ schauId });
      meldung("Automatisch planen ist aus – die Käfige bleiben, wo sie stehen.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
    onSettled: () => {
      festUnterwegs.current = false;
    },
  });
  /**
   * Plan neu setzen (Server `planNeuSetzen`): die Software stellt alle Käfige neu; Verschobenes und eingesetzte Teile der
   * bisherigen Aufstellung fallen weg, was nicht in die Reihen passt, bekommt Käfigblöcke. Mit `ziel` zugleich neue
   * Einstellungen der Halle – in einem Schritt, damit nie ein Plan mit Resten der alten Aufstellung entsteht.
   */
  const neuSetzen = trpc.katalog.planNeuSetzen.useMutation({ onError: (e) => meldung(fehlerText(e), "fehler") });
  /** Gibt zurück, ob der Server den neu gesetzten Plan gespeichert hat (nach der Antwort). */
  const neuSetzenMit = (ziel: Halle | null, grund: string): Promise<boolean> => {
    let gespeichert = false;
    const basis = halleSchluessel(entwurfRef.current);
    neuUnterwegs.current = true;
    if (ziel) {
      entwurfRef.current = vollstaendig(ziel);
      setEntwurf(entwurfRef.current);
    }
    auswahlAufheben();
    offen.current++;
    kette.current = kette.current
      .then(() => neuSetzen.mutateAsync({ schauId, grund, ...(ziel ? { halle: vollstaendig(ziel), basis } : {}) }))
      .then((e) => {
        gespeichert = true;
        // Der Verlauf gehörte zur alten Aufstellung.
        verlaufSetzen({ zurueck: [], vor: [] });
        const bloecke = e.eingesetzt ? `, ${anzahl(e.eingesetzt, "Käfigblock", "Käfigblöcke")} eingesetzt` : "";
        if (e.ohne) meldung(`Plan neu gesetzt${bloecke} – ${anzahl(e.ohne, "Tier hat", "Tiere haben")} keinen Platz.`, "warnung");
        else meldung(`Plan neu gesetzt${bloecke}.`);
      })
      .catch(() => {})
      .finally(async () => {
        offen.current--;
        await utils.katalog.hallenplan.invalidate();
        const server = utils.katalog.hallenplan.getData({ schauId })?.halle;
        if (server && offen.current === 0) {
          entwurfRef.current = vollstaendig(server);
          setEntwurf(entwurfRef.current);
        }
        neuUnterwegs.current = false;
      });
    return kette.current.then(() => gespeichert);
  };
  return { entwurf, entwurfRef, aendern, setzen, kette, offen, offenZahl, festUnterwegs, neuUnterwegs, verlauf, verlaufSetzen, festMachen, festschreiben, neuSetzen, neuSetzenMit };
}
