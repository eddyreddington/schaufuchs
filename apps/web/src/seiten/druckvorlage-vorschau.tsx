import { serverText, type BriefVorlage, type KartenVorlage } from "@schau/domain";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { pdfjs, PdfSeite } from "../pdf-anzeige";
import { useOberflaeche } from "../sprache";
import { aktuelleSprache, ot } from "../sprache-jetzt";
import { Knopf } from "../ui";

/** Wartezeit nach der letzten Änderung, bevor die Vorschau neu erzeugt wird. */
const PAUSE_MS = 600;

/** Holt ein PDF der Druckvorlagen-Adressen (/datei/druckvorlage/…) für einen noch nicht gespeicherten Stand. */
async function hole(pfad: string, koerper: unknown, signal?: AbortSignal) {
  const r = await fetch(pfad, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(koerper), signal });
  if (!r.ok) {
    const t = ot().vorlagen.vorschau;
    // Meldungen des Servers (datei-druckvorlage.ts) kommen deutsch und werden hier übersetzt.
    throw new Error(r.status === 429 ? t.zuViele : serverText(await r.text(), aktuelleSprache()) || t.fehlgeschlagen);
  }
  return new Uint8Array(await r.arrayBuffer());
}

/**
 * Öffnet ein frisch erzeugtes PDF in einem neuen Fenster (Probedruck, Serienbrief). Das Fenster geht sofort beim Klick
 * auf – nach dem Warten auf den Server würde Safari es als Werbefenster sperren. Bei einem Fehler schließt es wieder.
 */
export async function pdfOeffnen(pfad: string, koerper: unknown) {
  const fenster = window.open("", "_blank");
  try {
    const url = URL.createObjectURL(new Blob([await hole(pfad, koerper)], { type: "application/pdf" }));
    // „noopener“ würde immer null liefern; stattdessen die Verbindung zum neuen Fenster selbst trennen.
    const ziel = fenster ?? window.open(url, "_blank");
    if (!ziel) {
      URL.revokeObjectURL(url);
      throw new Error(ot().vorlagen.vorschau.gesperrt);
    }
    ziel.opener = null;
    if (fenster) fenster.location.href = url;
    // Das Fenster hat die Datei dann längst geladen (auch zum Speichern); danach den Speicher freigeben.
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  } catch (e) {
    fenster?.close();
    throw e;
  }
}

/**
 * Live-Vorschau der ersten Seite eines PDFs: wird nach jeder Änderung von `koerper` (kurz entprellt) neu geholt.
 * `extra` steht rechts in der Kopfzeile (z. B. Probedruck).
 */
export function PdfLiveVorschau({ pfad, koerper, unter, extra, seitenformat = "aspect-[210/297]" }: { pfad: string; koerper: unknown; unter: string; extra?: ReactNode; seitenformat?: string }) {
  const [pdf, setPdf] = useState<{ doc: PDFDocumentProxy; url: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const schluessel = JSON.stringify(koerper);
  const t = useOberflaeche().vorlagen.vorschau;
  // Für die Fehlermeldung im Effekt, ohne ihn bei einem Sprachwechsel neu zu starten.
  const fehlgeschlagen = useRef(t.fehlgeschlagen);
  fehlgeschlagen.current = t.fehlgeschlagen;

  useEffect(() => {
    const ab = new AbortController();
    setLaeuft(true);
    const uhr = setTimeout(async () => {
      try {
        const inhalt = await hole(pfad, JSON.parse(schluessel), ab.signal);
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
        if (!ab.signal.aborted) setFehler(e instanceof Error ? e.message : fehlgeschlagen.current);
      } finally {
        if (!ab.signal.aborted) setLaeuft(false);
      }
    }, PAUSE_MS);
    return () => {
      clearTimeout(uhr);
      ab.abort();
    };
  }, [pfad, schluessel]);

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

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-linie bg-weiss shadow-[0_1px_2px_rgb(16_20_28/0.04)]" aria-label={t.titel}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-linie px-4 py-2.5">
        <h2 className="text-[0.95rem] font-semibold">{t.titel}</h2>
        <span className="text-sm text-grau" role="status">
          {fehler ? <span className="text-kamm">{fehler}</span> : laeuft ? t.wirdErstellt : unter}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {extra}
          {pdf && (
            <a href={pdf.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-band no-underline hover:underline">
              {t.alsPdf}
            </a>
          )}
        </div>
      </div>
      <div className={`flex justify-center bg-papier px-4 py-6 transition-opacity ${laeuft ? "opacity-60" : ""}`}>
        {pdf ? (
          <PdfSeite doc={pdf.doc} nr={1} breite={520} className="w-[520px] max-w-full shadow-[0_1px_3px_rgb(16_20_28/0.12),0_12px_32px_rgb(16_20_28/0.10)]" />
        ) : (
          <div className={`flex ${seitenformat} w-[520px] max-w-full items-center justify-center bg-weiss text-sm text-grau ring-1 ring-linie`}>{fehler ? "" : t.wirdErstellt}</div>
        )}
      </div>
    </section>
  );
}

/**
 * Bewertungskarten: ein Bogen mit Beispielkarten nach dem ungespeicherten Stand. Mit schauId gelten Vereinsfarbe,
 * Logo, Name und Ort dieser Schau. Daneben: Probedruck mit Millimeterraster zum Ausmessen.
 */
export function KartenVorschau({ daten, schauId }: { daten: KartenVorlage; schauId: number | null }) {
  const [fehler, setFehler] = useState<string | null>(null);
  const t = useOberflaeche().vorlagen.vorschau;
  const probedruck = () => pdfOeffnen("/datei/druckvorlage/probedruck.pdf", { daten, schauId }).then(() => setFehler(null), (e: unknown) => setFehler(e instanceof Error ? e.message : t.probedruckFehlgeschlagen));
  return (
    <PdfLiveVorschau
      pfad="/datei/druckvorlage/vorschau.pdf"
      koerper={{ daten, schauId }}
      unter={t.bogen}
      extra={
        <>
          {fehler && <span className="text-sm text-kamm" role="alert">{fehler}</span>}
          <Knopf variante="leise" onClick={probedruck}>
            {t.probedruck}
          </Knopf>
        </>
      }
    />
  );
}

/**
 * Briefvorlage: Beispielbrief nach dem ungespeicherten Stand – im Reiter „Preisrichterverpflichtung“ dieser Brief mit
 * Abschnitt an einen Beispiel-Preisrichter, sonst der Serienbrief-Text an eine Beispielperson.
 */
export function BriefVorschau({ daten, teil = "serienbrief" }: { daten: BriefVorlage; teil?: "serienbrief" | "verpflichtung" }) {
  const t = useOberflaeche().vorlagen.vorschau;
  return <PdfLiveVorschau pfad="/datei/druckvorlage/brief.pdf" koerper={{ daten, teil }} unter={t.beispielbrief} />;
}
