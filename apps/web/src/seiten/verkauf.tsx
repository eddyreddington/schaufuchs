import { bewertungsText } from "@schau/domain";
import { useState, type FormEvent } from "react";
import { datumZeit, fehlerText, formatEuro, formatKatalognummer, heuteIso } from "../lib";
import { useSchauId } from "../rahmen";
import { useOberflaeche } from "../sprache";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Eingabe, Feld, Hinweis, Knopf, KnopfLink, Laden, Marke, SEITE, Segmente, Seitenkopf, TabellenRahmen, useFrage, useMeldung } from "../ui";

export function Verkauf() {
  const schauId = useSchauId();
  const t = useOberflaeche();
  const tv = t.kasse.verkauf;
  const [nr, setNr] = useState("");
  const [suche, setSuche] = useState("");
  const [sparte, setSparte] = useState("");
  const [letzterBeleg, setLetzterBeleg] = useState<{ id: number; belegNr: number } | null>(null);
  const tier = trpc.kasse.tierSuchen.useQuery({ schauId, nr: suche }, { enabled: suche.length > 0 });
  const angebot = trpc.kasse.angebot.useQuery({ schauId });
  const verkaeufe = trpc.kasse.verkaeufe.useQuery({ schauId });
  const schau = trpc.schau.get.useQuery({ id: schauId });
  const offeneUeberweisungen = trpc.kasse.offeneUeberweisungen.useQuery({ schauId });
  const ohneEingang = new Set(offeneUeberweisungen.data?.map((v) => v.id));
  const status = trpc.auth.status.useQuery();
  const istAdmin = status.data?.benutzer?.rolle === "admin";
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe } = useFrage();
  const eingang = trpc.kasse.zahlungseingangVerkauf.useMutation({
    onSuccess: () => {
      utils.kasse.invalidate();
      meldung(tv.eingangGebucht);
    },
    onError: (x) => meldung(fehlerText(x), "fehler"),
  });
  const phase = schau.data?.phase;
  const verkaufMoeglich = phase === "preise" || phase === "schau";
  const sparten = [...new Set(angebot.data?.map((a) => a.sparte).filter(Boolean))] as string[];
  const liste = angebot.data?.filter((a) => !sparte || a.sparte === sparte) ?? [];
  const gueltig = verkaeufe.data?.filter((v) => !v.storniertAm) ?? [];
  const offen = offeneUeberweisungen.data ?? [];
  const waehlen = (x: string) => {
    setNr(x);
    setSuche(x);
  };

  return (
    <div className={SEITE}>
      <Seitenkopf
        titel={tv.titel}
        unter={angebot.data && verkaeufe.data ? tv.unter(angebot.data.length, gueltig.length) : undefined}
        hilfe="phase-schau-verkauf-tierverkauf"
        marke={schau.data && verkaufMoeglich && !schau.data.ergebnisseFreigegeben ? <Marke ton="warnung">{tv.nichtFreigegeben}</Marke> : undefined}
        aktionen={
          <>
            <KnopfLink href={`/datei/${schauId}/verkaufsliste.pdf`} target="_blank" rel="noreferrer">{tv.verkaufslistePdf}</KnopfLink>
            <KnopfLink href={`/datei/${schauId}/verkaufsliste.csv`}>{tv.alsCsv}</KnopfLink>
          </>
        }
      />
      {schau.data && !verkaufMoeglich && <Hinweis ton="warnung">{tv.nurInPhasen}</Hinweis>}
      {offen.length > 0 && (
        <Hinweis ton="warnung">
          {offen.length === 1 ? tv.ohneEingangEins(offen.map((v) => v.belegNr).join(", ")) : tv.ohneEingang(offen.length, offen.map((v) => v.belegNr).join(", "))}
        </Hinweis>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Abschnitt titel={tv.tierVerkaufen}>
          <div className="flex flex-col gap-4">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setSuche(nr.trim());
              }}
            >
              <Eingabe aria-label={tv.katalognummer} placeholder={tv.katalognummerBeispiel} value={nr} onChange={(e) => setNr(e.target.value)} className="max-w-56 text-lg" autoFocus />
              <Knopf type="submit">{tv.suchen}</Knopf>
            </form>
            {tier.isFetching && <Laden />}
            {suche && !tier.isFetching && tier.data === null && <Hinweis ton="warnung">{tv.nichtGefunden(suche)}</Hinweis>}
            {tier.data && (
              <VerkaufFormular
                key={tier.data.eintrag.id}
                schauId={schauId}
                daten={tier.data}
                fertig={(v) => {
                  setLetzterBeleg(v);
                  setNr("");
                  setSuche("");
                }}
              />
            )}
            {!suche && letzterBeleg && (
              // Ausweichweg, falls der Browser das automatische Öffnen blockiert (z. B. Safari auf dem iPad).
              <Hinweis ton="ok" className="flex flex-wrap items-center justify-between gap-3">
                <span>{tv.verkauftBeleg(letzterBeleg.belegNr)}</span>
                <KnopfLink variante="primaer" href={`/datei/${schauId}/kaufbeleg/${letzterBeleg.id}.pdf`} target="_blank" rel="noreferrer">
                  {tv.belegDrucken(letzterBeleg.belegNr)}
                </KnopfLink>
              </Hinweis>
            )}
            {!suche && <p className="text-sm text-grau">{tv.keinTierGewaehlt}</p>}
          </div>
        </Abschnitt>
        <TabellenRahmen
          kopf={
            <>
              <h2 className="mr-auto text-[1.07rem] font-semibold text-tinte">{tv.zumVerkauf}</h2>
              {sparten.length > 1 && (
                <Segmente
                  label={tv.sparte}
                  wert={sparte}
                  onChange={setSparte}
                  optionen={[{ wert: "", label: t.allgemein.alle, anzahl: angebot.data?.length }, ...sparten.map((x) => ({ wert: x, label: x, anzahl: angebot.data?.filter((a) => a.sparte === x).length }))]}
                />
              )}
            </>
          }
          fuss={liste.length > 0 ? <span>{tv.tiere(liste.length)}</span> : undefined}
        >
          {angebot.isLoading ? (
            <div className="px-4">
              <Laden />
            </div>
          ) : angebot.data?.length === 0 ? (
            <p className="px-4 py-10 text-center text-grau">{tv.keinAngebot}</p>
          ) : (
            <ul className="max-h-[32rem] divide-y divide-linie overflow-y-auto">
              {liste.map((a) => {
                const n = formatKatalognummer(a);
                const gewaehlt = tier.data?.eintrag.id === a.id;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => waehlen(n)}
                      aria-current={gewaehlt}
                      className={`flex w-full items-baseline gap-3 px-4 py-2.5 text-left hover:bg-papier ${gewaehlt ? "bg-band-hell" : ""}`}
                    >
                      <span className="nummer w-14 shrink-0 text-right text-lg">{n}</span>
                      <span className="min-w-0 flex-1">
                        <span className="text-tinte">{a.bezeichnung}</span>
                        <span className="block text-sm text-grau">
                          {a.geschlecht} {a.alter}
                          {(a.punkte != null || a.sondernote) && ` · ${bewertungsText(a)}`}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums">{formatEuro(a.verkaufspreisCent)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </TabellenRahmen>
      </div>
      <TabellenRahmen
        kopf={<h2 className="text-[1.07rem] font-semibold text-tinte">{tv.verkauftTitel}</h2>}
        fuss={
          verkaeufe.data?.length ? (
            <>
              <span>{tv.verkaeufe(gueltig.length)}</span>
              <span>{tv.summe(formatEuro(gueltig.reduce((n, v) => n + v.preisCent, 0)))}</span>
            </>
          ) : undefined
        }
      >
        {verkaeufe.isLoading ? (
          <div className="px-4">
            <Laden />
          </div>
        ) : verkaeufe.data?.length === 0 ? (
          <p className="px-4 py-10 text-center text-grau">{tv.nichtsVerkauft}</p>
        ) : (
          <table className="tabelle tabelle-stapel">
            <thead>
              <tr>
                <th>{tv.beleg}</th>
                <th className="text-right">{tv.nr}</th>
                <th>{t.allgemein.tier}</th>
                <th>{tv.kaeufer}</th>
                <th>{tv.zeit}</th>
                <th className="text-right">{tv.preis}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {verkaeufe.data?.map((v) => (
                <tr key={v.id} className={v.storniertAm ? "text-grau" : ""}>
                  <td data-label={tv.beleg}>
                    <a href={`/datei/${schauId}/kaufbeleg/${v.id}.pdf`} target="_blank" rel="noreferrer" className="font-semibold text-tinte no-underline hover:text-band hover:underline">
                      {v.belegNr}
                    </a>
                  </td>
                  <td data-label={tv.nr} className="text-right">
                    <button type="button" className="nummer text-lg text-tinte hover:text-band hover:underline" onClick={() => waehlen(formatKatalognummer(v.eintrag))}>
                      {formatKatalognummer(v.eintrag)}
                    </button>
                  </td>
                  <td data-label={t.allgemein.tier}>{v.eintrag.bezeichnung}</td>
                  <td data-label={tv.kaeufer}>
                    {v.kaeuferName}
                    {v.kaeuferUnter16 && <span className="block text-sm text-grau">{tv.unter16Einwilligung(v.kaeuferErziehungsberechtigter ?? "")}</span>}
                  </td>
                  <td data-label={tv.zeit} className="whitespace-nowrap text-sm text-grau">{datumZeit(v.createdAt)}</td>
                  <td data-label={tv.preis} className={`text-right font-semibold tabular-nums ${v.storniertAm ? "line-through" : ""}`}>{formatEuro(v.preisCent)}</td>
                  <td className="text-right">
                    {v.storniertAm ? (
                      <span className="flex flex-col items-end gap-0.5">
                        <Marke ton="fehler">{tv.storniert}</Marke>
                        <span className="text-sm">{datumZeit(v.storniertAm)}: {v.stornoGrund}</span>
                      </span>
                    ) : (
                      ohneEingang.has(v.id) && (
                        <span className="inline-flex flex-wrap items-center justify-end gap-2">
                          <Marke ton="fehler">{tv.ueberweisungOffen}</Marke>
                          {istAdmin && (
                            <Knopf
                              laedt={eingang.isPending}
                              onClick={async () => {
                                const tag = await eingabe({ titel: tv.eingangTitel(v.belegNr), text: tv.eingangFrage(formatEuro(v.preisCent)), feld: tv.eingangDatum, vorgabe: heuteIso(), einzeilig: true, knopf: tv.eingangBuchen });
                                if (tag) eingang.mutate({ schauId, verkaufId: v.id, datum: tag });
                              }}
                            >
                              {tv.zahlungEingegangen}
                            </Knopf>
                          )}
                        </span>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TabellenRahmen>
    </div>
  );
}

function VerkaufFormular({ schauId, daten, fertig }: { schauId: number; daten: NonNullable<Ausgabe["kasse"]["tierSuchen"]>; fertig: (v: { id: number; belegNr: number }) => void }) {
  const e = daten.eintrag;
  const t = useOberflaeche();
  const tv = t.kasse.verkauf;
  const [k, setK] = useState({ name: "", anschrift: "", reg: "", alter: "" as "" | "ab16" | "unter16", eltern: "", zahlart: "bar" as "bar" | "karte" | "ueberweisung" });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const verkaufen = trpc.kasse.verkaufen.useMutation({
    onSuccess: (v) => {
      utils.kasse.invalidate();
      meldung(tv.verkauftBeleg(v.belegNr));
      // Versuch; blockiert der Browser das Fenster, bleibt der Druck-Knopf über dem Formular.
      window.open(`/datei/${schauId}/kaufbeleg/${v.id}.pdf`, "_blank");
      fertig({ id: v.id, belegNr: v.belegNr });
    },
  });
  const storno = trpc.kasse.stornieren.useMutation({ onSuccess: () => { utils.kasse.invalidate(); meldung(tv.storniertMeldung); }, onError: (x) => meldung(fehlerText(x), "fehler") });
  const status = trpc.auth.status.useQuery();
  const istAdmin = status.data?.benutzer?.rolle === "admin";
  const { eingabe } = useFrage();
  const senden = (ev: FormEvent) => {
    ev.preventDefault();
    if (!k.alter) return meldung(tv.alterAngeben, "fehler");
    verkaufen.mutate({ schauId, katalogeintragId: e.id, kaeuferName: k.name, kaeuferAnschrift: k.anschrift, kaeuferRegistriernummer: k.reg, kaeuferAlter: k.alter, kaeuferErziehungsberechtigter: k.eltern, zahlart: k.zahlart });
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-linie pb-4">
        <div className="min-w-0">
          <p className="nummer text-3xl leading-none">{formatKatalognummer(e)}</p>
          <p className="mt-1.5 text-tinte">{e.bezeichnung}, {e.geschlecht} {e.alter}</p>
        </div>
        {e.verkaufspreisCent ? <p className="text-2xl font-semibold tabular-nums">{formatEuro(e.verkaufspreisCent)}</p> : <Marke>{tv.nichtVerkaeuflich}</Marke>}
      </div>
      {daten.verkauf ? (
        <Hinweis ton="warnung" className="flex flex-wrap items-center justify-between gap-3">
          <span>{tv.bereitsVerkauft(daten.verkauf.kaeuferName, daten.verkauf.belegNr)}</span>
          {!istAdmin ? (
            <span className="text-sm">{tv.stornoNurLeitung}</span>
          ) : (
            <Knopf
              variante="gefahr"
              onClick={async () => {
                const g = await eingabe({ titel: tv.stornoTitel(daten.verkauf!.belegNr), feld: tv.stornoGrund, mindestens: 3, knopf: t.kasse.stornieren, gefahr: true });
                if (g) storno.mutate({ schauId, verkaufId: daten.verkauf!.id, grund: g });
              }}
            >
              {t.kasse.stornieren}
            </Knopf>
          )}
        </Hinweis>
      ) : !e.verkaufspreisCent ? (
        <Hinweis>{tv.nichtZumVerkauf}</Hinweis>
      ) : (
        <form onSubmit={senden} className="flex flex-col gap-4">
          <Feld label={tv.kaeuferName}>{(id) => <Eingabe id={id} value={k.name} onChange={(x) => setK({ ...k, name: x.target.value })} required />}</Feld>
          <Feld label={tv.anschrift}>{(id) => <Eingabe id={id} value={k.anschrift} onChange={(x) => setK({ ...k, anschrift: x.target.value })} />}</Feld>
          <Feld label={tv.registriernummer} hinweis={tv.registriernummerHinweis}>{(id) => <Eingabe id={id} value={k.reg} onChange={(x) => setK({ ...k, reg: x.target.value })} required />}</Feld>
          {/* § 11c TierSchG: Wirbeltiere an Personen unter 16 nur mit Einwilligung der Erziehungsberechtigten. */}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-semibold">{tv.kaeuferAlter}</legend>
            {(
              [
                ["ab16", tv.ab16],
                ["unter16", tv.unter16],
              ] as const
            ).map(([wert, text]) => (
              <label key={wert} className="flex items-center gap-2">
                <input type="radio" name="alter" className="size-4 accent-band" checked={k.alter === wert} onChange={() => setK({ ...k, alter: wert })} />
                {text}
              </label>
            ))}
          </fieldset>
          {k.alter === "unter16" && (
            <Feld label={tv.erziehungsberechtigter}>{(id) => <Eingabe id={id} value={k.eltern} onChange={(x) => setK({ ...k, eltern: x.target.value })} required />}</Feld>
          )}
          <fieldset className="flex flex-wrap gap-x-6 gap-y-1.5">
            <legend className="mb-1 w-full text-sm font-semibold">{tv.bezahlt}</legend>
            {(["bar", "karte", "ueberweisung"] as const)
              // Ohne Bargeld (Karte, Überweisung) verkauft nur die Ausstellungsleitung.
              .filter((wert) => wert === "bar" || istAdmin)
              .map((wert) => (
                <label key={wert} className="flex items-center gap-2">
                  <input type="radio" name="zahlart" className="size-4 accent-band" checked={k.zahlart === wert} onChange={() => setK({ ...k, zahlart: wert })} />
                  {t.fach.ZAHLART_LABEL[wert]}
                </label>
              ))}
          </fieldset>
          {k.zahlart === "ueberweisung" && <p className="text-sm text-stroh-dunkel">{tv.erstNachEingang}</p>}
          {verkaufen.error && <Hinweis ton="fehler">{fehlerText(verkaufen.error)}</Hinweis>}
          <Knopf type="submit" variante="primaer" gross laedt={verkaufen.isPending}>
            {tv.verkaufenDrucken}
          </Knopf>
        </form>
      )}
    </div>
  );
}
