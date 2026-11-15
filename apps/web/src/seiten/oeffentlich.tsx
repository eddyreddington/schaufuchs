import { GEBUEHR_LABEL, gefordertCent, gruppenAbteilung, MELDEART_LABEL, oeffnungszeitenZeilen, type AdressVorschlaege, type KaefigMasse, type KaefigRegel } from "@schau/domain";
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { AusstellerFelder, leererAussteller } from "../komponenten/aussteller";
import { alsEingabe, neuePosition, PositionenEditor, pruefePositionen, type Position } from "../komponenten/positionen";
import { datum, fehlerText, formatEuro, formatKatalognummer, parseEuro } from "../lib";
import { trpc } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, Feld, Haken, Hinweis, Knopf, knopfKlasse, KnopfLink, Laden, LESEBREITE, Marke, Suchfeld, TabellenRahmen, useSeitentitel, useUngespeichertWarnung } from "../ui";

/** Was eine Meldung fordert, aufgeschlüsselt (Meldegeld, zugesagte Stiftung und Spende). */
type Betrag = { summeCent: number; stiftungCent: number; spendeCent: number };
function betragText(b: Betrag) {
  const zusatz = [b.stiftungCent > 0 && `Ehrenpreisstiftung ${formatEuro(b.stiftungCent)}`, b.spendeCent > 0 && `Spende ${formatEuro(b.spendeCent)}`].filter(Boolean);
  return zusatz.length ? `Meldegeld ${formatEuro(b.summeCent)} + ${zusatz.join(" + ")} = ${formatEuro(gefordertCent(b))}` : formatEuro(b.summeCent);
}

const FUSS_LINK = "inline-flex min-h-9 items-center text-grau no-underline hover:text-tinte hover:underline";

