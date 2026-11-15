import { createPortal } from "react-dom";
import { useBlocker } from "react-router-dom";
import { fehlerText } from "./lib";
import { Symbol } from "./symbole";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ── Knöpfe ─────────────────────────────────────────────────────────────

type Variante = "primaer" | "zweit" | "gefahr" | "leise";
const VARIANTE: Record<Variante, string> = {
  primaer: "bg-band text-auf-band hover:bg-band-dunkel border-band",
  zweit: "bg-weiss text-tinte hover:bg-papier border-linie-stark shadow-[0_1px_1px_rgb(0_0_0/0.04)]",
  gefahr: "bg-weiss text-kamm hover:bg-kamm-hell border-linie-stark",
  leise: "bg-transparent text-band hover:bg-band-hell border-transparent",
};

/** Klassen eines Knopfs – auch für Links, die wie Knöpfe aussehen sollen. */
export function knopfKlasse(variante: Variante = "zweit", gross?: boolean, className?: string): string {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-md border font-semibold leading-tight no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    gross ? "min-h-12 px-6 text-lg" : "min-h-9 px-3.5",
    VARIANTE[variante],
    className,
  );
}

export function Knopf({
  variante = "zweit",
  gross,
  laedt,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; gross?: boolean; laedt?: boolean }) {
  return (
    <button type="button" {...rest} disabled={rest.disabled || laedt} className={knopfKlasse(variante, gross, className)}>
      {laedt ? "Bitte warten …" : children}
    </button>
  );
}

/** Link im Aussehen eines Knopfs (z. B. für PDFs) – statt <a><Knopf/></a>, das zwei Tab-Stopps ergibt. */
export function KnopfLink({ variante, gross, className, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { variante?: Variante; gross?: boolean }) {
  return <a {...rest} className={knopfKlasse(variante, gross, className)} />;
}

// ── Formularfelder ─────────────────────────────────────────────────────

const feldKlasse =
  "w-full min-h-9 rounded-md border border-feldrand bg-weiss px-3 py-1.5 text-tinte placeholder:text-grau/70 hover:border-grau focus:border-band focus:outline-none focus:ring-2 focus:ring-band/25 disabled:bg-papier disabled:text-grau";

export function Feld({ label, hinweis, fehler, children, className }: { label: string; hinweis?: ReactNode; fehler?: string | null; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  // Hinweis und Fehler mit dem Eingabefeld verknüpfen, damit Screenreader sie mit vorlesen.
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const ids = [hinweis ? `${id}-hinweis` : "", fehler ? `${id}-fehler` : ""].filter(Boolean).join(" ");
    if (ids) el.setAttribute("aria-describedby", ids);
    else el.removeAttribute("aria-describedby");
    if (fehler) el.setAttribute("aria-invalid", "true");
    else el.removeAttribute("aria-invalid");
  }, [id, hinweis, fehler]);
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children(id)}
      {hinweis && <p id={`${id}-hinweis`} className="text-sm text-grau">{hinweis}</p>}
      {fehler && <p id={`${id}-fehler`} className="text-sm font-semibold text-kamm">{fehler}</p>}
    </div>
  );
}

/**
 * Warnt vor dem Verlassen mit ungespeicherten Eingaben: beim Schließen/Neuladen (Browser) und beim Wechsel
 * innerhalb der App (React Router). `ungespeichert` wird erst beim Navigieren gefragt – nach dem Speichern also aktuell.
 */
/** Alle Formulare mit ungespeicherten Eingaben; ein einziger Wächter fragt vor dem Verlassen (Router kennt nur eine Sperre). */
const formulare = new Set<{ current: () => boolean }>();
const etwasUngespeichert = () => [...formulare].some((f) => f.current());

/** Meldet ein Formular beim Wächter an: ungespeichert() sagt, ob Eingaben verloren gingen. */
export function useUngespeichertWarnung(ungespeichert: () => boolean) {
  const frage = useRef(ungespeichert);
  frage.current = ungespeichert;
  useEffect(() => {
    formulare.add(frage);
    return () => {
      formulare.delete(frage);
    };
  }, []);
}

/**
 * Warnung für ein Formular, dessen Stand gegen den zuletzt gespeicherten verglichen wird.
 * Rückgabe: nach erfolgreichem Speichern aufrufen.
 */
