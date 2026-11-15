import { MELDEART_LABEL } from "@schau/domain";
import { useMemo, useState } from "react";
import { fehlerText, formatEuro, formatKatalognummer } from "../lib";
import { useSchauId } from "../rahmen";
import { KatalogReihenfolge } from "./katalog-reihenfolge";
import { trpc } from "../trpc";
import { Abschnitt, FehlerAnzeige, Knopf, KnopfLink, Laden, Leer, Marke, SEITE, Seitenkopf, Suchfeld, TabellenRahmen, useFrage, useMeldung } from "../ui";

export const EINTRAG_STATUS_LABEL = { gemeldet: "gemeldet", katalogisiert: "im Katalog", eingeliefert: "eingeliefert", fehlt: "fehlt", ausgesetzt: "ausgegeben" } as const;

export function Katalog() {
  const schauId = useSchauId();
  const schau = trpc.schau.get.useQuery({ id: schauId });
  const liste = trpc.katalog.liste.useQuery({ schauId });
  const status = trpc.auth.status.useQuery();
  const istAdmin = status.data?.benutzer?.rolle === "admin";
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const [filter, setFilter] = useState("");
  const neu = () => utils.invalidate();
  const vergeben = trpc.katalog.nummernVergeben.useMutation({
    onSuccess: (r) => {
      neu();
      meldung(r.nachmeldungen ? `${r.geaendert} Nachmeldungen nummeriert.` : `${r.geaendert} Katalognummern vergeben.`);
      if (r.ausserhalbDerFolge.length) {
        meldung(`Nicht ganz in Ausstellungsfolge: ${r.ausserhalbDerFolge.join(", ")} – im Katalognachtrag vermerken.`, "fehler");
      }
      // Einteilung nach Rassen: was beim Übertragen auf die Nummern auffiel.
      const e = r.einteilung;
      if (e?.nichtUebernommen.length) {
        meldung(`Preisrichter-Bereiche nicht neu berechnet, bewertete Tiere würden wechseln (Nr. ${e.nichtUebernommen.slice(0, 10).join(", ")}) – Einteilung unter „Preisrichter“ speichern.`, "fehler");
      } else if (e && (e.ohne > 0 || e.abweichend.length)) {
        const teile = [e.ohne > 0 ? `${e.ohne} Tiere ohne Preisrichter (Rasse nicht eingeteilt)` : "", e.abweichend.length ? `Unternummern einer anderen Rasse beim Preisrichter der Hauptnummer: ${e.abweichend.join(", ")}` : ""];
        meldung(`Preisrichter: ${teile.filter(Boolean).join("; ")}. Bitte unter „Preisrichter“ prüfen.`, "fehler");
      }
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const gedruckt = trpc.katalog.gedrucktSetzen.useMutation({
    onSuccess: (_r, v) => {
      neu();
      meldung(v.gedruckt ? "Katalognummern festgeschrieben." : "Festschreibung aufgehoben.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });

  const eintraege = liste.data ?? [];
  const ohneNr = eintraege.filter((e) => e.katalogNr == null).length;
  const sichtbar = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return eintraege;
    return eintraege.filter((e) => `${formatKatalognummer(e)} ${e.bezeichnung} ${e.ausstellerName}`.toLowerCase().includes(f));
  }, [eintraege, filter]);

  const ladeFehler = schau.error ?? liste.error;
  if (ladeFehler) return <FehlerAnzeige fehler={ladeFehler} nochmal={() => { schau.refetch(); liste.refetch(); }} />;
  if (!schau.data || !liste.data) return <Laden />;
  const s = schau.data;

  const ohneNrMarke = ohneNr > 0 && ohneNr < eintraege.length;

  return (
    <div className={SEITE}>
      <Seitenkopf
        titel="Katalognummern"
        unter={eintraege.length ? `${eintraege.length} Tiere, ${eintraege.length - ohneNr} nummeriert` : undefined}
        marke={s.katalogGedruckt ? <Marke ton="ok">festgeschrieben</Marke> : ohneNrMarke ? <Marke ton="warnung">{ohneNr} ohne Nummer</Marke> : undefined}
        hilfe="katalognummern-vergeben"
        aktionen={
          istAdmin && (
            <>
              {s.katalogGedruckt ? (
                <Knopf
                  variante="leise"
                  onClick={async () =>
                    (await bestaetige({
                      titel: "Festschreibung aufheben?",
                      text: "Beim nächsten Vergeben werden alle Nummern neu gesetzt – gedruckte Bewertungskarten passen dann nicht mehr.",
                      knopf: "Festschreibung aufheben",
                      gefahr: true,
                    })) && gedruckt.mutate({ schauId, gedruckt: false })
                  }
                >
                  Festschreibung aufheben
                </Knopf>
              ) : (
                <Knopf
                  onClick={async () =>
                    (await bestaetige({ titel: "Katalognummern festschreiben?", text: "Danach ändern sich vergebene Nummern nicht mehr.", knopf: "Festschreiben" })) &&
                    gedruckt.mutate({ schauId, gedruckt: true })
                  }
                  disabled={eintraege.length === 0 || ohneNr === eintraege.length}
                >
                  Nummern festschreiben
                </Knopf>
              )}
              <Knopf variante="primaer" laedt={vergeben.isPending} onClick={() => vergeben.mutate({ schauId })} disabled={!s.katalogGedruckt ? false : ohneNr === 0}>
                {s.katalogGedruckt ? "Nachmeldungen nummerieren" : "Katalognummern vergeben"}
              </Knopf>
            </>
          )
        }
      />

      <KatalogReihenfolge schau={s} istAdmin={istAdmin} />

      <Abschnitt titel="Drucken und Exportieren">
        <div className="flex flex-wrap gap-2">
          {[
            ["Bewertungskarten (PDF)", `/datei/${schauId}/bewertungskarten.pdf`],
            ["B-Bögen und Ringkarten (PDF)", `/datei/${schauId}/aussteller.pdf`],
            ["Ergebnisliste (CSV für Excel)", `/datei/${schauId}/ergebnisse.csv`],
          ].map(([t, href]) => (
            <KnopfLink key={href} href={href} target="_blank" rel="noreferrer">
              {t}
            </KnopfLink>
          ))}
        </div>
      </Abschnitt>

      {eintraege.length === 0 ? (
        <Leer titel="Noch keine Tiere im Katalog" />
      ) : (
        <TabellenRahmen
          kopf={<Suchfeld aria-label="Katalog durchsuchen" placeholder="Nummer, Rasse oder Aussteller" value={filter} onChange={(e) => setFilter(e.target.value)} />}
          fuss={
            <>
              <span>
                {sichtbar.length} {sichtbar.length === 1 ? "Tier" : "Tiere"}
                {filter.trim() && ` von ${eintraege.length}`}
              </span>
              {ohneNr > 0 && <span>{ohneNr} ohne Nummer</span>}
            </>
          }
        >
          {sichtbar.length === 0 ? (
            <p className="px-4 py-10 text-center text-grau">Keine Treffer.</p>
          ) : (
            <table className="tabelle">
              <thead>
                <tr>
                  <th className="text-right">Nr.</th>
                  <th>Rasse, Farbenschlag</th>
                  <th>Tier</th>
                  <th>Aussteller</th>
                  <th className="text-right">Verkauf</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sichtbar.map((e) => (
                  <tr key={e.id}>
                    <td className="nummer whitespace-nowrap text-right text-lg">{e.katalogNr == null ? <span className="font-sans text-base font-normal text-grau">–</span> : formatKatalognummer(e)}</td>
                    <td>
                      <span className="font-semibold text-tinte">{e.bezeichnung}</span>
                      <span className="block text-sm text-grau">{e.sparte}{e.istJugend && ", Jugend"}</span>
                    </td>
                    <td className="whitespace-nowrap">
                      {e.geschlecht} {e.alter}
                      {e.art !== "einzeltier" && <span className="block text-sm text-grau">{MELDEART_LABEL[e.art]}</span>}
                    </td>
                    <td>{e.ausstellerName}</td>
                    <td className="text-right tabular-nums">{e.verkaufspreisCent ? formatEuro(e.verkaufspreisCent) : ""}</td>
                    <td>
                      <Marke ton={e.status === "fehlt" ? "fehler" : e.status === "eingeliefert" || e.status === "ausgesetzt" ? "ok" : "neutral"}>{EINTRAG_STATUS_LABEL[e.status]}</Marke>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabellenRahmen>
      )}
    </div>
  );
}
