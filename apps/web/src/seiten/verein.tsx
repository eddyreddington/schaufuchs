import {
  artenDerSparte,
  AUFBEWAHRUNG_BELEGE_JAHRE,
  AUFBEWAHRUNG_VERKAUF_JAHRE,
  BAUSTEIN_ART_LISTE,
  BAUSTEIN_ARTEN,
  BAUSTEIN_KATEGORIE_LABEL,
  BAUSTEIN_KATEGORIEN,
  formatEuro,
  INAKTIV_JAHRE,
  KARENZ_TAGE,
  POSTAUSGANG_TAGE,
  sortiereGruppen,
  type BausteinArt,
  type BausteinKategorie,
} from "@schau/domain";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { datum, datumZeit, fehlerText } from "../lib";
import { trpc, type Ausgabe } from "../trpc";
import { AutoAbmeldung } from "./verein-abmeldung";
import { Druckvorlagen } from "./verein-druckvorlagen";
import { SteuerAngaben } from "./verein-steuer";
import { Abschnitt, Auswahl, Eingabe, FehlerAnzeige, Feld, FormAbschnitt, Formular, HilfeLink, Hinweis, Knopf, knopfKlasse, Laden, Leer, Marke, SEITE, Seitenkopf, Speicherleiste, Suchfeld, Textfeld, useMeldung } from "../ui";

type Angaben = Ausgabe["verein"]["get"]["angaben"];

export function Verein() {
  const v = trpc.verein.get.useQuery();
  return (
    <div className={SEITE}>
      <Seitenkopf
        titel="Verein und Datenschutz"
        hilfe="verein-und-datenschutz"
        aktionen={
          <Link to="/aussteller" className={knopfKlasse()}>
            Aussteller: Auskunft und Löschung
          </Link>
        }
      />
      {v.error ? <FehlerAnzeige fehler={v.error} nochmal={() => v.refetch()} /> : !v.data ? <Laden /> : <Angabenformular key={JSON.stringify(v.data.angaben)} daten={v.data} />}
      <SteuerAngaben />
      <AutoAbmeldung />
      <Druckvorlagen />
      <Postausgang />
      <Textbausteine />
      <PersonenAuskunft />
      <Speicherfristen />
    </div>
  );
}

