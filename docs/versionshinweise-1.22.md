# SchauFUCHS 1.22 – Versionshinweise

## 1.22.1 (26.11.2026)

- **Signierte Releases:** Ab dieser Version sind die Prüfsummen jedes Release mit einem Schlüssel signiert, der nicht
  auf GitHub liegt, und nennen die Version. `schaufuchs update` und der Installer nehmen künftige Releases nur mit
  gültiger Signatur an – auch wer das GitHub-Konto übernähme, könnte keine veränderte oder umbenannte Version
  unterschieben (Entscheidung 037, Nachtrag). Das gilt ab dem *nächsten* Update: Das Update auf 1.22.1 selbst läuft
  noch mit dem bisherigen Befehl. Der Server braucht `ssh-keygen` ab OpenSSH 8.1 (Paket `openssh-client`, auf
  aktuellem Debian und Ubuntu vorhanden).
- Veröffentlichte Releases und Versions-Tags lassen sich auf GitHub nicht mehr ändern oder löschen.

## 1.22.0 (26.11.2026)

Dieses Release härtet SchauFUCHS nach einer Sicherheitsprüfung. Wer SchauFUCHS selbst betreibt, sollte bald
aktualisieren.

### Meldung und Geld

- **Online-Meldung an einen vorhandenen Aussteller:** Wer online mit Angaben eines schon bekannten Ausstellers meldet,
  bekommt den Link zur Meldung nicht mehr auf der Seite, sondern nur per Mail an die hinterlegte Adresse. Die Meldung
  gilt erst, wenn sie über „Meldung bestätigen“ bestätigt ist oder die Ausstellungsleitung „Meldebogen ist
  unterschrieben“ setzt (Entscheidung 034). Neue Aussteller melden wie bisher.
- **Lastschrift:** Unbestätigte Online-Meldungen zieht ein Mandat nicht ein, und bei Online-Meldungen nur das
  Meldegeld – online zugesagte Stiftung und Spende zahlt der Aussteller selbst (Hinweis in der Vorschau).
- **Belegarchiv:** Einzahlungsquittungen („bar erhalten“) gibt es nur noch für bare Zahlungen. Schon früher abgelegte
  Quittungen bleiben im Archiv, wie sie sind.
- **Meldungen:** Mehrere offene Meldungen lassen sich auf einmal ablehnen (Filter „offen“, ankreuzen).
- Online-Meldungen: Die Grenze je Anschluss gilt auch je IPv6-Netz; Einwilligungen in die Veröffentlichung nur an
  gültigen Meldungen, ohne den öffentlichen Katalog jedes Mal neu zu bauen.

### Datenschutz

- Kontoinhaber, E-Mail und Telefon stehen nicht mehr im Klartext im Protokoll (wie schon IBAN und Geburtsdatum).
- Einladungslinks stehen im Postausgang nur noch verschlüsselt.
- IBAN und Kontoinhaber sind an ihren Datensatz gebunden verschlüsselt (Entscheidung 035).

### Anmeldung

- Codes der Zwei-Faktor-Anmeldung lassen sich auch über lange Zeit nicht durchprobieren: nach zu vielen Fehlversuchen
  wird das Konto gesperrt und der Benutzer per Mail benachrichtigt; die Ausstellungsleitung hebt die Sperre auf.
- Notfallcodes werden mit Schlüssel gespeichert; vorhandene Codes gelten weiter.
- Fremde im selben Netz (z. B. Hallen-WLAN) sperren bekannte Geräte und Tablets nicht mehr aus (Entscheidung 036).

### Betrieb

- **Mailversand nur verschlüsselt:** `smtp://` verlangt STARTTLS; `smtps://`, Port 465 oder `?secure=true` nutzen TLS
  von Anfang an. Ein Mailserver ohne Verschlüsselung (etwa ein Relay im eigenen Netz) stellt nach dem Update nicht mehr
  zu, bis `SMTP_OHNE_TLS=1` in der `.env` steht.
- **`/api/gesund`** antwortet über den Proxy nur noch mit `{"ok":true}`. Die vollen Angaben gibt es direkt am Container
  oder mit `Authorization: Bearer` und `GESUND_TOKEN` aus der `.env` (für eine Überwachung von außen).
- **Updates geprüft:** `schaufuchs update` und der Installer prüfen Dateien und Programme gegen die Prüfsummen des
  Release (Entscheidung 037). Das gilt ab dem *nächsten* Update – dieses läuft noch mit dem alten Befehl.
- **Kein Rückschritt per Update:** `schaufuchs update` lehnt ältere Versionen ab. Zurück nur mit
  `schaufuchs zuruecknehmen` (spielt die Sicherung von vor dem Update zurück) – eine ältere Version würde die an den
  Datensatz gebundenen Bankdaten verfälschen.
- **Selbstbau:** Ohne `EINRICHTUNG_CODE` erzeugt der Server beim Start einen Code für die Einrichtung im Browser und
  schreibt ihn ins Log.
- Das Notfallblatt liegt nur noch für root lesbar unter `/opt/schaufuchs`; der Installer löscht es erst nach Eingabe der
  letzten Zeichen des Sicherungsschlüssels.
- Kontoauszüge (camt.053) werden auch bei sehr großen oder fehlerhaften Dateien zügig gelesen.

### Update

`sudo schaufuchs update` sichert vorher und holt 1.22.0. Keine Änderung am Datenbankschema; beim ersten Start werden
IBAN und Kontoinhaber einmal neu verschlüsselt (im Log „Verschlüsselt: … Aussteller, … SEPA-Mandate“).
