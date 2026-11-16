/** Knöpfe: Knopf, Link im Aussehen eines Knopfs und ihre Klassen. */
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { useTexte } from "./sprache";
import { cx } from "./ui-basis";

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
  const warten = useTexte().rahmen.bitteWarten;
  return (
    <button type="button" {...rest} disabled={rest.disabled || laedt} className={knopfKlasse(variante, gross, className)}>
      {laedt ? warten : children}
    </button>
  );
}

/** Link im Aussehen eines Knopfs (z. B. für PDFs) – statt <a><Knopf/></a>, das zwei Tab-Stopps ergibt. */
export function KnopfLink({ variante, gross, className, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { variante?: Variante; gross?: boolean }) {
  return <a {...rest} className={knopfKlasse(variante, gross, className)} />;
}
