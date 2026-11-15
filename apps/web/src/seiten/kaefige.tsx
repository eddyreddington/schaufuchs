import { AUFSTELLER_STANDARD, verkleidungVon, type Aufsteller, ETAGEN_MAX, KAEFIG_FUER, KAEFIG_RICHTWERT, KAEFIG_TYPEN, kaefigeJePlatte, kaefigMass, platteFuer, kaefigName, kaefigNameLang, type KaefigMasse, type KaefigTyp } from "@schau/domain";
import { useState } from "react";
import { fehlerText } from "../lib";
import { useSchauId } from "../rahmen";
import { useIstAdmin } from "../rolle";
import { trpc, type Ausgabe } from "../trpc";
import { Abschnitt, Auswahl, Eingabe, FehlerAnzeige, Feld, Haken, HilfeLink, Hinweis, Knopf, Laden, Leer, Seitenkopf, Speicherleiste, useMeldung } from "../ui";

/**
 * Käfigbedarf für den Aufbau der Halle: je Käfiggröße, wie viele Tiere gemeldet und bestätigt sind und welche
 * Käfignummern (= Katalognummern) dazugehören. Darunter die Käfiggröße je Rasse – Abweichungen legt die
 * Ausstellungsleitung fest (z. B. große Hühnerrassen im Großkäfig).
 */
