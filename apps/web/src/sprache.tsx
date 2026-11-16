/**
 * Sprache der Oberfläche.
 * - Seiten für Aussteller unter `/s/…` (Entscheidung 020): `?sprache=` im Link (aus der Mail) → zuletzt gewählte Sprache
 *   → Sprache des Browsers → Deutsch.
 * - Alles andere – Anmeldung, Verwaltung, Helfer, Preisrichter-Tablet (Entscheidung 022): Sprache des angemeldeten
 *   Benutzers (gespeichert am Konto) → zuletzt in diesem Browser gewählte → Deutsch. Die Browsersprache allein stellt die
 *   Verwaltung nicht um – wer bisher deutsch gearbeitet hat, merkt vom Update nichts.
 */
import { istSprache, oberflaeche, passendeSprache, SPRACHEN, SPRACHNAME, texte, type OberflaecheTexte, type Sprache, type Texte } from "@schau/domain";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { fehlerText } from "./lib";
import { setzeAktuelleSprache } from "./sprache-jetzt";
import { trpc } from "./trpc";

const SPEICHER = "schaufuchs.sprache";
const Kontext = createContext<{ sprache: Sprache; setzen: (s: Sprache) => void }>({ sprache: "de", setzen: () => {} });

function merken(s: Sprache) {
  try {
    localStorage.setItem(SPEICHER, s);
  } catch {
    // Privater Modus o. Ä.: die Wahl gilt dann nur für diesen Besuch.
  }
}

function gemerkteSprache(): Sprache | null {
  try {
    const gemerkt = localStorage.getItem(SPEICHER);
    if (istSprache(gemerkt)) return gemerkt;
  } catch {
    // wie oben
  }
  return null;
}

/** Sprache der Aussteller-Seiten beim Laden; ein `?sprache=` aus dem Mail-Link gilt als Wahl. */
function anfangsSprache(): Sprache {
  const ausLink = new URLSearchParams(window.location.search).get("sprache");
  if (istSprache(ausLink)) {
    merken(ausLink);
    return ausLink;
  }
  return gemerkteSprache() ?? passendeSprache(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

/** Seiten für Aussteller: Sprache aus Link oder Browser. */
export const istAusstellerSeite = (pfad: string) => pfad.startsWith("/s/");

/** Einmal im Wurzel-Layout (innerhalb des Routers), damit auch Fehlerseite und Rückfragen die Sprache kennen. */
export function SpracheRahmen({ children }: { children: ReactNode }) {
  const aussteller = istAusstellerSeite(useLocation().pathname);
  const [fuerAussteller, setFuerAussteller] = useState(anfangsSprache);
  const [imBrowser, setImBrowser] = useState(() => gemerkteSprache() ?? "de");
  // Angemeldet: die Sprache am Konto (dieselbe Abfrage wie im Rahmen der Verwaltung, also ohne zweiten Aufruf).
  const status = trpc.auth.status.useQuery(undefined, { enabled: !aussteller });
  const utils = trpc.useUtils();
  const amKonto = status.data?.benutzer?.sprache;
  const speichern = trpc.auth.spracheSetzen.useMutation();
  const sprache: Sprache = aussteller ? fuerAussteller : istSprache(amKonto) ? amKonto : imBrowser;
  setzeAktuelleSprache(sprache);
  useEffect(() => {
    document.documentElement.lang = sprache;
  }, [sprache]);
  const setzen = (s: Sprache) => {
    merken(s);
    if (aussteller) {
      setFuerAussteller(s);
      // Eigene Wahl gilt auch nach dem Neuladen: `?sprache=` aus dem Mail-Link sonst wieder vorrangig.
      const url = new URL(window.location.href);
      if (url.searchParams.has("sprache")) {
        url.searchParams.delete("sprache");
        window.history.replaceState(window.history.state, "", url);
      }
      return;
    }
    setImBrowser(s);
    if (status.data?.benutzer) {
      utils.auth.status.setData(undefined, (d) => (d?.benutzer ? { ...d, benutzer: { ...d.benutzer, sprache: s } } : d));
      speichern.mutate({ sprache: s });
    }
  };
  return <Kontext.Provider value={{ sprache, setzen }}>{children}</Kontext.Provider>;
}

export function useSprache(): Sprache {
  return useContext(Kontext).sprache;
}

/** Texte der Aussteller-Seiten (Entscheidung 020) in der Sprache der Seite. */
export function useTexte(): Texte {
  return texte(useContext(Kontext).sprache);
}

/** Texte der Oberfläche (Verwaltung, Helfer, Tablet; Entscheidung 022) in der gewählten Sprache. */
export function useOberflaeche(): OberflaecheTexte {
  return oberflaeche(useContext(Kontext).sprache);
}

/** Auswahl der Sprache, jede in ihrem eigenen Namen. */
export function SprachWahl({ className, hell, mitLabel }: { className?: string; /** auf heller Fläche (Anmeldung, Menü) statt im Kopf */ hell?: boolean; mitLabel?: boolean }) {
  const { sprache, setzen } = useContext(Kontext);
  const t = texte(sprache);
  return (
    <label className={mitLabel ? `flex flex-col gap-1.5 ${className ?? ""}` : className}>
      <span className={mitLabel ? "text-[0.85rem] text-grau" : "sr-only"}>{t.sprache}</span>
      <select
        value={sprache}
        onChange={(e) => istSprache(e.target.value) && setzen(e.target.value)}
        className={
          hell
            ? "min-h-9 w-full cursor-pointer rounded-md border border-linie-stark bg-weiss px-2 text-sm text-tinte hover:border-grau"
            : "min-h-9 cursor-pointer rounded-md border border-auf-kopf/30 bg-transparent px-2 text-sm text-auf-kopf hover:border-auf-kopf/60 [&>option]:text-tinte"
        }
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
