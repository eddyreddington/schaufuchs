/** Betrieb: Zustand der Installation für die Oberfläche (Lesemodus, Entscheidung 025). */
import { config } from "../config";
import { publicProcedure, router } from "../trpc";

export const betriebRouter = router({
  /** Läuft der Lesemodus? Den Hinweis des Betreibers sehen nur angemeldete Benutzer, nicht Aussteller oder Preisrichter. */
  lesemodus: publicProcedure.query(({ ctx }) => ({
    nurLesen: config.nurLesen,
    hinweis: config.nurLesen && ctx.benutzer ? config.nurLesenHinweis : "",
  })),
});
