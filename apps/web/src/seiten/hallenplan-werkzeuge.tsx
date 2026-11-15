/**
 * Bausteine der Werkzeugleiste im Hallenplan-Editor: Symbole, Werkzeugknöpfe mit Tooltip (Name und Tastenkürzel), Gruppen
 * und aufklappbare Menüs. Ohne Fachlogik. Alles mit Klassen und SVG-Attributen (die CSP erlaubt keine Inline-Styles).
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

const PFADE = {
  auswahl: <path d="M5 3l14 8-6 1.6L10 19z" />,
  mehrfach: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
      <path d="M17 4v6M14 7h6" />
    </>
  ),
  rueckgaengig: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 010 12h-3" />
    </>
  ),
  wiederholen: (
    <>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 000 12h3" />
    </>
  ),
  einsetzen: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  ab: <path d="M6 9l6 6 6-6" />,
  block: (
    <>
      <rect x="2" y="7" width="20" height="10" rx="1" />
      <path d="M8.7 7v10M15.3 7v10" />
    </>
  ),
  voliere: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M8 4v16M12 4v16M16 4v16" strokeWidth="1.2" />
    </>
  ),
  flaeche: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M3 13l8-8M7 19l14-14M15 19l6-6" strokeWidth="1.3" />
    </>
  ),
  eingang: (
    <>
      <path d="M2 20h6M16 20h6" strokeWidth="3" />
      <path d="M8 20V8h8v12" />
    </>
  ),
  raster: (
    <>
      <path d="M3 8h18M3 16h18M8 3v18M16 3v18" strokeWidth="1.4" opacity="0.55" />
      <rect x="8" y="8" width="8" height="8" fill="currentColor" stroke="none" />
    </>
  ),
  drehen: (
    <>
      <path d="M20 12a8 8 0 11-2.3-5.6" />
      <path d="M20 4v5h-5" />
    </>
  ),
  zurueck: (
    <>
      <rect x="13" y="13" width="8" height="8" rx="1" strokeDasharray="2 2" />
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <path d="M17 11V7h-4" />
    </>
  ),
  entfernen: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  verkleinern: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M8 11h6M16 16l5 5" />
    </>
  ),
  vergroessern: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M8 11h6M11 8v6M16 16l5 5" />
    </>
  ),
  einpassen: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  tisch: <path d="M3 9h18M6 9v9M18 9v9M3 14h4M17 14h4" />,
  dreiD: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9" />,
  vollansicht: <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />,
  vollansichtAus: <path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7" />,
  menue: (
    <>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </>
  ),
  nummern: <path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16" />,
  vorschlaege: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" fill="currentColor" opacity="0.35" />
    </>
  ),
  neu: (
    <>
      <path d="M4 12a8 8 0 0114-5.3L20 9M20 12a8 8 0 01-14 5.3L4 15" />
      <path d="M20 4v5h-5M4 20v-5h5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type SymbolName = keyof typeof PFADE;

export function WzSymbol({ name, klein }: { name: SymbolName; klein?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={klein ? "h-4 w-4 shrink-0" : "h-5 w-5 shrink-0"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {PFADE[name]}
    </svg>
  );
}

/** Tastenkürzel hübsch: „Strg“ bzw. „⌘“ je nach Rechner. */
const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const strg = MAC ? "⌘" : "Strg";

/** Tooltip (Name und Kürzel) – bei Maus und Tastatur; an Touch-Geräten ohne Hover nur beim Fokus mit der Tastatur. */
function Tooltip({ id, titel, kuerzel, rechts }: { id: string; titel: string; kuerzel?: string; rechts?: boolean }) {
  return (
    <span
      role="tooltip"
      id={id}
      className={`pointer-events-none absolute top-full z-40 mt-1.5 whitespace-nowrap rounded-md bg-kopf px-2.5 py-1 text-[13px] font-normal text-auf-kopf opacity-0 shadow transition-opacity delay-300 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:group-hover:opacity-0 [@media(hover:none)]:group-focus-visible:opacity-100 ${rechts ? "right-0" : "left-1/2 -translate-x-1/2"}`}
    >
      {titel}
      {kuerzel && <kbd className="ml-2 rounded bg-auf-kopf/15 px-1 font-mono text-xs">{kuerzel}</kbd>}
    </span>
  );
}

