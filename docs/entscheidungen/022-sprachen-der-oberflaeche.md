# 022 Sprachen der ganzen Oberfläche

**Stand:** gilt (16.11.2026), erweitert [020](020-sprachen-fuer-aussteller.md)

**Kontext:** Seit 020 sind nur die Seiten und Mails für Aussteller übersetzt. Auf grenznahen Schauen arbeiten aber auch
Helfer, Kassierer und Preisrichter, die besser Englisch, Französisch, Niederländisch, Polnisch oder Tschechisch lesen;
Anwender haben die Sprachwahl auf der Anmeldeseite gesucht.

**Entscheidung:**
- Die ganze Oberfläche gibt es in den sieben Sprachen aus 020: Anmeldung, Verwaltung (Ausstellungsleitung und Helfer),
  Preisrichter-Tablet und die Meldungen des Servers, die dort erscheinen.
- Texte in `packages/domain/src/sprachen/oberflaeche/<sprache>/<gruppe>.ts`, eine Gruppe je Bereich (Rahmen, Schau,
  Meldung, Kasse, Schautage, Ehrenpreise, Preisrichter, Tablet, Halle, Katalog, Vorlagen, Verein), dazu `allgemein`
  (häufige Wörter) und `fach` (Bezeichnungen der Domain-Konstanten wie Phasen, Meldearten, Käfigtypen). Deutsch ist die
  Grundlage; jede Übersetzung hat über den Typ `OberflaecheTexte` genau dieselben Schlüssel. Schweiz und Französisch wie in
  020 durch Umschreibung. Feste Begriffe: [Glossar](../sprachen-glossar.md). Keine neue Bibliothek.
- **Server bleibt deutsch.** Meldungen, Protokoll, Tests und Drucke ändern sich nicht. Die Gruppen `server*` enthalten jede
  Meldung wortgleich (mit Platzhaltern als Funktion); `serverText()` erkennt die deutsche Meldung in der Oberfläche und
  setzt die Übersetzung mit denselben Werten ein, Satz für Satz bei zusammengesetzten Meldungen. Unbekanntes bleibt
  deutsch. `fehlerText()` übersetzt so jeden Fehler, auch die Kurztexte der Eingabeprüfung.
- **Sprache:** angemeldet die Sprache am Konto (`benutzer.sprache`, Migration `0065_benutzer_sprache`, `auth.spracheSetzen`),
  gewählt im Benutzermenü; ohne Anmeldung die zuletzt in diesem Browser gewählte, sonst Deutsch. Eine Wahl auf der
  Anmeldeseite geht nach dem Anmelden ans Konto. Das Preisrichter-Tablet folgt nur der Wahl am Gerät (ein dort
  angemeldetes Konto der Verwaltung zählt nicht). Die Browsersprache allein stellt die Verwaltung bewusst nicht um – wer
  bisher deutsch arbeitet, merkt vom Update nichts. Für Aussteller-Seiten bleibt die Regel aus 020 (Link → Wahl → Browser
  → Deutsch); ihre Wahl wird getrennt gemerkt und stellt die Verwaltung nicht um.
- Deutsch ist immer geladen, jede Übersetzung kommt als eigener Teil nach (`ladeOberflaeche()`); der Service Worker lädt
  alle vor, das Tablet bleibt offline benutzbar. Schlägt das Laden fehl, zeigt die Oberfläche vorerst Deutsch.
- Datumsangaben folgen der Sprache; Geldbeträge bleiben im deutschen Format (Eingaben mit Komma).
- **Bleibt deutsch** (wie 020): Inhalte des Vereins, Rassen- und Farbenschlagverzeichnis, Bewertungstexte und
  Textbausteine, alle PDFs und Drucke, Impressum und Datenschutz (rechtlich maßgeblich), Handbücher, Protokolleinträge,
  Mails an Benutzer (Einladung, Hinweise), Namen, die als Inhalt gespeichert werden (z. B. Vorgabename einer Druckvorlage),
  Gründe im Protokoll (Bearbeitungsschritte im Hallenplan tragen dazu ihren deutschen Namen mit). Im Quelltext markiert
  `// bleibt deutsch` solche Stellen.

**Prüfung:** `oberflaeche.test.ts` (Domain: Vollständigkeit, keine Kopie des Deutschen, Platzhalter, Schweiz/Französisch,
`serverText` erkennt jede Meldung eindeutig, Gründe der Prüffunktionen wie `pruefeIban` mit echten Fehleingaben so
eingesetzt wie im Server) und `scripts/sprachen-scan.test.ts` (kein deutscher Rest im Quelltext der
Oberfläche, jede Meldung des Servers übersetzbar – auch jedes `new …Error("…")` und `new TRPCError({ message })` in
Server und Domain, weil Router solche Fehler als Meldung weiterreichen; nur interne mit `// bleibt deutsch`, ausgenommen
die reinen Kommandozeilen-Programme direkt in `apps/server/src` –, und **Deutsch unverändert**: jedes Textstück
des Standes vor der Umstellung, `scripts/sprachen-vorher.json`, steht wortgleich in den deutschen Texten oder im
Quelltext). Wer deutschen Wortlaut später bewusst ändert, entfernt das alte Stück aus `sprachen-vorher.json`. Werkzeug:
`bun scripts/sprachen-scan.ts rest|server|verloren`.

**Folgen:** Jeder neue Text der Oberfläche kommt in alle Sprachen (die Typprüfung verlangt es), jede neue Meldung des Servers
in eine Gruppe `server*` (der Test findet sie). Das kostet bei jeder Änderung etwas mehr; dafür kann ein Verein Helfer und
Preisrichter aus den Nachbarländern einsetzen. Die Übersetzungen sind sorgfältig, aber nicht von Muttersprachlern geprüft –
Verbesserungen bitte als Issue.

**Wo:** `packages/domain/src/sprachen/oberflaeche/` (`oberflaeche()`, `serverText()`, Gruppen je Sprache),
`packages/domain/src/sprachen/umschreiben.ts`, `uebersetzung.ts`; Web `apps/web/src/sprache.tsx` (`SpracheRahmen`,
`useOberflaeche`, `SprachWahl`), `sprache-jetzt.ts` (`ot()` außerhalb von Komponenten), `lib.ts` (`fehlerText`, `datum`);
Sprachwahl in `rahmen.tsx` (Anmeldung, Benutzermenü) und `seiten/richter-anmeldung.tsx`; Server
`routers/auth/anmeldung.ts` (`spracheSetzen`, `status` liefert `benutzer.sprache`), `auth.ts`, `db/schema-mandant.ts`.
Moduldoku: [Sprachen](../module/sprachen.md).
