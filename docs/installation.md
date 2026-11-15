# SchauFUCHS installieren – Anleitung für Vereine

Diese Anleitung führt Schritt für Schritt zu einer eigenen SchauFUCHS-Installation. Sie brauchen keine IT-Kenntnisse,
nur etwa eine Stunde Zeit und einen Computer mit Internet.

## Wo SchauFUCHS laufen kann

| Weg | Gut für | Was Sie brauchen |
|---|---|---|
| **A. Gemieteter Server** (empfohlen) | Den ganzen Schaubetrieb: Online-Meldung, Helfer und Preisrichter von überall, Tablets auch ohne Netz in der Halle | Einen kleinen Cloud-Server (rund 5 € im Monat) und eine Adresse wie `schau.mein-verein.de` |
| **B. Eigener Rechner im Verein** | Wie A, wenn der Verein schon einen Rechner hat, der durchläuft (Mini-PC, alter PC, Raspberry Pi 4/5) | Debian 12 oder Ubuntu 24.04 (64 Bit) auf dem Rechner, eine Adresse und einen Internetanschluss, bei dem sich Ports freigeben lassen |
| **C. Laptop (Mac oder Windows)** | Ausprobieren, Schulung, Einzelplatz ohne Internet | Docker Desktop (Mac auch OrbStack); unter Windows zusätzlich WSL2 mit Ubuntu |

Für A und B gilt die Anleitung ab „Was Sie brauchen“. Für C springen Sie zu „Auf dem Laptop (Mac oder Windows)“.

**Was auf dem Laptop nicht geht:** Läuft SchauFUCHS nur auf einem Laptop, ist es nur erreichbar, solange er an ist und
im selben Netz steht. Aussteller können sich nicht online melden. Andere Geräte im Vereinsnetz (z. B. die Tablets der
Preisrichter) zeigen eine Zertifikatswarnung, weil es ohne Internet-Adresse kein öffentliches Zertifikat gibt – dann
funktioniert die Bewertung ohne Netz (App auf dem Startbildschirm) nicht. Für eine Schau mit Tablets nehmen Sie A oder B.

## Was Sie brauchen

