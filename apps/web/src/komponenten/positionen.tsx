import { kaefigMass, kaefigName, kaefigTyp, MELDEARTEN, ohneEszett, pruefeBesatz, standardBesatz, texte, type Alter, type KaefigMasse, type KaefigRegel, type Meldeart, type Sprache, type Texte } from "@schau/domain";
import { useEffect, useId, useRef, useState } from "react";
import { centZuText, parseEuro } from "../lib";
import { useSprache, useTexte } from "../sprache";
import { Symbol } from "../symbole";
import { Auswahl, Eingabe, Knopf } from "../ui";

export interface Treffer {
  id: number;
  rasseId: number;
  rasse: string;
  farbenschlag: string;
  sparte: string;
}

export interface Position {
  /** Nur bei bereits gespeicherten Positionen. */
  id?: number;
  schluessel: string;
  farbenschlag: Treffer | null;
  freitext: string;
  /** Bei freier Bezeichnung: ein Farbenschlag der Rasse, bei der das Tier im Katalog steht (nur die Rasse zählt). */
  einordnung: Treffer | null;
  imVerzeichnis: boolean;
  art: Meldeart;
  geschlecht: string;
  alter: Alter;
  istAoc: boolean;
  istNeuzuechtung: boolean;
  eigeneZucht: boolean;
  verkaufspreis: string;
  /** Ringnummer(n), z. B. „D 26 AZ 123“; bei Stamm/Voliere mehrere durch Komma. Freiwillig, sonst bei der Einlieferung. */
  ringnummern: string;
  /** Nur zur Anzeige bei gespeicherten Einträgen. */
  katalog?: string;
  gesperrt?: boolean;
  /** Eingeliefert oder ausgegeben: die Zeile bleibt (Tierliste fürs Veterinäramt), auch wenn die Felder noch änderbar sind. */
  inHalle?: boolean;
}

let zaehler = 0;
export function neuePosition(vorlage?: Partial<Position>): Position {
  return {
    schluessel: `p${++zaehler}`,
    farbenschlag: null,
    freitext: "",
    einordnung: null,
    imVerzeichnis: true,
    art: "einzeltier",
    geschlecht: "1,0",
    alter: "jung",
    istAoc: false,
    istNeuzuechtung: false,
    eigeneZucht: true,
    verkaufspreis: "",
    ringnummern: "",
    ...vorlage,
    id: undefined,
    katalog: undefined,
    gesperrt: undefined,
  };
}

export function alsEingabe(p: Position) {
  return {
    id: p.id,
    farbenschlagId: p.imVerzeichnis ? (p.farbenschlag?.id ?? null) : null,
    freitext: p.imVerzeichnis ? "" : p.freitext,
    rasseId: p.imVerzeichnis ? null : (p.einordnung?.rasseId ?? null),
    art: p.art,
    geschlecht: p.geschlecht.trim(),
    alter: p.alter,
    istAoc: p.istAoc,
    istNeuzuechtung: p.istNeuzuechtung,
    eigeneZucht: p.eigeneZucht,
    verkaufspreisCent: p.verkaufspreis.trim() ? parseEuro(p.verkaufspreis) : null,
    ringnummern: p.ringnummern.trim(),
  };
}

