/**
 * Katalog und Halle. Die Prozeduren liegen nach Thema in ./katalog; hier werden sie zu den Routern `katalog` und `halle`
 * zusammengesetzt.
 */
import { router } from "../trpc";
import { halleEinlieferung } from "./katalog/einlieferung";
import { halleGesundheit } from "./katalog/gesundheit";
import { katalogHallenplan } from "./katalog/hallenplan";
import { katalogKaefige } from "./katalog/kaefige";
import { katalogNummern } from "./katalog/nummern";

export { HALLE_EINGABE, planNeuSetzenIn, planTiere } from "./katalog/gemeinsam";

export const katalogRouter = router({ ...katalogKaefige, ...katalogHallenplan, ...katalogNummern });

export const halleRouter = router({ ...halleEinlieferung, ...halleGesundheit });
