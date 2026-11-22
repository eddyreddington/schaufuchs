/** BDRG-Gruppen je Rasse eines eigenen Verzeichnisses pflegen (Rassen und Farbenschläge → „Gruppen“). */
import { useState } from "react";
import { bdrgGruppe } from "@schau/domain";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Eingabe, FehlerAnzeige, HilfeLink, Hinweis, Knopf, Laden, Suchfeld, TabellenRahmen, useMeldung } from "../ui";

export function Gruppen({ versionId }: { versionId: number }) {
  const gliederung = trpc.stammdaten.gliederung.useQuery({ versionId });
  const [eingabe, setEingabe] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState("");
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const t = useOberflaeche().vorlagen.stammdaten;
  const speichern = trpc.stammdaten.gruppenSetzen.useMutation({
    onSuccess: async (r) => {
      await Promise.all([utils.stammdaten.gliederung.invalidate({ versionId }), utils.stammdaten.baum.invalidate({ versionId })]);
      setEingabe({});
      meldung(r.geaendert ? t.gruppenGespeichert(r.geaendert) : t.gruppenUnveraendert);
    },
  });
  if (gliederung.error) return <FehlerAnzeige fehler={gliederung.error} nochmal={() => gliederung.refetch()} />;
  if (!gliederung.data) return <Laden />;
  const { sparten, rassen } = gliederung.data;
  const sparteVon = new Map(sparten.map((s) => [s.id, s.name]));
  const f = filter.trim().toLowerCase();
  const zeilen = rassen.filter((r) => !f || `${sparteVon.get(r.sparteId) ?? ""} ${r.name} ${r.gruppe}`.toLowerCase().includes(f));
  const geaendert = rassen.filter((r) => eingabe[r.id] !== undefined && bdrgGruppe(eingabe[r.id]) !== r.gruppe);
  return (
    <div className="flex flex-col gap-4">
      <TabellenRahmen kopf={<Suchfeld aria-label={t.durchsuchen} placeholder={t.suchPlatzhalter} value={filter} onChange={(e) => setFilter(e.target.value)} />}>
        <div className="max-h-[55vh] overflow-auto">
          <table className="tabelle">
            <thead>
              <tr>
                <th>{t.sparte}</th>
                <th>{t.rasse}</th>
                <th className="w-32">{t.gruppe}</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((r) => (
                <tr key={r.id}>
                  <td className="text-grau">{sparteVon.get(r.sparteId)}</td>
                  <td>{r.name}</td>
                  <td>
                    <Eingabe aria-label={`${t.gruppe} ${r.name}`} className="w-full" maxLength={20} value={eingabe[r.id] ?? r.gruppe} onChange={(e) => setEingabe({ ...eingabe, [r.id]: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TabellenRahmen>
      {speichern.error && <Hinweis ton="fehler">{fehlerText(speichern.error)}</Hinweis>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linie pt-4">
        {/* bleibt deutsch: Abschnitt im Handbuch */}
        <HilfeLink abschnitt="rassen-gruppen">{t.hilfeGruppen}</HilfeLink>
        <Knopf
          variante="primaer"
          laedt={speichern.isPending}
          disabled={!geaendert.length}
          onClick={() => speichern.mutate({ versionId, gruppen: geaendert.map((r) => ({ rasseId: r.id, gruppe: eingabe[r.id] ?? "" })) })}
        >
          {t.gruppenSpeichern}
        </Knopf>
      </div>
    </div>
  );
}
