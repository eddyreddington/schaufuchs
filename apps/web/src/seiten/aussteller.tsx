import { useEffect, useMemo, useState, type FormEvent } from "react";
import { datum, fehlerText } from "../lib";
import { trpc, type Ausgabe } from "../trpc";
import { Auswahl, Dialog, Eingabe, FehlerAnzeige, Feld, Haken, Hinweis, Knopf, Laden, Marke, SEITE, Seitenkopf, Segmente, Suchfeld, TabellenRahmen, useMeldung } from "../ui";

/**
 * Aussteller des Vereins verwalten: Vereinsmitglieder und Externe getrennt, anlegen, Stammdaten ändern,
 * Auskunft (Art. 15 DSGVO) und Löschen (Art. 17). Nur Ausstellungsleitung (Administratoren).
 */
const GRUPPEN = [
  ["mitglieder", "Vereinsmitglieder"],
  ["externe", "Externe Aussteller"],
  ["alle", "Alle"],
] as const;
const FILTER = [
  ["aktiv", "Aktiv"],
  ["gesperrt", "Gesperrt"],
  ["geloescht", "Gelöscht"],
] as const;
type Gruppe = (typeof GRUPPEN)[number][0];
type Zeile = Ausgabe["verein"]["aussteller"][number];

export function AusstellerSeite() {
  const [eingabe, setEingabe] = useState("");
  const [q, setQ] = useState("");
  // Suche erst nach einer kurzen Tipp-Pause (jede Abfrage geht über alle Aussteller).
  useEffect(() => {
    const t = setTimeout(() => setQ(eingabe), 250);
    return () => clearTimeout(t);
  }, [eingabe]);
  const angaben = trpc.verein.vereinsangaben.useQuery();
  // Startansicht: Mitglieder, sobald die Schreibweisen festgelegt sind – vorher wäre die Liste leer.
  const [gewaehlt, setGruppe] = useState<Gruppe | null>(null);
  const gruppe: Gruppe = gewaehlt ?? (angaben.data?.eigene.length ? "mitglieder" : "alle");
  const [filter, setFilter] = useState<(typeof FILTER)[number][0]>("aktiv");
  const [schauId, setSchauId] = useState<number | null>(null);
  const schauen = trpc.schau.liste.useQuery();
  const echteSchauen = (schauen.data ?? []).filter((s) => !s.test);
  const testSchauen = (schauen.data ?? []).filter((s) => s.test);
  const liste = trpc.verein.aussteller.useQuery({ q, filter, gruppe, schauId }, { enabled: !!angaben.data || !!angaben.error });
  const [bearbeiten, setBearbeiten] = useState<{ id?: number } | null>(null);
  const [loeschen, setLoeschen] = useState<{ id: number; name: string } | null>(null);
  const [schreibweisen, setSchreibweisen] = useState(false);
  const eigene = angaben.data?.eigene ?? [];

  const testGewaehlt = testSchauen.some((s) => s.id === schauId);

  return (
    <div className={SEITE}>
      <Seitenkopf
        titel="Aussteller"
        unter={eigene.length ? <>Vereinsmitglieder: {eigene.map((n, i) => <span key={n}>{i > 0 && " oder "}„{n}“</span>)}</> : undefined}
        hilfe="aussteller-verwalten-auskunft-und-löschung"
        aktionen={
          <>
            <Knopf disabled={!angaben.data} onClick={() => setSchreibweisen(true)}>
              Schreibweisen festlegen
            </Knopf>
            {/* Hier angelegt ist immer ein echter Aussteller; Test-Aussteller entstehen über Meldungen in der Testschau. */}
            {!testGewaehlt && (
              <Knopf variante="primaer" onClick={() => setBearbeiten({})}>
                Aussteller anlegen
              </Knopf>
            )}
          </>
        }
      />

      {angaben.data && !eigene.length && <Hinweis ton="warnung">Die Schreibweisen Ihres Vereins sind noch nicht festgelegt.</Hinweis>}
      {testGewaehlt && <Hinweis ton="warnung">Test-Aussteller: Sie gehören nur zu dieser Testschau.</Hinweis>}

      <TabellenRahmen
        kopf={
          <>
            <Suchfeld aria-label="Aussteller suchen" placeholder="Name, Ort, Verein, E-Mail, Reg.-Nr." value={eingabe} onChange={(e) => setEingabe(e.target.value)} />
            <Segmente label="Gruppe" wert={gruppe} onChange={setGruppe} optionen={GRUPPEN.map(([k, l]) => ({ wert: k, label: l }))} />
            <div className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
              <div className="w-full sm:w-64">
                <Auswahl
                  aria-label="Schau"
                  value={schauId ?? ""}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : null;
                    setSchauId(id);
                    // Test-Aussteller sind meist keine Vereinsmitglieder: alle zeigen.
                    if (testSchauen.some((s) => s.id === id)) setGruppe("alle");
                  }}
                >
                  <option value="">alle Schauen</option>
                  {echteSchauen.map((s) => (
                    <option key={s.id} value={s.id}>
                      gemeldet in „{s.name}“
                    </option>
                  ))}
                  {testSchauen.map((s) => (
                    <option key={s.id} value={s.id}>
                      Test-Aussteller der Testschau „{s.name}“
                    </option>
                  ))}
                </Auswahl>
              </div>
              <div className="w-full sm:w-36">
                <Auswahl aria-label="Status" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
                  {FILTER.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Auswahl>
              </div>
            </div>
          </>
        }
        fuss={
          liste.data?.length ? (
            <span>{liste.data.length === 500 ? "Die ersten 500 – bitte die Suche eingrenzen." : `${liste.data.length} Aussteller`}</span>
          ) : undefined
        }
      >
        {liste.error ? (
          <div className="px-4">
            <FehlerAnzeige fehler={liste.error} nochmal={() => liste.refetch()} />
          </div>
        ) : !liste.data ? (
          <div className="px-4">
            <Laden />
          </div>
        ) : !liste.data.length ? (
          <p className="px-4 py-10 text-center text-grau">
            {q ? "Keine Treffer." : gruppe === "mitglieder" && !eigene.length ? "Noch keine Vereinsmitglieder – erst die Schreibweisen festlegen." : "Keine Einträge."}
          </p>
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th>Name</th>
                <th>Verein</th>
                <th>Wohnort</th>
                <th className="text-right">Meldungen</th>
                <th>Zuletzt gemeldet</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {liste.data.map((x) => (
                <AusstellerZeile key={x.id} x={x} bearbeiten={() => setBearbeiten({ id: x.id })} loeschen={() => setLoeschen({ id: x.id, name: `${x.vorname} ${x.nachname}` })} />
              ))}
            </tbody>
          </table>
        )}
      </TabellenRahmen>

      {bearbeiten && <BearbeitenDialog id={bearbeiten.id} eigene={eigene} schliessen={() => setBearbeiten(null)} />}
      <LoeschenDialog ziel={loeschen} schliessen={() => setLoeschen(null)} />
      {schreibweisen && angaben.data && <SchreibweisenDialog daten={angaben.data} schliessen={() => setSchreibweisen(false)} />}
    </div>
  );
}

