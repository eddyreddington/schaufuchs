import {
  artenDerSparte,
  AUFBEWAHRUNG_BELEGE_JAHRE,
  AUFBEWAHRUNG_VERKAUF_JAHRE,
  BAUSTEIN_ART_LISTE,
  BAUSTEIN_KATEGORIEN,
  formatEuro,
  INAKTIV_JAHRE,
  KARENZ_TAGE,
  POSTAUSGANG_TAGE,
  serverText,
  sortiereGruppen,
  type BausteinArt,
  type BausteinKategorie,
} from "@schau/domain";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { datum, datumZeit, fehlerText } from "../lib";
import { useOberflaeche, useSprache } from "../sprache";
import { trpc, type Ausgabe } from "../trpc";
import { AutoAbmeldung } from "./verein-abmeldung";
import { Druckvorlagen } from "./verein-druckvorlagen";
import { SteuerAngaben } from "./verein-steuer";
import { GlaeubigerId } from "./verein-lastschrift";
import { Abschnitt, Auswahl, Eingabe, FehlerAnzeige, Feld, FormAbschnitt, Formular, HilfeLink, Hinweis, Knopf, knopfKlasse, Laden, Leer, Marke, SEITE, Seitenkopf, Speicherleiste, Suchfeld, Textfeld, useMeldung } from "../ui";

type Angaben = Ausgabe["verein"]["get"]["angaben"];

