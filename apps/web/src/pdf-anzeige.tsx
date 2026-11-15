/**
 * PDF im Browser anzeigen (pdf.js), gemeinsam für die Live-Vorschauen von Katalog und Druckvorlagen.
 * pdf.js wird erst geladen, wenn eine solche Seite es braucht (eigene Datei, nicht im Zwischenspeicher der App).
 */
import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

type Pdfjs = typeof import("pdfjs-dist");
let pdfjsLaden: Promise<Pdfjs> | null = null;
/** pdf.js erst auf dieser Seite laden (eigene Datei, nicht im Zwischenspeicher der App). */
export function pdfjs(): Promise<Pdfjs> {
  pdfjsLaden ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([p, w]) => {
    p.GlobalWorkerOptions.workerSrc = w.default;
    return p;
  });
  return pdfjsLaden;
}

/** Eine PDF-Seite als Bild, `breite` in CSS-Pixeln für die Auflösung (scharf auf hochauflösenden Bildschirmen); die Anzeigebreite setzt `className`. */
export function PdfSeite({ doc, nr, breite, className }: { doc: PDFDocumentProxy; nr: number; breite: number; className?: string }) {
  const leinwand = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let aufgabe: { cancel: () => void } | null = null;
    let vorbei = false;
    void doc.getPage(nr).then((p) => {
      const c = leinwand.current;
      if (vorbei || !c) return;
      const massstab = (breite / p.getViewport({ scale: 1 }).width) * Math.min(2, window.devicePixelRatio || 1);
      const vp = p.getViewport({ scale: massstab });
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      const task = p.render({ canvas: c, viewport: vp });
      aufgabe = task;
      task.promise.catch(() => undefined);
    });
    return () => {
      vorbei = true;
      aufgabe?.cancel();
    };
  }, [doc, nr, breite]);
  // Breite über Klassen (className) – keine Inline-Stile wegen der CSP.
  return <canvas ref={leinwand} className={`h-auto bg-white ${className ?? ""}`} />;
}
