import { useState, type FormEvent } from "react";
import { fehlerText } from "../lib";
import { trpc, type Ausgabe } from "../trpc";
import { Auswahl, Dialog, Eingabe, FehlerAnzeige, Feld, Haken, HilfeLink, Hinweis, Knopf, knopfKlasse, Laden, Leer, Marke, Segmente, Suchfeld, useFrage, useMeldung } from "../ui";

type Zeile = Ausgabe["rassebild"]["liste"][number];
type Angaben = { urheber: string; lizenz: string; lizenzUrl: string; quelle: string };

function alsBase64(datei: Blob): Promise<string> {
  return new Promise((ok, fehler) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => fehler(r.error);
    r.readAsDataURL(datei);
  });
}

/**
 * Foto auf höchstens 1200 Pixel an der langen Seite, immer als JPEG auf weißem Grund – reicht für den Katalogdruck.
 * Der Server nimmt nur JPEG; aktuelle Browser richten hochkant fotografierte Bilder dabei nach der Kamera-Angabe aus.
 */
async function verkleinern(datei: File): Promise<string> {
  const bitmap = await createImageBitmap(datei).catch(() => null);
  if (!bitmap) throw new Error("Das Bild lässt sich nicht lesen. Bitte ein Foto als JPEG oder PNG wählen.");
  const faktor = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const leinwand = document.createElement("canvas");
  leinwand.width = Math.max(1, Math.round(bitmap.width * faktor));
  leinwand.height = Math.max(1, Math.round(bitmap.height * faktor));
  const g = leinwand.getContext("2d");
  if (!g) throw new Error("Das Bild lässt sich hier nicht umwandeln.");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, leinwand.width, leinwand.height);
  g.drawImage(bitmap, 0, 0, leinwand.width, leinwand.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) => leinwand.toBlob(ok, "image/jpeg", 0.88));
  if (!blob) throw new Error("Das Bild lässt sich hier nicht umwandeln.");
  return alsBase64(blob);
}

/**
 * Rassebilder ansehen und pflegen: je Rasse ein Foto für den Katalog (bei der Rassen-Überschrift). Automatisch gefundene
 * Bilder sind „ungeprüft“ und kommen erst nach „Passt“ in den Katalog.
 */
