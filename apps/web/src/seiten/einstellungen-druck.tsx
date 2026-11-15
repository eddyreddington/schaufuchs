import { Link, useNavigate } from "react-router-dom";
import { fehlerText } from "../lib";
import { trpc } from "../trpc";
import { Abschnitt, Auswahl, Feld, HilfeLink, Knopf, knopfKlasse, Laden, useMeldung } from "../ui";

/**
 * Einstellungen der Schau, Abschnitt „Druck“: welche Druckvorlage die Bewertungskarten nutzen (Vorgabe, eine Vorlage
 * des Vereins oder die für diese Schau abgewandelte Fassung) und Absprung in den Designer.
 */
export function DruckAbschnitt({ schauId, darfAendern }: { schauId: number; darfAendern: boolean }) {
  const q = trpc.druckvorlage.fuerSchau.useQuery({ schauId }, { enabled: darfAendern });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const navigate = useNavigate();
  const waehlen = trpc.druckvorlage.waehlen.useMutation({
    onSuccess: async () => {
      await utils.druckvorlage.fuerSchau.invalidate({ schauId });
      meldung("Druckvorlage gewählt.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const anpassen = trpc.druckvorlage.fuerSchauAnpassen.useMutation({
    onSuccess: (r) => navigate(`/verein/druckvorlagen/${r.id}?schau=${schauId}`),
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  return (
    <Abschnitt id="druck" titel="Druck" aktionen={<HilfeLink abschnitt="druckvorlagen">Hilfe zu Druckvorlagen</HilfeLink>}>
      {!darfAendern ? (
        <p className="text-sm text-grau">Nur Administratoren wählen die Druckvorlage.</p>
      ) : !q.data ? (
        <Laden />
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <Feld label="Bewertungskarten" className="min-w-64">
            {(fid) => (
              <Auswahl id={fid} value={q.data.vorlageId ?? ""} disabled={waehlen.isPending} onChange={(e) => waehlen.mutate({ schauId, vorlageId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Vorgabe (A6, vier je A4)</option>
                {q.data.wahl.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.schauId ? " (nur diese Schau)" : ""}
                  </option>
                ))}
              </Auswahl>
            )}
          </Feld>
          <Knopf laedt={anpassen.isPending} onClick={() => anpassen.mutate({ schauId })}>
            Für diese Schau anpassen
          </Knopf>
          <Link to={`/verein#druckvorlagen`} className={knopfKlasse("leise")}>
            Vorlagen des Vereins
          </Link>
          <Link to="/verein/briefvorlage" className={knopfKlasse("leise")}>
            Briefvorlage
          </Link>
        </div>
      )}
    </Abschnitt>
  );
}
