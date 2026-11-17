/**
 * Hinweis im Lesemodus (Entscheidung 025): Der Server nimmt gerade keine Änderungen an. Eine Leiste über dem Inhalt –
 * in der Verwaltung mit dem Hinweis des Betreibers und „Hilfe zum Lesemodus“, auf dem Tablet und den Seiten für
 * Aussteller nur der feste Satz in ihrer Sprache.
 */
import { useOberflaeche, useTexte } from "../sprache";
import { trpc } from "../trpc";
import { HilfeLink } from "../ui";

/** Zustand vom Server; ohne Netz oder bei einem Fehler kein Hinweis (die Änderung scheitert dann ohnehin sichtbar). */
function useLesemodus() {
  return trpc.betrieb.lesemodus.useQuery(undefined, { staleTime: 60_000, refetchInterval: 5 * 60_000, retry: false }).data;
}

const LEISTE = "nicht-drucken border-b border-linie bg-stroh px-4 py-2 text-sm text-tinte";

/** Verwaltung (Ausstellungsleitung, Helfer). */
export function LesemodusLeiste() {
  const l = useLesemodus();
  const t = useOberflaeche().rahmen.app;
  if (!l?.nurLesen) return null;
  return (
    <div className={`${LEISTE} flex flex-wrap items-center gap-x-4 gap-y-1 lg:px-6`} role="status">
      <span className="font-semibold">{t.nurLesen}</span>
      {l.hinweis && <span>{l.hinweis}</span>}
      <HilfeLink abschnitt="lesemodus">{t.nurLesenHilfe}</HilfeLink>
    </div>
  );
}

/** Preisrichter-Tablet: Bewertungen bleiben im Ausgang und gehen nach dem Lesemodus raus. */
export function LesemodusTablet() {
  const l = useLesemodus();
  const t = useOberflaeche().tablet;
  if (!l?.nurLesen) return null;
  return (
    <div className={LEISTE} role="status">
      {t.nurLesen}
    </div>
  );
}

/** Seiten für Aussteller: Melden geht gerade nicht. */
export function useLesemodusAussteller(): string | null {
  const l = useLesemodus();
  const t = useTexte().rahmen;
  return l?.nurLesen ? t.nurLesen : null;
}
