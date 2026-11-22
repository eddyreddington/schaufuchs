import { useRef, useState, type ReactNode } from "react";
import { BILD_TYPEN } from "../ablage";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { ot } from "../sprache-jetzt";
import { trpc } from "../trpc";
import { DateiAblage, Dialog, Eingabe, Feld, Hinweis, HilfeLink, Knopf, useMeldung } from "../ui";

/* Katalog gestalten: Bilder hochladen (über „Bild wählen“ oder hineingezogen, vorher auf Druckgröße verkleinert), Vorschau und Bildnachweis. */

const MAX_BYTES = 5 * 1024 * 1024;

/** Liest eine Bilddatei als Base64 (ohne „data:“-Vorspann). */
function alsBase64(datei: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error(ot().katalog.bilder.nichtGelesen));
    r.readAsDataURL(datei);
  });
}

/**
 * Rechnet Bilder vor dem Hochladen auf Druckgröße herunter: Titelbild und Anzeigen als JPEG auf weißem Grund
 * (höchstens 2400 Pixel an der langen Seite – reicht für A4 in Druckqualität), das Logo höchstens 600 Pixel, als PNG
 * mit Transparenz, solange es klein bleibt. Das spart Speicher beim Katalogdruck und Platz in Datenbank und Sicherungen.
 * Kleine JPEG bleiben unverändert (kein Qualitätsverlust durch erneutes Komprimieren).
 */
async function vorbereiten(datei: File, rolle: "logo" | "titel" | "beitrag"): Promise<{ base64: string; name: string }> {
  const original = async () => ({ base64: await alsBase64(datei), name: datei.name });
  const bitmap = await createImageBitmap(datei).catch(() => null);
  if (!bitmap) return original();
  const max = rolle === "logo" ? 600 : 2400;
  const faktor = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  if (faktor === 1 && datei.type === "image/jpeg" && datei.size <= (rolle === "logo" ? 200 : 2048) * 1024) return original();
  const breite = Math.max(1, Math.round(bitmap.width * faktor));
  const hoehe = Math.max(1, Math.round(bitmap.height * faktor));
  const leinwand = document.createElement("canvas");
  leinwand.width = breite;
  leinwand.height = hoehe;
  const g = leinwand.getContext("2d");
  if (!g) return original();
  const blob = (typ: string) => new Promise<Blob | null>((ok) => leinwand.toBlob(ok, typ, 0.88));
  const zeichnen = (weiss: boolean) => {
    g.clearRect(0, 0, breite, hoehe);
    if (weiss) {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, breite, hoehe);
    }
    g.drawImage(bitmap, 0, 0, breite, hoehe);
  };
  let ergebnis: Blob | null = null;
  let endung = ".jpg";
  if (rolle === "logo") {
    zeichnen(false);
    ergebnis = await blob("image/png");
    endung = ".png";
  }
  // Fotos, Anzeigen – und ein Logo, das als PNG zu groß würde: JPEG auf weißem Grund.
  if (!ergebnis || ergebnis.size > 300 * 1024 || rolle !== "logo") {
    zeichnen(true);
    ergebnis = await blob("image/jpeg");
    endung = ".jpg";
  }
  bitmap.close();
  if (!ergebnis) return original();
  return { base64: await alsBase64(ergebnis), name: `${datei.name.replace(/\.[^.]+$/, "")}${endung}` };
}


/**
 * Prüft Typ und Größe einer Bilddatei, verkleinert sie und lädt sie hoch; gibt die neue Bild-ID weiter. Für den Knopf
 * (`BildHochladen`) und die Ablagefläche (`BildAblage`) desselben Felds – ein hineingezogenes Bild geht denselben Weg.
 */