/** Ruhige Aktion in einer Tabellenzeile (Text statt Knopf mit Rahmen). */
const zeilenAktionBasis = "inline-flex min-h-8 items-center rounded-md px-2 text-sm font-semibold text-grau no-underline";
const zeilenAktion = `${zeilenAktionBasis} hover:bg-papier hover:text-tinte`;
const zeilenAktionGefahr = `${zeilenAktionBasis} hover:bg-kamm-hell hover:text-kamm`;

function AusstellerZeile({ x, bearbeiten, loeschen }: { x: Zeile; bearbeiten: () => void; loeschen: () => void }) {
  const aktiv = !x.geloeschtAm && !x.gesperrtAm;
  const name = `${x.nachname}, ${x.vorname}`;
  return (
    <tr>
      <td>
        {aktiv ? (
          <button type="button" onClick={bearbeiten} className="text-left font-semibold text-tinte hover:text-band hover:underline">
            {name}
          </button>
        ) : (
          <span className="font-semibold text-tinte">{name}</span>
        )}
      </td>
      <td>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{x.verein || "–"}</span>
          {x.mitglied ? <Marke ton="ok">Mitglied</Marke> : <Marke>extern</Marke>}
          {x.mitgliedVonHand != null && <span className="text-sm text-grau">(von Hand)</span>}
        </div>
      </td>
      <td>{[x.plz, x.ort].filter(Boolean).join(" ") || "–"}</td>
      <td className="text-right">{x.meldungen}</td>
      <td>{datum(x.letzteMeldung)}</td>
      <td>
        {x.geloeschtAm ? (
          <Marke>gelöscht {datum(x.geloeschtAm)}</Marke>
        ) : x.gesperrtAm ? (
          <Marke ton="warnung">gesperrt bis {datum(x.loeschenAb)}</Marke>
        ) : (
          <Marke ton="ok">aktiv</Marke>
        )}
      </td>
      <td>
        <div className="flex flex-wrap justify-end gap-0.5 lg:flex-nowrap">
          {aktiv && (
            <button type="button" className={zeilenAktion} onClick={bearbeiten}>
              Bearbeiten
            </button>
          )}
          {!x.geloeschtAm && (
            <>
              <a className={zeilenAktion} href={`/datei/aussteller/${x.id}/auskunft.pdf`} target="_blank" rel="noreferrer">
                Auskunft
              </a>
              <a className={zeilenAktion} href={`/datei/aussteller/${x.id}/auskunft.json`} download>
                JSON
              </a>
              <button type="button" className={zeilenAktionGefahr} onClick={loeschen}>
                Löschen
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

type Formular = {
  vorname: string;
  nachname: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  verein: string;
  kreisverband: string;
  registriernummer: string;
  istPreisrichter: boolean;
  iban: string;
  kontoinhaber: string;
};
const LEER: Formular = { vorname: "", nachname: "", strasse: "", plz: "", ort: "", telefon: "", email: "", verein: "", kreisverband: "", registriernummer: "", istPreisrichter: false, iban: "", kontoinhaber: "" };

function BearbeitenDialog({ id, eigene, schliessen }: { id?: number; eigene: string[]; schliessen: () => void }) {
  const vorhanden = trpc.verein.ausstellerDaten.useQuery({ id: id ?? 0 }, { enabled: !!id, gcTime: 0, staleTime: 0 });
  return (
    <Dialog offen onSchliessen={schliessen} titel={id ? "Aussteller bearbeiten" : "Aussteller anlegen"} breit>
      {!id ? (
        <Formular start={LEER} startMitglied={null} eigene={eigene} schliessen={schliessen} />
      ) : vorhanden.error ? (
        <FehlerAnzeige fehler={vorhanden.error} nochmal={() => vorhanden.refetch()} />
      ) : !vorhanden.data ? (
        <Laden />
      ) : (
        <Formular
          id={id}
          start={Object.fromEntries(Object.keys(LEER).map((k) => [k, vorhanden.data[k as keyof Formular]])) as Formular}
          startMitglied={vorhanden.data.mitglied}
          eigene={eigene}
          schliessen={schliessen}
        />
      )}
    </Dialog>
  );
}

/** Wie `istEigenerVerein` in der Fachlogik – nur für die Anzeige „automatisch: Mitglied/extern“. */
const schluessel = (v: string) => v.toLocaleLowerCase("de").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function Formular({ id, start, startMitglied, eigene, schliessen }: { id?: number; start: Formular; startMitglied: boolean | null; eigene: string[]; schliessen: () => void }) {
  const [f, setF] = useState<Formular>(start);
  const [mitglied, setMitglied] = useState<"auto" | "ja" | "nein">(startMitglied == null ? "auto" : startMitglied ? "ja" : "nein");
  // Ausgangsstand fürs Speichern: hat ihn inzwischen jemand anders geändert, lehnt der Server ab (statt ihn zu überschreiben).
  const vorher = id ? { ...start, mitglied: startMitglied } : undefined;
  const [doppelt, setDoppelt] = useState(false);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const speichern = trpc.verein.ausstellerSpeichern.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.verein.aussteller.invalidate(), utils.verein.vereinsangaben.invalidate(), id ? utils.verein.ausstellerDaten.invalidate({ id }) : null]);
      meldung(id ? "Änderungen gespeichert." : `${f.vorname} ${f.nachname} angelegt.`);
      schliessen();
    },
    onError: (e) => setDoppelt(!id && e.data?.code === "CONFLICT"),
  });
  const autoMitglied = useMemo(() => {
    const v = schluessel(f.verein);
    return !!v && eigene.some((e) => schluessel(e) === v);
  }, [f.verein, eigene]);
  const senden = (e: FormEvent) => {
    e.preventDefault();
    speichern.mutate({ id, daten: f, mitglied, vorher });
  };
  const feld = (k: Exclude<keyof Formular, "istPreisrichter">, label: string, opts: { typ?: string; hinweis?: string; pflicht?: boolean; klasse?: string; auto?: string } = {}) => (
    <Feld label={label} hinweis={opts.hinweis} className={opts.klasse}>
      {(fid) => <Eingabe id={fid} type={opts.typ ?? "text"} value={f[k]} required={opts.pflicht} autoComplete={opts.auto ?? "off"} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
    </Feld>
  );
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => senden(e)}>
      <div className="grid gap-4 sm:grid-cols-2">
        {feld("vorname", "Vorname", { pflicht: true })}
        {feld("nachname", "Nachname", { pflicht: true })}
        {feld("strasse", "Straße und Hausnummer", { klasse: "sm:col-span-2" })}
        {feld("plz", "PLZ")}
        {feld("ort", "Ort")}
        {feld("telefon", "Telefon", { typ: "tel" })}
        {feld("email", "E-Mail", { typ: "email" })}
        {feld("verein", "Verein", { hinweis: "z. B. „GZV Musterstadt 1904“" })}
        {feld("kreisverband", "Kreisverband")}
        {feld("registriernummer", "Registriernummer (Viehverkehrsordnung)")}
        <Feld label="Vereinsmitglied">
          {(fid) => (
            <Auswahl id={fid} value={mitglied} onChange={(e) => setMitglied(e.target.value as typeof mitglied)}>
              <option value="auto">Automatisch nach Verein ({autoMitglied ? "Mitglied" : "extern"})</option>
              <option value="ja">Ja, Mitglied</option>
              <option value="nein">Nein, extern</option>
            </Auswahl>
          )}
        </Feld>
        {feld("iban", "IBAN", { hinweis: "Freiwillig" })}
        {feld("kontoinhaber", "Kontoinhaber", { hinweis: "Leer: der Aussteller selbst" })}
        <div className="sm:col-span-2">
          <Haken label="Ist Preisrichter" hinweis="Vorschlag für neue Meldungen" checked={f.istPreisrichter} onChange={(v) => setF({ ...f, istPreisrichter: v })} />
        </div>
      </div>
      {speichern.error && (
        <Hinweis ton={doppelt ? "warnung" : "fehler"}>
          {fehlerText(speichern.error)}
          {doppelt && (
            <div className="mt-2">
              <Knopf onClick={() => speichern.mutate({ id, daten: f, mitglied, trotzdem: true })}>Trotzdem neu anlegen</Knopf>
            </div>
          )}
        </Hinweis>
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t border-linie pt-4">
        <Knopf onClick={schliessen}>Abbrechen</Knopf>
        <Knopf type="submit" variante="primaer" laedt={speichern.isPending}>
          {id ? "Speichern" : "Anlegen"}
        </Knopf>
      </div>
    </form>
  );
}