/** Werkzeugknopf: WzSymbol (und kurzer Text), 44 px hoch – gut zu treffen am Tablet. Gedrückt: leicht getönt, nicht vollflächig. */
export function WzKnopf({
  symbol,
  titel,
  kuerzel,
  an,
  gefahr,
  text,
  textBreit,
  rechts,
  disabled,
  onClick,
}: {
  symbol: SymbolName;
  titel: string;
  kuerzel?: string;
  /** Umschalter: gedrückt. */
  an?: boolean;
  gefahr?: boolean;
  text?: string;
  /** Text nur auf breiten Bildschirmen (sonst Symbol mit Tooltip). */
  textBreit?: boolean;
  /** Tooltip rechtsbündig (Knöpfe am rechten Rand). */
  rechts?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const id = useId();
  return (
    <button
      type="button"
      className={`group relative inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        an ? "bg-band-hell text-band-dunkel" : gefahr ? "text-kamm hover:bg-kamm-hell" : "text-tinte/80 hover:bg-papier hover:text-tinte"
      }`}
      aria-label={titel}
      aria-describedby={id}
      aria-keyshortcuts={kuerzel}
      {...(an !== undefined ? { "aria-pressed": an } : {})}
      disabled={disabled}
      onClick={onClick}
    >
      <WzSymbol name={symbol} />
      {text && <span className={textBreit ? "hidden 2xl:inline" : ""}>{text}</span>}
      <Tooltip id={id} titel={titel} kuerzel={kuerzel} rechts={rechts} />
    </button>
  );
}

/** Gruppe in der Leiste, mit Trennstrich zur nächsten. */
export function WzGruppe({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-0.5 border-r border-linie px-1.5 last:border-r-0">
      {children}
    </div>
  );
}

/**
 * Aufklappmenü der Leiste. Pfeiltasten wählen den Eintrag, Esc oder ein Klick daneben schließt. `children` bekommt
 * `schliessen`, damit ein Eintrag nach dem Auslösen zumacht.
 */
export function WzMenue({ symbol, titel, text, rechts, children }: { symbol: SymbolName; titel: string; text?: string; rechts?: boolean; children: (schliessen: () => void) => ReactNode }) {
  const [offen, setOffen] = useState(false);
  const knopf = useRef<HTMLButtonElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!offen) return;
    liste.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
    const weg = (e: PointerEvent) => {
      if (!liste.current?.contains(e.target as Node) && !knopf.current?.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener("pointerdown", weg);
    return () => document.removeEventListener("pointerdown", weg);
  }, [offen]);
  const schliessen = () => {
    setOffen(false);
    knopf.current?.focus();
  };
  return (
    <div className="relative">
      <button
        ref={knopf}
        type="button"
        className="group relative inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-md px-2.5 text-sm font-semibold text-tinte/80 transition-colors hover:bg-papier hover:text-tinte aria-expanded:bg-papier aria-expanded:text-tinte"
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-controls={offen ? id : undefined}
        aria-label={titel}
        onClick={() => setOffen(!offen)}
      >
        <WzSymbol name={symbol} />
        {text && <span>{text}</span>}
        <span className="text-grau">
          <WzSymbol name="ab" klein />
        </span>
      </button>
      {offen && (
        <div
          ref={liste}
          id={id}
          role="menu"
          aria-label={titel}
          className={`absolute top-full z-40 mt-1 min-w-64 rounded-lg border border-linie-stark bg-weiss p-1 shadow-xl ${rechts ? "right-0" : "left-0"}`}
          onKeyDown={(e) => {
            // Esc gehört dem Menü (hebt nicht zugleich die Auswahl im Plan auf).
            if (e.key === "Escape" || e.key === "Tab") {
              e.stopPropagation();
              if (e.key === "Escape") e.preventDefault();
              return schliessen();
            }
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            e.stopPropagation();
            const eintraege = [...(liste.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? [])];
            const i = eintraege.indexOf(document.activeElement as HTMLElement);
            eintraege[(i + (e.key === "ArrowDown" ? 1 : -1) + eintraege.length) % eintraege.length]?.focus();
          }}
        >
          {children(schliessen)}
        </div>
      )}
    </div>
  );
}

export function MenueEintrag({ symbol, zusatz, gefahr, disabled, onClick, children }: { symbol: SymbolName; zusatz?: ReactNode; gefahr?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-left hover:bg-papier focus:bg-papier focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${gefahr ? "text-kamm" : "text-tinte"}`}
    >
      <span className={gefahr ? "" : "text-grau"}>
        <WzSymbol name={symbol} klein />
      </span>
      <span className="flex-1">{children}</span>
      {zusatz != null && <span className="text-sm tabular-nums text-grau">{zusatz}</span>}
    </button>
  );
}

export function MenueKopf({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-grau">{children}</div>;
}

export const MenueTrenner = () => <hr className="my-1 border-linie" />;
