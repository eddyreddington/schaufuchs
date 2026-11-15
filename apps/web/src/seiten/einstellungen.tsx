import { bindungText, kaefigNameLang, sortierungText, PREIS_ZIELGRUPPE_LABEL, PREIS_ZIELGRUPPEN, STANDARD_NOTENSKALA, UNTERSUCHUNG_ARTEN, UNTERSUCHUNG_LABEL, type KaefigMasse, type GebuehrArt, type KaefigTyp, type NotenStufe, type Untersuchung } from "@schau/domain";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { centZuText, datumZeit, fehlerText, formatEuro, parseEuro } from "../lib";
import { useSchauId } from "../rahmen";
import { VetAmtFeld } from "./einstellungen-vetamt";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Auswahl, Dialog, Eingabe, FehlerAnzeige, Feld, FormAbschnitt, Formular, Haken, Hinweis, Knopf, knopfKlasse, Laden, Seitenkopf, Speicherleiste, Textfeld, useAenderungenWarnen, useFrage, useMeldung, useUngespeichertWarnung } from "../ui";
import { DruckAbschnitt } from "./einstellungen-druck";
import { MeisterschaftenAbschnitt } from "./einstellungen-meisterschaften";
import { TeilschauenAbschnitt } from "./einstellungen-teilschauen";

type Schau = Ausgabe["schau"]["get"];

/** Sprungziele der Abschnittsliste links (ids der Abschnitte). */
const ABSCHNITTE: [string, string][] = [
  ["schau", "Schau"],
  ["termine", "Termine"],
  ["zahlung", "Meldegeld und Konto"],
  ["katalog", "Katalog und Preise"],
  ["teilschauen", "Teilschauen"],
  ["bestimmungen", "Bestimmungen"],
  ["veterinaeramt", "Veterinäramt"],
  ["gebuehren", "Standgeld und Gebühren"],
  ["preise", "Preise"],
  ["notenskala", "Notenskala"],
  ["meisterschaften", "Meisterschaften"],
  ["kaefige", "Käfige und Halle"],
  ["druck", "Druck"],
  ["protokoll", "Protokoll"],
];

