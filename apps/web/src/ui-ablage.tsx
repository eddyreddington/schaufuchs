import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from "react";
import { ablageAbfangen, dateiAusAblage, ziehtDateien } from "./ablage";

/*
 * Ablegen von Dateien per Ziehen (z. B. ein Bild aus dem Dateimanager): `DateiAblage` nimmt eine Datei an wie das
 * Dateifeld daneben, `useAblageAbfangen` fängt Dateien ab, die daneben auf die Seite fallen – sonst öffnet der Browser
 * sie und fragt „Website verlassen?“. Die Regeln (welche Datei, wann abfangen) stehen rein in ablage.ts.
 */

/** Solange die Seite (bzw. die Komponente) offen ist: fallen gelassene Dateien außerhalb einer Ablagefläche abfangen. */
export function useAblageAbfangen() {
  useEffect(() => {
    const ab = (e: DragEvent) => {
      const ziel = e.target;
      const aufDateifeld = ziel instanceof HTMLInputElement && ziel.type === "file";
      if (!ablageAbfangen({ typen: e.dataTransfer?.types, defaultPrevented: e.defaultPrevented, aufDateifeld })) return;
      e.preventDefault();
      if (e.type === "dragover" && e.dataTransfer) e.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", ab);
    window.addEventListener("drop", ab);
    return () => {
      window.removeEventListener("dragover", ab);
      window.removeEventListener("drop", ab);
    };
  }, []);
}

/**
 * Fläche, auf die sich eine Datei ziehen lässt (hervorgehoben, solange eine darüber ist). `accept` wie beim Dateifeld
 * (z. B. „image/jpeg“); angenommen wird die erste passende Datei, sonst die erste (die Prüfung meldet dann das Format).
 */
export function DateiAblage({ accept, onDatei, deaktiviert, className = "", children }: { accept: readonly string[]; onDatei: (datei: File) => void; deaktiviert?: boolean; className?: string; children: ReactNode }) {
  const [darueber, setDarueber] = useState(false);
  // dragenter/dragleave kommen auch beim Wechsel auf Kindelemente – mitzählen, sonst flackert die Hervorhebung.
  const tiefe = useRef(0);
  useAblageAbfangen();
  const mitDateien = (e: ReactDragEvent) => {
    if (!ziehtDateien(e.dataTransfer.types)) return false;
    e.preventDefault();
    return true;
  };
  return (
    <div
      // Hervorhebung nach innen: in Karten mit overflow-hidden bleibt sie sichtbar.
      className={`${className} ${darueber ? "outline-2 -outline-offset-2 outline-band outline-dashed" : ""}`}
      onDragEnter={(e) => {
        if (!mitDateien(e)) return;
        tiefe.current++;
        if (!deaktiviert) setDarueber(true);
      }}
      onDragOver={(e) => {
        if (mitDateien(e)) e.dataTransfer.dropEffect = deaktiviert ? "none" : "copy";
      }}
      onDragLeave={() => {
        tiefe.current = Math.max(0, tiefe.current - 1);
        if (!tiefe.current) setDarueber(false);
      }}
      onDrop={(e) => {
        if (!mitDateien(e)) return;
        tiefe.current = 0;
        setDarueber(false);
        const datei = deaktiviert ? undefined : dateiAusAblage(e.dataTransfer.files, accept);
        if (datei) onDatei(datei);
      }}
    >
      {children}
    </div>
  );
}
