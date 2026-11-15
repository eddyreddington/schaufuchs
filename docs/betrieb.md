# SchauFUCHS betreiben

Für Vereine mit dem Installer (empfohlen): [installation.md](installation.md). Diese Seite erklärt den Betrieb genauer –
Befehle, Sicherung, Wiederherstellung, Notfälle – und den Betrieb mit selbst gebautem Programm.

## Mit dem Installer (Befehl `schaufuchs`)

Der Installer läuft als eigener Benutzer mit sudo (Einrichtung und Absicherung des Servers: [installation.md](installation.md))
und legt alles unter `/opt/schaufuchs` ab: `docker-compose.yml` (App, PostgreSQL, Sicherung, Caddy für HTTPS), `.env`
(Einstellungen und Schlüssel, nur für root lesbar), `backups/` (gehört dem Benutzer, der sudo aufgerufen hat) und den
Befehl `schaufuchs`:

| Befehl | Wirkung |
|---|---|
| `sudo schaufuchs status` | Läuft alles? Version, letzte Sicherung, freier Platz |
| `sudo schaufuchs update` | Auf die neueste Version (oder `update 1.3.0`); sichert vorher, lädt die fertigen Programme, startet neu |
| `sudo schaufuchs zuruecknehmen` | Letztes Update zurücknehmen: Sicherung von vor dem Update und alte Version (Eingaben seitdem gehen verloren) |
| `sudo schaufuchs sichern` / `sicherungen` | Sicherung jetzt anlegen / vorhandene anzeigen |
| `sudo schaufuchs wiederherstellen DATEI` | Sicherung zurückspielen (fragt nach dem Sicherungsschlüssel vom Notfallblatt) |
| `sudo schaufuchs einstellungen` | `.env` bearbeiten (z. B. Mailversand), danach Neustart |
| `sudo schaufuchs logs` | Meldungen von Anwendung, HTTPS und Sicherung |
| `sudo schaufuchs pruefen` | Absicherung abfragen: SSH (root, Passwort), ufw, unattended-upgrades, Neustart, fail2ban, letzte Sicherung, Platz – nur Hinweise (ab 1.2.1) |

**Notfallblatt:** Der Installer schreibt Sicherungsschlüssel und Datenschlüssel nach `~/schaufuchs-notfallblatt.txt` des
Benutzers, der sudo aufgerufen hat (als root angemeldet: `/root/schaufuchs-notfallblatt.txt`).
Ausdrucken oder im Passwortmanager des Vereins ablegen, dann die Datei löschen. Ohne Sicherungsschlüssel lässt sich keine
Sicherung zurückspielen; ohne Datenschlüssel sind IBAN und Zwei-Faktor-Geheimnisse einer zurückgespielten Datenbank unlesbar.

**Sicherungen außer Haus:** `/opt/schaufuchs/backups` regelmäßig auf einen anderen Rechner oder in einen Cloud-Speicher
kopieren (die Dateien sind verschlüsselt und gehören über `BACKUP_UID`/`BACKUP_GID` dem eigenen Benutzer, also z. B.
`rsync -av verwalter@schau.example.org:/opt/schaufuchs/backups/ ~/schaufuchs-sicherungen/` ohne sudo). Fällt der Server aus: neuen Server mit dem Installer aufsetzen, in der `.env`
`DATENSCHLUESSEL` vom Notfallblatt eintragen, Sicherung nach `backups/` kopieren, `sudo schaufuchs wiederherstellen DATEI`.

**Mailversand:** `sudo schaufuchs einstellungen`, `SMTP_URL` eintragen (Zugangsdaten des Mailpostfachs des Vereins,
Format in der Datei erklärt). Ohne Mailversand bleiben Mails im Postausgang unter „Verein und Datenschutz“.

## Zwei-Faktor-Anmeldung: Pflicht und Notfall

- Administratoren kommen erst an die Verwaltung, wenn ihre Zwei-Faktor-Anmeldung (2FA) eingerichtet ist; bis dahin gelten sie als Helfer.
- **Vor dem Schautag:** mindestens zwei Administratoren mit eingerichteter 2FA, Notfallcodes ausgedruckt im Kassenordner.
- **Telefon verloren:** ein anderer Administrator setzt die 2FA zurück (Benutzer → Name → „Zwei-Faktor-Anmeldung zurücksetzen“).
- **Kein Administrator kommt mehr herein:** auf dem Server die 2FA eines Kontos zurücksetzen –
  `sudo docker compose -f /opt/schaufuchs/docker-compose.yml exec db psql -U schau -d schau -c "update benutzer set totp_geheim = null, totp_aktiv_seit = null, totp_letzter_schritt = 0, totp_notfall = '[]' where email = '<adresse>'"`.
  Danach meldet sich die Person nur mit Passwort an und richtet die 2FA neu ein.
