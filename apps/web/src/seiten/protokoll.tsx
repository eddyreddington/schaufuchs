import { useEffect, useState } from "react";
import { datumZeit } from "../lib";
import { useSchauId } from "../rahmen";
import { trpc } from "../trpc";
import { Hinweis, Knopf, KnopfLink, Laden, Marke, SEITE as SEITENWURZEL, Seitenkopf, Suchfeld, TabellenRahmen } from "../ui";

const TABELLE: Record<string, string> = {
  schau: "Schau",
  meldung: "Meldung",
  zahlung: "Zahlung",
  katalogeintrag: "Katalog",
  bewertung: "Bewertung",
  preisvergabe: "Preis",
  verkauf: "Verkauf",
  auszahlung: "Abrechnung",
  gebuehr: "Gebühren",
  pr_einteilung: "Einteilung",
  kassenbewegung: "Kasse",
  kassenabschluss: "Tagesabschluss",
  gesundheit: "Gesundheit",
};

/** Einträge je Seite; die Suche läuft auf dem Server über das ganze Protokoll. */
const SEITE = 200;

function kurz(wert: unknown): string {
  if (wert == null) return "";
  if (typeof wert === "string" || typeof wert === "number") return String(wert);
  const t = JSON.stringify(wert);
  return t.length > 140 ? `${t.slice(0, 140)} …` : t;
}

export function Protokoll() {
  const schauId = useSchauId();
  const [q, setQ] = useState("");
  const [suche, setSuche] = useState("");
  const [pruefen, setPruefen] = useState(false);
  // Entprellt: erst nach einer kurzen Tipppause an den Server schicken.
  useEffect(() => {
    const t = setTimeout(() => setSuche(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const daten = trpc.schau.protokoll.useInfiniteQuery(
    { schauId, limit: SEITE, q: suche || undefined },
    { getNextPageParam: (seite) => (seite.length === SEITE ? seite[seite.length - 1]!.id : undefined) },
  );
  const zeilen = daten.data?.pages.flat() ?? [];
  return (
    <div className={SEITENWURZEL}>
      <Seitenkopf
        titel="Protokoll"
        hilfe="protokoll-und-prüfliste"
        aktionen={
          <>
            {!pruefen && <Knopf onClick={() => setPruefen(true)}>Unveränderbarkeit prüfen</Knopf>}
            <KnopfLink href={`/datei/${schauId}/protokoll.csv`}>Export (CSV)</KnopfLink>
            <KnopfLink href={`/datei/${schauId}/protokoll.json`} title="Zum Nachrechnen der Hash-Kette">Prüfexport (JSON)</KnopfLink>
          </>
        }
      />
      {pruefen && <KettenPruefung schauId={schauId} />}
      <TabellenRahmen
        kopf={<Suchfeld aria-label="Protokoll durchsuchen" placeholder="Katalognummer, Name …" value={q} onChange={(e) => setQ(e.target.value)} />}
        fuss={
          !daten.isLoading && zeilen.length > 0 ? (
            <>
              <span>
                {zeilen.length} Einträge{daten.hasNextPage ? ", weitere ältere vorhanden" : ""}
                {suche ? ` zu „${suche}“` : ""}
              </span>
              {daten.hasNextPage && (
                <Knopf variante="leise" laedt={daten.isFetchingNextPage} onClick={() => daten.fetchNextPage()}>
                  Ältere laden
                </Knopf>
              )}
            </>
          ) : undefined
        }
      >
        {daten.isLoading ? (
          <div className="px-4">
            <Laden />
          </div>
        ) : zeilen.length === 0 ? (
          <p className="px-4 py-10 text-center text-grau">Keine Einträge gefunden.</p>
        ) : (
          <table className="tabelle text-sm">
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Wer</th>
                <th>Bereich</th>
                <th>Aktion</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.id}>
                  <td className="whitespace-nowrap text-grau tabular-nums">{datumZeit(z.zeitpunkt)}</td>
                  <td className="text-tinte">{z.wer}</td>
                  <td>
                    <Marke>{TABELLE[z.tabelle] ?? z.tabelle}</Marke>
                  </td>
                  <td>{z.aktion}</td>
                  <td className="max-w-[50ch] break-words text-grau">
                    {z.alt != null && <span>vorher: {kurz(z.alt)} </span>}
                    {z.neu != null && <span>neu: {kurz(z.neu)}</span>}
                    {z.grund && <span className="block font-semibold text-tinte">Grund: {z.grund}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TabellenRahmen>
    </div>
  );
}

/** Prüft die Hash-Kette (erst nach Knopfdruck eingeblendet) und zeigt das Ergebnis. */
function KettenPruefung({ schauId }: { schauId: number }) {
  const p = trpc.schau.protokollPruefen.useQuery({ schauId });
  if (p.isLoading) return <Laden />;
  if (!p.data) return null;
  const vermerke = [
    p.data.ohneKette ? `${p.data.ohneKette} vor der Hash-Kette` : "",
    p.data.anonymisiert ? `${p.data.anonymisiert} anonymisiert (vermerkt)` : "",
    p.data.vermerkt ? `${p.data.vermerkt} ${p.data.vermerkt === 1 ? "Lücke" : "Lücken"} durch entfernten Demo-/Test-Verein (vermerkt)` : "",
  ].filter(Boolean);
  return p.data.fehler.length ? (
    <Hinweis ton="fehler">
      {p.data.fehler.length} Eintrag/Einträge stimmen nicht mit der Hash-Kette überein:{" "}
      {p.data.fehler.slice(0, 10).map((f) => `Nr. ${f.id} (${f.grund})`).join(", ")}. Bitte den Administrator informieren.
    </Hinweis>
  ) : (
    <Hinweis ton="ok" className="flex flex-col gap-1">
      <span className="font-semibold">{p.data.geprueft} Einträge geprüft – unverändert.</span>
      {vermerke.length > 0 && <span className="text-sm">{vermerke.join(" · ")}</span>}
      {p.data.kopf.id != null && (
        <span className="text-sm">
          Stand der Kette: Nr. {p.data.kopf.id}, Prüfwert <span className="nummer break-all">{p.data.kopf.pruefwert}</span>
        </span>
      )}
    </Hinweis>
  );
}
