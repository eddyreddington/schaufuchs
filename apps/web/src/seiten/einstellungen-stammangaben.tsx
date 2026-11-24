import { kaefigNameLang, sortierungText, UNTERSUCHUNG_ARTEN, type KaefigMasse, type KaefigTyp, type Untersuchung } from "@schau/domain";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { VetAmtFeld } from "./einstellungen-vetamt";
import { trpc, type Ausgabe } from "../trpc";
import { Auswahl, Eingabe, Feld, FormAbschnitt, Formular, Haken, HilfeLink, Hinweis, Knopf, Speicherleiste, Textfeld, useAenderungenWarnen, useMeldung } from "../ui";

/*
 * Einstellungen der Schau, großes Formular „Stammangaben“: Schau, Termine, Meldegeld und Konto, Katalog und Preise,
 * Bestimmungen, Veterinäramt; dazu die Katalognummern nach Käfigblöcken.
 */

type Schau = Ausgabe["schau"]["get"];

/** Die Stammangaben bilden ein Formular, erscheinen aber als eigene Reiter der Einstellungen. */
export const STAMM_ABSCHNITTE = ["schau", "termine", "zahlung", "katalog", "bestimmungen", "veterinaeramt"] as const;
export type StammAbschnitt = (typeof STAMM_ABSCHNITTE)[number];

/**
 * Stammangaben der Schau. Gezeigt wird nur `abschnitt` (null: keiner, nur die Speicherleiste bei Ungespeichertem) –
 * der Stand des ganzen Formulars bleibt beim Wechsel der Reiter erhalten und wird zusammen gespeichert.
 */
