import type { OberflaecheTexte } from "..";
import { auszahlung, kasse, kassenbuch, sepa, verkauf } from "./server-kasse-geld";
import { lastschrift, spenden } from "./server-kasse-lastschrift";
import { bewertung, meisterschaft, preise, preisrichter } from "./server-kasse-preise";

export const serverKasse: OberflaecheTexte["serverKasse"] = { kasse, auszahlung, kassenbuch, sepa, verkauf, lastschrift, spenden, preise, bewertung, preisrichter, meisterschaft };
