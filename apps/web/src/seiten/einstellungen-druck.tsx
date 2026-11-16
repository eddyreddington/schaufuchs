import { Link, useNavigate } from "react-router-dom";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Abschnitt, Auswahl, Feld, HilfeLink, Knopf, knopfKlasse, Laden, useMeldung } from "../ui";

/**
 * Einstellungen der Schau, Abschnitt „Druck“: welche Druckvorlage die Bewertungskarten nutzen (Vorgabe, eine Vorlage
 * des Vereins oder die für diese Schau abgewandelte Fassung) und Absprung in den Designer.
 */
export function DruckAbschnitt({ schauId, darfAendern }: { schauId: number; darfAendern: boolean }) {
  const t = useOberflaeche().schau.einstellungen;
  const td = t.druck;
  const q = trpc.druckvorlage.fuerSchau.useQuery({ schauId }, { enabled: darfAendern });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const navigate = useNavigate();
  const waehlen = trpc.druckvorlage.waehlen.useMutation({
    onSuccess: async () => {
      await utils.druckvorlage.fuerSchau.invalidate({ schauId });
      meldung(td.gewaehlt);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const anpassen = trpc.druckvorlage.fuerSchauAnpassen.useMutation({
    onSuccess: (r) => navigate(`/verein/druckvorlagen/${r.id}?schau=${schauId}`),
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  return (
    <Abschnitt id="druck" titel={t.seite.abschnitte.druck} aktionen={<HilfeLink abschnitt="druckvorlagen">{td.hilfe}</HilfeLink>}>
      {!darfAendern ? (
        <p className="text-sm text-grau">{td.nurAdmin}</p>
      ) : !q.data ? (
        <Laden />
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <Feld label={td.karten} className="min-w-64">
            {(fid) => (
              <Auswahl id={fid} value={q.data.vorlageId ?? ""} disabled={waehlen.isPending} onChange={(e) => waehlen.mutate({ schauId, vorlageId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{td.vorgabe}</option>
                {q.data.wahl.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.schauId ? td.nurDieseSchau : ""}
                  </option>
                ))}
              </Auswahl>
            )}
          </Feld>
          <Knopf laedt={anpassen.isPending} onClick={() => anpassen.mutate({ schauId })}>
            {td.anpassen}
          </Knopf>
          <Link to={`/verein#druckvorlagen`} className={knopfKlasse("leise")}>
            {td.vereinsVorlagen}
          </Link>
          <Link to="/verein/briefvorlage" className={knopfKlasse("leise")}>
            {td.briefvorlage}
          </Link>
        </div>
      )}
    </Abschnitt>
  );
}
