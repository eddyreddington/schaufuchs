import { BRIEF_PLATZHALTER, unbekanntePlatzhalter, VERPFLICHTUNG_MUSTER, type BriefVorlage } from "@schau/domain";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, FehlerAnzeige, Feld, FormAbschnitt, Formular, Haken, Hinweis, Knopf, Laden, ReiterLeiste, reiterKnopf, Segmente, SEITE, Seitenkopf, Speicherleiste, Textfeld, useAenderungenWarnen, useMeldung, useReiter } from "../ui";
import { BriefVorschau, pdfOeffnen } from "./druckvorlage-vorschau";

/** Teile des Briefs als Reiter (im Anker der Adresse, z. B. …/briefvorlage#serienbrief). */
const TEILE = ["briefbogen", "fusszeile", "meldebestaetigung", "serienbrief", "verpflichtung"] as const;
/** Alle Teile teilen sich eine Tafel (nur der gewählte wird gezeichnet, der Stand liegt im Formular). */
const BRIEF_TAFEL = "tafel-brief";

/**
 * Briefvorlage des Vereins (/verein/briefvorlage): Briefbogen nach DIN 5008, Fußzeile, Texte der Meldebestätigung, des
 * Serienbriefs und der Preisrichterverpflichtung – links bearbeiten, rechts ein Beispielbrief. Darunter: Serienbrief an Mitglieder oder Aussteller.
 */
export function BriefvorlageSeite() {
  const q = trpc.druckvorlage.brief.useQuery();
  // Ungespeicherte Änderungen der Vorlage – der Serienbrief nutzt nur die gespeicherte.
  const [ungespeichert, setUngespeichert] = useState(false);
  if (q.error) return <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />;
  if (!q.data) return <Laden />;
  return (
    <div className={SEITE}>
      <Editor key={JSON.stringify(q.data.vorlage)} start={q.data.vorlage} vorgabe={q.data.vorgabe} onGeaendert={setUngespeichert} />
      {/* Außerhalb des Editors: Speichern baut den Editor neu auf, ein hier begonnener Brief bleibt stehen. */}
      <Serienbrief texte={q.data.vorlage.serienbrief} ungespeichert={ungespeichert} />
    </div>
  );
}

type Setze = <K extends keyof BriefVorlage>(k: K, w: BriefVorlage[K]) => void;

