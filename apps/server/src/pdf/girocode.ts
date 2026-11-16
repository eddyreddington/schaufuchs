/**
 * GiroCode im PDF (Entscheidung 021): QR-Code als Vektorgrafik (scharf in jedem Druck), daneben Bankverbindung und
 * Verwendungszweck. Den Inhalt liefert services/ueberweisung.ts, die Regeln stehen in packages/domain (girocode.ts).
 */
import QRCode from "qrcode";
import type { Ueberweisung } from "../services/ueberweisung";
import { type Doc, GRAU, MM, SANS, SANS_FETT, TINTE } from "./basis";

/** Kantenlänge des Codes samt Ruhezone: groß genug für die Handykamera, auch auf einem einfachen Drucker. */
export const GIROCODE_GROESSE = 28 * MM;

/** Zeichnet den QR-Code (Fehlerkorrektur M wie von EPC069-12 verlangt) mit Ruhezone in ein Quadrat. */
export function qrZeichnen(doc: Doc, inhalt: string, x: number, y: number, groesse: number) {
  const qr = QRCode.create(inhalt, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const ruhe = 4; // Ruhezone: vier Module weiß rundum (QR-Norm), sonst lesen manche Apps den Code nicht.
  const m = groesse / (n + 2 * ruhe);
  doc.save();
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) doc.rect(x + (c + ruhe) * m, y + (r + ruhe) * m, m, m);
  doc.fill("#000000").restore();
}

/**
 * GiroCode-Block: Code links, rechts Bankverbindung, Verwendungszweck und kurzer Hinweis. Ohne Code (Konto reicht nicht
 * für den Code) nur der Text. Gibt das y unter dem Block zurück.
 */
export function giroCodeBlock(doc: Doc, ue: Ueberweisung, bank: string, x: number, y: number, w: number): number {
  const mitCode = !!ue.giroCode;
  if (ue.giroCode) qrZeichnen(doc, ue.giroCode, x, y, GIROCODE_GROESSE);
  const tx = mitCode ? x + GIROCODE_GROESSE + 3 * MM : x;
  const tw = w - (tx - x);
  doc.font(SANS).fontSize(8).fillColor(GRAU).text("Bitte überweisen an", tx, y + (mitCode ? 2 * MM : 0), { width: tw });
  doc.font(SANS).fontSize(8.5).fillColor(TINTE).text(bank, tx, doc.y + 0.5, { width: tw });
  doc.font(SANS).fontSize(8).fillColor(GRAU).text("Verwendungszweck (bitte unverändert)", tx, doc.y + 3, { width: tw });
  doc.font(SANS_FETT).fontSize(8.5).fillColor(TINTE).text(ue.zweck, tx, doc.y + 0.5, { width: tw });
  if (mitCode) doc.font(SANS).fontSize(7.5).fillColor(GRAU).text("GiroCode: mit der Banking-App scannen.", tx, doc.y + 3, { width: tw });
  return Math.max(doc.y, mitCode ? y + GIROCODE_GROESSE : 0);
}
