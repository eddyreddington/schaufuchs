# SchauFUCHS 1.15 – Versionshinweise

## 1.15.0 (21.11.2026)

Gegenüber 1.14.0 ist neu:

### Preisverteilung je Preisrichter (PDF)

- „Preise“ in der Zeile eines Preisrichters (Seite „Preisrichter“) erzeugt seine Preisverteilung, „Preisverteilung
  (PDF)“ über dem Kontingent auf der Seite „Preise“ die aller Preisrichter, jeden ab neuer Seite.
- Je Preisart aus dem Standgeld, auch Bänder und Sachpreise, stehen so viele Zeilen darauf, wie das Kontingent des
  Preisrichters erlaubt: vergebene mit Katalognummer und Wert, die übrigen leer zum Eintragen in der Halle. Gestiftete
  Preise stehen nur darauf, wenn sie vergeben sind, mit dem Stifter. Unten: Gesamtwert und wie viel davon vergeben ist.
- Gilt das Kontingent für die ganze Schau, zeigt das Blatt nur die vergebenen Preise. Preise an fehlenden Tieren
  tragen „Tier fehlt“; ist mehr vergeben, als das Kontingent heute erlaubt, steht „über dem Kontingent“ zuerst dort.
- Ohne Ausstellernamen. Handbuch: Abschnitt „Preise vergeben“.

### Preisrichter: Tabellen ausgerichtet

- „Einteilung nach Rassen“: Die Spalten „Tiere“ und „Preisrichter“ stehen in allen Sparten an derselben Stelle.
- „Einteilung nach Nummern“: Die Namen der Preisrichter werden nicht mehr abgeschnitten, Kopf und Felder enden bündig.
- Auf schmalen Bildschirmen scrollen beide Tabellen waagerecht, statt die Felder zu stauchen.

### Hallenplan: Knopf „Speichern“

- Im Seitenkopf des Hallenplans steht jetzt „Speichern“. Der Editor speichert weiterhin jede Änderung sofort; der Knopf
  prüft das nach: Er holt den Stand vom Server und meldet „Alles gespeichert“, eine nicht gespeicherte letzte Änderung
  oder dass inzwischen jemand anders den Plan geändert hat. Solange noch gespeichert wird, ist er gesperrt.

### Update

`sudo schaufuchs update` sichert vorher und holt 1.15.0. An der Datenbank ändert sich nichts.
