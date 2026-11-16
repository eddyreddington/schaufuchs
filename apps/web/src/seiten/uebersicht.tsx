import { formatEuro, PHASEN, serverText, type Phase } from "@schau/domain";
import { Link, useNavigate } from "react-router-dom";
import { datum, fehlerText } from "../lib";
import { useSchauId } from "../rahmen";
import { useOberflaeche, useSprache } from "../sprache";
import { trpc } from "../trpc";
import { useState } from "react";
import { Symbol } from "../symbole";
import { Abschnitt, Dialog, FehlerAnzeige, Feld, HilfeLink, Knopf, Laden, Seitenkopf, Textfeld, useFrage, useMeldung } from "../ui";

/** Wo in welcher Phase die Arbeit liegt (Text des Knopfs: t.schau.uebersicht.arbeit). */
const ARBEIT: Record<Phase, string> = {
  vorbereitung: "einstellungen",
  meldung: "meldungen",
  katalog: "katalog",
  einlieferung: "einlieferung",
  bewertung: "bewertung",
  preise: "preise",
  schau: "verkauf",
  abrechnung: "abrechnung",
  abgeschlossen: "protokoll",
};

/** In diesen Phasen bewerten Preisrichter am Tablet. */
const TABLET_PHASEN: Phase[] = ["einlieferung", "bewertung", "preise"];