export function useAenderungenWarnen(stand: unknown) {
  const text = JSON.stringify(stand);
  const gespeichert = useRef(text);
  useUngespeichertWarnung(() => gespeichert.current !== text);
  return () => {
    gespeichert.current = text;
  };
}

/** Einmal im Wurzel-Layout: fragt vor dem Verlassen (Navigation oder Fenster), wenn ein Formular Ungespeichertes hat. */
export function UngespeichertWaechter() {
  useEffect(() => {
    const warnen = (e: BeforeUnloadEvent) => {
      if (etwasUngespeichert()) e.preventDefault();
    };
    window.addEventListener("beforeunload", warnen);
    return () => window.removeEventListener("beforeunload", warnen);
  }, []);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname && etwasUngespeichert());
  const { bestaetige } = useFrage();
  // Die Rückfrage ist asynchron: nicht ein zweites Mal fragen, solange die erste offen ist.
  const fragt = useRef(false);
  useEffect(() => {
    if (blocker.state !== "blocked" || fragt.current) return;
    fragt.current = true;
    void bestaetige({ titel: "Seite verlassen?", text: "Ihre Eingaben sind noch nicht gespeichert. Seite trotzdem verlassen?", knopf: "Verlassen", gefahr: true }).then((ja) => {
      fragt.current = false;
      if (ja) blocker.proceed?.();
      else blocker.reset?.();
    });
  }, [blocker, bestaetige]);
  return null;
}

export function Eingabe(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(feldKlasse, props.className)} />;
}

export function Textfeld(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(feldKlasse, props.className)} />;
}

/** `kompakt` für enge Tabellenspalten: weniger Innenabstand, damit „1,0“ oder „Einzeltier“ sichtbar bleiben. */
export function Auswahl({ kompakt, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { kompakt?: boolean }) {
  const basis = kompakt ? feldKlasse.replace("px-3", "pl-2 pr-1") : cx(feldKlasse.replace("px-3", "pl-3"), "pr-8");
  return <select {...props} className={cx(basis, props.className)} />;
}

export function Haken({
  label,
  checked,
  onChange,
  hinweis,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  hinweis?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} className="mt-0.5 size-[1.05rem] accent-band disabled:opacity-50" />
      <label htmlFor={id} className="leading-snug">
        {label}
        {hinweis && <span className="block text-sm text-grau">{hinweis}</span>}
      </label>
    </div>
  );
}

// ── Hinweise und Status ────────────────────────────────────────────────

type Ton = "info" | "ok" | "warnung" | "fehler";
const TON: Record<Ton, string> = {
  info: "border-band/25 bg-band-hell",
  ok: "border-stall/25 bg-stall-hell",
  warnung: "border-stroh-dunkel/25 bg-stroh",
  fehler: "border-kamm/25 bg-kamm-hell",
};

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

/** Platz für „Speichern“ oben rechts in der Kopfleiste des Rahmens (setzt AppRahmen). */
export const SpeicherPlatz = createContext<HTMLElement | null>(null);

/**
 * Bei ungespeicherten Änderungen: „Speichern“ (und „Verwerfen“) oben rechts in der Kopfleiste – dort bleibt es beim
 * Scrollen sichtbar, auf allen Seiten an derselben Stelle. Ohne Rahmen (Seiten ohne Kopfleiste) als Leiste am unteren Rand.
 */
export function Speicherleiste({ sichtbar, onVerwerfen, onSpeichern, laedt, text = "Ungespeicherte Änderungen", knopf = "Speichern" }: { sichtbar: boolean; onVerwerfen?: () => void; onSpeichern: () => void; laedt?: boolean; text?: string; knopf?: string }) {
  const platz = useContext(SpeicherPlatz);
  if (!sichtbar) return null;
  if (platz)
    return createPortal(
      <div role="region" aria-label={text} className="flex items-center gap-2">
        <span className="speicher-text hidden items-center gap-2 text-[0.93rem] font-semibold text-stroh-dunkel 2xl:flex">
          <span aria-hidden className="size-2 rounded-full bg-current" />
          {text}
        </span>
        {onVerwerfen && (
          <Knopf variante="leise" onClick={onVerwerfen}>
            Verwerfen
          </Knopf>
        )}
        <Knopf variante="primaer" laedt={laedt} onClick={onSpeichern}>
          {knopf}
        </Knopf>
      </div>,
      platz,
    );
  return (
    <div role="region" aria-label={text} className="sticky bottom-0 z-20 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-linie-stark bg-weiss/95 px-4 py-3 shadow-lg backdrop-blur">
      <span className="mr-auto flex items-center gap-2 font-semibold text-stroh-dunkel">
        <span aria-hidden className="size-2 rounded-full bg-current" />
        {text}
      </span>
      {onVerwerfen && (
        <Knopf variante="leise" onClick={onVerwerfen}>
          Verwerfen
        </Knopf>
      )}
      <Knopf variante="primaer" laedt={laedt} onClick={onSpeichern}>
        {knopf}
      </Knopf>
    </div>
  );
}

