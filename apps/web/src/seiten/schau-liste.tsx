import { PHASEN, PHASEN_LABEL, type Phase } from "@schau/domain";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { datum, fehlerText } from "../lib";
import { Symbol } from "../symbole";
import { trpc } from "../trpc";
import { Auswahl, Dialog, Eingabe, FehlerAnzeige, Feld, Haken, HilfeLink, Hinweis, Knopf, Laden, Leer, Marke, SEITE, Seitenkopf, Segmente, Suchfeld, TabellenRahmen, useMeldung } from "../ui";

type Stand = "" | "laufend" | "abgeschlossen";

/** Ton der Phase: laufende Schauen blau, Vorbereitung und Abschluss ruhig. */
const PHASE_TON = (p: Phase) => (p === "abgeschlossen" || p === "vorbereitung" ? "neutral" : "info");

export function SchauListe() {
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
      Neue Schau anlegen
    </Knopf>
  );
  return (
    <div className={SEITE}>
      <Seitenkopf
        titel="Schauen"
        hilfe={istAdmin ? "schau-anlegen" : "eine-schau-auswählen"}
        hilfeTeil={istAdmin ? undefined : "helfer"}
        aktionen={anlegenKnopf}
      />
      {liste.error ? (
        <FehlerAnzeige fehler={liste.error} nochmal={() => liste.refetch()} />
      ) : liste.isLoading ? (
        <Laden />
      ) : alle.length === 0 ? (
        <Leer titel="Noch keine Schau angelegt">{anlegenKnopf && <div className="mt-2">{anlegenKnopf}</div>}</Leer>
      ) : (
        <TabellenRahmen
          kopf={
            <>
              <Suchfeld aria-label="Schau suchen" placeholder="Name oder Ort" value={q} onChange={(e) => setQ(e.target.value)} />
              <Segmente
                label="Stand"
                wert={stand}
                onChange={setStand}
                optionen={[
                  { wert: "" as const, label: "Alle", anzahl: alle.length },
                  { wert: "laufend" as const, label: "Laufend", anzahl: laufend },
                  { wert: "abgeschlossen" as const, label: "Abgeschlossen", anzahl: alle.length - laufend },
                ]}
              />
            </>
          }
          fuss={
            <>
              <span>
                {sichtbar.length} {sichtbar.length === 1 ? "Schau" : "Schauen"}
              </span>
              <span>
                {laufend} laufend, {alle.length - laufend} abgeschlossen
              </span>
            </>
          }
        >
          {sichtbar.length === 0 ? (
            <p className="px-4 py-10 text-center text-grau">Keine Treffer.</p>
          ) : (
            <>
              <div aria-hidden className="hidden grid-cols-[minmax(0,1fr)_8rem_8rem_12rem_1rem] gap-x-6 border-b border-linie-stark px-4 py-2 text-sm font-semibold text-grau md:grid">
                <span>Schau</span>
                <span>Meldeschluss</span>
                <span>Bewertung</span>
                <span>Phase</span>
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
                            {s.test && <Marke ton="warnung">Testschau</Marke>}
                          </span>
                          <span className="block truncate text-sm text-grau">
                            {s.ort || "–"}
                            <span className="md:hidden">
                              {" · "}Meldeschluss {datum(s.meldeschluss)}
                              {s.bewertungAm && ` · Bewertung ${datum(s.bewertungAm)}`}
                            </span>
                          </span>
                        </span>
                        <span className="hidden text-sm tabular-nums md:block">{datum(s.meldeschluss)}</span>
                        <span className="hidden text-sm tabular-nums md:block">{datum(s.bewertungAm)}</span>
                        <span className="flex items-center gap-2 justify-self-end md:justify-self-start">
                          <Marke ton={PHASE_TON(s.phase)}>{PHASEN_LABEL[s.phase]}</Marke>
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
      <Dialog offen={neu} onSchliessen={() => setNeu(false)} titel="Neue Schau anlegen">
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
  const anlegen = trpc.schau.anlegen.useMutation({
    onSuccess: (r) => {
      if (r.demodaten?.ok) meldung(`Testschau mit Demodaten angelegt: ${r.demodaten.meldungen} Meldungen, ${r.demodaten.tiere} Tiere, Phase „Einlieferung“.`);
      else if (r.demodaten) meldung(`Testschau angelegt. ${r.demodaten.fehler} – unter Einstellungen „Demodaten neu einspielen“ erneut versuchen.`, "fehler");
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
      <Feld label="Name der Schau" hinweis="z. B. „72. Kreisverbandsschau 2026“">
        {(id) => <Eingabe id={id} value={name} onChange={(e) => setName(e.target.value)} required minLength={3} autoFocus data-autofocus />}
      </Feld>
      <Feld label="Ort / Halle">{(id) => <Eingabe id={id} value={ort} onChange={(e) => setOrt(e.target.value)} />}</Feld>
      {vorlagen.length > 0 && (
        <Feld label="Vorlage" hinweis={vorlage ? "Ohne Meldungen, Geld und Termine" : undefined}>
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
              <option value="">keine – mit Startwerten beginnen</option>
              {[...vorlagen]
                .sort((a, b) => b.id - a.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    aus „{x.name}“{x.test ? " (Testschau)" : ""} übernehmen
                  </option>
                ))}
            </Auswahl>
          )}
        </Feld>
      )}
      <Haken
        label="Testschau"
        checked={test}
        onChange={(v) => {
          setTest(v);
          if (!v && schauen.find((x) => String(x.id) === vorlage)?.test) setVorlage(neueste ? String(neueste.id) : "");
        }}
        hinweis="Mit Demodaten, nicht umkehrbar"
      />
      {anlegen.error && <Hinweis ton="fehler">{fehlerText(anlegen.error)}</Hinweis>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linie pt-4">
        <HilfeLink abschnitt="schau-anlegen">Hilfe zu Vorlage und Testschau</HilfeLink>
        <Knopf type="submit" variante="primaer" laedt={anlegen.isPending}>
          {anlegen.isPending && test ? "Demodaten werden eingespielt …" : "Schau anlegen"}
        </Knopf>
      </div>
    </form>
  );
}
