import { KAEFIG_TYP_MEHRZAHL, wandAusrichtung, wandDrehungenAnwenden, type WandKandidat, reihenSchilder, kaefigKanten, frontDerReihe, type Blick, type Strecke, objektFront, dreheBlick, blockPlatz, etagenStreifen, etagenVon, gangVorKaefigen, istMoebel, moebelMass, moebelStuecke, MOEBEL_NAME, type HallenObjekt, type MoebelArt, eingangsGang, fehlendeImPlan, vonHandGeplant, fehlendeKaefige, freieStelle, kaefigAnzahl, teilGroesse, type Belegt, RICHTER_FARBE, richterFarbe, richterFolge, richterSchraffur, wandSeiteVon, type WandSeite, anKantenEinrasten, auswahlBereinigen, dreheRechteck, festGeometrie, leereEntfernen, plattenStand, mitteVon, pruefeLage, pruefeVerschiebung, rasterAusrichten, teilSchluessel, verschiebeTeile, type PlanAuswahlTeil, type HallenTeil, type PlanKoerper, type VerschiebePruefung, HAUPTGANG_STANDARD, halleSchluessel, type Drehung, kaefigeJePlatte, MELDEART_LABEL, kaefigMass, kaefigName, nummernBereiche, belegungImPlan, platzImPlan, type KaefigPlatz, type Halle, type HallenFlaeche, type KaefigMasse, type KaefigTyp, type PlanKaefig, type Rechteck, type Reihe } from "@schau/domain";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fehlerText } from "../lib";
import { useSchauId } from "../rahmen";
import { useIstAdmin } from "../rolle";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Auswahl, Dialog, Eingabe, FehlerAnzeige, Feld, Haken, HilfeLink, Hinweis, Knopf, KnopfLink, Laden, Leer, Marke, SEITE, Seitenkopf, SpeicherStatus, type SpeicherStand, TabellenRahmen, useFrage, useMeldung } from "../ui";
import { MenueEintrag, MenueKopf, MenueTrenner, strg, WzGruppe, WzKnopf, WzMenue, WzSymbol } from "./hallenplan-werkzeuge";

type Daten = Ausgabe["katalog"]["hallenplan"];



// Preisrichter-Farben (RICHTER_FARBE, richterFarbe, richterSchraffur) und ihre Folge (richterFolge) kommen aus der
// Fachlogik – gleich auf dem Bildschirm und im PDF.
/** Bauteile der Halle: eigene neutrale Töne und Muster, nie eine Preisrichter-Farbe. */
const BAU = {
  // Wie eine Bauzeichnung: kräftige Wände, feine dunkle Linien für alles, was in der Halle steht.
  halle: { fill: "#fbfbf9" },
  wand: "#2b2f36",
  linie: "#3d4450",
  platte: { fill: "#ebe6dc", stroke: "#8f8676" },
  frei: { fill: "url(#muster-frei)", stroke: "#6b7383" },
  eingang: { fill: "#ffffff", stroke: "#2b2f36", text: "#2b2f36" },
  volierenbereich: { fill: "#eef5f1", stroke: "#3d5a50" },
  voliere: { fill: "#ffffff", stroke: "#3d4450" },
  ohne: { fill: "#ffffff", stroke: "#3d4450" },
  raster: { fein: "#eef0f3", meter: "#e1e4e9", fuenf: "#cdd2d9", text: "#5b6577" },
  tisch: { fill: "#e3cfae", stroke: "#8a6d45" },
  bank: { fill: "#efe2cb" },
  // Käfigwände von oben: Rückwand kräftig und dunkel, Seitenwände fein, die offene Front (Gitter) hell gestrichelt.
  kaefigwand: { rueck: "#1b1f26", seite: "#4a515d", front: "#9aa3b2" },
};


/** Muster für Zeichnung und Legende (SVG-Attribute, keine Inline-Styles). `massstab` verkleinert sie für die Legende. */
function Muster({ idPrefix = "", massstab = 1 }: { idPrefix?: string; massstab?: number }) {
  const f = 24 * massstab, s = 14 * massstab;
  return (
    <defs>
      {/* Freifläche: feine Schraffur wie auf einem Bauplan. */}
      <pattern id={`${idPrefix}muster-frei`} patternUnits="userSpaceOnUse" width={f} height={f} patternTransform="rotate(45)">
        <rect width={f} height={f} fill="#f4f5f7" />
        <line x1="0" y1="0" x2="0" y2={f} stroke="#9aa2ae" strokeWidth={Math.max(0.6, 1.6 * massstab)} />
      </pattern>
      {RICHTER_FARBE.map((farbe, i) => (
        <pattern key={i} id={`${idPrefix}schraffur-${i}`} patternUnits="userSpaceOnUse" width={s} height={s} patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2={s} stroke={farbe} strokeWidth={Math.max(0.8, 2.2 * massstab)} />
        </pattern>
      ))}
    </defs>
  );
}

/** Legendenfeld: gleiches Aussehen wie in der Zeichnung. */
function LegendenFeld({ fill, stroke, dash, schraffur, breite = 1 }: { fill: string; stroke: string; dash?: boolean; schraffur?: number; breite?: number }) {
  const p = `leg${useId().replace(/[^a-zA-Z0-9]/g, "")}-`;
  return (
    <svg width="22" height="16" aria-hidden="true">
      <Muster idPrefix={p} massstab={0.4} />
      <rect x="1" y="1" width="20" height="14" fill={fill.replace("url(#", `url(#${p}`)} fillOpacity={schraffur != null ? 0.45 : 1} stroke={stroke} strokeWidth={breite} strokeDasharray={dash ? "3 2" : undefined} />
      {schraffur != null && richterSchraffur(schraffur) && <rect x="1" y="1" width="20" height="14" fill={`url(#${p}schraffur-${schraffur % RICHTER_FARBE.length})`} />}
    </svg>
  );
}

const meter = (cm: number) => (cm / 100).toLocaleString("de-DE", { maximumFractionDigits: 2 });
const zuCm = (m: string) => Math.round(Number(m.replace(",", ".")) * 100);

/** Käfignummer „12a“ → für die Bereichsangabe „1–40, 52a“. */
const alsNummer = (nr: string | null) => {
  const t = nr?.match(/^(\d+)(\D*)$/);
  return t ? { katalogNr: Number(t[1]), suffix: t[2] ?? "" } : { katalogNr: null, suffix: "" };
};

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

function lage(r: Reihe, alle: Reihe[], quer: boolean): string {
  // Von Hand gedreht oder verschoben: die berechnete Lage stimmt nicht mehr – die Zeichnung zeigt, wo sie steht.
  if (r.drehung) return `von Hand gedreht (${r.drehung}°), siehe Plan`;
  if (r.versatz.dx || r.versatz.dy) return "von Hand verschoben, siehe Plan";
  if (r.art === "wand") {
    if (quer) return r.front === "rechts" ? "an der vorderen Stirnwand" : "an der hinteren Stirnwand";
    return r.front === "rechts" ? "an der linken Wand" : "an der rechten Wand";
  }
  const doppel = alle.filter((x) => x.art === "doppel");
  const nr = Math.floor(doppel.indexOf(r) / 2) + 1;
  if (quer) return `Doppelreihe ${nr}, Front nach ${r.front === "links" ? "vorn" : "hinten"}`;
  return `Doppelreihe ${nr}, Front ${r.front === "links" ? "links" : "rechts"}`;
}

/** Fehlende Käfige einsetzen – alle oder (`nur`) einen Block dieser Käfigart. */
type FehlendeSetzen = (nur?: KaefigTyp) => void;

/**
 * Tiere ohne Platz je Käfiggröße (Nummer und Rasse, keine Aussteller); im Editor mit Knopf je Größe und „Alle fehlenden
 * Käfige einsetzen“.
 */
function OhnePlatz({ plan, halle, masse, setzen }: { plan: Plan; halle: Halle; masse: KaefigMasse; setzen?: FehlendeSetzen }) {
  const gruppen = fehlendeKaefige(plan.nichtPlatziert, masse, halle);
  return (
    <div className="flex flex-col gap-3">
      {setzen && gruppen.some((g) => g.einsetzen) && (
        <Knopf variante="primaer" className="w-full justify-start" onClick={() => setzen()}>
          <WzSymbol name="block" klein />
          Alle fehlenden Käfige einsetzen
        </Knopf>
      )}
      {gruppen.map((g) => (
        <div key={g.typ} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold tabular-nums text-tinte">{kaefigAnzahl(g.anzahl, g.typ, masse)}</span>
            <span className="shrink-0 text-xs text-grau">
              {!g.einsetzen ? (kaefigMass(g.typ, masse) ? "kein Käfigblock" : "Käfigmaß fehlt") : g.einsetzen === "kaefigblock" ? anzahl(g.noetig, "Block", "Blöcke") : anzahl(g.noetig, "Voliere", "Volieren")}
            </span>
          </div>
          <p className="text-xs text-grau">{g.tiere.map((t) => (t.nr ? `Nr. ${t.nr} ${t.rasse}` : t.rasse)).join(", ")}</p>
          {setzen && g.einsetzen && (
            <Knopf className="w-full justify-start" onClick={() => setzen(g.typ)}>
              <WzSymbol name={g.einsetzen === "voliere" ? "voliere" : "block"} klein />
              {g.einsetzen === "voliere" ? "Voliere einsetzen" : "Käfigblock einsetzen"}
            </Knopf>
          )}
        </div>
      ))}
    </div>
  );
}

function zusammenfassen(typen: KaefigTyp[], masse: KaefigMasse): string {
  const n = new Map<KaefigTyp, number>();
  for (const t of typen) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n.entries()].map(([t, k]) => `${k} × ${kaefigName(t, masse)}`).join(", ");
}

function richterNamen(k: PlanKaefig[], richter: { id: number; name: string }[]): string {
  const ids = [...new Set(k.map((x) => x.preisrichterId).filter((x): x is number => x != null))];
  return ids.map((id) => richter.find((r) => r.id === id)?.name ?? "").filter(Boolean).join(", ") || "–";
}

/** Was im Editor gewählt sein kann: ein verschiebbares Teil oder ein freier Käfigplatz (der mit seiner Platte geht). */
type Ziel = PlanAuswahlTeil;
type Plan = NonNullable<Daten["plan"]>;
/** Schlüssel eines gewählten Teils (auch eines freien Platzes) – zum Vergleichen. */
const zielSchluessel = (z: Ziel) => (z.art === "platz" ? `z${z.reihe}|${z.x}|${z.y}|${z.etage ?? 0}` : teilSchluessel(z));
const gleich = (a: Ziel | null | undefined, b: Ziel | null | undefined) => !!a && !!b && zielSchluessel(a) === zielSchluessel(b);
/** Freier Platz der Auswahl im Plan (null: dort steht inzwischen ein Tier oder er ist entfernt). */
const freierPlatz = (plan: Plan, z: Extract<Ziel, { art: "platz" }>) => plan.reihen.find((r) => r.nr === z.reihe)?.freiePlaetze?.find((f) => f.x === z.x && f.y === z.y && (f.etage ?? 0) === (z.etage ?? 0)) ?? null;
/**
 * Auswahl als verschiebbare Teile (zum Ziehen, Drehen, Ausrichten): ein freier Platz steht für seine Grundplatte (ohne
 * Platte: für seine Reihe); Platten einer gewählten Reihe fallen weg (siehe `auswahlBereinigen`).
 */
function zuTeilen(auswahl: Ziel[], plan: Plan): HallenTeil[] {
  const t = auswahl.flatMap((z): HallenTeil[] => {
    if (z.art !== "platz") return [z];
    const f = freierPlatz(plan, z);
    if (!f) return [];
    return [f.platte != null ? { art: "platte", reihe: z.reihe, i: f.platte } : { art: "reihe", nr: z.reihe }];
  });
  return auswahlBereinigen(t);
}
/**
 * Grundplatten einer Reihe, die da sind: ohne die im festen Plan entfernten (Platzhalter, `PlanPlatte.entfernt`) und ohne
 * die, die im Entwurf eben entfernt wurden (der Plan ist noch nicht neu gerechnet) – so verschwinden sie sofort.
 */
function plattenDa(halle: Halle, r: Reihe): boolean[] {
  const weg = (halle.entfernt ?? []).filter((e) => e.reihe === r.nr && e.art === "platte");
  return r.platten.map((pl) => !pl.entfernt && !weg.some((e) => Math.abs(e.x - pl.x) < 0.5 && Math.abs(e.y - pl.y) < 0.5));
}
/** Freier Platz, der im Entwurf eben entfernt wurde (selbst oder mit seiner Platte). */
function platzWeg(halle: Halle, r: Reihe, f: { x: number; y: number; platte?: number; etage?: number }, da: boolean[]): boolean {
  if (f.platte != null && da[f.platte] === false) return true;
  return (halle.entfernt ?? []).some((e) => e.reihe === r.nr && e.art === "platz" && Math.abs(e.x - f.x) < 0.5 && Math.abs(e.y - f.y) < 0.5 && (e.etage ?? 0) === (f.etage ?? 0));
}
/** Änderung der Halle im Editor: `was` für Rückgängig, `grund` fürs Protokoll. */
type Aendern = (f: (h: Halle) => Halle, opt?: { was?: string; grund?: string; ohneVerlauf?: boolean; festschreiben?: boolean }) => Halle;
type Schritt =
  | { art?: undefined; vorher: Halle; nachher: Halle; was: string }
  /** Tier versetzt (im festen Plan): Rückgängig setzt es zurück, beim Tausch tauschen beide wieder. */
  | { art: "tier"; tierId: number; von: KaefigPlatz | null; ziel: KaefigPlatz; getauscht: number | null; was: string };
