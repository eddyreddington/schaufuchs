import { STANDARD_NOTENSKALA, type NotenStufe } from "@schau/domain";
import { useState } from "react";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Eingabe, Knopf, Speicherleiste, useAenderungenWarnen, useMeldung } from "../ui";

/* Einstellungen der Schau, Abschnitt „Notenskala“: Kürzel, Noten und Punkte, zurück auf den Standard. */

type Schau = Ausgabe["schau"]["get"];

export function Notenskala({ schau: s }: { schau: Schau }) {
  const t = useOberflaeche().schau.einstellungen;
  const tn = t.notenskala;
  const ausSchau = () => s.notenskala.map((n) => ({ ...n, punkteText: n.punkte.join(", ") }));
  const [zeilen, setZeilen] = useState(ausSchau);
  const gespeichert = useAenderungenWarnen(zeilen);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const speichern = trpc.schau.notenskalaSetzen.useMutation({
    onSuccess: () => {
      gespeichert();
      utils.schau.get.invalidate();
      meldung(tn.gespeichert);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const senden = (standard: boolean) => {
    if (standard) return speichern.mutate({ schauId: s.id, skala: null });
    const skala: NotenStufe[] = zeilen.map((z) => ({ kuerzel: z.kuerzel, name: z.name, punkte: z.punkteText.split(/[,\s]+/).filter(Boolean).map(Number) }));
    speichern.mutate({ schauId: s.id, skala });
  };
  return (
    <Abschnitt id="notenskala" titel={t.seite.abschnitte.notenskala}>
      <p className="mb-3 text-sm text-grau">{tn.hinweis}</p>
      <table className="tabelle max-w-2xl">
        <thead>
          <tr>
            <th>{tn.kuerzel}</th>
            <th>{tn.note}</th>
            <th>{tn.punkte}</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z, i) => (
            <tr key={i}>
              <td><Eingabe aria-label={tn.kuerzel} value={z.kuerzel} onChange={(e) => setZeilen(zeilen.map((x, j) => (j === i ? { ...x, kuerzel: e.target.value } : x)))} /></td>
              <td><Eingabe aria-label={tn.note} value={z.name} onChange={(e) => setZeilen(zeilen.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
              <td><Eingabe aria-label={tn.punkte} value={z.punkteText} onChange={(e) => setZeilen(zeilen.map((x, j) => (j === i ? { ...x, punkteText: e.target.value } : x)))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex gap-2">
        <Speicherleiste
          sichtbar={JSON.stringify(zeilen) !== JSON.stringify(ausSchau())}
          onVerwerfen={() => setZeilen(ausSchau())}
          onSpeichern={() => senden(false)}
          laedt={speichern.isPending}
          knopf={tn.speichern}
        />
        <Knopf
          variante="leise"
          onClick={() => {
            setZeilen(STANDARD_NOTENSKALA.map((n) => ({ ...n, punkteText: n.punkte.join(", ") })));
            senden(true);
          }}
        >
          {tn.standard}
        </Knopf>
      </div>
    </Abschnitt>
  );
}
