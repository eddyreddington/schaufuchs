/**
 * Anmeldung und Benutzer. Die Prozeduren liegen nach Thema in ./auth; hier werden sie zu einem Router zusammengesetzt.
 */
import { router } from "../trpc";
import { anmeldung } from "./auth/anmeldung";
import { benutzerVerwaltung } from "./auth/benutzer";
import { einladung } from "./auth/einladung";
import { zweiFaktor } from "./auth/zweifaktor";

export { bremseJeAdresse, wartezeitJeKonto, willkommensText } from "./auth/gemeinsam";

export const authRouter = router({ ...anmeldung, ...einladung, ...zweiFaktor, ...benutzerVerwaltung });
