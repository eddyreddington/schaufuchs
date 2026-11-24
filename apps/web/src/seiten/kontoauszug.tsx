import { serverText } from "@schau/domain";
import { useState } from "react";
import { datum, fehlerText, formatEuro } from "../lib";
import { useSchauId } from "../rahmen";
import { useOberflaeche, useSprache } from "../sprache";
import { ot } from "../sprache-jetzt";
import { trpc, type Ausgabe } from "../trpc";
import { Auswahl, Hinweis, Knopf, Leer, Marke, SEITE, Seitenkopf, TabellenRahmen, useMeldung } from "../ui";

type Bericht = Ausgabe["kontoauszug"]["pruefen"];
const MAX_BYTES = 4 * 1024 * 1024;

/** Datei als Base64 (ohne „data:“-Vorspann). */
function alsBase64(datei: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error(ot().kasse.kontoauszug.nichtGelesen));
    r.readAsDataURL(datei);
  });
}

/**
 * Kontoauszug-Import (Entscheidung 023), nur Administratoren: Datei aus dem Onlinebanking (camt.053 oder CSV) hochladen,
 * Zuordnung prüfen, ausgewählte Gutschriften als Überweisung buchen. Erklärungen im Handbuch („Kontoauszug-Import“).
 */
export function Kontoauszug() {
  const schauId = useSchauId();
  const t = useOberflaeche();
  const tk = t.kasse.kontoauszug;
  const sprache = useSprache();
  const meldung = useMeldung();
  const utils = trpc.useUtils();
  const [datei, setDatei] = useState<{ name: string; base64: string } | null>(null);
  const [feld, setFeld] = useState(0);
  const [bericht, setBericht] = useState<Bericht | null>(null);
  /** Gewählte Meldung je Gutschrift (Schlüssel) und ob sie gebucht werden soll. */
  const [ziel, setZiel] = useState<Record<string, number | null>>({});
  const [haken, setHaken] = useState<Record<string, boolean>>({});
  const pruefen = trpc.kontoauszug.pruefen.useMutation({ onError: (e) => meldung(fehlerText(e), "fehler") });
  const buchen = trpc.kontoauszug.buchen.useMutation({ onError: (e) => meldung(fehlerText(e), "fehler") });

  const lesen = async (d: { name: string; base64: string }) => {
    const r = await pruefen.mutateAsync({ schauId, base64: d.base64 }).catch(() => null);
    if (!r) return;
    // Datei erst übernehmen, wenn sie gelesen ist – sonst buchte der Knopf eine andere Datei als die angezeigte.
    setDatei(d);
    setBericht(r);
    setZiel(Object.fromEntries(r.posten.map((p) => [p.schluessel, p.meldungId])));
    // Vorausgewählt nur, was über die Referenz sicher zugeordnet und noch nicht gebucht ist.
    setHaken(Object.fromEntries(r.posten.map((p) => [p.schluessel, !p.gebucht && p.sicherheit === "referenz" && p.hinweis !== "ueberzahlung"])));
  };
  const waehlen = async (f: File | undefined) => {
    setFeld((n) => n + 1);
    if (!f) return;
    if (f.size > MAX_BYTES) return meldung(tk.zuGross, "fehler");
    setBericht(null);
    setDatei(null);
    await lesen({ name: f.name, base64: await alsBase64(f) });
  };
  const auswahl = (bericht?.posten ?? []).filter((p) => haken[p.schluessel] && ziel[p.schluessel] != null && !p.gebucht);
  const summe = auswahl.reduce((s, p) => s + p.betragCent, 0);
  const jetztBuchen = async () => {
    if (!datei || !auswahl.length) return;
    const r = await buchen.mutateAsync({ schauId, base64: datei.base64, posten: auswahl.map((p) => ({ schluessel: p.schluessel, meldungId: ziel[p.schluessel]!, offenCent: name(ziel[p.schluessel]!)?.offenCent ?? 0 })) }).catch(() => null);
    if (!r) return;
    const teile = [
      tk.zahlungenGebucht(r.gebucht),
      r.bestaetigt ? tk.meldungenBestaetigt(r.bestaetigt) : "",
      r.nichtBestaetigt ? tk.nichtBestaetigt(r.nichtBestaetigt) : "",
      r.uebersprungen.length ? tk.uebersprungen(r.uebersprungen.length, [...new Set(r.uebersprungen.map((u) => serverText(u.grund, sprache)))].join(", ")) : "",
    ];
    meldung(teile.filter(Boolean).join(" · "), r.uebersprungen.length || r.nichtBestaetigt ? "warnung" : "ok");
    await utils.meldung.liste.invalidate({ schauId });
    await lesen(datei);
  };

  const name = (id: number | null) => bericht?.meldungen.find((m) => m.id === id);
  return (
    <div className={SEITE}>
      <Seitenkopf titel={tk.titel} unter={tk.unter} hilfe="kontoauszug" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-linie bg-weiss px-3 py-2 text-sm hover:border-band focus-within:ring-2 focus-within:ring-band">
          <span>{datei ? tk.andereDatei : tk.dateiWaehlen}</span>
          <input key={feld} type="file" accept=".csv,.txt,.xml,text/csv,application/xml,text/xml" className="sr-only" onChange={(e) => void waehlen(e.target.files?.[0])} />
        </label>
        {datei && <span className="text-sm text-grau">{datei.name}</span>}
        {pruefen.isPending && <span className="text-sm text-grau">{tk.wirdGelesen}</span>}
      </div>
      {bericht &&
        (bericht.posten.length === 0 ? (
          <Leer titel={tk.keineGutschriften} />
        ) : (
          <TabellenRahmen
            fuss={
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{tk.gutschriften(bericht.posten.length, bericht.posten.filter((p) => p.gebucht).length)}</span>
                <Knopf variante="primaer" laedt={buchen.isPending} disabled={!auswahl.length} onClick={() => void jetztBuchen()}>
                  {auswahl.length ? tk.zahlungenBuchen(auswahl.length, formatEuro(summe)) : tk.keineAuswahl}
                </Knopf>
              </div>
            }
          >
            <table className="tabelle">
              <thead>
                <tr>
                  <th className="w-8" aria-label={t.kasse.buchen} />
                  <th>{tk.datum}</th>
                  <th className="text-right">{tk.betrag}</th>
                  <th>{tk.vonZweck}</th>
                  <th>{tk.meldung}</th>
                  <th>{tk.stand}</th>
                </tr>
              </thead>
              <tbody>
                {bericht.posten.map((p) => {
                  const m = name(ziel[p.schluessel] ?? null);
                  return (
                    <tr key={p.schluessel} className={p.gebucht ? "text-grau" : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={tk.hakenLabel(datum(p.datum), formatEuro(p.betragCent))}
                          className="size-[1.05rem] accent-band"
                          disabled={p.gebucht || ziel[p.schluessel] == null}
                          checked={!!haken[p.schluessel] && !p.gebucht && ziel[p.schluessel] != null}
                          onChange={(e) => setHaken((h) => ({ ...h, [p.schluessel]: e.target.checked }))}
                        />
                      </td>
                      <td className="tabular-nums">{datum(p.datum)}</td>
                      <td className="text-right tabular-nums">{formatEuro(p.betragCent)}</td>
                      <td className="max-w-[28rem]">
                        <div>{p.name || "–"}</div>
                        <div className="line-clamp-2 break-all text-sm text-grau">{p.zweck}</div>
                      </td>
                      <td>
                        <Auswahl
                          kompakt
                          aria-label={tk.meldungLabel(datum(p.datum), formatEuro(p.betragCent))}
                          disabled={p.gebucht}
                          value={ziel[p.schluessel] ?? ""}
                          onChange={(e) => {
                            // Nicht von selbst ankreuzen: Pfeiltasten im Auswahlfeld wechseln die Meldung ohne Aufklappen.
                            const id = e.target.value ? Number(e.target.value) : null;
                            setZiel((z) => ({ ...z, [p.schluessel]: id }));
                            setHaken((h) => ({ ...h, [p.schluessel]: false }));
                          }}
                        >
                          <option value="">{tk.nichtZuordnen}</option>
                          {bericht.meldungen.map((x) => (
                            <option key={x.id} value={x.id}>
                              {tk.offen(x.name, formatEuro(Math.max(0, x.offenCent)))}
                            </option>
                          ))}
                        </Auswahl>
                      </td>
                      <td>
                        {p.gebucht ? (
                          <Marke ton="neutral">{tk.gebucht}</Marke>
                        ) : m && ziel[p.schluessel] === p.meldungId && p.sicherheit === "referenz" ? (
                          <Marke ton={p.hinweis === "passt" ? "ok" : "warnung"}>{p.hinweis === "teilzahlung" ? tk.teilzahlung : p.hinweis === "ueberzahlung" ? tk.zuViel : tk.referenz}</Marke>
                        ) : m && ziel[p.schluessel] === p.meldungId && p.sicherheit === "name" ? (
                          <Marke ton="warnung">{tk.vorschlag}</Marke>
                        ) : m && p.betragCent > Math.max(0, m.offenCent) ? (
                          <Marke ton="warnung">{tk.zuViel}</Marke>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TabellenRahmen>
        ))}
      {bericht && bericht.posten.some((p) => p.sicherheit === "name" && !p.gebucht) && <Hinweis ton="warnung">{tk.vorschlagHinweis}</Hinweis>}
    </div>
  );
}
