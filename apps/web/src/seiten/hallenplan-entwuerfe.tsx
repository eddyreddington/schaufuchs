import { serverText } from "@schau/domain";
import { useState, type FormEvent } from "react";
import { datum, fehlerText } from "../lib";
import { useOberflaeche, useSprache } from "../sprache";
import { trpc } from "../trpc";
import { Dialog, Eingabe, FehlerAnzeige, Knopf, Laden, Leer, useFrage, useMeldung } from "../ui";

const meter = (cm: number) => `${(cm / 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} m`;

/**
 * Entwürfe des Hallenplans (Entscheidung 017): den aktuellen Plan als Entwurf speichern, Entwürfe laden, sich für einen
 * entscheiden (die übrigen gehen ins Archiv) und Pläne aus dem Archiv früherer Schauen laden.
 */
export function HallenEntwuerfe({ schauId, darfAendern }: { schauId: number; darfAendern: boolean }) {
  const [offen, setOffen] = useState(false);
  const t = useOberflaeche().halleBild.entwuerfe;
  return (
    <>
      <Knopf onClick={() => setOffen(true)}>{t.knopf}</Knopf>
      <Dialog offen={offen} onSchliessen={() => setOffen(false)} titel={t.titel} breit>
        {offen && <Inhalt schauId={schauId} darfAendern={darfAendern} />}
      </Dialog>
    </>
  );
}

function Inhalt({ schauId, darfAendern }: { schauId: number; darfAendern: boolean }) {
  const q = trpc.hallenentwurf.liste.useQuery({ schauId });
  const texte = useOberflaeche();
  const sprache = useSprache();
  const t = texte.halleBild.entwuerfe;
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
    meldung(t.gespeichert);
  };
  const ladenFragen = async (id: number, n: string) => {
    if (!(await bestaetige({ titel: t.ladenFrage(n), text: t.ladenText, knopf: t.laden }))) return;
    // Katalog gedruckt oder Tiere schon eingeliefert: erst die Rückfrage des Servers, dann bestätigt noch einmal.
    const r = await laden.mutateAsync({ schauId, id });
    if ("rueckfrage" in r) {
      if (!(await bestaetige({ titel: t.ladenFrage(n), text: serverText(r.rueckfrage, sprache), knopf: t.laden }))) return;
      await laden.mutateAsync({ schauId, id, bestaetigt: true });
    }
    await neu();
    meldung(t.geladen(n));
  };
  const entscheidenFragen = async (id?: number, n?: string) => {
    const text = `${n ? t.wirdGeladen(n) : t.aktuellerGilt} ${t.insArchiv}`;
    if (!(await bestaetige({ titel: t.entscheidenFrage, text, knopf: t.entscheiden }))) return;
    let r = await entscheiden.mutateAsync({ schauId, ...(id ? { id } : {}) });
    if ("rueckfrage" in r) {
      if (!(await bestaetige({ titel: t.entscheidenFrage, text: serverText(r.rueckfrage, sprache), knopf: t.entscheiden }))) return;
      r = await entscheiden.mutateAsync({ schauId, id, bestaetigt: true });
    }
    await neu();
    if ("archiviert" in r) meldung(t.entschieden(r.archiviert));
  };
  const umbenennenFragen = async (id: number, alt: string) => {
    const n = await eingabe({ titel: t.umbenennenTitel, feld: texte.allgemein.name, vorgabe: alt, mindestens: 1 });
    if (!n || n === alt) return;
    await umbenennen.mutateAsync({ id, name: n });
    await neu();
  };
  const loeschenFragen = async (id: number, n: string) => {
    if (!(await bestaetige({ titel: t.loeschenFrage(n), text: t.loeschenText, knopf: texte.allgemein.loeschen, gefahr: true }))) return;
    await loeschen.mutateAsync({ id });
    await neu();
  };
  const beschaeftigt = laden.isPending || entscheiden.isPending;

  return (
    <div className="flex flex-col gap-6">
      {darfAendern && (
        <form onSubmit={(e) => void sichern(e).catch(() => {})} className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm font-semibold">
            {t.speichernAls}
            <Eingabe value={name} maxLength={100} placeholder={t.namePlatzhalter} onChange={(e) => setName(e.target.value)} />
          </label>
          <Knopf type="submit" variante="primaer" laedt={speichern.isPending} disabled={!name.trim()}>
            {texte.allgemein.speichern}
          </Knopf>
        </form>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">{t.dieserSchau}</h3>
        {entwuerfe.length === 0 ? (
          <Leer titel={t.keine} />
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
                      {t.laden}
                    </Knopf>
                    <Knopf variante="primaer" disabled={beschaeftigt} onClick={() => void entscheidenFragen(e.id, e.name).catch(() => {})}>
                      {t.diesenNehmen}
                    </Knopf>
                    <Knopf variante="leise" onClick={() => void umbenennenFragen(e.id, e.name).catch(() => {})}>
                      {t.umbenennen}
                    </Knopf>
                    <Knopf variante="gefahr" onClick={() => void loeschenFragen(e.id, e.name).catch(() => {})}>
                      {texte.allgemein.loeschen}
                    </Knopf>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {darfAendern && entwuerfe.length > 0 && (
          <Knopf className="self-start" disabled={beschaeftigt} onClick={() => void entscheidenFragen().catch(() => {})}>
            {t.aktuellenNehmen}
          </Knopf>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">{t.archiv}</h3>
        {archiv.length === 0 ? (
          <Leer titel={t.archivLeer} />
        ) : (
          <ul className="max-h-80 divide-y divide-linie overflow-y-auto rounded-lg border border-linie">
            {archiv.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{e.name}</span>
                  <span className="block text-sm text-grau">
                    {t.archivZeile(e.herkunft || t.ohneSchau, `${meter(e.masse.breite)} × ${meter(e.masse.laenge)}`, datum(e.archiviertAm))}
                  </span>
                </span>
                {darfAendern && (
                  <span className="flex flex-wrap gap-1.5">
                    <Knopf disabled={beschaeftigt} onClick={() => void ladenFragen(e.id, e.name).catch(() => {})}>
                      {t.laden}
                    </Knopf>
                    <Knopf variante="gefahr" onClick={() => void loeschenFragen(e.id, e.name).catch(() => {})}>
                      {texte.allgemein.loeschen}
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
