/** Eingabefelder der Hallen-Eigenschaften: Zahl mit Einheit, Übernahme mit Enter, Meter-Feld (gespeichert in cm). */
import { type InputHTMLAttributes, useEffect, useRef, useState } from "react";
import { useOberflaeche } from "../sprache";
import { Eingabe, Feld } from "../ui";
import { meter, zuCm } from "./hallenplan-geometrie";

/** Eingabefeld mit Einheit am rechten Rand (z. B. „m“). */
export function MitEinheit({ einheit, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { einheit: string }) {
  return (
    <span className="relative block">
      <Eingabe {...props} className={`pr-8 tabular-nums ${className}`} />
      <span aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-grau">
        {einheit}
      </span>
    </span>
  );
}

/**
 * Enter in einem Feld übernimmt den Wert – erst nach diesem Tastendruck: öffnet die Übernahme eine Rückfrage, darf derselbe
 * Tastendruck sie nicht gleich bestätigen.
 */
export function enterUebernimmt(e: React.KeyboardEvent, uebernehmen: () => Promise<void> | void) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  setTimeout(() => void uebernehmen(), 0);
}

/**
 * Zahl in Metern, gespeichert in cm: übernommen beim Verlassen des Felds oder mit Enter. Ungültiges (oder eine abgelehnte
 * Rückfrage) springt auf den gespeicherten Wert zurück.
 */
export function MeterFeld({ label, cm, setzen, min = 0, max = 50000, disabled }: { label: string; cm: number; setzen: (cm: number) => boolean | Promise<boolean> | void; min?: number; max?: number; disabled?: boolean }) {
  const t = useOberflaeche().halle;
  const [wert, setWert] = useState(meter(cm));
  useEffect(() => setWert(meter(cm)), [cm]);
  // Eine Übernahme zur Zeit (Enter und das Verlassen des Felds, wenn die Rückfrage aufgeht, kämen sonst doppelt).
  const laeuft = useRef(false);
  const wertRef = useRef(wert);
  wertRef.current = wert;
  const uebernehmen = async () => {
    if (laeuft.current) return;
    // Nur, was wirklich geändert wurde (krumme Werte nach dem Einrasten sollen beim bloßen Verlassen nicht rücken).
    if (wertRef.current.trim() === meter(cm)) return;
    const neu = zuCm(wertRef.current);
    if (!wertRef.current.trim() || !Number.isFinite(neu) || neu < min || neu > max || neu === cm) return setWert(meter(cm));
    laeuft.current = true;
    try {
      if ((await setzen(neu)) === false) setWert(meter(cm));
    } finally {
      laeuft.current = false;
    }
  };
  return (
    <Feld label={label}>
      {(id) => <MitEinheit id={id} disabled={disabled} einheit="m" aria-label={t.inMetern(label)} inputMode="decimal" value={wert} onChange={(e) => setWert(e.target.value)} onBlur={() => void uebernehmen()} onKeyDown={(e) => enterUebernimmt(e, uebernehmen)} />}
    </Feld>
  );
}
