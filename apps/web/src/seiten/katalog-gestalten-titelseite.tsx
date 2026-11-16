import {
  KATALOG_PAPIERTON,
  KATALOG_TITELBILDER,
  KATALOG_TITELBILD_INFO,
  KATALOG_TITELHINTERGRUENDE,
  KATALOG_TITELHINTERGRUND_INFO,
} from "@schau/domain";
import { fehlerText } from "../lib";
import { trpc } from "../trpc";
import { Auswahl, Eingabe, Feld, Knopf, Textfeld, useFrage, useMeldung } from "../ui";
import { Gruppe, Kacheln } from "./katalog-gestalten-bausteine";
import { BildHochladen, BildNachweis, Vorschau } from "./katalog-gestalten-bilder";
import type { Daten, Form } from "./katalog-gestalten-form";

/* Katalog gestalten, Reiter „Titelseite“: Vereinslogo und Titelbild, Hintergrund, Angaben auf dem Titel, Ausstellungsleitung. */

export function Titelseite({ schauId, d, set, bilder }: { schauId: number; d: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void; bilder: Daten["bilder"] }) {
  return (
    <>
      <Gruppe titel="Bilder">
        <TitelBilder schauId={schauId} bilder={bilder} />
      </Gruppe>
      <Gruppe titel="Gestaltung der Titelseite">
        <Kacheln
          label="Hintergrund"
          werte={KATALOG_TITELHINTERGRUENDE}
          wert={d.titelHintergrund}
          name={(w) => KATALOG_TITELHINTERGRUND_INFO[w]}
          bild={(w) => (
            <svg viewBox="0 0 48 64" className="h-16 w-12 rounded-sm shadow-sm ring-1 ring-linie" aria-hidden>
              <rect x={0} y={0} width={48} height={64} fill={w === "papier" ? KATALOG_PAPIERTON : "#ffffff"} />
              {w === "getoent" && <rect x={0} y={0} width={48} height={64} fill={d.farbe} opacity={0.1} />}
              <rect x={11} y={14} width={26} height={2.2} rx={1} fill="#9aa3b0" />
              <rect x={15} y={19} width={18} height={2.2} rx={1} fill="#9aa3b0" />
            </svg>
          )}
          onWahl={(w) => set("titelHintergrund", w)}
        />
        <Feld label="Titelfoto">
          {(fid) => (
            <Auswahl id={fid} value={d.titelbild} onChange={(e) => set("titelbild", e.target.value as Form["titelbild"])}>
              {KATALOG_TITELBILDER.map((t) => (
                <option key={t} value={t}>
                  {KATALOG_TITELBILD_INFO[t]}
                </option>
              ))}
            </Auswahl>
          )}
        </Feld>
        {d.titelbild === "randlos" && !bilder.some((b) => b.rolle === "titel") && <p className="text-sm text-grau">Gilt erst mit eigenem Titelfoto.</p>}
      </Gruppe>
      <Gruppe titel="Angaben auf dem Titel">
        <div className="grid gap-4 md:grid-cols-2">
          <Feld label="Unterzeile auf dem Titel">{(fid) => <Eingabe id={fid} value={d.untertitel} placeholder="z. B. mit Jugendschau" onChange={(e) => set("untertitel", e.target.value)} />}</Feld>
          <Feld label="Schirmherr / Schirmherrin">{(fid) => <Eingabe id={fid} value={d.schirmherr} placeholder="z. B. Bürgermeisterin Anna Beispiel" onChange={(e) => set("schirmherr", e.target.value)} />}</Feld>
          <Feld label="Eintritt" className="md:col-span-2">{(fid) => <Textfeld id={fid} rows={2} value={d.eintritt} placeholder="z. B. Erwachsene 3 €, Kinder frei, Katalog 5 €" onChange={(e) => set("eintritt", e.target.value)} />}</Feld>
        </div>
      </Gruppe>
      <Gruppe titel="Ausstellungsleitung">
        <Feld label="Ausstellungsleitung und Helfer" hinweis="Je Aufgabe eine Zeile">
          {(fid) => <Textfeld id={fid} rows={6} value={d.ausstellungsleitung} placeholder="Ausstellungsleiter: Karl Muster" onChange={(e) => set("ausstellungsleitung", e.target.value)} />}
        </Feld>
      </Gruppe>
    </>
  );
}

function TitelBilder({ schauId, bilder }: { schauId: number; bilder: Daten["bilder"] }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const loeschen = trpc.katalogGestaltung.bildLoeschen.useMutation({ onSuccess: () => utils.katalogGestaltung.laden.invalidate(), onError: (e) => meldung(fehlerText(e), "fehler") });
  const { bestaetige } = useFrage();
  const feld = (rolle: "logo" | "titel", label: string, leer: string) => {
    const b = bilder.find((x) => x.rolle === rolle);
    return (
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">{label}</span>
        {b ? <Vorschau schauId={schauId} bildId={b.id} alt={label} /> : <div className="flex h-32 w-56 max-w-full items-center justify-center rounded-lg border border-dashed border-linie-stark bg-papier text-sm text-grau">{leer}</div>}
        <div className="flex flex-wrap gap-2">
          <BildHochladen schauId={schauId} rolle={rolle} beschriftung={b ? "Ersetzen" : "Bild wählen"} fertig={() => meldung(`${label} gespeichert.`)} />
          {b && <Knopf variante="leise" onClick={async () => (await bestaetige({ titel: `${label} entfernen?`, knopf: "Entfernen", gefahr: true })) && loeschen.mutate({ schauId, id: b.id })}>Entfernen</Knopf>}
        </div>
        {b && <BildNachweis schauId={schauId} bildId={b.id} />}
      </div>
    );
  };
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {feld("logo", "Vereinslogo", "kein Logo")}
      {feld("titel", "Titelbild", "kein Foto (Stich)")}
    </div>
  );
}
