import { kaefigNameLang, sortierungText, UNTERSUCHUNG_ARTEN, UNTERSUCHUNG_LABEL, type KaefigMasse, type KaefigTyp, type Untersuchung } from "@schau/domain";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { fehlerText } from "../lib";
import { VetAmtFeld } from "./einstellungen-vetamt";
import { trpc, type Ausgabe } from "../trpc";
import { Auswahl, Eingabe, Feld, FormAbschnitt, Formular, Haken, HilfeLink, Hinweis, Knopf, Speicherleiste, Textfeld, useAenderungenWarnen, useMeldung } from "../ui";

/*
 * Einstellungen der Schau, großes Formular „Stammangaben“: Schau, Termine, Meldegeld und Konto, Katalog und Preise,
 * Bestimmungen, Veterinäramt; dazu die Katalognummern nach Käfigblöcken.
 */

type Schau = Ausgabe["schau"]["get"];

export function Stammangaben({ schau: s }: { schau: Schau }) {
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
    girocode: s.girocode,
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
        <FormAbschnitt id="zahlung" titel="Meldegeld und Konto" aktionen={<HilfeLink abschnitt="girocode">Hilfe zum GiroCode</HilfeLink>}>
          <Feld label="Meldegeld zahlen">
            {(fid) => (
              <Auswahl
                id={fid}
                value={d.zahlungBeiEinlieferung ? "einlieferung" : d.girocode ? "girocode" : "vorab"}
                onChange={(e) => {
                  set("zahlungBeiEinlieferung", e.target.value === "einlieferung");
                  set("girocode", e.target.value === "girocode");
                }}
              >
                <option value="vorab">vorab per Überweisung</option>
                <option value="girocode">vorab per Überweisung mit GiroCode</option>
                <option value="einlieferung">bei der Einlieferung der Tiere</option>
              </Auswahl>
            )}
          </Feld>
          {d.girocode && !d.zahlungBeiEinlieferung ? (
            <Feld label="Bankverbindung für das Meldegeld" hinweis="Mit GiroCode: das Vereinskonto unten">
              {(fid) => <Eingabe id={fid} disabled value={[d.vereinKontoinhaber, d.vereinIban].filter(Boolean).join(", ")} />}
            </Feld>
          ) : (
            text("bankverbindung", "Bankverbindung für das Meldegeld", d.zahlungBeiEinlieferung ? "Wird bei Zahlung bei der Einlieferung nicht angezeigt" : undefined)
          )}
          <Feld label="Provision Tierverkauf (%)">
            {(fid) => <Eingabe id={fid} type="number" min={0} max={50} step={0.5} value={d.provisionBp / 100} onChange={(e) => set("provisionBp", Math.round(Number(e.target.value) * 100))} />}
          </Feld>
          <div className="grid gap-4 rounded-lg border border-linie bg-papier p-4 md:col-span-2 md:grid-cols-3">
            <p className="text-sm font-semibold md:col-span-3">Vereinskonto für Auszahlungen (SEPA){d.girocode && !d.zahlungBeiEinlieferung ? " und GiroCode" : ""}</p>
            {text("vereinKontoinhaber", "Kontoinhaber", d.girocode && !d.zahlungBeiEinlieferung ? "Genau wie bei der Bank" : undefined)}
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
