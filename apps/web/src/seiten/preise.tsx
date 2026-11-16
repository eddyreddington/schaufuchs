import { bewertungsText, passtZuPreisart, serverText } from "@schau/domain";
import { useState, type FormEvent, type ReactNode } from "react";
import { centZuText, datum, fehlerText, formatEuro, formatKatalognummer, parseEuro, alterLabel } from "../lib";
import { useSchauId } from "../rahmen";
import { useOberflaeche, useSprache } from "../sprache";
import { trpc, type Ausgabe } from "../trpc";
import { Auswahl, Dialog, Eingabe, FehlerAnzeige, Feld, Haken, Hinweis, Knopf, Laden, Marke, SEITE, Seitenkopf, TabellenRahmen, useFrage, useMeldung } from "../ui";

type Daten = Ausgabe["preise"]["uebersicht"];

/** Ruhige Knöpfe in Tabellenzeilen. */
const ZEILE = "min-h-8 px-2 text-sm";

/** Tabelle mit kleiner Überschrift darüber (TabellenRahmen hat keinen Titel). */
function Teil({ titel, aktionen, kopf, fuss, children }: { titel: string; aktionen?: ReactNode; kopf?: ReactNode; fuss?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[1.07rem] font-semibold">{titel}</h2>
        {aktionen}
      </div>
      <TabellenRahmen kopf={kopf} fuss={fuss}>
        {children}
      </TabellenRahmen>
    </section>
  );
}

