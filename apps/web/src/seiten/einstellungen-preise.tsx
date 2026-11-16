import { bindungText, PREIS_ZIELGRUPPE_LABEL, PREIS_ZIELGRUPPEN, type GebuehrArt } from "@schau/domain";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { centZuText, fehlerText, formatEuro, parseEuro } from "../lib";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Auswahl, Dialog, Eingabe, Feld, Hinweis, Knopf, Speicherleiste, useAenderungenWarnen, useFrage, useMeldung, useUngespeichertWarnung } from "../ui";

/* Einstellungen der Schau, Abschnitte „Standgeld und Gebühren“ und „Preise“ (Preisarten mit Formular). */

type Schau = Ausgabe["schau"]["get"];

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

export function Gebuehren({ schau: s }: { schau: Schau }) {
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

export function Preisarten({ schau: s }: { schau: Schau }) {
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