export type SpeicherStand = "speichert" | "gespeichert" | "fehler";
const SPEICHER_STAND: Record<SpeicherStand, { text: string; farbe: string }> = {
  speichert: { text: "Wird gespeichert …", farbe: "text-grau" },
  gespeichert: { text: "Gespeichert", farbe: "text-stall" },
  fehler: { text: "Nicht gespeichert", farbe: "text-kamm" },
};

/**
 * Seiten, die jede Änderung sofort speichern (Hallenplan): oben rechts in der Kopfleiste steht statt „Speichern“, ob
 * gespeichert ist – an derselben Stelle wie sonst der Knopf. `eingebettet`: zusätzlich an Ort und Stelle (Vollansicht).
 */
export function SpeicherStatus({ stand, eingebettet }: { stand: SpeicherStand | null; eingebettet?: boolean }) {
  const platz = useContext(SpeicherPlatz);
  if (!stand) return null;
  const { text, farbe } = SPEICHER_STAND[stand];
  const inhalt = (
    <span role="status" aria-live="polite" className={cx("flex items-center gap-2 text-[0.93rem] font-semibold", farbe)}>
      <span aria-hidden className={cx("size-2 rounded-full bg-current", stand === "speichert" && "animate-pulse")} />
      {text}
    </span>
  );
  if (eingebettet || !platz) return inhalt;
  return createPortal(inhalt, platz);
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
  return <p className="py-8 text-grau">Wird geladen …</p>;
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

// ── Dialog ─────────────────────────────────────────────────────────────

export function Dialog({ offen, onSchliessen, titel, children, breit }: { offen: boolean; onSchliessen: () => void; titel: string; children: ReactNode; breit?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (offen && !d.open) {
      d.showModal();
      // Fokus ins Feld mit autoFocus (sonst landet er auf dem ersten Knopf, meist „×“).
      d.querySelector<HTMLElement>("[autofocus], [data-autofocus]")?.focus();
    }
    if (!offen && d.open) d.close();
  }, [offen]);
  return (
    <dialog
      ref={ref}
      // Das close-Ereignis kommt verzögert: Ist der Dialog bis dahin wieder offen (z. B. direkt die nächste Rückfrage),
      // gehört es zum vorigen Schließen und darf den neuen Inhalt nicht abbrechen.
      onClose={(e) => {
        if (!e.currentTarget.open) onSchliessen();
      }}
      className={cx("m-auto w-[calc(100%-2rem)] rounded-xl border border-linie-stark bg-weiss p-0 text-tinte shadow-2xl backdrop:bg-kopf/45", breit ? "max-w-4xl" : "max-w-lg")}
    >
      <div className="flex items-center justify-between border-b border-linie px-5 py-3">
        <h2 className="text-lg font-semibold">{titel}</h2>
        <button type="button" onClick={onSchliessen} className="rounded px-2 text-2xl leading-none text-grau hover:text-tinte" aria-label="Schließen">
          ×
        </button>
      </div>
      <div className="p-5">{offen && children}</div>
    </dialog>
  );
}

// ── Rückfragen (statt Browser-Fenster) ────────────────────────────────
// prompt() und confirm() unterdrücken manche Browser und App-Ansichten (eingebettete Fenster) – dann geschähe beim
// Klick scheinbar nichts. Rückfragen deshalb immer als eigener Dialog über useFrage().

interface Rueckfrage {
  titel: string;
  text?: ReactNode;
  /** Mit Eingabefeld (z. B. „Grund“): Beschriftung des Felds. Ohne: reine Bestätigung. */
  feld?: string;
  /** Mindestlänge der Eingabe (Grund: 3). */
  mindestens?: number;
  vorgabe?: string;
  knopf?: string;
  gefahr?: boolean;
  /** Einzeiliges Feld (z. B. eine Belegnummer) statt mehrzeilig. */
  einzeilig?: boolean;
}
type Offen = Rueckfrage & { antwort: (v: string | null) => void };
const FrageKontext = createContext<{ eingabe: (f: Rueckfrage) => Promise<string | null>; bestaetige: (f: Rueckfrage) => Promise<boolean> }>({
  eingabe: async () => null,
  bestaetige: async () => false,
});