export function Stammangaben({ schau: s, abschnitt }: { schau: Schau; abschnitt: StammAbschnitt | null }) {
  const t = useOberflaeche();
  const ts = t.schau.einstellungen.stammangaben;
  const ta = t.schau.einstellungen.seite.abschnitte;
  const versionen = trpc.stammdaten.versionen.useQuery();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const startwerte = () => ({
    name: s.name,
    slug: s.slug,
    veranstalter: s.veranstalter,
    ort: s.ort,
    meldeschluss: s.meldeschluss,
    einlieferung: s.einlieferung,
    bewertungAm: s.bewertungAm,
    preisrichterRueckmeldungBis: s.preisrichterRueckmeldungBis,
    oeffnungszeiten: s.oeffnungszeiten,
    aussetzen: s.aussetzen,
    reklamationsfrist: s.reklamationsfrist,
    kapazitaet: s.kapazitaet,
    stammdatenVersionId: s.stammdatenVersionId,
    provisionBp: s.provisionBp,
    katalogStart: s.katalogStart,
    jugendSeparat: s.jugendSeparat,
    staemmeVorn: s.staemmeVorn,
    kaefigFolge: s.kaefigFolge ?? null,
    kontingentJe: s.kontingentJe,
    bestimmungen: s.bestimmungen,
    bankverbindung: s.bankverbindung,
    zahlungBeiEinlieferung: s.zahlungBeiEinlieferung,
    girocode: s.girocode,
    kontaktEmail: s.kontaktEmail,
    vereinKontoinhaber: s.vereinKontoinhaber,
    vereinIban: s.vereinIban,
    vereinBic: s.vereinBic,
    vetRegistriernummer: s.vetRegistriernummer,
    vetAmt: s.vetAmt,
    vetAnzeigeAm: s.vetAnzeigeAm,
    vetAktenzeichen: s.vetAktenzeichen,
    wassergefluegelUntersuchung: s.wassergefluegelUntersuchung,
    untersuchung: s.untersuchung,
    untersuchungTage: s.untersuchungTage,
    einlassUntersuchungAm: s.einlassUntersuchungAm,
    einlassTierarzt: s.einlassTierarzt,
    ndTageMin: s.ndTageMin,
    ndTageMax: s.ndTageMax,
    pmvTageMin: s.pmvTageMin,
    pmvTageMax: s.pmvTageMax,
    auslandZugelassen: s.auslandZugelassen,
    prHoechstzahl: s.prHoechstzahl,
    obmannHoechstzahl: s.obmannHoechstzahl,
    erklaerungen: s.erklaerungen,
  });
  const [d, setD] = useState(startwerte);
  // Stand beim letzten Speichern (für die Speicherleiste).
  const [stand, setStand] = useState(() => JSON.stringify(startwerte()));
  // Stand der Schau beim Laden: hat inzwischen jemand anders gespeichert, lehnt der Server ab, statt still zu überschreiben.
  const [serverStand, setServerStand] = useState(s.stand);
  /** Zahlenfeld für Tage; leer = keine Frist. */
  const tageFeld = (k: "ndTageMin" | "ndTageMax" | "pmvTageMin" | "pmvTageMax", label: string) => (
    <Feld label={label}>
      {(fid) => (
        <Eingabe id={fid} inputMode="numeric" value={d[k] ?? ""} placeholder={ts.keineFrist} onChange={(e) => set(k, e.target.value.trim() === "" ? null : Math.max(0, Math.min(730, Number(e.target.value.replace(/\D/g, "")) || 0)))} />
      )}
    </Feld>
  );
  const gespeichert = useAenderungenWarnen(d);
  const speichern = trpc.schau.aktualisieren.useMutation({
    onSuccess: (r, v) => {
      gespeichert();
      setStand(JSON.stringify(v.daten));
      setServerStand(r.stand);
      utils.schau.invalidate();
      meldung(ts.gespeichert);
    },
  });
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const text = (k: keyof typeof d, label: string, hinweis?: string, typ = "text") => (
    <Feld label={label} hinweis={hinweis}>
      {(fid) => <Eingabe id={fid} type={typ} value={(d[k] as string | null) ?? ""} onChange={(e) => set(k, (typ === "date" && !e.target.value ? null : e.target.value) as never)} />}
    </Feld>
  );
  const senden = (e: FormEvent) => {
    e.preventDefault();
    speichern.mutate({ id: s.id, daten: d, stand: serverStand });
  };
  const geaendert = JSON.stringify(d) !== stand;
  return (
    <form onSubmit={senden} className="flex flex-col gap-4">
      {abschnitt && (
        <Formular>
          {abschnitt === "schau" && (
            <FormAbschnitt id="schau" titel={ta.schau}>
              {text("name", ts.name)}
              {text("veranstalter", ts.veranstalter)}
              {text("ort", ts.ort)}
              {s.phase === "vorbereitung" ? (
                text("slug", ts.kurzadresse, `…/s/${d.slug}`)
              ) : (
                <Feld label={ts.kurzadresse} hinweis={ts.kurzadresseFest}>
                  {(fid) => <Eingabe id={fid} value={d.slug} disabled readOnly />}
                </Feld>
              )}
              {text("kontaktEmail", ts.kontakt)}
              <Feld label={ts.kapazitaet}>
                {(fid) => <Eingabe id={fid} type="number" min={1} placeholder={ts.keineGrenze} value={d.kapazitaet ?? ""} onChange={(e) => set("kapazitaet", e.target.value ? Number(e.target.value) : null)} />}
              </Feld>
            </FormAbschnitt>
          )}
          {abschnitt === "termine" && (
            <FormAbschnitt id="termine" titel={ta.termine}>
              {text("meldeschluss", ts.meldeschluss, undefined, "date")}
              {text("bewertungAm", ts.bewertungAm, undefined, "date")}
              {text("preisrichterRueckmeldungBis", ts.rueckmeldungPreisrichter, undefined, "date")}
              <Feld label={ts.einlieferung}>{(fid) => <Eingabe id={fid} placeholder={ts.einlieferungBeispiel} value={d.einlieferung} onChange={(e) => set("einlieferung", e.target.value)} />}</Feld>
              {text("aussetzen", ts.tierausgabe)}
              <Feld label={ts.oeffnungszeiten} hinweis={ts.jeTagZeile}>
                {(fid) => <Textfeld id={fid} rows={3} placeholder={ts.oeffnungszeitenBeispiel} value={d.oeffnungszeiten} onChange={(e) => set("oeffnungszeiten", e.target.value)} />}
              </Feld>
              {text("reklamationsfrist", ts.reklamationsfrist, undefined, "date")}
            </FormAbschnitt>
          )}
          {abschnitt === "zahlung" && (
            <FormAbschnitt id="zahlung" titel={ta.zahlung} aktionen={<HilfeLink abschnitt="girocode">{ts.hilfeGirocode}</HilfeLink>}>
              <Feld label={ts.meldegeldZahlen}>
                {(fid) => (
                  <Auswahl
                    id={fid}
                    value={d.zahlungBeiEinlieferung ? "einlieferung" : d.girocode ? "girocode" : "vorab"}
                    onChange={(e) => {
                      set("zahlungBeiEinlieferung", e.target.value === "einlieferung");
                      set("girocode", e.target.value === "girocode");
                    }}
                  >
                    <option value="vorab">{ts.vorab}</option>
                    <option value="girocode">{ts.vorabGirocode}</option>
                    <option value="einlieferung">{ts.beiEinlieferung}</option>
                  </Auswahl>
                )}
              </Feld>
              {d.girocode && !d.zahlungBeiEinlieferung ? (
                <Feld label={ts.bankverbindung} hinweis={ts.mitGirocode}>
                  {(fid) => <Eingabe id={fid} disabled value={[d.vereinKontoinhaber, d.vereinIban].filter(Boolean).join(", ")} />}
                </Feld>
              ) : (
                text("bankverbindung", ts.bankverbindung, d.zahlungBeiEinlieferung ? ts.nichtAngezeigt : undefined)
              )}
              <Feld label={ts.provision}>
                {(fid) => <Eingabe id={fid} type="number" min={0} max={50} step={0.5} value={d.provisionBp / 100} onChange={(e) => set("provisionBp", Math.round(Number(e.target.value) * 100))} />}
              </Feld>
              <div className="grid gap-4 rounded-lg border border-linie bg-papier p-4 md:col-span-2 md:grid-cols-3">
                <p className="text-sm font-semibold md:col-span-3">{ts.vereinskonto}{d.girocode && !d.zahlungBeiEinlieferung ? ts.undGirocode : ""}</p>
                {text("vereinKontoinhaber", ts.kontoinhaber, d.girocode && !d.zahlungBeiEinlieferung ? ts.wieBank : undefined)}
                {text("vereinIban", "IBAN")}
                {text("vereinBic", "BIC", ts.freiwillig)}
              </div>
            </FormAbschnitt>
          )}
          {abschnitt === "katalog" && (
            <FormAbschnitt id="katalog" titel={ta.katalog}>
              <Feld label={ts.rassen} hinweis={s.katalogGedruckt ? ts.festgeschrieben : undefined}>
                {(fid) => (
                  <Auswahl id={fid} value={d.stammdatenVersionId ?? ""} disabled={s.katalogGedruckt} onChange={(e) => set("stammdatenVersionId", e.target.value ? Number(e.target.value) : null)}>
                    <option value="">{ts.bitteWaehlen}</option>
                    {versionen.data?.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.jahr})
                      </option>
                    ))}
                  </Auswahl>
                )}
              </Feld>
              <Feld label={ts.ersteNummer}>{(fid) => <Eingabe id={fid} type="number" min={1} value={d.katalogStart} onChange={(e) => set("katalogStart", Number(e.target.value))} />}</Feld>
              <Feld label={ts.jugendImKatalog} hinweis={s.katalogGedruckt ? ts.festgeschrieben : <HilfeLink abschnitt="jugend-im-katalog">{ts.hilfeJugend}</HilfeLink>}>
                {(fid) => (
                  <Auswahl id={fid} value={d.jugendSeparat ? "block" : "eingereiht"} disabled={s.katalogGedruckt} onChange={(e) => set("jugendSeparat", e.target.value === "block")}>
                    <option value="block">{ts.jugendAmEnde}</option>
                    <option value="eingereiht">{ts.jugendEingereiht}</option>
                  </Auswahl>
                )}
              </Feld>
              <div className="flex flex-col gap-2 md:col-span-2">
                <Haken label={ts.staemmeVorn} checked={d.staemmeVorn} onChange={(v) => set("staemmeVorn", v)} disabled={s.katalogGedruckt} hinweis={s.katalogGedruckt ? ts.festgeschrieben : undefined} />
              </div>
              <KaefigFolge wert={d.kaefigFolge} setzen={(f) => set("kaefigFolge", f)} gesperrt={s.katalogGedruckt} masse={s.kaefigMasse} />
              <p className="text-sm md:col-span-2">
                <span className="text-grau">{ts.reihenfolge}</span>
                <Link to={`/schau/${s.id}/katalog#reihenfolge`}>{sortierungText(s.katalogSortierung)}</Link>
              </p>
              <Feld label={ts.preiseVerteilen}>
                {(fid) => (
                  <Auswahl id={fid} value={d.kontingentJe} onChange={(e) => set("kontingentJe", e.target.value as typeof d.kontingentJe)}>
                    <option value="preisrichter">{ts.jePreisrichter}</option>
                    <option value="schau">{ts.gemeinsam}</option>
                  </Auswahl>
                )}
              </Feld>
              <Feld label={ts.hoechstPreisrichter} hinweis={ts.pvHinweisPreisrichter}>
                {(fid) => <Eingabe id={fid} type="number" min={1} max={1000} value={d.prHoechstzahl} onChange={(e) => set("prHoechstzahl", Math.max(1, Number(e.target.value) || 1))} />}
              </Feld>
              <Feld label={ts.hoechstObmann} hinweis={ts.pvHinweisObmann}>
                {(fid) => <Eingabe id={fid} type="number" min={1} max={1000} value={d.obmannHoechstzahl} onChange={(e) => set("obmannHoechstzahl", Math.max(1, Number(e.target.value) || 1))} />}
              </Feld>
            </FormAbschnitt>
          )}
          {abschnitt === "bestimmungen" && (
            <FormAbschnitt id="bestimmungen" titel={ta.bestimmungen} spalten={1}>
              <Feld label={ts.sonderbestimmungen} hinweis={ts.imMeldeformular}>
                {(fid) => <Textfeld id={fid} rows={6} value={d.bestimmungen} onChange={(e) => set("bestimmungen", e.target.value)} />}
              </Feld>
              <Feld label={ts.pflichterklaerungen} hinweis={ts.jeZeileErklaerung}>
                {(fid) => <Textfeld id={fid} rows={3} value={d.erklaerungen} onChange={(e) => set("erklaerungen", e.target.value)} />}
              </Feld>
            </FormAbschnitt>
          )}
          {abschnitt === "veterinaeramt" && (
            <FormAbschnitt id="veterinaeramt" titel={ta.veterinaeramt}>
              <VetAmtFeld wert={d.vetAmt} setzen={(v) => set("vetAmt", v)} schauOrt={d.ort} />
              {text("vetAktenzeichen", ts.aktenzeichen)}
              {text("vetRegistriernummer", ts.registriernummer)}
              {text("vetAnzeigeAm", ts.angezeigtAm, ts.spaetestens, "date")}
              <Feld label={ts.untersuchung} className="md:col-span-2">
                {(fid) => (
                  <Auswahl id={fid} value={d.untersuchung ?? ""} onChange={(e) => set("untersuchung", (e.target.value || null) as Untersuchung | null)}>
                    <option value="">{ts.nichtFestgelegt}</option>
                    {UNTERSUCHUNG_ARTEN.map((u) => (
                      <option key={u} value={u}>
                        {t.fach.UNTERSUCHUNG_LABEL[u]}
                      </option>
                    ))}
                  </Auswahl>
                )}
              </Feld>
              {d.untersuchung === "bescheinigung" && (
                <Feld label={ts.bescheinigungTage} hinweis={ts.meist}>
                  {(fid) => <Eingabe id={fid} inputMode="numeric" value={d.untersuchungTage} onChange={(e) => set("untersuchungTage", Math.max(1, Math.min(30, Number(e.target.value.replace(/\D/g, "")) || 1)))} />}
                </Feld>
              )}
              {d.untersuchung === "einlass" && (
                <>
                  {text("einlassUntersuchungAm", ts.einlassAm, undefined, "date")}
                  {text("einlassTierarzt", ts.einlassTierarzt)}
                </>
              )}
              <p className="text-sm font-semibold md:col-span-2">{ts.impffristen}</p>
              <div className="grid grid-cols-2 gap-3">
                {tageFeld("ndTageMin", ts.ndFruehestens)}
                {tageFeld("ndTageMax", ts.ndHoechstens)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {tageFeld("pmvTageMin", ts.pmvFruehestens)}
                {tageFeld("pmvTageMax", ts.pmvHoechstens)}
              </div>
              <div className="flex flex-col gap-2 md:col-span-2">
                <Haken label={ts.wassergefluegel} checked={d.wassergefluegelUntersuchung} onChange={(v) => set("wassergefluegelUntersuchung", v)} />
                <Haken label={ts.ausland} checked={d.auslandZugelassen} onChange={(v) => set("auslandZugelassen", v)} />
              </div>
            </FormAbschnitt>
          )}
        </Formular>
      )}
      {speichern.error && <Hinweis ton="fehler">{fehlerText(speichern.error)}</Hinweis>}
      <Speicherleiste sichtbar={geaendert} onVerwerfen={() => setD(startwerte())} onSpeichern={() => speichern.mutate({ id: s.id, daten: d })} laedt={speichern.isPending} knopf={ts.speichern} />
    </form>
  );
}

