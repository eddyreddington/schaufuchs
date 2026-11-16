import type { OberflaecheTexte } from "..";
import { halle } from "./server-katalog-halle";
import { katalog } from "./server-katalog-katalog";
import { pruefung } from "./server-katalog-pruefung";
import { stamm } from "./server-katalog-stamm";

export const serverKatalog: OberflaecheTexte["serverKatalog"] = { pruefung, halle, katalog, stamm };
