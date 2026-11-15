import { useEffect, useState } from "react";

/** Farbmodus der Oberfläche: „system“ folgt der Einstellung des Geräts. Gespeichert nur auf diesem Gerät. */
export type Farbmodus = "system" | "hell" | "dunkel";
const SCHLUESSEL = "farbmodus";

function lesen(): Farbmodus {
  try {
    const m = localStorage.getItem(SCHLUESSEL);
    return m === "hell" || m === "dunkel" ? m : "system";
  } catch {
    return "system";
  }
}

export function setzeFarbmodus(m: Farbmodus) {
  try {
    if (m === "system") localStorage.removeItem(SCHLUESSEL);
    else localStorage.setItem(SCHLUESSEL, m);
  } catch {
    // Privater Modus o. Ä.: gilt dann nur bis zum Neuladen.
  }
  if (m === "system") document.documentElement.removeAttribute("data-modus");
  else document.documentElement.setAttribute("data-modus", m);
  window.dispatchEvent(new Event("farbmodus"));
}

export function useFarbmodus(): [Farbmodus, (m: Farbmodus) => void] {
  const [modus, setModus] = useState<Farbmodus>(lesen);
  useEffect(() => {
    const neu = () => {
      const m = lesen();
      // Anderer Tab hat gewechselt: Farben hier ebenfalls umstellen.
      if (m === "system") document.documentElement.removeAttribute("data-modus");
      else document.documentElement.setAttribute("data-modus", m);
      setModus(m);
    };
    window.addEventListener("farbmodus", neu);
    window.addEventListener("storage", neu);
    return () => {
      window.removeEventListener("farbmodus", neu);
      window.removeEventListener("storage", neu);
    };
  }, []);
  return [modus, setzeFarbmodus];
}
