import { expect, test } from "bun:test";
import { ablageAbfangen, dateiAusAblage, passtZu, ziehtDateien } from "./ablage";

const datei = (name: string, type: string) => ({ name, type });
const BILD = ["image/jpeg", "image/png"];

test("Bild aus der Ablage: die erste passende Datei, sonst die erste (die Prüfung meldet dann das Format)", () => {
  expect(dateiAusAblage([datei("brief.pdf", "application/pdf"), datei("foto.png", "image/png")], BILD)?.name).toBe("foto.png");
  expect(dateiAusAblage([datei("brief.pdf", "application/pdf")], BILD)?.name).toBe("brief.pdf");
  expect(dateiAusAblage([], BILD)).toBeUndefined();
  expect(dateiAusAblage(null, BILD)).toBeUndefined();
  // FileList ist kein Array, nur „array-artig“.
  const liste = { length: 2, 0: datei("a.txt", "text/plain"), 1: datei("b.jpg", "image/jpeg") };
  expect(dateiAusAblage(liste, BILD)?.name).toBe("b.jpg");
});

test("passt zur Angabe wie im accept-Attribut: Typ, Typ/*, Endung", () => {
  expect(passtZu(datei("x.png", "image/png"), BILD)).toBe(true);
  expect(passtZu(datei("x.gif", "image/gif"), BILD)).toBe(false);
  expect(passtZu(datei("x.gif", "image/gif"), ["image/*"])).toBe(true);
  expect(passtZu(datei("Liste.CSV", ""), [".csv"])).toBe(true);
  expect(passtZu(datei("x.png", "image/png"), [])).toBe(true);
});

test("nur gezogene Dateien abfangen, nicht Text oder Links; nicht, was eine Ablagefläche schon angenommen hat", () => {
  expect(ziehtDateien(["Files"])).toBe(true);
  expect(ziehtDateien(["text/plain", "text/uri-list"])).toBe(false);
  expect(ziehtDateien(undefined)).toBe(false);
  // Außerhalb einer Ablagefläche: abfangen, damit der Browser die Datei nicht öffnet und die Seite verlässt.
  expect(ablageAbfangen({ typen: ["Files"], defaultPrevented: false, aufDateifeld: false })).toBe(true);
  // Eine Ablagefläche hat das Ereignis schon behandelt (preventDefault) – nicht noch „none“ setzen.
  expect(ablageAbfangen({ typen: ["Files"], defaultPrevented: true, aufDateifeld: false })).toBe(false);
  // Auf ein sichtbares Dateifeld darf der Browser weiter selbst ablegen.
  expect(ablageAbfangen({ typen: ["Files"], defaultPrevented: false, aufDateifeld: true })).toBe(false);
  expect(ablageAbfangen({ typen: ["text/plain"], defaultPrevented: false, aufDateifeld: false })).toBe(false);
});