/** ohneFuss: Seite zu einer unbekannten Adresse – keine Verweise auf „Zur Schau“, Impressum usw. unter dieser Adresse. */
function OeffentlicherRahmen({ titel, unter, children, ohneFuss, test }: { titel: string; unter?: ReactNode; children: ReactNode; ohneFuss?: boolean; /** Testschau: Hinweis auf jeder Seite. */ test?: boolean }) {
  const { slug } = useParams();
  useSeitentitel(titel);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-kopf text-auf-kopf">
        <div className={`${LESEBREITE} py-7`}>
          <h1 className="text-[1.9rem] font-bold leading-tight text-auf-kopf sm:text-4xl">{titel}</h1>
          {unter && <div className="mt-1.5 text-auf-kopf/75">{unter}</div>}
        </div>
      </header>
      <main id="inhalt" className={`${LESEBREITE} flex flex-1 flex-col gap-6 py-8`}>
        {test && <Hinweis ton="warnung">Testschau – keine echte Ausstellung. Bitte keine echten Tiere melden.</Hinweis>}
        {children}
      </main>
      {/* Anbieterkennzeichnung und Datenschutzhinweise auf jeder öffentlichen Seite (§ 5 DDG, Art. 13 DSGVO). */}
      {slug && !ohneFuss && (
        <footer className="border-t border-linie">
          <nav aria-label="Rechtliches" className={`${LESEBREITE} flex flex-wrap gap-x-6 gap-y-2 py-6 text-sm`}>
            <Link to={`/s/${slug}`} className={FUSS_LINK}>Zur Schau</Link>
            <Link to={`/s/${slug}/impressum`} className={FUSS_LINK}>Impressum</Link>
            <Link to={`/s/${slug}/datenschutz`} className={FUSS_LINK}>Datenschutz</Link>
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
  if (t.isLoading) return <Laden />;
  if (!t.data) return <OeffentlicherRahmen titel="Nicht gefunden" ohneFuss><Hinweis ton="fehler">{t.error?.message}</Hinweis></OeffentlicherRahmen>;
  const abschnitte = art === "impressum" ? t.data.impressum : t.data.datenschutz;
  return (
    <OeffentlicherRahmen titel={art === "impressum" ? "Impressum" : "Datenschutzhinweise"} unter={`${t.data.verein} · ${t.data.schau}`} test={t.data.test}>
      {!t.data.vollstaendig && <Hinweis ton="warnung">Der Verein hat seine Angaben noch nicht vollständig hinterlegt.</Hinweis>}
      <article className="flex max-w-[70ch] flex-col gap-6">
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
  const s = trpc.oeffentlich.schau.useQuery({ slug });
  const [gemeldet, setGemeldet] = useState<{ token: string; betrag: Betrag } | null>(null);
  if (s.isLoading) return <Laden />;
  if (s.error?.data?.code === "TOO_MANY_REQUESTS")
    return <OeffentlicherRahmen titel="Bitte kurz warten" ohneFuss><Hinweis ton="warnung">Gerade kommen sehr viele Anfragen. Bitte die Seite in einer Minute neu laden.</Hinweis></OeffentlicherRahmen>;
  if (s.error || !s.data) return <OeffentlicherRahmen titel="Schau nicht gefunden" ohneFuss><Hinweis ton="fehler">Bitte prüfen Sie die Adresse.</Hinweis></OeffentlicherRahmen>;
  const d = s.data;
  const termine = [
    ["Meldeschluss", datum(d.meldeschluss)],
    ["Einlieferung", d.einlieferung],
    ["Bewertung", datum(d.bewertungAm)],
    ["Öffnungszeiten", oeffnungszeitenZeilen(d.oeffnungszeiten).join("\n")],
    ["Tierausgabe", d.aussetzen],
  ].filter(([, v]) => v && v !== "–");
  const bankZeigen = !!d.bankverbindung && !d.zahlungBeiEinlieferung;
  return (
    <OeffentlicherRahmen titel={d.name} unter={[d.veranstalter, d.ort].filter(Boolean).join(", ")} test={d.test}>
      {(termine.length > 0 || d.gebuehren.length > 0 || bankZeigen) && (
      <div className="grid gap-6 md:grid-cols-2">
        {termine.length > 0 && (
        <Abschnitt titel="Termine">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5">
            {termine.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-grau">{k}</dt>
                  <dd className="whitespace-pre-line font-medium">{v}</dd>
                </div>
              ))}
          </dl>
        </Abschnitt>
        )}
        {(d.gebuehren.length > 0 || bankZeigen) && (
        <Abschnitt titel="Gebühren">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
            {d.gebuehren.map((g) => (
              <div key={`${g.art}-${g.jugend}`} className="contents">
                <dt>{GEBUEHR_LABEL[g.art]}{g.jugend && " (Jugend)"}</dt>
                <dd className="text-right font-semibold tabular-nums">{formatEuro(g.betragCent)}</dd>
              </div>
            ))}
          </dl>
          {d.zahlungBeiEinlieferung && d.gebuehren.length > 0 && <p className="mt-4 border-t border-linie pt-3 text-sm text-grau">Zahlung bei der Einlieferung der Tiere.</p>}
          {bankZeigen && <p className="mt-4 border-t border-linie pt-3 text-sm text-grau">Zahlung an: <span className="text-tinte">{d.bankverbindung}</span></p>}
        </Abschnitt>
        )}
      </div>
      )}
      {d.ergebnisse ? (
        <div className="flex flex-wrap gap-2">
          <Link to="ergebnisse" className={knopfKlasse("primaer")}>Ergebnisse ansehen</Link>
          <KnopfLink href={`/s/${slug}/katalog.pdf`}>Katalog mit Ergebnissen (PDF)</KnopfLink>
        </div>
      ) : (
        // Nummern fest, Ergebnisse noch nicht freigegeben: Das PDF gibt es öffentlich erst mit den Ergebnissen.
        d.katalog && <Hinweis>Die Katalognummern stehen fest. Ergebnisse und Katalog erscheinen hier nach der Freigabe.</Hinweis>
      )}
      {gemeldet ? (
        <Abschnitt titel="Vielen Dank, Ihre Meldung ist eingegangen">
          {gefordertCent(gemeldet.betrag) <= 0 ? (
            <p className="text-lg">Kein Meldegeld. Die Ausstellungsleitung bestätigt die Meldung.</p>
          ) : (
            <p className="text-lg">
              {d.zahlungBeiEinlieferung ? "Zu zahlen bei der Einlieferung der Tiere: " : "Zu zahlen: "}
              <b className="font-semibold tabular-nums">{betragText(gemeldet.betrag)}</b>
              {d.zahlungBeiEinlieferung ? "." : ". Die Meldung wird erst nach Zahlungseingang bearbeitet."}
            </p>
          )}
          {bankZeigen && gefordertCent(gemeldet.betrag) > 0 && <p className="mt-2">Bankverbindung: {d.bankverbindung}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p>Eine Bestätigung ist per E-Mail unterwegs.</p>
            <Link to={`meldung/${gemeldet.token}`} className={knopfKlasse("zweit")}>Meine Meldung und Ergebnisse</Link>
          </div>
        </Abschnitt>
      ) : d.meldung.offen ? (
        <Meldeformular slug={slug} bestimmungen={d.bestimmungen} erklaerungen={d.erklaerungen} datenschutz={d.datenschutzKurz} kaefigRegeln={d.kaefigRegeln} kaefigMasse={d.kaefigMasse} teilschauen={d.teilschauen} vorschlaege={{ vereine: d.vereine, kreisverbaende: d.kreisverbaende }} fertig={(token, betrag) => { setGemeldet({ token, betrag }); window.scrollTo(0, 0); }} />
      ) : (
        <Hinweis ton="warnung">{d.meldung.grund}</Hinweis>
      )}
      {d.kontaktEmail && <p className="text-sm text-grau">Fragen an die Ausstellungsleitung: <a href={`mailto:${d.kontaktEmail}`}>{d.kontaktEmail}</a></p>}
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
  fertig: (token: string, betrag: Betrag) => void;
}) {
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
  const melden = trpc.oeffentlich.melden.useMutation({ onSuccess: (r) => fertig(r.token, r.betrag) });

  const senden = (e: FormEvent) => {
    e.preventDefault();
    const probleme = pruefePositionen(positionen);
    if (!zustimmung) probleme.push("Bitte die AAB und die Sonderbestimmungen anerkennen.");
    if (erklaert.some((x) => !x)) probleme.push("Bitte alle Erklärungen zur Herkunft der Tiere bestätigen.");
    if (istJugend && (eltern.name.trim().length < 3 || !eltern.einverstanden)) probleme.push("Bei einer Jugendmeldung bitte den Namen eines Erziehungsberechtigten angeben und sein Einverständnis bestätigen.");
    const stiftCent = stiftung.betrag.trim() ? parseEuro(stiftung.betrag) : 0;
    if (stiftCent == null) probleme.push("Betrag der Ehrenpreisstiftung ist ungültig.");
    const spendeCent = spende.betrag.trim() ? parseEuro(spende.betrag) : 0;
    if (spendeCent == null || spendeCent < 0) probleme.push("Betrag der Spende ist ungültig.");
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
    });
  };

  return (
    <form onSubmit={senden} className="flex flex-col gap-6">
      <p className="text-sm text-grau">* Pflichtfeld</p>
      <Abschnitt titel="Ihre Angaben">
        <AusstellerFelder a={a} setA={setA} pflicht vorschlaege={vorschlaege} />
        <div className="mt-4 flex flex-wrap gap-6">
          <Haken label="Ich melde als Jugendlicher" checked={istJugend} onChange={setIstJugend} />
          <Haken label="Ich bin amtierender Preisrichter" checked={istPreisrichter} onChange={setIstPreisrichter} />
        </div>
        {teilschauen.length > 1 && (
          <Feld label="Teilschau" className="mt-4 max-w-md">
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
            <Feld label="Name eines Erziehungsberechtigten *" hinweis="Pflicht unter 18 Jahren">
              {(id) => <Eingabe id={id} value={eltern.name} onChange={(e) => setEltern({ ...eltern, name: e.target.value })} autoComplete="off" />}
            </Feld>
            <div className="self-center">
              <Haken label="Der Erziehungsberechtigte ist mit dieser Meldung und den Angaben unten einverstanden." checked={eltern.einverstanden} onChange={(v) => setEltern({ ...eltern, einverstanden: v })} />
            </div>
          </div>
        )}
      </Abschnitt>
      <Abschnitt titel="Ihre Tiere">
        <p className="-mt-2 mb-4 max-w-[70ch] text-sm text-grau">Reihenfolge je Farbenschlag: 1,0 jung, 1,0 alt, 0,1 jung, 0,1 alt. Bei Zwergrassen „Zwerg“ mit eintippen.</p>
        <PositionenEditor positionen={positionen} setPositionen={setPositionen} suche={suche} kaefigRegeln={kaefigRegeln} kaefigMasse={kaefigMasse} />
      </Abschnitt>
      <Abschnitt titel="Ehrenpreisstiftung (freiwillig)">
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <Feld label="Betrag (€)">{(id) => <Eingabe id={id} inputMode="decimal" value={stiftung.betrag} onChange={(e) => setStiftung({ ...stiftung, betrag: e.target.value })} />}</Feld>
          <Feld label="Wofür?">{(id) => <Eingabe id={id} value={stiftung.vorgabe} onChange={(e) => setStiftung({ ...stiftung, vorgabe: e.target.value })} placeholder="z. B. bestes Tier Orpington" />}</Feld>
        </div>
      </Abschnitt>
      <Abschnitt titel="Spende für die Ausstellung (freiwillig)">
        <div className="grid items-end gap-4 sm:grid-cols-[12rem_1fr]">
          <Feld label="Betrag (€)">{(id) => <Eingabe id={id} inputMode="decimal" value={spende.betrag} onChange={(e) => setSpende({ ...spende, betrag: e.target.value })} />}</Feld>
          <div className="pb-2">
            <Haken label="Meinen Namen im gedruckten Katalog als Spender nennen" checked={spende.nennen} onChange={(nennen) => setSpende({ ...spende, nennen })} />
          </div>
        </div>
        <Feld label="Bemerkung an die Ausstellungsleitung" className="mt-4">{(id) => <Eingabe id={id} value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} />}</Feld>
      </Abschnitt>
      <Abschnitt titel="Bestimmungen">
        {bestimmungen && <div className="mb-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-papier p-4 text-sm">{bestimmungen}</div>}
        <Haken
          checked={zustimmung}
          onChange={setZustimmung}
          label="Ich erkenne die AAB des BDRG und die Sonderbestimmungen an. *"
          hinweis="Danach stehen Name, Wohnort und Verein mit Ihren Tieren und Bewertungen im gedruckten Katalog."
        />
        {erklaerungen.length > 0 && (
          <fieldset className="mt-4 flex flex-col gap-3">
            <legend className="mb-1 font-semibold">Erklärungen zur Herkunft der Tiere *</legend>
            {erklaerungen.map((text, i) => (
              <Haken key={text} label={text} checked={erklaert[i] ?? false} onChange={(v) => setErklaert(erklaert.map((x, j) => (j === i ? v : x)))} />
            ))}
          </fieldset>
        )}
      </Abschnitt>
      <Abschnitt titel="Datenschutz">
        <div className="mb-4 flex max-w-[70ch] flex-col gap-2 text-sm">
          {datenschutz.map((x) => <p key={x}>{x}</p>)}
          <p>
            <Link to={`/s/${slug}/datenschutz`} target="_blank" className="font-semibold">Vollständige Datenschutzhinweise</Link> (öffnet in neuem Fenster)
          </p>
        </div>
        <Haken
          checked={online}
          onChange={setOnline}
          label="Freiwillig: Mein Name, Wohnort und Verein dürfen auch im Internet erscheinen (Ergebnisliste und Katalog zum Herunterladen)."
          hinweis="Ohne Haken steht dort „nicht veröffentlicht“. Sie können die Einwilligung jederzeit über den Link in der Bestätigungsmail widerrufen."
        />
      </Abschnitt>
      {fehler.length > 0 && (
        <div ref={fehlerListe} tabIndex={-1} className="outline-none">
          <Hinweis ton="fehler">
            <p className="font-semibold">Bitte noch ergänzen:</p>
            <ul className="list-inside list-disc">{fehler.map((f) => <li key={f}>{f}</li>)}</ul>
          </Hinweis>
        </div>
      )}
      {melden.error && <Hinweis ton="fehler">{fehlerText(melden.error)}</Hinweis>}
      <Knopf type="submit" variante="primaer" gross laedt={melden.isPending} className="self-start">
        Verbindlich melden
      </Knopf>
    </form>
  );
}