/** Tier, das gerade versetzt wird (Ziel im Plan anklicken). */
type Versetzen = { tierId: number; nr: string | null; rasse: string; typ: KaefigTyp };
/** Aktionen zur Auswahl – gleich in Werkzeugleiste, Eigenschaften und Tastenkürzeln. */
type Aktionen = { ausrichten: () => void; drehen: () => void; zurueckAnPlatz: () => void; entfernen: () => void; aufheben: () => void; dreht: boolean; zurueck: boolean; einzelreihe?: { seiten: WandSeite[]; text: (seite: WandSeite) => string; stellen: (seite: WandSeite) => void }};
const anzahl = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`;
/** Was „Entfernen“ wegnimmt, als Aufzählung („1 Grundplatte und 2 freie Plätze“); leer: nichts. */
function entfernenText(e: { platten: number; plaetze: number; teile: number; flaechen: number }): string {
  const t = [
    e.platten && anzahl(e.platten, "Grundplatte", "Grundplatten"),
    e.plaetze && anzahl(e.plaetze, "freier Platz", "freie Plätze"),
    e.teile && anzahl(e.teile, "eingesetztes Teil", "eingesetzte Teile"),
    e.flaechen && anzahl(e.flaechen, "Fläche", "Flächen"),
  ].filter((x): x is string => !!x);
  return t.length > 1 ? `${t.slice(0, -1).join(", ")} und ${t.at(-1)}` : (t[0] ?? "");
}
/**
 * Ziehen: die ganze Auswahl (bereinigt, siehe `auswahlBereinigen`) bzw. beim Ändern der Größe eine Fläche. start:
 * Bildschirmpunkt beim Greifen – bei jeder Bewegung mit der aktuellen Lage des Plans umgerechnet (nichts springt, wenn
 * sich darüber etwas ändert). konflikt: Ergebnis der Prüfung für den aktuellen Weg. klick: was ein Klick ohne Bewegung
 * an der Auswahl ändert (nur dieses Teil wählen bzw. es aus der Auswahl nehmen).
 */
type Zug = {
  ziele: HallenTeil[];
  modus: "verschieben" | "groesse";
  start: { clientX: number; clientY: number };
  dx: number;
  dy: number;
  konflikt: string | null;
  klick?: { art: "nurDieses" | "heraus"; ziel: Ziel };
  /** Zeiger, der greift (ein zweiter Finger stört nicht). */
  zeiger: number;
};
/** Auswahlrechteck (Ziehen auf freier Fläche), Ecken in Hallenkoordinaten. */
type Rahmen = { start: { x: number; y: number }; jetzt: { x: number; y: number }; startBild: { clientX: number; clientY: number }; dazu: boolean; zeiger: number };

const RASTER = 10;
/** Rand um die Halle in der Zeichnung (cm) – für Beschriftungen vor der Wand. */
const RAND_CM = 160;
const raster = (v: number) => Math.round(v / RASTER) * RASTER;

/** Halle mit allen Feldern (ältere gespeicherte Hallen haben noch keine Teile oder Versätze). */
/** Ein automatisch eingesetzter Block, den der Editor verschiebt oder dreht, gilt danach als von Hand gesetzt. */
const vonHandBewegt = (vorher: Halle, neu: Halle): Halle => {
  const alt = new Map((vorher.objekte ?? []).map((o) => [o.id, o]));
  const bewegt = (o: NonNullable<Halle["objekte"]>[number]) => {
    const a = alt.get(o.id);
    return !!a && (a.x !== o.x || a.y !== o.y || a.drehung !== o.drehung);
  };
  if (!(neu.objekte ?? []).some((o) => o.auto && bewegt(o))) return neu;
  return { ...neu, objekte: neu.objekte!.map((o) => (o.auto && bewegt(o) ? (({ auto: _a, ...rest }) => rest)(o) : o)) };
};
const vollstaendig = (h: Halle): Halle => ({ ...h, objekte: h.objekte ?? [], reihenVersatz: h.reihenVersatz ?? [], plattenVersatz: h.plattenVersatz ?? [], spartenStart: h.spartenStart ?? [] });

type PlattenVersatz = NonNullable<Halle["plattenVersatz"]>[number];
/** Versatz einer einzelnen Grundplatte setzen; ohne Verschiebung und Drehung fällt der Eintrag weg. */
function mitPlattenVersatz(v: Halle, neu: PlattenVersatz): Halle {
  const bleibt = neu.dx || neu.dy || neu.drehung;
  return { ...v, plattenVersatz: [...v.plattenVersatz!.filter((x) => !(x.reihe === neu.reihe && x.platte === neu.platte)), ...(bleibt ? [neu] : [])] };
}

type ReihenVersatz = NonNullable<Halle["reihenVersatz"]>[number];
/** Versatz einer Reihe setzen; ohne Verschiebung und Drehung fällt der Eintrag weg (Reihe an ihrem Platz). */
function mitVersatz(v: Halle, neu: ReihenVersatz): Halle {
  const bleibt = neu.dx || neu.dy || neu.drehung;
  return { ...v, reihenVersatz: [...v.reihenVersatz!.filter((x) => x.nr !== neu.nr), ...(bleibt ? [neu] : [])] };
}

/** Größe einer Fläche ändern (Werte in cm, Hallenkoordinaten). Verschoben wird mit `verschiebeTeile`. */
function groesseAendern(h: Halle, i: number, dx: number, dy: number): Halle {
  const v = vollstaendig(h);
  return { ...v, flaechen: v.flaechen.map((f, j) => (j !== i ? f : { ...f, breite: Math.max(20, f.breite + dx), tiefe: Math.max(20, f.tiefe + dy) })) };
}

/**
 * Lage einer Reihe im Entwurf, ohne laufendes Ziehen: der zuletzt gerechnete Plan, verschoben und gedreht um das, was
 * der Entwurf schon weiter ist (sofort sichtbar, bevor der Server neu rechnet). `aufPlatte` setzt zusätzlich Versatz und
 * Drehung der einzelnen Grundplatte i dazu (Drehung um die Mitte der Platte).
 */
function reihenLage(halle: Halle, reihe: Reihe) {
  const ev = (halle.reihenVersatz ?? []).find((x) => x.nr === reihe.nr);
  const ex = (ev?.dx ?? 0) - reihe.versatz.dx, ey = (ev?.dy ?? 0) - reihe.versatz.dy;
  // Im Entwurf gedreht, aber noch nicht gerechnet: um den Drehpunkt der Reihe weiterdrehen (wie der Server es tut).
  const dg = ((ev?.drehung ?? 0) - (reihe.drehung ?? 0) + 360) % 360;
  const inReihe = (q: Rechteck): Rechteck => {
    const d = dg ? dreheRechteck(q, reihe.drehpunkt, dg) : q;
    return { ...d, x: d.x + ex, y: d.y + ey };
  };
  const aufPlatte = (q: Rechteck, i: number | undefined): Rechteck => {
    const zr = inReihe(q);
    if (i == null || !reihe.platten[i]) return zr;
    const pl = reihe.platten[i]!;
    const e = (halle.plattenVersatz ?? []).find((x) => x.reihe === reihe.nr && x.platte === i);
    const dgp = ((e?.drehung ?? 0) - (pl.drehung ?? 0) + 360) % 360;
    const d = dgp ? dreheRechteck(zr, mitteVon([inReihe(pl.rechteck)]), dgp) : zr;
    return { ...d, x: d.x + (e?.dx ?? 0) - (pl.versatz?.dx ?? 0), y: d.y + (e?.dy ?? 0) - (pl.versatz?.dy ?? 0) };
  };
  /** Drehung einer Platte im Entwurf gegenüber dem gerechneten Plan (Reihe und Platte) – dreht die Front mit. */
  const vorschauDrehung = (i: number) => {
    const pl = reihe.platten[i];
    const e = (halle.plattenVersatz ?? []).find((x) => x.reihe === reihe.nr && x.platte === i);
    return (dg + ((e?.drehung ?? 0) - (pl?.drehung ?? 0) + 360)) % 360;
  };
  return { ev, inReihe, aufPlatte, vorschauDrehung };
}

/** Lage eines eingesetzten Teils im Entwurf (null: im Entwurf schon entfernt). */
function objektLage(halle: Halle, o: NonNullable<Daten["plan"]>["objekte"][number]): { lage: Rechteck; gedrehtSeit: boolean } | null {
  const e = (halle.objekte ?? []).find((x) => x.id === o.id);
  if (!e) return null;
  // Tisch, Bank, Garnitur: Größe aus dem Entwurf (Maße wirken sofort).
  if (istMoebel(e)) {
    const g = teilGroesse(e, halle, null);
    return { lage: e.drehung === 90 ? { x: e.x, y: e.y, b: g.kurz, h: g.lang } : { x: e.x, y: e.y, b: g.lang, h: g.kurz }, gedrehtSeit: false };
  }
  const gedrehtSeit = (e.drehung ?? 0) !== (o.drehung ?? 0);
  return { lage: { x: e.x, y: e.y, b: gedrehtSeit ? o.rechteck.h : o.rechteck.b, h: gedrehtSeit ? o.rechteck.b : o.rechteck.h }, gedrehtSeit };
}

const flaecheRechteck = (f: HallenFlaeche): Rechteck => ({ x: f.x, y: f.y, b: f.breite, h: f.tiefe });
const innen = (q: Rechteck, a: Rechteck) => q.x >= a.x - 0.5 && q.y >= a.y - 0.5 && q.x + q.b <= a.x + a.b + 0.5 && q.y + q.h <= a.y + a.h + 0.5;

/**
 * Grundplatten, Käfigblöcke und Volieren, wie sie im Entwurf stehen (Lage und Front), als Kandidaten für die
 * Wandausrichtung (siehe wandAusrichtung). `nur`: nur diese Teile (eine Reihe steht für ihre Platten).
 */
function wandKandidatenImEntwurf(halle: Halle, plan: NonNullable<Daten["plan"]>, nur: HallenTeil[] | null): WandKandidat[] {
  const aus: WandKandidat[] = [];
  for (const k of planKoerper(halle, plan)) {
    const t = k.teil;
    if (t?.art === "platte") {
      if (nur && !nur.some((n) => (n.art === "platte" && n.reihe === t.reihe && n.i === t.i) || (n.art === "reihe" && n.nr === t.reihe))) continue;
      const reihe = plan.reihen.find((r) => r.nr === t.reihe);
      const pl = reihe?.platten[t.i];
      if (!reihe || !pl) continue;
      const front = dreheBlick(frontDerReihe(reihe, plan.quer, pl.drehung ?? 0), reihenLage(halle, reihe).vorschauDrehung(t.i));
      aus.push({ teil: t, rechteck: k.rechteck, front, belegt: pl.belegt });
    } else if (t?.art === "objekt") {
      if (nur && !nur.some((n) => n.art === "objekt" && n.id === t.id)) continue;
      const o = plan.objekte.find((x) => x.id === t.id);
      const e = (halle.objekte ?? []).find((x) => x.id === t.id);
      if (!o || !e || (o.art !== "kaefigblock" && o.art !== "voliere")) continue;
      aus.push({ teil: t, rechteck: k.rechteck, front: objektFront({ front: e.front, rechteck: k.rechteck }), belegt: o.art === "voliere" ? (o.tier ? 1 : 0) : (o.kaefige?.length ?? 0) });
    }
  }
  return aus;
}

/**
 * Alles, was im Entwurf Platz einnimmt – für die Prüfung beim Verschieben und das Auswahlrechteck: jede Grundplatte (geht
 * mit ihrer Reihe), eingesetzte Teile, Flächen und die Volieren im Volierenbereich (gehen mit ihrem Bereich).
 */
function planKoerper(halle: Halle, plan: NonNullable<Daten["plan"]>): PlanKoerper[] {
  const k: PlanKoerper[] = [];
  for (const reihe of plan.reihen) {
    const { aufPlatte } = reihenLage(halle, reihe);
    const da = plattenDa(halle, reihe);
    reihe.platten.forEach((pl, i) => da[i] && k.push({ teil: { art: "platte", reihe: reihe.nr, i }, name: `Grundplatte ${i + 1} in R${reihe.nr}`, rechteck: aufPlatte(pl.rechteck, i) }));
  }
  for (const o of plan.objekte) {
    const l = objektLage(halle, o);
    if (l) k.push({ teil: { art: "objekt", id: o.id }, name: o.name, rechteck: l.lage, ...(istMoebel(o) ? { moebel: true } : {}) });
  }
  // Freie Bereiche und Eingänge sind Hindernisse (nicht füreinander); in den Volierenbereich gehören die Volieren. In freien
  // Bereichen dürfen Tische und Bänke stehen.
  halle.flaechen.forEach((f, i) => k.push({ teil: { art: "flaeche", i }, name: f.name, rechteck: flaecheRechteck(f), ...(f.art === "volieren" ? { nurGrenze: true } : { flaeche: true, ...(f.art === "sperre" ? { freiBereich: true } : {}) }) }));
  // Tische und Bänke stehen frei, auch im Gang vor den Käfigen (Rückmeldung 14.11.2026).
  // Vor Eingängen und Notausgängen bleibt ein Gang frei (in Fluchtrichtung, so breit wie der Ausgang): keine Reihe, Platte
  // oder eingesetztes Teil dort hinein. Seitlich daneben darf man bis an den Ausgang heran.
  for (const f of halle.flaechen) {
    if (f.art !== "eingang") continue;
    const z = eingangsGang(halle, f);
    const x1 = Math.max(0, z.x), y1 = Math.max(0, z.y);
    const x2 = Math.min(halle.breite, z.x + z.b), y2 = Math.min(halle.laenge, z.y + z.h);
    // Tische und Bänke dürfen hinein (der Plan gibt einen Hinweis), Käfige nicht.
    k.push({ teil: null, name: `Gang vor „${f.name}“`, rechteck: { x: x1, y: y1, b: x2 - x1, h: y2 - y1 }, flaeche: true, fluchtweg: true });
  }
  for (const v of plan.volieren) {
    // Im festen Plan stehen die Volieren auf ihren festen Plätzen (sie gehen nicht mit ihrem Bereich mit).
    const i = plan.fest ? -1 : halle.flaechen.findIndex((f) => f.art === "volieren" && innen(v.rechteck, flaecheRechteck(f)));
    k.push({ teil: i >= 0 ? { art: "flaeche", i } : null, name: v.nr ? `Voliere Nr. ${v.nr}` : "Voliere", rechteck: v.rechteck });
  }
  return k;
}

/** Übersicht: welche Sparte in welchen Reihen steht (gestellt wird streng in Katalogfolge, ohne Vorgaben je Sparte). */
function SpartenReihen({ plan }: { plan: NonNullable<Daten["plan"]> }) {
  const zaehler = new Map<string, { anzahl: number; reihen: Set<number> }>();
  for (const r of plan.reihen)
    for (const k of r.kaefige) {
      const z = zaehler.get(k.sparte ?? "") ?? { anzahl: 0, reihen: new Set<number>() };
      z.anzahl++;
      z.reihen.add(r.nr);
      zaehler.set(k.sparte ?? "", z);
    }
  for (const k of [...plan.volieren, ...plan.nichtPlatziert, ...plan.objekte.flatMap((o) => (o.tier ? [o.tier] : []))]) {
    const z = zaehler.get(k.sparte ?? "") ?? { anzahl: 0, reihen: new Set<number>() };
    z.anzahl++;
    zaehler.set(k.sparte ?? "", z);
  }
  const sparten = [...zaehler.keys()].filter(Boolean);
  if (sparten.length === 0) return null;
  const bereich = (r: Set<number>) => {
    const l = [...r].sort((a, b) => a - b);
    return l.length ? (l.length === 1 ? `R${l[0]}` : `R${l[0]}–R${l.at(-1)}`) : "–";
  };
  return (
    <details className="tabellen-rahmen nicht-drucken group overflow-hidden rounded-xl border border-linie bg-weiss">
      <summary className="flex min-h-10 cursor-pointer items-center gap-2 px-4 py-2 text-sm font-semibold">
        Sparten in den Reihen
        <span className="font-normal text-grau">{sparten.length}</span>
      </summary>
      <div className="overflow-x-auto border-t border-linie">
      <table className="tabelle">
        <thead>
          <tr>
            <th scope="col">Sparte</th>
            <th scope="col" className="text-right">Tiere</th>
            <th scope="col">steht in</th>
          </tr>
        </thead>
        <tbody>
          {sparten.map((sp) => {
            const z = zaehler.get(sp)!;
            return (
              <tr key={sp}>
                <td className="font-semibold text-tinte">{sp}</td>
                <td className="text-right tabular-nums">{z.anzahl}</td>
                <td>{bereich(z.reihen)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </details>
  );
}

const EINTRAG_STATUS: Record<string, string> = { gemeldet: "gemeldet", katalogisiert: "im Katalog", eingeliefert: "eingeliefert", fehlt: "fehlt", ausgesetzt: "ausgegeben" };

/** Angaben zu einem angeklickten Käfig: Tier, Züchter, Preisrichter, Status, Bewertung und Preise. */
function KaefigInfo({ schauId, id, schliessen }: { schauId: number; id: number; schliessen: () => void }) {
  const q = trpc.katalog.kaefigInfo.useQuery({ schauId, id });
  const d = q.data;
  return (
    <div role="dialog" aria-label="Angaben zum Käfig" className="nicht-drucken absolute right-3 top-3 z-10 w-80 max-w-[calc(100%-1.5rem)] rounded-lg border border-linie-stark bg-weiss p-4 shadow-xl">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-sans text-base font-semibold">{d ? (d.nr ? `Käfig ${d.nr}` : "Käfig ohne Nummer") : "Käfig"}</h3>
        <Knopf variante="leise" className="ml-auto min-h-8 px-2" onClick={schliessen} aria-label="Angaben schließen">
          ×
        </Knopf>
      </div>
      {q.error ? (
        <Hinweis ton="fehler">{fehlerText(q.error)}</Hinweis>
      ) : !d ? (
        <Laden />
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-grau">Tier</dt>
          <dd className="font-semibold">{d.tier}</dd>
          <dt className="text-grau">Klasse</dt>
          <dd>
            {d.geschlecht} {d.alter}
            {d.art !== "einzeltier" ? ` (${MELDEART_LABEL[d.art as keyof typeof MELDEART_LABEL] ?? d.art})` : ""}
            {d.jugend ? ", Jugend" : ""}
          </dd>
          <dt className="text-grau">Sparte</dt>
          <dd>{d.sparte || "–"}</dd>
          {d.ringnummern && (
            <>
              <dt className="text-grau">Ring</dt>
              <dd>{d.ringnummern}</dd>
            </>
          )}
          <dt className="text-grau">Käfig</dt>
          <dd>
            {d.kaefig ?? "–"}
            {d.kaefigGewaehlt ? " (gewählt)" : ""}
          </dd>
          <dt className="text-grau">Züchter</dt>
          <dd>
            <Link to={`/schau/${schauId}/meldungen/${d.meldungId}`} className="font-semibold text-tinte no-underline hover:text-band">
              {d.zuechter.name}
            </Link>
            {[d.zuechter.ort, d.zuechter.verein].filter(Boolean).length > 0 && <span className="block text-grau">{[d.zuechter.ort, d.zuechter.verein].filter(Boolean).join(", ")}</span>}
            {d.zuechter.gesperrt && <span className="block text-kamm">Löschwunsch – nicht veröffentlichen</span>}
          </dd>
          <dt className="text-grau">Preisrichter</dt>
          <dd>{d.preisrichter ?? "noch nicht eingeteilt"}</dd>
          <dt className="text-grau">Status</dt>
          <dd>
            {d.meldungStatus === "offen" ? "Meldung offen" : (EINTRAG_STATUS[d.status] ?? d.status)}
            {d.verkauft ? ", verkauft" : ""}
          </dd>
          {d.bewertung && (
            <>
              <dt className="text-grau">Bewertung</dt>
              <dd>
                {d.bewertung}
                {d.bewertetVon ? ` (${d.bewertetVon})` : ""}
              </dd>
            </>
          )}
          {d.preise.length > 0 && (
            <>
              <dt className="text-grau">Preise</dt>
              <dd>{d.preise.join(", ")}</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

/**
 * Darf ein eingesetztes Teil (Block, Voliere, Tisch, Bank) gedreht werden? Es dreht um seine linke vordere Ecke; danach
 * nicht auf einer Freifläche, im Gang vor einem Ausgang (Käfige) oder auf anderen Teilen – wie beim Verschieben.
 */
function drehPruefung(halle: Halle, plan: NonNullable<Daten["plan"]>, t: HallenTeil): VerschiebePruefung {
  if (t.art !== "objekt") return { ok: true };
  const koerper = planKoerper(halle, plan);
  const k = koerper.find((x) => x.teil?.art === "objekt" && x.teil.id === t.id);
  if (!k) return { ok: true };
  return pruefeLage(halle, koerper, t, { x: k.rechteck.x, y: k.rechteck.y, b: k.rechteck.h, h: k.rechteck.b });
}

/**
 * Schalter „Automatisch planen“: an = die Software stellt die Käfige (und stellt sie bei Änderungen neu), aus = der Plan ist
 * festgeschrieben, nichts rückt von selbst. Ohne `umschalten` nur die Anzeige.
 */
function AutomatikSchalter({ an, umschalten, festAm }: { an: boolean; umschalten?: () => void; festAm: string | null }) {
  return (
    <label className={`inline-flex items-center gap-2 ${umschalten ? "cursor-pointer" : ""}`}>
      <input type="checkbox" role="switch" aria-label="Automatisch planen" checked={an} disabled={!umschalten} onChange={() => umschalten?.()} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-5 w-9 shrink-0 rounded-full bg-feldrand transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-weiss after:shadow-sm after:transition-transform peer-checked:bg-band peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-band/40 peer-focus-visible:ring-offset-1 peer-disabled:opacity-60"
      />
      <span>
        Automatisch planen: <span className="font-semibold text-tinte">{an ? "an" : "aus"}</span>
        {!an && festAm && <span className="text-grau"> · fest seit {festAm}</span>}
      </span>
    </label>
  );
}

/** Teil oder Reihe um 90° drehen bzw. Fläche Breite und Tiefe tauschen. */
function gedreht(h: Halle, z: HallenTeil): Halle {
  const v = vollstaendig(h);
  // Ein Käfigblock dreht seine Front mit (in vier Richtungen: Front zur einen, dann zur anderen langen Seite).
  if (z.art === "objekt")
    return {
      ...v,
      objekte: v.objekte!.map((o) => {
        if (o.id !== z.id) return o;
        const front = o.art === "kaefigblock" || o.art === "voliere" ? { front: dreheBlick(objektFront({ front: o.front, rechteck: o.drehung === 90 ? { x: 0, y: 0, b: 1, h: 2 } : { x: 0, y: 0, b: 2, h: 1 } }), 90) } : {};
        return { ...o, drehung: o.drehung === 90 ? 0 : 90, ...front };
      }),
    };
  if (z.art === "flaeche") return { ...v, flaechen: v.flaechen.map((f, j) => (j === z.i ? { ...f, breite: f.tiefe, tiefe: f.breite } : f)) };
  if (z.art === "platte") {
    const alt = v.plattenVersatz!.find((x) => x.reihe === z.reihe && x.platte === z.i) ?? { reihe: z.reihe, platte: z.i, dx: 0, dy: 0 };
    return mitPlattenVersatz(v, { ...alt, drehung: (((alt.drehung ?? 0) + 90) % 360) as Drehung });
  }
  // Reihe: um 90° weiter (um die Mitte ihrer Käfige), viermal = wieder wie vorher.
  const alt = v.reihenVersatz!.find((x) => x.nr === z.nr) ?? { nr: z.nr, dx: 0, dy: 0 };
  return mitVersatz(v, { ...alt, drehung: (((alt.drehung ?? 0) + 90) % 360) as Drehung });
}

/**
 * Der Plan als Zeichnung (Maße in cm), von oben gesehen. Ist die Halle länger als breit, liegt sie quer – passt besser
 * aufs Blatt. Im Bearbeiten-Modus lassen sich Flächen, eingesetzte Volieren und Käfigblöcke sowie ganze Reihen mit der
 * Maus (oder den Pfeiltasten) verschieben und drehen. Farben als SVG-Attribute (die CSP der App erlaubt keine Inline-Styles).
 */
/**
 * Käfigplätze, auf die sich ein Tier versetzen lässt: Reihenplätze (belegt und frei, auch auf angebauten Platten) und die Plätze
 * der Käfigblöcke, je mit ihrer Fläche in der Halle (bei Etagen der Streifen der Etage).
 */
function zielPlaetze(plan: Plan, halle: Halle): { schluessel: string; platz: KaefigPlatz; typ: string; tierId: number | null; nr: string | null; q: Rechteck }[] {
  const aus: ReturnType<typeof zielPlaetze> = [];
  for (const r of plan.reihen) {
    for (const k of r.kaefige) aus.push({ schluessel: `k${k.id}`, platz: { art: "reihe", reihe: r.nr, x: k.x, y: k.y, ...(k.etage ? { etage: k.etage } : {}) }, typ: k.typ, tierId: k.id, nr: k.nr, q: k.zeichnung ?? k.rechteck });
    (r.freiePlaetze ?? []).forEach((f, i) => {
      aus.push({ schluessel: `f${r.nr}-${i}`, platz: { art: "reihe", reihe: r.nr, x: f.x, y: f.y, ...(f.etage ? { etage: f.etage } : {}) }, typ: f.typ, tierId: null, nr: null, q: f.zeichnung ?? f.rechteck });
    });
  }
  for (const o of plan.objekte) {
    if (o.art !== "kaefigblock" || !o.typ || !o.plaetze) continue;
    const et = etagenVon(o.typ, halle);
    for (let i = 0; i < o.plaetze; i++) {
      const k = o.kaefige?.find((x) => x.blockPlatz === i);
      const b = blockPlatz(o.rechteck, o.plaetze, et, i);
      const q = k ? (k.zeichnung ?? k.rechteck) : et > 1 ? etagenStreifen(b.rechteck, b.etage, et, objektFront(o)) : b.rechteck;
      aus.push({ schluessel: `b${o.id}-${i}`, platz: { art: "block", objektId: o.id, i }, typ: o.typ, tierId: k?.id ?? null, nr: k?.nr ?? null, q });
    }
  }
  return aus;
}

function PlanBild({
  halle,
  plan,
  richterIndex,
  bearbeiten,
  auswahl,
  waehlen,
  aendern,
  voll = false,
  klein = false,
  zeigeKaefig,
  markiert: markierterKaefig = null,
  mehrfach = false,
  melden,
  zoom = 1,
  pfeilRef,
  zeichnen = null,
  gezeichnet,
  anWand,
  zielWahl = null,
}: {
  /**
   * Tier versetzen: über jedem Käfig eine Klickfläche (gleiche Größe hervorgehoben); ein Klick wählt das Ziel, ein Käfig
   * anderer Größe meldet nur. Sonst lässt sich in dieser Zeit nichts greifen.
   */
  zielWahl?: { tierId: number; typ: KaefigTyp; waehlen: (p: KaefigPlatz) => void; falsch: () => void } | null;
  /** Werkzeug „Fläche aufziehen“: Ziehen auf der Halle zieht eine neue Fläche auf (statt zu wählen). */
  zeichnen?: HallenFlaeche["art"] | null;
  gezeichnet?: (q: Rechteck, klick: boolean) => void;
  /** Eine Doppelreihe wurde an eine Wand gezogen (dort steht noch keine Einzelreihe): Einzelreihe stellen? */
  anWand?: (nr: number, seite: WandSeite) => void;
  /** Zoom im Editor (1 = ganze Halle in der Breite); die Zeichnung scrollt. */
  zoom?: number;
  /** Pfeiltasten von außerhalb der Zeichnung: verschieben die Auswahl (true = behandelt). */
  pfeilRef?: React.MutableRefObject<((e: KeyboardEvent) => boolean) | null>;
  /** Schalter „Mehrfachauswahl“: Antippen nimmt ein Teil in die Auswahl auf oder heraus (wie Umschalt-Klick). */
  mehrfach?: boolean;
  /** Meldung, wenn eine Verschiebung nicht geht (Hallenwand, anderes Teil). */
  melden?: (text: string) => void;
  /** Angeklickter Käfig (hervorgehoben). */
  markiert?: number | null;
  /** Vollansicht: Zeichnung füllt die verfügbare Höhe. */
  voll?: boolean;
  /** Vorschaubild (Stellvorschläge): ganze Halle in der Breite der Karte, ohne Mindestbreite. */
  klein?: boolean;
  /** Klick auf einen Käfig (außerhalb des Bearbeitens): Angaben anzeigen. */
  zeigeKaefig?: (id: number) => void;
  /** Entwurf der Halle (lokal sofort aktuell). */
  halle: Halle;
  plan: NonNullable<Daten["plan"]>;
  richterIndex: Map<number, number>;
  bearbeiten: boolean;
  /** Gewählte Teile (eins oder mehrere). */
  auswahl: Ziel[];
  waehlen: (z: Ziel[]) => void;
  aendern: Aendern;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const kastenRef = useRef<HTMLDivElement>(null);
  // Zoom: die Mitte des sichtbaren Ausschnitts bleibt stehen.
  const zoomVorher = useRef(zoom);
  useLayoutEffect(() => {
    const k = kastenRef.current;
    const alt = zoomVorher.current;
    zoomVorher.current = zoom;
    if (!k || alt === zoom) return;
    const f = zoom / alt;
    k.scrollLeft = (k.scrollLeft + k.clientWidth / 2) * f - k.clientWidth / 2;
    k.scrollTop = (k.scrollTop + k.clientHeight / 2) * f - k.clientHeight / 2;
  }, [zoom]);
  const [zug, setZugZustand] = useState<Zug | null>(null);
  const [rahmen, setRahmenZustand] = useState<Rahmen | null>(null);
  // Zusätzlich als Ref: Bewegen und Loslassen können schneller kommen, als React neu zeichnet – Loslassen liest dann den
  // neuesten Stand, nicht den der letzten Zeichnung.
  const zugRef = useRef<Zug | null>(null);
  const rahmenRef = useRef<Rahmen | null>(null);
  const setZug = (z: Zug | null) => {
    zugRef.current = z;
    setZugZustand(z);
  };
  const setRahmen = (r: Rahmen | null) => {
    rahmenRef.current = r;
    setRahmenZustand(r);
  };
  /** Zuletzt gegriffenes Teil – für den Doppelklick (der beim festgehaltenen Zeiger am SVG ankommt). */
  const gegriffen = useRef<Ziel | null>(null);
  /**
   * Zeitpunkt des letzten Greifens: ein Fokus kurz danach kam vom Zeiger – die Auswahl hat `greifen`/`loslassen` schon
   * gesetzt, der Fokus ändert sie nicht noch einmal (am Tablet kommt der Fokus erst nach dem Loslassen).
   */
  const gegriffenAm = useRef(0);
  useEffect(() => {
    if (!zug && !rahmen) return;
    // Esc während des Ziehens: Zug bzw. Rahmen abbrechen, nichts speichern – die Auswahl bleibt.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setZug(null);
      setRahmen(null);
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [!!zug, !!rahmen]); // eslint-disable-line react-hooks/exhaustive-deps
  const koerper = useMemo(() => (bearbeiten ? planKoerper(halle, plan) : []), [bearbeiten, halle, plan]);
  const pruefen = (ziele: HallenTeil[], dx: number, dy: number): VerschiebePruefung => pruefeVerschiebung(halle, koerper, ziele, dx, dy);
  const quer = halle.laenge > halle.breite;
  const W = quer ? halle.laenge : halle.breite;
  const H = quer ? halle.breite : halle.laenge;
  /** Rechteck aus Hallenkoordinaten (x entlang der Breite, y entlang der Länge) in Zeichenkoordinaten. */
  const r = (x: number, y: number, b: number, t: number) => (quer ? { x: y, y: x, width: t, height: b } : { x, y, width: b, height: t });
  const rr = (q: Rechteck) => r(q.x, q.y, q.b, q.h);
  const rand = Math.max(W, H) * 0.004;
  const schrift = Math.max(W, H) * 0.014;
  /** Linie wie mit dem Zeichenstift: feste Stärke in Bildpunkten, gleich bei kleiner und großer Halle. */
  const strich = (px: number) => ({ strokeWidth: px, vectorEffect: "non-scaling-stroke" as const });
  /**
   * Wände eines Käfigs von oben (Rückmeldung: „die Rückwände erkennen, damit man sie immer korrekt herum setzt“): Rückwand kräftig,
   * Seitenwände fein, offene Front hell gestrichelt. `q` in Hallenkoordinaten (wie gezeichnet, auch beim Ziehen).
   */
  const waende = (q: Rechteck, front: Blick, key?: string) => {
    const k = kaefigKanten(q, front);
    const linie = (st: Strecke, farbe: string, px: number, dash?: string) => {
      const a = quer ? { x: st.y1, y: st.x1 } : { x: st.x1, y: st.y1 };
      const b = quer ? { x: st.y2, y: st.x2 } : { x: st.x2, y: st.y2 };
      return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={farbe} {...strich(px)} strokeDasharray={dash} strokeLinecap="square" />;
    };
    return (
      <g key={key} pointerEvents="none">
        {linie(k.front, BAU.kaefigwand.front, 1, `${rand * 0.7} ${rand * 0.5}`)}
        {linie(k.seiten[0], BAU.kaefigwand.seite, 1.2)}
        {linie(k.seiten[1], BAU.kaefigwand.seite, 1.2)}
        {linie(k.rueck, BAU.kaefigwand.rueck, 3)}
      </g>
    );
  };
  /** Wandstärke in cm, außen an die Halle gesetzt (Innenmaße bleiben). */
  const wand = Math.min(24, Math.max(12, Math.max(W, H) * 0.008));

  /** Mausposition in Hallenkoordinaten (cm). */
  const hallenPunkt = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return quer ? { x: p.y, y: p.x } : { x: p.x, y: p.y };
  };
  /** Versatz eines Elements während des Ziehens (für die Vorschau). */
  const versatz = (z: Ziel, modus: Zug["modus"] = "verschieben") => (zug && zug.modus === modus && zug.ziele.some((a) => gleich(a, z)) ? { dx: zug.dx, dy: zug.dy } : { dx: 0, dy: 0 });
  /** Lage einer Reihe und ihrer Grundplatten im Entwurf (siehe reihenLage), dazu das laufende Ziehen von Reihe und Platten. */
  const reiheImEntwurf = (reihe: Reihe) => {
    const lage = reihenLage(halle, reihe);
    const vr = versatz({ art: "reihe", nr: reihe.nr });
    const verschoben = (q: Rechteck, _ziel?: Ziel) => {
      const d = lage.inReihe(q);
      return { ...d, x: d.x + vr.dx, y: d.y + vr.dy };
    };
    // Einzelne Grundplatte: Entwurf gegenüber dem gerechneten Plan (Versatz, Drehung um ihre Mitte) und Ziehen.
    const aufPlatte = (q: Rechteck, i: number | undefined) => {
      const d = lage.aufPlatte(q, i);
      const pv = i != null && reihe.platten[i] ? versatz({ art: "platte", reihe: reihe.nr, i }) : { dx: 0, dy: 0 };
      return { ...d, x: d.x + vr.dx + pv.dx, y: d.y + vr.dy + pv.dy };
    };
    // Entfernte Platten (Platzhalter im festen Plan, eben im Entwurf entfernte) zeichnet und greift man nicht.
    const da = plattenDa(halle, reihe);
    return { lage, verschoben, aufPlatte, da };
  };
  const verschoben = (q: Rechteck, z: Ziel) => {
    const v = versatz(z);
    return { ...q, x: q.x + v.dx, y: q.y + v.dy };
  };

  /** Umschalt-, Strg- oder Cmd-Klick bzw. Schalter „Mehrfachauswahl“: Auswahl ergänzen statt ersetzen. */
  const ergaenzen = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => mehrfach || e.shiftKey || e.ctrlKey || e.metaKey;
  const greifen = (z: Ziel, modus: Zug["modus"] = "verschieben") => (e: React.PointerEvent) => {
    // Beim Aufziehen einer Fläche greift man nichts (das Ziehen gehört der Zeichnung).
    if (!bearbeiten || zeichnen) return;
    e.stopPropagation();
    // Nur die Haupttaste (bzw. ein Finger) – und nicht, solange schon ein Zug oder Rahmen läuft (zweiter Finger).
    if (e.button !== 0 || zugRef.current || rahmenRef.current) return;
    gegriffenAm.current = Date.now();
    gegriffen.current = z;
    svgRef.current?.setPointerCapture(e.pointerId);
    const start = { clientX: e.clientX, clientY: e.clientY };
    if (modus === "groesse") return setZug({ ziele: zuTeilen([z], plan), modus, start, dx: 0, dy: 0, konflikt: null, zeiger: e.pointerId });
    const drin = auswahl.some((a) => gleich(a, z));
    const mitReihe = gehoertDazu(z);
    const dazu = ergaenzen(e);
    // Gegriffen wird immer die ganze Auswahl. Ein Klick ohne Bewegung entscheidet beim Loslassen: mit Umschalt usw. nimmt er
    // ein schon gewähltes Teil heraus, sonst wählt er in einer Gruppe nur noch dieses Teil.
    let ziele = auswahl;
    let klick: Zug["klick"];
    if (mitReihe && !drin) {
      if (!dazu) klick = { art: "nurDieses", ziel: z };
    } else if (!drin) {
      ziele = dazu ? [...auswahl, z] : [z];
      waehlen(ziele);
    } else if (dazu) klick = { art: "heraus", ziel: z };
    else if (auswahl.length > 1) klick = { art: "nurDieses", ziel: z };
    setZug({ ziele: zuTeilen(ziele, plan), modus, start, dx: 0, dy: 0, konflikt: null, klick, zeiger: e.pointerId });
  };
  const ziehen = (e: React.PointerEvent) => {
    const rahmen = rahmenRef.current, zug = zugRef.current;
    if (rahmen) return rahmen.zeiger === e.pointerId ? setRahmen({ ...rahmen, jetzt: hallenPunkt(e) }) : undefined;
    if (!zug || zug.zeiger !== e.pointerId) return;
    const p = hallenPunkt(e);
    const s = hallenPunkt(zug.start);
    let dx = raster(p.x - s.x), dy = raster(p.y - s.y);
    let pr: VerschiebePruefung = { ok: true };
    if (zug.modus === "verschieben") {
      // Bündig einrasten: liegt eine Kante weniger als ein Raster neben einer anderen (oder der Wand), rückt sie daran –
      // so bleibt keine Lücke von ein paar Zentimetern, auch wenn die Nachbarkante nicht auf dem Raster liegt.
      const w = anKantenEinrasten(halle, koerper, zug.ziele, dx, dy, RASTER);
      const prW = pruefen(zug.ziele, w.dx, w.dy);
      if (prW.ok || !pruefen(zug.ziele, dx, dy).ok) ({ dx, dy } = w);
      pr = pruefen(zug.ziele, dx, dy);
    }
    if (dx === zug.dx && dy === zug.dy) return;
    setZug({ ...zug, dx, dy, konflikt: pr.ok ? null : pr.meldung });
  };
  const rahmenFertig = (rh: Rahmen, e: { clientX: number; clientY: number }) => {
    if (zeichnen) {
      const klick = Math.hypot(e.clientX - rh.startBild.clientX, e.clientY - rh.startBild.clientY) < 8;
      gezeichnet?.({ x: Math.min(rh.start.x, rh.jetzt.x), y: Math.min(rh.start.y, rh.jetzt.y), b: Math.abs(rh.jetzt.x - rh.start.x), h: Math.abs(rh.jetzt.y - rh.start.y) }, klick);
      return;
    }
    // Kaum bewegt: ein Klick auf freie Fläche – hebt die Auswahl auf (mit Umschalt usw. bleibt sie).
    if (Math.hypot(e.clientX - rh.startBild.clientX, e.clientY - rh.startBild.clientY) < 5) {
      if (!rh.dazu) waehlen([]);
      return;
    }
    const q: Rechteck = { x: Math.min(rh.start.x, rh.jetzt.x), y: Math.min(rh.start.y, rh.jetzt.y), b: Math.abs(rh.jetzt.x - rh.start.x), h: Math.abs(rh.jetzt.y - rh.start.y) };
    // Was ganz im Rechteck liegt. Liegen alle Grundplatten einer Reihe darin, wird die ganze Reihe gewählt.
    // Flächen nur über ihren eigenen Umriss (nicht über die Volieren darin).
    const drin = koerper.filter((k) => k.teil && (k.teil.art !== "flaeche" || k.nurGrenze || k.flaeche) && innen(k.rechteck, q)).map((k) => k.teil!);
    const gefunden: Ziel[] = [];
    for (const reihe of plan.reihen) {
      const platten = drin.filter((t): t is Extract<Ziel, { art: "platte" }> => t.art === "platte" && t.reihe === reihe.nr);
      if (platten.length && platten.length === plattenDa(halle, reihe).filter(Boolean).length) gefunden.push({ art: "reihe", nr: reihe.nr });
      else gefunden.push(...platten);
    }
    gefunden.push(...drin.filter((t) => t.art === "objekt" || t.art === "flaeche"));
    waehlen(rh.dazu ? [...auswahl, ...gefunden.filter((t) => !auswahl.some((a) => gleich(a, t)) && !gehoertDazu(t))] : gefunden);
  };
  const loslassen = (e: React.PointerEvent) => {
    const rahmen = rahmenRef.current, z = zugRef.current;
    if (rahmen) {
      if (rahmen.zeiger !== e.pointerId) return;
      setRahmen(null);
      return rahmenFertig(rahmen, e);
    }
    if (!z || z.zeiger !== e.pointerId) return;
    setZug(null);
    if (!z.dx && !z.dy) {
      if (z.klick?.art === "heraus") waehlen(auswahl.filter((a) => !gleich(a, z.klick!.ziel)));
      else if (z.klick?.art === "nurDieses") waehlen([z.klick.ziel]);
      return;
    }
    if (z.modus === "groesse") {
      const ziel = z.ziele[0];
      if (ziel?.art === "flaeche") aendern((h) => groesseAendern(h, ziel.i, z.dx, z.dy));
      return;
    }
    // Eine ganze Doppelreihe an eine Wand gezogen (ungedreht, dort noch keine Einzelreihe): Einzelreihe stellen, die
    // übrigen Reihen ordnen sich neu (Rückfrage beim Plan). Sonst wie immer.
    const wand = anWandGezogen(z.ziele, z.dx, z.dy);
    if (wand && anWand) return anWand(wand.nr, wand.seite);
    // Neu prüfen (der Plan kann sich während des Ziehens geändert haben). Konflikt: die ganze Auswahl bleibt stehen
    // (springt zurück), mit Meldung.
    verschiebeAuswahl(z.ziele, z.dx, z.dy);
  };
  const anWandGezogen = (ziele: HallenTeil[], dx: number, dy: number): { nr: number; seite: WandSeite } | null => {
    const t = ziele.length === 1 ? ziele[0]! : null;
    if (t?.art !== "reihe") return null;
    const reihe = plan.reihen.find((x) => x.nr === t.nr);
    if (reihe?.art !== "doppel" || reihe.drehung || (halle.reihenVersatz ?? []).some((v) => v.nr === t.nr && v.drehung)) return null;
    const q = koerper.filter((k) => k.teil?.art === "platte" && k.teil.reihe === t.nr).map((k) => k.rechteck);
    if (!q.length) return null;
    const x = Math.min(...q.map((a) => a.x)), y = Math.min(...q.map((a) => a.y));
    const hull = { x: x + dx, y: y + dy, b: Math.max(...q.map((a) => a.x + a.b)) - x, h: Math.max(...q.map((a) => a.y + a.h)) - y };
    // „An der Wand“: näher als 75 cm (bzw. ein halber Gang) – genau bis an die Wand zu ziehen ist am Tablet schwer.
    const seite = wandSeiteVon(halle, hull, Math.min(75, halle.gang / 2));
    if (!seite) return null;
    const schon = halle.wandreihen && halle.wandreiheSeite !== (seite === "anfang" ? "ende" : "anfang");
    return schon ? null : { nr: t.nr, seite };
  };
  /**
   * Prüfen und dann als eine Änderung speichern; bei einem Konflikt bleibt alles stehen, mit Meldung. Pfeiltasten
   * (einrasten): stieße der volle Schritt an, rückt die Auswahl stattdessen bündig heran (in Richtung der Taste).
   */
  const verschiebeAuswahl = (ziele: HallenTeil[], dx: number, dy: number, einrasten = false) => {
    let pr = pruefen(ziele, dx, dy);
    if (!pr.ok && einrasten) {
      const w = anKantenEinrasten(halle, koerper, ziele, dx, dy, RASTER);
      // In Richtung der Taste weiter (auch kürzer); quer dazu nur ein kleines Einrasten in die Flucht.
      const gleicheRichtung = (a: number, b: number) => (a === 0 ? Math.abs(b) < RASTER : Math.sign(a) === Math.sign(b));
      if (gleicheRichtung(dx, w.dx) && gleicheRichtung(dy, w.dy) && pruefen(ziele, w.dx, w.dy).ok) {
        ({ dx, dy } = w);
        pr = { ok: true };
      }
    }
    if (!pr.ok) return melden?.(pr.meldung);
    // Der Entwurf übernimmt die neue Lage sofort; gespeichert wird im Hintergrund – eine Änderung für die ganze Gruppe.
    // Landet ein Käfig an einer Wand, dreht ihn die Software so, dass die Rückwand an der Wand liegt (ein Schritt).
    let gedreht = 0;
    aendern(
      (h) => {
        const v = verschiebeTeile(vollstaendig(h), ziele, dx, dy);
        const d = wandAusrichtung(v, wandKandidatenImEntwurf(v, plan, ziele));
        gedreht = d.length;
        return wandDrehungenAnwenden(v, d);
      },
      { was: "Verschieben", festschreiben: ziele.some((t) => t.art === "reihe" || t.art === "platte") },
    );
    if (gedreht) melden?.(`An der Wand gedreht: Rückwand zur Wand (${gedreht === 1 ? "1 Teil" : `${gedreht} Teile`}).`);
  };
  /**
   * Gehört schon zur Auswahl, ohne selbst gewählt zu sein: Grundplatte einer gewählten Reihe, freier Platz auf einer
   * gewählten Platte oder in einer gewählten Reihe (geht mit ihr).
   */
  const gehoertDazu = (z: Ziel) => {
    if (z.art === "platte") return auswahl.some((a) => a.art === "reihe" && a.nr === z.reihe);
    if (z.art !== "platz") return false;
    const f = freierPlatz(plan, z);
    return auswahl.some((a) => (a.art === "reihe" && a.nr === z.reihe) || (a.art === "platte" && a.reihe === z.reihe && f?.platte === a.i));
  };
  const gewaehlt = (z: Ziel) => auswahl.some((a) => gleich(a, z)) || gehoertDazu(z);
  if (pfeilRef)
    pfeilRef.current = (e) => {
      if (!bearbeiten || !auswahl.length) return false;
      const weg = pfeilWeg(e);
      if (!weg) return false;
      verschiebeAuswahl(zuTeilen(auswahl, plan), weg[0], weg[1], true);
      return true;
    };
  /** Pfeiltaste als Weg in der Halle (cm); in der Zeichnung liegt die Halle ggf. quer. */
  const pfeilWeg = (e: { key: string; shiftKey: boolean }): [number, number] | null => {
    const s = e.shiftKey ? 50 : RASTER;
    const d = ({ ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] } as Record<string, [number, number]>)[e.key];
    if (!d) return null;
    return quer ? [d[1], d[0]] : [d[0], d[1]];
  };
  /** Drehen per Doppelklick: das gegriffene Teil (ein freier Platz dreht seine Platte). */
  const drehen = (z: Ziel) => {
    const t = zuTeilen([z], plan)[0];
    if (!t) return;
    const pr = drehPruefung(halle, plan, t);
    if (!pr.ok) return melden?.(pr.meldung);
    aendern((h) => gedreht(h, t), { was: "Drehen", festschreiben: t.art === "reihe" || t.art === "platte" });
  };
  /**
   * Pfeiltasten am Teil mit dem Fokus: gehört es zur Auswahl (auch als Platte einer gewählten Reihe), rückt die ganze
   * Auswahl; sonst wird es gewählt und rückt allein.
   */
  const tasten = (z: Ziel) => (e: React.KeyboardEvent) => {
    if (!bearbeiten) return;
    const weg = pfeilWeg(e);
    if (weg) {
      e.preventDefault();
      e.stopPropagation();
      if (gewaehlt(z)) return verschiebeAuswahl(zuTeilen(auswahl, plan), weg[0], weg[1], true);
      waehlen([z]);
      verschiebeAuswahl(zuTeilen([z], plan), weg[0], weg[1], true);
    }
    // R, Entf usw. übernimmt die Werkzeugleiste (für die ganze Auswahl).
  };
  const bedienbar = (z: Ziel, name: string) =>
    bearbeiten
      ? {
          onPointerDown: greifen(z),
          onKeyDown: tasten(z),
          // Mit Tab hierher: dieses Teil wählen – außer es gehört schon zur Auswahl (dann bleibt die Gruppe).
          onFocus: () => {
            if (Date.now() - gegriffenAm.current > 1500 && !gewaehlt(z)) waehlen([z]);
          },
          tabIndex: 0,
          role: "button",
          "aria-label": `${name} – Pfeiltasten verschieben, R dreht, Entf entfernt`,
          "aria-pressed": auswahl.some((a) => gleich(a, z)),
          className: "cursor-move focus:outline-none",
        }
      : {};
  const markiert = (z: Ziel) => bearbeiten && auswahl.some((a) => gleich(a, z));

  const kaefig = (k: PlanKaefig, lage?: Rechteck) => {
    const i = k.preisrichterId != null ? (richterIndex.get(k.preisrichterId) ?? 0) : -1;
    const g = rr(lage ?? k.zeichnung ?? k.rechteck);
    const gr = Math.min(g.width, g.height) * 0.42;
    return (
      <g
        key={k.id}
        {...(zeigeKaefig
          ? {
              onClick: () => zeigeKaefig(k.id),
              onKeyDown: (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), zeigeKaefig(k.id)),
              tabIndex: 0,
              role: "button",
              "aria-label": `Käfig ${k.nr ?? "ohne Nummer"}: ${k.rasse} – Angaben anzeigen`,
              className: "cursor-pointer focus:outline-none",
            }
          : {})}
      >
        <rect {...g} fill="#ffffff" stroke="none" />
        <rect {...g} fill={i >= 0 ? richterFarbe(i) : BAU.ohne.fill} fillOpacity={i >= 0 ? 0.45 : 1} stroke="none" />
        {i >= 0 && richterSchraffur(i) && <rect {...g} fill={`url(#schraffur-${i % RICHTER_FARBE.length})`} stroke="none" />}
        <rect {...g} fill="none" stroke={BAU.linie} {...strich(0.9)} />
        {k.nr && (
          <text x={g.x + g.width / 2} y={g.y + g.height / 2} fontSize={gr} textAnchor="middle" dominantBaseline="central" fill="#171b24">
            {k.nr}
          </text>
        )}
        <title>{`${k.nr ? `Nr. ${k.nr}: ` : ""}${k.rasse}`}</title>
        {markierterKaefig === k.id && <rect x={g.x - rand * 1.5} y={g.y - rand * 1.5} width={g.width + rand * 3} height={g.height + rand * 3} fill="none" stroke="#171b24" strokeWidth={rand * 1.2} />}
      </g>
    );
  };
  /** Gewählte Teile: blau getönt und gerahmt; während des Ziehens rot, wenn die Auswahl dort nicht stehen kann. */
  const farbe = zug?.konflikt ? "#c62828" : "#2d4bd2";
  const auswahlRahmen = (g: { x: number; y: number; width: number; height: number }) => (
    <rect x={g.x - rand} y={g.y - rand} width={g.width + 2 * rand} height={g.height + 2 * rand} fill={farbe} fillOpacity={0.14} stroke={farbe} strokeWidth={rand * 0.9} strokeDasharray={`${rand * 2} ${rand}`} pointerEvents="none" />
  );

  // Reihenbezeichnungen: alle gleich groß, bei den Platten, wie sie gezeichnet sind (auch beim Ziehen), nie übereinander.
  const schildSchrift = Math.min(schrift, RAND_CM * 0.3);
  const schildAbstand = { oben: schildSchrift * 2.6, links: schildSchrift * 1.4 };
  const schilder = new Map(
    reihenSchilder(
      plan.reihen.flatMap((reihe) => {
        const { lage, verschoben, aufPlatte, da } = reiheImEntwurf(reihe);
        const platten = reihe.platten.flatMap((pl, i) => (da[i] ? [aufPlatte(pl.rechteck, i)] : []));
        // Wie gezeichnet: leere Reihen nur, wenn sie im Bearbeiten von Hand verschoben sind.
        if (!platten.length && !(bearbeiten && lage.ev)) return [];
        const zeichnung = (q: Rechteck): Rechteck => (quer ? { x: q.y, y: q.x, b: q.h, h: q.b } : q);
        return [{ nr: reihe.nr, platten: (platten.length ? platten : reihe.flaechen.map((q) => verschoben(q))).map(zeichnung) }];
      }),
      { x: 0, y: 0, b: W, h: H },
      schildAbstand,
    ).map((x) => [x.nr, x]),
  );
  return (
    <div ref={kastenRef} className={`immer-hell overflow-auto bg-weiss p-2 ${bearbeiten ? "" : "rounded-md border border-linie"} ${voll ? "h-full" : ""}`}>
      <svg
        ref={svgRef}
        // Gezoomt: größer als der Kasten (Breite und, in der Vollansicht, Höhe), der Kasten scrollt.
        {...(zoom !== 1 ? { width: `${zoom * 100}%`, ...(voll ? { height: `${zoom * 100}%` } : {}) } : {})}
        // Rand rundum: Platz für Reihenbeschriftungen vor einer Wand, an der die Reihe bündig steht, und die Maßleisten.
        viewBox={`${-RAND_CM} ${-RAND_CM} ${W + 2 * RAND_CM} ${H + 2 * RAND_CM}`}
        className={`${zoom !== 1 ? (voll ? "" : "h-auto") : voll ? "h-full w-full" : klein ? "h-auto w-full" : "h-auto w-full min-w-[40rem]"} ${bearbeiten ? "touch-none select-none" : ""} ${zeichnen ? "cursor-crosshair" : ""} print:h-auto print:w-full`}
        role="img"
        aria-label={`Hallenplan, ${meter(halle.breite)} × ${meter(halle.laenge)} m`}
        onPointerMove={ziehen}
        onPointerUp={loslassen}
        onPointerCancel={(e) => {
          if (zugRef.current?.zeiger === e.pointerId) setZug(null);
          if (rahmenRef.current?.zeiger === e.pointerId) setRahmen(null);
        }}
        // Auf freier Fläche: Auswahlrechteck aufziehen (ein Klick ohne Ziehen hebt die Auswahl auf).
        onPointerDown={(e) => {
          if (!bearbeiten || e.button !== 0 || zugRef.current || rahmenRef.current) return;
          gegriffen.current = null;
          svgRef.current?.setPointerCapture(e.pointerId);
          // Fokus auf den Plan: danach verschieben die Pfeiltasten die gewählten Teile.
          svgRef.current?.focus({ preventScroll: true });
          const p = hallenPunkt(e);
          setRahmen({ start: p, jetzt: p, startBild: { clientX: e.clientX, clientY: e.clientY }, dazu: ergaenzen(e), zeiger: e.pointerId });
        }}
        // Strg-Klick (Mehrfachauswahl) öffnet am Mac sonst das Kontextmenü – und das Loslassen käme nie an.
        onContextMenu={bearbeiten ? (e) => e.preventDefault() : undefined}
        tabIndex={bearbeiten ? -1 : undefined}
        onKeyDown={(e) => {
          // Pfeiltasten, wenn der Plan selbst den Fokus hat (nach einem Auswahlrechteck): die ganze Auswahl.
          if (!bearbeiten || e.target !== e.currentTarget || auswahl.length === 0) return;
          const weg = pfeilWeg(e);
          if (!weg) return;
          e.preventDefault();
          verschiebeAuswahl(zuTeilen(auswahl, plan), weg[0], weg[1], true);
        }}
        // Doppelklick dreht das zuletzt gegriffene Teil (beim Ziehen hält das SVG den Zeiger fest, daher hier statt am Teil).
        onDoubleClick={() => {
          const z = gegriffen.current;
          if (bearbeiten && z) drehen(z);
        }}
      >
        <Muster massstab={Math.max(1, Math.max(W, H) / 2000)} />
        <rect x={0} y={0} width={W} height={H} fill={BAU.halle.fill} stroke="none" />
        {/* Raster zum Orientieren: 0,5 m fein, jeder Meter und alle 5 m etwas kräftiger. */}
        {Array.from({ length: Math.floor(W / 50) + 1 }, (_, n) => n * 50).map((x) => (
          <line key={`rx${x}`} x1={x} y1={0} x2={x} y2={H} stroke={x % 500 === 0 ? BAU.raster.fuenf : x % 100 === 0 ? BAU.raster.meter : BAU.raster.fein} strokeWidth={rand * (x % 100 === 0 ? 0.2 : 0.12)} />
        ))}
        {Array.from({ length: Math.floor(H / 50) + 1 }, (_, n) => n * 50).map((y) => (
          <line key={`ry${y}`} x1={0} y1={y} x2={W} y2={y} stroke={y % 500 === 0 ? BAU.raster.fuenf : y % 100 === 0 ? BAU.raster.meter : BAU.raster.fein} strokeWidth={rand * (y % 100 === 0 ? 0.2 : 0.12)} />
        ))}
        {/* Maßleisten in Metern: unten und links; die Reihennamen stehen oben (bzw. links neben der Meterleiste) am Rand. */}
        {Array.from({ length: Math.floor(W / 100) + 1 }, (_, n) => n * 100)
          .filter((x) => x % (W > 4000 ? 200 : 100) === 0)
          .map((x) => (
            <text key={`mx${x}`} x={x} y={H + RAND_CM * 0.45} fontSize={schrift * 0.6} textAnchor="middle" dominantBaseline="central" fill={BAU.raster.text}>
              {x / 100}
            </text>
          ))}
        {Array.from({ length: Math.floor(H / 100) + 1 }, (_, n) => n * 100)
          .filter((y) => y % (H > 4000 ? 200 : 100) === 0)
          .map((y) => (
            <text key={`my${y}`} x={-RAND_CM * 0.3} y={y} fontSize={schrift * 0.6} textAnchor="end" dominantBaseline="central" fill={BAU.raster.text}>
              {y / 100}
            </text>
          ))}
        <text x={W} y={H + RAND_CM * 0.85} fontSize={schrift * 0.55} textAnchor="end" dominantBaseline="central" fill={BAU.raster.text}>
          Meter
        </text>
        {/* Wände: kräftig und außen um die Halle, an Eingängen offen. */}
        <path
          d={`M${-wand} ${-wand}H${W + wand}V${H + wand}H${-wand}Z M0 0V${H}H${W}V0Z`}
          fill={BAU.wand}
          fillRule="evenodd"
        />
        {halle.flaechen.map((f: HallenFlaeche, i) => {
          if (f.art !== "eingang") return null;
          // Gleiche Lage wie die Fläche darunter, auch während sie gezogen wird.
          const v = versatz({ art: "flaeche", i }), gv = versatz({ art: "flaeche", i }, "groesse");
          const g = r(f.x + v.dx, f.y + v.dy, Math.max(20, f.breite + gv.dx), Math.max(20, f.tiefe + gv.dy));
          const n = RASTER; // cm Spiel: Eingang „an der Wand“ (auch wenn die Halle kein Vielfaches des Rasters ist)
          // Entlang der Wand auf die Halle begrenzt (die Ecken bleiben stehen), nach außen 1 cm länger gegen Haarlinien.
          const gx = Math.max(0, g.x), gy = Math.max(0, g.y);
          const gb = Math.min(W, g.x + g.width) - gx, gh = Math.min(H, g.y + g.height) - gy;
          // Eine Tür öffnet genau eine Wand: die berührte, an der ihre lange Seite liegt (in einer Ecke nicht beide).
          const stehend = g.height > g.width;
          const waende = [
            { an: g.x <= n, laengs: stehend, o: { x: -wand - 1, y: gy, width: wand + 1, height: gh } },
            { an: g.x + g.width >= W - n, laengs: stehend, o: { x: W, y: gy, width: wand + 1, height: gh } },
            { an: g.y <= n, laengs: !stehend, o: { x: gx, y: -wand - 1, width: gb, height: wand + 1 } },
            { an: g.y + g.height >= H - n, laengs: !stehend, o: { x: gx, y: H, width: gb, height: wand + 1 } },
          ].filter((x) => x.an);
          const offen = waende.find((x) => x.laengs) ?? waende[0];
          return offen && offen.o.width > 0 && offen.o.height > 0 ? <rect key={`o${i}`} {...offen.o} fill={BAU.halle.fill} stroke="none" /> : null;
        })}
        {halle.flaechen.map((f: HallenFlaeche, i) => {
          const z: Ziel = { art: "flaeche", i };
          const v = versatz(z), gv = versatz(z, "groesse");
          const g = r(f.x + v.dx, f.y + v.dy, Math.max(20, f.breite + gv.dx), Math.max(20, f.tiefe + gv.dy));
          return (
            <g key={`f${i}`} {...bedienbar(z, f.name)}>
              <rect
                {...g}
                fill={f.art === "sperre" ? BAU.frei.fill : f.art === "eingang" ? BAU.eingang.fill : BAU.volierenbereich.fill}
                stroke={f.art === "sperre" ? BAU.frei.stroke : f.art === "eingang" ? BAU.eingang.stroke : BAU.volierenbereich.stroke}
                {...strich(1)}
                strokeDasharray={f.art === "volieren" ? `${rand * 2} ${rand * 1.2}` : undefined}
              />
              <text
                x={g.x + g.width / 2}
                // Volierenbereich: Name am oberen Rand, damit ihn die Volieren nicht verdecken.
                y={f.art === "volieren" ? (g.y < wand + schrift ? g.y + schrift * 0.7 : g.y - schrift * 0.6) : g.y + g.height / 2}
                fontSize={Math.min(schrift, Math.max(g.height, g.width) * 0.4, (Math.max(g.width, g.height) / Math.max(f.name.length, 1)) * 1.6)}
                textAnchor="middle"
                dominantBaseline="central"
                fill={f.art === "eingang" ? BAU.eingang.text : "#171b24"}
                fontWeight={f.art === "eingang" ? "bold" : undefined}
                transform={f.art !== "volieren" && g.height > g.width * 1.5 ? `rotate(-90 ${g.x + g.width / 2} ${g.y + g.height / 2})` : undefined}
              >
                {f.name}
              </text>
              {markiert(z) && (
                <>
                  {auswahlRahmen(g)}
                  {/* Ecke zum Ändern der Größe */}
                  <rect x={g.x + g.width - rand * 3} y={g.y + g.height - rand * 3} width={rand * 6} height={rand * 6} fill="#2d4bd2" className="cursor-nwse-resize" onPointerDown={greifen(z, "groesse")} />
                </>
              )}
            </g>
          );
        })}
        {plan.reihen.map((reihe) => {
          const z: Ziel = { art: "reihe", nr: reihe.nr };
          const { lage, verschoben, aufPlatte, da } = reiheImEntwurf(reihe);
          const ev = lage.ev;
          const sichtbar = reihe.platten.filter((_, i) => da[i]);
          // Umriss: die Platten, wie sie gezeichnet sind (auch einzeln verschobene und gedrehte).
          const umriss = sichtbar.length ? reihe.platten.flatMap((pl, i) => (da[i] ? [rr(aufPlatte(pl.rechteck, i))] : [])) : reihe.flaechen.map((q) => rr(verschoben(q, z)));
          // Beschriftung „R…“ außerhalb der Halle am Rand, beim größten Stück der Reihe, alle gleich groß, nie übereinander
          // (siehe reihenSchilder). So verdeckt sie nichts im Plan.
          const sch = schilder.get(reihe.nr);
          const b = !sch
            ? null
            : sch.seite === "oben"
              ? { x: sch.mitte - schildAbstand.oben / 2, y: -wand - RAND_CM * 0.42, width: schildAbstand.oben, height: RAND_CM * 0.34 }
              : { x: -RAND_CM * 0.98, y: sch.mitte - schildAbstand.links / 2, width: RAND_CM * 0.34, height: schildAbstand.links };
          // Nur Reihen mit Käfigen zeichnen – leere Reihen nicht (der freie Platz steht unter „Platz“). Eine leere, aber
          // von Hand verschobene Reihe bleibt im Bearbeiten wählbar, damit sie sich zurücksetzen lässt.
          const leer = sichtbar.length === 0;
          if (leer && !(bearbeiten && ev)) return null;
          const aufPlatteNr = new Map<number, PlanKaefig[]>();
          for (const k of reihe.kaefige) if (k.platte != null) aufPlatteNr.set(k.platte, [...(aufPlatteNr.get(k.platte) ?? []), k]);
          return (
            <g key={reihe.nr}>
              {leer &&
                reihe.flaechen.map((q, i) => (
                  <rect key={i} {...rr(verschoben(q, z))} fill="none" stroke="#b8bfca" {...strich(0.8)} strokeDasharray={`${rand * 2} ${rand * 1.5}`} />
                ))}
              {/* Jede Grundplatte mit ihren Käfigen für sich wählbar und verschiebbar. Erst alle Platten, darüber die Käfige: ein
                  Käfig kann über die Kante auf die nächste Platte reichen (die Platten stehen lückenlos aneinander). */}
              {reihe.platten.map((pl, i) => {
                if (!da[i]) return null;
                const pz: Ziel = { art: "platte", reihe: reihe.nr, i };
                const g = rr(aufPlatte(pl.rechteck, i));
                return (
                  <g
                    key={`p${i}`}
                    {...bedienbar(pz, `Grundplatte ${i + 1} in Reihe R${reihe.nr}${(aufPlatteNr.get(i) ?? []).some((k) => k.nr) ? ` (Käfige ${(aufPlatteNr.get(i) ?? []).map((k) => k.nr).filter(Boolean).join(", ")})` : ""}`)}
                  >
                    <rect {...g} fill={BAU.platte.fill} stroke={BAU.platte.stroke} {...strich(0.8)} />
                  </g>
                );
              })}
              {/* Im Bearbeiten greift ein Klick auf einen Käfig die Platte darunter. */}
              <g pointerEvents={bearbeiten ? "none" : undefined}>
                {reihe.platten.map((_, i) => (aufPlatteNr.get(i) ?? []).map((k) => kaefig(k, aufPlatte(k.zeichnung ?? k.rechteck, i))))}
                {reihe.kaefige.filter((k) => k.platte == null).map((k) => kaefig(k, verschoben(k.zeichnung ?? k.rechteck, z)))}
              </g>
              {reihe.platten.map((pl, i) => (markiert({ art: "platte", reihe: reihe.nr, i }) ? <g key={`m${i}`}>{auswahlRahmen(rr(aufPlatte(pl.rechteck, i)))}</g> : null))}
              {(reihe.freiePlaetze ?? []).map((f, i) => {
                if (platzWeg(halle, reihe, f, da)) return null;
                const g = rr(aufPlatte(f.zeichnung ?? f.rechteck, f.platte));
                // Im Editor auf einer teils belegten Platte einzeln wählbar (zum Entfernen); Ziehen nimmt die Platte mit. Auf einer
                // ganz leeren Platte wählt ein Klick die Platte selbst (die man als Ganzes entfernt).
                const fz: Ziel = { art: "platz", reihe: reihe.nr, x: f.x, y: f.y, ...(f.etage ? { etage: f.etage } : {}) };
                // Plätze auf einer für eine Nachmeldung angebauten Platte gehören zu ihr (die Platte ist belegt).
                const einzeln = !f.angebaut && (f.platte == null || (reihe.platten[f.platte]?.belegt ?? 0) > 0);
                return (
                  <g key={`frei${i}`} {...(einzeln ? bedienbar(fz, `Freier Platz in R${reihe.nr}${f.platte != null ? `, Grundplatte ${f.platte + 1}` : ""}`) : { pointerEvents: bearbeiten ? "none" : undefined })}>
                    <rect {...g} fill="#ffffff" stroke="#7c8696" {...strich(0.8)} strokeDasharray={`${rand * 0.8} ${rand * 0.6}`} />
                    <text x={g.x + g.width / 2} y={g.y + g.height / 2} fontSize={Math.min(g.width, g.height) * 0.3} textAnchor="middle" dominantBaseline="central" fill="#7c8696">
                      frei
                    </text>
                    <title>{`Freier Platz (${kaefigName(f.typ as KaefigTyp)})${f.etage ? `, ${f.etage + 1}. Etage` : ""}`}</title>
                    {markiert(fz) && auswahlRahmen(g)}
                  </g>
                );
              })}
              {/* Rückwand, Seiten und offene Front jeder Grundplatte (über den Käfigen, damit man sie immer sieht). */}
              {reihe.platten.map((pl, i) => (da[i] ? waende(aufPlatte(pl.rechteck, i), dreheBlick(frontDerReihe(reihe, plan.quer, pl.drehung ?? 0), lage.vorschauDrehung(i)), `w${i}`) : null))}
              {/* Die ganze Reihe greift man an ihrer Beschriftung „R…“. */}
              {b && (
                <g {...bedienbar(z, `Reihe R${reihe.nr}`)}>
                  <rect {...b} fill="transparent" />
                  <text x={b.x + b.width / 2} y={b.y + b.height / 2} fontSize={schildSchrift} textAnchor="middle" dominantBaseline="central" fontWeight="bold" fill={reihe.kaefige.length ? "#2d4bd2" : "#7c8696"}>
                    R{reihe.nr}
                  </text>
                </g>
              )}
              {markiert(z) && umriss.length > 0 && auswahlRahmen(huelle(umriss))}
            </g>
          );
        })}
        {plan.volieren.map((k) => kaefig(k))}
        {plan.volieren.map((k, i) => (k.front ? waende(k.rechteck, k.front, `vw${i}`) : null))}
        {plan.objekte.map((o) => {
          const z: Ziel = { art: "objekt", id: o.id };
          const ol = objektLage(halle, o);
          if (!ol) return null; // im Entwurf schon entfernt
          const { lage, gedrehtSeit } = ol;
          const g = rr(verschoben(lage, z));
          const lang = g.width >= g.height;
          return (
            <g key={o.id} {...bedienbar(z, o.name)}>
              {istMoebel(o) ? (
                <>
                  {moebelStuecke(((halle.objekte ?? []).find((x) => x.id === o.id) ?? o) as HallenObjekt & { art: MoebelArt }, lage).map((m, i) => {
                    const f = rr(verschoben(m.q, z));
                    return <rect key={i} {...f} fill={m.art === "tisch" ? BAU.tisch.fill : BAU.bank.fill} stroke={BAU.tisch.stroke} {...strich(0.8)} />;
                  })}
                  <title>{o.name}</title>
                </>
              ) : o.art === "voliere" ? (
                <>
                  <rect {...g} fill={BAU.voliere.fill} stroke={BAU.voliere.stroke} {...strich(2.2)} />
                  <text x={g.x + g.width / 2} y={g.y + g.height / 2} fontSize={Math.min(schrift, Math.min(g.width, g.height) * 0.4)} textAnchor="middle" dominantBaseline="central" fill="#171b24">
                    {o.tier ? (o.tier.nr ? `V ${o.tier.nr}` : "V") : "V (frei)"}
                  </text>
                  <title>{o.tier ? `${o.name}: ${o.tier.nr ? `Nr. ${o.tier.nr}, ` : ""}${o.tier.rasse}` : `${o.name}: frei`}</title>
                  {o.tier && zeigeKaefig && <rect {...g} fill="transparent" className="cursor-pointer" onClick={() => zeigeKaefig(o.tier!.id)} />}
                  {waende(verschoben(lage, z), objektFront({ front: halle.objekte?.find((x) => x.id === o.id)?.front, rechteck: lage }))}
                </>
              ) : (
                <>
                  <rect {...g} fill={BAU.platte.fill} stroke={BAU.platte.stroke} {...strich(0.8)} />
                  {/* Belegte Plätze (Tiere aus „noch zu stellen“) wie Käfige; die übrigen leer gestrichelt. Im Entwurf gedreht:
                      erst nach dem Neurechnen wieder belegt gezeichnet. */}
                  {Array.from({ length: o.plaetze }, (_, i) => {
                    if (!gedrehtSeit && (o.kaefige ?? []).some((k, j) => (k.blockPlatz ?? j) === i)) return null;
                    // Je Spalte die Etagen (Feld quer zur Front geteilt), etwas eingerückt.
                    const et = etagenVon(o.typ ?? "huehner", halle);
                    const p = blockPlatz(lage, o.plaetze, et, i);
                    const q = etagenStreifen(p.rechteck, p.etage, et, objektFront({ front: halle.objekte?.find((x) => x.id === o.id)?.front, rechteck: lage }));
                    const e = Math.min(q.b, q.h) * 0.08;
                    const k = rr(verschoben({ x: q.x + e, y: q.y + e, b: q.b - 2 * e, h: q.h - 2 * e }, z));
                    return <rect key={i} {...k} fill="#ffffff" stroke="#7c8696" {...strich(0.8)} strokeDasharray={`${rand * 0.8} ${rand * 0.6}`} />;
                  })}
                  {!gedrehtSeit &&
                    (o.kaefige ?? []).map((k) => {
                      const q = k.zeichnung ?? k.rechteck;
                      return kaefig(k, verschoben({ ...q, x: q.x + lage.x - o.rechteck.x, y: q.y + lage.y - o.rechteck.y }, z));
                    })}
                  {waende(verschoben(lage, z), objektFront({ front: halle.objekte?.find((x) => x.id === o.id)?.front, rechteck: lage }))}
                  <title>{o.kaefige?.length ? `${o.name} – ${o.kaefige.length} von ${o.plaetze} belegt` : `${o.name} – leer (Reserve)`}</title>
                </>
              )}
              {markiert(z) && auswahlRahmen(g)}
            </g>
          );
        })}
        {rahmen && (
          <rect
            {...r(Math.min(rahmen.start.x, rahmen.jetzt.x), Math.min(rahmen.start.y, rahmen.jetzt.y), Math.abs(rahmen.jetzt.x - rahmen.start.x), Math.abs(rahmen.jetzt.y - rahmen.start.y))}
            fill="#2d4bd2"
            fillOpacity={0.08}
            stroke="#2d4bd2"
            strokeWidth={rand * 0.6}
            strokeDasharray={`${rand * 2} ${rand}`}
            pointerEvents="none"
          />
        )}
        {zielWahl && (
          <g aria-label="Ziel für das Tier wählen">
            {zielPlaetze(plan, halle).map((z) => {
              const gleich = z.typ === zielWahl.typ;
              const selbst = z.tierId === zielWahl.tierId;
              const q = z.q;
              return (
                <rect
                  key={z.schluessel}
                  {...r(q.x, q.y, q.b, q.h)}
                  fill={gleich && !selbst ? "#2d4bd2" : "#000"}
                  fillOpacity={gleich && !selbst ? (z.tierId == null ? 0.28 : 0.12) : 0.001}
                  stroke={gleich && !selbst ? "#2d4bd2" : "none"}
                  strokeWidth={rand * 0.5}
                  className={gleich && !selbst ? "cursor-pointer" : "cursor-not-allowed"}
                  role="button"
                  aria-label={`${z.tierId == null ? "Freier Käfig" : `Käfig Nr. ${z.nr ?? "ohne Nummer"}`}${gleich ? "" : " (andere Größe)"}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (selbst) return;
                    if (!gleich) return zielWahl.falsch();
                    zielWahl.waehlen(z.platz);
                  }}
                />
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
}

/** Umschließendes Rechteck mehrerer Rechtecke (Zeichenkoordinaten). */
function huelle(q: { x: number; y: number; width: number; height: number }[]) {
  const x = Math.min(...q.map((a) => a.x)), y = Math.min(...q.map((a) => a.y));
  return { x, y, width: Math.max(...q.map((a) => a.x + a.width)) - x, height: Math.max(...q.map((a) => a.y + a.height)) - y };
}

const BLOCK_TYPEN = ["grosskaefig", "huehner", "zwerghuehner", "tauben", "stamm"] as const;

/**
 * Werkzeugleiste des Editors: Auswahl, Rückgängig/Wiederholen, Einsetzen, Bearbeiten der Auswahl, Ansicht und das Menü
 * „Plan“. Immer gleich hoch (bricht nur nach der Breite um, nie nach der Auswahl) – der Plan darunter springt nicht.
 */
function Werkzeugleiste({
  masse,
  voll,
  setVoll,
  zoom,
  setZoom,
  zoomen,
  mehrfach,
  setMehrfach,
  kannZurueck,
  kannVor,
  zurueckWas,
  vorWas,
  rueckgaengig,
  wiederholen,
  einsetzen,
  flaecheEinsetzen,
  a,
  hatAuswahl,
  plan,
  vorschlaege,
  vorschlaegeOffen,
  dreiD,
}: {
  masse: KaefigMasse;
  voll: boolean;
  setVoll: (v: boolean) => void;
  zoom: number;
  setZoom: (z: number) => void;
  zoomen: (r: 1 | -1) => void;
  mehrfach: boolean;
  setMehrfach: (v: boolean) => void;
  kannZurueck: boolean;
  kannVor: boolean;
  zurueckWas?: string;
  vorWas?: string;
  rueckgaengig: () => void;
  wiederholen: () => void;
  einsetzen: (art: HallenObjekt["art"], typ?: KaefigTyp) => void;
  flaecheEinsetzen: (art: HallenFlaeche["art"]) => void;
  a: Aktionen;
  hatAuswahl: boolean;
  plan: {
    nummerieren: { text: string; tun: () => void } | null;
    reihenZurueck: number;
    plattenZurueck: number;
    alleReihenZurueck: () => void;
    allePlattenZurueck: () => void;
    neuSetzen: () => void;
    anWaenden: (() => void) | null;
  };
  vorschlaege: () => void;
  vorschlaegeOffen: boolean;
  dreiD: () => void;
}) {
  return (
    <div role="toolbar" aria-label="Werkzeuge des Hallenplans" className={`nicht-drucken z-30 flex flex-wrap items-center gap-y-1 border-b border-linie bg-weiss px-1 py-1 ${voll ? "" : "sticky top-12 rounded-t-xl"}`}>
      <WzGruppe label="Auswahl">
        <WzKnopf symbol="auswahl" titel="Auswählen und verschieben" kuerzel="V" an={!mehrfach} onClick={() => setMehrfach(false)} />
        <WzKnopf symbol="mehrfach" titel="Mehrfachauswahl" kuerzel="M" an={mehrfach} onClick={() => setMehrfach(!mehrfach)} />
      </WzGruppe>
      <WzGruppe label="Verlauf">
        <WzKnopf symbol="rueckgaengig" titel={kannZurueck ? `Rückgängig: ${zurueckWas}` : "Rückgängig"} kuerzel={`${strg} Z`} disabled={!kannZurueck} onClick={rueckgaengig} />
        <WzKnopf symbol="wiederholen" titel={kannVor ? `Wiederholen: ${vorWas}` : "Wiederholen"} kuerzel={`${strg} ⇧ Z`} disabled={!kannVor} onClick={wiederholen} />
      </WzGruppe>
      <WzGruppe label="Einsetzen">
        <WzMenue symbol="einsetzen" titel="Einsetzen" text="Einsetzen">
          {(zu) => (
            <>
              <MenueKopf>Flächen</MenueKopf>
              {(
                [
                  ["eingang", "eingang", "Eingang / Ausgang", "an der Wand"],
                  ["sperre", "flaeche", "Freier Bereich (Bühne, Kasse …)", undefined],
                  ["volieren", "voliere", "Volierenbereich", undefined],
                ] as const
              ).map(([art, symbol, text, zusatz]) => (
                <MenueEintrag
                  key={art}
                  symbol={symbol}
                  zusatz={zusatz}
                  onClick={() => {
                    zu();
                    flaecheEinsetzen(art);
                  }}
                >
                  {text}
                </MenueEintrag>
              ))}
              <MenueTrenner />
              <MenueKopf>Käfige</MenueKopf>
              {BLOCK_TYPEN.map((t) => (
                <MenueEintrag
                  key={t}
                  symbol="block"
                  onClick={() => {
                    zu();
                    einsetzen("kaefigblock", t);
                  }}
                >
                  Käfigblock {kaefigName(t, masse)}
                </MenueEintrag>
              ))}
              <MenueEintrag
                symbol="voliere"
                onClick={() => {
                  zu();
                  einsetzen("voliere");
                }}
              >
                Voliere
              </MenueEintrag>
              <MenueTrenner />
              <MenueKopf>Tische und Bänke</MenueKopf>
              {(
                [
                  ["garnitur", "Garnitur (Tisch mit zwei Bänken)"],
                  ["tisch", "Tisch"],
                  ["bank", "Bank"],
                ] as const
              ).map(([art, text]) => (
                <MenueEintrag
                  key={art}
                  symbol="tisch"
                  onClick={() => {
                    zu();
                    einsetzen(art);
                  }}
                >
                  {text}
                </MenueEintrag>
              ))}
            </>
          )}
        </WzMenue>
      </WzGruppe>
      <WzGruppe label="Bearbeiten">
        <WzKnopf symbol="raster" titel={hatAuswahl ? "Auswahl am Raster ausrichten" : "Alles am Raster ausrichten"} kuerzel="A" onClick={a.ausrichten} />
        <WzKnopf symbol="drehen" titel="Drehen um 90°" kuerzel="R" disabled={!a.dreht} onClick={a.drehen} />
        <WzKnopf symbol="zurueck" titel="An ihren Platz zurück" disabled={!a.zurueck} onClick={a.zurueckAnPlatz} />
        <WzKnopf symbol="entfernen" titel="Entfernen (nur Leeres)" kuerzel="Entf" gefahr disabled={!hatAuswahl} onClick={a.entfernen} />
      </WzGruppe>
      <WzGruppe label="Ansicht">
        <WzKnopf symbol="verkleinern" titel="Verkleinern" kuerzel="−" disabled={zoom <= 1} onClick={() => zoomen(-1)} />
        <span className="w-11 text-center text-sm tabular-nums text-grau" aria-live="polite">
          {Math.round(zoom * 100)} %
        </span>
        <WzKnopf symbol="vergroessern" titel="Vergrößern" kuerzel="+" disabled={zoom >= 4} onClick={() => zoomen(1)} />
        <WzKnopf symbol="einpassen" titel="Ganze Halle" kuerzel="0" disabled={zoom === 1} onClick={() => setZoom(1)} />
        <WzKnopf symbol={voll ? "vollansichtAus" : "vollansicht"} titel={voll ? "Vollansicht schließen" : "Vollansicht"} kuerzel="F" an={voll} onClick={() => setVoll(!voll)} />
        <WzKnopf symbol="dreiD" titel="Halle in 3D" text="3D" onClick={dreiD} />
      </WzGruppe>
      <WzGruppe label="Aufstellung">
        <WzKnopf symbol="vorschlaege" titel="Stellvorschläge" text="Stellvorschläge" textBreit an={vorschlaegeOffen} onClick={vorschlaege} />
      </WzGruppe>
      <WzGruppe label="Plan">
        <WzMenue symbol="menue" titel="Plan" text="Plan" rechts>
          {(zu) => {
            const tun = (f: () => void) => () => {
              zu();
              f();
            };
            return (
              <>
                {plan.nummerieren && (
                  <>
                    <MenueEintrag symbol="nummern" onClick={tun(plan.nummerieren.tun)}>
                      {plan.nummerieren.text}
                    </MenueEintrag>
                    <MenueTrenner />
                  </>
                )}
                <MenueEintrag symbol="zurueck" zusatz={plan.reihenZurueck || undefined} disabled={!plan.reihenZurueck} onClick={tun(plan.alleReihenZurueck)}>
                  Alle Reihen an ihren Platz
                </MenueEintrag>
                <MenueEintrag symbol="zurueck" zusatz={plan.plattenZurueck || undefined} disabled={!plan.plattenZurueck} onClick={tun(plan.allePlattenZurueck)}>
                  Alle Platten an ihren Platz
                </MenueEintrag>
                {plan.anWaenden && (
                  <MenueEintrag symbol="drehen" onClick={tun(plan.anWaenden)}>
                    Käfige an den Wänden ausrichten …
                  </MenueEintrag>
                )}
                <MenueTrenner />
                <MenueEintrag symbol="neu" onClick={tun(plan.neuSetzen)}>
                  Plan neu setzen …
                </MenueEintrag>
              </>
            );
          }}
        </WzMenue>
      </WzGruppe>
    </div>
  );
}

/** Angaben zu einem gewählten Teil für den Eigenschaften-Bereich. */
type TeilInfo = { art: string; name: string; status: string; leer: boolean; zeilen: [string, string][]; flaeche?: number; moebel?: string; tiere?: { id: number; nr: string | null; rasse: string; typ: string }[] };

function teilInfo(halle: Halle, plan: Plan, masse: KaefigMasse, z: Ziel): TeilInfo | null {
  const quer = halle.laenge > halle.breite;
  // Lage wie in der Zeichnung (dort liegt eine lange Halle quer): Abstand von der linken und oberen Wand.
  const lage = (q: Rechteck): [string, string][] => {
    const g = quer ? { x: q.y, y: q.x, b: q.h, h: q.b } : q;
    return [
      ["Lage", `links ${meter(g.x)} m · oben ${meter(g.y)} m`],
      ["Größe", `${meter(g.b)} × ${meter(g.h)} m`],
    ];
  };
  const nr = (k: { nr: string | null }[]) => nummernBereiche(k.map((x) => alsNummer(x.nr))) || "ohne Nummer";
  const frei = (n: number) => `leer · ${anzahl(n, "freier Platz", "freie Plätze")}`;
  const weg = (v: { dx: number; dy: number } | undefined) => (v && (v.dx || v.dy) ? `${meter(Math.hypot(v.dx, v.dy))} m` : "nein");
  if (z.art === "platte" || z.art === "platz") {
    const r = plan.reihen.find((x) => x.nr === z.reihe);
    if (!r) return null;
    const { aufPlatte } = reihenLage(halle, r);
    if (z.art === "platz") {
      const f = freierPlatz(plan, z);
      if (!f || platzWeg(halle, r, f, plattenDa(halle, r))) return null;
      return {
        art: "Freier Platz",
        name: `Freier Platz in R${r.nr}${f.platte != null ? `, Grundplatte ${f.platte + 1}` : ""}`,
        status: "leer",
        leer: true,
        zeilen: [["Käfig", kaefigName(f.typ as KaefigTyp, masse)], ...lage(aufPlatte(f.rechteck, f.platte))],
      };
    }
    const pl = r.platten[z.i];
    if (!pl || !plattenDa(halle, r)[z.i]) return null;
    const drauf = r.kaefige.filter((k) => k.platte === z.i);
    const e = (halle.plattenVersatz ?? []).find((x) => x.reihe === r.nr && x.platte === z.i);
    return {
      art: "Grundplatte",
      name: `Grundplatte ${z.i + 1} in R${r.nr}`,
      status: drauf.length ? `${drauf.length} von ${pl.plaetze} belegt` : frei(pl.plaetze - drauf.length),
      leer: drauf.length === 0,
      zeilen: [
        ["Käfige", pl.gemischt ? plattenKaefige(r, z.i, masse) : `${pl.plaetze} × ${kaefigName(pl.typ as KaefigTyp, masse)}`],
        ...(drauf.length ? ([["Nummern", nr(drauf)]] as [string, string][]) : []),
        ...lage(aufPlatte(pl.rechteck, z.i)),
        ["Drehung", `${e?.drehung ?? 0}°`],
        ["Verschoben", weg(e)],
      ],
      tiere: drauf,
    };
  }
  if (z.art === "reihe") {
    const r = plan.reihen.find((x) => x.nr === z.nr);
    if (!r) return null;
    const { aufPlatte } = reihenLage(halle, r);
    const e = (halle.reihenVersatz ?? []).find((x) => x.nr === r.nr);
    const da = plattenDa(halle, r);
    const q = r.platten.flatMap((pl, i) => (da[i] ? [aufPlatte(pl.rechteck, i)] : []));
    return {
      art: "Reihe",
      name: `Reihe R${r.nr}`,
      status: r.kaefige.length ? `${anzahl(r.kaefige.length, "Käfig", "Käfige")} belegt` : "leer",
      leer: r.kaefige.length === 0,
      zeilen: [
        ["Grundplatten", String(q.length)],
        ...(r.kaefige.length ? ([["Nummern", nr(r.kaefige)]] as [string, string][]) : []),
        ...(q.length ? lage(huelleRechteck(q)) : []),
        ["Drehung", `${e?.drehung ?? 0}°`],
        ["Verschoben", weg(e)],
      ],
    };
  }
  if (z.art === "objekt") {
    const o = plan.objekte.find((x) => x.id === z.id);
    const ol = o && objektLage(halle, o);
    // Eben eingesetzt, der Plan ist noch nicht neu gerechnet: schon anzeigen (leer).
    const neu = !o ? (halle.objekte ?? []).find((x) => x.id === z.id) : null;
    if (neu && istMoebel(neu)) return { art: MOEBEL_NAME[neu.art], name: `Neue${neu.art === "tisch" ? "r" : ""} ${MOEBEL_NAME[neu.art]}`, status: "neu", leer: true, zeilen: [], moebel: neu.id };
    if (neu) return { art: neu.art === "voliere" ? "Voliere" : "Käfigblock", name: neu.art === "voliere" ? "Neue Voliere" : `Neuer Block ${kaefigName(neu.typ ?? "huehner", masse)}`, status: "leer", leer: true, zeilen: [] };
    if (!o || !ol) return null;
    if (istMoebel(o)) {
      const e = (halle.objekte ?? []).find((x) => x.id === o.id);
      return { art: MOEBEL_NAME[o.art], name: o.name, status: "kein Käfigplatz", leer: true, zeilen: [...lage(ol.lage), ["Drehung", `${e?.drehung ?? 0}°`]], moebel: o.id };
    }
    const drin = [...(o.tier ? [o.tier] : []), ...(o.kaefige ?? [])];
    const e = (halle.objekte ?? []).find((x) => x.id === o.id);
    return {
      art: o.art === "voliere" ? "Voliere" : "Käfigblock",
      name: o.name,
      status: drin.length ? (o.art === "voliere" ? "belegt" : `${drin.length} von ${o.plaetze} belegt`) : o.art === "voliere" ? "leer" : frei(o.plaetze),
      leer: drin.length === 0,
      zeilen: [...(drin.length ? ([["Nummern", nr(drin)]] as [string, string][]) : []), ...lage(ol.lage), ["Drehung", `${e?.drehung ?? 0}°`]],
      tiere: drin,
    };
  }
  const f = halle.flaechen[z.i];
  if (!f) return null;
  const q = flaecheRechteck(f);
  const volieren = f.art === "volieren" ? plan.volieren.filter((v) => innen(v.rechteck, q)) : [];
  return {
    art: f.art === "eingang" ? "Eingang / Ausgang" : f.art === "volieren" ? "Volierenbereich" : "Freier Bereich",
    name: f.name,
    status: volieren.length ? `${anzahl(volieren.length, "Voliere", "Volieren")}` : "leer",
    leer: volieren.length === 0,
    zeilen: lage(q),
    flaeche: z.i,
  };
}

const huelleRechteck = (q: Rechteck[]): Rechteck => {
  const x = Math.min(...q.map((a) => a.x)), y = Math.min(...q.map((a) => a.y));
  return { x, y, b: Math.max(...q.map((a) => a.x + a.b)) - x, h: Math.max(...q.map((a) => a.y + a.h)) - y };
};

/**
 * Eigenschaften der Auswahl: was gewählt ist, Belegung, Lage, Größe, Drehung und die passenden Aktionen. `kompakt`: als
 * feste Zeile über dem Plan (Tablet und schmaler), sonst als Spalte rechts daneben (ab 1024 px).
 */
function Eigenschaften({
  kompakt,
  halle,
  plan,
  masse,
  auswahl,
  a,
  aendern,
  mehrfach,
  zeichnen,
  zeichnenAus,
  angaben,
  versetzen,
  hallePanel,
  halleOeffnen,
  detailsOeffnen,
  imDialog,
}: {
  /** Schmale Ansicht: Werte einer Fläche bzw. Tiere einer Platte im Dialog. */
  detailsOeffnen?: () => void;
  /** Im Dialog (schmale Ansicht): die volle Spalte ohne eigene Breite. */
  imDialog?: boolean;
  kompakt?: boolean;
  halle: Halle;
  plan: Plan;
  masse: KaefigMasse;
  auswahl: Ziel[];
  a: Aktionen;
  aendern: Aendern;
  mehrfach: boolean;
  /** Werkzeug „Fläche aufziehen“ läuft. */
  zeichnen: HallenFlaeche["art"] | null;
  zeichnenAus: () => void;
  /** Angaben zu einem Tier (Züchter, Bewertung …) öffnen. */
  angaben: (id: number) => void;
  /** Tier versetzen (Ziel danach im Plan anklicken); fehlt: nicht erlaubt. */
  versetzen?: (t: Versetzen) => void;
  /** Einstellungen der Halle (wenn nichts gewählt ist). */
  hallePanel: ReactNode;
  /** Schmale Ansicht: Einstellungen der Halle im Dialog. */
  halleOeffnen: () => void;
}) {
  const infos = auswahl.map((z) => teilInfo(halle, plan, masse, z)).filter((x): x is TeilInfo => !!x);
  const eins = auswahl.length === 1 ? (infos[0] ?? null) : null;
  const knopf = (symbol: Parameters<typeof WzSymbol>[0]["name"], text: string, tun: () => void, opt: { kuerzel?: string; gefahr?: boolean; disabled?: boolean } = {}) => (
    <Knopf variante={opt.gefahr ? "gefahr" : "zweit"} className={kompakt ? "shrink-0 px-3" : "w-full justify-start"} disabled={opt.disabled} onClick={tun} aria-keyshortcuts={opt.kuerzel}>
      <WzSymbol name={symbol} klein />
      <span className={kompakt ? "" : "flex-1 text-left"}>{text}</span>
      {opt.kuerzel && !kompakt && <kbd className="rounded border border-linie px-1 font-mono text-xs font-normal text-grau">{opt.kuerzel}</kbd>}
    </Knopf>
  );
  const knoepfe =
    auswahl.length > 1 ? (
      <>
        {knopf("raster", "Am Raster ausrichten", a.ausrichten, { kuerzel: "A" })}
        {knopf("entfernen", "Leeres entfernen", a.entfernen, { kuerzel: "Entf", gefahr: true })}
        {knopf("auswahl", "Auswahl aufheben", a.aufheben, { kuerzel: "Esc" })}
      </>
    ) : eins ? (
      <>
        {knopf("drehen", "Drehen", a.drehen, { kuerzel: "R", disabled: !a.dreht })}
        {a.zurueck && knopf("zurueck", "An ihren Platz zurück", a.zurueckAnPlatz)}
        {a.einzelreihe?.seiten.map((seite) => (
          <div key={seite} className="contents">
            {knopf("einpassen", a.einzelreihe!.text(seite), () => a.einzelreihe!.stellen(seite))}
          </div>
        ))}
        {knopf("entfernen", "Entfernen", a.entfernen, { kuerzel: "Entf", gefahr: true, disabled: !eins.leer })}
      </>
    ) : null;
  const flaeche = eins?.flaeche != null ? halle.flaechen[eins.flaeche] : null;
  const zeichnenText = zeichnen && `${zeichnen === "eingang" ? "Eingang" : zeichnen === "volieren" ? "Volierenbereich" : "Freien Bereich"} aufziehen`;
  if (kompakt && zeichnen)
    return (
      <div className="nicht-drucken flex h-14 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap border-b border-linie bg-papier px-3 lg:hidden" aria-live="polite">
        <span className="truncate font-semibold">{zeichnenText}</span>
        <Knopf className="ml-auto shrink-0 px-3" onClick={zeichnenAus}>
          Abbrechen
        </Knopf>
      </div>
    );
  if (kompakt)
    return (
      <div className="nicht-drucken flex h-14 shrink-0 items-center gap-3 overflow-hidden whitespace-nowrap border-b border-linie bg-papier px-3 lg:hidden" aria-live="polite">
        {auswahl.length === 0 ? (
          mehrfach ? (
            <span className="truncate font-semibold">Mehrfachauswahl</span>
          ) : (
            <>
              <span className="truncate font-semibold">
                Halle {meter(halle.breite)} × {meter(halle.laenge)} m
              </span>
              <Knopf className="ml-auto shrink-0 px-3" onClick={halleOeffnen}>
                Einstellungen der Halle
              </Knopf>
            </>
          )
        ) : auswahl.length > 1 ? (
          <>
            <span className="shrink-0 font-semibold">{auswahl.length} Teile gewählt</span>
            <span className="min-w-0 flex-1 truncate text-sm text-grau">{infos.map((i) => i.name).join(", ")}</span>
          </>
        ) : eins ? (
          <>
            <span className="min-w-0 shrink truncate font-semibold">{eins.name}</span>
            <Marke ton={eins.leer ? "ok" : "neutral"}>{eins.status}</Marke>
            {flaeche && eins.flaeche != null && <NameFeld key={`f${eins.flaeche}`} i={eins.flaeche} name={flaeche.name} aendern={aendern} />}
            <span className="min-w-0 flex-1 truncate text-sm text-grau">{eins.zeilen.find(([k]) => k === "Käfige" || k === "Käfig" || k === "Nummern")?.[1]}</span>
            {detailsOeffnen && (eins.flaeche != null || (eins.tiere?.length ?? 0) > 0) && (
              <Knopf className="shrink-0 px-3" onClick={detailsOeffnen}>
                Eigenschaften
              </Knopf>
            )}
          </>
        ) : (
          <span className="flex-1" />
        )}
        {knoepfe && <span className="ml-auto flex shrink-0 gap-2">{knoepfe}</span>}
      </div>
    );
  return (
    <aside className={imDialog ? "flex flex-col gap-4" : "nicht-drucken hidden w-72 shrink-0 flex-col gap-4 self-start p-4 lg:sticky lg:top-14 lg:flex"} aria-label="Eigenschaften der Auswahl" aria-live="polite">
      {zeichnen ? (
        <>
          <PanelKopf ueber="Einsetzen" titel={zeichnenText || ""} />
          <Knopf onClick={zeichnenAus}>Abbrechen</Knopf>
        </>
      ) : auswahl.length === 0 ? (
        mehrfach ? (
          <PanelKopf ueber="Auswahl" titel="Mehrfachauswahl" />
        ) : (
          hallePanel
        )
      ) : auswahl.length > 1 ? (
        <>
          <PanelKopf ueber="Auswahl" titel={`${auswahl.length} Teile gewählt`} />
          <ul className="flex max-h-48 flex-col gap-1 overflow-auto text-sm">
            {infos.map((i, n) => (
              <li key={n} className="flex items-center justify-between gap-2">
                <span className="truncate">{i.name}</span>
                <Marke ton={i.leer ? "ok" : "neutral"}>{i.leer ? "leer" : "belegt"}</Marke>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">{knoepfe}</div>
        </>
      ) : eins ? (
        <>
          <PanelKopf ueber={eins.art} titel={eins.name} marke={<Marke ton={eins.leer ? "ok" : "neutral"}>{eins.status}</Marke>} />
          {flaeche && eins.flaeche != null ? (
            <FlaecheFelder key={`f${eins.flaeche}`} halle={halle} i={eins.flaeche} aendern={aendern} />
          ) : eins.moebel ? (
            <MoebelFelder key={`m${eins.moebel}`} halle={halle} id={eins.moebel} aendern={aendern} zeilen={eins.zeilen} />
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {eins.zeilen.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-grau">{k}</dt>
                  <dd className="tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="flex flex-col gap-2">{knoepfe}</div>
          {eins.tiere && eins.tiere.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-linie pt-4">
              <Gruppenkopf>Tiere</Gruppenkopf>
              <ul className="flex max-h-56 flex-col gap-1 overflow-auto text-sm">
                {eins.tiere.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {t.nr ? `Nr. ${t.nr} ` : ""}
                      {t.rasse}
                    </span>
                    <span className="flex shrink-0 gap-3">
                      {versetzen && t.typ !== "voliere" && (
                        <button type="button" className="font-semibold text-band hover:underline" onClick={() => versetzen({ tierId: t.id, nr: t.nr, rasse: t.rasse, typ: t.typ as KaefigTyp })}>
                          Versetzen
                        </button>
                      )}
                      <button type="button" className="font-semibold text-band hover:underline" onClick={() => angaben(t.id)}>
                        Angaben
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        hallePanel
      )}
    </aside>
  );
}

/** Kleine Überschrift einer Gruppe in der Eigenschaften-Spalte. */
function Gruppenkopf({ children }: { children: ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-wide text-grau">{children}</div>;
}

/** Kopf der Eigenschaften-Spalte: Art klein darüber, Name, optional der Zustand als Marke. */
function PanelKopf({ ueber, titel, marke, className = "" }: { ueber: string; titel: string; marke?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <Gruppenkopf>{ueber}</Gruppenkopf>
      <h3 className="font-sans text-base font-semibold leading-snug">{titel}</h3>
      {marke && <div>{marke}</div>}
    </div>
  );
}

/** Eingabefeld mit Einheit am rechten Rand (z. B. „m“). */
function MitEinheit({ einheit, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { einheit: string }) {
  return (
    <span className="relative block">
      <Eingabe {...props} className={`pr-8 tabular-nums ${className}`} />
      <span aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-grau">
        {einheit}
      </span>
    </span>
  );
}

/**
 * Enter in einem Feld übernimmt den Wert – erst nach diesem Tastendruck: öffnet die Übernahme eine Rückfrage, darf derselbe
 * Tastendruck sie nicht gleich bestätigen.
 */
function enterUebernimmt(e: React.KeyboardEvent, uebernehmen: () => Promise<void> | void) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  setTimeout(() => void uebernehmen(), 0);
}

/**
 * Zahl in Metern, gespeichert in cm: übernommen beim Verlassen des Felds oder mit Enter. Ungültiges (oder eine abgelehnte
 * Rückfrage) springt auf den gespeicherten Wert zurück.
 */
function MeterFeld({ label, cm, setzen, min = 0, max = 50000 }: { label: string; cm: number; setzen: (cm: number) => boolean | Promise<boolean> | void; min?: number; max?: number }) {
  const [wert, setWert] = useState(meter(cm));
  useEffect(() => setWert(meter(cm)), [cm]);
  // Eine Übernahme zur Zeit (Enter und das Verlassen des Felds, wenn die Rückfrage aufgeht, kämen sonst doppelt).
  const laeuft = useRef(false);
  const wertRef = useRef(wert);
  wertRef.current = wert;
  const uebernehmen = async () => {
    if (laeuft.current) return;
    // Nur, was wirklich geändert wurde (krumme Werte nach dem Einrasten sollen beim bloßen Verlassen nicht rücken).
    if (wertRef.current.trim() === meter(cm)) return;
    const neu = zuCm(wertRef.current);
    if (!wertRef.current.trim() || !Number.isFinite(neu) || neu < min || neu > max || neu === cm) return setWert(meter(cm));
    laeuft.current = true;
    try {
      if ((await setzen(neu)) === false) setWert(meter(cm));
    } finally {
      laeuft.current = false;
    }
  };
  return (
    <Feld label={label}>
      {(id) => <MitEinheit id={id} einheit="m" aria-label={`${label} in Metern`} inputMode="decimal" value={wert} onChange={(e) => setWert(e.target.value)} onBlur={() => void uebernehmen()} onKeyDown={(e) => enterUebernimmt(e, uebernehmen)} />}
    </Feld>
  );
}

/** Ein gewählter Tisch, eine Bank oder Garnitur: Maße (Länge, Tiefe, bei der Garnitur die Tiefe der Bänke), dazu die Lage. */
function MoebelFelder({ halle, id, aendern, zeilen }: { halle: Halle; id: string; aendern: Aendern; zeilen: [string, string][] }) {
  const o = (halle.objekte ?? []).find((x) => x.id === id);
  if (!o || !istMoebel(o)) return null;
  const m = moebelMass(o);
  const setze = (patch: Partial<HallenObjekt>) => {
    aendern((h) => ({ ...h, objekte: (h.objekte ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)) }), { was: `${MOEBEL_NAME[o.art]} ändern` });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
        <MeterFeld label="Länge" cm={m.laenge} min={30} max={2000} setzen={(v) => setze({ laenge: v })} />
        <MeterFeld label={o.art === "garnitur" ? "Tiefe Tisch" : "Tiefe"} cm={m.tiefe} min={10} max={500} setzen={(v) => setze({ tiefe: v })} />
        {o.art === "garnitur" && <MeterFeld label="Tiefe Bank" cm={m.bankTiefe} min={10} max={200} setzen={(v) => setze({ bankTiefe: v })} />}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {zeilen.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-grau">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Eine gewählte Fläche: Name, Art, Lage und Größe (wie in der Zeichnung: von links und von oben). */
function FlaecheFelder({ halle, i, aendern }: { halle: Halle; i: number; aendern: Aendern }) {
  const f = halle.flaechen[i];
  if (!f) return null;
  const quer = halle.laenge > halle.breite;
  const g = quer ? { x: f.y, y: f.x, b: f.tiefe, h: f.breite } : { x: f.x, y: f.y, b: f.breite, h: f.tiefe };
  const setzeG = (patch: Partial<typeof g>) => {
    const n = { ...g, ...patch };
    const neu = quer ? { x: n.y, y: n.x, breite: n.h, tiefe: n.b } : { x: n.x, y: n.y, breite: n.b, tiefe: n.h };
    aendern((h) => ({ ...h, flaechen: h.flaechen.map((x, j) => (j === i ? { ...x, ...neu } : x)) }), { was: "Fläche ändern" });
  };
  return (
    <div className="flex flex-col gap-3">
      <NameFeld i={i} name={f.name} aendern={aendern} breit />
      <Feld label="Art">
        {(id) => (
          <Auswahl id={id} value={f.art} onChange={(e) => aendern((h) => ({ ...h, flaechen: h.flaechen.map((x, j) => (j === i ? { ...x, art: e.target.value as HallenFlaeche["art"] } : x)) }), { was: "Fläche ändern" })}>
            <option value="eingang">Eingang / Ausgang</option>
            <option value="sperre">Freier Bereich</option>
            <option value="volieren">Volierenbereich</option>
          </Auswahl>
        )}
      </Feld>
      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
        <MeterFeld label="Von links" cm={g.x} min={0} setzen={(v) => setzeG({ x: v })} />
        <MeterFeld label="Von oben" cm={g.y} min={0} setzen={(v) => setzeG({ y: v })} />
        <MeterFeld label="Breite" cm={g.b} min={20} setzen={(v) => setzeG({ b: v })} />
        <MeterFeld label="Höhe" cm={g.h} min={20} setzen={(v) => setzeG({ h: v })} />
      </div>
    </div>
  );
}

/**
 * Einstellungen der Halle im Editor (wenn nichts gewählt ist): Maße, Gänge, Reihen, Grundplatten, Stellvorschläge und
 * Schalter „Automatisch planen“. Jede Änderung wirkt sofort: bei „an“ wird der Plan neu gesetzt, bei „aus“ bleiben die Käfige.
 */
function HalleEigenschaften({
  halle,
  plan,
  masse,
  platziert,
  aendernHalle,
  automatik,
  setzen,
  vorschlaege,
}: {
  halle: Halle;
  plan: Plan;
  masse: KaefigMasse;
  platziert: number;
  aendernHalle: (patch: Partial<Halle>, was: string) => Promise<boolean>;
  automatik?: () => void;
  setzen?: FehlendeSetzen;
  vorschlaege: () => void;
}) {
  const richtung = halle.richtung ?? "quer";
  const hg = halle.hauptgang ?? HAUPTGANG_STANDARD;
  const gruppe = "flex flex-col gap-3 border-t border-linie pt-4";
  return (
    <div className="flex flex-col gap-4">
      {/* Im Dialog „Halle“ (Tablet) steht der Titel schon im Dialog. */}
      <PanelKopf ueber="Nichts gewählt" titel="Halle" className="[dialog_&]:hidden" />
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Gruppenkopf>Platz</Gruppenkopf>
          {plan.nichtPlatziert.length > 0 && <Marke ton="fehler">{plan.nichtPlatziert.length} ohne Platz</Marke>}
        </div>
        {plan.nichtPlatziert.length === 0 ? <span className="text-sm tabular-nums">Alle {platziert} Käfige haben Platz</span> : <OhnePlatz plan={plan} halle={halle} masse={masse} setzen={setzen} />}
      </div>
      <div className={gruppe}>
        <Gruppenkopf>Maße</Gruppenkopf>
        <div className="grid grid-cols-2 gap-2">
          <MeterFeld label="Breite" cm={halle.breite} min={300} setzen={(v) => aendernHalle({ breite: v }, "Breite")} />
          <MeterFeld label="Länge" cm={halle.laenge} min={300} setzen={(v) => aendernHalle({ laenge: v }, "Länge")} />
        </div>
      </div>
      <div className={gruppe}>
        <Gruppenkopf>Gänge</Gruppenkopf>
        <div className="grid grid-cols-2 gap-2">
          <MeterFeld label="Gang mindestens" cm={halle.gang} min={50} max={1000} setzen={(v) => aendernHalle({ gang: v }, "Gangbreite")} />
          {hg.lage !== "keiner" && <MeterFeld label="Hauptgang" cm={hg.breite} min={50} max={2000} setzen={(v) => aendernHalle({ hauptgang: { ...hg, breite: v } }, "Hauptgang")} />}
        </div>
        <Feld label="Lage Hauptgang">
          {(id) => (
            <Auswahl
              id={id}
              value={hg.lage}
              onChange={(e) => {
                const lage = e.target.value as typeof hg.lage;
                void aendernHalle({ hauptgang: { lage, breite: lage === "keiner" ? 0 : hg.breite || HAUPTGANG_STANDARD.breite } }, "Hauptgang");
              }}
            >
              {(["anfang", "ende", "beide", "mitte", "keiner"] as const).map((l) => (
                <option key={l} value={l}>
                  {HAUPTGANG_LAGE[richtung][l]}
                </option>
              ))}
            </Auswahl>
          )}
        </Feld>
      </div>
      <div className={gruppe}>
        <Gruppenkopf>Reihen</Gruppenkopf>
        <div className="flex gap-0.5 rounded-md border border-linie-stark bg-papier p-0.5" role="radiogroup" aria-label="Reihen laufen">
          {(["quer", "laengs"] as const).map((x) => (
            <button
              key={x}
              type="button"
              role="radio"
              aria-checked={richtung === x}
              className={`min-h-8 flex-1 rounded text-sm ${richtung === x ? "bg-weiss font-semibold text-tinte shadow-sm" : "text-grau hover:text-tinte"}`}
              onClick={() => richtung !== x && void aendernHalle({ richtung: x }, "Reihenrichtung")}
            >
              {x === "quer" ? "quer" : "längs"}
            </button>
          ))}
        </div>
        <Feld label="Einzelreihen an den Wänden">
          {(id) => (
            <Auswahl
              id={id}
              value={!halle.wandreihen ? "keine" : (halle.wandreiheSeite ?? "beide")}
              onChange={(e) => {
                const w = e.target.value;
                void aendernHalle(w === "keine" ? { wandreihen: false, wandreiheSeite: undefined } : { wandreihen: true, wandreiheSeite: w === "beide" ? undefined : (w as WandSeite) }, "Wandreihen");
              }}
            >
              <option value="beide">an beiden Wänden</option>
              <option value="anfang">nur {wandText(halle, "anfang")}</option>
              <option value="ende">nur {wandText(halle, "ende")}</option>
              <option value="keine">keine</option>
            </Auswahl>
          )}
        </Feld>
        <Haken label="bündig an Wänden ohne Eingang" checked={halle.wandBuendig ?? true} onChange={(v) => void aendernHalle({ wandBuendig: v }, "bündig")} />
      </div>
      <details className="border-t border-linie pt-4">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-grau hover:text-tinte">Grundplatten je Käfigart</summary>
        <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-3">
          {BLOCK_TYPEN.map((t) => {
            const mass = kaefigMass(t, masse);
            const vorgabe = mass ? kaefigeJePlatte(t, mass.breite, { platte: halle.platte, plattenMass: halle.plattenMass }) : null;
            return <JePlatteFeld key={t} label={kaefigName(t, masse)} wert={halle.jePlatte?.[t]} vorgabe={vorgabe} setzen={(v) => aendernHalle({ jePlatte: { ...(halle.jePlatte ?? {}), [t]: v } }, "Käfige je Platte")} />;
          })}
        </div>
      </details>
      <div className={gruppe}>
        <Gruppenkopf>Aufstellung</Gruppenkopf>
        <Knopf className="w-full justify-start" onClick={vorschlaege}>
          <WzSymbol name="vorschlaege" klein />
          Stellvorschläge ansehen
        </Knopf>
      </div>
      <div className="flex flex-col gap-2 border-t border-linie pt-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <Gruppenkopf>Plan</Gruppenkopf>
        </div>
        <AutomatikSchalter an={!plan.fest} umschalten={automatik} festAm={plan.fest ? new Date(plan.fest.am).toLocaleDateString("de-DE") : null} />
      </div>
    </div>
  );
}

/**
 * Wand, an der Einzelreihen stehen können, wie sie in der Zeichnung liegt: Die Reihen folgen bei „quer“ entlang der Länge
 * aufeinander, bei „längs“ entlang der Breite; die Zeichnung legt die lange Seite waagrecht.
 */
function wandText(halle: Pick<Halle, "richtung" | "breite" | "laenge">, seite: WandSeite): string {
  const entlangLaenge = (halle.richtung ?? "quer") === "quer";
  const laengeWaagrecht = halle.laenge > halle.breite;
  const waagrecht = entlangLaenge === laengeWaagrecht;
  return waagrecht ? (seite === "anfang" ? "links" : "rechts") : seite === "anfang" ? "oben" : "unten";
}

/** Käfige je Grundplatte für eine Käfigart; leer = Vorgabe (grau im Feld). */
function JePlatteFeld({ label, wert, vorgabe, setzen }: { label: string; wert: number | undefined; vorgabe: number | null; setzen: (v: number | undefined) => Promise<boolean> }) {
  const [text, setText] = useState(wert ? String(wert) : "");
  useEffect(() => setText(wert ? String(wert) : ""), [wert]);
  const laeuft = useRef(false);
  const textRef = useRef(text);
  textRef.current = text;
  const uebernehmen = async () => {
    if (laeuft.current) return;
    const t = textRef.current;
    const n = t.trim() ? Math.round(Number(t.replace(",", "."))) : undefined;
    if (n !== undefined && (!Number.isFinite(n) || n < 1 || n > 20)) return setText(wert ? String(wert) : "");
    if (n === wert) return;
    laeuft.current = true;
    try {
      if (!(await setzen(n))) setText(wert ? String(wert) : "");
    } finally {
      laeuft.current = false;
    }
  };
  return (
    <Feld label={label}>
      {(id) => <Eingabe id={id} inputMode="numeric" placeholder={vorgabe ? `${vorgabe} (Vorgabe)` : "Maß fehlt"} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => void uebernehmen()} onKeyDown={(e) => enterUebernimmt(e, uebernehmen)} className="tabular-nums" />}
    </Feld>
  );
}

/**
 * Name einer Fläche: speichert kurz nach dem Tippen, beim Verlassen und beim Wechsel der Auswahl (Aufräumen) – immer für
 * die Fläche, für die das Feld geöffnet wurde.
 */
function NameFeld({ i, name, aendern, breit }: { i: number; name: string; aendern: Aendern; breit?: boolean }) {
  const [wert, setWert] = useState(name);
  const stand = useRef({ wert: name, gespeichert: name });
  const uhr = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sichern = () => {
    if (uhr.current) clearTimeout(uhr.current);
    uhr.current = null;
    const neu = stand.current.wert.trim().slice(0, 100);
    if (!neu || neu === stand.current.gespeichert) return;
    stand.current.gespeichert = neu;
    aendern((h) => ({ ...h, flaechen: h.flaechen.map((f, j) => (j === i ? { ...f, name: neu } : f)) }), { was: "Umbenennen" });
  };
  const sichernRef = useRef(sichern);
  sichernRef.current = sichern;
  useEffect(() => () => sichernRef.current(), []);
  return (
    <Eingabe
      aria-label="Name der Fläche"
      value={wert}
      maxLength={100}
      onChange={(e) => {
        setWert(e.target.value);
        stand.current.wert = e.target.value;
        if (uhr.current) clearTimeout(uhr.current);
        uhr.current = setTimeout(() => sichernRef.current(), 700);
      }}
      onBlur={() => sichernRef.current()}
      onKeyDown={(e) => e.key === "Enter" && sichernRef.current()}
      className={breit ? "w-full py-1" : "w-32 shrink-0 py-1 sm:w-48"}
    />
  );
}

const HAUPTGANG_LAGE: Record<"quer" | "laengs", Record<"anfang" | "ende" | "beide" | "mitte" | "keiner", string>> = {
  quer: { anfang: "an der linken Längsseite", ende: "an der rechten Längsseite", beide: "an beiden Längsseiten", mitte: "längs durch die Mitte", keiner: "kein Hauptgang" },
  laengs: { anfang: "an der vorderen Stirnseite", ende: "an der hinteren Stirnseite", beide: "an beiden Stirnseiten", mitte: "quer durch die Mitte", keiner: "kein Hauptgang" },
};

/** Grundplatten zusammen nach Käfigart: „12 × 70 × 70 × 70 cm (3 je Platte), 8 × 50 × 50 × 50 cm (4 je Platte)“. Eine
 * gemischte Platte (Rest mit der nächsten Käfigart belegt) zählt bei der Art, mit der sie beginnt, als „gemischt“. */
function plattenJeArt(reihen: Reihe[], masse: KaefigMasse): string {
  const n = new Map<string, { typ: KaefigTyp; plaetze: number; gemischt: boolean; anzahl: number }>();
  for (const pl of reihen.flatMap((r) => r.platten.filter((p) => !p.entfernt))) {
    const k = pl.gemischt ? `${pl.typ}|gemischt` : `${pl.typ}|${pl.plaetze}`;
    const z = n.get(k) ?? { typ: pl.typ as KaefigTyp, plaetze: pl.plaetze, gemischt: !!pl.gemischt, anzahl: 0 };
    z.anzahl++;
    n.set(k, z);
  }
  return [...n.values()].map((z) => `${z.anzahl} × ${kaefigName(z.typ, masse)} (${z.gemischt ? "gemischt" : `${z.plaetze} je Platte`})`).join(", ") || "–";
}

/** Käfige auf einer Grundplatte je Art (belegt und frei): „1 × 70 × 70 × 70 cm, 3 × 40 × 40 × 40 cm“. */
function plattenKaefige(r: Reihe, i: number, masse: KaefigMasse): string {
  const n = new Map<KaefigTyp, number>();
  for (const k of [...r.kaefige, ...(r.freiePlaetze ?? [])]) if (k.platte === i) n.set(k.typ as KaefigTyp, (n.get(k.typ as KaefigTyp) ?? 0) + 1);
  return [...n].map(([t, a]) => `${a} × ${kaefigName(t, masse)}`).join(", ");
}

/**
 * Stellvorschläge: dieselbe Halle in anderen Aufstellungen (Reihen quer oder längs, Wandreihen, bündig an Wänden, Lage des
 * Hauptgangs), mit Eingängen, Flächen und eingesetzten Teilen durchgerechnet; ein Vorschlag lässt sich übernehmen.
 */
function StellVorschlaege({
  schauId,
  d,
  entwurf,
  basis,
  schliessen,
  eingebettet = false,
  schmal = false,
}: {
  schauId: number;
  d: Daten;
  /** Noch nicht gespeicherte Halle (geführter Ablauf); dann gilt `basis`: der gespeicherte Stand beim Öffnen. */
  entwurf?: Halle;
  basis?: string;
  schliessen: () => void;
  eingebettet?: boolean;
  /** In der Schublade des Editors: höchstens zwei Spalten. */
  schmal?: boolean;
}) {
  const gespeichert = trpc.katalog.stellVorschlaege.useQuery({ schauId }, { enabled: !entwurf });
  // Entwurf als POST (viele Teile sprengen sonst die Länge der Adresse); neu, sobald sich der Entwurf ändert.
  const ent = trpc.katalog.stellVorschlaegeEntwurf.useMutation();
  const entwurfText = entwurf ? JSON.stringify(entwurf) : "";
  useEffect(() => {
    if (entwurf) ent.mutate({ schauId, entwurf });
  }, [entwurfText]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = entwurf
    ? { data: ent.data, error: ent.error, isFetching: ent.isPending, refetch: () => entwurf && ent.mutate({ schauId, entwurf }) }
    : gespeichert;
  const [konflikt, setKonflikt] = useState(false);
  const [nurAlle, setNurAlle] = useState(false);
  // Gespeicherte Halle inzwischen geändert (Editor, Formular, Käfige): neu rechnen lassen.
  const stand = halleSchluessel(d.halle ?? null);
  const veraltet = !entwurf && !!gespeichert.data && gespeichert.data.basis !== stand;
  useEffect(() => {
    if (veraltet && !gespeichert.isFetching) void gespeichert.refetch();
  }, [veraltet, stand]); // eslint-disable-line react-hooks/exhaustive-deps
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  // Übernehmen heißt neu setzen (Einstellungen und neue Aufstellung in einem Schritt); Abschluss (neu laden, Meldung,
  // schließen) danach – siehe Knopf „Übernehmen“.
  const uebernehmen = trpc.katalog.planNeuSetzen.useMutation({
    onError: async (e) => {
      meldung(fehlerText(e), "fehler");
      if (e.data?.code === "CONFLICT" || /inzwischen/.test(e.message)) setKonflikt(true);
      // Abgelehnt, weil die Halle inzwischen geändert wurde: Plan und Vorschläge neu laden.
      await Promise.all([utils.katalog.hallenplan.invalidate(), utils.katalog.stellVorschlaege.invalidate()]);
    },
  });
  const fest = !!d.plan?.fest;
  const richterIndex = new Map(d.richter.map((r, i) => [r.id, i]));
  const karte = (v: NonNullable<typeof q.data>["aktuell"], aktuell: boolean) => (
    <div key={v.titel + String(aktuell)} className={`flex flex-col gap-2 rounded-lg border border-linie p-3 ${aktuell ? "bg-papier" : "bg-weiss"}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{aktuell ? (entwurf ? "Mit Ihren Einstellungen" : "So wie jetzt") : v.titel}</p>
          {aktuell && <p className="text-sm text-grau">{v.titel}</p>}
        </div>
        {v.nichtPlatziert === 0 ? <Marke ton="ok">Alle haben Platz</Marke> : <Marke ton="fehler">{v.nichtPlatziert} ohne Platz</Marke>}
      </div>
      <p className="text-sm tabular-nums text-grau">
        {v.freiePlatten} Grundplatten frei · {v.reihen} Reihen mit Käfigen
      </p>
      {v.hinweise.length > 0 && <p className="text-sm text-kamm">{v.hinweise.join(" ")}</p>}
      <div>
        <PlanBild klein halle={v.halle} plan={v.plan} richterIndex={richterIndex} bearbeiten={false} auswahl={[]} waehlen={() => {}} aendern={(f) => f(v.halle)} />
      </div>
      {(!aktuell || entwurf) && (
        <Knopf
          className="self-start"
          variante="primaer"
          disabled={veraltet}
          laedt={uebernehmen.isPending}
          onClick={async () => {
            if (
              !(await bestaetige(
                fest
                  ? { titel: "Plan neu setzen und übernehmen?", text: "Alle Käfige werden in dieser Aufstellung neu aufgestellt.", knopf: "Neu setzen und übernehmen", gefahr: true }
                  : { titel: "Diese Aufstellung übernehmen?", text: "Verschobenes und eingesetzte Teile fallen weg.", knopf: "Übernehmen" },
              ))
            )
              return;
            try {
              await uebernehmen.mutateAsync({ schauId, basis: entwurf ? (basis ?? q.data!.basis) : q.data!.basis, halle: v.halle, grund: "Stellvorschlag übernommen" });
            } catch {
              return;
            } finally {
              await Promise.all([utils.katalog.hallenplan.invalidate(), utils.katalog.stellVorschlaege.invalidate()]);
            }
            meldung("Aufstellung übernommen.");
            schliessen();
          }}
        >
          Übernehmen
        </Knopf>
      )}
    </div>
  );
  const inhalt = (
    <>
      {konflikt && entwurf && (
        <Hinweis ton="fehler" className="mb-3">
          Halle inzwischen anderswo gespeichert – bitte neu öffnen.
        </Hinweis>
      )}
      {veraltet && <Hinweis className="mb-3">Halle geändert – Vorschläge werden neu gerechnet …</Hinweis>}
      {q.error ? (
        <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />
      ) : !q.data ? (
        <Laden />
      ) : (
        <>
          {q.data.vorschlaege.length === 0 && (
            <div className="mb-3">
              <Leer titel="Keine andere Aufstellung möglich" />
            </div>
          )}
          {q.data.vorschlaege.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
              <p className="tabular-nums text-grau">
                <span className="font-semibold text-tinte">{anzahl(q.data.vorschlaege.length, "Aufstellung", "Aufstellungen")}</span> · {q.data.vorschlaege.filter((v) => v.nichtPlatziert === 0).length} mit Platz für alle
              </p>
              <Haken label="Nur mit Platz für alle" checked={nurAlle} onChange={setNurAlle} />
            </div>
          )}
          <div className={`grid gap-4 ${schmal ? "sm:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}>
            {(entwurf || q.data.vorschlaege.length > 0) && karte(q.data.aktuell, true)}
            {q.data.vorschlaege.filter((v) => !nurAlle || v.nichtPlatziert === 0).map((v) => karte(v, false))}
          </div>
        </>
      )}
    </>
  );
  if (eingebettet) return inhalt;
  return (
    <Abschnitt titel="Stellvorschläge" className="nicht-drucken" aktionen={<Knopf variante="leise" onClick={schliessen}>Schließen</Knopf>}>
      {inhalt}
    </Abschnitt>
  );
}

/** Tiefe, mit der ein Eingang in die Halle gezeichnet wird (die Reihen halten davon ohnehin einen Gang Abstand). */
const EINGANG_TIEFE = 50;

/**
 * Lage in der Zeichnung (lange Seite waagrecht, wie im Plan) ↔ Hallenkoordinaten (x entlang der Breite, y entlang der
 * Länge). Bei Reihen quer zur Halle liegt die Länge waagrecht.
 */
function zeichenSystem(breite: number, laenge: number) {
  const quer = laenge > breite;
  const W = quer ? laenge : breite;
  const H = quer ? breite : laenge;
  const zuZeichnung = (f: { x: number; y: number; breite: number; tiefe: number }) => (quer ? { x: f.y, y: f.x, b: f.tiefe, h: f.breite } : { x: f.x, y: f.y, b: f.breite, h: f.tiefe });
  return { W, H, zuZeichnung };
}

/** Skizze der Halle für „Halle einrichten“: Umriss mit Metern, Eingänge dunkel, Freiflächen schraffiert, Volierenbereich grün. */
function HallenSkizze({ breite, laenge, flaechen }: { breite: number; laenge: number; flaechen: HallenFlaeche[] }) {
  const muster = useId().replace(/:/g, "");
  if (!(breite > 0 && laenge > 0)) return <div />;
  const zs = zeichenSystem(breite, laenge);
  const rand = Math.max(zs.W, zs.H) * 0.06;
  const schrift = Math.max(zs.W, zs.H) * 0.03;
  return (
    <figure className="immer-hell rounded-md border border-linie bg-weiss p-2">
      <svg viewBox={`${-rand} ${-rand} ${zs.W + 2 * rand} ${zs.H + 2 * rand}`} className="h-auto w-full" role="img" aria-label="Skizze der Halle">
        <defs>
          <pattern id={`${muster}-frei`} width={schrift} height={schrift} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2={schrift} stroke={BAU.platte.stroke} strokeWidth={schrift * 0.15} />
          </pattern>
        </defs>
        <rect x={0} y={0} width={zs.W} height={zs.H} fill="#fbfaf7" stroke="#2b2b2b" strokeWidth={rand * 0.12} />
        {flaechen.map((f, i) => {
          const q = zs.zuZeichnung(f);
          const fuell = f.art === "eingang" ? "#1f2a44" : f.art === "volieren" ? "#e3f1e7" : `url(#${muster}-frei)`;
          return (
            <g key={i}>
              <rect x={q.x} y={q.y} width={q.b} height={q.h} fill={fuell} stroke={f.art === "volieren" ? "#3c8a55" : "#555"} strokeWidth={rand * 0.05} strokeDasharray={f.art === "volieren" ? `${schrift * 0.4} ${schrift * 0.3}` : undefined} />
              <text x={q.x + q.b / 2} y={f.art === "eingang" ? (q.y < zs.H / 2 ? q.y + q.h + schrift * 1.1 : q.y - schrift * 0.4) : q.y + q.h / 2} fontSize={schrift} textAnchor="middle" dominantBaseline="middle" fill="#2b2b2b">
                {f.name}
              </text>
            </g>
          );
        })}
        <text x={zs.W / 2} y={-rand * 0.35} fontSize={schrift} textAnchor="middle" fill="#555">{meter(zs.W)} m</text>
        <text x={-rand * 0.35} y={zs.H / 2} fontSize={schrift} textAnchor="middle" fill="#555" transform={`rotate(-90 ${-rand * 0.35} ${zs.H / 2})`}>{meter(zs.H)} m</text>
      </svg>
    </figure>
  );
}

/** `gueltig: false` – die Zahlenfelder sind (noch) unvollständig; die Skizze zeigt Ersatzwerte, gezogen wird dann nicht. */