function Editor({ start, vorgabe, onGeaendert }: { start: BriefVorlage; vorgabe: BriefVorlage; onGeaendert: (g: boolean) => void }) {
  const [v, setV] = useState(start);
  const meldung = useMeldung();
  const utils = trpc.useUtils();
  const gespeichert = useAenderungenWarnen(v);
  const ta = useOberflaeche();
  const t = ta.vorlagen.brief;
  const speichern = trpc.druckvorlage.briefSpeichern.useMutation({
    onSuccess: async () => {
      gespeichert();
      await utils.druckvorlage.brief.invalidate();
      meldung(t.gespeichert);
    },
  });
  const senden = (e?: FormEvent) => {
    e?.preventDefault();
    speichern.mutate({ daten: v });
  };
  const setze: Setze = (k, w) => setV((alt) => ({ ...alt, [k]: w }));
  const [aktiv, waehlen] = useReiter(TEILE);
  const geaendert = JSON.stringify(v) !== JSON.stringify(start);
  useEffect(() => onGeaendert(geaendert), [geaendert, onGeaendert]);
  const falsch = unbekanntePlatzhalter([v.meldebestaetigung.einleitung, v.meldebestaetigung.hinweise, v.meldebestaetigung.gruss, v.serienbrief.betreff, v.serienbrief.text, v.serienbrief.gruss, v.verpflichtung.betreff, v.verpflichtung.text].join("\n"));

  return (
    <>
      <Seitenkopf
        titel={t.titel}
        unter={t.unter}
        hilfe="briefvorlage"
        aktionen={
          <Link to="/verein#druckvorlagen" className="text-sm font-semibold text-band no-underline hover:underline">
            {ta.allgemein.zurueck}
          </Link>
        }
      />
      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={senden} className="flex min-w-0 flex-col gap-4">
          {/* Je Teil des Briefs ein Reiter; der Stand des ganzen Formulars bleibt beim Wechsel erhalten. */}
          <ReiterLeiste
            reiter={[
              { id: "briefbogen", label: t.briefbogen },
              { id: "fusszeile", label: t.fusszeile },
              { id: "meldebestaetigung", label: t.meldebestaetigung },
              { id: "serienbrief", label: t.serienbrief },
              { id: "verpflichtung", label: t.verpflichtung },
            ]}
            aktiv={aktiv}
            waehlen={waehlen}
            label={ta.allgemein.bereiche}
            tafelFuer={() => BRIEF_TAFEL}
          />
          <Formular>
            <div role="tabpanel" id={BRIEF_TAFEL} aria-labelledby={reiterKnopf(aktiv)} className="divide-y divide-linie">
              {aktiv === "briefbogen" && <Briefbogen v={v} setze={setze} />}
              {aktiv === "fusszeile" && (
                <FormAbschnitt titel={t.fusszeile} unter={t.fusszeileUnter} spalten={3}>
                  {[t.spalteLinks, t.spalteMitte, t.spalteRechts].map((spalte, i) => (
                    <Feld key={i} label={spalte}>
                      {(fid) => <Textfeld id={fid} rows={4} maxLength={300} value={v.fuss[i]} onChange={(e) => setze("fuss", v.fuss.map((x, j) => (j === i ? e.target.value : x)) as BriefVorlage["fuss"])} />}
                    </Feld>
                  ))}
                </FormAbschnitt>
              )}
              {aktiv === "meldebestaetigung" && <Texte titel={t.meldebestaetigung} unter={t.meldebestaetigungUnter} werte={v.meldebestaetigung} vorgabe={vorgabe.meldebestaetigung} setzen={(w) => setze("meldebestaetigung", w)} felder={[["einleitung", t.einleitung, 3, 1000], ["hinweise", t.hinweise, 4, 2000], ["gruss", t.gruss, 2, 300]]} />}
              {aktiv === "serienbrief" && <Texte titel={t.serienbrief} unter={t.serienbriefUnter} werte={v.serienbrief} vorgabe={vorgabe.serienbrief} setzen={(w) => setze("serienbrief", w)} felder={[["betreff", t.betreff, 1, 200], ["text", t.text, 8, 8000], ["gruss", t.gruss, 2, 300]]} />}
              {/* Leer = fester Text; das Muster zeigt ihn mit Platzhaltern und lässt sich zum Bearbeiten einsetzen. */}
              {aktiv === "verpflichtung" && <Texte titel={t.verpflichtung} unter={t.verpflichtungUnter} werte={v.verpflichtung} vorgabe={vorgabe.verpflichtung} muster={VERPFLICHTUNG_MUSTER} setzen={(w) => setze("verpflichtung", w)} felder={[["betreff", t.betreff, 1, 200], ["text", t.text, 8, 8000]]} />}
            </div>
            {/* Platzhalter gelten für die Texte von Meldebestätigung, Serienbrief und Verpflichtung. */}
            {(aktiv === "meldebestaetigung" || aktiv === "serienbrief" || aktiv === "verpflichtung") && (
              <div className="flex flex-col gap-1 px-5 py-4 text-sm text-grau">
                <p className="font-semibold text-tinte">{t.platzhalter}</p>
                <p>
                  {(Object.keys(BRIEF_PLATZHALTER) as (keyof typeof BRIEF_PLATZHALTER)[]).map((p, i) => (
                    <span key={p} title={t.platzhalterInfo[p]}>
                      {i > 0 && " · "}
                      <code>{`{${p}}`}</code>
                    </span>
                  ))}
                </p>
              </div>
            )}
            {falsch.length > 0 && (
              <div className="px-5 pb-4">
                <Hinweis ton="warnung">{t.unbekannt(falsch.map((f) => `{${f}}`).join(", "))}</Hinweis>
              </div>
            )}
            {speichern.error && (
              <p role="alert" className="px-5 py-3 text-sm font-semibold text-kamm">
                {fehlerText(speichern.error)}
              </p>
            )}
          </Formular>
          <Speicherleiste sichtbar={geaendert} onVerwerfen={() => setV(start)} onSpeichern={() => senden()} laedt={speichern.isPending} knopf={t.speichern} />
        </form>
        <div className="2xl:sticky 2xl:top-16">
          <BriefVorschau daten={v} teil={aktiv === "verpflichtung" ? "verpflichtung" : "serienbrief"} />
        </div>
      </div>
    </>
  );
}

function Briefbogen({ v, setze }: { v: BriefVorlage; setze: Setze }) {
  const t = useOberflaeche().vorlagen.brief;
  return (
    <FormAbschnitt titel={t.briefbogen} unter={t.briefbogenUnter}>
      <div className="md:col-span-2">
        <Segmente
          label={t.form}
          wert={v.form}
          onChange={(w) => setze("form", w)}
          optionen={[
            { wert: "B", label: t.formB },
            { wert: "A", label: t.formA },
          ]}
        />
      </div>
      <Feld label={t.briefkopf} hinweis={t.briefkopfHinweis} className="md:col-span-2">
        {(fid) => <Textfeld id={fid} rows={3} maxLength={400} value={v.kopf} onChange={(e) => setze("kopf", e.target.value)} />}
      </Feld>
      <Feld label={t.absender} hinweis={t.absenderHinweis} className="md:col-span-2">
        {(fid) => <Eingabe id={fid} maxLength={120} value={v.absender} onChange={(e) => setze("absender", e.target.value)} />}
      </Feld>
      <div className="flex flex-col gap-2 md:col-span-2">
        <Haken label={t.logo} checked={v.logo} onChange={(w) => setze("logo", w)} />
        <Haken label={t.farbig} checked={v.farbig} onChange={(w) => setze("farbig", w)} />
        <Haken label={t.falzmarken} checked={v.falzmarken} onChange={(w) => setze("falzmarken", w)} />
      </div>
    </FormAbschnitt>
  );
}

