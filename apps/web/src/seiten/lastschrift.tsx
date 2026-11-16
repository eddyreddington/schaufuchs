import { formatEuro, serverText } from "@schau/domain";
import { useState } from "react";
import { Link } from "react-router-dom";
import { datum, fehlerText } from "../lib";
import { useSchauId } from "../rahmen";
import { useOberflaeche, useSprache } from "../sprache";
import { trpc } from "../trpc";
import { Abschnitt, Eingabe, FehlerAnzeige, Feld, Haken, Hinweis, Knopf, Laden, Leer, Marke, SEITE, Seitenkopf, TabellenRahmen, useFrage, useMeldung } from "../ui";

/**
 * SEPA-Lastschrift der Schau (Entscheidung 018): offenes Meldegeld von Ausstellern mit gültigem Mandat einziehen –
 * Datei erstellen und herunterladen, nach dem Eingang buchen, Rücklastschriften einzeln. Nur Administratoren.
 */
export function Lastschrift() {
  const schauId = useSchauId();
  const t = useOberflaeche();
  const tl = t.kasse.lastschrift;
  const sprache = useSprache();
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
        titel={tl.titel}
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
                meldung(r.angekuendigt ? tl.erstelltAngekuendigt(r.anzahl, r.angekuendigt) : tl.erstellt(r.anzahl));
              }}
            >
              {tl.erstellen}
            </Knopf>
          )
        }
      />
      {d.sperre && (
        <Hinweis ton="warnung">
          {serverText(d.sperre, sprache)}{" "}
          {/* bleibt deutsch: Vergleich mit der deutschen Meldung des Servers (nicht angezeigt) */}
          {d.sperre.includes("Gläubiger") ? <Link to="/verein#lastschrift">{tl.zurGlaeubigerId}</Link> : <Link to={`/schau/${schauId}/einstellungen`}>{tl.zuDenEinstellungen}</Link>}
        </Hinweis>
      )}

      {d.offen ? (
        <Abschnitt titel={tl.offeneDatei}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1">
              {d.offen.nachrichtId}
              {(() => {
                const l = d.laeufe.find((x) => x.nachrichtId === d.offen!.nachrichtId);
                return l ? tl.laufInfo(datum(l.faelligAm), l.anzahl, formatEuro(l.summeCent)) : "";
              })()}
            </span>
            <Knopf onClick={() => void herunterladen()}>{tl.herunterladen}</Knopf>
            <Knopf
              variante="primaer"
              laedt={buchen.isPending}
              onClick={async () => {
                if (!(await bestaetige({ titel: tl.buchenTitel, text: tl.buchenText, knopf: t.kasse.buchen }))) return;
                if (await buchen.mutateAsync({ schauId, nachrichtId: d.offen!.nachrichtId }).catch(() => null)) await neu();
              }}
            >
              {tl.eingangBuchen}
            </Knopf>
            <Knopf
              variante="gefahr"
              onClick={async () => {
                const grund = await eingabe({ titel: tl.verwerfenTitel, feld: t.kasse.grund, mindestens: 3 });
                if (grund && (await verwerfen.mutateAsync({ schauId, nachrichtId: d.offen!.nachrichtId, grund }).catch(() => null))) await neu();
              }}
            >
              {tl.verwerfen}
            </Knopf>
          </div>
        </Abschnitt>
      ) : (
        <TabellenRahmen
          kopf={
            <div className="flex w-full flex-wrap items-end justify-between gap-3">
              <h2 className="text-[1.07rem] font-semibold">{tl.einziehbar}</h2>
              <div className="flex flex-wrap items-end gap-4">
                <Feld label={tl.faelligAm}>{(id) => <Eingabe id={id} type="date" value={d.faelligAm} min={d.frueheste} onChange={(e) => setFaellig(e.target.value || undefined)} />}</Feld>
                <Haken label={tl.vorabankuendigung} checked={vorab} onChange={setVorab} />
              </div>
            </div>
          }
          fuss={d.vorschau.length ? tl.posten(d.vorschau.length, formatEuro(summe)) : undefined}
        >
          {d.vorschau.length === 0 ? (
            <div className="p-4">
              <Leer titel={tl.nichtsOffen} />
            </div>
          ) : (
            <table className="tabelle">
              <thead>
                <tr>
                  <th>{t.allgemein.aussteller}</th>
                  <th>{tl.mandat}</th>
                  <th>{tl.konto}</th>
                  <th className="text-right">{t.allgemein.betrag}</th>
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
          {tl.mandatUngueltig(d.ohneGueltigesMandat.map((x) => `${x.name} (${serverText(x.grund, sprache).replace(/\.$/, "")}, ${formatEuro(x.offenCent)})`).join("; "))}
        </Hinweis>
      )}

      {d.laeufe.filter((l) => l.status !== "offen").length > 0 && (
        <TabellenRahmen kopf={<h2 className="text-[1.07rem] font-semibold">{tl.frueher}</h2>}>
          <table className="tabelle">
            <thead>
              <tr>
                <th>{tl.datei}</th>
                <th>{tl.faellig}</th>
                <th>{t.allgemein.status}</th>
                <th>{tl.postenSpalte}</th>
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
                      <Marke ton={l.status === "gebucht" ? "ok" : "neutral"}>{tl.status[l.status]}</Marke>
                    </td>
                    <td>
                      <ul className="flex flex-col gap-1">
                        {l.posten.map((p) => (
                          <li key={p.meldungId} className="flex flex-wrap items-center gap-2">
                            <span>
                              {p.name} · {formatEuro(p.betragCent)}
                            </span>
                            {p.zurueck ? (
                              <Marke ton="warnung">{tl.zurueckgebucht}</Marke>
                            ) : (
                              l.status === "gebucht" && (
                                <Knopf
                                  variante="leise"
                                  onClick={async () => {
                                    const grund = await eingabe({ titel: tl.ruecklastschriftTitel(p.name), feld: tl.grundLautBank, mindestens: 3 });
                                    if (grund && (await rueck.mutateAsync({ schauId, laufId: l.id, meldungId: p.meldungId, grund }).catch(() => null))) await neu();
                                  }}
                                >
                                  {tl.ruecklastschrift}
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
