/**
 * Dialog und Rückfragen als eigener Dialog (useFrage statt prompt/confirm). Die Rückfragen liegen außerhalb des Routers
 * (ohne Sprachkontext): Texte deshalb über ot() in der aktuellen Sprache.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ot } from "./sprache-jetzt";
import { cx } from "./ui-basis";
import { Eingabe, Feld, Textfeld } from "./ui-felder";
import { Knopf } from "./ui-knoepfe";

// ── Dialog ─────────────────────────────────────────────────────────────

export function Dialog({ offen, onSchliessen, titel, children, breit }: { offen: boolean; onSchliessen: () => void; titel: string; children: ReactNode; breit?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (offen && !d.open) {
      d.showModal();
      // Fokus ins Feld mit autoFocus (sonst landet er auf dem ersten Knopf, meist „×“).
      d.querySelector<HTMLElement>("[autofocus], [data-autofocus]")?.focus();
    }
    if (!offen && d.open) d.close();
  }, [offen]);
  return (
    <dialog
      ref={ref}
      // Das close-Ereignis kommt verzögert: Ist der Dialog bis dahin wieder offen (z. B. direkt die nächste Rückfrage),
      // gehört es zum vorigen Schließen und darf den neuen Inhalt nicht abbrechen.
      onClose={(e) => {
        if (!e.currentTarget.open) onSchliessen();
      }}
      className={cx("m-auto w-[calc(100%-2rem)] rounded-xl border border-linie-stark bg-weiss p-0 text-tinte shadow-2xl backdrop:bg-kopf/45", breit ? "max-w-4xl" : "max-w-lg")}
    >
      <div className="flex items-center justify-between border-b border-linie px-5 py-3">
        <h2 className="text-lg font-semibold">{titel}</h2>
        <button type="button" onClick={onSchliessen} className="rounded px-2 text-2xl leading-none text-grau hover:text-tinte" aria-label={ot().allgemein.schliessen}>
          ×
        </button>
      </div>
      <div className="p-5">{offen && children}</div>
    </dialog>
  );
}

// ── Rückfragen (statt Browser-Fenster) ────────────────────────────────
// prompt() und confirm() unterdrücken manche Browser und App-Ansichten (eingebettete Fenster) – dann geschähe beim
// Klick scheinbar nichts. Rückfragen deshalb immer als eigener Dialog über useFrage().

interface Rueckfrage {
  titel: string;
  text?: ReactNode;
  /** Mit Eingabefeld (z. B. „Grund“): Beschriftung des Felds. Ohne: reine Bestätigung. */
  feld?: string;
  /** Mindestlänge der Eingabe (Grund: 3). */
  mindestens?: number;
  vorgabe?: string;
  knopf?: string;
  /** Beschriftung von „Abbrechen“ (Seiten für Aussteller in deren Sprache). */
  abbrechen?: string;
  gefahr?: boolean;
  /** Einzeiliges Feld (z. B. eine Belegnummer) statt mehrzeilig. */
  einzeilig?: boolean;
}
type Offen = Rueckfrage & { antwort: (v: string | null) => void };
const FrageKontext = createContext<{ eingabe: (f: Rueckfrage) => Promise<string | null>; bestaetige: (f: Rueckfrage) => Promise<boolean> }>({
  eingabe: async () => null,
  bestaetige: async () => false,
});

export function FragenAnbieter({ children }: { children: ReactNode }) {
  const [frage, setFrage] = useState<Offen | null>(null);
  const [wert, setWert] = useState("");
  const eingabe = useCallback(
    (f: Rueckfrage) =>
      new Promise<string | null>((antwort) => {
        setWert(f.vorgabe ?? "");
        setFrage({ ...f, antwort });
      }),
    [],
  );
  const bestaetige = useCallback(async (f: Rueckfrage) => (await eingabe({ ...f, feld: undefined })) !== null, [eingabe]);
  const ende = (v: string | null) => {
    frage?.antwort(v);
    setFrage(null);
  };
  const zuKurz = !!frage?.feld && wert.trim().length < (frage.mindestens ?? 1);
  return (
    <FrageKontext.Provider value={{ eingabe, bestaetige }}>
      {children}
      <Dialog offen={!!frage} onSchliessen={() => ende(null)} titel={frage?.titel ?? ""}>
        {frage && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!zuKurz) ende(frage.feld ? wert.trim() : "");
            }}
          >
            {frage.text && <div className="whitespace-pre-line">{frage.text}</div>}
            {frage.feld && (
              <Feld label={frage.feld} hinweis={frage.mindestens && frage.mindestens > 1 ? ot().rahmen.dialog.mindestensZeichen(frage.mindestens) : undefined}>
                {(fid) =>
                  frage.einzeilig ? (
                    <Eingabe id={fid} data-autofocus value={wert} onChange={(e) => setWert(e.target.value)} />
                  ) : (
                    <Textfeld id={fid} data-autofocus rows={3} value={wert} onChange={(e) => setWert(e.target.value)} />
                  )
                }
              </Feld>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Knopf type="button" onClick={() => ende(null)}>
                {frage.abbrechen ?? ot().allgemein.abbrechen}
              </Knopf>
              <Knopf type="submit" variante={frage.gefahr ? "gefahr" : "primaer"} disabled={zuKurz} data-autofocus={frage.feld ? undefined : true}>
                {frage.knopf ?? ot().allgemein.ok}
              </Knopf>
            </div>
          </form>
        )}
      </Dialog>
    </FrageKontext.Provider>
  );
}

/** Rückfragen als Dialog: `await eingabe({ titel, feld: "Grund", mindestens: 3 })` (null = abgebrochen), `await bestaetige({ titel, text })`. */
export const useFrage = () => useContext(FrageKontext);