/** Prüft die Positionen vor dem Senden. Gibt Fehlertexte je Zeile zurück (Online-Meldung in der Sprache des Ausstellers). */
export function pruefePositionen(positionen: Position[], t: Texte = texte("de")): string[] {
  const fehler: string[] = [];
  positionen.forEach((p, i) => {
    const z = t.tiere.zeile(i + 1);
    if (p.imVerzeichnis && !p.farbenschlag) fehler.push(`${z}: ${t.tiere.fehlerFarbenschlag}`);
    if (!p.imVerzeichnis && !p.freitext.trim()) fehler.push(`${z}: ${t.tiere.fehlerBezeichnung}`);
    if (!p.imVerzeichnis && !p.einordnung) fehler.push(`${z}: ${t.tiere.fehlerEinordnung}`);
    if (!/^\d{1,2},\d{1,2}$/.test(p.geschlecht.trim())) fehler.push(`${z}: ${t.tiere.fehlerGeschlecht}`);
    if (p.verkaufspreis.trim() && parseEuro(p.verkaufspreis) == null) fehler.push(`${z}: ${t.tiere.fehlerVerkaufspreis}`);
  });
  // Dieselbe Ringnummer in zwei Zeilen ist fast immer ein Übertragungsfehler.
  const ringe = new Map<string, number>();
  positionen.forEach((p, i) => {
    for (const r of p.ringnummern.split(/[,;\n]/).map((x) => x.replace(/\s+/g, "").toUpperCase()).filter(Boolean)) {
      const vorher = ringe.get(r);
      if (vorher !== undefined && vorher !== i) fehler.push(`${t.tiere.zeile(i + 1)}: ${t.tiere.fehlerRingDoppelt(r, vorher + 1)}`);
      else ringe.set(r, i);
    }
  });
  return fehler;
}

export function ausEintrag(e: {
  id: number;
  farbenschlagId: number | null;
  rasse: string | null;
  farbenschlag: string | null;
  sparte: string | null;
  freitext: string;
  einordnungRasseId: number | null;
  einordnungRasse: string | null;
  art: Meldeart;
  geschlecht: string;
  alter: Alter;
  istAoc: boolean;
  istNeuzuechtung: boolean;
  eigeneZucht: boolean;
  verkaufspreisCent: number | null;
  ringnummern: string | null;
  katalogNr: number | null;
  suffix: string;
  bewertet: boolean;
  status?: string;
}): Position {
  return {
    id: e.id,
    schluessel: `e${e.id}`,
    farbenschlag: e.farbenschlagId ? { id: e.farbenschlagId, rasseId: 0, rasse: e.rasse ?? "", farbenschlag: e.farbenschlag ?? "", sparte: e.sparte ?? "" } : null,
    freitext: e.freitext,
    // Für die Anzeige reicht die Rasse; die Farbe der Auswahl spielt keine Rolle.
    einordnung: e.einordnungRasseId ? { id: 0, rasseId: e.einordnungRasseId, rasse: e.einordnungRasse ?? "", farbenschlag: "", sparte: e.sparte ?? "" } : null,
    imVerzeichnis: e.farbenschlagId != null,
    art: e.art,
    geschlecht: e.geschlecht,
    alter: e.alter,
    istAoc: e.istAoc,
    istNeuzuechtung: e.istNeuzuechtung,
    eigeneZucht: e.eigeneZucht,
    verkaufspreis: centZuText(e.verkaufspreisCent),
    ringnummern: e.ringnummern ?? "",
    katalog: e.katalogNr != null ? `${e.katalogNr}${e.suffix}` : undefined,
    gesperrt: e.bewertet,
    inHalle: e.status === "eingeliefert" || e.status === "ausgesetzt",
  };
}

