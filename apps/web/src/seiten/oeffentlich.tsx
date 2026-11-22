import { datumIn, euroIn, gefordertCent, gruppenAbteilung, istJugendBlock, normalisiereRegistriernummer, oeffnungszeitenZeilen, type AdressVorschlaege, type KaefigMasse, type KaefigRegel, type Sprache, type Texte } from "@schau/domain";
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { AusstellerFelder, leererAussteller } from "../komponenten/aussteller";
import { Ueberweisung, type UeberweisungDaten } from "../komponenten/girocode";
import { useLesemodusAussteller } from "../komponenten/lesemodus";
import { alsEingabe, neuePosition, PositionenEditor, pruefePositionen, type Position } from "../komponenten/positionen";
import { formatKatalognummer, parseEuro } from "../lib";
import { fehlerFuerAussteller, SprachWahl, useSprache, useTexte } from "../sprache";
import { trpc } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, Feld, Haken, Hinweis, Knopf, knopfKlasse, KnopfLink, Laden, LESEBREITE, Marke, Suchfeld, TabellenRahmen, useSeitentitel, useUngespeichertWarnung } from "../ui";

/** Was eine Meldung fordert, aufgeschlüsselt (Meldegeld, zugesagte Stiftung und Spende). */
type Betrag = { summeCent: number; stiftungCent: number; spendeCent: number };
function betragText(b: Betrag, t: Texte, sprache: Sprache) {
  const euro = (c: number) => euroIn(c, sprache);
  const zusatz = [b.stiftungCent > 0 && `${t.betrag.stiftung} ${euro(b.stiftungCent)}`, b.spendeCent > 0 && `${t.betrag.spende} ${euro(b.spendeCent)}`].filter(Boolean);
  return zusatz.length ? `${t.betrag.meldegeld} ${euro(b.summeCent)} + ${zusatz.join(" + ")} = ${euro(gefordertCent(b))}` : euro(b.summeCent);
}

const FUSS_LINK = "inline-flex min-h-9 items-center text-grau no-underline hover:text-tinte hover:underline";

/** ohneFuss: Seite zu einer unbekannten Adresse – keine Verweise auf „Zur Schau“, Impressum usw. unter dieser Adresse. */
/** Datei-Link mit der gewählten Sprache: Fehlertexte (z. B. „Katalog noch nicht veröffentlicht“) kommen dann in ihr. */
const mitSprache = (pfad: string, sprache: Sprache) => (sprache === "de" ? pfad : `${pfad}?sprache=${encodeURIComponent(sprache)}`);

function OeffentlicherRahmen({ titel, unter, children, ohneFuss, test }: { titel: string; unter?: ReactNode; children: ReactNode; ohneFuss?: boolean; /** Testschau: Hinweis auf jeder Seite. */ test?: boolean }) {
  const { slug } = useParams();
  const t = useTexte().rahmen;
  const nurLesen = useLesemodusAussteller();
  useSeitentitel(titel);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-kopf text-auf-kopf">
        <div className={`${LESEBREITE} flex items-start justify-between gap-4 py-7`}>
          <div className="min-w-0">
            <h1 className="text-[1.9rem] font-bold leading-tight text-auf-kopf sm:text-4xl">{titel}</h1>
            {unter && <div className="mt-1.5 text-auf-kopf/75">{unter}</div>}
          </div>
          <SprachWahl className="shrink-0" />
        </div>
      </header>
      <main id="inhalt" className={`${LESEBREITE} flex flex-1 flex-col gap-6 py-8`}>
        {nurLesen && <Hinweis ton="warnung">{nurLesen}</Hinweis>}
        {test && <Hinweis ton="warnung">{t.testschau}</Hinweis>}
        {children}
      </main>
      {/* Anbieterkennzeichnung und Datenschutzhinweise auf jeder öffentlichen Seite (§ 5 DDG, Art. 13 DSGVO). */}
      {slug && !ohneFuss && (
        <footer className="border-t border-linie">
          <nav aria-label={t.rechtliches} className={`${LESEBREITE} flex flex-wrap gap-x-6 gap-y-2 py-6 text-sm`}>
            <Link to={`/s/${slug}`} className={FUSS_LINK}>{t.zurSchau}</Link>
            <Link to={`/s/${slug}/impressum`} className={FUSS_LINK}>{t.impressum}</Link>
            <Link to={`/s/${slug}/datenschutz`} className={FUSS_LINK}>{t.datenschutz}</Link>
          </nav>
        </footer>
      )}
    </div>
  );
}