export function Einstellungen() {
  const id = useSchauId();
  const schau = trpc.schau.get.useQuery({ id });
  const status = trpc.auth.status.useQuery();
  if (schau.error) return <FehlerAnzeige fehler={schau.error} nochmal={() => schau.refetch()} />;
  if (schau.isLoading || !schau.data) return <Laden />;
  const istAdmin = status.data?.benutzer?.rolle === "admin";
  return (
    <div className="flex flex-col gap-6">
      <Seitenkopf titel="Einstellungen" hilfe="einstellungen" />
      {!istAdmin && <Hinweis>Nur Administratoren können die Einstellungen ändern.</Hinweis>}
      <div className="grid items-start gap-6 xl:grid-cols-[11rem_minmax(0,1fr)]">
        <nav aria-label="Abschnitte" className="sticky top-16 hidden flex-col gap-0.5 text-sm xl:flex">
          {ABSCHNITTE.map(([anker, label]) => (
            <a key={anker} href={`#${anker}`} className="rounded-md px-2.5 py-1.5 text-grau no-underline hover:bg-papier hover:text-tinte">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-6">
          {/* Für Helfer nur zum Lesen: alle Felder und Knöpfe gesperrt. */}
          <fieldset disabled={!istAdmin} className="flex min-w-0 flex-col gap-6">
            <Stammangaben schau={schau.data} />
            <Gebuehren schau={schau.data} />
            <Preisarten schau={schau.data} />
            <Notenskala schau={schau.data} />
          </fieldset>
          <TeilschauenAbschnitt schauId={schau.data.id} start={schau.data.teilschauen} darfAendern={istAdmin} />
          <MeisterschaftenAbschnitt schauId={schau.data.id} darfAendern={istAdmin} />
          <KaefigeUndHalle schauId={schau.data.id} />
          <DruckAbschnitt schauId={schau.data.id} darfAendern={istAdmin} />
          <ProtokollAbschnitt schauId={schau.data.id} />
          {istAdmin && !schau.data.test && <AlsTestschau schau={schau.data} />}
          {istAdmin && schau.data.test && <Demodaten schau={schau.data} />}
          {istAdmin && !schau.data.abgesagtAm && ["vorbereitung", "meldung", "katalog"].includes(schau.data.phase) && <SchauAbsagen schau={schau.data} />}
          {istAdmin && (schau.data.phase === "vorbereitung" || schau.data.test) && <SchauLoeschen schau={schau.data} />}
        </div>
      </div>
    </div>
  );
}

function Stammangaben({ schau: s }: { schau: Schau }) {
  const versionen = trpc.stammdaten.versionen.useQuery();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const startwerte = () => ({
    name: s.name,
    slug: s.slug,
    veranstalter: s.veranstalter,
    ort: s.ort,
    meldeschluss: s.meldeschluss,
    einlieferung: s.einlieferung,
    bewertungAm: s.bewertungAm,
    oeffnungszeiten: s.oeffnungszeiten,
    aussetzen: s.aussetzen,
    reklamationsfrist: s.reklamationsfrist,
    kapazitaet: s.kapazitaet,
    stammdatenVersionId: s.stammdatenVersionId,
    provisionBp: s.provisionBp,
    katalogStart: s.katalogStart,
    jugendSeparat: s.jugendSeparat,
    staemmeVorn: s.staemmeVorn,
    kaefigFolge: s.kaefigFolge ?? null,
    kontingentJe: s.kontingentJe,
    bestimmungen: s.bestimmungen,
    bankverbindung: s.bankverbindung,
    zahlungBeiEinlieferung: s.zahlungBeiEinlieferung,
    kontaktEmail: s.kontaktEmail,
    vereinKontoinhaber: s.vereinKontoinhaber,
    vereinIban: s.vereinIban,
    vereinBic: s.vereinBic,
    vetRegistriernummer: s.vetRegistriernummer,
    vetAmt: s.vetAmt,
    vetAnzeigeAm: s.vetAnzeigeAm,
    vetAktenzeichen: s.vetAktenzeichen,
    wassergefluegelUntersuchung: s.wassergefluegelUntersuchung,
    untersuchung: s.untersuchung,
    untersuchungTage: s.untersuchungTage,
    einlassUntersuchungAm: s.einlassUntersuchungAm,
    einlassTierarzt: s.einlassTierarzt,
    ndTageMin: s.ndTageMin,
    ndTageMax: s.ndTageMax,
    pmvTageMin: s.pmvTageMin,
    pmvTageMax: s.pmvTageMax,
    auslandZugelassen: s.auslandZugelassen,
    prHoechstzahl: s.prHoechstzahl,
    obmannHoechstzahl: s.obmannHoechstzahl,
    erklaerungen: s.erklaerungen,
  });
  const [d, setD] = useState(startwerte);
  // Stand beim letzten Speichern (für die Speicherleiste).
  const [stand, setStand] = useState(() => JSON.stringify(startwerte()));
  /** Zahlenfeld für Tage; leer = keine Frist. */
  const tageFeld = (k: "ndTageMin" | "ndTageMax" | "pmvTageMin" | "pmvTageMax", label: string) => (
    <Feld label={label}>
      {(fid) => (
        <Eingabe id={fid} inputMode="numeric" value={d[k] ?? ""} placeholder="keine Frist" onChange={(e) => set(k, e.target.value.trim() === "" ? null : Math.max(0, Math.min(730, Number(e.target.value.replace(/\D/g, "")) || 0)))} />
      )}
    </Feld>
  );
  const gespeichert = useAenderungenWarnen(d);
  const speichern = trpc.schau.aktualisieren.useMutation({
    onSuccess: (_r, v) => {
      gespeichert();
      setStand(JSON.stringify(v.daten));
      utils.schau.invalidate();
      meldung("Einstellungen gespeichert.");
    },
  });
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));
  const text = (k: keyof typeof d, label: string, hinweis?: string, typ = "text") => (
    <Feld label={label} hinweis={hinweis}>
      {(fid) => <Eingabe id={fid} type={typ} value={(d[k] as string | null) ?? ""} onChange={(e) => set(k, (typ === "date" && !e.target.value ? null : e.target.value) as never)} />}
    </Feld>
  );
  const senden = (e: FormEvent) => {
    e.preventDefault();
    speichern.mutate({ id: s.id, daten: d });
  };
  const geaendert = JSON.stringify(d) !== stand;
  return (
    <form onSubmit={senden} className="flex flex-col gap-4">
      <Formular>
        <FormAbschnitt id="schau" titel="Schau">
          {text("name", "Name der Schau")}
          {text("veranstalter", "Veranstalter")}
          {text("ort", "Ort / Halle")}
          {s.phase === "vorbereitung" ? (
            text("slug", "Kurzadresse", `…/s/${d.slug}`)
          ) : (
            <Feld label="Kurzadresse" hinweis="Ab der Meldephase fest">
              {(fid) => <Eingabe id={fid} value={d.slug} disabled readOnly />}
            </Feld>
          )}
          {text("kontaktEmail", "Kontakt für Aussteller (E-Mail)")}
          <Feld label="Hallenkapazität (Käfige)">
            {(fid) => <Eingabe id={fid} type="number" min={1} placeholder="keine Grenze" value={d.kapazitaet ?? ""} onChange={(e) => set("kapazitaet", e.target.value ? Number(e.target.value) : null)} />}
          </Feld>
        </FormAbschnitt>
        <FormAbschnitt id="termine" titel="Termine">
          {text("meldeschluss", "Meldeschluss", undefined, "date")}
          {text("bewertungAm", "Bewertung am", undefined, "date")}
          <Feld label="Einlieferung">{(fid) => <Eingabe id={fid} placeholder="z. B. Donnerstag 15–20 Uhr" value={d.einlieferung} onChange={(e) => set("einlieferung", e.target.value)} />}</Feld>
          {text("aussetzen", "Tierausgabe")}
          <Feld label="Öffnungszeiten" hinweis="Je Tag eine Zeile">
            {(fid) => <Textfeld id={fid} rows={3} placeholder="Sa. 12.12. 9–18 Uhr" value={d.oeffnungszeiten} onChange={(e) => set("oeffnungszeiten", e.target.value)} />}
          </Feld>
          {text("reklamationsfrist", "Reklamationsfrist", undefined, "date")}
        </FormAbschnitt>
        <FormAbschnitt id="zahlung" titel="Meldegeld und Konto">
          <Feld label="Meldegeld zahlen">
            {(fid) => (
              <Auswahl id={fid} value={d.zahlungBeiEinlieferung ? "einlieferung" : "vorab"} onChange={(e) => set("zahlungBeiEinlieferung", e.target.value === "einlieferung")}>
                <option value="vorab">vorab per Überweisung</option>
                <option value="einlieferung">bei der Einlieferung der Tiere</option>
              </Auswahl>
            )}
          </Feld>
          {text("bankverbindung", "Bankverbindung für das Meldegeld", d.zahlungBeiEinlieferung ? "Wird bei Zahlung bei der Einlieferung nicht angezeigt" : undefined)}
          <Feld label="Provision Tierverkauf (%)">
            {(fid) => <Eingabe id={fid} type="number" min={0} max={50} step={0.5} value={d.provisionBp / 100} onChange={(e) => set("provisionBp", Math.round(Number(e.target.value) * 100))} />}
          </Feld>
          <div className="grid gap-4 rounded-lg border border-linie bg-papier p-4 md:col-span-2 md:grid-cols-3">
            <p className="text-sm font-semibold md:col-span-3">Vereinskonto für Auszahlungen (SEPA)</p>
            {text("vereinKontoinhaber", "Kontoinhaber")}
            {text("vereinIban", "IBAN")}
            {text("vereinBic", "BIC", "Freiwillig")}
          </div>
        </FormAbschnitt>
        <FormAbschnitt id="katalog" titel="Katalog und Preise">
          <Feld label="Rassen und Farbenschläge" hinweis={s.katalogGedruckt ? "Festgeschrieben" : undefined}>
            {(fid) => (
              <Auswahl id={fid} value={d.stammdatenVersionId ?? ""} disabled={s.katalogGedruckt} onChange={(e) => set("stammdatenVersionId", e.target.value ? Number(e.target.value) : null)}>
                <option value="">– bitte wählen –</option>
                {versionen.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.jahr})
                  </option>
                ))}
              </Auswahl>
            )}
          </Feld>
          <Feld label="Erste Katalognummer">{(fid) => <Eingabe id={fid} type="number" min={1} value={d.katalogStart} onChange={(e) => set("katalogStart", Number(e.target.value))} />}</Feld>
          <div className="flex flex-col gap-2 md:col-span-2">
            <Haken label="Jugend als eigener Block im Katalog" checked={d.jugendSeparat} onChange={(v) => set("jugendSeparat", v)} disabled={s.katalogGedruckt} />
            <Haken label="Volieren und Stämme vor den Einzeltieren" checked={d.staemmeVorn} onChange={(v) => set("staemmeVorn", v)} disabled={s.katalogGedruckt} hinweis={s.katalogGedruckt ? "Festgeschrieben" : undefined} />
          </div>
          <KaefigFolge wert={d.kaefigFolge} setzen={(f) => set("kaefigFolge", f)} gesperrt={s.katalogGedruckt} masse={s.kaefigMasse} />
          <p className="text-sm md:col-span-2">
            <span className="text-grau">Reihenfolge der Nummern: </span>
            <Link to={`/schau/${s.id}/katalog#reihenfolge`}>{sortierungText(s.katalogSortierung)}</Link>
          </p>
          <Feld label="Preise aus dem Standgeld verteilen">
            {(fid) => (
              <Auswahl id={fid} value={d.kontingentJe} onChange={(e) => set("kontingentJe", e.target.value as typeof d.kontingentJe)}>
                <option value="preisrichter">je Preisrichter (aus seinen Tieren)</option>
                <option value="schau">gemeinsam für die ganze Schau</option>
              </Auswahl>
            )}
          </Feld>
          <Feld label="Höchstens Tiere je Preisrichter" hinweis="PV-Hinweise: 80">
            {(fid) => <Eingabe id={fid} type="number" min={1} max={1000} value={d.prHoechstzahl} onChange={(e) => set("prHoechstzahl", Math.max(1, Number(e.target.value) || 1))} />}
          </Feld>
          <Feld label="Höchstens Tiere je Obmann" hinweis="PV-Hinweise: 60">
            {(fid) => <Eingabe id={fid} type="number" min={1} max={1000} value={d.obmannHoechstzahl} onChange={(e) => set("obmannHoechstzahl", Math.max(1, Number(e.target.value) || 1))} />}
          </Feld>
        </FormAbschnitt>
        <FormAbschnitt id="bestimmungen" titel="Bestimmungen" spalten={1}>
          <Feld label="Sonderbestimmungen" hinweis="Erscheinen im Meldeformular">
            {(fid) => <Textfeld id={fid} rows={6} value={d.bestimmungen} onChange={(e) => set("bestimmungen", e.target.value)} />}
          </Feld>
          <Feld label="Pflichterklärungen der Aussteller" hinweis="Je Zeile eine Erklärung; leer, wenn nicht gefordert">
            {(fid) => <Textfeld id={fid} rows={3} value={d.erklaerungen} onChange={(e) => set("erklaerungen", e.target.value)} />}
          </Feld>
        </FormAbschnitt>
        <FormAbschnitt id="veterinaeramt" titel="Veterinäramt">
          <VetAmtFeld wert={d.vetAmt} setzen={(v) => set("vetAmt", v)} schauOrt={d.ort} />
          {text("vetAktenzeichen", "Aktenzeichen")}
          {text("vetRegistriernummer", "Registriernummer der Veranstaltung")}
          {text("vetAnzeigeAm", "Angezeigt am", "Spätestens 4 Wochen vor der Schau", "date")}
          <Feld label="Klinische Untersuchung (§ 7 GeflPestSchV)" className="md:col-span-2">
            {(fid) => (
              <Auswahl id={fid} value={d.untersuchung ?? ""} onChange={(e) => set("untersuchung", (e.target.value || null) as Untersuchung | null)}>
                <option value="">– noch nicht festgelegt –</option>
                {UNTERSUCHUNG_ARTEN.map((u) => (
                  <option key={u} value={u}>
                    {UNTERSUCHUNG_LABEL[u]}
                  </option>
                ))}
              </Auswahl>
            )}
          </Feld>
          {d.untersuchung === "bescheinigung" && (
            <Feld label="Bescheinigung höchstens (Tage vor der Schau)" hinweis="Meist 5 bis 6">
              {(fid) => <Eingabe id={fid} inputMode="numeric" value={d.untersuchungTage} onChange={(e) => set("untersuchungTage", Math.max(1, Math.min(30, Number(e.target.value.replace(/\D/g, "")) || 1)))} />}
            </Feld>
          )}
          {d.untersuchung === "einlass" && (
            <>
              {text("einlassUntersuchungAm", "Einlassuntersuchung am", undefined, "date")}
              {text("einlassTierarzt", "Tierarzt der Einlassuntersuchung")}
            </>
          )}
          <p className="text-sm font-semibold md:col-span-2">Impffristen (Tage vor dem Bewertungstag, leer = keine)</p>
          <div className="grid grid-cols-2 gap-3">
            {tageFeld("ndTageMin", "ND frühestens")}
            {tageFeld("ndTageMax", "ND höchstens")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {tageFeld("pmvTageMin", "PMV frühestens")}
            {tageFeld("pmvTageMax", "PMV höchstens")}
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <Haken label="Behörde verlangt Untersuchung von Enten und Gänsen" checked={d.wassergefluegelUntersuchung} onChange={(v) => set("wassergefluegelUntersuchung", v)} />
            <Haken label="Aussteller aus anderen Mitgliedstaaten zugelassen" checked={d.auslandZugelassen} onChange={(v) => set("auslandZugelassen", v)} />
          </div>
        </FormAbschnitt>
      </Formular>
      {speichern.error && <Hinweis ton="fehler">{fehlerText(speichern.error)}</Hinweis>}
      <Speicherleiste sichtbar={geaendert} onVerwerfen={() => setD(startwerte())} onSpeichern={() => speichern.mutate({ id: s.id, daten: d })} laedt={speichern.isPending} knopf="Einstellungen speichern" />
    </form>
  );
}

