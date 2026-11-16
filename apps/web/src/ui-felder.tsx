/** Formularfelder: Feld mit Beschriftung, Eingabe, Textfeld, Auswahl, Haken. */
import { useEffect, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "./ui-basis";

// ── Formularfelder ─────────────────────────────────────────────────────

export const feldKlasse =
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
