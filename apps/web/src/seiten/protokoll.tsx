import { serverText } from "@schau/domain";
import { useEffect, useState } from "react";
import { datumZeit } from "../lib";
import { useSchauId } from "../rahmen";
import { useOberflaeche, useSprache } from "../sprache";
import { trpc } from "../trpc";
import { Hinweis, Knopf, KnopfLink, Laden, Marke, SEITE as SEITENWURZEL, Seitenkopf, Suchfeld, TabellenRahmen } from "../ui";

/** Einträge je Seite; die Suche läuft auf dem Server über das ganze Protokoll. */
const SEITE = 200;

function kurz(wert: unknown): string {
  if (wert == null) return "";
  if (typeof wert === "string" || typeof wert === "number") return String(wert);
  const t = JSON.stringify(wert);
  return t.length > 140 ? `${t.slice(0, 140)} …` : t;
}

/** Die Einträge selbst (Aktion, Werte, Grund) bleiben deutsch, nur die Seite drumherum wird übersetzt. */
export function Protokoll() {
  const t = useOberflaeche().verein.protokoll;
  const bereiche: Record<string, string> = t.bereiche;
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
        titel={t.titel}
        // bleibt deutsch: Anker im Handbuch
        hilfe="protokoll-und-prüfliste"
        aktionen={
          <>
            {!pruefen && <Knopf onClick={() => setPruefen(true)}>{t.pruefen}</Knopf>}
            <KnopfLink href={`/datei/${schauId}/protokoll.csv`}>{t.exportCsv}</KnopfLink>
            <KnopfLink href={`/datei/${schauId}/protokoll.json`} title={t.pruefexportTitel}>{t.pruefexport}</KnopfLink>
          </>
        }
      />
      {pruefen && <KettenPruefung schauId={schauId} />}
      <TabellenRahmen
        kopf={<Suchfeld aria-label={t.durchsuchen} placeholder={t.platzhalter} value={q} onChange={(e) => setQ(e.target.value)} />}
        fuss={
          !daten.isLoading && zeilen.length > 0 ? (
            <>
              <span>
                {t.eintraege(zeilen.length)}{daten.hasNextPage ? t.weitere : ""}
                {suche ? t.zu(suche) : ""}
              </span>
              {daten.hasNextPage && (
                <Knopf variante="leise" laedt={daten.isFetchingNextPage} onClick={() => daten.fetchNextPage()}>
                  {t.aeltere}
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
          <p className="px-4 py-10 text-center text-grau">{t.keine}</p>
        ) : (
          <table className="tabelle text-sm">
            <thead>
              <tr>
                <th>{t.zeit}</th>
                <th>{t.wer}</th>
                <th>{t.bereich}</th>
                <th>{t.aktion}</th>
                <th>{t.details}</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.id}>
                  <td className="whitespace-nowrap text-grau tabular-nums">{datumZeit(z.zeitpunkt)}</td>
                  <td className="text-tinte">{z.wer}</td>
                  <td>
                    <Marke>{bereiche[z.tabelle] ?? z.tabelle}</Marke>
                  </td>
                  <td>{z.aktion /* bleibt deutsch: Protokolleintrag */}</td>
                  <td className="max-w-[50ch] break-words text-grau">
                    {z.alt != null && <span>{t.vorher} {kurz(z.alt)} </span>}
                    {z.neu != null && <span>{t.neu} {kurz(z.neu)}</span>}
                    {z.grund && <span className="block font-semibold text-tinte">{t.grund} {z.grund}</span>}
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
  const t = useOberflaeche().verein.protokoll;
  const sprache = useSprache();
  const p = trpc.schau.protokollPruefen.useQuery({ schauId });
  if (p.isLoading) return <Laden />;
  if (!p.data) return null;
  const vermerke = [
    p.data.ohneKette ? t.ohneKette(p.data.ohneKette) : "",
    p.data.anonymisiert ? t.anonymisiert(p.data.anonymisiert) : "",
    p.data.vermerkt ? t.luecken(p.data.vermerkt) : "",
  ].filter(Boolean);
  return p.data.fehler.length ? (
    <Hinweis ton="fehler">
      {t.fehler(p.data.fehler.length, p.data.fehler.slice(0, 10).map((f) => t.fehlerNr(f.id, serverText(f.grund, sprache))).join(", "))}
    </Hinweis>
  ) : (
    <Hinweis ton="ok" className="flex flex-col gap-1">
      <span className="font-semibold">{t.geprueft(p.data.geprueft)}</span>
      {vermerke.length > 0 && <span className="text-sm">{vermerke.join(" · ")}</span>}
      {p.data.kopf.id != null && (
        <span className="text-sm">
          {t.kette(p.data.kopf.id)} <span className="nummer break-all">{p.data.kopf.pruefwert}</span>
        </span>
      )}
    </Hinweis>
  );
}
