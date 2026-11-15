import { KAEFIG_TYPEN, kaefigNameLang, NACHWEIS_LABEL, type KaefigTyp, type Nachweisart } from "@schau/domain";
import { useEffect, useState, type FormEvent } from "react";
import { datumZeit, fehlerText, formatEuro, formatKatalognummer, heuteIso } from "../lib";
import { useSchauId } from "../rahmen";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, FehlerAnzeige, Feld, Haken, Hinweis, Knopf, KnopfLink, Laden, Leer, Marke, SEITE, Segmente, Seitenkopf, Suchfeld, TabellenRahmen, useFrage, useMeldung } from "../ui";
import { EINTRAG_STATUS_LABEL } from "./katalog";

type Treffer = Ausgabe["halle"]["suche"][number];

type Modus = "einlieferung" | "aussetzen" | "gesundheit";
const MODI: Record<Modus, { titel: string; umschalter: string; hilfe: string }> = {
  einlieferung: { titel: "Einlieferung", umschalter: "Einlieferung", hilfe: "phase-einlieferung" },
  aussetzen: { titel: "Tierausgabe", umschalter: "Tierausgabe", hilfe: "phase-aussetzen-abrechnung-tierausgabe" },
  gesundheit: { titel: "Tiergesundheit", umschalter: "Gesundheit", hilfe: "phase-einlieferung" },
};

