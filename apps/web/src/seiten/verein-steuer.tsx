import type { Steuerstatus } from "@schau/domain";
import { useState, type FormEvent } from "react";
import { fehlerText } from "../lib";
import { trpc } from "../trpc";
import { Eingabe, FehlerAnzeige, Feld, FormAbschnitt, Formular, Haken, HilfeLink, Hinweis, Laden, Segmente, Speicherleiste, Textfeld, useAenderungenWarnen, useMeldung } from "../ui";

/** Verein und Datenschutz, Abschnitt „Steuerliche Angaben“: Freistellungsbescheid für Zuwendungsbestätigungen. */
export function SteuerAngaben() {
  const q = trpc.spenden.steuer.useQuery();
  if (q.error) return <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />;
  if (!q.data) return <Laden />;
  return <SteuerFormular key={JSON.stringify(q.data.steuer)} start={q.data.steuer} sperre={q.data.sperre} />;
}

function SteuerFormular({ start, sperre }: { start: Steuerstatus; sperre: string | null }) {
  const [st, setSt] = useState(start);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const gespeichert = useAenderungenWarnen(st);
  const speichern = trpc.spenden.steuerSpeichern.useMutation({
    onSuccess: async () => {
      gespeichert();
      await utils.spenden.steuer.invalidate();
      meldung("Steuerliche Angaben gespeichert.");
    },
  });
  const setze = (teil: Partial<Steuerstatus>) => setSt((alt) => ({ ...alt, ...teil }));
  const senden = (e?: FormEvent) => {
    e?.preventDefault();
    speichern.mutate({ steuer: st });
  };
  const geaendert = JSON.stringify(st) !== JSON.stringify(start);
  const fest = st.bescheidArt === "feststellung60a";
  return (
    <form onSubmit={senden}>
      <Formular>
        <FormAbschnitt id="steuer" titel="Steuerliche Angaben" unter="Für Zuwendungsbestätigungen nach amtlichem Muster" aktionen={<HilfeLink abschnitt="steuerliche-angaben">Hilfe zu den steuerlichen Angaben</HilfeLink>}>
          <div className="flex flex-col gap-3 md:col-span-2">
            <Haken label="Der Verein ist als gemeinnützig anerkannt" checked={st.gemeinnuetzig} onChange={(w) => setze({ gemeinnuetzig: w })} />
            {st.gemeinnuetzig && sperre && <Hinweis ton="warnung">{sperre}</Hinweis>}
          </div>
          {st.gemeinnuetzig && (
            <>
              <div className="md:col-span-2">
                <Segmente
                  label="Bescheid"
                  wert={st.bescheidArt}
                  onChange={(w) => setze({ bescheidArt: w })}
                  optionen={[
                    { wert: "freistellung", label: "Freistellungsbescheid" },
                    { wert: "feststellung60a", label: "Feststellung nach § 60a AO" },
                  ]}
                />
              </div>
              <Feld label="Finanzamt">{(id) => <Eingabe id={id} value={st.finanzamt} maxLength={120} onChange={(e) => setze({ finanzamt: e.target.value })} />}</Feld>
              <Feld label="Steuernummer">{(id) => <Eingabe id={id} value={st.steuernummer} maxLength={40} onChange={(e) => setze({ steuernummer: e.target.value })} />}</Feld>
              <Feld label="Datum des Bescheids">{(id) => <Eingabe id={id} type="date" value={st.bescheidDatum ?? ""} onChange={(e) => setze({ bescheidDatum: e.target.value || null })} />}</Feld>
              {!fest && <Feld label="Letzter Veranlagungszeitraum" hinweis="z. B. 2022">{(id) => <Eingabe id={id} value={st.veranlagungszeitraum} maxLength={40} onChange={(e) => setze({ veranlagungszeitraum: e.target.value })} />}</Feld>}
              <Feld label="Steuerbegünstigter Zweck" hinweis="Steht im Satz „Förderung …“, z. B. „der Tierzucht“" className="md:col-span-2">
                {(id) => <Textfeld id={id} rows={2} value={st.zwecke} maxLength={1000} onChange={(e) => setze({ zwecke: e.target.value })} />}
              </Feld>
              <Feld label="Ort für die Unterschrift">{(id) => <Eingabe id={id} value={st.ort} maxLength={80} onChange={(e) => setze({ ort: e.target.value })} />}</Feld>
            </>
          )}
        </FormAbschnitt>
        {speichern.error && (
          <p role="alert" className="px-5 py-3 text-sm font-semibold text-kamm">
            {fehlerText(speichern.error)}
          </p>
        )}
      </Formular>
      <Speicherleiste sichtbar={geaendert} onVerwerfen={() => setSt(start)} onSpeichern={() => senden()} laedt={speichern.isPending} knopf="Steuerliche Angaben speichern" />
    </form>
  );
}
