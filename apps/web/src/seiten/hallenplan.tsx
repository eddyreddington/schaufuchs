/**
 * Seite „Hallenplan“: neue Halle anlegen und der Editor (`Plan`) mit Speichern, Rückgängig, Auswahl und Tastatur.
 * Zeichnung, Werkzeugleiste, Eigenschaften und Stellvorschläge liegen in den Dateien hallenplan-*.tsx daneben,
 * reine Rechnungen in hallenplan-geometrie.ts (Moduldoku: docs/module/halle.md).
 */
import { type Belegt, belegungImPlan, fehlendeImPlan, festGeometrie, freieStelle, type Halle, type HallenFlaeche, type HallenObjekt, halleSchluessel, istMoebel, KAEFIG_TYP_MEHRZAHL, kaefigName, type KaefigPlatz, type KaefigTyp, leereEntfernen, MOEBEL_NAME, type MoebelArt, nummernBereiche, type PlanKaefig, plattenStand, platzImPlan, rasterAusrichten, type Rechteck, richterFarbe, richterFolge, teilGroesse, vonHandGeplant, wandAusrichtung, wandDrehungenAnwenden, type WandSeite } from "@schau/domain";
import { useEffect, useRef, useState } from "react";
import { fehlerText } from "../lib";
import { useSchauId } from "../rahmen";
import { useIstAdmin } from "../rolle";
import { trpc } from "../trpc";
import { HallenEntwuerfe } from "./hallenplan-entwuerfe";
import { Abschnitt, Dialog, FehlerAnzeige, Feld, HilfeLink, Hinweis, Knopf, KnopfLink, Laden, Leer, Marke, SEITE, Seitenkopf, type SpeicherStand, SpeicherStatus, TabellenRahmen, useFrage, useMeldung } from "../ui";
import { PlanBild } from "./hallenplan-bild";
import { Eigenschaften, HalleEigenschaften, MitEinheit } from "./hallenplan-eigenschaften";
import { type Aendern, type Aktionen, alsNummer, anzahl, BAU, type Daten, drehPruefung, EINGANG_TIEFE, entfernenText, gedreht, lage, meter, planKoerper, plattenJeArt, RASTER, raster, richterNamen, type Schritt, type Versetzen, vollstaendig, vonHandBewegt, wandKandidatenImEntwurf, wandText, type Ziel, zuCm, zusammenfassen, zuTeilen } from "./hallenplan-geometrie";
import { AutomatikSchalter, KaefigInfo, LegendenFeld, OhnePlatz, SpartenReihen } from "./hallenplan-teile";
import { HallenSkizze, StellVorschlaege } from "./hallenplan-vorschlaege";
import { Werkzeugleiste } from "./hallenplan-werkzeugleiste";

export function Hallenplan() {
  const schauId = useSchauId();
  const istAdmin = useIstAdmin();
  const q = trpc.katalog.hallenplan.useQuery({ schauId });
  if (q.error) return <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />;
  if (!q.data) return <Laden />;
  const d = q.data;
  // Ein Halleneditor für alles: Einstellungen der Halle, Eingänge und Flächen, Stellvorschläge und freies Planen. Mit Plan
  // setzt der Editor den Seitenkopf selbst (Stand des Plans, Vollansicht).
  return (
    <div className={`druck-quer ${SEITE}`}>
      {d.plan && d.halle ? (
        <Plan d={d} halle={d.halle} plan={d.plan} schauId={schauId} istAdmin={istAdmin} />
      ) : (
        <>
          <Seitenkopf titel="Hallenplan" hilfe="hallenplan" />
          {!d.halle && !istAdmin && <Leer titel="Noch keine Halle angelegt" />}
          {!d.halle && istAdmin && <NeueHalle schauId={schauId} vorgabe={d.vorgabe} />}
        </>
      )}
    </div>
  );
}