/** Impressum oder Datenschutzhinweise des ausrichtenden Vereins. */
export function Rechtstext({ art }: { art: "impressum" | "datenschutz" }) {
  const { slug = "" } = useParams();
  const t = trpc.oeffentlich.rechtstexte.useQuery({ slug });
  const sprache = useSprache();
  const texte = useTexte();
  const tx = texte.rahmen;
  if (t.isLoading) return <Laden />;
  if (!t.data)
    return (
      <OeffentlicherRahmen titel={tx.nichtGefunden} ohneFuss>
        <Hinweis ton="fehler">{t.error?.data?.code === "NOT_FOUND" ? texte.schau.adressePruefen : fehlerFuerAussteller(t.error, sprache)}</Hinweis>
      </OeffentlicherRahmen>
    );
  const abschnitte = art === "impressum" ? t.data.impressum : t.data.datenschutz;
  return (
    <OeffentlicherRahmen titel={art === "impressum" ? tx.impressum : tx.datenschutzhinweise} unter={`${t.data.verein} · ${t.data.schau}`} test={t.data.test}>
      {!t.data.vollstaendig && <Hinweis ton="warnung">{tx.unvollstaendig}</Hinweis>}
      {/* Rechtstexte des Vereins gibt es nur auf Deutsch – maßgeblich ist diese Fassung. */}
      {tx.nurDeutsch && <Hinweis>{tx.nurDeutsch}</Hinweis>}
      <article lang="de" className="flex max-w-[70ch] flex-col gap-6">
        {abschnitte.map((a, i) => (
          <section key={i}>
            {a.titel && <h2 className="mb-2 text-lg font-semibold">{a.titel}</h2>}
            {a.absaetze.map((x, j) => (
              <p key={j} className={art === "impressum" ? "" : "mb-2"}>{x}</p>
            ))}
          </section>
        ))}
      </article>
    </OeffentlicherRahmen>
  );
}

