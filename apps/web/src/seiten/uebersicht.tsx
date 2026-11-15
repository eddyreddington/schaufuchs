import { formatEuro, PHASEN, PHASEN_LABEL, type Phase } from "@schau/domain";
import { Link, useNavigate } from "react-router-dom";
import { datum, fehlerText } from "../lib";
import { useSchauId } from "../rahmen";
import { trpc } from "../trpc";
import { useState } from "react";
import { Symbol } from "../symbole";
import { Abschnitt, Dialog, FehlerAnzeige, Feld, HilfeLink, Knopf, Laden, Seitenkopf, Textfeld, useFrage, useMeldung } from "../ui";

/** Wo in welcher Phase die Arbeit liegt. */
const ARBEIT: Record<Phase, { pfad: string; text: string }> = {
  vorbereitung: { pfad: "einstellungen", text: "Zu den Einstellungen" },
  meldung: { pfad: "meldungen", text: "Zu den Meldungen" },
  katalog: { pfad: "katalog", text: "Zu den Katalognummern" },
  einlieferung: { pfad: "einlieferung", text: "Zur Einlieferung" },
  bewertung: { pfad: "bewertung", text: "Zur Bewertung" },
  preise: { pfad: "preise", text: "Zu den Preisen" },
  schau: { pfad: "verkauf", text: "Zum Tierverkauf" },
  abrechnung: { pfad: "abrechnung", text: "Zur Abrechnung" },
  abgeschlossen: { pfad: "protokoll", text: "Zum Protokoll" },
};

/** In diesen Phasen bewerten Preisrichter am Tablet. */
const TABLET_PHASEN: Phase[] = ["einlieferung", "bewertung", "preise"];

