import { useState } from "react";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Auswahl, Dialog, FehlerAnzeige, Feld, Hinweis, Knopf, KnopfLink, Laden } from "../ui";

/**
 * A-Bögen aus der Vereinsverwaltung: zur gewählten Schau je Vereinsmitglied ein Bogen mit Name und Anschrift – oder
 * nur für den Aussteller `fuer`. Das PDF erzeugt der Server (/datei/:schauId/a-bogen-mitglieder.pdf).
 */
export function ABogenDialog({ offen, fuer, schliessen }: { offen: boolean; fuer: { id: number; name: string } | null; schliessen: () => void }) {
  const t = useOberflaeche();
  const ta = t.meldung.aussteller;
  const liste = trpc.schau.liste.useQuery(undefined, { enabled: offen });
  // Testschauen nicht: deren Bögen tragen den Vermerk „Testschau“ und gehen nicht an Mitglieder.
  const schauen = (liste.data ?? []).filter((s) => !s.test);
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  // Vorschlag: die neueste Schau, die noch nicht abgeschlossen ist.
  const vorschlag = schauen.find((s) => s.phase !== "abgeschlossen") ?? schauen[0];
  const schauId = schauen.some((s) => s.id === gewaehlt) ? gewaehlt : (vorschlag?.id ?? null);
  const anzahl = trpc.druckvorlage.serienbriefAnzahl.useQuery({ auswahl: "mitglieder" }, { enabled: offen && !fuer });
  const bereit = schauId != null && (fuer != null || !!anzahl.data?.anzahl);
  return (
    <Dialog offen={offen} onSchliessen={schliessen} titel={fuer ? ta.aBogenFuer(fuer.name) : ta.aBoegenTitel}>
      <div className="flex flex-col gap-4">
        {liste.error ? (
          <FehlerAnzeige fehler={liste.error} nochmal={() => liste.refetch()} />
        ) : !liste.data ? (
          <Laden />
        ) : !schauen.length ? (
          <Hinweis>{ta.aBogenKeineSchau}</Hinweis>
        ) : (
          <Feld label={ta.schau}>
            {(id) => (
              <Auswahl id={id} value={schauId ?? ""} onChange={(e) => setGewaehlt(Number(e.target.value))}>
                {schauen.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Auswahl>
            )}
          </Feld>
        )}
        {!fuer && anzahl.error && <FehlerAnzeige fehler={anzahl.error} nochmal={() => anzahl.refetch()} />}
        {!fuer && anzahl.data && <p>{ta.aBoegenAnzahl(anzahl.data.anzahl, anzahl.data.ohneAnschrift)}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Knopf onClick={schliessen}>{t.allgemein.abbrechen}</Knopf>
          {bereit && (
            <KnopfLink variante="primaer" href={`/datei/${schauId}/a-bogen-mitglieder.pdf${fuer ? `?aussteller=${fuer.id}` : ""}`} target="_blank" rel="noreferrer">
              {ta.aBogenOeffnen}
            </KnopfLink>
          )}
        </div>
      </div>
    </Dialog>
  );
}
