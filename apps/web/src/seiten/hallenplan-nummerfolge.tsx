import type { NummerFolge } from "@schau/domain";
import { useOberflaeche } from "../sprache";
import { Auswahl, Feld, Haken, HilfeLink } from "../ui";

/** Nur gesetzte Werte (aus = weglassen): ohne Einstellung bleibt die Halle wie vorher, auch ihr Schlüssel. */
export function bereinigteFolge(f: NummerFolge): NummerFolge | undefined {
  const aus: NummerFolge = {
    ...(f.startReihe != null ? { startReihe: f.startReihe } : {}),
    ...(f.absteigend ? { absteigend: true } : {}),
    ...(f.vomEnde ? { vomEnde: true } : {}),
    ...(f.schlange ? { schlange: true } : {}),
    ...(f.doppelAbwechselnd ? { doppelAbwechselnd: true } : {}),
  };
  return Object.keys(aus).length ? aus : undefined;
}

/**
 * Einstellung „Nach Plan nummerieren“ in den Eigenschaften der Halle (Rückmeldung 22.11.2026): bei welcher Reihe die 1
 * steht, Reihen auf- oder absteigend, die erste Reihe vom Anfang oder vom Ende, Schlangenlinie, Doppelreihen Seite für
 * Seite oder abwechselnd. Gespeichert wird sie in der Halle (wie eine Änderung im Editor, ohne den Plan neu zu setzen).
 * `setzen` fehlt: nur ansehen.
 */
export function NummerFolgeEinstellung({ folge, reihen, setzen }: { folge: NummerFolge | undefined; reihen: number[]; setzen?: (f: NummerFolge | undefined) => void }) {
  const t = useOberflaeche().halle.nummerFolge;
  const f = folge ?? {};
  const neu = (patch: Partial<NummerFolge>) => setzen?.(bereinigteFolge({ ...f, ...patch }));
  const aus = !setzen;
  return (
    <details className="border-t border-linie pt-4">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-grau hover:text-tinte">{t.titel}</summary>
      <div className="mt-3 flex flex-col gap-3">
        <Feld label={t.beginnenBei}>
          {(id) => (
            <Auswahl id={id} disabled={aus} value={f.startReihe ?? ""} onChange={(e) => neu({ startReihe: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">{t.ersteReihe}</option>
              {reihen.map((nr) => (
                <option key={nr} value={nr}>
                  R{nr}
                </option>
              ))}
            </Auswahl>
          )}
        </Feld>
        <Feld label={t.reihen}>
          {(id) => (
            <Auswahl id={id} disabled={aus} value={f.absteigend ? "ab" : "auf"} onChange={(e) => neu({ absteigend: e.target.value === "ab" })}>
              <option value="auf">{t.aufsteigend}</option>
              <option value="ab">{t.absteigend}</option>
            </Auswahl>
          )}
        </Feld>
        <Feld label={t.ersteReiheRichtung}>
          {(id) => (
            <Auswahl id={id} disabled={aus} value={f.vomEnde ? "ende" : "anfang"} onChange={(e) => neu({ vomEnde: e.target.value === "ende" })}>
              <option value="anfang">{t.vomAnfang}</option>
              <option value="ende">{t.vomEnde}</option>
            </Auswahl>
          )}
        </Feld>
        <Haken label={t.schlange} checked={!!f.schlange} disabled={aus} onChange={(v) => neu({ schlange: v })} />
        <Feld label={t.doppelreihen}>
          {(id) => (
            <Auswahl id={id} disabled={aus} value={f.doppelAbwechselnd ? "abwechselnd" : "seite"} onChange={(e) => neu({ doppelAbwechselnd: e.target.value === "abwechselnd" })}>
              <option value="seite">{t.seiteFuerSeite}</option>
              <option value="abwechselnd">{t.abwechselnd}</option>
            </Auswahl>
          )}
        </Feld>
        <HilfeLink abschnitt="hallenplan-nummerieren">{t.hilfe}</HilfeLink>
      </div>
    </details>
  );
}
