import { useEffect, useRef, useState, type FormEvent } from "react";
import { KATALOG_GLIEDERUNG, type KatalogGliederungsTeil, type KatalogSeitenbereich, type KatalogTeil } from "@schau/domain";
import { fehlerText } from "../lib";
import { useSchauId } from "../rahmen";
import { useOberflaeche } from "../sprache";
import { KommendeSchauen } from "./kommende-schauen";
import { KatalogVorschau } from "./katalog-vorschau";
import { trpc } from "../trpc";
import { FehlerAnzeige, Hinweis, useFrage, Knopf, KnopfLink, Laden, Marke, SEITE, Seitenkopf, Speicherleiste, useMeldung, useUngespeichertWarnung } from "../ui";
import { Aufbau } from "./katalog-gestalten-aufbau";
import { Schalter } from "./katalog-gestalten-bausteine";
import { formAus, type Daten, type Form } from "./katalog-gestalten-form";
import { Gliederung } from "./katalog-gestalten-teile";
import { Titelseite } from "./katalog-gestalten-titelseite";

/*
 * Seite „Katalog gestalten“: Reiter links, Vorschau rechts, Speicherleiste. Die Reiter stehen in eigenen Dateien:
 * katalog-gestalten-aufbau, -titelseite, -teile; Bilder in -bilder, Bausteine in -bausteine, Formular in -form.
 */

type Reiter = "aufbau" | "titel" | "teile" | "kommende";
const REITER: Reiter[] = ["aufbau", "titel", "teile", "kommende"];

export function KatalogGestalten() {
  const schauId = useSchauId();
  const daten = trpc.katalogGestaltung.laden.useQuery({ schauId });
  const termine = trpc.termine.laden.useQuery({ schauId });
  const status = trpc.auth.status.useQuery();
  const schau = trpc.schau.get.useQuery({ id: schauId });
  if (daten.error) return <FehlerAnzeige fehler={daten.error} nochmal={() => daten.refetch()} />;
  if (!daten.data || !schau.data) return <Laden />;
  // Ändern sich gespeicherte Teile (Beiträge, Bilder, Termine, Schau), lädt die Vorschau neu.
  const neuLaden = `${daten.dataUpdatedAt}-${termine.dataUpdatedAt}-${schau.dataUpdatedAt}`;
  return <Editor schauId={schauId} daten={daten.data} istAdmin={status.data?.benutzer?.rolle === "admin"} mitErgebnis={schau.data.ergebnisseFreigegeben} neuLaden={neuLaden} />;
}

