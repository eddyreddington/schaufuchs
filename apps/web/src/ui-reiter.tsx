import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { reiterAusAnker } from "./reiter-anker";
import { cx } from "./ui-basis";

/**
 * Reiter statt langer Scrollseiten (Einstellungen, Verein, Preisrichter, Käfige, Briefvorlage, Benutzer). Der gewählte
 * Reiter steht im Anker der Adresse (…#druck): Links auf einen Abschnitt öffnen den passenden Reiter, Neuladen und
 * Zurück behalten ihn. `zuReiter` ordnet Anker, die kein eigener Reiter sind (z. B. ein Abschnitt innerhalb eines
 * Reiters), einem Reiter zu. Die Reiter dürfen erst nach dem Laden feststehen: Der Anker wird erst beim Zeichnen gegen
 * die aktuellen Reiter aufgelöst.
 */
export function useReiter<T extends string>(ids: readonly T[], zuReiter: Partial<Record<string, T>> = {}) {
  const { hash } = useLocation();
  const navigate = useNavigate();
  // Anker oder Reiter, so wie gewählt – aufgelöst wird unten, gegen die Reiter dieses Durchlaufs.
  const [gewaehlt, setGewaehlt] = useState(hash);
  // Ein Link auf einen Abschnitt dieser Seite (gleicher Pfad, neuer Anker) wechselt den Reiter; ein fremder Anker
  // (z. B. der Sprunglink zum Inhalt) lässt ihn stehen.
  useEffect(() => {
    if (reiterAusAnker(hash, ids, zuReiter)) setGewaehlt(hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);
  // Ein Reiter kann wegfallen (z. B. „Verwalten“ für Helfer): dann der erste.
  const aktiv: T = reiterAusAnker(gewaehlt, ids, zuReiter) ?? ids[0]!;
  const waehlen = useCallback(
    (r: T) => {
      setGewaehlt(r);
      // state.reiter: Der Rahmen scrollt bei einem Reiterwechsel nicht (rahmen.tsx).
      navigate({ hash: r }, { replace: true, state: { reiter: true } });
    },
    [navigate],
  );
  return [aktiv, waehlen] as const;
}

/**
 * Leiste der Reiter (role="tablist"). Die Inhalte gehören in `ReiterTafel`. Teilen sich mehrere Reiter eine Tafel
 * (ein Formular über mehrere Reiter), nennt `tafelFuer` deren id. Pfeiltasten, Pos1 und Ende wechseln wie üblich.
 */
export function ReiterLeiste<T extends string>({
  reiter,
  aktiv,
  waehlen,
  label,
  tafelFuer = reiterTafel,
}: {
  reiter: { id: T; label: string }[];
  aktiv: T;
  waehlen: (id: T) => void;
  label: string;
  tafelFuer?: (id: T) => string;
}) {
  const taste = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const ziel = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? reiter.length - 1 : null;
    if (ziel == null) return;
    e.preventDefault();
    const r = reiter[(ziel + reiter.length) % reiter.length]!;
    waehlen(r.id);
    document.getElementById(reiterKnopf(r.id))?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-x-1 border-b border-linie">
      {reiter.map((r, i) => (
        <button
          key={r.id}
          type="button"
          role="tab"
          id={reiterKnopf(r.id)}
          aria-selected={aktiv === r.id}
          aria-controls={tafelFuer(r.id)}
          tabIndex={aktiv === r.id ? 0 : -1}
          onClick={() => waehlen(r.id)}
          onKeyDown={(e) => taste(e, i)}
          className={cx(
            "-mb-px whitespace-nowrap border-b-2 px-2.5 py-2.5 text-sm font-semibold transition-colors",
            aktiv === r.id ? "border-band text-tinte" : "border-transparent text-grau hover:text-tinte",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Inhalt eines Reiters. Bleibt geladen, wenn er nicht gewählt ist (Ungespeichertes geht beim Wechsel nicht verloren),
 * und ist dann nur verborgen. Scheitert das Speichern (Fehlerhinweis in einem Formular) oder ist ein Feld ungültig,
 * während der Reiter verborgen ist, wird er gewählt – sonst sähe man nicht, warum nichts gespeichert wurde.
 */
export function ReiterTafel<T extends string>({
  id,
  aktiv,
  waehlen,
  tafelId = reiterTafel(id),
  className,
  ohneLeiste,
  children,
}: {
  id: T;
  aktiv: boolean;
  waehlen: (id: T) => void;
  tafelId?: string;
  className?: string;
  /** Gibt es (z. B. für Helfer) nur diesen einen Bereich und keine Leiste: ein schlichter Kasten ohne Reiter-Rollen. */
  ohneLeiste?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const beobachter = new MutationObserver(() => {
      // bleibt deutsch: CSS-Selektor
      if (el.hidden && el.querySelector('form [role="alert"]')) waehlen(id);
    });
    beobachter.observe(el, { childList: true, subtree: true });
    return () => beobachter.disconnect();
  }, [id, waehlen]);
  if (ohneLeiste) return <div className={cx("flex min-w-0 flex-col gap-6", className)}>{children}</div>;
  return (
    <div ref={ref} role="tabpanel" id={tafelId} aria-labelledby={reiterKnopf(id)} hidden={!aktiv} onInvalidCapture={() => waehlen(id)} className={cx("flex min-w-0 flex-col gap-6", className)}>
      {children}
    </div>
  );
}

export const reiterKnopf = (id: string) => `reiter-${id}`;
export const reiterTafel = (id: string) => `tafel-${id}`;
