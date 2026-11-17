#!/bin/sh
# Sichert die Datenbank regelmäßig (pg_dump im Custom-Format) und prüft jede Sicherung. Läuft im Dienst „backup“
# (docker-compose.yml). Aufruf mit „einmal [Zusatz]“: genau eine Sicherung, z. B. vor einem Update
# (scripts/docker-start.sh) oder vor dem Zurückspielen (scripts/wiederherstellen.sh).
#
# Aufbewahrung (unabhängig davon, ob die letzte Sicherung geklappt hat):
#   - die letzten 48 Stunden: jede Sicherung (alle BACKUP_INTERVALL_MINUTEN, Standard 120),
#   - danach bis BACKUP_TAGE (Standard 30): eine je Tag,
#   - Sicherungen vor Updates bzw. Wiederherstellungen: BACKUP_TAGE Tage.
# Hat sich seit der letzten Sicherung nichts geändert (außerhalb der Schautage meist), wird nur einmal am Tag gesichert.
# Vor jeder Sicherung wird der freie Platz geprüft. Die Dateien liegen auf dem Host unter ./backups – bitte zusätzlich
# außer Haus kopieren.
#
# Verschlüsselung: Jede Sicherung wird mit age für die öffentlichen Schlüssel in BACKUP_EMPFAENGER verschlüsselt
# (mehrere mit Komma getrennt) und als schau-….dump.age gespeichert. Zum Prüfen entsteht der Klartext kurz in /arbeit –
# einem Speicherbereich im Arbeitsspeicher (tmpfs, docker-compose.yml), nie auf der Platte. Zurückspielen geht nur mit
# dem privaten Schlüssel (scripts/wiederherstellen.sh --schluessel). Ohne BACKUP_EMPFAENGER wird nicht gesichert;
# nur für Testinstallationen ohne echte Daten: BACKUP_UNVERSCHLUESSELT=1.
set -eu
umask 077
mkdir -p /backups
TAGE="${BACKUP_TAGE:-30}"
EMPFAENGER=$(printf '%s' "${BACKUP_EMPFAENGER:-}" | tr ',' ' ')
ARBEIT=/arbeit
if [ -n "$EMPFAENGER" ]; then
  ENDUNG=".dump.age"
  for e in $EMPFAENGER; do
    case "$e" in age1*) ;; *) echo "BACKUP_EMPFAENGER: „$e“ ist kein öffentlicher age-Schlüssel (beginnt mit age1)." >&2; exit 1 ;; esac
  done
elif [ "${BACKUP_UNVERSCHLUESSELT:-0}" = "1" ]; then
  ENDUNG=".dump"
  echo "WARNUNG: Sicherungen werden NICHT verschlüsselt (BACKUP_UNVERSCHLUESSELT=1) – nur für Testinstallationen." >&2
else
  echo "BACKUP_EMPFAENGER fehlt in der .env: Sicherungen werden nur verschlüsselt geschrieben (öffentlicher age-Schlüssel, siehe .env.example)." >&2
  exit 1
fi
if ! grep -q " $ARBEIT tmpfs " /proc/mounts 2>/dev/null; then
  # Ohne tmpfs (z. B. alte docker-compose.yml) läge der Klartext kurz auf der Platte – dann lieber nicht sichern.
  [ "$ENDUNG" = ".dump" ] || { echo "$ARBEIT ist kein Arbeitsspeicher-Bereich (tmpfs) – Sicherung abgebrochen, bitte docker-compose.yml aktualisieren." >&2; exit 1; }
  mkdir -p "$ARBEIT"
fi

# Alle Sicherungsdateien (verschlüsselt und – aus der Zeit davor oder auf Testinstallationen – unverschlüsselt).
sicherungen() {
  find /backups -maxdepth 1 \( -name 'schau-*.dump' -o -name 'schau-*.dump.age' \) "$@"
}

# Unter Linux gehören die Dateien sonst root; mit BACKUP_UID/BACKUP_GID (z. B. die eigene Kennung, `id -u`) bekommt
# sie der Benutzer, der sie auch kopieren und zurückspielen soll.
besitzer() {
  if [ -n "${BACKUP_UID:-}" ]; then chown "${BACKUP_UID}:${BACKUP_GID:-$BACKUP_UID}" "$1" 2>/dev/null || true; fi
}

