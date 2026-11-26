/**
 * Seitenmenü (linke Leiste): Seiten der Schau nach dem Ablauf gruppiert, darunter Verein und Einrichtung. Gruppen
 * lassen sich einklappen; der Zustand wird je Browser gemerkt. Offen sind ohne gemerkte Wahl die Gruppe der aktuellen
 * Phase und die Gruppe der aktuellen Seite – kommt man auf eine Seite in einer eingeklappten Gruppe, klappt sie auf.
 */
import type { OberflaecheTexte, Phase } from "@schau/domain";
import { useEffect, useId, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Symbol, type SymbolName } from "./symbole";

export interface MenueSeite {
  /** In der Schau relativ zu /schau/:id, sonst absolut. */
  pfad: string;
  label: string;
  symbol: SymbolName;
  /** Weitere Seiten, bei denen der Punkt hervorgehoben ist (das Protokoll erreicht man über die Einstellungen). */
  auch?: string[];
  /** Nur für Administratoren sichtbar. */
  nurAdmin?: boolean;
}
export interface MenueGruppe {
  /** Schlüssel für den gemerkten Zustand; null = Gruppe ohne Überschrift, nicht einklappbar. */
  id: string | null;
  name: string;
  seiten: MenueSeite[];
  /** In diesen Phasen ist die Gruppe ohne gemerkte Wahl offen. */
  phasen?: Phase[];
}

/**
 * Seiten der Schau in der Reihenfolge, in der eine Schau abläuft: vorbereiten, Meldungen annehmen, nach dem Meldeschluss
 * Käfige, Hallenplan und Katalog, dann die Schautage. Kasse, Spenden und Abrechnung laufen über die ganze Schau und
 * stehen deshalb in einer eigenen Gruppe, nicht unter einem „Abschluss“. Beschriftungen in der Sprache der Oberfläche.
 */
export function schauGruppen(t: OberflaecheTexte): MenueGruppe[] {
  const m = t.rahmen.menue;
  return [
    { id: null, name: "", seiten: [{ pfad: "", label: m.uebersicht, symbol: "uebersicht" }] },
    {
      id: "vorbereitung",
      name: m.vorbereitung,
      phasen: ["vorbereitung"],
      seiten: [
        { pfad: "einstellungen", label: m.einstellungen, symbol: "einstellungen", auch: ["protokoll"] },
        { pfad: "preisrichter", label: m.preisrichter, symbol: "preisrichter" },
      ],
    },
    {
      id: "meldephase",
      name: m.meldephase,
      phasen: ["meldung"],
      seiten: [
        { pfad: "meldungen", label: m.meldungen, symbol: "meldungen" },
        { pfad: "kontoauszug", label: m.kontoauszug, symbol: "kontoauszug", nurAdmin: true },
      ],
    },
    {
      // Erst mit den Meldungen weiß man, wie viele Käfige welcher Größe in die Halle müssen. Die Katalognummern folgen der
      // Ausstellungsfolge oder dem Plan; die Bereiche der Preisrichter (Einteilung nach Rassen) folgen den Nummern.
      id: "meldeschluss",
      name: m.nachMeldeschluss,
      phasen: ["katalog"],
      seiten: [
        { pfad: "kaefige", label: m.kaefige, symbol: "kaefige" },
        { pfad: "hallenplan", label: m.hallenplan, symbol: "hallenplan" },
        { pfad: "katalog", label: m.katalognummern, symbol: "katalognummern" },
        { pfad: "katalog/gestalten", label: m.katalog, symbol: "katalog" },
      ],
    },
    {
      id: "schautage",
      name: m.schautage,
      phasen: ["einlieferung", "bewertung", "preise", "schau"],
      seiten: [
        { pfad: "einlieferung", label: m.einlieferung, symbol: "einlieferung" },
        { pfad: "bewertung", label: m.bewertung, symbol: "bewertung" },
        { pfad: "preise", label: m.preise, symbol: "preise" },
        { pfad: "meisterschaften", label: m.meisterschaften, symbol: "meisterschaften" },
        { pfad: "verkauf", label: m.tierverkauf, symbol: "verkauf" },
      ],
    },
    {
      id: "kasse",
      name: m.kasseAbrechnung,
      phasen: ["schau", "abrechnung", "abgeschlossen"],
      seiten: [
        { pfad: "kassenbuch", label: m.kassenbuch, symbol: "kassenbuch" },
        { pfad: "spenden", label: m.spenden, symbol: "spenden" },
        { pfad: "lastschrift", label: m.lastschrift, symbol: "lastschrift", nurAdmin: true },
        { pfad: "abrechnung", label: m.abrechnung, symbol: "abrechnung" },
      ],
    },
  ];
}

