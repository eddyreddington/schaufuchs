/**
 * Schauen: anlegen, lesen, Einstellungen, Phase, Gebühren und Preisarten, Protokoll und Postausgang. Die Prozeduren
 * liegen nach Thema in ./schau; hier werden sie zu einem Router zusammengesetzt.
 */
import { router } from "../trpc";
import { schauAnlegen } from "./schau/anlegen";
import { einstellungen } from "./schau/einstellungen";
import { gebuehrenUndPreisarten } from "./schau/gebuehren";
import { phasen } from "./schau/phase";
import { protokollUndPost } from "./schau/protokoll-post";
import { schauLesen } from "./schau/uebersicht";

export { slugify } from "./schau/anlegen";

export const schauRouter = router({ ...schauLesen, ...schauAnlegen, ...einstellungen, ...phasen, ...gebuehrenUndPreisarten, ...protokollUndPost });