export function Preise() {
  const schauId = useSchauId();
  const daten = trpc.preise.uebersicht.useQuery({ schauId });
  // Eigene Notenskala der Schau (schau.get liefert sonst die Standardskala)
  const schau = trpc.schau.get.useQuery({ id: schauId });
  const status = trpc.auth.status.useQuery();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe, bestaetige } = useFrage();
  const t = useOberflaeche();
  const tp = t.schautage.preise;
  const g = t.schautage.gemeinsam;
  const sprache = useSprache();
  const reklamationsGrund = (text: string) => eingabe({ titel: tp.reklamation, text: serverText(text, sprache), feld: tp.reklamationFeld, mindestens: 3 });
  const [pr, setPr] = useState<number | "">("");
  const [stiftung, setStiftung] = useState<Partial<Daten["stiftungen"][number]> | null>(null);
  // Gestifteter Preis: erst die Stiftung wählen (Betrag und Vorgabe des Stifters).
  const [stiftungWahl, setStiftungWahl] = useState<{ eintragId: number; nr: string; preisartId: number } | null>(null);
  const neu = () => utils.preise.invalidate();
  const vergeben = trpc.preise.vergeben.useMutation({
    onSuccess: neu,
    onError: (e, v) => {
      // Aussteller schon abgerechnet: nur als Reklamation der AL mit Grund (z. B. versehentlich entzogener Preis).
      if (e.data?.code === "CONFLICT" && e.message.includes("Reklamation") && !v.grund) { // bleibt deutsch (Vergleich mit der Meldung des Servers)
        void reklamationsGrund(e.message).then((grund) => grund != null && vergeben.mutate({ ...v, grund }));
        return;
      }
      meldung(fehlerText(e), "fehler");
    },
  });
  const entfernen = trpc.preise.entfernen.useMutation({
    onSuccess: neu,
    onError: (e, v) => {
      // Aussteller schon abgerechnet: Preisentzug nur als Reklamation mit Grund (die Differenz erscheint in der Abrechnung).
      if (e.data?.code === "CONFLICT" && e.message.includes("Reklamation") && !v.grund) { // bleibt deutsch (Vergleich mit der Meldung des Servers)
        void reklamationsGrund(e.message).then((grund) => grund != null && entfernen.mutate({ ...v, grund }));
        return;
      }
      meldung(fehlerText(e), "fehler");
    },
  });
  const freigeben = trpc.preise.freigeben.useMutation({
    onSuccess: (_r, v) => {
      utils.invalidate();
      meldung(v.freigegeben ? tp.freigegebenMeldung : tp.zurueckgenommenMeldung);
    },
    onError: (e, v) => {
      // Hinweise (frühe Phase, freie Preise aus dem Kontingent): bewusst bestätigen, dann freigeben.
      if (e.data?.code === "PRECONDITION_FAILED" && !v.trotzdem) {
        void bestaetige(
          v.freigegeben
            ? { titel: tp.trotzdemFreigeben, text: serverText(e.message, sprache), knopf: tp.freigeben }
            : { titel: tp.trotzdemZuruecknehmen, text: serverText(e.message, sprache), knopf: tp.zuruecknehmen, gefahr: true },
        ).then((ja) => ja && freigeben.mutate({ ...v, trotzdem: true }));
        return;
      }
      meldung(fehlerText(e), "fehler");
    },
  });
  const barErhalten = trpc.preise.stiftungBarErhalten.useMutation({
    onSuccess: () => {
      neu();
      meldung(tp.stiftungGebucht);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const loeschen = trpc.preise.stiftungLoeschen.useMutation({
    onSuccess: () => {
      neu();
      meldung(tp.stiftungGeloescht);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });

  if (daten.error) return <FehlerAnzeige fehler={daten.error} nochmal={() => daten.refetch()} />;
  if (!daten.data) return <Laden />;
  const skala = schau.data?.notenskala;
  const d = daten.data;
  /** Aus einer Stiftung schon vergebene Preise. */
  const benutzt = (stiftungId: number) => d.eintraege.reduce((n, e) => n + e.preise.filter((p) => p.stiftungId === stiftungId).length, 0);
  const istAdmin = status.data?.benutzer?.rolle === "admin";
  const liste = d.eintraege.filter((e) => pr === "" || e.preisrichterId === pr).sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0) || (a.katalogNr ?? 0) - (b.katalogNr ?? 0));

  const preiseVergeben = d.eintraege.reduce((n, e) => n + e.preise.length, 0);
  const geldOhneMeldung = d.stiftungen.filter((s) => s.meldungId == null);

  return (
    <div className={SEITE}>
      <Seitenkopf
        titel={tp.titel}
        unter={tp.unter(d.eintraege.length, preiseVergeben)}
        marke={
          <>
            {d.freigegeben && <Marke ton="ok">{g.freigegeben}</Marke>}
            {!istAdmin && <Marke>{g.nurLesen}</Marke>}
          </>
        }
        hilfe="phase-preise-freigabe-preise-vergeben"
        aktionen={
          istAdmin &&
          (d.freigegeben ? (
            <Knopf
              onClick={async () => {
                const grund = await eingabe({
                  titel: tp.freigabeZuruecknehmenFrage,
                  text: tp.freigabeZuruecknehmenText,
                  feld: tp.grund,
                  mindestens: 3,
                  knopf: tp.zuruecknehmen,
                  gefahr: true,
                });
                if (grund != null) freigeben.mutate({ schauId, freigegeben: false, grund });
              }}
            >
              {tp.freigabeZuruecknehmen}
            </Knopf>
          ) : (
            <Knopf variante="primaer" laedt={freigeben.isPending} onClick={() => freigeben.mutate({ schauId, freigegeben: true })}>
              {tp.ergebnisseFreigeben}
            </Knopf>
          ))
        }
      />

      <Teil titel={d.kontingentJe === "schau" ? tp.kontingentSchau : tp.kontingentRichter}>
        <table className="tabelle">
          <thead>
            <tr>
              <th>{d.kontingentJe === "schau" ? tp.bereich : t.allgemein.preisrichter}</th>
              <th className="text-right">{t.allgemein.tiere}</th>
              <th className="text-right">{tp.bewertet}</th>
              {d.preisarten.filter((p) => p.quelle === "standgeld").map((p) => <th key={p.id} className="text-right">{p.kuerzel}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.kontingente.map((k) => (
              <tr key={k.preisrichterId}>
                <td className="font-semibold text-tinte">{k.name}</td>
                <td className="text-right tabular-nums">{k.tiere}</td>
                <td className="text-right tabular-nums">{k.bewertet}</td>
                {k.arten.map((a) => (
                  <td key={a.preisartId} className={`whitespace-nowrap text-right tabular-nums ${a.vergeben < a.verfuegbar ? "text-stroh-dunkel" : ""}`}>
                    {a.vergeben} / {a.verfuegbar}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Teil>

      <Teil
        titel={tp.tiereMitPunkten}
        kopf={
          <Auswahl aria-label={t.allgemein.preisrichter} value={pr} onChange={(e) => setPr(e.target.value ? Number(e.target.value) : "")} className="max-w-64">
            <option value="">{g.allePreisrichter}</option>
            {d.kontingente.map((k) => <option key={k.preisrichterId} value={k.preisrichterId}>{k.name}</option>)}
          </Auswahl>
        }
        fuss={
          liste.length > 0 ? (
            <>
              <span>{g.tiere(liste.length)}</span>
              <span>{tp.preiseAnzahl(liste.reduce((n, e) => n + e.preise.length, 0))}</span>
            </>
          ) : undefined
        }
      >
        {liste.length === 0 ? (
          <p className="px-4 py-10 text-center text-grau">{tp.keineTiere}</p>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="tabelle">
              <thead className="sticky top-0 z-10 bg-weiss">
                <tr>
                  <th className="text-right">{g.nr}</th>
                  <th>{t.allgemein.tier}</th>
                  <th>{tp.note}</th>
                  <th>{tp.preise}</th>
                  <th>{tp.vergeben}</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((e) => (
                  <tr key={e.id}>
                    <td className="nummer text-right text-lg">{formatKatalognummer(e)}</td>
                    <td>
                      <span className="font-semibold text-tinte">{e.bezeichnung}</span>, {e.geschlecht} {alterLabel(e.alter)}
                      <span className="block text-sm text-grau">{e.ausstellerName}</span>
                    </td>
                    <td className="whitespace-nowrap font-semibold">{bewertungsText({ punkte: e.punkte, sondernote: e.sondernote }, skala)}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {e.preise.map((p) => (
                          <button
                            key={p.preisartId}
                            type="button"
                            title={p.stiftungId ? tp.gestiftetVon(d.stiftungen.find((st) => st.id === p.stiftungId)?.stifter ?? "?") : tp.preisEntfernen}
                            disabled={!istAdmin}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] border border-band/30 bg-band-hell px-1.5 py-px text-sm font-semibold text-band-dunkel enabled:hover:border-kamm/40 enabled:hover:bg-kamm-hell enabled:hover:text-kamm"
                            onClick={async () =>
                              (await bestaetige({ titel: tp.entfernenFrage(p.name, formatKatalognummer(e)), knopf: t.allgemein.entfernen, gefahr: true })) &&
                              entfernen.mutate({ schauId, preisvergabeId: p.vergabeId })
                            }
                          >
                            {p.kuerzel} {istAdmin && <span aria-hidden className="font-normal">✕</span>}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-0.5">
                        {istAdmin && d.preisarten
                          .filter((p) => !e.preise.some((x) => x.preisartId === p.id))
                          // Bindung der Preisart: nur Jugend/Senioren, Sparte.
                          .filter((p) => passtZuPreisart(p, e))
                          // Je Tier nur ein Geldpreis aus dem Standgeld (E oder Z); Bänder und Stiftungen zusätzlich.
                          .filter((p) => !(p.quelle === "standgeld" && p.betragCent > 0 && e.preise.some((x) => x.quelle === "standgeld" && x.betragCent > 0)))
                          // Ausgeschöpfte Kontingente nicht anbieten (der Server lehnte sonst erst nach dem Klick ab).
                          .filter((p) => {
                            const k = d.kontingentJe === "schau" ? d.kontingente[0] : d.kontingente.find((x) => x.preisrichterId === e.preisrichterId);
                            const a = k?.arten.find((x) => x.preisartId === p.id);
                            return !a || a.vergeben < a.verfuegbar;
                          })
                          .map((p) => (
                            <Knopf
                              key={p.id}
                              variante="leise"
                              className={ZEILE}
                              onClick={() =>
                                p.quelle === "stiftung" && d.stiftungen.some((st) => st.preisartId === p.id)
                                  ? setStiftungWahl({ eintragId: e.id, nr: formatKatalognummer(e), preisartId: p.id })
                                  : vergeben.mutate({ schauId, katalogeintragId: e.id, preisartId: p.id })
                              }
                            >
                              + {p.kuerzel}
                            </Knopf>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Teil>

      <Teil
        titel={tp.stiftungen}
        aktionen={istAdmin && <Knopf onClick={() => setStiftung({})}>{tp.stiftungEintragen}</Knopf>}
        fuss={
          d.stiftungen.some((s) => s.betragCent > 0) ? (
            // Abstimmung: was an Geldstiftungen eingegangen ist und was davon als Preisgeld vergeben wurde.
            <>
              <span>
                {tp.eingegangen(formatEuro(geldOhneMeldung.filter((s) => s.eingegangenAm).reduce((n, s) => n + s.betragCent, 0)), formatEuro(geldOhneMeldung.reduce((n, s) => n + s.betragCent, 0)))}
                {" · "}
                {tp.mitMeldegeldZugesagt(formatEuro(d.stiftungen.filter((s) => s.meldungId != null).reduce((n, s) => n + s.betragCent, 0)))}
              </span>
              <span>
                {tp.alsPreisgeld(formatEuro(d.eintraege.reduce((n, e) => n + e.preise.filter((p) => p.stiftungId != null).reduce((m, p) => m + p.betragCent, 0), 0)))}
              </span>
            </>
          ) : undefined
        }
      >
        {d.stiftungen.length === 0 ? (
          <p className="px-4 py-10 text-center text-grau">{tp.keineStiftungen}</p>
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th>{tp.stifter}</th>
                <th>{tp.preisart}</th>
                <th className="text-right">{tp.anzahl}</th>
                <th className="text-right">{tp.vergeben}</th>
                <th className="text-right">{t.allgemein.betrag}</th>
                <th>{tp.vorgabe}</th>
                <th>{tp.eingang}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.stiftungen.map((s) => (
                <tr key={s.id}>
                  <td>
                    {istAdmin ? (
                      <button type="button" className="text-left font-semibold text-tinte hover:text-band hover:underline" onClick={() => setStiftung(s)}>
                        {s.stifter}
                      </button>
                    ) : (
                      <span className="font-semibold text-tinte">{s.stifter}</span>
                    )}
                  </td>
                  <td>{d.preisarten.find((p) => p.id === s.preisartId)?.name ?? "–"}</td>
                  <td className="text-right tabular-nums">{s.anzahl}</td>
                  <td className="text-right tabular-nums">{s.preisartId == null ? <Marke ton="warnung">{tp.keinePreisart}</Marke> : benutzt(s.id)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{formatEuro(s.betragCent)}</td>
                  <td className="text-sm">{s.vorgabe}</td>
                  <td className="whitespace-nowrap">{datum(s.eingegangenAm)}</td>
                  <td>
                    <div className="flex flex-wrap items-center justify-end gap-0.5">
                      {s.kassenbewegungId != null && <Marke ton="ok">{tp.inDerKasse}</Marke>}
                      {istAdmin && s.meldungId == null && s.kassenbewegungId == null && !s.eingegangenAm && s.betragCent > 0 && (
                        <Knopf
                          variante="leise"
                          className={ZEILE}
                          laedt={barErhalten.isPending}
                          onClick={async () =>
                            (await bestaetige({ titel: tp.barErhaltenFrage(formatEuro(s.betragCent), s.stifter), text: tp.barErhaltenText, knopf: tp.barErhalten })) &&
                            barErhalten.mutate({ schauId, id: s.id })
                          }
                        >
                          {tp.barErhalten}
                        </Knopf>
                      )}
                      {istAdmin && <Knopf variante="leise" className={ZEILE} onClick={() => setStiftung(s)}>{t.allgemein.bearbeiten}</Knopf>}
                      {istAdmin && (
                        <Knopf
                          variante="leise"
                          className={`${ZEILE} text-grau hover:bg-kamm-hell hover:text-kamm`}
                          aria-label={tp.stiftungLoeschen}
                          onClick={async () => (await bestaetige({ titel: tp.stiftungLoeschenFrage, knopf: t.allgemein.loeschen, gefahr: true })) && loeschen.mutate({ schauId, id: s.id })}
                        >
                          ✕
                        </Knopf>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Teil>

      <Dialog offen={stiftungWahl != null} onSchliessen={() => setStiftungWahl(null)} titel={tp.gestifteterPreis(stiftungWahl?.nr ?? "")}>
        {stiftungWahl && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-grau">{tp.stiftungWaehlen}</p>
            {d.stiftungen
              .filter((st) => st.preisartId === stiftungWahl.preisartId)
              .map((st) => {
                const frei = st.anzahl - benutzt(st.id);
                return (
                  <button
                    key={st.id}
                    type="button"
                    disabled={frei <= 0 || vergeben.isPending}
                    className="block w-full rounded-md border border-linie bg-weiss px-3 py-2 text-left hover:border-band hover:bg-papier disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      vergeben.mutate({ schauId, katalogeintragId: stiftungWahl.eintragId, preisartId: stiftungWahl.preisartId, stiftungId: st.id });
                      setStiftungWahl(null);
                    }}
                  >
                    <span className="font-semibold">{st.stifter}</span> · {tp.frei(frei, st.anzahl)}
                    {st.betragCent ? ` · ${tp.jePreis(formatEuro(Math.floor(st.betragCent / st.anzahl)))}` : ""}
                    {st.vorgabe && <span className="block text-sm text-grau">{tp.vorgabeZeile(st.vorgabe)}</span>}
                  </button>
                );
              })}
            {(d.preisarten.find((p) => p.id === stiftungWahl.preisartId)?.anzahlProPreisrichter ?? 0) > 0 && (
              <Knopf
                variante="leise"
                onClick={() => {
                  vergeben.mutate({ schauId, katalogeintragId: stiftungWahl.eintragId, preisartId: stiftungWahl.preisartId, ohneStiftung: true });
                  setStiftungWahl(null);
                }}
              >
                {tp.ohneStiftung}
              </Knopf>
            )}
          </div>
        )}
      </Dialog>

      <Dialog offen={stiftung != null} onSchliessen={() => setStiftung(null)} titel={tp.stiftung}>
        {stiftung && <StiftungForm schauId={schauId} start={stiftung} preisarten={d.preisarten} fertig={() => setStiftung(null)} />}
      </Dialog>
    </div>
  );
}

function StiftungForm({ schauId, start, preisarten, fertig }: { schauId: number; start: Partial<Daten["stiftungen"][number]>; preisarten: Daten["preisarten"]; fertig: () => void }) {
  const [s, setS] = useState({
    stifter: start.stifter ?? "",
    preisartId: start.preisartId ?? null,
    anzahl: start.anzahl ?? 1,
    betrag: centZuText(start.betragCent ?? 0),
    vorgabe: start.vorgabe ?? "",
    eingegangenAm: start.eingegangenAm ?? null,
    onlineNennen: start.onlineNennen ?? false,
  });
  const utils = trpc.useUtils();
  const t = useOberflaeche();
  const tp = t.schautage.preise;
  const [fehler, setFehler] = useState<string | null>(null);
  const speichern = trpc.preise.stiftungSpeichern.useMutation({ onSuccess: () => { utils.preise.invalidate(); fertig(); } });
  const senden = (e: FormEvent) => {
    e.preventDefault();
    // Leeres Feld heißt 0 € (z. B. Sachpreis); Unlesbares nicht stillschweigend als 0 € speichern.
    const betragCent = s.betrag.trim() ? parseEuro(s.betrag) : 0;
    if (betragCent == null) return setFehler(tp.betragUngueltig);
    setFehler(null);
    speichern.mutate({ schauId, id: start.id, stifter: s.stifter, preisartId: s.preisartId, anzahl: s.anzahl, betragCent, vorgabe: s.vorgabe, eingegangenAm: s.eingegangenAm, onlineNennen: s.onlineNennen });
  };
  return (
    <form onSubmit={senden} className="flex flex-col gap-4">
      <Feld label={tp.stifter}>{(id) => <Eingabe id={id} value={s.stifter} onChange={(e) => setS({ ...s, stifter: e.target.value })} required />}</Feld>
      <Feld label={tp.preisart} hinweis={tp.preisartHinweis}>
        {(id) => (
          <Auswahl id={id} value={s.preisartId ?? ""} onChange={(e) => setS({ ...s, preisartId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">{tp.ohne}</option>
            {preisarten.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.kuerzel})</option>)}
          </Auswahl>
        )}
      </Feld>
      <div className="grid gap-4 sm:grid-cols-3">
        <Feld label={tp.anzahl}>{(id) => <Eingabe id={id} type="number" min={1} value={s.anzahl} onChange={(e) => setS({ ...s, anzahl: Number(e.target.value) })} />}</Feld>
        <Feld label={tp.betragEuro} fehler={fehler}>{(id) => <Eingabe id={id} inputMode="decimal" value={s.betrag} aria-invalid={!!fehler} onChange={(e) => setS({ ...s, betrag: e.target.value })} />}</Feld>
        {start.meldungId ? (
          // Mit der Meldung zugesagt: gezahlt wird zusammen mit dem Meldegeld (Zahlung an der Meldung), sonst zählte es doppelt.
          <p className="self-end text-sm text-grau">{tp.mitMeldegeldBezahlt}</p>
        ) : (
          <Feld label={tp.eingang}>{(id) => <Eingabe id={id} type="date" value={s.eingegangenAm ?? ""} onChange={(e) => setS({ ...s, eingegangenAm: e.target.value || null })} />}</Feld>
        )}
      </div>
      <Feld label={tp.vorgabeStifter}>{(id) => <Eingabe id={id} value={s.vorgabe} onChange={(e) => setS({ ...s, vorgabe: e.target.value })} placeholder={tp.vorgabePlatzhalter} />}</Feld>
      {!start.meldungId && (
        <Haken
          label={tp.onlineNennen}
          checked={s.onlineNennen}
          onChange={(v) => setS({ ...s, onlineNennen: v })}
        />
      )}
      {speichern.error && <Hinweis ton="fehler">{fehlerText(speichern.error)}</Hinweis>}
      <div className="flex justify-end">
        <Knopf type="submit" variante="primaer" laedt={speichern.isPending}>{t.allgemein.speichern}</Knopf>
      </div>
    </form>
  );
}