/** Neue Schau ohne Halle: Maße eintragen, „Halle anlegen“ – danach geht es im Halleneditor weiter. */
function NeueHalle({ schauId, vorgabe }: { schauId: number; vorgabe: Halle }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const [w, setW] = useState({ breite: meter(vorgabe.breite), laenge: meter(vorgabe.laenge), gang: meter(vorgabe.gang) });
  const anlegen = trpc.katalog.halleSetzen.useMutation({
    onSuccess: async () => {
      await utils.katalog.hallenplan.invalidate({ schauId });
      meldung("Halle angelegt.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const cm = { breite: zuCm(w.breite), laenge: zuCm(w.laenge), gang: zuCm(w.gang) };
  const ok = cm.breite >= 300 && cm.laenge >= 300 && cm.gang >= 50 && cm.breite <= 50000 && cm.laenge <= 50000;
  return (
    <Abschnitt titel="Neue Halle">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <HallenSkizze breite={ok ? cm.breite : vorgabe.breite} laenge={ok ? cm.laenge : vorgabe.laenge} flaechen={[]} />
        <form
          className="flex flex-col gap-4"
          aria-label="Halle anlegen"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ok) return meldung("Maße in Metern: mindestens 3 m, Gang mindestens 0,5 m.", "fehler");
            // Nur, wenn es noch keine Halle gibt (ein zweiter Tab kann sie inzwischen angelegt haben).
            anlegen.mutate({ schauId, basis: halleSchluessel(null), halle: { ...vorgabe, ...cm } });
          }}
        >
          {(
            [
              ["breite", "Breite", "kurze Seite"],
              ["laenge", "Länge", undefined],
              ["gang", "Gang mindestens", undefined],
            ] as const
          ).map(([k, label, hinweis]) => (
            <Feld key={k} label={label} hinweis={hinweis}>
              {(id) => <MitEinheit id={id} einheit="m" aria-label={`${label} in Metern`} inputMode="decimal" value={w[k]} onChange={(e) => setW({ ...w, [k]: e.target.value })} />}
            </Feld>
          ))}
          <Knopf type="submit" variante="primaer" className="self-start" laedt={anlegen.isPending}>
            Halle anlegen
          </Knopf>
        </form>
      </div>
    </Abschnitt>
  );
}

function Plan({ d, halle, plan, schauId, istAdmin }: { d: Daten; halle: Halle; plan: NonNullable<Daten["plan"]>; schauId: number; istAdmin: boolean }) {
  // Farben in Reihenfolge der Katalognummern: wer im Katalog nebeneinander liegt, bekommt Nachbarfarben.
  const richterReihe = richterFolge(plan, d.richter);
  const richterIndex = new Map(richterReihe.map((r, i) => [r.id, i]));
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  // Die Ausstellungsleitung plant immer im Editor (kein eigener Bearbeiten-Modus); Helfer sehen den Plan nur an.
  const bearbeiten = istAdmin && !d.abgeschlossen;
  /** Stellvorschläge als Schublade über dem Plan. */
  const [vorschlaegeOffen, setVorschlaegeOffen] = useState(false);
  /** Werkzeug „Fläche aufziehen“ (aus dem Menü Einsetzen): Art der nächsten Fläche. */
  const [zeichnen, setZeichnen] = useState<HallenFlaeche["art"] | null>(null);
  const vorschlaegeOffenRef = useRef(vorschlaegeOffen);
  vorschlaegeOffenRef.current = vorschlaegeOffen;
  const zeichnenRef = useRef(zeichnen);
  zeichnenRef.current = zeichnen;
  /** Festschreiben ist unterwegs (automatisch vor dem ersten Verschieben). */
  const festUnterwegs = useRef(false);
  const [auswahl, setAuswahl] = useState<Ziel[]>([]);
  /** Schalter „Mehrfachauswahl“ (Tablet): Antippen nimmt Teile in die Auswahl auf oder heraus. */
  const [mehrfach, setMehrfach] = useState(false);
  const [voll, setVoll] = useState(false);
  /** Zoom der Zeichnung im Editor: 1 = ganze Halle in der Breite. */
  const [zoom, setZoom] = useState(1);
  const [infoId, setInfoId] = useState<number | null>(null);
  const hatAuswahl = bearbeiten && auswahl.length > 0;
  /** Tier versetzen: dieses Tier, das Ziel wird im Plan angeklickt (Esc bricht ab). */
  const [versetzen, setVersetzen] = useState<Versetzen | null>(null);
  useEffect(() => {
    if (!voll && infoId == null && !hatAuswahl && !zeichnen && !vorschlaegeOffen && !versetzen) return;
    // Esc schließt zuerst die Käfig-Angaben, hebt dann die Auswahl auf und schließt zuletzt die Vollansicht.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (infoId != null) return setInfoId(null);
      if (vorschlaegeOffenRef.current) return setVorschlaegeOffen(false);
      if (zeichnenRef.current) return setZeichnen(null);
      if (versetzen) return setVersetzen(null);
      // Esc in einem Eingabefeld (Name einer Fläche) oder in einem Rückfrage-Dialog gehört dorthin.
      const ziel = e.target instanceof Element ? e.target : null;
      if (ziel?.closest("input, textarea, select, dialog, [role=dialog], [role=alertdialog], [role=menu]")) return;
      if (hatAuswahl) setAuswahl([]);
      else setVoll(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [voll, infoId, hatAuswahl, zeichnen, vorschlaegeOffen, versetzen]);
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
  /**
   * 3D-Ansicht in einem neuen Tab, mit dem gespeicherten Stand: Ist noch etwas auf dem Weg, geht der Tab gleich auf (sonst
   * blockt ihn der Browser) und lädt die 3D-Seite erst, wenn alles gespeichert ist.
   */
  const dreiDOeffnen = () => {
    const url = `/schau/${schauId}/hallenplan/3d`;
    if (offen.current === 0) {
      window.open(url, "_blank", "noopener");
      return;
    }
    const tab = window.open("", "_blank");
    if (!tab) return meldung("Der Browser hat den neuen Tab blockiert.", "warnung");
    tab.opener = null;
    const warten = async () => {
      while (offen.current > 0) await kette.current.catch(() => undefined);
    };
    void warten().then(() => tab.location.replace(url));
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
  /**
   * Automatisch festschreiben (vor dem ersten Verschieben bzw. Entfernen): nur, solange der Plan nicht inzwischen anderswo
   * festgeschrieben ist, und nur, wenn die Grundplatten noch dieselben sind wie im Editor – sonst lehnt der Server ab.
   */
  const festMachen = () => festschreiben.mutateAsync({ schauId, nurWennLose: true, plattenStand: plattenStand(plan) });
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
  /**
   * Plan neu setzen (Server `planNeuSetzen`): die Software stellt alle Käfige neu; Verschobenes und eingesetzte Teile der
   * bisherigen Aufstellung fallen weg, was nicht in die Reihen passt, bekommt Käfigblöcke. Mit `ziel` zugleich neue
   * Einstellungen der Halle – in einem Schritt, damit nie ein Plan mit Resten der alten Aufstellung entsteht.
   */
  const neuSetzen = trpc.katalog.planNeuSetzen.useMutation({ onError: (e) => meldung(fehlerText(e), "fehler") });
  const neuSetzenMit = (ziel: Halle | null, grund: string) => {
    const basis = halleSchluessel(entwurfRef.current);
    neuUnterwegs.current = true;
    if (ziel) {
      entwurfRef.current = vollstaendig(ziel);
      setEntwurf(entwurfRef.current);
    }
    setAuswahl([]);
    offen.current++;
    kette.current = kette.current
      .then(() => neuSetzen.mutateAsync({ schauId, grund, ...(ziel ? { halle: vollstaendig(ziel), basis } : {}) }))
      .then((e) => {
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
  // ── Werkzeuge des Editors (Leiste, Eigenschaften, Tastenkürzel) ──
  /** Gewählte Teile zum Verschieben, Drehen und Ausrichten: ein freier Platz steht für seine Grundplatte. */
  const teile = zuTeilen(auswahl, plan);
  const ausrichten = () => {
    const ziele = teile.length ? teile : null;
    const vorab = rasterAusrichten(entwurfRef.current, planKoerper(entwurfRef.current, plan), ziele, RASTER);
    if (!vorab.ok) return meldung(vorab.meldung, "warnung");
    if (!vorab.bewegt) return meldung(ziele ? "Die gewählten Teile stehen schon am Raster." : "Alles steht schon am Raster.");
    // Auf dem neuesten Entwurf rechnen (es kann noch ein Speichern unterwegs sein); gemeldet wird, was wirklich geschah.
    let e: ReturnType<typeof rasterAusrichten> = vorab;
    aendern(
      (h) => {
        e = rasterAusrichten(h, planKoerper(h, plan), ziele, RASTER);
        return e.ok ? e.halle : h;
      },
      { was: "Am Raster ausrichten", festschreiben: !ziele || ziele.some((t) => t.art === "reihe" || t.art === "platte") },
    );
    const ergebnis = e as ReturnType<typeof rasterAusrichten>;
    if (!ergebnis.ok) return meldung(ergebnis.meldung, "warnung");
    meldung(`${ergebnis.bewegt} ${ergebnis.bewegt === 1 ? "Teil" : "Teile"} am Raster ausgerichtet.`);
  };
  const drehen = () => {
    if (teile.length !== 1) return meldung(teile.length ? "Drehen geht für ein Teil auf einmal." : "Erst ein Teil wählen.", "warnung");
    const t = teile[0]!;
    const pr = drehPruefung(entwurf, plan, t);
    if (!pr.ok) return meldung(pr.meldung, "warnung");
    aendern((h) => gedreht(h, t), { was: "Drehen", festschreiben: t.art === "reihe" || t.art === "platte" });
  };
  /** Gewählte Reihen und Platten an ihren gerechneten Platz (Versatz und Drehung weg). */
  const zurueckTeile = teile.filter((t) => (t.art === "reihe" ? entwurf.reihenVersatz!.some((x) => x.nr === t.nr) : t.art === "platte" && entwurf.plattenVersatz!.some((x) => x.reihe === t.reihe && x.platte === t.i)));
  const zurueckAnPlatz = () => {
    if (!zurueckTeile.length) return;
    const z = zurueckTeile;
    aendern(
      (h) => {
        const v = vollstaendig(h);
        return {
          ...v,
          reihenVersatz: v.reihenVersatz!.filter((x) => !z.some((t) => t.art === "reihe" && t.nr === x.nr)),
          plattenVersatz: v.plattenVersatz!.filter((x) => !z.some((t) => t.art === "platte" && t.reihe === x.reihe && t.i === x.platte)),
        };
      },
      { was: "An ihren Platz zurück" },
    );
  };
  const entfernenFragen = async () => {
    if (!auswahl.length) return meldung("Erst etwas wählen.", "warnung");
    const gewaehlt = auswahl;
    // Platten und Plätze entfernt man im festen Plan. Im gerechneten Plan erst prüfen und fragen (mit dem Plan, wie er
    // zu sehen ist), erst danach festschreiben – nichts wird festgeschrieben, wenn nichts zu entfernen ist.
    const mussFest = !plan.fest && gewaehlt.some((z) => z.art === "reihe" || z.art === "platte" || z.art === "platz");
    const e = leereEntfernen(entwurfRef.current, mussFest ? { ...plan, fest: { am: "", veraltet: false } } : plan, gewaehlt);
    const was = entfernenText(e);
    if (!was)
      return meldung(
        e.bleibt.length ? `Bleibt stehen: ${e.bleibt.join(", ")} – nur Leeres lässt sich entfernen.` : e.nurFest ? "Leere Plätze lassen sich nur im festen Plan entfernen." : "Hier ist nichts zu entfernen.",
        "warnung",
      );
    const eins = e.platten + e.plaetze + e.teile + e.flaechen === 1;
    if (
      !(await bestaetige({
        titel: "Leeres entfernen?",
        text: `${was} ${eins ? "verschwindet" : "verschwinden"} aus dem Plan${e.bleibt.length ? `, stehen bleibt: ${e.bleibt.join(", ")}` : ""}.`,
        knopf: "Entfernen",
        gefahr: true,
      }))
    )
      return;
    let p = plan;
    if (mussFest) {
      await kette.current;
      if (festUnterwegs.current) return meldung("Der Plan wird gerade festgeschrieben – bitte gleich noch einmal.", "warnung");
      festUnterwegs.current = true;
      try {
        await festMachen();
      } catch {
        return;
      }
      p = utils.katalog.hallenplan.getData({ schauId })?.plan ?? plan;
      if (!p.fest) return;
    }
    aendern((h) => leereEntfernen(h, p, gewaehlt).halle, { was: "Entfernen", grund: `Leeres entfernt: ${was}` });
    setAuswahl([]);
  };
  const neueId = () => `t${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  const einsetzen = (art: HallenObjekt["art"], typ?: KaefigTyp) => {
    // Neues Teil möglichst in die Mitte der Halle, auf einen freien Platz (nicht auf ein eben eingesetztes) – von dort an
    // den richtigen Platz ziehen. Tische und Bänke gern in einen freien Bereich.
    const id = neueId();
    const moebel = art === "tisch" || art === "bank" || art === "garnitur";
    const groesse = teilGroesse({ art, typ }, entwurf, d.masse);
    const start = { x: raster(entwurf.breite / 2 - groesse.lang / 2), y: raster(entwurf.laenge / 2 - groesse.kurz / 2) };
    const teile = (entwurf.objekte ?? []).map((o) => {
      const g = teilGroesse(o, entwurf, d.masse);
      return o.drehung === 90 ? { x: o.x, y: o.y, b: g.kurz, h: g.lang } : { x: o.x, y: o.y, b: g.lang, h: g.kurz };
    });
    const belegt = moebel ? [...planKoerper(entwurf, plan).filter((k) => !k.freiBereich).map((k) => k.rechteck), ...teile] : belegtJetzt().map((b) => b.q);
    const ort = freieStelle(entwurf, belegt, { b: groesse.lang, h: groesse.kurz }, start);
    const was = moebel ? `${MOEBEL_NAME[art as MoebelArt]} einsetzen` : art === "voliere" ? "Voliere einsetzen" : "Käfigblock einsetzen";
    aendern((h) => ({ ...h, objekte: [...(h.objekte ?? []), { id, art, ...(art === "kaefigblock" ? { typ: typ ?? "huehner" } : {}), ...ort, drehung: 0 }] }), { was });
    setAuswahl([{ art: "objekt", id }]);
  };
  /** Was im Entwurf Platz einnimmt (wie beim Verschieben, dazu alle eingesetzten Teile); Grundplatten mit Käfigart. */
  const belegtJetzt = (): Belegt[] => [
    ...planKoerper(entwurf, plan).filter((k) => !k.nurMoebel).map((k) => {
      const t = k.teil;
      return { q: k.rechteck, typ: t?.art === "platte" ? plan.reihen.find((r) => r.nr === t.reihe)?.platten[t.i]?.typ : undefined };
    }),
    ...(entwurf.objekte ?? []).map((o) => {
      const g = teilGroesse(o, entwurf, d.masse);
      return { q: o.drehung === 90 ? { x: o.x, y: o.y, b: g.kurz, h: g.lang } : { x: o.x, y: o.y, b: g.lang, h: g.kurz } };
    }),
  ];
  /**
   * Fehlende Käfige einsetzen: Käfigblöcke (bzw. Volieren) in freie Stellen der Reihen – nie in Gänge, Quergang, den Gang vor
   * Eingängen oder auf Flächen. `nur`: ein Teil dieser Käfigart; findet sich in den Reihen keine Stelle, kommt es wie aus dem
   * Menü „Einsetzen“ in die Mitte.
   */
  const fehlendeSetzen = (nur?: KaefigTyp) => {
    // Dieselbe Suche wie „Plan neu setzen“ (dazu Volieren und eben eingesetzte, noch nicht gespeicherte Teile).
    const { einsaetze, ohne } = fehlendeImPlan(entwurf, plan, d.masse, { volieren: true, belegtDazu: belegtJetzt(), ...(nur ? { nur: { typ: nur, hoechstens: 1 } } : {}) });
    if (!einsaetze.length) {
      if (!nur) return meldung(`In den Reihen ist kein Platz mehr frei – ${anzahl(ohne, "Tier bleibt", "Tiere bleiben")} ohne Platz.`, "warnung");
      einsetzen(nur === "voliere" ? "voliere" : "kaefigblock", nur === "voliere" ? undefined : nur);
      return meldung("In den Reihen ist kein Platz frei – das Teil steht in der Mitte.", "warnung");
    }
    const basis = neueId();
    // Käfigblöcke gehören zum automatischen Plan (Neu-Setzen setzt sie ohne Rückfrage neu); Volieren nicht (die setzt das
    // Neu-Setzen nicht wieder ein).
    const neu = einsaetze.map((e, i) => ({ id: `${basis}${i}`, art: e.art, ...(e.art === "kaefigblock" ? { typ: e.typ, front: e.front, auto: true } : {}), x: e.x, y: e.y, drehung: e.drehung }));
    const zaehlen = new Map<KaefigTyp, number>();
    for (const e of einsaetze) zaehlen.set(e.typ, (zaehlen.get(e.typ) ?? 0) + 1);
    const was = [...zaehlen].map(([t, n]) => (t === "voliere" ? anzahl(n, "Voliere", "Volieren") : `${anzahl(n, "Block", "Blöcke")} ${KAEFIG_TYP_MEHRZAHL[t]}`)).join(", ");
    aendern((h) => ({ ...h, objekte: [...(h.objekte ?? []), ...neu] }), { was: "Fehlende Käfige einsetzen", grund: `Fehlende Käfige eingesetzt: ${was}` });
    setAuswahl(neu.map((o) => ({ art: "objekt" as const, id: o.id })));
    if (!nur) meldung(`Eingesetzt: ${was}.${ohne ? ` ${anzahl(ohne, "Tier bleibt", "Tiere bleiben")} ohne Platz.` : ""}`, ohne ? "warnung" : undefined);
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
  /**
   * Fläche aufgezogen (Werkzeug aus „Einsetzen“; Rechteck in Hallenkoordinaten, ein Klick ohne Ziehen: Vorgabegröße). Ein
   * Eingang kommt an die nächste Wand, 50 cm tief, so lang wie aufgezogen.
   */
  const flaecheAufgezogen = (q: Rechteck, klick: boolean) => {
    const art = zeichnen;
    if (!art) return;
    setZeichnen(null);
    const B = entwurf.breite, L = entwurf.laenge;
    const cx = q.x + q.b / 2, cy = q.y + q.h / 2;
    const klemme = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    let f: { x: number; y: number; breite: number; tiefe: number };
    if (art === "eingang") {
      const abstand = [cx, B - cx, cy, L - cy];
      const wand = abstand.indexOf(Math.min(...abstand));
      const entlangX = wand >= 2; // Wand vorn/hinten: der Eingang liegt entlang der Breite (x)
      const lang = Math.min(entlangX ? B : L, klick ? 200 : Math.max(100, raster(entlangX ? q.b : q.h)));
      const von = klick ? raster((entlangX ? cx : cy) - lang / 2) : raster(entlangX ? q.x : q.y);
      const v = klemme(von, 0, (entlangX ? B : L) - lang);
      f = entlangX
        ? { x: v, y: wand === 2 ? 0 : L - EINGANG_TIEFE, breite: lang, tiefe: EINGANG_TIEFE }
        : { x: wand === 0 ? 0 : B - EINGANG_TIEFE, y: v, breite: EINGANG_TIEFE, tiefe: lang };
    } else {
      const b = klick ? 400 : Math.max(50, raster(q.b)), t = klick ? 300 : Math.max(50, raster(q.h));
      f = { x: klemme(raster(klick ? cx - b / 2 : q.x), 0, Math.max(0, B - b)), y: klemme(raster(klick ? cy - t / 2 : q.y), 0, Math.max(0, L - t)), breite: Math.min(b, B), tiefe: Math.min(t, L) };
    }
    const anzahl = entwurf.flaechen.filter((x) => x.art === art).length;
    const name = art === "eingang" ? `Eingang${anzahl ? ` ${anzahl + 1}` : ""}` : art === "volieren" ? "Volieren" : "Freier Bereich";
    const neu = aendern((h) => ({ ...h, flaechen: [...h.flaechen, { name, art, ...f }] }), { was: "Fläche aufziehen" });
    setAuswahl([{ art: "flaeche", i: neu.flaechen.length - 1 }]);
  };
  const STUFEN = [1, 1.5, 2, 3, 4];
  const zoomen = (r: 1 | -1) => setZoom((z) => STUFEN[Math.max(0, Math.min(STUFEN.length - 1, STUFEN.indexOf(z) + r))]!);
  /** Pfeiltasten außerhalb der Zeichnung (z. B. nach einem Knopf der Leiste): die Zeichnung verschiebt die Auswahl. */
  const pfeilRef = useRef<((e: KeyboardEvent) => boolean) | null>(null);
  /** Eine gewählte, ungedrehte Doppelreihe lässt sich als Einzelreihe an eine Wand stellen (wo noch keine steht). */
  const einzelreiheFuer = (): Aktionen["einzelreihe"] => {
    const t = teile.length === 1 ? teile[0]! : null;
    if (t?.art !== "reihe") return undefined;
    const r = plan.reihen.find((x) => x.nr === t.nr);
    if (r?.art !== "doppel" || r.drehung || (entwurf.reihenVersatz ?? []).some((v) => v.nr === t.nr && v.drehung)) return undefined;
    const hat = (seite: WandSeite) => entwurf.wandreihen && entwurf.wandreiheSeite !== (seite === "anfang" ? "ende" : "anfang");
    const seiten = (["anfang", "ende"] as const).filter((x) => !hat(x));
    return seiten.length ? { seiten, text: (seite) => `Einzelreihe ${wandText(entwurf, seite)}`, stellen: (seite) => void anWandFragen(t.nr, seite) } : undefined;
  };
  const aktionen: Aktionen = { ausrichten, drehen, zurueckAnPlatz, entfernen: () => void entfernenFragen(), dreht: teile.length === 1, zurueck: zurueckTeile.length > 0, aufheben: () => setAuswahl([]), einzelreihe: einzelreiheFuer() };
  const tastenRef = useRef<(e: KeyboardEvent) => void>(() => undefined);
  tastenRef.current = (e) => {
    const ziel = e.target instanceof Element ? e.target : null;
    if (e.defaultPrevented || e.altKey || ziel?.closest("input, textarea, select, [contenteditable=true], dialog, [role=dialog], [role=alertdialog], [role=menu]")) return;
    const k = e.key;
    if (e.ctrlKey || e.metaKey) {
      if (k === "z" || k === "Z") {
        e.preventDefault();
        return e.shiftKey ? wiederholen() : rueckgaengig();
      }
      if (k === "y" || k === "Y") {
        e.preventDefault();
        return wiederholen();
      }
      return;
    }
    const tun = (f: () => void) => {
      e.preventDefault();
      f();
    };
    // Ohne Auswahl tun Entf und R nichts (keine Meldung bei jedem Tastendruck).
    if (k === "Delete" || k === "Backspace") return auswahl.length ? tun(() => void entfernenFragen()) : undefined;
    if (k === "r" || k === "R") return auswahl.length ? tun(drehen) : undefined;
    // A nur mit Auswahl – „alles ausrichten“ gibt es mit einem Klick auf den Knopf, nicht aus Versehen über die Tastatur.
    if (k === "a" || k === "A") return auswahl.length ? tun(ausrichten) : undefined;
    if (k === "m" || k === "M") return tun(() => setMehrfach(!mehrfach));
    if (k === "v" || k === "V") return tun(() => setMehrfach(false));
    if (k === "f" || k === "F") return tun(() => setVoll(!voll));
    if (k === "+" || k === "=") return tun(() => zoomen(1));
    if (k === "-") return tun(() => zoomen(-1));
    if (k === "0") return tun(() => setZoom(1));
    if (k.startsWith("Arrow") && !ziel?.closest("svg") && pfeilRef.current?.(e)) e.preventDefault();
  };
  useEffect(() => {
    if (!bearbeiten) return;
    const h = (e: KeyboardEvent) => tastenRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [bearbeiten]);
  useEffect(() => {
    if (!bearbeiten) setZoom(1);
  }, [bearbeiten]);

  // Tiere in eingesetzten Volieren zählen mit.
  const inTeilen = plan.objekte.filter((o) => o.tier).map((o) => ({ ...o.tier!, typ: "voliere" as KaefigTyp }));
  const imBlock = plan.objekte.reduce((n, o) => n + (o.kaefige?.length ?? 0), 0);
  const platziert = plan.reihen.reduce((n, r) => n + r.kaefige.length, 0) + plan.volieren.length + inTeilen.length + imBlock;
  const versetzt = (entwurf.reihenVersatz ?? []).length;
  const plattenVersetzt = (entwurf.plattenVersatz ?? []).length;
  const entferntZahl = (entwurf.entfernt ?? []).length;
  const kannPlanen = istAdmin;
  /** Tiere versetzen: Ausstellungsleitung, solange die Schau läuft (Plan festschreiben erledigt die Software). */
  const versetzbar = kannPlanen && !d.abgeschlossen;
  const [halleDialog, setHalleDialog] = useState(false);
  const [detailDialog, setDetailDialog] = useState(false);
  const hallePanel = (
    <HalleEigenschaften
      halle={entwurf}
      plan={plan}
      masse={d.masse}
      platziert={platziert}
      aendernHalle={aendernHalle}
      automatik={kannPlanen && !d.abgeschlossen ? automatikUmschalten : undefined}
      setzen={bearbeiten ? fehlendeSetzen : undefined}
      vorschlaege={() => {
        setHalleDialog(false);
        setVorschlaegeOffen(true);
      }}
    />
  );
  const festAm = plan.fest ? new Date(plan.fest.am).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : null;
  const gesamt = platziert + plan.nichtPlatziert.length;
  const plattenZusammen = plan.reihen.reduce((n, r) => n + r.platten.filter((pl) => !pl.entfernt).length, 0);
  const laengeZusammen = plan.reihen.reduce((n, r) => n + r.platten.filter((pl) => !pl.entfernt).reduce((m, pl) => m + pl.laenge, 0), 0);
  // Der Editor speichert jede Änderung sofort – statt „Speichern“ steht oben rechts, ob alles gespeichert ist.
  // Alle Wege, auf denen der Editor speichert; maßgeblich für „Nicht gespeichert“ ist der zuletzt abgeschickte.
  const speicherwege = [setzen, festschreiben, nachPlan, neuSetzen, versetzenMut, wandreihe];
  const zuletzt = speicherwege.reduce<(typeof speicherwege)[number] | null>((a, m) => (m.submittedAt > (a?.submittedAt ?? 0) ? m : a), null);
  const speichertGerade = offenZahl > 0 || speicherwege.some((m) => m.isPending);
  const speicherStand: SpeicherStand | null = !bearbeiten ? null : speichertGerade ? "speichert" : zuletzt?.isError ? "fehler" : "gespeichert";
  return (
    <>
      <SpeicherStatus stand={speicherStand} />
      <Seitenkopf
        titel="Hallenplan"
        unter={`Halle ${meter(halle.breite)} × ${meter(halle.laenge)} m · Gänge ${meter(halle.gang)} m · ${anzahl(platziert, "Käfig", "Käfige")} gestellt`}
        hilfe="hallenplan"
        marke={festAm ? <Marke ton="ok">Automatisch planen: aus</Marke> : <Marke ton="info">Automatisch planen: an</Marke>}
        aktionen={
          <span className="nicht-drucken flex flex-wrap gap-2">
            {!bearbeiten && <Knopf onClick={() => setVoll(true)}>Vollansicht</Knopf>}
            {!bearbeiten && <Knopf onClick={dreiDOeffnen}>3D</Knopf>}
            <HallenEntwuerfe schauId={schauId} darfAendern={bearbeiten} />
            <KnopfLink href={`/datei/${schauId}/hallenplan.pdf`} target="_blank" rel="noreferrer">
              Plan drucken
            </KnopfLink>
            <KnopfLink href={`/datei/${schauId}/aufbauliste.pdf`} target="_blank" rel="noreferrer">
              Aufbauliste
            </KnopfLink>
          </span>
        }
      />

      <section aria-label="Plan" className="flex min-w-0 flex-col gap-3">
        {plan.warnungen.length > 0 && (
          <Hinweis ton="warnung" className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <span className="min-w-0 flex-1">
              {plan.warnungen.join(" ")}
              {plan.fehlendeMasse.length > 0 && ` Maß fehlt unter „Käfige“: ${plan.fehlendeMasse.map((t) => kaefigName(t as KaefigTyp)).join(", ")}.`}
            </span>
            {plan.fest?.veraltet && kannPlanen && (
              <Knopf className="shrink-0" laedt={neuSetzen.isPending} onClick={neuSetzenFragen}>
                Plan neu setzen
              </Knopf>
            )}
            {kannPlanen && !d.abgeschlossen && plan.warnungen.some((w) => /Front zur Wand/.test(w)) && (
              <Knopf className="shrink-0" onClick={() => void anWaendenAusrichten()}>
                An den Wänden ausrichten
              </Knopf>
            )}
          </Hinweis>
        )}
        {d.anzahl === 0 && <Hinweis>Noch keine Tiere gemeldet.</Hinweis>}
        {d.ohneNummer > 0 && (
          <Hinweis>
            {d.ohneNummer} {d.ohneNummer === 1 ? "Tier hat" : "Tiere haben"} noch keine Käfignummer (am Ende).
          </Hinweis>
        )}
        <SpartenReihen plan={plan} />
        {/* Vollansicht: der Plan füllt den Bildschirm (Esc oder „Schließen“). Klick auf einen Käfig zeigt seine Angaben. Im
            Editor: Werkzeugleiste oben, Eigenschaften der Auswahl rechts (am Tablet als feste Zeile über dem Plan). */}
        <div
          className={`${voll ? "fixed inset-0 z-50 flex flex-col gap-2 bg-weiss p-3 print:static print:block print:p-0" : "relative"} ${
            bearbeiten ? (voll ? "gap-0 p-0" : "rounded-xl border border-linie bg-weiss shadow-[0_1px_2px_rgb(16_20_28/0.04)]") : ""
          }`}
        >
          {voll && !bearbeiten && (
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">Hallenplan</h2>
              <Knopf className="ml-auto" onClick={() => setVoll(false)}>
                Schließen
              </Knopf>
            </div>
          )}
          {bearbeiten && (
            <Werkzeugleiste
              masse={d.masse}
              voll={voll}
              setVoll={setVoll}
              zoom={zoom}
              setZoom={setZoom}
              zoomen={zoomen}
              mehrfach={mehrfach}
              setMehrfach={setMehrfach}
              kannZurueck={verlauf.current.zurueck.length > 0}
              kannVor={verlauf.current.vor.length > 0}
              zurueckWas={verlauf.current.zurueck.at(-1)?.was}
              vorWas={verlauf.current.vor.at(-1)?.was}
              rueckgaengig={rueckgaengig}
              wiederholen={wiederholen}
              einsetzen={einsetzen}
              flaecheEinsetzen={(art) => {
                setAuswahl([]);
                setZeichnen(art);
              }}
              vorschlaege={() => setVorschlaegeOffen(!vorschlaegeOffen)}
              vorschlaegeOffen={vorschlaegeOffen}
              dreiD={dreiDOeffnen}
              a={aktionen}
              hatAuswahl={auswahl.length > 0}
              plan={{
                nummerieren: plan.fest && !d.abgeschlossen ? { text: d.katalogGedruckt ? "Käfigplätze nach Plan" : "Nach Plan nummerieren", tun: nachPlanFragen } : null,
                reihenZurueck: versetzt,
                plattenZurueck: plattenVersetzt,
                alleReihenZurueck: () => aendern((h) => ({ ...h, reihenVersatz: [] }), { was: "Alle Reihen an ihren Platz" }),
                allePlattenZurueck: () => aendern((h) => ({ ...h, plattenVersatz: [] }), { was: "Alle Platten an ihren Platz" }),
                neuSetzen: neuSetzenFragen,
                anWaenden: kannPlanen && !d.abgeschlossen ? () => void anWaendenAusrichten() : null,
              }}
            />
          )}
          <div className={`${voll ? "flex min-h-0 flex-1 flex-col" : ""} ${bearbeiten ? "flex flex-col lg:flex-row" : ""}`}>
            {bearbeiten && (
              <Eigenschaften kompakt halle={entwurf} plan={plan} masse={d.masse} auswahl={auswahl} a={aktionen} aendern={aendern} mehrfach={mehrfach} zeichnen={zeichnen} zeichnenAus={() => setZeichnen(null)} angaben={setInfoId} hallePanel={hallePanel} halleOeffnen={() => setHalleDialog(true)} detailsOeffnen={() => setDetailDialog(true)} versetzen={versetzbar ? (t) => { setDetailDialog(false); setVersetzen(t); } : undefined} />
            )}
            <div className={`relative min-w-0 ${voll ? "min-h-0 flex-1" : ""} ${bearbeiten ? "lg:flex-1 lg:border-r lg:border-linie" : ""}`}>
              <PlanBild
                halle={entwurf}
                plan={plan}
                richterIndex={richterIndex}
                bearbeiten={bearbeiten}
                auswahl={auswahl}
                waehlen={setAuswahl}
                aendern={aendern}
                mehrfach={mehrfach}
                melden={(t) => meldung(t, "warnung")}
                voll={voll}
                zoom={bearbeiten ? zoom : 1}
                pfeilRef={pfeilRef}
                zeigeKaefig={bearbeiten ? undefined : setInfoId}
                markiert={infoId}
                zeichnen={bearbeiten ? zeichnen : null}
                gezeichnet={flaecheAufgezogen}
                anWand={(nr, seite) => void anWandFragen(nr, seite)}
                zielWahl={bearbeiten && versetzen ? { tierId: versetzen.tierId, typ: versetzen.typ, waehlen: (p) => void zielGewaehlt(p), falsch: () => meldung("Der Käfig hat eine andere Größe.", "warnung") } : null}
              />
              {bearbeiten && versetzen && (
                <div className="nicht-drucken absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-lg border border-band bg-weiss px-3 py-2 text-sm shadow-lg" role="status">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">Nr. {versetzen.nr ?? "–"}</span> {versetzen.rasse}: Ziel anklicken
                  </span>
                  <Knopf variante="leise" className="min-h-8 shrink-0 px-2" onClick={() => setVersetzen(null)}>
                    Abbrechen
                  </Knopf>
                </div>
              )}
              {infoId != null && <KaefigInfo schauId={schauId} id={infoId} schliessen={() => setInfoId(null)} />}
              {bearbeiten && vorschlaegeOffen && (
                <div className="nicht-drucken absolute inset-y-0 right-0 z-30 flex w-[min(40rem,100%)] flex-col border-l border-linie bg-weiss shadow-xl" role="dialog" aria-label="Stellvorschläge">
                  <div className="flex min-h-12 items-center gap-2 border-b border-linie px-4 py-1.5">
                    <h3 className="font-sans text-base font-semibold">Stellvorschläge</h3>
                    <Knopf variante="leise" className="ml-auto" onClick={() => setVorschlaegeOffen(false)}>
                      Schließen
                    </Knopf>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-4">
                    <StellVorschlaege schauId={schauId} d={d} eingebettet schmal schliessen={() => setVorschlaegeOffen(false)} />
                  </div>
                </div>
              )}
            </div>
            {bearbeiten && (
              <Eigenschaften halle={entwurf} plan={plan} masse={d.masse} auswahl={auswahl} a={aktionen} aendern={aendern} mehrfach={mehrfach} zeichnen={zeichnen} zeichnenAus={() => setZeichnen(null)} angaben={setInfoId} hallePanel={hallePanel} halleOeffnen={() => setHalleDialog(true)} versetzen={versetzbar ? (t) => { setDetailDialog(false); setVersetzen(t); } : undefined} />
            )}
          </div>
          <Dialog offen={halleDialog} onSchliessen={() => setHalleDialog(false)} titel="Halle">
            {hallePanel}
          </Dialog>
          <Dialog offen={detailDialog && auswahl.length === 1} onSchliessen={() => setDetailDialog(false)} titel="Eigenschaften">
            <Eigenschaften
              imDialog
              halle={entwurf}
              plan={plan}
              masse={d.masse}
              auswahl={auswahl}
              a={aktionen}
              aendern={aendern}
              mehrfach={mehrfach}
              zeichnen={null}
              zeichnenAus={() => setZeichnen(null)}
              angaben={(id) => {
                setDetailDialog(false);
                setInfoId(id);
              }}
              versetzen={versetzbar ? (t) => { setDetailDialog(false); setVersetzen(t); } : undefined}
              hallePanel={hallePanel}
              halleOeffnen={() => setHalleDialog(true)}
            />
          </Dialog>
          {bearbeiten && (
            <div className={`nicht-drucken flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 border-t border-linie bg-papier px-3 py-1 text-[0.82rem] text-grau ${voll ? "" : "rounded-b-xl"}`}>
              <AutomatikSchalter an={!festAm} umschalten={kannPlanen && !d.abgeschlossen ? automatikUmschalten : undefined} festAm={festAm} />
              <span>
                Verschoben: <span className="text-tinte">{anzahl(versetzt, "Reihe", "Reihen")}</span>, <span className="text-tinte">{anzahl(plattenVersetzt, "Platte", "Platten")}</span>
              </span>
              {entferntZahl > 0 && (
                <span>
                  Entfernt: <span className="text-tinte">{entferntZahl} leer</span>
                </span>
              )}
              {/* In der Vollansicht ist die Kopfleiste verdeckt: der Zustand steht dann auch hier. */}
              {voll && <SpeicherStatus stand={speicherStand} eingebettet />}
              <span className="ml-auto">
                <HilfeLink abschnitt="hallenplan-bearbeiten">Hilfe zum Editor</HilfeLink>
              </span>
            </div>
          )}
        </div>
        {/* Nach dem Umstellen: freie Plätze mitten in den Reihen oder Nummern nicht in Planfolge. Unter dem Plan, damit der
            Plan beim Bearbeiten nicht springt, wenn der Hinweis erscheint. */}
        {kannPlanen && plan.fest && !d.abgeschlossen && d.unordnung && (d.unordnung.freiDazwischen > 0 || d.unordnung.nichtInFolge > 0) && (
          <Hinweis ton="warnung" className="nicht-drucken flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className="min-w-0 flex-1">
              {[
                d.unordnung.freiDazwischen > 0 && `${d.unordnung.freiDazwischen} ${d.unordnung.freiDazwischen === 1 ? "freier Platz" : "freie Plätze"} zwischen belegten Käfigen`,
                d.unordnung.nichtInFolge > 0 && `${d.katalogGedruckt ? "Käfignummern" : "Nummern"} nicht in Planfolge`,
              ]
                .filter(Boolean)
                .join(", ")}
              .
            </span>
            {(d.unordnung.nichtInFolge > 0 || !d.eingeliefert) && (
              <Knopf className="shrink-0" laedt={nachPlan.isPending} onClick={nachPlanFragen}>
                Jetzt {d.katalogGedruckt ? "Käfigplätze nach Plan vergeben" : "nach Plan nummerieren"}
              </Knopf>
            )}
          </Hinweis>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-grau">
          {richterReihe
            .filter((r) => plan.reihen.some((x) => x.kaefige.some((k) => k.preisrichterId === r.id)) || plan.volieren.some((k) => k.preisrichterId === r.id))
            .map((r) => {
              const i = richterIndex.get(r.id)!;
              return (
                <span key={r.id} className="flex items-center gap-2 text-tinte">
                  <LegendenFeld fill={richterFarbe(i)} stroke={BAU.linie} schraffur={i} />
                  {r.name}
                </span>
              );
            })}
          <span className="flex items-center gap-2">
            <LegendenFeld {...BAU.ohne} />
            ohne Preisrichter
          </span>
          <span className="flex items-center gap-2">
            <LegendenFeld {...BAU.platte} />
            Grundplatte
          </span>
          <span className="flex items-center gap-2">
            <LegendenFeld {...BAU.frei} />
            freier Bereich
          </span>
          <span className="flex items-center gap-2">
            {/* Öffnung in der Wand wie in der Zeichnung. */}
            <svg width="22" height="16" aria-hidden="true">
              <rect x="0" y="1" width="6" height="3.5" fill={BAU.wand} />
              <rect x="16" y="1" width="6" height="3.5" fill={BAU.wand} />
              <rect x="6" y="4.5" width="10" height="10.5" fill={BAU.eingang.fill} stroke={BAU.eingang.stroke} strokeWidth="1" />
            </svg>
            Eingang / Ausgang
          </span>
          <span className="flex items-center gap-2">
            <LegendenFeld {...BAU.volierenbereich} dash />
            Volierenbereich
          </span>
          <span className="flex items-center gap-2">
            <LegendenFeld {...BAU.voliere} breite={2.2} />
            eingesetzte Voliere
          </span>
          <span className="flex items-center gap-2">
            <svg width="22" height="16" aria-hidden="true">
              <rect x="1" y="1" width="20" height="14" fill={BAU.platte.fill} stroke={BAU.platte.stroke} strokeWidth="0.75" />
              <rect x="4" y="4" width="6" height="8" fill="#ffffff" stroke="#7c8696" strokeWidth="0.75" strokeDasharray="2 1" />
              <rect x="12" y="4" width="6" height="8" fill="#ffffff" stroke="#7c8696" strokeWidth="0.75" strokeDasharray="2 1" />
            </svg>
            leerer Käfigblock
          </span>
          {plan.objekte.some(istMoebel) && (
            <span className="flex items-center gap-2">
              <LegendenFeld fill={BAU.tisch.fill} stroke={BAU.tisch.stroke} />
              Tisch / Bank
            </span>
          )}
          <span className="flex items-center gap-2">
            {/* Käfig von oben: Rückwand kräftig oben, Seiten fein, Front unten hell gestrichelt. */}
            <svg width="22" height="16" aria-hidden="true">
              <rect x="2" y="2" width="18" height="12" fill={BAU.platte.fill} />
              <line x1="2" y1="14" x2="20" y2="14" stroke={BAU.kaefigwand.front} strokeWidth="1" strokeDasharray="2 1.5" />
              <line x1="2" y1="2" x2="2" y2="14" stroke={BAU.kaefigwand.seite} strokeWidth="1.2" />
              <line x1="20" y1="2" x2="20" y2="14" stroke={BAU.kaefigwand.seite} strokeWidth="1.2" />
              <line x1="2" y1="2" x2="20" y2="2" stroke={BAU.kaefigwand.rueck} strokeWidth="3" />
            </svg>
            Rückwand
          </span>
          <span className="flex items-center">Raster 0,5 m · Maße in Metern</span>
        </div>
      </section>

      <Abschnitt
        titel="Platz"
        aktionen={plan.nichtPlatziert.length === 0 ? <Marke ton="ok">Alle haben Platz</Marke> : <Marke ton="fehler">{plan.nichtPlatziert.length} ohne Platz</Marke>}
      >
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt className="text-grau">Gestellt</dt>
          <dd className="tabular-nums">
            {platziert} von {anzahl(gesamt, "Käfig", "Käfigen")}
          </dd>
          {plan.nichtPlatziert.length > 0 && (
            <>
              <dt className="text-grau">{plan.fest ? "Noch zu stellen" : "Ohne Platz"}</dt>
              <dd>
                <OhnePlatz plan={plan} halle={halle} masse={d.masse} />
              </dd>
            </>
          )}
          {plan.reserve.length > 0 && (
            <>
              <dt className="text-grau">{plan.fest ? "Frei im festen Plan" : "Frei in den Reihen"}</dt>
              <dd>
                {!plan.fest && `${anzahl(plan.reservePlatten, "Grundplatte", "Grundplatten")} und freie Plätze: `}
                {plan.reserve.map((r) => `${r.anzahl} × ${kaefigName(r.typ as KaefigTyp, d.masse)}`).join(" oder ")}
              </dd>
            </>
          )}
        </dl>
      </Abschnitt>

      <TabellenRahmen
        className="print:overflow-visible print:*:overflow-visible"
        kopf={<h2 className="text-[1.02rem] font-semibold">Aufbauliste je Reihe</h2>}
        fuss={<span>Grundplatten nach Käfigart: {plattenJeArt(plan.reihen, d.masse)}</span>}
      >
        <table className="tabelle">
          <thead>
            <tr>
              <th scope="col">Reihe</th>
              <th scope="col">Lage</th>
              <th scope="col">Käfignummern</th>
              <th scope="col">Käfige</th>
              <th scope="col" className="text-right">Grund&shy;platten</th>
              <th scope="col" className="text-right">Länge</th>
              <th scope="col">Rassen</th>
              <th scope="col">Preisrichter</th>
            </tr>
          </thead>
          <tbody>
            {plan.reihen
              .filter((r) => r.kaefige.length || r.freiePlaetze?.length)
              .map((r) => (
                <tr key={r.nr}>
                  <td className="font-semibold text-tinte">R{r.nr}</td>
                  <td className="text-sm">{lage(r, plan.reihen, plan.quer)}</td>
                  <td className="tabular-nums">{nummernBereiche(r.kaefige.map((k) => alsNummer(k.nr))) || "–"}</td>
                  <td className="text-sm">
                    {zusammenfassen(r.kaefige.map((k) => k.typ as KaefigTyp), d.masse)}
                    {r.freiePlaetze?.length ? `${r.kaefige.length ? ", " : ""}frei: ${zusammenfassen(r.freiePlaetze.map((f) => f.typ as KaefigTyp), d.masse)}` : ""}
                  </td>
                  <td className="text-right tabular-nums">{r.platten.filter((pl) => !pl.entfernt).length}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{meter(r.platten.filter((pl) => !pl.entfernt).reduce((n, pl) => n + pl.laenge, 0))} m</td>
                  <td className="text-sm">{[...new Set(r.kaefige.map((k) => k.rasse))].join(", ")}</td>
                  <td className="text-sm">{richterNamen(r.kaefige, d.richter)}</td>
                </tr>
              ))}
            {inTeilen.length > 0 && (
              <tr>
                <td className="font-semibold text-tinte">V*</td>
                <td className="text-sm">eingesetzte Volieren</td>
                <td className="tabular-nums">{nummernBereiche(inTeilen.map((k) => alsNummer(k.nr))) || "–"}</td>
                <td className="text-sm">{inTeilen.length} × Voliere</td>
                <td />
                <td />
                <td className="text-sm">{[...new Set(inTeilen.map((k) => k.rasse))].join(", ")}</td>
                <td className="text-sm">{richterNamen(inTeilen as unknown as PlanKaefig[], d.richter)}</td>
              </tr>
            )}
            {plan.volieren.length > 0 && (
              <tr>
                <td className="font-semibold text-tinte">V</td>
                <td className="text-sm">Volierenbereich</td>
                <td className="tabular-nums">{nummernBereiche(plan.volieren.map((k) => alsNummer(k.nr))) || "–"}</td>
                <td className="text-sm">{zusammenfassen(plan.volieren.map((k) => k.typ as KaefigTyp), d.masse)}</td>
                <td />
                <td />
                <td className="text-sm">{[...new Set(plan.volieren.map((k) => k.rasse))].join(", ")}</td>
                <td className="text-sm">{richterNamen(plan.volieren, d.richter)}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>Zusammen</td>
              <td />
              <td />
              <td className="text-sm">{zusammenfassen([...plan.reihen.flatMap((r) => r.kaefige), ...plan.volieren].map((k) => k.typ as KaefigTyp), d.masse)}</td>
              <td className="text-right tabular-nums">{plattenZusammen}</td>
              <td className="whitespace-nowrap text-right tabular-nums">{meter(laengeZusammen)} m</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </TabellenRahmen>
    </>
  );
}
