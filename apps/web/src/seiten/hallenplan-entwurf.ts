/**
 * Entwurf des Hallenplan-Editors und alles, was ihn speichert: jede Änderung wirkt sofort im Entwurf und geht der Reihe
 * nach an den Server (`kette`), dazu der Verlauf für Rückgängig/Wiederholen, das automatische Festschreiben vor dem
 * ersten Verschieben und „Plan neu setzen“. Ohne Verbindung werden Speichern und Festschreiben von selbst wiederholt
 * (hallenplan-wiederholen.ts). Alle teilen dieselben Zähler und Sperren – deshalb ein Hook.
 */
import { type Halle, halleSchluessel, oberflaeche, plattenStand } from "@schau/domain";
import { useEffect, useRef, useState } from "react";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { useMeldung } from "../ui";
import { useUngespeichertWarnung } from "../ui-ungespeichert";
import { type Aendern, type Plan, type Schritt, vollstaendig, vonHandBewegt, zahlWort } from "./hallenplan-geometrie";
import { serverStandUebernehmen } from "./hallenplan-laden";
import { mitWiederholen, wartenOderOnline } from "./hallenplan-wiederholen";

/** Zustand und Speicherwege des Entwurfs (Rückgabe von `useHallenEntwurf`). */
export type HallenEntwurf = ReturnType<typeof useHallenEntwurf>;
/** Stand der Speicherungen über `halleSetzen` und das Festschreiben (mit Wiederholen) – Felder wie bei einer Mutation. */
export type Speicherung = { submittedAt: number; isPending: boolean; isError: boolean; verbindung: boolean };

