import { serverText } from "@schau/domain";
import { Link } from "react-router-dom";
import { datum, fehlerText, formatEuro } from "../lib";
import { useSchauId } from "../rahmen";
import { useIstAdmin } from "../rolle";
import { useOberflaeche, useSprache } from "../sprache";
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
  const t = useOberflaeche().ehrenpreise.spenden;
  const sprache = useSprache();
  const q = trpc.spenden.liste.useQuery({ schauId });
  const steuer = trpc.spenden.steuer.useQuery(undefined, { enabled: istAdmin });
  const gueltig = (q.data ?? []).filter((z) => !z.spende.storniertAm);
  const summe = (f: (z: Zeile) => boolean) => gueltig.filter(f).reduce((n, z) => n + z.spende.betragCent, 0);
  return (
    <div className={SEITE}>
      <Seitenkopf
        titel={t.liste.titel}
        unter={q.data ? t.liste.anzahl(gueltig.length) : undefined}
        hilfe="spenden"
        aktionen={
          istAdmin && (
            <Link to="/spender" className="text-sm font-semibold text-band no-underline hover:underline">
              {t.liste.verzeichnis}
            </Link>
          )
        }
      />
      {istAdmin && steuer.data?.sperre && (
        <Hinweis ton="warnung">
          {t.liste.gesperrt} {serverText(steuer.data.sperre, sprache)}{" "}
          <Link to="/verein#steuer" className="font-semibold">
            {t.steuer.titel}
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
              { label: t.liste.geldspenden, wert: formatEuro(summe((z) => z.spende.art === "geld")), zusatz: t.liste.davonBar(formatEuro(summe((z) => z.spende.weg === "bar" && z.spende.art === "geld"))) },
              { label: t.liste.sachspenden, wert: formatEuro(summe((z) => z.spende.art === "sache")) },
              { label: t.liste.nichtEingegangen, wert: formatEuro(summe((z) => !z.datum)), zusatz: t.liste.mitMeldegeld },
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
  const o = useOberflaeche();
  const t = o.ehrenpreise.spenden.liste;
  const sprache = useSprache();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe } = useFrage();
  const neu = async () => Promise.all([utils.spenden.liste.invalidate({ schauId }), utils.kasse.kassenbuch.invalidate({ schauId })]);
  const bestaetigen = trpc.spenden.bestaetigen.useMutation({
    onSuccess: async (r) => {
      await neu();
      meldung(t.ausgestellt(r.nummer));
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const stornieren = trpc.spenden.stornieren.useMutation({
    onSuccess: async () => {
      await neu();
      meldung(t.storniert);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const storno = async (z: Zeile) => {
    const grund = await eingabe({ titel: t.stornoFrage(z.spende.id), text: z.spende.weg === "bar" ? t.stornoBar : undefined, feld: t.grund, mindestens: 3, knopf: t.stornieren, gefahr: true });
    if (grund) stornieren.mutate({ spendeId: z.spende.id, grund });
  };
  if (!zeilen.length) return <Leer titel={t.keine} />;
  return (
    <TabellenRahmen>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-linie text-left text-xs text-grau">
              <th className="px-4 py-2 font-semibold">{t.beleg}</th>
              <th className="px-2 py-2 font-semibold">{t.eingang}</th>
              <th className="px-2 py-2 font-semibold">{t.spender}</th>
              <th className="px-2 py-2 font-semibold">{t.art}</th>
              <th className="px-2 py-2 text-right font-semibold">{o.allgemein.betrag}</th>
              <th className="px-2 py-2 font-semibold">{t.bestaetigung}</th>
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
                      <span className="text-grau">{t.mitMeldung}</span>
                    ) : (
                      <a href={`/datei/${schauId}/beleg/${storniert ? "spende-storno" : "spende"}/${sp.id}.pdf`} target="_blank" rel="noreferrer">
                        S-{sp.id}
                      </a>
                    )}
                  </td>
                  <td className="px-2 py-2 tabular-nums">{z.datum ? datum(z.datum) : <Marke ton="warnung">{t.offen}</Marke>}</td>
                  <td className="px-2 py-2">{name}</td>
                  <td className="px-2 py-2">
                    {sp.art === "sache" ? t.sache(sp.sache?.bezeichnung ?? "") : t.geld(o.fach.SPENDE_WEG_LABEL[sp.weg])}
                    {sp.gegenleistung && <span className="block text-xs text-grau">{t.mitGegenleistung}</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatEuro(sp.betragCent)}</td>
                  <td className="px-2 py-2">
                    {storniert ? (
                      <span className="no-underline">{t.storniertMarke}</span>
                    ) : z.bestaetigungId ? (
                      <a href={`/datei/zuwendungsbestaetigung/${z.bestaetigungId}.pdf`} target="_blank" rel="noreferrer">
                        {t.nr(z.bestaetigungNr!)}
                      </a>
                    ) : z.sperren.length ? (
                      <span className="text-xs text-grau" title={z.sperren.map((g) => serverText(g, sprache)).join(" ")}>
                        {serverText(z.sperren[0]!, sprache)}
                      </span>
                    ) : (
                      <span className="text-xs text-grau">{t.moeglich}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {istAdmin && !storniert && (
                      <span className="inline-flex gap-2">
                        {!z.bestaetigungId && !z.sperren.length && (
                          <Knopf variante="leise" laedt={bestaetigen.isPending && bestaetigen.variables?.spendeId === sp.id} onClick={() => bestaetigen.mutate({ spendeId: sp.id })}>
                            {t.bestaetigen}
                          </Knopf>
                        )}
                        {!z.bestaetigungId && (
                          <Knopf variante="leise" onClick={() => storno(z)}>
                            {t.stornieren}
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
