/** Bausteine einer Seite: Hinweise, Marken, Seitenkopf, Abschnitte, Tabellenrahmen, Suche, Kennzahlen, Lade- und Leerzustand. */
import { useEffect, type InputHTMLAttributes, type ReactNode } from "react";
import { fehlerText } from "./lib";
import { useTexte } from "./sprache";
import { Symbol } from "./symbole";
import { cx, TON, type Ton } from "./ui-basis";
import { feldKlasse } from "./ui-felder";
import { Knopf } from "./ui-knoepfe";

// ── Hinweise und Status ────────────────────────────────────────────────

export function Hinweis({ ton = "info", children, className }: { ton?: Ton; children: ReactNode; className?: string }) {
  return <div role={ton === "fehler" ? "alert" : undefined} className={cx("rounded-lg border px-4 py-3", TON[ton], className)}>{children}</div>;
}

const MARKE: Record<Ton | "neutral", string> = {
  neutral: "bg-papier text-grau border-linie",
  info: "bg-band-hell text-band-dunkel border-transparent",
  ok: "bg-stall-hell text-stall border-transparent",
  warnung: "bg-stroh text-stroh-dunkel border-transparent",
  fehler: "bg-kamm-hell text-kamm border-transparent",
};

export function Marke({ ton = "neutral", children }: { ton?: Ton | "neutral"; children: ReactNode }) {
  return <span className={cx("inline-block whitespace-nowrap rounded-[5px] border px-1.5 py-px text-[0.82rem] font-semibold leading-snug", MARKE[ton])}>{children}</span>;
}

/** Fenstertitel je Seite – für Tabs, Verlauf und Screenreader. */
export function useSeitentitel(titel: string) {
  useEffect(() => {
    document.title = titel ? `${titel} – SchauFUCHS` : "SchauFUCHS";
  }, [titel]);
}

/**
 * Seitenbreite – eine Regel für alle Seiten:
 * - Arbeitsseiten der Schau und der Verwaltung nutzen die volle Breite des Inhaltsbereichs. Den Rand setzt der
 *   App-Rahmen (SEITENRAND); die Seite selbst begrenzt ihre Breite nicht. Wurzel einer Seite: SEITE.
 * - SCHMAL: Inhalte, die für sich stehen und in voller Breite schlechter zu erfassen wären – ein einzelnes Formular
 *   („Neuer Benutzer“), Fehlerseite, Ladefehler. Linksbündig wie alle Seiten.
 * - LESEBREITE: Seiten außerhalb der Anwendung zum Lesen – öffentliche Schauseite, Handbuch. Mittig.
 * - Anmeldekarten (Anmeldung, Einladung, Preisrichter) `max-w-md`; Dialoge über <Dialog>; Fließtext `max-w-[70ch]`.
 */
export const SEITENRAND = "px-4 py-6 lg:px-6";
export const SEITE = "flex flex-col gap-6";
export const SCHMAL = "max-w-3xl";
export const LESEBREITE = "mx-auto w-full max-w-6xl px-4 lg:px-6";

/**
 * Kopf einer Seite. Ohne eigenen Außenabstand: den Abstand zum Inhalt gibt die Seite (SEITE, gap-6).
 * - unter: höchstens eine kurze Zeile mit Fakten (z. B. „52 Meldungen, 284 Tiere“), nie eine Bedienungsanleitung.
 *   Erklärungen gehören ins Handbuch; dorthin führt `hilfe` (Anker im Handbuch) als „Hilfe zu {titel}“.
 * - marke: Zustand neben dem Titel (z. B. „Vorkatalog bis zur Freigabe“).
 */
export function Seitenkopf({
  titel,
  unter,
  aktionen,
  hilfe,
  hilfeTeil,
  hilfeText,
  marke,
}: {
  titel: string;
  unter?: ReactNode;
  aktionen?: ReactNode;
  hilfe?: string;
  hilfeTeil?: string;
  hilfeText?: string;
  marke?: ReactNode;
}) {
  useSeitentitel(titel);
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-[1.7rem] font-bold leading-tight">{titel}</h1>
          {marke}
        </div>
        {unter && <p className="mt-1 max-w-[70ch] text-grau">{unter}</p>}
      </div>
      {(aktionen || hilfe) && (
        <div className="flex flex-wrap items-center gap-2">
          {hilfe && (
            <span className="mr-2">
              <HilfeLink abschnitt={hilfe} teil={hilfeTeil}>{hilfeText ?? `Hilfe zu ${titel}`}</HilfeLink>
            </span>
          )}
          {aktionen}
        </div>
      )}
    </header>
  );
}