/** Protokoll der Schau: die letzten Einträge, das ganze Protokoll auf eigener Seite (Suche, Export, Prüfung). */
function ProtokollAbschnitt({ schauId }: { schauId: number }) {
  const letzte = trpc.schau.protokoll.useQuery({ schauId, limit: 3 });
  return (
    <Abschnitt
      id="protokoll"
      titel="Protokoll"
      aktionen={
        <Link to={`/schau/${schauId}/protokoll`} className={knopfKlasse()}>
          Protokoll öffnen
        </Link>
      }
    >
      {letzte.isLoading ? (
        <Laden />
      ) : !letzte.data?.length ? (
        <p className="text-sm text-grau">Noch keine Einträge.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {letzte.data.map((z) => (
            <li key={z.id} className="flex flex-wrap gap-x-2">
              <span className="tabular-nums text-grau">{datumZeit(z.zeitpunkt)}</span>
              <span>{z.aktion}</span>
              <span className="text-grau">{z.wer}</span>
            </li>
          ))}
        </ul>
      )}
    </Abschnitt>
  );
}

const GEBUEHR_ZEILEN: { art: GebuehrArt; jugend: boolean; label: string }[] = [
  { art: "einzeltier", jugend: false, label: "Einzeltier" },
  { art: "einzeltier", jugend: true, label: "Einzeltier Jugend" },
  { art: "stamm", jugend: false, label: "Stamm" },
  { art: "stamm", jugend: true, label: "Stamm Jugend" },
  { art: "voliere", jugend: false, label: "Voliere" },
  { art: "bruteier", jugend: false, label: "Satz Bruteier" },
  { art: "kostenanteil", jugend: false, label: "Kostenanteil je Aussteller" },
  { art: "kostenanteil", jugend: true, label: "Kostenanteil Jugend" },
  { art: "katalog", jugend: false, label: "Katalog" },
  { art: "katalog", jugend: true, label: "Katalog Jugend" },
];

