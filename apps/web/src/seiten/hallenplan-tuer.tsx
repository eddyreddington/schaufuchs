/** Auswahl „Tür“ eines gewählten Eingangs oder Ausgangs (3D, Entscheidung 028): wie Wand, Glastür, Holztür oder offen. */
import { flaecheBereinigt, type Halle, TUER_ARTEN, type TuerArt, tuerArtVon } from "@schau/domain";
import { useOberflaeche } from "../sprache";
import { Auswahl, Feld, HilfeLink } from "../ui";
import { type Aendern, zweisprachig } from "./hallenplan-geometrie";

/** Nur die Darstellung in 3D: gespeichert über den gewöhnlichen Weg der Halle, der Plan bleibt (auch ein fester). */
export function TuerFeld({ halle, i, aendern }: { halle: Halle; i: number; aendern: Aendern }) {
  const te = useOberflaeche().halle.eigenschaften;
  const f = halle.flaechen[i];
  if (!f || f.art !== "eingang") return null;
  const setzen = (tuer: TuerArt) => aendern((h) => ({ ...h, flaechen: h.flaechen.map((x, j) => (j === i ? flaecheBereinigt({ ...x, tuer }) : x)) }), zweisprachig((x) => x.halle.eigenschaften.flaecheAendern));
  return (
    <div className="flex flex-col gap-1.5">
      <Feld label={te.tuer}>
        {(id) => (
          <Auswahl id={id} value={tuerArtVon(f)} onChange={(e) => setzen(e.target.value as TuerArt)}>
            {TUER_ARTEN.map((a) => (
              <option key={a} value={a}>
                {te.tuerArten[a]}
              </option>
            ))}
          </Auswahl>
        )}
      </Feld>
      <HilfeLink abschnitt="hallenplan-tueren">{te.hilfeTuer}</HilfeLink>
    </div>
  );
}
