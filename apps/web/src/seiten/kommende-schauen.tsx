import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { TERMIN_EBENE_INFO, TERMIN_EBENEN, TERMINE_KEINE, zeitraumDe, type TerminEbene } from "@schau/domain";
import { datumZeit, fehlerText, heuteIso } from "../lib";
import { trpc, type Ausgabe } from "../trpc";
import { Auswahl, Dialog, Eingabe, Feld, Haken, HilfeLink, Hinweis, Knopf, Marke, useAenderungenWarnen, useFrage, useMeldung } from "../ui";

type Daten = Ausgabe["termine"]["laden"];
type Termin = Daten["termine"][number];
type Abo = Daten["abos"][number];

/** Seite des BDRG mit den Bundes- und Landesverbandsschauen – nachsehen und von Hand eintragen (kein automatischer Abruf ohne Zustimmung des BDRG). */
const BDRG_TERMINE = "https://www.bdrg.de/termine/bundesschauen";

/**
 * Katalogseite „Kommende Schauen“: Kreis und Landesverband für diesen Katalog wählen, Termine eintragen, Vorschläge aus
 * abonnierten Kalendern prüfen. Die Termine gelten für alle Schauen des Vereins.
 */
export function KommendeSchauen({ schauId, istAdmin }: { schauId: number; istAdmin: boolean }) {
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
      <Gruppe titel="Im Katalog dieser Schau" aktionen={<HilfeLink abschnitt="kommende-schauen">Hilfe zu „Kommende Schauen“</HilfeLink>}>
        <Drucken schauId={schauId} an={!d.teilAusgeblendet} istAdmin={istAdmin} />
        {!d.schautage && <Hinweis ton="warnung">Ohne Bewertungstag fehlt die Seite im Katalog.</Hinweis>}
        <Wahl schauId={schauId} daten={d} istAdmin={istAdmin} />
      </Gruppe>

      {(vorschlaege.length > 0 || abweichungen.length > 0) && <Pruefen vorschlaege={vorschlaege} abweichungen={abweichungen} istAdmin={istAdmin} />}

      <Gruppe titel="Seite im Katalog">
        {d.vorschau.length === 0 ? (
          <p className="text-sm text-grau">Keine Termine nach dieser Schau, die Seite entfällt.</p>
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
                  {g.gekuerzt > 0 && <li className="text-grau">… und {g.gekuerzt} weitere (gekürzt)</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Gruppe>

      <Gruppe
        titel="Alle Termine"
        anzahl={uebernommen.length}
        aktionen={
          <div className="flex flex-wrap items-center gap-3">
            <a className="text-sm text-grau no-underline hover:text-tinte hover:underline" href={BDRG_TERMINE} target="_blank" rel="noreferrer">
              Termine beim BDRG
            </a>
            {istAdmin && <Knopf onClick={() => setBearbeiten({ ebene: "kreis" })}>Termin eintragen</Knopf>}
          </div>
        }
      >
        {uebernommen.length === 0 ? <p className="text-sm text-grau">Noch keine Termine eingetragen.</p> : <TerminListe termine={uebernommen} istAdmin={istAdmin} bearbeiten={setBearbeiten} />}
      </Gruppe>

      <Abos abos={d.abos} istAdmin={istAdmin} bearbeiten={setAboBearbeiten} />
      <Veroeffentlichen an={d.veroeffentlichen} adresse={d.kalenderAdresse} istAdmin={istAdmin} />

      <Dialog offen={bearbeiten != null} onSchliessen={() => setBearbeiten(null)} titel={bearbeiten?.id ? "Termin bearbeiten" : "Termin eintragen"} breit>
        {bearbeiten && <TerminForm start={bearbeiten} kreise={d.kreise} laender={d.laender} fertig={() => setBearbeiten(null)} />}
      </Dialog>
      <Dialog offen={aboBearbeiten != null} onSchliessen={() => setAboBearbeiten(null)} titel={aboBearbeiten?.id ? "Kalender bearbeiten" : "Kalender abonnieren"} breit>
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
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const setzen = trpc.termine.druckenSetzen.useMutation({
    onSuccess: (_, v) => {
      utils.termine.laden.invalidate();
      utils.katalogGestaltung.laden.invalidate();
      meldung(v.an ? "Die Seite steht im Katalog." : "Die Seite wird nicht gedruckt.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  return (
    <Haken label="Seite „Kommende Schauen“ im Katalog drucken" checked={an} disabled={!istAdmin || setzen.isPending} onChange={(v) => setzen.mutate({ schauId, an: v })} />
  );
}

function Wahl({ schauId, daten, istAdmin }: { schauId: number; daten: Daten; istAdmin: boolean }) {
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
      meldung("Auswahl gespeichert.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const speichern = (k: string, l: string) => setzen.mutate({ schauId, kreis: k, land: l });
  // Gewählter Verband, der (noch) in keinem Termin steht, bleibt wählbar.
  const optionen = (liste: string[], wert: string) => (wert && wert !== TERMINE_KEINE && !liste.includes(wert) ? [wert, ...liste] : liste);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Feld label="Kreisschauen im Katalog">
        {(fid) => (
          <Auswahl id={fid} value={kreis} disabled={!istAdmin || setzen.isPending} onChange={(e) => (setKreis(e.target.value), speichern(e.target.value, land))}>
            <option value="">alle Kreise</option>
            <option value={TERMINE_KEINE}>keine Kreisschauen</option>
            {optionen(daten.kreise, kreis).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </Auswahl>
        )}
      </Feld>
      <Feld label="Landesschauen im Katalog">
        {(fid) => (
          <Auswahl id={fid} value={land} disabled={!istAdmin || setzen.isPending} onChange={(e) => (setLand(e.target.value), speichern(kreis, e.target.value))}>
            <option value="">alle Landesverbände</option>
            <option value={TERMINE_KEINE}>keine Landesschauen</option>
            {optionen(daten.laender, land).map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </Auswahl>
        )}
      </Feld>
      {daten.schautage && (
        <p className="text-sm text-grau md:col-span-2">
          Diese Schau: <span className="tabular-nums">{zeitraumDe(daten.schautage.von, daten.schautage.bis)}</span>, im Katalog nur Termine danach
        </p>
      )}
    </div>
  );
}

function Pruefen({ vorschlaege, abweichungen, istAdmin }: { vorschlaege: Termin[]; abweichungen: Termin[]; istAdmin: boolean }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const fertig = () => utils.termine.laden.invalidate();
  const pruefen = trpc.termine.pruefen.useMutation({ onSuccess: fertig, onError: (e) => meldung(fehlerText(e), "fehler") });
  const abweichung = trpc.termine.abweichung.useMutation({ onSuccess: fertig, onError: (e) => meldung(fehlerText(e), "fehler") });
  return (
    <Gruppe titel="Zu prüfen" anzahl={vorschlaege.length + abweichungen.length}>
      {vorschlaege.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Marke ton="warnung">Neu aus Kalendern</Marke>
            {istAdmin && vorschlaege.length > 1 && (
              <Knopf disabled={pruefen.isPending} onClick={() => pruefen.mutate({ ids: vorschlaege.map((t) => t.id), aktion: "uebernehmen" })}>
                Alle {vorschlaege.length} übernehmen
              </Knopf>
            )}
          </div>
          <ul className="flex flex-col divide-y divide-linie">
            {vorschlaege.map((t) => (
              <Zeile
                key={t.id}
                titel={t.name}
                angaben={[zeitraumDe(t.von, t.bis), t.ort, `${TERMIN_EBENE_INFO[t.ebene].name}: ${verbandVon(t) || "–"}`, t.quelle].filter(Boolean).join(" · ")}
                aktionen={
                  istAdmin && (
                    <>
                      <Knopf variante="primaer" disabled={pruefen.isPending} onClick={() => pruefen.mutate({ ids: [t.id], aktion: "uebernehmen" })}>Übernehmen</Knopf>
                      <Knopf variante="leise" disabled={pruefen.isPending} onClick={() => pruefen.mutate({ ids: [t.id], aktion: "verwerfen" })}>Verwerfen</Knopf>
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
            <Marke ton="warnung">Geändert laut Quelle</Marke>
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
                      <>Nicht mehr im Kalender „{t.quelle}“</>
                    ) : (
                      <>
                        Bisher: {zeitraumDe(t.von, t.bis)}{t.ort ? `, ${t.ort}` : ""} → laut Quelle: <strong className="font-semibold text-tinte">{a.name !== t.name ? `${a.name}, ` : ""}{zeitraumDe(a.von, a.bis)}{a.ort ? `, ${a.ort}` : ""}</strong>
                      </>
                    )
                  }
                  aktionen={
                    istAdmin && (
                      <>
                        <Knopf variante={entfallen ? "gefahr" : "primaer"} disabled={abweichung.isPending} onClick={() => abweichung.mutate({ id: t.id, aktion: "uebernehmen" })}>
                          {entfallen ? "Termin löschen" : "Änderung übernehmen"}
                        </Knopf>
                        <Knopf variante="leise" disabled={abweichung.isPending} onClick={() => abweichung.mutate({ id: t.id, aktion: "ignorieren" })}>Behalten wie bisher</Knopf>
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
          vorne={<Marke>{TERMIN_EBENE_INFO[t.ebene].name}</Marke>}
          titel={t.name}
          angaben={[zeitraumDe(t.von, t.bis), t.ort, verbandVon(t), `Quelle: ${t.quelle}`].filter(Boolean).join(" · ")}
          aktionen={
            istAdmin && (
              <>
                <Knopf variante="leise" onClick={() => bearbeiten(t)}>Bearbeiten</Knopf>
                <Knopf
                  variante="leise"
                  disabled={loeschen.isPending}
                  onClick={async () => (await bestaetige({ titel: `„${t.name}“ löschen?`, text: "Der Termin steht dann in keinem Katalog des Vereins mehr.", knopf: "Löschen", gefahr: true })) && loeschen.mutate({ id: t.id })}
                >
                  Löschen
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
          <Marke ton="info">Aus einem abonnierten Kalender</Marke>
        </div>
      )}
      <Feld label="Name der Schau" className="md:col-span-2" hinweis="z. B. „108. Nationale“">
        {(fid) => <Eingabe id={fid} required value={t.name} onChange={(e) => set("name", e.target.value)} />}
      </Feld>
      <Feld label="Beginn">{(fid) => <Eingabe id={fid} type="date" required value={t.von} onChange={(e) => set("von", e.target.value)} />}</Feld>
      <Feld label="Ende" hinweis="leer bei eintägigen Schauen">{(fid) => <Eingabe id={fid} type="date" min={t.von || undefined} value={t.bis} onChange={(e) => set("bis", e.target.value)} />}</Feld>
      <Feld label="Ort" hinweis="z. B. „Leipzig, Neue Messe“">{(fid) => <Eingabe id={fid} value={t.ort} onChange={(e) => set("ort", e.target.value)} />}</Feld>
      <Feld label="Ebene">
        {(fid) => (
          <Auswahl id={fid} value={t.ebene} onChange={(e) => set("ebene", e.target.value as TerminEbene)}>
            {TERMIN_EBENEN.map((e) => (
              <option key={e} value={e}>{TERMIN_EBENE_INFO[e].titel}</option>
            ))}
          </Auswahl>
        )}
      </Feld>
      {t.ebene === "kreis" && (
        <Feld label="Kreisverband">
          {(fid) => (
            <>
              <Eingabe id={fid} list="kreise" value={t.kreisverband} onChange={(e) => set("kreisverband", e.target.value)} />
              <datalist id="kreise">{kreise.map((k) => <option key={k} value={k} />)}</datalist>
            </>
          )}
        </Feld>
      )}
      {t.ebene === "land" && (
        <Feld label="Landesverband">
          {(fid) => (
            <>
              <Eingabe id={fid} list="laender" value={t.landesverband} onChange={(e) => set("landesverband", e.target.value)} />
              <datalist id="laender">{laender.map((l) => <option key={l} value={l} />)}</datalist>
            </>
          )}
        </Feld>
      )}
      <Feld label="Quelle (steht im Katalog)" hinweis="leer = „eigene Eintragung“">
        {(fid) => <Eingabe id={fid} value={t.quelle} onChange={(e) => set("quelle", e.target.value)} />}
      </Feld>
      <Feld label="Link zur Quelle" hinweis="optional">
        {(fid) => <Eingabe id={fid} type="url" placeholder="https://…" value={t.quelleUrl} onChange={(e) => set("quelleUrl", e.target.value)} />}
      </Feld>
      {speichern.error && <Hinweis ton="fehler" className="md:col-span-2">{fehlerText(speichern.error)}</Hinweis>}
      <div className="flex flex-wrap justify-end gap-2 md:col-span-2">
        <Knopf type="button" onClick={fertig}>Abbrechen</Knopf>
        <Knopf type="submit" variante="primaer" laedt={speichern.isPending}>Speichern</Knopf>
      </div>
    </form>
  );
}

function Abos({ abos, istAdmin, bearbeiten }: { abos: Abo[]; istAdmin: boolean; bearbeiten: (a: Partial<Abo>) => void }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const fertig = () => utils.termine.laden.invalidate();
  const abrufen = trpc.termine.aboAbrufen.useMutation({
    onSuccess: (r) => {
      fertig();
      meldung(r.ok ? `Abgerufen: ${r.anzahl} Termine im Kalender, ${r.neu} neu, ${r.geaendert} geändert.` : `Abruf fehlgeschlagen: ${r.fehler}`, r.ok ? "ok" : "fehler");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const loeschen = trpc.termine.aboLoeschen.useMutation({ onSuccess: fertig, onError: (e) => meldung(fehlerText(e), "fehler") });
  return (
    <Gruppe titel="Abonnierte Kalender" anzahl={abos.length} aktionen={istAdmin && <Knopf onClick={() => bearbeiten({ ebene: "kreis", aktiv: true })}>Kalender abonnieren</Knopf>}>
      {abos.length === 0 ? (
        <p className="text-sm text-grau">Kein Kalender abonniert.</p>
      ) : (
        <ul className="-my-2.5 flex flex-col divide-y divide-linie">
          {abos.map((a) => (
            <Zeile
              key={a.id}
              vorne={<Marke>{TERMIN_EBENE_INFO[a.ebene].name}</Marke>}
              titel={
                <span className="flex flex-wrap items-center gap-2">
                  {a.name}
                  {!a.aktiv && <Marke>pausiert</Marke>}
                </span>
              }
              angaben={
                <>
                  <span className="block truncate">{a.url}</span>
                  {a.letzterFehler ? (
                    <span className="block text-kamm">Letzter Abruf {datumZeit(a.letzterAbruf)} fehlgeschlagen: {a.letzterFehler}</span>
                  ) : a.letzterErfolg ? (
                    <span className="block">Abgerufen {datumZeit(a.letzterErfolg)} · {a.anzahl} Termine im Kalender</span>
                  ) : (
                    <span className="block">Noch nicht abgerufen</span>
                  )}
                </>
              }
              aktionen={
                istAdmin && (
                  <>
                    <Knopf variante="leise" laedt={abrufen.isPending && abrufen.variables?.id === a.id} disabled={abrufen.isPending} onClick={() => abrufen.mutate({ id: a.id })}>Jetzt abrufen</Knopf>
                    <Knopf variante="leise" onClick={() => bearbeiten(a)}>Bearbeiten</Knopf>
                    <Knopf
                      variante="leise"
                      disabled={loeschen.isPending}
                      onClick={async () =>
                        (await bestaetige({ titel: `Abo „${a.name}“ beenden?`, text: "Offene Vorschläge verschwinden, übernommene Termine bleiben.", knopf: "Abo beenden", gefahr: true })) &&
                        loeschen.mutate({ id: a.id })
                      }
                    >
                      Beenden
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
        if (r) meldung(r.ok ? `Abgerufen: ${r.neu} neue Termine zum Prüfen.` : `Abruf fehlgeschlagen: ${r.fehler}`, r.ok ? "ok" : "fehler");
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
      <Feld label="Name" hinweis="Quelle im Katalog, z. B. „Kalender KV Musterkreis“">
        {(fid) => <Eingabe id={fid} required value={a.name} onChange={(e) => set("name", e.target.value)} />}
      </Feld>
      <Feld label="Ebene der Termine">
        {(fid) => (
          <Auswahl id={fid} value={a.ebene} onChange={(e) => set("ebene", e.target.value as TerminEbene)}>
            {TERMIN_EBENEN.map((e) => (
              <option key={e} value={e}>{TERMIN_EBENE_INFO[e].titel}</option>
            ))}
          </Auswahl>
        )}
      </Feld>
      <Feld label="Adresse des Kalenders" className="md:col-span-2">
        {(fid) => <Eingabe id={fid} required inputMode="url" placeholder="https://…/schauen.ics" value={a.url} onChange={(e) => set("url", e.target.value)} />}
      </Feld>
      {a.ebene === "kreis" && <Feld label="Kreisverband">{(fid) => <Eingabe id={fid} value={a.kreisverband} onChange={(e) => set("kreisverband", e.target.value)} />}</Feld>}
      {a.ebene === "land" && <Feld label="Landesverband">{(fid) => <Eingabe id={fid} value={a.landesverband} onChange={(e) => set("landesverband", e.target.value)} />}</Feld>}
      <div className="md:col-span-2">
        <Haken label="Täglich abrufen" checked={a.aktiv} onChange={(v) => set("aktiv", v)} />
      </div>
      {speichern.error && <Hinweis ton="fehler" className="md:col-span-2">{fehlerText(speichern.error)}</Hinweis>}
      <div className="flex flex-wrap justify-end gap-2 md:col-span-2">
        <Knopf type="button" onClick={fertig}>Abbrechen</Knopf>
        <Knopf type="submit" variante="primaer" laedt={speichern.isPending}>Speichern</Knopf>
      </div>
    </form>
  );
}

function Veroeffentlichen({ an, adresse, istAdmin }: { an: boolean; adresse: string; istAdmin: boolean }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const setzen = trpc.termine.veroeffentlichenSetzen.useMutation({ onSuccess: () => utils.termine.laden.invalidate(), onError: (e) => meldung(fehlerText(e), "fehler") });
  return (
    <Gruppe titel="Eigene Schauen als Kalender">
      <Haken
        label="Unsere Schauen als Kalender veröffentlichen"
        checked={an}
        disabled={!istAdmin || setzen.isPending}
        onChange={(v) => setzen.mutate({ an: v })}
      />
      {an && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-grau">Adresse zum Weitergeben:</span>
          <code className="min-w-0 break-all rounded-md border border-linie bg-papier px-2 py-1 font-mono text-[0.85rem]">{adresse}</code>
          <Knopf variante="leise" onClick={() => void navigator.clipboard?.writeText(adresse).then(() => meldung("Adresse kopiert."))}>Kopieren</Knopf>
        </div>
      )}
    </Gruppe>
  );
}

