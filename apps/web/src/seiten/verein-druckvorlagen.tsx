import { Link } from "react-router-dom";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Abschnitt, FehlerAnzeige, HilfeLink, Knopf, knopfKlasse, Laden, Leer, useFrage, useMeldung } from "../ui";

/** Verein und Datenschutz, Abschnitt „Druckvorlagen“: Vorlagen des Vereins und für einzelne Schauen abgewandelte. */
export function Druckvorlagen() {
  const q = trpc.druckvorlage.liste.useQuery();
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const ta = useOberflaeche();
  const t = ta.vorlagen.liste;
  const loeschen = trpc.druckvorlage.loeschen.useMutation({
    onSuccess: async () => {
      await utils.druckvorlage.liste.invalidate();
      meldung(t.geloescht);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const weg = async (id: number, name: string) => {
    if (await bestaetige({ titel: t.loeschenFrage(name), text: t.loeschenText, knopf: ta.allgemein.loeschen, gefahr: true })) loeschen.mutate({ id });
  };
  return (
    <Abschnitt
      id="druckvorlagen"
      titel={t.titel}
      aktionen={
        <span className="flex flex-wrap items-center gap-3">
          <HilfeLink abschnitt="druckvorlagen">{t.hilfe}</HilfeLink>
          <Link to="/verein/druckvorlagen/neu" className={knopfKlasse("zweit")}>
            {t.neueKarte}
          </Link>
        </span>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-y border-linie py-2">
        <div className="min-w-0 flex-1">
          <Link to="/verein/briefvorlage" className="font-semibold text-tinte no-underline hover:underline">
            {t.briefvorlage}
          </Link>
          <span className="block text-sm text-grau">{t.briefvorlageUnter}</span>
        </div>
        <Link to="/verein/briefvorlage#serienbrief" className={knopfKlasse("leise")}>
          {t.serienbrief}
        </Link>
      </div>
      {q.error ? (
        <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />
      ) : !q.data ? (
        <Laden />
      ) : q.data.length === 0 ? (
        <Leer titel={t.leer}>{t.leerText}</Leer>
      ) : (
        <ul className="divide-y divide-linie border-y border-linie">
          {q.data.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <div className="min-w-0 flex-1">
                <Link to={`/verein/druckvorlagen/${v.id}${v.schauId ? `?schau=${v.schauId}` : ""}`} className="font-semibold text-tinte no-underline hover:underline">
                  {v.name}
                </Link>
                <span className="block text-sm text-grau">
                  {t.zeile(ta.fach.KARTEN_FORMAT_LABEL[v.daten.format.art], v.daten.modus === "vordruck" ? t.vordruck : t.ganzeKarte)}
                  {v.schauName ? t.nurSchau(v.schauName) : ""}
                </span>
              </div>
              <Knopf variante="leise" onClick={() => weg(v.id, v.name)}>
                {ta.allgemein.loeschen}
              </Knopf>
            </li>
          ))}
        </ul>
      )}
    </Abschnitt>
  );
}
