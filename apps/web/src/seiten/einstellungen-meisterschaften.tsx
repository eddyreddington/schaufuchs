import { GLEICHSTAND_KRITERIEN, GLEICHSTAND_LABEL, type GleichstandKriterium, type MeisterschaftRegel, type MeisterschaftVorlage } from "@schau/domain";
import { useState } from "react";
import { Link } from "react-router-dom";
import { fehlerText } from "../lib";
import { trpc } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, FehlerAnzeige, Feld, Haken, HilfeLink, Knopf, Laden, Leer, Segmente, Speicherleiste, useAenderungenWarnen, useMeldung } from "../ui";

const ART_LABEL: Record<MeisterschaftVorlage, string> = {
  zuchtpreis: "Zuchtpreis (AAB)",
  leistungspreis: "Leistungspreis (AAB)",
  bundessieger: "Bundessieger (BDRG)",
  jugend: "Deutsche Jugendmeisterschaft (BDRG)",
  verein: "Vereinsmeisterschaft",
};

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
      meldung("Meisterschaften gespeichert.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const geaendert = JSON.stringify(regeln) !== JSON.stringify(start);
  const setze = (i: number, teil: Partial<MeisterschaftRegel>) => setRegeln(regeln.map((r, j) => (j === i ? { ...r, ...teil } : r)));
  return (
    <Abschnitt
      id="meisterschaften"
      titel="Meisterschaften"
      aktionen={
        <span className="flex flex-wrap items-center gap-3">
          <HilfeLink abschnitt="meisterschaften">Hilfe zu Meisterschaften</HilfeLink>
          <Link to={`/schau/${schauId}/meisterschaften`} className="text-sm font-semibold text-band no-underline hover:underline">
            Ergebnisse
          </Link>
        </span>
      }
    >
      {regeln.length === 0 && <Leer titel="Keine Meisterschaft eingerichtet" />}
      <ul className="flex flex-col gap-3">
        {regeln.map((r, i) => (
          <li key={i} className="rounded-lg border border-linie">
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <button type="button" className="min-w-0 flex-1 text-left font-semibold" onClick={() => setOffen(offen === i ? null : i)} aria-expanded={offen === i}>
                {r.name}
                <span className="block text-sm font-normal text-grau">{zusammenfassung(r)}</span>
              </button>
              {darfAendern && (
                <Knopf
                  variante="leise"
                  onClick={() => {
                    setRegeln(regeln.filter((_, j) => j !== i));
                    setOffen(null);
                  }}
                >
                  Entfernen
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
          <Feld label="Vorlage" className="min-w-64">
            {(id) => (
              <Auswahl id={id} value={vorlage} onChange={(e) => setVorlage(e.target.value as MeisterschaftVorlage)}>
                {(Object.keys(ART_LABEL) as MeisterschaftVorlage[]).map((k) => (
                  <option key={k} value={k}>
                    {ART_LABEL[k]}
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
            Meisterschaft hinzufügen
          </Knopf>
        </div>
      )}
      <Speicherleiste sichtbar={geaendert} onVerwerfen={() => setRegeln(start)} onSpeichern={() => speichern.mutate({ schauId, regeln })} laedt={speichern.isPending} knopf="Meisterschaften speichern" />
    </Abschnitt>
  );
}

function zusammenfassung(r: MeisterschaftRegel) {
  const teile = [
    r.art === "verein" ? `Vereine: ${r.tiere} Tiere, ${r.verein.minZuechter} Züchter, ${r.verein.minSparten} Sparten` : `${r.tiere} Tiere je ${r.einheit === "rasse" ? "Rasse" : "Farbenschlag"}`,
    r.alter === "jung" ? "nur Jungtiere" : r.maxAlttiere != null && r.art === "einzel" ? `höchstens ${r.maxAlttiere} Alttiere` : "jung und alt",
    r.beideGeschlechter ? "beide Geschlechter" : "",
    r.mindestPunkte != null ? `ab ${r.mindestPunkte} Punkten` : "",
    r.jugend === "nur" ? "nur Jugend" : r.jugend === "getrennt" ? "Jugend getrennt" : r.jugend === "ohne" ? "ohne Jugend" : "",
  ];
  return teile.filter(Boolean).join(" · ");
}

const zahl = (w: string) => (w.trim() === "" ? null : Number(w));

function Zahl({ label, wert, setzen, leer, hinweis }: { label: string; wert: number | null; setzen: (w: number | null) => void; leer?: boolean; hinweis?: string }) {
  return (
    <Feld label={label} hinweis={hinweis}>
      {(id) => <Eingabe id={id} type="number" min={0} value={wert ?? ""} placeholder={leer ? "keine" : undefined} onChange={(e) => setzen(leer ? zahl(e.target.value) : Number(e.target.value))} />}
    </Feld>
  );
}

function RegelFormular({ r, setze }: { r: MeisterschaftRegel; setze: (teil: Partial<MeisterschaftRegel>) => void }) {
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
        <Feld label="Name" className="md:col-span-3">{(id) => <Eingabe id={id} value={r.name} maxLength={80} onChange={(e) => setze({ name: e.target.value })} />}</Feld>
        <div className="md:col-span-3">
          <Segmente label="Wertung" wert={r.art} onChange={(art) => setze({ art })} optionen={[{ wert: "einzel", label: "je Aussteller" }, { wert: "verein", label: "je Verein" }]} />
        </div>
        {!verein && (
          <Feld label="Gewertet je">
            {(id) => (
              <Auswahl id={id} value={r.einheit} onChange={(e) => setze({ einheit: e.target.value as MeisterschaftRegel["einheit"] })}>
                <option value="farbenschlag">Rasse und Farbenschlag</option>
                <option value="rasse">Rasse</option>
              </Auswahl>
            )}
          </Feld>
        )}
        <Zahl label="Gewertete Tiere" wert={r.tiere} setzen={(w) => setze({ tiere: w || 1 })} />
        <Zahl label="Mindestpunkte" wert={r.mindestPunkte} setzen={(w) => setze({ mindestPunkte: w })} leer />
        <Zahl label="Mindestpunkte Jugend" wert={r.mindestPunkteJugend} setzen={(w) => setze({ mindestPunkteJugend: w })} leer hinweis="leer: wie oben" />
        {verein && (
          <>
            <Zahl label="Mindestens Züchter" wert={r.verein.minZuechter} setzen={(w) => setze({ verein: { ...r.verein, minZuechter: w ?? 1 } })} />
            <Zahl label="Mindestens Sparten" wert={r.verein.minSparten} setzen={(w) => setze({ verein: { ...r.verein, minSparten: w ?? 1 } })} />
            <Zahl label="Höchstens Tiere je Züchter" wert={r.verein.maxTiereJeZuechter} setzen={(w) => setze({ verein: { ...r.verein, maxTiereJeZuechter: w } })} leer />
          </>
        )}
      </div>
      {!verein && (
        <div>
          <p className="mb-1 text-sm font-semibold">Abweichend je Sparte</p>
          {r.sparten.map((s, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_6rem_7rem_7rem_auto] items-end gap-2">
              <Eingabe aria-label="Sparte" value={s.sparte} placeholder="z. B. Zwerghühner" onChange={(e) => setze({ sparten: r.sparten.map((x, j) => (j === i ? { ...x, sparte: e.target.value } : x)) })} />
              <Eingabe aria-label="Tiere" type="number" min={1} value={s.tiere} onChange={(e) => setze({ sparten: r.sparten.map((x, j) => (j === i ? { ...x, tiere: Number(e.target.value) } : x)) })} />
              <Eingabe aria-label="Mindestpunkte" type="number" placeholder="Mindestpunkte" value={s.mindestPunkte ?? ""} onChange={(e) => setze({ sparten: r.sparten.map((x, j) => (j === i ? { ...x, mindestPunkte: zahl(e.target.value) } : x)) })} />
              <Eingabe aria-label="Mindestpunkte Jugend" type="number" placeholder="Jugend" value={s.mindestPunkteJugend ?? ""} onChange={(e) => setze({ sparten: r.sparten.map((x, j) => (j === i ? { ...x, mindestPunkteJugend: zahl(e.target.value) } : x)) })} />
              <Knopf variante="leise" aria-label="Sparte entfernen" onClick={() => setze({ sparten: r.sparten.filter((_, j) => j !== i) })}>
                ✕
              </Knopf>
            </div>
          ))}
          <Knopf variante="leise" onClick={() => setze({ sparten: [...r.sparten, { sparte: "", tiere: r.tiere, mindestPunkte: null, mindestPunkteJugend: null }] })}>
            Sparte hinzufügen
          </Knopf>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <Feld label="Alter">
          {(id) => (
            <Auswahl id={id} value={r.alter} onChange={(e) => setze({ alter: e.target.value as MeisterschaftRegel["alter"] })}>
              <option value="jung">nur Jungtiere</option>
              <option value="beide">jung und alt</option>
            </Auswahl>
          )}
        </Feld>
        {r.alter === "beide" && !verein && <Zahl label="Höchstens Alttiere" wert={r.maxAlttiere} setzen={(w) => setze({ maxAlttiere: w })} leer />}
        <Feld label="Jugend">
          {(id) => (
            <Auswahl id={id} value={r.jugend} onChange={(e) => setze({ jugend: e.target.value as MeisterschaftRegel["jugend"] })}>
              <option value="gemeinsam">mit den Senioren</option>
              <option value="getrennt">getrennt gewertet</option>
              <option value="ohne">ohne Jugend</option>
              <option value="nur">nur Jugend</option>
            </Auswahl>
          )}
        </Feld>
        <Feld label="Wer nimmt teil">
          {(id) => (
            <Auswahl id={id} value={r.berechtigung} onChange={(e) => setze({ berechtigung: e.target.value as MeisterschaftRegel["berechtigung"] })}>
              <option value="alle">alle Aussteller</option>
              <option value="vereinsmitglieder">nur Vereinsmitglieder</option>
            </Auswahl>
          )}
        </Feld>
        <Zahl label={verein ? "Mindestens Vereine" : "Mindestens Aussteller"} wert={r.mindestAussteller} setzen={(w) => setze({ mindestAussteller: w ?? 1 })} />
        {!verein && <Zahl label="Mindestens Tiere je Einheit" wert={r.mindestTiere} setzen={(w) => setze({ mindestTiere: w ?? 0 })} />}
      </div>
      <div className="flex flex-col gap-2">
        {!verein && <Haken label="Beide Geschlechter unter den gewerteten Tieren (1,3 bis 3,1)" checked={r.beideGeschlechter} onChange={(beideGeschlechter) => setze({ beideGeschlechter })} />}
        <Haken label="Nur Tiere aus eigener Zucht" checked={r.nurEigeneZucht} onChange={(nurEigeneZucht) => setze({ nurEigeneZucht })} />
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold">Bei gleicher Punktsumme entscheidet, der Reihe nach</p>
        <ol className="divide-y divide-linie rounded-lg border border-linie">
          {r.gleichstand.map((k, i) => (
            <li key={k} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="flex-1">
                {i + 1}. {GLEICHSTAND_LABEL[k]}
              </span>
              <Knopf variante="leise" aria-label="nach oben" disabled={i === 0} onClick={() => schieben(i, -1)}>
                ↑
              </Knopf>
              <Knopf variante="leise" aria-label="nach unten" disabled={i === r.gleichstand.length - 1} onClick={() => schieben(i, 1)}>
                ↓
              </Knopf>
              <Knopf variante="leise" aria-label="entfernen" onClick={() => setze({ gleichstand: r.gleichstand.filter((x) => x !== k) })}>
                ✕
              </Knopf>
            </li>
          ))}
        </ol>
        <div className="mt-2 flex flex-wrap gap-2">
          {GLEICHSTAND_KRITERIEN.filter((k) => !r.gleichstand.includes(k)).map((k: GleichstandKriterium) => (
            <Knopf key={k} variante="leise" onClick={() => setze({ gleichstand: [...r.gleichstand, k] })}>
              + {GLEICHSTAND_LABEL[k]}
            </Knopf>
          ))}
        </div>
        <div className="mt-3">
          <Segmente
            label="Danach immer noch gleich"
            wert={r.beiGleichstand}
            onChange={(beiGleichstand) => setze({ beiGleichstand })}
            optionen={[
              { wert: "offen", label: "Ausstellungsleitung entscheidet" },
              { wert: "doppelt", label: "beide erhalten den Titel" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
