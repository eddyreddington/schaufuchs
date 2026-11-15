import { SPENDE_WEG_LABEL } from "@schau/domain";
import { Link } from "react-router-dom";
import { datum, fehlerText, formatEuro } from "../lib";
import { useSchauId } from "../rahmen";
import { useIstAdmin } from "../rolle";
import { trpc, type Ausgabe } from "../trpc";
import { FehlerAnzeige, Hinweis, Kennzahlen, Knopf, Laden, Leer, Marke, SEITE, Seitenkopf, TabellenRahmen, useFrage, useMeldung } from "../ui";
import { SpendeErfassen } from "./spende-erfassen";

type Zeile = Ausgabe["spenden"]["liste"][number];

/**
 * Spenden einer Schau: Geld (bar, Überweisung, mit dem Meldegeld) und Sachen, mit Quittung, Zuwendungsbestätigung und
 * Storno. Barspenden stehen zugleich im Kassenbuch. Das Spenderverzeichnis liegt unter /spender.
 */
export function Spenden() {
  const schauId = useSchauId();
  const istAdmin = useIstAdmin();
  const q = trpc.spenden.liste.useQuery({ schauId });
  const steuer = trpc.spenden.steuer.useQuery(undefined, { enabled: istAdmin });
  const gueltig = (q.data ?? []).filter((z) => !z.spende.storniertAm);
  const summe = (f: (z: Zeile) => boolean) => gueltig.filter(f).reduce((n, z) => n + z.spende.betragCent, 0);
  return (
    <div className={SEITE}>
      <Seitenkopf
        titel="Spenden"
        unter={q.data ? `${gueltig.length} ${gueltig.length === 1 ? "Spende" : "Spenden"}` : undefined}
        hilfe="spenden"
        aktionen={
          istAdmin && (
            <Link to="/spender" className="text-sm font-semibold text-band no-underline hover:underline">
              Spenderverzeichnis
            </Link>
          )
        }
      />
      {istAdmin && steuer.data?.sperre && (
        <Hinweis ton="warnung">
          Zuwendungsbestätigungen sind gesperrt: {steuer.data.sperre}{" "}
          <Link to="/verein#steuer" className="font-semibold">
            Steuerliche Angaben
          </Link>
        </Hinweis>
      )}
      {q.error ? (
        <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />
      ) : !q.data ? (
        <Laden />
      ) : (
        <>
          <Kennzahlen
            spalten={3}
            werte={[
              { label: "Geldspenden", wert: formatEuro(summe((z) => z.spende.art === "geld")), zusatz: `davon bar ${formatEuro(summe((z) => z.spende.weg === "bar" && z.spende.art === "geld"))}` },
              { label: "Sachspenden (Wert)", wert: formatEuro(summe((z) => z.spende.art === "sache")) },
              { label: "Noch nicht eingegangen", wert: formatEuro(summe((z) => !z.datum)), zusatz: "mit dem Meldegeld zugesagt" },
            ]}
          />
          <SpendenTabelle schauId={schauId} zeilen={q.data} istAdmin={istAdmin} />
        </>
      )}
      <SpendeErfassen schauId={schauId} />
    </div>
  );
}

function SpendenTabelle({ schauId, zeilen, istAdmin }: { schauId: number; zeilen: Zeile[]; istAdmin: boolean }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe } = useFrage();
  const neu = async () => Promise.all([utils.spenden.liste.invalidate({ schauId }), utils.kasse.kassenbuch.invalidate({ schauId })]);
  const bestaetigen = trpc.spenden.bestaetigen.useMutation({
    onSuccess: async (r) => {
      await neu();
      meldung(`Zuwendungsbestätigung Nr. ${r.nummer} ausgestellt – zum Drucken in der Spalte „Bestätigung“.`);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const stornieren = trpc.spenden.stornieren.useMutation({
    onSuccess: async () => {
      await neu();
      meldung("Spende storniert.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const storno = async (z: Zeile) => {
    const grund = await eingabe({ titel: `Spende S-${z.spende.id} stornieren?`, text: z.spende.weg === "bar" ? "Das Geld geht aus der Kasse zurück; es entsteht ein Stornobeleg." : undefined, feld: "Grund", mindestens: 3, knopf: "Stornieren", gefahr: true });
    if (grund) stornieren.mutate({ spendeId: z.spende.id, grund });
  };
  if (!zeilen.length) return <Leer titel="Noch keine Spende" />;
  return (
    <TabellenRahmen>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-linie text-left text-xs text-grau">
              <th className="px-4 py-2 font-semibold">Beleg</th>
              <th className="px-2 py-2 font-semibold">Eingang</th>
              <th className="px-2 py-2 font-semibold">Spender</th>
              <th className="px-2 py-2 font-semibold">Art</th>
              <th className="px-2 py-2 text-right font-semibold">Betrag</th>
              <th className="px-2 py-2 font-semibold">Bestätigung</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-linie">
            {zeilen.map((z) => {
              const sp = z.spende;
              const name = z.spender.istFirma ? z.spender.nachname : `${z.spender.vorname} ${z.spender.nachname}`.trim();
              const storniert = !!sp.storniertAm;
              return (
                <tr key={sp.id} className={storniert ? "text-grau line-through" : undefined}>
                  <td className="px-4 py-2 tabular-nums">
                    {sp.weg === "meldung" ? (
                      <span className="text-grau">mit Meldung</span>
                    ) : (
                      <a href={`/datei/${schauId}/beleg/${storniert ? "spende-storno" : "spende"}/${sp.id}.pdf`} target="_blank" rel="noreferrer">
                        S-{sp.id}
                      </a>
                    )}
                  </td>
                  <td className="px-2 py-2 tabular-nums">{z.datum ? datum(z.datum) : <Marke ton="warnung">offen</Marke>}</td>
                  <td className="px-2 py-2">{name}</td>
                  <td className="px-2 py-2">
                    {sp.art === "sache" ? `Sache: ${sp.sache?.bezeichnung ?? ""}` : `Geld, ${SPENDE_WEG_LABEL[sp.weg]}`}
                    {sp.gegenleistung && <span className="block text-xs text-grau">mit Gegenleistung (Sponsoring)</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatEuro(sp.betragCent)}</td>
                  <td className="px-2 py-2">
                    {storniert ? (
                      <span className="no-underline">storniert</span>
                    ) : z.bestaetigungId ? (
                      <a href={`/datei/zuwendungsbestaetigung/${z.bestaetigungId}.pdf`} target="_blank" rel="noreferrer">
                        Nr. {z.bestaetigungNr}
                      </a>
                    ) : z.sperren.length ? (
                      <span className="text-xs text-grau" title={z.sperren.join(" ")}>
                        {z.sperren[0]}
                      </span>
                    ) : (
                      <span className="text-xs text-grau">möglich</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {istAdmin && !storniert && (
                      <span className="inline-flex gap-2">
                        {!z.bestaetigungId && !z.sperren.length && (
                          <Knopf variante="leise" laedt={bestaetigen.isPending && bestaetigen.variables?.spendeId === sp.id} onClick={() => bestaetigen.mutate({ spendeId: sp.id })}>
                            Bestätigen
                          </Knopf>
                        )}
                        {!z.bestaetigungId && (
                          <Knopf variante="leise" onClick={() => storno(z)}>
                            Stornieren
                          </Knopf>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TabellenRahmen>
  );
}
