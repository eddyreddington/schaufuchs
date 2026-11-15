import { authRouter } from "./routers/auth";
import { druckvorlageRouter } from "./routers/druckvorlage";
import { bewertungRouter, richterRouter } from "./routers/bewertung";
import { kasseRouter } from "./routers/kasse";
import { halleRouter, katalogRouter } from "./routers/katalog";
import { katalogGestaltungRouter } from "./routers/katalog-gestaltung";
import { meldungRouter } from "./routers/meldung";
import { oeffentlichRouter } from "./routers/oeffentlich";
import { preiseRouter } from "./routers/preise";
import { preisrichterRouter } from "./routers/preisrichter";
import { rassebildRouter } from "./routers/rassebild";
import { schauRouter } from "./routers/schau";
import { stammdatenRouter } from "./routers/stammdaten";
import { termineRouter } from "./routers/termine";
import { vereinRouter } from "./routers/verein";
import { router } from "./trpc";

export const appRouter = router({
  auth: authRouter,
  stammdaten: stammdatenRouter,
  schau: schauRouter,
  meldung: meldungRouter,
  katalog: katalogRouter,
  katalogGestaltung: katalogGestaltungRouter,
  druckvorlage: druckvorlageRouter,
  termine: termineRouter,
  halle: halleRouter,
  preisrichter: preisrichterRouter,
  bewertung: bewertungRouter,
  richter: richterRouter,
  preise: preiseRouter,
  rassebild: rassebildRouter,
  kasse: kasseRouter,
  oeffentlich: oeffentlichRouter,
  verein: vereinRouter,
});

export type AppRouter = typeof appRouter;
