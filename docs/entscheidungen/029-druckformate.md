# 029 Formatvorgaben der Drucke je Schau, eine Übersicht

**Stand:** gilt (22.11.2026), ergänzt [011](011-druckvorlagen.md) und [012](012-briefvorlage.md)

**Kontext:** Rückmeldung eines Vereins: „Bei den Druckeinstellungen fehlen die Formatvorgaben für Katalog und die anderen
Dinge.“ Der Reiter „Druck“ zeigte nur die Kartenvorlage; das Katalogformat stand unter „Katalog gestalten“, alle anderen
Drucke hatten ein festes Format, das nirgends zu sehen war.

**Entscheidung:**
- Der Reiter „Druck“ listet jede Drucksache mit Format und Einstellung (`DRUCKSACHEN` in `packages/domain/src/druck-formate.ts`).
- Wählbar je Schau nur, wo es fachlich sinnvoll ist und der Erzeuger es sauber kann: Bewertungsliste A4/A5,
  Hallenplan A4/A3, Kaufbeleg und Kassenbelege (mit Spendenquittung) A5 quer oder oben auf A4 mit Schnittlinie.
  Gespeichert in `schau.druckFormate`, gelesen nur über `druckFormateLesen()`; Vorgabe = bisheriges Format.
- Eine Quelle: Katalogformat bleibt in der Katalog-Gestaltung, Kartenvorlage in der Druckvorlage (011); der Reiter zeigt
  und verlinkt bzw. bedient dieselbe Einstellung.
- Briefe (B-Bogen, Abrechnung, Verpflichtung, Serienbrief) bleiben A4 nach DIN 5008, Formulare, Listen und amtliche
  Muster fest – dort zeigt der Reiter nur das Format.
- Ändern nur die Ausstellungsleitung, mit Protokoll; eine Schau aus Vorlage übernimmt Formate und Kartenvorlage.

**Folgen:** Ein Kassenbon (80 mm) bräuchte ein eigenes Layout und ist nicht vorgesehen. Archivierte Belege behalten ihr
Format. Neue wählbare Formate: in `DRUCK_FORMAT_WAHL` ergänzen (Vorgabe bleibt vorn), Erzeuger und Test 80 anpassen.

**Wo:** [Moduldoku Drucke](../module/drucke.md), `apps/server/src/routers/druck-formate.ts`, `apps/web/src/seiten/einstellungen-druck.tsx`.
