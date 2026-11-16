import { AUFSTELLER_STANDARD, verkleidungVon, type Aufsteller, ETAGEN_MAX, KAEFIG_TYP_LABEL, KAEFIG_TYPEN, kaefigeJePlatte, kaefigMass, platteFuer, kaefigName, type KaefigMasse, type KaefigTyp, type OberflaecheTexte, serverText } from "@schau/domain";
import { useState } from "react";
import { fehlerText } from "../lib";
import { useSchauId } from "../rahmen";
import { useIstAdmin } from "../rolle";
import { useOberflaeche, useSprache } from "../sprache";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, FehlerAnzeige, Feld, Haken, HilfeLink, Hinweis, Knopf, Laden, Leer, Seitenkopf, Speicherleiste, useMeldung } from "../ui";

/**
 * Käfigbedarf für den Aufbau der Halle: je Käfiggröße, wie viele Tiere gemeldet und bestätigt sind und welche
 * Käfignummern (= Katalognummern) dazugehören. Darunter die Käfiggröße je Rasse – Abweichungen legt die
 * Ausstellungsleitung fest (z. B. große Hühnerrassen im Großkäfig).
 */
/** Name einer Käfigart wie `kaefigName`, die Bezeichnung (Stamm, Voliere …) in der Sprache der Oberfläche. */
export function kaefigNameIn(t: OberflaecheTexte, typ: KaefigTyp, masse?: KaefigMasse | null): string {
  const name = kaefigName(typ, masse);
  const de = KAEFIG_TYP_LABEL[typ];
  return name.startsWith(de) ? `${t.fach.KAEFIG_TYP_LABEL[typ]}${name.slice(de.length)}` : name;
}

/** Wie `kaefigNameLang` (Maß mit Verwendungszweck), in der Sprache der Oberfläche. */
function kaefigNameLangIn(t: OberflaecheTexte, typ: KaefigTyp, masse?: KaefigMasse | null): string {
  const name = kaefigNameIn(t, typ, masse);
  return name === t.fach.KAEFIG_TYP_LABEL[typ] || typ === "stamm" || typ === "voliere" ? name : `${name} – ${t.fach.KAEFIG_FUER[typ]}`;
}

