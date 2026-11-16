import {
  KATALOG_AUFTEILUNGEN,
  KATALOG_FARBFAMILIEN,
  KATALOG_FUSSZEILEN,
  KATALOG_LINIEN,
  KATALOG_PALETTEN,
  KATALOG_SCHRIFTEN,
  KATALOG_STILE,
  kontrastZuWeiss,
  LOCALE,
  type OberflaecheTexte,
} from "@schau/domain";
import { useOberflaeche, useSprache } from "../sprache";
import { Auswahl, Eingabe, Feld, Haken, Marke } from "../ui";
import { Gruppe, Kacheln } from "./katalog-gestalten-bausteine";
import type { Form } from "./katalog-gestalten-form";

/* Katalog gestalten, Reiter „Aufbau“: Gestaltung, Aufteilung, Format, Fußzeile, Farben und Impressum mit Schaubildern. */

/** Schaubild einer Titelseite je Gestaltung, in der Vereinsfarbe. */
function StilBild({ stil, farbe, akzent }: { stil: Form["stil"]; farbe: string; akzent: string }) {
  const linie = (y: number, b: number, x = (48 - b) / 2) => <rect x={x} y={y} width={b} height={2.2} rx={1} fill="#9aa3b0" />;
  return (
    <svg viewBox="0 0 48 64" className="h-16 w-12 rounded-sm bg-white shadow-sm ring-1 ring-linie" aria-hidden>
      {stil === "klassisch" && (
        <>
          <rect x={0} y={0} width={48} height={5} fill={farbe} />
          {linie(12, 26)}
          {linie(17, 18)}
          <rect x={10} y={23} width={28} height={20} fill="#e4e7e1" />
          <rect x={6} y={50} width={36} height={9} fill={farbe} opacity={0.85} />
        </>
      )}
      {stil === "schlicht" && (
        <>
          <rect x={6} y={5} width={36} height={0.9} fill={akzent} />
          {linie(12, 26)}
          {linie(17, 18)}
          <rect x={10} y={23} width={28} height={20} fill="#e4e7e1" />
          {linie(49, 22)}
          {linie(53, 14)}
          <rect x={6} y={59} width={36} height={0.9} fill={akzent} />
        </>
      )}
      {stil === "rahmen" && (
        <>
          <rect x={3} y={3} width={42} height={58} fill="none" stroke={farbe} strokeWidth={1.4} />
          <rect x={5} y={5} width={38} height={54} fill="none" stroke={farbe} strokeWidth={0.5} />
          {linie(12, 26)}
          {linie(17, 16)}
          <rect x={12} y={23} width={24} height={20} fill="#e4e7e1" />
          {linie(49, 22)}
          {linie(53, 14)}
        </>
      )}
      {stil === "modern" && (
        <>
          <rect x={0} y={0} width={48} height={28} fill={farbe} />
          <rect x={5} y={9} width={28} height={3.5} rx={1} fill="#fff" />
          <rect x={5} y={15} width={20} height={2.2} rx={1} fill="#fff" opacity={0.8} />
          <rect x={26} y={32} width={18} height={22} fill="#e4e7e1" />
          {linie(34, 16, 5)}
          {linie(39, 12, 5)}
          {linie(44, 14, 5)}
          <rect x={0} y={62} width={48} height={2} fill={farbe} />
        </>
      )}
    </svg>
  );
}

/** Schaubild einer Tierteil-Seite je Aufteilung. */
function AufteilungBild({ aufteilung, farbe }: { aufteilung: Form["aufteilung"]; farbe: string }) {
  const spalten = aufteilung === "tabelle" ? 1 : aufteilung === "dreispaltig" ? 3 : 2;
  const breite = (40 - (spalten - 1) * 3) / spalten;
  return (
    <svg viewBox="0 0 48 64" className="h-16 w-12 rounded-sm bg-white shadow-sm ring-1 ring-linie" aria-hidden>
      <rect x={4} y={5} width={40} height={4} fill={farbe} />
      {Array.from({ length: spalten }, (_, s) =>
        Array.from({ length: 12 }, (_, z) => <rect key={`${s}-${z}`} x={4 + s * (breite + 3)} y={14 + z * 4} width={z % 5 === 0 ? breite * 0.6 : breite} height={2} rx={0.8} fill={z % 5 === 0 ? farbe : "#9aa3b0"} opacity={z % 5 === 0 ? 0.8 : 1} />),
      )}
    </svg>
  );
}

