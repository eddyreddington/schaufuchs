# 033 Gleichzeitiges Arbeiten: Sperren und Stand-Prüfung

**Stand:** gilt (24.11.2026; Sperrreihenfolge für alle Bereiche vereinheitlicht)

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
   `FOR UPDATE` gelesen und daran geprüft. Jeder Phasenwechsel (`phaseSetzen`) nimmt die Online-Melde-Sperre und die
   Kasse, wartet also auf laufende Online-Meldungen, Verkäufe, Zahlungen und Auszahlungen, die die alte Phase gelesen
   haben; der Abschluss wiederholt darunter seine Hindernisse.
2. **Feste Sperrreihenfolge** (verbindlich für alle Schreibwege; wer eine Stufe nicht braucht, lässt sie aus, nimmt aber
   nie eine frühere nach einer späteren):
   1. Online-Melde-Sperre (`sperreOnlineMeldung`)
   2. Testschau-Sperre (`sperreTestschauGeteilt`/`Exklusiv`)
   3. Kasse (`sperreKasse`, `sperreKasseMitPhase`)
   4. Bestätigungen (`sperreBestaetigungen`), danach Sperren je Anfrage, E-Mail oder Name (Advisory)
   5. Zeilen Aussteller → Meldung (mehrere nach ID, `FOR UPDATE`)
   6. Einteilung (`sperreEinteilung` exklusiv, `sperreEinteilungGeteilt` für Noten und Preise, Advisory 2026111201;
      `sperreEinteilungFuerMeldung` nach der Meldungszeile)
   7. Schau-Zeile: `FOR SHARE` (Note, Preis, Impfnachweis) oder `FOR NO KEY UPDATE` (Phase, Absage, Freigabe, Nummern,
      Einstellungen, Halle, Käfige). Nie `FOR UPDATE`, wenn die Transaktion danach protokolliert: jede Einfügung mit
      Fremdschlüssel auf die Schau (Protokoll, Bewertung, Kasse) hält `FOR KEY SHARE` auf ihr, und der Protokolleintrag
      hält zu diesem Zeitpunkt schon die Kette – beide verklemmten sich. `FOR UPDATE` nur beim Löschen der Schau und
      beim Bild-Hochladen (ohne Protokoll; wartet dort bewusst auf ein gleichzeitig eingefügtes Bild).
   8. Tiere (`katalogeintrag`, nach ID `FOR UPDATE`), danach übrige Zeilen der Schau (Preisrichter, Gesundheit, Bild)
   9. Benutzer → Sitzung
   10. `protokolliere()` **zuletzt**: der Trigger `aenderung_kette` sperrt eine für die ganze Installation geltende
       Zeile bis zum Commit. Nach dem ersten Protokolleintrag wartet die Transaktion auf keine Sperre mehr; mehrere
       Einträge (Absage, Einteilung nach Status) erst, wenn alles geschrieben ist.

   Nie eine Zeile sperren und danach auf die Kasse warten. Meldung vor Einteilung, weil erst die gesperrte Meldung zeigt,
   ob die Einteilung gebraucht wird (Statuswechsel, automatische Bestätigung nach Zahlung); kein Weg sperrt unter der
   Einteilung eine Meldung. Meldungen vor der Schau-Zeile: Absage, Teilschauen und Testschau-Kennzeichen sperren die
   betroffenen Meldungen nach ID, bevor sie die Schau sperren (wie der Impfnachweis). Eine Verklemmung (40P01, „Bitte
   noch einmal versuchen“) ist ein Fehler im Code, keine Behebung.
3. **Wer eine Menge prüft, die andere gleichzeitig erweitern, braucht eine gemeinsame Sperre** – eine Zeilensperre
   genügt nicht, weil neue Zeilen sie nicht berühren. Absage und Entfernen einer Teilschau nehmen die Testschau-Sperre
   exklusiv (jede Meldung hält sie geteilt), Online-Meldungen derselben Schau prüfen Halle und Meldephase nacheinander
   (`sperreOnlineMeldung` je Schau; die Meldephase prüft nur dieser öffentliche Weg – die Ausstellungsleitung erfasst
   auch später Meldungen mit Eingang „online“), Rücklastschrift und Zuwendungsbestätigung teilen `sperreBestaetigungen`.
4. **Alter Wert fürs Protokoll** wird in derselben Transaktion mit `FOR UPDATE` gelesen (ADR 003): sonst steht bei zwei
   gleichzeitigen Änderungen zweimal derselbe alte Wert im Protokoll.
5. **Stand-Prüfung für Formulare, die zurückschreiben:** Das Formular bekommt beim Laden einen Stand und sendet ihn
   mit; weicht er unter der Sperre ab, lehnt der Server mit CONFLICT „Inzwischen geändert – bitte neu laden“ ab, statt zu
   überschreiben. Meldung: `meldungStand()` (`services/meldung-stand.ts`) über Aussteller, Meldungsfelder und Tiere,
   verglichen erst, wenn Aussteller, Meldung und Tiere gesperrt sind. Der Stand ist ein HMAC mit einem aus dem
   Datenschlüssel abgeleiteten Schlüssel, weil er Felder enthält, die nicht jede Rolle sieht. Die Oberfläche bietet
   nach CONFLICT „Neu laden“ an; die Eingaben bleiben bis dahin sichtbar.
   Geld: der angezeigte Betrag (`erwartetOffenCent`, `erwartetCent`) – jede Oberfläche, die kassiert, sendet ihn.
6. **Dieselbe Anfrage zweimal** legt nichts doppelt an: eine neue Meldung trägt die Kennung ihres Formulars
   (`meldung.anfrage_id`, eindeutig je Schau, Migration 0072); kommt sie wieder, liefert der Server die schon angelegte.
   Die Kennung entsteht über `crypto.getRandomValues` (`neueAnfrageId`), also auch beim Betrieb über http://.

**Folgen:** Neue Schreibwege nehmen die Sperren in dieser Reihenfolge und prüfen darunter. Servertests stellen das
Rennen fest nach: eine zweite Verbindung hält die Sperre bzw. eine Transaktion bleibt offen, bis der andere Aufruf
wartet (`tests/84`–`87-gleichzeitig-*.ts`, Muster auch in `30-einteilung-gegenpruefung.ts`);
`tests/88-gleichzeitig-gesamt.ts` lässt viele Schreibwege zugleich laufen (Mischbetrieb) und erwartet weder Verklemmung
noch Hänger. Andere Bereiche verweisen auf diese Entscheidung.

**Offen:** Das allgemeine Formularmodell (letzter Schreiber gewinnt) gilt weiter für Einstellungen ohne Stand
(Vereinsangaben, Spender, Gebühren). Wege in `routers/meldung.ts`, die Meldegeld negativ buchen (Erstattung, Storno),
prüfen gültige Zuwendungsbestätigungen nicht – eigenes Ticket. `statusSetzen` nimmt bei jedem Wechsel die Kasse
(auch „offen → bestätigt“ durch Helfer) und hält sie bis zur Einteilung; an Einlieferungstagen beobachten – braucht die
Einteilung bei großen Schauen merklich Zeit, sie in einen eigenen kurzen Schritt nach dem Statuswechsel legen.