export function Kaefige() {
  const t = useOberflaeche();
  const tk = t.halle.kaefige;
  const sprache = useSprache();
  const schauId = useSchauId();
  const istAdmin = useIstAdmin();
  const bedarf = trpc.katalog.kaefigbedarf.useQuery({ schauId });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const regel = trpc.katalog.kaefigRegelSetzen.useMutation({
    onSuccess: () => utils.katalog.kaefigbedarf.invalidate(),
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  if (bedarf.error) return <FehlerAnzeige fehler={bedarf.error} nochmal={() => bedarf.refetch()} />;
  if (!bedarf.data) return <Laden />;
  const d = bedarf.data;
  const summe = (k: "gemeldet" | "bestaetigt") => d.typen.reduce((n, x) => n + x[k], 0);
  return (
    <div className="flex flex-col gap-6">
      <Seitenkopf
        titel={tk.titel}
        unter={tk.unter(summe("gemeldet"), summe("bestaetigt"))}
        // bleibt deutsch (Anker im Handbuch)
        hilfe="käfige-käfigbedarf"
        aktionen={<Knopf onClick={() => window.print()}>{tk.drucken}</Knopf>}
      />
      <Abschnitt titel={tk.masseUndBedarf}>
        <div className="overflow-x-auto">
          <table className="tabelle">
            <thead>
              <tr>
                <th scope="col">{tk.spalteMass}</th>
                <th scope="col">{tk.spalteFuer}</th>
                <th scope="col">{tk.spalteRichtwert}</th>
                <th scope="col" className="text-right">{tk.gemeldet}</th>
                <th scope="col" className="text-right">{tk.bestaetigt}</th>
                <th scope="col">{tk.spalteNummern}</th>
              </tr>
            </thead>
            <tbody>
              {d.typen.map((x) => (
                <tr key={x.typ} className={x.gemeldet ? "" : "text-grau"}>
                  <td>
                    <MassZelle schauId={schauId} typ={x.typ as KaefigTyp} masse={d.masse} label={kaefigNameIn(t, x.typ as KaefigTyp, d.masse)} darf={istAdmin} />
                  </td>
                  <td className="text-sm">{t.fach.KAEFIG_FUER[x.typ as KaefigTyp]}</td>
                  <td className="text-sm text-grau">{t.fach.KAEFIG_RICHTWERT[x.typ as KaefigTyp]}</td>
                  <td className="text-right">{x.gemeldet}</td>
                  <td className="text-right">{x.bestaetigt}</td>
                  <td>{x.nummern || "–"}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td>{tk.zusammen}</td>
                <td />
                <td />
                <td className="text-right">{summe("gemeldet")}</td>
                <td className="text-right">{summe("bestaetigt")}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        {(d.ohneKaefig > 0 || d.einzelwahl > 0) && (
          <p className="mt-3 text-sm text-grau">
            {[d.ohneKaefig > 0 ? tk.ohneKaefig(d.ohneKaefig) : "", d.einzelwahl > 0 ? (d.einzelwahl === 1 ? tk.einzelwahlEins : tk.einzelwahl(d.einzelwahl)) : ""].filter(Boolean).join(" ")}
          </p>
        )}
      </Abschnitt>
      <Grundplatten key={`${d.platte.laenge}-${d.platte.tiefe}-${JSON.stringify(d.jePlatte)}-${JSON.stringify(d.plattenMass)}-${JSON.stringify(d.etagen)}`} schauId={schauId} d={d} darf={istAdmin} />
      <AufstellerFeld key={JSON.stringify(d.aufsteller)} schauId={schauId} aufsteller={d.aufsteller} darf={istAdmin} />
      <Abschnitt titel={tk.groesseJeRasse}>
        {!istAdmin && <Hinweis className="mb-3">{tk.nurLeitung}</Hinweis>}
        {d.nachBloecken && d.nummernVergeben && (
          <Hinweis ton="warnung" className="mb-3">
            {d.festgeschrieben
              ? tk.nummernFest
              : tk.neuNummerieren}
          </Hinweis>
        )}
        {d.rassen.length === 0 ? (
          <Leer titel={tk.keineEinzeltiere} />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabelle">
              <thead>
                <tr>
                  <th scope="col">{tk.rasse}</th>
                  <th scope="col">{tk.sparte}</th>
                  <th scope="col" className="text-right">{t.allgemein.tiere}</th>
                  <th scope="col">{tk.kaefiggroesse}</th>
                  <th scope="col">{tk.vorschlag}</th>
                </tr>
              </thead>
              <tbody>
                {d.rassen.map((r) => (
                  <tr key={r.rasse}>
                    <td className="font-bold">{r.rasse}</td>
                    <td>{r.sparte}</td>
                    <td className="text-right">{r.anzahl}</td>
                    <td>
                      <Auswahl
                        aria-label={tk.groesseFuer(r.rasse)}
                        disabled={!istAdmin || regel.isPending}
                        value={r.typ === r.auto ? "" : r.typ}
                        onChange={(e) => regel.mutate({ schauId, rasse: r.rasse, typ: (e.target.value || null) as KaefigTyp | null })}
                        className="max-w-64"
                      >
                        <option value="">{tk.automatisch(kaefigNameLangIn(t, r.auto, d.masse))}</option>
                        {KAEFIG_TYPEN.filter((x) => x !== "stamm" && x !== "voliere" && x !== r.auto).map((x) => (
                          <option key={x} value={x}>{kaefigNameLangIn(t, x, d.masse)}</option>
                        ))}
                      </Auswahl>
                    </td>
                    <td className="text-sm">
                      {r.vorschlag && r.vorschlag.typ !== r.typ ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span title={serverText(r.vorschlag.grund, sprache)}>
                            {kaefigNameIn(t, r.vorschlag.typ, d.masse)} <span className="text-grau">({serverText(r.vorschlag.grund, sprache)})</span>
                          </span>
                          {istAdmin && (
                            <Knopf variante="leise" className="min-h-8 px-2" laedt={regel.isPending} onClick={() => regel.mutate({ schauId, rasse: r.rasse, typ: r.vorschlag!.typ })}>
                              {tk.uebernehmen}
                            </Knopf>
                          )}
                        </span>
                      ) : (
                        <span className="text-grau">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Abschnitt>
    </div>
  );
}

/** Maß einer Käfigart: Anzeige, für die Ausstellungsleitung zum Ändern (drei Zahlen in cm) und zurück auf den Richtwert. */
function MassZelle({ schauId, typ, masse, label, darf }: { schauId: number; typ: KaefigTyp; masse: KaefigMasse; label: string; darf: boolean }) {
  const t = useOberflaeche();
  const tk = t.halle.kaefige;
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const [offen, setOffen] = useState(false);
  const jetzt = kaefigMass(typ, masse);
  const [wert, setWert] = useState({ breite: String(jetzt?.breite ?? ""), tiefe: String(jetzt?.tiefe ?? ""), hoehe: String(jetzt?.hoehe ?? "") });
  const setzen = trpc.katalog.kaefigMassSetzen.useMutation({
    onSuccess: () => {
      setOffen(false);
      void utils.katalog.kaefigbedarf.invalidate();
      void utils.schau.get.invalidate();
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const zahl = (x: string) => Number(x.replace(",", "."));
  if (!offen)
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{label}</span>
        {!masse[typ] && <span className="text-xs text-grau">{tk.richtwertKlammer}</span>}
        {darf && (
          <Knopf
            variante="leise"
            className="min-h-8 px-2 print:hidden"
            onClick={() => {
              // Immer die aktuell geltenden Maße zeigen (auch nach „Richtwert“ oder Änderung durch andere).
              setWert({ breite: String(jetzt?.breite ?? ""), tiefe: String(jetzt?.tiefe ?? ""), hoehe: String(jetzt?.hoehe ?? "") });
              setOffen(true);
            }}
          >
            {tk.masseAendern}
          </Knopf>
        )}
      </span>
    );
  const feld = (k: "breite" | "tiefe" | "hoehe", name: string) => (
    <Eingabe aria-label={tk.inCm(name)} placeholder={name} inputMode="decimal" value={wert[k]} onChange={(e) => setWert({ ...wert, [k]: e.target.value })} className="w-20 px-2 py-1 text-sm" />
  );
  return (
    <form
      className="flex flex-wrap items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const mass = { breite: zahl(wert.breite), tiefe: zahl(wert.tiefe), hoehe: zahl(wert.hoehe) };
        if (![mass.breite, mass.tiefe, mass.hoehe].every((n) => Number.isFinite(n) && n >= 10)) {
          meldung(tk.masseFalsch, "fehler");
          return;
        }
        setzen.mutate({ schauId, typ, mass });
      }}
    >
      {/* bleibt deutsch: Einheit cm */}
      {feld("breite", t.halle.breite)} × {feld("tiefe", t.halle.tiefe)} × {feld("hoehe", t.halle.hoehe)} cm
      <Knopf variante="primaer" type="submit" className="min-h-8 px-2" laedt={setzen.isPending}>
        {t.allgemein.speichern}
      </Knopf>
      {masse[typ] && (
        <Knopf variante="leise" className="min-h-8 px-2" onClick={() => setzen.mutate({ schauId, typ, mass: null })}>
          {tk.richtwert}
        </Knopf>
      )}
      <Knopf variante="leise" className="min-h-8 px-2" onClick={() => setOffen(false)}>
        {t.allgemein.abbrechen}
      </Knopf>
    </form>
  );
}

/**
 * Grundplatten: Maß der Platte, auf der die Käfige stehen, und wie viele Käfige einer Art auf einer Platte stehen
 * (leer = automatisch aus Platte und Käfigbreite). Gilt für den Hallenplan; dazu der Plattenbedarf je Käfigart.
 */
function Grundplatten({ schauId, d, darf }: { schauId: number; d: Ausgabe["katalog"]["kaefigbedarf"]; darf: boolean }) {
  const t = useOberflaeche();
  const tk = t.halle.kaefige;
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const [je, setJe] = useState<Record<string, string>>(Object.fromEntries(Object.entries(d.jePlatte).map(([k, v]) => [k, String(v)])));
  // Etagen je Käfigart (leer = eine).
  const [et, setEt] = useState<Record<string, string>>(Object.fromEntries(Object.entries(d.etagen ?? {}).filter(([, v]) => (v ?? 1) > 1).map(([k, v]) => [k, String(v)])));
  // Plattenmaß je Käfigart: Länge und Tiefe in cm; beide leer = Vorgabe.
  const [eigen, setEigen] = useState<Record<string, { laenge: string; tiefe: string }>>(
    Object.fromEntries(Object.entries(d.plattenMass).flatMap(([k, v]) => (v ? [[k, { laenge: String(v.laenge), tiefe: String(v.tiefe) }]] : []))),
  );
  // Stand beim Laden bzw. letzten Speichern – für „Speichern“ oben rechts.
  const [stand, setStand] = useState(() => JSON.stringify({ je, eigen, et }));
  const geaendert = darf && d.hatHalle && JSON.stringify({ je, eigen, et }) !== stand;
  const speichern = trpc.katalog.plattenSetzen.useMutation({
    onSuccess: async () => {
      setStand(JSON.stringify({ je, eigen, et }));
      await Promise.all([utils.katalog.kaefigbedarf.invalidate(), utils.katalog.hallenplan.invalidate(), utils.schau.get.invalidate()]);
      meldung(tk.grundplattenGespeichert);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const zahl = (x: string) => Number(x.replace(",", "."));
  // Frühere einheitliche Platte: wird unverändert mitgespeichert, bestimmt aber nichts mehr.
  const platte = d.platte;
  const jePlatte = Object.fromEntries(Object.entries(je).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Math.round(zahl(v))])) as Partial<Record<KaefigTyp, number>>;
  const plattenMass = Object.fromEntries(
    Object.entries(eigen)
      .filter(([, v]) => zahl(v.laenge) > 0 && zahl(v.tiefe) > 0)
      .map(([k, v]) => [k, { laenge: zahl(v.laenge), tiefe: zahl(v.tiefe) }]),
  ) as Partial<Record<KaefigTyp, { laenge: number; tiefe: number }>>;
  const etagen = Object.fromEntries(Object.entries(et).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Math.min(ETAGEN_MAX, Math.max(1, Math.round(zahl(v)) || 1))])) as Partial<Record<KaefigTyp, number>>;
  const halbVoll = Object.entries(eigen).some(([, v]) => (zahl(v.laenge) > 0) !== (zahl(v.tiefe) > 0));
  const typen = d.typen.filter((x) => x.typ !== "voliere");
  return (
    <Abschnitt titel={tk.grundplatten}>
      {!d.hatHalle && <Hinweis className="mb-3">{tk.erstHalle}</Hinweis>}
      <div className="overflow-x-auto">
        <table className="tabelle">
          <thead>
            <tr>
              <th scope="col">{tk.spalteKaefig}</th>
              <th scope="col">{tk.spaltePlatte}</th>
              <th scope="col" className="text-right">{tk.spalteAutoJePlatte}</th>
              <th scope="col">{t.halle.kaefigeJePlatte}</th>
              <th scope="col">{tk.spalteEtagen}</th>
              <th scope="col" className="text-right">{tk.spaltePlatten}</th>
            </tr>
          </thead>
          <tbody>
            {typen.map((k) => {
              const mass = kaefigMass(k.typ as KaefigTyp, d.masse);
              const typ = k.typ as KaefigTyp;
              const name = kaefigNameIn(t, typ, d.masse);
              const auto = mass ? kaefigeJePlatte(typ, mass.breite, { platte, jePlatte: {}, plattenMass }) : null;
              const n = mass ? kaefigeJePlatte(typ, mass.breite, { platte, jePlatte, plattenMass }) : null;
              const vorgabe = mass ? platteFuer(typ, mass, { platte, jePlatte, plattenMass: {} }) : null;
              const wert = eigen[k.typ] ?? { laenge: "", tiefe: "" };
              return (
                <tr key={k.typ} className={k.gemeldet ? "" : "text-grau"}>
                  <td className="font-bold">{name}</td>
                  <td>
                    <span className="flex items-center gap-1">
                    <Eingabe
                      aria-label={tk.plattenlaengeFuer(name)}
                      inputMode="decimal"
                      placeholder={vorgabe ? String(vorgabe.laenge) : ""}
                      value={wert.laenge}
                      onChange={(e) => setEigen({ ...eigen, [k.typ]: { ...wert, laenge: e.target.value } })}
                      disabled={!darf}
                      className="px-2 py-1 text-sm"
                      style={{ width: "4.5rem" }}
                    />
                    ×
                    <Eingabe
                      aria-label={tk.plattentiefeFuer(name)}
                      inputMode="decimal"
                      placeholder={vorgabe ? String(vorgabe.tiefe) : ""}
                      value={wert.tiefe}
                      onChange={(e) => setEigen({ ...eigen, [k.typ]: { ...wert, tiefe: e.target.value } })}
                      disabled={!darf}
                      className="px-2 py-1 text-sm"
                      style={{ width: "4.5rem" }}
                    />
                    </span>
                  </td>
                  <td className="text-right">{auto ?? "–"}</td>
                  <td>
                    <Eingabe
                      aria-label={tk.jePlatteFuer(name)}
                      inputMode="numeric"
                      placeholder={auto != null ? String(auto) : ""}
                      value={je[k.typ] ?? ""}
                      onChange={(e) => setJe({ ...je, [k.typ]: e.target.value })}
                      disabled={!darf}
                      className="px-2 py-1 text-sm"
                      style={{ width: "4rem" }}
                    />
                  </td>
                  <td>
                    <Eingabe
                      aria-label={tk.etagenFuer(name)}
                      inputMode="numeric"
                      placeholder="1"
                      value={et[k.typ] ?? ""}
                      onChange={(e) => setEt({ ...et, [k.typ]: e.target.value })}
                      disabled={!darf}
                      className="px-2 py-1 text-sm"
                      style={{ width: "3.5rem" }}
                    />
                  </td>
                  <td className="text-right">{n && k.gemeldet ? Math.ceil(k.gemeldet / (n * (etagen[typ] ?? 1))) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {halbVoll && <Hinweis className="mt-3">{tk.halbVoll}</Hinweis>}
      <Speicherleiste
        sichtbar={geaendert}
        onVerwerfen={() => {
          const alt = JSON.parse(stand) as { je: typeof je; eigen: typeof eigen; et: typeof et };
          setJe(alt.je);
          setEigen(alt.eigen);
          setEt(alt.et);
        }}
        onSpeichern={() => !halbVoll && speichern.mutate({ schauId, platte, jePlatte, plattenMass, etagen })}
        laedt={speichern.isPending}
        knopf={tk.grundplattenSpeichern}
      />
    </Abschnitt>
  );
}

/**
 * Aufsteller: Höhe der Gestelle unter den Grundplatten (cm) und ihre Verkleidung (an/aus, Farbe, Bild einer Plane) – für die
 * 3D-Ansicht des Hallenplans. Höhe leer = Vorgabe.
 */
function AufstellerFeld({ schauId, aufsteller, darf }: { schauId: number; aufsteller: Aufsteller; darf: boolean }) {
  const tk = useOberflaeche().halle.kaefige;
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const v = verkleidungVon(aufsteller);
  const anfang = { hoehe: aufsteller.hoehe === AUFSTELLER_STANDARD.hoehe ? "" : String(aufsteller.hoehe), an: v.an, farbe: v.farbe };
  const [wert, setWert] = useState(anfang.hoehe);
  const [an, setAn] = useState(anfang.an);
  const [farbe, setFarbe] = useState(anfang.farbe);
  const zahl = Number(wert.replace(",", "."));
  const falsch = wert.trim() !== "" && !(zahl >= 0 && zahl <= 300);
  const geaendert = darf && (wert.trim() !== anfang.hoehe || an !== anfang.an || farbe !== anfang.farbe);
  const neuLaden = () => Promise.all([utils.katalog.kaefigbedarf.invalidate(), utils.katalog.hallenplan.invalidate()]);
  const speichern = trpc.katalog.aufstellerSetzen.useMutation({
    onSuccess: async () => {
      await neuLaden();
      meldung(tk.aufstellerGespeichert);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const bildSetzen = trpc.katalog.sockelBildSetzen.useMutation({
    onSuccess: async () => {
      await neuLaden();
      meldung(tk.logoGespeichert);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const bildWeg = trpc.katalog.sockelBildEntfernen.useMutation({ onSuccess: () => neuLaden(), onError: (e) => meldung(fehlerText(e), "fehler") });
  const los = () => !falsch && speichern.mutate({ schauId, aufsteller: { hoehe: wert.trim() === "" ? AUFSTELLER_STANDARD.hoehe : zahl, verkleidung: { an, farbe } } });
  const hochladen = async (datei: File | undefined) => {
    if (!datei) return;
    const b = await sockelBildVorbereiten(datei).catch(() => null);
    if (!b) return meldung(tk.bildUnlesbar, "fehler");
    bildSetzen.mutate({ schauId, ...b });
  };
  return (
    <Abschnitt titel={tk.aufsteller} aktionen={<HilfeLink abschnitt="hallenplan-3d">{tk.hilfeAufsteller}</HilfeLink>}>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <Feld label={tk.hoeheGrundplatte} fehler={falsch ? tk.hoeheFalsch : null}>
          {(id) => <Eingabe id={id} inputMode="decimal" placeholder={String(AUFSTELLER_STANDARD.hoehe)} value={wert} onChange={(e) => setWert(e.target.value)} disabled={!darf} style={{ width: "7rem" }} />}
        </Feld>
        <div className="pb-2">
          <Haken label={tk.sockelverkleidung} checked={an} onChange={setAn} disabled={!darf} />
        </div>
        <Feld label={tk.farbe}>
          {(id) => <input id={id} type="color" value={farbe} onChange={(e) => setFarbe(e.target.value)} disabled={!darf || !an} className="h-10 w-16 cursor-pointer rounded border border-linie bg-weiss disabled:opacity-50" />}
        </Feld>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">{tk.logoBanner}</span>
        {v.bildId != null ? <img src={`/datei/${schauId}/bild/${v.bildId}`} alt={tk.logo} className="h-12 max-w-[16rem] rounded border border-linie object-contain" /> : <span className="text-sm text-grau">{tk.keins}</span>}
        {darf && (
          <>
            <label className="cursor-pointer text-sm font-semibold text-band-dunkel underline">
              {v.bildId != null ? tk.anderesLogo : tk.logoHochladen}
              <input type="file" accept="image/png,image/jpeg" className="sr-only" disabled={bildSetzen.isPending} onChange={(e) => void hochladen(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
            </label>
            {v.bildId != null && (
              <Knopf variante="leise" laedt={bildWeg.isPending} onClick={() => bildWeg.mutate({ schauId })}>
                {tk.logoEntfernen}
              </Knopf>
            )}
          </>
        )}
      </div>
      <Speicherleiste
        sichtbar={geaendert}
        onVerwerfen={() => {
          setWert(anfang.hoehe);
          setAn(anfang.an);
          setFarbe(anfang.farbe);
        }}
        onSpeichern={los}
        laedt={speichern.isPending}
        knopf={tk.aufstellerSpeichern}
      />
    </Abschnitt>
  );
}

/**
 * Logo der Verkleidung vor dem Hochladen: höchstens 2000 Pixel. Ein PNG bleibt PNG (Transparenz – in 3D liegt es sauber auf
 * der weißen Plane), sonst JPEG auf weißem Grund. In 3D wird es ohnehin auf 512 px verkleinert.
 */
async function sockelBildVorbereiten(datei: File): Promise<{ base64: string; name: string }> {
  const bitmap = await createImageBitmap(datei);
  const f = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bitmap.width * f));
  c.height = Math.max(1, Math.round(bitmap.height * f));
  const g = c.getContext("2d")!;
  const png = datei.type === "image/png";
  if (!png) {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, c.width, c.height);
  }
  g.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  let blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, png ? "image/png" : "image/jpeg", 0.88));
  // Ein PNG, das zu groß würde: doch JPEG auf Weiß.
  if (png && blob && blob.size > 1.8 * 1024 * 1024) {
    g.globalCompositeOperation = "destination-over";
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, c.width, c.height);
    blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.88));
  }
  // bleibt deutsch (interner Fehler, nie angezeigt: der Aufrufer meldet „Das Bild lässt sich nicht lesen.“)
  if (!blob) throw new Error("Bild nicht lesbar");
  const base64 = await new Promise<string>((ok, nein) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => nein(new Error("Datei nicht lesbar")); // bleibt deutsch (intern, nie angezeigt)
    r.readAsDataURL(blob);
  });
  return { base64, name: `${datei.name.replace(/\.[^.]+$/, "")}.${blob.type === "image/png" ? "png" : "jpg"}` };
}
