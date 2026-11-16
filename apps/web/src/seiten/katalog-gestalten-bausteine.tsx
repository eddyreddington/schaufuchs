import type { ReactNode } from "react";

/* Katalog gestalten: kleine Bausteine der Oberfläche (Gruppe, Schalter, Kacheln), von mehreren Reitern genutzt. */

/** Abschnitt innerhalb einer Tafel: kleiner Titel über den Feldern, getrennt durch Linien (statt Kasten im Kasten). */
export function Gruppe({ titel, aktionen, children }: { titel?: string; aktionen?: ReactNode; children: ReactNode }) {
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
export function Schalter({ label, an, onChange, children, disabled }: { label: string; an: boolean; onChange: (v: boolean) => void; children?: ReactNode; disabled?: boolean }) {
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
export function Kacheln<T extends string>({ label, werte, wert, name, bild, onWahl }: { label: string; werte: readonly T[]; wert: T; name: (w: T) => string; bild: (w: T) => ReactNode; onWahl: (w: T) => void }) {
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
