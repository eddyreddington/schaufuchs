import { useState, type FormEvent } from "react";
import { datum, fehlerText } from "../lib";
import { trpc } from "../trpc";
import { Dialog, Eingabe, FehlerAnzeige, Knopf, Laden, Leer, useFrage, useMeldung } from "../ui";

const meter = (cm: number) => `${(cm / 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} m`;

/**
 * Entwürfe des Hallenplans (Entscheidung 017): den aktuellen Plan als Entwurf speichern, Entwürfe laden, sich für einen
 * entscheiden (die übrigen gehen ins Archiv) und Pläne aus dem Archiv früherer Schauen laden.
 */
export function HallenEntwuerfe({ schauId, darfAendern }: { schauId: number; darfAendern: boolean }) {
  const [offen, setOffen] = useState(false);
  return (
    <>
      <Knopf onClick={() => setOffen(true)}>Entwürfe</Knopf>
      <Dialog offen={offen} onSchliessen={() => setOffen(false)} titel="Entwürfe des Hallenplans" breit>
        {offen && <Inhalt schauId={schauId} darfAendern={darfAendern} />}
      </Dialog>
    </>
  );
}

function Inhalt({ schauId, darfAendern }: { schauId: number; darfAendern: boolean }) {
  const q = trpc.hallenentwurf.liste.useQuery({ schauId });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { bestaetige, eingabe } = useFrage();
  const [name, setName] = useState("");
  const neu = async () => Promise.all([utils.hallenentwurf.liste.invalidate({ schauId }), utils.katalog.hallenplan.invalidate({ schauId })]);
  const fehler = (e: unknown) => meldung(fehlerText(e), "fehler");
  const speichern = trpc.hallenentwurf.speichern.useMutation({ onError: fehler });
  const laden = trpc.hallenentwurf.laden.useMutation({ onError: fehler });
  const entscheiden = trpc.hallenentwurf.entscheiden.useMutation({ onError: fehler });
  const umbenennen = trpc.hallenentwurf.umbenennen.useMutation({ onError: fehler });
  const loeschen = trpc.hallenentwurf.loeschen.useMutation({ onError: fehler });

  if (q.error) return <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />;
  if (!q.data) return <Laden />;
  const { entwuerfe, archiv } = q.data;

  const sichern = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await speichern.mutateAsync({ schauId, name: name.trim() });
    setName("");
    await neu();
    meldung("Aktueller Plan als Entwurf gespeichert.");
  };
  const ladenFragen = async (id: number, n: string) => {
    if (!(await bestaetige({ titel: `„${n}“ laden?`, text: "Der aktuelle Plan wird ersetzt und neu gesetzt. Wer ihn behalten will, speichert ihn vorher als Entwurf.", knopf: "Laden" }))) return;
    await laden.mutateAsync({ schauId, id });
    await neu();
    meldung(`„${n}“ geladen.`);
  };
  const entscheidenFragen = async (id?: number, n?: string) => {
    const text = `${n ? `„${n}“ wird geladen und gilt.` : "Der aktuelle Plan gilt."} Alle übrigen Entwürfe dieser Schau gehen ins Archiv und lassen sich in späteren Schauen laden.`;
    if (!(await bestaetige({ titel: "Für diesen Plan entscheiden?", text, knopf: "Entscheiden" }))) return;
    const r = await entscheiden.mutateAsync({ schauId, ...(id ? { id } : {}) });
    await neu();
    meldung(`Entschieden – ${r.archiviert} Entwürfe im Archiv.`);
  };
  const umbenennenFragen = async (id: number, alt: string) => {
    const n = await eingabe({ titel: "Entwurf umbenennen", feld: "Name", vorgabe: alt, mindestens: 1 });
    if (!n || n === alt) return;
    await umbenennen.mutateAsync({ id, name: n });
    await neu();
  };
  const loeschenFragen = async (id: number, n: string) => {
    if (!(await bestaetige({ titel: `„${n}“ löschen?`, text: "Der Entwurf wird endgültig gelöscht.", knopf: "Löschen", gefahr: true }))) return;
    await loeschen.mutateAsync({ id });
    await neu();
  };
  const beschaeftigt = laden.isPending || entscheiden.isPending;

  return (
    <div className="flex flex-col gap-6">
      {darfAendern && (
        <form onSubmit={(e) => void sichern(e).catch(() => {})} className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm font-semibold">
            Aktuellen Plan als Entwurf speichern
            <Eingabe value={name} maxLength={100} placeholder="Name, z. B. „Variante quer“" onChange={(e) => setName(e.target.value)} />
          </label>
          <Knopf type="submit" variante="primaer" laedt={speichern.isPending} disabled={!name.trim()}>
            Speichern
          </Knopf>
        </form>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Entwürfe dieser Schau</h3>
        {entwuerfe.length === 0 ? (
          <Leer titel="Noch keine Entwürfe" />
        ) : (
          <ul className="divide-y divide-linie rounded-lg border border-linie">
            {entwuerfe.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{e.name}</span>
                  <span className="block text-sm text-grau">
                    {meter(e.masse.breite)} × {meter(e.masse.laenge)} · {datum(e.createdAt)}
                  </span>
                </span>
                {darfAendern && (
                  <span className="flex flex-wrap gap-1.5">
                    <Knopf disabled={beschaeftigt} onClick={() => void ladenFragen(e.id, e.name).catch(() => {})}>
                      Laden
                    </Knopf>
                    <Knopf variante="primaer" disabled={beschaeftigt} onClick={() => void entscheidenFragen(e.id, e.name).catch(() => {})}>
                      Diesen nehmen
                    </Knopf>
                    <Knopf variante="leise" onClick={() => void umbenennenFragen(e.id, e.name).catch(() => {})}>
                      Umbenennen
                    </Knopf>
                    <Knopf variante="gefahr" onClick={() => void loeschenFragen(e.id, e.name).catch(() => {})}>
                      Löschen
                    </Knopf>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {darfAendern && entwuerfe.length > 0 && (
          <Knopf className="self-start" disabled={beschaeftigt} onClick={() => void entscheidenFragen().catch(() => {})}>
            Aktuellen Plan nehmen – Entwürfe ins Archiv
          </Knopf>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Archiv (frühere Schauen)</h3>
        {archiv.length === 0 ? (
          <Leer titel="Archiv ist leer" />
        ) : (
          <ul className="max-h-80 divide-y divide-linie overflow-y-auto rounded-lg border border-linie">
            {archiv.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{e.name}</span>
                  <span className="block text-sm text-grau">
                    {e.herkunft || "ohne Schau"} · {meter(e.masse.breite)} × {meter(e.masse.laenge)} · archiviert {datum(e.archiviertAm)}
                  </span>
                </span>
                {darfAendern && (
                  <span className="flex flex-wrap gap-1.5">
                    <Knopf disabled={beschaeftigt} onClick={() => void ladenFragen(e.id, e.name).catch(() => {})}>
                      Laden
                    </Knopf>
                    <Knopf variante="gefahr" onClick={() => void loeschenFragen(e.id, e.name).catch(() => {})}>
                      Löschen
                    </Knopf>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