export function OeffentlicheSchau() {
  const { slug = "" } = useParams();
  const sprache = useSprache();
  const tx = useTexte();
  const t = tx.schau;
  // Mit der Sprache: Grund „Meldung geschlossen“ und Datenschutz-Kurztext kommen übersetzt vom Server.
  const s = trpc.oeffentlich.schau.useQuery({ slug, sprache }, { placeholderData: (alt) => alt });
  const [gemeldet, setGemeldet] = useState<{ token: string; betrag: Betrag; ueberweisung: UeberweisungDaten | null } | null>(null);
  if (s.isLoading) return <Laden />;
  if (s.error?.data?.code === "TOO_MANY_REQUESTS")
    return <OeffentlicherRahmen titel={t.warten} ohneFuss><Hinweis ton="warnung">{t.vieleAnfragen}</Hinweis></OeffentlicherRahmen>;
  if (s.error || !s.data) return <OeffentlicherRahmen titel={t.nichtGefunden} ohneFuss><Hinweis ton="fehler">{t.adressePruefen}</Hinweis></OeffentlicherRahmen>;
  const d = s.data;
  const euro = (c: number) => euroIn(c, sprache);
  // Einlieferung, Öffnungszeiten und Tierausgabe sind Freitext des Vereins und bleiben, wie er sie schreibt.
  const termine = [
    [t.meldeschluss, datumIn(d.meldeschluss, sprache)],
    [t.einlieferung, d.einlieferung],
    [t.bewertung, datumIn(d.bewertungAm, sprache)],
    [t.oeffnungszeiten, oeffnungszeitenZeilen(d.oeffnungszeiten).join("\n")],
    [t.tierausgabe, d.aussetzen],
  ].filter(([, v]) => v && v !== "–");
  const bankZeigen = !!d.bankverbindung && !d.zahlungBeiEinlieferung;
  return (
    <OeffentlicherRahmen titel={d.name} unter={[d.veranstalter, d.ort].filter(Boolean).join(", ")} test={d.test}>
      {(termine.length > 0 || d.gebuehren.length > 0 || bankZeigen) && (
      <div className="grid gap-6 md:grid-cols-2">
        {termine.length > 0 && (
        <Abschnitt titel={t.termine}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5">
            {termine.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-grau">{k}</dt>
                  <dd lang="de" className="whitespace-pre-line font-medium">{v}</dd>
                </div>
              ))}
          </dl>
        </Abschnitt>
        )}
        {(d.gebuehren.length > 0 || bankZeigen) && (
        <Abschnitt titel={t.gebuehren}>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
            {d.gebuehren.map((g) => (
              <div key={`${g.art}-${g.jugend}`} className="contents">
                <dt>{g.art === "katalog" || g.art === "kostenanteil" ? tx.gebuehr[g.art] : tx.meldeart[g.art]}{g.jugend && ` (${t.jugend})`}</dt>
                <dd className="text-right font-semibold tabular-nums">{euro(g.betragCent)}</dd>
              </div>
            ))}
          </dl>
          {d.zahlungBeiEinlieferung && d.gebuehren.length > 0 && <p className="mt-4 border-t border-linie pt-3 text-sm text-grau">{t.zahlungBeiEinlieferung}</p>}
          {bankZeigen && <p className="mt-4 border-t border-linie pt-3 text-sm text-grau">{t.zahlungAn} <span className="text-tinte">{d.bankverbindung}</span></p>}
        </Abschnitt>
        )}
      </div>
      )}
      {d.ergebnisse ? (
        <div className="flex flex-wrap gap-2">
          <Link to="ergebnisse" className={knopfKlasse("primaer")}>{t.ergebnisseAnsehen}</Link>
          <KnopfLink href={mitSprache(`/s/${slug}/katalog.pdf`, sprache)}>{t.katalogPdf}</KnopfLink>
        </div>
      ) : (
        // Nummern fest, Ergebnisse noch nicht freigegeben: Das PDF gibt es öffentlich erst mit den Ergebnissen.
        d.katalog && <Hinweis>{t.nummernFest}</Hinweis>
      )}
      {gemeldet ? (
        <Abschnitt titel={tx.dank.titel}>
          {gefordertCent(gemeldet.betrag) <= 0 ? (
            <p className="text-lg">{tx.dank.keinMeldegeld}</p>
          ) : (
            <p className="text-lg">
              {d.zahlungBeiEinlieferung ? tx.dank.zuZahlenEinlieferung : tx.dank.zuZahlen}{" "}
              <b className="font-semibold tabular-nums">{betragText(gemeldet.betrag, tx, sprache)}</b>
              {d.zahlungBeiEinlieferung ? "." : `. ${tx.dank.erstNachZahlung}`}
            </p>
          )}
          {gemeldet.ueberweisung ? (
            <Ueberweisung bank={d.bankverbindung} ue={gemeldet.ueberweisung} />
          ) : (
            bankZeigen && gefordertCent(gemeldet.betrag) > 0 && <p className="mt-2">{tx.dank.bankverbindung} {d.bankverbindung}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p>{tx.dank.mailUnterwegs}</p>
            <Link to={`meldung/${gemeldet.token}`} className={knopfKlasse("zweit")}>{tx.dank.meineMeldung}</Link>
          </div>
        </Abschnitt>
      ) : d.meldung.offen ? (
        <>
        {/* Wer lieber auf Papier meldet: leerer A-Bogen (deutsch, wie alle Drucke). */}
        <p className="-mb-2 text-sm">
          <a href={mitSprache(`/s/${slug}/a-bogen.pdf`, sprache)} target="_blank" rel="noreferrer">{t.aBogen}</a>
        </p>
        <Meldeformular slug={slug} bestimmungen={d.bestimmungen} erklaerungen={d.erklaerungen} datenschutz={d.datenschutzKurz} kaefigRegeln={d.kaefigRegeln} kaefigMasse={d.kaefigMasse} teilschauen={d.teilschauen} vorschlaege={{ vereine: d.vereine, kreisverbaende: d.kreisverbaende }} fertig={(r) => { setGemeldet(r); window.scrollTo(0, 0); }} />
        </>
      ) : (
        <Hinweis ton="warnung">{d.meldung.grund}</Hinweis>
      )}
      {d.kontaktEmail && <p className="text-sm text-grau">{t.fragen} <a href={`mailto:${d.kontaktEmail}`}>{d.kontaktEmail}</a></p>}
    </OeffentlicherRahmen>
  );
}