/** Seiten außerhalb einer Schau. Verein nur für Administratoren. */
export function allgemeineGruppen(istAdmin: boolean, t: OberflaecheTexte): MenueGruppe[] {
  const m = t.rahmen.menue;
  return [
    { id: null, name: "", seiten: [{ pfad: "/", label: m.alleSchauen, symbol: "schauen" }] },
    ...(istAdmin
      ? [
          {
            id: "verein",
            name: m.verein,
            seiten: [
              { pfad: "/aussteller", label: m.aussteller, symbol: "aussteller" as const },
              { pfad: "/spender", label: m.spender, symbol: "spenden" as const },
              { pfad: "/import", label: m.import, symbol: "import" as const },
              { pfad: "/verein", label: m.vereinDatenschutz, symbol: "verein" as const },
            ],
          },
        ]
      : []),
    {
      id: "einrichtung",
      name: m.einrichtung,
      seiten: [
        { pfad: "/stammdaten", label: m.stammdaten, symbol: "stammdaten" },
        { pfad: "/benutzer", label: istAdmin ? m.benutzer : m.meinZugang, symbol: "benutzer" },
      ],
    },
  ];
}

const SPEICHER = "schaufuchs.menue";
function gemerkt(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(SPEICHER) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Gemerkter Zustand der Gruppen (je Browser, für alle Tabs). */
export function useKlappzustand() {
  const [zustand, setZustand] = useState(gemerkt);
  const setze = (id: string, offen: boolean) =>
    setZustand((z) => {
      const neu = { ...z, [id]: offen };
      try {
        localStorage.setItem(SPEICHER, JSON.stringify(neu));
      } catch {
        // Ohne Speicher (privates Fenster) gilt die Wahl bis zum Neuladen.
      }
      return neu;
    });
  return { zustand, setze };
}

const leistenLink = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 no-underline ${isActive ? "bg-weiss font-bold text-tinte shadow-[0_0_0_1px_var(--color-linie-stark),0_1px_2px_rgb(0_0_0/0.05)] [&>svg]:text-band" : "font-medium text-tinte/85 hover:bg-linie/60 hover:text-tinte [&>svg]:text-grau"}`;
export { leistenLink };

/**
 * Gruppen eines Menüteils. `basis`: Vorsilbe der Pfade (in der Schau /schau/:id). `vorgabeOffen`: ohne gemerkte Wahl
 * offen (z. B. Gruppe der aktuellen Phase).
 */
export function MenueGruppen({ gruppen, basis = "", vorgabeOffen, klapp, label, nachher }: { gruppen: MenueGruppe[]; basis?: string; vorgabeOffen: (g: MenueGruppe) => boolean; klapp: ReturnType<typeof useKlappzustand>; label: string; nachher?: ReactNode }) {
  const ort = useLocation();
  const pfad = ort.pathname.replace(/\/$/, "") || "/";
  const ziel = (s: MenueSeite) => (basis ? `${basis}${s.pfad ? `/${s.pfad}` : ""}` : s.pfad);
  const aktiv = (s: MenueSeite) => pfad === ziel(s) || (!basis && s.pfad !== "/" && pfad.startsWith(`${s.pfad}/`)) || !!s.auch?.some((a) => pfad === `${basis}/${a}`);
  const aktiveGruppe = gruppen.find((g) => g.seiten.some(aktiv))?.id ?? null;
  // Auf eine Seite in einer eingeklappten Gruppe gekommen (z. B. über die Übersicht): Gruppe aufklappen.
  useEffect(() => {
    if (aktiveGruppe && klapp.zustand[aktiveGruppe] === false) klapp.setze(aktiveGruppe, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiveGruppe]);
  return (
    <nav aria-label={label} className="flex flex-col gap-3.5">
      {gruppen.map((g) => (
        <Gruppe key={g.id ?? g.seiten[0]!.pfad} g={g} offen={!g.id || (klapp.zustand[g.id] ?? (vorgabeOffen(g) || g.id === aktiveGruppe))} umschalten={(o) => g.id && klapp.setze(g.id, o)}>
          {g.seiten.map((s) => (
            <NavLink key={s.pfad} to={ziel(s)} end={!!basis || s.pfad === "/"} className={() => leistenLink({ isActive: aktiv(s) })}>
              <Symbol name={s.symbol} />
              {s.label}
            </NavLink>
          ))}
        </Gruppe>
      ))}
      {nachher}
    </nav>
  );
}

function Gruppe({ g, offen, umschalten, children }: { g: MenueGruppe; offen: boolean; umschalten: (offen: boolean) => void; children: ReactNode }) {
  const id = useId();
  if (!g.id) return <div className="flex flex-col gap-px">{children}</div>;
  return (
    <div className="flex flex-col gap-px">
      <button type="button" aria-expanded={offen} aria-controls={id} onClick={() => umschalten(!offen)} className="group flex items-center justify-between rounded-md px-2.5 py-1 text-left text-[0.95rem] font-bold text-tinte hover:bg-linie/60">
        {g.name}
        <Symbol name="runter" className={`size-3.5 transition-transform ${offen ? "" : "-rotate-90"}`} />
      </button>
      <div id={id} hidden={!offen} className="ml-3 flex flex-col gap-px border-l border-linie-stark pl-1.5">
        {children}
      </div>
    </div>
  );
}
