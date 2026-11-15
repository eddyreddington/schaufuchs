import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  KATALOG_AUFTEILUNGEN,
  KATALOG_AUFTEILUNG_INFO,
  KATALOG_FARBFAMILIEN,
  KATALOG_FUSSZEILEN,
  KATALOG_FUSSZEILE_INFO,
  KATALOG_GLIEDERUNG,
  KATALOG_LINIEN,
  KATALOG_LINIEN_INFO,
  KATALOG_PALETTEN,
  KATALOG_PAPIERTON,
  KATALOG_SCHRIFTEN,
  KATALOG_SCHRIFT_INFO,
  KATALOG_STILE,
  KATALOG_STIL_INFO,
  KATALOG_TITELBILDER,
  KATALOG_TITELBILD_INFO,
  KATALOG_TITELHINTERGRUENDE,
  KATALOG_TITELHINTERGRUND_INFO,
  kontrastZuWeiss,
  type KatalogGliederungsTeil,
  type KatalogSeitenbereich,
  type KatalogTeil,
} from "@schau/domain";
import { fehlerText } from "../lib";
import { useSchauId } from "../rahmen";
import { KommendeSchauen } from "./kommende-schauen";
import { KatalogVorschau } from "./katalog-vorschau";
import { trpc, type Ausgabe } from "../trpc";
import { Auswahl, Dialog, Eingabe, FehlerAnzeige, Feld, Haken, Hinweis, useFrage, Knopf, HilfeLink, KnopfLink, Laden, Marke, SEITE, Seitenkopf, Speicherleiste, Textfeld, useAenderungenWarnen, useMeldung, useUngespeichertWarnung } from "../ui";

type Daten = Ausgabe["katalogGestaltung"]["laden"];
type Beitrag = Daten["beitraege"][number];
type Art = Beitrag["art"];
type Gestaltung = Daten["gestaltung"];

const MAX_BYTES = 5 * 1024 * 1024;

const ARTEN: Record<Art, { titel: string; neu: string }> = {
  grusswort: { titel: "Grußworte", neu: "Grußwort hinzufügen" },
  seite: { titel: "Freie Seiten", neu: "Seite hinzufügen" },
  anzeige: { titel: "Anzeigen und Förderer", neu: "Anzeige hinzufügen" },
};

type Reiter = "aufbau" | "titel" | "teile" | "kommende";
const REITER: { id: Reiter; name: string }[] = [
  { id: "aufbau", name: "Aufbau" },
  { id: "titel", name: "Titelseite" },
  { id: "teile", name: "Teile und Reihenfolge" },
  { id: "kommende", name: "Kommende Schauen" },
];

/** Formular „Gestaltung“: alles, was „Speichern“ übernimmt (Beiträge, Bilder und Termine speichern sofort). */
function formAus(g: Gestaltung) {
  return {
    format: g.format,
    untertitel: g.untertitel,
    schirmherr: g.schirmherr,
    ausstellungsleitung: g.ausstellungsleitung,
    eintritt: g.eintritt,
    farbe: g.farbe,
    schrift: g.schrift,
    stil: g.stil,
    aufteilung: g.aufteilung,
    rassebilder: g.rassebilder,
    sparteNeueSeite: g.sparteNeueSeite,
    ausgeblendet: g.ausgeblendet,
    druck: g.druck,
    akzent: g.akzent,
    titelHintergrund: g.titelHintergrund,
    titelbild: g.titelbild,
    fusszeile: g.fusszeile,
    linien: g.linien,
  };
}
type Form = ReturnType<typeof formAus>;

export function KatalogGestalten() {
  const schauId = useSchauId();
  const daten = trpc.katalogGestaltung.laden.useQuery({ schauId });
  const termine = trpc.termine.laden.useQuery({ schauId });
  const status = trpc.auth.status.useQuery();
  const schau = trpc.schau.get.useQuery({ id: schauId });
  if (daten.error) return <FehlerAnzeige fehler={daten.error} nochmal={() => daten.refetch()} />;
  if (!daten.data || !schau.data) return <Laden />;
  // Ändern sich gespeicherte Teile (Beiträge, Bilder, Termine, Schau), lädt die Vorschau neu.
  const neuLaden = `${daten.dataUpdatedAt}-${termine.dataUpdatedAt}-${schau.dataUpdatedAt}`;
  return <Editor schauId={schauId} daten={daten.data} istAdmin={status.data?.benutzer?.rolle === "admin"} mitErgebnis={schau.data.ergebnisseFreigegeben} neuLaden={neuLaden} />;
}

