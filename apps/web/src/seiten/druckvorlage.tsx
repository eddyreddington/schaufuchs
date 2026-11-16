import { ENDLOS_12_ZOLL, ENDLOS_6_ZOLL, KARTEN_FORMAT_LABEL, VORDRUCK_FELDER, type KartenFormat, type KartenVorlage, type VordruckFeld, oberflaeche } from "@schau/domain";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Auswahl, Eingabe, FehlerAnzeige, Feld, FormAbschnitt, Formular, Haken, Knopf, Laden, Segmente, SEITE, Seitenkopf, Speicherleiste, Textfeld, useAenderungenWarnen, useMeldung } from "../ui";
import { KartenVorschau } from "./druckvorlage-vorschau";

/**
 * Designer für die Bewertungskarte: /verein/druckvorlagen/neu bzw. /verein/druckvorlagen/:id, mit ?schau=… im
 * Zusammenhang einer Schau (Vorschau in deren Farbe, zurück zu deren Einstellungen). Links die Einstellungen, rechts
 * ein Bogen mit Beispielkarten; Probedruck zum Ausmessen am Drucker. Gespeichert wird erst mit „Speichern“.
 */
export function DruckvorlageSeite() {
  const { vorlageId = "neu" } = useParams();
  const [suche] = useSearchParams();
  const schauId = Number(suche.get("schau")) || null;
  const liste = trpc.druckvorlage.liste.useQuery();
  const vorgabe = trpc.druckvorlage.vorgabe.useQuery();
  const t = useOberflaeche().vorlagen.druckvorlage;
  if (liste.error || vorgabe.error) return <FehlerAnzeige fehler={liste.error ?? vorgabe.error} />;
  if (!liste.data || !vorgabe.data) return <Laden />;
  const id = vorlageId === "neu" ? null : Number(vorlageId);
  const vorhanden = id == null ? null : liste.data.find((v) => v.id === id);
  if (id != null && !vorhanden) return <FehlerAnzeige fehler={new Error(t.nichtGefunden)} />;
  const start = vorhanden ? { name: vorhanden.name, daten: vorhanden.daten } : { name: oberflaeche("de").vorlagen.druckvorlage.standardName, daten: vorgabe.data }; // bleibt deutsch: wird als Inhalt des Vereins gespeichert
  return <Editor key={id ?? "neu"} id={id} start={start} schauId={schauId} fuerSchau={vorhanden?.schauName ?? null} />;
}

function Editor({ id, start, schauId, fuerSchau }: { id: number | null; start: { name: string; daten: KartenVorlage }; schauId: number | null; fuerSchau: string | null }) {
  const [name, setName] = useState(start.name);
  const [v, setV] = useState<KartenVorlage>(start.daten);
  const ta = useOberflaeche();
  const t = ta.vorlagen.druckvorlage;
  const navigate = useNavigate();
  const meldung = useMeldung();
  const utils = trpc.useUtils();
  const gespeichert = useAenderungenWarnen({ name, v });
  const zurueck = schauId ? `/schau/${schauId}/einstellungen#druck` : "/verein#druckvorlagen";
  const speichern = trpc.druckvorlage.speichern.useMutation({
    onSuccess: async (r) => {
      gespeichert();
      await Promise.all([utils.druckvorlage.liste.invalidate(), utils.druckvorlage.fuerSchau.invalidate()]);
      meldung(t.gespeichert);
      if (id == null) navigate(`/verein/druckvorlagen/${r.id}${schauId ? `?schau=${schauId}` : ""}`, { replace: true });
    },
  });
  const senden = (e?: FormEvent) => {
    e?.preventDefault();
    speichern.mutate({ id: id ?? undefined, name, daten: v });
  };
  const setze = <K extends keyof KartenVorlage>(k: K, w: KartenVorlage[K]) => setV((alt) => ({ ...alt, [k]: w }));
  const geaendert = JSON.stringify({ name, v }) !== JSON.stringify(start);

  return (
    <div className={SEITE}>
      <Seitenkopf
        titel={id == null ? t.neu : name || t.titel}
        unter={fuerSchau ? t.nurFuerSchau(fuerSchau) : t.desVereins}
        hilfe="druckvorlagen"
        aktionen={
          <Link to={zurueck} className="text-sm font-semibold text-band no-underline hover:underline">
            {ta.allgemein.zurueck}
          </Link>
        }
      />
      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={senden} className="flex min-w-0 flex-col gap-4">
          <Formular>
            <FormAbschnitt titel={t.vorlage}>
              <Feld label={ta.allgemein.name} className="md:col-span-2">
                {(fid) => <Eingabe id={fid} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required />}
              </Feld>
            </FormAbschnitt>
            <Papier v={v} setze={setze} />
            <FormAbschnitt titel={t.inhalt} spalten={1}>
              <Segmente
                label={t.artDesDrucks}
                wert={v.modus}
                onChange={(w) => setze("modus", w)}
                optionen={[
                  { wert: "eigen", label: t.ganzeKarte },
                  { wert: "vordruck", label: t.vordruck },
                ]}
              />
              {v.modus === "eigen" ? <EigeneKarte v={v} setze={setze} /> : <VordruckFelder felder={v.felder} setzen={(f) => setze("felder", f)} />}
            </FormAbschnitt>
            {speichern.error && (
              <p role="alert" className="px-5 py-3 text-sm font-semibold text-kamm">
                {fehlerText(speichern.error)}
              </p>
            )}
          </Formular>
          <Speicherleiste sichtbar={geaendert} onVerwerfen={() => { setName(start.name); setV(start.daten); }} onSpeichern={() => senden()} laedt={speichern.isPending} knopf={t.speichern} />
        </form>
        <div className="2xl:sticky 2xl:top-16">
          <KartenVorschau daten={v} schauId={schauId} />
        </div>
      </div>
    </div>
  );
}