export function Verein() {
  const t = useOberflaeche().verein.seite;
  const v = trpc.verein.get.useQuery();
  return (
    <div className={SEITE}>
      <Seitenkopf
        titel={t.titel}
        hilfe="verein-und-datenschutz"
        aktionen={
          <Link to="/aussteller" className={knopfKlasse()}>
            {t.ausstellerAuskunft}
          </Link>
        }
      />
      {v.error ? <FehlerAnzeige fehler={v.error} nochmal={() => v.refetch()} /> : !v.data ? <Laden /> : <Angabenformular key={JSON.stringify(v.data.angaben)} daten={v.data} />}
      <SteuerAngaben />
      <GlaeubigerId />
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
  const t = useOberflaeche().verein.angaben;
  const sprache = useSprache();
  const [a, setA] = useState<Angaben>(daten.angaben);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const speichern = trpc.verein.speichern.useMutation({
    onSuccess: async () => {
      await utils.verein.get.invalidate();
      meldung(t.gespeichert);
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
        {/* Die fehlenden Angaben nennt die Fachlogik (fehlendeVereinsangaben) deutsch. */}
        {daten.fehlend.length > 0 && <Hinweis ton="warnung">{t.fehlt(daten.fehlend.map((f) => serverText(f, sprache)).join(", "))}</Hinweis>}
        <Formular>
          <FormAbschnitt id="impressum" titel={t.anbieter} unter={t.anbieterUnter}>
            {feld("name", t.name, { hinweis: t.nameHinweis, klasse: "md:col-span-2" })}
            {feld("anschrift", t.anschrift, { zeilen: 2, hinweis: t.anschriftHinweis })}
            {feld("vertretung", t.vertretung, { zeilen: 2, hinweis: t.vertretungHinweis })}
            {feld("email", t.email, { typ: "email" })}
            {feld("telefon", t.telefon, { typ: "tel" })}
            {feld("register", t.register, { hinweis: t.registerHinweis })}
            {feld("inhaltVerantwortlich", t.inhalt, { hinweis: t.inhaltHinweis })}
            {feld("impressumZusatz", t.impressumZusatz, { zeilen: 2, klasse: "md:col-span-2" })}
          </FormAbschnitt>
          <FormAbschnitt id="datenschutz" titel={t.datenschutz} unter={t.datenschutzUnter}>
            {feld("datenschutzbeauftragter", t.beauftragter, { zeilen: 2 })}
            {feld("datenschutzZusatz", t.ergaenzungen, { zeilen: 2, hinweis: t.ergaenzungenHinweis })}
            <div className="flex flex-col gap-2 md:col-span-2">
              <Feld label={t.eigenerText} hinweis={t.eigenerTextHinweis}>
                {(id) => <Textfeld id={id} rows={a.datenschutzText ? 14 : 3} value={a.datenschutzText} onChange={(e) => setA({ ...a, datenschutzText: e.target.value })} />}
              </Feld>
              {!a.datenschutzText && (
                <Knopf variante="leise" className="self-start" onClick={() => setA({ ...a, datenschutzText: daten.muster })}>
                  {t.musterUebernehmen}
                </Knopf>
              )}
            </div>
          </FormAbschnitt>
          {speichern.error && (
            <p role="alert" className="px-5 py-3 text-sm font-semibold text-kamm">
              {fehlerText(speichern.error)}
            </p>
          )}
        </Formular>
        <Speicherleiste sichtbar={geaendert} onVerwerfen={() => setA(daten.angaben)} onSpeichern={() => speichern.mutate(a)} laedt={speichern.isPending} knopf={t.speichern} />
      </form>
      <aside className="flex flex-col gap-6 self-start xl:sticky xl:top-16">
        {/* Impressum und Datenschutzhinweise schreibt der Verein: Inhalt bleibt deutsch. */}
        <Abschnitt titel={t.oeffentlich} aktionen={<span className="text-sm text-grau">{t.gespeicherterStand}</span>}>
          <Vorschau titel={t.impressum} abschnitte={daten.impressum} />
          <details className="mt-4 border-t border-linie pt-3">
            <summary className="cursor-pointer font-semibold">{t.datenschutz}</summary>
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
  const o = useOberflaeche();
  const t = o.verein.auskunft;
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
    // bleibt deutsch: Anker im Handbuch
    <Abschnitt id="auskunft" titel={t.titel} aktionen={<HilfeLink abschnitt="aussteller-verwalten-auskunft-und-löschung">{t.hilfe}</HilfeLink>}>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          suche.mutate({ name });
        }}
      >
        <Feld label={o.allgemein.name} className="w-full sm:w-72">
          {(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={200} />}
        </Feld>
        <Knopf type="submit" laedt={suche.isPending}>{t.suchen}</Knopf>
        {r && (r.kaeufe.length > 0 || r.preisrichter.length > 0) && <Knopf variante="leise" onClick={herunterladen}>{t.alsJson}</Knopf>}
      </form>
      {suche.error && <Hinweis ton="fehler" className="mt-3">{fehlerText(suche.error)}</Hinweis>}
      {r && !r.kaeufe.length && !r.preisrichter.length && <p className="mt-3 text-grau">{t.keineEintraege(r.gesucht)}</p>}
      {r && r.kaeufe.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <h3 className="mb-2 font-semibold">{t.kaeufe}</h3>
          <table className="tabelle bg-weiss">
            <thead>
              <tr>
                <th>{t.schau}</th>
                <th className="text-right">{t.beleg}</th>
                <th>{o.allgemein.datum}</th>
                <th>{t.nameAnschrift}</th>
                <th>{t.regNr}</th>
                <th className="text-right">{t.preis}</th>
              </tr>
            </thead>
            <tbody>
              {r.kaeufe.map((k) => (
                <tr key={`${k.schau}-${k.belegNr}`}>
                  <td>{k.schau}</td>
                  <td className="text-right tabular-nums">{k.belegNr}{k.storniertAm ? t.storniert : ""}</td>
                  <td className="tabular-nums">{datum(k.datum)}</td>
                  <td>{[k.name, k.anschrift, k.erziehungsberechtigter && t.erziehungsberechtigt(k.erziehungsberechtigter)].filter(Boolean).join(", ")}</td>
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
          <h3 className="mb-2 font-semibold">{o.allgemein.preisrichter}</h3>
          <table className="tabelle bg-weiss">
            <thead>
              <tr>
                <th>{t.schau}</th>
                <th>{o.allgemein.name}</th>
                <th>{t.anschrift}</th>
                <th>{t.kontakt}</th>
                <th>{t.pin}</th>
              </tr>
            </thead>
            <tbody>
              {r.preisrichter.map((p, i) => (
                <tr key={i}>
                  <td>{p.schau}</td>
                  <td>{p.name}{p.istObmann ? t.obmann : ""}</td>
                  <td>{p.anschrift.replace(/\n/g, ", ")}</td>
                  <td>{[p.email, p.telefon].filter(Boolean).join(", ")}</td>
                  <td>{p.pinGesetzt ? t.gesetzt : "–"}</td>
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
  const t = useOberflaeche().verein.speicherfristen;
  const meldung = useMeldung();
  const utils = trpc.useUtils();
  const lauf = trpc.verein.bereinigen.useMutation({
    onSuccess: async (n) => {
      await utils.verein.aussteller.invalidate();
      const teile = [
        n.geloescht && t.geloescht(n.geloescht),
        n.gesperrt && t.gesperrt(n.gesperrt),
        n.geburtsdaten && t.geburtsdaten(n.geburtsdaten),
        n.preisrichter && t.preisrichter(n.preisrichter),
        n.kaeufer && t.kaeufer(n.kaeufer),
        n.spender && t.spender(n.spender),
        n.mails && t.mails(n.mails),
        n.journal && t.journal(n.journal),
        n.nachweise && t.nachweise(n.nachweise),
        n.anschriften && t.anschriften(n.anschriften),
        n.protokoll && t.protokoll(n.protokoll),
        n.belege && t.belege(n.belege),
      ].filter(Boolean);
      // Fehlgeschlagene Löschungen nicht verschweigen: meist läuft noch eine Schau, die nie abgeschlossen wurde.
      if (n.fehlgeschlagen) meldung(`${t.fehlgeschlagen(n.fehlgeschlagen)}${teile.length ? t.ausserdem(teile.join(", ")) : ""}`, "fehler");
      else meldung(teile.length ? teile.join(", ") : t.nichtsZuTun);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const fristen: [string, string][] = [
    [t.bestaetigungsmails, t.tage(POSTAUSGANG_TAGE)],
    [t.karenzDaten, t.karenzFrist(KARENZ_TAGE)],
    [t.verkaufDaten, t.jahre(AUFBEWAHRUNG_VERKAUF_JAHRE)],
    [t.belegeDaten, t.belegeFrist(AUFBEWAHRUNG_BELEGE_JAHRE)],
    [t.inaktivDaten(INAKTIV_JAHRE), t.inaktivFrist],
  ];
  return (
    <Abschnitt
      id="speicherfristen"
      titel={t.titel}
      aktionen={
        <span className="flex flex-wrap items-center gap-3">
          <HilfeLink abschnitt="speicherfristen">{t.hilfe}</HilfeLink>
          <Knopf laedt={lauf.isPending} onClick={() => lauf.mutate()}>{t.anwenden}</Knopf>
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
      <p className="mt-3 text-sm text-grau">{t.taeglich}</p>
    </Abschnitt>
  );
}

const POST_TON = { wartet: "info", gesendet: "ok", fehler: "fehler" } as const;

/** Postausgang: Bestätigungsmails an Aussteller. Nicht versandte stehen oben und lassen sich erneut senden. */
/** Textbausteine für die Bewertung am Tablet: je Merkmal und Geflügelart, in drei Kategorien. Die Bausteine selbst bleiben deutsch. */
function Textbausteine() {
  const o = useOberflaeche();
  const t = o.verein.textbausteine;
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
      meldung(r.neu ? t.grundbestandNeu(r.neu) : t.grundbestandVoll);
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
      titel={t.titel}
      aktionen={
        <span className="flex flex-wrap items-center gap-3">
          {daten.length > 0 && <span className="text-sm text-grau">{t.anzahl(daten.length)}</span>}
          {/* bleibt deutsch: Anker im Handbuch */}
          <HilfeLink abschnitt="textbausteine-für-die-bewertung">{t.hilfe}</HilfeLink>
          <Knopf onClick={() => grundbestand.mutate()} laedt={grundbestand.isPending}>
            {t.grundbestand}
          </Knopf>
        </span>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Suchfeld aria-label={t.suchen} value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t.suchenBeispiel} />
        <div className="w-full sm:w-56">
          <Auswahl aria-label={t.gefluegelart} value={filterArt} onChange={(e) => setFilterArt(e.target.value as BausteinArt | "")}>
            <option value="">{t.alleGefluegelarten}</option>
            {BAUSTEIN_ART_LISTE.filter((a) => a !== "alle").map((a) => (
              <option key={a} value={a}>{t.arten[a]}</option>
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
                    <h4 className="mb-1 text-sm font-semibold text-grau">{o.fach.BAUSTEIN_KATEGORIE_LABEL[k]}</h4>
                    <ul className="divide-y divide-linie">
                      {inGruppe.filter((b) => b.kategorie === k).map((b) => (
                        <li key={b.id} className="flex items-center justify-between gap-2 py-1">
                          <span>
                            {b.text}
                            {b.rasse ? (
                              <span className="ml-2">
                                <Marke ton="info">{t.nurRasse(b.rasse)}</Marke>
                              </span>
                            ) : (
                              b.art !== "alle" && <span className="ml-2 text-xs text-grau">{(t.arten as Record<string, string>)[b.art] ?? b.art}</span>
                            )}
                          </span>
                          <button type="button" className="shrink-0 rounded px-1.5 text-sm text-grau hover:bg-kamm-hell hover:text-kamm" aria-label={t.loeschenLabel(b.text)} onClick={() => loeschen.mutate({ id: b.id })}>
                            {t.loeschen}
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
        {liste.data && gruppen.length === 0 && <p className="px-5 py-6 text-center text-grau">{daten.length ? t.keineTreffer : t.keine}</p>}
      </div>
      <form onSubmit={senden} className="mt-5 flex flex-col gap-3">
        <h3 className="font-semibold">{t.neu}</h3>
        <div className="grid items-start gap-3 md:grid-cols-[auto_minmax(10rem,1fr)_auto_minmax(12rem,1fr)]">
        <Feld label={t.kategorie}>
          {(id) => (
            <Auswahl id={id} value={kategorie} onChange={(e) => setKategorie(e.target.value as BausteinKategorie)}>
              {BAUSTEIN_KATEGORIEN.map((k) => (
                <option key={k} value={k}>{o.fach.BAUSTEIN_KATEGORIE_LABEL[k]}</option>
              ))}
            </Auswahl>
          )}
        </Feld>
        <Feld label={t.merkmal}>
          {(id) => (
            <>
              <Eingabe id={id} list="baustein-gruppen" value={gruppe} onChange={(e) => setGruppe(e.target.value)} required maxLength={40} placeholder={t.merkmalBeispiel} />
              <datalist id="baustein-gruppen">
                {alleGruppen.map((g) => <option key={g} value={g} />)}
              </datalist>
            </>
          )}
        </Feld>
        <Feld label={t.gefluegelart}>
          {(id) => (
            <Auswahl id={id} value={art} onChange={(e) => setArt(e.target.value as BausteinArt)}>
              {BAUSTEIN_ART_LISTE.map((a) => (
                <option key={a} value={a}>{t.arten[a]}</option>
              ))}
            </Auswahl>
          )}
        </Feld>
        <Feld label={t.rasse} hinweis={rasseUnbekannt ? t.rasseUnbekannt : undefined}>
          {(id) => (
            <>
              <Eingabe id={id} list="baustein-rassen" value={rasse} onChange={(e) => rasseWaehlen(e.target.value)} maxLength={100} placeholder={t.alleRassen} />
              <datalist id="baustein-rassen">
                {rassen.map((r) => <option key={`${r.sparte}-${r.name}`} value={r.name} />)}
              </datalist>
            </>
          )}
        </Feld>
        </div>
        <div className="grid items-end gap-3 md:grid-cols-[1fr_auto]">
          <Feld label={t.text}>{(id) => <Eingabe id={id} value={text} maxLength={120} onChange={(e) => setText(e.target.value)} required />}</Feld>
          <Knopf type="submit" laedt={speichern.isPending}>{o.allgemein.hinzufuegen}</Knopf>
        </div>
      </form>
    </Abschnitt>
  );
}

function Postausgang() {
  const t = useOberflaeche().verein.postausgang;
  const sprache = useSprache();
  const p = trpc.schau.postausgang.useQuery();
  const meldung = useMeldung();
  const utils = trpc.useUtils();
  const erneut = trpc.schau.postErneutSenden.useMutation({
    onSuccess: async () => {
      await utils.schau.postausgang.invalidate();
      meldung(t.angestossen);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  if (p.error) return <FehlerAnzeige fehler={p.error} nochmal={() => p.refetch()} />;
  if (!p.data) return <Laden />;
  const offen = p.data.mails.filter((m) => m.status !== "gesendet");
  return (
    <Abschnitt id="postausgang" titel={t.titel} aktionen={<HilfeLink abschnitt="postausgang">{t.hilfe}</HilfeLink>}>
      {p.data.fehler ? (
        <Hinweis ton="fehler">{serverText(p.data.fehler, sprache)}</Hinweis>
      ) : !p.data.eingerichtet ? (
        <Hinweis ton="warnung">{t.nichtEingerichtet}</Hinweis>
      ) : offen.some((m) => m.status === "fehler") ? (
        <Hinweis ton="warnung">{t.nichtVersendet(offen.filter((m) => m.status === "fehler").length)}</Hinweis>
      ) : null}
      {p.data.mails.length === 0 ? (
        <Leer titel={t.keineMails} />
      ) : (
        <details open={offen.length > 0} className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-grau hover:text-tinte">
            {offen.length ? t.offen(offen.length) : ""}
            {t.versandt(p.data.mails.length - offen.length)}
          </summary>
          <div className="-mx-5 mt-2 overflow-x-auto border-t border-linie">
            <table className="tabelle">
              <thead>
                <tr>
                  <th className="pl-5">{t.erstellt}</th>
                  <th>{t.an}</th>
                  <th>{t.betreff}</th>
                  <th>{t.stand}</th>
                  <th className="pr-5">
                    <span className="sr-only">{t.aktionen}</span>
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
                      <Marke ton={POST_TON[m.status]}>{t.status[m.status]}</Marke>
                      {m.status !== "gesendet" && (
                        <span className="block text-sm text-grau">
                          {t.versuche(m.versuche)}{m.naechsterVersuch ? t.naechster(datumZeit(m.naechsterVersuch)) : t.keineWeiteren}
                          {/* Meldung des Mailservers, wie er sie schickt */}
                          {m.fehler && ` – ${m.fehler}`}
                        </span>
                      )}
                    </td>
                    <td className="pr-5 text-right">
                      {m.status !== "gesendet" && p.data.eingerichtet && (
                        <Knopf variante="leise" laedt={erneut.isPending && erneut.variables?.id === m.id} onClick={() => erneut.mutate({ id: m.id })}>
                          {t.erneut}
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
