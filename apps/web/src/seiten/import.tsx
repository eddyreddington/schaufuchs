import { AUSSTELLER_FELDER, IMPORT_FELDER, type ImportFeld, TIER_FELDER } from "@schau/domain";
import { useRef, useState } from "react";
import { datumZeit, fehlerText } from "../lib";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Auswahl, FehlerAnzeige, Feld, Haken, Hinweis, Kennzahlen, Knopf, Laden, Leer, Marke, SEITE, Segmente, Seitenkopf, TabellenRahmen, useFrage, useMeldung } from "../ui";

type Art = "meldungen" | "aussteller";
type Bericht = Ausgabe["datenimport"]["pruefen"];
const MAX_BYTES = 8 * 1024 * 1024;
const ZEILEN_ANZEIGE = 200;

/** Datei als Base64 (ohne „data:“-Vorspann). */
function alsBase64(datei: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    r.readAsDataURL(datei);
  });
}

/**
 * Import aus Altprogrammen (/import, Entscheidung 015): Datei wählen, Spalten zuordnen, prüfen, Rassen zuordnen,
 * übernehmen; frühere Importe zurücknehmen. Erklärungen im Handbuch („Import aus anderen Programmen“).
 */
export function ImportSeite() {
  const [art, setArt] = useState<Art>("meldungen");
  const [schauId, setSchauId] = useState<number | null>(null);
  const [dateiname, setDateiname] = useState("");
  /** Neuer Schlüssel leert das Dateifeld – sonst ließe sich dieselbe Datei nicht noch einmal wählen. */
  const [dateiFeld, setDateiFeld] = useState(0);
  const [tabelle, setTabelle] = useState<string[][] | null>(null);
  const [zuordnung, setZuordnung] = useState<(ImportFeld | null)[]>([]);
  const [mitKopf, setMitKopf] = useState(true);
  const [rassen, setRassen] = useState<Record<string, number | null>>({});
  const [bericht, setBericht] = useState<Bericht | null>(null);
  const [bestaetigen, setBestaetigen] = useState(true);
  const [zustimmung, setZustimmung] = useState(false);
  const schauen = trpc.schau.liste.useQuery();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const lesen = trpc.datenimport.lesen.useMutation({ onError: (e) => meldung(fehlerText(e), "fehler") });
  const pruefen = trpc.datenimport.pruefen.useMutation({ onError: (e) => meldung(fehlerText(e), "fehler") });
  // Nur die Antwort auf die letzte Prüfung zählt: Ändert sich danach etwas (Art, Schau, Zuordnung, Datei, Rasse),
  // verfällt der Bericht, und eine spät eintreffende ältere Antwort setzt ihn nicht wieder.
  const stand = useRef(0);
  const verwerfen = () => {
    stand.current++;
    setBericht(null);
  };
  const pruefe = (e: ReturnType<typeof eingabe>) => {
    const nr = ++stand.current;
    pruefen.mutate(e, {
      onSuccess: (b) => nr === stand.current && setBericht(b),
      // Gescheitert: kein alter Bericht, der nicht mehr zur Eingabe passt.
      onError: () => nr === stand.current && setBericht(null),
    });
  };
  const uebernehmen = trpc.datenimport.uebernehmen.useMutation({
    onSuccess: async (r) => {
      meldung(art === "meldungen" ? `${r.meldungen} Meldungen mit ${r.tiere} Tieren übernommen${r.ausgelassen ? `, ${r.ausgelassen} Zeilen ausgelassen` : ""}.` : `${r.aussteller} Aussteller angelegt.`);
      zuruecksetzen();
      await utils.datenimport.laeufe.invalidate();
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const offeneSchauen = (schauen.data ?? []).filter((s) => ["vorbereitung", "meldung", "katalog"].includes(s.phase));

  const zuruecksetzen = () => {
    setTabelle(null);
    setZuordnung([]);
    verwerfen();
    setRassen({});
    setDateiname("");
    setDateiFeld((n) => n + 1);
  };
  const eingabe = (r = rassen) => ({ art, schauId: art === "meldungen" ? (schauId ?? undefined) : undefined, dateiname, tabelle: JSON.stringify(tabelle ?? []), zuordnung, mitKopf, rassen: r });
  const dateiGewaehlt = async (d: File | undefined) => {
    if (!d) return;
    if (d.size > MAX_BYTES) return meldung("Die Datei ist zu groß (höchstens 8 MB).", "fehler");
    const r = await lesen.mutateAsync({ dateiname: d.name, base64: await alsBase64(d) }).catch(() => null);
    if (!r) return;
    setDateiname(d.name);
    setTabelle(r.tabelle);
    setZuordnung(r.zuordnung);
    verwerfen();
    setRassen({});
    if (r.abgeschnitten) meldung("Nur die ersten 60 Spalten werden gelesen.", "warnung");
  };
  const rasseWaehlen = (schluessel: string, id: number | null) => {
    const neu = { ...rassen, [schluessel]: id };
    setRassen(neu);
    pruefe(eingabe(neu));
  };
  const gut = bericht?.zeilen.filter((z) => !z.fehler.length).length ?? 0;
  const bereit = !!bericht && gut > 0 && (art === "aussteller" || schauId != null);

  return (
    <div className={SEITE}>
      <Seitenkopf
        titel="Import"
        hilfe="import"
        aktionen={
          bericht && (
            <Knopf variante="primaer" disabled={!bereit || pruefen.isPending} laedt={uebernehmen.isPending} onClick={() => uebernehmen.mutate({ ...eingabe(), bestaetigen, zustimmung })}>
              {art === "meldungen" ? `${gut} Zeilen übernehmen` : "Aussteller übernehmen"}
            </Knopf>
          )
        }
      />

      <Abschnitt titel="1. Datei">
        <div className="flex flex-col gap-4">
          <Segmente<Art>
            label="Was wird importiert?"
            wert={art}
            onChange={(a) => {
              setArt(a);
              verwerfen();
            }}
            optionen={[
              { wert: "meldungen", label: "Meldungen in eine Schau" },
              { wert: "aussteller", label: "Aussteller ins Verzeichnis" },
            ]}
          />
          {art === "meldungen" && (
            <Feld label="Schau" className="max-w-md">
              {(id) => (
                <Auswahl
                  id={id}
                  value={schauId ?? ""}
                  onChange={(e) => {
                    setSchauId(e.target.value ? Number(e.target.value) : null);
                    verwerfen();
                    setRassen({});
                  }}
                >
                  <option value="">Bitte wählen</option>
                  {offeneSchauen.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Auswahl>
              )}
            </Feld>
          )}
          <Feld label="Datei (Excel .xlsx oder CSV)" className="max-w-md">
            {(id) => <input key={dateiFeld} id={id} type="file" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => void dateiGewaehlt(e.target.files?.[0])} className="text-sm" />}
          </Feld>
          {lesen.isPending && <Laden />}
        </div>
      </Abschnitt>

      {tabelle && (
        <Spalten
          art={art}
          tabelle={tabelle}
          zuordnung={zuordnung}
          mitKopf={mitKopf}
          setMitKopf={(v) => {
            setMitKopf(v);
            verwerfen();
          }}
          setZuordnung={(z) => {
            setZuordnung(z);
            verwerfen();
          }}
          pruefen={() => pruefe(eingabe())}
          laedt={pruefen.isPending}
          gesperrt={art === "meldungen" && schauId == null}
        />
      )}

      {bericht && (
        <>
          <Kennzahlen
            werte={[
              { label: "Zeilen", wert: bericht.zeilen.length },
              { label: "Übernehmbar", wert: gut, ton: gut ? "ok" : "warnung" },
              { label: "Mit Fehlern", wert: bericht.zeilen.length - gut, ton: bericht.zeilen.length - gut ? "fehler" : undefined },
              { label: "Aussteller neu / vorhanden", wert: `${bericht.aussteller.filter((a) => !a.vorhanden).length} / ${bericht.aussteller.filter((a) => a.vorhanden).length}` },
            ]}
          />
          {bericht.schau?.test && <Hinweis ton="warnung">Testschau: Alle Aussteller entstehen als Test-Aussteller.</Hinweis>}
          {art === "meldungen" && bericht.rassen.length > 0 && <Rassen bericht={bericht} waehlen={rasseWaehlen} laedt={pruefen.isPending} />}
          <Zeilen bericht={bericht} />
          {art === "meldungen" && (
            <Abschnitt titel="Optionen">
              <div className="flex flex-col gap-3">
                <Haken label="Meldungen gleich bestätigen (ohne Bestätigungsmail)" checked={bestaetigen} onChange={setBestaetigen} />
                <Haken label="Teilnahmebedingungen liegen unterschrieben vor" checked={zustimmung} onChange={setZustimmung} />
              </div>
            </Abschnitt>
          )}
        </>
      )}

      <Laeufe />
    </div>
  );
}

function Spalten({ art, tabelle, zuordnung, mitKopf, setMitKopf, setZuordnung, pruefen, laedt, gesperrt }: { art: Art; tabelle: string[][]; zuordnung: (ImportFeld | null)[]; mitKopf: boolean; setMitKopf: (v: boolean) => void; setZuordnung: (z: (ImportFeld | null)[]) => void; pruefen: () => void; laedt: boolean; gesperrt: boolean }) {
  const felder = art === "meldungen" ? [...AUSSTELLER_FELDER, ...TIER_FELDER] : AUSSTELLER_FELDER;
  const breite = Math.max(...tabelle.map((z) => z.length));
  const beispiel = tabelle.slice(mitKopf ? 1 : 0, (mitKopf ? 1 : 0) + 3);
  const setze = (i: number, f: ImportFeld | null) => setZuordnung(Array.from({ length: breite }, (_, k) => (k === i ? f : zuordnung[k] === f && f ? null : (zuordnung[k] ?? null))));
  return (
    <TabellenRahmen
      kopf={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <h2 className="text-[1.07rem] font-semibold">2. Spalten zuordnen</h2>
          <div className="flex flex-wrap items-center gap-4">
            <Haken label="Erste Zeile ist Überschrift" checked={mitKopf} onChange={setMitKopf} />
            <Knopf variante="primaer" laedt={laedt} disabled={gesperrt} onClick={pruefen}>
              Prüfen
            </Knopf>
          </div>
        </div>
      }
    >
      <table className="tabelle">
        <thead>
          <tr>
            {Array.from({ length: breite }, (_, i) => (
              <th key={i} className="min-w-40 align-top">
                {mitKopf && <span className="mb-1 block text-sm font-normal text-grau">{tabelle[0]?.[i] || `Spalte ${i + 1}`}</span>}
                <Auswahl kompakt aria-label={`Feld für Spalte ${i + 1}`} value={zuordnung[i] ?? ""} onChange={(e) => setze(i, (e.target.value || null) as ImportFeld | null)}>
                  <option value="">nicht übernehmen</option>
                  {felder.map((f) => (
                    <option key={f} value={f}>
                      {IMPORT_FELDER[f]}
                    </option>
                  ))}
                </Auswahl>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {beispiel.map((z, k) => (
            <tr key={k}>
              {Array.from({ length: breite }, (_, i) => (
                <td key={i} className={zuordnung[i] ? "" : "text-grau"}>
                  {z[i]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TabellenRahmen>
  );
}

function Rassen({ bericht, waehlen, laedt }: { bericht: Bericht; waehlen: (schluessel: string, id: number | null) => void; laedt: boolean }) {
  const QUELLE = { gewaehlt: "gewählt", gelernt: "wie beim letzten Import", genau: "genau gefunden" } as const;
  return (
    <TabellenRahmen kopf={<h2 className="text-[1.07rem] font-semibold">3. Rassen und Farbenschläge</h2>}>
      <table className="tabelle">
        <thead>
          <tr>
            <th>In der Datei</th>
            <th className="text-right">Tiere</th>
            <th>Im Verzeichnis</th>
          </tr>
        </thead>
        <tbody>
          {[...bericht.rassen]
            .sort((a, b) => Number(a.farbenschlagId != null) - Number(b.farbenschlagId != null))
            .map((r) => (
              <tr key={r.schluessel}>
                <td>
                  {r.rasse}
                  {r.farbenschlag && <span className="text-grau">, {r.farbenschlag}</span>}
                </td>
                <td className="text-right tabular-nums">{r.anzahl}</td>
                <td>
                  <div className="flex flex-wrap items-center gap-2">
                    <Auswahl kompakt aria-label={`Zuordnung für ${r.rasse} ${r.farbenschlag}`} disabled={laedt} value={r.farbenschlagId ?? ""} onChange={(e) => waehlen(r.schluessel, e.target.value ? Number(e.target.value) : null)}>
                      <option value="">– auslassen –</option>
                      {r.farbenschlagId != null && !r.vorschlaege.some((v) => v.id === r.farbenschlagId) && <option value={r.farbenschlagId}>(zugeordnet)</option>}
                      {r.vorschlaege.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.rasse}, {v.farbenschlag}
                        </option>
                      ))}
                    </Auswahl>
                    {r.quelle ? <Marke ton="ok">{QUELLE[r.quelle]}</Marke> : <Marke ton="warnung">{r.vorschlaege.length ? "bitte wählen" : "kein Vorschlag"}</Marke>}
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </TabellenRahmen>
  );
}

function Zeilen({ bericht }: { bericht: Bericht }) {
  const [alle, setAlle] = useState(false);
  const auffaellig = bericht.zeilen.filter((z) => z.fehler.length || z.hinweise.length);
  const liste = (alle ? bericht.zeilen : auffaellig).slice(0, ZEILEN_ANZEIGE);
  const gesamt = alle ? bericht.zeilen.length : auffaellig.length;
  return (
    <TabellenRahmen
      kopf={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <h2 className="text-[1.07rem] font-semibold">{alle ? "Alle Zeilen" : "Zeilen mit Fehlern oder Hinweisen"}</h2>
          <Knopf variante="leise" onClick={() => setAlle(!alle)}>
            {alle ? "Nur auffällige zeigen" : "Alle zeigen"}
          </Knopf>
        </div>
      }
      fuss={gesamt > ZEILEN_ANZEIGE ? `Die ersten ${ZEILEN_ANZEIGE} von ${gesamt} Zeilen.` : undefined}
    >
      {liste.length === 0 ? (
        <div className="p-4">
          <Leer titel="Keine Auffälligkeiten" />
        </div>
      ) : (
        <table className="tabelle">
          <thead>
            <tr>
              <th className="text-right">Zeile</th>
              <th>Aussteller</th>
              <th>Tier</th>
              <th>Fehler und Hinweise</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((z) => (
              <tr key={z.nr}>
                <td className="text-right tabular-nums">{z.nr}</td>
                <td>
                  {[z.aussteller.vorname, z.aussteller.nachname].filter(Boolean).join(" ") || "–"}
                  <span className="block text-sm text-grau">{[z.aussteller.plz, z.aussteller.ort].filter(Boolean).join(" ")}</span>
                </td>
                <td>{z.tier ? [`${z.tier.rasse} ${z.tier.farbenschlag}`.trim(), z.tier.geschlecht, z.tier.alter].filter(Boolean).join(" · ") : "–"}</td>
                <td>
                  {z.fehler.map((f) => (
                    <span key={f} className="block font-semibold text-kamm">
                      {f}
                    </span>
                  ))}
                  {z.hinweise.map((h) => (
                    <span key={h} className="block text-sm text-grau">
                      {h}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TabellenRahmen>
  );
}

function Laeufe() {
  const q = trpc.datenimport.laeufe.useQuery();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const zurueck = trpc.datenimport.zuruecknehmen.useMutation({
    onSuccess: async (r) => {
      meldung(`Zurückgenommen: ${r.meldungen} Meldungen, ${r.aussteller} Aussteller.`);
      await utils.datenimport.laeufe.invalidate();
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  if (q.error) return <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />;
  if (!q.data) return <Laden />;
  if (!q.data.length) return null;
  return (
    <TabellenRahmen kopf={<h2 className="text-[1.07rem] font-semibold">Frühere Importe</h2>}>
      <table className="tabelle">
        <thead>
          <tr>
            <th>Zeitpunkt</th>
            <th>Datei</th>
            <th>Ziel</th>
            <th className="text-right">Aussteller neu</th>
            <th className="text-right">Meldungen</th>
            <th className="text-right">Tiere</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {q.data.map((l) => (
            <tr key={l.id}>
              <td>{datumZeit(l.createdAt)}</td>
              <td>{l.dateiname || "–"}</td>
              <td>{l.art === "meldungen" ? (l.schau ?? "Schau gelöscht") : "Ausstellerverzeichnis"}</td>
              <td className="text-right tabular-nums">{l.anzahlAussteller}</td>
              <td className="text-right tabular-nums">{l.anzahlMeldungen}</td>
              <td className="text-right tabular-nums">{l.anzahlTiere}</td>
              <td className="text-right">
                {l.zurueckgenommenAm ? (
                  <Marke>zurückgenommen</Marke>
                ) : (
                  <Knopf
                    variante="gefahr"
                    laedt={zurueck.isPending && zurueck.variables?.id === l.id}
                    onClick={async () => {
                      if (await bestaetige({ titel: "Import zurücknehmen?", text: "Die Meldungen und neu angelegten Aussteller dieses Imports werden gelöscht – nur, solange nichts weiter damit geschehen ist.", knopf: "Zurücknehmen", gefahr: true })) zurueck.mutate({ id: l.id });
                    }}
                  >
                    Zurücknehmen
                  </Knopf>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabellenRahmen>
  );
}
