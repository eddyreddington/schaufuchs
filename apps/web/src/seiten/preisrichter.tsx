import { useState } from "react";
import { serverText } from "@schau/domain";
import { fehlerText } from "../lib";
import { useOberflaeche, useSprache } from "../sprache";
import { useSchauId } from "../rahmen";
import { useIstAdmin } from "../rolle";
import { trpc } from "../trpc";
import { RichterForm, type Richter } from "./preisrichter-form";
import { EinteilungNachRassen } from "./preisrichter-rassen";
import { Abschnitt, Auswahl, Dialog, Eingabe, FehlerAnzeige, Hinweis, Knopf, knopfKlasse, KnopfLink, Laden, Leer, Marke, ReiterLeiste, ReiterTafel, SEITE, Seitenkopf, Speicherleiste, TabellenRahmen, useFrage, useMeldung, useReiter, useUngespeichertWarnung } from "../ui";

/** Ruhige Textknöpfe für Aktionen in Tabellenzeilen. */
const ZEILE = "min-h-8 px-2 text-sm";

/** Reiter der Seite (im Anker der Adresse, z. B. …/preisrichter#einteilung-nummern). */
const REITER = ["liste", "einteilung-rassen", "einteilung-nummern"] as const;

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
  // Reiter: die Liste, und für die Ausstellungsleitung die beiden Einteilungen (erst, wenn es Preisrichter gibt).
  const mitEinteilung = istAdmin && !!daten.data?.richter.length;
  const reiter = mitEinteilung ? REITER : (["liste"] as const);
  const [aktiv, waehlen] = useReiter(reiter);

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
        aktionen={
          <>
            {richter.length > 0 && (
              <KnopfLink href={`/datei/${schauId}/preisrichter-verpflichtung.pdf`} target="_blank" rel="noreferrer" title={tx.verpflichtungTitel}>
                {tx.verpflichtungenAlle}
              </KnopfLink>
            )}
            {istAdmin && <Knopf variante="primaer" onClick={() => setBearbeiten({})}>{tx.hinzufuegen}</Knopf>}
          </>
        }
      />
      {reiter.length > 1 && (
        <ReiterLeiste
          reiter={[
            { id: "liste", label: t.allgemein.preisrichter },
            { id: "einteilung-rassen", label: t.preisrichter.einteilung.rassen.titel },
            { id: "einteilung-nummern", label: t.preisrichter.einteilung.nummern.titel },
          ]}
          aktiv={aktiv}
          waehlen={waehlen}
          label={t.allgemein.bereiche}
        />
      )}
      {/* Ohne Einteilung (Helfer, noch keine Preisrichter) gibt es keine Leiste und also keine Tafel. */}
      <ReiterTafel id="liste" aktiv={aktiv === "liste"} waehlen={waehlen} ohneLeiste={reiter.length === 1}>
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
                        <Marke ton={r.zusage === "zugesagt" ? "ok" : r.zusage === "abgesagt" ? "warnung" : "neutral"}>{tx.zusage[r.zusage]}</Marke>
                      </span>
                      <span className="block text-sm text-grau">
                        {[
                          r.sparten.length ? tx.bewertetSparten(r.sparten.join(", ")) : tx.alleSparten,
                          r.gruppen.length ? tx.bewertetGruppen(r.gruppen.join(", ")) : "",
                          r.obmannId != null ? tx.obmannIst(richter.find((o) => o.id === r.obmannId)?.name ?? "–") : "",
                          r.telefon,
                          r.email,
                        ].filter(Boolean).join(" · ")}
                      </span>
                      {(r.zugesagtFuer || r.vorbehalt) && (
                        <span className="block text-sm text-grau">{[r.zugesagtFuer ? tx.zugesagtFuer(r.zugesagtFuer) : "", r.vorbehalt ? tx.vorbehalt(r.vorbehalt) : ""].filter(Boolean).join(" · ")}</span>
                      )}
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
                        <a href={`/datei/${schauId}/preisrichter-verpflichtung.pdf?preisrichter=${r.id}`} target="_blank" rel="noreferrer" title={tx.verpflichtungTitel} className={knopfKlasse("leise", false, ZEILE)}>{tx.verpflichtung}</a>
                        <a href={`/datei/${schauId}/preisverteilung.pdf?preisrichter=${r.id}`} target="_blank" rel="noreferrer" title={tx.preiseTitel} className={knopfKlasse("leise", false, ZEILE)}>{tx.preise}</a>
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

      </ReiterTafel>
      {mitEinteilung && (
        <>
          <ReiterTafel id="einteilung-rassen" aktiv={aktiv === "einteilung-rassen"} waehlen={waehlen}>
            <EinteilungNachRassen schauId={schauId} richter={richter} />
          </ReiterTafel>
          <ReiterTafel id="einteilung-nummern" aktiv={aktiv === "einteilung-nummern"} waehlen={waehlen}>
            {/* Neu aufbauen, wenn sich die gespeicherten Bereiche ändern (z. B. durch die Einteilung nach Rassen). */}
            <Einteilung key={JSON.stringify(richter.map((r) => [r.id, r.einteilung.map((e) => [e.vonNr, e.bisNr])]))} schauId={schauId} richter={richter} nummeriert={nummeriert} ohneZuteilung={ohneZuteilung} />
          </ReiterTafel>
        </>
      )}

      <Dialog offen={bearbeiten != null} onSchliessen={() => setBearbeiten(null)} titel={bearbeiten?.id ? tx.bearbeitenTitel : tx.hinzufuegen}>
        {bearbeiten && <RichterForm schauId={schauId} versionId={schau.data?.stammdatenVersionId ?? null} start={bearbeiten} richter={richter} fertig={() => setBearbeiten(null)} />}
      </Dialog>
      <Dialog offen={pin != null} onSchliessen={() => setPin(null)} titel={tx.pinFuer(pin?.name ?? "")}>
        <p className="nummer text-center text-6xl tracking-[0.2em]">{pin?.pin}</p>
        <p className="mt-4 text-center text-grau">{tx.pinNotieren}</p>
      </Dialog>
    </div>
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
          {/* Feste Spalten wie bei der Einteilung nach Rassen: Auswahl und Nummernfelder füllen ihre Spalte, Kopf und Feld
              enden bündig, kein Name wird abgeschnitten. */}
          <div className="max-w-2xl overflow-x-auto">
            <table className="tabelle min-w-[36rem] table-fixed [&_td]:align-middle">
              <colgroup>
                <col />
                <col className="w-32" />
                <col className="w-32" />
                <col className="w-14" />
              </colgroup>
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
                        className="w-full"
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
                    <td><Eingabe aria-label={tx.von} type="number" className="w-full text-right tabular-nums" value={z.von} onChange={(e) => setZeilen(zeilen.map((x, j) => (j === i ? { ...x, von: e.target.value } : x)))} /></td>
                    <td><Eingabe aria-label={tx.bis} type="number" className="w-full text-right tabular-nums" value={z.bis} onChange={(e) => setZeilen(zeilen.map((x, j) => (j === i ? { ...x, bis: e.target.value } : x)))} /></td>
                    <td className="text-right"><Knopf variante="leise" className={`${ZEILE} text-grau hover:bg-kamm-hell hover:text-kamm`} aria-label={tx.zeileEntfernen} onClick={() => setZeilen(zeilen.filter((_, j) => j !== i))}>✕</Knopf></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Knopf onClick={() => setZeilen([...zeilen, { preisrichterId: richter[0]!.id, von: "", bis: "" }])}>{tx.bereichHinzufuegen}</Knopf>
          </div>
        </div>
      )}
      <Speicherleiste sichtbar={geaendert} onVerwerfen={() => { setZeilen(start()); setFehlend([]); }} onSpeichern={speichernNummern} laedt={speichern.isPending} text={tx.geaendert} knopf={tx.speichernKnopf} />
    </Abschnitt>
  );
}
