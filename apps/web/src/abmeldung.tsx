import { useEffect, useRef, useState } from "react";
import { useOberflaeche } from "./sprache";

/**
 * Automatische Abmeldung nach Untätigkeit (Frist je Rolle unter „Verein und Datenschutz“).
 * Die letzte Eingabe gilt für alle Tabs gemeinsam (localStorage): Wer in einem Tab arbeitet, wird im anderen nicht abgemeldet.
 * Jeder Aufruf an den Server meldet, wie lange sie her ist (Kopfzeile x-eingabe-vor, siehe trpc.ts).
 */
const SCHLUESSEL = "schau-letzte-eingabe";
let letzte = Date.now();
let geschrieben = 0;

function merken() {
  letzte = Date.now();
  if (letzte - geschrieben < 5_000) return;
  geschrieben = letzte;
  try {
    localStorage.setItem(SCHLUESSEL, String(letzte));
  } catch {
    // ohne Speicher gilt die Eingabe nur für diesen Tab
  }
}

if (typeof window !== "undefined") {
  for (const art of ["pointerdown", "keydown", "wheel", "touchstart", "input"]) window.addEventListener(art, merken, { capture: true, passive: true });
}

/** Millisekunden seit der letzten Eingabe in irgendeinem Tab dieser Anwendung. */
export function eingabeVorMs(): number {
  let andere = 0;
  try {
    andere = Number(localStorage.getItem(SCHLUESSEL)) || 0;
  } catch {
    // ignorieren
  }
  return Math.max(0, Date.now() - Math.max(letzte, andere));
}

/**
 * Schickt bei Eingaben höchstens jede Minute ein Lebenszeichen (damit langes Ausfüllen eines Formulars zählt) und ruft
 * nach Ablauf der Frist `abmelden` auf. Gibt in der letzten Minute die Restzeit zurück, sonst null.
 */
export function useAutoAbmeldung(minuten: number | null | undefined, lebenszeichen: () => Promise<unknown>, abmelden: () => void): number | null {
  const [rest, setRest] = useState<number | null>(null);
  const aufrufe = useRef({ lebenszeichen, abmelden });
  aufrufe.current = { lebenszeichen, abmelden };
  useEffect(() => {
    setRest(null);
    if (!minuten) return;
    let zeichen = Date.now();
    const id = setInterval(() => {
      const vor = eingabeVorMs();
      const bleibt = minuten * 60_000 - vor;
      if (bleibt <= 0) {
        clearInterval(id);
        setRest(null);
        aufrufe.current.abmelden();
        return;
      }
      setRest(bleibt <= 60_000 ? bleibt : null);
      if (vor < 60_000 && Date.now() - zeichen > 60_000) {
        zeichen = Date.now();
        aufrufe.current.lebenszeichen().catch(() => {});
      }
    }, 1_000);
    return () => clearInterval(id);
  }, [minuten]);
  return rest;
}

/** Hinweis in der letzten Minute vor der automatischen Abmeldung. */
export function AbmeldeHinweis({ rest }: { rest: number | null }) {
  const t = useOberflaeche().rahmen.abmeldung;
  if (rest == null) return null;
  return (
    <div role="status" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-md bg-tinte px-4 py-3 text-center text-sm text-papier shadow-lg">
      {t.hinweis(Math.ceil(rest / 1000))}
    </div>
  );
}
