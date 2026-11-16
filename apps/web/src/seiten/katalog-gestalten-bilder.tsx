import { useRef, useState } from "react";
import { fehlerText } from "../lib";
import { trpc } from "../trpc";
import { Dialog, Eingabe, Feld, Hinweis, HilfeLink, Knopf, useMeldung } from "../ui";

/* Katalog gestalten: Bilder hochladen (vorher auf Druckgröße verkleinert), Vorschau und Bildnachweis. */

const MAX_BYTES = 5 * 1024 * 1024;

/** Liest eine Bilddatei als Base64 (ohne „data:“-Vorspann). */
function alsBase64(datei: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
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


/** Wählt eine Bilddatei, prüft Typ und Größe und lädt sie hoch. Gibt die neue Bild-ID weiter. */
export function BildHochladen({ schauId, rolle, beschriftung, fertig }: { schauId: number; rolle: "logo" | "titel" | "beitrag"; beschriftung: string; fertig: (id: number) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const meldung = useMeldung();
  const utils = trpc.useUtils();
  const hoch = trpc.katalogGestaltung.bildHochladen.useMutation({
    onSuccess: (r) => {
      utils.katalogGestaltung.laden.invalidate();
      fertig(r.id);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const gewaehlt = async (datei: File | undefined) => {
    if (!datei) return;
    if (!["image/jpeg", "image/png"].includes(datei.type)) return meldung("Bitte ein Bild im Format JPEG oder PNG wählen.", "fehler");
    // Große Handyfotos sind kein Problem: der Browser rechnet sie vorher herunter.
    if (datei.size > 40 * 1024 * 1024) return meldung("Das Bild ist größer als 40 MB. Bitte verkleinern.", "fehler");
    const { base64, name } = await vorbereiten(datei, rolle);
    const bytes = Math.floor((base64.length * 3) / 4);
    if (bytes > MAX_BYTES) return meldung("Das Bild ist auch verkleinert größer als 5 MB. Bitte als JPEG speichern.", "fehler");
    if (rolle === "logo" && bytes > 600 * 1024) return meldung("Das Logo ist größer als 600 KB. Bitte verkleinern (z. B. 600 Pixel breit).", "fehler");
    hoch.mutate({ schauId, rolle, name, base64 });
  };
  return (
    <>
      <input ref={input} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => { void gewaehlt(e.target.files?.[0]); e.target.value = ""; }} />
      <Knopf type="button" onClick={() => input.current?.click()} laedt={hoch.isPending}>{beschriftung}</Knopf>
    </>
  );
}

export function Vorschau({ schauId, bildId, alt, klein }: { schauId: number; bildId: number; alt: string; klein?: boolean }) {
  return <img src={`/datei/${schauId}/bild/${bildId}`} alt={alt} className={`${klein ? "h-16 w-16" : "h-32 max-w-[14rem]"} rounded border border-linie bg-papier object-contain`} />;
}

/** Bildnachweis eines Vereinsbilds: Urheber, Lizenz, Quelle (leer bei eigenen Fotos) – erscheint im Katalog. */
export function BildNachweis({ schauId, bildId }: { schauId: number; bildId: number }) {
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
      meldung("Bildnachweis gespeichert.");
    },
  });
  if (!b) return null;
  const text = [b.urheber && `Foto: ${b.urheber}`, b.lizenz].filter(Boolean).join(" · ");
  return (
    <div className="text-sm">
      <span className="text-grau">{text ? `Bildnachweis: ${text}` : "Eigenes Foto (kein Bildnachweis)"}</span>{" "}
      <button
        type="button"
        className="text-band hover:underline"
        onClick={() => {
          setW({ urheber: b.urheber, lizenz: b.lizenz, quelle: b.quelle });
          setOffen(true);
        }}
      >
        ändern
      </button>
      <Dialog offen={offen} onSchliessen={() => setOffen(false)} titel="Bildnachweis">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setzen.mutate({ schauId, id: bildId, ...w });
          }}
        >
          <Feld label="Urheber (Fotograf)" hinweis="leer bei eigenen Fotos">{(fid) => <Eingabe id={fid} data-autofocus value={w.urheber} onChange={(e) => setW({ ...w, urheber: e.target.value })} />}</Feld>
          <Feld label="Lizenz" hinweis="z. B. „CC BY-SA 4.0“, nicht NC oder ND">
            {(fid) => <Eingabe id={fid} value={w.lizenz} onChange={(e) => setW({ ...w, lizenz: e.target.value })} />}
          </Feld>
          <Feld label="Quelle (Adresse)">{(fid) => <Eingabe id={fid} value={w.quelle} onChange={(e) => setW({ ...w, quelle: e.target.value })} />}</Feld>
          {setzen.error && <Hinweis ton="fehler">{fehlerText(setzen.error)}</Hinweis>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-auto">
              <HilfeLink abschnitt="katalog-gestalten">Hilfe zum Bildnachweis</HilfeLink>
            </span>
            <Knopf type="button" onClick={() => setOffen(false)}>Abbrechen</Knopf>
            <Knopf type="submit" variante="primaer" laedt={setzen.isPending}>Speichern</Knopf>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
