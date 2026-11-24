import { type GebuehrArt, type Zahlart } from "@schau/domain";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AusstellerFelder, leererAussteller, type AusstellerDaten } from "../komponenten/aussteller";
import { alsEingabe, ausEintrag, neuePosition, PositionenEditor, pruefePositionen, type Position } from "../komponenten/positionen";
import { datum, fehlerText, formatEuro, heuteIso, parseEuro } from "../lib";
import { useSchauId } from "../rahmen";
import { useIstAdmin } from "../rolle";
import { useOberflaeche, useTexte } from "../sprache";
import { Symbol } from "../symbole";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, Feld, Haken, HilfeLink, Hinweis, Kennzahlen, Knopf, knopfKlasse, Laden, Marke, SEITE, Seitenkopf, Speicherleiste, Textfeld, useFrage, useMeldung, useUngespeichertWarnung } from "../ui";
import { STATUS_TON } from "./meldungen";
import { offenCent, zahlungAuftrag } from "./meldung-zahlung";
import { neueAnfrageId } from "./anfrage-kennung";

export function MeldungBearbeiten() {
  const schauId = useSchauId();
  const meldungId = Number(useParams().meldungId) || undefined;
  const daten = trpc.meldung.get.useQuery({ id: meldungId! }, { enabled: !!meldungId });
  // Nach dem Speichern neu aufbauen: neue Positionen bekommen ihre ID aus der neu geladenen Meldung.
  const [runde, setRunde] = useState(0);
  if (meldungId && (daten.isLoading || !daten.data)) return daten.error ? <Hinweis ton="fehler">{fehlerText(daten.error)}</Hinweis> : <Laden />;
  return <Formular key={`${meldungId ?? "neu"}-${runde}`} schauId={schauId} vorhanden={daten.data} nachSpeichern={() => setRunde((r) => r + 1)} />;
}

type Vorhanden = Ausgabe["meldung"]["get"];

