import { AUSSTELLER_FELDER, type ImportFeld, serverText, TIER_FELDER } from "@schau/domain";
import { useRef, useState } from "react";
import { datumZeit, fehlerText } from "../lib";
import { useOberflaeche, useSprache } from "../sprache";
import { ot } from "../sprache-jetzt";
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
    r.onerror = () => reject(new Error(ot().preisrichter.import.dateiNichtLesbar));
    r.readAsDataURL(datei);
  });
}

/**
 * Import aus Altprogrammen (/import, Entscheidung 015): Datei wählen, Spalten zuordnen, prüfen, Rassen zuordnen,
 * übernehmen; frühere Importe zurücknehmen. Erklärungen im Handbuch („Import aus anderen Programmen“).
 */
export function ImportSeite() {
  const t = useOberflaeche();
  const tx = t.preisrichter.import;
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
      meldung(art === "meldungen" ? tx.uebernommen(r.meldungen, r.tiere, r.ausgelassen) : tx.ausstellerAngelegt(r.aussteller));
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
    if (d.size > MAX_BYTES) return meldung(tx.zuGross, "fehler");
    const r = await lesen.mutateAsync({ dateiname: d.name, base64: await alsBase64(d) }).catch(() => null);
    if (!r) return;
    setDateiname(d.name);
    setTabelle(r.tabelle);
    setZuordnung(r.zuordnung);
    verwerfen();
    setRassen({});
    if (r.abgeschnitten) meldung(tx.spaltenAbgeschnitten, "warnung");
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
        titel={tx.titel}
        hilfe="import"
        aktionen={
          bericht && (
            <Knopf variante="primaer" disabled={!bereit || pruefen.isPending} laedt={uebernehmen.isPending} onClick={() => uebernehmen.mutate({ ...eingabe(), bestaetigen, zustimmung })}>
              {art === "meldungen" ? tx.zeilenUebernehmen(gut) : tx.ausstellerUebernehmen}
            </Knopf>
          )
        }
      />

      <Abschnitt titel={tx.datei}>
        <div className="flex flex-col gap-4">
          <Segmente<Art>
            label={tx.wasImportieren}
            wert={art}
            onChange={(a) => {
              setArt(a);
              verwerfen();
            }}
            optionen={[
              { wert: "meldungen", label: tx.artMeldungen },
              { wert: "aussteller", label: tx.artAussteller },
            ]}
          />
          {art === "meldungen" && (
            <Feld label={tx.schau} className="max-w-md">
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
                  <option value="">{tx.bitteWaehlen}</option>
                  {offeneSchauen.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Auswahl>
              )}
            </Feld>
          )}
          <Feld label={tx.dateiLabel} className="max-w-md">
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
              { label: tx.zeilen, wert: bericht.zeilen.length },
              { label: tx.uebernehmbar, wert: gut, ton: gut ? "ok" : "warnung" },
              { label: tx.mitFehlern, wert: bericht.zeilen.length - gut, ton: bericht.zeilen.length - gut ? "fehler" : undefined },
              { label: tx.ausstellerNeuVorhanden, wert: `${bericht.aussteller.filter((a) => !a.vorhanden).length} / ${bericht.aussteller.filter((a) => a.vorhanden).length}` },
            ]}
          />
          {bericht.schau?.test && <Hinweis ton="warnung">{tx.testschau}</Hinweis>}
          {art === "meldungen" && bericht.rassen.length > 0 && <Rassen bericht={bericht} waehlen={rasseWaehlen} laedt={pruefen.isPending} />}
          <Zeilen bericht={bericht} />
          {art === "meldungen" && (
            <Abschnitt titel={tx.optionen}>
              <div className="flex flex-col gap-3">
                <Haken label={tx.gleichBestaetigen} checked={bestaetigen} onChange={setBestaetigen} />
                <Haken label={tx.zustimmung} checked={zustimmung} onChange={setZustimmung} />
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
  const tx = useOberflaeche().preisrichter.import.spalten;
  const felder = art === "meldungen" ? [...AUSSTELLER_FELDER, ...TIER_FELDER] : AUSSTELLER_FELDER;
  const breite = Math.max(...tabelle.map((z) => z.length));
  const beispiel = tabelle.slice(mitKopf ? 1 : 0, (mitKopf ? 1 : 0) + 3);
  const setze = (i: number, f: ImportFeld | null) => setZuordnung(Array.from({ length: breite }, (_, k) => (k === i ? f : zuordnung[k] === f && f ? null : (zuordnung[k] ?? null))));
  return (
    <TabellenRahmen
      kopf={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <h2 className="text-[1.07rem] font-semibold">{tx.titel}</h2>
          <div className="flex flex-wrap items-center gap-4">
            <Haken label={tx.ersteZeile} checked={mitKopf} onChange={setMitKopf} />
            <Knopf variante="primaer" laedt={laedt} disabled={gesperrt} onClick={pruefen}>
              {tx.pruefen}
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
                {mitKopf && <span className="mb-1 block text-sm font-normal text-grau">{tabelle[0]?.[i] || tx.spalte(i + 1)}</span>}
                <Auswahl kompakt aria-label={tx.feldFuer(i + 1)} value={zuordnung[i] ?? ""} onChange={(e) => setze(i, (e.target.value || null) as ImportFeld | null)}>
                  <option value="">{tx.nicht}</option>
                  {felder.map((f) => (
                    <option key={f} value={f}>
                      {tx.felder[f]}
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
  const t = useOberflaeche();
  const tx = t.preisrichter.import.rassen;
  return (
    <TabellenRahmen kopf={<h2 className="text-[1.07rem] font-semibold">{tx.titel}</h2>}>
      <table className="tabelle">
        <thead>
          <tr>
            <th>{tx.inDatei}</th>
            <th className="text-right">{t.allgemein.tiere}</th>
            <th>{tx.imVerzeichnis}</th>
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
                    <Auswahl kompakt aria-label={tx.zuordnungFuer(r.rasse, r.farbenschlag)} disabled={laedt} value={r.farbenschlagId ?? ""} onChange={(e) => waehlen(r.schluessel, e.target.value ? Number(e.target.value) : null)}>
                      <option value="">{tx.auslassen}</option>
                      {r.farbenschlagId != null && !r.vorschlaege.some((v) => v.id === r.farbenschlagId) && <option value={r.farbenschlagId}>{tx.zugeordnet}</option>}
                      {r.vorschlaege.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.rasse}, {v.farbenschlag}
                        </option>
                      ))}
                    </Auswahl>
                    {r.quelle ? <Marke ton="ok">{tx.quelle[r.quelle]}</Marke> : <Marke ton="warnung">{r.vorschlaege.length ? tx.bitteWaehlen : tx.keinVorschlag}</Marke>}
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
  const t = useOberflaeche();
  const tx = t.preisrichter.import.zeilenListe;
  const sprache = useSprache();
  const [alle, setAlle] = useState(false);
  const auffaellig = bericht.zeilen.filter((z) => z.fehler.length || z.hinweise.length);
  const liste = (alle ? bericht.zeilen : auffaellig).slice(0, ZEILEN_ANZEIGE);
  const gesamt = alle ? bericht.zeilen.length : auffaellig.length;
  return (
    <TabellenRahmen
      kopf={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <h2 className="text-[1.07rem] font-semibold">{alle ? tx.alle : tx.auffaellige}</h2>
          <Knopf variante="leise" onClick={() => setAlle(!alle)}>
            {alle ? tx.nurAuffaellige : tx.alleZeigen}
          </Knopf>
        </div>
      }
      fuss={gesamt > ZEILEN_ANZEIGE ? tx.ersten(ZEILEN_ANZEIGE, gesamt) : undefined}
    >
      {liste.length === 0 ? (
        <div className="p-4">
          <Leer titel={tx.keine} />
        </div>
      ) : (
        <table className="tabelle">
          <thead>
            <tr>
              <th className="text-right">{tx.zeile}</th>
              <th>{t.allgemein.aussteller}</th>
              <th>{t.allgemein.tier}</th>
              <th>{tx.fehlerHinweise}</th>
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
                      {serverText(f, sprache)}
                    </span>
                  ))}
                  {z.hinweise.map((h) => (
                    <span key={h} className="block text-sm text-grau">
                      {serverText(h, sprache)}
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
  const t = useOberflaeche();
  const tx = t.preisrichter.import.laeufe;
  const q = trpc.datenimport.laeufe.useQuery();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const zurueck = trpc.datenimport.zuruecknehmen.useMutation({
    onSuccess: async (r) => {
      meldung(tx.zurueckgenommen(r.meldungen, r.aussteller));
      await utils.datenimport.laeufe.invalidate();
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  if (q.error) return <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />;
  if (!q.data) return <Laden />;
  if (!q.data.length) return null;
  return (
    <TabellenRahmen kopf={<h2 className="text-[1.07rem] font-semibold">{tx.titel}</h2>}>
      <table className="tabelle">
        <thead>
          <tr>
            <th>{tx.zeitpunkt}</th>
            <th>{tx.datei}</th>
            <th>{tx.ziel}</th>
            <th className="text-right">{tx.ausstellerNeu}</th>
            <th className="text-right">{tx.meldungen}</th>
            <th className="text-right">{t.allgemein.tiere}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {q.data.map((l) => (
            <tr key={l.id}>
              <td>{datumZeit(l.createdAt)}</td>
              <td>{l.dateiname || "–"}</td>
              <td>{l.art === "meldungen" ? (l.schau ?? tx.schauGeloescht) : tx.verzeichnis}</td>
              <td className="text-right tabular-nums">{l.anzahlAussteller}</td>
              <td className="text-right tabular-nums">{l.anzahlMeldungen}</td>
              <td className="text-right tabular-nums">{l.anzahlTiere}</td>
              <td className="text-right">
                {l.zurueckgenommenAm ? (
                  <Marke>{tx.marke}</Marke>
                ) : (
                  <Knopf
                    variante="gefahr"
                    laedt={zurueck.isPending && zurueck.variables?.id === l.id}
                    onClick={async () => {
                      if (await bestaetige({ titel: tx.frage, text: tx.frageText, knopf: tx.zuruecknehmen, gefahr: true })) zurueck.mutate({ id: l.id });
                    }}
                  >
                    {tx.zuruecknehmen}
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
