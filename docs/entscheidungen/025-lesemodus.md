# 025 Lesemodus per NUR_LESEN

**Stand:** gilt (17.11.2026)

**Kontext:** Betreiber wollen eine Installation zeitweise nur noch zum Nachsehen offen lassen – etwa während einer
Wartung oder wenn ein gehosteter Zugang ruht. Von außen ging das bisher nur mit einem vorgeschalteten Proxy, der
schreibende Anfragen abweist. Der muss die Pfade der Anwendung kennen und bei jeder Version nachgezogen werden, und
Benutzer sehen nur, dass Speichern scheitert, nicht warum.

**Entscheidung:**
- `NUR_LESEN=1` in der `.env` schaltet den Lesemodus ein; leer oder `0` ist normaler Betrieb. Umschalten heißt
  Neustart der Anwendung (wie jede Einstellung).
- **Gesperrt** wird an zwei Stellen, beide im Server:
  - jeder tRPC-Aufruf außer Abfragen (Mutationen, auch künftige Subscriptions) in `trpc.ts` (`basis`), vor jeder
    anderen Prüfung – also auch vor Anmeldung und Eingabeprüfung, damit nichts angefasst wird;
  - jede schreibende Anfrage (alles außer GET, HEAD, OPTIONS) außerhalb von `/trpc` (`lesemodus.ts`).
  Antwort: `FORBIDDEN` bzw. 403 mit „Nur Lesen: Änderungen sind gerade nicht möglich.“ (`NUR_LESEN_MELDUNG`, in allen
  Sprachen übersetzt). Bewusst nicht `PRECONDITION_FAILED` oder `CONFLICT`: dafür bieten Seiten „trotzdem“ an.
- **Ausnahmen** (`IM_LESEMODUS_ERLAUBT`): An- und Abmelden (auch mit Code), Zwei-Faktor einrichten und bestätigen
  (sonst sperrte die Pflicht-2FA Administratoren aus), Schutz bei Verdacht (eigenes Passwort; Administratoren melden
  ein Konto auf allen Geräten ab oder sperren es – Entsperren nicht), die Sprache der Oberfläche, Preisrichter an- und
  abmelden und der Widerruf der Online-Veröffentlichung (Art. 7 Abs. 3 DSGVO: jederzeit möglich – das Erteilen nicht).
  Die Richtung prüfen die Prozeduren selbst. Einladungen gehören nicht dazu: Wer eingeladen ist, sieht den Lesemodus
  schon beim Öffnen des Links. Außerhalb von tRPC die POST-Adressen, die nur ein PDF erzeugen (Katalog-Vorschau,
  Druckvorlagen, Serienbrief). Ein Test zählt die Ausnahmen fest auf und prüft, dass jede andere Mutation abgewiesen
  wird – neue Mutationen sind damit automatisch gesperrt.
- **Lesende Adressen mit Nebenwirkung:** Belege, deren Ablage beim Buchen scheiterte, entstehen sonst beim ersten
  Abruf und kommen ins Belegarchiv. Im Lesemodus werden sie nur erzeugt und gezeigt, nicht abgelegt
  (`archiviereBeleg`). Sitzungen (Anmelden, letzte Aktivität) schreiben weiter.
- **Nicht gesperrt** sind Hintergrundarbeiten des Servers: Löschfristen (gesetzlich), Postausgang (schon
  verschickte Aufträge), Abruf der Kalender-Abos. Der Lesemodus hält Benutzer vom Ändern ab, er friert die Datenbank
  nicht ein: Für einen Umzug auf einen anderen Server ist die Anwendung anzuhalten, sonst gingen z. B. Widerrufe
  verloren, die nach dem Abzug der Daten eingehen.
- **Oberfläche:** `betrieb.lesemodus` meldet den Zustand. Die Verwaltung zeigt eine Leiste „Nur Lesen – …“ mit dem
  Hinweis des Betreibers (`NUR_LESEN_HINWEIS`, höchstens 300 Zeichen, nicht übersetzt) und „Hilfe zum Lesemodus“
  (Handbuch 1.7). Den Hinweis sehen nur angemeldete Benutzer – Aussteller und Preisrichter sehen nur den festen Satz
  in ihrer Sprache. Das Tablet bewertet weiter; die Bewertungen bleiben im Ausgang und gehen danach heraus.
- `/api/gesund` meldet `nurLesen`, damit eine Überwachung den Zustand prüfen kann.

**Folgen:** Wer schreibende tRPC-Wege oder POST-Adressen hinzufügt, muss nichts tun – sie sind im Lesemodus gesperrt.
Soll ein neuer Weg auch im Lesemodus gehen, kommt er in `IM_LESEMODUS_ERLAUBT` (Mutation) bzw. `NUR_PDF`
(Datei-Adresse) mit Begründung. Wer eine Abfrage oder GET-Adresse schreiben lässt, prüft selbst `config.nurLesen`.
