import { useMemo, useState, type FormEvent } from "react";
import { datum, fehlerText } from "../lib";
import { Rassebilder } from "./rassebilder";
import { trpc } from "../trpc";
import { Dialog, Eingabe, FehlerAnzeige, Feld, HilfeLink, Hinweis, Knopf, Laden, Leer, Marke, SEITE, Seitenkopf, Suchfeld, TabellenRahmen, Textfeld, useFrage, useMeldung } from "../ui";

export function Stammdaten() {
  const versionen = trpc.stammdaten.versionen.useQuery();
  const status = trpc.auth.status.useQuery();
  const [ansicht, setAnsicht] = useState<number | null>(null);
  const [neu, setNeu] = useState(false);
  const [ergaenzen, setErgaenzen] = useState<{ id: number; name: string } | null>(null);
  const [bilder, setBilder] = useState<{ id: number; name: string } | null>(null);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const loeschen = trpc.stammdaten.loeschen.useMutation({
    onSuccess: () => utils.stammdaten.versionen.invalidate(),
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const istAdmin = status.data?.benutzer?.rolle === "admin";

  const einspielenKnopf = istAdmin && (
    <Knopf variante="primaer" onClick={() => setNeu(true)}>
      Verzeichnis einspielen
    </Knopf>
  );

  return (
    <div className={SEITE}>
      <Seitenkopf titel="Rassen und Farbenschläge" hilfe="rassen-und-farbenschläge" aktionen={einspielenKnopf} />
      {versionen.error ? (
        <FehlerAnzeige fehler={versionen.error} nochmal={() => versionen.refetch()} />
      ) : versionen.isLoading ? (
        <Laden />
      ) : versionen.data?.length === 0 ? (
        <Leer titel="Noch kein Verzeichnis vorhanden">{einspielenKnopf && <div className="mt-2">{einspielenKnopf}</div>}</Leer>
      ) : (
        <TabellenRahmen
          fuss={
            <>
              <span>
                {versionen.data?.length} {versionen.data?.length === 1 ? "Version" : "Versionen"}
              </span>
              <span>{(versionen.data ?? []).reduce((n, v) => n + v.farbenschlaege, 0).toLocaleString("de-DE")} Farbenschläge</span>
            </>
          }
        >
          <table className="tabelle">
            <thead>
              <tr>
                <th>Name</th>
                <th className="text-right">Jahr</th>
                <th>Quelle</th>
                <th className="text-right">Farbenschläge</th>
                <th>Eingespielt</th>
                <th>
                  <span className="sr-only">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {versionen.data?.map((v) => (
                <tr key={v.id}>
                  <td>
                    <button type="button" onClick={() => setAnsicht(v.id)} className="text-left font-semibold text-tinte hover:text-band hover:underline">
                      {v.name}
                    </button>
                    {!v.eigene && (
                      <span className="mt-1 block">
                        <Marke>für alle Vereine bereitgestellt</Marke>
                      </span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{v.jahr}</td>
                  <td className="text-grau">{v.quelle || "–"}</td>
                  <td className="text-right tabular-nums">{v.farbenschlaege.toLocaleString("de-DE")}</td>
                  <td className="whitespace-nowrap tabular-nums">{datum(v.createdAt)}</td>
                  <td className="whitespace-nowrap text-right">
                    <span className="inline-flex flex-wrap justify-end gap-1">
                      <Knopf variante="leise" className="min-h-8 px-2" onClick={() => setAnsicht(v.id)}>
                        Ansehen
                      </Knopf>
                      <Knopf variante="leise" className="min-h-8 px-2" onClick={() => setBilder({ id: v.id, name: v.name })}>
                        Bilder
                      </Knopf>
                      {istAdmin && v.eigene && (
                        <Knopf variante="leise" className="min-h-8 px-2" onClick={() => setErgaenzen({ id: v.id, name: v.name })}>
                          Ergänzen
                        </Knopf>
                      )}
                      {istAdmin && v.eigene && (
                        <Knopf
                          variante="leise"
                          className="min-h-8 px-2 text-kamm hover:bg-kamm-hell"
                          onClick={async () => (await bestaetige({ titel: `„${v.name}“ löschen?`, knopf: "Löschen", gefahr: true })) && loeschen.mutate({ id: v.id })}
                        >
                          Löschen
                        </Knopf>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabellenRahmen>
      )}
      <Dialog offen={neu} onSchliessen={() => setNeu(false)} titel="Verzeichnis einspielen" breit>
        <Import fertig={() => setNeu(false)} />
      </Dialog>
      <Dialog offen={ergaenzen != null} onSchliessen={() => setErgaenzen(null)} titel={`Ergänzen: ${ergaenzen?.name ?? ""}`} breit>
        {ergaenzen && <Ergaenzen versionId={ergaenzen.id} />}
      </Dialog>
      <Dialog offen={bilder != null} onSchliessen={() => setBilder(null)} titel={`Rassebilder: ${bilder?.name ?? ""}`} breit>
        {bilder && <Rassebilder versionId={bilder.id} istAdmin={istAdmin} />}
      </Dialog>
      <Dialog offen={ansicht != null} onSchliessen={() => setAnsicht(null)} titel="Verzeichnis" breit>
        {ansicht != null && <Baum versionId={ansicht} />}
      </Dialog>
    </div>
  );
}

function Import({ fertig }: { fertig: () => void }) {
  const [name, setName] = useState("");
  const [jahr, setJahr] = useState(new Date().getFullYear());
  const [quelle, setQuelle] = useState("");
  const [csv, setCsv] = useState("");
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const imp = trpc.stammdaten.importieren.useMutation({
    onSuccess: (r) => {
      utils.stammdaten.versionen.invalidate();
      meldung(`${r.farbenschlaege} Farbenschläge eingespielt.${r.hinweise.length ? ` ${r.hinweise.length} Zeilen übersprungen.` : ""}`);
      fertig();
    },
  });
  const datei = async (f: File | undefined) => {
    if (!f) return;
    setCsv(await f.text());
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  };
  const senden = (e: FormEvent) => {
    e.preventDefault();
    imp.mutate({ name, jahr, quelle, csv });
  };
  return (
    <form onSubmit={senden} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Feld label="Name" className="sm:col-span-2">{(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} required />}</Feld>
        <Feld label="Jahr">{(id) => <Eingabe id={id} type="number" value={jahr} onChange={(e) => setJahr(Number(e.target.value))} required />}</Feld>
      </div>
      <Feld label="Quelle" hinweis="z. B. „BDRG-Verzeichnis, Stand August 2026“">{(id) => <Eingabe id={id} value={quelle} onChange={(e) => setQuelle(e.target.value)} />}</Feld>
      <Feld label="Datei" hinweis="CSV: Sparte;Rasse;Farbenschlag">
        {(id) => <input id={id} type="file" accept=".csv,.txt,text/csv" onChange={(e) => datei(e.target.files?.[0])} className="text-sm file:mr-3 file:rounded-md file:border file:border-linie-stark file:bg-weiss file:px-3 file:py-1.5 file:font-semibold file:text-tinte hover:file:bg-papier" />}
      </Feld>
      <Feld label="Inhalt">
        {(id) => <Textfeld id={id} rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="Sparte;Rasse;Farbenschlag" className="font-mono text-sm" required />}
      </Feld>
      {imp.error && <Hinweis ton="fehler">{fehlerText(imp.error)}</Hinweis>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linie pt-4">
        <HilfeLink abschnitt="verzeichnis-einspielen">Hilfe zum Einspielen</HilfeLink>
        <Knopf type="submit" variante="primaer" laedt={imp.isPending}>
          Einspielen
        </Knopf>
      </div>
    </form>
  );
}

/** Fehlende Rasse oder fehlenden Farbenschlag von Hand ins eingespielte Verzeichnis aufnehmen. */
function Ergaenzen({ versionId }: { versionId: number }) {
  const gliederung = trpc.stammdaten.gliederung.useQuery({ versionId });
  const [sparte, setSparte] = useState("");
  const [rasse, setRasse] = useState("");
  const [farben, setFarben] = useState("");
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const gleich = (a: string, b: string) => a.trim().localeCompare(b.trim(), "de", { sensitivity: "accent" }) === 0;
  const sp = gliederung.data?.sparten.find((s) => gleich(s.name, sparte));
  const rassen = useMemo(() => (sp ? (gliederung.data?.rassen ?? []).filter((r) => r.sparteId === sp.id) : []), [sp, gliederung.data]);
  const ra = rassen.find((r) => gleich(r.name, rasse));
  const liste = farben.split(/\r?\n/).map((f) => f.trim()).filter(Boolean);
  const baum = trpc.stammdaten.baum.useQuery({ versionId }, { enabled: !!ra });
  const vorhandeneFarben = ra ? (baum.data ?? []).filter((z) => gleich(z.sparte, sp!.name) && gleich(z.rasse, ra.name)).map((z) => z.farbenschlag) : [];
  const speichern = trpc.stammdaten.ergaenzen.useMutation({
    onSuccess: async (r) => {
      await Promise.all([utils.stammdaten.versionen.invalidate(), utils.stammdaten.gliederung.invalidate({ versionId }), utils.stammdaten.baum.invalidate({ versionId }), utils.stammdaten.suche.invalidate()]);
      const teile = [`${r.angelegt.length} Farbenschl${r.angelegt.length === 1 ? "ag" : "äge"} bei „${r.rasse}“ aufgenommen`];
      if (r.neueRasse) teile.push("Rasse neu angelegt");
      if (r.neueSparte) teile.push("Sparte neu angelegt");
      if (r.schonDa.length) teile.push(`schon vorhanden: ${r.schonDa.join(", ")}`);
      meldung(`${teile.join(" · ")}.`);
      setFarben("");
    },
  });
  const senden = (e: FormEvent) => {
    e.preventDefault();
    speichern.mutate({ versionId, sparte: sparte.trim(), rasse: rasse.trim(), farbenschlaege: liste });
  };
  if (gliederung.error) return <FehlerAnzeige fehler={gliederung.error} nochmal={() => gliederung.refetch()} />;
  if (!gliederung.data) return <Laden />;
  return (
    <form onSubmit={senden} className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Feld label="Sparte" hinweis={sparte.trim() ? (sp ? "vorhanden" : "wird neu angelegt") : "z. B. Hühner, Zwerghühner, Tauben"}>
          {(id) => (
            <>
              <Eingabe id={id} list="ergaenzen-sparten" value={sparte} onChange={(e) => { setSparte(e.target.value); setRasse(""); }} required autoComplete="off" />
              <datalist id="ergaenzen-sparten">
                {gliederung.data.sparten.map((s) => <option key={s.id} value={s.name} />)}
              </datalist>
            </>
          )}
        </Feld>
        <Feld label="Rasse" hinweis={rasse.trim() ? (ra ? `vorhanden, ${vorhandeneFarben.length || "…"} Farbenschläge` : "wird neu angelegt") : sp ? `${rassen.length} Rassen in dieser Sparte` : "erst die Sparte wählen"}>
          {(id) => (
            <>
              <Eingabe id={id} list="ergaenzen-rassen" value={rasse} onChange={(e) => setRasse(e.target.value)} required autoComplete="off" disabled={!sparte.trim()} />
              <datalist id="ergaenzen-rassen">
                {rassen.map((r) => <option key={r.id} value={r.name} />)}
              </datalist>
            </>
          )}
        </Feld>
      </div>
      <Feld label="Farbenschläge" hinweis="Einer je Zeile">
        {(id) => <Textfeld id={id} rows={5} value={farben} onChange={(e) => setFarben(e.target.value)} required />}
      </Feld>
      {ra && vorhandeneFarben.length > 0 && (
        <p className="text-sm text-grau">
          Bisher bei {ra.name}: {vorhandeneFarben.join(", ")}
        </p>
      )}
      {speichern.error && <Hinweis ton="fehler">{fehlerText(speichern.error)}</Hinweis>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linie pt-4">
        <HilfeLink abschnitt="ergänzen-fehlende-rasse-oder-farbenschlag">Hilfe zum Ergänzen</HilfeLink>
        <Knopf type="submit" variante="primaer" laedt={speichern.isPending} disabled={!liste.length}>
          Aufnehmen
        </Knopf>
      </div>
    </form>
  );
}

function Baum({ versionId }: { versionId: number }) {
  const baum = trpc.stammdaten.baum.useQuery({ versionId });
  const [filter, setFilter] = useState("");
  if (baum.error) return <FehlerAnzeige fehler={baum.error} nochmal={() => baum.refetch()} />;
  if (baum.isLoading) return <Laden />;
  const f = filter.toLowerCase();
  const zeilen = (baum.data ?? []).filter((z) => !f || `${z.sparte} ${z.rasse} ${z.farbenschlag}`.toLowerCase().includes(f));
  return (
    <TabellenRahmen
      kopf={<Suchfeld aria-label="Rassen und Farbenschläge durchsuchen" placeholder="Sparte, Rasse oder Farbenschlag" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      fuss={
        <span>
          {zeilen.length === (baum.data ?? []).length ? `${zeilen.length} Farbenschläge` : `${zeilen.length} von ${(baum.data ?? []).length} Farbenschlägen`}
        </span>
      }
    >
      <div className="max-h-[60vh] overflow-auto">
        {zeilen.length === 0 ? (
          <p className="px-4 py-10 text-center text-grau">Keine Treffer.</p>
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th className="text-right">Folge</th>
                <th>Sparte</th>
                <th>Rasse</th>
                <th>Farbenschlag</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z, i) => (
                <tr key={i}>
                  <td className="text-right tabular-nums text-grau">{(baum.data ?? []).indexOf(z) + 1}</td>
                  <td>{z.sparte}</td>
                  <td>{z.rasse}</td>
                  <td>{z.farbenschlag}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </TabellenRahmen>
  );
}