export function FragenAnbieter({ children }: { children: ReactNode }) {
  const [frage, setFrage] = useState<Offen | null>(null);
  const [wert, setWert] = useState("");
  const eingabe = useCallback(
    (f: Rueckfrage) =>
      new Promise<string | null>((antwort) => {
        setWert(f.vorgabe ?? "");
        setFrage({ ...f, antwort });
      }),
    [],
  );
  const bestaetige = useCallback(async (f: Rueckfrage) => (await eingabe({ ...f, feld: undefined })) !== null, [eingabe]);
  const ende = (v: string | null) => {
    frage?.antwort(v);
    setFrage(null);
  };
  const zuKurz = !!frage?.feld && wert.trim().length < (frage.mindestens ?? 1);
  return (
    <FrageKontext.Provider value={{ eingabe, bestaetige }}>
      {children}
      <Dialog offen={!!frage} onSchliessen={() => ende(null)} titel={frage?.titel ?? ""}>
        {frage && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!zuKurz) ende(frage.feld ? wert.trim() : "");
            }}
          >
            {frage.text && <div className="whitespace-pre-line">{frage.text}</div>}
            {frage.feld && (
              <Feld label={frage.feld} hinweis={frage.mindestens && frage.mindestens > 1 ? `mindestens ${frage.mindestens} Zeichen` : undefined}>
                {(fid) =>
                  frage.einzeilig ? (
                    <Eingabe id={fid} data-autofocus value={wert} onChange={(e) => setWert(e.target.value)} />
                  ) : (
                    <Textfeld id={fid} data-autofocus rows={3} value={wert} onChange={(e) => setWert(e.target.value)} />
                  )
                }
              </Feld>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Knopf type="button" onClick={() => ende(null)}>
                Abbrechen
              </Knopf>
              <Knopf type="submit" variante={frage.gefahr ? "gefahr" : "primaer"} disabled={zuKurz} data-autofocus={frage.feld ? undefined : true}>
                {frage.knopf ?? "OK"}
              </Knopf>
            </div>
          </form>
        )}
      </Dialog>
    </FrageKontext.Provider>
  );
}

/** Rückfragen als Dialog: `await eingabe({ titel, feld: "Grund", mindestens: 3 })` (null = abgebrochen), `await bestaetige({ titel, text })`. */
export const useFrage = () => useContext(FrageKontext);

// ── Rückmeldungen (Toast) ──────────────────────────────────────────────

interface Meldung {
  id: number;
  text: string;
  ton: Ton;
}
const MeldungKontext = createContext<(text: string, ton?: Ton) => void>(() => {});

export function MeldungenAnbieter({ children }: { children: ReactNode }) {
  const [meldungen, setMeldungen] = useState<Meldung[]>([]);
  const zeige = useCallback((text: string, ton: Ton = "ok") => {
    const id = Date.now() + Math.random();
    setMeldungen((m) => [...m, { id, text, ton }]);
    // Fehler bleiben stehen, bis man sie schließt – sie dürfen nicht unbemerkt verschwinden.
    if (ton !== "fehler") setTimeout(() => setMeldungen((m) => m.filter((x) => x.id !== id)), 3500);
  }, []);
  const schliessen = (id: number) => setMeldungen((m) => m.filter((x) => x.id !== id));
  return (
    <MeldungKontext.Provider value={zeige}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
        {meldungen.map((m) => (
          <div key={m.id} role={m.ton === "fehler" ? "alert" : undefined} className={cx("flex items-start gap-3 rounded-lg border px-4 py-3 font-semibold text-tinte shadow-lg", TON[m.ton])}>
            <span className="flex-1">{m.text}</span>
            {m.ton === "fehler" && (
              <button type="button" onClick={() => schliessen(m.id)} className="-my-1 min-h-9 px-2 text-sm underline" aria-label="Meldung schließen">
                Schließen
              </button>
            )}
          </div>
        ))}
      </div>
    </MeldungKontext.Provider>
  );
}

export const useMeldung = () => useContext(MeldungKontext);
