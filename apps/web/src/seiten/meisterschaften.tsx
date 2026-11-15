import { Link } from "react-router-dom";
import { useSchauId } from "../rahmen";
import { trpc } from "../trpc";
import { FehlerAnzeige, KnopfLink, Laden, Leer, Marke, SEITE, Seitenkopf, TabellenRahmen } from "../ui";

/**
 * Ergebnisse der Meisterschaften einer Schau: je Meisterschaft und Rasse/Farbenschlag die Rangfolge mit den gewerteten
 * Tieren. Wird aus Katalog und Bewertung jedes Mal neu gerechnet; eingerichtet in den Einstellungen.
 */
export function Meisterschaften() {
  const schauId = useSchauId();
  const q = trpc.meisterschaft.ergebnisse.useQuery({ schauId });
  return (
    <div className={SEITE}>
      <Seitenkopf
        titel="Meisterschaften"
        hilfe="meisterschaften"
        aktionen={
          <>
            <KnopfLink href={`/datei/${schauId}/meisterschaften.pdf`} target="_blank" rel="noreferrer">
              Aushang (PDF)
            </KnopfLink>
            <KnopfLink href={`/datei/${schauId}/meisterschaften.csv`}>Tabelle (CSV)</KnopfLink>
          </>
        }
      />
      {q.error ? (
        <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />
      ) : !q.data ? (
        <Laden />
      ) : q.data.length === 0 ? (
        <Leer titel="Keine Meisterschaft eingerichtet">
          <Link to={`/schau/${schauId}/einstellungen#meisterschaften`}>In den Einstellungen einrichten</Link>
        </Leer>
      ) : (
        q.data.map((e, i) => (
          <section key={i} className="flex flex-col gap-3">
            <h2 className="text-[1.15rem] font-semibold">{e.regel.name}</h2>
            {e.gruppen.length === 0 && <Leer titel="Noch keine bewerteten Tiere" />}
            {e.gruppen.map((g, j) => (
              <TabellenRahmen
                key={j}
                kopf={
                  <>
                    <h3 className="mr-auto font-semibold text-tinte">
                      {e.regel.art === "verein" ? "Vereine" : [g.sparte, g.rasse, g.farbenschlag].filter(Boolean).join(" · ")}
                      {g.jugend && <span className="font-normal text-grau"> (Jugend)</span>}
                    </h3>
                    {g.hinweis && <Marke ton="warnung">{g.hinweis}</Marke>}
                  </>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-linie text-left text-xs text-grau">
                        <th className="px-4 py-2 text-right font-semibold">Platz</th>
                        <th className="px-2 py-2 font-semibold">{e.regel.art === "verein" ? "Verein" : "Aussteller"}</th>
                        <th className="px-2 py-2 font-semibold">Gewertete Tiere (Kat.-Nr.: Punkte)</th>
                        <th className="px-2 py-2 text-right font-semibold">Summe</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-linie">
                      {g.kandidaten.map((k) => (
                        <tr key={`${k.ausstellerId}-${k.name}`}>
                          <td className="px-4 py-2 text-right tabular-nums">{k.rang != null ? `${k.rang}.` : ""}</td>
                          <td className="px-2 py-2">{k.name}</td>
                          <td className="px-2 py-2 tabular-nums text-grau">{k.gezaehlt.map((t) => `${t.katalogNr ?? "–"}: ${t.punkte}`).join(", ")}</td>
                          <td className="px-2 py-2 text-right font-semibold tabular-nums">{k.summe}</td>
                          <td className="px-4 py-2">{k.titel ? <Marke ton="ok">Titel</Marke> : <span className="text-xs text-grau">{k.grund}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabellenRahmen>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
