import type { KartenVorlage } from "@schau/domain";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { pdfjs, PdfSeite } from "../pdf-anzeige";
import { Knopf } from "../ui";

/** Wartezeit nach der letzten Änderung, bevor die Vorschau neu erzeugt wird. */
const PAUSE_MS = 600;

/** Holt ein PDF des Designers (Vorschau oder Probedruck) für den aktuellen Stand der Vorlage. */
async function hole(art: "vorschau" | "probedruck", daten: KartenVorlage, schauId: number | null, signal?: AbortSignal) {
  const r = await fetch(`/datei/druckvorlage/${art}.pdf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ daten, schauId }), signal });
  if (!r.ok) throw new Error(r.status === 429 ? "Zu viele Vorschauen. Bitte kurz warten." : (await r.text()) || "Vorschau fehlgeschlagen.");
  return new Uint8Array(await r.arrayBuffer());
}

/**
 * Live-Vorschau eines Bogens mit Beispielkarten nach dem ungespeicherten Stand der Vorlage. Mit schauId gelten
 * Vereinsfarbe, Logo, Name und Ort dieser Schau. Daneben: Probedruck mit Millimeterraster zum Ausmessen.
 */
export function KartenVorschau({ daten, schauId }: { daten: KartenVorlage; schauId: number | null }) {
  const [pdf, setPdf] = useState<{ doc: PDFDocumentProxy; url: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const schluessel = JSON.stringify(daten);

  useEffect(() => {
    const ab = new AbortController();
    setLaeuft(true);
    const uhr = setTimeout(async () => {
      try {
        const inhalt = await hole("vorschau", JSON.parse(schluessel) as KartenVorlage, schauId, ab.signal);
        const doc = await (await pdfjs()).getDocument({ data: inhalt.slice(), useWasm: false }).promise;
        if (ab.signal.aborted) return void doc.loadingTask.destroy();
        const url = URL.createObjectURL(new Blob([inhalt], { type: "application/pdf" }));
        setPdf((alt) => {
          if (alt) {
            void alt.doc.loadingTask.destroy();
            URL.revokeObjectURL(alt.url);
          }
          return { doc, url };
        });
        setFehler(null);
      } catch (e) {
        if (!ab.signal.aborted) setFehler(e instanceof Error ? e.message : "Vorschau fehlgeschlagen.");
      } finally {
        if (!ab.signal.aborted) setLaeuft(false);
      }
    }, PAUSE_MS);
    return () => {
      clearTimeout(uhr);
      ab.abort();
    };
  }, [schluessel, schauId]);

  // Beim Verlassen Speicher freigeben.
  const zuletzt = useRef(pdf);
  zuletzt.current = pdf;
  useEffect(
    () => () => {
      if (zuletzt.current) {
        void zuletzt.current.doc.loadingTask.destroy();
        URL.revokeObjectURL(zuletzt.current.url);
      }
    },
    [],
  );

  const probedruck = async () => {
    try {
      const inhalt = await hole("probedruck", daten, schauId);
      window.open(URL.createObjectURL(new Blob([inhalt], { type: "application/pdf" })), "_blank", "noopener");
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Probedruck fehlgeschlagen.");
    }
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-linie bg-weiss shadow-[0_1px_2px_rgb(16_20_28/0.04)]" aria-label="Vorschau">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-linie px-4 py-2.5">
        <h2 className="text-[0.95rem] font-semibold">Vorschau</h2>
        <span className="text-sm text-grau" role="status">
          {fehler ? <span className="text-kamm">{fehler}</span> : laeuft ? "wird erstellt …" : "ein Bogen mit Beispielkarten"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Knopf variante="leise" onClick={probedruck}>
            Probedruck
          </Knopf>
          {pdf && (
            <a href={pdf.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-band no-underline hover:underline">
              Als PDF öffnen
            </a>
          )}
        </div>
      </div>
      <div className={`flex justify-center bg-papier px-4 py-6 transition-opacity ${laeuft ? "opacity-60" : ""}`}>
        {pdf ? (
          <PdfSeite doc={pdf.doc} nr={1} breite={520} className="w-[520px] max-w-full shadow-[0_1px_3px_rgb(16_20_28/0.12),0_12px_32px_rgb(16_20_28/0.10)]" />
        ) : (
          <div className="flex aspect-[210/297] w-[520px] max-w-full items-center justify-center bg-weiss text-sm text-grau ring-1 ring-linie">{fehler ? "" : "wird erstellt …"}</div>
        )}
      </div>
    </section>
  );
}
