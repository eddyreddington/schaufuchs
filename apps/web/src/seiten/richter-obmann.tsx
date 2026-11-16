/** Preisrichter-Tablet: Ansicht für den Obmann zum Bestätigen von Noten. */
import { bewertungsText } from "@schau/domain";
import { fehlerText, formatKatalognummer } from "../lib";
import { useOberflaeche } from "../sprache";
import { direkt } from "../trpc";
import { Hinweis, Knopf, Leer, useMeldung } from "../ui";
import type { Daten } from "./richter-geraet";

export function ObmannAnsicht({ liste, skala, online, fertig }: { liste: Daten["obmannListe"]; skala: Daten["skala"]; online: boolean; fertig: () => void }) {
  const meldung = useMeldung();
  const o = useOberflaeche();
  const t = o.tablet.obmann;
  const bestaetigen = async (id: number) => {
    try {
      // Mit dem gesehenen Stand: eine inzwischen geänderte Note bestätigt der Obmann nicht ungesehen.
      await direkt.richter.obmannBestaetigen.mutate({ katalogeintragId: id, version: liste.find((x) => x.id === id)?.version ?? undefined });
      meldung(t.bestaetigt);
      fertig();
    } catch (e) {
      meldung(fehlerText(e), "fehler");
    }
  };
  return (
    <main className="mx-auto w-full max-w-3xl overflow-y-auto p-6">
      <h2 className="mb-4 text-2xl font-semibold">{t.titel}</h2>
      {!online && <Hinweis ton="warnung" className="mb-4">{t.offline}</Hinweis>}
      {liste.length === 0 && <Leer titel={t.allesBestaetigt} />}
      <ul className="flex flex-col gap-3">
        {liste.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-linie bg-weiss p-4">
            <span className="nummer text-4xl">{formatKatalognummer(e)}</span>
            <span className="min-w-0 flex-1">
              {e.bezeichnung}, {e.geschlecht} {o.tablet.alter[e.alter]}
              <span className="block font-semibold">{bewertungsText(e, skala)}</span>
              {e.vorzuege && <span className="block text-sm text-grau">{e.vorzuege}</span>}
            </span>
            <Knopf variante="primaer" className="min-h-11" disabled={!online} onClick={() => bestaetigen(e.id)}>{t.bestaetigen}</Knopf>
          </li>
        ))}
      </ul>
    </main>
  );
}
