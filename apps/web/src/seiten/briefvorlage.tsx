import { BRIEF_PLATZHALTER, unbekanntePlatzhalter, type BriefVorlage } from "@schau/domain";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { fehlerText } from "../lib";
import { trpc } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, FehlerAnzeige, Feld, FormAbschnitt, Formular, Haken, Hinweis, Knopf, Laden, Segmente, SEITE, Seitenkopf, Speicherleiste, Textfeld, useAenderungenWarnen, useMeldung } from "../ui";
import { BriefVorschau, pdfOeffnen } from "./druckvorlage-vorschau";

/**
 * Briefvorlage des Vereins (/verein/briefvorlage): Briefbogen nach DIN 5008, Fußzeile, Texte der Meldebestätigung und
 * des Serienbriefs – links bearbeiten, rechts ein Beispielbrief. Darunter: Serienbrief an Mitglieder oder Aussteller.
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
  const speichern = trpc.druckvorlage.briefSpeichern.useMutation({
    onSuccess: async () => {
      gespeichert();
      await utils.druckvorlage.brief.invalidate();
      meldung("Briefvorlage gespeichert.");
    },
  });
  const senden = (e?: FormEvent) => {
    e?.preventDefault();
    speichern.mutate({ daten: v });
  };
  const setze: Setze = (k, w) => setV((alt) => ({ ...alt, [k]: w }));
  const geaendert = JSON.stringify(v) !== JSON.stringify(start);
  useEffect(() => onGeaendert(geaendert), [geaendert, onGeaendert]);
  const falsch = unbekanntePlatzhalter([v.meldebestaetigung.einleitung, v.meldebestaetigung.hinweise, v.meldebestaetigung.gruss, v.serienbrief.betreff, v.serienbrief.text, v.serienbrief.gruss].join("\n"));

  return (
    <>
      <Seitenkopf
        titel="Briefvorlage"
        unter="Meldebestätigung, Abrechnung, Quittungen und Serienbriefe des Vereins"
        hilfe="briefvorlage"
        aktionen={
          <Link to="/verein#druckvorlagen" className="text-sm font-semibold text-band no-underline hover:underline">
            Zurück
          </Link>
        }
      />
      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={senden} className="flex min-w-0 flex-col gap-4">
          <Formular>
            <Briefbogen v={v} setze={setze} />
            <FormAbschnitt titel="Fußzeile" unter="Drei Spalten, z. B. Anschrift, Bankverbindung, Vorstand. Alle leer: Vereinsname in einer Zeile." spalten={3}>
              {(["Spalte links", "Spalte Mitte", "Spalte rechts"] as const).map((t, i) => (
                <Feld key={t} label={t}>
                  {(fid) => <Textfeld id={fid} rows={4} maxLength={300} value={v.fuss[i]} onChange={(e) => setze("fuss", v.fuss.map((x, j) => (j === i ? e.target.value : x)) as BriefVorlage["fuss"])} />}
                </Feld>
              ))}
            </FormAbschnitt>
            <Texte titel="Meldebestätigung" unter="Im B-Bogen über und unter der Liste der Tiere" werte={v.meldebestaetigung} vorgabe={vorgabe.meldebestaetigung} setzen={(w) => setze("meldebestaetigung", w)} felder={[["einleitung", "Einleitung", 3, 1000], ["hinweise", "Hinweise zur Einlieferung (je Zeile einer)", 4, 2000], ["gruss", "Gruß", 2, 300]]} />
            <Texte titel="Serienbrief" unter="Vorgabe für neue Serienbriefe" werte={v.serienbrief} vorgabe={vorgabe.serienbrief} setzen={(w) => setze("serienbrief", w)} felder={[["betreff", "Betreff", 1, 200], ["text", "Text", 8, 8000], ["gruss", "Gruß", 2, 300]]} />
            <div className="flex flex-col gap-1 px-5 py-4 text-sm text-grau">
              <p className="font-semibold text-tinte">Platzhalter</p>
              <p>
                {(Object.keys(BRIEF_PLATZHALTER) as (keyof typeof BRIEF_PLATZHALTER)[]).map((p, i) => (
                  <span key={p} title={BRIEF_PLATZHALTER[p]}>
                    {i > 0 && " · "}
                    <code>{`{${p}}`}</code>
                  </span>
                ))}
              </p>
            </div>
            {falsch.length > 0 && (
              <div className="px-5 pb-4">
                <Hinweis ton="warnung">Unbekannte Platzhalter bleiben so im Brief stehen: {falsch.map((f) => `{${f}}`).join(", ")}</Hinweis>
              </div>
            )}
            {speichern.error && (
              <p role="alert" className="px-5 py-3 text-sm font-semibold text-kamm">
                {fehlerText(speichern.error)}
              </p>
            )}
          </Formular>
          <Speicherleiste sichtbar={geaendert} onVerwerfen={() => setV(start)} onSpeichern={() => senden()} laedt={speichern.isPending} knopf="Vorlage speichern" />
        </form>
        <div className="2xl:sticky 2xl:top-16">
          <BriefVorschau daten={v} />
        </div>
      </div>
    </>
  );
}

function Briefbogen({ v, setze }: { v: BriefVorlage; setze: Setze }) {
  return (
    <FormAbschnitt titel="Briefbogen" unter="DIN 5008 für Fensterumschläge DL und C6/5">
      <div className="md:col-span-2">
        <Segmente
          label="Form"
          wert={v.form}
          onChange={(w) => setze("form", w)}
          optionen={[
            { wert: "B", label: "Form B – großer Briefkopf" },
            { wert: "A", label: "Form A – kleiner Briefkopf" },
          ]}
        />
      </div>
      <Feld label="Briefkopf" hinweis="Bis zu drei Zeilen (Form A: zwei), die erste fett. Leer: Vereinsname und Schau." className="md:col-span-2">
        {(fid) => <Textfeld id={fid} rows={3} maxLength={400} value={v.kopf} onChange={(e) => setze("kopf", e.target.value)} />}
      </Feld>
      <Feld label="Absender über der Anschrift" hinweis="Kleine Zeile im Fenster, leer: Vereinsname" className="md:col-span-2">
        {(fid) => <Eingabe id={fid} maxLength={120} value={v.absender} onChange={(e) => setze("absender", e.target.value)} />}
      </Feld>
      <div className="flex flex-col gap-2 md:col-span-2">
        <Haken label="Logo der Schau im Briefkopf" checked={v.logo} onChange={(w) => setze("logo", w)} />
        <Haken label="Farbig (sonst nur Schwarz und Grau)" checked={v.farbig} onChange={(w) => setze("farbig", w)} />
        <Haken label="Falz- und Lochmarken" checked={v.falzmarken} onChange={(w) => setze("falzmarken", w)} />
      </div>
    </FormAbschnitt>
  );
}

/** Textfelder eines Briefs mit „Vorgabe einsetzen“. */
function Texte<T extends Record<string, string>>({ titel, unter, werte, vorgabe, setzen, felder }: { titel: string; unter: string; werte: T; vorgabe: T; setzen: (w: T) => void; felder: [keyof T & string, string, number, number][] }) {
  const istVorgabe = JSON.stringify(werte) === JSON.stringify(vorgabe);
  return (
    <FormAbschnitt
      titel={titel}
      unter={unter}
      spalten={1}
      aktionen={
        !istVorgabe && (
          <Knopf variante="leise" onClick={() => setzen(vorgabe)}>
            Vorgabe einsetzen
          </Knopf>
        )
      }
    >
      {felder.map(([k, label, zeilen, max]) => (
        <Feld key={k} label={label}>
          {(fid) =>
            zeilen === 1 ? (
              <Eingabe id={fid} maxLength={max} value={werte[k]} onChange={(e) => setzen({ ...werte, [k]: e.target.value })} />
            ) : (
              <Textfeld id={fid} rows={zeilen} maxLength={max} value={werte[k]} onChange={(e) => setzen({ ...werte, [k]: e.target.value })} />
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
      setFehler(e instanceof Error ? e.message : "Serienbrief fehlgeschlagen.");
    } finally {
      setLaeuft(false);
    }
  };
  return (
    <Abschnitt id="serienbrief" titel="Serienbrief erstellen">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Segmente
            label="Empfänger"
            wert={auswahl}
            onChange={setAuswahl}
            optionen={[
              { wert: "mitglieder", label: "Vereinsmitglieder" },
              { wert: "aussteller", label: "Alle Aussteller" },
              { wert: "schau", label: "Aussteller einer Schau" },
            ]}
          />
          {auswahl === "schau" && (
            <Feld label="Schau" className="min-w-64">
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
          {!bereit ? "Noch keine Schau angelegt." : !anzahl.data ? "Empfänger werden gezählt …" : `${anzahl.data.anzahl} Empfänger${anzahl.data.ohneAnschrift ? `, davon ${anzahl.data.ohneAnschrift} ohne vollständige Anschrift` : ""}. Gesperrte und Test-Aussteller bekommen keinen Brief.`}
        </p>
        <Feld label="Betreff">{(fid) => <Eingabe id={fid} maxLength={200} value={t.betreff} onChange={(e) => setT({ ...t, betreff: e.target.value })} />}</Feld>
        <Feld label="Text">{(fid) => <Textfeld id={fid} rows={8} maxLength={8000} value={t.text} onChange={(e) => setT({ ...t, text: e.target.value })} />}</Feld>
        <Feld label="Gruß">{(fid) => <Textfeld id={fid} rows={2} maxLength={300} value={t.gruss} onChange={(e) => setT({ ...t, gruss: e.target.value })} />}</Feld>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {ungespeichert && <span className="mr-auto text-sm text-grau">Die Vorlage hat ungespeicherte Änderungen – der Serienbrief nutzt die gespeicherte.</span>}
          {fehler && <span role="alert" className="text-sm font-semibold text-kamm">{fehler}</span>}
          <Knopf variante="primaer" laedt={laeuft} disabled={!bereit || !anzahl.data?.anzahl} onClick={erstellen}>
            Serienbrief als PDF
          </Knopf>
        </div>
      </div>
    </Abschnitt>
  );
}
