/**
 * Bedienung der Hallenplan-Zeichnung: Teile greifen, ziehen und loslassen (mit Prüfung gegen Wände und andere Teile),
 * Auswahlrahmen, Fläche aufziehen, Pfeiltasten, Drehen, eine Doppelreihe an die Wand ziehen und die Vorschau während
 * des Ziehens (`versatz`, `verschoben`, `reiheImEntwurf`). Die Zeichnung selbst steht in hallenplan-bild.tsx.
 */
import { anKantenEinrasten, serverText, type Halle, type HallenFlaeche, type HallenTeil, pruefeVerschiebung, type Rechteck, type Reihe, type VerschiebePruefung, verschiebeTeile, wandAusrichtung, wandDrehungenAnwenden, type WandSeite, wandSeiteVon } from "@schau/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOberflaeche, useSprache } from "../sprache";
import { type Aendern, drehPruefung, freierPlatz, gedreht, gleich, groesseAendern, innen, type Plan, planKoerper, plattenDa, type Rahmen, RASTER, raster, reihenLage, vollstaendig, wandKandidatenImEntwurf, type Ziel, type Zug, zahlWort, zuTeilen } from "./hallenplan-geometrie";

export function usePlanBedienung({ halle, plan, bearbeiten, auswahl, waehlen, aendern, mehrfach, melden, pfeilRef, zeichnen, gezeichnet, anWand, quer, svgRef }: {
  halle: Halle;
  plan: Plan;
  bearbeiten: boolean;
  auswahl: Ziel[];
  waehlen: (z: Ziel[]) => void;
  aendern: Aendern;
  mehrfach: boolean;
  melden?: (text: string) => void;
  pfeilRef?: React.MutableRefObject<((e: KeyboardEvent) => boolean) | null>;
  zeichnen: HallenFlaeche["art"] | null;
  gezeichnet?: (q: Rechteck, klick: boolean) => void;
  anWand?: (nr: number, seite: WandSeite) => void;
  /** Die Halle liegt in der Zeichnung quer (länger als breit). */
  quer: boolean;
  svgRef: { current: SVGSVGElement | null };
}) {
  const tb = useOberflaeche().halleBild.bedienung;
  const sprache = useSprache();
  /** Meldungen der Fachlogik (Prüfung der Lage) kommen deutsch: in der Sprache der Oberfläche melden. */
  const meldeFach = (text: string) => melden?.(serverText(text, sprache));
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
    if (!pr.ok) return meldeFach(pr.meldung);
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
      { was: tb.verschieben, festschreiben: ziele.some((t) => t.art === "reihe" || t.art === "platte") },
    );
    if (gedreht) melden?.(gedreht === 1 ? tb.anWandGedrehtEins : tb.anWandGedreht(zahlWort(gedreht, tb.teile)));
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
    if (!pr.ok) return meldeFach(pr.meldung);
    aendern((h) => gedreht(h, t), { was: tb.drehen, festschreiben: t.art === "reihe" || t.art === "platte" });
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
          "aria-label": tb.bedienen(name),
          "aria-pressed": auswahl.some((a) => gleich(a, z)),
          className: "cursor-move focus:outline-none",
        }
      : {};
  const markiert = (z: Ziel) => bearbeiten && auswahl.some((a) => gleich(a, z));
  return { bedienbar, drehen, ergaenzen, gegriffen, greifen, hallenPunkt, loslassen, markiert, pfeilWeg, rahmen, rahmenRef, reiheImEntwurf, setRahmen, setZug, versatz, verschiebeAuswahl, verschoben, ziehen, zug, zugRef };
}
