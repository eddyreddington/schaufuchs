import { Fragment, useState } from "react";
import { formatIban } from "@schau/domain";
import { datum, datumZeit, fehlerText, formatEuro, heuteIso } from "../lib";
import { useSchauId } from "../rahmen";
import { trpc } from "../trpc";
import { Abschnitt, Eingabe, FehlerAnzeige, Feld, Hinweis, Kennzahlen, Knopf, KnopfLink, Laden, Marke, SEITE, Segmente, Seitenkopf, Suchfeld, TabellenRahmen, useFrage, useMeldung } from "../ui";
import { useIstAdmin } from "../rolle";

/** Fragt einen Pflicht-Grund im Rückfrage-Dialog ab (OK erst ab 3 Zeichen). null = abgebrochen. */
function grundAbfragen(eingabe: ReturnType<typeof useFrage>["eingabe"], titel: string, text: string, knopf: string): Promise<string | null> {
  return eingabe({ titel, text, feld: "Grund", mindestens: 3, knopf, gefahr: true });
}

export function Abrechnung() {
  const schauId = useSchauId();
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
      meldung(`Abgerechnet – Quittung ${a.quittungNr} über ${formatEuro(Math.abs(a.betragCent))}${a.betragCent < 0 ? " (an den Verein)" : ""}.`);
      setLetzteQuittung({ ausstellerId: v.ausstellerId, quittungNr: a.quittungNr });
      // Versuch; blockiert der Browser das Fenster, bleibt der Druck-Knopf oben stehen.
      window.open(`/datei/${schauId}/abrechnung.pdf?aussteller=${v.ausstellerId}&quittung=${a.quittungNr}`, "_blank");
    },
    onError: (e, v) => {
      // Kassenbuch weist nicht genug Bargeld aus: die Ausstellungsleitung kann nach Rückfrage trotzdem buchen.
      if (e.data?.code === "PRECONDITION_FAILED" && !v.trotzdem) {
        void bestaetige({ titel: "Trotzdem buchen?", text: e.message, knopf: "Trotzdem buchen" }).then((ja) => ja && auszahlen.mutate({ ...v, trotzdem: true }));
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
          ? `${betrag} bar an ${z.name} auszahlen?`
          : `${betrag} bar von ${z.name} erhalten?`
        : z.nochOffenCent > 0
          ? `${betrag} per Überweisung an ${z.name} buchen? Die Überweisung führen Sie selbst im Onlinebanking aus.`
          : `Ist die Rückforderung über ${betrag} von ${z.name} bereits auf dem Vereinskonto eingegangen? Erst dann buchen.`;
    if (!(await bestaetige({ titel: art === "bar" ? "Bar abrechnen" : "Überweisung buchen", text: frage, knopf: "Buchen" }))) return;
    auszahlen.mutate({ schauId, ausstellerId: z.ausstellerId, art, erwartetCent: z.nochOffenCent, eingangBestaetigt: art === "ueberweisung" && z.nochOffenCent < 0 });
  };
  const stornieren = trpc.kasse.auszahlungStornieren.useMutation({ onSuccess: neuLaden, onError: (e) => meldung(fehlerText(e), "fehler") });
  const status = trpc.auth.status.useQuery();
  const istAdmin = status.data?.benutzer?.rolle === "admin";
  const erstellen = trpc.kasse.ueberweisungsdateiErstellen.useMutation({
    onSuccess: (l) => {
      neuLaden();
      meldung(`SEPA-Datei mit ${l.posten.length} Überweisungen erstellt.`);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const verwerfen = trpc.kasse.ueberweisungsdateiVerwerfen.useMutation({
    onSuccess: () => {
      neuLaden();
      meldung("SEPA-Datei verworfen.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const buchen = trpc.kasse.ueberweisungenBuchen.useMutation({
    onSuccess: (r) => {
      neuLaden();
      meldung(`${r.anzahl} Überweisungen über ${formatEuro(r.summeCent)} als ausgezahlt gebucht.`);
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
        titel="Abrechnung"
        unter={`${liste.data.length} Aussteller, ${offen} noch abzurechnen`}
        hilfe="abrechnung"
        aktionen={
          <>
            <KnopfLink href={`/datei/${schauId}/abrechnung.pdf`} target="_blank" rel="noreferrer">Gesamtliste (PDF)</KnopfLink>
            <KnopfLink href={`/datei/${schauId}/abrechnung.csv`}>Export für Excel (CSV)</KnopfLink>
          </>
        }
      />
      <Erstattungen schauId={schauId} />
      {letzteQuittung && (
        <Hinweis ton="ok" className="flex flex-wrap items-center justify-between gap-3">
          <span>Abgerechnet{quittungName ? `: ${quittungName}` : ""} – Quittung {letzteQuittung.quittungNr}.</span>
          <KnopfLink variante="primaer" href={`/datei/${schauId}/abrechnung.pdf?aussteller=${letzteQuittung.ausstellerId}&quittung=${letzteQuittung.quittungNr}`} target="_blank" rel="noreferrer">
            Quittung {letzteQuittung.quittungNr} drucken
          </KnopfLink>
        </Hinweis>
      )}
      {abweichungen > 0 && (
        <Hinweis ton="warnung">
          Bei {abweichungen} Aussteller{abweichungen === 1 ? "" : "n"} weicht der Saldo vom ausgezahlten Betrag ab.
        </Hinweis>
      )}
      <Kennzahlen
        werte={[
          { label: "Preisgeld", wert: formatEuro(summe((z) => z.preisgeldCent)) },
          { label: "Verkaufserlöse", wert: formatEuro(summe((z) => z.verkaufCent)) },
          { label: "Provision (Verein)", wert: formatEuro(summe((z) => z.provisionCent)) },
          { label: "Auszuzahlen gesamt", wert: formatEuro(summe((z) => Math.max(z.saldoCent, 0))) },
        ]}
      />
      <Abschnitt titel="Überweisungen per SEPA-Datei">
        {lauf ? (
          // Offene Datei: gebucht wird genau ihr Inhalt, nicht der aktuelle Stand der Liste.
          <div className="flex flex-col gap-4">
            <p>
              SEPA-Datei vom {datumZeit(lauf.erstelltAm)} ({lauf.erstelltVon}): <span className="font-semibold">{lauf.posten.length} Überweisungen</span> über{" "}
              <span className="font-semibold">{formatEuro(lauf.summeCent)}</span>, Ausführung am {datum(lauf.ausfuehrungAm)}.
            </p>
            {!istAdmin && <p className="text-sm text-grau">Herunterladen, buchen und verwerfen: Ausstellungsleitung.</p>}
            {istAdmin && (
              <div className="flex flex-wrap items-end gap-2">
                <KnopfLink variante="primaer" href={`/datei/${schauId}/ueberweisungen.xml`}>
                  SEPA-Datei herunterladen
                </KnopfLink>
                <Knopf
                  laedt={buchen.isPending}
                  onClick={async () =>
                    (await bestaetige({
                      titel: "Als überwiesen buchen",
                      text: `${lauf.posten.length} Überweisungen über ${formatEuro(lauf.summeCent)} als ausgezahlt buchen? Nur tun, wenn die Bank die Datei angenommen hat.`,
                      knopf: "Buchen",
                    })) &&
                    buchen.mutate({ schauId, nachrichtId: lauf.nachrichtId, ausstellerIds: lauf.posten.map((p) => p.ausstellerId) })
                  }
                >
                  Als überwiesen buchen
                </Knopf>
                <Knopf
                  variante="leise"
                  laedt={verwerfen.isPending}
                  onClick={async () => {
                    const g = await grundAbfragen(eingabe, "SEPA-Datei verwerfen", "Warum wird die SEPA-Datei verworfen (z. B. von der Bank abgelehnt)?", "Verwerfen");
                    if (g != null) verwerfen.mutate({ schauId, nachrichtId: lauf.nachrichtId, grund: g });
                  }}
                >
                  Datei verwerfen
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
          <p className="text-grau">Nur durch die Ausstellungsleitung.</p>
        ) : schau.data && schau.data.phase !== "abrechnung" ? (
          <p className="text-grau">Erst in der Phase „Abrechnung“ möglich.</p>
        ) : !schau.data?.vereinIban ? (
          <Hinweis ton="warnung">Vereinskonto fehlt – IBAN und Kontoinhaber in den Einstellungen eintragen.</Hinweis>
        ) : ueberweisbar.length === 0 ? (
          <p className="text-grau">
            Keine offenen Überweisungen.{ohneIban > 0 && ` ${ohneIban} Aussteller ohne IBAN (bar).`}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <p>
              <span className="font-semibold">{ueberweisbar.length} Aussteller</span> mit IBAN, zusammen{" "}
              <span className="font-semibold">{formatEuro(ueberweisbar.reduce((s, z) => s + z.nochOffenCent, 0))}</span>
              {ohneIban > 0 && <span className="text-grau"> · {ohneIban} ohne IBAN (bar)</span>}
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Feld label="Ausführung am">{(id) => <Eingabe id={id} type="date" value={ausfuehrung} onChange={(e) => setAusfuehrung(e.target.value)} className="w-44" />}</Feld>
              <Knopf variante="primaer" laedt={erstellen.isPending} onClick={() => erstellen.mutate({ schauId, ausfuehrungAm: ausfuehrung })}>
                SEPA-Datei erstellen
              </Knopf>
            </div>
          </div>
        )}
      </Abschnitt>
      <TabellenRahmen
        kopf={
          <>
            <Suchfeld aria-label="Aussteller suchen" placeholder="Aussteller suchen" value={q} onChange={(e) => setQ(e.target.value)} />
            <Segmente
              label="Stand"
              wert={filter}
              onChange={setFilter}
              optionen={[
                { wert: "" as const, label: "Alle", anzahl: liste.data.length },
                { wert: "offen" as const, label: "offen", anzahl: offen },
                { wert: "erledigt" as const, label: "erledigt", anzahl: liste.data.length - offen },
              ]}
            />
          </>
        }
        fuss={
          zeilen.length > 0 ? (
            <>
              <span>{zeilen.length} Aussteller</span>
              <span>Saldo {formatEuro(zeilenSaldo)}</span>
            </>
          ) : undefined
        }
      >
        {zeilen.length === 0 ? (
          <p className="px-4 py-10 text-center text-grau">{q || filter ? "Keine Treffer." : "Keine Aussteller."}</p>
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th>Aussteller</th>
                <th className="text-right">Preisgeld</th>
                <th className="text-right">Verkauf</th>
                <th className="text-right">Provision</th>
                <th className="text-right">Meldegeld offen / zu viel</th>
                <th className="text-right">Saldo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.ausstellerId}>
                  <td>
                    <span className="font-semibold text-tinte">{z.name}</span>
                    <span className="block text-sm text-grau">{z.ort}, {z.tiere} Tiere</span>
                    <span className="block text-sm text-grau">{z.iban ? `IBAN ${formatIban(z.iban)}` : "ohne IBAN – bar"}</span>
                  </td>
                  <td className="text-right tabular-nums">{formatEuro(z.preisgeldCent)}</td>
                  <td className="text-right tabular-nums">
                    {formatEuro(z.verkaufCent)}
                    {z.verkaufAusstehendCent > 0 && <span className="block text-sm text-kamm">+ {formatEuro(z.verkaufAusstehendCent)} Überweisung offen</span>}
                  </td>
                  <td className="text-right tabular-nums">{z.provisionCent ? `−${formatEuro(z.provisionCent)}` : formatEuro(0)}</td>
                  <td className="text-right tabular-nums">{z.offenCent ? `−${formatEuro(z.offenCent)}` : z.ueberzahltCent ? `+${formatEuro(z.ueberzahltCent)}` : "–"}</td>
                  <td className={`text-right text-lg font-semibold tabular-nums ${z.saldoCent < 0 ? "text-kamm" : ""}`}>
                    {formatEuro(z.saldoCent)}
                    {z.differenzCent !== 0 && (
                      <span className="mt-1 block">
                        <Marke ton="warnung">Abweichung {z.differenzCent > 0 ? "+" : "−"}{formatEuro(Math.abs(z.differenzCent))}</Marke>
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {z.inUeberweisung ? (
                      <Marke ton="info">in SEPA-Datei, {formatEuro(z.inUeberweisung.betragCent)}</Marke>
                    ) : z.imEinzug ? (
                      <Marke ton="info">Meldegeld in Lastschrift, {formatEuro(z.imEinzug.betragCent)}</Marke>
                    ) : z.auszahlung ? (
                      <span className="flex flex-col items-end gap-1.5">
                        <Marke ton="ok">ausgezahlt {formatEuro(z.ausgezahltCent)}</Marke>
                        <span className="flex flex-wrap justify-end gap-x-3 text-sm">
                          {z.buchungen.map((b) =>
                            b.storniertAm ? (
                              <span key={b.id} className="text-grau line-through" title={`storniert: ${b.stornoGrund}`}>Quittung {b.quittungNr}</span>
                            ) : (
                              <a key={b.id} href={`/datei/${schauId}/abrechnung.pdf?aussteller=${z.ausstellerId}&quittung=${b.quittungNr}`} target="_blank" rel="noreferrer" className="text-tinte hover:text-band">
                                Quittung {b.quittungNr} ({b.art === "ueberweisung" ? "überwiesen" : "bar"} {formatEuro(b.betragCent)})
                              </a>
                            ),
                          )}
                        </span>
                        <span className="flex gap-2">
                          {/* Nachzahlungen und Rückforderungen bucht nur die Ausstellungsleitung. */}
                          {z.nochOffenCent !== 0 && istAdmin && kasseOffen && (
                            <Knopf variante="primaer" onClick={() => abrechnen(z, "bar")}>
                              Differenz {z.nochOffenCent > 0 ? "bar auszahlen" : "bar zurückfordern"} {formatEuro(Math.abs(z.nochOffenCent))}
                            </Knopf>
                          )}
                          {z.nochOffenCent !== 0 && istAdmin && kasseOffen && (
                            <Knopf variante="leise" onClick={() => abrechnen(z, "ueberweisung")}>
                              {z.nochOffenCent > 0 ? "als Überweisung" : "Überweisung eingegangen"}
                            </Knopf>
                          )}
                          {z.nochOffenCent !== 0 && !istAdmin && <span className="text-sm text-grau">Differenz: Ausstellungsleitung</span>}
                          {istAdmin && schau.data?.phase !== "abgeschlossen" && (
                            <Knopf
                              variante="leise"
                              onClick={async () => {
                                const g = await grundAbfragen(
                                  eingabe,
                                  `Quittung ${z.auszahlung!.quittungNr} stornieren?`,
                                  "Nur, wenn kein Geld geflossen ist (Fehlbuchung, Überweisung zurückgebucht). Für Korrekturen „Differenz“ verwenden.",
                                  "Stornieren",
                                );
                                if (g != null) stornieren.mutate({ schauId, id: z.auszahlung!.id, grund: g });
                              }}
                            >
                              Stornieren
                            </Knopf>
                          )}
                        </span>
                      </span>
                    ) : z.saldoCent === 0 ? (
                      <span className="text-sm text-grau">nichts offen</span>
                    ) : !kasseOffen ? (
                      <span className="text-sm text-grau">offen {formatEuro(z.nochOffenCent)}</span>
                    ) : (
                      <Knopf variante={z.ueberweisbar ? "zweit" : "primaer"} onClick={() => abrechnen(z, "bar")}>
                        Bar abrechnen {formatEuro(Math.abs(z.nochOffenCent))}
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
      meldung(`${r.gebucht} Erstattung(en) gebucht.`);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const zuErstatten = (liste.data ?? []).filter((x) => x.restCent > 0);
  if (!liste.data?.length) return null;
  const summeRest = zuErstatten.reduce((n, x) => n + x.restCent, 0);
  return (
    <TabellenRahmen
      kopf={<h2 className="text-[1.07rem] font-semibold text-tinte">{schau.data?.abgesagtAm ? `Erstattungen – Schau abgesagt (${schau.data.absageGrund})` : "Stornierte Meldungen mit Zahlungseingang"}</h2>}
      fuss={
        <>
          <span>
            {liste.data.length} {liste.data.length === 1 ? "Meldung" : "Meldungen"}, zu erstatten {formatEuro(summeRest)}
          </span>
          {istAdmin && zuErstatten.length > 0 && (
            <span className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                Überwiesen am
                <Eingabe type="date" value={tag} onChange={(e) => setTag(e.target.value)} className="w-44" />
              </label>
              <Knopf
                variante="primaer"
                laedt={buchen.isPending}
                onClick={async () => {
                  if (await bestaetige({ titel: "Erstattungen buchen", text: `${zuErstatten.length} Erstattung(en) über zusammen ${formatEuro(summeRest)} als überwiesen buchen? Erst buchen, wenn das Geld tatsächlich überwiesen ist.`, knopf: "Buchen" }))
                    buchen.mutate({ schauId, datum: tag, meldungIds: zuErstatten.map((x) => x.meldungId) });
                }}
              >
                Erstattungen als überwiesen buchen
              </Knopf>
            </span>
          )}
        </>
      }
    >
      <table className="tabelle">
        <thead>
          <tr>
            <th>Aussteller</th>
            <th>Kontoinhaber</th>
            <th>IBAN</th>
            <th className="text-right">Betrag</th>
          </tr>
        </thead>
        <tbody>
          {liste.data.map((x) => (
            <tr key={x.meldungId}>
              <td className="font-semibold text-tinte">{x.name}</td>
              <td>{x.kontoinhaber}</td>
              <td className="whitespace-nowrap tabular-nums">{x.iban ? formatIban(x.iban) : <span className="text-kamm">keine IBAN</span>}</td>
              <td className="text-right tabular-nums">{formatEuro(x.restCent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TabellenRahmen>
  );
}