| | Wofür | Beispiel |
|---|---|---|
| **Server** | Hier läuft SchauFUCHS, rund um die Uhr erreichbar | A: gemieteter „Cloud-Server“ / „VPS“; B: eigener Rechner, der durchläuft. Jeweils Debian 12 oder Ubuntu 24.04 (Intel/AMD oder ARM, 64 Bit), 2 CPU-Kerne, 4 GB Arbeitsspeicher, 40 GB Speicher; gemietet mit Standort Deutschland bzw. EU |
| **Adresse** | Unter ihr erreichen Helfer, Preisrichter und Aussteller SchauFUCHS | `schau.mein-verein.de` (Subdomain der Vereinsdomain) |
| **E-Mail-Adresse** | Für das HTTPS-Zertifikat (Let's Encrypt schreibt nur bei Problemen) | `technik@mein-verein.de` |
| **Optional: Mailpostfach** | Damit SchauFUCHS Bestätigungen an Aussteller verschickt | Zugangsdaten (SMTP) eines Postfachs des Vereins |

**Datenschutz:** Mit dem Anbieter eines gemieteten Servers schließen Sie einen Vertrag zur Auftragsverarbeitung (AVV)
ab – bei den üblichen Anbietern geht das im Kundenbereich mit wenigen Klicks. Wählen Sie einen Standort in Deutschland
oder der EU. Beim eigenen Rechner (B) liegen die Daten im Verein: Der Rechner gehört dann an einen sicheren Ort, und die
Sicherungen gehören zusätzlich auf einen zweiten Datenträger außer Haus.

## Schritt 1 – Server bereitstellen

**A. Gemietet:**

1. Beim Anbieter Ihrer Wahl einen Server mit **Debian 12** oder **Ubuntu 24.04** bestellen (Größe siehe oben).
2. Notieren Sie die **IP-Adresse** des Servers (z. B. `203.0.113.10`) und das **root-Passwort** bzw. legen Sie einen
   SSH-Schlüssel an, wie es der Anbieter beschreibt.

**B. Eigener Rechner:**

1. Auf dem Rechner **Debian 12** oder **Ubuntu Server 24.04** installieren (beim Raspberry Pi: „Raspberry Pi OS Lite
   (64-bit)“ oder Ubuntu Server für Raspberry Pi). Bei der Installation den **SSH-Server** mit auswählen.
2. Dem Rechner im Router eine **feste Adresse im Vereinsnetz** geben (z. B. `192.168.178.20`).
3. Im Router die **Ports 80 und 443** an diesen Rechner weiterleiten („Portfreigabe“).
4. Hat der Anschluss keine feste öffentliche IP-Adresse, im Router einen **DynDNS-Dienst** einrichten (viele Router
   bringen einen mit, z. B. „MyFRITZ!“). Er liefert eine Adresse, die immer auf den Anschluss zeigt.
5. Der Rechner muss durchlaufen (Energiesparmodus aus). Ein Stromausfall unterbricht SchauFUCHS, bis er wieder läuft.

## Schritt 2 – Adresse auf den Server zeigen lassen

Beim Anbieter Ihrer Domain (dort, wo `mein-verein.de` verwaltet wird) einen **DNS-Eintrag** anlegen:

| Typ | Name | Wert |
|---|---|---|
| A | `schau` | A: die IP-Adresse des Servers; B mit fester IP: die öffentliche IP-Adresse des Anschlusses |
| CNAME | `schau` | B mit DynDNS (statt des A-Eintrags): die DynDNS-Adresse, z. B. `abc123.myfritz.net` |

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

## Auf dem Laptop (Mac oder Windows)

SchauFUCHS läuft auch auf einem Laptop – zum Ausprobieren, für Schulungen oder als Einzelplatz. Es ist dann unter
`https://localhost` erreichbar. Was dabei nicht geht, steht oben unter „Wo SchauFUCHS laufen kann“.

**Mac** (ab SchauFUCHS 1.2.1; geprüft mit OrbStack auf einem Mac mit Apple-Chip, mit Docker Desktop nicht geprüft):

1. **Docker Desktop** (docker.com) oder **OrbStack** (orbstack.dev) installieren und starten.
2. Programm „Terminal“ öffnen und eingeben – ohne `sudo`:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/eddyreddington/schaufuchs/main/deploy/install.sh | sh
   ```

3. Als Adresse `localhost` eingeben, dazu eine E-Mail-Adresse. SchauFUCHS liegt danach im Ordner `SchauFUCHS` in Ihrem
   Benutzerordner, das Notfallblatt in `~/SchauFUCHS/notfallblatt.txt`. Die Befehle rufen Sie als
   `~/SchauFUCHS/schaufuchs …` auf (z. B. `~/SchauFUCHS/schaufuchs status`).

**Windows** (nicht geprüft – Rückmeldungen bitte über „Issues“ auf GitHub):

1. **WSL2 mit Ubuntu** einrichten: PowerShell als Administrator öffnen, `wsl --install` eingeben, neu starten und in
   Ubuntu einen Benutzer anlegen.
2. **Docker Desktop** installieren und unter „Settings → Resources → WSL Integration“ für Ubuntu einschalten.
3. Ubuntu öffnen (Startmenü) und dort den Installer wie auf einem Server aufrufen – mit `sudo`:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/eddyreddington/schaufuchs/main/deploy/install.sh | sudo sh
   ```

4. Als Adresse `localhost` eingeben. SchauFUCHS ist dann im Windows-Browser unter `https://localhost` erreichbar.

Beim ersten Öffnen warnt der Browser vor dem selbst ausgestellten Zertifikat; für `localhost` ist das unbedenklich.
Docker Desktop muss laufen, damit SchauFUCHS erreichbar ist.

## Hilfe

Fragen und Fehler: im Projekt auf GitHub unter „Issues“. Sicherheitslücken bitte nicht öffentlich melden, sondern wie in
[SECURITY.md](../SECURITY.md) beschrieben.
