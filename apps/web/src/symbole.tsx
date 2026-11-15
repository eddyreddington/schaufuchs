/** Einfache Linien-Symbole (24er-Raster, Strichstärke 1,7) für Navigation und Knöpfe. Immer mit Text daneben. */
const PFADE = {
  uebersicht: "M4 11 12 4l8 7v9h-5v-6H9v6H4z",
  einstellungen: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  preisrichter: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20c1-3.5 3.6-5 7-5s6 1.5 7 5",
  kaefige: "M4 4h16v16H4zM4 12h16M12 4v16",
  hallenplan: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14",
  meldungen: "M4 13l2.5-8h11L20 13v6H4zM4 13h5l1 2h4l1-2h5",
  katalognummern: "M9.5 4 8 20M16 4l-1.5 16M5 9h15M4 15h15",
  katalog: "M5 5a1 1 0 0 1 1-1h12v13H7a2 2 0 0 0-2 2zM5 19a2 2 0 0 0 2 2h11v-4",
  einlieferung: "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
  bewertung: "M9 3h6v3H9zM7 5H5v16h14V5h-2M9 13l2 2 4-4",
  preise: "M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM9 13l-2 8 5-3 5 3-2-8",
  verkauf: "M3 12V4h8l10 10-8 8zM7.5 7.5h.01",
  abrechnung: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  kassenbuch: "M4 7h16v12H4zM4 7l2-3h12l2 3M15 13h2",
  meisterschaften: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4",
  spenden: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  import: "M12 4v11M7.5 10.5 12 15l4.5-4.5M4 16v4h16v-4",
  protokoll: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  schauen: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  stammdaten: "M5 5a1 1 0 0 1 1-1h12v13H7a2 2 0 0 0-2 2zM5 19a2 2 0 0 0 2 2h11v-4M9 8h6",
  aussteller: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c.8-3 3-4.5 6-4.5s5.2 1.5 6 4.5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 15.5c1.5.6 2.5 2 3 4.5",
  benutzer: "M15 9a4 4 0 1 1-1.2-2.8M14 10l7 7v3h-3v-2h-2v-2h-2",
  verein: "M12 3l8 3v6c0 4.5-3.4 7.7-8 9-4.6-1.3-8-4.5-8-9V6z",
  hilfe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01",
  runter: "M6 9l6 6 6-6",
  rechts: "M9 6l6 6-6 6",
  menue: "M4 7h16M4 12h16M4 17h16",
  schliessen: "M6 6l12 12M18 6 6 18",
  sonne: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  mond: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  bildschirm: "M3 5h18v11H3zM8 20h8M12 16v4",
} as const;

export type SymbolName = keyof typeof PFADE;

export function Symbol({ name, className = "size-[1.1em]" }: { name: SymbolName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d={PFADE[name]} />
    </svg>
  );
}
