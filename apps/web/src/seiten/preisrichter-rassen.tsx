import { useState } from "react";
import { darfBewerten, richterNachRasse, serverText, type RassenRegel } from "@schau/domain";
import { fehlerText } from "../lib";
import { useOberflaeche, useSprache } from "../sprache";
import { trpc } from "../trpc";
import type { Richter } from "./preisrichter-form";
import { Abschnitt, Auswahl, FehlerAnzeige, HilfeLink, Hinweis, Knopf, Laden, Speicherleiste, useFrage, useMeldung, useUngespeichertWarnung } from "../ui";

/** Ruhige Textknöpfe für Aktionen in Tabellenzeilen. */
const ZEILE = "min-h-8 px-2 text-sm";

type Wahl = number | "";
/** Schlüssel einer Zeile: Sparte, Rasse, Farbenschlag (leer = ganze Rasse) und bei der Jugend der Rasse das Merkmal. */
const schl = (sparte: string, rasse: string, farbe = "", jugend = false) => JSON.stringify(jugend ? [sparte, rasse, farbe, true] : [sparte, rasse, farbe]);

/** Regeln aus der Auswahl (ohne leere Zeilen). */
const alsRegeln = (w: Record<string, Wahl>): RassenRegel[] =>
  Object.entries(w)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => {
      const [sparte, rasse, farbenschlag, jugend] = JSON.parse(k) as [string, string, string, boolean?];
      return { preisrichterId: v as number, sparte, rasse, farbenschlag, ...(jugend ? { jugend: true } : {}) };
    });

/**
 * Einteilung nach Rassen: je Rasse ein Preisrichter, eine große Rasse auch je Farbenschlag geteilt. Vor dem Vergeben der
 * Katalognummern; die Bereiche nach Nummern rechnet die Software daraus. Bei „Jugend separat“ hat die Jugend jeder Rasse
 * eine eigene Zeile („Jugend: Rasse“), leer = wie die Rasse.
 */