function Editor({ schauId, daten, istAdmin, mitErgebnis, neuLaden }: { schauId: number; daten: Daten; istAdmin: boolean; mitErgebnis: boolean; neuLaden: string }) {
  const g = daten.gestaltung;
  const [d, setD] = useState(() => formAus(g));
  // Neu geladen: Formular übernehmen. Mit ungespeicherten Eingaben nur den Schalter „Kommende Schauen“ (lässt sich auch
  // in dessen Abschnitt umstellen) angleichen – sonst gingen die Eingaben verloren.
  const zuletzt = useRef(formAus(g));
  useEffect(() => {
    const neu = formAus(g);
    const mitKommende = neu.ausgeblendet.includes("kommendeSchauen");
    setD((x) =>
      JSON.stringify(x) === JSON.stringify(zuletzt.current)
        ? neu
        : { ...x, ausgeblendet: mitKommende ? [...x.ausgeblendet.filter((t) => t !== "kommendeSchauen"), "kommendeSchauen"] : x.ausgeblendet.filter((t) => t !== "kommendeSchauen") },
    );
    zuletzt.current = neu;
  }, [g]);
  const ungespeichert = JSON.stringify(d) !== JSON.stringify(formAus(g));
  useUngespeichertWarnung(() => ungespeichert);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setD((x) => ({ ...x, [k]: v }));
  const teilAn = (t: KatalogTeil, an: boolean) => set("ausgeblendet", an ? d.ausgeblendet.filter((x) => x !== t) : [...d.ausgeblendet, t]);

  const [reiter, setReiter] = useState<Reiter>("aufbau");
  const [ganz, setGanz] = useState(false);
  const [bereiche, setBereiche] = useState<KatalogSeitenbereich[]>([]);
  const [seite, setSeite] = useState(1);
  const [markiert, setMarkiert] = useState<KatalogGliederungsTeil | null>(null);

  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const speichern = trpc.katalogGestaltung.speichern.useMutation({
    onSuccess: () => {
      utils.katalogGestaltung.laden.invalidate();
      utils.termine.laden.invalidate();
      meldung("Gestaltung gespeichert.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const senden = (e?: FormEvent) => {
    e?.preventDefault();
    speichern.mutate({ schauId, daten: d });
  };

  /** Springt zum Teil: Reiter wechseln, Zeile der Gliederung hervorheben. */
  const zeigeTeil = (s: KatalogGliederungsTeil) => {
    if (s === "titel" || s === "leitung") return setReiter("titel");
    if (s === "kommendeSchauen") return setReiter("kommende");
    setReiter("teile");
    setMarkiert(s);
    setTimeout(() => document.getElementById(`teil-${s}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
  };
  const bereichDerSeite = bereiche.find((b) => seite >= b.von && seite <= b.bis);
  const teilDerSeite = KATALOG_GLIEDERUNG.find((x) => x.schluessel === bereichDerSeite?.schluessel);

  return (
    <div className={SEITE}>
      <Seitenkopf
        titel="Katalog"
        marke={mitErgebnis ? <Marke ton="ok">mit Ergebnissen</Marke> : <Marke ton="warnung">Vorkatalog bis zur Freigabe</Marke>}
        hilfe="katalog-gestalten"
        hilfeText="Hilfe zum Katalog"
        aktionen={
          <KnopfLink href={`/datei/${schauId}/katalog.pdf`} target="_blank" rel="noreferrer" variante="primaer">
            {mitErgebnis ? "Katalog mit Ergebnissen (PDF)" : "Vorkatalog (PDF)"}
          </KnopfLink>
        }
      />
      {!istAdmin && <Hinweis>Nur Administratoren können den Katalog gestalten.</Hinweis>}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-linie bg-weiss shadow-[0_1px_2px_rgb(16_20_28/0.04)]">
          <div className="flex flex-wrap gap-x-1 border-b border-linie px-3" role="tablist" aria-label="Bereiche">
            {REITER.map((r) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                id={`reiter-${r.id}`}
                aria-selected={reiter === r.id}
                aria-controls={`tafel-${r.id}`}
                onClick={() => setReiter(r.id)}
                className={`-mb-px whitespace-nowrap border-b-2 px-2.5 py-3 text-sm font-semibold transition-colors ${reiter === r.id ? "border-band text-tinte" : "border-transparent text-grau hover:text-tinte"}`}
              >
                {r.name}
              </button>
            ))}
          </div>
          {reiter !== "kommende" && (
            <form onSubmit={senden} className="divide-y divide-linie" id={`tafel-${reiter}`} role="tabpanel" aria-labelledby={`reiter-${reiter}`}>
              {reiter === "aufbau" && <Aufbau d={d} set={set} />}
              {reiter === "titel" && <Titelseite schauId={schauId} d={d} set={set} bilder={daten.bilder} />}
              {reiter === "teile" && (
                <Gliederung
                  schauId={schauId}
                  d={d}
                  set={set}
                  teilAn={teilAn}
                  beitraege={daten.beitraege}
                  bereiche={bereiche}
                  mitErgebnis={mitErgebnis}
                  markiert={markiert ?? bereichDerSeite?.schluessel ?? null}
                  waehle={(s, von) => {
                    setMarkiert(s);
                    if (von) setSeite(von);
                  }}
                  zeigeTeil={zeigeTeil}
                />
              )}
            </form>
          )}
          {reiter === "kommende" && (
            <div id="tafel-kommende" role="tabpanel" aria-labelledby="reiter-kommende">
              <KommendeSchauen schauId={schauId} istAdmin={istAdmin} />
            </div>
          )}
        </section>

        <div className="min-w-0 xl:sticky xl:top-4">
          <KatalogVorschau
            schauId={schauId}
            stand={{ daten: d, kurz: !ganz }}
            neuLaden={neuLaden}
            seite={seite}
            onSeite={(nr) => {
              setSeite(nr);
              setMarkiert(null);
            }}
            onBereiche={setBereiche}
            kopf={
              <label className="flex items-center gap-2 text-sm text-grau">
                <input type="checkbox" checked={ganz} onChange={(e) => setGanz(e.target.checked)} className="size-4 accent-band" />
                ganzer Tierteil
              </label>
            }
            unter={
              teilDerSeite && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="font-semibold">{teilDerSeite.name}</span>
                  <span className="text-sm text-grau tabular-nums">Seite {seite}</span>
                  <span className="ml-auto flex items-center gap-3">
                    {"teil" in teilDerSeite && (
                      <Schalter label={`${teilDerSeite.name} im Katalog`} an={!d.ausgeblendet.includes(teilDerSeite.teil)} onChange={(v) => teilAn(teilDerSeite.teil, v)}>
                        <span className="text-grau">im Katalog</span>
                      </Schalter>
                    )}
                    <Knopf variante="leise" onClick={() => zeigeTeil(teilDerSeite.schluessel)}>Bearbeiten</Knopf>
                  </span>
                </div>
              )
            }
          />
        </div>
      </div>

      <Speicherleiste
        sichtbar={ungespeichert && istAdmin}
        onVerwerfen={async () => (await bestaetige({ titel: "Änderungen verwerfen?", text: "Die Gestaltung bleibt wie zuletzt gespeichert.", knopf: "Verwerfen", gefahr: true })) && setD(formAus(g))}
        onSpeichern={() => senden()}
        laedt={speichern.isPending}
      />
    </div>
  );
}

/** Abschnitt innerhalb einer Tafel: kleiner Titel über den Feldern, getrennt durch Linien (statt Kasten im Kasten). */
function Gruppe({ titel, aktionen, children }: { titel?: string; aktionen?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
      {(titel || aktionen) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {titel && <h2 className="text-[0.95rem] font-semibold">{titel}</h2>}
          {aktionen}
        </div>
      )}
      {children}
    </section>
  );
}

/** Schalter (an/aus) als Kontrollkästchen mit Rolle „switch“. */
function Schalter({ label, an, onChange, children, disabled }: { label: string; an: boolean; onChange: (v: boolean) => void; children?: ReactNode; disabled?: boolean }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      {children}
      <input type="checkbox" role="switch" aria-label={label} checked={an} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-5 w-9 shrink-0 rounded-full bg-feldrand transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-weiss after:shadow-sm after:transition-transform peer-checked:bg-band peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-band/40 peer-focus-visible:ring-offset-1 peer-disabled:opacity-50"
      />
    </label>
  );
}

/** Auswahl als Kacheln mit kleinem Schaubild (statt Liste, wo man den Unterschied sehen muss). */
function Kacheln<T extends string>({ label, werte, wert, name, bild, onWahl }: { label: string; werte: readonly T[]; wert: T; name: (w: T) => string; bild: (w: T) => ReactNode; onWahl: (w: T) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold">{label}</legend>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
        {werte.map((w) => (
          <button
            key={w}
            type="button"
            aria-pressed={w === wert}
            onClick={() => onWahl(w)}
            className={`flex flex-col items-center gap-2 rounded-lg border px-2 pb-2 pt-3 text-sm transition-colors ${w === wert ? "border-band bg-band-hell font-semibold text-tinte ring-1 ring-band" : "border-linie bg-weiss text-grau hover:border-linie-stark hover:text-tinte"}`}
          >
            {bild(w)}
            {name(w)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

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

function Aufbau({ d, set }: { d: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
  return (
    <>
      <Gruppe titel="Aussehen">
        <Kacheln label="Gestaltung" werte={KATALOG_STILE} wert={d.stil} name={(w) => KATALOG_STIL_INFO[w].name} bild={(w) => <StilBild stil={w} farbe={d.farbe} akzent={d.akzent || d.farbe} />} onWahl={(w) => set("stil", w)} />
        <div className="flex flex-col gap-1.5">
          <Kacheln
            label="Aufteilung des Tierteils"
            werte={KATALOG_AUFTEILUNGEN}
            wert={d.aufteilung}
            name={(w) => KATALOG_AUFTEILUNG_INFO[w].name}
            bild={(w) => <AufteilungBild aufteilung={w} farbe={d.farbe} />}
            onWahl={(w) => set("aufteilung", w)}
          />
          {d.aufteilung === "dreispaltig" && d.format === "A5" && <p className="text-sm text-stroh-dunkel">Bei A5 zweispaltig.</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Feld label="Format">
            {(fid) => (
              <Auswahl id={fid} value={d.format} onChange={(e) => set("format", e.target.value as Form["format"])}>
                <option value="A4">A4</option>
                <option value="A5">A5 (Heft)</option>
              </Auswahl>
            )}
          </Feld>
          <Feld label="Schrift">
            {(fid) => (
              <Auswahl id={fid} value={d.schrift} onChange={(e) => set("schrift", e.target.value as Form["schrift"])}>
                {KATALOG_SCHRIFTEN.map((sch) => (
                  <option key={sch} value={sch}>
                    {KATALOG_SCHRIFT_INFO[sch].name}
                  </option>
                ))}
              </Auswahl>
            )}
          </Feld>
          <Feld label="Linien">
            {(fid) => (
              <Auswahl id={fid} value={d.linien} onChange={(e) => set("linien", e.target.value as Form["linien"])}>
                {KATALOG_LINIEN.map((l) => (
                  <option key={l} value={l}>
                    {KATALOG_LINIEN_INFO[l].name}
                  </option>
                ))}
              </Auswahl>
            )}
          </Feld>
        </div>
        <Kacheln label="Fußzeile" werte={KATALOG_FUSSZEILEN} wert={d.fusszeile} name={(w) => KATALOG_FUSSZEILE_INFO[w]} bild={(w) => <FussBild fusszeile={w} farbe={d.farbe} akzent={d.akzent || d.farbe} />} onWahl={(w) => set("fusszeile", w)} />
      </Gruppe>
      <Gruppe titel="Farben">
        <Paletten d={d} set={set} />
        <Farbwahl titel="Vereinsfarbe" farbe={d.farbe} setFarbe={(f) => set("farbe", f)} />
        <Akzentwahl d={d} set={set} />
      </Gruppe>
      <Gruppe titel="Impressum">
        <Feld label="Druck (Impressum)" hinweis="Druckerei mit Anschrift oder „Eigendruck“">
          {(fid) => <Eingabe id={fid} value={d.druck} placeholder="z. B. Druckerei Muster, Hauptstraße 1, 12345 Musterdorf" onChange={(e) => set("druck", e.target.value)} />}
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
  const k = kontrastZuWeiss(farbe);
  const zahl = `${k.toLocaleString("de-DE", { maximumFractionDigits: 1 })} : 1`;
  if (k >= 4.5) return <Marke ton="ok">Kontrast {zahl}</Marke>;
  return <Marke ton="warnung">Kontrast {zahl}: Schrift wird dunkler gedruckt</Marke>;
}

const ALLE_FARBEN = [...KATALOG_FARBFAMILIEN.flatMap((f) => f.farben), ...KATALOG_PALETTEN.map((p): [string, string] => [p.akzent, p.name.split(" und ")[1]!])];
const farbName = (f: string) => ALLE_FARBEN.find(([w]) => w === f.toLowerCase())?.[1] ?? "eigene Farbe";

/** Abgestimmte Paare: ein Klick setzt Vereins- und Akzentfarbe. */
function Paletten({ d, set }: { d: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-semibold">Abgestimmte Farbpaare</legend>
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
              {p.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Farbwahl({ titel, farbe, setFarbe }: { titel: string; farbe: string; setFarbe: (f: string) => void }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-1.5 text-sm font-semibold">{titel}</legend>
      <div className="grid gap-x-6 gap-y-2 lg:grid-cols-2" role="group" aria-label={`${titel}: Vorschläge`}>
        {KATALOG_FARBFAMILIEN.map((f) => (
          <div key={f.name} className="flex flex-wrap items-center gap-1.5">
            <span className="w-24 shrink-0 text-sm text-grau">{f.name}</span>
            {f.farben.map(([wert, name]) => {
              const gewaehlt = farbe.toLowerCase() === wert;
              return (
                <button
                  key={wert}
                  type="button"
                  title={name}
                  aria-label={name}
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
        <input type="color" aria-label={`${titel}: eigene Farbe`} value={farbe} onChange={(e) => setFarbe(e.target.value)} className="h-9 w-14 cursor-pointer rounded-md border border-feldrand bg-weiss" />
        <span className="text-sm text-grau">
          {farbName(farbe)} · <span className="font-mono">{farbe}</span>
        </span>
        <KontrastMarke farbe={farbe} />
      </div>
    </fieldset>
  );
}

/** Akzentfarbe: leer = wie die Vereinsfarbe (bisheriges Aussehen). */
function Akzentwahl({ d, set }: { d: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void }) {
  const eigene = d.akzent !== "";
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Haken label="Eigene Akzentfarbe für Linien und kleine Überschriften" checked={eigene} onChange={(v) => set("akzent", v ? d.farbe : "")} />
      {eigene && <Farbwahl titel="Akzentfarbe" farbe={d.akzent} setFarbe={(f) => set("akzent", f)} />}
    </div>
  );
}

function Titelseite({ schauId, d, set, bilder }: { schauId: number; d: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void; bilder: Daten["bilder"] }) {
  return (
    <>
      <Gruppe titel="Bilder">
        <TitelBilder schauId={schauId} bilder={bilder} />
      </Gruppe>
      <Gruppe titel="Gestaltung der Titelseite">
        <Kacheln
          label="Hintergrund"
          werte={KATALOG_TITELHINTERGRUENDE}
          wert={d.titelHintergrund}
          name={(w) => KATALOG_TITELHINTERGRUND_INFO[w]}
          bild={(w) => (
            <svg viewBox="0 0 48 64" className="h-16 w-12 rounded-sm shadow-sm ring-1 ring-linie" aria-hidden>
              <rect x={0} y={0} width={48} height={64} fill={w === "papier" ? KATALOG_PAPIERTON : "#ffffff"} />
              {w === "getoent" && <rect x={0} y={0} width={48} height={64} fill={d.farbe} opacity={0.1} />}
              <rect x={11} y={14} width={26} height={2.2} rx={1} fill="#9aa3b0" />
              <rect x={15} y={19} width={18} height={2.2} rx={1} fill="#9aa3b0" />
            </svg>
          )}
          onWahl={(w) => set("titelHintergrund", w)}
        />
        <Feld label="Titelfoto">
          {(fid) => (
            <Auswahl id={fid} value={d.titelbild} onChange={(e) => set("titelbild", e.target.value as Form["titelbild"])}>
              {KATALOG_TITELBILDER.map((t) => (
                <option key={t} value={t}>
                  {KATALOG_TITELBILD_INFO[t]}
                </option>
              ))}
            </Auswahl>
          )}
        </Feld>
        {d.titelbild === "randlos" && !bilder.some((b) => b.rolle === "titel") && <p className="text-sm text-grau">Gilt erst mit eigenem Titelfoto.</p>}
      </Gruppe>
      <Gruppe titel="Angaben auf dem Titel">
        <div className="grid gap-4 md:grid-cols-2">
          <Feld label="Unterzeile auf dem Titel">{(fid) => <Eingabe id={fid} value={d.untertitel} placeholder="z. B. mit Jugendschau" onChange={(e) => set("untertitel", e.target.value)} />}</Feld>
          <Feld label="Schirmherr / Schirmherrin">{(fid) => <Eingabe id={fid} value={d.schirmherr} placeholder="z. B. Bürgermeisterin Anna Beispiel" onChange={(e) => set("schirmherr", e.target.value)} />}</Feld>
          <Feld label="Eintritt" className="md:col-span-2">{(fid) => <Textfeld id={fid} rows={2} value={d.eintritt} placeholder="z. B. Erwachsene 3 €, Kinder frei, Katalog 5 €" onChange={(e) => set("eintritt", e.target.value)} />}</Feld>
        </div>
      </Gruppe>
      <Gruppe titel="Ausstellungsleitung">
        <Feld label="Ausstellungsleitung und Helfer" hinweis="Je Aufgabe eine Zeile">
          {(fid) => <Textfeld id={fid} rows={6} value={d.ausstellungsleitung} placeholder="Ausstellungsleiter: Karl Muster" onChange={(e) => set("ausstellungsleitung", e.target.value)} />}
        </Feld>
      </Gruppe>
    </>
  );
}

function TitelBilder({ schauId, bilder }: { schauId: number; bilder: Daten["bilder"] }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const loeschen = trpc.katalogGestaltung.bildLoeschen.useMutation({ onSuccess: () => utils.katalogGestaltung.laden.invalidate(), onError: (e) => meldung(fehlerText(e), "fehler") });
  const { bestaetige } = useFrage();
  const feld = (rolle: "logo" | "titel", label: string, leer: string) => {
    const b = bilder.find((x) => x.rolle === rolle);
    return (
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">{label}</span>
        {b ? <Vorschau schauId={schauId} bildId={b.id} alt={label} /> : <div className="flex h-32 w-56 max-w-full items-center justify-center rounded-lg border border-dashed border-linie-stark bg-papier text-sm text-grau">{leer}</div>}
        <div className="flex flex-wrap gap-2">
          <BildHochladen schauId={schauId} rolle={rolle} beschriftung={b ? "Ersetzen" : "Bild wählen"} fertig={() => meldung(`${label} gespeichert.`)} />
          {b && <Knopf variante="leise" onClick={async () => (await bestaetige({ titel: `${label} entfernen?`, knopf: "Entfernen", gefahr: true })) && loeschen.mutate({ schauId, id: b.id })}>Entfernen</Knopf>}
        </div>
        {b && <BildNachweis schauId={schauId} bildId={b.id} />}
      </div>
    );
  };
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {feld("logo", "Vereinslogo", "kein Logo")}
      {feld("titel", "Titelbild", "kein Foto (Stich)")}
    </div>
  );
}

/** Warum ein Teil im Katalog fehlt, obwohl er nicht abgewählt ist. */
const ENTFAELLT: Partial<Record<KatalogGliederungsTeil, string>> = {
  grussworte: "noch keine",
  seiten: "noch keine",
  anzeigen: "noch keine",
  preisrichter: "noch keine Preisrichter",
  preise: "noch keine Preise",
  bestimmungen: "kein Text unter „Einstellungen“",
  ehrentafel: "erst mit Ergebnissen",
  tierteil: "noch keine Katalognummern",
  rassenverzeichnis: "noch keine Katalognummern",
  ausstellerverzeichnis: "noch keine Aussteller mit Namen",
  bildnachweis: "keine Bilder mit Nachweis",
  kommendeSchauen: "keine Termine nach dieser Schau",
  notizen: "Seitenzahl geht schon auf",
};
const seitenText = (b: KatalogSeitenbereich) => (b.von === b.bis ? `S. ${b.von}` : `S. ${b.von}–${b.bis}`);

function Gliederung({
  schauId,
  d,
  set,
  teilAn,
  beitraege,
  bereiche,
  mitErgebnis,
  markiert,
  waehle,
  zeigeTeil,
}: {
  schauId: number;
  d: Form;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
  teilAn: (t: KatalogTeil, an: boolean) => void;
  beitraege: Beitrag[];
  bereiche: KatalogSeitenbereich[];
  mitErgebnis: boolean;
  markiert: KatalogGliederungsTeil | null;
  waehle: (s: KatalogGliederungsTeil, von: number | null) => void;
  zeigeTeil: (s: KatalogGliederungsTeil) => void;
}) {
  const [bearbeiten, setBearbeiten] = useState<Partial<Beitrag> | null>(null);
  const art = bearbeiten?.art ?? "grusswort";
  return (
    <div className="p-2 sm:p-3">
      <ol className="flex flex-col divide-y divide-linie">
        {KATALOG_GLIEDERUNG.map((g) => {
          const bereich = bereiche.find((b) => b.schluessel === g.schluessel);
          const abgewaehlt = "teil" in g && d.ausgeblendet.includes(g.teil);
          const fehlt = !bereich && !abgewaehlt && bereiche.length > 0;
          const liste = "beitraege" in g ? beitraege.filter((b) => b.art === g.beitraege) : [];
          const mitUnterzeile = g.schluessel === "tierteil" || ("beitraege" in g && liste.length > 0);
          return (
            <li key={g.schluessel} id={`teil-${g.schluessel}`} className={`scroll-mt-4 py-0.5 ${mitUnterzeile ? "pb-2" : ""}`}>
              <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 transition-colors ${markiert === g.schluessel ? "bg-band-hell" : "hover:bg-papier"}`}>
                <span className="w-16 shrink-0 text-right text-sm text-grau tabular-nums">{bereich ? seitenText(bereich) : "–"}</span>
                <button type="button" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 py-1 text-left" onClick={() => waehle(g.schluessel, bereich?.von ?? null)}>
                  <span className={abgewaehlt ? "text-grau line-through" : "font-semibold text-tinte"}>{g.name}</span>
                  {fehlt && ENTFAELLT[g.schluessel] && <span className="text-sm text-grau">entfällt: {g.schluessel === "ehrentafel" && mitErgebnis ? "keine Preisträger" : ENTFAELLT[g.schluessel]}</span>}
                  {(g.schluessel === "preisrichter" || g.schluessel === "bestimmungen") && abgewaehlt && <Marke ton="warnung">gehört in den Katalog</Marke>}
                  {g.schluessel === "notizen" && abgewaehlt && <span className="text-sm text-grau">Füllseiten bleiben leer</span>}
                </button>
                {"teil" in g ? (
                  <Schalter label={`${g.name} im Katalog`} an={!abgewaehlt} onChange={(v) => teilAn(g.teil, v)} />
                ) : "beitraege" in g ? (
                  <Knopf variante="leise" onClick={() => setBearbeiten({ art: g.beitraege })}>+ {ARTEN[g.beitraege].neu.replace(" hinzufügen", "")}</Knopf>
                ) : g.schluessel === "titel" || g.schluessel === "leitung" ? (
                  <Knopf variante="leise" onClick={() => zeigeTeil(g.schluessel)}>Bearbeiten</Knopf>
                ) : (
                  <span className="text-sm text-grau">immer</span>
                )}
              </div>
              {g.schluessel === "tierteil" && (
                <div className="flex flex-wrap gap-x-6 gap-y-2 px-2 pt-1 sm:pl-[5.25rem]">
                  <Haken label="Rassebilder drucken" checked={d.rassebilder} onChange={(v) => set("rassebilder", v)} />
                  <Haken label="Jede Sparte auf neuer Seite" checked={d.sparteNeueSeite} onChange={(v) => set("sparteNeueSeite", v)} />
                </div>
              )}
              {"beitraege" in g && liste.length > 0 && <BeitragListe schauId={schauId} art={g.beitraege} beitraege={liste} bearbeiten={setBearbeiten} />}
            </li>
          );
        })}
      </ol>
      <Dialog offen={bearbeiten != null} onSchliessen={() => setBearbeiten(null)} titel={bearbeiten?.id ? `${ARTEN[art].titel}: bearbeiten` : ARTEN[art].neu} breit>
        {bearbeiten && <BeitragForm schauId={schauId} art={art} start={bearbeiten} fertig={() => setBearbeiten(null)} />}
      </Dialog>
    </div>
  );
}