- **Notschalter** `ZWEI_FAKTOR_PFLICHT=0` in der `.env` (dann Neustart): hebt nur die Pflicht auf. Nur für Notfälle.

## Selbst gebaut (Entwickler, eigener Docker-Rechner)

Ein Container liefert API und Oberfläche aus; dazu eine PostgreSQL. Lokal läuft das in OrbStack (oder jedem anderen Docker).

```bash
cp .env.example .env    # Werte anpassen, vor allem PUBLIC_URL und POSTGRES_PASSWORD
bun run docker:start    # sichert die laufende Datenbank, baut und startet alles; danach http://schau.orb.local bzw. http://localhost:8787
bun run docker:stop     # anhalten (Daten bleiben)
bun run docker:logs     # Protokoll des Servers
```

Die Container starten mit OrbStack automatisch wieder (`restart: unless-stopped`).

**Demo nur auf einer Test- oder Vorführinstallation:** `bun run docker:demo -- --testinstallation` spielt einen Demo-Verein mit komplett durchgespielter Schau ein. Er bringt einen eigenen Administrator mit; Passwort und Tablet-PIN werden zufällig erzeugt und nur einmal angezeigt. Auf einer frischen Produktivinstallation verhinderte er die Ersteinrichtung des echten Vereins – deshalb verweigert das Skript ohne den Schalter. Entfernen (andere Vereine bleiben unberührt): `bun run docker:demo:entfernen`.

Der App-Port ist standardmäßig nur auf diesem Rechner erreichbar (`APP_BIND=127.0.0.1`); von außen läuft der Zugriff über den Reverse-Proxy.
Für eine öffentlich erreichbare Installation vor der Ersteinrichtung `EINRICHTUNG_CODE` setzen – sonst kann jeder, der die Seite zuerst aufruft, den Verein anlegen und Administrator werden.

Beim Start werden Datenbank-Migrationen automatisch eingespielt (`apps/server/drizzle`). Das Image enthält nur Server, Fachlogik, die gebaute Oberfläche und die Produktionsabhängigkeiten (rund 370 MB) und läuft ohne Root-Rechte. Für HTTPS einen Reverse-Proxy (z. B. Caddy) davorsetzen und `TRUST_PROXY=1` setzen – ohne diese Einstellung sieht der Server nur die Adresse des Proxys, und alle Bremsen gegen Missbrauch gelten für alle Besucher gemeinsam. Die Größe von Anfragen begrenzt der Server selbst (ohne Anmeldung 256 KB, angemeldet 1 MB, Bild-Upload und Import nur für Administratoren 12 MB); eine zusätzliche Grenze am Proxy (Caddy: `request_body { max_size 13MB }`) schadet nicht. Ohne `SMTP_URL` bleiben E-Mails im Postausgang der Datenbank; mit SMTP werden sie im Hintergrund versandt und bei einer Störung wiederholt (nach 5, 10, 20 … Minuten, höchstens alle 6 Stunden, bis die Mail 2 Tage alt ist). Nicht versandte Mails stehen unter „Verein und Datenschutz › Postausgang“ und lassen sich dort erneut senden; Versandfehler stehen auch im Server-Log. Sonderzeichen im SMTP-Passwort bitte URL-kodieren (siehe `.env.example`) – eine ungültige `SMTP_URL` legt den Server nicht lahm, er startet dann ohne Mailversand und zeigt den Fehler im Postausgang.

Die Anwendung hat eine Speichergrenze von 2 GB (`APP_SPEICHER`). Bilder für Katalog und Anzeigen rechnet der Browser beim Hochladen auf Druckgröße herunter (Anzeigen und Titelbild als JPEG, Logo höchstens 600 Pixel); große PNG mit durchsichtigem Hintergrund (über 1,5 Millionen Pixel) nimmt der Server nicht an, weil der Katalogdruck sie vollständig entpacken müsste. Kataloge werden nacheinander erzeugt, der öffentliche Katalog bei Änderungen höchstens alle 10 Minuten neu (Datenschutz-Änderungen sofort).

Anmeldung: Nach 10 Fehlversuchen für ein Konto (bzw. eine Tablet-PIN) von fremden Adressen wächst die Wartezeit (1 s, 2 s, 4 s …, höchstens 5 bzw. 15 Minuten); Geräte, die schon angemeldet waren, betrifft das nicht. Abgewiesene Versuche zählen nicht gegen die Grenzen je Gerät und je Netz. Ein Fremder kann die Wartezeit mit wenigen Anfragen hochhalten – deshalb hebt die Ausstellungsleitung sie unter „Benutzer“ bzw. „Preisrichter“ auf, und danach gilt sie 30 Minuten lang nicht (die Grenzen je Gerät und je Netz bleiben). Die Tablet-PIN hat 8 Ziffern und gilt nur von der Einlieferung bis zu den Preisen (ältere 6-stellige PINs macht das Update ungültig – bitte unter „Preisrichter“ neu erzeugen); mit dem Abschluss der Schau werden alle Tablets abgemeldet. Noch nicht übertragene Noten zeigt das Tablet auch ohne Anmeldung zum Nachtragen durch die Ausstellungsleitung. Wer einen Benutzer sperrt, meldet ihn auf allen Geräten ab.