export function useHallenEntwurf({ schauId, halle, plan, auswahlAufheben }: { schauId: number; halle: Halle; plan: Plan; auswahlAufheben: () => void }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const t = useOberflaeche().halleBild.entwurf;
  /** Festschreiben ist unterwegs (automatisch vor dem ersten Verschieben). */
  const festUnterwegs = useRef(false);
  // Fehler meldet `wiederholt` erst, wenn das Wiederholen aufgibt. networkMode "always": ohne Netz scheitert die Anfrage
  // gleich und wird wiederholt, statt still zu pausieren.
  const setzen = trpc.katalog.halleSetzen.useMutation({ networkMode: "always" });
  const festschreiben = trpc.katalog.planFestschreiben.useMutation({ networkMode: "always" });
  /** Seite noch offen: nach dem Verlassen nicht weiter wiederholen. */
  const aktiv = useRef(true);
  useEffect(() => {
    aktiv.current = true;
    return () => {
      aktiv.current = false;
    };
  }, []);
  const laufend = useRef(0);
  const wartend = useRef(0);
  const zuletztNr = useRef(0);
  /** Für die Speicheranzeige: Stand der wiederholten Speicherungen, wie bei einer Mutation (dazu: wartet auf Verbindung). */
  const [speicherung, setSpeicherung] = useState<Speicherung>({ submittedAt: 0, isPending: false, isError: false, verbindung: false });
  const speicherungMelden = (x: Partial<Speicherung> = {}) => {
    const jetzt = { isPending: laufend.current > 0, verbindung: wartend.current > 0 };
    setSpeicherung((s) => ({ ...s, ...x, ...jetzt }));
  };
  /**
   * Senden mit automatischem Wiederholen bei Verbindungsfehlern (hallenplan-wiederholen.ts). `schonAngekommen` prüft nach
   * einem Konflikt bei der Wiederholung, ob die erste Anfrage doch ankam; `danach` läuft nach dem Gelingen, noch als Teil
   * der Speicherung. Echte Fehler werden gemeldet und weitergegeben.
   */
  const wiederholt = async <T>(senden: () => Promise<T>, schonAngekommen: () => Promise<boolean>, danach?: () => Promise<void>) => {
    const nr = ++zuletztNr.current;
    laufend.current++;
    speicherungMelden({ submittedAt: Date.now() });
    try {
      const r = await mitWiederholen({
        senden,
        schonAngekommen,
        warten: (ms) => wartenOderOnline(ms),
        weiter: () => aktiv.current,
        beiVerbindung: (w) => {
          wartend.current += w ? 1 : -1;
          speicherungMelden();
        },
      });
      await danach?.();
      laufend.current--;
      speicherungMelden(nr === zuletztNr.current ? { isError: false } : {});
      return r;
    } catch (x) {
      laufend.current--;
      speicherungMelden(nr === zuletztNr.current ? { isError: true } : {});
      if (aktiv.current) meldung(fehlerText(x), "fehler");
      throw x;
    }
  };
  /** Stand am Server, frisch geholt (ohne Netz gleich ein Fehler statt Warten). */
  const serverHolen = () => utils.katalog.hallenplan.fetch({ schauId }, { staleTime: 0, networkMode: "always" });
  // Entwurf: jede Änderung wirkt sofort hier; gespeichert wird der Reihe nach (keine Änderung überschreibt eine andere).
  const entwurfRef = useRef<Halle>(vollstaendig(halle));
  const [entwurf, setEntwurf] = useState<Halle>(entwurfRef.current);
  const offen = useRef(0);
  /** Für die Anzeige oben rechts: wie viele Änderungen noch auf dem Weg sind (auch die, die in der Reihe warten). */
  const [offenZahl, setOffenZahl] = useState(0);
  /** „Plan neu setzen“ ist unterwegs: der Server speichert eine andere Halle als den Entwurf (siehe `neuSetzenMit`). */
  const neuUnterwegs = useRef(false);
  const kette = useRef<Promise<unknown>>(Promise.resolve());
  /** Plan neu vom Server holen; false, wenn das scheitert (Netz oder Server kurz weg – die Seite zeigt dann einen Hinweis). */
  const nachladen = () => utils.katalog.hallenplan.fetch({ schauId }, { staleTime: 0 }).then(
    () => true,
    () => false,
  );
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
      meldung(t.neuUnterwegs, "warnung");
      return entwurfRef.current;
    }
    // Stand, auf dem die Änderung beruht: hat inzwischen jemand anders gespeichert, lehnt der Server ab.
    const basis = halleSchluessel(entwurfRef.current);
    const vorher = entwurfRef.current;
    const neu = vonHandBewegt(vorher, vollstaendig(f(entwurfRef.current)));
    if (halleSchluessel(neu) === basis) return neu;
    const schritt: Schritt | null = opt.ohneVerlauf ? null : { vorher, nachher: neu, was: opt.was ?? t.aenderung, wasDe: opt.wasDe ?? (opt.was ? undefined : oberflaeche("de").halleBild.entwurf.aenderung) };
    if (schritt) verlaufSetzen({ zurueck: [...verlauf.current.zurueck.slice(-99), schritt], vor: [] });
    entwurfRef.current = neu;
    setEntwurf(neu);
    offen.current++;
    setOffenZahl(offen.current);
    // Erstes Verschieben, Drehen oder Ausrichten von Reihen und Platten: vorher den gerechneten Plan festschreiben (sonst
    // stellte die Software die Käfige gleich wieder um). Die Nummern der Platten sind dabei dieselben.
    const vorher_fest = opt.festschreiben && !plan.fest && !festUnterwegs.current;
    if (vorher_fest) festUnterwegs.current = true;
    let gespeichert = true;
    kette.current = kette.current
      .then(() => (vorher_fest ? festMachen() : undefined))
      .then(() =>
        wiederholt(
          () => setzen.mutateAsync({ schauId, halle: neu, basis, ...(opt.grund ? { grund: opt.grund } : {}) }),
          // Wiederholung abgelehnt, weil die Basis nicht mehr stimmt: steht am Server schon genau diese Halle, kam die erste an.
          async () => {
            const server = (await serverHolen()).halle;
            return !!server && halleSchluessel(vollstaendig(server)) === halleSchluessel(neu);
          },
        ),
      )
      .catch(() => {
        gespeichert = false;
        // Gemeldet hat `wiederholt`. Nicht gespeichert: dieser Schritt fällt aus dem Verlauf (die übrigen bleiben); ging ein
        // Rückgängig oder Wiederholen schief, passt der Verlauf nicht mehr.
        verlaufSetzen(schritt ? { zurueck: verlauf.current.zurueck.filter((x) => x !== schritt), vor: verlauf.current.vor } : { zurueck: [], vor: [] });
      })
      .finally(async () => {
        offen.current--;
        setOffenZahl(offen.current);
        if (offen.current > 0) return;
        const geladen = await nachladen();
        // Gespeicherten Stand übernehmen – nach einem Fehler springt der Entwurf so auf den Server zurück. Gespeichert, aber
        // nicht nachgeladen: der Entwurf ist schon der gespeicherte Stand und bleibt (mit Rückgängig).
        const server = utils.katalog.hallenplan.getData({ schauId })?.halle;
        if (server && serverStandUebernehmen({ gespeichert, geladen, offen: offen.current, hatServer: true })) {
          entwurfRef.current = vollstaendig(server);
          setEntwurf(entwurfRef.current);
        }
      });
    return neu;
  };
  /**
   * Automatisch festschreiben (vor dem ersten Verschieben bzw. Entfernen): nur, solange der Plan nicht inzwischen anderswo
   * festgeschrieben ist, und nur, wenn die Grundplatten noch dieselben sind wie im Editor – sonst lehnt der Server ab.
   * Ohne Verbindung wird wiederholt; danach ist `festUnterwegs` wieder frei. `ohnePlattenStand`: „Automatisch planen“ aus.
   */
  const festMachen = (o: { ohnePlattenStand?: boolean } = {}) =>
    wiederholt(
      () => festschreiben.mutateAsync({ schauId, nurWennLose: true, ...(o.ohnePlattenStand ? {} : { plattenStand: plattenStand(plan) }) }),
      // Wiederholung abgelehnt, weil schon festgeschrieben: dann kam die erste Anfrage an.
      async () => !!(await serverHolen()).plan?.fest,
      async () => {
        await utils.katalog.hallenplan.invalidate({ schauId });
        meldung(t.automatischAus);
      },
    ).finally(() => {
      festUnterwegs.current = false;
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
    setOffenZahl(offen.current);
    kette.current = kette.current
      .then(() => neuSetzen.mutateAsync({ schauId, grund, ...(ziel ? { halle: vollstaendig(ziel), basis } : {}) }))
      .then((e) => {
        gespeichert = true;
        // Der Verlauf gehörte zur alten Aufstellung.
        verlaufSetzen({ zurueck: [], vor: [] });
        const bloecke = e.eingesetzt ? t.eingesetzt(zahlWort(e.eingesetzt, t.kaefigbloecke)) : "";
        if (e.ohne) meldung(t.neuGesetztOhne(bloecke, zahlWort(e.ohne, t.ohnePlatz)), "warnung");
        else meldung(t.neuGesetzt(bloecke));
      })
      .catch(() => {})
      .finally(async () => {
        offen.current--;
        const geladen = await nachladen();
        const server = utils.katalog.hallenplan.getData({ schauId })?.halle;
        if (server && serverStandUebernehmen({ gespeichert, geladen, offen: offen.current, hatServer: true })) {
          entwurfRef.current = vollstaendig(server);
          setEntwurf(entwurfRef.current);
        }
        neuUnterwegs.current = false;
        // Erst jetzt „Gespeichert“ oben rechts: der neu gesetzte Plan ist geladen.
        setOffenZahl(offen.current);
      });
    return kette.current.then(() => gespeichert);
  };
  // Solange etwas unterwegs ist (auch beim Warten auf die Verbindung): vor dem Verlassen der Seite fragen.
  useUngespeichertWarnung(() => offen.current > 0 || laufend.current > 0);
  return { entwurf, entwurfRef, aendern, kette, offen, offenZahl, speicherung, festUnterwegs, neuUnterwegs, verlauf, verlaufSetzen, festMachen, neuSetzen, neuSetzenMit };
}
