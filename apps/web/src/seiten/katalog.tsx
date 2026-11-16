import { useMemo, useState } from "react";
import { fehlerText, formatEuro, formatKatalognummer } from "../lib";
import { useSchauId } from "../rahmen";
import { useOberflaeche } from "../sprache";
import { KatalogReihenfolge } from "./katalog-reihenfolge";
import { trpc } from "../trpc";
import { Abschnitt, FehlerAnzeige, Knopf, KnopfLink, Laden, Leer, Marke, SEITE, Seitenkopf, Suchfeld, TabellenRahmen, useFrage, useMeldung } from "../ui";

export function Katalog() {
  const t = useOberflaeche();
  const tk = t.katalog.nummern;
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
      meldung(r.nachmeldungen ? tk.nachmeldungenNummeriert(r.geaendert) : tk.nummernVergebenMeldung(r.geaendert));
      if (r.ausserhalbDerFolge.length) {
        meldung(tk.ausserhalbFolge(r.ausserhalbDerFolge.join(", ")), "fehler");
      }
      // Einteilung nach Rassen: was beim Übertragen auf die Nummern auffiel.
      const e = r.einteilung;
      if (e?.nichtUebernommen.length) {
        meldung(tk.bereicheNichtNeu(e.nichtUebernommen.slice(0, 10).join(", ")), "fehler");
      } else if (e && (e.ohne > 0 || e.abweichend.length)) {
        const teile = [e.ohne > 0 ? tk.ohnePreisrichter(e.ohne) : "", e.abweichend.length ? tk.unternummernAbweichend(e.abweichend.join(", ")) : ""];
        meldung(tk.preisrichterPruefen(teile.filter(Boolean).join("; ")), "fehler");
      }
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const gedruckt = trpc.katalog.gedrucktSetzen.useMutation({
    onSuccess: (_r, v) => {
      neu();
      meldung(v.gedruckt ? tk.festgeschriebenMeldung : tk.aufgehobenMeldung);
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
        titel={tk.titel}
        unter={eintraege.length ? tk.unter(eintraege.length, eintraege.length - ohneNr) : undefined}
        marke={s.katalogGedruckt ? <Marke ton="ok">{tk.festgeschrieben}</Marke> : ohneNrMarke ? <Marke ton="warnung">{tk.ohneNummer(ohneNr)}</Marke> : undefined}
        hilfe="katalognummern-vergeben"
        aktionen={
          istAdmin && (
            <>
              {s.katalogGedruckt ? (
                <Knopf
                  variante="leise"
                  onClick={async () =>
                    (await bestaetige({
                      titel: tk.aufhebenTitel,
                      text: tk.aufhebenText,
                      knopf: tk.aufhebenKnopf,
                      gefahr: true,
                    })) && gedruckt.mutate({ schauId, gedruckt: false })
                  }
                >
                  {tk.aufhebenKnopf}
                </Knopf>
              ) : (
                <Knopf
                  onClick={async () =>
                    (await bestaetige({ titel: tk.festschreibenTitel, text: tk.festschreibenText, knopf: tk.festschreibenKnopf })) &&
                    gedruckt.mutate({ schauId, gedruckt: true })
                  }
                  disabled={eintraege.length === 0 || ohneNr === eintraege.length}
                >
                  {tk.nummernFestschreiben}
                </Knopf>
              )}
              <Knopf variante="primaer" laedt={vergeben.isPending} onClick={() => vergeben.mutate({ schauId })} disabled={!s.katalogGedruckt ? false : ohneNr === 0}>
                {s.katalogGedruckt ? tk.nachmeldungenNummerieren : tk.nummernVergeben}
              </Knopf>
            </>
          )
        }
      />

      <KatalogReihenfolge schau={s} istAdmin={istAdmin} />

      <Abschnitt titel={tk.drucken}>
        <div className="flex flex-wrap gap-2">
          {[
            [tk.bewertungskartenPdf, `/datei/${schauId}/bewertungskarten.pdf`],
            [tk.bBoegenPdf, `/datei/${schauId}/aussteller.pdf`],
            [tk.ergebnislisteCsv, `/datei/${schauId}/ergebnisse.csv`],
          ].map(([text, href]) => (
            <KnopfLink key={href} href={href} target="_blank" rel="noreferrer">
              {text}
            </KnopfLink>
          ))}
        </div>
      </Abschnitt>

      {eintraege.length === 0 ? (
        <Leer titel={tk.leer} />
      ) : (
        <TabellenRahmen
          kopf={<Suchfeld aria-label={tk.durchsuchen} placeholder={tk.suchePlatzhalter} value={filter} onChange={(e) => setFilter(e.target.value)} />}
          fuss={
            <>
              <span>
                {filter.trim() ? tk.anzahlVon(sichtbar.length, eintraege.length) : tk.anzahl(sichtbar.length)}
              </span>
              {ohneNr > 0 && <span>{tk.ohneNummer(ohneNr)}</span>}
            </>
          }
        >
          {sichtbar.length === 0 ? (
            <p className="px-4 py-10 text-center text-grau">{tk.keineTreffer}</p>
          ) : (
            <table className="tabelle">
              <thead>
                <tr>
                  <th className="text-right">{tk.nr}</th>
                  <th>{tk.rasseFarbenschlag}</th>
                  <th>{tk.tier}</th>
                  <th>{tk.aussteller}</th>
                  <th className="text-right">{tk.verkauf}</th>
                  <th>{tk.statusSpalte}</th>
                </tr>
              </thead>
              <tbody>
                {sichtbar.map((e) => (
                  <tr key={e.id}>
                    <td className="nummer whitespace-nowrap text-right text-lg">{e.katalogNr == null ? <span className="font-sans text-base font-normal text-grau">–</span> : formatKatalognummer(e)}</td>
                    <td>
                      <span className="font-semibold text-tinte">{e.bezeichnung}</span>
                      <span className="block text-sm text-grau">{e.sparte}{e.istJugend && tk.jugend}</span>
                    </td>
                    <td className="whitespace-nowrap">
                      {e.geschlecht} {e.alter}
                      {e.art !== "einzeltier" && <span className="block text-sm text-grau">{t.fach.MELDEART_LABEL[e.art]}</span>}
                    </td>
                    <td>{e.ausstellerName}</td>
                    <td className="text-right tabular-nums">{e.verkaufspreisCent ? formatEuro(e.verkaufspreisCent) : ""}</td>
                    <td>
                      <Marke ton={e.status === "fehlt" ? "fehler" : e.status === "eingeliefert" || e.status === "ausgesetzt" ? "ok" : "neutral"}>{tk.status[e.status]}</Marke>
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