type Setze = <K extends keyof KartenVorlage>(k: K, w: KartenVorlage[K]) => void;

/** Zahlenfeld in mm, % oder pt; leere oder unsinnige Eingaben begrenzt der Server beim Speichern. */
function Zahl({ label, wert, setzen, schritt = 0.5, einheit, min, max }: { label: string; wert: number; setzen: (w: number) => void; schritt?: number; einheit: string; min?: number; max?: number }) {
  return (
    <Feld label={`${label} (${einheit})`}>
      {(fid) => <Eingabe id={fid} type="number" inputMode="decimal" step={schritt} min={min} max={max} value={Number.isFinite(wert) ? wert : ""} onChange={(e) => setzen(Number(e.target.value))} />}
    </Feld>
  );
}

function Papier({ v, setze }: { v: KartenVorlage; setze: Setze }) {
  const ta = useOberflaeche();
  const t = ta.vorlagen.druckvorlage;
  const f = v.format;
  const endlos = (teil: Partial<Extract<KartenFormat, { art: "endlos" }>>) => setze("format", { art: "endlos", bogenBreite: 240, bogenLaenge: ENDLOS_12_ZOLL, spalten: 1, zeilen: 2, ...(f.art === "endlos" ? f : {}), ...teil });
  return (
    <FormAbschnitt titel={t.papier} unter={t.papierUnter}>
      <Feld label={t.format} className="md:col-span-2">
        {(fid) => (
          <Auswahl id={fid} value={f.art} onChange={(e) => (e.target.value === "endlos" ? endlos({}) : setze("format", { art: e.target.value as "a6-auf-a4" | "a5-auf-a4" | "a4" }))}>
            {(Object.keys(KARTEN_FORMAT_LABEL) as KartenFormat["art"][]).map((a) => (
              <option key={a} value={a}>
                {ta.fach.KARTEN_FORMAT_LABEL[a]}
              </option>
            ))}
          </Auswahl>
        )}
      </Feld>
      {f.art === "endlos" && (
        <>
          <Zahl label={t.bogenbreite} einheit="mm" wert={f.bogenBreite} setzen={(w) => endlos({ bogenBreite: w })} min={50} max={500} />
          <Feld label={t.bogenlaenge} hinweis={t.zoll(ENDLOS_12_ZOLL, ENDLOS_6_ZOLL)}>
            {(fid) => <Eingabe id={fid} type="number" step={0.1} min={50} max={600} value={f.bogenLaenge} onChange={(e) => endlos({ bogenLaenge: Number(e.target.value) })} />}
          </Feld>
          <Zahl label={t.nebeneinander} einheit={t.anzahl} schritt={1} wert={f.spalten} setzen={(w) => endlos({ spalten: w })} min={1} max={4} />
          <Zahl label={t.untereinander} einheit={t.anzahl} schritt={1} wert={f.zeilen} setzen={(w) => endlos({ zeilen: w })} min={1} max={4} />
        </>
      )}
      <Zahl label={t.versatzRechts} einheit="mm" wert={v.druck.versatzX} setzen={(w) => setze("druck", { ...v.druck, versatzX: w })} min={-30} max={30} />
      <Zahl label={t.versatzUnten} einheit="mm" wert={v.druck.versatzY} setzen={(w) => setze("druck", { ...v.druck, versatzY: w })} min={-30} max={30} />
      <Zahl label={t.laengenkorrektur} einheit="%" schritt={0.1} wert={v.druck.laengenKorrektur} setzen={(w) => setze("druck", { ...v.druck, laengenKorrektur: w })} min={-5} max={5} />
    </FormAbschnitt>
  );
}