/** Beiträge einer Art: Reihenfolge per Ziehen (Griff) oder ↑ ↓, speichert sofort. */
function BeitragListe({ schauId, art, beitraege, bearbeiten }: { schauId: number; art: Art; beitraege: Beitrag[]; bearbeiten: (b: Beitrag) => void }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const [reihe, setReihe] = useState<number[] | null>(null);
  const [gezogen, setGezogen] = useState<number | null>(null);
  const fertig = () => utils.katalogGestaltung.laden.invalidate();
  const ordnen = trpc.katalogGestaltung.beitraegeOrdnen.useMutation({
    onSettled: () => fertig().then(() => setReihe(null)),
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const loeschen = trpc.katalogGestaltung.beitragLoeschen.useMutation({ onSuccess: fertig, onError: (e) => meldung(fehlerText(e), "fehler") });
  const ids = reihe ?? beitraege.map((b) => b.id);
  const liste = ids.map((id) => beitraege.find((b) => b.id === id)).filter((b): b is Beitrag => !!b);
  const speichere = (neu: number[]) => {
    setReihe(neu);
    ordnen.mutate({ schauId, ids: neu });
  };
  const schiebe = (i: number, um: number) => {
    const neu = [...ids];
    [neu[i], neu[i + um]] = [neu[i + um]!, neu[i]!];
    speichere(neu);
  };
  // Ziehen am Griff (Maus, Finger, Stift): Platz nach der Mitte der übrigen Zeilen, gespeichert beim Loslassen.
  const zeilen = useRef(new Map<number, HTMLLIElement>());
  const ziehe = (id: number, y: number) => {
    const andere = ids.filter((x) => x !== id);
    const stelle = andere.findIndex((x) => {
      const r = zeilen.current.get(x)?.getBoundingClientRect();
      return r ? y < r.top + r.height / 2 : false;
    });
    const neu = [...andere];
    neu.splice(stelle < 0 ? neu.length : stelle, 0, id);
    if (neu.join() !== ids.join()) setReihe(neu);
  };
  const loslassen = (behalten: boolean) => {
    if (gezogen == null) return;
    setGezogen(null);
    if (behalten && reihe && reihe.join() !== beitraege.map((x) => x.id).join()) speichere(reihe);
    else if (!ordnen.isPending) setReihe(null);
  };
  return (
    <ul className="flex flex-col gap-1 px-2 pt-1 sm:pl-[5.25rem]">
      {liste.map((b, i) => (
        <li
          key={b.id}
          ref={(el) => {
            if (el) zeilen.current.set(b.id, el);
            else zeilen.current.delete(b.id);
          }}
          className={`flex flex-wrap items-center gap-2 rounded-lg border bg-weiss px-2 py-1 ${gezogen === b.id ? "border-band shadow-md" : "border-linie"}`}
        >
          <span
            className="cursor-grab touch-none select-none px-1 text-lg text-grau active:cursor-grabbing"
            aria-hidden
            title="Zum Verschieben ziehen"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setGezogen(b.id);
            }}
            onPointerMove={(e) => gezogen === b.id && ziehe(b.id, e.clientY)}
            onPointerUp={() => loslassen(true)}
            onPointerCancel={() => loslassen(false)}
          >
            ⠿
          </span>
          {b.bildId ? <Vorschau schauId={schauId} bildId={b.bildId} alt="" klein /> : null}
          <span className="min-w-[10rem] flex-1">
            <span className="font-semibold text-tinte">{b.titel || "(ohne Titel)"}</span>
            {art === "anzeige" && <span className="text-sm text-grau"> · {GROESSE[b.groesse]}</span>}
          </span>
          <span className="flex flex-wrap gap-0.5">
            <Knopf variante="leise" aria-label={`${b.titel || "Beitrag"} nach oben`} disabled={i === 0 || ordnen.isPending} onClick={() => schiebe(i, -1)}>↑</Knopf>
            <Knopf variante="leise" aria-label={`${b.titel || "Beitrag"} nach unten`} disabled={i === liste.length - 1 || ordnen.isPending} onClick={() => schiebe(i, 1)}>↓</Knopf>
            <Knopf variante="leise" onClick={() => bearbeiten(b)}>Bearbeiten</Knopf>
            <Knopf variante="leise" onClick={async () => (await bestaetige({ titel: `„${b.titel || "Beitrag"}“ löschen?`, knopf: "Löschen", gefahr: true })) && loeschen.mutate({ schauId, id: b.id })}>Löschen</Knopf>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Liest eine Bilddatei als Base64 (ohne „data:“-Vorspann). */
function alsBase64(datei: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    r.readAsDataURL(datei);
  });
}

/**
 * Rechnet Bilder vor dem Hochladen auf Druckgröße herunter: Titelbild und Anzeigen als JPEG auf weißem Grund
 * (höchstens 2400 Pixel an der langen Seite – reicht für A4 in Druckqualität), das Logo höchstens 600 Pixel, als PNG
 * mit Transparenz, solange es klein bleibt. Das spart Speicher beim Katalogdruck und Platz in Datenbank und Sicherungen.
 * Kleine JPEG bleiben unverändert (kein Qualitätsverlust durch erneutes Komprimieren).
 */
async function vorbereiten(datei: File, rolle: "logo" | "titel" | "beitrag"): Promise<{ base64: string; name: string }> {
  const original = async () => ({ base64: await alsBase64(datei), name: datei.name });
  const bitmap = await createImageBitmap(datei).catch(() => null);
  if (!bitmap) return original();
  const max = rolle === "logo" ? 600 : 2400;
  const faktor = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  if (faktor === 1 && datei.type === "image/jpeg" && datei.size <= (rolle === "logo" ? 200 : 2048) * 1024) return original();
  const breite = Math.max(1, Math.round(bitmap.width * faktor));
  const hoehe = Math.max(1, Math.round(bitmap.height * faktor));
  const leinwand = document.createElement("canvas");
  leinwand.width = breite;
  leinwand.height = hoehe;
  const g = leinwand.getContext("2d");
  if (!g) return original();
  const blob = (typ: string) => new Promise<Blob | null>((ok) => leinwand.toBlob(ok, typ, 0.88));
  const zeichnen = (weiss: boolean) => {
    g.clearRect(0, 0, breite, hoehe);
    if (weiss) {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, breite, hoehe);
    }
    g.drawImage(bitmap, 0, 0, breite, hoehe);
  };
  let ergebnis: Blob | null = null;
  let endung = ".jpg";
  if (rolle === "logo") {
    zeichnen(false);
    ergebnis = await blob("image/png");
    endung = ".png";
  }
  // Fotos, Anzeigen – und ein Logo, das als PNG zu groß würde: JPEG auf weißem Grund.
  if (!ergebnis || ergebnis.size > 300 * 1024 || rolle !== "logo") {
    zeichnen(true);
    ergebnis = await blob("image/jpeg");
    endung = ".jpg";
  }
  bitmap.close();
  if (!ergebnis) return original();
  return { base64: await alsBase64(ergebnis), name: `${datei.name.replace(/\.[^.]+$/, "")}${endung}` };
}


/** Wählt eine Bilddatei, prüft Typ und Größe und lädt sie hoch. Gibt die neue Bild-ID weiter. */
function BildHochladen({ schauId, rolle, beschriftung, fertig }: { schauId: number; rolle: "logo" | "titel" | "beitrag"; beschriftung: string; fertig: (id: number) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const meldung = useMeldung();
  const utils = trpc.useUtils();
  const hoch = trpc.katalogGestaltung.bildHochladen.useMutation({
    onSuccess: (r) => {
      utils.katalogGestaltung.laden.invalidate();
      fertig(r.id);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const gewaehlt = async (datei: File | undefined) => {
    if (!datei) return;
    if (!["image/jpeg", "image/png"].includes(datei.type)) return meldung("Bitte ein Bild im Format JPEG oder PNG wählen.", "fehler");
    // Große Handyfotos sind kein Problem: der Browser rechnet sie vorher herunter.
    if (datei.size > 40 * 1024 * 1024) return meldung("Das Bild ist größer als 40 MB. Bitte verkleinern.", "fehler");
    const { base64, name } = await vorbereiten(datei, rolle);
    const bytes = Math.floor((base64.length * 3) / 4);
    if (bytes > MAX_BYTES) return meldung("Das Bild ist auch verkleinert größer als 5 MB. Bitte als JPEG speichern.", "fehler");
    if (rolle === "logo" && bytes > 600 * 1024) return meldung("Das Logo ist größer als 600 KB. Bitte verkleinern (z. B. 600 Pixel breit).", "fehler");
    hoch.mutate({ schauId, rolle, name, base64 });
  };
  return (
    <>
      <input ref={input} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => { void gewaehlt(e.target.files?.[0]); e.target.value = ""; }} />
      <Knopf type="button" onClick={() => input.current?.click()} laedt={hoch.isPending}>{beschriftung}</Knopf>
    </>
  );
}

function Vorschau({ schauId, bildId, alt, klein }: { schauId: number; bildId: number; alt: string; klein?: boolean }) {
  return <img src={`/datei/${schauId}/bild/${bildId}`} alt={alt} className={`${klein ? "h-16 w-16" : "h-32 max-w-[14rem]"} rounded border border-linie bg-papier object-contain`} />;
}

/** Bildnachweis eines Vereinsbilds: Urheber, Lizenz, Quelle (leer bei eigenen Fotos) – erscheint im Katalog. */
function BildNachweis({ schauId, bildId }: { schauId: number; bildId: number }) {
  const daten = trpc.katalogGestaltung.laden.useQuery({ schauId });
  const b = daten.data?.bilder.find((x) => x.id === bildId);
  const [offen, setOffen] = useState(false);
  const [w, setW] = useState({ urheber: "", lizenz: "", quelle: "" });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const setzen = trpc.katalogGestaltung.bildAngabenSetzen.useMutation({
    onSuccess: () => {
      utils.katalogGestaltung.laden.invalidate();
      setOffen(false);
      meldung("Bildnachweis gespeichert.");
    },
  });
  if (!b) return null;
  const text = [b.urheber && `Foto: ${b.urheber}`, b.lizenz].filter(Boolean).join(" · ");
  return (
    <div className="text-sm">
      <span className="text-grau">{text ? `Bildnachweis: ${text}` : "Eigenes Foto (kein Bildnachweis)"}</span>{" "}
      <button
        type="button"
        className="text-band hover:underline"
        onClick={() => {
          setW({ urheber: b.urheber, lizenz: b.lizenz, quelle: b.quelle });
          setOffen(true);
        }}
      >
        ändern
      </button>
      <Dialog offen={offen} onSchliessen={() => setOffen(false)} titel="Bildnachweis">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setzen.mutate({ schauId, id: bildId, ...w });
          }}
        >
          <Feld label="Urheber (Fotograf)" hinweis="leer bei eigenen Fotos">{(fid) => <Eingabe id={fid} data-autofocus value={w.urheber} onChange={(e) => setW({ ...w, urheber: e.target.value })} />}</Feld>
          <Feld label="Lizenz" hinweis="z. B. „CC BY-SA 4.0“, nicht NC oder ND">
            {(fid) => <Eingabe id={fid} value={w.lizenz} onChange={(e) => setW({ ...w, lizenz: e.target.value })} />}
          </Feld>
          <Feld label="Quelle (Adresse)">{(fid) => <Eingabe id={fid} value={w.quelle} onChange={(e) => setW({ ...w, quelle: e.target.value })} />}</Feld>
          {setzen.error && <Hinweis ton="fehler">{fehlerText(setzen.error)}</Hinweis>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto">
              <HilfeLink abschnitt="katalog-gestalten">Hilfe zum Bildnachweis</HilfeLink>
            </span>
            <Knopf type="button" onClick={() => setOffen(false)}>Abbrechen</Knopf>
            <Knopf type="submit" variante="primaer" laedt={setzen.isPending}>Speichern</Knopf>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

const GROESSE: Record<Beitrag["groesse"], string> = { ganz: "ganze Seite", halb: "halbe Seite", viertel: "Viertelseite" };

const FELDER: Record<Art, { titel: string; titelHinweis: string; unterzeile: string; unterHinweis: string; text: string; bild: string }> = {
  grusswort: {
    titel: "Überschrift",
    titelHinweis: "z. B. „Grußwort des Bürgermeisters“",
    unterzeile: "Name und Funktion (Unterschrift)",
    unterHinweis: "z. B. „Hans Beispiel, Bürgermeister der Stadt Musterstadt“",
    text: "Text",
    bild: "Porträtfoto",
  },
  seite: { titel: "Überschrift", titelHinweis: "z. B. „Hallenplan“", unterzeile: "Unterzeile", unterHinweis: "optional", text: "Text", bild: "Bild (z. B. Hallenplan)" },
  anzeige: { titel: "Firma / Förderer", titelHinweis: "z. B. „Futtermittel Müller GmbH“", unterzeile: "Ort / Kontakt", unterHinweis: "optional, bei Anzeigen ohne Bild", text: "Anzeigentext", bild: "Fertige Anzeige als Bild" },
};

function BeitragForm({ schauId, art, start, fertig }: { schauId: number; art: Art; start: Partial<Beitrag>; fertig: () => void }) {
  const [b, setB] = useState({ titel: start.titel ?? "", unterzeile: start.unterzeile ?? "", text: start.text ?? "", bildId: start.bildId ?? null, groesse: start.groesse ?? ("ganz" as const) });
  const gespeichert = useAenderungenWarnen(b);
  const f = FELDER[art];
  const utils = trpc.useUtils();
  const speichern = trpc.katalogGestaltung.beitragSpeichern.useMutation({
    onSuccess: () => {
      gespeichert();
      utils.katalogGestaltung.laden.invalidate();
      fertig();
    },
  });
  const set = <K extends keyof typeof b>(k: K, v: (typeof b)[K]) => setB((x) => ({ ...x, [k]: v }));
  const senden = (e: FormEvent) => {
    e.preventDefault();
    speichern.mutate({ schauId, beitrag: { id: start.id, art, ...b } });
  };
  return (
    <form onSubmit={senden} className="grid gap-4">
      <Feld label={f.titel} hinweis={f.titelHinweis}>
        {(fid) => <Eingabe id={fid} value={b.titel} onChange={(e) => set("titel", e.target.value)} />}
      </Feld>
      <Feld label={f.unterzeile} hinweis={f.unterHinweis}>
        {(fid) => <Eingabe id={fid} value={b.unterzeile} onChange={(e) => set("unterzeile", e.target.value)} />}
      </Feld>
      {art === "anzeige" && (
        <Feld label="Größe">
          {(fid) => (
            <Auswahl id={fid} value={b.groesse} onChange={(e) => set("groesse", e.target.value as typeof b.groesse)}>
              {Object.entries(GROESSE).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Auswahl>
          )}
        </Feld>
      )}
      <Feld label={f.text} hinweis="Leerzeile = neuer Absatz.">
        {(fid) => <Textfeld id={fid} rows={art === "grusswort" ? 12 : 6} value={b.text} onChange={(e) => set("text", e.target.value)} />}
      </Feld>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">{f.bild}</span>
        <div className="flex flex-wrap items-center gap-3">
          {b.bildId && <Vorschau schauId={schauId} bildId={b.bildId} alt={f.bild} klein />}
          <BildHochladen schauId={schauId} rolle="beitrag" beschriftung={b.bildId ? "Anderes Bild" : "Bild wählen"} fertig={(id) => set("bildId", id)} />
          {b.bildId && <Knopf type="button" variante="leise" onClick={() => set("bildId", null)}>Ohne Bild</Knopf>}
        </div>
        {b.bildId && art !== "anzeige" && <BildNachweis schauId={schauId} bildId={b.bildId} />}
      </div>
      {speichern.error && <Hinweis ton="fehler">{fehlerText(speichern.error)}</Hinweis>}
      <div className="flex flex-wrap justify-end gap-2">
        <Knopf type="button" onClick={fertig}>Abbrechen</Knopf>
        <Knopf type="submit" variante="primaer" laedt={speichern.isPending}>Speichern</Knopf>
      </div>
    </form>
  );
}
