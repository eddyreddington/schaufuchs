# SchauFUCHS installieren – Anleitung für Vereine

Diese Anleitung führt Schritt für Schritt zu einer eigenen SchauFUCHS-Installation. Sie brauchen keine IT-Kenntnisse,
nur etwa eine Stunde Zeit, einen Computer mit Internet und die Zugangsdaten zur Domain Ihres Vereins (oder Sie mieten
eine neue). Laufende Kosten: rund 5 € im Monat für den Server.

## Was Sie brauchen

| | Wofür | Beispiel |
|---|---|---|
| **Server** | Hier läuft SchauFUCHS, rund um die Uhr erreichbar | gemieteter „Cloud-Server“ / „VPS“ mit Debian 12 oder Ubuntu 24.04 (Intel/AMD oder ARM, 64 Bit), 2 CPU-Kerne, 4 GB Arbeitsspeicher, 40 GB Speicher, Standort Deutschland bzw. EU. Windows- und macOS-Rechner eignen sich nicht als Server. |
| **Adresse** | Unter ihr erreichen Helfer, Preisrichter und Aussteller SchauFUCHS | `schau.mein-verein.de` (Subdomain der Vereinsdomain) |
| **E-Mail-Adresse** | Für das HTTPS-Zertifikat (Let's Encrypt schreibt nur bei Problemen) | `technik@mein-verein.de` |
| **Optional: Mailpostfach** | Damit SchauFUCHS Bestätigungen an Aussteller verschickt | Zugangsdaten (SMTP) eines Postfachs des Vereins |

**Datenschutz:** Mit dem Anbieter des Servers schließen Sie einen Vertrag zur Auftragsverarbeitung (AVV) ab – bei den
üblichen Anbietern geht das im Kundenbereich mit wenigen Klicks. Wählen Sie einen Standort in Deutschland oder der EU.

## Schritt 1 – Server mieten

1. Beim Anbieter Ihrer Wahl einen Server mit **Debian 12** oder **Ubuntu 24.04** bestellen (Größe siehe oben).
2. Notieren Sie die **IP-Adresse** des Servers (z. B. `203.0.113.10`) und das **root-Passwort** bzw. legen Sie einen
   SSH-Schlüssel an, wie es der Anbieter beschreibt.

## Schritt 2 – Adresse auf den Server zeigen lassen

Beim Anbieter Ihrer Domain (dort, wo `mein-verein.de` verwaltet wird) einen **DNS-Eintrag** anlegen:

| Typ | Name | Wert |
|---|---|---|
| A | `schau` | die IP-Adresse des Servers |

Es kann bis zu einer Stunde dauern, bis der Eintrag überall bekannt ist.

## Schritt 3 – Auf dem Server anmelden

- **Windows:** Programm „PowerShell“ öffnen. **Mac:** Programm „Terminal“ öffnen.
- Eingeben (IP-Adresse ersetzen) und das root-Passwort eingeben, wenn danach gefragt wird:

  ```bash
  ssh root@203.0.113.10
  ```

  Beim ersten Mal fragt der Computer, ob er dem Server vertrauen soll: mit `yes` bestätigen.

## Schritt 4 – SchauFUCHS installieren

Diesen einen Befehl eingeben (kopieren und einfügen):

```bash
curl -fsSL https://raw.githubusercontent.com/eddyreddington/schaufuchs/main/deploy/install.sh | sh
```

Der Installer fragt nach

1. der **Adresse** (z. B. `schau.mein-verein.de`) und
2. der **E-Mail-Adresse** für das Zertifikat,

(Sind Sie nicht als `root`, sondern als normaler Benutzer angemeldet, z. B. `ubuntu`: am Ende `| sudo sh` statt `| sh`
schreiben und vor jeden `schaufuchs`-Befehl `sudo` setzen.)

Er installiert bei Bedarf Docker (Frage mit `ja` beantworten), erzeugt alle Schlüssel und startet SchauFUCHS. Nach einigen
Minuten zeigt er:

- die Adresse zum Öffnen und den **Einrichtungscode**,
- den Hinweis auf das **Notfallblatt**.

## Schritt 5 – Notfallblatt sichern (wichtig!)

Auf dem Server liegt jetzt `/root/schaufuchs-notfallblatt.txt` mit zwei Schlüsseln. Ohne sie lässt sich nach einem
Ausfall keine Sicherung zurückspielen.

```bash
cat /root/schaufuchs-notfallblatt.txt
```

Den angezeigten Text in den Passwortmanager des Vereins kopieren **oder** ausdrucken und zu den Vereinsunterlagen legen.
Danach die Datei auf dem Server löschen:

```bash
rm /root/schaufuchs-notfallblatt.txt
```

## Schritt 6 – Verein einrichten

1. Im Browser die Adresse öffnen, z. B. `https://schau.mein-verein.de`.
2. Name des Vereins, Ihren Namen, E-Mail-Adresse, ein Passwort und den **Einrichtungscode** eingeben.
3. SchauFUCHS führt Sie zur **Zwei-Faktor-Anmeldung** (App auf dem Telefon, z. B. eine Authenticator-App). Die
   Notfallcodes ausdrucken.
4. Unter „Verein und Datenschutz“ Impressum und Datenschutzhinweise ausfüllen, unter „Benutzer“ weitere
   Ausstellungsleiter und Helfer einladen. Alles Weitere erklärt das Handbuch unter „Hilfe“.

**Rassen und Farbenschläge:** SchauFUCHS bringt nur eine kleine Beispielliste mit. Die Liste für Ihre Schau spielen Sie
unter „Rassen und Farbenschläge“ als CSV-Datei ein (Aufbau im Handbuch).

## Schritt 7 – Mailversand einrichten (optional)

```bash
schaufuchs einstellungen
```

In der Zeile `SMTP_URL=` die Zugangsdaten des Postfachs eintragen, z. B.
`SMTP_URL=smtps://schau%40mein-verein.de:PASSWORT@mail.anbieter.de:465` (das `@` im Benutzernamen als `%40`),
und bei `MAIL_FROM=` den Absender. Speichern (bei nano: Strg+O, Enter, Strg+X) – SchauFUCHS startet neu.

## Im laufenden Betrieb

| Was | Befehl (nach `ssh root@…`) |
|---|---|
| Läuft alles? | `schaufuchs status` |
| Neue Version einspielen | `schaufuchs update` – sichert vorher automatisch |
| Update ging schief | `schaufuchs zuruecknehmen` |
| Sicherung zurückspielen | `schaufuchs sicherungen`, dann `schaufuchs wiederherstellen DATEI` |
| Hilfe | `schaufuchs hilfe` |

Sicherungen entstehen automatisch alle zwei Stunden (wenn sich etwas geändert hat) und werden 30 Tage aufgehoben. Bitte
den Ordner `/opt/schaufuchs/backups` zusätzlich ab und zu auf einen anderen Rechner kopieren – die Dateien sind
verschlüsselt. Mehr dazu und zu Notfällen: [betrieb.md](betrieb.md).

## Einstellungen

Alle Einstellungen stehen in `/opt/schaufuchs/.env`. `schaufuchs einstellungen` öffnet die Datei und startet SchauFUCHS
nach dem Speichern neu.

| Einstellung | Bedeutung |
|---|---|
| `SCHAUFUCHS_DOMAIN`, `PUBLIC_URL` | Adresse von SchauFUCHS. Bei einem Wechsel zuerst den DNS-Eintrag anlegen, dann beide Zeilen ändern. |
| `ACME_EMAIL` | E-Mail für das HTTPS-Zertifikat |
| `SMTP_URL`, `MAIL_FROM` | Mailversand (Schritt 7); leer: Mails bleiben im Postausgang (Verein und Datenschutz) |
| `BACKUP_INTERVALL_MINUTEN`, `BACKUP_TAGE` | Abstand der Sicherungen (Vorgabe 120 Minuten) und Aufbewahrung (Vorgabe 30 Tage) |
| `APP_NAME` | Name in der Oberfläche |
| `APP_SPEICHER` | Arbeitsspeicher-Grenze der Anwendung (Vorgabe `2g`) |
| `ZWEI_FAKTOR_PFLICHT` | Nur im Notfall `0` (siehe [betrieb.md](betrieb.md)) – sonst nicht eintragen |
| `DATENSCHLUESSEL`, `POSTGRES_PASSWORD`, `BACKUP_EMPFAENGER`, `EINRICHTUNG_CODE` | Vom Installer erzeugt – nicht ändern. Sicherungs- und Datenschlüssel stehen auf dem Notfallblatt (Schritt 5). |

## Ohne eigenen Server ausprobieren

Auf einem Linux-Rechner mit Docker als Adresse `localhost` angeben – SchauFUCHS läuft dann unter `https://localhost`
(der Browser warnt einmal vor dem selbst ausgestellten Zertifikat).

## Hilfe

Fragen und Fehler: im Projekt auf GitHub unter „Issues“. Sicherheitslücken bitte nicht öffentlich melden, sondern wie in
[SECURITY.md](../SECURITY.md) beschrieben.
