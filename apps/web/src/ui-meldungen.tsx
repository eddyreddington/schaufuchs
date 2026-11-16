/** Rückmeldungen als Toast unten rechts (useMeldung). Außerhalb des Routers: Texte über ot(). */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { ot } from "./sprache-jetzt";
import { cx, TON, type Ton } from "./ui-basis";

// ── Rückmeldungen (Toast) ──────────────────────────────────────────────

interface Meldung {
  id: number;
  text: string;
  ton: Ton;
}
const MeldungKontext = createContext<(text: string, ton?: Ton) => void>(() => {});

export function MeldungenAnbieter({ children }: { children: ReactNode }) {
  const [meldungen, setMeldungen] = useState<Meldung[]>([]);
  const zeige = useCallback((text: string, ton: Ton = "ok") => {
    const id = Date.now() + Math.random();
    setMeldungen((m) => [...m, { id, text, ton }]);
    // Fehler bleiben stehen, bis man sie schließt – sie dürfen nicht unbemerkt verschwinden.
    if (ton !== "fehler") setTimeout(() => setMeldungen((m) => m.filter((x) => x.id !== id)), 3500);
  }, []);
  const schliessen = (id: number) => setMeldungen((m) => m.filter((x) => x.id !== id));
  return (
    <MeldungKontext.Provider value={zeige}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
        {meldungen.map((m) => (
          <div key={m.id} role={m.ton === "fehler" ? "alert" : undefined} className={cx("flex items-start gap-3 rounded-lg border px-4 py-3 font-semibold text-tinte shadow-lg", TON[m.ton])}>
            <span className="flex-1">{m.text}</span>
            {m.ton === "fehler" && (
              <button type="button" onClick={() => schliessen(m.id)} className="-my-1 min-h-9 px-2 text-sm underline" aria-label={ot().rahmen.dialog.meldungSchliessen}>
                {ot().allgemein.schliessen}
              </button>
            )}
          </div>
        ))}
      </div>
    </MeldungKontext.Provider>
  );
}

export const useMeldung = () => useContext(MeldungKontext);