function Angabenformular({ daten }: { daten: Ausgabe["verein"]["get"] }) {
  const [a, setA] = useState<Angaben>(daten.angaben);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const speichern = trpc.verein.speichern.useMutation({
    onSuccess: async () => {
      await utils.verein.get.invalidate();
      meldung("Angaben gespeichert.");
    },
  });
  const senden = (e: FormEvent) => {
    e.preventDefault();
    speichern.mutate(a);
  };
  const geaendert = JSON.stringify(a) !== JSON.stringify(daten.angaben);
  const feld = (k: keyof Angaben, label: string, opts: { hinweis?: string; zeilen?: number; typ?: string; klasse?: string } = {}) => (
    <Feld label={label} hinweis={opts.hinweis} className={opts.klasse}>
      {(id) =>
        opts.zeilen ? (
          <Textfeld id={id} rows={opts.zeilen} value={a[k]} onChange={(e) => setA({ ...a, [k]: e.target.value })} />
        ) : (
          <Eingabe id={id} type={opts.typ ?? "text"} value={a[k]} onChange={(e) => setA({ ...a, [k]: e.target.value })} />
        )
      }
    </Feld>
  );
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <form onSubmit={senden} className="flex min-w-0 flex-col gap-4">
        {daten.fehlend.length > 0 && <Hinweis ton="warnung">Für Impressum und Datenschutzhinweise fehlt noch: {daten.fehlend.join(", ")}.</Hinweis>}
        <Formular>
          <FormAbschnitt id="impressum" titel="Anbieter" unter="Impressum nach § 5 DDG">
            {feld("name", "Name des Vereins", { hinweis: "z. B. „Geflügelzuchtverein Musterstadt 1904 e. V.“", klasse: "md:col-span-2" })}
            {feld("anschrift", "Anschrift", { zeilen: 2, hinweis: "Kein Postfach" })}
            {feld("vertretung", "Vertretungsberechtigter Vorstand", { zeilen: 2, hinweis: "Je Zeile, z. B. „Max Muster (1. Vorsitzender)“" })}
            {feld("email", "E-Mail-Adresse", { typ: "email" })}
            {feld("telefon", "Telefon", { typ: "tel" })}
            {feld("register", "Registereintrag", { hinweis: "z. B. „Amtsgericht Kassel, VR 1234“" })}
            {feld("inhaltVerantwortlich", "Verantwortlich für den Inhalt (§ 18 MStV)", { hinweis: "Nur bei redaktionellen Inhalten" })}
            {feld("impressumZusatz", "Weitere Angaben im Impressum", { zeilen: 2, klasse: "md:col-span-2" })}
          </FormAbschnitt>
          <FormAbschnitt id="datenschutz" titel="Datenschutzhinweise" unter="Art. 13 DSGVO. Verantwortlich für den Text ist der Verein.">
            {feld("datenschutzbeauftragter", "Datenschutzbeauftragter (falls benannt)", { zeilen: 2 })}
            {feld("datenschutzZusatz", "Ergänzungen", { zeilen: 2, hinweis: "z. B. zum Hosting" })}
            <div className="flex flex-col gap-2 md:col-span-2">
              <Feld label="Eigener vollständiger Text (ersetzt das Muster)" hinweis="Leer: Muster. Absätze mit Leerzeile trennen.">
                {(id) => <Textfeld id={id} rows={a.datenschutzText ? 14 : 3} value={a.datenschutzText} onChange={(e) => setA({ ...a, datenschutzText: e.target.value })} />}
              </Feld>
              {!a.datenschutzText && (
                <Knopf variante="leise" className="self-start" onClick={() => setA({ ...a, datenschutzText: daten.muster })}>
                  Muster als eigenen Text übernehmen und bearbeiten
                </Knopf>
              )}
            </div>
          </FormAbschnitt>
          <div className="flex flex-wrap items-center justify-end gap-3 bg-papier/60 px-5 py-3">
            {speichern.error && <p role="alert" className="mr-auto text-sm font-semibold text-kamm">{fehlerText(speichern.error)}</p>}
            <Knopf type="submit" variante="primaer" laedt={speichern.isPending}>
              Angaben speichern
            </Knopf>
          </div>
        </Formular>
        <Speicherleiste sichtbar={geaendert} onVerwerfen={() => setA(daten.angaben)} onSpeichern={() => speichern.mutate(a)} laedt={speichern.isPending} knopf="Angaben speichern" />
      </form>
      <aside className="flex flex-col gap-6 self-start xl:sticky xl:top-16">
        <Abschnitt titel="So sieht es öffentlich aus" aktionen={<span className="text-sm text-grau">gespeicherter Stand</span>}>
          <Vorschau titel="Impressum" abschnitte={daten.impressum} />
          <details className="mt-4 border-t border-linie pt-3">
            <summary className="cursor-pointer font-semibold">Datenschutzhinweise</summary>
            <div className="mt-2 max-h-[60vh] overflow-auto">
              <Vorschau abschnitte={daten.datenschutz} />
            </div>
          </details>
        </Abschnitt>
      </aside>
    </div>
  );
}

function Vorschau({ titel, abschnitte }: { titel?: string; abschnitte: { titel: string; absaetze: string[] }[] }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      {titel && <p className="font-semibold">{titel}</p>}
      {abschnitte.map((x, i) => (
        <div key={i}>
          {x.titel && <p className="font-semibold">{x.titel}</p>}
          {x.absaetze.map((t, j) => <p key={j}>{t}</p>)}
        </div>
      ))}
    </div>
  );
}