function Gebuehren({ schau: s }: { schau: Schau }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const start = () =>
    Object.fromEntries(
      GEBUEHR_ZEILEN.map((z) => {
        const g = s.gebuehren.find((x) => x.art === z.art && x.jugend === z.jugend);
        return [`${z.art}-${z.jugend}`, { text: g ? centZuText(g.betragCent) : "", befreit: g?.befreitPreisrichter ?? z.art === "katalog" }];
      }),
    );
  const [werte, setWerte] = useState(start);
  useEffect(() => setWerte(start()), [s.gebuehren]); // eslint-disable-line react-hooks/exhaustive-deps
  // Verglichen mit dem Stand vom Server (nach dem Speichern lädt er neu und setzt die Werte zurück).
  useUngespeichertWarnung(() => JSON.stringify(werte) !== JSON.stringify(start()));
  const speichern = trpc.schau.gebuehrenSetzen.useMutation({
    onSuccess: () => {
      utils.schau.invalidate();
      meldung("Gebühren gespeichert.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const senden = (e: FormEvent) => {
    e.preventDefault();
    const gebuehren = [];
    for (const z of GEBUEHR_ZEILEN) {
      const w = werte[`${z.art}-${z.jugend}`]!;
      if (!w.text.trim()) continue;
      const cent = parseEuro(w.text);
      if (cent == null) return meldung(`Betrag bei „${z.label}“ ist ungültig.`, "fehler");
      gebuehren.push({ art: z.art, jugend: z.jugend, betragCent: cent, befreitPreisrichter: w.befreit });
    }
    speichern.mutate({ schauId: s.id, gebuehren });
  };
  const formular = useRef<HTMLFormElement>(null);
  return (
    <Abschnitt id="gebuehren" titel="Standgeld und Gebühren">
      <form ref={formular} onSubmit={senden}>
        <table className="tabelle max-w-2xl">
          <thead>
            <tr>
              <th>Position</th>
              <th className="w-36">Betrag (€)</th>
              <th>Preisrichter befreit</th>
            </tr>
          </thead>
          <tbody>
            {GEBUEHR_ZEILEN.map((z) => {
              const key = `${z.art}-${z.jugend}`;
              const w = werte[key]!;
              return (
                <tr key={key}>
                  <td>{z.label}</td>
                  <td>
                    <Eingabe aria-label={`Betrag ${z.label}`} inputMode="decimal" value={w.text} onChange={(e) => setWerte({ ...werte, [key]: { ...w, text: e.target.value } })} className="text-right" />
                  </td>
                  <td>
                    <input type="checkbox" aria-label={`${z.label}: Preisrichter befreit`} className="size-5 accent-band" checked={w.befreit} onChange={(e) => setWerte({ ...werte, [key]: { ...w, befreit: e.target.checked } })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Speicherleiste
          sichtbar={JSON.stringify(werte) !== JSON.stringify(start())}
          onVerwerfen={() => setWerte(start())}
          onSpeichern={() => formular.current?.requestSubmit()}
          laedt={speichern.isPending}
          knopf="Gebühren speichern"
        />
      </form>
    </Abschnitt>
  );
}

type Preisart = Schau["preisarten"][number];

function Preisarten({ schau: s }: { schau: Schau }) {
  const [bearbeiten, setBearbeiten] = useState<Partial<Preisart> | null>(null);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const loeschen = trpc.schau.preisartLoeschen.useMutation({ onSuccess: () => utils.schau.get.invalidate(), onError: (e) => meldung(fehlerText(e), "fehler") });
  return (
    <Abschnitt id="preise" titel="Preise" aktionen={<Knopf onClick={() => setBearbeiten({})}>Preisart hinzufügen</Knopf>}>
      <div className="overflow-x-auto">
<table className="tabelle">
        <thead>
          <tr>
            <th>Kürzel</th>
            <th>Name</th>
            <th>Wert</th>
            <th>Verteilung</th>
            <th>ab Punkten</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {s.preisarten.map((p) => (
            <tr key={p.id}>
              <td className="nummer">{p.kuerzel}</td>
              <td>{p.name}</td>
              <td>{p.betragCent ? formatEuro(p.betragCent) : p.sachpreis || "–"}</td>
              <td>
                {p.quelle === "stiftung"
                  ? "gestiftet"
                  : [p.schluesselProTiere ? `${p.anzahlProSchluessel} auf ${p.schluesselProTiere}${p.rundung === "angefangen" ? " angefangene" : ""} Tiere` : "", p.anzahlProPreisrichter ? `${p.anzahlProPreisrichter} je Preisrichter` : ""].filter(Boolean).join(" + ") || "–"}
              </td>
              <td>
                {p.mindestpunkte ?? "–"}
                {bindungText(p) && <span className="block text-sm text-grau">{bindungText(p)}</span>}
              </td>
              <td className="text-right">
                <Knopf variante="leise" onClick={() => setBearbeiten(p)}>Bearbeiten</Knopf>
                <Knopf variante="leise" onClick={async () => (await bestaetige({ titel: `„${p.name}“ löschen?`, knopf: "Löschen", gefahr: true })) && loeschen.mutate({ schauId: s.id, id: p.id })}>Löschen</Knopf>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
</div>
      <Dialog offen={bearbeiten != null} onSchliessen={() => setBearbeiten(null)} titel={bearbeiten?.id ? "Preisart bearbeiten" : "Preisart hinzufügen"}>
        {bearbeiten && <PreisartForm schauId={s.id} start={bearbeiten} fertig={() => setBearbeiten(null)} folge={s.preisarten.length + 1} />}
      </Dialog>
    </Abschnitt>
  );
}

function PreisartForm({ schauId, start, fertig, folge }: { schauId: number; start: Partial<Preisart>; fertig: () => void; folge: number }) {
  const [p, setP] = useState({
    kuerzel: start.kuerzel ?? "",
    name: start.name ?? "",
    betrag: centZuText(start.betragCent ?? 0),
    sachpreis: start.sachpreis ?? "",
    quelle: start.quelle ?? ("standgeld" as const),
    schluessel: start.schluesselProTiere?.toString() ?? "",
    anzahl: start.anzahlProSchluessel ?? 1,
    jePr: start.anzahlProPreisrichter ?? 0,
    mindest: start.mindestpunkte?.toString() ?? "",
    rundung: start.rundung ?? ("voll" as const),
    zielgruppe: start.zielgruppe ?? ("alle" as const),
    sparte: start.sparte ?? "",
  });
  const gespeichert = useAenderungenWarnen(p);
  const utils = trpc.useUtils();
  const speichern = trpc.schau.preisartSpeichern.useMutation({
    onSuccess: () => {
      gespeichert();
      utils.schau.get.invalidate();
      fertig();
    },
  });
  const [betragFehler, setBetragFehler] = useState<string | null>(null);
  const senden = (e: FormEvent) => {
    e.preventDefault();
    // Leer heißt 0 €, Unlesbares nicht still als 0 € speichern.
    const betragCent = p.betrag.trim() ? parseEuro(p.betrag) : 0;
    if (betragCent == null) return setBetragFehler("Bitte einen Betrag wie 12,50 eingeben.");
    setBetragFehler(null);
    speichern.mutate({
      id: start.id,
      schauId,
      kuerzel: p.kuerzel,
      name: p.name,
      betragCent,
      sachpreis: p.sachpreis,
      quelle: p.quelle,
      schluesselProTiere: p.schluessel ? Number(p.schluessel) : null,
      anzahlProSchluessel: p.anzahl,
      anzahlProPreisrichter: p.jePr,
      mindestpunkte: p.mindest ? Number(p.mindest) : null,
      rundung: p.rundung,
      folge: start.folge ?? folge,
      zielgruppe: p.zielgruppe,
      sparte: p.sparte.trim(),
    });
  };
  return (
    <form onSubmit={senden} className="grid gap-4 sm:grid-cols-2">
      <Feld label="Kürzel" hinweis="z. B. E, Z, LVEB">{(id) => <Eingabe id={id} value={p.kuerzel} maxLength={10} onChange={(e) => setP({ ...p, kuerzel: e.target.value })} required />}</Feld>
      <Feld label="Name">{(id) => <Eingabe id={id} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} required />}</Feld>
      <Feld label="Geldbetrag (€)" fehler={betragFehler}>{(id) => <Eingabe id={id} inputMode="decimal" value={p.betrag} onChange={(e) => setP({ ...p, betrag: e.target.value })} />}</Feld>
      <Feld label="oder Sachpreis">{(id) => <Eingabe id={id} value={p.sachpreis} onChange={(e) => setP({ ...p, sachpreis: e.target.value })} placeholder="z. B. Band, Medaille" />}</Feld>
      <Feld label="Herkunft" className="sm:col-span-2">
        {(id) => (
          <Auswahl id={id} value={p.quelle} onChange={(e) => setP({ ...p, quelle: e.target.value as typeof p.quelle })}>
            <option value="standgeld">Aus dem Standgeld (über den Schlüssel)</option>
            <option value="stiftung">Gestiftet (Anzahl über Stiftungen)</option>
          </Auswahl>
        )}
      </Feld>
      {p.quelle === "standgeld" && (
        <>
          <Feld label="Anzahl Preise" >{(id) => <Eingabe id={id} type="number" min={0} value={p.anzahl} onChange={(e) => setP({ ...p, anzahl: Number(e.target.value) })} />}</Feld>
          <Feld label="auf … Tiere" hinweis="leer = ohne Schlüssel">{(id) => <Eingabe id={id} type="number" min={1} value={p.schluessel} onChange={(e) => setP({ ...p, schluessel: e.target.value })} />}</Feld>
          <Feld label="Angebrochene Schlüssel" className="sm:col-span-2" >
            {(id) => (
              <Auswahl id={id} value={p.rundung} onChange={(e) => setP({ ...p, rundung: e.target.value as typeof p.rundung })}>
                <option value="voll">nur volle zählen (abrunden)</option>
                <option value="angefangen">angefangene zählen mit (aufrunden)</option>
              </Auswahl>
            )}
          </Feld>
        </>
      )}
      <Feld label="Zusätzlich je Preisrichter">{(id) => <Eingabe id={id} type="number" min={0} value={p.jePr} onChange={(e) => setP({ ...p, jePr: Number(e.target.value) })} />}</Feld>
      <Feld label="Mindestpunkte">{(id) => <Eingabe id={id} type="number" value={p.mindest} onChange={(e) => setP({ ...p, mindest: e.target.value })} placeholder="z. B. 94" />}</Feld>
      <Feld label="Gilt für" >
        {(id) => (
          <Auswahl id={id} value={p.zielgruppe} onChange={(e) => setP({ ...p, zielgruppe: e.target.value as typeof p.zielgruppe })}>
            {PREIS_ZIELGRUPPEN.map((z) => (
              <option key={z} value={z}>{PREIS_ZIELGRUPPE_LABEL[z]}</option>
            ))}
          </Auswahl>
        )}
      </Feld>
      <Feld label="Nur Sparte" hinweis="leer = alle Sparten">
        {(id) => <Eingabe id={id} value={p.sparte} onChange={(e) => setP({ ...p, sparte: e.target.value })} placeholder="alle Sparten" />}
      </Feld>
      {speichern.error && <Hinweis ton="fehler" className="sm:col-span-2">{fehlerText(speichern.error)}</Hinweis>}
      <Knopf type="submit" variante="primaer" laedt={speichern.isPending} className="sm:col-span-2">Speichern</Knopf>
    </form>
  );
}

function Notenskala({ schau: s }: { schau: Schau }) {
  const ausSchau = () => s.notenskala.map((n) => ({ ...n, punkteText: n.punkte.join(", ") }));
  const [zeilen, setZeilen] = useState(ausSchau);
  const gespeichert = useAenderungenWarnen(zeilen);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const speichern = trpc.schau.notenskalaSetzen.useMutation({
    onSuccess: () => {
      gespeichert();
      utils.schau.get.invalidate();
      meldung("Notenskala gespeichert.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const senden = (standard: boolean) => {
    if (standard) return speichern.mutate({ schauId: s.id, skala: null });
    const skala: NotenStufe[] = zeilen.map((z) => ({ kuerzel: z.kuerzel, name: z.name, punkte: z.punkteText.split(/[,\s]+/).filter(Boolean).map(Number) }));
    speichern.mutate({ schauId: s.id, skala });
  };
  return (
    <Abschnitt id="notenskala" titel="Notenskala">
      <p className="mb-3 text-sm text-grau">Übliche BDRG-Skala, vor der Bewertung mit den AAB abgleichen</p>
      <table className="tabelle max-w-2xl">
        <thead>
          <tr>
            <th>Kürzel</th>
            <th>Note</th>
            <th>Punkte</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z, i) => (
            <tr key={i}>
              <td><Eingabe aria-label="Kürzel" value={z.kuerzel} onChange={(e) => setZeilen(zeilen.map((x, j) => (j === i ? { ...x, kuerzel: e.target.value } : x)))} /></td>
              <td><Eingabe aria-label="Note" value={z.name} onChange={(e) => setZeilen(zeilen.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
              <td><Eingabe aria-label="Punkte" value={z.punkteText} onChange={(e) => setZeilen(zeilen.map((x, j) => (j === i ? { ...x, punkteText: e.target.value } : x)))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex gap-2">
        <Speicherleiste
          sichtbar={JSON.stringify(zeilen) !== JSON.stringify(ausSchau())}
          onVerwerfen={() => setZeilen(ausSchau())}
          onSpeichern={() => senden(false)}
          laedt={speichern.isPending}
          knopf="Notenskala speichern"
        />
        <Knopf
          variante="leise"
          onClick={() => {
            setZeilen(STANDARD_NOTENSKALA.map((n) => ({ ...n, punkteText: n.punkte.join(", ") })));
            senden(true);
          }}
        >
          Auf Standard zurücksetzen
        </Knopf>
      </div>
    </Abschnitt>
  );
}

/** Wegweiser: Käfigmaße, Käfig je Rasse und Halle stehen auf eigenen Seiten. */
function KaefigeUndHalle({ schauId }: { schauId: number }) {
  return (
    <Abschnitt id="kaefige" titel="Käfige und Halle">
      <div className="flex flex-wrap gap-2">
        <Link to={`/schau/${schauId}/kaefige`} className={knopfKlasse("zweit")}>
          Käfige
        </Link>
        <Link to={`/schau/${schauId}/hallenplan`} className={knopfKlasse("zweit")}>
          Hallenplan
        </Link>
      </div>
    </Abschnitt>
  );
}

/**
 * Schau absagen (z. B. Ausstellungsverbot wegen Tierseuche): bis vor der Einlieferung. Alle Meldungen werden storniert,
 * die Aussteller benachrichtigt; die Erstattungen stehen danach in der Abrechnung.
 */
function SchauAbsagen({ schau: s }: { schau: Schau }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe } = useFrage();
  const absagen = trpc.schau.absagen.useMutation({
    onSuccess: (r) => {
      utils.schau.invalidate();
      meldung(`Abgesagt: ${r.storniert} Meldung(en) storniert, ${r.benachrichtigt} Aussteller per E-Mail benachrichtigt. Die Erstattungen stehen unter „Abrechnung“.`);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  return (
    <Abschnitt titel="Schau absagen">
      <Knopf
        variante="gefahr"
        laedt={absagen.isPending}
        onClick={async () => {
          const g = await eingabe({ titel: `„${s.name}“ absagen`, text: "Das lässt sich nicht rückgängig machen: Alle Meldungen werden storniert und die Aussteller benachrichtigt.", feld: "Grund (steht in der E-Mail an die Aussteller)", mindestens: 3, knopf: "Schau absagen", gefahr: true });
          if (g) absagen.mutate({ id: s.id, grund: g });
        }}
      >
        Schau absagen …
      </Knopf>
    </Abschnitt>
  );
}

/**
 * Leere Schau löschen (z. B. eine zum Ausprobieren angelegte): nur in der Vorbereitung und ohne Meldungen – der Server
 * prüft das. Zur Sicherheit den Namen eintippen und einen Grund angeben (steht im Protokoll des Vereins).
 */
function SchauLoeschen({ schau: s }: { schau: Schau }) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe } = useFrage();
  const loeschen = trpc.schau.loeschen.useMutation({
    onSuccess: async () => {
      await utils.schau.liste.invalidate();
      meldung(`Die Schau „${s.name}“ ist gelöscht.`);
      navigate("/");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const starten = async () => {
    const was = s.test ? "mit allen Meldungen, Test-Ausstellern, Bewertungen, Kasse und Belegen" : "mit allen Einstellungen, Preisrichtern und Katalogseiten";
    const name = await eingabe({
      titel: "Schau löschen",
      text: `Die Schau „${s.name}“ ${was} endgültig löschen?`,
      feld: "Zur Bestätigung bitte den Namen der Schau eintippen",
      einzeilig: true,
      knopf: "Weiter",
      gefahr: true,
    });
    if (name == null) return;
    if (name.trim() !== s.name.trim()) return meldung("Der Name stimmt nicht – nichts gelöscht.", "fehler");
    const grund = await eingabe({ titel: "Schau löschen", feld: "Grund für das Löschen (steht im Protokoll des Vereins)", mindestens: 3, knopf: "Endgültig löschen", gefahr: true });
    if (grund == null) return;
    loeschen.mutate({ id: s.id, name, grund });
  };
  return (
    <Abschnitt titel="Schau löschen">
      <Knopf variante="gefahr" laedt={loeschen.isPending} onClick={starten}>
        Schau löschen …
      </Knopf>
    </Abschnitt>
  );
}

/**
 * Bestehende Schau als Testschau kennzeichnen (z. B. eine zum Üben angelegte mit Demo-Meldungen). Der Server lehnt ab,
 * wenn darin echte Aussteller gemeldet sind, und nennt sie.
 */
function AlsTestschau({ schau: s }: { schau: Schau }) {
  const [offen, setOffen] = useState(false);
  return (
    <Abschnitt titel="Testschau">
      <Knopf variante="zweit" onClick={() => setOffen(true)}>
        Als Testschau kennzeichnen …
      </Knopf>
      <Dialog offen={offen} onSchliessen={() => setOffen(false)} titel="Als Testschau kennzeichnen">
        {offen && <TestschauDialog schau={s} fertig={() => setOffen(false)} />}
      </Dialog>
    </Abschnitt>
  );
}

/** Zeigt vorher, wer Test-Aussteller wird (oder wer als echter Aussteller das Kennzeichnen verhindert). */
function TestschauDialog({ schau: s, fertig }: { schau: Schau; fertig: () => void }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const vorschau = trpc.schau.testschauVorschau.useQuery({ id: s.id }, { staleTime: 0 });
  const [name, setName] = useState("");
  const kennzeichnen = trpc.schau.alsTestschau.useMutation({
    onSuccess: async (r) => {
      await Promise.all([utils.schau.invalidate(), utils.verein.invalidate(), utils.meldung.invalidate()]);
      meldung(`„${s.name}“ ist jetzt eine Testschau${r.aussteller ? ` – ${r.aussteller} Aussteller gehören nur noch zu ihr` : ""}${r.kopien ? `, ${r.kopien} Test-Kopien angelegt` : ""}.`);
      fertig();
    },
  });
  if (vorschau.error) return <FehlerAnzeige fehler={vorschau.error} nochmal={() => vorschau.refetch()} />;
  if (!vorschau.data) return <Laden />;
  const { werden, kopien, hindernisse } = vorschau.data;
  if (hindernisse.length) {
    return (
      <div className="flex flex-col gap-3">
        <Hinweis ton="fehler">
          Die Schau hat schon {hindernisse.join(", ")}. Das sind echte Aufzeichnungen – eine Testschau ließe sich samt allem löschen. Deshalb lässt sie sich nicht als
          Testschau kennzeichnen.
        </Hinweis>
        <Knopf onClick={fertig}>Schließen</Knopf>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        kennzeichnen.mutate({ id: s.id, name, anzahl: werden.length + kopien.length, kopien: kopien.length > 0 });
      }}
    >
      {werden.length > 0 && (
        <>
          <p>
            {werden.length === 1 ? "Dieser Aussteller wird Test-Aussteller und verschwindet" : `Diese ${werden.length} Aussteller werden Test-Aussteller und verschwinden`} aus „Aussteller“
            und aus echten Schauen. Bitte prüfen, dass keine echte Person dabei ist:
          </p>
          <ul className="max-h-48 list-disc overflow-y-auto rounded border border-linie py-2 pl-8">{werden.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </>
      )}
      {kopien.length > 0 && (
        <>
          <p>
            {kopien.length === 1 ? "Dieser echte Aussteller bleibt" : `Diese ${kopien.length} echten Aussteller bleiben`}, wie {kopien.length === 1 ? "er ist" : "sie sind"}. Seine bzw. ihre
            Meldungen in dieser Schau gehen auf eine Test-Kopie über, die nur Name und Verein trägt:
          </p>
          <ul className="max-h-48 list-disc overflow-y-auto rounded border border-linie py-2 pl-8">{kopien.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </>
      )}
      {!werden.length && !kopien.length && <p>Die Schau hat noch keine Meldungen.</p>}
      <p className="text-grau">Das lässt sich nicht rückgängig machen.</p>
      <Feld label="Zur Bestätigung den Namen der Schau eintippen" hinweis={`„${s.name}“`}>
        {(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
      </Feld>
      {kennzeichnen.error && <Hinweis ton="fehler">{fehlerText(kennzeichnen.error)}</Hinweis>}
      <Knopf type="submit" variante="gefahr" disabled={name.trim() !== s.name.trim()} laedt={kennzeichnen.isPending}>
        Endgültig als Testschau kennzeichnen
      </Knopf>
    </form>
  );
}

/** Testschau: Demodaten neu einspielen (alles Bisherige der Testschau wird ersetzt, Einstellungen bleiben). */
function Demodaten({ schau: s }: { schau: Schau }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const navigate = useNavigate();
  const [offen, setOffen] = useState(false);
  const [name, setName] = useState("");
  const neu = trpc.schau.demodatenNeu.useMutation({
    // Auch bei einem Fehler: Das Zurücksetzen kann schon gelöscht haben.
    onError: () => utils.invalidate(),
    onSuccess: async (r) => {
      await utils.invalidate();
      setOffen(false);
      setName("");
      meldung(`Demodaten neu eingespielt: ${r.ok ? `${r.meldungen} Meldungen, ${r.tiere} Tiere` : ""}, Phase „Einlieferung“.`);
      navigate(`/schau/${s.id}`);
    },
  });
  return (
    <Abschnitt titel="Demodaten">
      <Knopf variante="zweit" onClick={() => setOffen(true)}>
        Demodaten neu einspielen …
      </Knopf>
      <Dialog offen={offen} onSchliessen={() => !neu.isPending && setOffen(false)} titel="Demodaten neu einspielen">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            neu.mutate({ id: s.id, name });
          }}
        >
          <p>Alles, was bisher in „{s.name}“ gemeldet, bewertet, verkauft oder abgerechnet wurde, wird gelöscht und durch frische Demodaten ersetzt.</p>
          <Feld label="Zur Bestätigung den Namen der Schau eintippen" hinweis={`„${s.name}“`}>
            {(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
          </Feld>
          {neu.error && <Hinweis ton="fehler">{fehlerText(neu.error)}</Hinweis>}
          <Knopf type="submit" variante="gefahr" disabled={name.trim() !== s.name.trim()} laedt={neu.isPending}>
            {neu.isPending ? "Demodaten werden eingespielt …" : "Demodaten neu einspielen"}
          </Knopf>
        </form>
      </Dialog>
    </Abschnitt>
  );
}

/** Übliche Reihenfolge in der Halle – Vorschlag beim Einschalten, danach frei sortierbar. */
const KAEFIG_FOLGE_VORSCHLAG: KaefigTyp[] = ["voliere", "stamm", "grosskaefig", "huehner", "zwerghuehner", "tauben"];

/**
 * Katalognummern nach Käfigblöcken: Die Käfige einer Größe bekommen durchgehende Nummern in der Reihenfolge, in der sie in
 * der Halle stehen; innerhalb eines Blocks gilt die Ausstellungsfolge. Aus = nach Sparten.
 */
function KaefigFolge({ wert, setzen, gesperrt, masse }: { wert: KaefigTyp[] | null; setzen: (f: KaefigTyp[] | null) => void; gesperrt: boolean; masse: KaefigMasse }) {
  const schieben = (i: number, d: -1 | 1) => {
    if (!wert) return;
    const f = [...wert];
    const j = i + d;
    if (j < 0 || j >= f.length) return;
    [f[i], f[j]] = [f[j]!, f[i]!];
    setzen(f);
  };
  return (
    <div className="flex flex-col gap-2 rounded-md bg-papier p-4 md:col-span-2">
      <Haken
        label="Katalognummern nach Käfigblöcken (so wie die Käfige in der Halle stehen)"
        checked={!!wert}
        onChange={(v) => setzen(v ? KAEFIG_FOLGE_VORSCHLAG : null)}
        disabled={gesperrt}
        hinweis={
          gesperrt
            ? "Festgeschrieben"
            : "Wirkt beim nächsten Nummern-Vergeben"
        }
      />
      {wert && (
        <ol className="flex flex-col gap-1">
          {wert.map((t, i) => (
            <li key={t} className="flex items-center gap-2">
              <span className="w-6 text-right text-grau">{i + 1}.</span>
              <span className="min-w-0 flex-1 font-bold sm:min-w-40 sm:flex-none">{kaefigNameLang(t, masse)}</span>
              <Knopf variante="leise" className="min-h-8 px-2" disabled={gesperrt || i === 0} onClick={() => schieben(i, -1)} aria-label={`${kaefigNameLang(t, masse)} nach vorn`}>
                ↑
              </Knopf>
              <Knopf variante="leise" className="min-h-8 px-2" disabled={gesperrt || i === wert.length - 1} onClick={() => schieben(i, 1)} aria-label={`${kaefigNameLang(t, masse)} nach hinten`}>
                ↓
              </Knopf>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
