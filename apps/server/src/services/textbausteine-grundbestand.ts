import type { Grundbaustein } from "./textbausteine";
import { BAUSTEINE_GEFIEDER } from "./textbausteine-gefieder";
import { BAUSTEINE_GESTALT } from "./textbausteine-gestalt";
import { BAUSTEINE_KOPF } from "./textbausteine-kopf";
import { BAUSTEINE_RUMPF } from "./textbausteine-rumpf";

/**
 * Grundbestand der Textbausteine (700): eigene Formulierungen im Stil der Bewertungskarten, nach Merkmal und Geflügelart.
 * Recherche und Quellen: docs/textbausteine-quellen.md. Vor dem Einsatz von einem Preisrichter durchsehen lassen – vor allem
 * Wasser- und Großgeflügel, Wachteln und Ziergeflügel sind dünn belegt.
 *
 * Die Bausteine stehen nach Merkmalen in textbausteine-gestalt/-kopf/-rumpf/-gefieder.ts; die Reihenfolge bleibt erhalten.
 */
export const TEXTBAUSTEINE_LISTE: Grundbaustein[] = [...BAUSTEINE_GESTALT, ...BAUSTEINE_KOPF, ...BAUSTEINE_RUMPF, ...BAUSTEINE_GEFIEDER];