/** Suchfeld für „Rasse, Farbenschlag“ mit Auswahlliste, per Tastatur bedienbar. */
export function FarbenschlagWahl({
  wert,
  onWahl,
  suche,
  label,
  nurRasse,
  platzhalter,
  onFrei,
}: {
  wert: Treffer | null;
  onWahl: (t: Treffer | null) => void;
  /** Getippte Bezeichnung als freie Angabe übernehmen (steht nicht im Verzeichnis) – letzter Eintrag der Liste. */
  onFrei?: (text: string) => void;
  suche: (q: string) => { data?: Treffer[]; isFetching: boolean };
  label: string;
  /** Nur die Rasse wählen (zum Einordnen freier Bezeichnungen). */
  nurRasse?: boolean;
  platzhalter?: string;
}) {
  const tt = useTexte().tiere;
  const anzeige = (t: Treffer) => (nurRasse ? t.rasse : `${t.rasse}, ${t.farbenschlag}`);
  const [text, setText] = useState(wert ? anzeige(wert) : "");
  const [q, setQ] = useState("");
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(0);
  const listeId = useId();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ergebnis = suche(q);
  const alle = ergebnis.data ?? [];
  const treffer = nurRasse ? alle.filter((t, i) => alle.findIndex((x) => x.rasseId === t.rasseId) === i) : alle;
  // Eigener Eintrag am Ende der Liste: getippten Text frei übernehmen (nicht beim Einordnen nach Rasse).
  const frei = onFrei && !nurRasse && q.trim().length >= 2 && !ergebnis.isFetching ? text.trim() : "";
  const anzahl = treffer.length + (frei ? 1 : 0);

  useEffect(() => {
    setText(wert ? anzeige(wert) : "");
  }, [nurRasse ? wert?.rasseId : wert?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const waehle = (t: Treffer) => {
    onWahl(t);
    setText(anzeige(t));
    setOffen(false);
  };

  return (
    <div className="relative">
      <Eingabe
        aria-label={label}
        role="combobox"
        aria-expanded={offen}
        aria-controls={listeId}
        aria-autocomplete="list"
        aria-activedescendant={offen && q.trim().length >= 2 && aktiv < anzahl ? `${listeId}-opt-${aktiv}` : undefined}
        value={text}
        placeholder={platzhalter ?? tt.suchePlatzhalter}
        className={wert ? "" : "border-stroh-dunkel/50"}
        onChange={(e) => {
          setText(e.target.value);
          if (wert) onWahl(null);
          clearTimeout(timer.current);
          const v = e.target.value;
          timer.current = setTimeout(() => setQ(v), 180);
          setOffen(true);
          setAktiv(0);
        }}
        onFocus={() => text && !wert && setOffen(true)}
        onBlur={() => setTimeout(() => setOffen(false), 150)}
        onKeyDown={(e) => {
          if (!offen || anzahl === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAktiv((a) => Math.min(a + 1, anzahl - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAktiv((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (aktiv < treffer.length) waehle(treffer[aktiv]!);
            else if (frei) {
              setOffen(false);
              onFrei!(frei);
            }
          } else if (e.key === "Escape") setOffen(false);
        }}
      />
      {offen && q.trim().length >= 2 && (
        <ul id={listeId} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full max-w-[calc(100vw-2rem)] overflow-auto sm:min-w-80 sm:max-w-none rounded-md border border-linie bg-weiss shadow-lg">
          {treffer.length === 0 && <li className="px-3 py-2 text-grau">{ergebnis.isFetching ? tt.suche : tt.nichtsGefunden}</li>}
          {treffer.map((t, i) => (
            <li
              key={nurRasse ? t.rasseId : t.id}
              id={`${listeId}-opt-${i}`}
              role="option"
              aria-selected={i === aktiv}
              onMouseDown={(e) => {
                e.preventDefault();
                waehle(t);
              }}
              className={`cursor-pointer px-3 py-2 ${i === aktiv ? "bg-band-hell" : ""}`}
            >
              <span className="font-semibold">{t.rasse}</span>
              {!nurRasse && `, ${t.farbenschlag}`}
              <span className="ml-2 text-sm text-grau">{t.sparte}</span>
            </li>
          ))}
          {frei && (
            <li
              id={`${listeId}-opt-${treffer.length}`}
              role="option"
              aria-selected={aktiv === treffer.length}
              onMouseDown={(e) => {
                e.preventDefault();
                setOffen(false);
                onFrei!(frei);
              }}
              className={`cursor-pointer border-t border-linie px-3 py-2 text-band ${aktiv === treffer.length ? "bg-band-hell" : ""}`}
            >
              {tt.freiUebernehmen(frei)}
              <span className="block text-sm text-grau">{tt.nichtImVerzeichnisKlein}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Sparte und Rasse als Text – für die Besatzregel von Stämmen und Volieren. */
function tierText(p: Position): string {
  return p.imVerzeichnis ? `${p.farbenschlag?.sparte ?? ""} ${p.farbenschlag?.rasse ?? ""}` : p.freitext;
}

/** Tabelle zum Erfassen der Tiere einer Meldung – Reihenfolge wie auf dem Meldebogen. */
/** Käfiggröße einer Meldezeile (ohne gewählte Rasse bei Einzeltieren noch keine – sonst stünde eine falsche da). */
function kaefigText(p: Position, regeln: KaefigRegel[], masse: KaefigMasse, t: Texte, sprache: Sprache): string | null {
  const wahl = p.imVerzeichnis ? p.farbenschlag : p.einordnung;
  if (p.art === "einzeltier" && !wahl) return null;
  const typ = kaefigTyp({ art: p.art, sparte: wahl?.sparte, rasse: wahl?.rasse }, regeln);
  if (!typ) return t.tiere.ohneKaefig;
  if (sprache === "de" || sprache === "de-CH") return t.tiere.kaefig(sprache === "de" ? kaefigName(typ, masse) : ohneEszett(kaefigName(typ, masse)));
  // Andere Sprachen: nur das Maß, bei Stamm und Voliere mit übersetztem Namen davor.
  const m = kaefigMass(typ, masse);
  const zahl = (n: number) => String(n).replace(".", sprache === "en" ? "." : ",");
  const mass = m ? `${zahl(m.breite)} × ${zahl(m.tiefe)} × ${zahl(m.hoehe)} cm` : "";
  const name = typ === "stamm" || typ === "voliere" ? t.meldeart[typ] : "";
  return t.tiere.kaefig([name, mass].filter(Boolean).join(" "));
}

/** Hinweis zum vorgeschriebenen Besatz von Stamm und Voliere, in der Sprache der Seite. */
function besatzHinweis(p: Position, t: Texte): string | null {
  const text = `${p.imVerzeichnis ? `${p.farbenschlag?.sparte ?? ""} ${p.farbenschlag?.rasse ?? ""}` : p.freitext}`;
  if (!pruefeBesatz(p.art, p.geschlecht, text)) return null;
  return t.tiere.besatz(standardBesatz(p.art, text) ?? "");
}

export function PositionenEditor({
  positionen,
  setPositionen,
  suche,
  kaefigRegeln = [],
  kaefigMasse = {},
  festgeschrieben = false,
}: {
  positionen: Position[];
  setPositionen: (p: Position[]) => void;
  suche: (q: string) => { data?: Treffer[]; isFetching: boolean };
  /** Abweichende Käfiggrößen je Rasse der Schau – damit die angezeigte Größe stimmt. */
  kaefigRegeln?: KaefigRegel[];
  /** Maße der Käfige der Schau – angezeigt wird das Maß, nicht der Name. */
  kaefigMasse?: KaefigMasse;
  /**
   * Katalognummern festgeschrieben: Nummerierte Tiere stehen schon auf Karten und im Katalog – Rasse, Art, Geschlecht
   * und Alter bleiben, und die Zeile lässt sich nicht entfernen (der Server sperrt beides ebenso).
   */
  festgeschrieben?: boolean;
}) {
  const t = useTexte();
  const sprache = useSprache();
  const tt = t.tiere;
  const aendern = (i: number, teil: Partial<Position>) => setPositionen(positionen.map((p, j) => (j === i ? { ...p, ...teil } : p)));
  const naechstesGeschlecht = (p: Position): Partial<Position> => {
    // Reihenfolge des Meldebogens: 1,0 jung → 1,0 alt → 0,1 jung → 0,1 alt
    if (p.geschlecht === "1,0" && p.alter === "jung") return { geschlecht: "1,0", alter: "alt" };
    if (p.geschlecht === "1,0" && p.alter === "alt") return { geschlecht: "0,1", alter: "jung" };
    if (p.geschlecht === "0,1" && p.alter === "jung") return { geschlecht: "0,1", alter: "alt" };
    return {};
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="tiere-rahmen">
        <div>
        <table className="tabelle tabelle-tiere table-fixed">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th>{tt.rasseFarbenschlag}</th>
              <th className="w-40">{tt.art}</th>
              <th className="w-28">{tt.geschlecht}</th>
              <th className="w-24">{tt.alter}</th>
              <th className="w-36">
                <abbr title={tt.ringnummerTitel}>{tt.ringNr}</abbr>
              </th>
              <th className="w-28 text-right">
                <abbr title={tt.verkaufTitel}>{tt.verkauf}</abbr>
              </th>
              <th className="w-14 text-center">
                <abbr title={tt.eigeneZucht}>{tt.eigeneZuchtKurz}</abbr>
              </th>
              <th className="w-44">
                <span className="sr-only">{tt.aktionen}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {positionen.map((p, i) => {
              const fest = festgeschrieben && !!p.katalog;
              return (
              <tr key={p.schluessel}>
                <td data-label={tt.nr} className="pt-4 text-grau">{p.katalog ? <span className="nummer text-tinte">{p.katalog}</span> : i + 1}</td>
                <td data-label={tt.rasseFarbenschlag}>
                  <fieldset disabled={fest} className="contents">
                  {p.imVerzeichnis ? (
                    <FarbenschlagWahl
                      label={`${tt.zeile(i + 1)}: ${tt.rasseFarbenschlag}`}
                      wert={p.farbenschlag}
                      onWahl={(t) => aendern(i, { farbenschlag: t })}
                      suche={suche}
                      onFrei={(text) => aendern(i, { imVerzeichnis: false, freitext: text, farbenschlag: null })}
                    />
                  ) : (
                    <div className="flex flex-col gap-1">
                      <Eingabe aria-label={`${tt.zeile(i + 1)}: ${tt.bezeichnung}`} value={p.freitext} placeholder={tt.bezeichnungFrei} onChange={(e) => aendern(i, { freitext: e.target.value })} />
                      <FarbenschlagWahl
                        label={`${tt.zeile(i + 1)}: ${tt.einordnen}`}
                        platzhalter={tt.einordnenPlatzhalter}
                        nurRasse
                        wert={p.einordnung}
                        onWahl={(t) => aendern(i, { einordnung: t })}
                        suche={suche}
                      />
                      <div className="flex gap-4 text-sm">
                        <label className="flex items-center gap-1">
                          <input type="checkbox" className="accent-band" checked={p.istAoc} onChange={(e) => aendern(i, { istAoc: e.target.checked })} /> AOC
                        </label>
                        <label className="flex items-center gap-1">
                          <input type="checkbox" className="accent-band" checked={p.istNeuzuechtung} onChange={(e) => aendern(i, { istNeuzuechtung: e.target.checked })} /> {tt.neuzuechtung}
                        </label>
                      </div>
                    </div>
                  )}
                  <button type="button" className="mt-1 text-sm text-grau hover:text-band hover:underline" onClick={() => aendern(i, { imVerzeichnis: !p.imVerzeichnis })}>
                    {p.imVerzeichnis ? tt.nichtImVerzeichnis : tt.ausVerzeichnis}
                  </button>
                  </fieldset>
                  {fest && <p className="mt-1 text-xs text-grau">{tt.festgeschrieben}</p>}
                </td>
                <td data-label={tt.art}>
                  <fieldset disabled={fest} className="contents">
                  <Auswahl
                    aria-label={`${tt.zeile(i + 1)}: ${tt.art}`}
                    kompakt
                    value={p.art}
                    onChange={(e) => {
                      const art = e.target.value as Meldeart;
                      const besatz = standardBesatz(art, tierText(p));
                      aendern(i, { art, geschlecht: besatz ?? (/^[01],[01]$/.test(p.geschlecht) ? p.geschlecht : "1,0") });
                    }}
                  >
                    {MELDEARTEN.map((a) => (
                      <option key={a} value={a}>
                        {t.meldeart[a]}
                      </option>
                    ))}
                  </Auswahl>
                  </fieldset>
                  {kaefigText(p, kaefigRegeln, kaefigMasse, t, sprache) && <p className="mt-1 whitespace-nowrap text-xs text-grau">{kaefigText(p, kaefigRegeln, kaefigMasse, t, sprache)}</p>}
                </td>
                <td data-label={tt.geschlecht}>
                  <fieldset disabled={fest} className="contents">
                  {p.art === "einzeltier" ? (
                    <Auswahl aria-label={`${tt.zeile(i + 1)}: ${tt.geschlecht}`} kompakt value={p.geschlecht} onChange={(e) => aendern(i, { geschlecht: e.target.value })}>
                      <option value="1,0">1,0</option>
                      <option value="0,1">0,1</option>
                    </Auswahl>
                  ) : (
                    <>
                      <Eingabe aria-label={`${tt.zeile(i + 1)}: ${tt.geschlecht}`} value={p.geschlecht} onChange={(e) => aendern(i, { geschlecht: e.target.value })} />
                      {besatzHinweis(p, t) && <p className="mt-1 text-sm font-semibold text-stroh-dunkel">{besatzHinweis(p, t)}</p>}
                    </>
                  )}
                  </fieldset>
                </td>
                <td data-label={tt.alter}>
                  <Auswahl aria-label={`${tt.zeile(i + 1)}: ${tt.alter}`} kompakt disabled={fest} value={p.alter} onChange={(e) => aendern(i, { alter: e.target.value as Alter })}>
                    <option value="jung">{t.alter.jung}</option>
                    <option value="alt">{t.alter.alt}</option>
                  </Auswahl>
                </td>
                <td data-label={tt.ringNr}>
                  <Eingabe aria-label={`${tt.zeile(i + 1)}: ${tt.ringnummer}`} maxLength={200} value={p.ringnummern} onChange={(e) => aendern(i, { ringnummern: e.target.value })} placeholder={tt.freiwillig} />
                </td>
                <td data-label={`${tt.verkaufspreis} (€)`}>
                  <Eingabe aria-label={`${tt.zeile(i + 1)}: ${tt.verkaufspreis}`} inputMode="decimal" value={p.verkaufspreis} onChange={(e) => aendern(i, { verkaufspreis: e.target.value })} placeholder="–" className="text-right" />
                </td>
                <td data-label={tt.eigeneZucht} className="pt-4 text-center">
                  <input type="checkbox" aria-label={`${tt.zeile(i + 1)}: ${tt.eigeneZucht}`} className="size-5 accent-band" checked={p.eigeneZucht} onChange={(e) => aendern(i, { eigeneZucht: e.target.checked })} />
                </td>
                <td className="whitespace-nowrap text-right">
                  <Knopf variante="leise" className="text-sm" title={tt.naechstesTierTitel} onClick={() => setPositionen([...positionen.slice(0, i + 1), neuePosition({ ...p, ...naechstesGeschlecht(p), verkaufspreis: "", ringnummern: "" }), ...positionen.slice(i + 1)])}>
                    {tt.naechstesTier}
                  </Knopf>
                  <Knopf variante="leise" disabled={p.gesperrt || p.inHalle || fest} title={p.gesperrt ? tt.bewertet : p.inHalle ? tt.inHalle : fest ? tt.festgeschrieben : tt.entfernen} onClick={() => setPositionen(positionen.filter((_, j) => j !== i))} aria-label={tt.zeileEntfernen(i + 1)}>
                    <Symbol name="schliessen" className="size-4" />
                  </Knopf>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Knopf onClick={() => setPositionen([...positionen, neuePosition()])}>{tt.hinzufuegen}</Knopf>
        <span className="text-sm text-grau">
          {tt.zeilen(positionen.length)}
        </span>
      </div>
    </div>
  );
}
