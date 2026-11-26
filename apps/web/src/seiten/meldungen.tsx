import { MELDUNG_STATUS, type MeldungStatus } from "@schau/domain";
import { useState } from "react";
import { Link } from "react-router-dom";
import { datum, fehlerText, formatEuro } from "../lib";
import { useSchauId } from "../rahmen";
import { useIstAdmin } from "../rolle";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { FehlerAnzeige, Knopf, knopfKlasse, KnopfLink, Laden, Marke, SEITE, Seitenkopf, Segmente, Suchfeld, TabellenRahmen, useFrage, useMeldung } from "../ui";

export const STATUS_TON = { offen: "warnung", bestaetigt: "ok", abgelehnt: "fehler", storniert: "neutral" } as const;

export function Meldungen() {
  const schauId = useSchauId();
  const t = useOberflaeche();
  const tm = t.meldung;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<MeldungStatus | "">("");
  // Ohne Statusfilter laden: die Zahlen je Status stehen im Umschalter, gefiltert wird hier.
  const alle = trpc.meldung.liste.useQuery({ schauId, q, status: null }, { placeholderData: (alt) => alt });
  const teilschauen = trpc.schau.get.useQuery({ id: schauId }).data?.teilschauen ?? [];
  // Mit Teilschauen steht sie bei jeder Meldung (ohne Angabe: die erste).
  const teilschauName = (id: string | null) => (teilschauen.length ? (teilschauen.find((t) => t.id === id) ?? teilschauen[0])!.name : null);
  const liste = { ...alle, data: alle.data?.filter((m) => !status || m.status === status) };
  const anzahl = (s: MeldungStatus) => alle.data?.filter((m) => m.status === s).length ?? 0;
  const summe = (liste.data ?? []).reduce((s, m) => ({ tiere: s.tiere + m.tiere, betrag: s.betrag + m.betragCent, bezahlt: s.bezahlt + m.bezahltCent }), { tiere: 0, betrag: 0, bezahlt: 0 });
  const gesamtTiere = (alle.data ?? []).reduce((s, m) => s + m.tiere, 0);
  // Mehrere offene Meldungen auf einmal ablehnen (z. B. viele unbestätigte Online-Meldungen, die Plätze belegen) – nur
  // die Ausstellungsleitung, je Meldung über statusSetzen mit Protokoll; was nicht geht, meldet der Server je Meldung.
  const istAdmin = useIstAdmin();
  const waehlbar = istAdmin && status === "offen";
  const [auswahl, setAuswahl] = useState<Set<number>>(new Set());
  const gewaehlt = (liste.data ?? []).map((m) => m.id).filter((id) => auswahl.has(id));
  const umschalten = (id: number) => setAuswahl((a) => new Set(a.has(id) ? [...a].filter((x) => x !== id) : [...a, id]));
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const utils = trpc.useUtils();
  const statusSetzen = trpc.meldung.statusSetzen.useMutation();
  const [laeuft, setLaeuft] = useState(false);
  const ablehnen = async () => {
    if (!(await bestaetige({ titel: tm.liste.ablehnenFrage(gewaehlt.length), text: tm.liste.ablehnenText, knopf: tm.liste.ablehnen(gewaehlt.length), gefahr: true }))) return;
    setLaeuft(true);
    let ok = 0;
    let fehler = "";
    for (const id of gewaehlt) {
      try {
        await statusSetzen.mutateAsync({ id, status: "abgelehnt", grund: tm.liste.sammelGrund });
        ok++;
      } catch (e) {
        fehler ||= fehlerText(e);
      }
    }
    setLaeuft(false);
    setAuswahl(new Set());
    await utils.meldung.liste.invalidate();
    meldung([tm.liste.abgelehnt(ok), fehler && tm.liste.nichtAbgelehnt(gewaehlt.length - ok, fehler)].filter(Boolean).join(" · "), fehler ? "warnung" : "ok");
  };

  return (
    <div className={SEITE}>
      <Seitenkopf
        titel={tm.liste.titel}
        unter={alle.data && !q ? tm.liste.unter(alle.data.length, gesamtTiere) : undefined}
        hilfe="phase-meldephase"
        aktionen={
          <>
            <KnopfLink href={`/datei/${schauId}/a-bogen.pdf`} target="_blank" rel="noreferrer">
              {tm.liste.aBogenLeer}
            </KnopfLink>
            <KnopfLink href={`/datei/${schauId}/aussteller.pdf`} target="_blank" rel="noreferrer">
              {tm.liste.bBoegenAlle}
            </KnopfLink>
            {waehlbar && gewaehlt.length > 0 && (
              <Knopf variante="gefahr" laedt={laeuft} onClick={ablehnen}>
                {tm.liste.ablehnen(gewaehlt.length)}
              </Knopf>
            )}
            <Link to="neu" className={knopfKlasse("primaer")}>
              {tm.meldungErfassen}
            </Link>
          </>
        }
      />
      {alle.error && !alle.data ? (
        <FehlerAnzeige fehler={alle.error} nochmal={() => alle.refetch()} />
      ) : alle.isLoading ? (
        <Laden />
      ) : (
        <TabellenRahmen
          kopf={
            <>
              <Suchfeld aria-label={tm.liste.suchen} placeholder={tm.liste.suchPlatzhalter} value={q} onChange={(e) => setQ(e.target.value)} />
              <Segmente
                label={t.allgemein.status}
                wert={status}
                onChange={setStatus}
                optionen={[{ wert: "" as const, label: t.allgemein.alle, anzahl: alle.data?.length }, ...MELDUNG_STATUS.map((s) => ({ wert: s, label: tm.status[s], anzahl: anzahl(s) }))]}
              />
            </>
          }
          fuss={
            liste.data?.length ? (
              <>
                <span>{tm.liste.anzahl(liste.data.length)}</span>
                <span>{tm.liste.summe(summe.tiere, formatEuro(summe.betrag), formatEuro(summe.bezahlt))}</span>
              </>
            ) : undefined
          }
        >
          {liste.data?.length === 0 ? (
            <p className="px-4 py-10 text-center text-grau">{q || status ? tm.keineTreffer : tm.liste.nochKeine}</p>
          ) : (
            <table className="tabelle">
              <thead>
                <tr>
                  {waehlbar && (
                    <th className="w-8">
                      <input type="checkbox" aria-label={tm.liste.alleAuswaehlen} className="size-[1.05rem] accent-band" checked={!!liste.data?.length && gewaehlt.length === liste.data.length} onChange={(e) => setAuswahl(new Set(e.target.checked ? (liste.data ?? []).map((m) => m.id) : []))} />
                    </th>
                  )}
                  <th>{t.allgemein.aussteller}</th>
                  <th>{tm.verein}</th>
                  <th>{tm.liste.eingang}</th>
                  <th className="text-right">{t.allgemein.tiere}</th>
                  <th className="text-right">{t.allgemein.betrag}</th>
                  <th className="text-right">{tm.bezahlt}</th>
                  <th>{t.allgemein.status}</th>
                </tr>
              </thead>
              <tbody>
                {liste.data?.map((m) => (
                  <tr key={m.id}>
                    {waehlbar && (
                      <td>
                        <input type="checkbox" aria-label={tm.liste.auswaehlen(m.name)} className="size-[1.05rem] accent-band" checked={auswahl.has(m.id)} onChange={() => umschalten(m.id)} />
                      </td>
                    )}
                    <td>
                      <Link to={String(m.id)} className="font-semibold text-tinte no-underline hover:text-band hover:underline">
                        {m.name}
                      </Link>
                      <span className="block text-sm text-grau">
                        {m.ort}
                        {teilschauName(m.teilschau) && `, ${teilschauName(m.teilschau)}`}
                        {m.istJugend && tm.liste.jugend}
                        {m.istPreisrichter && tm.liste.preisrichter}
                      </span>
                      {((m.eingang === "online" && (m.istJugend || m.istPreisrichter)) || !m.registriernummer) && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {m.eingang === "online" && (m.istJugend || m.istPreisrichter) && <Marke ton="warnung">{tm.liste.selbstauskunft}</Marke>}
                          {!m.registriernummer && <Marke ton="fehler">{tm.liste.ohneRegistriernummer}</Marke>}
                        </span>
                      )}
                    </td>
                    <td>{m.verein}</td>
                    <td>
                      {tm.eingang[m.eingang]}
                      <span className="block text-sm text-grau">{datum(m.eingegangenAm)}</span>
                    </td>
                    <td className="text-right">{m.tiere}</td>
                    <td className="text-right">{formatEuro(m.betragCent)}</td>
                    <td className={`text-right ${m.bezahltCent >= m.betragCent && m.betragCent > 0 ? "text-stall" : m.bezahltCent > 0 ? "text-stroh-dunkel" : ""}`}>{formatEuro(m.bezahltCent)}</td>
                    <td>
                      <Marke ton={STATUS_TON[m.status]}>{tm.status[m.status]}</Marke>
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