function SchreibweisenDialog({ daten, schliessen }: { daten: Ausgabe["verein"]["vereinsangaben"]; schliessen: () => void }) {
  // Vorausgewählt: die gespeicherten Schreibweisen und alle Vereinsangaben, die ihnen entsprechen.
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(() => new Set([...daten.eigene, ...daten.angaben.filter((a) => a.eigen).map((a) => a.verein)]));
  const [neu, setNeu] = useState("");
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const setzen = trpc.verein.vereinsnamenSetzen.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.verein.aussteller.invalidate(), utils.verein.vereinsangaben.invalidate()]);
      meldung("Schreibweisen gespeichert.");
      schliessen();
    },
  });
  const nurGespeichert = daten.eigene.filter((n) => !daten.angaben.some((a) => a.verein === n));
  const zusatz = [...gewaehlt].filter((n) => !daten.angaben.some((a) => a.verein === n) && !nurGespeichert.includes(n));
  // Gleichwertige Schreibweisen (gleicher Schlüssel) gehen zusammen – sonst bliebe eine abgewählte über die andere eigen.
  const umschalten = (n: string) => {
    const s = new Set(gewaehlt);
    const k = schluessel(n);
    const an = !s.has(n);
    for (const x of [...daten.angaben.map((a) => a.verein), ...daten.eigene, ...gewaehlt, n]) {
      if (schluessel(x) !== k) continue;
      if (an) s.add(x);
      else s.delete(x);
    }
    setGewaehlt(s);
  };
  const zeile = (n: string, anzahl?: number) => (
    <label key={n} className="flex items-center gap-2 py-1">
      <input type="checkbox" className="size-[1.05rem] accent-band" checked={gewaehlt.has(n)} onChange={() => umschalten(n)} />
      <span>{n}</span>
      {anzahl != null && <span className="text-sm text-grau">({anzahl} Aussteller)</span>}
    </label>
  );
  return (
    <Dialog offen onSchliessen={schliessen} titel="Schreibweisen Ihres Vereins" breit>
      <div className="flex flex-col gap-4">
        <p>Aussteller mit diesen Vereinsangaben gelten als Vereinsmitglied.</p>
        <div className="max-h-[45vh] overflow-auto rounded-md border border-linie px-3 py-2">
          {daten.angaben.length || nurGespeichert.length || zusatz.length ? (
            <>
              {daten.angaben.map((a) => zeile(a.verein, a.anzahl))}
              {[...nurGespeichert, ...zusatz].map((n) => zeile(n))}
            </>
          ) : (
            <p className="text-grau">Noch keine Vereinsangaben vorhanden.</p>
          )}
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = neu.trim();
            if (n) setGewaehlt(new Set([...gewaehlt, n]));
            setNeu("");
          }}
        >
          <Feld label="Weitere Schreibweise" className="w-full sm:w-80">
            {(fid) => <Eingabe id={fid} value={neu} onChange={(e) => setNeu(e.target.value)} placeholder="z. B. GZV Musterstadt 1904 e. V." />}
          </Feld>
          <Knopf type="submit">Hinzufügen</Knopf>
        </form>
        {setzen.error && <Hinweis ton="fehler">{fehlerText(setzen.error)}</Hinweis>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-linie pt-4">
          <Knopf onClick={schliessen}>Abbrechen</Knopf>
          <Knopf variante="primaer" laedt={setzen.isPending} onClick={() => setzen.mutate({ namen: [...gewaehlt] })}>
            Speichern
          </Knopf>
        </div>
      </div>
    </Dialog>
  );
}

