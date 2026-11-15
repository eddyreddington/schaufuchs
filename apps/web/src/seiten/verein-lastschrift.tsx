import { useState, type FormEvent } from "react";
import { fehlerText } from "../lib";
import { trpc } from "../trpc";
import { Eingabe, FehlerAnzeige, Feld, FormAbschnitt, Formular, HilfeLink, Laden, Speicherleiste, useAenderungenWarnen, useMeldung } from "../ui";

/** Verein und Datenschutz, Abschnitt „SEPA-Lastschrift“: Gläubiger-Identifikationsnummer des Vereins (Entscheidung 018). */
export function GlaeubigerId() {
  const q = trpc.lastschrift.einstellungen.useQuery();
  if (q.error) return <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />;
  if (!q.data) return <Laden />;
  return <Bearbeiten key={q.data.glaeubigerId} start={q.data.glaeubigerId} />;
}

function Bearbeiten({ start }: { start: string }) {
  const [id, setId] = useState(start);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const gespeichert = useAenderungenWarnen(id);
  const speichern = trpc.lastschrift.glaeubigerIdSetzen.useMutation({
    onSuccess: async () => {
      gespeichert();
      await utils.lastschrift.einstellungen.invalidate();
      meldung("Gläubiger-ID gespeichert.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const senden = (e?: FormEvent) => {
    e?.preventDefault();
    speichern.mutate({ glaeubigerId: id });
  };
  return (
    <form onSubmit={senden}>
      <Formular>
        <FormAbschnitt id="lastschrift" titel="SEPA-Lastschrift" unter="Gläubiger-ID für den Einzug des Meldegelds" aktionen={<HilfeLink abschnitt="sepa-lastschrift">Hilfe zur Lastschrift</HilfeLink>}>
          <Feld label="Gläubiger-Identifikationsnummer" hinweis="Bei der Deutschen Bundesbank beantragt, z. B. DE98ZZZ09999999999; leer = keine Lastschrift">
            {(fid) => <Eingabe id={fid} value={id} maxLength={40} onChange={(e) => setId(e.target.value)} autoComplete="off" />}
          </Feld>
        </FormAbschnitt>
      </Formular>
      <Speicherleiste sichtbar={id !== start} onVerwerfen={() => setId(start)} onSpeichern={senden} laedt={speichern.isPending} knopf="Gläubiger-ID speichern" />
    </form>
  );
}