aufraeumen() {
  # Nur liegengebliebene Reste: eine gerade laufende Einzelsicherung (vor Update/Wiederherstellung) bleibt unberührt.
  find /backups -name '*.tmp' -mmin +120 -delete
  sicherungen -mtime +"$TAGE" -delete
  # Älter als zwei Tage: je Tag nur die erste regelmäßige Sicherung behalten (Name schau-JJJJ-MM-TT-HHMM.dump[.age]).
  sicherungen ! -name '*-vor-*' -mtime +1 | sort | awk -F/ '{ tag = substr($NF, 7, 10); if (tag == vorher) print; vorher = tag }' | xargs -r rm -f
}

# Freier Platz: mindestens das Doppelte der letzten Sicherung, sonst laut warnen (die Sicherung wird trotzdem versucht).
platz_pruefen() {
  letzte=$(sicherungen -exec ls -t {} + 2>/dev/null | head -n 1 || true)
  [ -n "$letzte" ] || return 0
  groesse=$(du -k "$letzte" | cut -f1)
  frei=$(df -Pk /backups | awk 'NR == 2 { print $4 }')
  if [ "$frei" -lt $((groesse * 2)) ]; then
    echo "WARNUNG: Nur noch ${frei} KB frei für Sicherungen (letzte: ${groesse} KB). Bitte Platz schaffen oder BACKUP_TAGE senken." >&2
  fi
}

# Änderungsstand der Datenbank (Summe aller Schreibvorgänge, ohne Sitzungen und ohne die eigene Meldung in „sicherung“)
# – gleich = nichts Neues.
stand() {
  psql -h db -U schau -d schau -tAc "select coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0) from pg_stat_user_tables where relname not in ('sitzung', 'sicherung')" 2>/dev/null || echo "?"
}

# Zeitpunkt der Sicherung für die Gesundheitsprüfung (/api/gesund, Entscheidung 024). Die App sieht ./backups nicht,
# darum steht er in der Datenbank. Vor einem Update kann die Tabelle noch fehlen – dann nur ein Hinweis, die Sicherung
# selbst ist gelungen.
melden() {
  psql -h db -U schau -d schau -qtAc "insert into sicherung (id, am) values (1, now()) on conflict (id) do update set am = excluded.am" > /dev/null 2>&1 \
    || echo "Hinweis: Zeitpunkt der Sicherung nicht an /api/gesund gemeldet (vor dem Update auf 1.10.0 normal)." >&2
}

# Klartext (im Arbeitsspeicher) verschlüsselt nach $2 schreiben – oder auf Testinstallationen kopieren.
verpacken() {
  if [ "$ENDUNG" = ".dump.age" ]; then
    # shellcheck disable=SC2046 # Schlüssel enthalten keine Leerzeichen (geprüft oben)
    age $(for e in $EMPFAENGER; do printf -- '-r %s ' "$e"; done) -o "$2" "$1"
  else
    cp "$1" "$2"
  fi
}

sichern() {
  platz_pruefen
  datei="/backups/schau-$(date +%Y-%m-%d-%H%M)${1:-}${ENDUNG}"
  klar="$ARBEIT/sicherung-$$.dump"
  if pg_dump -h db -U schau -Fc schau > "$klar" && pg_restore -f /dev/null "$klar" && verpacken "$klar" "$datei.tmp"; then
    rm -f "$klar"
    mv "$datei.tmp" "$datei"
    besitzer "$datei"
    echo "Sicherung: $datei ($(du -h "$datei" | cut -f1))"
    melden
  else
    rm -f "$klar" "$datei.tmp"
    echo "Sicherung fehlgeschlagen" >&2
    return 1
  fi
}

if [ "${1:-}" = "einmal" ]; then
  sichern "-${2:-vor-update}"
  exit 0
fi

# Beim gemeinsamen Start erst die Migrationen und Schutz-Trigger der App abwarten.
sleep 120
letzter_stand=""
letzte_zeit=0
while true; do
  jetzt=$(date +%s)
  neu=$(stand)
  if [ "$neu" != "?" ] && [ "$neu" = "$letzter_stand" ] && [ $((jetzt - letzte_zeit)) -lt 86400 ]; then
    : # nichts geändert, letzte Sicherung jünger als ein Tag
  elif sichern; then
    letzter_stand="$neu"
    letzte_zeit="$jetzt"
  else
    # Fehlgeschlagen (z. B. Datenträger voll): aufräumen und in 5 Minuten erneut versuchen.
    aufraeumen
    sleep 300
    continue
  fi
  aufraeumen
  # Lebenszeichen für die Überwachung: auch in ruhigen Zeiten (ohne neue Sicherung) läuft die Schleife.
  date +%s > /backups/.lebenszeichen
  sleep $(( ${BACKUP_INTERVALL_MINUTEN:-120} * 60 ))
done