/** Übliche Reihenfolge in der Halle – Vorschlag beim Einschalten, danach frei sortierbar. */
const KAEFIG_FOLGE_VORSCHLAG: KaefigTyp[] = ["voliere", "stamm", "grosskaefig", "huehner", "zwerghuehner", "tauben"];

/**
 * Katalognummern nach Käfigblöcken: Die Käfige einer Größe bekommen durchgehende Nummern in der Reihenfolge, in der sie in
 * der Halle stehen; innerhalb eines Blocks gilt die Ausstellungsfolge. Aus = nach Sparten.
 */
function KaefigFolge({ wert, setzen, gesperrt, masse }: { wert: KaefigTyp[] | null; setzen: (f: KaefigTyp[] | null) => void; gesperrt: boolean; masse: KaefigMasse }) {
  const ts = useOberflaeche().schau.einstellungen.stammangaben;
  const schieben = (i: number, d: -1 | 1) => {
    if (!wert) return;
    const f = [...wert];
    const j = i + d;
    if (j < 0 || j >= f.length) return;
    [f[i], f[j]] = [f[j]!, f[i]!];
    setzen(f);
  };
  return (
    <div className="flex flex-col gap-2 rounded-md bg-papier p-4 md:col-span-2">
      <Haken
        label={ts.kaefigFolge}
        checked={!!wert}
        onChange={(v) => setzen(v ? KAEFIG_FOLGE_VORSCHLAG : null)}
        disabled={gesperrt}
        hinweis={
          gesperrt
            ? ts.festgeschrieben
            : ts.wirktBeimVergeben
        }
      />
      {wert && (
        <ol className="flex flex-col gap-1">
          {wert.map((t, i) => (
            <li key={t} className="flex items-center gap-2">
              <span className="w-6 text-right text-grau">{i + 1}.</span>
              <span className="min-w-0 flex-1 font-bold sm:min-w-40 sm:flex-none">{kaefigNameLang(t, masse)}</span>
              <Knopf variante="leise" className="min-h-8 px-2" disabled={gesperrt || i === 0} onClick={() => schieben(i, -1)} aria-label={ts.nachVorn(kaefigNameLang(t, masse))}>
                ↑
              </Knopf>
              <Knopf variante="leise" className="min-h-8 px-2" disabled={gesperrt || i === wert.length - 1} onClick={() => schieben(i, 1)} aria-label={ts.nachHinten(kaefigNameLang(t, masse))}>
                ↓
              </Knopf>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