function EigeneKarte({ v, setze }: { v: KartenVorlage; setze: Setze }) {
  const ta = useOberflaeche();
  const t = ta.vorlagen.druckvorlage;
  const baustein = ta.fach.KARTEN_BAUSTEIN_LABEL;
  const schieben = (i: number, um: -1 | 1) => {
    const b = [...v.bausteine];
    const j = i + um;
    if (j < 0 || j >= b.length) return;
    [b[i], b[j]] = [b[j]!, b[i]!];
    setze("bausteine", b);
  };
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-sm font-semibold">{t.bausteine}</p>
        <ol className="divide-y divide-linie rounded-lg border border-linie">
          {v.bausteine.map((b, i) => (
            <li key={b.id} className="flex items-center gap-3 px-3 py-1.5">
              <div className="min-w-0 flex-1">
                <Haken label={baustein[b.id]} checked={b.an} onChange={(an) => setze("bausteine", v.bausteine.map((x) => (x.id === b.id ? { ...x, an } : x)))} />
              </div>
              <Knopf variante="leise" aria-label={t.nachOben(baustein[b.id])} disabled={i === 0} onClick={() => schieben(i, -1)}>
                ↑
              </Knopf>
              <Knopf variante="leise" aria-label={t.nachUnten(baustein[b.id])} disabled={i === v.bausteine.length - 1} onClick={() => schieben(i, 1)}>
                ↓
              </Knopf>
            </li>
          ))}
        </ol>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Zahl label={t.groesse} einheit="%" schritt={5} wert={v.groesse} setzen={(w) => setze("groesse", w)} min={70} max={150} />
        <div className="flex flex-col justify-end gap-2">
          <Haken label={t.farbig} checked={v.farbig} onChange={(w) => setze("farbig", w)} />
          <Haken label={t.schnittlinien} checked={v.schnittlinien} onChange={(w) => setze("schnittlinien", w)} />
        </div>
      </div>
      {v.bausteine.some((b) => b.id === "fusstext" && b.an) && (
        <Feld label={t.fusstext}>
          {(fid) => <Textfeld id={fid} rows={2} maxLength={300} value={v.fusstext} onChange={(e) => setze("fusstext", e.target.value)} />}
        </Feld>
      )}
    </div>
  );
}

/** Lage jedes Feldes auf dem Vordruck, in mm ab der oberen linken Ecke der Karte. */
function VordruckFelder({ felder, setzen }: { felder: KartenVorlage["felder"]; setzen: (f: KartenVorlage["felder"]) => void }) {
  const aendern = (id: (typeof VORDRUCK_FELDER)[number], k: keyof VordruckFeld, w: number) => setzen({ ...felder, [id]: { ...felder[id], [k]: w } });
  const ta = useOberflaeche();
  const t = ta.vorlagen.druckvorlage;
  const feldName = ta.fach.VORDRUCK_FELD_LABEL;
  const spalten: [keyof VordruckFeld, string][] = [["x", t.vonLinks], ["y", t.vonOben], ["breite", t.breite], ["hoehe", t.hoehe], ["groesse", t.schriftPt]];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-grau">
            <th className="py-1.5 pr-3 font-semibold">{t.feldMm}</th>
            {spalten.map(([, s]) => (
              <th key={s} className="px-1 py-1.5 font-semibold">{s}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-linie">
          {VORDRUCK_FELDER.map((id) => (
            <tr key={id}>
              <td className="py-1 pr-3">{feldName[id]}</td>
              {spalten.map(([k, s]) => (
                <td key={k} className="px-1 py-1">
                  <Eingabe aria-label={`${feldName[id]}: ${s}`} type="number" step={0.5} className="w-20" value={felder[id][k]} onChange={(e) => aendern(id, k, Number(e.target.value))} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
