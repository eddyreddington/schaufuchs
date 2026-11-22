import { LOCALE } from "@schau/domain";
import { useMemo, useState, type FormEvent } from "react";
import { datum, fehlerText } from "../lib";
import { useOberflaeche, useSprache } from "../sprache";
import { Rassebilder } from "./rassebilder";
import { Gruppen } from "./stammdaten-gruppen";
import { trpc } from "../trpc";
import { Dialog, Eingabe, FehlerAnzeige, Feld, HilfeLink, Hinweis, Knopf, Laden, Leer, Marke, SEITE, Seitenkopf, Suchfeld, TabellenRahmen, Textfeld, useFrage, useMeldung } from "../ui";

export function Stammdaten() {
  const versionen = trpc.stammdaten.versionen.useQuery();
  const status = trpc.auth.status.useQuery();
  const [ansicht, setAnsicht] = useState<number | null>(null);
  const [neu, setNeu] = useState(false);
  const [ergaenzen, setErgaenzen] = useState<{ id: number; name: string } | null>(null);
  const [bilder, setBilder] = useState<{ id: number; name: string } | null>(null);
  const [gruppen, setGruppen] = useState<{ id: number; name: string } | null>(null);
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige } = useFrage();
  const ta = useOberflaeche();
  const t = ta.vorlagen.stammdaten;
  const sprache = useSprache();
  const zahl = (n: number) => n.toLocaleString(LOCALE[sprache]);
  const gesamt = (versionen.data ?? []).reduce((n, v) => n + v.farbenschlaege, 0);
  const loeschen = trpc.stammdaten.loeschen.useMutation({
    onSuccess: () => utils.stammdaten.versionen.invalidate(),
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const istAdmin = status.data?.benutzer?.rolle === "admin";

  const einspielenKnopf = istAdmin && (
    <Knopf variante="primaer" onClick={() => setNeu(true)}>
      {t.einspielen}
    </Knopf>
  );

  return (
    <div className={SEITE}>
      {/* bleibt deutsch: Abschnitt im Handbuch */}
      <Seitenkopf titel={t.titel} hilfe="rassen-und-farbenschläge" aktionen={einspielenKnopf} />
      {versionen.error ? (
        <FehlerAnzeige fehler={versionen.error} nochmal={() => versionen.refetch()} />
      ) : versionen.isLoading ? (
        <Laden />
      ) : versionen.data?.length === 0 ? (
        <Leer titel={t.leer}>{einspielenKnopf && <div className="mt-2">{einspielenKnopf}</div>}</Leer>
      ) : (
        <TabellenRahmen
          fuss={
            <>
              <span>{t.versionen(versionen.data?.length ?? 0)}</span>
              <span>{t.farbenschlaege(zahl(gesamt), gesamt)}</span>
            </>
          }
        >
          <table className="tabelle">
            <thead>
              <tr>
                <th>{ta.allgemein.name}</th>
                <th className="text-right">{t.jahr}</th>
                <th>{t.quelle}</th>
                <th className="text-right">{t.farbenschlaegeSpalte}</th>
                <th>{t.eingespielt}</th>
                <th>
                  <span className="sr-only">{t.aktionen}</span>
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
                        <Marke>{t.fuerAlle}</Marke>
                      </span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">{v.jahr}</td>
                  <td className="text-grau">{v.quelle || "–"}</td>
                  <td className="text-right tabular-nums">{zahl(v.farbenschlaege)}</td>
                  <td className="whitespace-nowrap tabular-nums">{datum(v.createdAt)}</td>
                  <td className="whitespace-nowrap text-right">
                    <span className="inline-flex flex-wrap justify-end gap-1">
                      <Knopf variante="leise" className="min-h-8 px-2" onClick={() => setAnsicht(v.id)}>
                        {t.ansehen}
                      </Knopf>
                      <Knopf variante="leise" className="min-h-8 px-2" onClick={() => setBilder({ id: v.id, name: v.name })}>
                        {t.bilder}
                      </Knopf>
                      {istAdmin && v.eigene && (
                        <Knopf variante="leise" className="min-h-8 px-2" onClick={() => setErgaenzen({ id: v.id, name: v.name })}>
                          {t.ergaenzen}
                        </Knopf>
                      )}
                      {istAdmin && v.eigene && (
                        <Knopf variante="leise" className="min-h-8 px-2" onClick={() => setGruppen({ id: v.id, name: v.name })}>
                          {t.gruppen}
                        </Knopf>
                      )}
                      {istAdmin && v.eigene && (
                        <Knopf
                          variante="leise"
                          className="min-h-8 px-2 text-kamm hover:bg-kamm-hell"
                          onClick={async () => (await bestaetige({ titel: ta.vorlagen.liste.loeschenFrage(v.name), knopf: ta.allgemein.loeschen, gefahr: true })) && loeschen.mutate({ id: v.id })}
                        >
                          {ta.allgemein.loeschen}
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
      <Dialog offen={neu} onSchliessen={() => setNeu(false)} titel={t.einspielen} breit>
        <Import fertig={() => setNeu(false)} />
      </Dialog>
      <Dialog offen={ergaenzen != null} onSchliessen={() => setErgaenzen(null)} titel={t.ergaenzenTitel(ergaenzen?.name ?? "")} breit>
        {ergaenzen && <Ergaenzen versionId={ergaenzen.id} />}
      </Dialog>
      <Dialog offen={gruppen != null} onSchliessen={() => setGruppen(null)} titel={t.gruppenTitel(gruppen?.name ?? "")} breit>
        {gruppen && <Gruppen versionId={gruppen.id} />}
      </Dialog>
      <Dialog offen={bilder != null} onSchliessen={() => setBilder(null)} titel={t.rassebilderTitel(bilder?.name ?? "")} breit>
        {bilder && <Rassebilder versionId={bilder.id} istAdmin={istAdmin} />}
      </Dialog>
      <Dialog offen={ansicht != null} onSchliessen={() => setAnsicht(null)} titel={t.verzeichnis} breit>
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
  const ta = useOberflaeche();
  const t = ta.vorlagen.stammdaten;
  const imp = trpc.stammdaten.importieren.useMutation({
    onSuccess: (r) => {
      utils.stammdaten.versionen.invalidate();
      meldung([t.importiert(r.farbenschlaege), ...(r.hinweise.length ? [t.uebersprungen(r.hinweise.length)] : [])].join(" "));
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
        <Feld label={ta.allgemein.name} className="sm:col-span-2">{(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} required />}</Feld>
        <Feld label={t.jahr}>{(id) => <Eingabe id={id} type="number" value={jahr} onChange={(e) => setJahr(Number(e.target.value))} required />}</Feld>
      </div>
      <Feld label={t.quelle} hinweis={t.quelleHinweis}>{(id) => <Eingabe id={id} value={quelle} onChange={(e) => setQuelle(e.target.value)} />}</Feld>
      <Feld label={t.datei} hinweis={t.dateiHinweis}>
        {(id) => <input id={id} type="file" accept=".csv,.txt,text/csv" onChange={(e) => datei(e.target.files?.[0])} className="text-sm file:mr-3 file:rounded-md file:border file:border-linie-stark file:bg-weiss file:px-3 file:py-1.5 file:font-semibold file:text-tinte hover:file:bg-papier" />}
      </Feld>
      <Feld label={t.inhalt}>
        {(id) => <Textfeld id={id} rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={t.inhaltPlatzhalter} className="font-mono text-sm" required />}
      </Feld>
      {imp.error && <Hinweis ton="fehler">{fehlerText(imp.error)}</Hinweis>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linie pt-4">
        <HilfeLink abschnitt="verzeichnis-einspielen">{t.hilfeEinspielen}</HilfeLink>
        <Knopf type="submit" variante="primaer" laedt={imp.isPending}>
          {t.einspielenKnopf}
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
  const t = useOberflaeche().vorlagen.stammdaten;
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
      const teile = [t.aufgenommen(r.angelegt.length, r.rasse)];
      if (r.neueRasse) teile.push(t.rasseNeu);
      if (r.neueSparte) teile.push(t.sparteNeu);
      if (r.schonDa.length) teile.push(t.schonVorhanden(r.schonDa.join(", ")));
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
        <Feld label={t.sparte} hinweis={sparte.trim() ? (sp ? t.vorhanden : t.wirdNeu) : t.sparteBeispiel}>
          {(id) => (
            <>
              <Eingabe id={id} list="ergaenzen-sparten" value={sparte} onChange={(e) => { setSparte(e.target.value); setRasse(""); }} required autoComplete="off" />
              <datalist id="ergaenzen-sparten">
                {gliederung.data.sparten.map((s) => <option key={s.id} value={s.name} />)}
              </datalist>
            </>
          )}
        </Feld>
        <Feld label={t.rasse} hinweis={rasse.trim() ? (ra ? t.rasseVorhanden(vorhandeneFarben.length) : t.wirdNeu) : sp ? t.rassenInSparte(rassen.length) : t.erstSparte}>
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
      <Feld label={t.farbenschlaegeSpalte} hinweis={t.einerJeZeile}>
        {(id) => <Textfeld id={id} rows={5} value={farben} onChange={(e) => setFarben(e.target.value)} required />}
      </Feld>
      {ra && vorhandeneFarben.length > 0 && (
        <p className="text-sm text-grau">
          {t.bisherBei(ra.name, vorhandeneFarben.join(", "))}
        </p>
      )}
      {speichern.error && <Hinweis ton="fehler">{fehlerText(speichern.error)}</Hinweis>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linie pt-4">
        {/* bleibt deutsch: Abschnitt im Handbuch */}
        <HilfeLink abschnitt="ergänzen-fehlende-rasse-oder-farbenschlag">{t.hilfeErgaenzen}</HilfeLink>
        <Knopf type="submit" variante="primaer" laedt={speichern.isPending} disabled={!liste.length}>
          {t.aufnehmen}
        </Knopf>
      </div>
    </form>
  );
}

function Baum({ versionId }: { versionId: number }) {
  const baum = trpc.stammdaten.baum.useQuery({ versionId });
  const [filter, setFilter] = useState("");
  const t = useOberflaeche().vorlagen.stammdaten;
  if (baum.error) return <FehlerAnzeige fehler={baum.error} nochmal={() => baum.refetch()} />;
  if (baum.isLoading) return <Laden />;
  const f = filter.toLowerCase();
  const zeilen = (baum.data ?? []).filter((z) => !f || `${z.sparte} ${z.rasse} ${z.farbenschlag} ${z.gruppe}`.toLowerCase().includes(f));
  // Spalte „Gruppe“ nur, wenn im Verzeichnis Gruppen gepflegt sind.
  const mitGruppe = (baum.data ?? []).some((z) => z.gruppe);
  return (
    <TabellenRahmen
      kopf={<Suchfeld aria-label={t.durchsuchen} placeholder={t.suchPlatzhalter} value={filter} onChange={(e) => setFilter(e.target.value)} />}
      fuss={
        <span>
          {zeilen.length === (baum.data ?? []).length ? t.farbenschlaege(String(zeilen.length), zeilen.length) : t.vonFarbenschlaegen(zeilen.length, (baum.data ?? []).length)}
        </span>
      }
    >
      <div className="max-h-[60vh] overflow-auto">
        {zeilen.length === 0 ? (
          <p className="px-4 py-10 text-center text-grau">{t.keineTreffer}</p>
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th className="text-right">{t.folge}</th>
                <th>{t.sparte}</th>
                <th>{t.rasse}</th>
                <th>{t.farbenschlag}</th>
                {mitGruppe && <th>{t.gruppe}</th>}
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z, i) => (
                <tr key={i}>
                  <td className="text-right tabular-nums text-grau">{(baum.data ?? []).indexOf(z) + 1}</td>
                  <td>{z.sparte}</td>
                  <td>{z.rasse}</td>
                  <td>{z.farbenschlag}</td>
                  {mitGruppe && <td>{z.gruppe}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </TabellenRahmen>
  );
}
