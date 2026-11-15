import { formatEuro } from "@schau/domain";
import { useState } from "react";
import { Link } from "react-router-dom";
import { datum, fehlerText } from "../lib";
import { useSchauId } from "../rahmen";
import { trpc } from "../trpc";
import { Abschnitt, Eingabe, FehlerAnzeige, Feld, Haken, Hinweis, Knopf, Laden, Leer, Marke, SEITE, Seitenkopf, TabellenRahmen, useFrage, useMeldung } from "../ui";

const STATUS = { offen: "offen", gebucht: "gebucht", verworfen: "verworfen" } as const;

/**
 * SEPA-Lastschrift der Schau (Entscheidung 018): offenes Meldegeld von Ausstellern mit gültigem Mandat einziehen –
 * Datei erstellen und herunterladen, nach dem Eingang buchen, Rücklastschriften einzeln. Nur Administratoren.
 */
export function Lastschrift() {
  const schauId = useSchauId();
  const [faellig, setFaellig] = useState<string | undefined>(undefined);
  const [vorab, setVorab] = useState(true);
  const q = trpc.lastschrift.uebersicht.useQuery({ schauId, faelligAm: faellig }, { placeholderData: (alt) => alt });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige, eingabe } = useFrage();
  const neu = () => utils.lastschrift.uebersicht.invalidate({ schauId });
  const fehler = (e: unknown) => meldung(fehlerText(e), "fehler");
  const erstellen = trpc.lastschrift.erstellen.useMutation({ onError: fehler });
  const buchen = trpc.lastschrift.buchen.useMutation({ onError: fehler });
  const verwerfen = trpc.lastschrift.verwerfen.useMutation({ onError: fehler });
  const rueck = trpc.lastschrift.ruecklastschrift.useMutation({ onError: fehler });

  if (q.error) return <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />;
  if (!q.data) return <Laden />;
  const d = q.data;
  const summe = d.vorschau.reduce((n, p) => n + p.betragCent, 0);

  const herunterladen = async () => {
    try {
      const r = await utils.lastschrift.datei.fetch({ schauId });
      const url = URL.createObjectURL(new Blob([r.xml], { type: "application/xml" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.dateiname;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      fehler(e);
    }
  };

  return (
    <div className={SEITE}>
      <Seitenkopf
        titel="Lastschrift"
        hilfe="sepa-lastschrift"
        aktionen={
          !d.offen &&
          d.vorschau.length > 0 && (
            <Knopf
              variante="primaer"
              disabled={!!d.sperre}
              laedt={erstellen.isPending}
              onClick={async () => {
                const r = await erstellen.mutateAsync({ schauId, faelligAm: d.faelligAm, vorabankuendigung: vorab }).catch(() => null);
                if (!r) return;
                await neu();
                meldung(`Lastschriftdatei mit ${r.anzahl} Posten erstellt${r.angekuendigt ? `, ${r.angekuendigt} Vorabankündigungen verschickt` : ""}.`);
              }}
            >
              Lastschriftdatei erstellen
            </Knopf>
          )
        }
      />
      {d.sperre && (
        <Hinweis ton="warnung">
          {d.sperre} {d.sperre.includes("Gläubiger") ? <Link to="/verein#lastschrift">Zur Gläubiger-ID</Link> : <Link to={`/schau/${schauId}/einstellungen`}>Zu den Einstellungen</Link>}
        </Hinweis>
      )}

      {d.offen ? (
        <Abschnitt titel="Offene Lastschriftdatei">
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1">
              {d.offen.nachrichtId}
              {(() => {
                const l = d.laeufe.find((x) => x.nachrichtId === d.offen!.nachrichtId);
                return l ? ` · fällig ${datum(l.faelligAm)} · ${l.anzahl} Posten · ${formatEuro(l.summeCent)}` : "";
              })()}
            </span>
            <Knopf onClick={() => void herunterladen()}>Datei herunterladen</Knopf>
            <Knopf
              variante="primaer"
              laedt={buchen.isPending}
              onClick={async () => {
                if (!(await bestaetige({ titel: "Lastschriften buchen?", text: "Erst buchen, wenn die Bank eingezogen hat (Kontoauszug). Jeder Posten wird als Zahlung „Lastschrift“ zum Fälligkeitstag gebucht.", knopf: "Buchen" }))) return;
                if (await buchen.mutateAsync({ schauId, nachrichtId: d.offen!.nachrichtId }).catch(() => null)) await neu();
              }}
            >
              Eingang buchen
            </Knopf>
            <Knopf
              variante="gefahr"
              onClick={async () => {
                const grund = await eingabe({ titel: "Lastschriftdatei verwerfen", feld: "Grund", mindestens: 3 });
                if (grund && (await verwerfen.mutateAsync({ schauId, nachrichtId: d.offen!.nachrichtId, grund }).catch(() => null))) await neu();
              }}
            >
              Verwerfen
            </Knopf>
          </div>
        </Abschnitt>
      ) : (
        <TabellenRahmen
          kopf={
            <div className="flex w-full flex-wrap items-end justify-between gap-3">
              <h2 className="text-[1.07rem] font-semibold">Jetzt einziehbar</h2>
              <div className="flex flex-wrap items-end gap-4">
                <Feld label="Fällig am">{(id) => <Eingabe id={id} type="date" value={d.faelligAm} min={d.frueheste} onChange={(e) => setFaellig(e.target.value || undefined)} />}</Feld>
                <Haken label="Vorabankündigung per E-Mail" checked={vorab} onChange={setVorab} />
              </div>
            </div>
          }
          fuss={d.vorschau.length ? `${d.vorschau.length} Posten · ${formatEuro(summe)}` : undefined}
        >
          {d.vorschau.length === 0 ? (
            <div className="p-4">
              <Leer titel="Kein offenes Meldegeld bei Ausstellern mit gültigem Mandat" />
            </div>
          ) : (
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Aussteller</th>
                  <th>Mandat</th>
                  <th>Konto</th>
                  <th className="text-right">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {d.vorschau.map((p) => (
                  <tr key={p.meldungId}>
                    <td>{p.name}</td>
                    <td>{p.mandatsreferenz}</td>
                    <td>{p.iban}</td>
                    <td className="text-right tabular-nums">{formatEuro(p.betragCent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabellenRahmen>
      )}

      {d.ohneGueltigesMandat.length > 0 && (
        <Hinweis ton="warnung">
          Mandat ungültig, Meldegeld offen: {d.ohneGueltigesMandat.map((x) => `${x.name} (${x.grund.replace(/\.$/, "")}, ${formatEuro(x.offenCent)})`).join("; ")}.
        </Hinweis>
      )}

      {d.laeufe.filter((l) => l.status !== "offen").length > 0 && (
        <TabellenRahmen kopf={<h2 className="text-[1.07rem] font-semibold">Frühere Lastschriften</h2>}>
          <table className="tabelle">
            <thead>
              <tr>
                <th>Datei</th>
                <th>Fällig</th>
                <th>Status</th>
                <th>Posten</th>
              </tr>
            </thead>
            <tbody>
              {d.laeufe
                .filter((l) => l.status !== "offen")
                .map((l) => (
                  <tr key={l.id}>
                    <td>{l.nachrichtId}</td>
                    <td>{datum(l.faelligAm)}</td>
                    <td>
                      <Marke ton={l.status === "gebucht" ? "ok" : "neutral"}>{STATUS[l.status]}</Marke>
                    </td>
                    <td>
                      <ul className="flex flex-col gap-1">
                        {l.posten.map((p) => (
                          <li key={p.meldungId} className="flex flex-wrap items-center gap-2">
                            <span>
                              {p.name} · {formatEuro(p.betragCent)}
                            </span>
                            {p.zurueck ? (
                              <Marke ton="warnung">zurückgebucht</Marke>
                            ) : (
                              l.status === "gebucht" && (
                                <Knopf
                                  variante="leise"
                                  onClick={async () => {
                                    const grund = await eingabe({ titel: `Rücklastschrift ${p.name}`, feld: "Grund laut Bank", mindestens: 3 });
                                    if (grund && (await rueck.mutateAsync({ schauId, laufId: l.id, meldungId: p.meldungId, grund }).catch(() => null))) await neu();
                                  }}
                                >
                                  Rücklastschrift
                                </Knopf>
                              )
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TabellenRahmen>
      )}
    </div>
  );
}
