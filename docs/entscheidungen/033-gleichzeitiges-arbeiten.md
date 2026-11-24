# 033 Gleichzeitiges Arbeiten: Sperren und Stand-Prüfung

**Stand:** gilt (24.11.2026)

**Kontext:** Eine Gesamt-Gegenprüfung auf gleichzeitiges Arbeiten (mehrere Kassen, Helfer und Ausstellungsleitung
zugleich, erneuter Klick nach verlorener Antwort, ein alter Browser-Tab) fand im Bereich Geld und Meldung wiederkehrende
Muster: Prüfungen am Stand vor der Transaktion (Phase aus `ladeSchau`, Status aus `ladeMeldung`), die nach dem Warten
auf eine Sperre nicht wiederholt wurden; zwei Wege, die dieselbe Zeile in verschiedener Reihenfolge sperren
(Verklemmung, 40P01); ein alter Wert fürs Protokoll, ungesperrt gelesen; Formulare, die ihren ganzen Stand zurückschreiben
und so fremde Änderungen still überschreiben. PostgreSQL läuft mit READ COMMITTED: jede Anweisung sieht, was bis zu ihrem
Beginn committet ist – eine Sperre schützt nur, was nach ihr gelesen wird.

**Entscheidung:**

1. **Erst sperren, dann prüfen.** Die Prüfung vor der Transaktion bleibt als schnelle Antwort. Maßgeblich ist dieselbe
   Prüfung unter der Sperre am frisch gelesenen Stand. Für Geld: `sperreKasseMitPhase(tx, schauId)`
   (`services/kasse.ts`) nimmt die Kassensperre und liest die Phase neu – wer gewartet hat, sieht einen inzwischen
   gebuchten Abschluss. Zeilen, deren Zustand die Prüfung trägt (Meldungsstatus, Verfall, Lastschriftlauf), werden mit
   `FOR UPDATE` gelesen und daran geprüft. Der Abschluss (`phaseSetzen`) wiederholt seine Hindernisse unter der Kassensperre.
2. **Feste Sperrreihenfolge:** Testschau-Sperre (`sperreTestschauGeteilt`/`Exklusiv`) → Kasse → Bestätigungen
   (`sperreBestaetigungen`) → Zeilen. Nie eine Zeile sperren und danach auf die Kasse warten. Wer mehrere Zeilen sperrt,
   sperrt sie nach ID. Eine Verklemmung (40P01, „Bitte noch einmal versuchen“) ist ein Fehler im Code, keine Behebung.
3. **Wer eine Menge prüft, die andere gleichzeitig erweitern, braucht eine gemeinsame Sperre** – eine Zeilensperre
   genügt nicht, weil neue Zeilen sie nicht berühren. Absage und Entfernen einer Teilschau nehmen die Testschau-Sperre
   exklusiv (jede Meldung hält sie geteilt), Online-Meldungen derselben Schau prüfen Halle und Meldephase nacheinander
   (Advisory-Sperre je Schau), Rücklastschrift und Zuwendungsbestätigung teilen `sperreBestaetigungen`.
4. **Alter Wert fürs Protokoll** wird in derselben Transaktion mit `FOR UPDATE` gelesen (ADR 003): sonst steht bei zwei
   gleichzeitigen Änderungen zweimal derselbe alte Wert im Protokoll.
5. **Stand-Prüfung für Formulare, die zurückschreiben:** Das Formular bekommt beim Laden einen Stand und sendet ihn
   mit; weicht er unter der Sperre ab, lehnt der Server mit CONFLICT „Inzwischen geändert – bitte neu laden“ ab, statt zu
   überschreiben. Meldung: `meldungStand()` (`services/meldung-stand.ts`) über Aussteller, Meldungsfelder und Tiere.
   Geld: der angezeigte Betrag (`erwartetOffenCent`, `erwartetCent`) – jede Oberfläche, die kassiert, sendet ihn.
6. **Dieselbe Anfrage zweimal** legt nichts doppelt an: eine neue Meldung trägt die Kennung ihres Formulars
   (`meldung.anfrage_id`, eindeutig je Schau, Migration 0072); kommt sie wieder, liefert der Server die schon angelegte.

**Folgen:** Neue Schreibwege nehmen die Sperren in dieser Reihenfolge und prüfen darunter. Servertests stellen das
Rennen fest nach: eine zweite Verbindung hält die Sperre bzw. eine Transaktion bleibt offen, bis der andere Aufruf
wartet (`tests/85-gleichzeitig-geld-meldung.ts`, Muster auch in `30-einteilung-gegenpruefung.ts`). Andere Bereiche
verweisen auf diese Entscheidung.

**Offen:** Das allgemeine Formularmodell (letzter Schreiber gewinnt) gilt weiter für Einstellungen ohne Stand
(Vereinsangaben, Spender, Gebühren). Wege in `routers/meldung.ts`, die Meldegeld negativ buchen (Erstattung, Storno),
prüfen gültige Zuwendungsbestätigungen nicht – eigenes Ticket.
