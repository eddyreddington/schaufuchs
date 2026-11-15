import { KARTEN_FORMAT_LABEL } from "@schau/domain";
import { Link } from "react-router-dom";
import { fehlerText } from "../lib";
import { trpc } from "../trpc";
import { Abschnitt, FehlerAnzeige, HilfeLink, Knopf, knopfKlasse, Laden, Leer, useFrage, useMeldung } from "../ui";

/** Verein und Datenschutz, Abschnitt „Druckvorlagen“: Vorlagen des Vereins und für einzelne Schauen abgewandelte. */
export function Druckvorlagen() {
  const q = trpc.druckvorlage.liste.useQuery();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const loeschen = trpc.druckvorlage.loeschen.useMutation({
    onSuccess: async () => {
      await utils.druckvorlage.liste.invalidate();
      meldung("Vorlage gelöscht.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const weg = async (id: number, name: string) => {
    if (await bestaetige({ titel: `„${name}“ löschen?`, text: "Schauen, die sie nutzen, drucken danach wieder mit der Vorgabe.", knopf: "Löschen", gefahr: true })) loeschen.mutate({ id });
  };
  return (
    <Abschnitt
      id="druckvorlagen"
      titel="Druckvorlagen"
      aktionen={
        <span className="flex flex-wrap items-center gap-3">
          <HilfeLink abschnitt="druckvorlagen">Hilfe zu Druckvorlagen</HilfeLink>
          <Link to="/verein/druckvorlagen/neu" className={knopfKlasse("zweit")}>
            Neue Vorlage
          </Link>
        </span>
      }
    >
      {q.error ? (
        <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />
      ) : !q.data ? (
        <Laden />
      ) : q.data.length === 0 ? (
        <Leer titel="Noch keine eigene Vorlage">Ohne Vorlage druckt SchauFUCHS die Bewertungskarten in DIN A6, vier je A4-Bogen.</Leer>
      ) : (
        <ul className="divide-y divide-linie border-y border-linie">
          {q.data.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <div className="min-w-0 flex-1">
                <Link to={`/verein/druckvorlagen/${v.id}${v.schauId ? `?schau=${v.schauId}` : ""}`} className="font-semibold text-tinte no-underline hover:underline">
                  {v.name}
                </Link>
                <span className="block text-sm text-grau">
                  Bewertungskarte · {KARTEN_FORMAT_LABEL[v.daten.format.art]} · {v.daten.modus === "vordruck" ? "Vordruck bedrucken" : "ganze Karte"}
                  {v.schauName ? ` · nur Schau „${v.schauName}“` : ""}
                </span>
              </div>
              <Knopf variante="leise" onClick={() => weg(v.id, v.name)}>
                Löschen
              </Knopf>
            </li>
          ))}
        </ul>
      )}
    </Abschnitt>
  );
}
