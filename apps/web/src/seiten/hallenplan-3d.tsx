/**
 * Hallenplan in 3D: die Halle räumlich – drehen, zoomen, verschieben, von oben oder im Gang in Augenhöhe, mit Tasten oder
 * Steuerkreuz gehen und als automatischer Rundgang durch die Gänge. Die Körper rechnet die Fachlogik (`hallenSzene`) aus
 * demselben Plan wie die 2D-Zeichnung; die Szene baut hallenplan-3d-welt.ts. three.js lädt nur mit dieser Seite
 * (dynamischer Import), die übrigen Seiten bleiben klein.
 */
import { aussehenVon, verkleidungVon, hallenSzene, LOCALE, richterFarbe, type Halle, type Hallenplan, type KaefigMasse, type Aufsteller, type SzeneTier, KAEFIG_TYP_LABEL } from "@schau/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOberflaeche, useSprache } from "../sprache";
import { ot } from "../sprache-jetzt";
import { HilfeLink, Knopf, KnopfLink } from "../ui";
import { hell } from "./hallenplan-3d-bausteine";
import { Steuerkreuz } from "./hallenplan-3d-steuerkreuz";
import { type Richtung, TASTE } from "./hallenplan-3d-steuerung";
import { type Ansicht, baueWelt, type Treffer, type Welt } from "./hallenplan-3d-welt";

