import {
  KATALOG_PAPIERTON,
  KATALOG_TITELBILDER,
  KATALOG_TITELHINTERGRUENDE,
} from "@schau/domain";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Auswahl, Eingabe, Feld, Knopf, Textfeld, useFrage, useMeldung } from "../ui";
import { Gruppe, Kacheln } from "./katalog-gestalten-bausteine";
import { BildAblage, BildHochladen, BildNachweis, useBildHochladen, Vorschau } from "./katalog-gestalten-bilder";
import type { Daten, Form } from "./katalog-gestalten-form";

/* Katalog gestalten, Reiter „Titelseite“: Vereinslogo und Titelbild, Hintergrund, Angaben auf dem Titel, Ausstellungsleitung. */

export function Titelseite({ schauId, d, set, bilder }: { schauId: number; d: Form; set: <K extends keyof Form>(k: K, v: Form[K]) => void; bilder: Daten["bilder"] }) {
  const t = useOberflaeche();
  const tt = t.katalog.titelseite;
  return (
    <>
      <Gruppe titel={tt.bilder}>
        <TitelBilder schauId={schauId} bilder={bilder} />
      </Gruppe>
      <Gruppe titel={tt.gestaltung}>
        <Kacheln
          label={tt.hintergrund}
          werte={KATALOG_TITELHINTERGRUENDE}
          wert={d.titelHintergrund}
          name={(w) => t.fach.KATALOG_TITELHINTERGRUND_INFO[w]}
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
        <Feld label={tt.titelfoto}>
          {(fid) => (
            <Auswahl id={fid} value={d.titelbild} onChange={(e) => set("titelbild", e.target.value as Form["titelbild"])}>
              {KATALOG_TITELBILDER.map((x) => (
                <option key={x} value={x}>
                  {t.fach.KATALOG_TITELBILD_INFO[x]}
                </option>
              ))}
            </Auswahl>
          )}
        </Feld>
        {d.titelbild === "randlos" && !bilder.some((b) => b.rolle === "titel") && <p className="text-sm text-grau">{tt.giltErstMitFoto}</p>}
      </Gruppe>
      <Gruppe titel={tt.angaben}>
        <div className="grid gap-4 md:grid-cols-2">
          <Feld label={tt.unterzeile}>{(fid) => <Eingabe id={fid} value={d.untertitel} placeholder={tt.unterzeileBeispiel} onChange={(e) => set("untertitel", e.target.value)} />}</Feld>
          <Feld label={tt.schirmherr}>{(fid) => <Eingabe id={fid} value={d.schirmherr} placeholder={tt.schirmherrBeispiel} onChange={(e) => set("schirmherr", e.target.value)} />}</Feld>
          <Feld label={tt.eintritt} className="md:col-span-2">{(fid) => <Textfeld id={fid} rows={2} value={d.eintritt} placeholder={tt.eintrittBeispiel} onChange={(e) => set("eintritt", e.target.value)} />}</Feld>
        </div>
      </Gruppe>
      <Gruppe titel={tt.leitung}>
        <Feld label={tt.leitungFeld} hinweis={tt.leitungHinweis}>
          {(fid) => <Textfeld id={fid} rows={6} value={d.ausstellungsleitung} placeholder={tt.leitungBeispiel} onChange={(e) => set("ausstellungsleitung", e.target.value)} />}
        </Feld>
      </Gruppe>
    </>
  );
}

function TitelBilder({ schauId, bilder }: { schauId: number; bilder: Daten["bilder"] }) {
  const tt = useOberflaeche().katalog.titelseite;
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <TitelBild schauId={schauId} bilder={bilder} rolle="logo" label={tt.vereinslogo} leer={tt.keinLogo} />
      <TitelBild schauId={schauId} bilder={bilder} rolle="titel" label={tt.titelbild} leer={tt.keinFoto} />
    </div>
  );
}

/** Logo bzw. Titelbild: Vorschau, „Bild wählen“ oder hineinziehen, Entfernen, Bildnachweis. */
function TitelBild({ schauId, bilder, rolle, label, leer }: { schauId: number; bilder: Daten["bilder"]; rolle: "logo" | "titel"; label: string; leer: string }) {
  const t = useOberflaeche();
  const tt = t.katalog.titelseite;
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const loeschen = trpc.katalogGestaltung.bildLoeschen.useMutation({ onSuccess: () => utils.katalogGestaltung.laden.invalidate(), onError: (e) => meldung(fehlerText(e), "fehler") });
  const { bestaetige } = useFrage();
  const hochladen = useBildHochladen(schauId, rolle, () => meldung(tt.gespeichert(label)));
  const b = bilder.find((x) => x.rolle === rolle);
  return (
    <BildAblage hochladen={hochladen} className="flex flex-col gap-2">
      <span className="text-sm font-semibold">{label}</span>
      {b ? <Vorschau schauId={schauId} bildId={b.id} alt={label} /> : <div className="flex h-32 w-56 max-w-full items-center justify-center rounded-lg border border-dashed border-linie-stark bg-papier text-sm text-grau">{leer}</div>}
      <div className="flex flex-wrap gap-2">
        <BildHochladen hochladen={hochladen} beschriftung={b ? tt.ersetzen : tt.bildWaehlen} />
        {b && <Knopf variante="leise" onClick={async () => (await bestaetige({ titel: tt.entfernenFrage(label), knopf: t.allgemein.entfernen, gefahr: true })) && loeschen.mutate({ schauId, id: b.id })}>{t.allgemein.entfernen}</Knopf>}
      </div>
      {b && <BildNachweis schauId={schauId} bildId={b.id} />}
    </BildAblage>
  );
}
