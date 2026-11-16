import { PHASEN, serverText, type Phase } from "@schau/domain";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { datum, fehlerText } from "../lib";
import { useOberflaeche, useSprache } from "../sprache";
import { Symbol } from "../symbole";
import { trpc } from "../trpc";
import { Auswahl, Dialog, Eingabe, FehlerAnzeige, Feld, Haken, HilfeLink, Hinweis, Knopf, Laden, Leer, Marke, SEITE, Seitenkopf, Segmente, Suchfeld, TabellenRahmen, useMeldung } from "../ui";

type Stand = "" | "laufend" | "abgeschlossen";

/** Ton der Phase: laufende Schauen blau, Vorbereitung und Abschluss ruhig. */
const PHASE_TON = (p: Phase) => (p === "abgeschlossen" || p === "vorbereitung" ? "neutral" : "info");

export function SchauListe() {
  const t = useOberflaeche();
  const tl = t.schau.liste;
  const liste = trpc.schau.liste.useQuery();
  const status = trpc.auth.status.useQuery();
  const [neu, setNeu] = useState(false);
  const [q, setQ] = useState("");
  const [stand, setStand] = useState<Stand>("");
  const istAdmin = status.data?.benutzer?.rolle === "admin";
  const alle = liste.data ?? [];
  const laufend = alle.filter((s) => s.phase !== "abgeschlossen").length;
  const such = q.trim().toLocaleLowerCase("de");
  const sichtbar = alle.filter(
    (s) =>
      (!stand || (stand === "abgeschlossen") === (s.phase === "abgeschlossen")) &&
      (!such || `${s.name} ${s.ort}`.toLocaleLowerCase("de").includes(such)),
  );
  const anlegenKnopf = istAdmin && (
    <Knopf variante="primaer" onClick={() => setNeu(true)}>
      {tl.neuAnlegen}
    </Knopf>
  );
  return (
    <div className={SEITE}>
      <Seitenkopf
        titel={tl.titel}
        hilfe={istAdmin ? "schau-anlegen" : "eine-schau-auswählen" /* bleibt deutsch: Anker im Handbuch */}
        hilfeTeil={istAdmin ? undefined : "helfer"}
        aktionen={anlegenKnopf}
      />
      {liste.error ? (
        <FehlerAnzeige fehler={liste.error} nochmal={() => liste.refetch()} />
      ) : liste.isLoading ? (
        <Laden />
      ) : alle.length === 0 ? (
        <Leer titel={tl.keineSchau}>{anlegenKnopf && <div className="mt-2">{anlegenKnopf}</div>}</Leer>
      ) : (
        <TabellenRahmen
          kopf={
            <>
              <Suchfeld aria-label={tl.suchen} placeholder={tl.suchePlatzhalter} value={q} onChange={(e) => setQ(e.target.value)} />
              <Segmente
                label={tl.stand}
                wert={stand}
                onChange={setStand}
                optionen={[
                  { wert: "" as const, label: t.allgemein.alle, anzahl: alle.length },
                  { wert: "laufend" as const, label: tl.laufend, anzahl: laufend },
                  { wert: "abgeschlossen" as const, label: tl.abgeschlossen, anzahl: alle.length - laufend },
                ]}
              />
            </>
          }
          fuss={
            <>
              <span>{tl.anzahl(sichtbar.length)}</span>
              <span>{tl.standZahlen(laufend, alle.length - laufend)}</span>
            </>
          }
        >
          {sichtbar.length === 0 ? (
            <p className="px-4 py-10 text-center text-grau">{tl.keineTreffer}</p>
          ) : (
            <>
              <div aria-hidden className="hidden grid-cols-[minmax(0,1fr)_8rem_8rem_12rem_1rem] gap-x-6 border-b border-linie-stark px-4 py-2 text-sm font-semibold text-grau md:grid">
                <span>{tl.spalteSchau}</span>
                <span>{tl.spalteMeldeschluss}</span>
                <span>{tl.spalteBewertung}</span>
                <span>{tl.spaltePhase}</span>
                <span />
              </div>
              <ul className="divide-y divide-linie">
                {sichtbar.map((s) => {
                  const schritt = PHASEN.indexOf(s.phase) + 1;
                  return (
                    <li key={s.id}>
                      <Link
                        to={`/schau/${s.id}`}
                        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 px-4 py-3 text-tinte no-underline hover:bg-papier md:grid-cols-[minmax(0,1fr)_8rem_8rem_12rem_1rem]"
                      >
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-semibold group-hover:text-band">{s.name}</span>
                            {s.test && <Marke ton="warnung">{tl.testschau}</Marke>}
                          </span>
                          <span className="block truncate text-sm text-grau">
                            {s.ort || "–"}
                            <span className="md:hidden">
                              {" · "}
                              {tl.meldeschlussAm(datum(s.meldeschluss))}
                              {s.bewertungAm && tl.bewertungZusatz(datum(s.bewertungAm))}
                            </span>
                          </span>
                        </span>
                        <span className="hidden text-sm tabular-nums md:block">{datum(s.meldeschluss)}</span>
                        <span className="hidden text-sm tabular-nums md:block">{datum(s.bewertungAm)}</span>
                        <span className="flex items-center gap-2 justify-self-end md:justify-self-start">
                          <Marke ton={PHASE_TON(s.phase)}>{t.fach.PHASEN_LABEL[s.phase]}</Marke>
                          <span className="hidden text-xs tabular-nums text-grau lg:inline">
                            {schritt}/{PHASEN.length}
                          </span>
                        </span>
                        <Symbol name="rechts" className="hidden size-4 text-grau group-hover:text-tinte md:block" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </TabellenRahmen>
      )}
      <Dialog offen={neu} onSchliessen={() => setNeu(false)} titel={tl.neuAnlegen}>
        <NeueSchau schauen={alle} />
      </Dialog>
    </div>
  );
}

function NeueSchau({ schauen }: { schauen: { id: number; name: string; ort: string; test: boolean }[] }) {
  // Vorschlag: die neueste echte Schau als Vorlage – so kommen Einstellungen, Gebühren, Preise, Preisrichter und Halle mit.
  const echte = schauen.filter((x) => !x.test);
  const neueste = [...echte].sort((a, b) => b.id - a.id)[0];
  const [test, setTest] = useState(false);
  // Eine Testschau bringt erfundene Preisrichter und Texte mit: Vorlage nur für eine weitere Testschau.
  const vorlagen = test ? schauen : echte;
  const [vorlage, setVorlage] = useState<string>(neueste ? String(neueste.id) : "");
  const [name, setName] = useState("");
  const [ort, setOrt] = useState(neueste?.ort ?? "");
  const navigate = useNavigate();
  const meldung = useMeldung();
  const t = useOberflaeche();
  const tn = t.schau.neu;
  const sprache = useSprache();
  const anlegen = trpc.schau.anlegen.useMutation({
    onSuccess: (r) => {
      if (r.demodaten?.ok) meldung(tn.angelegtDemo(r.demodaten.meldungen, r.demodaten.tiere));
      else if (r.demodaten) meldung(tn.angelegtFehler(serverText(r.demodaten.fehler, sprache)), "fehler");
      navigate(r.demodaten?.ok ? `/schau/${r.id}` : `/schau/${r.id}/einstellungen`);
    },
  });
  const senden = (e: FormEvent) => {
    e.preventDefault();
    // Eine Testschau kommt immer gleich mit Demodaten.
    anlegen.mutate({ name, ort, test, demodaten: test, ...(vorlage ? { vorlageId: Number(vorlage) } : {}) });
  };
  return (
    <form onSubmit={senden} className="flex flex-col gap-4">
      <Feld label={tn.name} hinweis={tn.nameHinweis}>
        {(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} required minLength={3} autoFocus data-autofocus />}
      </Feld>
      <Feld label={tn.ort}>{(id) => <Eingabe id={id} value={ort} onChange={(e) => setOrt(e.target.value)} />}</Feld>
      {vorlagen.length > 0 && (
        <Feld label={tn.vorlage} hinweis={vorlage ? tn.vorlageHinweis : undefined}>
          {(id) => (
            <Auswahl
              id={id}
              value={vorlage}
              onChange={(e) => {
                setVorlage(e.target.value);
                const v = schauen.find((x) => String(x.id) === e.target.value);
                if (v && !ort.trim()) setOrt(v.ort);
              }}
            >
              <option value="">{tn.keineVorlage}</option>
              {[...vorlagen]
                .sort((a, b) => b.id - a.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {tn.ausVorlage(x.name, x.test)}
                  </option>
                ))}
            </Auswahl>
          )}
        </Feld>
      )}
      <Haken
        label={t.schau.liste.testschau}
        checked={test}
        onChange={(v) => {
          setTest(v);
          if (!v && schauen.find((x) => String(x.id) === vorlage)?.test) setVorlage(neueste ? String(neueste.id) : "");
        }}
        hinweis={tn.testHinweis}
      />
      {anlegen.error && <Hinweis ton="fehler">{fehlerText(anlegen.error)}</Hinweis>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linie pt-4">
        <HilfeLink abschnitt="schau-anlegen">{tn.hilfe}</HilfeLink>
        <Knopf type="submit" variante="primaer" laedt={anlegen.isPending}>
          {anlegen.isPending && test ? tn.demoLaeuft : tn.anlegen}
        </Knopf>
      </div>
    </form>
  );
}