function Meldeformular({
  slug,
  bestimmungen,
  erklaerungen,
  datenschutz,
  kaefigRegeln,
  kaefigMasse,
  teilschauen,
  vorschlaege,
  fertig,
}: {
  slug: string;
  bestimmungen: string;
  erklaerungen: string[];
  datenschutz: string[];
  kaefigRegeln: KaefigRegel[];
  kaefigMasse: KaefigMasse;
  teilschauen: { id: string; name: string }[];
  vorschlaege: Pick<AdressVorschlaege, "vereine" | "kreisverbaende">;
  fertig: (r: { token: string; betrag: Betrag; ueberweisung: UeberweisungDaten | null }) => void;
}) {
  const sprache = useSprache();
  const tx = useTexte();
  const t = tx.formular;
  const [a, setA] = useState(leererAussteller());
  const [istJugend, setIstJugend] = useState(false);
  const [teilschau, setTeilschau] = useState<string | null>(null);
  const [istPreisrichter, setIstPreisrichter] = useState(false);
  const [positionen, setPositionen] = useState<Position[]>([neuePosition()]);
  const [zustimmung, setZustimmung] = useState(false);
  // Freiwillig und getrennt von den AAB – Voreinstellung aus (Art. 7 DSGVO).
  const [online, setOnline] = useState(false);
  const [erklaert, setErklaert] = useState<boolean[]>(() => erklaerungen.map(() => false));
  const [eltern, setEltern] = useState({ name: "", einverstanden: false });
  const [stiftung, setStiftung] = useState({ betrag: "", vorgabe: "" });
  const [spende, setSpende] = useState({ betrag: "", nennen: false });
  const [bemerkung, setBemerkung] = useState("");
  const [fehler, setFehler] = useState<string[]>([]);
  const fehlerListe = useRef<HTMLDivElement>(null);
  // Lange Formulare: vor dem Verlassen mit Eingaben warnen (nach dem Absenden ist das Formular weg).
  useUngespeichertWarnung(() => !!(a.vorname || a.nachname || a.email || positionen.some((p) => p.farbenschlag != null || p.freitext)));
  const suche = (q: string) => trpc.oeffentlich.farbenschlagSuche.useQuery({ slug, q }, { enabled: q.trim().length >= 2 });
  const melden = trpc.oeffentlich.melden.useMutation({ onSuccess: (r) => fertig(r) });
  // Lesemodus (Entscheidung 025): Melden geht nicht – der Hinweis steht oben im Rahmen.
  const nurLesen = useLesemodusAussteller();
  // Fehlerliste und Serverfehler sind fertiger Text: nach einem Sprachwechsel weg, beim nächsten Absenden neu.
  const [fehlerSprache, setFehlerSprache] = useState(sprache);
  if (fehlerSprache !== sprache) {
    setFehlerSprache(sprache);
    setFehler([]);
    melden.reset();
  }

  const senden = (e: FormEvent) => {
    e.preventDefault();
    const probleme = pruefePositionen(positionen, tx);
    // Schon hier geprüft, damit die Meldung in der Sprache des Formulars kommt (die Prüfung des Servers bleibt).
    if (a.registriernummer.trim() && !normalisiereRegistriernummer(a.registriernummer)) probleme.unshift(t.fehlerRegistriernummer);
    if (!zustimmung) probleme.push(t.fehlerAab);
    if (erklaert.some((x) => !x)) probleme.push(t.fehlerErklaerungen);
    if (istJugend && (eltern.name.trim().length < 3 || !eltern.einverstanden)) probleme.push(t.fehlerJugend);
    const stiftCent = stiftung.betrag.trim() ? parseEuro(stiftung.betrag) : 0;
    if (stiftCent == null) probleme.push(t.fehlerStiftung);
    const spendeCent = spende.betrag.trim() ? parseEuro(spende.betrag) : 0;
    if (spendeCent == null || spendeCent < 0) probleme.push(t.fehlerSpende);
    setFehler(probleme);
    if (probleme.length) {
      // Fokus auf die Fehlerliste, damit sie (auch per Screenreader) sofort bemerkt wird.
      setTimeout(() => fehlerListe.current?.focus(), 0);
      return;
    }
    melden.mutate({
      slug,
      aussteller: a,
      istJugend,
      teilschau,
      istPreisrichter,
      positionen: positionen.map(alsEingabe),
      zustimmung: true,
      onlineVeroeffentlichung: online,
      erklaerungen: erklaert.length > 0 && erklaert.every(Boolean),
      erziehungsberechtigter: istJugend ? eltern.name : "",
      stiftung: stiftCent ? { betragCent: stiftCent, vorgabe: stiftung.vorgabe } : null,
      spende: spendeCent ? { betragCent: spendeCent, nennen: spende.nennen } : null,
      bemerkung,
      sprache,
    });
  };

  return (
    <form onSubmit={senden} className="flex flex-col gap-6">
      <p className="text-sm text-grau">{t.pflichtfeld}</p>
      <Abschnitt titel={t.ihreAngaben}>
        <AusstellerFelder a={a} setA={setA} pflicht vorschlaege={vorschlaege} />
        <div className="mt-4 flex flex-wrap gap-6">
          <Haken label={t.jugend} checked={istJugend} onChange={setIstJugend} />
          <Haken label={t.preisrichter} checked={istPreisrichter} onChange={setIstPreisrichter} />
        </div>
        {teilschauen.length > 1 && (
          <Feld label={t.teilschau} className="mt-4 max-w-md">
            {(id) => (
              <Auswahl id={id} value={teilschau ?? teilschauen[0]!.id} onChange={(e) => setTeilschau(e.target.value)}>
                {teilschauen.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Auswahl>
            )}
          </Feld>
        )}
        {istJugend && (
          <div className="mt-4 grid gap-4 border-t border-linie pt-4 sm:grid-cols-2">
            <Feld label={`${t.erziehungsberechtigter} *`} hinweis={t.pflichtUnter18}>
              {(id) => <Eingabe id={id} value={eltern.name} onChange={(e) => setEltern({ ...eltern, name: e.target.value })} autoComplete="off" />}
            </Feld>
            <div className="self-center">
              <Haken label={t.elternEinverstanden} checked={eltern.einverstanden} onChange={(v) => setEltern({ ...eltern, einverstanden: v })} />
            </div>
          </div>
        )}
      </Abschnitt>
      <Abschnitt titel={t.ihreTiere}>
        <p className="-mt-2 mb-4 max-w-[70ch] text-sm text-grau">{t.reihenfolge}</p>
        <PositionenEditor positionen={positionen} setPositionen={setPositionen} suche={suche} kaefigRegeln={kaefigRegeln} kaefigMasse={kaefigMasse} />
      </Abschnitt>
      <Abschnitt titel={t.stiftungTitel}>
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <Feld label={t.betragEuro}>{(id) => <Eingabe id={id} inputMode="decimal" value={stiftung.betrag} onChange={(e) => setStiftung({ ...stiftung, betrag: e.target.value })} />}</Feld>
          <Feld label={t.wofuer}>{(id) => <Eingabe id={id} value={stiftung.vorgabe} onChange={(e) => setStiftung({ ...stiftung, vorgabe: e.target.value })} placeholder={t.wofuerBeispiel} />}</Feld>
        </div>
      </Abschnitt>
      <Abschnitt titel={t.spendeTitel}>
        <div className="grid items-end gap-4 sm:grid-cols-[12rem_1fr]">
          <Feld label={t.betragEuro}>{(id) => <Eingabe id={id} inputMode="decimal" value={spende.betrag} onChange={(e) => setSpende({ ...spende, betrag: e.target.value })} />}</Feld>
          <div className="pb-2">
            <Haken label={t.spenderNennen} checked={spende.nennen} onChange={(nennen) => setSpende({ ...spende, nennen })} />
          </div>
        </div>
        <Feld label={t.bemerkung} className="mt-4">{(id) => <Eingabe id={id} value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} />}</Feld>
      </Abschnitt>
      <Abschnitt titel={t.bestimmungen}>
        {/* Bestimmungen und Erklärungen schreibt der Verein – sie bleiben deutsch, mit Hinweis in anderen Sprachen. */}
        {bestimmungen && tx.rahmen.nurDeutsch && <p className="mb-2 text-sm text-grau">{tx.rahmen.nurDeutsch}</p>}
        {bestimmungen && <div lang="de" className="mb-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-papier p-4 text-sm">{bestimmungen}</div>}
        <Haken checked={zustimmung} onChange={setZustimmung} label={t.aab} hinweis={t.aabHinweis} />
        {erklaerungen.length > 0 && (
          <fieldset className="mt-4 flex flex-col gap-3">
            <legend className="mb-1 font-semibold">{t.erklaerungen}</legend>
            {erklaerungen.map((text, i) => (
              <Haken key={text} label={<span lang="de">{text}</span>} checked={erklaert[i] ?? false} onChange={(v) => setErklaert(erklaert.map((x, j) => (j === i ? v : x)))} />
            ))}
          </fieldset>
        )}
      </Abschnitt>
      <Abschnitt titel={t.datenschutz}>
        <div className="mb-4 flex max-w-[70ch] flex-col gap-2 text-sm">
          {datenschutz.map((x) => <p key={x}>{x}</p>)}
          <p>
            <Link to={`/s/${slug}/datenschutz`} target="_blank" className="font-semibold">{t.vollstaendigeHinweise}</Link> {t.neuesFenster}
          </p>
        </div>
        <Haken checked={online} onChange={setOnline} label={t.online} hinweis={t.onlineHinweis} />
      </Abschnitt>
      {fehler.length > 0 && (
        <div ref={fehlerListe} tabIndex={-1} className="outline-none">
          <Hinweis ton="fehler">
            <p className="font-semibold">{t.bitteErgaenzen}</p>
            <ul className="list-inside list-disc">{fehler.map((f) => <li key={f}>{f}</li>)}</ul>
          </Hinweis>
        </div>
      )}
      {melden.error && <Hinweis ton="fehler">{fehlerFuerAussteller(melden.error, sprache)}</Hinweis>}
      <Knopf type="submit" variante="primaer" gross laedt={melden.isPending} disabled={!!nurLesen} className="self-start">
        {t.melden}
      </Knopf>
    </form>
  );
}

