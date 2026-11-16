/** Warnung vor dem Verlassen mit ungespeicherten Eingaben (Formulare anmelden, ein Wächter im Wurzel-Layout). */
import { useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";
import { useTexte } from "./sprache";
import { useFrage } from "./ui-dialog";

/**
 * Warnt vor dem Verlassen mit ungespeicherten Eingaben: beim Schließen/Neuladen (Browser) und beim Wechsel
 * innerhalb der App (React Router). `ungespeichert` wird erst beim Navigieren gefragt – nach dem Speichern also aktuell.
 */
/** Alle Formulare mit ungespeicherten Eingaben; ein einziger Wächter fragt vor dem Verlassen (Router kennt nur eine Sperre). */
const formulare = new Set<{ current: () => boolean }>();
const etwasUngespeichert = () => [...formulare].some((f) => f.current());

/** Meldet ein Formular beim Wächter an: ungespeichert() sagt, ob Eingaben verloren gingen. */
export function useUngespeichertWarnung(ungespeichert: () => boolean) {
  const frage = useRef(ungespeichert);
  frage.current = ungespeichert;
  useEffect(() => {
    formulare.add(frage);
    return () => {
      formulare.delete(frage);
    };
  }, []);
}

/**
 * Warnung für ein Formular, dessen Stand gegen den zuletzt gespeicherten verglichen wird.
 * Rückgabe: nach erfolgreichem Speichern aufrufen.
 */
export function useAenderungenWarnen(stand: unknown) {
  const text = JSON.stringify(stand);
  const gespeichert = useRef(text);
  useUngespeichertWarnung(() => gespeichert.current !== text);
  return () => {
    gespeichert.current = text;
  };
}

/** Einmal im Wurzel-Layout: fragt vor dem Verlassen (Navigation oder Fenster), wenn ein Formular Ungespeichertes hat. */
export function UngespeichertWaechter() {
  useEffect(() => {
    const warnen = (e: BeforeUnloadEvent) => {
      if (etwasUngespeichert()) e.preventDefault();
    };
    window.addEventListener("beforeunload", warnen);
    return () => window.removeEventListener("beforeunload", warnen);
  }, []);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname && etwasUngespeichert());
  const { bestaetige } = useFrage();
  // Auf den Seiten für Aussteller in deren Sprache (der Dialog selbst liegt außerhalb des Routers).
  const t = useTexte().rahmen;
  // Die Rückfrage ist asynchron: nicht ein zweites Mal fragen, solange die erste offen ist.
  const fragt = useRef(false);
  useEffect(() => {
    if (blocker.state !== "blocked" || fragt.current) return;
    fragt.current = true;
    void bestaetige({ titel: t.verlassenTitel, text: t.verlassenText, knopf: t.verlassen, abbrechen: t.abbrechen, gefahr: true }).then((ja) => {
      fragt.current = false;
      if (ja) blocker.proceed?.();
      else blocker.reset?.();
    });
  }, [blocker, bestaetige, t]);
  return null;
}