export function Aufbau({ d, set }: { d: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
  const t = useOberflaeche();
  const ta = t.katalog.aufbau;
  return (
    <>
      <Gruppe titel={ta.aussehen}>
        <Kacheln label={ta.gestaltung} werte={KATALOG_STILE} wert={d.stil} name={(w) => t.fach.KATALOG_STIL_INFO[w].name} bild={(w) => <StilBild stil={w} farbe={d.farbe} akzent={d.akzent || d.farbe} />} onWahl={(w) => set("stil", w)} />
        <div className="flex flex-col gap-1.5">
          <Kacheln
            label={ta.aufteilung}
            werte={KATALOG_AUFTEILUNGEN}
            wert={d.aufteilung}
            name={(w) => t.fach.KATALOG_AUFTEILUNG_INFO[w].name}
            bild={(w) => <AufteilungBild aufteilung={w} farbe={d.farbe} />}
            onWahl={(w) => set("aufteilung", w)}
          />
          {d.aufteilung === "dreispaltig" && d.format === "A5" && <p className="text-sm text-stroh-dunkel">{ta.a5Zweispaltig}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Feld label={ta.format}>
            {(fid) => (
              <Auswahl id={fid} value={d.format} onChange={(e) => set("format", e.target.value as Form["format"])}>
                <option value="A4">A4</option>
                <option value="A5">{ta.a5Heft}</option>
              </Auswahl>
            )}
          </Feld>
          <Feld label={ta.schrift}>
            {(fid) => (
              <Auswahl id={fid} value={d.schrift} onChange={(e) => set("schrift", e.target.value as Form["schrift"])}>
                {KATALOG_SCHRIFTEN.map((sch) => (
                  <option key={sch} value={sch}>
                    {t.fach.KATALOG_SCHRIFT_INFO[sch].name}
                  </option>
                ))}
              </Auswahl>
            )}
          </Feld>
          <Feld label={ta.linien}>
            {(fid) => (
              <Auswahl id={fid} value={d.linien} onChange={(e) => set("linien", e.target.value as Form["linien"])}>
                {KATALOG_LINIEN.map((l) => (
                  <option key={l} value={l}>
                    {t.fach.KATALOG_LINIEN_INFO[l].name}
                  </option>
                ))}
              </Auswahl>
            )}
          </Feld>
        </div>
        <Kacheln label={ta.fusszeile} werte={KATALOG_FUSSZEILEN} wert={d.fusszeile} name={(w) => t.fach.KATALOG_FUSSZEILE_INFO[w]} bild={(w) => <FussBild fusszeile={w} farbe={d.farbe} akzent={d.akzent || d.farbe} />} onWahl={(w) => set("fusszeile", w)} />
      </Gruppe>
      <Gruppe titel={ta.farben}>
        <Paletten d={d} set={set} />
        <Farbwahl titel={ta.vereinsfarbe} farbe={d.farbe} setFarbe={(f) => set("farbe", f)} />
        <Akzentwahl d={d} set={set} />
      </Gruppe>
      <Gruppe titel={ta.impressum}>
        <Feld label={ta.druck} hinweis={ta.druckHinweis}>
          {(fid) => <Eingabe id={fid} value={d.druck} placeholder={ta.druckBeispiel} onChange={(e) => set("druck", e.target.value)} />}
        </Feld>
      </Gruppe>
    </>
  );
}

/** Schaubild der Fußzeile einer Seite. */
function FussBild({ fusszeile, farbe, akzent }: { fusszeile: Form["fusszeile"]; farbe: string; akzent: string }) {
  return (
    <svg viewBox="0 0 48 32" className="h-8 w-12 rounded-sm bg-white shadow-sm ring-1 ring-linie" aria-hidden>
      {[5, 9, 13].map((y) => (
        <rect key={y} x={5} y={y} width={38} height={1.6} rx={0.8} fill="#d5d9df" />
      ))}
      {fusszeile === "linie" && (
        <>
          <rect x={5} y={23} width={38} height={0.5} fill="#9aa3b0" />
          <rect x={5} y={26} width={14} height={1.6} rx={0.8} fill="#9aa3b0" />
          <rect x={39} y={25.5} width={4} height={2.6} rx={0.5} fill={akzent} />
        </>
      )}
      {fusszeile === "mittig" && <rect x={22} y={25.5} width={4} height={2.6} rx={0.5} fill={akzent} />}
      {fusszeile === "marke" && (
        <>
          <rect x={5} y={26} width={14} height={1.6} rx={0.8} fill="#9aa3b0" />
          <rect x={37} y={23.5} width={6} height={5} fill={farbe} />
        </>
      )}
    </svg>
  );
}

/** Kontrast zu weißem Papier als kurze Marke. */
function KontrastMarke({ farbe }: { farbe: string }) {
  const ta = useOberflaeche().katalog.aufbau;
  const k = kontrastZuWeiss(farbe);
  const zahl = `${k.toLocaleString(LOCALE[useSprache()], { maximumFractionDigits: 1 })} : 1`;
  if (k >= 4.5) return <Marke ton="ok">{ta.kontrast(zahl)}</Marke>;
  return <Marke ton="warnung">{ta.kontrastSchwach(zahl)}</Marke>;
}

// Deutsche Namen der Domain; angezeigt in der Sprache der Oberfläche über `t.katalog.farben` (sonst der deutsche Name).
const ALLE_FARBEN = [...KATALOG_FARBFAMILIEN.flatMap((f) => f.farben), ...KATALOG_PALETTEN.map((p): [string, string] => [p.akzent, p.name.split(" und ")[1]!])];
const uebersetzt = (liste: Record<string, string>, name: string) => liste[name] ?? name;
const farbName = (t: OberflaecheTexte, f: string) => {
  const name = ALLE_FARBEN.find(([w]) => w === f.toLowerCase())?.[1];
  return name ? uebersetzt(t.katalog.farben.namen, name) : t.katalog.aufbau.eigeneFarbe;
};

/** Abgestimmte Paare: ein Klick setzt Vereins- und Akzentfarbe. */
function Paletten({ d, set }: { d: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
  const t = useOberflaeche();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold">{t.katalog.aufbau.farbpaare}</legend>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
        {KATALOG_PALETTEN.map((p) => {
          const gewaehlt = d.farbe.toLowerCase() === p.haupt && d.akzent.toLowerCase() === p.akzent;
          return (
            <button
              key={p.name}
              type="button"
              aria-pressed={gewaehlt}
              onClick={() => {
                set("farbe", p.haupt);
                set("akzent", p.akzent);
              }}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm ${gewaehlt ? "border-band bg-band-hell font-semibold ring-1 ring-band" : "border-linie bg-weiss hover:border-linie-stark"}`}
            >
              <svg viewBox="0 0 28 20" className="h-5 w-7 shrink-0 rounded-sm ring-1 ring-linie" aria-hidden>
                <rect x={0} y={0} width={28} height={20} fill={p.haupt} />
                <rect x={0} y={14} width={28} height={6} fill={p.akzent} />
              </svg>
              {uebersetzt(t.katalog.farben.paletten, p.name)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Farbwahl({ titel, farbe, setFarbe }: { titel: string; farbe: string; setFarbe: (f: string) => void }) {
  const t = useOberflaeche();
  const ta = t.katalog.aufbau;
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-1.5 text-sm font-semibold">{titel}</legend>
      <div className="grid gap-x-6 gap-y-2 lg:grid-cols-2" role="group" aria-label={ta.vorschlaege(titel)}>
        {KATALOG_FARBFAMILIEN.map((f) => (
          <div key={f.name} className="flex flex-wrap items-center gap-1.5">
            <span className="w-24 shrink-0 text-sm text-grau">{uebersetzt(t.katalog.farben.familien, f.name)}</span>
            {f.farben.map(([wert, name]) => {
              const gewaehlt = farbe.toLowerCase() === wert;
              return (
                <button
                  key={wert}
                  type="button"
                  title={uebersetzt(t.katalog.farben.namen, name)}
                  aria-label={uebersetzt(t.katalog.farben.namen, name)}
                  aria-pressed={gewaehlt}
                  onClick={() => setFarbe(wert)}
                  className={`size-6 shrink-0 rounded-full ${gewaehlt ? "ring-2 ring-band ring-offset-2 ring-offset-weiss" : "ring-1 ring-linie-stark hover:ring-grau"}`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden className="size-6 rounded-full">
                    <circle cx={12} cy={12} r={12} fill={wert} />
                  </svg>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input type="color" aria-label={ta.eigeneFarbeLabel(titel)} value={farbe} onChange={(e) => setFarbe(e.target.value)} className="h-9 w-14 cursor-pointer rounded-md border border-feldrand bg-weiss" />
        <span className="text-sm text-grau">
          {farbName(t, farbe)} · <span className="font-mono">{farbe}</span>
        </span>
        <KontrastMarke farbe={farbe} />
      </div>
    </fieldset>
  );
}

/** Akzentfarbe: leer = wie die Vereinsfarbe (bisheriges Aussehen). */
function Akzentwahl({ d, set }: { d: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
  const ta = useOberflaeche().katalog.aufbau;
  const eigene = d.akzent !== "";
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Haken label={ta.eigeneAkzentfarbe} checked={eigene} onChange={(v) => set("akzent", v ? d.farbe : "")} />
      {eigene && <Farbwahl titel={ta.akzentfarbe} farbe={d.akzent} setFarbe={(f) => set("akzent", f)} />}
    </div>
  );
}
