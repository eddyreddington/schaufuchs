import { expect, test } from "bun:test";
import { entwurfRueckfrage } from "./hallenentwurf";

test("Rückfrage vor dem Laden eines Entwurfs: nach dem Druck und bei eingelieferten Tieren, sonst keine", () => {
  expect(entwurfRueckfrage({ gedruckt: false, eingeliefert: 0 })).toBeNull();
  expect(entwurfRueckfrage({ gedruckt: true, eingeliefert: 0 })).toBe("Der Katalog ist gedruckt – Käfigplätze und Karten stimmen nach dem Laden erst wieder nach „Käfigplätze nach Plan“.");
  expect(entwurfRueckfrage({ gedruckt: false, eingeliefert: 1 })).toStartWith("1 Tier ist schon eingeliefert");
  expect(entwurfRueckfrage({ gedruckt: false, eingeliefert: 12 })).toStartWith("12 Tiere sind schon eingeliefert");
  // Beides: erst die Tiere, dann der Druck – zwei Sätze (die Oberfläche übersetzt Satz für Satz).
  expect(entwurfRueckfrage({ gedruckt: true, eingeliefert: 2 })).toMatch(/^2 Tiere .*umgesetzt werden\. Der Katalog ist gedruckt/);
});