function Formular({ schauId, vorhanden, nachSpeichern }: { schauId: number; vorhanden?: Vorhanden; nachSpeichern: () => void }) {
  const schau = trpc.schau.get.useQuery({ id: schauId });
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const t = useOberflaeche();
  const tm = t.meldung;
  const tb = tm.bearbeiten;
  const tx = useTexte();
  const [ausstellerId, setAusstellerId] = useState<number | undefined>(vorhanden?.aussteller.id);
  const adressen = trpc.meldung.adressVorschlaege.useQuery({ schauId }, { staleTime: 5 * 60_000 });
  const [a, setA] = useState<AusstellerDaten>(() => {
    if (!vorhanden) return leererAussteller();
    const { id: _id, organisationId: _o, createdAt: _c, istPreisrichter: _p, ...rest } = vorhanden.aussteller;
    return rest;
  });
  // Preisrichter-Befreiung gilt je Meldung (eine spätere Meldung ändert ältere Abrechnungen nicht).
  const [istPreisrichter, setIstPreisrichter] = useState(vorhanden ? vorhanden.meldung.istPreisrichter : false);
  const [istJugend, setIstJugend] = useState(vorhanden?.meldung.istJugend ?? false);
  const [teilschau, setTeilschau] = useState<string | null>(vorhanden?.meldung.teilschau ?? null);
  const [eingang, setEingang] = useState(vorhanden?.meldung.eingang ?? ("papier" as const));
  const [bemerkung, setBemerkung] = useState(vorhanden?.meldung.bemerkung ?? "");
  const [zustimmung, setZustimmung] = useState(!!vorhanden?.meldung.zustimmungAm);
  const [widerspruch, setWiderspruch] = useState(!!vorhanden?.meldung.namenWiderspruchAm);
  const [erklaerungen, setErklaerungen] = useState(!!vorhanden?.meldung.erklaerungenAm);
  const [onlineZustimmung, setOnlineZustimmung] = useState(!!vorhanden?.meldung.onlineZustimmungAm);
  // Stand beim Öffnen, festgehalten: `vorhanden` lädt sich nach (z. B. nach einer Buchung in der Seitenleiste).
  const [onlineBeimOeffnen] = useState(vorhanden ? !!vorhanden.meldung.onlineZustimmungAm : undefined);
  // Stand beim Öffnen: hat inzwischen jemand anders gespeichert, lehnt der Server ab (statt dessen Änderung zu überschreiben).
  const [standBeimOeffnen] = useState(vorhanden?.stand);
  // Neue Meldung: dieselbe Anfrage zweimal (verlorene Antwort) legt nur eine an.
  const [anfrageId] = useState(() => (vorhanden ? undefined : neueAnfrageId()));
  const [erziehungsberechtigter, setErziehungsberechtigter] = useState(vorhanden?.meldung.erziehungsberechtigter ?? "");
  const [positionen, setPositionen] = useState<Position[]>(() => (vorhanden ? vorhanden.eintraege.map(ausEintrag) : [neuePosition()]));
  const [fehler, setFehler] = useState<string[]>([]);
  // Ungespeicherte Änderungen: vor dem Verlassen nachfragen. Vergleich mit dem zuletzt gespeicherten Stand.
  const stand = JSON.stringify({ a, istPreisrichter, istJugend, teilschau, bemerkung, zustimmung, widerspruch, onlineZustimmung, erklaerungen, erziehungsberechtigter, positionen });
  const gespeichert = useRef(stand);
  useUngespeichertWarnung(() => gespeichert.current !== stand);

  const versionId = schau.data?.stammdatenVersionId ?? 0;
  const suche = (q: string) => trpc.stammdaten.suche.useQuery({ versionId, q }, { enabled: versionId > 0 && q.trim().length >= 2 });

  const speichern = trpc.meldung.speichern.useMutation({
    onSuccess: async (r) => {
      gespeichert.current = stand;
      await utils.meldung.invalidate();
      meldung(tb.gespeichert(formatEuro(r.betrag.summeCent)));
      // Absolut: relativ aufgelöst landete man auf …/meldungen/meldungen/5. replace, damit „Zurück“ nicht ins leere Formular führt.
      if (!vorhanden) navigate(`/schau/${schauId}/meldungen/${r.meldungId}`, { replace: true });
      else nachSpeichern();
    },
  });

  const senden = (e: FormEvent) => {
    e.preventDefault();
    const probleme = pruefePositionen(positionen, tx);
    setFehler(probleme);
    if (probleme.length) return;
    speichern.mutate({
      schauId,
      meldungId: vorhanden?.meldung.id,
      aussteller: { ...a, id: ausstellerId, istPreisrichter },
      eingang,
      istJugend,
      teilschau,
      bemerkung,
      zustimmung,
      namenWiderspruch: widerspruch,
      onlineZustimmung,
      // Stand beim Öffnen: ein Widerruf über „Meine Meldung“ in der Zwischenzeit wird so nicht überschrieben.
      onlineZustimmungVorher: onlineBeimOeffnen,
      stand: standBeimOeffnen,
      anfrageId,
      erklaerungen,
      erziehungsberechtigter,
      positionen: positionen.map(alsEingabe),
    });
  };

  const istAdmin = useIstAdmin();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const ungespeichert = gespeichert.current !== stand;
  const b = vorhanden?.betrag;
  const offen = b ? offenCent(b) : 0;

  return (
    <div className={SEITE}>
      <Seitenkopf
        titel={vorhanden ? `${vorhanden.aussteller.nachname}, ${vorhanden.aussteller.vorname}` : tm.meldungErfassen}
        unter={vorhanden ? tb.eingegangen(datum(vorhanden.meldung.eingegangenAm), tm.eingang[vorhanden.meldung.eingang]) : undefined}
        marke={vorhanden && <Marke ton={STATUS_TON[vorhanden.meldung.status]}>{tm.status[vorhanden.meldung.status]}</Marke>}
        hilfe={istAdmin ? "papiermeldungen-erfassen" : "eine-neue-meldung-erfassen"}
        hilfeTeil={istAdmin ? undefined : "helfer"}
        hilfeText={tb.hilfe}
        aktionen={
          <Link to={`/schau/${schauId}/meldungen`} className={knopfKlasse("leise")}>
            {tb.zurueck}
          </Link>
        }
      />
      {vorhanden && b && (
        <Kennzahlen
          werte={[
            { label: t.allgemein.tiere, wert: vorhanden.eintraege.length },
            {
              label: tb.meldegeld,
              wert: formatEuro(b.summeCent),
              zusatz: [b.stiftungCent > 0 && tb.plusStiftung(formatEuro(b.stiftungCent)), b.spendeCent > 0 && tb.plusSpende(formatEuro(b.spendeCent))].filter(Boolean).join(" ") || undefined,
            },
            { label: tm.bezahlt, wert: formatEuro(b.bezahltCent) },
            { label: tb.offen, wert: formatEuro(Math.max(offen, 0)), zusatz: offen < 0 ? tb.zuViel(formatEuro(-offen)) : undefined, ton: offen > 0 ? "warnung" : offen < 0 ? "warnung" : "ok" },
          ]}
        />
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <form id={formId} ref={formRef} onSubmit={senden} className="flex min-w-0 flex-col gap-6">
          <Abschnitt titel={t.allgemein.aussteller}>
            <div className="flex flex-col gap-4">
              {!vorhanden && <AusstellerSuche schauId={schauId} onWahl={(x) => { const { id, organisationId: _o, createdAt: _c, istPreisrichter: p, ...rest } = x; setAusstellerId(id); setA(rest); setIstPreisrichter(p); }} />}
              {ausstellerId && !vorhanden && (
                <Hinweis className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                  <span>{tb.bekannterGewaehlt}</span>
                  <button type="button" className="text-sm font-semibold text-band hover:underline" onClick={() => { setAusstellerId(undefined); setA(leererAussteller()); }}>
                    {tb.dochNeu}
                  </button>
                </Hinweis>
              )}
              <AusstellerFelder a={a} setA={setA} vorschlaege={adressen.data} />
              <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-linie pt-4">
                <Haken label={tb.jugendlicher} checked={istJugend} onChange={setIstJugend} />
                <Haken label={tb.preisrichter} checked={istPreisrichter} onChange={setIstPreisrichter} />
              </div>
              {(schau.data?.teilschauen.length ?? 0) > 0 && (
                <Feld label={tb.teilschau} className="max-w-md">
                  {(id) => (
                    <Auswahl id={id} value={teilschau ?? schau.data!.teilschauen[0]!.id} onChange={(e) => setTeilschau(e.target.value)}>
                      {schau.data!.teilschauen.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Auswahl>
                  )}
                </Feld>
              )}
              {istJugend && (
                <Feld label={tb.erziehungsberechtigter} hinweis={onlineZustimmung ? tb.pflichtInternet : undefined} className="max-w-md">
                  {(id) => <Eingabe id={id} value={erziehungsberechtigter} onChange={(e) => setErziehungsberechtigter(e.target.value)} autoComplete="off" />}
                </Feld>
              )}
            </div>
          </Abschnitt>

          <Abschnitt titel={t.allgemein.tiere}>
            {!versionId && <Hinweis ton="warnung" className="mb-4">{tb.keinVerzeichnis}</Hinweis>}
            <PositionenEditor positionen={positionen} setPositionen={setPositionen} suche={suche} kaefigRegeln={schau.data?.kaefigRegeln} kaefigMasse={schau.data?.kaefigMasse} festgeschrieben={!!schau.data?.katalogGedruckt} />
          </Abschnitt>

          <Abschnitt titel={tb.eingang}>
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
                <Feld label={tb.eingegangenPer}>
                  {(id) => (
                    <Auswahl id={id} value={eingang} disabled={!!vorhanden} onChange={(e) => setEingang(e.target.value as typeof eingang)}>
                      <option value="papier">{tm.eingang.papier}</option>
                      <option value="email">{tm.eingang.email}</option>
                      <option value="online">{tm.eingang.online}</option>
                    </Auswahl>
                  )}
                </Feld>
                <Feld label={tb.bemerkung}>{(id) => <Textfeld id={id} rows={2} value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} />}</Feld>
              </div>
              <div className="flex flex-col gap-3 border-t border-linie pt-4">
                <Haken label={tb.unterschrieben} checked={zustimmung} onChange={setZustimmung} hinweis={tb.unterschriebenHinweis} />
                <Haken label={tb.widerspruch} checked={widerspruch} onChange={setWiderspruch} hinweis={tb.widerspruchHinweis} />
                {!!schau.data?.erklaerungen.trim() && (
                  <Haken
                    label={tb.erklaerungen}
                    checked={erklaerungen}
                    onChange={setErklaerungen}
                    hinweis={schau.data.erklaerungen.split("\n").filter((z) => z.trim()).join(" · ")}
                  />
                )}
                <Haken label={tb.internet} checked={onlineZustimmung} onChange={setOnlineZustimmung} hinweis={tb.internetHinweis} />
              </div>
            </div>
          </Abschnitt>

          {fehler.length > 0 && (
            <Hinweis ton="fehler">
              <ul className="list-inside list-disc">{fehler.map((f) => <li key={f}>{f}</li>)}</ul>
            </Hinweis>
          )}
          {speichern.error && (
            <Hinweis ton="fehler">
              {fehlerText(speichern.error)}
              {/* Inzwischen von jemand anders gespeichert: die Eingaben bleiben bis zum Neuladen sichtbar (Entscheidung 033). */}
              {vorhanden && speichern.error.data?.code === "CONFLICT" && (
                <span className="mt-2 flex flex-wrap items-center gap-3">
                  <Knopf
                    onClick={async () => {
                      await utils.meldung.get.invalidate({ id: vorhanden.meldung.id });
                      nachSpeichern();
                    }}
                  >
                    {tb.neuLaden}
                  </Knopf>
                  <HilfeLink abschnitt={istAdmin ? "papiermeldungen-erfassen" : "eine-neue-meldung-erfassen"} teil={istAdmin ? undefined : "helfer"}>
                    {tb.hilfe}
                  </HilfeLink>
                </span>
              )}
            </Hinweis>
          )}
          <Speicherleiste sichtbar={ungespeichert} laedt={speichern.isPending} knopf={tb.speichern} onSpeichern={() => formRef.current?.requestSubmit()} />
        </form>

        {vorhanden && <Seitenleiste daten={vorhanden} schauId={schauId} />}
      </div>
    </div>
  );
}

function AusstellerSuche({ schauId, onWahl }: { schauId: number; onWahl: (a: Ausgabe["meldung"]["ausstellerSuche"][number]) => void }) {
  const tb = useOberflaeche().meldung.bearbeiten;
  const [q, setQ] = useState("");
  const treffer = trpc.meldung.ausstellerSuche.useQuery({ schauId, q }, { enabled: q.trim().length >= 2 });
  return (
    <div className="flex max-w-xl flex-col gap-2">
      <Feld label={tb.suchen} hinweis={tb.suchenHinweis}>
        {(id) => <Eingabe id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tb.suchenPlatzhalter} />}
      </Feld>
      {q.trim().length >= 2 && (treffer.data?.length ?? 0) > 0 && (
        <ul className="divide-y divide-linie overflow-hidden rounded-md border border-linie">
          {treffer.data!.map((x) => (
            <li key={x.id}>
              <button type="button" className="flex w-full flex-wrap items-baseline gap-x-2 px-3 py-2 text-left hover:bg-band-hell" onClick={() => { onWahl(x); setQ(""); }}>
                <span className="font-semibold">{x.nachname}, {x.vorname}</span>
                <span className="text-sm text-grau">{x.ort} {x.verein && `(${x.verein})`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Seitenleiste({ daten, schauId }: { daten: Vorhanden; schauId: number }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const t = useOberflaeche();
  const tm = t.meldung;
  const ts = tm.seitenleiste;
  const m = daten.meldung;
  const neu = () => utils.meldung.invalidate();
  const status = trpc.meldung.statusSetzen.useMutation({ onSuccess: neu, onError: (e) => meldung(fehlerText(e), "fehler") });
  const istAdmin = useIstAdmin();
  const stornieren = trpc.meldung.zahlungStornieren.useMutation({
    onSuccess: () => {
      neu();
      meldung(ts.zahlungStorniert);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const senden = trpc.meldung.bestaetigungSenden.useMutation({ onSuccess: () => meldung(ts.mailVerschickt), onError: (e) => meldung(fehlerText(e), "fehler") });
  const verfall = trpc.meldung.verfallBuchen.useMutation({
    onSuccess: () => {
      neu();
      meldung(ts.verfallGebucht);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const { eingabe, bestaetige } = useFrage();
  const offen = offenCent(daten.betrag);
  // Storniert oder abgelehnt, aber Geld eingegangen: erstatten oder Verfall – sonst hält es den Abschluss auf.
  const ruht = m.status === "storniert" || m.status === "abgelehnt";
  const nochDa = daten.betrag.bezahltCent - m.verfallenCent;
  const grundFrage = (titel: string, text?: string) => eingabe({ titel, text, feld: ts.grund, mindestens: 3 });

  return (
    <aside className="flex flex-col gap-4">
      <Abschnitt titel={t.allgemein.status} aktionen={<Marke ton={STATUS_TON[m.status]}>{tm.status[m.status]}</Marke>}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {(m.status === "offen" || (istAdmin && m.status !== "bestaetigt")) && <Knopf variante="primaer" onClick={() => status.mutate({ id: m.id, status: "bestaetigt" })}>{ts.bestaetigen}</Knopf>}
            {istAdmin && m.status === "offen" && (
              <Knopf variante="gefahr" onClick={async () => { const g = await grundFrage(ts.ablehnenTitel); if (g) status.mutate({ id: m.id, status: "abgelehnt", grund: g }); }}>
                {ts.ablehnen}
              </Knopf>
            )}
            {m.status === "bestaetigt" && (
              <Knopf
                onClick={async () => {
                  if (await bestaetige({ titel: ts.zuruecknehmenTitel, text: ts.zuruecknehmenText, knopf: ts.zuruecknehmen })) {
                    status.mutate({ id: m.id, status: "offen", grund: "Bestätigung zurückgenommen" }); // bleibt deutsch (Protokoll)
                  }
                }}
              >
                {ts.zuruecknehmenTitel}
              </Knopf>
            )}
            {istAdmin && m.status === "bestaetigt" && (
              <Knopf variante="gefahr" onClick={async () => { const g = await grundFrage(ts.stornierenTitel); if (g) status.mutate({ id: m.id, status: "storniert", grund: g }); }}>
                {ts.stornieren}
              </Knopf>
            )}
          </div>
          {m.verfallenCent > 0 && (
            <p className="text-sm text-grau">
              {ts.verfallBetrag(formatEuro(m.verfallenCent))}
              {m.verfallGrund ? ` – ${m.verfallGrund}` : ""}
            </p>
          )}
          {ruht && nochDa > 0 && (
            <Hinweis ton="warnung" className="flex flex-col items-start gap-2 text-sm">
              <span>{m.status === "storniert" ? ts.ruhtStorniert(formatEuro(nochDa)) : ts.ruhtAbgelehnt(formatEuro(nochDa))}</span>
              {istAdmin && (
                <Knopf
                  laedt={verfall.isPending}
                  onClick={async () => {
                    const g = await grundFrage(ts.verfallTitel, ts.verfallText(formatEuro(nochDa)));
                    if (g) verfall.mutate({ id: m.id, grund: g });
                  }}
                >
                  {ts.verfallKnopf}
                </Knopf>
              )}
            </Hinweis>
          )}
        </div>
      </Abschnitt>

      <Abschnitt titel={tm.bearbeiten.meldegeld}>
        <div className="flex flex-col gap-4">
          <table className="w-full text-sm">
            <tbody>
              {daten.betrag.zeilen.map((z) => (
                <tr key={z.art}>
                  <td className="py-0.5">{z.anzahl} × {t.fach.GEBUEHR_LABEL[z.art as GebuehrArt] ?? z.label}</td>
                  <td className="py-0.5 text-right">{formatEuro(z.summeCent)}</td>
                </tr>
              ))}
              <tr className="border-t border-linie font-semibold">
                <td className="pt-1.5">{ts.summe}</td>
                <td className="pt-1.5 text-right">{formatEuro(daten.betrag.summeCent)}</td>
              </tr>
              {daten.betrag.stiftungCent > 0 && (
                <tr>
                  <td className="py-0.5">{ts.stiftung}</td>
                  <td className="py-0.5 text-right">{formatEuro(daten.betrag.stiftungCent)}</td>
                </tr>
              )}
              {daten.betrag.spendeCent > 0 && (
                <tr>
                  <td className="py-0.5">{ts.spende}</td>
                  <td className="py-0.5 text-right">{formatEuro(daten.betrag.spendeCent)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold">{ts.zahlungen}</h3>
            <ul className="divide-y divide-linie text-sm">
              {daten.zahlungen.map((z) => {
                const storniert = daten.zahlungen.some((x) => x.stornoVon === z.id);
                return (
                  <li key={z.id} className={`flex items-center justify-between gap-2 py-1 ${storniert || z.stornoVon ? "text-grau" : ""}`}>
                    <span className="min-w-0">
                      {datum(z.datum)} · {t.fach.ZAHLART_LABEL[z.art as Zahlart] ?? t.fach.ZAHLART_LABEL.sonstige}
                      {z.stornoVon ? ts.storno(z.grund) : z.grund ? ` · ${z.grund}` : ""}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className={storniert ? "line-through" : ""}>{formatEuro(z.betragCent)}</span>
                      {!storniert && !z.stornoVon && istAdmin && (
                        <button
                          type="button"
                          aria-label={ts.zahlungStornieren}
                          title={ts.zahlungStornieren}
                          className="rounded p-1 text-grau hover:bg-kamm-hell hover:text-kamm"
                          onClick={async () => {
                            const g = await grundFrage(ts.zahlungStornieren, ts.gegenbuchung);
                            if (g) stornieren.mutate({ id: z.id, grund: g });
                          }}
                        >
                          <Symbol name="schliessen" className="size-3.5" />
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
              {daten.zahlungen.length === 0 && <li className="py-1 text-grau">{ts.keineZahlung}</li>}
            </ul>
          </div>
          <p className={`font-semibold ${offen > 0 ? "text-kamm" : "text-stall"}`}>{offen > 0 ? ts.offen(formatEuro(offen)) : ts.vollstaendig}</p>
          <ZahlungErfassen meldungId={m.id} vorschlag={Math.max(offen, 0)} betrag={daten.betrag} />
        </div>
      </Abschnitt>

      <Abschnitt titel={ts.fuerAussteller}>
        <div className="flex flex-col items-start gap-3 text-sm">
          <a href={`/datei/${schauId}/a-bogen.pdf?meldung=${m.id}`} target="_blank" rel="noreferrer">{ts.aBogen}</a>
          <a href={`/datei/${schauId}/aussteller.pdf?meldung=${m.id}`} target="_blank" rel="noreferrer">{ts.bBogen}</a>
          <a href={daten.link} target="_blank" rel="noreferrer">{ts.meineMeldung}</a>
          <Knopf onClick={() => senden.mutate({ id: m.id })} laedt={senden.isPending} disabled={!daten.aussteller.email}>
            {ts.eingangMailen}
          </Knopf>
        </div>
      </Abschnitt>
    </aside>
  );
}

function ZahlungErfassen({ meldungId, vorschlag, betrag: meldebetrag }: { meldungId: number; vorschlag: number; betrag: Vorhanden["betrag"] }) {
  const [betrag, setBetrag] = useState("");
  const [tag, setTag] = useState(heuteIso());
  const istAdmin = useIstAdmin();
  // Helfer buchen nur Bargeld an der Kasse; Kontoeingänge und Erstattungen bucht die Ausstellungsleitung.
  const [art, setArt] = useState<"ueberweisung" | "bar" | "sonstige">(istAdmin ? "ueberweisung" : "bar");
  useEffect(() => setBetrag(vorschlag ? (vorschlag / 100).toFixed(2).replace(".", ",") : ""), [vorschlag]);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const t = useOberflaeche();
  const tz = t.meldung.zahlung;
  const { eingabe } = useFrage();
  const erfassen = trpc.meldung.zahlungErfassen.useMutation({
    onSuccess: (r) => {
      utils.meldung.invalidate();
      meldung(r.bestaetigt ? tz.erfasstBestaetigt : tz.erfasst);
    },
    onError: (e) => {
      // Neu laden: nach „inzwischen schon kassiert“ zeigt die Seite den echten offenen Betrag.
      utils.meldung.invalidate();
      meldung(fehlerText(e), "fehler");
    },
  });
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const cent = parseEuro(betrag);
        if (cent == null || cent === 0) return meldung(tz.betragUngueltig, "fehler");
        let grund = "";
        if (cent < 0 && !istAdmin) return meldung(tz.erstattungNurLeitung, "fehler");
        if (cent < 0) {
          grund = (await eingabe({ titel: tz.erstattung, text: tz.erstattungText, feld: t.meldung.seitenleiste.grund, mindestens: 3 })) ?? "";
          if (!grund) return;
        }
        erfassen.mutate(zahlungAuftrag({ meldungId, betragCent: cent, datum: tag, art, grund, betrag: meldebetrag }));
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <Eingabe aria-label={tz.betragEuro} inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder={t.allgemein.betrag} />
        <Eingabe aria-label={t.allgemein.datum} type="date" value={tag} onChange={(e) => setTag(e.target.value)} />
      </div>
      <Auswahl aria-label={tz.zahlart} value={art} onChange={(e) => setArt(e.target.value as typeof art)}>
        {istAdmin && <option value="ueberweisung">{t.fach.ZAHLART_LABEL.ueberweisung}</option>}
        <option value="bar">{t.fach.ZAHLART_LABEL.bar}</option>
        {istAdmin && <option value="sonstige">{t.fach.ZAHLART_LABEL.sonstige}</option>}
      </Auswahl>
      <Knopf type="submit" laedt={erfassen.isPending}>{tz.erfassen}</Knopf>
    </form>
  );
}
