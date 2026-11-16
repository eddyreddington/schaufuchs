import { gefordertCent, type Zahlart, ZAHLART_LABEL } from "@schau/domain";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AusstellerFelder, leererAussteller, type AusstellerDaten } from "../komponenten/aussteller";
import { alsEingabe, ausEintrag, neuePosition, PositionenEditor, pruefePositionen, type Position } from "../komponenten/positionen";
import { datum, fehlerText, formatEuro, heuteIso, parseEuro } from "../lib";
import { useSchauId } from "../rahmen";
import { useIstAdmin } from "../rolle";
import { Symbol } from "../symbole";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, Feld, Haken, Hinweis, Kennzahlen, Knopf, knopfKlasse, Laden, Marke, SEITE, Seitenkopf, Speicherleiste, Textfeld, useFrage, useMeldung, useUngespeichertWarnung } from "../ui";
import { EINGANG_LABEL, STATUS_LABEL, STATUS_TON } from "./meldungen";

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
      meldung(`Meldung gespeichert. Betrag: ${formatEuro(r.betrag.summeCent)}`);
      // Absolut: relativ aufgelöst landete man auf …/meldungen/meldungen/5. replace, damit „Zurück“ nicht ins leere Formular führt.
      if (!vorhanden) navigate(`/schau/${schauId}/meldungen/${r.meldungId}`, { replace: true });
      else nachSpeichern();
    },
  });

  const senden = (e: FormEvent) => {
    e.preventDefault();
    const probleme = pruefePositionen(positionen);
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
  const offen = b ? gefordertCent(b) - b.bezahltCent : 0;

  return (
    <div className={SEITE}>
      <Seitenkopf
        titel={vorhanden ? `${vorhanden.aussteller.nachname}, ${vorhanden.aussteller.vorname}` : "Meldung erfassen"}
        unter={vorhanden ? `Eingegangen ${datum(vorhanden.meldung.eingegangenAm)} · ${EINGANG_LABEL[vorhanden.meldung.eingang]}` : undefined}
        marke={vorhanden && <Marke ton={STATUS_TON[vorhanden.meldung.status]}>{STATUS_LABEL[vorhanden.meldung.status]}</Marke>}
        hilfe={istAdmin ? "papiermeldungen-erfassen" : "eine-neue-meldung-erfassen"}
        hilfeTeil={istAdmin ? undefined : "helfer"}
        hilfeText="Hilfe zu Meldungen"
        aktionen={
          <Link to={`/schau/${schauId}/meldungen`} className={knopfKlasse("leise")}>
            Zurück zur Liste
          </Link>
        }
      />
      {vorhanden && b && (
        <Kennzahlen
          werte={[
            { label: "Tiere", wert: vorhanden.eintraege.length },
            {
              label: "Meldegeld",
              wert: formatEuro(b.summeCent),
              zusatz: [b.stiftungCent > 0 && `+ ${formatEuro(b.stiftungCent)} Stiftung`, b.spendeCent > 0 && `+ ${formatEuro(b.spendeCent)} Spende`].filter(Boolean).join(" ") || undefined,
            },
            { label: "Bezahlt", wert: formatEuro(b.bezahltCent) },
            { label: "Offen", wert: formatEuro(Math.max(offen, 0)), zusatz: offen < 0 ? `${formatEuro(-offen)} zu viel` : undefined, ton: offen > 0 ? "warnung" : offen < 0 ? "warnung" : "ok" },
          ]}
        />
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <form id={formId} ref={formRef} onSubmit={senden} className="flex min-w-0 flex-col gap-6">
          <Abschnitt titel="Aussteller">
            <div className="flex flex-col gap-4">
              {!vorhanden && <AusstellerSuche schauId={schauId} onWahl={(x) => { const { id, organisationId: _o, createdAt: _c, istPreisrichter: p, ...rest } = x; setAusstellerId(id); setA(rest); setIstPreisrichter(p); }} />}
              {ausstellerId && !vorhanden && (
                <Hinweis className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                  <span>Bekannter Aussteller ausgewählt.</span>
                  <button type="button" className="text-sm font-semibold text-band hover:underline" onClick={() => { setAusstellerId(undefined); setA(leererAussteller()); }}>
                    Doch neu anlegen
                  </button>
                </Hinweis>
              )}
              <AusstellerFelder a={a} setA={setA} vorschlaege={adressen.data} />
              <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-linie pt-4">
                <Haken label="Jugendlicher" checked={istJugend} onChange={setIstJugend} />
                <Haken label="Amtierender Preisrichter" checked={istPreisrichter} onChange={setIstPreisrichter} />
              </div>
              {(schau.data?.teilschauen.length ?? 0) > 0 && (
                <Feld label="Teilschau" className="max-w-md">
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
                <Feld label="Erziehungsberechtigter" hinweis={onlineZustimmung ? "Pflicht für die Veröffentlichung im Internet" : undefined} className="max-w-md">
                  {(id) => <Eingabe id={id} value={erziehungsberechtigter} onChange={(e) => setErziehungsberechtigter(e.target.value)} autoComplete="off" />}
                </Feld>
              )}
            </div>
          </Abschnitt>

          <Abschnitt titel="Tiere">
            {!versionId && <Hinweis ton="warnung" className="mb-4">Für diese Schau ist noch kein Verzeichnis der Rassen und Farbenschläge gewählt (Einstellungen).</Hinweis>}
            <PositionenEditor positionen={positionen} setPositionen={setPositionen} suche={suche} kaefigRegeln={schau.data?.kaefigRegeln} kaefigMasse={schau.data?.kaefigMasse} festgeschrieben={!!schau.data?.katalogGedruckt} />
          </Abschnitt>

          <Abschnitt titel="Eingang">
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
                <Feld label="Eingegangen per">
                  {(id) => (
                    <Auswahl id={id} value={eingang} disabled={!!vorhanden} onChange={(e) => setEingang(e.target.value as typeof eingang)}>
                      <option value="papier">{EINGANG_LABEL.papier}</option>
                      <option value="email">{EINGANG_LABEL.email}</option>
                      <option value="online">{EINGANG_LABEL.online}</option>
                    </Auswahl>
                  )}
                </Feld>
                <Feld label="Bemerkung">{(id) => <Textfeld id={id} rows={2} value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} />}</Feld>
              </div>
              <div className="flex flex-col gap-3 border-t border-linie pt-4">
                <Haken label="Meldebogen ist unterschrieben (AAB und Sonderbestimmungen anerkannt)" checked={zustimmung} onChange={setZustimmung} hinweis="Sonst ohne Namen im Katalog" />
                <Haken label="Widerspruch: im Katalog ohne Namen" checked={widerspruch} onChange={setWiderspruch} hinweis="Art. 21 DSGVO" />
                {!!schau.data?.erklaerungen.trim() && (
                  <Haken
                    label="Pflichterklärungen zur Herkunft abgegeben"
                    checked={erklaerungen}
                    onChange={setErklaerungen}
                    hinweis={schau.data.erklaerungen.split("\n").filter((z) => z.trim()).join(" · ")}
                  />
                )}
                <Haken label="Veröffentlichung im Internet erlaubt" checked={onlineZustimmung} onChange={setOnlineZustimmung} hinweis="Nur bei ausdrücklicher Zustimmung" />
              </div>
            </div>
          </Abschnitt>

          {fehler.length > 0 && (
            <Hinweis ton="fehler">
              <ul className="list-inside list-disc">{fehler.map((f) => <li key={f}>{f}</li>)}</ul>
            </Hinweis>
          )}
          {speichern.error && <Hinweis ton="fehler">{fehlerText(speichern.error)}</Hinweis>}
          <Speicherleiste sichtbar={ungespeichert} laedt={speichern.isPending} knopf="Meldung speichern" onSpeichern={() => formRef.current?.requestSubmit()} />
        </form>

        {vorhanden && <Seitenleiste daten={vorhanden} schauId={schauId} />}
      </div>
    </div>
  );
}

function AusstellerSuche({ schauId, onWahl }: { schauId: number; onWahl: (a: Ausgabe["meldung"]["ausstellerSuche"][number]) => void }) {
  const [q, setQ] = useState("");
  const treffer = trpc.meldung.ausstellerSuche.useQuery({ schauId, q }, { enabled: q.trim().length >= 2 });
  return (
    <div className="flex max-w-xl flex-col gap-2">
      <Feld label="Bekannten Aussteller suchen" hinweis="Name oder Registriernummer">
        {(id) => <Eingabe id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder="z. B. Müller" />}
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
  const m = daten.meldung;
  const neu = () => utils.meldung.invalidate();
  const status = trpc.meldung.statusSetzen.useMutation({ onSuccess: neu, onError: (e) => meldung(fehlerText(e), "fehler") });
  const istAdmin = useIstAdmin();
  const stornieren = trpc.meldung.zahlungStornieren.useMutation({
    onSuccess: () => {
      neu();
      meldung("Zahlung storniert (Gegenbuchung).");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const senden = trpc.meldung.bestaetigungSenden.useMutation({ onSuccess: () => meldung("E-Mail verschickt."), onError: (e) => meldung(fehlerText(e), "fehler") });
  const verfall = trpc.meldung.verfallBuchen.useMutation({
    onSuccess: () => {
      neu();
      meldung("Verfall gebucht.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const { eingabe, bestaetige } = useFrage();
  const offen = gefordertCent(daten.betrag) - daten.betrag.bezahltCent;
  // Storniert oder abgelehnt, aber Geld eingegangen: erstatten oder Verfall – sonst hält es den Abschluss auf.
  const ruht = m.status === "storniert" || m.status === "abgelehnt";
  const nochDa = daten.betrag.bezahltCent - m.verfallenCent;
  const grundFrage = (titel: string, text?: string) => eingabe({ titel, text, feld: "Grund (bitte ohne Personennamen)", mindestens: 3 });

  return (
    <aside className="flex flex-col gap-4">
      <Abschnitt titel="Status" aktionen={<Marke ton={STATUS_TON[m.status]}>{STATUS_LABEL[m.status]}</Marke>}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {(m.status === "offen" || (istAdmin && m.status !== "bestaetigt")) && <Knopf variante="primaer" onClick={() => status.mutate({ id: m.id, status: "bestaetigt" })}>Bestätigen</Knopf>}
            {istAdmin && m.status === "offen" && (
              <Knopf variante="gefahr" onClick={async () => { const g = await grundFrage("Meldung ablehnen"); if (g) status.mutate({ id: m.id, status: "abgelehnt", grund: g }); }}>
                Ablehnen
              </Knopf>
            )}
            {m.status === "bestaetigt" && (
              <Knopf
                onClick={async () => {
                  if (await bestaetige({ titel: "Bestätigung zurücknehmen", text: "Die Meldung steht dann wieder auf „offen“.", knopf: "Zurücknehmen" })) {
                    status.mutate({ id: m.id, status: "offen", grund: "Bestätigung zurückgenommen" });
                  }
                }}
              >
                Bestätigung zurücknehmen
              </Knopf>
            )}
            {istAdmin && m.status === "bestaetigt" && (
              <Knopf variante="gefahr" onClick={async () => { const g = await grundFrage("Meldung stornieren"); if (g) status.mutate({ id: m.id, status: "storniert", grund: g }); }}>
                Stornieren
              </Knopf>
            )}
          </div>
          {m.verfallenCent > 0 && (
            <p className="text-sm text-grau">
              Verfall gebucht: {formatEuro(m.verfallenCent)}
              {m.verfallGrund ? ` – ${m.verfallGrund}` : ""}
            </p>
          )}
          {ruht && nochDa > 0 && (
            <Hinweis ton="warnung" className="flex flex-col items-start gap-2 text-sm">
              <span>
                Für diese {m.status === "storniert" ? "stornierte" : "abgelehnte"} Meldung sind {formatEuro(nochDa)} eingegangen: erstatten oder Verfall buchen.
              </span>
              {istAdmin && (
                <Knopf
                  laedt={verfall.isPending}
                  onClick={async () => {
                    const g = await grundFrage("Verfall buchen", `${formatEuro(nochDa)} behält der Verein.`);
                    if (g) verfall.mutate({ id: m.id, grund: g });
                  }}
                >
                  Verfall buchen …
                </Knopf>
              )}
            </Hinweis>
          )}
        </div>
      </Abschnitt>

      <Abschnitt titel="Meldegeld">
        <div className="flex flex-col gap-4">
          <table className="w-full text-sm">
            <tbody>
              {daten.betrag.zeilen.map((z) => (
                <tr key={z.art}>
                  <td className="py-0.5">{z.anzahl} × {z.label}</td>
                  <td className="py-0.5 text-right">{formatEuro(z.summeCent)}</td>
                </tr>
              ))}
              <tr className="border-t border-linie font-semibold">
                <td className="pt-1.5">Summe</td>
                <td className="pt-1.5 text-right">{formatEuro(daten.betrag.summeCent)}</td>
              </tr>
              {daten.betrag.stiftungCent > 0 && (
                <tr>
                  <td className="py-0.5">+ Ehrenpreisstiftung (zugesagt)</td>
                  <td className="py-0.5 text-right">{formatEuro(daten.betrag.stiftungCent)}</td>
                </tr>
              )}
              {daten.betrag.spendeCent > 0 && (
                <tr>
                  <td className="py-0.5">+ Spende für die Ausstellung (zugesagt)</td>
                  <td className="py-0.5 text-right">{formatEuro(daten.betrag.spendeCent)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold">Zahlungen</h3>
            <ul className="divide-y divide-linie text-sm">
              {daten.zahlungen.map((z) => {
                const storniert = daten.zahlungen.some((x) => x.stornoVon === z.id);
                return (
                  <li key={z.id} className={`flex items-center justify-between gap-2 py-1 ${storniert || z.stornoVon ? "text-grau" : ""}`}>
                    <span className="min-w-0">
                      {datum(z.datum)} · {ZAHLART_LABEL[z.art as Zahlart] ?? "sonstige"}
                      {z.stornoVon ? ` · Storno: ${z.grund}` : z.grund ? ` · ${z.grund}` : ""}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className={storniert ? "line-through" : ""}>{formatEuro(z.betragCent)}</span>
                      {!storniert && !z.stornoVon && istAdmin && (
                        <button
                          type="button"
                          aria-label="Zahlung stornieren"
                          title="Zahlung stornieren"
                          className="rounded p-1 text-grau hover:bg-kamm-hell hover:text-kamm"
                          onClick={async () => {
                            const g = await grundFrage("Zahlung stornieren", "Es wird eine Gegenbuchung erfasst.");
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
              {daten.zahlungen.length === 0 && <li className="py-1 text-grau">Noch keine Zahlung.</li>}
            </ul>
          </div>
          <p className={`font-semibold ${offen > 0 ? "text-kamm" : "text-stall"}`}>{offen > 0 ? `Offen: ${formatEuro(offen)}` : "Vollständig bezahlt"}</p>
          <ZahlungErfassen meldungId={m.id} vorschlag={Math.max(offen, 0)} />
        </div>
      </Abschnitt>

      <Abschnitt titel="Für den Aussteller">
        <div className="flex flex-col items-start gap-3 text-sm">
          <a href={`/datei/${schauId}/a-bogen.pdf?meldung=${m.id}`} target="_blank" rel="noreferrer">A-Bogen zum Unterschreiben (PDF)</a>
          <a href={`/datei/${schauId}/aussteller.pdf?meldung=${m.id}`} target="_blank" rel="noreferrer">B-Bogen und Ringkarten (PDF)</a>
          <a href={daten.link} target="_blank" rel="noreferrer">Seite „Meine Meldung“</a>
          <Knopf onClick={() => senden.mutate({ id: m.id })} laedt={senden.isPending} disabled={!daten.aussteller.email}>
            Eingangsbestätigung mailen
          </Knopf>
        </div>
      </Abschnitt>
    </aside>
  );
}

function ZahlungErfassen({ meldungId, vorschlag }: { meldungId: number; vorschlag: number }) {
  const [betrag, setBetrag] = useState("");
  const [tag, setTag] = useState(heuteIso());
  const istAdmin = useIstAdmin();
  // Helfer buchen nur Bargeld an der Kasse; Kontoeingänge und Erstattungen bucht die Ausstellungsleitung.
  const [art, setArt] = useState<"ueberweisung" | "bar" | "sonstige">(istAdmin ? "ueberweisung" : "bar");
  useEffect(() => setBetrag(vorschlag ? (vorschlag / 100).toFixed(2).replace(".", ",") : ""), [vorschlag]);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe } = useFrage();
  const erfassen = trpc.meldung.zahlungErfassen.useMutation({
    onSuccess: (r) => {
      utils.meldung.invalidate();
      meldung(r.bestaetigt ? "Zahlung erfasst – Meldung ist jetzt bestätigt." : "Zahlung erfasst.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const cent = parseEuro(betrag);
        if (cent == null || cent === 0) return meldung("Betrag ungültig.", "fehler");
        let grund = "";
        if (cent < 0 && !istAdmin) return meldung("Erstattungen bucht die Ausstellungsleitung.", "fehler");
        if (cent < 0) {
          grund = (await eingabe({ titel: "Erstattung", text: "Negativer Betrag = Erstattung an den Aussteller.", feld: "Grund (bitte ohne Personennamen)", mindestens: 3 })) ?? "";
          if (!grund) return;
        }
        erfassen.mutate({ meldungId, betragCent: cent, datum: tag, art, grund });
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <Eingabe aria-label="Betrag in Euro" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="Betrag" />
        <Eingabe aria-label="Datum" type="date" value={tag} onChange={(e) => setTag(e.target.value)} />
      </div>
      <Auswahl aria-label="Zahlart" value={art} onChange={(e) => setArt(e.target.value as typeof art)}>
        {istAdmin && <option value="ueberweisung">Überweisung</option>}
        <option value="bar">bar</option>
        {istAdmin && <option value="sonstige">sonstige</option>}
      </Auswahl>
      <Knopf type="submit" laedt={erfassen.isPending}>Zahlung erfassen</Knopf>
    </form>
  );
}