export function Uebersicht() {
  const id = useSchauId();
  const t = useOberflaeche();
  const tu = t.schau.uebersicht;
  const PHASEN_LABEL = t.fach.PHASEN_LABEL;
  const sprache = useSprache();
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
      meldung(tu.jetztPhase(PHASEN_LABEL[p]));
    },
    onError: (e, v) => {
      // Meldephase ohne Gebühren, Meldeschluss oder Impressum: nur bewusst (sonst Meldungen über 0,00 €, ein Formular ohne Termine oder ohne Impressum).
      if (e.data?.code === "PRECONDITION_FAILED" && !v.trotzdem && v.phase === "meldung") {
        void bestaetige({
          titel: tu.meldephaseTrotzdem,
          text: tu.meldephaseText(fehlerText(e)),
          knopf: tu.meldephaseStarten,
        }).then((ja) => ja && phase.mutate({ ...v, trotzdem: true }));
        return;
      }
      // Offene Punkte der Prüfliste (beim Abschluss auch Kasse und Reklamationsfrist): nur bewusst, mit Grund im Protokoll.
      if (e.data?.code === "PRECONDITION_FAILED" && !(v.trotzdem && v.grund)) {
        const abschluss = v.phase === "abgeschlossen";
        void eingabe({
          titel: abschluss ? tu.abschliessenTrotzdem : tu.weiterTrotzdem(PHASEN_LABEL[v.phase]),
          text: abschluss ? tu.abschliessenTrotzdemText(fehlerText(e)) : fehlerText(e),
          feld: tu.grund,
          mindestens: 3,
          knopf: abschluss ? tu.abschliessenTrotzdemKnopf : tu.weiterTrotzdemKnopf,
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
    if (p === "abgeschlossen" && !(await bestaetige({ titel: tu.abschliessenFrage, text: tu.abschliessenText, knopf: tu.abschliessen, gefahr: true }))) return;
    if (PHASEN.indexOf(p) === PHASEN.indexOf(aktuell) + 1 || (await bestaetige({ titel: tu.weiterZurPhase(PHASEN_LABEL[p]), knopf: t.allgemein.weiter }))) phase.mutate({ id, phase: p });
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
        titel={tu.titel}
        unter={[s.ort, s.bewertungAm ? tu.bewertungAm(datum(s.bewertungAm)) : ""].filter(Boolean).join(", ")}
        // bleibt deutsch: Anker im Handbuch
        aktionen={<HilfeLink abschnitt="die-phasen-im-überblick">{tu.hilfe}</HilfeLink>}
      />

      <Abschnitt titel={tu.ablauf} aktionen={<span className="text-sm text-grau">{tu.phaseVon(index + 1, PHASEN.length)}</span>}>
        <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-9">
          {PHASEN.map((p, i) => {
            const klasse = `flex h-full min-h-[4.25rem] w-full min-w-0 flex-col gap-0.5 rounded-md border px-2.5 py-2 text-left text-[0.84rem] leading-tight ${p === s.phase ? "border-band bg-band font-semibold text-auf-band" : i < index ? "border-transparent bg-stall-hell text-stall" : "border-linie bg-weiss text-grau"}`;
            const inhalt = (
              <>
                <span className="text-[1.05rem] font-bold [font-stretch:112%]">{i + 1}</span>
                <span lang={sprache} className="block hyphens-auto break-words">{PHASEN_LABEL[p]}</span>
              </>
            );
            return (
              <li key={p} className="min-w-0" aria-current={p === s.phase ? "step" : undefined}>
                {istAdmin && p !== s.phase ? (
                  <button type="button" title={tu.phaseEinstellen(PHASEN_LABEL[p])} disabled={phase.isPending} onClick={() => wechseln(p)} className={`${klasse} hover:border-band`}>
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
            {tu.tablets}{" "}
            {TABLET_PHASEN.includes(s.phase) && !s.ergebnisseFreigegeben ? <strong className="font-semibold text-stall">{tu.offen}</strong> : <strong className="font-semibold text-tinte">{tu.geschlossen}</strong>}
            {s.ergebnisseFreigegeben ? tu.freigegeben : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Knopf onClick={() => navigate(`/schau/${id}/${ARBEIT[s.phase]}`)}>{tu.arbeit[s.phase]}</Knopf>
            {istAdmin && vorige && (
              <Knopf disabled={phase.isPending} onClick={() => wechseln(vorige)}>
                {tu.zurueckZu(PHASEN_LABEL[vorige])}
              </Knopf>
            )}
            {istAdmin && naechste && (
              <Knopf variante="primaer" laedt={phase.isPending} onClick={() => wechseln(naechste)}>
                {tu.weiterZu(PHASEN_LABEL[naechste])}
              </Knopf>
            )}
          </div>
        </div>
        <Dialog offen={!!zurueckZu} onSchliessen={() => setZurueckZu(null)} titel={zurueckZu ? tu.zurueckZurPhase(PHASEN_LABEL[zurueckZu]) : ""}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!zurueckZu || grund.trim().length < 3) return;
              phase.mutate({ id, phase: zurueckZu, grund: grund.trim() }, { onSuccess: () => setZurueckZu(null) });
            }}
          >
            <p>{tu.zurueckText}</p>
            <Feld label={tu.grund} hinweis={tu.grundHinweis}>
              {(fid) => <Textfeld id={fid} rows={2} value={grund} onChange={(e) => setGrund(e.target.value)} autoFocus />}
            </Feld>
            <div className="flex gap-2">
              <Knopf variante="primaer" type="submit" disabled={grund.trim().length < 3} laedt={phase.isPending}>
                {tu.zurueckstellen}
              </Knopf>
              <Knopf onClick={() => setZurueckZu(null)}>{t.allgemein.abbrechen}</Knopf>
            </div>
          </form>
        </Dialog>
      </Abschnitt>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Pruefliste punkte={checkliste} />

        <section className="rounded-xl border border-linie bg-weiss shadow-[0_1px_2px_rgb(16_20_28/0.04)]">
          <h2 className="px-5 pb-3 pt-5 text-[1.07rem] font-semibold">{tu.zahlen}</h2>
          <dl className="grid grid-cols-2">
            {[
              [tu.meldungen, z.meldungen, tu.bestaetigt(z.meldungenBestaetigt)],
              [tu.tiereGemeldet, z.tiereGemeldet],
              [tu.imKatalog, z.tiereBestaetigt],
              [tu.eingeliefert, z.eingeliefert, z.fehlt ? tu.fehlen(z.fehlt) : z.tiereBestaetigt ? tu.vonGesamt(z.tiereBestaetigt) : ""],
              [tu.bewertet, z.bewertet],
              [tu.preiseVergeben, z.preise],
              [tu.verkauft, z.verkauft],
              [tu.zahlungseingang, formatEuro(z.bezahltCent)],
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

      <Abschnitt titel={tu.adressen}>
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="text-sm text-grau">{tu.adresseMeldung}</dt>
            <dd>
              <a href={`/s/${s.slug}`} target="_blank" rel="noreferrer">{`${herkunft}/s/${s.slug}`}</a>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-grau">{tu.adresseTablet}</dt>
            <dd>
              <a href={`/richter/${s.slug}`} target="_blank" rel="noreferrer">{`${herkunft}/richter/${s.slug}`}</a>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-grau">{tu.adresseErgebnisse}</dt>
            <dd>
              <a href={`/s/${s.slug}/ergebnisse`} target="_blank" rel="noreferrer">{`${herkunft}/s/${s.slug}/ergebnisse`}</a>
            </dd>
          </div>
        </dl>
      </Abschnitt>
    </div>
  );
}

type Punkt = { art: "fehler" | "hinweis" | "ok"; text: string; zusatz?: string; ziel?: string };

/** „Was noch zu tun ist“: kurz, nach Seiten gruppiert, die ganze Zeile führt dorthin. */
function Pruefliste({ punkte }: { punkte: Punkt[] }) {
  const tp = useOberflaeche().schau.pruefliste;
  const sprache = useSprache();
  /** Überschrift einer Gruppe der Prüfliste: die Seite, auf der man es erledigt. */
  const ZIEL_LABEL: Record<string, string> = tp.ziel;
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
        <h2 className="text-[1.07rem] font-semibold">{tp.titel}</h2>
        {(fehler > 0 || hinweise > 0) && (
          <span className="text-sm text-grau">
            {[fehler ? tp.fehlerAnzahl(fehler) : "", hinweise ? tp.hinweisAnzahl(hinweise) : ""].filter(Boolean).join(", ")}
          </span>
        )}
      </div>
      {gruppen.length === 0 ? (
        <p className="flex items-center gap-2.5 px-5 pb-5 pt-3 text-stall">
          <span aria-hidden className="size-2 rounded-full bg-current" />
          {serverText(punkte.find((p) => p.art === "ok")?.text ?? tp.allesErledigt, sprache)}
        </p>
      ) : (
        <div className="pb-2 pt-2">
          {gruppen.map((g) => (
            <div key={g.ziel} className="border-t border-linie first:border-t-0">
              <div className="flex items-baseline justify-between px-5 pb-0.5 pt-2.5 text-[0.82rem] font-semibold text-grau">
                <span>{ZIEL_LABEL[g.ziel] ?? tp.allgemein}</span>
              </div>
              <ul className="px-2.5 pb-1.5">
                {g.punkte.map((p, i) => {
                  const inhalt = (
                    <>
                      <span aria-hidden className={`size-2 shrink-0 rounded-full ${p.art === "fehler" ? "bg-kamm" : "bg-stroh-dunkel"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="sr-only">{p.art === "fehler" ? tp.fehlerVorlesen : tp.hinweisVorlesen}</span>
                        {serverText(p.text, sprache)}
                      </span>
                      {p.zusatz && <span className={`text-right text-sm ${p.art === "fehler" ? "text-kamm" : "text-grau"}`}>{serverText(p.zusatz, sprache)}</span>}
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
