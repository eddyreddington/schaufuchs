import { LOCALE, serverText } from "@schau/domain";
import { Fragment, useState, type FormEvent } from "react";
import { datum, datumZeit, fehlerText, formatEuro, parseEuro } from "../lib";
import { useSchauId } from "../rahmen";
import { useIstAdmin } from "../rolle";
import { useOberflaeche, useSprache } from "../sprache";
import { trpc } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, FehlerAnzeige, Feld, Hinweis, Kennzahlen, Knopf, KnopfLink, Laden, Leer, Marke, SEITE, Seitenkopf, TabellenRahmen, Textfeld, useFrage, useMeldung } from "../ui";

/**
 * Kassenbuch der Barkasse: Bargeldbewegungen je Tag (aus Verkauf, Meldegeld, Auszahlung, Einlage, Entnahme),
 * Soll-Bestand und Tagesabschluss mit gezähltem Bestand. Kaufbelege und Quittungen liegen unveränderbar im Belegarchiv.
 */
export function Kassenbuch() {
  const schauId = useSchauId();
  const t = useOberflaeche();
  const tk = t.kasse.kassenbuch;
  const sprache = useSprache();
  const uhrzeit = new Intl.DateTimeFormat(LOCALE[sprache], { hour: "2-digit", minute: "2-digit" });
  const buch = trpc.kasse.kassenbuch.useQuery({ schauId });
  const belege = trpc.kasse.belege.useQuery({ schauId });
  const heute = buch.data?.tage.find((t) => t.datum === buch.data.heute);
  const bestandJetzt = heute?.endCent ?? buch.data?.sollCent ?? 0;
  return (
    <div className={SEITE}>
      <Seitenkopf
        titel={tk.titel}
        unter={buch.data ? tk.kassentage(buch.data.tage.length) : undefined}
        hilfe="kassenbuch-und-tagesabschluss"
        aktionen={
          <>
            <KnopfLink href={`/datei/${schauId}/kassenbericht.pdf`} target="_blank" rel="noreferrer">{tk.kassenberichtPdf}</KnopfLink>
            <KnopfLink href={`/datei/${schauId}/kassenbuch.csv`}>{tk.kassenbuchCsv}</KnopfLink>
          </>
        }
      />
      {buch.error ? (
        <FehlerAnzeige fehler={buch.error} nochmal={() => buch.refetch()} />
      ) : !buch.data ? (
        <Laden />
      ) : (
        <>
          <Kennzahlen
            spalten={3}
            werte={[
              { label: tk.inDerKasse, wert: formatEuro(bestandJetzt) },
              { label: tk.einnahmenHeute, wert: formatEuro(heute?.einnahmenCent ?? 0) },
              { label: tk.ausgabenHeute, wert: formatEuro(heute?.ausgabenCent ?? 0) },
            ]}
          />
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex min-w-0 flex-col gap-6">
              {buch.data.tage.length === 0 && <Leer titel={tk.keineBewegung} />}
              {[...buch.data.tage].reverse().map((t) => {
                let bestand = t.anfangCent;
                return (
                  <TabellenRahmen
                    key={t.datum}
                    kopf={
                      <>
                        <h2 className="mr-auto text-[1.07rem] font-semibold text-tinte">
                          {datum(t.datum)}
                          {t.datum === buch.data.heute && <span className="font-normal text-grau"> {tk.heute}</span>}
                        </h2>
                        {t.nachtragOffen && <Marke ton="warnung">{tk.nachtragOffen}</Marke>}
                        <KnopfLink variante="leise" href={`/datei/${schauId}/kassenbericht.pdf?datum=${t.datum}`} target="_blank" rel="noreferrer">{tk.kassenbericht}</KnopfLink>
                      </>
                    }
                    fuss={
                      t.abschluesse.length > 0 ? (
                        <ul className="flex flex-col gap-1">
                          {t.abschluesse.map((a) => (
                            <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <Marke ton={a.differenzCent === 0 ? "ok" : "warnung"}>{a.nachtrag ? tk.nachtragsabschlussNr(a.nachtrag) : tk.abschluss.tages.name}</Marke>
                              <span>
                                {tk.abschlussZeile(datumZeit(a.createdAt), formatEuro(a.sollCent), formatEuro(a.istCent), formatEuro(a.differenzCent))}
                                {a.bemerkung && ` – ${a.bemerkung}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : undefined
                    }
                  >
                    <table className="tabelle">
                      <thead>
                        <tr>
                          <th scope="col">{tk.zeit}</th>
                          <th scope="col">{tk.vorgang}</th>
                          <th scope="col" className="text-right">{tk.einnahme}</th>
                          <th scope="col" className="text-right">{tk.ausgabe}</th>
                          <th scope="col" className="text-right">{tk.bestand}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td />
                          <td className="text-grau">{tk.anfangsbestand}</td>
                          <td />
                          <td />
                          <td className="text-right font-semibold tabular-nums">{formatEuro(t.anfangCent)}</td>
                        </tr>
                        {t.bewegungen.map((b, i) => {
                          bestand += b.betragCent;
                          const ersterNachtrag = b.nachtrag && !t.bewegungen[i - 1]?.nachtrag;
                          return (
                            <Fragment key={i}>
                              {ersterNachtrag && (
                                <tr>
                                  <td colSpan={5} className="bg-papier text-sm font-semibold text-stroh-dunkel">{tk.nachtragNachAbschluss}</td>
                                </tr>
                              )}
                              <tr>
                                <td className="whitespace-nowrap text-grau tabular-nums">{uhrzeit.format(new Date(b.zeit))}</td>
                                <td>{serverText(b.text, sprache)}</td>
                                <td className="text-right tabular-nums">{b.betragCent > 0 ? formatEuro(b.betragCent) : ""}</td>
                                <td className="text-right tabular-nums">{b.betragCent < 0 ? formatEuro(-b.betragCent) : ""}</td>
                                <td className="text-right tabular-nums">{formatEuro(bestand)}</td>
                              </tr>
                            </Fragment>
                          );
                        })}
                        <tr className="font-semibold">
                          <td />
                          <td>{tk.sollEndbestand}</td>
                          <td className="text-right tabular-nums">{formatEuro(t.einnahmenCent)}</td>
                          <td className="text-right tabular-nums">{formatEuro(t.ausgabenCent)}</td>
                          <td className="text-right tabular-nums">{formatEuro(t.sollCent)}</td>
                        </tr>
                        {/* Nach einer Zählung geht es mit dem gezählten Bestand weiter – der Unterschied ist die Kassendifferenz. */}
                        {t.abschluss && t.endCent !== t.sollCent && (
                          <>
                            <tr>
                              <td />
                              <td>{tk.kassendifferenz}</td>
                              <td />
                              <td />
                              <td className="text-right tabular-nums">{formatEuro(t.endCent - t.sollCent)}</td>
                            </tr>
                            <tr className="font-semibold">
                              <td />
                              <td>{tk.endbestand}</td>
                              <td />
                              <td />
                              <td className="text-right tabular-nums">{formatEuro(t.endCent)}</td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </TabellenRahmen>
                );
              })}
            </div>
            <div className="flex flex-col gap-6">
              <Bewegung schauId={schauId} />
              <Abschluss
                key={buch.data.vorschlag}
                schauId={schauId}
                vorschlag={buch.data.vorschlag}
                offeneTage={buch.data.offeneTage}
                sollJe={buch.data.sollJe}
                nachtragJe={buch.data.nachtragJe}
                heute={buch.data.heute}
              />
              <Belegarchiv schauId={schauId} belege={belege.data ?? []} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Bewegung({ schauId }: { schauId: number }) {
  const istAdmin = useIstAdmin();
  const t = useOberflaeche();
  const tk = t.kasse.kassenbuch;
  const [f, setF] = useState({ art: "anfangsbestand" as "anfangsbestand" | "einlage" | "entnahme", betrag: "", grund: "" });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const buchen = trpc.kasse.kassenbewegung.useMutation({
    onSuccess: async () => {
      await utils.kasse.kassenbuch.invalidate();
      setF({ ...f, betrag: "", grund: "" });
      meldung(tk.gebucht);
    },
    onError: (e, v) => {
      // Mehr entnehmen, als laut Kassenbuch da ist: nur nach ausdrücklicher Bestätigung.
      if (e.data?.code === "PRECONDITION_FAILED" && !v.trotzdem) {
        void bestaetige({ titel: t.kasse.trotzdemTitel, text: fehlerText(e), knopf: t.kasse.trotzdemKnopf }).then((ja) => ja && buchen.mutate({ ...v, trotzdem: true }));
      }
      // Andere Fehler zeigt das Formular selbst an.
    },
  });
  const senden = (e: FormEvent) => {
    e.preventDefault();
    const cent = parseEuro(f.betrag);
    if (!cent || cent <= 0) return meldung(tk.betragUngueltig, "fehler");
    buchen.mutate({ schauId, art: f.art, betragCent: cent, grund: f.grund });
  };
  return (
    <Abschnitt titel={tk.bargeldBuchen}>
      <form onSubmit={senden} className="flex flex-col gap-4">
        <Feld label={tk.art}>
          {(id) => (
            <Auswahl id={id} value={f.art} onChange={(e) => setF({ ...f, art: e.target.value as typeof f.art })}>
              <option value="anfangsbestand">{tk.artAnfangsbestand}</option>
              <option value="einlage">{tk.artEinlage}</option>
              {istAdmin && <option value="entnahme">{tk.artEntnahme}</option>}
            </Auswahl>
          )}
        </Feld>
        <Feld label={tk.betragEuro}>{(id) => <Eingabe id={id} inputMode="decimal" value={f.betrag} onChange={(e) => setF({ ...f, betrag: e.target.value })} required />}</Feld>
        <Feld label={f.art === "entnahme" ? tk.zweck : tk.bemerkung}>{(id) => <Eingabe id={id} value={f.grund} onChange={(e) => setF({ ...f, grund: e.target.value })} />}</Feld>
        {buchen.error && <Hinweis ton="fehler">{fehlerText(buchen.error)}</Hinweis>}
        <Knopf type="submit" laedt={buchen.isPending}>{t.kasse.buchen}</Knopf>
      </form>
    </Abschnitt>
  );
}

/** Archivierte Belege mit Link zum PDF aus dem Archiv (auch das Original nach einem Storno). */
function Belegarchiv({ schauId, belege }: { schauId: number; belege: { id: number; art: string; nummer: number; sha256: string; createdAt: Date | string }[] }) {
  const [alle, setAlle] = useState(false);
  const tk = useOberflaeche().kasse.kassenbuch;
  const belegart: Record<string, string> = tk.belegart;
  const neueste = [...belege].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const sichtbar = alle ? neueste : neueste.slice(0, 15);
  return (
    <Abschnitt titel={tk.belegarchiv(belege.length)}>
      {sichtbar.length === 0 && <p className="text-sm text-grau">{tk.keineBelege}</p>}
      {sichtbar.length > 0 && (
        <ul className="-mt-1 divide-y divide-linie text-sm">
          {sichtbar.map((b) => (
            <li key={b.id} className="flex items-baseline justify-between gap-3 py-1.5">
              <a className="text-tinte no-underline hover:text-band hover:underline" href={`/datei/${schauId}/beleg/${b.art}/${b.nummer}.pdf`} target="_blank" rel="noreferrer">
                {belegart[b.art] ?? b.art} {b.nummer}
              </a>
              <span className="text-grau" title={`SHA-256 ${b.sha256}`}>{datumZeit(b.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
      {belege.length > 15 && (
        <Knopf variante="leise" className="mt-2" onClick={() => setAlle(!alle)}>
          {alle ? tk.wenigerAnzeigen : tk.alleAnzeigen(belege.length)}
        </Knopf>
      )}
    </Abschnitt>
  );
}

function Abschluss({
  schauId,
  vorschlag,
  offeneTage,
  sollJe,
  nachtragJe,
  heute,
}: {
  schauId: number;
  vorschlag: string;
  offeneTage: string[];
  sollJe: Record<string, number>;
  nachtragJe: Record<string, boolean>;
  heute: string;
}) {
  // Nach Mitternacht steht der Vortag zur Auswahl – sonst würde der Abschluss den neuen Schautag sperren.
  const [tag, setTag] = useState(offeneTage.includes(vorschlag) ? vorschlag : (offeneTage.at(-1) ?? heute));
  const sollCent = sollJe[tag] ?? 0;
  const gesperrt = offeneTage.length === 0;
  const istNachtrag = !!nachtragJe[tag];
  const t = useOberflaeche();
  const tk = t.kasse.kassenbuch;
  const ta = istNachtrag ? tk.abschluss.nachtrag : tk.abschluss.tages;
  const [ist, setIst] = useState("");
  const [bemerkung, setBemerkung] = useState("");
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const abschliessen = trpc.kasse.tagesabschluss.useMutation({
    onSuccess: async (a) => {
      await utils.kasse.kassenbuch.invalidate();
      const art = a.nachtrag ? tk.abschluss.nachtrag : tk.abschluss.tages;
      meldung(a.differenzCent === 0 ? art.stimmt : art.differenz(formatEuro(a.differenzCent)));
    },
  });
  const istCent = parseEuro(ist);
  const differenz = istCent != null && ist.trim() ? istCent - sollCent : null;
  const senden = async (e: FormEvent) => {
    e.preventDefault();
    if (istCent == null) return meldung(tk.betragEingeben, "fehler");
    if (
      !(await bestaetige({
        titel: ta.buchenTitel,
        text: ta.frage(datum(tag), formatEuro(istCent)),
        knopf: t.kasse.buchen,
      }))
    )
      return;
    abschliessen.mutate({ schauId, datum: tag, istCent, bemerkung });
  };
  return (
    <Abschnitt titel={ta.name}>
      {gesperrt ? (
        <p className="text-grau">{tk.abschlussGebucht}</p>
      ) : (
        <form onSubmit={senden} className="flex flex-col gap-4">
          {offeneTage.length > 1 && (
            <Feld label={tk.kassentag}>
              {(id) => (
                <Auswahl id={id} value={tag} onChange={(e) => setTag(e.target.value)}>
                  {offeneTage.map((d) => (
                    <option key={d} value={d}>
                      {datum(d)}{d === heute ? ` ${tk.heute}` : ""}
                    </option>
                  ))}
                </Auswahl>
              )}
            </Feld>
          )}
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-grau">{tag === heute ? tk.sollJetzt : tk.sollAm(datum(tag))}</span>
            <span className="text-lg font-semibold tabular-nums">{formatEuro(sollCent)}</span>
          </p>
          <Feld label={tk.gezaehlterBestand}>{(id) => <Eingabe id={id} inputMode="decimal" value={ist} onChange={(e) => setIst(e.target.value)} required />}</Feld>
          {differenz != null && differenz !== 0 && <Hinweis ton="warnung">{tk.differenzErklaeren(formatEuro(differenz))}</Hinweis>}
          <Feld label={tk.erklaerung}>{(id) => <Textfeld id={id} rows={2} value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} />}</Feld>
          {abschliessen.error && <Hinweis ton="fehler">{fehlerText(abschliessen.error)}</Hinweis>}
          <Knopf type="submit" variante="primaer" laedt={abschliessen.isPending}>{ta.knopf}</Knopf>
        </form>
      )}
    </Abschnitt>
  );
}
