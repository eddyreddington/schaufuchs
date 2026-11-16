import { SACH_HERKUNFT, type SachHerkunft } from "@schau/domain";
import { useState, type FormEvent } from "react";
import { fehlerText, parseEuro } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, Feld, Haken, Knopf, Segmente, Suchfeld, Textfeld, useMeldung } from "../ui";

const LEER_SPENDER = { istFirma: false, vorname: "", nachname: "", strasse: "", plz: "", ort: "", email: "", nennungName: false, nennungBetrag: false, notiz: "" };
type NeuerSpender = typeof LEER_SPENDER;

/** Spender wählen (Suche im Verzeichnis) oder neu eintragen. */
export function SpenderWahl({ gewaehlt, setGewaehlt, neu, setNeu }: { gewaehlt: { id: number; name: string } | null; setGewaehlt: (s: { id: number; name: string } | null) => void; neu: NeuerSpender | null; setNeu: (n: NeuerSpender | null) => void }) {
  const o = useOberflaeche().ehrenpreise.spenden;
  const t = o.erfassen;
  const ts = o.spender;
  const [q, setQ] = useState("");
  const treffer = trpc.spenden.spender.useQuery({ q }, { enabled: q.trim().length >= 2 && !gewaehlt && !neu });
  if (gewaehlt)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">{gewaehlt.name}</span>
        <Knopf variante="leise" onClick={() => setGewaehlt(null)}>
          {t.andererSpender}
        </Knopf>
      </div>
    );
  if (neu) {
    const setze = (teil: Partial<NeuerSpender>) => setNeu({ ...neu, ...teil });
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Segmente label={t.spenderIst} wert={neu.istFirma ? "firma" : "person"} onChange={(w) => setze({ istFirma: w === "firma" })} optionen={[{ wert: "person", label: t.person }, { wert: "firma", label: t.firmaOderVerein }]} />
        </div>
        {!neu.istFirma && <Feld label={ts.vorname}>{(id) => <Eingabe id={id} value={neu.vorname} maxLength={80} onChange={(e) => setze({ vorname: e.target.value })} />}</Feld>}
        <Feld label={neu.istFirma ? ts.nameFirma : ts.nachname} className={neu.istFirma ? "md:col-span-2" : undefined}>
          {(id) => <Eingabe id={id} value={neu.nachname} maxLength={120} required onChange={(e) => setze({ nachname: e.target.value })} />}
        </Feld>
        <Feld label={ts.strasse} className="md:col-span-2">{(id) => <Eingabe id={id} value={neu.strasse} maxLength={120} onChange={(e) => setze({ strasse: e.target.value })} />}</Feld>
        <Feld label={ts.plz}>{(id) => <Eingabe id={id} value={neu.plz} maxLength={10} onChange={(e) => setze({ plz: e.target.value })} />}</Feld>
        <Feld label={ts.ort}>{(id) => <Eingabe id={id} value={neu.ort} maxLength={80} onChange={(e) => setze({ ort: e.target.value })} />}</Feld>
        <div className="flex flex-col gap-2 md:col-span-2">
          <Haken label={ts.nennung} checked={neu.nennungName} onChange={(w) => setze({ nennungName: w, nennungBetrag: w && neu.nennungBetrag })} />
          {neu.nennungName && <Haken label={ts.mitBetrag} checked={neu.nennungBetrag} onChange={(w) => setze({ nennungBetrag: w })} />}
          <Knopf variante="leise" className="self-start" onClick={() => setNeu(null)}>
            {t.dochVerzeichnis}
          </Knopf>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Suchfeld value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.suchen} aria-label={ts.suchen} />
        <Knopf variante="leise" onClick={() => setNeu({ ...LEER_SPENDER, nachname: q.trim() })}>
          {t.neuerSpender}
        </Knopf>
      </div>
      {treffer.data && (
        <ul className="divide-y divide-linie rounded-lg border border-linie">
          {treffer.data.length === 0 && <li className="px-3 py-2 text-sm text-grau">{t.keinTreffer}</li>}
          {treffer.data.slice(0, 8).map((s) => {
            const name = s.istFirma ? s.nachname : `${s.vorname} ${s.nachname}`.trim();
            return (
              <li key={s.id}>
                <button type="button" className="w-full px-3 py-1.5 text-left hover:bg-papier" onClick={() => setGewaehlt({ id: s.id, name })}>
                  <span className="font-semibold">{name}</span> <span className="text-sm text-grau">{[s.strasse, `${s.plz} ${s.ort}`.trim()].filter(Boolean).join(", ")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Spende zu einer Schau erfassen: Geld bar (Kasse, heute) oder per Überweisung, oder eine Sache. */
export function SpendeErfassen({ schauId }: { schauId: number }) {
  const o = useOberflaeche().ehrenpreise.spenden;
  const t = o.erfassen;
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const [gewaehlt, setGewaehlt] = useState<{ id: number; name: string } | null>(null);
  const [neu, setNeu] = useState<NeuerSpender | null>(null);
  const [art, setArt] = useState<"geld" | "sache">("geld");
  const [weg, setWeg] = useState<"bar" | "bank">("bar");
  const [betrag, setBetrag] = useState("");
  const [datum, setDatum] = useState("");
  // bleibt deutsch – steht so auf der Zuwendungsbestätigung (amtliches Muster)
  const [zweck, setZweck] = useState("für die Ausstellung");
  const [sache, setSache] = useState<{ bezeichnung: string; herkunft: SachHerkunft; unterlagen: boolean }>({ bezeichnung: "", herkunft: "privat", unterlagen: false });
  const [gegenleistung, setGegenleistung] = useState(false);
  const [verzicht, setVerzicht] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  /** Zuletzt gebuchte Barspende: Link zur Quittung (ein Fenster nach dem Warten sperrt der Browser). */
  const [quittung, setQuittung] = useState<number | null>(null);
  const spenderSpeichern = trpc.spenden.spenderSpeichern.useMutation();
  const erfassen = trpc.spenden.erfassen.useMutation();
  const bar = art === "geld" && weg === "bar";

  const senden = async (e: FormEvent) => {
    e.preventDefault();
    setFehler(null);
    const cent = parseEuro(betrag);
    if (!cent || cent <= 0) return setFehler(art === "sache" ? t.wertFehlt : t.betragFehlt);
    if (!gewaehlt && !neu) return setFehler(t.spenderFehlt);
    try {
      let spenderId = gewaehlt?.id;
      if (spenderId == null) {
        spenderId = (await spenderSpeichern.mutateAsync({ daten: neu! })).id;
        // Ab jetzt gewählt: scheitert das Erfassen, legt ein neuer Versuch den Spender nicht doppelt an.
        setGewaehlt({ id: spenderId, name: neu!.istFirma ? neu!.nachname : `${neu!.vorname} ${neu!.nachname}`.trim() });
        setNeu(null);
      }
      const r = await erfassen.mutateAsync({ schauId, spenderId, art, weg: art === "sache" ? "bank" : weg, betragCent: cent, datum: bar || !datum ? undefined : datum, zweck, sache: art === "sache" ? sache : undefined, gegenleistung, verzichtAufwand: art === "geld" && verzicht });
      await Promise.all([utils.spenden.liste.invalidate({ schauId }), utils.spenden.spender.invalidate(), utils.kasse.kassenbuch.invalidate({ schauId })]);
      meldung(bar ? t.gebucht : t.erfasst);
      setQuittung(bar ? r.id : null);
      setGewaehlt(null);
      setNeu(null);
      setBetrag("");
      setDatum("");
      setSache({ bezeichnung: "", herkunft: "privat", unterlagen: false });
      setGegenleistung(false);
      setVerzicht(false);
    } catch (err) {
      setFehler(fehlerText(err));
    }
  };

  return (
    <Abschnitt id="erfassen" titel={t.titel}>
      <form onSubmit={senden} className="flex flex-col gap-4">
        <SpenderWahl gewaehlt={gewaehlt} setGewaehlt={setGewaehlt} neu={neu} setNeu={setNeu} />
        <div className="flex flex-wrap gap-3">
          <Segmente label={o.liste.art} wert={art} onChange={setArt} optionen={[{ wert: "geld", label: t.geld }, { wert: "sache", label: t.sache }]} />
          {art === "geld" && <Segmente label={t.zahlweg} wert={weg} onChange={setWeg} optionen={[{ wert: "bar", label: t.bar }, { wert: "bank", label: t.ueberweisung }]} />}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Feld label={art === "sache" ? t.wertEuro : t.betragEuro}>{(id) => <Eingabe id={id} inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} required />}</Feld>
          {!bar && <Feld label={art === "sache" ? t.erhaltenAm : t.eingangKonto} hinweis={t.leerHeute}>{(id) => <Eingabe id={id} type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />}</Feld>}
          <Feld label={t.zweck}>{(id) => <Eingabe id={id} value={zweck} maxLength={200} onChange={(e) => setZweck(e.target.value)} />}</Feld>
        </div>
        {art === "sache" && (
          <div className="grid gap-3 md:grid-cols-2">
            <Feld label={t.bezeichnung} className="md:col-span-2">
              {(id) => <Textfeld id={id} rows={2} maxLength={1000} value={sache.bezeichnung} onChange={(e) => setSache({ ...sache, bezeichnung: e.target.value })} />}
            </Feld>
            <Feld label={t.herkunft}>
              {(id) => (
                <Auswahl id={id} value={sache.herkunft} onChange={(e) => setSache({ ...sache, herkunft: e.target.value as SachHerkunft })}>
                  {SACH_HERKUNFT.map((h) => (
                    <option key={h} value={h}>
                      {t.herkunftArten[h]}
                    </option>
                  ))}
                </Auswahl>
              )}
            </Feld>
            <div className="flex items-end pb-2">
              <Haken label={t.unterlagen} checked={sache.unterlagen} onChange={(w) => setSache({ ...sache, unterlagen: w })} />
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Haken label={t.gegenleistung} checked={gegenleistung} onChange={setGegenleistung} />
          {art === "geld" && <Haken label={t.verzicht} checked={verzicht} onChange={setVerzicht} />}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {fehler && <p role="alert" className="mr-auto text-sm font-semibold text-kamm">{fehler}</p>}
          {quittung && !fehler && (
            <a href={`/datei/${schauId}/beleg/spende/${quittung}.pdf`} target="_blank" rel="noreferrer" className="mr-auto text-sm font-semibold text-band no-underline hover:underline">
              {t.quittung(quittung)}
            </a>
          )}
          <Knopf type="submit" variante="primaer" laedt={spenderSpeichern.isPending || erfassen.isPending}>
            {bar ? t.barBuchen : t.titel}
          </Knopf>
        </div>
      </form>
    </Abschnitt>
  );
}
