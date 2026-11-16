import { Fragment, useState } from "react";
import { formatIban } from "@schau/domain";
import { datum, datumZeit, fehlerText, formatEuro, heuteIso } from "../lib";
import { useSchauId } from "../rahmen";
import { trpc } from "../trpc";
import { Abschnitt, Eingabe, FehlerAnzeige, Feld, Hinweis, Kennzahlen, Knopf, KnopfLink, Laden, Marke, SEITE, Segmente, Seitenkopf, Suchfeld, TabellenRahmen, useFrage, useMeldung } from "../ui";
import { useIstAdmin } from "../rolle";
import { useOberflaeche } from "../sprache";
import { ot } from "../sprache-jetzt";

/** Fragt einen Pflicht-Grund im Rückfrage-Dialog ab (OK erst ab 3 Zeichen). null = abgebrochen. */
function grundAbfragen(eingabe: ReturnType<typeof useFrage>["eingabe"], titel: string, text: string, knopf: string): Promise<string | null> {
  return eingabe({ titel, text, feld: ot().kasse.grund, mindestens: 3, knopf, gefahr: true });
}

export function Abrechnung() {
  const schauId = useSchauId();
  const t = useOberflaeche();
  const ta = t.kasse.abrechnung;
  // Regelmäßig nachladen: an der Kasse bleibt die Seite lange offen, während noch verkauft wird.
  const liste = trpc.kasse.abrechnung.useQuery({ schauId }, { refetchInterval: 30_000 });
  const datei = trpc.kasse.ueberweisungsdatei.useQuery({ schauId });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe, bestaetige } = useFrage();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"" | "offen" | "erledigt">("");
  const [letzteQuittung, setLetzteQuittung] = useState<{ ausstellerId: number; quittungNr: number } | null>(null);
  const neuLaden = () => {
    utils.kasse.abrechnung.invalidate();
    utils.kasse.ueberweisungsdatei.invalidate();
  };
  const auszahlen = trpc.kasse.auszahlen.useMutation({
    onSuccess: (a, v) => {
      neuLaden();
      meldung((a.betragCent < 0 ? ta.abgerechnetVerein : ta.abgerechnet)(a.quittungNr, formatEuro(Math.abs(a.betragCent))));
      setLetzteQuittung({ ausstellerId: v.ausstellerId, quittungNr: a.quittungNr });
      // Versuch; blockiert der Browser das Fenster, bleibt der Druck-Knopf oben stehen.
      window.open(`/datei/${schauId}/abrechnung.pdf?aussteller=${v.ausstellerId}&quittung=${a.quittungNr}`, "_blank");
    },
    onError: (e, v) => {
      // Kassenbuch weist nicht genug Bargeld aus: die Ausstellungsleitung kann nach Rückfrage trotzdem buchen.
      if (e.data?.code === "PRECONDITION_FAILED" && !v.trotzdem) {
        void bestaetige({ titel: t.kasse.trotzdemTitel, text: fehlerText(e), knopf: t.kasse.trotzdemKnopf }).then((ja) => ja && auszahlen.mutate({ ...v, trotzdem: true }));
        return;
      }
      // Betrag hat sich geändert: Liste neu laden, damit der neue Betrag angezeigt wird.
      if (e.data?.code === "CONFLICT") neuLaden();
      meldung(fehlerText(e), "fehler");
    },
  });
  /** Bucht genau den angezeigten Betrag – nach Rückfrage mit Betrag und Name. */
  const abrechnen = async (z: { ausstellerId: number; name: string; nochOffenCent: number }, art: "bar" | "ueberweisung") => {
    const betrag = formatEuro(Math.abs(z.nochOffenCent));
    const frage =
      art === "bar"
        ? z.nochOffenCent > 0
          ? ta.barAuszahlen(betrag, z.name)
          : ta.barErhalten(betrag, z.name)
        : z.nochOffenCent > 0
          ? ta.ueberweisungAn(betrag, z.name)
          : ta.rueckforderungEingegangen(betrag, z.name);
    if (!(await bestaetige({ titel: art === "bar" ? ta.barAbrechnen : ta.ueberweisungBuchen, text: frage, knopf: t.kasse.buchen }))) return;
    auszahlen.mutate({ schauId, ausstellerId: z.ausstellerId, art, erwartetCent: z.nochOffenCent, eingangBestaetigt: art === "ueberweisung" && z.nochOffenCent < 0 });
  };
  const stornieren = trpc.kasse.auszahlungStornieren.useMutation({ onSuccess: neuLaden, onError: (e) => meldung(fehlerText(e), "fehler") });
  const status = trpc.auth.status.useQuery();
  const istAdmin = status.data?.benutzer?.rolle === "admin";
  const erstellen = trpc.kasse.ueberweisungsdateiErstellen.useMutation({
    onSuccess: (l) => {
      neuLaden();
      meldung(ta.sepaErstellt(l.posten.length));
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const verwerfen = trpc.kasse.ueberweisungsdateiVerwerfen.useMutation({
    onSuccess: () => {
      neuLaden();
      meldung(ta.sepaVerworfen);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const buchen = trpc.kasse.ueberweisungenBuchen.useMutation({
    onSuccess: (r) => {
      neuLaden();
      meldung(ta.ueberwiesenGebucht(r.anzahl, formatEuro(r.summeCent)));
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const schau = trpc.schau.get.useQuery({ id: schauId });
  // Ausgezahlt und zurückgefordert wird wie am Server nur in den Phasen „Schau“ und „Abrechnung“.
  const kasseOffen = schau.data?.phase === "schau" || schau.data?.phase === "abrechnung";
  const [ausfuehrung, setAusfuehrung] = useState(() => {
    const d = new Date(`${heuteIso()}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });

  if (liste.error) return <FehlerAnzeige fehler={liste.error} nochmal={() => liste.refetch()} />;
  if (liste.isLoading || !liste.data) return <Laden />;
  const istOffen = (z: (typeof liste.data)[number]) => !z.inUeberweisung && z.nochOffenCent !== 0;
  const zeilen = liste.data.filter((z) => (!q || z.name.toLowerCase().includes(q.toLowerCase())) && (!filter || (filter === "offen") === istOffen(z)));
  const summe = (f: (z: (typeof zeilen)[number]) => number) => liste.data.reduce((s, z) => s + f(z), 0);
  const offen = liste.data.filter(istOffen).length;
  const ueberweisbar = liste.data.filter((z) => z.ueberweisbar);
  const ohneIban = liste.data.filter((z) => !z.inUeberweisung && z.nochOffenCent > 0 && !z.ueberweisbar).length;
  const abweichungen = liste.data.filter((z) => z.differenzCent !== 0).length;
  const lauf = datei.data;
  const quittungName = letzteQuittung && liste.data.find((z) => z.ausstellerId === letzteQuittung.ausstellerId)?.name;
  const zeilenSaldo = zeilen.reduce((s, z) => s + z.saldoCent, 0);

  return (
    <div className={SEITE}>
      <Seitenkopf
        titel={ta.titel}
        unter={ta.unter(liste.data.length, offen)}
        hilfe="abrechnung"
        aktionen={
          <>
            <KnopfLink href={`/datei/${schauId}/abrechnung.pdf`} target="_blank" rel="noreferrer">{ta.gesamtlistePdf}</KnopfLink>
            <KnopfLink href={`/datei/${schauId}/abrechnung.csv`}>{ta.exportCsv}</KnopfLink>
          </>
        }
      />
      <Erstattungen schauId={schauId} />
      {letzteQuittung && (
        <Hinweis ton="ok" className="flex flex-wrap items-center justify-between gap-3">
          <span>{quittungName ? ta.letzteQuittungName(quittungName, letzteQuittung.quittungNr) : ta.letzteQuittung(letzteQuittung.quittungNr)}</span>
          <KnopfLink variante="primaer" href={`/datei/${schauId}/abrechnung.pdf?aussteller=${letzteQuittung.ausstellerId}&quittung=${letzteQuittung.quittungNr}`} target="_blank" rel="noreferrer">
            {ta.quittungDrucken(letzteQuittung.quittungNr)}
          </KnopfLink>
        </Hinweis>
      )}
      {abweichungen > 0 && (
        <Hinweis ton="warnung">
          {ta.abweichungen(abweichungen)}
        </Hinweis>
      )}
      <Kennzahlen
        werte={[
          { label: ta.preisgeld, wert: formatEuro(summe((z) => z.preisgeldCent)) },
          { label: ta.verkaufserloese, wert: formatEuro(summe((z) => z.verkaufCent)) },
          { label: ta.provisionVerein, wert: formatEuro(summe((z) => z.provisionCent)) },
          { label: ta.auszuzahlenGesamt, wert: formatEuro(summe((z) => Math.max(z.saldoCent, 0))) },
        ]}
      />
      <Abschnitt titel={ta.sepaTitel}>
        {lauf ? (
          // Offene Datei: gebucht wird genau ihr Inhalt, nicht der aktuelle Stand der Liste.
          <div className="flex flex-col gap-4">
            {(() => {
              const [vor, anzahl, mitte, summe, nach] = ta.laufText(datumZeit(lauf.erstelltAm), lauf.erstelltVon, lauf.posten.length, formatEuro(lauf.summeCent), datum(lauf.ausfuehrungAm));
              return (
                <p>
                  {vor}
                  <span className="font-semibold">{anzahl}</span>
                  {mitte}
                  <span className="font-semibold">{summe}</span>
                  {nach}
                </p>
              );
            })()}
            {!istAdmin && <p className="text-sm text-grau">{ta.nurLeitungDatei}</p>}
            {istAdmin && (
              <div className="flex flex-wrap items-end gap-2">
                <KnopfLink variante="primaer" href={`/datei/${schauId}/ueberweisungen.xml`}>
                  {ta.sepaHerunterladen}
                </KnopfLink>
                <Knopf
                  laedt={buchen.isPending}
                  onClick={async () =>
                    (await bestaetige({
                      titel: ta.alsUeberwiesen,
                      text: ta.alsUeberwiesenFrage(lauf.posten.length, formatEuro(lauf.summeCent)),
                      knopf: t.kasse.buchen,
                    })) &&
                    buchen.mutate({ schauId, nachrichtId: lauf.nachrichtId, ausstellerIds: lauf.posten.map((p) => p.ausstellerId) })
                  }
                >
                  {ta.alsUeberwiesen}
                </Knopf>
                <Knopf
                  variante="leise"
                  laedt={verwerfen.isPending}
                  onClick={async () => {
                    const g = await grundAbfragen(eingabe, ta.sepaVerwerfenTitel, ta.sepaVerwerfenFrage, ta.verwerfen);
                    if (g != null) verwerfen.mutate({ schauId, nachrichtId: lauf.nachrichtId, grund: g });
                  }}
                >
                  {ta.dateiVerwerfen}
                </Knopf>
              </div>
            )}
            <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-t border-linie pt-3 text-sm">
              {lauf.posten.map((p) => (
                <Fragment key={p.ausstellerId}>
                  <dt className="text-grau">{p.name}</dt>
                  <dd className="text-right tabular-nums">{formatEuro(p.betragCent)}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        ) : !istAdmin ? (
          <p className="text-grau">{ta.nurLeitung}</p>
        ) : schau.data && schau.data.phase !== "abrechnung" ? (
          <p className="text-grau">{ta.erstInAbrechnung}</p>
        ) : !schau.data?.vereinIban ? (
          <Hinweis ton="warnung">{ta.vereinskontoFehlt}</Hinweis>
        ) : ueberweisbar.length === 0 ? (
          <p className="text-grau">
            {ta.keineOffenen}
            {ohneIban > 0 && ` ${ta.ohneIbanBar(ohneIban)}`}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {(() => {
              const [anzahl, mitte, summe] = ta.mitIban(ueberweisbar.length, formatEuro(ueberweisbar.reduce((s, z) => s + z.nochOffenCent, 0)));
              return (
                <p>
                  <span className="font-semibold">{anzahl}</span>
                  {mitte}
                  <span className="font-semibold">{summe}</span>
                  {ohneIban > 0 && <span className="text-grau"> · {ta.ohneIbanKurz(ohneIban)}</span>}
                </p>
              );
            })()}
            <div className="flex flex-wrap items-end gap-3">
              <Feld label={ta.ausfuehrungAm}>{(id) => <Eingabe id={id} type="date" value={ausfuehrung} onChange={(e) => setAusfuehrung(e.target.value)} className="w-44" />}</Feld>
              <Knopf variante="primaer" laedt={erstellen.isPending} onClick={() => erstellen.mutate({ schauId, ausfuehrungAm: ausfuehrung })}>
                {ta.sepaErstellen}
              </Knopf>
            </div>
          </div>
        )}
      </Abschnitt>
      <TabellenRahmen
        kopf={
          <>
            <Suchfeld aria-label={ta.ausstellerSuchen} placeholder={ta.ausstellerSuchen} value={q} onChange={(e) => setQ(e.target.value)} />
            <Segmente
              label={ta.stand}
              wert={filter}
              onChange={setFilter}
              optionen={[
                { wert: "" as const, label: t.allgemein.alle, anzahl: liste.data.length },
                { wert: "offen" as const, label: ta.offen, anzahl: offen },
                { wert: "erledigt" as const, label: ta.erledigt, anzahl: liste.data.length - offen },
              ]}
            />
          </>
        }
        fuss={
          zeilen.length > 0 ? (
            <>
              <span>{ta.anzahlAussteller(zeilen.length)}</span>
              <span>{ta.saldoBetrag(formatEuro(zeilenSaldo))}</span>
            </>
          ) : undefined
        }
      >
        {zeilen.length === 0 ? (
          <p className="px-4 py-10 text-center text-grau">{q || filter ? ta.keineTreffer : ta.keineAussteller}</p>
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th>{t.allgemein.aussteller}</th>
                <th className="text-right">{ta.preisgeld}</th>
                <th className="text-right">{ta.verkauf}</th>
                <th className="text-right">{ta.provision}</th>
                <th className="text-right">{ta.meldegeldOffen}</th>
                <th className="text-right">{ta.saldo}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.ausstellerId}>
                  <td>
                    <span className="font-semibold text-tinte">{z.name}</span>
                    <span className="block text-sm text-grau">{ta.ortTiere(z.ort ?? "", z.tiere)}</span>
                    <span className="block text-sm text-grau">{z.iban ? `IBAN ${formatIban(z.iban)}` : ta.ohneIban}</span>
                  </td>
                  <td className="text-right tabular-nums">{formatEuro(z.preisgeldCent)}</td>
                  <td className="text-right tabular-nums">
                    {formatEuro(z.verkaufCent)}
                    {z.verkaufAusstehendCent > 0 && <span className="block text-sm text-kamm">{ta.plusUeberweisungOffen(formatEuro(z.verkaufAusstehendCent))}</span>}
                  </td>
                  <td className="text-right tabular-nums">{z.provisionCent ? `−${formatEuro(z.provisionCent)}` : formatEuro(0)}</td>
                  <td className="text-right tabular-nums">{z.offenCent ? `−${formatEuro(z.offenCent)}` : z.ueberzahltCent ? `+${formatEuro(z.ueberzahltCent)}` : "–"}</td>
                  <td className={`text-right text-lg font-semibold tabular-nums ${z.saldoCent < 0 ? "text-kamm" : ""}`}>
                    {formatEuro(z.saldoCent)}
                    {z.differenzCent !== 0 && (
                      <span className="mt-1 block">
                        <Marke ton="warnung">{ta.abweichung} {z.differenzCent > 0 ? "+" : "−"}{formatEuro(Math.abs(z.differenzCent))}</Marke>
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {z.inUeberweisung ? (
                      <Marke ton="info">{ta.inSepa(formatEuro(z.inUeberweisung.betragCent))}</Marke>
                    ) : z.imEinzug ? (
                      <Marke ton="info">{ta.inLastschrift(formatEuro(z.imEinzug.betragCent))}</Marke>
                    ) : z.auszahlung ? (
                      <span className="flex flex-col items-end gap-1.5">
                        <Marke ton="ok">{ta.ausgezahlt(formatEuro(z.ausgezahltCent))}</Marke>
                        <span className="flex flex-wrap justify-end gap-x-3 text-sm">
                          {z.buchungen.map((b) =>
                            b.storniertAm ? (
                              <span key={b.id} className="text-grau line-through" title={ta.storniertGrund(b.stornoGrund ?? "")}>{ta.quittung(b.quittungNr)}</span>
                            ) : (
                              <a key={b.id} href={`/datei/${schauId}/abrechnung.pdf?aussteller=${z.ausstellerId}&quittung=${b.quittungNr}`} target="_blank" rel="noreferrer" className="text-tinte hover:text-band">
                                {(b.art === "ueberweisung" ? ta.quittungUeberwiesen : ta.quittungBar)(b.quittungNr, formatEuro(b.betragCent))}
                              </a>
                            ),
                          )}
                        </span>
                        <span className="flex gap-2">
                          {/* Nachzahlungen und Rückforderungen bucht nur die Ausstellungsleitung. */}
                          {z.nochOffenCent !== 0 && istAdmin && kasseOffen && (
                            <Knopf variante="primaer" onClick={() => abrechnen(z, "bar")}>
                              {(z.nochOffenCent > 0 ? ta.differenzAuszahlen : ta.differenzZurueckfordern)(formatEuro(Math.abs(z.nochOffenCent)))}
                            </Knopf>
                          )}
                          {z.nochOffenCent !== 0 && istAdmin && kasseOffen && (
                            <Knopf variante="leise" onClick={() => abrechnen(z, "ueberweisung")}>
                              {z.nochOffenCent > 0 ? ta.alsUeberweisung : ta.ueberweisungEingegangen}
                            </Knopf>
                          )}
                          {z.nochOffenCent !== 0 && !istAdmin && <span className="text-sm text-grau">{ta.differenzLeitung}</span>}
                          {istAdmin && schau.data?.phase !== "abgeschlossen" && (
                            <Knopf
                              variante="leise"
                              onClick={async () => {
                                const g = await grundAbfragen(
                                  eingabe,
                                  ta.quittungStornierenTitel(z.auszahlung!.quittungNr),
                                  ta.quittungStornierenText,
                                  t.kasse.stornieren,
                                );
                                if (g != null) stornieren.mutate({ schauId, id: z.auszahlung!.id, grund: g });
                              }}
                            >
                              {t.kasse.stornieren}
                            </Knopf>
                          )}
                        </span>
                      </span>
                    ) : z.saldoCent === 0 ? (
                      <span className="text-sm text-grau">{ta.nichtsOffen}</span>
                    ) : !kasseOffen ? (
                      <span className="text-sm text-grau">{ta.offenBetrag(formatEuro(z.nochOffenCent))}</span>
                    ) : (
                      <Knopf variante={z.ueberweisbar ? "zweit" : "primaer"} onClick={() => abrechnen(z, "bar")}>
                        {ta.barAbrechnen} {formatEuro(Math.abs(z.nochOffenCent))}
                      </Knopf>
                    )}
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

/**
 * Stornierte Meldungen mit Zahlungseingang (z. B. nach einer Absage): wem was zu erstatten ist. Nach der Überweisung
 * bucht die Ausstellungsleitung die Erstattungen gesammelt – vorher lässt sich die Schau nicht abschließen.
 */
function Erstattungen({ schauId }: { schauId: number }) {
  const t = useOberflaeche();
  const te = t.kasse.abrechnung.erstattungen;
  const liste = trpc.meldung.zuErstatten.useQuery({ schauId });
  const schau = trpc.schau.get.useQuery({ id: schauId });
  const istAdmin = useIstAdmin();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const [tag, setTag] = useState(heuteIso());
  const buchen = trpc.meldung.erstattungenBuchen.useMutation({
    onSuccess: (r) => {
      utils.meldung.invalidate();
      utils.kasse.invalidate();
      meldung(te.gebucht(r.gebucht));
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const zuErstatten = (liste.data ?? []).filter((x) => x.restCent > 0);
  if (!liste.data?.length) return null;
  const summeRest = zuErstatten.reduce((n, x) => n + x.restCent, 0);
  return (
    <TabellenRahmen
      kopf={<h2 className="text-[1.07rem] font-semibold text-tinte">{schau.data?.abgesagtAm ? te.abgesagt(schau.data.absageGrund ?? "") : te.titel}</h2>}
      fuss={
        <>
          <span>{te.fuss(liste.data.length, formatEuro(summeRest))}</span>
          {istAdmin && zuErstatten.length > 0 && (
            <span className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                {te.ueberwiesenAm}
                <Eingabe type="date" value={tag} onChange={(e) => setTag(e.target.value)} className="w-44" />
              </label>
              <Knopf
                variante="primaer"
                laedt={buchen.isPending}
                onClick={async () => {
                  if (await bestaetige({ titel: te.buchenTitel, text: te.buchenFrage(zuErstatten.length, formatEuro(summeRest)), knopf: t.kasse.buchen }))
                    buchen.mutate({ schauId, datum: tag, meldungIds: zuErstatten.map((x) => x.meldungId) });
                }}
              >
                {te.buchenKnopf}
              </Knopf>
            </span>
          )}
        </>
      }
    >
      <table className="tabelle">
        <thead>
          <tr>
            <th>{t.allgemein.aussteller}</th>
            <th>{te.kontoinhaber}</th>
            <th>{"IBAN"}</th>
            <th className="text-right">{t.allgemein.betrag}</th>
          </tr>
        </thead>
        <tbody>
          {liste.data.map((x) => (
            <tr key={x.meldungId}>
              <td className="font-semibold text-tinte">{x.name}</td>
              <td>{x.kontoinhaber}</td>
              <td className="whitespace-nowrap tabular-nums">{x.iban ? formatIban(x.iban) : <span className="text-kamm">{te.keineIban}</span>}</td>
              <td className="text-right tabular-nums">{formatEuro(x.restCent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabellenRahmen>
  );
}
