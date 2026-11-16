/** Preisrichter-Tablet: Bewertungskarte eines Tieres (Note, Texte mit Bausteinen, Preise). */
import { bausteinFuerTier, bewertungsText, brauchtObmann, erlaubtePunkte, SONDERNOTEN, sortiereGruppen, type NotenStufe, type Sondernote } from "@schau/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { fehlerText, formatKatalognummer } from "../lib";
import { useOberflaeche } from "../sprache";
import { direkt } from "../trpc";
import { Hinweis, Knopf, useFrage, useMeldung } from "../ui";
import { gleicherStand, MAX_TEXT, standVon, textZuLang, type Daten, type Eingabe, type Stand, type Tier } from "./richter-geraet";

export function Karte({
  tier,
  daten,
  online,
  speichern,
  zuruecknehmen,
  neuLaden,
  beiAenderung,
}: {
  tier: Tier & { wartet: boolean };
  daten: Daten;
  online: boolean;
  speichern: (a: Eingabe) => void;
  zuruecknehmen: (id: number) => void;
  neuLaden: () => void;
  beiAenderung: (ungespeichert: boolean) => void;
}) {
  const o = useOberflaeche();
  const t = o.tablet.karte;
  const [wert, setWert] = useState<{ punkte: number | null; sondernote: Sondernote | null }>({ punkte: tier.punkte, sondernote: tier.sondernote });
  const [texte, setTexte] = useState({ vorzuege: tier.vorzuege, wuensche: tier.wuensche, maengel: tier.maengel });
  // Bausteine der Geflügelart dieses Tieres und – falls an eine Rasse gebunden – seiner Rasse, je Merkmal; die der Rasse
  // zuerst (ältere Offline-Daten ohne Merkmal: „Gesamteindruck“, alle Arten, ohne Rasse).
  const passende = useMemo(
    () =>
      daten.textbausteine
        // bleibt deutsch: „Gesamteindruck“ ist der Name der Bausteingruppe
        .map((b) => ({ ...b, gruppe: b.gruppe ?? "Gesamteindruck", art: b.art ?? "alle", rasse: b.rasse ?? null }))
        .filter((b) => bausteinFuerTier(b, { sparte: tier.sparte, rasse: tier.rasse ?? null, bezeichnung: tier.bezeichnung }))
        .sort((x, y) => Number(!x.rasse) - Number(!y.rasse)),
    [daten.textbausteine, tier.sparte, tier.rasse, tier.bezeichnung],
  );
  const gruppen = useMemo(() => sortiereGruppen(passende.map((b) => b.gruppe)), [passende]);
  const [gruppeGewaehlt, setGruppe] = useState("");
  const gruppe = gruppen.includes(gruppeGewaehlt) ? gruppeGewaehlt : (gruppen[0] ?? "");
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  // Ein als fehlend gemeldetes Tier bewertet niemand – die Karte bleibt gesperrt (der Server lehnte die Note sonst ab).
  const offen = daten.schau.offen && !tier.fehlt;
  const gewaehlt = wert.punkte != null || wert.sondernote != null;

  // Ändert sich die Bewertung anderswo (z. B. Korrektur der Ausstellungsleitung am PC), die Karte nachziehen.
  // Hat der Preisrichter selbst schon geändert, nicht still überschreiben, sondern nachfragen.
  const ausgangsStand = useRef<Stand>(standVon(tier));
  const [geaendert, setGeaendert] = useState<Stand | null>(null);
  const serverStand = JSON.stringify(standVon(tier));
  const uebernehmen = (s: Stand) => {
    ausgangsStand.current = s;
    setWert({ punkte: s.punkte, sondernote: s.sondernote });
    setTexte({ vorzuege: s.vorzuege, wuensche: s.wuensche, maengel: s.maengel });
    setGeaendert(null);
  };
  useEffect(() => {
    const neu = JSON.parse(serverStand) as Stand;
    if (gleicherStand(neu, ausgangsStand.current)) return;
    const lokal = { ...wert, ...texte };
    if (gleicherStand(neu, lokal)) {
      ausgangsStand.current = neu;
      setGeaendert(null);
    } else if (gleicherStand(lokal, ausgangsStand.current)) uebernehmen(neu);
    else setGeaendert(neu);
  }, [serverStand]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dem Tablet melden, ob auf der Karte etwas Ungespeichertes steht.
  const lokalStand = JSON.stringify(standVon({ ...wert, ...texte }));
  useEffect(() => {
    beiAenderung(!gleicherStand(JSON.parse(lokalStand) as Stand, ausgangsStand.current));
  }, [lokalStand]); // eslint-disable-line react-hooks/exhaustive-deps

  const preis = async (preisartId: number, weg: boolean) => {
    try {
      if (weg) await direkt.richter.preisEntfernen.mutate({ katalogeintragId: tier.id, preisartId });
      else await direkt.richter.preisVergeben.mutate({ katalogeintragId: tier.id, preisartId });
      neuLaden();
    } catch (e) {
      meldung(fehlerText(e), "fehler");
    }
  };

  const baustein = (feld: keyof typeof texte, text: string) => {
    const teile = texte[feld] ? texte[feld].split(", ") : [];
    if (teile.includes(text)) {
      // Schon drin: ein zweites Tippen nimmt den Baustein wieder heraus (kein doppelter Text auf der Karte).
      setTexte({ ...texte, [feld]: teile.filter((x) => x !== text).join(", ") });
      return;
    }
    const neu = texte[feld] ? `${texte[feld]}, ${text}` : text;
    if (neu.length > MAX_TEXT) return meldung(textZuLang(), "fehler");
    setTexte({ ...texte, [feld]: neu });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex items-center gap-5 rounded-xl border border-linie-stark bg-weiss p-5">
        <span className="nummer min-w-28 rounded-lg border-2 border-tinte px-3 py-1 text-center text-6xl leading-tight sm:text-7xl">{formatKatalognummer(tier)}</span>
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold leading-tight [font-stretch:112%]">{tier.bezeichnung}</p>
          <p className="mt-1 text-xl text-grau">
            {tier.geschlecht} {o.tablet.alter[tier.alter]}
            {tier.art !== "einzeltier" && `, ${o.fach.MELDEART_LABEL[tier.art]}`}
            {tier.istJugend && t.jugend}
          </p>
          {tier.kaefig && tier.kaefig !== String(tier.katalogNr) && <p className="text-grau">{t.kaefig(tier.kaefig)}</p>}
          {tier.fehlt && <p className="mt-1 font-semibold text-kamm">{t.fehlendGemeldet}</p>}
        </div>
      </div>

      {geaendert && (
        <Hinweis ton="warnung">
          <p className="font-semibold">{t.anderswoGeaendert}</p>
          <p className="mt-1 text-sm">
            {t.jetztGespeichert(
              geaendert.punkte != null || geaendert.sondernote != null ? bewertungsText(geaendert, daten.skala) : o.tablet.keineNote,
              geaendert.vorzuege,
              geaendert.wuensche,
              geaendert.maengel,
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Knopf variante="primaer" className="min-h-11" onClick={() => uebernehmen(geaendert)}>{t.uebernehmen}</Knopf>
            <Knopf className="min-h-11" onClick={() => setGeaendert(null)}>{t.behalten}</Knopf>
          </div>
        </Hinweis>
      )}

      <fieldset disabled={!offen}>
        <legend className="mb-2 text-lg font-semibold">{t.note}</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {erlaubtePunkte(daten.skala).map((p) => (
            <PunktKnopf key={p} aktiv={wert.punkte === p} onClick={() => setWert({ punkte: p, sondernote: null })} text={bewertungsText({ punkte: p, sondernote: null }, daten.skala)} />
          ))}
          {SONDERNOTEN.map((s) => (
            <PunktKnopf key={s} aktiv={wert.sondernote === s} onClick={() => setWert({ punkte: null, sondernote: s })} text={bewertungsText({ punkte: null, sondernote: s })} klein={o.fach.SONDERNOTE_LABEL[s].name} />
          ))}
        </div>
      </fieldset>

      {offen && gruppen.length > 1 && (
        <div>
          <p className="mb-1 text-lg font-semibold">{t.bausteineZu}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t.merkmal}>
            {gruppen.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={g === gruppe}
                onClick={() => setGruppe(g)}
                className={`min-h-11 rounded-md border px-3 py-2 text-base ${g === gruppe ? "border-band bg-band text-auf-band" : "border-linie-stark bg-weiss text-tinte hover:border-band"}`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {(["vorzuege", "wuensche", "maengel"] as const).map((feld) => {
        const kat = feld === "vorzuege" ? "vorzug" : feld === "wuensche" ? "wunsch" : "mangel";
        const label = o.fach.BAUSTEIN_KATEGORIE_LABEL[kat];
        const bausteine = passende.filter((b) => b.kategorie === kat && b.gruppe === gruppe);
        return (
          <div key={feld}>
            <label htmlFor={`f-${feld}`} className="mb-1 block text-lg font-semibold">{label}</label>
            <textarea
              id={`f-${feld}`}
              rows={2}
              disabled={!offen}
              value={texte[feld]}
              maxLength={MAX_TEXT}
              onChange={(e) => setTexte({ ...texte, [feld]: e.target.value })}
              className="w-full rounded-md border border-feldrand bg-weiss px-3 py-2 text-lg text-tinte hover:border-grau focus:border-band focus:outline-none focus:ring-2 focus:ring-band/25 disabled:bg-papier disabled:text-grau"
            />
            {texte[feld].length > MAX_TEXT - 100 && (
              <p className={`text-right text-sm ${texte[feld].length >= MAX_TEXT ? "font-semibold text-kamm" : "text-grau"}`}>
                {t.zeichen(texte[feld].length, MAX_TEXT)}
              </p>
            )}
            {bausteine.length > 0 && offen && (
              <div className="mt-1 flex flex-wrap gap-2">
                {bausteine.map((b) => (
                  <button key={b.text} type="button" onClick={() => baustein(feld, b.text)} className="min-h-11 rounded-full border border-linie-stark bg-weiss px-4 py-2 text-base text-tinte hover:border-band">
                    {b.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {offen && (
        <div className="flex flex-wrap gap-3">
          <Knopf
            variante="primaer"
            gross
            className="flex-1"
            disabled={!gewaehlt}
            onClick={() => speichern({ katalogeintragId: tier.id, ...wert, ...texte })}
          >
            {t.speichernWeiter}
          </Knopf>
          {(tier.punkte != null || tier.sondernote != null) && (
            <Knopf gross onClick={async () =>
                (await bestaetige({ titel: t.zuruecknehmenTitel(formatKatalognummer(tier)), text: t.zuruecknehmenText, knopf: t.zuruecknehmenKnopf, gefahr: true })) &&
                zuruecknehmen(tier.id)
              }>
              {t.zuruecknehmen}
            </Knopf>
          )}
        </div>
      )}
      {brauchtObmann(wert, daten.skala as NotenStufe[]) && !tier.obmannBestaetigt && <Hinweis ton="warnung">{t.obmannMuss}</Hinweis>}
      {wert.sondernote && <p className="-mt-2 text-sm text-grau">{o.fach.SONDERNOTE_LABEL[wert.sondernote].hinweis}</p>}

      {tier.punkte != null && !tier.wartet && (
        <section className="rounded-xl border border-linie bg-weiss p-4">
          <h2 className="mb-2 font-sans text-lg font-semibold">{t.preise}</h2>
          {!online ? (
            <p className="text-grau">{t.preiseOffline}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {daten.preisarten
                // Bindung der Preisart (Jugend/Senioren, Sparte); ältere Daten ohne Angabe: alle anbieten.
                .filter((p) => !("preisartenErlaubt" in tier) || !tier.preisartenErlaubt || tier.preisartenErlaubt.includes(p.id) || tier.preise.some((x) => x.id === p.id))
                .map((p) => {
                const hat = tier.preise.some((x) => x.id === p.id);
                const k = daten.kontingent.find((x) => x.preisartId === p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={!offen}
                    onClick={() => preis(p.id, hat)}
                    className={`min-h-12 rounded-md border-2 px-4 font-semibold ${hat ? "border-band bg-band text-auf-band" : "border-linie-stark bg-weiss text-tinte hover:border-band"}`}
                  >
                    {p.kuerzel} <span className="font-normal">{hat ? t.vergeben : t.frei(k ? k.verfuegbar - k.vergeben : 0)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function PunktKnopf({ aktiv, onClick, text, klein }: { aktiv: boolean; onClick: () => void; text: string; klein?: string }) {
  return (
    <button
      type="button"
      aria-pressed={aktiv}
      onClick={onClick}
      className={`nummer flex min-h-16 flex-col items-center justify-center rounded-lg border text-2xl ${aktiv ? "border-band bg-band text-auf-band" : "border-linie-stark bg-weiss text-tinte hover:border-band"}`}
    >
      {text}
      {klein && <span className="px-1 text-center font-sans text-xs leading-tight font-normal">{klein}</span>}
    </button>
  );
}