export function MeineMeldung() {
  const { slug = "", token = "" } = useParams();
  const m = trpc.oeffentlich.meineMeldung.useQuery({ slug, token });
  if (m.isLoading) return <Laden />;
  if (m.error || !m.data) return <OeffentlicherRahmen titel="Meldung nicht gefunden"><Hinweis ton="fehler">{m.error?.message}</Hinweis></OeffentlicherRahmen>;
  const d = m.data;
  const offen = gefordertCent(d.betrag) - d.betrag.bezahltCent;
  return (
    <OeffentlicherRahmen titel={`Meldung von ${d.name}`} unter={d.schau.name} test={d.schau.test}>
      <Abschnitt>
        <div className="flex flex-wrap items-center gap-4">
          <Marke ton={d.status === "bestaetigt" ? "ok" : d.status === "offen" ? "warnung" : "fehler"}>
            {d.status === "bestaetigt"
              ? "bestätigt"
              : d.status === "offen"
                ? gefordertCent(d.betrag) <= 0
                  ? "wartet auf Bestätigung"
                  : d.schau.zahlungBeiEinlieferung
                    ? "eingegangen – Zahlung bei der Einlieferung"
                    : "Zahlung ausstehend"
                : d.status}
          </Marke>
          <span className="tabular-nums">
            Meldegeld {formatEuro(d.betrag.summeCent)}
            {d.betrag.stiftungCent > 0 && `, Ehrenpreisstiftung ${formatEuro(d.betrag.stiftungCent)}`}
            {d.betrag.spendeCent > 0 && `, Spende ${formatEuro(d.betrag.spendeCent)}`}, bezahlt {formatEuro(d.betrag.bezahltCent)}
          </span>
          {offen > 0 && d.schau.bankverbindung && !d.schau.zahlungBeiEinlieferung && <span className="text-grau">Bitte überweisen an: {d.schau.bankverbindung}</span>}
        </div>
      </Abschnitt>
      <OnlineVeroeffentlichung slug={slug} token={token} online={d.online} jugend={d.jugend} />
      {!d.meldebogen && <Hinweis ton="warnung">Kein unterschriebener Meldebogen: Ihr Name steht deshalb nicht im Katalog. Bitte an die Ausstellungsleitung wenden.</Hinweis>}
      {!d.schau.freigegeben && <Hinweis>Die Ergebnisse erscheinen hier nach der Freigabe.</Hinweis>}
      <TabellenRahmen fuss={<span>{d.tiere.length} {d.tiere.length === 1 ? "Tier" : "Tiere"}</span>}>
        <table className="tabelle">
          <thead>
            <tr>
              <th className="text-right">Nr.</th>
              <th>Tier</th>
              <th>Verkauf</th>
              {d.schau.freigegeben && <th>Ergebnis</th>}
            </tr>
          </thead>
          <tbody>
            {d.tiere.map((t, i) => (
              <tr key={i}>
                <td className="nummer text-right text-lg">{formatKatalognummer(t)}</td>
                <td>
                  {t.bezeichnung}, {t.geschlecht} {t.alter}
                  {t.art !== "einzeltier" && ` (${MELDEART_LABEL[t.art]})`}
                  {t.karte && (t.karte.vorzuege || t.karte.wuensche || t.karte.maengel) && (
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-sm text-grau">
                      {t.karte.vorzuege && <><dt>Vorzüge:</dt><dd>{t.karte.vorzuege}</dd></>}
                      {t.karte.wuensche && <><dt>Wünsche:</dt><dd>{t.karte.wuensche}</dd></>}
                      {t.karte.maengel && <><dt>Mängel:</dt><dd>{t.karte.maengel}</dd></>}
                    </dl>
                  )}
                </td>
                <td className="tabular-nums">{t.verkaufspreisCent ? formatEuro(t.verkaufspreisCent) : "–"}{t.verkauft && <span className="mt-0.5 block"><Marke ton="ok">verkauft</Marke></span>}</td>
                {d.schau.freigegeben && (
                  <td>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-lg font-semibold">{t.ergebnis}</span>
                      {t.preise.map((p) => <Marke key={p} ton="info">{p}</Marke>)}
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
  // Jugendliche: Erlauben nur mit einem einverstandenen Erziehungsberechtigten (wie im Meldeformular).
  const [eltern, setEltern] = useState("");
  return (
    <Abschnitt titel="Veröffentlichung im Internet">
      <div className="flex flex-wrap items-end gap-4">
        <p className="max-w-[70ch] flex-1 basis-72 self-center">
          {online
            ? "Ihr Name, Wohnort und Verein erscheinen in der Online-Ergebnisliste und im Katalog zum Herunterladen."
            : "Im Internet erscheinen Sie ohne Namen („nicht veröffentlicht“). Im gedruckten Katalog stehen Sie wie gewohnt."}
        </p>
        {!online && jugend && (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Erziehungsberechtigte(r), der/die einverstanden ist
            <Eingabe value={eltern} onChange={(e) => setEltern(e.target.value)} maxLength={200} className="w-64" />
          </label>
        )}
        <Knopf
          variante={online ? "zweit" : "primaer"}
          laedt={m.isPending}
          disabled={!online && jugend && eltern.trim().length < 3}
          onClick={() => m.mutate({ slug, token, erlaubt: !online, erziehungsberechtigter: eltern.trim() })}
        >
          {online ? "Einwilligung widerrufen" : "Veröffentlichung erlauben"}
        </Knopf>
      </div>
      {m.error && <Hinweis ton="fehler" className="mt-3">{fehlerText(m.error)}</Hinweis>}
    </Abschnitt>
  );
}

export function Ergebnisse() {
  const { slug = "" } = useParams();
  const e = trpc.oeffentlich.ergebnisse.useQuery({ slug });
  const [q, setQ] = useState("");
  const gruppen = useMemo(() => {
    const f = q.toLowerCase();
    const tiere = (e.data?.tiere ?? []).filter((t) => !f || `${t.bezeichnung} ${t.aussteller} ${t.verein} ${t.katalogNr}`.toLowerCase().includes(f));
    const map = new Map<string, typeof tiere>();
    for (const t of tiere) {
      // Jugend, Volieren und Stämme bilden eigene Blöcke wie im Katalog.
      const jugend = t.istJugend && e.data?.freigegeben && e.data.jugendSeparat ? "Jugend – " : "";
      const abteilung = e.data?.freigegeben ? gruppenAbteilung(t.art, e.data.staemmeVorn) : null;
      const k = `${jugend}${abteilung ? `${abteilung} – ` : ""}${t.sparte}: ${t.bezeichnung}`;
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return [...map.entries()];
  }, [e.data, q]);
  if (e.isLoading) return <Laden />;
  if (!e.data)
    return (
      <OeffentlicherRahmen titel={e.error?.data?.code === "NOT_FOUND" ? "Nicht gefunden" : "Ergebnisse"} ohneFuss={e.error?.data?.code === "NOT_FOUND"}>
        <Hinweis ton="fehler">{e.error?.message}</Hinweis>
      </OeffentlicherRahmen>
    );
  return (
    <OeffentlicherRahmen titel={`Ergebnisse: ${e.data.name}`} unter={<Link to={`/s/${slug}`} className="text-auf-kopf/80">Zur Schau</Link>} test={e.data.test}>
      {!e.data.freigegeben ? (
        <Hinweis>Die Ergebnisse sind noch nicht freigegeben.</Hinweis>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Suchfeld aria-label="Suchen" placeholder="Rasse, Aussteller oder Verein" value={q} onChange={(x) => setQ(x.target.value)} className="max-w-sm" />
            <span aria-live="polite" className="text-sm text-grau">{gruppen.reduce((n, [, t]) => n + t.length, 0)} Tiere</span>
            <KnopfLink href={`/s/${slug}/katalog.pdf`} className="sm:ml-auto">Katalog mit Ergebnissen (PDF)</KnopfLink>
          </div>
          {gruppen.length === 0 && <p className="py-6 text-center text-grau">Keine Treffer.</p>}
          {gruppen.map(([titel, tiere]) => (
            <section key={titel} className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">{titel}</h2>
              <TabellenRahmen>
                <table className="tabelle">
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">Katalognummer</th>
                      <th scope="col">Klasse</th>
                      <th scope="col">Aussteller</th>
                      <th scope="col">Ergebnis</th>
                      <th scope="col">Preise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiere.map((t) => (
                      <tr key={`${t.katalogNr}${t.suffix}`}>
                        <td className="nummer w-20 text-right text-lg">{formatKatalognummer(t)}</td>
                        <td className="w-32">{t.geschlecht} {t.alter}</td>
                        <td>{t.verdeckt ? <span className="italic text-grau">{t.aussteller}</span> : t.aussteller}<span className="block text-sm text-grau">{t.verein}</span></td>
                        <td className="w-24 text-lg font-semibold">{t.ergebnis}</td>
                        <td className="w-32">
                          <span className="flex flex-wrap gap-1">{t.preise.map((p) => <Marke key={p} ton="info">{p}</Marke>)}</span>
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
