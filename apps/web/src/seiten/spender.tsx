import { sammelbestaetigung, SPENDE_WEG_LABEL, spenderName } from "@schau/domain";
import { useState, type FormEvent } from "react";
import { datum, fehlerText, formatEuro } from "../lib";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Eingabe, FehlerAnzeige, Feld, Haken, Knopf, Laden, Leer, Marke, SEITE, Seitenkopf, Speicherleiste, Suchfeld, Textfeld, useAenderungenWarnen, useFrage, useMeldung } from "../ui";

type Details = Ausgabe["spenden"]["spenderDetails"];

/** Spenderverzeichnis des Vereins (/spender): Anschrift, Einwilligung zur Nennung, Spenden und Zuwendungsbestätigungen. */
export function SpenderSeite() {
  const [q, setQ] = useState("");
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const liste = trpc.spenden.spender.useQuery({ q });
  return (
    <div className={SEITE}>
      <Seitenkopf titel="Spender" hilfe="spenderverzeichnis" />
      <div className="grid items-start gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Abschnitt>
          <Suchfeld value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name oder Ort" aria-label="Spender suchen" className="mb-3 max-w-none" />
          {liste.error ? (
            <FehlerAnzeige fehler={liste.error} />
          ) : !liste.data ? (
            <Laden />
          ) : liste.data.length === 0 ? (
            <Leer titel="Noch kein Spender">Spender entstehen beim Erfassen einer Spende in einer Schau.</Leer>
          ) : (
            <ul className="divide-y divide-linie">
              {liste.data.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => setGewaehlt(s.id)} className={`w-full px-2 py-1.5 text-left ${gewaehlt === s.id ? "bg-papier font-semibold" : "hover:bg-papier"}`}>
                    {spenderName(s)}
                    <span className="block text-sm font-normal text-grau">{[s.plz, s.ort].filter(Boolean).join(" ") || "ohne Anschrift"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Abschnitt>
        {gewaehlt ? <SpenderDetails key={gewaehlt} id={gewaehlt} /> : <Leer titel="Spender wählen" />}
      </div>
    </div>
  );
}

function SpenderDetails({ id }: { id: number }) {
  const q = trpc.spenden.spenderDetails.useQuery({ spenderId: id });
  if (q.error) return <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />;
  if (!q.data) return <Laden />;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <SpenderBearbeiten key={JSON.stringify(q.data.spender)} s={q.data.spender} />
      <SpendenUndBestaetigungen d={q.data} />
    </div>
  );
}

function SpenderBearbeiten({ s }: { s: Details["spender"] }) {
  const start = { istFirma: s.istFirma, vorname: s.vorname, nachname: s.nachname, strasse: s.strasse, plz: s.plz, ort: s.ort, email: s.email, nennungName: s.nennungName, nennungBetrag: s.nennungBetrag, notiz: s.notiz };
  const [d, setD] = useState(start);
  const gespeichert = useAenderungenWarnen(d);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const speichern = trpc.spenden.spenderSpeichern.useMutation({
    onSuccess: async () => {
      gespeichert();
      await Promise.all([utils.spenden.spenderDetails.invalidate({ spenderId: s.id }), utils.spenden.spender.invalidate()]);
      meldung("Spender gespeichert.");
    },
  });
  const setze = (teil: Partial<typeof d>) => setD({ ...d, ...teil });
  const senden = (e?: FormEvent) => {
    e?.preventDefault();
    speichern.mutate({ id: s.id, daten: d });
  };
  return (
    <Abschnitt titel={spenderName(s)}>
      <form onSubmit={senden} className="grid gap-3 md:grid-cols-2">
        {!d.istFirma && <Feld label="Vorname">{(fid) => <Eingabe id={fid} value={d.vorname} maxLength={80} onChange={(e) => setze({ vorname: e.target.value })} />}</Feld>}
        <Feld label={d.istFirma ? "Name der Firma" : "Nachname"} className={d.istFirma ? "md:col-span-2" : undefined}>
          {(fid) => <Eingabe id={fid} value={d.nachname} maxLength={120} required onChange={(e) => setze({ nachname: e.target.value })} />}
        </Feld>
        <Feld label="Straße und Hausnummer" className="md:col-span-2">{(fid) => <Eingabe id={fid} value={d.strasse} maxLength={120} onChange={(e) => setze({ strasse: e.target.value })} />}</Feld>
        <Feld label="PLZ">{(fid) => <Eingabe id={fid} value={d.plz} maxLength={10} onChange={(e) => setze({ plz: e.target.value })} />}</Feld>
        <Feld label="Ort">{(fid) => <Eingabe id={fid} value={d.ort} maxLength={80} onChange={(e) => setze({ ort: e.target.value })} />}</Feld>
        <Feld label="E-Mail">{(fid) => <Eingabe id={fid} type="email" value={d.email} maxLength={200} onChange={(e) => setze({ email: e.target.value })} />}</Feld>
        <Feld label="Notiz">{(fid) => <Textfeld id={fid} rows={1} value={d.notiz} maxLength={1000} onChange={(e) => setze({ notiz: e.target.value })} />}</Feld>
        <div className="flex flex-col gap-2 md:col-span-2">
          <Haken label="Darf im gedruckten Katalog als Spender genannt werden" checked={d.nennungName} onChange={(w) => setze({ nennungName: w, nennungBetrag: w && d.nennungBetrag })} />
          {d.nennungName && <Haken label="… auch mit Betrag" checked={d.nennungBetrag} onChange={(w) => setze({ nennungBetrag: w })} />}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 md:col-span-2">
          {speichern.error && <p role="alert" className="mr-auto text-sm font-semibold text-kamm">{fehlerText(speichern.error)}</p>}
          <Knopf type="submit" variante="primaer" laedt={speichern.isPending}>
            Speichern
          </Knopf>
        </div>
      </form>
      <Speicherleiste sichtbar={JSON.stringify(d) !== JSON.stringify(start)} onVerwerfen={() => setD(start)} onSpeichern={() => senden()} laedt={speichern.isPending} knopf="Spender speichern" />
    </Abschnitt>
  );
}

function SpendenUndBestaetigungen({ d }: { d: Details }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe } = useFrage();
  const neu = () => Promise.all([utils.spenden.spenderDetails.invalidate({ spenderId: d.spender.id }), utils.spenden.liste.invalidate()]);
  const sammel = trpc.spenden.sammelbestaetigen.useMutation({
    onSuccess: async (r) => {
      await neu();
      meldung(`Sammelbestätigung Nr. ${r.nummer} ausgestellt.`);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const storno = trpc.spenden.bestaetigungStornieren.useMutation({
    onSuccess: async () => {
      await neu();
      meldung("Zuwendungsbestätigung storniert.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  // Jahre mit Geldspenden, die noch in eine Sammelbestätigung passen.
  const jahre = [...new Set(d.spenden.map((z) => z.datum?.slice(0, 4)).filter((j): j is string => !!j))].sort().reverse();
  const moeglich = jahre.map((j) => ({ jahr: Number(j), s: sammelbestaetigung(d.spenden.map((z) => z.fuerBestaetigung), Number(j)) })).filter((x) => x.s.spenden.length > 0);
  const stornieren = async (b: Details["bestaetigungen"][number]) => {
    const grund = await eingabe({ titel: `Zuwendungsbestätigung Nr. ${b.nummer} stornieren?`, text: "Sie wird ungültig; ihre Spenden lassen sich danach neu bestätigen.", feld: "Grund", mindestens: 3, knopf: "Stornieren", gefahr: true });
    if (grund) storno.mutate({ id: b.id, grund });
  };
  return (
    <>
      <Abschnitt titel="Spenden">
        {d.spenden.length === 0 ? (
          <Leer titel="Noch keine Spende" />
        ) : (
          <ul className="divide-y divide-linie">
            {d.spenden.map((z) => (
              <li key={z.spende.id} className={`flex flex-wrap items-baseline gap-x-4 py-1.5 text-sm ${z.spende.storniertAm ? "text-grau line-through" : ""}`}>
                <span className="w-24 tabular-nums">{z.datum ? datum(z.datum) : "offen"}</span>
                <span className="min-w-0 flex-1">{z.spende.art === "sache" ? `Sache: ${z.spende.sache?.bezeichnung ?? ""}` : `Geld, ${SPENDE_WEG_LABEL[z.spende.weg]}`}</span>
                <span className="tabular-nums">{formatEuro(z.spende.betragCent)}</span>
                <span className="w-28 text-right">{z.bestaetigungNr ? `bestätigt Nr. ${z.bestaetigungNr}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
        {moeglich.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {moeglich.map((m) => (
              <Knopf key={m.jahr} laedt={sammel.isPending && sammel.variables?.jahr === m.jahr} onClick={() => sammel.mutate({ spenderId: d.spender.id, jahr: m.jahr })}>
                Sammelbestätigung {m.jahr} ({m.s.spenden.length} Spenden, {formatEuro(m.s.summeCent)})
              </Knopf>
            ))}
          </div>
        )}
      </Abschnitt>
      <Abschnitt titel="Zuwendungsbestätigungen">
        {d.bestaetigungen.length === 0 ? (
          <Leer titel="Noch keine Bestätigung" />
        ) : (
          <ul className="divide-y divide-linie">
            {d.bestaetigungen.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5 text-sm">
                <a href={`/datei/zuwendungsbestaetigung/${b.id}.pdf`} target="_blank" rel="noreferrer" className="font-semibold">
                  Nr. {b.nummer}
                </a>
                <span className="text-grau">{b.art === "sammel" ? "Sammelbestätigung" : "Einzelbestätigung"} vom {datum(b.createdAt)}</span>
                <span className="ml-auto tabular-nums">{formatEuro(b.betragCent)}</span>
                {b.storniertAm ? (
                  <Marke ton="fehler">storniert</Marke>
                ) : (
                  <Knopf variante="leise" onClick={() => stornieren(b)}>
                    Stornieren
                  </Knopf>
                )}
              </li>
            ))}
          </ul>
        )}
      </Abschnitt>
    </>
  );
}
