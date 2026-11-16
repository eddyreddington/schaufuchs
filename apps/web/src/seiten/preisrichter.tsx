import { useState, type FormEvent } from "react";
import { serverText } from "@schau/domain";
import { fehlerText } from "../lib";
import { useOberflaeche, useSprache } from "../sprache";
import { useSchauId } from "../rahmen";
import { useIstAdmin } from "../rolle";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Auswahl, Dialog, Eingabe, FehlerAnzeige, Feld, Haken, Hinweis, Knopf, knopfKlasse, Laden, Leer, Marke, SEITE, Seitenkopf, Speicherleiste, TabellenRahmen, useFrage, useMeldung, useUngespeichertWarnung } from "../ui";

type Richter = Ausgabe["preisrichter"]["liste"]["richter"][number];

/** Ruhige Textknöpfe für Aktionen in Tabellenzeilen. */
const ZEILE = "min-h-8 px-2 text-sm";

export function Preisrichter() {
  const t = useOberflaeche();
  const tx = t.preisrichter.seite;
  const schauId = useSchauId();
  const istAdmin = useIstAdmin();
  const daten = trpc.preisrichter.liste.useQuery({ schauId });
  const schau = trpc.schau.get.useQuery({ id: schauId });
  const [bearbeiten, setBearbeiten] = useState<Partial<Richter> | null>(null);
  const [pin, setPin] = useState<{ name: string; pin: string } | null>(null);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const pinErzeugen = trpc.preisrichter.pinErzeugen.useMutation({ onSuccess: () => utils.preisrichter.liste.invalidate(), onError: (e) => meldung(fehlerText(e), "fehler") });
  const entsperren = trpc.preisrichter.sperreAufheben.useMutation({
    onSuccess: async () => {
      await utils.preisrichter.liste.invalidate();
      meldung(tx.sperreAufgehoben);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const loeschen = trpc.preisrichter.loeschen.useMutation({ onSuccess: () => utils.preisrichter.liste.invalidate(), onError: (e) => meldung(fehlerText(e), "fehler") });

  if (daten.error) return <FehlerAnzeige fehler={daten.error} nochmal={() => daten.refetch()} />;
  if (daten.isLoading || !daten.data) return <Laden />;
  const { richter, nummeriert, ohneZuteilung } = daten.data;
  const tiere = richter.reduce((n, r) => n + r.tiere, 0);
  const bewertet = richter.reduce((n, r) => n + r.bewertet, 0);
  const tabletLink = schau.data ? `${window.location.origin}/richter/${schau.data.slug}` : null;

  return (
    <div className={SEITE}>
      <Seitenkopf
        titel={t.allgemein.preisrichter}
        unter={richter.length ? tx.unter(richter.length, tiere, bewertet) : undefined}
        hilfe="preisrichter-anlegen"
        aktionen={istAdmin && <Knopf variante="primaer" onClick={() => setBearbeiten({})}>{tx.hinzufuegen}</Knopf>}
      />
      {richter.length === 0 ? (
        <Leer titel={tx.leer} />
      ) : (
        <TabellenRahmen
          fuss={
            <>
              <span>{tx.anzahl(richter.length)}{ohneZuteilung > 0 && <span className="font-semibold text-kamm">{tx.ohneZuteilung(ohneZuteilung)}</span>}</span>
              {tabletLink && (
                <span className="min-w-0 break-all">
                  {tx.tablet}{" "}
                  <a href={tabletLink} target="_blank" rel="noreferrer">
                    {tabletLink}
                  </a>
                </span>
              )}
            </>
          }
        >
          <table className="tabelle">
            <thead>
              <tr>
                <th>{t.allgemein.name}</th>
                <th>{tx.bereich}</th>
                <th className="text-right">{t.allgemein.tiere}</th>
                <th className="text-right">{tx.bewertet}</th>
                <th>{tx.tabletSpalte}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {richter.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="flex flex-wrap items-center gap-2">
                      {istAdmin ? (
                        <button type="button" className="text-left font-semibold text-tinte hover:text-band hover:underline" onClick={() => setBearbeiten(r)}>
                          {r.name}
                        </button>
                      ) : (
                        <span className="font-semibold text-tinte">{r.name}</span>
                      )}
                      {r.istObmann && <Marke ton="info">{tx.obmann}</Marke>}
                    </span>
                    <span className="block text-sm text-grau">{[r.sparten.length ? tx.bewertetSparten(r.sparten.join(", ")) : tx.alleSparten, r.telefon, r.email].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className="nummer whitespace-nowrap">{r.einteilung.map((e) => `${e.vonNr}–${e.bisNr}`).join(", ") || <span className="font-sans font-normal text-grau">–</span>}</td>
                  <td className="text-right tabular-nums">{r.tiere}</td>
                  <td className="text-right tabular-nums">{r.bewertet}</td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {r.hatPin ? <Marke ton="ok">{tx.pinGesetzt}</Marke> : <Marke ton="warnung">{tx.keinePin}</Marke>}
                      {r.pinWartet && <Marke ton="warnung">{tx.wartezeit}</Marke>}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-0.5">
                      {/* Auch ohne Wartezeit: die Sperre je Adresse oder Gerät sieht man dem Preisrichter nicht an. */}
                      {istAdmin && r.hatPin && <Knopf variante="leise" className={ZEILE} onClick={() => entsperren.mutate({ schauId, id: r.id })}>{tx.sperreAufheben}</Knopf>}
                      {istAdmin && (
                        <Knopf
                          variante="leise"
                          className={ZEILE}
                          onClick={async () => {
                            // Eine neue PIN meldet alle Tablets dieses Preisrichters ab – wartende Bewertungen bleiben im Gerät.
                            if (
                              r.hatPin &&
                              !(await bestaetige({
                                titel: tx.neuePinFrage(r.name),
                                text: tx.neuePinText(r.name),
                                knopf: tx.neuePinErzeugen,
                              }))
                            )
                              return;
                            pinErzeugen.mutate({ schauId, id: r.id }, { onSuccess: (x) => setPin({ name: r.name, pin: x.pin }) });
                          }}
                        >
                          {r.hatPin ? tx.neuePin : tx.pinErzeugen}
                        </Knopf>
                      )}
                      <a href={`/datei/${schauId}/preisrichter/${r.id}/liste.pdf`} target="_blank" rel="noreferrer" className={knopfKlasse("leise", false, ZEILE)}>{tx.liste}</a>
                      <a href={`/datei/${schauId}/bewertungskarten.pdf?preisrichter=${r.id}`} target="_blank" rel="noreferrer" className={knopfKlasse("leise", false, ZEILE)}>{tx.karten}</a>
                      {istAdmin && (
                        <>
                          <Knopf variante="leise" className={ZEILE} onClick={() => setBearbeiten(r)}>{t.allgemein.bearbeiten}</Knopf>
                          <Knopf
                            variante="leise"
                            className={`${ZEILE} text-grau hover:bg-kamm-hell hover:text-kamm`}
                            onClick={async () => (await bestaetige({ titel: tx.loeschenFrage(r.name), knopf: t.allgemein.loeschen, gefahr: true })) && loeschen.mutate({ schauId, id: r.id })}
                            aria-label={tx.loeschenLabel(r.name)}
                          >
                            ✕
                          </Knopf>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabellenRahmen>
      )}

      {richter.length > 0 && istAdmin && <EinteilungNachRassen schauId={schauId} richter={richter} />}
      {richter.length > 0 && istAdmin && (
        // Neu aufbauen, wenn sich die gespeicherten Bereiche ändern (z. B. durch die Einteilung nach Rassen).
        <Einteilung key={JSON.stringify(richter.map((r) => [r.id, r.einteilung.map((e) => [e.vonNr, e.bisNr])]))} schauId={schauId} richter={richter} nummeriert={nummeriert} ohneZuteilung={ohneZuteilung} />
      )}

      <Dialog offen={bearbeiten != null} onSchliessen={() => setBearbeiten(null)} titel={bearbeiten?.id ? tx.bearbeitenTitel : tx.hinzufuegen}>
        {bearbeiten && <RichterForm schauId={schauId} versionId={schau.data?.stammdatenVersionId ?? null} start={bearbeiten} fertig={() => setBearbeiten(null)} />}
      </Dialog>
      <Dialog offen={pin != null} onSchliessen={() => setPin(null)} titel={tx.pinFuer(pin?.name ?? "")}>
        <p className="nummer text-center text-6xl tracking-[0.2em]">{pin?.pin}</p>
        <p className="mt-4 text-center text-grau">{tx.pinNotieren}</p>
      </Dialog>
    </div>
  );
}

function RichterForm({ schauId, versionId, start, fertig }: { schauId: number; versionId: number | null; start: Partial<Richter>; fertig: () => void }) {
  const t = useOberflaeche();
  const tx = t.preisrichter.form;
  const [r, setR] = useState({ name: start.name ?? "", anschrift: start.anschrift ?? "", email: start.email ?? "", telefon: start.telefon ?? "", istObmann: start.istObmann ?? false, sparten: start.sparten ?? [], anschriftImKatalog: start.anschriftImKatalog ?? false });
  // Sparten aus dem Verzeichnis der Schau; dazu gespeicherte, die es dort nicht (mehr) gibt, damit sie nicht still verschwinden.
  const gliederung = trpc.stammdaten.gliederung.useQuery({ versionId: versionId ?? 0 }, { enabled: versionId != null });
  const sparten = [...new Set([...(gliederung.data?.sparten.map((x) => x.name) ?? []), ...r.sparten])];
  const utils = trpc.useUtils();
  const speichern = trpc.preisrichter.speichern.useMutation({ onSuccess: () => { utils.preisrichter.liste.invalidate(); fertig(); } });
  const senden = (e: FormEvent) => {
    e.preventDefault();
    speichern.mutate({ schauId, id: start.id, ...r });
  };
  return (
    <form onSubmit={senden} className="flex flex-col gap-4">
      <Feld label={t.allgemein.name}>{(id) => <Eingabe id={id} value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} required autoFocus />}</Feld>
      <Feld label={tx.anschrift}>{(id) => <Eingabe id={id} value={r.anschrift} onChange={(e) => setR({ ...r, anschrift: e.target.value })} />}</Feld>
      <Haken
        label={tx.anschriftImKatalog}
        hinweis={tx.anschriftHinweis}
        checked={r.anschriftImKatalog}
        onChange={(v) => setR({ ...r, anschriftImKatalog: v })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Feld label={tx.telefon}>{(id) => <Eingabe id={id} value={r.telefon} onChange={(e) => setR({ ...r, telefon: e.target.value })} />}</Feld>
        <Feld label={tx.email}>{(id) => <Eingabe id={id} type="email" value={r.email} onChange={(e) => setR({ ...r, email: e.target.value })} />}</Feld>
      </div>
      <Haken label={t.preisrichter.seite.obmann} hinweis={tx.obmannHinweis} checked={r.istObmann} onChange={(v) => setR({ ...r, istObmann: v })} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">
          {tx.sparten} <span className="font-normal text-grau">{tx.spartenLeer}</span>
        </legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {sparten.map((sp) => (
            <Haken key={sp} label={sp} checked={r.sparten.includes(sp)} onChange={(v) => setR({ ...r, sparten: v ? [...r.sparten, sp] : r.sparten.filter((x) => x !== sp) })} />
          ))}
        </div>
      </fieldset>
      {speichern.error && <Hinweis ton="fehler">{fehlerText(speichern.error)}</Hinweis>}
      <div className="flex justify-end">
        <Knopf type="submit" variante="primaer" laedt={speichern.isPending}>{t.allgemein.speichern}</Knopf>
      </div>
    </form>
  );
}

function Einteilung({ schauId, richter, nummeriert, ohneZuteilung }: { schauId: number; richter: Richter[]; nummeriert: number; ohneZuteilung: number }) {
  const t = useOberflaeche();
  const sprache = useSprache();
  const te = t.preisrichter.einteilung;
  const tx = te.nummern;
  const nachRassen = trpc.preisrichter.zuteilung.useQuery({ schauId });
  const mitRassen = (nachRassen.data?.regeln.length ?? 0) > 0;
  const start = () => richter.flatMap((r) => r.einteilung.map((e) => ({ preisrichterId: r.id, von: String(e.vonNr), bis: String(e.bisNr) })));
  const [zeilen, setZeilen] = useState(start);
  // Verglichen mit der gespeicherten Einteilung (nach dem Speichern lädt die Liste neu) – so, wie sie gespeichert wird:
  // ohne leere Zeilen, als Zahlen, nach Nummer sortiert (die Liste kommt nach Namen sortiert zurück).
  const normal = (z: typeof zeilen) =>
    JSON.stringify(
      z
        .filter((x) => x.von && x.bis)
        .map((x) => [x.preisrichterId, Number(x.von), Number(x.bis)])
        .sort((a, b) => a[1]! - b[1]! || a[0]! - b[0]!),
    );
  const geaendert = normal(zeilen) !== normal(start());
  useUngespeichertWarnung(() => geaendert);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const vorschlag = trpc.preisrichter.einteilungVorschlagen.useQuery({ schauId }, { enabled: false });
  const speichern = trpc.preisrichter.einteilungSetzen.useMutation({
    onSuccess: () => {
      utils.preisrichter.liste.invalidate();
      utils.preisrichter.zuteilung.invalidate();
      meldung(te.gespeichert);
    },
    onError: (e, eingabe) => {
      // Wechseln schon bewertete Tiere den Preisrichter, erst nachfragen: Kontingent und Preise gehen mit.
      if (e.data?.code === "CONFLICT" && !eingabe.bestaetigt) {
        void bestaetige({ titel: te.trotzdemFrage, text: `${serverText(e.message, sprache)}\n\n${te.uebergang}`, knopf: t.allgemein.speichern }).then(
          (ja) => ja && speichern.mutate({ ...eingabe, bestaetigt: true }),
        );
        return;
      }
      meldung(fehlerText(e), "fehler");
    },
  });
  const [fehlend, setFehlend] = useState<string[]>([]);
  const speichernNummern = async () =>
    (!mitRassen ||
      (await bestaetige({
        titel: tx.speichernFrage,
        text: tx.speichernText,
        knopf: t.allgemein.speichern,
      }))) &&
    speichern.mutate({ schauId, einteilung: zeilen.filter((z) => z.von && z.bis).map((z) => ({ preisrichterId: z.preisrichterId, vonNr: Number(z.von), bisNr: Number(z.bis) })) });
  const vorschlagen = async () => {
    const r = await vorschlag.refetch();
    if (r.data) {
      setZeilen(r.data.einteilung.map((x) => ({ preisrichterId: x.preisrichterId, von: String(x.vonNr), bis: String(x.bisNr) })));
      setFehlend(r.data.fehlend);
    }
  };
  return (
    <Abschnitt
      id="einteilung-nummern"
      titel={tx.titel}
      aktionen={
        <div className="flex flex-wrap items-center gap-2">
          {mitRassen && nummeriert > 0 && <Marke ton="info">{tx.folgtRassen}</Marke>}
          <Knopf onClick={vorschlagen} disabled={nummeriert === 0}>
            {te.verteilen}
          </Knopf>
        </div>
      }
    >
      {nummeriert === 0 ? (
        <p className="text-sm text-grau">{tx.keineNummern}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-grau">
            {tx.imKatalog(nummeriert)}{ohneZuteilung > 0 && <span className="font-semibold text-kamm">{tx.davonOhne(ohneZuteilung)}</span>}
          </p>
          {fehlend.length > 0 && <Hinweis ton="warnung">{te.keinRichterFuer(fehlend.map((f) => serverText(f, sprache)).join(", "))}</Hinweis>}
          <table className="tabelle max-w-2xl">
            <thead>
              <tr>
                <th>{t.allgemein.preisrichter}</th>
                <th className="text-right">{tx.vonNr}</th>
                <th className="text-right">{tx.bisNr}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z, i) => (
                <tr key={i}>
                  <td>
                    <Auswahl
                      aria-label={t.allgemein.preisrichter}
                      value={z.preisrichterId}
                      onChange={(e) => setZeilen(zeilen.map((x, j) => (j === i ? { ...x, preisrichterId: Number(e.target.value) } : x)))}
                    >
                      {richter.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Auswahl>
                  </td>
                  <td><Eingabe aria-label={tx.von} type="number" className="w-24 text-right tabular-nums" value={z.von} onChange={(e) => setZeilen(zeilen.map((x, j) => (j === i ? { ...x, von: e.target.value } : x)))} /></td>
                  <td><Eingabe aria-label={tx.bis} type="number" className="w-24 text-right tabular-nums" value={z.bis} onChange={(e) => setZeilen(zeilen.map((x, j) => (j === i ? { ...x, bis: e.target.value } : x)))} /></td>
                  <td className="text-right"><Knopf variante="leise" className={`${ZEILE} text-grau hover:bg-kamm-hell hover:text-kamm`} aria-label={tx.zeileEntfernen} onClick={() => setZeilen(zeilen.filter((_, j) => j !== i))}>✕</Knopf></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-2">
            <Knopf onClick={() => setZeilen([...zeilen, { preisrichterId: richter[0]!.id, von: "", bis: "" }])}>{tx.bereichHinzufuegen}</Knopf>
          </div>
        </div>
      )}
      <Speicherleiste sichtbar={geaendert} onVerwerfen={() => { setZeilen(start()); setFehlend([]); }} onSpeichern={speichernNummern} laedt={speichern.isPending} text={tx.geaendert} knopf={tx.speichernKnopf} />
    </Abschnitt>
  );
}

type Wahl = number | "";
const schl = (sparte: string, rasse: string, farbe = "") => JSON.stringify([sparte, rasse, farbe]);

/**
 * Einteilung nach Rassen: je Rasse ein Preisrichter, eine große Rasse auch je Farbenschlag geteilt. Vor dem Vergeben der
 * Katalognummern; die Bereiche nach Nummern rechnet die Software daraus.
 */
function EinteilungNachRassen({ schauId, richter }: { schauId: number; richter: Richter[] }) {
  const t = useOberflaeche();
  const sprache = useSprache();
  const te = t.preisrichter.einteilung;
  const tx = te.rassen;
  const daten = trpc.preisrichter.zuteilung.useQuery({ schauId });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const ausRegeln = (regeln: { preisrichterId: number; sparte: string; rasse: string; farbenschlag: string }[]) =>
    Object.fromEntries(regeln.map((x) => [schl(x.sparte, x.rasse, x.farbenschlag), x.preisrichterId as Wahl]));
  const [wahl, setWahl] = useState<Record<string, Wahl> | null>(null);
  const [offen, setOffen] = useState<Set<string> | null>(null);
  const [fehlend, setFehlend] = useState<string[]>([]);
  const gespeichert = daten.data ? ausRegeln(daten.data.regeln) : {};
  const aktuell = wahl ?? gespeichert;
  const normal = (w: Record<string, Wahl>) => JSON.stringify(Object.entries(w).filter(([, v]) => v !== "").sort());
  const geaendert = wahl != null && normal(wahl) !== normal(gespeichert);
  useUngespeichertWarnung(() => geaendert);
  const vorschlag = trpc.preisrichter.zuteilungVorschlagen.useQuery({ schauId }, { enabled: false });
  const speichern = trpc.preisrichter.zuteilungSetzen.useMutation({
    onSuccess: (x) => {
      setWahl(null);
      setOffen(null);
      utils.preisrichter.zuteilung.invalidate();
      utils.preisrichter.liste.invalidate();
      const zusatz = [x.ohne ? tx.tiereOhne(x.ohne) : "", x.abweichend.length ? tx.nachmeldungen(x.abweichend.join(", ")) : ""].filter(Boolean).join("; ");
      meldung(x.bereiche ? `${tx.gespeichertBereiche}${zusatz ? ` ${zusatz}.` : ""}` : tx.gespeichertOhneBereiche);
    },
    onError: (e, eingabe) => {
      if (e.data?.code === "CONFLICT" && !eingabe.bestaetigt) {
        void bestaetige({ titel: te.trotzdemFrage, text: `${serverText(e.message, sprache)}\n\n${te.uebergang}`, knopf: t.allgemein.speichern }).then(
          (ja) => ja && speichern.mutate({ ...eingabe, bestaetigt: true }),
        );
        return;
      }
      meldung(fehlerText(e), "fehler");
    },
  });
  if (daten.error) return <FehlerAnzeige fehler={daten.error} nochmal={() => daten.refetch()} />;
  if (!daten.data) return <Laden />;
  const { gruppen } = daten.data;
  // Aufgeklappt: die Rassen mit eigener Einteilung je Farbenschlag (sonst sähe man die Aufteilung nicht).
  const mitFarben = (regeln: { sparte: string; rasse: string; farbenschlag: string }[]) => new Set(regeln.filter((x) => x.farbenschlag).map((x) => schl(x.sparte, x.rasse)));
  const auf = offen ?? mitFarben(daten.data.regeln);
  const setze = (k: string, v: Wahl) => setWahl({ ...aktuell, [k]: v });
  /** Preisrichter eines Farbenschlags: eigene Wahl, sonst der der Rasse. */
  const fuer = (g: (typeof gruppen)[number], farbe: string) => {
    const f = aktuell[schl(g.sparte, g.rasse, farbe)];
    return farbe && f !== undefined && f !== "" ? f : (aktuell[schl(g.sparte, g.rasse)] ?? "");
  };
  const last = new Map<number, number>();
  let ohne = 0;
  for (const g of gruppen)
    for (const f of g.farben) {
      const r = fuer(g, f.farbenschlag);
      if (r === "") ohne += f.anzahl;
      else last.set(r, (last.get(r) ?? 0) + f.anzahl);
    }
  const sparten = [...new Set(gruppen.map((g) => g.sparte))];
  const speichernRassen = () =>
    speichern.mutate({
      schauId,
      regeln: Object.entries(aktuell)
        .filter(([, v]) => v !== "")
        .map(([k, v]) => {
          const [sparte, rasse, farbenschlag] = JSON.parse(k) as [string, string, string];
          return { preisrichterId: v as number, sparte, rasse, farbenschlag };
        }),
    });
  const verwerfen = () => {
    setWahl(null);
    setFehlend([]);
    setOffen(null);
  };
  const vorschlagen = async () => {
    const r = await vorschlag.refetch();
    if (!r.data) return;
    setWahl(ausRegeln(r.data.regeln));
    setOffen(mitFarben(r.data.regeln));
    setFehlend(r.data.fehlend);
  };
  const auswahl = (sparte: string, wert: Wahl, aendern: (v: Wahl) => void, leer: string, label: string) => (
    <Auswahl kompakt aria-label={label} value={wert} onChange={(e) => aendern(e.target.value === "" ? "" : Number(e.target.value))}>
      <option value="">{leer}</option>
      {richter
        .filter((r) => !r.sparten.length || r.sparten.includes(sparte) || r.id === wert)
        .map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
    </Auswahl>
  );
  return (
    <Abschnitt
      id="einteilung-rassen"
      titel={tx.titel}
      aktionen={
        <Knopf onClick={vorschlagen} disabled={!gruppen.length} laedt={vorschlag.isFetching}>
          {te.verteilen}
        </Knopf>
      }
    >
      {!gruppen.length ? (
        <p className="text-sm text-grau">{tx.keineTiere}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {fehlend.length > 0 && <Hinweis ton="warnung">{te.keinRichterFuer(fehlend.map((f) => serverText(f, sprache)).join(", "))}</Hinweis>}
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-grau">
            {richter.map((r) => (
              <span key={r.id}>
                {r.name} <span className="font-semibold tabular-nums text-tinte">{last.get(r.id) ?? 0}</span>
              </span>
            ))}
            {ohne > 0 && (
              <span className="font-semibold text-kamm">
                {tx.ohnePreisrichter} <span className="tabular-nums">{ohne}</span>
              </span>
            )}
          </p>
          <div className="flex flex-col gap-4">
            {sparten.map((sp) => (
              <table key={sp} className="tabelle max-w-3xl">
                <thead>
                  <tr>
                    <th>{sp || tx.ohneSparte}</th>
                    <th className="text-right">{t.allgemein.tiere}</th>
                    <th className="w-64">{t.allgemein.preisrichter}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {gruppen
                    .filter((g) => g.sparte === sp)
                    .flatMap((g) => {
                      const k = schl(g.sparte, g.rasse);
                      const istAuf = auf.has(k);
                      const zeilen = [
                        <tr key={k}>
                          <td className="font-semibold text-tinte">{g.rasse}</td>
                          <td className="text-right tabular-nums">{g.anzahl}</td>
                          <td>{auswahl(g.sparte, aktuell[k] ?? "", (v) => setze(k, v), tx.keiner, tx.richterFuer(g.rasse))}</td>
                          <td className="text-right">
                            {g.farben.length > 1 && (
                              <Knopf variante="leise" className={ZEILE} onClick={() => setOffen(new Set(istAuf ? [...auf].filter((x) => x !== k) : [...auf, k]))} aria-expanded={istAuf}>
                                {istAuf ? tx.zuklappen : tx.farbenschlaege}
                              </Knopf>
                            )}
                          </td>
                        </tr>,
                      ];
                      if (istAuf)
                        for (const f of g.farben) {
                          const fk = schl(g.sparte, g.rasse, f.farbenschlag);
                          zeilen.push(
                            <tr key={fk}>
                              <td className="pl-8 text-grau">{f.farbenschlag || tx.ohneFarbenschlag}</td>
                              <td className="text-right tabular-nums">{f.anzahl}</td>
                              <td>{f.farbenschlag ? auswahl(g.sparte, aktuell[fk] ?? "", (v) => setze(fk, v), tx.wieRasse, tx.richterFuer(`${g.rasse} ${f.farbenschlag}`)) : <span className="text-grau">{tx.wieRasse}</span>}</td>
                              <td />
                            </tr>,
                          );
                        }
                      return zeilen;
                    })}
                </tbody>
              </table>
            ))}
          </div>
        </div>
      )}
      <Speicherleiste sichtbar={geaendert} onVerwerfen={verwerfen} onSpeichern={speichernRassen} laedt={speichern.isPending} text={tx.geaendert} knopf={tx.speichernKnopf} />
    </Abschnitt>
  );
}
