import { useEffect, useRef, useState, type ReactNode } from "react";
import type { KatalogSeitenbereich } from "@schau/domain";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { pdfjs, PdfSeite as Seite } from "../pdf-anzeige";

/** Wartezeit nach der letzten Änderung, bevor die Vorschau neu erzeugt wird. */
const PAUSE_MS = 800;

export type VorschauStand = { daten: Record<string, unknown>; kurz: boolean };

/**
 * Live-Vorschau des Katalogs: schickt den Stand des Formulars (nach einer kurzen Pause) an den Server und zeigt die
 * Seiten als Miniaturen und eine Seite groß. `neuLaden` ändert sich, wenn gespeicherte Daten (Beiträge, Bilder,
 * Termine) sich geändert haben.
 */
export function KatalogVorschau({
  schauId,
  stand,
  neuLaden,
  seite,
  onSeite,
  onBereiche,
  kopf,
  unter,
}: {
  schauId: number;
  stand: VorschauStand;
  neuLaden: string;
  seite: number;
  onSeite: (nr: number) => void;
  onBereiche: (b: KatalogSeitenbereich[]) => void;
  kopf?: ReactNode;
  unter?: ReactNode;
}) {
  const [pdf, setPdf] = useState<{ doc: PDFDocumentProxy; url: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const schluessel = JSON.stringify(stand);
  const bereicheMelden = useRef(onBereiche);
  bereicheMelden.current = onBereiche;

  useEffect(() => {
    const ab = new AbortController();
    setLaeuft(true);
    const uhr = setTimeout(async () => {
      try {
        const r = await fetch(`/datei/${schauId}/katalog-vorschau.pdf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: schluessel, signal: ab.signal });
        if (r.status === 409) return; // von einer neueren Vorschau abgelöst
        if (!r.ok) throw new Error(r.status === 429 ? "Zu viele Vorschauen. Bitte kurz warten." : (await r.text()) || "Vorschau fehlgeschlagen.");
        const bereiche = JSON.parse(r.headers.get("x-katalog-gliederung") ?? "[]") as KatalogSeitenbereich[];
        const daten = new Uint8Array(await r.arrayBuffer());
        const url = URL.createObjectURL(new Blob([daten], { type: "application/pdf" }));
        const p = await pdfjs();
        const doc = await p.getDocument({ data: daten, useWasm: false }).promise;
        if (ab.signal.aborted) {
          void doc.loadingTask.destroy();
          URL.revokeObjectURL(url);
          return;
        }
        setPdf((alt) => {
          if (alt) {
            void alt.doc.loadingTask.destroy();
            URL.revokeObjectURL(alt.url);
          }
          return { doc, url };
        });
        bereicheMelden.current(bereiche);
        setFehler(null);
        setLaeuft(false);
      } catch (e) {
        if (ab.signal.aborted) return;
        setFehler(e instanceof Error ? e.message : "Vorschau fehlgeschlagen.");
        setLaeuft(false);
      }
    }, PAUSE_MS);
    return () => {
      clearTimeout(uhr);
      ab.abort();
    };
  }, [schauId, schluessel, neuLaden]);

  // Beim Verlassen der Seite Speicher freigeben.
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

  const seiten = pdf?.doc.numPages ?? 0;
  const aktuell = Math.min(Math.max(1, seite), Math.max(1, seiten));
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-linie bg-weiss shadow-[0_1px_2px_rgb(16_20_28/0.04)]" aria-label="Vorschau">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-linie px-4 py-2.5">
        <h2 className="text-[0.95rem] font-semibold">Vorschau</h2>
        <span className="text-sm text-grau tabular-nums" role="status">
          {fehler ? <span className="text-kamm">{fehler}</span> : laeuft ? "wird erstellt …" : pdf ? `${seiten} Seiten` : ""}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-4">
          {kopf}
          {pdf && (
            <a href={pdf.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-band no-underline hover:underline">
              Als PDF öffnen
            </a>
          )}
        </div>
      </div>
      <div className={`flex justify-center bg-papier px-4 py-6 transition-opacity ${laeuft ? "opacity-60" : ""}`}>
        {pdf ? (
          <Seite doc={pdf.doc} nr={aktuell} breite={440} className="w-[440px] max-w-full shadow-[0_1px_3px_rgb(16_20_28/0.12),0_12px_32px_rgb(16_20_28/0.10)]" />
        ) : (
          <div className="flex aspect-[210/297] w-[440px] max-w-full items-center justify-center bg-weiss text-sm text-grau ring-1 ring-linie">{fehler ? "" : "wird erstellt …"}</div>
        )}
      </div>
      {unter && <div className="border-t border-linie px-4 py-2.5">{unter}</div>}
      {pdf && (
        <div className="flex gap-2 overflow-x-auto border-t border-linie px-4 py-3" role="list" aria-label="Seiten">
          {Array.from({ length: seiten }, (_, i) => i + 1).map((nr) => (
            <button
              key={nr}
              type="button"
              role="listitem"
              onClick={() => onSeite(nr)}
              aria-current={nr === aktuell ? "page" : undefined}
              aria-label={`Seite ${nr}`}
              className={`shrink-0 rounded-md p-1 transition-colors ${nr === aktuell ? "bg-band-hell ring-1 ring-band" : "hover:bg-papier"}`}
            >
              <Seite doc={pdf.doc} nr={nr} breite={80} className="block w-20 ring-1 ring-linie" />
              <span className={`mt-1 block text-center text-xs tabular-nums ${nr === aktuell ? "font-semibold text-band-dunkel" : "text-grau"}`}>{nr}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
