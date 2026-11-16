import { GLEICHSTAND_KRITERIEN, type GleichstandKriterium, type MeisterschaftRegel, type MeisterschaftVorlage, type OberflaecheTexte } from "@schau/domain";
import { useState } from "react";
import { Link } from "react-router-dom";
import { fehlerText } from "../lib";
import { useOberflaeche } from "../sprache";
import { trpc } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, FehlerAnzeige, Feld, Haken, HilfeLink, Knopf, Laden, Leer, Segmente, Speicherleiste, useAenderungenWarnen, useMeldung } from "../ui";

/** Vorlagen in der Reihenfolge der Auswahl; die Namen stehen in den Texten der Oberfläche. */
const VORLAGEN: MeisterschaftVorlage[] = ["zuchtpreis", "leistungspreis", "bundessieger", "jugend", "verein"];

/**
 * Einstellungen der Schau, Abschnitt „Meisterschaften“: Wertungen aus Vorlagen anlegen und anpassen (Tierzahl je
 * Sparte, Alter, Geschlechter, Mindestpunkte, Mindestbeteiligung, Gleichstand). Speichern oben rechts.
 */
export function MeisterschaftenAbschnitt({ schauId, darfAendern }: { schauId: number; darfAendern: boolean }) {
  const q = trpc.meisterschaft.regeln.useQuery({ schauId });
  if (q.error) return <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />;
  if (!q.data) return <Laden />;
  return <Bearbeiten key={JSON.stringify(q.data.regeln)} schauId={schauId} start={q.data.regeln} vorlagen={q.data.vorlagen} darfAendern={darfAendern} />;
}

