/**
 * Schriftgröße der Oberfläche für ältere Menschen: vergrößert über die Grundschrift (html font-size) alles, was in rem
 * gebaut ist – Schrift, Knöpfe, Abstände. Gespeichert nur auf diesem Gerät, gesetzt vor dem ersten Zeichnen
 * (public/modus.js), wirkt in allen Tabs. Ergänzt die Zoom-Funktion des Browsers, ersetzt sie nicht.
 */
import { useEffect, useId, useState } from "react";
import { useTexte } from "./sprache";

export type Schriftgroesse = "normal" | "gross" | "sehr-gross";
const SCHLUESSEL = "schriftgroesse";

/** Stufen mit Schlüssel der Beschriftung (Texte.schrift) und Größe des „A“ als Probe. */
const GROESSEN: { wert: Schriftgroesse; text: "normal" | "gross" | "sehrGross"; probe: string }[] = [
  { wert: "normal", text: "normal", probe: "text-[0.85rem]" },
  { wert: "gross", text: "gross", probe: "text-[1rem]" },
  { wert: "sehr-gross", text: "sehrGross", probe: "text-[1.15rem]" },
];

function lesen(): Schriftgroesse {
  try {
    const g = localStorage.getItem(SCHLUESSEL);
    return g === "gross" || g === "sehr-gross" ? g : "normal";
  } catch {
    return "normal";
  }
}

function anwenden(g: Schriftgroesse) {
  if (g === "normal") document.documentElement.removeAttribute("data-groesse");
  else document.documentElement.setAttribute("data-groesse", g);
}

export function setzeSchriftgroesse(g: Schriftgroesse) {
  try {
    if (g === "normal") localStorage.removeItem(SCHLUESSEL);
    else localStorage.setItem(SCHLUESSEL, g);
  } catch {
    // Privater Modus o. Ä.: gilt dann nur bis zum Neuladen.
  }
  anwenden(g);
  window.dispatchEvent(new Event(SCHLUESSEL));
}

export function useSchriftgroesse(): [Schriftgroesse, (g: Schriftgroesse) => void] {
  const [groesse, setGroesse] = useState<Schriftgroesse>(lesen);
  useEffect(() => {
    const neu = () => {
      const g = lesen();
      anwenden(g); // anderer Tab hat gewechselt
      setGroesse(g);
    };
    window.addEventListener(SCHLUESSEL, neu);
    window.addEventListener("storage", neu);
    return () => {
      window.removeEventListener(SCHLUESSEL, neu);
      window.removeEventListener("storage", neu);
    };
  }, []);
  return [groesse, setzeSchriftgroesse];
}

/**
 * Drei Knöpfe „A“ in wachsender Größe. Mit Namen und Überschrift für Benutzermenü und Anmeldung; `knapp` nur die drei
 * „A“ (Name als Tooltip und für Bildschirmleser) für Kopfzeilen, `aufKopf` auf der dunklen Kopffläche der Ausstellerseiten.
 */
export function SchriftgroesseWahl({ className = "", knapp, aufKopf }: { className?: string; knapp?: boolean; aufKopf?: boolean }) {
  const [groesse, setGroesse] = useSchriftgroesse();
  const t = useTexte().schrift;
  const label = useId();
  const rahmen = aufKopf ? "border-auf-kopf/30" : "border-linie-stark bg-papier";
  const aktiv = aufKopf ? "bg-auf-kopf font-semibold text-kopf" : "bg-weiss font-semibold text-tinte shadow-sm";
  const sonst = aufKopf ? "text-auf-kopf/75 hover:text-auf-kopf" : "text-grau hover:text-tinte";
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <span className={knapp ? "sr-only" : "text-[0.85rem] text-grau"} id={label}>
        {t.titel}
      </span>
      <div role="group" aria-labelledby={label} className={`grid grid-cols-3 gap-0.5 rounded-md border p-0.5 ${rahmen}`}>
        {GROESSEN.map((g) => (
          <button
            key={g.wert}
            type="button"
            aria-pressed={groesse === g.wert}
            aria-label={knapp ? t[g.text] : undefined}
            title={knapp ? t[g.text] : undefined}
            onClick={() => setGroesse(g.wert)}
            className={`flex flex-col items-center justify-center rounded leading-tight ${knapp ? "min-w-8 px-1.5" : "px-1.5 py-1"} ${groesse === g.wert ? aktiv : sonst}`}
          >
            <span aria-hidden className={`font-bold ${g.probe}`}>
              A
            </span>
            {!knapp && <span className="text-[0.75rem]">{t[g.text]}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