Der Server wendet die Speicherfristen beim Start und dann täglich an: Mails nach 180 Tagen; Geburtsdatum, IBAN sowie Kontakt und PIN der Preisrichter 30 Tage nach dem Abschluss der Schau; Käuferdaten, Tierliste und Preisrichter-Anschrift nach 3 Jahren; Belege und Protokollinhalte nach Ende des Belegjahres plus 8 Jahre; inaktive Aussteller nach 3 Jahren. Damit sie greifen, Schauen nach der Abrechnung auf „Abgeschlossen“ setzen (die Prüfliste erinnert daran). Vor dem Echtbetrieb unter „Verein und Datenschutz“ Impressum und Datenschutzhinweise ausfüllen und den Text prüfen lassen.

## Hallenbetrieb (Tablets der Preisrichter)

Das Tablet arbeitet ohne Netz weiter, startet aber nur dann ohne Netz neu, wenn die Seite über **HTTPS** geladen wurde – nur dann gibt es Service Worker und dauerhaften Speicher. Zwei Wege:

1. **Server im Internet mit HTTPS** (Reverse-Proxy mit Let's-Encrypt-Zertifikat), die Tablets über mobiles Netz oder Hallen-WLAN mit Internet. `PUBLIC_URL=https://…`.
2. **Server in der Halle**: Caddy vor den Container, z. B. `caddy reverse-proxy --from schau.halle.lan --to localhost:8787 --internal-certs`, das Wurzelzertifikat von Caddy einmal auf jedem Tablet installieren und `PUBLIC_URL=https://schau.halle.lan` setzen.

Über `http://` (IP-Adresse im WLAN) funktioniert die Bewertung nur, solange die Seite geöffnet bleibt; das Tablet zeigt dann einen Hinweis. Steht in `PUBLIC_URL` eine https-Adresse, setzt der Server sichere Cookies – eine Anmeldung über `http://` scheitert dann; der Server warnt im Log.

## Sicherung und Wiederherstellung

Der Dienst `backup` legt alle `BACKUP_INTERVALL_MINUTEN` (Standard 120) einen `pg_dump` unter `./backups` ab – nur wenn sich seit der letzten Sicherung etwas geändert hat, sonst einmal täglich – und prüft ihn, indem er ihn vollständig mit `pg_restore` liest. Aufbewahrt werden die Sicherungen der letzten 48 Stunden vollständig, danach eine je Tag bis `BACKUP_TAGE` (Standard 30); das Aufräumen läuft auch, wenn eine Sicherung scheitert. Vor jeder Sicherung prüft der Dienst den freien Platz und warnt im Log (`docker compose logs backup`), wenn er knapp wird. Platzbedarf: etwa 50 Sicherungen, bei einer Großschau mit Belegen 2–4 GB. Die Dateien sind nur für den Besitzer lesbar; unter Linux gehören sie root, außer `BACKUP_UID`/`BACKUP_GID` sind gesetzt. Bitte zusätzlich außer Haus kopieren. `bun run docker:start` sichert vor jedem Update; eine Sicherung von Hand: `docker compose run --rm --no-deps backup einmal hand`.

**Verschlüsselung:** Jede Sicherung wird mit [age](https://age-encryption.org) für den öffentlichen Schlüssel in `BACKUP_EMPFAENGER` verschlüsselt (`schau-….dump.age`). Den Klartext gibt es nur kurz im Arbeitsspeicher des Sicherungsdienstes (tmpfs), zum Prüfen. Den privaten Schlüssel hat der Server nicht – er gehört in den Tresor (z. B. KeePass); ohne ihn lässt sich keine Sicherung zurückspielen. Ohne `BACKUP_EMPFAENGER` sichert der Dienst nicht (nur Testinstallationen: `BACKUP_UNVERSCHLUESSELT=1`). Zusätzlich verschlüsselt die Anwendung IBAN, Kontoinhaber, SEPA-Dateien und Zwei-Faktor-Geheimnisse in der Datenbank mit `DATENSCHLUESSEL` (AES-256-GCM, nicht in der Datenbank und nicht in Sicherungen) – auch dieser Schlüssel gehört in den Tresor, und er darf sich nicht ändern, solange Daten damit verschlüsselt sind. Beide Schlüssel erzeugen und eintragen: siehe `.env.example`. Updates nur über `bun run docker:start` bzw. `scripts/docker-start.sh` – es prüft vorher, ob beide Schlüssel eingetragen sind.

Zurückspielen – immer in eine leere Datenbank, damit kein gemischter Stand aus alter Sicherung und neuem Schema entsteht:

```bash
sh scripts/wiederherstellen.sh --schluessel /pfad/sicherung-schluessel.txt backups/schau-JJJJ-MM-TT-HHMM.dump.age
```

Den privaten Schlüssel dafür kurz aus dem Tresor als Datei im Arbeitsspeicher ablegen (Linux: `/dev/shm`) und danach löschen. Entschlüsselt wird im Sicherungs-Container; der Klartext fließt direkt in eine neue Datenbank, die erst nach erfolgreichem Einspielen die alte ersetzt. Die App startet nur, wenn `DATENSCHLUESSEL` zu den Daten passt.

Das Skript prüft zuerst, ob sich die Sicherung lesen lässt (sonst ändert es nichts), fragt nach, sichert den jetzigen Stand (`…-vor-wiederherstellung.dump.age`), hält App und Sicherung an, legt die Datenbank neu an, spielt die Sicherung in einer Transaktion ein (bei Fehlern bleibt nichts halb) und startet die App wieder. Sie bringt eine ältere Sicherung per Migration auf den aktuellen Stand. Danach unter „Protokoll“ die Unveränderbarkeit prüfen.

Ein Update zurücknehmen: `bun run docker:start` hebt das bisherige Programm als `gefluegelschau-app:vorher` auf und sichert vorher (`…-vor-update.dump.age`). `sh scripts/wiederherstellen.sh --schluessel … --vorherige-version backups/schau-…-vor-update.dump.age` spielt diese Sicherung zurück und startet wieder das alte Programm – ohne den Schalter würde die neue Version die alte Sicherung sofort wieder migrieren.

Zum Ausprobieren, ohne die echte Datenbank anzufassen: im db-Container `createdb -U schau probe`, dann die entschlüsselte Sicherung mit `pg_restore --no-owner -d probe` einspielen (entschlüsseln: `docker compose run --rm -T --no-deps -v /pfad/schluessel.txt:/k:ro --entrypoint age backup -d -i /k < backups/….dump.age`). Die Probe-Datenbank braucht für IBANs denselben `DATENSCHLUESSEL`.

**Kasse (Prüfhinweis):** Ob die Verkaufsstelle als elektronisches Aufzeichnungssystem mit Kassenfunktion gilt und eine TSE braucht (§ 146a AO), klärt der Verein vor dem Echtbetrieb mit seinem Steuerberater. Bis dahin das Kassenbuch zusätzlich ausdrucken und unterschreiben.

Protokoll, Zahlungen, Verkäufe, Auszahlungen, Belege und Kassenbuch sind per Datenbank-Trigger gegen Ändern und Löschen geschützt (`apps/server/src/db/schutz.sql`, eingespielt bei jeder Migration und bei `db:push`). Das Protokoll ist zusätzlich als Hash-Kette verknüpft; die Prüfung unter „Protokoll“ erkennt geänderte und gelöschte Einträge. Erlaubt bleiben nur das Anonymisieren nach den Speicherfristen oder auf Löschwunsch und das Entfernen eines ganzen Demo-Vereins – beides wird vermerkt (die Prüfung zeigt die Zahl), ein Leeren ohne Vermerk meldet sie als Fehler. Grenze des Schutzes: Wer als Eigentümer direkt auf die Datenbank zugreift, kann Trigger abschalten. Damit auch das Löschen des jüngsten Eintrags auffällt, prüft die Kontrolle den Kopf der Kette, und jeder Kassenbericht druckt den Stand (Nummer und Prüfwert) mit aus – ein späterer Vergleich mit dem Ausdruck zeigt, ob danach etwas verschwunden ist. Der „Prüfexport (JSON)“ enthält alle Felder, die in den Hash eingehen, unverändert; die CSV schützt Zellen, die mit = + - @ beginnen, mit einem vorangestellten „'“ und eignet sich deshalb nicht zum Nachrechnen. Nachrechnen ab Hash-Aufbau 3: Inhalts-Hash = SHA-256 über das JSON-Array `[Vorher, Nachher, Grund]`, Eintrags-Hash = SHA-256 über `[Vorgänger-Hash, Nr, Schau, Bereich, Datensatz, Aktion, Benutzer-ID, Preisrichter-ID, Wer, null, Zeitpunkt UTC, Inhalts-Hash]`, jeweils in der Textform von PostgreSQL-`jsonb` (Trenner „, “).

Nach Schemaänderungen: `cd apps/server && bun run db:generate` erzeugt die nächste Migration.