/** Auskunft nach Art. 15 DSGVO für Käufer und Preisrichter – sie haben keinen Aussteller-Stammsatz. */
function PersonenAuskunft() {
  const [name, setName] = useState("");
  const suche = trpc.verein.auskunftPerson.useMutation();
  const r = suche.data;
  const herunterladen = () => {
    if (!r) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "auskunft-person.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Abschnitt id="auskunft" titel="Auskunft für Käufer und Preisrichter" aktionen={<HilfeLink abschnitt="aussteller-verwalten-auskunft-und-löschung">Hilfe zur Auskunft</HilfeLink>}>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          suche.mutate({ name });
        }}
      >
        <Feld label="Name" className="w-full sm:w-72">
          {(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={200} />}
        </Feld>
        <Knopf type="submit" laedt={suche.isPending}>Suchen</Knopf>
        {r && (r.kaeufe.length > 0 || r.preisrichter.length > 0) && <Knopf variante="leise" onClick={herunterladen}>Als JSON speichern</Knopf>}
      </form>
      {suche.error && <Hinweis ton="fehler" className="mt-3">{fehlerText(suche.error)}</Hinweis>}
      {r && !r.kaeufe.length && !r.preisrichter.length && <p className="mt-3 text-grau">Keine Einträge zu „{r.gesucht}“.</p>}
      {r && r.kaeufe.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <h3 className="mb-2 font-semibold">Käufe</h3>
          <table className="tabelle bg-weiss">
            <thead>
              <tr>
                <th>Schau</th>
                <th className="text-right">Beleg</th>
                <th>Datum</th>
                <th>Name, Anschrift</th>
                <th>Reg.-Nr.</th>
                <th className="text-right">Preis</th>
              </tr>
            </thead>
            <tbody>
              {r.kaeufe.map((k) => (
                <tr key={`${k.schau}-${k.belegNr}`}>
                  <td>{k.schau}</td>
                  <td className="text-right tabular-nums">{k.belegNr}{k.storniertAm ? " (storniert)" : ""}</td>
                  <td className="tabular-nums">{datum(k.datum)}</td>
                  <td>{[k.name, k.anschrift, k.erziehungsberechtigter && `Erziehungsberechtigte(r): ${k.erziehungsberechtigter}`].filter(Boolean).join(", ")}</td>
                  <td>{k.registriernummer}</td>
                  <td className="text-right tabular-nums">{formatEuro(k.preisCent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r && r.preisrichter.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <h3 className="mb-2 font-semibold">Preisrichter</h3>
          <table className="tabelle bg-weiss">
            <thead>
              <tr>
                <th>Schau</th>
                <th>Name</th>
                <th>Anschrift</th>
                <th>Kontakt</th>
                <th>PIN</th>
              </tr>
            </thead>
            <tbody>
              {r.preisrichter.map((p, i) => (
                <tr key={i}>
                  <td>{p.schau}</td>
                  <td>{p.name}{p.istObmann ? " (Obmann)" : ""}</td>
                  <td>{p.anschrift.replace(/\n/g, ", ")}</td>
                  <td>{[p.email, p.telefon].filter(Boolean).join(", ")}</td>
                  <td>{p.pinGesetzt ? "gesetzt" : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Abschnitt>
  );
}

function Speicherfristen() {
  const meldung = useMeldung();
  const utils = trpc.useUtils();
  const lauf = trpc.verein.bereinigen.useMutation({
    onSuccess: async (n) => {
      await utils.verein.aussteller.invalidate();
      const teile = [
        n.geloescht && `${n.geloescht} Aussteller gelöscht`,
        n.gesperrt && `${n.gesperrt} gesperrt`,
        n.geburtsdaten && `${n.geburtsdaten}× Geburtsdatum/IBAN entfernt`,
        n.preisrichter && `${n.preisrichter} Preisrichter-Kontakte entfernt`,
        n.kaeufer && `${n.kaeufer} Käuferdaten entfernt`,
        n.spender && `${n.spender} Spenderdaten entfernt`,
        n.mails && `${n.mails} Mails gelöscht`,
        n.journal && `${n.journal} Einträge im Gesundheitsjournal gelöscht`,
        n.nachweise && `${n.nachweise}× Impf-/Tierarztangaben entfernt`,
        n.anschriften && `${n.anschriften} Anschriften gesperrter Aussteller entfernt`,
        n.protokoll && `${n.protokoll} Protokolleinträge anonymisiert`,
        n.belege && `${n.belege} Belege nach Fristende gelöscht`,
      ].filter(Boolean);
      // Fehlgeschlagene Löschungen nicht verschweigen: meist läuft noch eine Schau, die nie abgeschlossen wurde.
      if (n.fehlgeschlagen) meldung(`${n.fehlgeschlagen} Aussteller konnten nicht gelöscht werden (laufende Meldung – Schau abschließen).${teile.length ? ` Außerdem: ${teile.join(", ")}.` : ""}`, "fehler");
      else meldung(teile.length ? teile.join(", ") : "Nichts zu tun – alle Fristen sind eingehalten.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const fristen: [string, string][] = [
    ["Bestätigungsmails", `${POSTAUSGANG_TAGE} Tage`],
    ["Geburtsdatum, IBAN, Kontaktdaten und PIN der Preisrichter", `${KARENZ_TAGE} Tage nach dem Abschluss der Schau`],
    ["Käuferdaten, Verkaufsaufzeichnungen, Tierliste, Gesundheitsjournal und Impfangaben", `${AUFBEWAHRUNG_VERKAUF_JAHRE} Jahre`],
    ["Buchungsbelege (Meldegeld, Auszahlungen, Kaufbelege)", `${AUFBEWAHRUNG_BELEGE_JAHRE} Jahre ab Jahresende`],
    [`Aussteller ohne Meldung seit ${INAKTIV_JAHRE} Jahren`, "gelöscht bzw. bis Fristende gesperrt"],
  ];
  return (
    <Abschnitt
      id="speicherfristen"
      titel="Speicherfristen"
      aktionen={
        <span className="flex flex-wrap items-center gap-3">
          <HilfeLink abschnitt="speicherfristen">Hilfe zu Speicherfristen</HilfeLink>
          <Knopf laedt={lauf.isPending} onClick={() => lauf.mutate()}>Fristen jetzt anwenden</Knopf>
        </span>
      }
    >
      <dl className="divide-y divide-linie border-y border-linie">
        {fristen.map(([daten, frist]) => (
          <div key={daten} className="grid gap-x-6 gap-y-0.5 py-2 sm:grid-cols-[minmax(0,1fr)_16rem]">
            <dt>{daten}</dt>
            <dd className="text-grau">{frist}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-grau">Wird täglich automatisch angewendet.</p>
    </Abschnitt>
  );
}

const POST_STATUS = { wartet: ["Wartet", "info"], gesendet: ["Gesendet", "ok"], fehler: ["Nicht versendet", "fehler"] } as const;

/** Postausgang: Bestätigungsmails an Aussteller. Nicht versandte stehen oben und lassen sich erneut senden. */
/** Textbausteine für die Bewertung am Tablet: je Merkmal und Geflügelart, in drei Kategorien. */
function Textbausteine() {
  const liste = trpc.bewertung.textbausteine.useQuery();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const [kategorie, setKategorie] = useState<BausteinKategorie>("vorzug");
  const [gruppe, setGruppe] = useState("");
  const [art, setArt] = useState<BausteinArt>("alle");
  const [rasse, setRasse] = useState("");
  const [text, setText] = useState("");
  // Rassen des neuesten Verzeichnisses als Vorschlag (mit Sparte, damit die Geflügelart passend gesetzt wird).
  const versionen = trpc.stammdaten.versionen.useQuery();
  const versionId = versionen.data?.[0]?.id;
  const gliederung = trpc.stammdaten.gliederung.useQuery({ versionId: versionId ?? 0 }, { enabled: !!versionId });
  const rassen = useMemo(() => {
    const g = gliederung.data;
    if (!g) return [];
    const sparte = new Map(g.sparten.map((s) => [s.id, s.name]));
    return g.rassen.map((r) => ({ name: r.name, sparte: sparte.get(r.sparteId) ?? "" }));
  }, [gliederung.data]);
  // Am Tablet passt ein Baustein nur zu genau so benannten Rassen – Tippfehler oder Kurzformen fielen sonst still durch.
  const rasseUnbekannt = !!rasse.trim() && rassen.length > 0 && !rassen.some((r) => r.name.toLowerCase() === rasse.trim().toLowerCase());
  const rasseWaehlen = (wert: string) => {
    setRasse(wert);
    const r = rassen.find((x) => x.name.toLowerCase() === wert.trim().toLowerCase());
    const arten = r ? artenDerSparte(r.sparte, r.name) : null;
    if (arten?.length === 1) setArt(arten[0]!);
  };
  const [filterArt, setFilterArt] = useState<BausteinArt | "">("");
  const [suche, setSuche] = useState("");
  const neu = () => utils.bewertung.textbausteine.invalidate();
  const speichern = trpc.bewertung.textbausteinSpeichern.useMutation({
    onSuccess: () => {
      setText("");
      neu();
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const loeschen = trpc.bewertung.textbausteinLoeschen.useMutation({ onSuccess: neu, onError: (e) => meldung(fehlerText(e), "fehler") });
  const grundbestand = trpc.bewertung.textbausteinGrundbestand.useMutation({
    onSuccess: async (r) => {
      await neu();
      meldung(r.neu ? `${r.neu} Textbausteine aus dem Grundbestand übernommen.` : "Der Grundbestand ist schon vollständig vorhanden.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const senden = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim().length >= 2) speichern.mutate({ kategorie, text: text.trim(), gruppe: gruppe.trim(), art, rasse: rasse.trim() || null });
  };
  const daten = liste.data ?? [];
  const q = suche.trim().toLowerCase();
  const sichtbar = daten.filter((b) => (!filterArt || b.art === filterArt || b.art === "alle") && (!q || `${b.gruppe} ${b.text} ${b.rasse ?? ""}`.toLowerCase().includes(q)));
  const gruppen = sortiereGruppen(sichtbar.map((b) => b.gruppe));
  const alleGruppen = sortiereGruppen(daten.map((b) => b.gruppe));
  return (
    <Abschnitt
      id="textbausteine"
      titel="Textbausteine für die Bewertung"
      aktionen={
        <span className="flex flex-wrap items-center gap-3">
          {daten.length > 0 && <span className="text-sm text-grau">{daten.length} Bausteine</span>}
          <HilfeLink abschnitt="textbausteine-für-die-bewertung">Hilfe zu Textbausteinen</HilfeLink>
          <Knopf onClick={() => grundbestand.mutate()} laedt={grundbestand.isPending}>
            Grundbestand übernehmen
          </Knopf>
        </span>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Suchfeld aria-label="Suchen" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen, z. B. Kamm oder breit" />
        <div className="w-full sm:w-56">
          <Auswahl aria-label="Geflügelart" value={filterArt} onChange={(e) => setFilterArt(e.target.value as BausteinArt | "")}>
            <option value="">alle Geflügelarten</option>
            {BAUSTEIN_ART_LISTE.filter((a) => a !== "alle").map((a) => (
              <option key={a} value={a}>{BAUSTEIN_ARTEN[a]}</option>
            ))}
          </Auswahl>
        </div>
      </div>
      {liste.isLoading && <Laden />}
      <div className="-mx-5 flex flex-col divide-y divide-linie border-y border-linie">
        {gruppen.map((g) => {
          const inGruppe = sichtbar.filter((b) => b.gruppe === g);
          return (
            <details key={g} open={!!q} className="group">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-2.5 font-semibold hover:bg-papier">
                <span>{g}</span>
                <span className="text-sm font-normal text-grau">{inGruppe.length}</span>
              </summary>
              <div className="grid gap-4 px-5 pb-4 md:grid-cols-3">
                {BAUSTEIN_KATEGORIEN.map((k) => (
                  <div key={k}>
                    <h4 className="mb-1 text-sm font-semibold text-grau">{BAUSTEIN_KATEGORIE_LABEL[k]}</h4>
                    <ul className="divide-y divide-linie">
                      {inGruppe.filter((b) => b.kategorie === k).map((b) => (
                        <li key={b.id} className="flex items-center justify-between gap-2 py-1">
                          <span>
                            {b.text}
                            {b.rasse ? (
                              <span className="ml-2">
                                <Marke ton="info">nur {b.rasse}</Marke>
                              </span>
                            ) : (
                              b.art !== "alle" && <span className="ml-2 text-xs text-grau">{BAUSTEIN_ARTEN[b.art as BausteinArt] ?? b.art}</span>
                            )}
                          </span>
                          <button type="button" className="shrink-0 rounded px-1.5 text-sm text-grau hover:bg-kamm-hell hover:text-kamm" aria-label={`${b.text} löschen`} onClick={() => loeschen.mutate({ id: b.id })}>
                            löschen
                          </button>
                        </li>
                      ))}
                      {!inGruppe.some((b) => b.kategorie === k) && <li className="py-1 text-sm text-grau">–</li>}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
        {liste.data && gruppen.length === 0 && <p className="px-5 py-6 text-center text-grau">{daten.length ? "Keine Treffer." : "Noch keine Textbausteine."}</p>}
      </div>
      <form onSubmit={senden} className="mt-5 flex flex-col gap-3">
        <h3 className="font-semibold">Neuer Textbaustein</h3>
        <div className="grid items-start gap-3 md:grid-cols-[auto_minmax(10rem,1fr)_auto_minmax(12rem,1fr)]">
        <Feld label="Kategorie">
          {(id) => (
            <Auswahl id={id} value={kategorie} onChange={(e) => setKategorie(e.target.value as BausteinKategorie)}>
              {BAUSTEIN_KATEGORIEN.map((k) => (
                <option key={k} value={k}>{BAUSTEIN_KATEGORIE_LABEL[k]}</option>
              ))}
            </Auswahl>
          )}
        </Feld>
        <Feld label="Merkmal">
          {(id) => (
            <>
              <Eingabe id={id} list="baustein-gruppen" value={gruppe} onChange={(e) => setGruppe(e.target.value)} required maxLength={40} placeholder="z. B. Kamm" />
              <datalist id="baustein-gruppen">
                {alleGruppen.map((g) => <option key={g} value={g} />)}
              </datalist>
            </>
          )}
        </Feld>
        <Feld label="Geflügelart">
          {(id) => (
            <Auswahl id={id} value={art} onChange={(e) => setArt(e.target.value as BausteinArt)}>
              {BAUSTEIN_ART_LISTE.map((a) => (
                <option key={a} value={a}>{BAUSTEIN_ARTEN[a]}</option>
              ))}
            </Auswahl>
          )}
        </Feld>
        <Feld label="Rasse (optional)" hinweis={rasseUnbekannt ? "Nicht im Verzeichnis – Vorschlag wählen" : undefined}>
          {(id) => (
            <>
              <Eingabe id={id} list="baustein-rassen" value={rasse} onChange={(e) => rasseWaehlen(e.target.value)} maxLength={100} placeholder="für alle Rassen" />
              <datalist id="baustein-rassen">
                {rassen.map((r) => <option key={`${r.sparte}-${r.name}`} value={r.name} />)}
              </datalist>
            </>
          )}
        </Feld>
        </div>
        <div className="grid items-end gap-3 md:grid-cols-[1fr_auto]">
          <Feld label="Text">{(id) => <Eingabe id={id} value={text} maxLength={120} onChange={(e) => setText(e.target.value)} required />}</Feld>
          <Knopf type="submit" laedt={speichern.isPending}>Hinzufügen</Knopf>
        </div>
      </form>
    </Abschnitt>
  );
}

function Postausgang() {
  const p = trpc.schau.postausgang.useQuery();
  const meldung = useMeldung();
  const utils = trpc.useUtils();
  const erneut = trpc.schau.postErneutSenden.useMutation({
    onSuccess: async () => {
      await utils.schau.postausgang.invalidate();
      meldung("Versand angestoßen.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  if (p.error) return <FehlerAnzeige fehler={p.error} nochmal={() => p.refetch()} />;
  if (!p.data) return <Laden />;
  const offen = p.data.mails.filter((m) => m.status !== "gesendet");
  return (
    <Abschnitt id="postausgang" titel="Postausgang" aktionen={<HilfeLink abschnitt="postausgang">Hilfe zum Postausgang</HilfeLink>}>
      {p.data.fehler ? (
        <Hinweis ton="fehler">{p.data.fehler}</Hinweis>
      ) : !p.data.eingerichtet ? (
        <Hinweis ton="warnung">Der Mailversand ist nicht eingerichtet – Mails bleiben hier liegen.</Hinweis>
      ) : offen.some((m) => m.status === "fehler") ? (
        <Hinweis ton="warnung">{offen.filter((m) => m.status === "fehler").length} Mails konnten nicht versendet werden.</Hinweis>
      ) : null}
      {p.data.mails.length === 0 ? (
        <Leer titel="Noch keine Mails" />
      ) : (
        <details open={offen.length > 0} className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-grau hover:text-tinte">
            {offen.length ? `${offen.length} nicht versandt, ` : ""}
            {p.data.mails.length - offen.length} versandt (die letzten 100)
          </summary>
          <div className="-mx-5 mt-2 overflow-x-auto border-t border-linie">
            <table className="tabelle">
              <thead>
                <tr>
                  <th className="pl-5">Erstellt</th>
                  <th>An</th>
                  <th>Betreff</th>
                  <th>Stand</th>
                  <th className="pr-5">
                    <span className="sr-only">Aktionen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.data.mails.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap pl-5 tabular-nums">{datumZeit(m.createdAt)}</td>
                    <td>{m.an}</td>
                    <td>{m.betreff}</td>
                    <td>
                      <Marke ton={POST_STATUS[m.status][1]}>{POST_STATUS[m.status][0]}</Marke>
                      {m.status !== "gesendet" && (
                        <span className="block text-sm text-grau">
                          {m.versuche} Versuche{m.naechsterVersuch ? `, nächster ab ${datumZeit(m.naechsterVersuch)}` : ", keine weiteren"}
                          {m.fehler && ` – ${m.fehler}`}
                        </span>
                      )}
                    </td>
                    <td className="pr-5 text-right">
                      {m.status !== "gesendet" && p.data.eingerichtet && (
                        <Knopf variante="leise" laedt={erneut.isPending && erneut.variables?.id === m.id} onClick={() => erneut.mutate({ id: m.id })}>
                          Erneut senden
                        </Knopf>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Abschnitt>
  );
}
