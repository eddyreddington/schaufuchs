import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { LOCALE, serverText, TERMIN_EBENE_INFO, TERMIN_EBENEN, TERMINE_KEINE, zeitraumDe, type Sprache, type TerminEbene } from "@schau/domain";
import { datumZeit, fehlerText, heuteIso } from "../lib";
import { useOberflaeche, useSprache } from "../sprache";
import { trpc, type Ausgabe } from "../trpc";
import { Auswahl, Dialog, Eingabe, Feld, Haken, HilfeLink, Hinweis, Knopf, Marke, useAenderungenWarnen, useFrage, useMeldung } from "../ui";

type Daten = Ausgabe["termine"]["laden"];
type Termin = Daten["termine"][number];
type Abo = Daten["abos"][number];

/** Seite des BDRG mit den Bundes- und Landesverbandsschauen – nachsehen und von Hand eintragen (kein automatischer Abruf ohne Zustimmung des BDRG). */
const BDRG_TERMINE = "https://www.bdrg.de/termine/bundesschauen";

/** Zeitraum in der Sprache der Oberfläche; Deutsch genau wie im Katalog (`zeitraumDe`). */
function zeitraum(von: string, bis: string | null, sprache: Sprache): string {
  if (sprache === "de" || sprache === "de-CH") return zeitraumDe(von, bis);
  const f = new Intl.DateTimeFormat(LOCALE[sprache], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const tag = (x: string) => new Date(`${x}T12:00:00Z`);
  return !bis || bis <= von ? f.format(tag(von)) : f.formatRange(tag(von), tag(bis));
}

/**
 * Katalogseite „Kommende Schauen“: Kreis und Landesverband für diesen Katalog wählen, Termine eintragen, Vorschläge aus
 * abonnierten Kalendern prüfen. Die Termine gelten für alle Schauen des Vereins.
 */
export function KommendeSchauen({ schauId, istAdmin }: { schauId: number; istAdmin: boolean }) {
  const tx = useOberflaeche().preisrichter.termine;
  const daten = trpc.termine.laden.useQuery({ schauId });
  const [bearbeiten, setBearbeiten] = useState<Partial<Termin> | null>(null);
  const [aboBearbeiten, setAboBearbeiten] = useState<Partial<Abo> | null>(null);
  if (daten.error)
    return (
      <div className="p-4 sm:p-5">
        <Hinweis ton="fehler">{fehlerText(daten.error)}</Hinweis>
      </div>
    );
  if (!daten.data) return null;
  const d = daten.data;
  const vorschlaege = d.termine.filter((t) => t.status === "vorschlag");
  const abweichungen = d.termine.filter((t) => t.status === "uebernommen" && t.abweichung);
  const uebernommen = d.termine.filter((t) => t.status === "uebernommen");
  return (
    <div className="divide-y divide-linie">
      <Gruppe titel={tx.imKatalog} aktionen={<HilfeLink abschnitt="kommende-schauen">{tx.hilfe}</HilfeLink>}>
        <Drucken schauId={schauId} an={!d.teilAusgeblendet} istAdmin={istAdmin} />
        {!d.schautage && <Hinweis ton="warnung">{tx.ohneBewertungstag}</Hinweis>}
        <Wahl schauId={schauId} daten={d} istAdmin={istAdmin} />
      </Gruppe>

      {(vorschlaege.length > 0 || abweichungen.length > 0) && <Pruefen vorschlaege={vorschlaege} abweichungen={abweichungen} istAdmin={istAdmin} />}

      {/* Vorschau der gedruckten Seite: Überschriften und Zeiträume wie im Katalog (bleibt deutsch). */}
      <Gruppe titel={tx.seiteImKatalog}>
        {d.vorschau.length === 0 ? (
          <p className="text-sm text-grau">{tx.keineDanach}</p>
        ) : (
          <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
            {d.vorschau.map((g) => (
              <div key={g.ebene} className="min-w-0">
                <div className="mb-1 text-sm font-semibold text-band-dunkel">{TERMIN_EBENE_INFO[g.ebene].titel}</div>
                <ul className="flex flex-col gap-0.5 text-sm">
                  {g.termine.map((t, i) => (
                    <li key={i}>
                      <span className="text-grau tabular-nums">{zeitraumDe(t.von, t.bis)}</span> · {t.name}
                      {t.ort ? <span className="text-grau"> · {t.ort}</span> : null}
                    </li>
                  ))}
                  {g.gekuerzt > 0 && <li className="text-grau">{tx.gekuerzt(g.gekuerzt)}</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Gruppe>

      <Gruppe
        titel={tx.alleTermine}
        anzahl={uebernommen.length}
        aktionen={
          <div className="flex flex-wrap items-center gap-3">
            <a className="text-sm text-grau no-underline hover:text-tinte hover:underline" href={BDRG_TERMINE} target="_blank" rel="noreferrer">
              {tx.beimBdrg}
            </a>
            {istAdmin && <Knopf onClick={() => setBearbeiten({ ebene: "kreis" })}>{tx.eintragen}</Knopf>}
          </div>
        }
      >
        {uebernommen.length === 0 ? <p className="text-sm text-grau">{tx.keineTermine}</p> : <TerminListe termine={uebernommen} istAdmin={istAdmin} bearbeiten={setBearbeiten} />}
      </Gruppe>

      <Abos abos={d.abos} istAdmin={istAdmin} bearbeiten={setAboBearbeiten} />
      <Veroeffentlichen an={d.veroeffentlichen} adresse={d.kalenderAdresse} istAdmin={istAdmin} />

      <Dialog offen={bearbeiten != null} onSchliessen={() => setBearbeiten(null)} titel={bearbeiten?.id ? tx.terminBearbeiten : tx.eintragen} breit>
        {bearbeiten && <TerminForm start={bearbeiten} kreise={d.kreise} laender={d.laender} fertig={() => setBearbeiten(null)} />}
      </Dialog>
      <Dialog offen={aboBearbeiten != null} onSchliessen={() => setAboBearbeiten(null)} titel={aboBearbeiten?.id ? tx.kalenderBearbeiten : tx.kalenderAbonnieren} breit>
        {aboBearbeiten && <AboForm start={aboBearbeiten} fertig={() => setAboBearbeiten(null)} />}
      </Dialog>
    </div>
  );
}

/** Abschnitt im Reiter: kleiner Titel (mit Anzahl) über dem Inhalt, Abschnitte durch Linien getrennt (kein Kasten im Kasten). */
function Gruppe({ titel, anzahl, aktionen, children }: { titel: string; anzahl?: number; aktionen?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[0.95rem] font-semibold">
          {titel}
          {anzahl != null && <span className="font-normal text-grau tabular-nums">{anzahl}</span>}
        </h2>
        {aktionen}
      </div>
      {children}
    </section>
  );
}

/** Zeile einer Liste: Titel und graue Angaben links, Aktionen ruhig rechts. */
function Zeile({ vorne, titel, angaben, aktionen, blass }: { vorne?: ReactNode; titel: ReactNode; angaben?: ReactNode; aktionen?: ReactNode; blass?: boolean }) {
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 ${blass ? "opacity-60" : ""}`}>
      {vorne}
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-tinte">{titel}</div>
        {angaben && <div className="text-sm text-grau">{angaben}</div>}
      </div>
      {aktionen && <div className="flex flex-wrap gap-0.5">{aktionen}</div>}
    </li>
  );
}

function Drucken({ schauId, an, istAdmin }: { schauId: number; an: boolean; istAdmin: boolean }) {
  const tx = useOberflaeche().preisrichter.termine.drucken;
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const setzen = trpc.termine.druckenSetzen.useMutation({
    onSuccess: (_, v) => {
      utils.termine.laden.invalidate();
      utils.katalogGestaltung.laden.invalidate();
      meldung(v.an ? tx.an : tx.aus);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  return (
    <Haken label={tx.label} checked={an} disabled={!istAdmin || setzen.isPending} onChange={(v) => setzen.mutate({ schauId, an: v })} />
  );
}

function Wahl({ schauId, daten, istAdmin }: { schauId: number; daten: Daten; istAdmin: boolean }) {
  const tx = useOberflaeche().preisrichter.termine.wahl;
  const sprache = useSprache();
  const [kreis, setKreis] = useState(daten.wahl.kreis);
  const [land, setLand] = useState(daten.wahl.land);
  useEffect(() => {
    setKreis(daten.wahl.kreis);
    setLand(daten.wahl.land);
  }, [daten.wahl.kreis, daten.wahl.land]);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const setzen = trpc.termine.wahlSetzen.useMutation({
    onSuccess: () => {
      utils.termine.laden.invalidate();
      meldung(tx.gespeichert);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const speichern = (k: string, l: string) => setzen.mutate({ schauId, kreis: k, land: l });
  // Gewählter Verband, der (noch) in keinem Termin steht, bleibt wählbar.
  const optionen = (liste: string[], wert: string) => (wert && wert !== TERMINE_KEINE && !liste.includes(wert) ? [wert, ...liste] : liste);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Feld label={tx.kreise}>
        {(fid) => (
          <Auswahl id={fid} value={kreis} disabled={!istAdmin || setzen.isPending} onChange={(e) => (setKreis(e.target.value), speichern(e.target.value, land))}>
            <option value="">{tx.alleKreise}</option>
            <option value={TERMINE_KEINE}>{tx.keineKreise}</option>
            {optionen(daten.kreise, kreis).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </Auswahl>
        )}
      </Feld>
      <Feld label={tx.laender}>
        {(fid) => (
          <Auswahl id={fid} value={land} disabled={!istAdmin || setzen.isPending} onChange={(e) => (setLand(e.target.value), speichern(kreis, e.target.value))}>
            <option value="">{tx.alleLaender}</option>
            <option value={TERMINE_KEINE}>{tx.keineLaender}</option>
            {optionen(daten.laender, land).map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </Auswahl>
        )}
      </Feld>
      {daten.schautage && (
        <p className="text-sm text-grau md:col-span-2">
          {tx.dieseSchau} <span className="tabular-nums">{zeitraum(daten.schautage.von, daten.schautage.bis, sprache)}</span>{tx.nurDanach}
        </p>
      )}
    </div>
  );
}

function Pruefen({ vorschlaege, abweichungen, istAdmin }: { vorschlaege: Termin[]; abweichungen: Termin[]; istAdmin: boolean }) {
  const o = useOberflaeche();
  const tx = o.preisrichter.termine.pruefen;
  const sprache = useSprache();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const fertig = () => utils.termine.laden.invalidate();
  const pruefen = trpc.termine.pruefen.useMutation({ onSuccess: fertig, onError: (e) => meldung(fehlerText(e), "fehler") });
  const abweichung = trpc.termine.abweichung.useMutation({ onSuccess: fertig, onError: (e) => meldung(fehlerText(e), "fehler") });
  return (
    <Gruppe titel={tx.titel} anzahl={vorschlaege.length + abweichungen.length}>
      {vorschlaege.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Marke ton="warnung">{tx.neu}</Marke>
            {istAdmin && vorschlaege.length > 1 && (
              <Knopf disabled={pruefen.isPending} onClick={() => pruefen.mutate({ ids: vorschlaege.map((t) => t.id), aktion: "uebernehmen" })}>
                {tx.alleUebernehmen(vorschlaege.length)}
              </Knopf>
            )}
          </div>
          <ul className="flex flex-col divide-y divide-linie">
            {vorschlaege.map((t) => (
              <Zeile
                key={t.id}
                titel={t.name}
                angaben={[zeitraum(t.von, t.bis, sprache), t.ort, `${o.fach.TERMIN_EBENE_INFO[t.ebene].name}: ${verbandVon(t) || "–"}`, t.quelle].filter(Boolean).join(" · ")}
                aktionen={
                  istAdmin && (
                    <>
                      <Knopf variante="primaer" disabled={pruefen.isPending} onClick={() => pruefen.mutate({ ids: [t.id], aktion: "uebernehmen" })}>{tx.uebernehmen}</Knopf>
                      <Knopf variante="leise" disabled={pruefen.isPending} onClick={() => pruefen.mutate({ ids: [t.id], aktion: "verwerfen" })}>{tx.verwerfen}</Knopf>
                    </>
                  )
                }
              />
            ))}
          </ul>
        </div>
      )}
      {abweichungen.length > 0 && (
        <div className="flex flex-col gap-1">
          <div>
            <Marke ton="warnung">{tx.geaendert}</Marke>
          </div>
          <ul className="flex flex-col divide-y divide-linie">
            {abweichungen.map((t) => {
              const a = t.abweichung!;
              const entfallen = "entfallen" in a;
              return (
                <Zeile
                  key={t.id}
                  titel={t.name}
                  angaben={
                    entfallen ? (
                      <>{tx.nichtMehr(t.quelle)}</>
                    ) : (
                      <>
                        {tx.bisher} {zeitraum(t.von, t.bis, sprache)}{t.ort ? `, ${t.ort}` : ""} {tx.lautQuelle} <strong className="font-semibold text-tinte">{a.name !== t.name ? `${a.name}, ` : ""}{zeitraum(a.von, a.bis, sprache)}{a.ort ? `, ${a.ort}` : ""}</strong>
                      </>
                    )
                  }
                  aktionen={
                    istAdmin && (
                      <>
                        <Knopf variante={entfallen ? "gefahr" : "primaer"} disabled={abweichung.isPending} onClick={() => abweichung.mutate({ id: t.id, aktion: "uebernehmen" })}>
                          {entfallen ? tx.terminLoeschen : tx.aenderungUebernehmen}
                        </Knopf>
                        <Knopf variante="leise" disabled={abweichung.isPending} onClick={() => abweichung.mutate({ id: t.id, aktion: "ignorieren" })}>{tx.behalten}</Knopf>
                      </>
                    )
                  }
                />
              );
            })}
          </ul>
        </div>
      )}
    </Gruppe>
  );
}

const verbandVon = (t: { ebene: TerminEbene; kreisverband: string; landesverband: string }) => (t.ebene === "kreis" ? t.kreisverband : t.ebene === "land" ? t.landesverband : "");

function TerminListe({ termine, istAdmin, bearbeiten }: { termine: Termin[]; istAdmin: boolean; bearbeiten: (t: Termin) => void }) {
  const o = useOberflaeche();
  const tx = o.preisrichter.termine.liste;
  const sprache = useSprache();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const loeschen = trpc.termine.loeschen.useMutation({ onSuccess: () => utils.termine.laden.invalidate(), onError: (e) => meldung(fehlerText(e), "fehler") });
  const heute = heuteIso();
  return (
    <ul className="-my-2.5 flex flex-col divide-y divide-linie">
      {termine.map((t) => (
        <Zeile
          key={t.id}
          blass={(t.bis ?? t.von) < heute}
          vorne={<Marke>{o.fach.TERMIN_EBENE_INFO[t.ebene].name}</Marke>}
          titel={t.name}
          angaben={[zeitraum(t.von, t.bis, sprache), t.ort, verbandVon(t), tx.quelle(t.quelle)].filter(Boolean).join(" · ")}
          aktionen={
            istAdmin && (
              <>
                <Knopf variante="leise" onClick={() => bearbeiten(t)}>{o.allgemein.bearbeiten}</Knopf>
                <Knopf
                  variante="leise"
                  disabled={loeschen.isPending}
                  onClick={async () => (await bestaetige({ titel: tx.loeschenFrage(t.name), text: tx.loeschenText, knopf: o.allgemein.loeschen, gefahr: true })) && loeschen.mutate({ id: t.id })}
                >
                  {o.allgemein.loeschen}
                </Knopf>
              </>
            )
          }
        />
      ))}
    </ul>
  );
}

function TerminForm({ start, kreise, laender, fertig }: { start: Partial<Termin>; kreise: string[]; laender: string[]; fertig: () => void }) {
  const o = useOberflaeche();
  const tx = o.preisrichter.termine.form;
  const [t, setT] = useState({
    name: start.name ?? "",
    ort: start.ort ?? "",
    von: start.von ?? "",
    bis: start.bis ?? "",
    ebene: (start.ebene ?? "kreis") as TerminEbene,
    kreisverband: start.kreisverband ?? "",
    landesverband: start.landesverband ?? "",
    quelle: start.quelle ?? "",
    quelleUrl: start.quelleUrl ?? "",
  });
  const gespeichert = useAenderungenWarnen(t);
  const utils = trpc.useUtils();
  const speichern = trpc.termine.speichern.useMutation({
    onSuccess: () => {
      gespeichert();
      utils.termine.laden.invalidate();
      fertig();
    },
  });
  const set = <K extends keyof typeof t>(k: K, v: (typeof t)[K]) => setT((x) => ({ ...x, [k]: v }));
  const senden = (e: FormEvent) => {
    e.preventDefault();
    speichern.mutate({ id: start.id, termin: { ...t, bis: t.bis || null } });
  };
  return (
    <form onSubmit={senden} className="grid gap-4 md:grid-cols-2">
      {start.aboId && (
        <div className="md:col-span-2">
          <Marke ton="info">{tx.ausAbo}</Marke>
        </div>
      )}
      <Feld label={tx.name} className="md:col-span-2" hinweis={tx.nameHinweis}>
        {(fid) => <Eingabe id={fid} required value={t.name} onChange={(e) => set("name", e.target.value)} />}
      </Feld>
      <Feld label={tx.beginn}>{(fid) => <Eingabe id={fid} type="date" required value={t.von} onChange={(e) => set("von", e.target.value)} />}</Feld>
      <Feld label={tx.ende} hinweis={tx.endeHinweis}>{(fid) => <Eingabe id={fid} type="date" min={t.von || undefined} value={t.bis} onChange={(e) => set("bis", e.target.value)} />}</Feld>
      <Feld label={tx.ort} hinweis={tx.ortHinweis}>{(fid) => <Eingabe id={fid} value={t.ort} onChange={(e) => set("ort", e.target.value)} />}</Feld>
      <Feld label={tx.ebene}>
        {(fid) => (
          <Auswahl id={fid} value={t.ebene} onChange={(e) => set("ebene", e.target.value as TerminEbene)}>
            {TERMIN_EBENEN.map((e) => (
              <option key={e} value={e}>{o.fach.TERMIN_EBENE_INFO[e].titel}</option>
            ))}
          </Auswahl>
        )}
      </Feld>
      {t.ebene === "kreis" && (
        <Feld label={tx.kreisverband}>
          {(fid) => (
            <>
              <Eingabe id={fid} list="kreise" value={t.kreisverband} onChange={(e) => set("kreisverband", e.target.value)} />
              <datalist id="kreise">{kreise.map((k) => <option key={k} value={k} />)}</datalist>
            </>
          )}
        </Feld>
      )}
      {t.ebene === "land" && (
        <Feld label={tx.landesverband}>
          {(fid) => (
            <>
              <Eingabe id={fid} list="laender" value={t.landesverband} onChange={(e) => set("landesverband", e.target.value)} />
              <datalist id="laender">{laender.map((l) => <option key={l} value={l} />)}</datalist>
            </>
          )}
        </Feld>
      )}
      <Feld label={tx.quelle} hinweis={tx.quelleHinweis}>
        {(fid) => <Eingabe id={fid} value={t.quelle} onChange={(e) => set("quelle", e.target.value)} />}
      </Feld>
      <Feld label={tx.link} hinweis={tx.optional}>
        {(fid) => <Eingabe id={fid} type="url" placeholder={tx.linkPlatzhalter} value={t.quelleUrl} onChange={(e) => set("quelleUrl", e.target.value)} />}
      </Feld>
      {speichern.error && <Hinweis ton="fehler" className="md:col-span-2">{fehlerText(speichern.error)}</Hinweis>}
      <div className="flex flex-wrap justify-end gap-2 md:col-span-2">
        <Knopf type="button" onClick={fertig}>{o.allgemein.abbrechen}</Knopf>
        <Knopf type="submit" variante="primaer" laedt={speichern.isPending}>{o.allgemein.speichern}</Knopf>
      </div>
    </form>
  );
}

function Abos({ abos, istAdmin, bearbeiten }: { abos: Abo[]; istAdmin: boolean; bearbeiten: (a: Partial<Abo>) => void }) {
  const o = useOberflaeche();
  const tx = o.preisrichter.termine.abos;
  const sprache = useSprache();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const fertig = () => utils.termine.laden.invalidate();
  const abrufen = trpc.termine.aboAbrufen.useMutation({
    onSuccess: (r) => {
      fertig();
      meldung(r.ok ? tx.abgerufen(r.anzahl, r.neu, r.geaendert) : tx.fehlgeschlagen(serverText(r.fehler, sprache)), r.ok ? "ok" : "fehler");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const loeschen = trpc.termine.aboLoeschen.useMutation({ onSuccess: fertig, onError: (e) => meldung(fehlerText(e), "fehler") });
  return (
    <Gruppe titel={tx.titel} anzahl={abos.length} aktionen={istAdmin && <Knopf onClick={() => bearbeiten({ ebene: "kreis", aktiv: true })}>{o.preisrichter.termine.kalenderAbonnieren}</Knopf>}>
      {abos.length === 0 ? (
        <p className="text-sm text-grau">{tx.keine}</p>
      ) : (
        <ul className="-my-2.5 flex flex-col divide-y divide-linie">
          {abos.map((a) => (
            <Zeile
              key={a.id}
              vorne={<Marke>{o.fach.TERMIN_EBENE_INFO[a.ebene].name}</Marke>}
              titel={
                <span className="flex flex-wrap items-center gap-2">
                  {a.name}
                  {!a.aktiv && <Marke>{tx.pausiert}</Marke>}
                </span>
              }
              angaben={
                <>
                  <span className="block truncate">{a.url}</span>
                  {a.letzterFehler ? (
                    <span className="block text-kamm">{tx.letzterFehler(datumZeit(a.letzterAbruf), serverText(a.letzterFehler, sprache))}</span>
                  ) : a.letzterErfolg ? (
                    <span className="block">{tx.erfolg(datumZeit(a.letzterErfolg), a.anzahl)}</span>
                  ) : (
                    <span className="block">{tx.nochNicht}</span>
                  )}
                </>
              }
              aktionen={
                istAdmin && (
                  <>
                    <Knopf variante="leise" laedt={abrufen.isPending && abrufen.variables?.id === a.id} disabled={abrufen.isPending} onClick={() => abrufen.mutate({ id: a.id })}>{tx.jetzt}</Knopf>
                    <Knopf variante="leise" onClick={() => bearbeiten(a)}>{o.allgemein.bearbeiten}</Knopf>
                    <Knopf
                      variante="leise"
                      disabled={loeschen.isPending}
                      onClick={async () =>
                        (await bestaetige({ titel: tx.beendenFrage(a.name), text: tx.beendenText, knopf: tx.aboBeenden, gefahr: true })) &&
                        loeschen.mutate({ id: a.id })
                      }
                    >
                      {tx.beenden}
                    </Knopf>
                  </>
                )
              }
            />
          ))}
        </ul>
      )}
    </Gruppe>
  );
}

function AboForm({ start, fertig }: { start: Partial<Abo>; fertig: () => void }) {
  const o = useOberflaeche();
  const tx = o.preisrichter.termine.aboForm;
  const sprache = useSprache();
  const [a, setA] = useState({ name: start.name ?? "", url: start.url ?? "", ebene: (start.ebene ?? "kreis") as TerminEbene, kreisverband: start.kreisverband ?? "", landesverband: start.landesverband ?? "", aktiv: start.aktiv ?? true });
  const gespeichert = useAenderungenWarnen(a);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const abrufen = trpc.termine.aboAbrufen.useMutation();
  const speichern = trpc.termine.aboSpeichern.useMutation({
    onSuccess: async ({ id }) => {
      gespeichert();
      fertig();
      // Gleich einmal abrufen, damit Fehler in der Adresse sofort sichtbar werden.
      if (a.aktiv) {
        const r = await abrufen.mutateAsync({ id }).catch(() => null);
        if (r) meldung(r.ok ? tx.neueTermine(r.neu) : o.preisrichter.termine.abos.fehlgeschlagen(serverText(r.fehler, sprache)), r.ok ? "ok" : "fehler");
      }
      utils.termine.laden.invalidate();
    },
  });
  const set = <K extends keyof typeof a>(k: K, v: (typeof a)[K]) => setA((x) => ({ ...x, [k]: v }));
  const senden = (e: FormEvent) => {
    e.preventDefault();
    speichern.mutate({ id: start.id, abo: a });
  };
  return (
    <form onSubmit={senden} className="grid gap-4 md:grid-cols-2">
      <Feld label={o.allgemein.name} hinweis={tx.nameHinweis}>
        {(fid) => <Eingabe id={fid} required value={a.name} onChange={(e) => set("name", e.target.value)} />}
      </Feld>
      <Feld label={tx.ebene}>
        {(fid) => (
          <Auswahl id={fid} value={a.ebene} onChange={(e) => set("ebene", e.target.value as TerminEbene)}>
            {TERMIN_EBENEN.map((e) => (
              <option key={e} value={e}>{o.fach.TERMIN_EBENE_INFO[e].titel}</option>
            ))}
          </Auswahl>
        )}
      </Feld>
      <Feld label={tx.adresse} className="md:col-span-2">
        {(fid) => <Eingabe id={fid} required inputMode="url" placeholder={tx.adressePlatzhalter} value={a.url} onChange={(e) => set("url", e.target.value)} />}
      </Feld>
      {a.ebene === "kreis" && <Feld label={o.preisrichter.termine.form.kreisverband}>{(fid) => <Eingabe id={fid} value={a.kreisverband} onChange={(e) => set("kreisverband", e.target.value)} />}</Feld>}
      {a.ebene === "land" && <Feld label={o.preisrichter.termine.form.landesverband}>{(fid) => <Eingabe id={fid} value={a.landesverband} onChange={(e) => set("landesverband", e.target.value)} />}</Feld>}
      <div className="md:col-span-2">
        <Haken label={tx.taeglich} checked={a.aktiv} onChange={(v) => set("aktiv", v)} />
      </div>
      {speichern.error && <Hinweis ton="fehler" className="md:col-span-2">{fehlerText(speichern.error)}</Hinweis>}
      <div className="flex flex-wrap justify-end gap-2 md:col-span-2">
        <Knopf type="button" onClick={fertig}>{o.allgemein.abbrechen}</Knopf>
        <Knopf type="submit" variante="primaer" laedt={speichern.isPending}>{o.allgemein.speichern}</Knopf>
      </div>
    </form>
  );
}

function Veroeffentlichen({ an, adresse, istAdmin }: { an: boolean; adresse: string; istAdmin: boolean }) {
  const tx = useOberflaeche().preisrichter.termine.veroeffentlichen;
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const setzen = trpc.termine.veroeffentlichenSetzen.useMutation({ onSuccess: () => utils.termine.laden.invalidate(), onError: (e) => meldung(fehlerText(e), "fehler") });
  return (
    <Gruppe titel={tx.titel}>
      <Haken
        label={tx.label}
        checked={an}
        disabled={!istAdmin || setzen.isPending}
        onChange={(v) => setzen.mutate({ an: v })}
      />
      {an && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-grau">{tx.adresse}</span>
          <code className="min-w-0 break-all rounded-md border border-linie bg-papier px-2 py-1 font-mono text-[0.85rem]">{adresse}</code>
          <Knopf variante="leise" onClick={() => void navigator.clipboard?.writeText(adresse).then(() => meldung(tx.kopiert))}>{tx.kopieren}</Knopf>
        </div>
      )}
    </Gruppe>
  );
}