export function Einlieferung() {
  const schauId = useSchauId();
  const [q, setQ] = useState("");
  const [modus, setModus] = useState<Modus>("einlieferung");
  // Erst suchen, wenn eine Viertelsekunde nicht getippt wurde – nicht bei jedem Tastendruck.
  const [suche, setSuche] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setSuche(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const treffer = trpc.halle.suche.useQuery({ schauId, q: suche }, { enabled: suche.trim().length >= 1, placeholderData: (a) => a });
  return (
    <div className={SEITE}>
      <Seitenkopf
        titel={MODI[modus].titel}
        hilfe={MODI[modus].hilfe}
        aktionen={
          <>
            <KnopfLink href={`/datei/${schauId}/tierliste.pdf`} target="_blank" rel="noreferrer">Aussteller- und Tierliste für das Veterinäramt (PDF)</KnopfLink>
            <KnopfLink href={`/datei/${schauId}/tierliste.csv`}>als Tabelle (CSV)</KnopfLink>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Segmente label="Arbeitsmodus" wert={modus} onChange={setModus} optionen={(Object.keys(MODI) as Modus[]).map((m) => ({ wert: m, label: MODI[m].umschalter }))} />
        {modus !== "gesundheit" && (
          <Suchfeld aria-label="Aussteller oder Katalognummer" placeholder="Name des Ausstellers oder Katalognummer" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md! text-lg" autoFocus />
        )}
      </div>
      {modus === "gesundheit" ? (
        <Gesundheit schauId={schauId} />
      ) : q.trim().length === 0 ? (
        <Leer titel="Wer steht vor Ihnen?" />
      ) : treffer.error ? (
        <FehlerAnzeige fehler={treffer.error} nochmal={() => treffer.refetch()} />
      ) : treffer.isLoading ? (
        <Laden />
      ) : treffer.data?.length === 0 ? (
        <Leer titel="Nichts gefunden">Nur bestätigte Meldungen mit Katalognummer.</Leer>
      ) : (
        <div className="flex flex-col gap-4">
          {treffer.data?.map((t) => <AusstellerKarte key={t.meldung.id} t={t} schauId={schauId} modus={modus} />)}
        </div>
      )}
    </div>
  );
}

/** In der Halle: eingeliefert, oder bewertet, obwohl die Einlieferung (Nachweis offen) nicht abgehakt ist. */
const inDerHalle = (x: { status: string; bewertet?: boolean }) => x.status === "eingeliefert" || (x.status === "katalogisiert" && !!x.bewertet);
/** Sammelausgabe: alle in der Halle außer verkauften (die gehen einzeln gegen Kaufbeleg). */
const ausgebbar = (x: { status: string; bewertet?: boolean; verkaufBelegNr?: number | null }) => inDerHalle(x) && x.verkaufBelegNr == null;

function AusstellerKarte({ t, schauId, modus }: { t: Treffer; schauId: number; modus: Modus }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe, bestaetige } = useFrage();
  const status = trpc.halle.statusSetzen.useMutation({
    onSuccess: () => utils.halle.suche.invalidate(),
    onError: (e, v) => {
      // Nachweis nicht geprüft, Tier gesperrt, Ergebnisse freigegeben: bewusst übersteuern nur mit Grund (steht im Protokoll).
      if (e.data?.code === "PRECONDITION_FAILED" && !v.uebersteuern) {
        void eingabe({ titel: "Trotzdem fortfahren?", text: e.message, feld: "Grund (bitte ohne Personennamen)", mindestens: 3, knopf: "Fortfahren" }).then((grund) => {
          if (grund != null) status.mutate({ ...v, uebersteuern: grund });
        });
        return;
      }
      meldung(fehlerText(e), "fehler");
    },
  });
  const vet = trpc.halle.vetSetzen.useMutation({
    onSuccess: () => {
      utils.halle.suche.invalidate();
      meldung("Nachweis gespeichert.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const m = t.meldung;
  const [nw, setNw] = useState({
    nd: { datum: m.vetImpfdatum ?? "", impfstoff: m.vetImpfstoff, tierarzt: m.vetTierarzt },
    pmv: { datum: m.pmvImpfdatum ?? "", impfstoff: m.pmvImpfstoff, tierarzt: m.pmvTierarzt },
    wg: { datum: m.wgDatum ?? "", sentinel: m.wgSentinel, stelle: m.wgStelle },
    kl: { datum: m.klDatum ?? "", tierarzt: m.klTierarzt },
    gz: { datum: m.gzDatum ?? "", nummer: m.gzNummer },
  });
  const geprueft = !!m.vetGeprueftAm;
  /** Speichert die Angaben – beim Verlassen eines Feldes nur, wenn sich etwas geändert hat. */
  const speichereNachweis = (pruefung: boolean, nurBeiAenderung = false) => {
    const geaendert =
      nw.nd.datum !== (m.vetImpfdatum ?? "") || nw.nd.impfstoff !== m.vetImpfstoff || nw.nd.tierarzt !== m.vetTierarzt ||
      nw.pmv.datum !== (m.pmvImpfdatum ?? "") || nw.pmv.impfstoff !== m.pmvImpfstoff || nw.pmv.tierarzt !== m.pmvTierarzt ||
      nw.wg.datum !== (m.wgDatum ?? "") || nw.wg.sentinel !== m.wgSentinel || nw.wg.stelle !== m.wgStelle ||
      nw.kl.datum !== (m.klDatum ?? "") || nw.kl.tierarzt !== m.klTierarzt || nw.gz.datum !== (m.gzDatum ?? "") || nw.gz.nummer !== m.gzNummer;
    if (nurBeiAenderung && !geaendert) return;
    const impf = (x: { datum: string; impfstoff: string; tierarzt: string }) => ({ datum: x.datum || null, impfstoff: x.impfstoff.trim(), tierarzt: x.tierarzt.trim() });
    vet.mutate({
      meldungId: m.id,
      nd: impf(nw.nd),
      pmv: impf(nw.pmv),
      wg: { datum: nw.wg.datum || null, sentinel: nw.wg.sentinel, stelle: nw.wg.stelle.trim() },
      kl: { datum: nw.kl.datum || null, tierarzt: nw.kl.tierarzt.trim() },
      gz: { datum: nw.gz.datum || null, nummer: nw.gz.nummer.trim() },
      geprueft: pruefung,
    });
  };
  // Immer speichern, auch wenn der Fokus auf den Haken geht: er speichert nur, wenn er umgeschaltet wird.
  // Der Blur kommt vor dem Klick, beide Anfragen tragen dieselben Angaben.
  const beimVerlassen = () => speichereNachweis(geprueft, true);
  const setze = (ids: number[], s: "katalogisiert" | "eingeliefert" | "fehlt" | "ausgesetzt") => status.mutate({ schauId, ids, status: s });
  /** Verkaufte Tiere nur gegen Kaufbeleg ausgeben: die Nummer wird geprüft und protokolliert. */
  const ausgeben = async (x: (typeof t.tiere)[number]) => {
    if (x.verkaufBelegNr == null) return setze([x.id], "ausgesetzt");
    const nr = (
      await eingabe({ titel: "Verkauftes Tier ausgeben", text: `Nr. ${formatKatalognummer(x)} ist verkauft.`, feld: "Nummer des Kaufbelegs, den der Käufer vorlegt", einzeilig: true, knopf: "Ausgeben" })
    )?.trim();
    if (!nr) return;
    if (!/^\d+$/.test(nr)) return meldung("Bitte nur die Belegnummer (Ziffern) eingeben.", "fehler");
    status.mutate({ schauId, ids: [x.id], status: "ausgesetzt", belegNr: Number(nr) });
  };
  const ring: ReturnType<typeof trpc.halle.ringnummerSetzen.useMutation> = trpc.halle.ringnummerSetzen.useMutation({
    onSuccess: () => utils.halle.suche.invalidate(),
    onError: (e, v): void => {
      // Nach Freigabe/Verkauf/Abschluss verlangt der Server einen Grund (nur Ausstellungsleitung).
      if (!v.grund && e.message.includes("Grund für die Änderung")) {
        void eingabe({ titel: "Ringnummer ändern", text: "Die Ringnummer steht schon auf Belegen.", feld: "Grund für die Änderung (steht im Protokoll)", mindestens: 3, knopf: "Ändern" }).then((grund) => {
          if (grund != null) return ring.mutate({ ...v, grund });
          meldung(fehlerText(e), "fehler");
          void utils.halle.suche.invalidate();
        });
        return;
      }
      meldung(fehlerText(e), "fehler");
      void utils.halle.suche.invalidate();
    },
  });
  // Anderer Käfig für ein einzelnes Tier, z. B. das Zwerghuhn in den letzten freien Großkäfig.
  const kaefig = trpc.halle.kaefigSetzen.useMutation({
    onSuccess: () => {
      void utils.halle.suche.invalidate();
      void utils.katalog.kaefigbedarf.invalidate();
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const masse = trpc.schau.get.useQuery({ id: schauId }).data?.kaefigMasse;
  const tiere = t.tiere.filter((x) => x.katalogNr != null);
  // Meldegeld bar kassieren (gleicher Weg wie in der Meldung: Kassenbuch, Einzahlungsquittung, Protokoll).
  const kassieren = trpc.meldung.zahlungErfassen.useMutation({
    onSuccess: () => {
      void utils.halle.suche.invalidate();
      void utils.meldung.invalidate();
      meldung("Meldegeld bar kassiert und im Kassenbuch gebucht.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const offen = t.geld.offenCent;
  const barKassieren = async () => {
    if (offen <= 0) return;
    if (!(await bestaetige({ titel: "Bar kassieren", text: `${formatEuro(offen)} von ${t.name} bar erhalten?`, knopf: "Bar erhalten" }))) return;
    // Der angezeigte offene Betrag geht mit: hat inzwischen jemand anders kassiert, lehnt der Server ab (kein Doppelkassieren).
    // Mit zugesagter Stiftung oder Spende die Anteile auf Quittung und im Kassenbuch ausweisen.
    const stiftung = Math.min(t.geld.stiftungCent, offen);
    const spende = Math.min(t.geld.spendeCent, offen - stiftung);
    const teile = [stiftung > 0 && `Stiftung ${formatEuro(stiftung)}`, spende > 0 && `Spende ${formatEuro(spende)}`].filter(Boolean);
    const grund = teile.length ? `davon Meldegeld ${formatEuro(offen - stiftung - spende)}, ${teile.join(", ")}` : "";
    kassieren.mutate({ meldungId: m.id, betragCent: offen, datum: heuteIso(), art: "bar", grund, erwartetOffenCent: offen });
  };
  const anzahl = (s: string) => tiere.filter((x) => x.status === s).length;

  return (
    <TabellenRahmen
      kopf={
        <>
          <h2 className="mr-auto min-w-0 text-[1.07rem] font-semibold text-tinte">
            {t.name}
            {t.ort && <span className="font-normal text-grau">, {t.ort}</span>}
          </h2>
          {modus === "einlieferung" ? (
            <Knopf variante="primaer" onClick={() => setze(tiere.filter((x) => x.status === "katalogisiert").map((x) => x.id), "eingeliefert")} disabled={!tiere.some((x) => x.status === "katalogisiert")}>
              Alle als eingeliefert
            </Knopf>
          ) : (
            <Knopf variante="primaer" onClick={() => setze(tiere.filter(ausgebbar).map((x) => x.id), "ausgesetzt")} disabled={!tiere.some(ausgebbar)}>
              Alle nicht verkauften ausgeben
            </Knopf>
          )}
        </>
      }
      fuss={
        <>
          <span>{tiere.length} {tiere.length === 1 ? "Tier" : "Tiere"}</span>
          <span>
            {modus === "einlieferung"
              ? `${anzahl("eingeliefert")} eingeliefert${anzahl("fehlt") ? `, ${anzahl("fehlt")} fehlen` : ""}`
              : `${anzahl("ausgesetzt")} ausgegeben`}
          </span>
        </>
      }
    >
      <div className={modus === "einlieferung" ? "grid lg:grid-cols-[minmax(0,1fr)_19rem]" : ""}>
        <div className="min-w-0 overflow-x-auto">
          <table className="tabelle tabelle-stapel">
            <thead>
              <tr>
                <th className="text-right">Nr.</th>
                <th>Tier</th>
                <th>Käfig</th>
                <th>Ring</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tiere.map((x) => (
                <tr key={x.id}>
                  <td data-label="Nr." className="nummer text-right text-lg">{formatKatalognummer(x)}</td>
                  <td data-label="Tier">
                    <span className="text-tinte">{x.bezeichnung}</span>
                    <span className="block text-sm text-grau">{x.geschlecht} {x.alter}</span>
                    {(x.verkaufBelegNr != null || x.gesperrt) && (
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {x.verkaufBelegNr != null && (
                          <>
                            <Marke ton="warnung">verkauft, Beleg {x.verkaufBelegNr}</Marke>
                            <span className="text-sm text-grau">an {x.verkauftAn}</span>
                          </>
                        )}
                        {x.gesperrt && <Marke ton="fehler">gesperrt</Marke>}
                      </span>
                    )}
                  </td>
                  <td data-label="Käfig">
                    {modus === "einlieferung" && x.kaefigAuto ? (
                      <Auswahl
                        aria-label={`Käfig für ${formatKatalognummer(x)}`}
                        disabled={kaefig.isPending}
                        value={x.kaefigWahl ?? ""}
                        onChange={(e) => kaefig.mutate({ schauId, id: x.id, typ: (e.target.value || null) as KaefigTyp | null })}
                        kompakt
                        className={`min-w-44 max-w-64 text-sm ${x.kaefigWahl ? "border-stroh-dunkel font-semibold" : ""}`}
                      >
                        <option value="">{kaefigNameLang(x.kaefigAuto, masse)} (automatisch)</option>
                        {KAEFIG_TYPEN.filter((k) => k !== x.kaefigAuto || k === x.kaefigWahl).map((k) => (
                          <option key={k} value={k}>{kaefigNameLang(k, masse)}</option>
                        ))}
                      </Auswahl>
                    ) : (
                      x.kaefigGroesse && <Marke>{x.kaefigGroesse}</Marke>
                    )}
                  </td>
                  <td data-label="Ring">
                    {modus === "einlieferung" ? (
                      <Eingabe
                        aria-label={`Ringnummer ${formatKatalognummer(x)}`}
                        placeholder="Ring-Nr. von der Ringkarte"
                        maxLength={200}
                        defaultValue={x.ringnummern ?? ""}
                        onBlur={(e) => e.target.value.trim() !== (x.ringnummern ?? "") && ring.mutate({ schauId, id: x.id, ringnummern: e.target.value.trim() })}
                        className="min-w-40 max-w-56 text-sm"
                      />
                    ) : (
                      <span className="text-sm">{x.ringnummern || "–"}</span>
                    )}
                  </td>
                  <td data-label="Status">
                    <Marke ton={x.status === "fehlt" ? "fehler" : x.status === "eingeliefert" || x.status === "ausgesetzt" ? "ok" : "neutral"}>{EINTRAG_STATUS_LABEL[x.status]}</Marke>
                  </td>
                  <td className="text-right sm:whitespace-nowrap">
                    {modus === "einlieferung" ? (
                      <>
                        {x.status !== "eingeliefert" && <Knopf variante="leise" onClick={() => setze([x.id], "eingeliefert")}>Ist da</Knopf>}
                        {x.status !== "fehlt" && <Knopf variante="leise" onClick={() => setze([x.id], "fehlt")}>Fehlt</Knopf>}
                      </>
                    ) : x.status === "ausgesetzt" ? (
                      <Knopf variante="leise" onClick={() => setze([x.id], "eingeliefert")}>Zurücknehmen</Knopf>
                    ) : (
                      // Auch bewertete Tiere, deren Einlieferung nicht abgehakt ist (Nachweis offen), waren in der Halle.
                      inDerHalle(x) && <Knopf variante="leise" onClick={() => ausgeben(x)}>Ausgeben</Knopf>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {modus === "einlieferung" && (
          <aside className="flex flex-col gap-5 border-t border-linie p-4 lg:border-l lg:border-t-0">
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-tinte">Meldegeld</h3>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-sm">
                <dt className="text-grau">Meldegeld</dt>
                <dd className="text-right tabular-nums">{formatEuro(t.geld.summeCent)}</dd>
                {t.geld.stiftungCent > 0 && (
                  <>
                    <dt className="text-grau">zugesagte Stiftung</dt>
                    <dd className="text-right tabular-nums">{formatEuro(t.geld.stiftungCent)}</dd>
                  </>
                )}
                {t.geld.spendeCent > 0 && (
                  <>
                    <dt className="text-grau">zugesagte Spende</dt>
                    <dd className="text-right tabular-nums">{formatEuro(t.geld.spendeCent)}</dd>
                  </>
                )}
                <dt className="text-grau">bezahlt</dt>
                <dd className="text-right tabular-nums">{formatEuro(t.geld.bezahltCent)}</dd>
                <dt className="font-semibold">{offen < 0 ? "Guthaben" : "offen"}</dt>
                <dd className="text-right font-semibold tabular-nums">{formatEuro(Math.abs(offen))}</dd>
              </dl>
              {offen > 0 ? (
                <Knopf variante="primaer" onClick={barKassieren} laedt={kassieren.isPending}>
                  {formatEuro(offen)} bar kassiert
                </Knopf>
              ) : (
                <span>
                  <Marke ton={offen < 0 ? "warnung" : "ok"}>{offen < 0 ? "überzahlt" : "bezahlt"}</Marke>
                </span>
              )}
            </section>
            <section className="flex flex-col gap-3 border-t border-linie pt-4">
              <h3 className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-tinte">
                Nachweise
                {vet.isPending ? <span className="font-normal text-grau">Wird gespeichert …</span> : t.nachweise.noetig.length > 0 && geprueft && <Marke ton="ok">geprüft</Marke>}
              </h3>
              {t.nachweise.noetig.length === 0 ? (
                <p className="text-sm text-grau">Kein Nachweis nötig.</p>
              ) : (
                <>
                  {t.nachweise.noetig.map((art: Nachweisart) => (
                    <fieldset key={art} className="flex flex-col gap-2">
                      <legend className="mb-1 text-sm text-grau">{NACHWEIS_LABEL[art]}</legend>
                      {art === "wg" ? (
                        <>
                          <Eingabe aria-label="Datum Untersuchung" type="date" value={nw.wg.datum} onChange={(e) => setNw({ ...nw, wg: { ...nw.wg, datum: e.target.value } })} onBlur={beimVerlassen} />
                          <Eingabe aria-label="Labor oder Behörde" placeholder="Labor bzw. Behörde" maxLength={200} value={nw.wg.stelle} onChange={(e) => setNw({ ...nw, wg: { ...nw.wg, stelle: e.target.value } })} onBlur={beimVerlassen} />
                          <Haken label="Sentinel-Bestätigung (statt Untersuchung)" checked={nw.wg.sentinel} onChange={(v) => setNw({ ...nw, wg: { ...nw.wg, sentinel: v } })} hinweis="Untersuchung ≤ 7 Tage, Sentinel ≤ 12 Monate" />
                        </>
                      ) : art === "kl" ? (
                        <>
                          <Eingabe aria-label="Datum der Untersuchung" type="date" value={nw.kl.datum} onChange={(e) => setNw({ ...nw, kl: { ...nw.kl, datum: e.target.value } })} onBlur={beimVerlassen} />
                          <Eingabe aria-label="Tierarzt der Untersuchung" placeholder="Tierarzt" maxLength={200} value={nw.kl.tierarzt} onChange={(e) => setNw({ ...nw, kl: { ...nw.kl, tierarzt: e.target.value } })} onBlur={beimVerlassen} />
                        </>
                      ) : art === "gz" ? (
                        <>
                          <Eingabe aria-label="Datum des Gesundheitszertifikats" type="date" value={nw.gz.datum} onChange={(e) => setNw({ ...nw, gz: { ...nw.gz, datum: e.target.value } })} onBlur={beimVerlassen} />
                          <Eingabe aria-label="Nummer des Zertifikats oder der TRACES-Meldung" placeholder="Zertifikat- bzw. TRACES-Nummer" maxLength={200} value={nw.gz.nummer} onChange={(e) => setNw({ ...nw, gz: { ...nw.gz, nummer: e.target.value } })} onBlur={beimVerlassen} />
                        </>
                      ) : (
                        <>
                          <Eingabe aria-label={`Impfdatum ${art.toUpperCase()}`} type="date" value={nw[art].datum} onChange={(e) => setNw({ ...nw, [art]: { ...nw[art], datum: e.target.value } })} onBlur={beimVerlassen} />
                          <Eingabe aria-label={`Impfstoff ${art.toUpperCase()}`} placeholder="Impfstoff, Charge" maxLength={200} value={nw[art].impfstoff} onChange={(e) => setNw({ ...nw, [art]: { ...nw[art], impfstoff: e.target.value } })} onBlur={beimVerlassen} />
                          <Eingabe aria-label={`Tierarzt ${art.toUpperCase()}`} placeholder="Tierarzt" maxLength={200} value={nw[art].tierarzt} onChange={(e) => setNw({ ...nw, [art]: { ...nw[art], tierarzt: e.target.value } })} onBlur={beimVerlassen} />
                        </>
                      )}
                    </fieldset>
                  ))}
                  <Haken label="Nachweise liegen vor und sind geprüft" checked={geprueft} onChange={(v) => speichereNachweis(v)} />
                  {!geprueft && t.nachweise.fehler.length > 0 && <p className="text-sm text-kamm">{t.nachweise.fehler.join(" ")}</p>}
                </>
              )}
            </section>
          </aside>
        )}
      </div>
    </TabellenRahmen>
  );
}

/** Gesundheitsjournal der Schau (Art. 25 DelVO (EU) 2019/2035). */
function Gesundheit({ schauId }: { schauId: number }) {
  const liste = trpc.halle.gesundheit.useQuery({ schauId });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe } = useFrage();
  const leer = { nr: "", befund: "", massnahme: "", tierarzt: "", verendet: false, sperre: true };
  const [f, setF] = useState(leer);
  const erfassen = trpc.halle.gesundheitErfassen.useMutation({
    onSuccess: async () => {
      await utils.halle.gesundheit.invalidate();
      setF(leer);
      meldung("Eintrag gespeichert.");
    },
  });
  // Eine Sperre hebt nur die Ausstellungsleitung auf (Funktionstrennung).
  const istAdmin = trpc.auth.status.useQuery().data?.benutzer?.rolle === "admin";
  const freigeben = trpc.halle.gesundheitFreigeben.useMutation({ onSuccess: () => utils.halle.gesundheit.invalidate(), onError: (e) => meldung(fehlerText(e), "fehler") });
  const senden = (e: FormEvent) => {
    e.preventDefault();
    erfassen.mutate({ schauId, ...f });
  };
  const eintraege = liste.data ?? [];
  const gesperrt = eintraege.filter((g) => g.sperre).length;
  const verendet = eintraege.filter((g) => g.verendet).length;
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <Abschnitt titel="Neuer Eintrag">
        <form onSubmit={senden} className="flex flex-col gap-4">
          <Feld label="Katalognummer" hinweis="leer = ohne einzelnes Tier">{(id) => <Eingabe id={id} value={f.nr} onChange={(e) => setF({ ...f, nr: e.target.value })} className="max-w-32" />}</Feld>
          <Feld label="Befund *">{(id) => <Eingabe id={id} value={f.befund} onChange={(e) => setF({ ...f, befund: e.target.value })} required minLength={3} placeholder="z. B. Niesen, Durchfall, matt" />}</Feld>
          <Feld label="Maßnahme">{(id) => <Eingabe id={id} value={f.massnahme} onChange={(e) => setF({ ...f, massnahme: e.target.value })} placeholder="z. B. abgesondert, Aussteller informiert" />}</Feld>
          <Feld label="Tierarzt">{(id) => <Eingabe id={id} value={f.tierarzt} onChange={(e) => setF({ ...f, tierarzt: e.target.value })} />}</Feld>
          <Haken label="Tier ist verendet" checked={f.verendet} onChange={(v) => setF({ ...f, verendet: v })} />
          <Haken label="Für Verkauf und Preise sperren" checked={f.sperre} onChange={(v) => setF({ ...f, sperre: v })} />
          {erfassen.error && <Hinweis ton="fehler">{fehlerText(erfassen.error)}</Hinweis>}
          <Knopf type="submit" variante="primaer" laedt={erfassen.isPending}>Eintragen</Knopf>
        </form>
      </Abschnitt>
      <TabellenRahmen
        kopf={<h2 className="text-[1.07rem] font-semibold text-tinte">Journal</h2>}
        fuss={
          eintraege.length > 0 ? (
            <>
              <span>{eintraege.length} {eintraege.length === 1 ? "Eintrag" : "Einträge"}</span>
              <span>{gesperrt} gesperrt, {verendet} verendet</span>
            </>
          ) : undefined
        }
      >
        {liste.isLoading ? (
          <div className="px-4">
            <Laden />
          </div>
        ) : eintraege.length === 0 ? (
          <p className="px-4 py-10 text-center text-grau">Keine Krankheits- oder Todesfälle erfasst.</p>
        ) : (
          <table className="tabelle tabelle-stapel">
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Tier</th>
                <th>Befund</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {eintraege.map((g) => (
                <tr key={g.id}>
                  <td data-label="Zeit" className="whitespace-nowrap text-sm text-grau">{datumZeit(g.zeitpunkt)}</td>
                  <td data-label="Tier">
                    <span className="font-semibold text-tinte">{g.tier ? `${formatKatalognummer(g.tier)} ${g.tier.bezeichnung}, ${g.tier.geschlecht} ${g.tier.alter}` : g.tierText || "allgemein"}</span>
                    {g.tier && <span className="block text-sm text-grau">{g.tier.aussteller}</span>}
                  </td>
                  <td data-label="Befund">
                    {g.befund}
                    {(g.massnahme || g.tierarzt) && (
                      <span className="block text-sm text-grau">
                        {g.massnahme}
                        {g.massnahme && g.tierarzt && " · "}
                        {g.tierarzt}
                      </span>
                    )}
                  </td>
                  <td data-label="Status">
                    <span className="flex flex-wrap gap-1">
                      {g.verendet && <Marke ton="fehler">verendet</Marke>}
                      {g.sperre ? <Marke ton="warnung">gesperrt</Marke> : g.aufgehobenAm ? <Marke>Sperre aufgehoben</Marke> : null}
                    </span>
                  </td>
                  <td className="text-right sm:whitespace-nowrap">
                    {g.sperre && !g.verendet && istAdmin && (
                      <Knopf
                        variante="leise"
                        onClick={async () => {
                          const grund = await eingabe({ titel: "Sperre aufheben", feld: "Warum wird die Sperre aufgehoben? (z. B. Tierarzt: unbedenklich)", mindestens: 3, knopf: "Sperre aufheben" });
                          if (grund != null) freigeben.mutate({ schauId, id: g.id, grund });
                        }}
                      >
                        Sperre aufheben
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
