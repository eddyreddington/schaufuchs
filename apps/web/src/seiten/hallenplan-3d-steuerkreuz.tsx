/**
 * Steuerkreuz unten rechts in der 3D-Ansicht – für Tablet und Maus, was am Rechner die Tasten tun: gehen, drehen, zoomen
 * (solange gedrückt) und die gewählte Ansicht wieder einnehmen.
 */
import type { PointerEvent as ZeigerEreignis, ReactNode } from "react";
import type { Bewegung, Richtung } from "./hallenplan-3d-steuerung";

const KLASSE = "flex size-10 select-none items-center justify-center rounded-md border border-linie bg-weiss/90 text-lg text-tinte shadow-sm hover:bg-papier active:bg-linie touch-none";

export function Steuerkreuz({ bewegung, zentrieren }: { bewegung: () => Bewegung | undefined; zentrieren: () => void }) {
  const halte = (r: Richtung, titel: string, zeichen: ReactNode) => {
    const los = () => bewegung()?.halten(r, false);
    return (
      <button
        type="button"
        className={KLASSE}
        title={titel}
        aria-label={titel}
        onPointerDown={(e: ZeigerEreignis<HTMLButtonElement>) => {
          // Festhalten: auch beim Verrutschen über den Knopfrand hinaus kommt das Loslassen hier an.
          e.currentTarget.setPointerCapture(e.pointerId);
          bewegung()?.halten(r, true);
        }}
        onPointerUp={los}
        onPointerCancel={los}
        onLostPointerCapture={los}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          // Mit der Tastatur ausgelöst (Eingabe, Leertaste): ein kurzer Schritt.
          if (e.detail !== 0) return;
          bewegung()?.halten(r, true);
          setTimeout(los, 250);
        }}
      >
        {zeichen}
      </button>
    );
  };
  return (
    <div className="absolute bottom-3 right-3 flex items-end gap-2" role="group" aria-label="Steuerung">
      <div className="grid grid-cols-3 gap-1">
        {halte("dreheLinks", "Nach links drehen (Q)", "⟲")}
        {halte("vor", "Vorwärts (W, ↑)", "▲")}
        {halte("dreheRechts", "Nach rechts drehen (E)", "⟳")}
        {halte("links", "Nach links (A, ←)", "◀")}
        <button type="button" className={KLASSE} title="Ansicht zurücksetzen" aria-label="Ansicht zurücksetzen" onClick={zentrieren}>
          ⌂
        </button>
        {halte("rechts", "Nach rechts (D, →)", "▶")}
        <span />
        {halte("zurueck", "Rückwärts (S, ↓)", "▼")}
        <span />
      </div>
      <div className="flex flex-col gap-1">
        {halte("naeher", "Näher (+)", "+")}
        {halte("weiter", "Weiter weg (−)", "−")}
      </div>
    </div>
  );
}
