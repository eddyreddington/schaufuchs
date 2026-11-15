import { useState, type FormEvent } from "react";
import { datum, fehlerText, heuteIso as heute } from "../lib";
import { trpc } from "../trpc";
import { Eingabe, FehlerAnzeige, Feld, Haken, HilfeLink, Knopf, Laden, Marke, useFrage, useMeldung } from "../ui";


/** SEPA-Mandate eines Ausstellers (Entscheidung 018): unterschriebenes Formular erfassen, widerrufen. */
export function SepaMandate({ ausstellerId }: { ausstellerId: number }) {
  const q = trpc.lastschrift.mandate.useQuery({ ausstellerId });
  const utils = trpc.useUtils();
  const meldung = useMeldung();
  const { eingabe } = useFrage();
  const [neu, setNeu] = useState<{ unterschriebenAm: string; iban: string; kontoinhaber: string; wiederkehrend: boolean; referenz: string } | null>(null);
  const anlegen = trpc.lastschrift.mandatAnlegen.useMutation({
    onSuccess: async (r) => {
      setNeu(null);
      await utils.lastschrift.mandate.invalidate({ ausstellerId });
      meldung(`Mandat ${r.referenz} erfasst.`);
    },
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const widerrufen = trpc.lastschrift.mandatWiderrufen.useMutation({
    onSuccess: () => utils.lastschrift.mandate.invalidate({ ausstellerId }),
    onError: (e) => meldung(fehlerText(e), "fehler"),
  });
  const senden = (e: FormEvent) => {
    e.preventDefault();
    if (neu) anlegen.mutate({ ausstellerId, ...neu });
  };
  if (q.error) return <FehlerAnzeige fehler={q.error} nochmal={() => q.refetch()} />;
  if (!q.data) return <Laden />;
  return (
    <section className="mt-6 flex flex-col gap-3 border-t border-linie pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">SEPA-Mandate</h3>
        <HilfeLink abschnitt="sepa-lastschrift">Hilfe zur Lastschrift</HilfeLink>
      </div>
      {q.data.length === 0 && !neu && <p className="text-sm text-grau">Kein Mandat – das Meldegeld wird bar oder per Überweisung bezahlt.</p>}
      {q.data.length > 0 && (
        <ul className="divide-y divide-linie rounded-lg border border-linie">
          {q.data.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{m.referenz}</span> <span className="text-sm text-grau">{m.wiederkehrend ? "wiederkehrend" : "einmalig"}</span>
                <span className="block text-sm text-grau">
                  {m.iban} · unterschrieben {datum(m.unterschriebenAm)}
                  {m.letzteNutzungAm && ` · zuletzt genutzt ${datum(m.letzteNutzungAm)}`}
                </span>
              </span>
              {m.gueltig ? <Marke ton={m.widerrufenAm ? "neutral" : "warnung"}>{m.gueltig}</Marke> : <Marke ton="ok">gültig</Marke>}
              {!m.widerrufenAm && (
                <Knopf
                  variante="leise"
                  onClick={async () => {
                    const am = await eingabe({ titel: "Mandat widerrufen", feld: "Widerrufen am (JJJJ-MM-TT)", vorgabe: heute(), mindestens: 10 });
                    if (am) widerrufen.mutate({ id: m.id, am });
                  }}
                >
                  Widerrufen
                </Knopf>
              )}
            </li>
          ))}
        </ul>
      )}
      {neu ? (
        <form onSubmit={senden} className="grid gap-3 rounded-lg border border-linie p-3 sm:grid-cols-2">
          <Feld label="Unterschrieben am">{(id) => <Eingabe id={id} type="date" required value={neu.unterschriebenAm} max={heute()} onChange={(e) => setNeu({ ...neu, unterschriebenAm: e.target.value })} />}</Feld>
          <Feld label="IBAN des Zahlers">{(id) => <Eingabe id={id} required value={neu.iban} onChange={(e) => setNeu({ ...neu, iban: e.target.value })} autoComplete="off" />}</Feld>
          <Feld label="Kontoinhaber" hinweis="leer = Name des Ausstellers">{(id) => <Eingabe id={id} value={neu.kontoinhaber} onChange={(e) => setNeu({ ...neu, kontoinhaber: e.target.value })} />}</Feld>
          <Feld label="Mandatsreferenz" hinweis="leer = vergibt SchauFUCHS">{(id) => <Eingabe id={id} value={neu.referenz} maxLength={35} onChange={(e) => setNeu({ ...neu, referenz: e.target.value })} />}</Feld>
          <div className="sm:col-span-2">
            <Haken label="Wiederkehrend (für jede Schau)" checked={neu.wiederkehrend} onChange={(w) => setNeu({ ...neu, wiederkehrend: w })} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Knopf type="submit" variante="primaer" laedt={anlegen.isPending}>
              Mandat erfassen
            </Knopf>
            <Knopf variante="leise" onClick={() => setNeu(null)}>
              Abbrechen
            </Knopf>
          </div>
        </form>
      ) : (
        <Knopf className="self-start" onClick={() => setNeu({ unterschriebenAm: heute(), iban: "", kontoinhaber: "", wiederkehrend: true, referenz: "" })}>
          Mandat erfassen
        </Knopf>
      )}
    </section>
  );
}