export default function Hallenplan3D({
  halle,
  plan,
  masse,
  aufsteller,
  farben,
  richter,
  richterIndex,
  seite,
  schauId,
}: {
  halle: Halle;
  plan: Hallenplan;
  masse: KaefigMasse;
  aufsteller: Aufsteller;
  farben: [number, string][];
  richter: { id: number; name: string }[];
  richterIndex: Map<number, number>;
  /** Eigene Seite (eigener Tab): Stand der Daten, neu laden, zurück zum Hallenplan, Name der Schau. */
  seite: { stand: number; laedt: boolean; aktualisieren: () => void; zurueck: string; schau: string };
  /** Für die Bild-Adresse des Logos der Sockelverkleidung. */
  schauId: number;
}) {
  const texte = useOberflaeche();
  const t = texte.halleBild.dreiD;
  const sprache = useSprache();
  const szene = useMemo(() => hallenSzene(halle, plan, masse, aufsteller, new Map(farben)), [halle, plan, masse, aufsteller, farben]);
  const kastenRef = useRef<HTMLDivElement>(null);
  const rahmenRef = useRef<HTMLDivElement>(null);
  const welt = useRef<Welt | null>(null);
  const [ansicht, setAnsicht] = useState<Ansicht>("rundum");
  // Nach dem Neuladen bleibt die gewählte Ansicht.
  const ansichtRef = useRef<Ansicht>("rundum");
  ansichtRef.current = ansicht;
  const [zeiger, setZeiger] = useState<{ x: number; y: number; text: string[] } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [rundgang, setRundgang] = useState(false);
  // Folie über dem Boden: Startwert aus der Einstellung der Halle; der Schalter hier wirkt nur auf die Ansicht (speichert nicht).
  const folieGespeichert = aussehenVon(halle.aussehen).abdeckung;
  const [folie, setFolie] = useState(folieGespeichert);
  useEffect(() => setFolie(folieGespeichert), [folieGespeichert]);
  const folieRef = useRef(folie);
  folieRef.current = folie;
  const richterName = useMemo(() => new Map(richter.map((r) => [r.id, r.name])), [richter]);

  useEffect(() => {
    const kasten = kastenRef.current;
    if (!kasten) return;
    let w: Welt;
    try {
      w = baueWelt(kasten, szene, richterIndex, schauId, verkleidungVon(aufsteller), setRundgang);
    } catch {
      setFehler(ot().halleBild.dreiD.keinWebgl);
      return;
    }
    welt.current = w;
    w.folie(folieRef.current);
    w.ansicht(ansichtRef.current);
    const beiZeigen = (e: PointerEvent) => {
      if (e.pointerType === "touch" && e.buttons) return;
      const k = w.treffer(e);
      setZeiger(k ? { x: e.clientX, y: e.clientY, text: kaefigText(k, richterName) } : null);
    };
    const weg = () => setZeiger(null);
    w.renderer.domElement.addEventListener("pointermove", beiZeigen);
    w.renderer.domElement.addEventListener("pointerleave", weg);
    // Antippen am Tablet zeigt die Angaben auch.
    w.renderer.domElement.addEventListener("pointerup", beiZeigen);
    return () => {
      w.renderer.domElement.removeEventListener("pointermove", beiZeigen);
      w.renderer.domElement.removeEventListener("pointerleave", weg);
      w.renderer.domElement.removeEventListener("pointerup", beiZeigen);
      w.entsorgen();
      welt.current = null;
      setRundgang(false);
    };
  }, [szene, richterIndex, richterName]);

  // Tasten im ganzen Fenster, gleichmäßig solange gedrückt (TASTE); Umschalt schneller, Esc hält den Rundgang an.
  // Nicht in Eingabefeldern und nicht mit Strg, ⌘ oder Alt (Tastenkürzel des Browsers).
  useEffect(() => {
    // Losgelassen wird über die physische Taste (`code`): Mit Umschalt meldet „+“ beim Loslassen „*“, „-“ meldet „_“.
    const gehalten = new Map<string, Richtung>();
    const fremd = (e: KeyboardEvent) => e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof HTMLElement && !!e.target.closest("input, textarea, select, [contenteditable]"));
    const weg = () => {
      gehalten.clear();
      welt.current?.bewegung.loslassen();
    };
    const runter = (e: KeyboardEvent) => {
      const b = welt.current?.bewegung;
      if (!b) return;
      if (e.key === "Shift") return b.schnell(true);
      // Mit ⌘ oder Strg kommt das Loslassen anderer Tasten am Mac oft nicht an.
      if (e.key === "Meta" || e.key === "Control") return weg();
      if (fremd(e)) return;
      if (e.key === "Escape") return b.anhalten();
      const r = TASTE[e.key.toLowerCase()];
      if (!r) return;
      e.preventDefault();
      if (e.repeat) return;
      gehalten.set(e.code, r);
      b.halten(r, true);
    };
    const hoch = (e: KeyboardEvent) => {
      const b = welt.current?.bewegung;
      if (!b) return;
      if (e.key === "Shift") return b.schnell(false);
      const r = gehalten.get(e.code);
      if (!r) return;
      gehalten.delete(e.code);
      // Hält noch eine andere Taste dieselbe Richtung (W und ↑), bleibt sie gedrückt.
      if (![...gehalten.values()].includes(r)) b.halten(r, false);
    };
    window.addEventListener("keydown", runter);
    window.addEventListener("keyup", hoch);
    window.addEventListener("blur", weg);
    return () => {
      window.removeEventListener("keydown", runter);
      window.removeEventListener("keyup", hoch);
      window.removeEventListener("blur", weg);
    };
  }, []);

  useEffect(() => {
    rahmenRef.current?.focus();
  }, []);

  const waehle = (a: Ansicht) => {
    setAnsicht(a);
    welt.current?.ansicht(a);
  };

  const belegt = szene.kaefige.filter((k) => k.tier).length;
  const legende = richter.filter((r) => richterIndex.has(r.id));
  return (
    <main ref={rahmenRef} aria-label={t.hallenplan} tabIndex={-1} className="fixed inset-0 flex flex-col bg-weiss outline-none">
      <div className="flex flex-wrap items-center gap-2 border-b border-linie px-3 py-2">
        <h1 className="mr-2 text-lg font-semibold">{t.halle}{seite.schau ? <span className="font-normal text-grau"> · {seite.schau}</span> : null}</h1>
        <span className="text-sm text-grau">
          {t.zahlen(belegt, szene.kaefige.length - belegt, szene.volieren.length, new Date(seite.stand).toLocaleTimeString(LOCALE[sprache], { hour: "2-digit", minute: "2-digit" }))}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {(
            [
              ["rundum", t.rundum],
              ["oben", t.vonOben],
              ["gang", t.imGang],
            ] as const
          ).map(([a, text]) => (
            <Knopf key={a} variante={ansicht === a ? "primaer" : "zweit"} aria-pressed={ansicht === a} onClick={() => waehle(a)}>
              {text}
            </Knopf>
          ))}
          <Knopf
            variante={folie ? "primaer" : "zweit"}
            aria-pressed={folie}
            onClick={() => {
              setFolie(!folie);
              welt.current?.folie(!folie);
            }}
          >
            {t.folie}
          </Knopf>
          <Knopf variante={rundgang ? "primaer" : "zweit"} disabled={szene.rundgang.length < 2} onClick={() => welt.current?.bewegung.rundgang(!rundgang)}>
            {rundgang ? t.rundgangAnhalten : t.rundgang}
          </Knopf>
          <Knopf onClick={() => void welt.current?.herunterladen().catch(() => setFehler(t.modellFehler))}>{t.herunterladen}</Knopf>
          <Knopf laedt={seite.laedt} onClick={seite.aktualisieren}>
            {t.neuLaden}
          </Knopf>
          <HilfeLink abschnitt="hallenplan-3d">{t.hilfe}</HilfeLink>
          <KnopfLink href={seite.zurueck}>{t.zumHallenplan}</KnopfLink>
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={kastenRef} className="absolute inset-0 touch-none" />
        {!fehler && <Steuerkreuz bewegung={() => welt.current?.bewegung} zentrieren={() => waehle(ansicht)} />}
        {fehler && <p className="absolute left-3 top-3 rounded-md bg-weiss px-3 py-2 text-sm text-kamm shadow">{fehler}</p>}
        {legende.length > 0 && (
          <ul className="pointer-events-none absolute bottom-3 left-3 flex max-w-[60%] flex-wrap gap-x-3 gap-y-1 rounded-md bg-weiss/90 px-3 py-2 text-xs shadow" aria-label={texte.allgemein.preisrichter}>
            {legende.map((r) => (
              <li key={r.id} className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-sm border border-linie" style={{ background: hell(richterFarbe(richterIndex.get(r.id)!)) }} />
                {r.name}
              </li>
            ))}
          </ul>
        )}
        {zeiger && (
          <div className="pointer-events-none fixed z-50 rounded-md bg-kopf px-2.5 py-1.5 text-[13px] text-auf-kopf shadow" style={{ left: zeiger.x + 14, top: zeiger.y + 14 }}>
            {zeiger.text.map((t, i) => (
              <div key={i} className={i === 0 ? "font-semibold" : ""}>
                {t}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

/** Angaben beim Draufzeigen: Nummer und Rasse, nie der Aussteller. */
function kaefigText(k: Treffer, richterName: Map<number, string>): string[] {
  const o = ot();
  const d = o.halleBild.dreiD;
  if (k.art === "voliere") {
    // Name der Voliere aus der Fachlogik („Voliere 3“): die Bezeichnung in der Sprache der Oberfläche.
    const name = k.name.replace(new RegExp(`^${KAEFIG_TYP_LABEL.voliere}`), o.fach.KAEFIG_TYP_LABEL.voliere);
    return k.tier ? [`${k.tier.nr ? d.nr(k.tier.nr) : ""}${k.tier.rasse}`, name, ...richterZeile(k.tier, richterName)] : [name, d.frei];
  }
  const t = k.kaefig.tier;
  if (!t) return [d.freierPlatz, `${o.fach.KAEFIG_TYP_LABEL[k.kaefig.typ]} · ${k.kaefig.ort}`];
  return [`${t.nr ? d.nr(t.nr) : ""}${t.rasse}`, `${t.sparte} · ${k.kaefig.ort}`, ...richterZeile(t, richterName)];
}

const richterZeile = (t: SzeneTier, n: Map<number, string>) => (t.preisrichterId != null && n.get(t.preisrichterId) ? [ot().halleBild.dreiD.preisrichter(n.get(t.preisrichterId)!)] : []);