export function Uebersicht() {
  const id = useSchauId();
  const u = trpc.schau.uebersicht.useQuery({ id });
  const status = trpc.auth.status.useQuery();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe, bestaetige } = useFrage();
  const navigate = useNavigate();
  const phase = trpc.schau.phaseSetzen.useMutation({
    onSuccess: async (_, { phase: p }) => {
      await utils.schau.invalidate();
      utils.bewertung.invalidate();
      meldung(`Jetzt in der Phase „${PHASEN_LABEL[p]}“.`);
    },
    onError: (e, v) => {
      // Meldephase ohne Gebühren, Meldeschluss oder Impressum: nur bewusst (sonst Meldungen über 0,00 €, ein Formular ohne Termine oder ohne Impressum).
      if (e.data?.code === "PRECONDITION_FAILED" && !v.trotzdem && v.phase === "meldung") {
        void bestaetige({
          titel: "Trotzdem die Meldephase starten?",
          text: `${e.message}\n\nDas Meldeformular geht dann ohne diese Angaben online.`,
          knopf: "Meldephase starten",
        }).then((ja) => ja && phase.mutate({ ...v, trotzdem: true }));
        return;
      }
      // Offene Punkte der Prüfliste (beim Abschluss auch Kasse und Reklamationsfrist): nur bewusst, mit Grund im Protokoll.
      if (e.data?.code === "PRECONDITION_FAILED" && !(v.trotzdem && v.grund)) {
        const abschluss = v.phase === "abgeschlossen";
        void eingabe({
          titel: abschluss ? "Trotzdem abschließen?" : `Trotzdem weiter zu „${PHASEN_LABEL[v.phase]}“?`,
          text: abschluss ? `${e.message}\n\n30 Tage danach werden IBANs, Geburtsdaten und PINs gelöscht.` : e.message,
          feld: "Grund",
          mindestens: 3,
          knopf: abschluss ? "Trotzdem abschließen" : "Trotzdem weiter",
          gefahr: true,
        }).then((grund) => grund != null && phase.mutate({ ...v, trotzdem: true, grund }));
        return;
      }
      meldung(fehlerText(e), "fehler");
    },
  });
  // Zurück nur mit Grund (steht im Protokoll) – im eigenen Dialog, nicht per Browser-Eingabefenster (das unterdrücken
  // manche Browser und App-Ansichten, dann geschah scheinbar nichts).
  const [zurueckZu, setZurueckZu] = useState<Phase | null>(null);
  const [grund, setGrund] = useState("");
  const wechseln = async (p: Phase) => {
    if (!u.data || p === u.data.schau.phase) return;
    const aktuell = u.data.schau.phase;
    const zurueck = PHASEN.indexOf(p) < PHASEN.indexOf(aktuell);
    if (zurueck) {
      setGrund("");
      setZurueckZu(p);
      return;
    }
    if (p === "abgeschlossen" && !(await bestaetige({ titel: "Schau abschließen?", text: "30 Tage danach löscht die Bereinigung IBANs, Geburtsdaten und Preisrichter-PINs.", knopf: "Abschließen", gefahr: true }))) return;
    if (PHASEN.indexOf(p) === PHASEN.indexOf(aktuell) + 1 || (await bestaetige({ titel: `Weiter zur Phase „${PHASEN_LABEL[p]}“?`, knopf: "Weiter" }))) phase.mutate({ id, phase: p });
  };
  if (u.error) return <FehlerAnzeige fehler={u.error} nochmal={() => u.refetch()} />;
  if (!u.data) return <Laden />;
  const { schau: s, zahlen: z, checkliste } = u.data;
  const index = PHASEN.indexOf(s.phase);
  const naechste = PHASEN[index + 1];
  const vorige = index > 0 ? PHASEN[index - 1] : undefined;
  const istAdmin = status.data?.benutzer?.rolle === "admin";
  const herkunft = window.location.origin;

  return (
    <div className="flex flex-col gap-6">
      <Seitenkopf
        titel="Übersicht"
        unter={[s.ort, s.bewertungAm ? `Bewertung am ${datum(s.bewertungAm)}` : ""].filter(Boolean).join(", ")}
        aktionen={<HilfeLink abschnitt="die-phasen-im-überblick">Hilfe zur Übersicht</HilfeLink>}
      />

      <Abschnitt titel="Ablauf der Schau" aktionen={<span className="text-sm text-grau">Phase {index + 1} von {PHASEN.length}</span>}>
        <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-9">
          {PHASEN.map((p, i) => {
            const klasse = `flex h-full min-h-[4.25rem] w-full min-w-0 flex-col gap-0.5 rounded-md border px-2.5 py-2 text-left text-[0.84rem] leading-tight ${p === s.phase ? "border-band bg-band font-semibold text-auf-band" : i < index ? "border-transparent bg-stall-hell text-stall" : "border-linie bg-weiss text-grau"}`;
            const inhalt = (
              <>
                <span className="text-[1.05rem] font-bold [font-stretch:112%]">{i + 1}</span>
                <span lang="de" className="block hyphens-auto break-words">{PHASEN_LABEL[p]}</span>
              </>
            );
            return (
              <li key={p} className="min-w-0" aria-current={p === s.phase ? "step" : undefined}>
                {istAdmin && p !== s.phase ? (
                  <button type="button" title={`Phase „${PHASEN_LABEL[p]}“ einstellen`} disabled={phase.isPending} onClick={() => wechseln(p)} className={`${klasse} hover:border-band`}>
                    {inhalt}
                  </button>
                ) : (
                  <div className={klasse}>{inhalt}</div>
                )}
              </li>
            );
          })}
        </ol>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-grau">
            Tablets der Preisrichter: {TABLET_PHASEN.includes(s.phase) && !s.ergebnisseFreigegeben ? <strong className="font-semibold text-stall">offen</strong> : <strong className="font-semibold text-tinte">geschlossen</strong>}
            {s.ergebnisseFreigegeben ? ", Ergebnisse freigegeben" : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Knopf onClick={() => navigate(`/schau/${id}/${ARBEIT[s.phase].pfad}`)}>{ARBEIT[s.phase].text}</Knopf>
            {istAdmin && vorige && (
              <Knopf disabled={phase.isPending} onClick={() => wechseln(vorige)}>
                Zurück zu {PHASEN_LABEL[vorige]}
              </Knopf>
            )}
            {istAdmin && naechste && (
              <Knopf variante="primaer" laedt={phase.isPending} onClick={() => wechseln(naechste)}>
                Weiter zu {PHASEN_LABEL[naechste]}
              </Knopf>
            )}
          </div>
        </div>
        <Dialog offen={!!zurueckZu} onSchliessen={() => setZurueckZu(null)} titel={zurueckZu ? `Zurück zur Phase „${PHASEN_LABEL[zurueckZu]}“` : ""}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!zurueckZu || grund.trim().length < 3) return;
              phase.mutate({ id, phase: zurueckZu, grund: grund.trim() }, { onSuccess: () => setZurueckZu(null) });
            }}
          >
            <p>Die Schau geht zurück in diese Phase. Bitte kurz den Grund angeben – er steht im Protokoll.</p>
            <Feld label="Grund" hinweis="z. B. „versehentlich weitergeschaltet“ (mindestens 3 Zeichen)">
              {(fid) => <Textfeld id={fid} rows={2} value={grund} onChange={(e) => setGrund(e.target.value)} autoFocus />}
            </Feld>
            <div className="flex gap-2">
              <Knopf variante="primaer" type="submit" disabled={grund.trim().length < 3} laedt={phase.isPending}>
                Zurückstellen
              </Knopf>
              <Knopf onClick={() => setZurueckZu(null)}>Abbrechen</Knopf>
            </div>
          </form>
        </Dialog>
      </Abschnitt>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Pruefliste punkte={checkliste} />

        <section className="rounded-xl border border-linie bg-weiss shadow-[0_1px_2px_rgb(16_20_28/0.04)]">
          <h2 className="px-5 pb-3 pt-5 text-[1.07rem] font-semibold">Zahlen</h2>
          <dl className="grid grid-cols-2">
            {[
              ["Meldungen", z.meldungen, `${z.meldungenBestaetigt} bestätigt`],
              ["Tiere gemeldet", z.tiereGemeldet],
              ["Im Katalog", z.tiereBestaetigt],
              ["Eingeliefert", z.eingeliefert, z.fehlt ? `${z.fehlt} fehlen` : z.tiereBestaetigt ? `von ${z.tiereBestaetigt}` : ""],
              ["Bewertet", z.bewertet],
              ["Preise vergeben", z.preise],
              ["Verkauft", z.verkauft],
              ["Zahlungseingang", formatEuro(z.bezahltCent)],
            ].map(([k, v, zusatz], i) => (
              <div key={k as string} className={`border-t border-linie px-5 py-3 ${i % 2 === 0 ? "border-r" : ""}`}>
                <dt className="text-sm text-grau">{k}</dt>
                <dd className="mt-0.5 text-xl font-semibold [font-stretch:112%]">
                  {v}
                  {zusatz ? <span className="ml-1.5 text-sm font-normal text-grau [font-stretch:100%]">{zusatz}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <Abschnitt titel="Adressen zum Weitergeben">
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="text-sm text-grau">Online-Meldung und Infos für Aussteller</dt>
            <dd>
              <a href={`/s/${s.slug}`} target="_blank" rel="noreferrer">{`${herkunft}/s/${s.slug}`}</a>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-grau">Bewertung am Tablet (für Preisrichter, mit PIN)</dt>
            <dd>
              <a href={`/richter/${s.slug}`} target="_blank" rel="noreferrer">{`${herkunft}/richter/${s.slug}`}</a>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-grau">Öffentliche Ergebnisse (nach Freigabe)</dt>
            <dd>
              <a href={`/s/${s.slug}/ergebnisse`} target="_blank" rel="noreferrer">{`${herkunft}/s/${s.slug}/ergebnisse`}</a>
            </dd>
          </div>
        </dl>
      </Abschnitt>
    </div>
  );
}

/** Überschrift einer Gruppe der Prüfliste: die Seite, auf der man es erledigt. */
const ZIEL_LABEL: Record<string, string> = {
  einstellungen: "Einstellungen",
  meldungen: "Meldungen",
  preisrichter: "Preisrichter",
  katalog: "Katalognummern",
  "katalog/gestalten": "Katalog",
  hallenplan: "Hallenplan",
  einlieferung: "Einlieferung",
  bewertung: "Bewertung",
  preise: "Preise",
  abrechnung: "Abrechnung",
  kassenbuch: "Kassenbuch",
  "/verein": "Verein und Datenschutz",
};

type Punkt = { art: "fehler" | "hinweis" | "ok"; text: string; zusatz?: string; ziel?: string };

/** „Was noch zu tun ist“: kurz, nach Seiten gruppiert, die ganze Zeile führt dorthin. */
function Pruefliste({ punkte }: { punkte: Punkt[] }) {
  const gruppen: { ziel: string; punkte: Punkt[] }[] = [];
  for (const p of punkte.filter((x) => x.art !== "ok")) {
    const ziel = p.ziel ?? "";
    let g = gruppen.find((x) => x.ziel === ziel);
    if (!g) gruppen.push((g = { ziel, punkte: [] }));
    g.punkte.push(p);
  }
  const fehler = punkte.filter((p) => p.art === "fehler").length;
  const hinweise = punkte.filter((p) => p.art === "hinweis").length;
  const zeile = "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-tinte no-underline hover:bg-papier";
  return (
    <section className="rounded-xl border border-linie bg-weiss shadow-[0_1px_2px_rgb(16_20_28/0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
        <h2 className="text-[1.07rem] font-semibold">Was noch zu tun ist</h2>
        {(fehler > 0 || hinweise > 0) && (
          <span className="text-sm text-grau">
            {[fehler ? `${fehler} ${fehler === 1 ? "Fehler" : "Fehler"}` : "", hinweise ? `${hinweise} ${hinweise === 1 ? "Hinweis" : "Hinweise"}` : ""].filter(Boolean).join(", ")}
          </span>
        )}
      </div>
      {gruppen.length === 0 ? (
        <p className="flex items-center gap-2.5 px-5 pb-5 pt-3 text-stall">
          <span aria-hidden className="size-2 rounded-full bg-current" />
          {punkte.find((p) => p.art === "ok")?.text ?? "Alles erledigt"}
        </p>
      ) : (
        <div className="pb-2 pt-2">
          {gruppen.map((g) => (
            <div key={g.ziel} className="border-t border-linie first:border-t-0">
              <div className="flex items-baseline justify-between px-5 pb-0.5 pt-2.5 text-[0.82rem] font-semibold text-grau">
                <span>{ZIEL_LABEL[g.ziel] ?? "Allgemein"}</span>
              </div>
              <ul className="px-2.5 pb-1.5">
                {g.punkte.map((p, i) => {
                  const inhalt = (
                    <>
                      <span aria-hidden className={`size-2 shrink-0 rounded-full ${p.art === "fehler" ? "bg-kamm" : "bg-stroh-dunkel"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="sr-only">{p.art === "fehler" ? "Fehler: " : "Hinweis: "}</span>
                        {p.text}
                      </span>
                      {p.zusatz && <span className={`text-right text-sm ${p.art === "fehler" ? "text-kamm" : "text-grau"}`}>{p.zusatz}</span>}
                      {p.ziel && <Symbol name="rechts" className="size-4 text-grau/70" />}
                    </>
                  );
                  return (
                    <li key={i}>
                      {p.ziel ? (
                        <Link to={p.ziel} className={zeile}>
                          {inhalt}
                        </Link>
                      ) : (
                        <div className={zeile.replace(" hover:bg-papier", "")}>{inhalt}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
