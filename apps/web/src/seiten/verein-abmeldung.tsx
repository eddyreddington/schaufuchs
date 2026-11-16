import { ABMELDUNG_MINUTEN, ABMELDUNG_ROLLEN, type Abmeldung } from "@schau/domain";
import { useState, type FormEvent } from "react";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Abschnitt, Auswahl, FehlerAnzeige, Feld, HilfeLink, Laden, Speicherleiste, useMeldung } from "../ui";

/** Automatische Abmeldung nach Untätigkeit, je Rolle (Verein und Datenschutz). */
export function AutoAbmeldung() {
  const t = useOberflaeche().verein.abmeldung;
  const q = trpc.verein.abmeldung.useQuery();
  return (
    <Abschnitt id="automatische-abmeldung" titel={t.titel} aktionen={<HilfeLink abschnitt="automatische-abmeldung">{t.hilfe}</HilfeLink>}>
      {q.error ? <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} /> : !q.data ? <Laden /> : <AbmeldungFormular key={JSON.stringify(q.data)} gespeichert={q.data} />}
    </Abschnitt>
  );
}

function AbmeldungFormular({ gespeichert }: { gespeichert: Abmeldung }) {
  const t = useOberflaeche().verein.abmeldung;
  const [werte, setWerte] = useState<Abmeldung>(gespeichert);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const speichern = trpc.verein.abmeldungSpeichern.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.verein.abmeldung.invalidate(), utils.auth.status.invalidate()]);
      meldung(t.gespeichert);
    },
  });
  const geaendert = JSON.stringify(werte) !== JSON.stringify(gespeichert);
  const senden = (e: FormEvent) => {
    e.preventDefault();
    speichern.mutate(werte);
  };
  return (
    <form onSubmit={senden} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {ABMELDUNG_ROLLEN.map(({ rolle }) => (
          <Feld key={rolle} label={t.rollen[rolle]}>
            {(id) => (
              <Auswahl id={id} value={werte[rolle]} onChange={(e) => setWerte({ ...werte, [rolle]: Number(e.target.value) })}>
                {ABMELDUNG_MINUTEN.map((m) => (
                  <option key={m} value={m}>
                    {t.nachMinuten(m)}
                  </option>
                ))}
              </Auswahl>
            )}
          </Feld>
        ))}
      </div>
      {speichern.error && <p role="alert" className="text-sm font-semibold text-kamm">{fehlerText(speichern.error)}</p>}
      <Speicherleiste sichtbar={geaendert} onVerwerfen={() => setWerte(gespeichert)} onSpeichern={() => speichern.mutate(werte)} laedt={speichern.isPending} knopf={t.speichern} />
    </form>
  );
}