export function EinteilungNachRassen({ schauId, richter }: { schauId: number; richter: Richter[] }) {
  const t = useOberflaeche();
  const sprache = useSprache();
  const te = t.preisrichter.einteilung;
  const tx = te.rassen;
  const daten = trpc.preisrichter.zuteilung.useQuery({ schauId });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const ausRegeln = (regeln: { preisrichterId: number; sparte: string; rasse: string; farbenschlag: string; jugend?: boolean }[]) =>
    Object.fromEntries(regeln.map((x) => [schl(x.sparte, x.rasse, x.farbenschlag, x.jugend), x.preisrichterId as Wahl]));
  const [wahl, setWahl] = useState<Record<string, Wahl> | null>(null);
  const [offen, setOffen] = useState<Set<string> | null>(null);
  const [fehlend, setFehlend] = useState<string[]>([]);
  const gespeichert = daten.data ? ausRegeln(daten.data.regeln) : {};
  const aktuell = wahl ?? gespeichert;
  const normal = (w: Record<string, Wahl>) => JSON.stringify(Object.entries(w).filter(([, v]) => v !== "").sort());
  const geaendert = wahl != null && normal(wahl) !== normal(gespeichert);
  useUngespeichertWarnung(() => geaendert);
  const vorschlag = trpc.preisrichter.zuteilungVorschlagen.useQuery({ schauId }, { enabled: false });
  /** Bereiche neu (mit Rückfrage, wenn bewertete Tiere den Preisrichter wechseln). */
  const rueckfrage = <E extends { bestaetigt?: boolean }>(e: { data?: { code?: string } | null; message: string }, eingabe: E, nochmal: (x: E) => void) => {
    if (e.data?.code === "CONFLICT" && !eingabe.bestaetigt) {
      void bestaetige({ titel: te.trotzdemFrage, text: `${serverText(e.message, sprache)}\n\n${te.uebergang}`, knopf: t.allgemein.speichern }).then((ja) => ja && nochmal({ ...eingabe, bestaetigt: true }));
      return;
    }
    meldung(fehlerText(e), "fehler");
  };
  const speichern = trpc.preisrichter.zuteilungSetzen.useMutation({
    onSuccess: (x) => {
      setWahl(null);
      setOffen(null);
      utils.preisrichter.zuteilung.invalidate();
      utils.preisrichter.liste.invalidate();
      const zusatz = [x.ohne ? tx.tiereOhne(x.ohne) : "", x.abweichend.length ? tx.nachmeldungen(x.abweichend.join(", ")) : ""].filter(Boolean).join("; ");
      meldung(x.bereiche ? `${tx.gespeichertBereiche}${zusatz ? ` ${zusatz}.` : ""}` : tx.gespeichertOhneBereiche);
    },
    onError: (e, eingabe) => rueckfrage(e, eingabe, (x) => speichern.mutate(x)),
  });
  const jugendSetzen = trpc.preisrichter.einteilungJugendSetzen.useMutation({
    onSuccess: () => {
      setOffen(null);
      utils.preisrichter.zuteilung.invalidate();
      utils.preisrichter.liste.invalidate();
      utils.schau.get.invalidate({ id: schauId });
      meldung(tx.jugendGespeichert);
    },
    onError: (e, eingabe) => rueckfrage(e, eingabe, (x) => jugendSetzen.mutate(x)),
  });
  if (daten.error) return <FehlerAnzeige fehler={daten.error} nochmal={() => daten.refetch()} />;
  if (!daten.data) return <Laden />;
  const { gruppen, jugendSeparat } = daten.data;
  // Aufgeklappt: die Rassen mit eigener Einteilung je Farbenschlag (sonst sähe man die Aufteilung nicht).
  const mitFarben = (regeln: { sparte: string; rasse: string; farbenschlag: string; jugend?: boolean }[]) => new Set(regeln.filter((x) => x.farbenschlag).map((x) => schl(x.sparte, x.rasse, "", x.jugend)));
  const auf = offen ?? mitFarben(daten.data.regeln);
  const setze = (k: string, v: Wahl) => setWahl({ ...aktuell, [k]: v });
  // Tiere je Preisrichter nach denselben Regeln wie beim Anwenden (Farbenschlag vor Rasse, Jugend vor Senioren).
  const regeln = alsRegeln(aktuell);
  const last = new Map<number, number>();
  let ohne = 0;
  for (const g of gruppen)
    for (const f of g.farben) {
      const r = richterNachRasse({ sparte: g.sparte, rasse: g.rasse, farbenschlag: f.farbenschlag || null, istJugend: g.jugend }, regeln);
      if (r == null) ohne += f.anzahl;
      else last.set(r, (last.get(r) ?? 0) + f.anzahl);
    }
  const sparten = [...new Set(gruppen.map((g) => g.sparte))];
  const speichernRassen = () => speichern.mutate({ schauId, regeln });
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
  const auswahl = (g: { sparte: string; gruppe: string }, wert: Wahl, aendern: (v: Wahl) => void, leer: string, label: string) => (
    <Auswahl kompakt aria-label={label} className="w-full" value={wert} onChange={(e) => aendern(e.target.value === "" ? "" : Number(e.target.value))}>
      <option value="">{leer}</option>
      {richter
        .filter((r) => darfBewerten(r, g) || r.id === wert)
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
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-grau">{tx.jugend}</span>
          <Auswahl kompakt value={jugendSeparat ? "separat" : "rasse"} disabled={jugendSetzen.isPending} onChange={(e) => jugendSetzen.mutate({ schauId, separat: e.target.value === "separat" })}>
            <option value="rasse">{tx.jugendMitRasse}</option>
            <option value="separat">{tx.jugendSeparat}</option>
          </Auswahl>
        </label>
        <HilfeLink abschnitt="einteilung-jugend">{tx.hilfeJugend}</HilfeLink>
      </div>
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
          {/* Je Sparte eine Tabelle, alle mit denselben festen Spalten: sonst stehen „Tiere“ und „Preisrichter“ in jeder
              Sparte woanders. Auf schmalen Bildschirmen wird gemeinsam waagerecht gescrollt. */}
          <div className="flex max-w-3xl flex-col gap-4 overflow-x-auto">
            {sparten.map((sp) => (
              <table key={sp} className="tabelle min-w-[40rem] table-fixed [&_td]:align-middle [&_td:first-child]:break-words [&_th:first-child]:break-words">
                <colgroup>
                  <col />
                  <col className="w-24" />
                  <col className="w-64" />
                  <col className="w-40" />
                </colgroup>
                <thead>
                  <tr>
                    <th>{sp || tx.ohneSparte}</th>
                    <th className="text-right">{t.allgemein.tiere}</th>
                    <th>{t.allgemein.preisrichter}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {gruppen
                    .filter((g) => g.sparte === sp)
                    .flatMap((g) => {
                      const k = schl(g.sparte, g.rasse, "", g.jugend);
                      const name = g.jugend ? tx.jugendZeile(g.rasse) : g.rasse;
                      const istAuf = auf.has(k);
                      const zeilen = [
                        <tr key={k}>
                          <td className="font-semibold text-tinte">{name}</td>
                          <td className="text-right tabular-nums">{g.anzahl}</td>
                          <td>{auswahl(g, aktuell[k] ?? "", (v) => setze(k, v), g.jugend ? tx.wieRasse : tx.keiner, tx.richterFuer(name))}</td>
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
                          const fk = schl(g.sparte, g.rasse, f.farbenschlag, g.jugend);
                          zeilen.push(
                            <tr key={fk}>
                              <td className="pl-8 text-grau">{f.farbenschlag || tx.ohneFarbenschlag}</td>
                              <td className="text-right tabular-nums">{f.anzahl}</td>
                              <td>{f.farbenschlag ? auswahl(g, aktuell[fk] ?? "", (v) => setze(fk, v), tx.wieRasse, tx.richterFuer(`${name} ${f.farbenschlag}`)) : <span className="text-grau">{tx.wieRasse}</span>}</td>
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