function Bearbeiten({ schauId, start, vorlagen, darfAendern }: { schauId: number; start: MeisterschaftRegel[]; vorlagen: Record<MeisterschaftVorlage, MeisterschaftRegel>; darfAendern: boolean }) {
  const t = useOberflaeche();
  const tm = t.ehrenpreise.meisterschaft;
  const [regeln, setRegeln] = useState(start);
  const [vorlage, setVorlage] = useState<MeisterschaftVorlage>("zuchtpreis");
  const [offen, setOffen] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const gespeichert = useAenderungenWarnen(regeln);
  const speichern = trpc.meisterschaft.speichern.useMutation({
    onSuccess: async () => {
      gespeichert();
      await Promise.all([utils.meisterschaft.regeln.invalidate({ schauId }), utils.meisterschaft.ergebnisse.invalidate({ schauId })]);
      meldung(tm.gespeichert);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const geaendert = JSON.stringify(regeln) !== JSON.stringify(start);
  const setze = (i: number, teil: Partial<MeisterschaftRegel>) => setRegeln(regeln.map((r, j) => (j === i ? { ...r, ...teil } : r)));
  return (
    <Abschnitt
      id="meisterschaften"
      titel={tm.titel}
      aktionen={
        <span className="flex flex-wrap items-center gap-3">
          <HilfeLink abschnitt="meisterschaften">{tm.hilfe}</HilfeLink>
          <Link to={`/schau/${schauId}/meisterschaften`} className="text-sm font-semibold text-band no-underline hover:underline">
            {tm.ergebnisse}
          </Link>
        </span>
      }
    >
      {regeln.length === 0 && <Leer titel={tm.keine} />}
      <ul className="flex flex-col gap-3">
        {regeln.map((r, i) => (
          <li key={i} className="rounded-lg border border-linie">
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <button type="button" className="min-w-0 flex-1 text-left font-semibold" onClick={() => setOffen(offen === i ? null : i)} aria-expanded={offen === i}>
                {r.name}
                <span className="block text-sm font-normal text-grau">{zusammenfassung(t, r)}</span>
              </button>
              {darfAendern && (
                <Knopf
                  variante="leise"
                  onClick={() => {
                    setRegeln(regeln.filter((_, j) => j !== i));
                    setOffen(null);
                  }}
                >
                  {t.allgemein.entfernen}
                </Knopf>
              )}
            </div>
            {offen === i && (
              <fieldset disabled={!darfAendern} className="border-t border-linie px-4 py-4">
                <RegelFormular r={r} setze={(teil) => setze(i, teil)} />
              </fieldset>
            )}
          </li>
        ))}
      </ul>
      {darfAendern && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Feld label={tm.vorlage} className="min-w-64">
            {(id) => (
              <Auswahl id={id} value={vorlage} onChange={(e) => setVorlage(e.target.value as MeisterschaftVorlage)}>
                {VORLAGEN.map((k) => (
                  <option key={k} value={k}>
                    {tm.vorlagen[k]}
                  </option>
                ))}
              </Auswahl>
            )}
          </Feld>
          <Knopf
            onClick={() => {
              setRegeln([...regeln, structuredClone(vorlagen[vorlage])]);
              setOffen(regeln.length);
            }}
          >
            {tm.hinzufuegen}
          </Knopf>
        </div>
      )}
      <Speicherleiste sichtbar={geaendert} onVerwerfen={() => setRegeln(start)} onSpeichern={() => speichern.mutate({ schauId, regeln })} laedt={speichern.isPending} knopf={tm.speichern} />
    </Abschnitt>
  );
}

function zusammenfassung(t: OberflaecheTexte, r: MeisterschaftRegel) {
  const tm = t.ehrenpreise.meisterschaft;
  const teile = [
    r.art === "verein" ? tm.vereine(r.tiere, r.verein.minZuechter, r.verein.minSparten) : r.einheit === "rasse" ? tm.tiereJeRasse(r.tiere) : tm.tiereJeFarbenschlag(r.tiere),
    r.alter === "jung" ? tm.nurJungtiere : r.maxAlttiere != null && r.art === "einzel" ? tm.hoechstensAlttiere(r.maxAlttiere) : tm.jungUndAlt,
    r.beideGeschlechter ? tm.beideGeschlechter : "",
    r.mindestPunkte != null ? tm.abPunkten(r.mindestPunkte) : "",
    r.jugend === "nur" ? tm.nurJugend : r.jugend === "getrennt" ? tm.jugendGetrennt : r.jugend === "ohne" ? tm.ohneJugend : "",
  ];
  return teile.filter(Boolean).join(" · ");
}

const zahl = (w: string) => (w.trim() === "" ? null : Number(w));

function Zahl({ label, wert, setzen, leer, hinweis }: { label: string; wert: number | null; setzen: (w: number | null) => void; leer?: boolean; hinweis?: string }) {
  const t = useOberflaeche();
  return (
    <Feld label={label} hinweis={hinweis}>
      {(id) => <Eingabe id={id} type="number" min={0} value={wert ?? ""} placeholder={leer ? t.ehrenpreise.meisterschaft.keinePlatzhalter : undefined} onChange={(e) => setzen(leer ? zahl(e.target.value) : Number(e.target.value))} />}
    </Feld>
  );
}

function RegelFormular({ r, setze }: { r: MeisterschaftRegel; setze: (teil: Partial<MeisterschaftRegel>) => void }) {
  const t = useOberflaeche();
  const tm = t.ehrenpreise.meisterschaft;
  const verein = r.art === "verein";
  const schieben = (i: number, um: -1 | 1) => {
    const g = [...r.gleichstand];
    const j = i + um;
    if (j < 0 || j >= g.length) return;
    [g[i], g[j]] = [g[j]!, g[i]!];
    setze({ gleichstand: g });
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Feld label={t.allgemein.name} className="md:col-span-3">{(id) => <Eingabe id={id} value={r.name} maxLength={80} onChange={(e) => setze({ name: e.target.value })} />}</Feld>
        <div className="md:col-span-3">
          <Segmente label={tm.wertung} wert={r.art} onChange={(art) => setze({ art })} optionen={[{ wert: "einzel", label: tm.jeAussteller }, { wert: "verein", label: tm.jeVerein }]} />
        </div>
        {!verein && (
          <Feld label={tm.gewertetJe}>
            {(id) => (
              <Auswahl id={id} value={r.einheit} onChange={(e) => setze({ einheit: e.target.value as MeisterschaftRegel["einheit"] })}>
                <option value="farbenschlag">{tm.rasseUndFarbenschlag}</option>
                <option value="rasse">{tm.rasse}</option>
              </Auswahl>
            )}
          </Feld>
        )}
        <Zahl label={tm.gewerteteTiere} wert={r.tiere} setzen={(w) => setze({ tiere: w || 1 })} />
        <Zahl label={tm.mindestpunkte} wert={r.mindestPunkte} setzen={(w) => setze({ mindestPunkte: w })} leer />
        <Zahl label={tm.mindestpunkteJugend} wert={r.mindestPunkteJugend} setzen={(w) => setze({ mindestPunkteJugend: w })} leer hinweis={tm.wieOben} />
        {verein && (
          <>
            <Zahl label={tm.mindestensZuechter} wert={r.verein.minZuechter} setzen={(w) => setze({ verein: { ...r.verein, minZuechter: w ?? 1 } })} />
            <Zahl label={tm.mindestensSparten} wert={r.verein.minSparten} setzen={(w) => setze({ verein: { ...r.verein, minSparten: w ?? 1 } })} />
            <Zahl label={tm.hoechstensTiereJeZuechter} wert={r.verein.maxTiereJeZuechter} setzen={(w) => setze({ verein: { ...r.verein, maxTiereJeZuechter: w } })} leer />
          </>
        )}
      </div>
      {!verein && (
        <div>
          <p className="mb-1 text-sm font-semibold">{tm.abweichendJeSparte}</p>
          {r.sparten.map((s, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_6rem_7rem_7rem_auto] items-end gap-2">
              <Eingabe aria-label={tm.sparte} value={s.sparte} placeholder={tm.sparteBeispiel} onChange={(e) => setze({ sparten: r.sparten.map((x, j) => (j === i ? { ...x, sparte: e.target.value } : x)) })} />
              <Eingabe aria-label={t.allgemein.tiere} type="number" min={1} value={s.tiere} onChange={(e) => setze({ sparten: r.sparten.map((x, j) => (j === i ? { ...x, tiere: Number(e.target.value) } : x)) })} />
              <Eingabe aria-label={tm.mindestpunkte} type="number" placeholder={tm.mindestpunkte} value={s.mindestPunkte ?? ""} onChange={(e) => setze({ sparten: r.sparten.map((x, j) => (j === i ? { ...x, mindestPunkte: zahl(e.target.value) } : x)) })} />
              <Eingabe aria-label={tm.mindestpunkteJugend} type="number" placeholder={tm.jugend} value={s.mindestPunkteJugend ?? ""} onChange={(e) => setze({ sparten: r.sparten.map((x, j) => (j === i ? { ...x, mindestPunkteJugend: zahl(e.target.value) } : x)) })} />
              <Knopf variante="leise" aria-label={tm.sparteEntfernen} onClick={() => setze({ sparten: r.sparten.filter((_, j) => j !== i) })}>
                ✕
              </Knopf>
            </div>
          ))}
          <Knopf variante="leise" onClick={() => setze({ sparten: [...r.sparten, { sparte: "", tiere: r.tiere, mindestPunkte: null, mindestPunkteJugend: null }] })}>
            {tm.sparteHinzufuegen}
          </Knopf>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <Feld label={tm.alter}>
          {(id) => (
            <Auswahl id={id} value={r.alter} onChange={(e) => setze({ alter: e.target.value as MeisterschaftRegel["alter"] })}>
              <option value="jung">{tm.nurJungtiere}</option>
              <option value="beide">{tm.jungUndAlt}</option>
            </Auswahl>
          )}
        </Feld>
        {r.alter === "beide" && !verein && <Zahl label={tm.hoechstensAlttiereFeld} wert={r.maxAlttiere} setzen={(w) => setze({ maxAlttiere: w })} leer />}
        <Feld label={tm.jugend}>
          {(id) => (
            <Auswahl id={id} value={r.jugend} onChange={(e) => setze({ jugend: e.target.value as MeisterschaftRegel["jugend"] })}>
              <option value="gemeinsam">{tm.mitSenioren}</option>
              <option value="getrennt">{tm.getrenntGewertet}</option>
              <option value="ohne">{tm.ohneJugend}</option>
              <option value="nur">{tm.nurJugend}</option>
            </Auswahl>
          )}
        </Feld>
        <Feld label={tm.werNimmtTeil}>
          {(id) => (
            <Auswahl id={id} value={r.berechtigung} onChange={(e) => setze({ berechtigung: e.target.value as MeisterschaftRegel["berechtigung"] })}>
              <option value="alle">{tm.alleAussteller}</option>
              <option value="vereinsmitglieder">{tm.nurVereinsmitglieder}</option>
            </Auswahl>
          )}
        </Feld>
        <Zahl label={verein ? tm.mindestensVereine : tm.mindestensAussteller} wert={r.mindestAussteller} setzen={(w) => setze({ mindestAussteller: w ?? 1 })} />
        {!verein && <Zahl label={tm.mindestensTiereJeEinheit} wert={r.mindestTiere} setzen={(w) => setze({ mindestTiere: w ?? 0 })} />}
      </div>
      <div className="flex flex-col gap-2">
        {!verein && <Haken label={tm.beideGeschlechterHaken} checked={r.beideGeschlechter} onChange={(beideGeschlechter) => setze({ beideGeschlechter })} />}
        <Haken label={tm.eigeneZucht} checked={r.nurEigeneZucht} onChange={(nurEigeneZucht) => setze({ nurEigeneZucht })} />
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold">{tm.gleichstand}</p>
        <ol className="divide-y divide-linie rounded-lg border border-linie">
          {r.gleichstand.map((k, i) => (
            <li key={k} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="flex-1">
                {i + 1}. {t.fach.GLEICHSTAND_LABEL[k]}
              </span>
              <Knopf variante="leise" aria-label={tm.nachOben} disabled={i === 0} onClick={() => schieben(i, -1)}>
                ↑
              </Knopf>
              <Knopf variante="leise" aria-label={tm.nachUnten} disabled={i === r.gleichstand.length - 1} onClick={() => schieben(i, 1)}>
                ↓
              </Knopf>
              <Knopf variante="leise" aria-label={tm.entfernen} onClick={() => setze({ gleichstand: r.gleichstand.filter((x) => x !== k) })}>
                ✕
              </Knopf>
            </li>
          ))}
        </ol>
        <div className="mt-2 flex flex-wrap gap-2">
          {GLEICHSTAND_KRITERIEN.filter((k) => !r.gleichstand.includes(k)).map((k: GleichstandKriterium) => (
            <Knopf key={k} variante="leise" onClick={() => setze({ gleichstand: [...r.gleichstand, k] })}>
              + {t.fach.GLEICHSTAND_LABEL[k]}
            </Knopf>
          ))}
        </div>
        <div className="mt-3">
          <Segmente
            label={tm.danachGleich}
            wert={r.beiGleichstand}
            onChange={(beiGleichstand) => setze({ beiGleichstand })}
            optionen={[
              { wert: "offen", label: tm.leitungEntscheidet },
              { wert: "doppelt", label: tm.beideTitel },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