function Editor({ schauId, daten, istAdmin, mitErgebnis, neuLaden }: { schauId: number; daten: Daten; istAdmin: boolean; mitErgebnis: boolean; neuLaden: string }) {
  const t = useOberflaeche();
  const tg = t.katalog.gestalten;
  const g = daten.gestaltung;
  const [d, setD] = useState(() => formAus(g));
  // Neu geladen: Formular übernehmen. Mit ungespeicherten Eingaben nur den Schalter „Kommende Schauen“ (lässt sich auch
  // in dessen Abschnitt umstellen) angleichen – sonst gingen die Eingaben verloren.
  const zuletzt = useRef(formAus(g));
  useEffect(() => {
    const neu = formAus(g);
    const mitKommende = neu.ausgeblendet.includes("kommendeSchauen");
    setD((x) =>
      JSON.stringify(x) === JSON.stringify(zuletzt.current)
        ? neu
        : { ...x, ausgeblendet: mitKommende ? [...x.ausgeblendet.filter((t) => t !== "kommendeSchauen"), "kommendeSchauen"] : x.ausgeblendet.filter((t) => t !== "kommendeSchauen") },
    );
    zuletzt.current = neu;
  }, [g]);
  const ungespeichert = JSON.stringify(d) !== JSON.stringify(formAus(g));
  useUngespeichertWarnung(() => ungespeichert);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setD((x) => ({ ...x, [k]: v }));
  const teilAn = (t: KatalogTeil, an: boolean) => set("ausgeblendet", an ? d.ausgeblendet.filter((x) => x !== t) : [...d.ausgeblendet, t]);

  const [reiter, setReiter] = useState<Reiter>("aufbau");
  const [ganz, setGanz] = useState(false);
  const [bereiche, setBereiche] = useState<KatalogSeitenbereich[]>([]);
  const [seite, setSeite] = useState(1);
  const [markiert, setMarkiert] = useState<KatalogGliederungsTeil | null>(null);

  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const speichern = trpc.katalogGestaltung.speichern.useMutation({
    onSuccess: () => {
      utils.katalogGestaltung.laden.invalidate();
      utils.termine.laden.invalidate();
      meldung(tg.gespeichert);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const senden = (e?: FormEvent) => {
    e?.preventDefault();
    speichern.mutate({ schauId, daten: d });
  };

  /** Springt zum Teil: Reiter wechseln, Zeile der Gliederung hervorheben. */
  const zeigeTeil = (s: KatalogGliederungsTeil) => {
    if (s === "titel" || s === "leitung") return setReiter("titel");
    if (s === "kommendeSchauen") return setReiter("kommende");
    setReiter("teile");
    setMarkiert(s);
    setTimeout(() => document.getElementById(`teil-${s}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50);
  };
  const bereichDerSeite = bereiche.find((b) => seite >= b.von && seite <= b.bis);
  const teilDerSeite = KATALOG_GLIEDERUNG.find((x) => x.schluessel === bereichDerSeite?.schluessel);

  return (
    <div className={SEITE}>
      <Seitenkopf
        titel={tg.titel}
        marke={mitErgebnis ? <Marke ton="ok">{tg.mitErgebnissen}</Marke> : <Marke ton="warnung">{tg.vorkatalogBisFreigabe}</Marke>}
        hilfe="katalog-gestalten"
        hilfeText={tg.hilfe}
        aktionen={
          <KnopfLink href={`/datei/${schauId}/katalog.pdf`} target="_blank" rel="noreferrer" variante="primaer">
            {mitErgebnis ? tg.katalogPdf : tg.vorkatalogPdf}
          </KnopfLink>
        }
      />
      {!istAdmin && <Hinweis>{tg.nurAdmin}</Hinweis>}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-linie bg-weiss shadow-[0_1px_2px_rgb(16_20_28/0.04)]">
          <div className="flex flex-wrap gap-x-1 border-b border-linie px-3" role="tablist" aria-label={tg.bereiche}>
            {REITER.map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                id={`reiter-${r}`}
                aria-selected={reiter === r}
                aria-controls={`tafel-${r}`}
                onClick={() => setReiter(r)}
                className={`-mb-px whitespace-nowrap border-b-2 px-2.5 py-3 text-sm font-semibold transition-colors ${reiter === r ? "border-band text-tinte" : "border-transparent text-grau hover:text-tinte"}`}
              >
                {tg.reiter[r]}
              </button>
            ))}
          </div>
          {reiter !== "kommende" && (
            <form onSubmit={senden} className="divide-y divide-linie" id={`tafel-${reiter}`} role="tabpanel" aria-labelledby={`reiter-${reiter}`}>
              {reiter === "aufbau" && <Aufbau d={d} set={set} />}
              {reiter === "titel" && <Titelseite schauId={schauId} d={d} set={set} bilder={daten.bilder} />}
              {reiter === "teile" && (
                <Gliederung
                  schauId={schauId}
                  d={d}
                  set={set}
                  teilAn={teilAn}
                  beitraege={daten.beitraege}
                  bereiche={bereiche}
                  mitErgebnis={mitErgebnis}
                  markiert={markiert ?? bereichDerSeite?.schluessel ?? null}
                  waehle={(s, von) => {
                    setMarkiert(s);
                    if (von) setSeite(von);
                  }}
                  zeigeTeil={zeigeTeil}
                />
              )}
            </form>
          )}
          {reiter === "kommende" && (
            <div id="tafel-kommende" role="tabpanel" aria-labelledby="reiter-kommende">
              <KommendeSchauen schauId={schauId} istAdmin={istAdmin} />
            </div>
          )}
        </section>

        <div className="min-w-0 xl:sticky xl:top-4">
          <KatalogVorschau
            schauId={schauId}
            stand={{ daten: d, kurz: !ganz }}
            neuLaden={neuLaden}
            seite={seite}
            onSeite={(nr) => {
              setSeite(nr);
              setMarkiert(null);
            }}
            onBereiche={setBereiche}
            kopf={
              <label className="flex items-center gap-2 text-sm text-grau">
                <input type="checkbox" checked={ganz} onChange={(e) => setGanz(e.target.checked)} className="size-4 accent-band" />
                {tg.ganzerTierteil}
              </label>
            }
            unter={
              teilDerSeite && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="font-semibold">{t.katalog.gliederung[teilDerSeite.schluessel]}</span>
                  <span className="text-sm text-grau tabular-nums">{tg.seite(seite)}</span>
                  <span className="ml-auto flex items-center gap-3">
                    {"teil" in teilDerSeite && (
                      <Schalter label={tg.imKatalogLabel(t.katalog.gliederung[teilDerSeite.schluessel])} an={!d.ausgeblendet.includes(teilDerSeite.teil)} onChange={(v) => teilAn(teilDerSeite.teil, v)}>
                        <span className="text-grau">{tg.imKatalog}</span>
                      </Schalter>
                    )}
                    <Knopf variante="leise" onClick={() => zeigeTeil(teilDerSeite.schluessel)}>{t.allgemein.bearbeiten}</Knopf>
                  </span>
                </div>
              )
            }
          />
        </div>
      </div>

      <Speicherleiste
        sichtbar={ungespeichert && istAdmin}
        onVerwerfen={async () => (await bestaetige({ titel: tg.verwerfenTitel, text: tg.verwerfenText, knopf: tg.verwerfenKnopf, gefahr: true })) && setD(formAus(g))}
        onSpeichern={() => senden()}
        laedt={speichern.isPending}
      />
    </div>
  );
}