export function Kaefige() {
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
  const summe = (k: "gemeldet" | "bestaetigt") => d.typen.reduce((n, t) => n + t[k], 0);
  return (
    <div className="flex flex-col gap-6">
      <Seitenkopf
        titel="Käfige"
        unter={`${summe("gemeldet")} Käfige gemeldet, ${summe("bestaetigt")} bestätigt`}
        hilfe="käfige-käfigbedarf"
        aktionen={<Knopf onClick={() => window.print()}>Drucken</Knopf>}
      />
      <Abschnitt titel="Käfigmaße und Bedarf">
        <div className="overflow-x-auto">
          <table className="tabelle">
            <thead>
              <tr>
                <th scope="col">Käfig (Breite × Tiefe × Höhe)</th>
                <th scope="col">für</th>
                <th scope="col">Richtwert (Kantenlänge)</th>
                <th scope="col" className="text-right">gemeldet</th>
                <th scope="col" className="text-right">bestätigt</th>
                <th scope="col">Käfignummern (bestätigt)</th>
              </tr>
            </thead>
            <tbody>
              {d.typen.map((t) => (
                <tr key={t.typ} className={t.gemeldet ? "" : "text-grau"}>
                  <td>
                    <MassZelle schauId={schauId} typ={t.typ as KaefigTyp} masse={d.masse} label={t.label} darf={istAdmin} />
                  </td>
                  <td className="text-sm">{KAEFIG_FUER[t.typ as KaefigTyp]}</td>
                  <td className="text-sm text-grau">{KAEFIG_RICHTWERT[t.typ as KaefigTyp]}</td>
                  <td className="text-right">{t.gemeldet}</td>
                  <td className="text-right">{t.bestaetigt}</td>
                  <td>{t.nummern || "–"}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td>Zusammen</td>
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
            {[d.ohneKaefig > 0 ? `Dazu ${d.ohneKaefig} Satz Bruteier ohne Käfig.` : "", d.einzelwahl > 0 ? `${d.einzelwahl} ${d.einzelwahl === 1 ? "Tier steht" : "Tiere stehen"} in einem anderen Käfig.` : ""].filter(Boolean).join(" ")}
          </p>
        )}
      </Abschnitt>
      <Grundplatten key={`${d.platte.laenge}-${d.platte.tiefe}-${JSON.stringify(d.jePlatte)}-${JSON.stringify(d.plattenMass)}-${JSON.stringify(d.etagen)}`} schauId={schauId} d={d} darf={istAdmin} />
      <AufstellerFeld key={JSON.stringify(d.aufsteller)} schauId={schauId} aufsteller={d.aufsteller} darf={istAdmin} />
      <Abschnitt titel="Käfiggröße je Rasse">
        {!istAdmin && <Hinweis className="mb-3">Ändern kann nur die Ausstellungsleitung.</Hinweis>}
        {d.nachBloecken && d.nummernVergeben && (
          <Hinweis ton="warnung" className="mb-3">
            {d.festgeschrieben
              ? "Katalognummern festgeschrieben: Änderungen hier ändern keine Käfignummern."
              : "Nach einer Änderung unter „Katalognummern“ neu nummerieren."}
          </Hinweis>
        )}
        {d.rassen.length === 0 ? (
          <Leer titel="Noch keine gemeldeten Einzeltiere" />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabelle">
              <thead>
                <tr>
                  <th scope="col">Rasse</th>
                  <th scope="col">Sparte</th>
                  <th scope="col" className="text-right">Tiere</th>
                  <th scope="col">Käfiggröße</th>
                  <th scope="col">Vorschlag</th>
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
                        aria-label={`Käfiggröße für ${r.rasse}`}
                        disabled={!istAdmin || regel.isPending}
                        value={r.typ === r.auto ? "" : r.typ}
                        onChange={(e) => regel.mutate({ schauId, rasse: r.rasse, typ: (e.target.value || null) as KaefigTyp | null })}
                        className="max-w-64"
                      >
                        <option value="">automatisch ({kaefigNameLang(r.auto, d.masse)})</option>
                        {KAEFIG_TYPEN.filter((t) => t !== "stamm" && t !== "voliere" && t !== r.auto).map((t) => (
                          <option key={t} value={t}>{kaefigNameLang(t, d.masse)}</option>
                        ))}
                      </Auswahl>
                    </td>
                    <td className="text-sm">
                      {r.vorschlag && r.vorschlag.typ !== r.typ ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span title={r.vorschlag.grund}>
                            {kaefigName(r.vorschlag.typ, d.masse)} <span className="text-grau">({r.vorschlag.grund})</span>
                          </span>
                          {istAdmin && (
                            <Knopf variante="leise" className="min-h-8 px-2" laedt={regel.isPending} onClick={() => regel.mutate({ schauId, rasse: r.rasse, typ: r.vorschlag!.typ })}>
                              übernehmen
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
        {!masse[typ] && <span className="text-xs text-grau">(Richtwert)</span>}
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
            Maße ändern
          </Knopf>
        )}
      </span>
    );
  const feld = (k: "breite" | "tiefe" | "hoehe", name: string) => (
    <Eingabe aria-label={`${name} in cm`} placeholder={name} inputMode="decimal" value={wert[k]} onChange={(e) => setWert({ ...wert, [k]: e.target.value })} className="w-20 px-2 py-1 text-sm" />
  );
  return (
    <form
      className="flex flex-wrap items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const mass = { breite: zahl(wert.breite), tiefe: zahl(wert.tiefe), hoehe: zahl(wert.hoehe) };
        if (![mass.breite, mass.tiefe, mass.hoehe].every((n) => Number.isFinite(n) && n >= 10)) {
          meldung("Bitte Breite, Tiefe und Höhe als Zahlen in cm eintragen (mindestens 10).", "fehler");
          return;
        }
        setzen.mutate({ schauId, typ, mass });
      }}
    >
      {feld("breite", "Breite")} × {feld("tiefe", "Tiefe")} × {feld("hoehe", "Höhe")} cm
      <Knopf variante="primaer" type="submit" className="min-h-8 px-2" laedt={setzen.isPending}>
        Speichern
      </Knopf>
      {masse[typ] && (
        <Knopf variante="leise" className="min-h-8 px-2" onClick={() => setzen.mutate({ schauId, typ, mass: null })}>
          Richtwert
        </Knopf>
      )}
      <Knopf variante="leise" className="min-h-8 px-2" onClick={() => setOffen(false)}>
        Abbrechen
      </Knopf>
    </form>
  );
}

/**
 * Grundplatten: Maß der Platte, auf der die Käfige stehen, und wie viele Käfige einer Art auf einer Platte stehen
 * (leer = automatisch aus Platte und Käfigbreite). Gilt für den Hallenplan; dazu der Plattenbedarf je Käfigart.
 */
function Grundplatten({ schauId, d, darf }: { schauId: number; d: Ausgabe["katalog"]["kaefigbedarf"]; darf: boolean }) {
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
      meldung("Grundplatten gespeichert. Ist der Hallenplan festgeschrieben, dort „Plan neu setzen“, damit er die neuen Platten nutzt.");
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
  const typen = d.typen.filter((t) => t.typ !== "voliere");
  return (
    <Abschnitt titel="Grundplatten">
      {!d.hatHalle && <Hinweis className="mb-3">Erst unter „Hallenplan“ die Halle anlegen.</Hinweis>}
      <div className="overflow-x-auto">
        <table className="tabelle">
          <thead>
            <tr>
              <th scope="col">Käfig</th>
              <th scope="col">Platte (Länge × Tiefe cm)</th>
              <th scope="col" className="text-right">automatisch je Platte</th>
              <th scope="col">Käfige je Platte</th>
              <th scope="col">Etagen</th>
              <th scope="col" className="text-right">Platten für die gemeldeten (mindestens)</th>
            </tr>
          </thead>
          <tbody>
            {typen.map((t) => {
              const mass = kaefigMass(t.typ as KaefigTyp, d.masse);
              const typ = t.typ as KaefigTyp;
              const auto = mass ? kaefigeJePlatte(typ, mass.breite, { platte, jePlatte: {}, plattenMass }) : null;
              const n = mass ? kaefigeJePlatte(typ, mass.breite, { platte, jePlatte, plattenMass }) : null;
              const vorgabe = mass ? platteFuer(typ, mass, { platte, jePlatte, plattenMass: {} }) : null;
              const wert = eigen[t.typ] ?? { laenge: "", tiefe: "" };
              return (
                <tr key={t.typ} className={t.gemeldet ? "" : "text-grau"}>
                  <td className="font-bold">{t.label}</td>
                  <td>
                    <span className="flex items-center gap-1">
                    <Eingabe
                      aria-label={`Plattenlänge für ${t.label}`}
                      inputMode="decimal"
                      placeholder={vorgabe ? String(vorgabe.laenge) : ""}
                      value={wert.laenge}
                      onChange={(e) => setEigen({ ...eigen, [t.typ]: { ...wert, laenge: e.target.value } })}
                      disabled={!darf}
                      className="px-2 py-1 text-sm"
                      style={{ width: "4.5rem" }}
                    />
                    ×
                    <Eingabe
                      aria-label={`Plattentiefe für ${t.label}`}
                      inputMode="decimal"
                      placeholder={vorgabe ? String(vorgabe.tiefe) : ""}
                      value={wert.tiefe}
                      onChange={(e) => setEigen({ ...eigen, [t.typ]: { ...wert, tiefe: e.target.value } })}
                      disabled={!darf}
                      className="px-2 py-1 text-sm"
                      style={{ width: "4.5rem" }}
                    />
                    </span>
                  </td>
                  <td className="text-right">{auto ?? "–"}</td>
                  <td>
                    <Eingabe
                      aria-label={`Käfige je Platte für ${t.label}`}
                      inputMode="numeric"
                      placeholder={auto != null ? String(auto) : ""}
                      value={je[t.typ] ?? ""}
                      onChange={(e) => setJe({ ...je, [t.typ]: e.target.value })}
                      disabled={!darf}
                      className="px-2 py-1 text-sm"
                      style={{ width: "4rem" }}
                    />
                  </td>
                  <td>
                    <Eingabe
                      aria-label={`Etagen für ${t.label}`}
                      inputMode="numeric"
                      placeholder="1"
                      value={et[t.typ] ?? ""}
                      onChange={(e) => setEt({ ...et, [t.typ]: e.target.value })}
                      disabled={!darf}
                      className="px-2 py-1 text-sm"
                      style={{ width: "3.5rem" }}
                    />
                  </td>
                  <td className="text-right">{n && t.gemeldet ? Math.ceil(t.gemeldet / (n * (etagen[typ] ?? 1))) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {halbVoll && <Hinweis className="mt-3">Plattenmaß: Länge und Tiefe angeben oder beide leer lassen.</Hinweis>}
      {darf && d.hatHalle && (
        <Knopf variante="primaer" className="mt-3" laedt={speichern.isPending} disabled={halbVoll} onClick={() => speichern.mutate({ schauId, platte, jePlatte, plattenMass, etagen })}>
          Grundplatten speichern
        </Knopf>
      )}
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
        knopf="Grundplatten speichern"
      />
    </Abschnitt>
  );
}

/**
 * Aufsteller: Höhe der Gestelle unter den Grundplatten (cm) und ihre Verkleidung (an/aus, Farbe, Bild einer Plane) – für die
 * 3D-Ansicht des Hallenplans. Höhe leer = Vorgabe.
 */
function AufstellerFeld({ schauId, aufsteller, darf }: { schauId: number; aufsteller: Aufsteller; darf: boolean }) {
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
      meldung("Aufsteller gespeichert.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const bildSetzen = trpc.katalog.sockelBildSetzen.useMutation({
    onSuccess: async () => {
      await neuLaden();
      meldung("Logo der Verkleidung gespeichert.");
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const bildWeg = trpc.katalog.sockelBildEntfernen.useMutation({ onSuccess: () => neuLaden(), onError: (e) => meldung(fehlerText(e), "fehler") });
  const los = () => !falsch && speichern.mutate({ schauId, aufsteller: { hoehe: wert.trim() === "" ? AUFSTELLER_STANDARD.hoehe : zahl, verkleidung: { an, farbe } } });
  const hochladen = async (datei: File | undefined) => {
    if (!datei) return;
    const b = await sockelBildVorbereiten(datei).catch(() => null);
    if (!b) return meldung("Das Bild lässt sich nicht lesen.", "fehler");
    bildSetzen.mutate({ schauId, ...b });
  };
  return (
    <Abschnitt titel="Aufsteller" aktionen={<HilfeLink abschnitt="hallenplan-3d">Hilfe zu Aufstellern</HilfeLink>}>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <Feld label="Höhe bis Oberkante Grundplatte (cm)" fehler={falsch ? "0 bis 300 cm" : null}>
          {(id) => <Eingabe id={id} inputMode="decimal" placeholder={String(AUFSTELLER_STANDARD.hoehe)} value={wert} onChange={(e) => setWert(e.target.value)} disabled={!darf} style={{ width: "7rem" }} />}
        </Feld>
        <div className="pb-2">
          <Haken label="Sockelverkleidung" checked={an} onChange={setAn} disabled={!darf} />
        </div>
        <Feld label="Farbe der Verkleidung">
          {(id) => <input id={id} type="color" value={farbe} onChange={(e) => setFarbe(e.target.value)} disabled={!darf || !an} className="h-10 w-16 cursor-pointer rounded border border-linie bg-weiss disabled:opacity-50" />}
        </Feld>
        {darf && (
          <Knopf variante="primaer" laedt={speichern.isPending} disabled={falsch || !geaendert} onClick={los}>
            Aufsteller speichern
          </Knopf>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Logo bzw. Banner der Verkleidung (z. B. vom Futtermittel-Sponsor)</span>
        {v.bildId != null ? <img src={`/datei/${schauId}/bild/${v.bildId}`} alt="Logo der Verkleidung" className="h-12 max-w-[16rem] rounded border border-linie object-contain" /> : <span className="text-sm text-grau">keins</span>}
        {darf && (
          <>
            <label className="cursor-pointer text-sm font-semibold text-band-dunkel underline">
              {v.bildId != null ? "Anderes Logo" : "Logo hochladen"}
              <input type="file" accept="image/png,image/jpeg" className="sr-only" disabled={bildSetzen.isPending} onChange={(e) => void hochladen(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
            </label>
            {v.bildId != null && (
              <Knopf variante="leise" laedt={bildWeg.isPending} onClick={() => bildWeg.mutate({ schauId })}>
                Logo entfernen
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
        knopf="Aufsteller speichern"
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
  if (!blob) throw new Error("Bild nicht lesbar");
  const base64 = await new Promise<string>((ok, nein) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => nein(new Error("Datei nicht lesbar"));
    r.readAsDataURL(blob);
  });
  return { base64, name: `${datei.name.replace(/\.[^.]+$/, "")}.${blob.type === "image/png" ? "png" : "jpg"}` };
}
