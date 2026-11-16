/**
 * Sprache der Seiten für Aussteller (Entscheidung 020): alles unter `/s/…` – öffentliche Schauseite, Online-Meldung,
 * Meine Meldung, Ergebnisse, Impressum, Datenschutz, dazu Fehlerseite, Rückfrage „Seite verlassen?“ und „Bitte warten“.
 * Die Oberfläche des Vereins (alle anderen Adressen) bleibt deutsch.
 * Vorrang: `?sprache=` im Link (aus der Mail) → zuletzt gewählte Sprache → Sprache des Browsers → Deutsch.
 */
import { istSprache, passendeSprache, SPRACHEN, SPRACHNAME, texte, type Sprache, type Texte } from "@schau/domain";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { fehlerText } from "./lib";

const SPEICHER = "schaufuchs.sprache";
const Kontext = createContext<{ sprache: Sprache; setzen: (s: Sprache) => void }>({ sprache: "de", setzen: () => {} });

function merken(s: Sprache) {
  try {
    localStorage.setItem(SPEICHER, s);
  } catch {
    // Privater Modus o. Ä.: die Wahl gilt dann nur für diesen Besuch.
  }
}

function anfangsSprache(): Sprache {
  const ausLink = new URLSearchParams(window.location.search).get("sprache");
  if (istSprache(ausLink)) {
    merken(ausLink);
    return ausLink;
  }
  try {
    const gemerkt = localStorage.getItem(SPEICHER);
    if (istSprache(gemerkt)) return gemerkt;
  } catch {
    // wie oben
  }
  return passendeSprache(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

/** Seiten für Aussteller: nur diese folgen der gewählten Sprache. */
export const istAusstellerSeite = (pfad: string) => pfad.startsWith("/s/");

/** Einmal im Wurzel-Layout (innerhalb des Routers), damit auch Fehlerseite und Rückfragen die Sprache kennen. */
export function SpracheRahmen({ children }: { children: ReactNode }) {
  const [gewaehlt, setGewaehlt] = useState(anfangsSprache);
  const sprache = istAusstellerSeite(useLocation().pathname) ? gewaehlt : "de";
  useEffect(() => {
    document.documentElement.lang = sprache;
  }, [sprache]);
  const setzen = (s: Sprache) => {
    setGewaehlt(s);
    merken(s);
    // Eigene Wahl gilt auch nach dem Neuladen: `?sprache=` aus dem Mail-Link sonst wieder vorrangig.
    const url = new URL(window.location.href);
    if (url.searchParams.has("sprache")) {
      url.searchParams.delete("sprache");
      window.history.replaceState(window.history.state, "", url);
    }
  };
  return <Kontext.Provider value={{ sprache, setzen }}>{children}</Kontext.Provider>;
}

export function useSprache(): Sprache {
  return useContext(Kontext).sprache;
}

/** Texte in der Sprache der Seite – außerhalb des Rahmens (Oberfläche des Vereins) Deutsch. */
export function useTexte(): Texte {
  return texte(useContext(Kontext).sprache);
}

/** Auswahl der Sprache, jede in ihrem eigenen Namen. */
export function SprachWahl({ className }: { className?: string }) {
  const { sprache, setzen } = useContext(Kontext);
  const t = texte(sprache);
  return (
    <label className={className}>
      <span className="sr-only">{t.sprache}</span>
      <select
        value={sprache}
        onChange={(e) => istSprache(e.target.value) && setzen(e.target.value)}
        className="min-h-9 cursor-pointer rounded-md border border-auf-kopf/30 bg-transparent px-2 text-sm text-auf-kopf hover:border-auf-kopf/60 [&>option]:text-tinte"
      >
        {SPRACHEN.map((s) => (
          <option key={s} value={s} lang={s}>
            {SPRACHNAME[s]}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Fehlertext für Aussteller: Deutsch genau wie bisher. In anderen Sprachen die bekannten Fälle übersetzt; Meldungen,
 * die der Server schon in der Sprache des Formulars schickt, unverändert.
 */
export function fehlerFuerAussteller(err: unknown, sprache: Sprache): string {
  // Deutsch und Schweiz: die Einzeltexte des Servers (z. B. welche Eingabe nicht stimmt); der Server schreibt seine
  // eigenen Meldungen für die Schweiz schon mit „ss“.
  if (sprache === "de" || sprache === "de-CH") return fehlerText(err);
  const t = texte(sprache).fehler;
  const e = (err ?? {}) as { message?: string; data?: { code?: string; zod?: unknown } | null };
  if (e.data?.code === "TOO_MANY_REQUESTS") return t.zuViele;
  // Beide Fälle von CONFLICT bei der Online-Meldung heißen: diese Person hat schon gemeldet.
  if (e.data?.code === "CONFLICT") return t.schonGemeldet;
  if (e.data?.code === "INTERNAL_SERVER_ERROR") return t.unbekannt;
  if (e.data?.zod || e.message?.startsWith("[") || e.message?.startsWith("{")) return t.eingaben;
  if (e.message === "Failed to fetch") return t.verbindung;
  // Sonst schickt der Server die Meldung schon in der Sprache des Formulars (Online-Meldung, Einwilligung).
  return e.message || t.unbekannt;
}
