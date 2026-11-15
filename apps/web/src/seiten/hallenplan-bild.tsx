/**
 * Zeichnung des Hallenplans (`PlanBild`): Reihen, Käfige, Flächen und Objekte als SVG, Auswahl, Ziehen und Zoomen.
 */
import { anKantenEinrasten, type Blick, blockPlatz, dreheBlick, etagenStreifen, etagenVon, frontDerReihe, type Halle, type HallenFlaeche, type HallenObjekt, type HallenTeil, istMoebel, kaefigKanten, kaefigName, type KaefigPlatz, type KaefigTyp, type MoebelArt, moebelStuecke, objektFront, type PlanKaefig, pruefeVerschiebung, type Rechteck, type Reihe, reihenSchilder, RICHTER_FARBE, richterFarbe, richterSchraffur, type Strecke, type VerschiebePruefung, verschiebeTeile, wandAusrichtung, wandDrehungenAnwenden, type WandSeite, wandSeiteVon } from "@schau/domain";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Aendern, BAU, type Daten, drehPruefung, freierPlatz, gedreht, gleich, groesseAendern, huelle, innen, meter, objektLage, planKoerper, plattenDa, platzWeg, type Rahmen, RAND_CM, RASTER, raster, reihenLage, vollstaendig, wandKandidatenImEntwurf, type Ziel, zielPlaetze, type Zug, zuTeilen } from "./hallenplan-geometrie";
import { Muster } from "./hallenplan-teile";

export function PlanBild({
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
