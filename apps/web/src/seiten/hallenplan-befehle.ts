/**
 * Befehle des Hallenplan-Editors, die über den Entwurf hinausgehen: Rückgängig/Wiederholen, Tier versetzen, nach Plan
 * nummerieren, Einstellungen der Halle (mit „Plan neu setzen?“), Automatik an/aus, an den Wänden ausrichten und eine
 * Einzelreihe an der Wand. Jeder Befehl fragt nach, wo es nötig ist, und wartet auf laufende Speicherungen.
 */
import { belegungImPlan, festGeometrie, type Halle, halleSchluessel, type KaefigPlatz, platzImPlan, vonHandGeplant, wandAusrichtung, wandDrehungenAnwenden, type WandSeite } from "@schau/domain";
import { fehlerText } from "../lib";
import { trpc } from "../trpc";
import { useFrage, useMeldung } from "../ui";
import { type HallenEntwurf } from "./hallenplan-entwurf";
import { type Daten, type Plan, type Versetzen, wandKandidatenImEntwurf, type Ziel } from "./hallenplan-geometrie";

export function usePlanBefehle({ d, plan, schauId, e, setAuswahl, versetzen, setVersetzen }: {
  d: Daten;
  plan: Plan;
  schauId: number;
  e: HallenEntwurf;
  setAuswahl: (z: Ziel[]) => void;
  versetzen: Versetzen | null;
  setVersetzen: (v: Versetzen | null) => void;
}) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const { entwurfRef, aendern, kette, offen, festUnterwegs, neuUnterwegs, verlauf, verlaufSetzen, festMachen, festschreiben, neuSetzen, neuSetzenMit } = e;
  /**
   * Einen Schritt des Verlaufs anwenden. Ändert er im festen Plan die Einstellungen der Halle (Maße, Gänge, Reihen,
   * Grundplatten), gilt dasselbe wie beim Ändern von Hand: Rückfrage „Plan neu setzen?“ und danach neu setzen.
   */
  const schrittAnwenden = async (ziel: Halle, grund: string): Promise<boolean> => {
    if (festGeometrie(ziel, d.masse) !== festGeometrie(entwurfRef.current, d.masse)) return halleNeuSetzen(() => ziel, grund);
    aendern(() => ziel, { ohneVerlauf: true, grund });
    return true;
  };
  const rueckgaengig = async () => {
    const s = verlauf.current.zurueck.at(-1);
    if (!s) return;
    if (s.art === "tier") {
      setAuswahl([]);
      // Das Tier steht auf dem Ziel und kommt zurück; beim Tausch steht dort das andere. Steht inzwischen ein anderes Tier
      // dort (z. B. eine Nachmeldung), fällt nur dieser Schritt aus dem Verlauf.
      const da = s.von ? (belegungImPlan(plan, s.von)?.tierId ?? null) : null;
      if (da !== s.getauscht) {
        verlaufSetzen({ zurueck: verlauf.current.zurueck.filter((x) => x !== s), vor: verlauf.current.vor });
        return meldung("Rückgängig geht nicht mehr – der Plan wurde inzwischen geändert.", "warnung");
      }
      const r = await tierZug(s.tierId, s.ziel, s.von, s.getauscht, `Rückgängig: ${s.was}`);
      if (r === "abbruch") return;
      if (!r) return verlaufSetzen({ zurueck: verlauf.current.zurueck.filter((x) => x !== s), vor: verlauf.current.vor });
      verlaufSetzen({ zurueck: verlauf.current.zurueck.filter((x) => x !== s), vor: [...verlauf.current.vor, s] });
      return;
    }
    if (halleSchluessel(s.nachher) !== halleSchluessel(entwurfRef.current)) {
      verlaufSetzen({ zurueck: [], vor: [] });
      return meldung("Rückgängig geht nicht mehr – der Plan wurde inzwischen geändert.", "warnung");
    }
    setAuswahl([]);
    if (!(await schrittAnwenden(s.vorher, `Rückgängig: ${s.was}`))) return;
    verlaufSetzen({ zurueck: verlauf.current.zurueck.filter((x) => x !== s), vor: [...verlauf.current.vor, s] });
  };
  const wiederholen = async () => {
    const s = verlauf.current.vor.at(-1);
    if (!s) return;
    if (s.art === "tier") {
      setAuswahl([]);
      if ((belegungImPlan(plan, s.ziel)?.tierId ?? null) !== s.getauscht) {
        verlaufSetzen({ zurueck: verlauf.current.zurueck, vor: verlauf.current.vor.filter((x) => x !== s) });
        return meldung("Wiederholen geht nicht mehr – der Plan wurde inzwischen geändert.", "warnung");
      }
      const r = await tierZug(s.tierId, s.von, s.ziel, s.getauscht, `Wiederholt: ${s.was}`);
      if (r === "abbruch") return;
      if (!r) return verlaufSetzen({ zurueck: verlauf.current.zurueck, vor: verlauf.current.vor.filter((x) => x !== s) });
      verlaufSetzen({ zurueck: [...verlauf.current.zurueck, s], vor: verlauf.current.vor.filter((x) => x !== s) });
      return;
    }
    if (halleSchluessel(s.vorher) !== halleSchluessel(entwurfRef.current)) {
      verlaufSetzen({ zurueck: [], vor: [] });
      return meldung("Wiederholen geht nicht mehr – der Plan wurde inzwischen geändert.", "warnung");
    }
    setAuswahl([]);
    if (!(await schrittAnwenden(s.nachher, `Wiederholt: ${s.was}`))) return;
    verlaufSetzen({ zurueck: [...verlauf.current.zurueck, s], vor: verlauf.current.vor.filter((x) => x !== s) });
  };
  const versetzenMut = trpc.katalog.tierVersetzen.useMutation();
  /**
   * Tier im festen Plan versetzen (bzw. tauschen): `von` und `erwartet` so, wie der Editor den Plan zeigt. Nach dem Druck
   * oder bei eingelieferten Tieren erst die Rückfrage des Servers. null: abgelehnt (Meldung kam schon); „abbruch“: nichts
   * versucht (Rückfrage abgebrochen oder noch nicht gespeichert).
   */
  const tierZug = async (tierId: number, von: KaefigPlatz | null, ziel: KaefigPlatz | null, erwartet: number | null, grund = ""): Promise<{ getauscht: number | null } | "abbruch" | null> => {
    if (offen.current > 0) {
      meldung("Der Plan wird noch gespeichert – bitte gleich noch einmal.", "warnung");
      return "abbruch";
    }
    const eingabe = { schauId, tierId, von, ziel, erwartet, grund };
    try {
      let r = await versetzenMut.mutateAsync(eingabe);
      if (r.rueckfrage) {
        if (!(await bestaetige({ titel: "Tier versetzen?", text: r.rueckfrage, knopf: "Versetzen" }))) return "abbruch";
        r = await versetzenMut.mutateAsync({ ...eingabe, bestaetigt: true });
      }
      return { getauscht: r.getauscht ?? null };
    } catch (e) {
      meldung(fehlerText(e), "fehler");
      return null;
    } finally {
      await utils.katalog.hallenplan.invalidate({ schauId });
    }
  };
  /** Ziel für das zu versetzende Tier angeklickt: im automatischen Plan erst festschreiben (wie beim Verschieben). */
  const zielGewaehlt = async (ziel: KaefigPlatz) => {
    const v = versetzen;
    if (!v) return;
    setVersetzen(null);
    const von = platzImPlan(plan, v.tierId);
    const da = belegungImPlan(plan, ziel);
    const nrVon = (id: number) => plan.reihen.flatMap((r) => r.kaefige).concat(plan.objekte.flatMap((o) => o.kaefige ?? [])).find((k) => k.id === id)?.nr ?? "ohne Nummer";
    if (!plan.fest) {
      if (festUnterwegs.current) return meldung("Der Plan wird gerade festgeschrieben – bitte gleich noch einmal.", "warnung");
      festUnterwegs.current = true;
      try {
        await festMachen();
      } catch {
        return;
      } finally {
        festUnterwegs.current = false;
      }
    }
    const r = await tierZug(v.tierId, von, ziel, da?.tierId ?? null);
    if (!r || r === "abbruch") return;
    const was = r.getauscht != null ? `Nr. ${v.nr ?? "–"} und Nr. ${nrVon(r.getauscht)} getauscht` : `Nr. ${v.nr ?? "–"} versetzt`;
    verlaufSetzen({ zurueck: [...verlauf.current.zurueck.slice(-99), { art: "tier", tierId: v.tierId, von, ziel, getauscht: r.getauscht, was }], vor: [] });
    meldung(`${was}.`);
  };
  const nachPlan = trpc.katalog.nummernNachPlan.useMutation({
    onSuccess: async (e) => {
      // Nummern hängen an vielen Stellen (Katalog, Preisrichter, Meldungen): alles neu laden.
      await utils.invalidate();
      if (e.aufgerueckt) meldung(`${e.aufgerueckt} ${e.aufgerueckt === 1 ? "Tier ist" : "Tiere sind"} lückenlos aufgerückt.`);
      if (e.aufrueckenGesperrt)
        meldung("Schon Tiere eingeliefert: nur nummeriert, nicht aufgerückt.", "warnung");
      if (!e.geaendert) meldung(e.modus === "nummern" ? "Die Katalognummern folgen schon dem Plan." : "Die Käfigplätze folgen schon dem Plan.");
      else
        meldung(
          e.modus === "nummern"
            ? `${e.geaendert} Katalognummern neu nach dem Plan vergeben${e.ohnePlatz ? ` – ${e.ohnePlatz} Tiere ohne Platz stehen am Ende` : ""}.`
            : `${e.geaendert} Käfigplätze neu nach dem Plan vergeben – die Katalognummern bleiben.`,
        );
      if (e.ohnePreisrichter) meldung(`${e.ohnePreisrichter} Tiere sind nach den neuen Nummern keinem Preisrichter zugeteilt – bitte unter „Preisrichter“ prüfen.`, "warnung");
      if (e.einteilungVonHand)
        meldung("Preisrichter sind von Hand nach Nummernbereichen eingeteilt – bitte unter „Preisrichter“ neu einteilen.", "fehler");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  /** „Nach Plan nummerieren“ bzw. „Käfigplätze nach Plan“ mit Rückfrage (Menü „Plan“, Knopf über dem Plan und Hinweis darunter). */
  const nachPlanFragen = async () => {
    if (
      !(await bestaetige(
        d.katalogGedruckt
          ? {
              titel: "Käfigplätze nach dem Plan vergeben?",
              text: "Die Käfignummern laufen in Planfolge neu durch, gedruckte Karten bitte neu drucken.",
              knopf: "Käfigplätze vergeben",
            }
          : {
              titel: "Katalognummern nach dem Plan vergeben?",
              text: `Die Tiere bekommen neue Katalognummern ab ${d.katalogStart} in Planfolge.`,
              knopf: "Neu nummerieren",
            },
      ))
    )
      return;
    // Erst, wenn alle Änderungen am Plan gespeichert sind – sonst zählte der Server den Stand von vorher.
    void kette.current.then(() => nachPlan.mutate({ schauId }));
  };
  /** Alle Käfige an den Wänden mit der Rückwand an die Wand drehen (für Pläne von vorher, z. B. von Hand an die Wand geschoben). */
  const anWaendenAusrichten = async () => {
    await kette.current.catch(() => {});
    const d = wandAusrichtung(entwurfRef.current, wandKandidatenImEntwurf(entwurfRef.current, plan, null));
    if (!d.length) return meldung("Alle Käfige an den Wänden stehen mit der Rückwand zur Wand.");
    if (
      !(await bestaetige({
        titel: "Käfige an den Wänden ausrichten?",
        text: `${d.length === 1 ? "1 Teil steht" : `${d.length} Teile stehen`} mit der Front zur Wand und ${d.length === 1 ? "wird" : "werden"} umgedreht – die Käfignummern darauf laufen dann andersherum.`,
        knopf: "Ausrichten",
      }))
    )
      return;
    aendern((h) => wandDrehungenAnwenden(h, wandAusrichtung(h, wandKandidatenImEntwurf(h, plan, null))), {
      was: "An den Wänden ausrichten",
      grund: `An den Wänden ausgerichtet: ${d.length} ${d.length === 1 ? "Teil" : "Teile"} gedreht`,
      festschreiben: d.some((x) => x.teil.art === "platte"),
    });
    meldung(`${d.length === 1 ? "1 Teil" : `${d.length} Teile`} gedreht – Rückwand an der Wand.`);
  };
  const neuSetzenFragen = async () =>
    (await bestaetige({
      titel: "Plan neu setzen?",
      text: "Alle Käfige werden neu aufgestellt, Verschobenes und eingesetzte Teile fallen weg.",
      knopf: "Plan neu setzen",
      gefahr: true,
    })) && neuSetzenMit(null, "Plan neu setzen");
  /**
   * Andere Einstellungen der Halle (auch Rückgängig/Wiederholen davon): Plan neu setzen. Steht etwas von Hand Geplantes
   * oder ist der Plan fest, vorher Rückfrage. `f` wirkt auf den Stand nach der Rückfrage (inzwischen Gespeichertes bleibt).
   */
  const halleNeuSetzen = async (f: (h: Halle) => Halle, grund: string): Promise<boolean> => {
    if (neuUnterwegs.current) {
      meldung("Der Plan wird gerade neu gesetzt – bitte gleich noch einmal.", "warnung");
      return false;
    }
    // Erst alle laufenden Speicherungen abwarten (z. B. ein eben verschobener Block), dann mit dem frischen Stand prüfen.
    await kette.current.catch(() => {});
    if (halleSchluessel(f(entwurfRef.current)) === halleSchluessel(entwurfRef.current)) return true;
    const fest = utils.katalog.hallenplan.getData({ schauId })?.plan?.fest ?? plan.fest;
    if (fest || festUnterwegs.current) {
      // Automatisch planen ist aus: die Einstellung gilt, die Käfige bleiben stehen. Nur die Reihenrichtung geht nicht ohne
      // neu gesetzten Plan (der feste Plan liegt in der alten Richtung).
      const richtungNeu = (f(entwurfRef.current).richtung ?? "quer") !== (entwurfRef.current.richtung ?? "quer");
      if (!richtungNeu) {
        aendern(f, { was: grund, grund });
        return true;
      }
      if (!(await bestaetige({ titel: "Automatisch planen einschalten?", text: "Die Reihenrichtung ändert sich nur mit neu gesetztem Plan – alle Käfige werden neu aufgestellt.", knopf: "Einschalten und neu setzen", gefahr: true })))
        return false;
      neuSetzenMit(f(entwurfRef.current), grund);
      return true;
    }
    if (vonHandGeplant(entwurfRef.current) && !(await bestaetige({ titel: "Plan neu setzen?", text: "Mit den neuen Einstellungen der Halle werden alle Käfige neu aufgestellt.", knopf: "Neu setzen", gefahr: true })))
      return false;
    neuSetzenMit(f(entwurfRef.current), grund);
    return true;
  };
  /**
   * Automatisch planen an/aus. Aus = Plan festschreiben: nichts stellt sich mehr von selbst um (Einstellungen, Nachmeldungen,
   * Möbel lassen die Käfige stehen). An = Plan neu setzen (Rückfrage: Verschobenes und eingesetzte Teile fallen weg).
   */
  const automatikUmschalten = async () => {
    if (neuUnterwegs.current || festUnterwegs.current) return meldung("Der Plan wird gerade gespeichert – bitte gleich noch einmal.", "warnung");
    await kette.current.catch(() => {});
    const fest = utils.katalog.hallenplan.getData({ schauId })?.plan?.fest ?? plan.fest;
    if (!fest) {
      festUnterwegs.current = true;
      kette.current = kette.current.then(() => festschreiben.mutateAsync({ schauId, nurWennLose: true })).catch(() => {});
      return;
    }
    if (
      await bestaetige({
        titel: "Automatisch planen einschalten?",
        text: "Alle Käfige werden neu aufgestellt, Verschobenes und eingesetzte Teile fallen weg.",
        knopf: "Einschalten und neu setzen",
        gefahr: true,
      })
    )
      neuSetzenMit(null, "Automatisch planen eingeschaltet");
  };
  /** Einstellung der Halle ändern (Maße, Gänge, Reihen, Grundplatten): der Plan wird neu gesetzt (siehe `halleNeuSetzen`). */
  const aendernHalle = (patch: Partial<Halle>, was: string): Promise<boolean> => halleNeuSetzen((h) => ({ ...h, ...patch }), `Halle: ${was}`);
  /** Eine Doppelreihe an die Wand gezogen: dort eine Einzelreihe stellen, die übrigen Reihen ordnen sich neu. */
  const wandreihe = trpc.katalog.wandreiheStellen.useMutation({
    onSuccess: async (e) => {
      verlaufSetzen({ zurueck: [], vor: [] });
      setAuswahl([]);
      await utils.katalog.hallenplan.invalidate({ schauId });
      meldung(e.neuGesetzt ? "Einzelreihe gestellt – die Käfige sind neu aufgestellt." : "Einzelreihe gestellt – die Reihen sind neu geordnet.");
    },
    onError: async (e) => {
      meldung(fehlerText(e), "fehler");
      await utils.katalog.hallenplan.invalidate({ schauId });
    },
  });
  const anWandFragen = async (nr: number, seite: WandSeite) => {
    if (
      !(await bestaetige({
        titel: "An der Wand eine Einzelreihe stellen?",
        text: plan.fest ? "Die übrigen Reihen ordnen sich neu und alle Käfige werden neu aufgestellt." : "Die übrigen Reihen ordnen sich neu, eingesetzte Käfigblöcke werden neu gesetzt.",
        knopf: "Einzelreihe stellen",
        gefahr: !!plan.fest,
      }))
    )
      return;
    await kette.current;
    wandreihe.mutate({ schauId, basis: halleSchluessel(entwurfRef.current), reihe: nr, seite, neuSetzen: !!plan.fest });
  };
  return { rueckgaengig, wiederholen, zielGewaehlt, versetzenMut, nachPlan, nachPlanFragen, anWaendenAusrichten, neuSetzenFragen, automatikUmschalten, aendernHalle, wandreihe, anWandFragen, neuSetzenLaeuft: neuSetzen.isPending };
}
