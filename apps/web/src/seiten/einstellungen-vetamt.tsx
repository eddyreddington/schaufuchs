import { veterinaeramtSuchen, veterinaeramtText, veterinaeramtZurSchau, type Veterinaeramt } from "@schau/domain";
import { useId, useMemo, useState } from "react";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Eingabe, Feld, Knopf } from "../ui";

/**
 * Feld „Zuständiges Veterinäramt“ mit Vorschlägen aus dem Verzeichnis: beim Tippen passende Ämter (Kreis, Ort, Amt), ein
 * Klick trägt Amt und Anschrift ein. Ist das Feld leer und passt der Ort der Schau zu einem Kreis, steht das Amt als
 * Vorschlag darunter. Freier Text bleibt möglich.
 */
export function VetAmtFeld({ wert, setzen, schauOrt }: { wert: string; setzen: (v: string) => void; schauOrt: string }) {
  const tv = useOberflaeche().schau.einstellungen.vetamt;
  const verzeichnis = trpc.schau.veterinaeraemter.useQuery(undefined, { staleTime: Infinity });
  const liste: Veterinaeramt[] = verzeichnis.data?.eintraege ?? [];
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(0);
  const listId = useId();
  const treffer = useMemo(() => (offen ? veterinaeramtSuchen(liste, wert, 8) : []), [liste, wert, offen]);
  const vorschlag = useMemo(() => (!wert.trim() ? veterinaeramtZurSchau(liste, schauOrt) : null), [liste, wert, schauOrt]);
  const waehlen = (e: Veterinaeramt) => {
    setzen(veterinaeramtText(e));
    setOffen(false);
  };
  return (
    <Feld label={tv.label} hinweis={liste.length ? tv.hinweis : undefined}>
      {(fid) => (
        <div className="relative">
          <Eingabe
            id={fid}
            value={wert}
            autoComplete="off"
            role="combobox"
            aria-expanded={treffer.length > 0}
            aria-controls={listId}
            aria-activedescendant={treffer.length ? `${listId}-${aktiv}` : undefined}
            onChange={(e) => {
              setzen(e.target.value);
              setOffen(true);
              setAktiv(0);
            }}
            onFocus={() => setOffen(true)}
            onBlur={() => window.setTimeout(() => setOffen(false), 150)}
            onKeyDown={(e) => {
              if (!treffer.length) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setAktiv((a) => Math.min(a + 1, treffer.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setAktiv((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                waehlen(treffer[aktiv]!);
              } else if (e.key === "Escape") setOffen(false);
            }}
          />
          {treffer.length > 0 && (
            <ul id={listId} role="listbox" className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-linie-stark bg-weiss py-1 shadow-lg">
              {treffer.map((e, i) => (
                <li
                  key={`${e.land}-${e.kreis}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === aktiv}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    waehlen(e);
                  }}
                  onMouseEnter={() => setAktiv(i)}
                  className={`cursor-pointer px-3 py-1.5 text-sm ${i === aktiv ? "bg-papier" : ""}`}
                >
                  <span className="font-semibold">{e.kreis}</span>
                  <span className="text-grau"> · {e.land}</span>
                  <span className="block truncate text-grau">{veterinaeramtText(e)}</span>
                </li>
              ))}
            </ul>
          )}
          {vorschlag && (
            <Knopf variante="leise" className="mt-1 h-auto min-h-0 px-0 py-0.5 text-left text-sm" onClick={() => waehlen(vorschlag)}>
              {tv.vorschlag(vorschlag.amt)}
            </Knopf>
          )}
        </div>
      )}
    </Feld>
  );
}