export function MeineMeldung() {
  const { slug = "", token = "" } = useParams();
  const m = trpc.oeffentlich.meineMeldung.useQuery({ slug, token });
  const sprache = useSprache();
  const tx = useTexte();
  const t = tx.meine;
  if (m.isLoading) return <Laden />;
  if (m.error || !m.data)
    return (
      <OeffentlicherRahmen titel={t.nichtGefunden}>
        <Hinweis ton="fehler">{m.error?.data?.code === "NOT_FOUND" ? (sprache === "de" ? m.error.message : t.linkAusMail) : fehlerFuerAussteller(m.error, sprache)}</Hinweis>
      </OeffentlicherRahmen>
    );
  const d = m.data;
  const euro = (c: number) => euroIn(c, sprache);
  const offen = gefordertCent(d.betrag) - d.betrag.bezahltCent;
  return (
    <OeffentlicherRahmen titel={t.titel(d.name)} unter={d.schau.name} test={d.schau.test}>
      <Abschnitt>
        <div className="flex flex-wrap items-center gap-4">
          <Marke ton={d.status === "bestaetigt" ? "ok" : d.status === "offen" ? "warnung" : "fehler"}>
            {d.status === "bestaetigt"
              ? t.bestaetigt
              : d.status === "offen"
                ? gefordertCent(d.betrag) <= 0
                  ? t.wartet
                  : d.schau.zahlungBeiEinlieferung
                    ? t.zahlungEinlieferung
                    : t.zahlungAusstehend
                : d.status === "abgelehnt"
                  ? t.abgelehnt
                  : t.storniert}
          </Marke>
          <span className="tabular-nums">
            {tx.betrag.meldegeld} {euro(d.betrag.summeCent)}
            {d.betrag.stiftungCent > 0 && `, ${tx.betrag.stiftung} ${euro(d.betrag.stiftungCent)}`}
            {d.betrag.spendeCent > 0 && `, ${tx.betrag.spende} ${euro(d.betrag.spendeCent)}`}, {tx.betrag.bezahlt} {euro(d.betrag.bezahltCent)}
          </span>
          {offen > 0 && !d.ueberweisung && (d.status === "offen" || d.status === "bestaetigt") && d.schau.bankverbindung && !d.schau.zahlungBeiEinlieferung && <span className="text-grau">{t.ueberweisenAn} {d.schau.bankverbindung}</span>}
        </div>
        {d.ueberweisung && <Ueberweisung bank={d.schau.bankverbindung} ue={d.ueberweisung} />}
      </Abschnitt>
      <OnlineVeroeffentlichung slug={slug} token={token} online={d.online} jugend={d.jugend} />
      {!d.meldebogen && <Hinweis ton="warnung">{t.keinMeldebogen}</Hinweis>}
      {!d.schau.freigegeben && <Hinweis>{t.nachFreigabe}</Hinweis>}
      <TabellenRahmen fuss={<span>{t.tiere(d.tiere.length)}</span>}>
        <table className="tabelle">
          <thead>
            <tr>
              <th className="text-right">{tx.tiere.nr}</th>
              <th>{t.tier}</th>
              <th>{t.verkauf}</th>
              {d.schau.freigegeben && <th>{t.ergebnis}</th>}
            </tr>
          </thead>
          <tbody>
            {d.tiere.map((e, i) => (
              <tr key={i}>
                <td className="nummer text-right text-lg">{formatKatalognummer(e)}</td>
                <td>
                  <span lang="de">{e.bezeichnung}</span>, {e.geschlecht} {tx.alter[e.alter]}
                  {e.art !== "einzeltier" && ` (${tx.meldeart[e.art]})`}
                  {e.karte && (e.karte.vorzuege || e.karte.wuensche || e.karte.maengel) && (
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-sm text-grau">
                      {e.karte.vorzuege && <><dt>{t.vorzuege}</dt><dd>{e.karte.vorzuege}</dd></>}
                      {e.karte.wuensche && <><dt>{t.wuensche}</dt><dd>{e.karte.wuensche}</dd></>}
                      {e.karte.maengel && <><dt>{t.maengel}</dt><dd>{e.karte.maengel}</dd></>}
                    </dl>
                  )}
                </td>
                <td className="tabular-nums">{e.verkaufspreisCent ? euro(e.verkaufspreisCent) : "–"}{e.verkauft && <span className="mt-0.5 block"><Marke ton="ok">{t.verkauft}</Marke></span>}</td>
                {d.schau.freigegeben && (
                  <td>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-lg font-semibold">{e.ergebnis}</span>
                      {e.preise.map((p) => <Marke key={p} ton="info">{p}</Marke>)}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TabellenRahmen>
    </OeffentlicherRahmen>
  );
}

/** Einwilligung in die Online-Veröffentlichung ansehen, erteilen oder widerrufen – ohne Anmeldung, über den Link aus der Mail. */
function OnlineVeroeffentlichung({ slug, token, online, jugend }: { slug: string; token: string; online: boolean; jugend: boolean }) {
  const utils = trpc.useUtils();
  const m = trpc.oeffentlich.onlineVeroeffentlichung.useMutation({ onSuccess: () => utils.oeffentlich.meineMeldung.invalidate() });
  const sprache = useSprache();
  const t = useTexte().meine;
  // Jugendliche: Erlauben nur mit einem einverstandenen Erziehungsberechtigten (wie im Meldeformular).
  const [eltern, setEltern] = useState("");
  return (
    <Abschnitt titel={t.internet}>
      <div className="flex flex-wrap items-end gap-4">
        <p className="max-w-[70ch] flex-1 basis-72 self-center">
          {online ? t.online : t.offline}
        </p>
        {!online && jugend && (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {t.eltern}
            <Eingabe value={eltern} onChange={(e) => setEltern(e.target.value)} maxLength={200} className="w-64" />
          </label>
        )}
        <Knopf
          variante={online ? "zweit" : "primaer"}
          laedt={m.isPending}
          disabled={!online && jugend && eltern.trim().length < 3}
          onClick={() => m.mutate({ slug, token, erlaubt: !online, erziehungsberechtigter: eltern.trim(), sprache })}
        >
          {online ? t.widerrufen : t.erlauben}
        </Knopf>
      </div>
      {m.error && <Hinweis ton="fehler" className="mt-3">{fehlerFuerAussteller(m.error, sprache)}</Hinweis>}
    </Abschnitt>
  );
}

export function Ergebnisse() {
  const { slug = "" } = useParams();
  const e = trpc.oeffentlich.ergebnisse.useQuery({ slug });
  const sprache = useSprache();
  const tx = useTexte();
  const t = tx.ergebnisse;
  const [q, setQ] = useState("");
  const gruppen = useMemo(() => {
    const f = q.toLowerCase();
    const tiere = (e.data?.tiere ?? []).filter((t) => !f || `${t.bezeichnung} ${t.aussteller} ${t.verein} ${t.katalogNr}`.toLowerCase().includes(f));
    const map = new Map<string, typeof tiere>();
    for (const t of tiere) {
      // Jugend, Volieren und Stämme bilden eigene Blöcke wie im Katalog.
      const jugend = e.data?.freigegeben && istJugendBlock(t, e.data) ? `${tx.ergebnisse.jugend} – ` : "";
      const abteilung = e.data?.freigegeben && gruppenAbteilung(t.art, e.data.staemmeVorn) ? tx.abteilung[t.art as "stamm" | "voliere"] : null;
      const k = `${jugend}${abteilung ? `${abteilung} – ` : ""}${t.sparte}: ${t.bezeichnung}`;
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...map.entries()];
  }, [e.data, q, tx]);
  if (e.isLoading) return <Laden />;
  if (!e.data)
    return (
      <OeffentlicherRahmen titel={e.error?.data?.code === "NOT_FOUND" ? tx.rahmen.nichtGefunden : t.titelKurz} ohneFuss={e.error?.data?.code === "NOT_FOUND"}>
        <Hinweis ton="fehler">{e.error?.data?.code === "NOT_FOUND" ? tx.schau.adressePruefen : fehlerFuerAussteller(e.error, sprache)}</Hinweis>
      </OeffentlicherRahmen>
    );
  return (
    <OeffentlicherRahmen titel={t.titel(e.data.name)} unter={<Link to={`/s/${slug}`} className="text-auf-kopf/80">{tx.rahmen.zurSchau}</Link>} test={e.data.test}>
      {!e.data.freigegeben ? (
        <Hinweis>{t.nochNicht}</Hinweis>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Suchfeld aria-label={t.suchen} placeholder={t.suchePlatzhalter} value={q} onChange={(x) => setQ(x.target.value)} className="max-w-sm" />
            <span aria-live="polite" className="text-sm text-grau">{t.tiere(gruppen.reduce((n, [, x]) => n + x.length, 0))}</span>
            <KnopfLink href={mitSprache(`/s/${slug}/katalog.pdf`, sprache)} className="sm:ml-auto">{tx.schau.katalogPdf}</KnopfLink>
          </div>
          {gruppen.length === 0 && <p className="py-6 text-center text-grau">{t.keineTreffer}</p>}
          {gruppen.map(([titel, tiere]) => (
            <section key={titel} className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">{titel}</h2>
              <TabellenRahmen>
                <table className="tabelle">
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">{t.katalognummer}</th>
                      <th scope="col">{t.klasse}</th>
                      <th scope="col">{t.aussteller}</th>
                      <th scope="col">{t.ergebnis}</th>
                      <th scope="col">{t.preise}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiere.map((x) => (
                      <tr key={`${x.katalogNr}${x.suffix}`}>
                        <td className="nummer w-20 text-right text-lg">{formatKatalognummer(x)}</td>
                        <td className="w-32">{x.geschlecht} {tx.alter[x.alter]}</td>
                        <td>{x.verdeckt ? <span className="italic text-grau">{t.nichtVeroeffentlicht}</span> : x.aussteller}<span className="block text-sm text-grau">{x.verein}</span></td>
                        <td className="w-24 text-lg font-semibold">{x.ergebnis === "fehlt" ? t.fehlt : x.ergebnis}</td>
                        <td className="w-32">
                          <span className="flex flex-wrap gap-1">{x.preise.map((p) => <Marke key={p} ton="info">{p}</Marke>)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TabellenRahmen>
            </section>
          ))}
        </>
      )}
    </OeffentlicherRahmen>
  );
}
