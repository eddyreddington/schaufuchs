/**
 * Befehle des Hallenplan-Editors, die über den Entwurf hinausgehen: Rückgängig/Wiederholen, Tier versetzen, nach Plan
 * nummerieren, Einstellungen der Halle (mit „Plan neu setzen?“), Automatik an/aus, an den Wänden ausrichten und eine
 * Einzelreihe an der Wand. Jeder Befehl fragt nach, wo es nötig ist, und wartet auf laufende Speicherungen.
 */
import { aktuelleSprache } from "../sprache-jetzt";
import { aufDeutsch, grundrissUebernehmen, type Punkt, belegungImPlan, festGeometrie, type Halle, halleSchluessel, type KaefigPlatz, oberflaeche, type OberflaecheTexte, platzImPlan, serverText, vonHandGeplant, wandAusrichtung, wandDrehungenAnwenden, type WandSeite } from "@schau/domain";
import { fehlerText } from "../lib";
import { useOberflaeche, useSprache } from "../sprache";
import { trpc } from "../trpc";
import { useFrage, useMeldung } from "../ui";
import { type HallenEntwurf } from "./hallenplan-entwurf";
import { type Daten, type Plan, type Versetzen, wandKandidatenImEntwurf, type Ziel, zweisprachig } from "./hallenplan-geometrie";

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
  const t = useOberflaeche();
  const tb = t.halleWerkzeuge.befehle;
  const sprache = useSprache();
  const { entwurfRef, aendern, kette, offen, festUnterwegs, neuUnterwegs, verlauf, verlaufSetzen, festMachen, neuSetzen, neuSetzenMit } = e;
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
        return meldung(tb.rueckgaengigNichtMehr, "warnung");
      }
      const r = await tierZug(s.tierId, s.ziel, s.von, s.getauscht, `Rückgängig: ${s.wasDe ?? aufDeutsch(s.was, aktuelleSprache())}`); // bleibt deutsch (Protokoll)
      if (r === "abbruch") return;
      if (!r) return verlaufSetzen({ zurueck: verlauf.current.zurueck.filter((x) => x !== s), vor: verlauf.current.vor });
      verlaufSetzen({ zurueck: verlauf.current.zurueck.filter((x) => x !== s), vor: [...verlauf.current.vor, s] });
      return;
    }
    if (halleSchluessel(s.nachher) !== halleSchluessel(entwurfRef.current)) {
      verlaufSetzen({ zurueck: [], vor: [] });
      return meldung(tb.rueckgaengigNichtMehr, "warnung");
    }
    setAuswahl([]);
    if (!(await schrittAnwenden(s.vorher, `Rückgängig: ${s.wasDe ?? aufDeutsch(s.was, aktuelleSprache())}`))) return; // bleibt deutsch (Protokoll)
    verlaufSetzen({ zurueck: verlauf.current.zurueck.filter((x) => x !== s), vor: [...verlauf.current.vor, s] });
  };
  const wiederholen = async () => {
    const s = verlauf.current.vor.at(-1);
    if (!s) return;
    if (s.art === "tier") {
      setAuswahl([]);
      if ((belegungImPlan(plan, s.ziel)?.tierId ?? null) !== s.getauscht) {
        verlaufSetzen({ zurueck: verlauf.current.zurueck, vor: verlauf.current.vor.filter((x) => x !== s) });
        return meldung(tb.wiederholenNichtMehr, "warnung");
      }
      const r = await tierZug(s.tierId, s.von, s.ziel, s.getauscht, `Wiederholt: ${s.wasDe ?? aufDeutsch(s.was, aktuelleSprache())}`); // bleibt deutsch (Protokoll)
      if (r === "abbruch") return;
      if (!r) return verlaufSetzen({ zurueck: verlauf.current.zurueck, vor: verlauf.current.vor.filter((x) => x !== s) });
      verlaufSetzen({ zurueck: [...verlauf.current.zurueck, s], vor: verlauf.current.vor.filter((x) => x !== s) });
      return;
    }
    if (halleSchluessel(s.vorher) !== halleSchluessel(entwurfRef.current)) {
      verlaufSetzen({ zurueck: [], vor: [] });
      return meldung(tb.wiederholenNichtMehr, "warnung");
    }
    setAuswahl([]);
    if (!(await schrittAnwenden(s.nachher, `Wiederholt: ${s.wasDe ?? aufDeutsch(s.was, aktuelleSprache())}`))) return; // bleibt deutsch (Protokoll)
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
      meldung(tb.nochGespeichert, "warnung");
      return "abbruch";
    }
    const eingabe = { schauId, tierId, von, ziel, erwartet, grund };
    try {
      let r = await versetzenMut.mutateAsync(eingabe);
      if (r.rueckfrage) {
        if (!(await bestaetige({ titel: tb.versetzenTitel, text: serverText(r.rueckfrage, sprache), knopf: tb.versetzenKnopf }))) return "abbruch";
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
    const nrVon = (id: number) => plan.reihen.flatMap((r) => r.kaefige).concat(plan.objekte.flatMap((o) => o.kaefige ?? [])).find((k) => k.id === id)?.nr ?? tb.ohneNummer;
    if (!plan.fest) {
      try {
        await festMachen();
      } catch {
        return;
      }
    }
    const r = await tierZug(v.tierId, von, ziel, da?.tierId ?? null);
    if (!r || r === "abbruch") return;
    const { was, wasDe } = zweisprachig((x) => (r.getauscht != null ? x.halleWerkzeuge.befehle.getauscht(v.nr ?? "–", nrVon(r.getauscht)) : x.halleWerkzeuge.befehle.versetzt(v.nr ?? "–")));
    verlaufSetzen({ zurueck: [...verlauf.current.zurueck.slice(-99), { art: "tier", tierId: v.tierId, von, ziel, getauscht: r.getauscht, was, wasDe }], vor: [] });
    meldung(`${was}.`);
  };
  const nachPlan = trpc.katalog.nummernNachPlan.useMutation({
    onSuccess: async (e) => {
      // Nummern hängen an vielen Stellen (Katalog, Preisrichter, Meldungen): alles neu laden.
      await utils.invalidate();
      if (!e.geaendert) meldung(e.modus === "nummern" ? tb.nummernFolgenSchon : tb.plaetzeFolgenSchon);
      else
        meldung(e.modus === "nummern" ? tb.nummernNeu(e.geaendert, e.ohnePlatz ?? 0) : tb.plaetzeNeu(e.geaendert));
      if (e.ohnePreisrichter) meldung(tb.ohnePreisrichter(e.ohnePreisrichter), "warnung");
      if (e.einteilungVonHand)
        meldung(tb.einteilungVonHand, "fehler");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  /** „Nach Plan nummerieren“ bzw. „Käfigplätze nach Plan“ mit Rückfrage (Menü „Plan“, Knopf über dem Plan und Hinweis darunter). */
  const nachPlanFragen = async () => {
    if (
      !(await bestaetige(
        d.katalogGedruckt
          ? {
              titel: tb.plaetzeTitel,
              text: tb.plaetzeText,
              knopf: tb.plaetzeKnopf,
            }
          : {
              titel: tb.nummernTitel,
              text: tb.nummernText(d.katalogStart),
              knopf: tb.nummernKnopf,
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
    if (!d.length) return meldung(tb.alleAnWand);
    if (
      !(await bestaetige({
        titel: tb.wandTitel,
        text: d.length === 1 ? tb.wandEins : tb.wandViele(d.length),
        knopf: tb.wandKnopf,
      }))
    )
      return;
    aendern((h) => wandDrehungenAnwenden(h, wandAusrichtung(h, wandKandidatenImEntwurf(h, plan, null))), {
      ...zweisprachig((x) => x.halleWerkzeuge.befehle.wandWas),
      grund: `An den Wänden ausgerichtet: ${d.length} ${d.length === 1 ? "Teil" : "Teile"} gedreht`, // bleibt deutsch (Protokoll)
      festschreiben: d.some((x) => x.teil.art === "platte"),
    });
    meldung(d.length === 1 ? tb.wandGedrehtEins : tb.wandGedreht(d.length));
  };
  const neuSetzenFragen = async () =>
    (await bestaetige({
      titel: tb.neuTitel,
      text: tb.neuText,
      knopf: tb.neuKnopf,
      gefahr: true,
    })) && neuSetzenMit(null, "Plan neu setzen"); // bleibt deutsch (Protokoll)
  /**
   * Andere Einstellungen der Halle (auch Rückgängig/Wiederholen davon): Plan neu setzen. Steht etwas von Hand Geplantes
   * oder ist der Plan fest, vorher Rückfrage. `f` wirkt auf den Stand nach der Rückfrage (inzwischen Gespeichertes bleibt).
   */
  const halleNeuSetzen = async (f: (h: Halle) => Halle, grund: string, was?: string): Promise<boolean> => {
    if (neuUnterwegs.current) {
      meldung(tb.neuGerade, "warnung");
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
      // Ebenso ein anderer Grundriss (Entscheidung 019): die festen Plätze lägen sonst womöglich außerhalb der Wände.
      const grundrissNeu = JSON.stringify(f(entwurfRef.current).umriss ?? null) !== JSON.stringify(entwurfRef.current.umriss ?? null);
      if (!richtungNeu && !grundrissNeu) {
        aendern(f, { was: was ?? grund, wasDe: grund, grund });
        return true;
      }
      if (!(await bestaetige({ titel: tb.automatikTitel, text: grundrissNeu ? tb.grundrissNurNeu : tb.richtungNurNeu, knopf: tb.einschaltenKnopf, gefahr: true })))
        return false;
      return neuSetzenMit(f(entwurfRef.current), grund);
    }
    if (vonHandGeplant(entwurfRef.current) && !(await bestaetige({ titel: tb.neuTitel, text: tb.neuEinstellungen, knopf: tb.neuSetzenKnopf, gefahr: true })))
      return false;
    return neuSetzenMit(f(entwurfRef.current), grund);
  };
  /**
   * Automatisch planen an/aus. Aus = Plan festschreiben: nichts stellt sich mehr von selbst um (Einstellungen, Nachmeldungen,
   * Möbel lassen die Käfige stehen). An = Plan neu setzen (Rückfrage: Verschobenes und eingesetzte Teile fallen weg).
   */
  const automatikUmschalten = async () => {
    if (neuUnterwegs.current || festUnterwegs.current) return meldung(tb.gespeichertGerade, "warnung");
    await kette.current.catch(() => {});
    const fest = utils.katalog.hallenplan.getData({ schauId })?.plan?.fest ?? plan.fest;
    if (!fest) {
      festMachen({ ohnePlattenStand: true }).catch(() => {});
      return;
    }
    if (
      await bestaetige({
        titel: tb.automatikTitel,
        text: tb.neuText,
        knopf: tb.einschaltenKnopf,
        gefahr: true,
      })
    )
      neuSetzenMit(null, "Automatisch planen eingeschaltet"); // bleibt deutsch (Protokoll)
  };
  /** Einstellung der Halle ändern (Maße, Gänge, Reihen, Grundplatten): der Plan wird neu gesetzt (siehe `halleNeuSetzen`). */
  const aendernHalle = (patch: Partial<Halle>, was: (t: OberflaecheTexte) => string): Promise<boolean> =>
    halleNeuSetzen((h) => ({ ...h, ...patch }), `Halle: ${was(oberflaeche("de"))}`, was(t)); // Grund bleibt deutsch (Protokoll)
  /** Eine Doppelreihe an die Wand gezogen: dort eine Einzelreihe stellen, die übrigen Reihen ordnen sich neu. */
  const wandreihe = trpc.katalog.wandreiheStellen.useMutation({
    onSuccess: async (e) => {
      verlaufSetzen({ zurueck: [], vor: [] });
      setAuswahl([]);
      await utils.katalog.hallenplan.invalidate({ schauId });
      meldung(e.neuGesetzt ? tb.einzelreiheNeu : tb.einzelreiheGeordnet);
    },
    onError: async (e) => {
      meldung(fehlerText(e), "fehler");
      await utils.katalog.hallenplan.invalidate({ schauId });
    },
  });
  const anWandFragen = async (nr: number, seite: WandSeite) => {
    if (
      !(await bestaetige({
        titel: tb.einzelreiheTitel,
        text: plan.fest ? tb.einzelreiheFest : tb.einzelreiheLose,
        knopf: tb.einzelreiheKnopf,
        gefahr: !!plan.fest,
      }))
    )
      return;
    await kette.current;
    wandreihe.mutate({ schauId, basis: halleSchluessel(entwurfRef.current), reihe: nr, seite, neuSetzen: !!plan.fest });
  };
  /** Bearbeiteter Grundriss (Entscheidung 019): wie jede Einstellung der Halle, dazu wandern Flächen und Teile mit. */
  const grundrissSetzen = async (roh: Punkt[], basis: string): Promise<boolean> => {
    // Der Grundriss ist in den Koordinaten der Halle beim Öffnen gezeichnet: hat sie inzwischen jemand anders geändert, nicht übernehmen.
    if (halleSchluessel(entwurfRef.current) !== basis) {
      meldung(tb.grundrissVeraltet, "warnung");
      return false;
    }
    return halleNeuSetzen((h) => grundrissUebernehmen(h, roh), "Halle: Grundriss"); // bleibt deutsch (Protokoll)
  };
  return { grundrissSetzen, rueckgaengig, wiederholen, zielGewaehlt, versetzenMut, nachPlan, nachPlanFragen, anWaendenAusrichten, neuSetzenFragen, automatikUmschalten, aendernHalle, wandreihe, anWandFragen, neuSetzenLaeuft: neuSetzen.isPending };
}