export function Rassebilder({ versionId, istAdmin }: { versionId: number; istAdmin: boolean }) {
  const liste = trpc.rassebild.liste.useQuery({ versionId });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const [sparte, setSparte] = useState("");
  const [suche, setSuche] = useState("");
  const [stand, setStand] = useState<"alle" | "mit" | "ohne" | "ungeprueft">("alle");
  const [angaben, setAngaben] = useState<Zeile | null>(null);
  /** Dialog direkt nach dem Hochladen: Haken „geprüft“ vorbelegt, Speichern bringt das Bild in den Katalog. */
  const [nachUpload, setNachUpload] = useState(false);
  const neu = () => utils.rassebild.liste.invalidate({ versionId });
  const fehler = (e: unknown) => meldung(fehlerText(e as Error), "fehler");
  const hochladen = trpc.rassebild.hochladen.useMutation({
    onSuccess: (r) => {
      neu();
      // Ohne katalogtaugliche Lizenz bleibt das Bild ungeprüft – sagen, warum.
      if (r.hinweis) meldung(`Bild gespeichert, aber noch nicht im Katalog: ${r.hinweis}`, "fehler");
    },
    onError: fehler,
  });
  const setzen = trpc.rassebild.angabenSetzen.useMutation({ onSuccess: neu, onError: fehler });
  // Sammelaktion: Fehler je Bild sammeln statt einzeln melden.
  const sammel = trpc.rassebild.angabenSetzen.useMutation({ onSuccess: neu });
  const { bestaetige } = useFrage();
  const loeschen = trpc.rassebild.loeschen.useMutation({ onSuccess: neu, onError: fehler });

  if (liste.error) return <FehlerAnzeige fehler={liste.error} nochmal={() => liste.refetch()} />;
  if (!liste.data) return <Laden />;
  const sparten = [...new Set(liste.data.map((z) => z.sparte))];
  const q = suche.trim().toLocaleLowerCase("de");
  const sichtbar = liste.data.filter(
    (z) =>
      (!sparte || z.sparte === sparte) &&
      (!q || z.rasse.toLocaleLowerCase("de").includes(q)) &&
      (stand === "alle" || (stand === "mit" && z.bild) || (stand === "ohne" && !z.bild) || (stand === "ungeprueft" && z.bild && !z.bild.geprueft)),
  );
  const mitBild = liste.data.filter((z) => z.bild).length;
  const ungeprueft = liste.data.filter((z) => z.bild && !z.bild.geprueft).length;
  const angezeigt = sichtbar.slice(0, 200);
  const ungeprueftSichtbar = angezeigt.filter((z) => z.bild && !z.bild.geprueft);

  /** Neues Foto: die Angaben des alten Bilds (z. B. ein Commons-Fotograf) gelten nicht mehr – danach gleich nachfragen. */
  const datei = async (z: Zeile, f: File | undefined) => {
    if (!f) return;
    let base64: string;
    try {
      base64 = await verkleinern(f);
    } catch (e) {
      return fehler(e);
    }
    hochladen.mutate(
      // Ungeprüft, bis die Angaben gespeichert sind – sonst stünde ein fremdes Foto als „eigenes Bild“ im Katalog.
      { rasse: z.rasse, base64, urheber: "", lizenz: "", lizenzUrl: "", quelle: "", geprueft: false },
      {
        onSuccess: async () => {
          const neueListe = await utils.rassebild.liste.fetch({ versionId });
          const neuZ = neueListe.find((x) => x.rasse === z.rasse);
          if (neuZ?.bild) {
            setNachUpload(true);
            setAngaben(neuZ);
          }
        },
      },
    );
  };
  const angabenVon = (b: NonNullable<Zeile["bild"]>): Angaben => ({ urheber: b.urheber, lizenz: b.lizenz, lizenzUrl: b.lizenzUrl, quelle: b.quelle });

  const ohneBild = liste.data.length - mitBild;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Suchfeld aria-label="Rasse suchen" placeholder="Rasse suchen" value={suche} onChange={(e) => setSuche(e.target.value)} className="sm:max-w-56" />
        {/* Die Felder sind von Haus aus w-full – die Breite kommt vom umgebenden div. */}
        <div className="w-full sm:w-48">
          <Auswahl aria-label="Sparte" kompakt value={sparte} onChange={(e) => setSparte(e.target.value)}>
            <option value="">alle Sparten</option>
            {sparten.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Auswahl>
        </div>
        <Segmente
          label="Stand"
          wert={stand}
          onChange={setStand}
          optionen={[
            { wert: "alle" as const, label: "Alle", anzahl: liste.data.length },
            { wert: "mit" as const, label: "mit Bild", anzahl: mitBild },
            { wert: "ohne" as const, label: "ohne Bild", anzahl: ohneBild },
            { wert: "ungeprueft" as const, label: "ungeprüft", anzahl: ungeprueft },
          ]}
        />
        <span className="ml-auto flex flex-wrap items-center gap-3">
          {istAdmin && ungeprueftSichtbar.length > 0 && (
            <Knopf
              variante="leise"
              onClick={async () => {
                if (!(await bestaetige({ titel: `${ungeprueftSichtbar.length} Bilder als geprüft markieren?`, text: "Sie kommen damit in den Katalog, Bilder ohne passende Lizenz bleiben ungeprüft.", knopf: "Markieren" }))) return;
                let ok = 0;
                const ohne: string[] = [];
                // Einzeln: ein Bild ohne passende Lizenz (fehlt, NC/ND, CC BY ohne Urheber) hält die übrigen nicht auf.
                for (const z of ungeprueftSichtbar) {
                  try {
                    await sammel.mutateAsync({ id: z.bild!.id, ...angabenVon(z.bild!), geprueft: true });
                    ok++;
                  } catch {
                    ohne.push(z.rasse);
                  }
                }
                meldung(`${ok} Bilder als geprüft markiert.${ohne.length ? ` Ohne passende Lizenzangabe ungeprüft geblieben: ${ohne.join(", ")}.` : ""}`, ohne.length ? "fehler" : "ok");
              }}
            >
              Angezeigte als geprüft markieren
            </Knopf>
          )}
          <HilfeLink abschnitt="rassebilder">Hilfe zu Rassebildern</HilfeLink>
        </span>
      </div>
      {angezeigt.length === 0 && <Leer titel="Keine Treffer" />}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {angezeigt.map((z) => (
          <li key={z.rasse} className="flex flex-col overflow-hidden rounded-xl border border-linie bg-weiss shadow-[0_1px_2px_rgb(16_20_28/0.04)]">
            <div className="flex h-40 items-center justify-center border-b border-linie bg-papier">
              {z.bild ? (
                <img src={`/datei/rassebild/${z.bild.id}?v=${encodeURIComponent(String(z.bild.stand))}`} alt={`Rassebild ${z.rasse}`} loading="lazy" className="max-h-40 w-full object-contain" />
              ) : (
                <span className="text-sm text-grau">kein Bild</span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3 text-sm">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-tinte">{z.rasse}</span>
                {z.bild && !z.bild.geprueft && <Marke ton="warnung">ungeprüft</Marke>}
              </span>
              <span className="text-grau">{z.sparte}</span>
              {z.bild && (
                <span className="text-xs text-grau">
                  {[z.bild.urheber, z.bild.lizenz].filter(Boolean).join(" · ") || "ohne Angaben"}
                  {/^https?:\/\//i.test(z.bild.quelle) && (
                    <>
                      {" · "}
                      <a href={z.bild.quelle} target="_blank" rel="noreferrer">
                        Quelle
                      </a>
                    </>
                  )}
                </span>
              )}
              {istAdmin && (
                <div className="mt-auto flex flex-wrap gap-1 pt-2">
                  {z.bild && !z.bild.geprueft && (
                    <Knopf variante="primaer" className="min-h-8 px-2" onClick={() => setzen.mutate({ id: z.bild!.id, ...angabenVon(z.bild!), geprueft: true })}>
                      Passt
                    </Knopf>
                  )}
                  <label className={knopfKlasse("zweit", false, "min-h-8 cursor-pointer px-2 focus-within:ring-2 focus-within:ring-band/25")}>
                    {z.bild ? "Ersetzen" : "Bild hochladen"}
                    <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => { void datei(z, e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                  {z.bild && (
                    <>
                      <Knopf variante="leise" className="min-h-8 px-2" onClick={() => setAngaben(z)}>
                        Angaben
                      </Knopf>
                      <Knopf variante="leise" className="min-h-8 px-2 text-kamm hover:bg-kamm-hell" onClick={async () => (await bestaetige({ titel: `Bild von „${z.rasse}“ löschen?`, knopf: "Löschen", gefahr: true })) && loeschen.mutate({ id: z.bild!.id })}>
                        Löschen
                      </Knopf>
                    </>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {sichtbar.length > 200 && <p className="text-center text-sm text-grau">Erste 200 von {sichtbar.length} angezeigt – bitte eingrenzen.</p>}
      <Dialog
        offen={angaben != null}
        onSchliessen={() => {
          setAngaben(null);
          setNachUpload(false);
        }} titel={`Bildangaben: ${angaben?.rasse ?? ""}`}>
        {angaben?.bild && (
          <AngabenForm
            key={`${angaben.bild.id}-${String(angaben.bild.stand)}`}
            start={angabenVon(angaben.bild)}
            geprueft={nachUpload || angaben.bild.geprueft}
            hinweis={nachUpload ? "Neues Foto: erst nach dem Speichern im Katalog." : undefined}
            speichern={(a, g) => setzen.mutate({ id: angaben.bild!.id, ...a, geprueft: g }, { onSuccess: () => { setAngaben(null); setNachUpload(false); } })}
          />
        )}
      </Dialog>
    </div>
  );
}

function AngabenForm({ start, geprueft, hinweis, speichern }: { start: Angaben; geprueft: boolean; hinweis?: string; speichern: (a: Angaben, geprueft: boolean) => void }) {
  const [a, setA] = useState(start);
  const [g, setG] = useState(geprueft);
  const senden = (e: FormEvent) => {
    e.preventDefault();
    speichern(a, g);
  };
  return (
    <form onSubmit={senden} className="flex flex-col gap-4">
      {hinweis && <Hinweis ton="warnung">{hinweis}</Hinweis>}
      <Feld label="Urheber (Fotograf)">{(id) => <Eingabe id={id} value={a.urheber} onChange={(e) => setA({ ...a, urheber: e.target.value })} />}</Feld>
      <Feld label="Lizenz" hinweis="z. B. CC BY-SA 4.0; eigenes Foto: leer">
        {(id) => <Eingabe id={id} value={a.lizenz} onChange={(e) => setA({ ...a, lizenz: e.target.value })} />}
      </Feld>
      <Feld label="Lizenz-Adresse">
        {(id) => <Eingabe id={id} value={a.lizenzUrl} onChange={(e) => setA({ ...a, lizenzUrl: e.target.value })} placeholder="https://creativecommons.org/licenses/…" />}
      </Feld>
      <Feld label="Quelle (Adresse)">{(id) => <Eingabe id={id} value={a.quelle} onChange={(e) => setA({ ...a, quelle: e.target.value })} />}</Feld>
      <Haken label="geprüft – kommt in den Katalog" checked={g} onChange={setG} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linie pt-4">
        <HilfeLink abschnitt="rassebilder">Hilfe zu Bildangaben</HilfeLink>
        <Knopf type="submit" variante="primaer">
          Speichern
        </Knopf>
      </div>
    </form>
  );
}
