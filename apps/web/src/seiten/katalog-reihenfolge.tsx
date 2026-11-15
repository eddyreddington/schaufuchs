import { SORTIER_FEST, SORTIER_LABEL, SORTIER_RICHTUNG, SORTIERUNG_STANDARD, sortierungNormal, type KatalogSortierung, type SortierKriterium } from "@schau/domain";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fehlerText } from "../lib";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Auswahl, Haken, HilfeLink, Knopf, Speicherleiste, useMeldung, useUngespeichertWarnung } from "../ui";

type Schau = Ausgabe["schau"]["get"];

/** Kurzer Zusatz für Merkmale ohne Richtung. */
const OHNE_RICHTUNG: Partial<Record<SortierKriterium, string>> = {
  verein: "Tiere eines Vereins zusammen",
  aussteller: "Tiere eines Ausstellers zusammen",
  ausstellernummer: "nach Nummer des Ausstellers",
};

/**
 * Reihenfolge der Katalognummern: Kriterien mit Haken, Richtung und Hoch/Runter. Sparte, Rasse und Farbenschlag sind
 * immer an und behalten ihre Reihenfolge untereinander. Gilt beim nächsten Vergeben; nach dem Festschreiben gesperrt.
 */
export function KatalogReihenfolge({ schau: s, istAdmin }: { schau: Schau; istAdmin: boolean }) {
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const gespeichert = sortierungNormal(s.katalogSortierung);
  const [liste, setListe] = useState<KatalogSortierung>(gespeichert);
  const stand = JSON.stringify(gespeichert);
  useEffect(() => setListe(sortierungNormal(s.katalogSortierung)), [stand]); // eslint-disable-line react-hooks/exhaustive-deps
  const speichern = trpc.schau.katalogSortierungSetzen.useMutation({
    onSuccess: (r) => {
      utils.schau.get.invalidate({ id: s.id });
      if (r.geaendert) meldung("Reihenfolge gespeichert – gilt beim nächsten Vergeben.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const gesperrt = s.katalogGedruckt || !istAdmin;
  const geaendert = JSON.stringify(liste) !== stand;
  // Verglichen mit dem Stand vom Server: speichert jemand anders, gilt die neue Liste nicht als ungespeichert.
  useUngespeichertWarnung(() => !gesperrt && geaendert);
  const fest = (i: number) => SORTIER_FEST.includes(liste[i]!.kriterium);
  /** Tauscht Platz i mit i + schritt; Sparte, Rasse und Farbenschlag bleiben vorn stehen. */
  const kannTauschen = (i: number, schritt: number) => i + schritt >= 0 && i + schritt < liste.length && !fest(i) && !fest(i + schritt);
  const tauschen = (i: number, schritt: number) =>
    setListe((l) => {
      const neu = [...l];
      [neu[i], neu[i + schritt]] = [neu[i + schritt]!, neu[i]!];
      return neu;
    });
  const aendern = (i: number, teil: { aus?: boolean; umgekehrt?: boolean }) => setListe((l) => sortierungNormal(l.map((x, j) => (j === i ? { ...x, ...teil } : x))));
  const gliederung = [s.jugendSeparat && "Jugend am Ende", s.kaefigFolge?.length && "nach Käfigblöcken", s.staemmeVorn && "Volieren und Stämme vorn"].filter(Boolean).join(", ");

  return (
    <Abschnitt id="reihenfolge" titel="Reihenfolge der Nummern" aktionen={<HilfeLink abschnitt="reihenfolge-der-katalognummern">Hilfe zur Reihenfolge</HilfeLink>}>
      <p className="mb-3 text-sm text-grau">
        Vorweg: {gliederung || "keine Gliederung"} (<Link to={`/schau/${s.id}/einstellungen#katalog`}>Einstellungen</Link>)
      </p>
      <ol className="flex max-w-2xl flex-col divide-y divide-linie rounded-lg border border-linie">
        {liste.map((x, i) => {
          const richtung = SORTIER_RICHTUNG[x.kriterium];
          const label = `${i + 1}. ${SORTIER_LABEL[x.kriterium]}`;
          return (
            <li key={x.kriterium} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${x.aus ? "text-grau" : ""}`}>
              <div className="min-w-[11rem] flex-1">
                {fest(i) ? <span className="text-sm">{label}</span> : <Haken label={label} checked={!x.aus} onChange={(v) => aendern(i, { aus: !v })} disabled={gesperrt} />}
              </div>
              {richtung ? (
                <Auswahl kompakt aria-label={`Richtung ${SORTIER_LABEL[x.kriterium]}`} className="w-auto text-sm" value={x.umgekehrt ? "1" : "0"} disabled={gesperrt || x.aus} onChange={(e) => aendern(i, { umgekehrt: e.target.value === "1" })}>
                  <option value="0">{richtung[0]}</option>
                  <option value="1">{richtung[1]}</option>
                </Auswahl>
              ) : (
                <span className="text-sm text-grau">{OHNE_RICHTUNG[x.kriterium] ?? "nach Verzeichnis"}</span>
              )}
              <div className="flex gap-1">
                <Knopf variante="leise" aria-label={`${SORTIER_LABEL[x.kriterium]} nach oben`} disabled={gesperrt || !kannTauschen(i, -1)} onClick={() => tauschen(i, -1)}>
                  ↑
                </Knopf>
                <Knopf variante="leise" aria-label={`${SORTIER_LABEL[x.kriterium]} nach unten`} disabled={gesperrt || !kannTauschen(i, 1)} onClick={() => tauschen(i, 1)}>
                  ↓
                </Knopf>
              </div>
            </li>
          );
        })}
      </ol>
      {!gesperrt && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Knopf variante="leise" disabled={JSON.stringify(liste) === JSON.stringify(SORTIERUNG_STANDARD)} onClick={() => setListe(SORTIERUNG_STANDARD.map((x) => ({ ...x })))}>
            Vorgabe
          </Knopf>
        </div>
      )}
      {s.katalogGedruckt && <p className="mt-3 text-sm text-grau">Festgeschrieben</p>}
      <Speicherleiste sichtbar={geaendert && !gesperrt} onVerwerfen={() => setListe(gespeichert)} onSpeichern={() => speichern.mutate({ id: s.id, sortierung: liste })} laedt={speichern.isPending} knopf="Reihenfolge speichern" />
    </Abschnitt>
  );
}