function LoeschenDialog({ ziel, schliessen }: { ziel: { id: number; name: string } | null; schliessen: () => void }) {
  const [grund, setGrund] = useState("");
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const loeschen = trpc.verein.ausstellerLoeschen.useMutation({
    onSuccess: async (r) => {
      await Promise.all([utils.verein.aussteller.invalidate(), utils.verein.vereinsangaben.invalidate()]);
      meldung(r.art === "gelöscht" ? "Daten gelöscht." : `Kontakt- und Bankdaten gelöscht, der Rest ist bis ${datum(r.loeschenAb)} gesperrt und wird dann gelöscht.`);
      setGrund("");
      schliessen();
    },
  });
  return (
    <Dialog offen={!!ziel} onSchliessen={schliessen} titel={`Daten von ${ziel?.name ?? ""} löschen`}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ziel) loeschen.mutate({ id: ziel.id, grund });
        }}
      >
        <p>Kontakt- und Bankdaten werden gelöscht; was aufbewahrt werden muss, bleibt bis zum Fristende gesperrt.</p>
        <Feld label="Grund" hinweis="Ohne Namen, z. B. „Löschwunsch per E-Mail vom 06.11.2026“">
          {(id) => <Eingabe id={id} value={grund} onChange={(e) => setGrund(e.target.value)} required minLength={3} autoFocus />}
        </Feld>
        {loeschen.error && <Hinweis ton="fehler">{fehlerText(loeschen.error)}</Hinweis>}
        <div className="flex flex-wrap justify-end gap-2">
          <Knopf onClick={schliessen}>Abbrechen</Knopf>
          <Knopf type="submit" variante="gefahr" laedt={loeschen.isPending}>
            Endgültig löschen
          </Knopf>
        </div>
      </form>
    </Dialog>
  );
}
