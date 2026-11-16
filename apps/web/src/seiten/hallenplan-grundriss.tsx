/**
 * Grundriss der Halle bearbeiten (Entscheidung 019): Wände ziehen (rechtwinklig, 10-cm-Raster), eine Wand per Doppelklick
 * teilen, „Rechteck“ setzt zurück. Übernommen wird über die Einstellungen der Halle (Rückfrage „Plan neu setzen?“).
 */
import { grundrissUebernehmen, serverText, type Halle, halleSchluessel, halleZumNeuSetzen, type KaefigMasse, type Punkt, pruefeHallenUmriss, pruefeUmriss, rechteckUmriss, umlaufsinn, umrissKanten, umrissMasse, umrissNormal, umrissVon, wandTeilen, wandZiehen } from "@schau/domain";
import { useRef, useState } from "react";
import { useOberflaeche, useSprache } from "../sprache";
import { Dialog, HilfeLink, Hinweis, Knopf } from "../ui";
import { BAU, meter } from "./hallenplan-geometrie";

/** Knopf „Grundriss bearbeiten“ mit dem Dialog. `uebernehmen` gibt true zurück, wenn die Änderung gilt. */
export function GrundrissKnopf({ halle, masse, uebernehmen }: { halle: Halle; masse: KaefigMasse; uebernehmen: (roh: Punkt[], basis: string) => Promise<boolean> }) {
  const [offen, setOffen] = useState(false);
  // Stand der Halle beim Öffnen: hat sie inzwischen jemand anders geändert, wird nicht übernommen.
  const [basis, setBasis] = useState("");
  const t = useOberflaeche().halleBild.grundriss;
  return (
    <>
      <Knopf
        className="self-start"
        onClick={() => {
          setBasis(halleSchluessel(halle));
          setOffen(true);
        }}
      >
        {t.knopf}
      </Knopf>
      <Dialog offen={offen} onSchliessen={() => setOffen(false)} titel={t.titel} breit>
        {offen && (
          <GrundrissEditor
            halle={halle}
            masse={masse}
            abbrechen={() => setOffen(false)}
            fertig={async (roh) => {
              // Erst schließen, wenn der Server gespeichert hat (sonst wäre der gezeichnete Grundriss verloren).
              if (await uebernehmen(roh, basis)) setOffen(false);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

/** Doppelte Ecken hintereinander weg (nach dem Zurückziehen einer Wand); Teilungspunkte bleiben bis zum Übernehmen. */
const ohneDoppelte = (u: Punkt[]) => u.filter((p, i) => {
  const v = u[(i - 1 + u.length) % u.length]!;
  return p.x !== v.x || p.y !== v.y;
});

function GrundrissEditor({ halle, masse, abbrechen, fertig }: { halle: Halle; masse: KaefigMasse; abbrechen: () => void; fertig: (roh: Punkt[]) => Promise<void> }) {
  const texte = useOberflaeche();
  const t = texte.halleBild.grundriss;
  const sprache = useSprache();
  const anfang = umrissVon(halle);
  const [u, setU] = useState<Punkt[]>(anfang);
  const [zug, setZug] = useState<{ i: number; start: Punkt; bild: { x: number; y: number }; d: number; gezogen: boolean } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const gezogen = zug ? ohneDoppelte(wandZiehen(u, zug.i, zug.d)) : u;
  // Über die Gegenwand hinaus gezogen, kehrt sich der Umlaufsinn um: das nicht annehmen (die Wand bleibt am Rand stehen).
  const gespiegelt = umlaufsinn(gezogen) !== umlaufsinn(u);
  const anzeige = gespiegelt ? u : gezogen;
  // Geometrie, dann was nach dem Neu-Setzen bleibt (Flächen, Tische und Bänke) – eingesetzte Blöcke fallen dabei weg.
  // Meldungen der Fachlogik kommen deutsch: in der Sprache der Oberfläche anzeigen.
  const pruefung = pruefeUmriss(umrissNormal(anzeige)) ?? pruefeHallenUmriss(halleZumNeuSetzen(grundrissUebernehmen(halle, anzeige)), masse);
  const fehler = (gespiegelt ? t.nichtUeberGegenwand : null) ?? (pruefung ? serverText(pruefung, sprache) : null);
  const geaendert = JSON.stringify(umrissNormal(anzeige)) !== JSON.stringify(umrissNormal(anfang)) || Math.min(...anzeige.map((p) => p.x)) !== 0 || Math.min(...anzeige.map((p) => p.y)) !== 0;

  // Wie in der Hauptzeichnung: die lange Seite waagrecht.
  const quer = halle.laenge > halle.breite;
  const zuBild = (p: Punkt) => (quer ? { x: p.y, y: p.x } : p);
  // Ausschnitt aus dem Stand vor dem Ziehen (und dem Gezogenen, falls größer): er springt beim Ziehen nicht, sonst
  // verrutschte der Maßstab unter dem Zeiger.
  const alle = [...u, ...anzeige].map(zuBild);
  const minX = Math.min(...alle.map((p) => p.x)), maxX = Math.max(...alle.map((p) => p.x));
  const minY = Math.min(...alle.map((p) => p.y)), maxY = Math.max(...alle.map((p) => p.y));
  const rand = Math.max(maxX - minX, maxY - minY) * 0.18 + 150;
  const schrift = Math.max(maxX - minX, maxY - minY) * 0.028;
  const wand = Math.max(maxX - minX, maxY - minY) * 0.012;

  /** Zeiger in Hallenkoordinaten (cm). */
  const punkt = (e: { clientX: number; clientY: number }): Punkt => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return quer ? { x: p.y, y: p.x } : { x: p.x, y: p.y };
  };
  const kanten = umrissKanten(anzeige);
  const ziehen = (e: React.PointerEvent) => {
    if (!zug) return;
    // Erst ab ein paar Bildpunkten ist es Ziehen (sonst verrückte schon ein Klick des Doppelklicks die Wand).
    if (!zug.gezogen && Math.hypot(e.clientX - zug.bild.x, e.clientY - zug.bild.y) < 4) return;
    const p = punkt(e);
    const k = umrissKanten(u)[zug.i]!;
    const roh = k.aussen === "oben" ? p.y - zug.start.y : k.aussen === "unten" ? zug.start.y - p.y : k.aussen === "links" ? p.x - zug.start.x : zug.start.x - p.x;
    setZug({ ...zug, gezogen: true, d: Math.round(roh / 10) * 10 });
  };
  const loslassen = () => {
    if (!zug) return;
    // Nur gültige Züge übernehmen; sonst springt die Wand zurück (die Meldung stand während des Ziehens da).
    const neu = ohneDoppelte(wandZiehen(u, zug.i, zug.d));
    if (zug.gezogen && zug.d && !gespiegelt && !pruefeUmriss(umrissNormal(neu))) setU(neu);
    setZug(null);
  };
  const m = umrissMasse(anzeige);
  /** Doppelklick: die Wand am nächsten am Zeiger teilen (auf 50 cm). Ausgewertet an der Zeichenfläche, die den Zeiger hält. */
  const teilen = (e: React.MouseEvent) => {
    const p = punkt(e);
    const ks = umrissKanten(u);
    const abstand = (k: (typeof ks)[number]) => (k.y1 === k.y2 ? (p.x >= Math.min(k.x1, k.x2) && p.x <= Math.max(k.x1, k.x2) ? Math.abs(p.y - k.y1) : Infinity) : p.y >= Math.min(k.y1, k.y2) && p.y <= Math.max(k.y1, k.y2) ? Math.abs(p.x - k.x1) : Infinity);
    const i = ks.reduce((b, k, j) => (abstand(k) < abstand(ks[b]!) ? j : b), 0);
    if (abstand(ks[i]!) > wand * 4) return;
    setU(wandTeilen(u, i, Math.round((ks[i]!.y1 === ks[i]!.y2 ? p.x : p.y) / 50) * 50));
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-grau">
        {t.anleitung} <HilfeLink abschnitt="grundriss">{t.hilfe}</HilfeLink>
      </p>
      {/* Wie die Hauptzeichnung immer hell (eine Bauzeichnung), auch im Dunkelmodus. */}
      <div className="immer-hell rounded-md border border-linie bg-weiss">
      <svg
        ref={svgRef}
        viewBox={`${minX - rand} ${minY - rand} ${maxX - minX + 2 * rand} ${maxY - minY + 2 * rand}`}
        className="h-auto max-h-[60vh] w-full touch-none select-none"
        onDoubleClick={teilen}
        onPointerMove={ziehen}
        onPointerUp={loslassen}
        onPointerCancel={() => setZug(null)}
        aria-label={t.bild(meter(m.breite), meter(m.laenge))}
      >
        <path d={`M${anzeige.map((p) => `${zuBild(p).x} ${zuBild(p).y}`).join("L")}Z`} fill={BAU.halle.fill} stroke="none" />
        {/* Eingänge und Flächen zur Orientierung (sie bleiben, wo sie in der Halle stehen). */}
        {halle.flaechen.map((f, i) => {
          const a = zuBild({ x: f.x, y: f.y }), b = zuBild({ x: f.x + f.breite, y: f.y + f.tiefe });
          return <rect key={i} x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} fill="none" stroke="#9aa3b2" strokeWidth={wand * 0.3} strokeDasharray={`${wand} ${wand * 0.6}`} />;
        })}
        {kanten.map((k, i) => {
          const a = zuBild({ x: k.x1, y: k.y1 }), b = zuBild({ x: k.x2, y: k.y2 });
          const waagrecht = a.y === b.y;
          const laenge = Math.abs(k.x2 - k.x1) + Math.abs(k.y2 - k.y1);
          const aussenBild = zuBild({ x: k.aussen === "links" ? -1 : k.aussen === "rechts" ? 1 : 0, y: k.aussen === "oben" ? -1 : k.aussen === "unten" ? 1 : 0 });
          const mx = (a.x + b.x) / 2 + aussenBild.x * schrift * 1.4, my = (a.y + b.y) / 2 + aussenBild.y * schrift * 1.4;
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={zug?.i === i ? "#2d4bd2" : BAU.wand} strokeWidth={wand} strokeLinecap="square" />
              {laenge > 0 && (
                <text x={mx} y={my} fontSize={schrift} textAnchor="middle" dominantBaseline="central" fill="#5b6577">
                  {meter(laenge)} m
                </text>
              )}
              {/* Greiffläche: breiter als die Wand. */}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={wand * 5}
                className={waagrecht ? "cursor-ns-resize" : "cursor-ew-resize"}
                onPointerDown={(e) => {
                  (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
                  setZug({ i, start: punkt(e), bild: { x: e.clientX, y: e.clientY }, d: 0, gezogen: false });
                }}
              />
            </g>
          );
        })}
        {anzeige.map((p, i) => {
          const b = zuBild(p);
          return <circle key={i} cx={b.x} cy={b.y} r={wand * 0.9} fill="#ffffff" stroke={BAU.wand} strokeWidth={wand * 0.35} pointerEvents="none" />;
        })}
      </svg>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm tabular-nums">
          {meter(m.breite)} × {meter(m.laenge)} m
        </span>
        {fehler && <Hinweis ton="warnung">{fehler}</Hinweis>}
        <span className="ml-auto flex flex-wrap gap-2">
          <Knopf onClick={() => setU(rechteckUmriss(halle.breite, halle.laenge))}>{t.rechteck}</Knopf>
          <Knopf variante="leise" onClick={abbrechen}>
            {texte.allgemein.abbrechen}
          </Knopf>
          <Knopf
            variante="primaer"
            disabled={!!fehler || !geaendert}
            laedt={laeuft}
            onClick={async () => {
              setLaeuft(true);
              try {
                await fertig(anzeige);
              } finally {
                setLaeuft(false);
              }
            }}
          >
            {t.uebernehmen}
          </Knopf>
        </span>
      </div>
    </div>
  );
}
