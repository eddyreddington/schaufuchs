import { TEILSCHAU_NAME_MAX, TEILSCHAUEN_MAX } from "@schau/domain";
import { useState } from "react";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Abschnitt, Eingabe, HilfeLink, Knopf, Leer, Speicherleiste, useAenderungenWarnen, useMeldung } from "../ui";

type Teil = { id?: string; name: string };

/**
 * Einstellungen der Schau, Abschnitt „Teilschauen“ (Entscheidung 016): Namen in Katalogfolge, umbenennen, umsortieren,
 * entfernen. Die Katalognummern laufen über alle Teilschauen fortlaufend. Speichern oben rechts.
 */
export function TeilschauenAbschnitt({ schauId, start, darfAendern }: { schauId: number; start: Teil[]; darfAendern: boolean }) {
  return <Bearbeiten key={JSON.stringify(start)} schauId={schauId} start={start} darfAendern={darfAendern} />;
}

function Bearbeiten({ schauId, start, darfAendern }: { schauId: number; start: Teil[]; darfAendern: boolean }) {
  const t = useOberflaeche();
  const tt = t.schau.einstellungen.teilschauen;
  const [teile, setTeile] = useState<Teil[]>(start);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const gespeichert = useAenderungenWarnen(teile);
  const speichern = trpc.schau.teilschauenSetzen.useMutation({
    onSuccess: async () => {
      gespeichert();
      await utils.schau.get.invalidate({ id: schauId });
      meldung(tt.gespeichert);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const geaendert = JSON.stringify(teile) !== JSON.stringify(start);
  const setze = (i: number, name: string) => setTeile(teile.map((x, j) => (j === i ? { ...x, name } : x)));
  const tausche = (i: number, j: number) => {
    const neu = [...teile];
    [neu[i], neu[j]] = [neu[j]!, neu[i]!];
    setTeile(neu);
  };
  return (
    <Abschnitt id="teilschauen" titel={t.schau.einstellungen.seite.abschnitte.teilschauen} aktionen={<HilfeLink abschnitt="teilschauen">{tt.hilfe}</HilfeLink>}>
      {teile.length === 0 && <Leer titel={tt.keine} />}
      <ol className="flex flex-col gap-2">
        {teile.map((teil, i) => (
          <li key={teil.id ?? `neu-${i}`} className="flex flex-wrap items-center gap-2">
            <span className="w-6 text-right tabular-nums text-grau">{i + 1}.</span>
            <Eingabe aria-label={tt.name(i + 1)} value={teil.name} maxLength={TEILSCHAU_NAME_MAX} onChange={(e) => setze(i, e.target.value)} disabled={!darfAendern} className="max-w-sm flex-1" />
            {darfAendern && (
              <>
                <Knopf variante="leise" aria-label={tt.nachOben} disabled={i === 0} onClick={() => tausche(i, i - 1)}>
                  ↑
                </Knopf>
                <Knopf variante="leise" aria-label={tt.nachUnten} disabled={i === teile.length - 1} onClick={() => tausche(i, i + 1)}>
                  ↓
                </Knopf>
                <Knopf variante="gefahr" onClick={() => setTeile(teile.filter((_, j) => j !== i))}>
                  {t.allgemein.entfernen}
                </Knopf>
              </>
            )}
          </li>
        ))}
      </ol>
      {darfAendern && teile.length < TEILSCHAUEN_MAX && (
        // bleibt deutsch: Vorschlag für den Namen, steht im Katalog
        <Knopf className="mt-3" onClick={() => setTeile([...teile, { name: teile.length ? "" : "Hauptschau" }])}>
          {tt.hinzufuegen}
        </Knopf>
      )}
      {darfAendern && <Speicherleiste sichtbar={geaendert} onVerwerfen={() => setTeile(start)} onSpeichern={() => speichern.mutate({ id: schauId, teilschauen: teile })} laedt={speichern.isPending} knopf={tt.speichern} />}
    </Abschnitt>
  );
}