/**
 * Textfelder eines Briefs mit „Vorgabe einsetzen“. `muster`: Texte als Platzhalter der leeren Felder, mit „Muster
 * einsetzen“, solange alle leer sind (leer heißt dort: fester Text).
 */
function Texte<T extends Record<string, string>>({ titel, unter, werte, vorgabe, muster, setzen, felder }: { titel: string; unter: string; werte: T; vorgabe: T; muster?: T; setzen: (w: T) => void; felder: [keyof T & string, string, number, number][] }) {
  const istVorgabe = JSON.stringify(werte) === JSON.stringify(vorgabe);
  const leer = Object.values(werte).every((w) => !w.trim());
  const t = useOberflaeche().vorlagen.brief;
  return (
    <FormAbschnitt
      titel={titel}
      unter={unter}
      spalten={1}
      aktionen={
        muster && leer ? (
          <Knopf variante="leise" onClick={() => setzen(muster)}>
            {t.musterEinsetzen}
          </Knopf>
        ) : (
          !istVorgabe && (
            <Knopf variante="leise" onClick={() => setzen(vorgabe)}>
              {t.vorgabeEinsetzen}
            </Knopf>
          )
        )
      }
    >
      {felder.map(([k, label, zeilen, max]) => (
        <Feld key={k} label={label}>
          {(fid) =>
            zeilen === 1 ? (
              <Eingabe id={fid} maxLength={max} value={werte[k]} placeholder={muster?.[k]} onChange={(e) => setzen({ ...werte, [k]: e.target.value })} />
            ) : (
              <Textfeld id={fid} rows={zeilen} maxLength={max} value={werte[k]} placeholder={muster?.[k]} onChange={(e) => setzen({ ...werte, [k]: e.target.value })} />
            )
          }
        </Feld>
      ))}
    </FormAbschnitt>
  );
}

type Auswahlart = "mitglieder" | "aussteller" | "schau";

/** Serienbrief mit der gespeicherten Vorlage: Empfänger wählen, Text anpassen, PDF zum Drucken öffnen. */
function Serienbrief({ texte, ungespeichert }: { texte: BriefVorlage["serienbrief"]; ungespeichert: boolean }) {
  const [auswahl, setAuswahl] = useState<Auswahlart>("mitglieder");
  const schauen = trpc.schau.liste.useQuery();
  const [schauId, setSchauId] = useState<number | null>(null);
  const sid = schauId ?? schauen.data?.[0]?.id ?? null;
  const tb = useOberflaeche().vorlagen.brief;
  const [t, setT] = useState(texte);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const bereit = auswahl !== "schau" || sid != null;
  const anzahl = trpc.druckvorlage.serienbriefAnzahl.useQuery({ auswahl, schauId: auswahl === "schau" ? (sid ?? undefined) : undefined }, { enabled: bereit });
  const erstellen = async () => {
    setLaeuft(true);
    try {
      await pdfOeffnen("/datei/serienbrief.pdf", { auswahl, schauId: auswahl === "schau" ? sid : undefined, ...t });
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : tb.serienbriefFehlgeschlagen);
    } finally {
      setLaeuft(false);
    }
  };
  return (
    <Abschnitt id="serienbrief-erstellen" titel={tb.serienbriefErstellen}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Segmente
            label={tb.empfaenger}
            wert={auswahl}
            onChange={setAuswahl}
            optionen={[
              { wert: "mitglieder", label: tb.mitglieder },
              { wert: "aussteller", label: tb.alleAussteller },
              { wert: "schau", label: tb.ausstellerEinerSchau },
            ]}
          />
          {auswahl === "schau" && (
            <Feld label={tb.schau} className="min-w-64">
              {(fid) => (
                <Auswahl id={fid} value={sid ?? ""} onChange={(e) => setSchauId(Number(e.target.value))}>
                  {schauen.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Auswahl>
              )}
            </Feld>
          )}
        </div>
        <p className="text-sm text-grau" role="status">
          {!bereit ? tb.keineSchau : !anzahl.data ? tb.zaehlt : tb.anzahl(anzahl.data.anzahl, anzahl.data.ohneAnschrift)}
        </p>
        <Feld label={tb.betreff}>{(fid) => <Eingabe id={fid} maxLength={200} value={t.betreff} onChange={(e) => setT({ ...t, betreff: e.target.value })} />}</Feld>
        <Feld label={tb.text}>{(fid) => <Textfeld id={fid} rows={8} maxLength={8000} value={t.text} onChange={(e) => setT({ ...t, text: e.target.value })} />}</Feld>
        <Feld label={tb.gruss}>{(fid) => <Textfeld id={fid} rows={2} maxLength={300} value={t.gruss} onChange={(e) => setT({ ...t, gruss: e.target.value })} />}</Feld>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {ungespeichert && <span className="mr-auto text-sm text-grau">{tb.ungespeichert}</span>}
          {fehler && <span role="alert" className="text-sm font-semibold text-kamm">{fehler}</span>}
          <Knopf variante="primaer" laedt={laeuft} disabled={!bereit || !anzahl.data?.anzahl} onClick={erstellen}>
            {tb.alsPdf}
          </Knopf>
        </div>
      </div>
    </Abschnitt>
  );
}
