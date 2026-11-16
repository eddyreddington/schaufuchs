/** Speichern in der Kopfleiste: Speicherleiste bei ungespeicherten Änderungen, Speicherstatus bei sofortigem Speichern. */
import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { useOberflaeche } from "./sprache";
import { cx } from "./ui-basis";
import { Knopf } from "./ui-knoepfe";

/** Platz für „Speichern“ oben rechts in der Kopfleiste des Rahmens (setzt AppRahmen). */
export const SpeicherPlatz = createContext<HTMLElement | null>(null);

/**
 * Bei ungespeicherten Änderungen: „Speichern“ (und „Verwerfen“) oben rechts in der Kopfleiste – dort bleibt es beim
 * Scrollen sichtbar, auf allen Seiten an derselben Stelle. Ohne Rahmen (Seiten ohne Kopfleiste) als Leiste am unteren Rand.
 */
export function Speicherleiste({ sichtbar, onVerwerfen, onSpeichern, laedt, text: eigenerText, knopf: eigenerKnopf }: { sichtbar: boolean; onVerwerfen?: () => void; onSpeichern: () => void; laedt?: boolean; text?: string; knopf?: string }) {
  const platz = useContext(SpeicherPlatz);
  const t = useOberflaeche();
  // Vorgaben in der Sprache der Oberfläche: „Ungespeicherte Änderungen“ und „Speichern“.
  const text = eigenerText ?? t.rahmen.speichern.ungespeichert;
  const knopf = eigenerKnopf ?? t.allgemein.speichern;
  if (!sichtbar) return null;
  if (platz)
    return createPortal(
      <div role="region" aria-label={text} className="flex items-center gap-2">
        <span className="speicher-text hidden items-center gap-2 text-[0.93rem] font-semibold text-stroh-dunkel 2xl:flex">
          <span aria-hidden className="size-2 rounded-full bg-current" />
          {text}
        </span>
        {onVerwerfen && (
          <Knopf variante="leise" onClick={onVerwerfen}>
            {t.rahmen.speichern.verwerfen}
          </Knopf>
        )}
        <Knopf variante="primaer" laedt={laedt} onClick={onSpeichern}>
          {knopf}
        </Knopf>
      </div>,
      platz,
    );
  return (
    <div role="region" aria-label={text} className="sticky bottom-0 z-20 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-linie-stark bg-weiss/95 px-4 py-3 shadow-lg backdrop-blur">
      <span className="mr-auto flex items-center gap-2 font-semibold text-stroh-dunkel">
        <span aria-hidden className="size-2 rounded-full bg-current" />
        {text}
      </span>
      {onVerwerfen && (
        <Knopf variante="leise" onClick={onVerwerfen}>
          {t.rahmen.speichern.verwerfen}
        </Knopf>
      )}
      <Knopf variante="primaer" laedt={laedt} onClick={onSpeichern}>
        {knopf}
      </Knopf>
    </div>
  );
}

export type SpeicherStand = "speichert" | "gespeichert" | "fehler";
const SPEICHER_FARBE: Record<SpeicherStand, string> = { speichert: "text-grau", gespeichert: "text-stall", fehler: "text-kamm" };

/**
 * Seiten, die jede Änderung sofort speichern (Hallenplan): oben rechts in der Kopfleiste steht statt „Speichern“, ob
 * gespeichert ist – an derselben Stelle wie sonst der Knopf. `eingebettet`: zusätzlich an Ort und Stelle (Vollansicht).
 */
export function SpeicherStatus({ stand, eingebettet }: { stand: SpeicherStand | null; eingebettet?: boolean }) {
  const platz = useContext(SpeicherPlatz);
  const t = useOberflaeche().rahmen.speichern;
  if (!stand) return null;
  const text = { speichert: t.wirdGespeichert, gespeichert: t.gespeichert, fehler: t.nichtGespeichert }[stand];
  const farbe = SPEICHER_FARBE[stand];
  const inhalt = (
    <span role="status" aria-live="polite" className={cx("flex items-center gap-2 text-[0.93rem] font-semibold", farbe)}>
      <span aria-hidden className={cx("size-2 rounded-full bg-current", stand === "speichert" && "animate-pulse")} />
      {text}
    </span>
  );
  if (eingebettet || !platz) return inhalt;
  return createPortal(inhalt, platz);
}