export function useBildHochladen(schauId: number, rolle: "logo" | "titel" | "beitrag", fertig: (id: number) => void) {
  const tb = useOberflaeche().katalog.bilder;
  const meldung = useMeldung();
  const utils = trpc.useUtils();
  const hoch = trpc.katalogGestaltung.bildHochladen.useMutation({
    onSuccess: (r) => {
      utils.katalogGestaltung.laden.invalidate();
      fertig(r.id);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const waehlen = async (datei: File | undefined) => {
    if (!datei) return;
    if (!(BILD_TYPEN as readonly string[]).includes(datei.type)) return meldung(tb.falschesFormat, "fehler");
    // Große Handyfotos sind kein Problem: der Browser rechnet sie vorher herunter.
    if (datei.size > 40 * 1024 * 1024) return meldung(tb.ueber40, "fehler");
    const { base64, name } = await vorbereiten(datei, rolle);
    const bytes = Math.floor((base64.length * 3) / 4);
    if (bytes > MAX_BYTES) return meldung(tb.ueber5, "fehler");
    if (rolle === "logo" && bytes > 600 * 1024) return meldung(tb.logoZuGross, "fehler");
    hoch.mutate({ schauId, rolle, name, base64 });
  };
  return { waehlen, laedt: hoch.isPending };
}
type Hochladen = ReturnType<typeof useBildHochladen>;

/** Knopf zur Dateiauswahl mit dem Hinweis „oder hierher ziehen“ – das Feld dazu in `BildAblage` fassen. */
export function BildHochladen({ hochladen, beschriftung }: { hochladen: Hochladen; beschriftung: string }) {
  const tb = useOberflaeche().katalog.bilder;
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input ref={input} type="file" accept={BILD_TYPEN.join(",")} className="hidden" onChange={(e) => { void hochladen.waehlen(e.target.files?.[0]); e.target.value = ""; }} />
      <Knopf type="button" onClick={() => input.current?.click()} laedt={hochladen.laedt}>{beschriftung}</Knopf>
      <span className="text-sm text-grau">{tb.hierherZiehen}</span>
    </span>
  );
}

/** Ein Bildfeld als Ablagefläche: ein hineingezogenes Bild wird angenommen wie über „Bild wählen“. */
export function BildAblage({ hochladen, className, children }: { hochladen: Hochladen; className?: string; children: ReactNode }) {
  return (
    <DateiAblage accept={BILD_TYPEN} onDatei={(d) => void hochladen.waehlen(d)} deaktiviert={hochladen.laedt} className={className}>
      {children}
    </DateiAblage>
  );
}

export function Vorschau({ schauId, bildId, alt, klein }: { schauId: number; bildId: number; alt: string; klein?: boolean }) {
  return <img src={`/datei/${schauId}/bild/${bildId}`} alt={alt} className={`${klein ? "h-16 w-16" : "h-32 max-w-[14rem]"} rounded border border-linie bg-papier object-contain`} />;
}

/** Bildnachweis eines Vereinsbilds: Urheber, Lizenz, Quelle (leer bei eigenen Fotos) – erscheint im Katalog. */
export function BildNachweis({ schauId, bildId }: { schauId: number; bildId: number }) {
  const t = useOberflaeche();
  const tb = t.katalog.bilder;
  const daten = trpc.katalogGestaltung.laden.useQuery({ schauId });
  const b = daten.data?.bilder.find((x) => x.id === bildId);
  const [offen, setOffen] = useState(false);
  const [w, setW] = useState({ urheber: "", lizenz: "", quelle: "" });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const setzen = trpc.katalogGestaltung.bildAngabenSetzen.useMutation({
    onSuccess: () => {
      utils.katalogGestaltung.laden.invalidate();
      setOffen(false);
      meldung(tb.nachweisGespeichert);
    },
  });
  if (!b) return null;
  const text = [b.urheber && tb.foto(b.urheber), b.lizenz].filter(Boolean).join(" · ");
  return (
    <div className="text-sm">
      <span className="text-grau">{text ? tb.nachweisText(text) : tb.eigenesFoto}</span>{" "}
      <button
        type="button"
        className="text-band hover:underline"
        onClick={() => {
          setW({ urheber: b.urheber, lizenz: b.lizenz, quelle: b.quelle });
          setOffen(true);
        }}
      >
        {tb.aendern}
      </button>
      <Dialog offen={offen} onSchliessen={() => setOffen(false)} titel={tb.nachweis}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setzen.mutate({ schauId, id: bildId, ...w });
          }}
        >
          <Feld label={tb.urheber} hinweis={tb.urheberHinweis}>{(fid) => <Eingabe id={fid} data-autofocus value={w.urheber} onChange={(e) => setW({ ...w, urheber: e.target.value })} />}</Feld>
          <Feld label={tb.lizenz} hinweis={tb.lizenzHinweis}>
            {(fid) => <Eingabe id={fid} value={w.lizenz} onChange={(e) => setW({ ...w, lizenz: e.target.value })} />}
          </Feld>
          <Feld label={tb.quelle}>{(fid) => <Eingabe id={fid} value={w.quelle} onChange={(e) => setW({ ...w, quelle: e.target.value })} />}</Feld>
          {setzen.error && <Hinweis ton="fehler">{fehlerText(setzen.error)}</Hinweis>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto">
              <HilfeLink abschnitt="katalog-gestalten">{tb.hilfe}</HilfeLink>
            </span>
            <Knopf type="button" onClick={() => setOffen(false)}>{t.allgemein.abbrechen}</Knopf>
            <Knopf type="submit" variante="primaer" laedt={setzen.isPending}>{t.allgemein.speichern}</Knopf>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