/** „Hilfe zu …“: öffnet den Handbuchabschnitt in einem neuen Tab (Erklärungen stehen dort, nicht auf der Seite). */
export function HilfeLink({ abschnitt, teil = "ausstellungsleitung", children }: { abschnitt: string; teil?: string; children: ReactNode }) {
  return (
    <a href={`/hilfe/${teil}#${abschnitt}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-grau no-underline hover:text-tinte hover:underline">
      <Symbol name="hilfe" className="size-4" />
      {children}
    </a>
  );
}

export function Abschnitt({ titel, children, aktionen, className, id }: { titel?: string; children: ReactNode; aktionen?: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cx("scroll-mt-4 rounded-xl border border-linie bg-weiss p-5 shadow-[0_1px_2px_rgb(16_20_28/0.04)]", className)}>
      {(titel || aktionen) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {titel && <h2 className="text-[1.07rem] font-semibold">{titel}</h2>}
          {aktionen}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Rahmen um eine Tabelle: Fläche mit Rand, oben optional eine Leiste (Suche, Filter), unten optional eine Fußzeile
 * (Anzahl, Summen). Die Tabelle selbst bekommt die Klasse `tabelle`. Breite Tabellen scrollen in sich.
 */
export function TabellenRahmen({ kopf, fuss, children, className }: { kopf?: ReactNode; fuss?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("tabellen-rahmen min-w-0 overflow-hidden rounded-xl border border-linie bg-weiss shadow-[0_1px_2px_rgb(16_20_28/0.04)]", className)}>
      {kopf && <div className="flex flex-wrap items-center gap-2 border-b border-linie px-4 py-3">{kopf}</div>}
      <div className="overflow-x-auto">{children}</div>
      {fuss && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-linie px-4 py-2.5 text-sm text-grau">{fuss}</div>}
    </section>
  );
}

/** Suchfeld mit Lupe. */
export function Suchfeld({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cx("relative block w-full max-w-xs", className)}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-grau">
        <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" /></svg>
      </span>
      <input type="search" {...props} className={cx(feldKlasse, "pl-8")} />
    </label>
  );
}

/** Umschalter mit wenigen Möglichkeiten (Filter, Arbeitsweise). anzahl erscheint grau hinter dem Text. */
export function Segmente<T extends string>({ wert, optionen, onChange, label }: { wert: T; optionen: { wert: T; label: ReactNode; anzahl?: number }[]; onChange: (w: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-md border border-linie-stark bg-papier p-0.5">
      {optionen.map((o) => (
        <button
          key={o.wert}
          type="button"
          aria-pressed={wert === o.wert}
          onClick={() => onChange(o.wert)}
          className={cx("inline-flex min-h-8 items-center gap-1.5 rounded px-3 text-sm", wert === o.wert ? "bg-weiss font-semibold text-tinte shadow-sm" : "text-grau hover:text-tinte")}
        >
          {o.label}
          {o.anzahl != null && <span className="font-normal text-grau">{o.anzahl}</span>}
        </button>
      ))}
    </div>
  );
}

/** Formular aus Abschnitten: eine Fläche, Abschnitte durch Linien getrennt. */
export function Formular({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("divide-y divide-linie overflow-hidden rounded-xl border border-linie bg-weiss shadow-[0_1px_2px_rgb(16_20_28/0.04)]", className)}>{children}</section>;
}

/**
 * Abschnitt eines Formulars: links Titel und höchstens eine kurze Zeile, rechts die Felder (Raster mit zwei Spalten;
 * `className="md:col-span-2"` für breite Felder). id für Sprungziele aus der Abschnittsliste.
 */
export function FormAbschnitt({ id, titel, unter, aktionen, children, spalten = 2 }: { id?: string; titel: string; unter?: ReactNode; aktionen?: ReactNode; children: ReactNode; spalten?: 1 | 2 | 3 }) {
  return (
    <div id={id} className="grid scroll-mt-4 gap-x-8 gap-y-4 p-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-1">
        <h2 className="text-[1.02rem] font-semibold">{titel}</h2>
        {unter && <p className="text-sm text-grau">{unter}</p>}
        {aktionen && <div className="mt-2 flex flex-wrap gap-2">{aktionen}</div>}
      </div>
      <div className={cx("grid min-w-0 content-start gap-x-5 gap-y-4", spalten === 2 ? "md:grid-cols-2" : spalten === 3 ? "md:grid-cols-3" : "")}>{children}</div>
    </div>
  );
}

/** Kennzahlen als Raster (Übersichten): Bezeichnung klein, Wert groß, optional grauer Zusatz. */
export function Kennzahlen({ werte, spalten = 4 }: { werte: { label: string; wert: ReactNode; zusatz?: ReactNode; ton?: "ok" | "warnung" | "fehler" }[]; spalten?: 2 | 3 | 4 }) {
  return (
    <dl className={cx("grid gap-px overflow-hidden rounded-xl border border-linie bg-linie", spalten === 2 ? "grid-cols-2" : spalten === 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 md:grid-cols-4")}>
      {werte.map((w) => (
        <div key={w.label} className="bg-weiss px-4 py-3">
          <dt className="text-sm text-grau">{w.label}</dt>
          <dd className={cx("mt-0.5 text-xl font-semibold [font-stretch:112%]", w.ton === "ok" ? "text-stall" : w.ton === "warnung" ? "text-stroh-dunkel" : w.ton === "fehler" ? "text-kamm" : "")}>
            {w.wert}
            {w.zusatz != null && <span className="ml-1.5 text-sm font-normal text-grau [font-stretch:100%]">{w.zusatz}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Leer({ titel, children }: { titel: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-linie-stark px-6 py-10 text-center">
      <p className="font-display text-lg font-semibold">{titel}</p>
      {children && <div className="mx-auto mt-2 max-w-[60ch] text-grau">{children}</div>}
    </div>
  );
}

export function Laden() {
  return <p className="py-8 text-grau">{useTexte().rahmen.laden}</p>;
}

/** Ladefehler einer Seite, wahlweise mit „Erneut versuchen“. */
export function FehlerAnzeige({ fehler, nochmal }: { fehler: unknown; nochmal?: () => void }) {
  if (!fehler) return null;
  return (
    <Hinweis ton="fehler" className="my-4">
      <p className="font-semibold">Die Daten konnten nicht geladen werden.</p>
      <p>{fehlerText(fehler)}</p>
      {nochmal && (
        <Knopf className="mt-3" onClick={nochmal}>
          Erneut versuchen
        </Knopf>
      )}
    </Hinweis>
  );
}
