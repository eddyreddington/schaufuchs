#!/bin/sh
# Startet bzw. aktualisiert die Installation. Läuft die Datenbank schon, wird vorher gesichert. Bringt der Neubau einen
# anderen Programmstand hervor (Version oder Migrationen), bleibt das bisherige Programm als gefluegelschau-app:vorher
# erhalten – ein Update mit neuer Migration lässt sich so vollständig zurücknehmen:
#   sh scripts/wiederherstellen.sh --schluessel DATEI --vorherige-version backups/schau-…-vor-update.dump.age
set -eu
cd "$(dirname "$0")/.."
# Unter Linux braucht Docker root-Rechte: mit sudo aufrufen. Die Gruppe „docker“ wäre gleichbedeutend mit root und ist
# deshalb nicht der empfohlene Weg.
if ! docker info > /dev/null 2>&1; then
  echo "Docker ist nicht erreichbar. Läuft Docker? Unter Linux bitte mit sudo aufrufen: sudo sh scripts/docker-start.sh" >&2
  exit 1
fi
# Ohne diese Schlüssel startet die App nicht bzw. wird nicht gesichert – lieber vor dem Update abbrechen.
wert() { sed -n "s/^$1=//p" .env 2>/dev/null | tail -n 1; }
if [ -z "$(wert DATENSCHLUESSEL)" ]; then
  echo "DATENSCHLUESSEL fehlt in der .env (siehe .env.example) – Update abgebrochen, nichts verändert." >&2
  exit 1
fi
if [ -z "$(wert BACKUP_EMPFAENGER)" ] && [ "$(wert BACKUP_UNVERSCHLUESSELT)" != "1" ]; then
  echo "BACKUP_EMPFAENGER fehlt in der .env (öffentlicher age-Schlüssel, siehe .env.example) – Update abgebrochen, nichts verändert." >&2
  exit 1
fi
# Nur Hinweise, kein Abbruch (Entscheidung 034).
if [ -n "$(find .env -perm -004 2>/dev/null)" ]; then
  echo "Hinweis: Die .env ist für alle Benutzer dieses Rechners lesbar (DATENSCHLUESSEL, Passwörter) – bitte: chmod 600 .env" >&2
fi
if [ -z "$(wert EINRICHTUNG_CODE | tr -d '"')" ]; then
  echo "Hinweis: EINRICHTUNG_CODE ist leer. Vor der Ersteinrichtung steht der Code für die Einrichtung im Browser nach dem Start im Log: docker compose logs app | grep Einrichtungscode" >&2
fi
# Platz: Jeder Neubau hinterlässt Build-Cache und ältere Programme ohne Namen. Ohne Aufräumen läuft die Platte voll,
# und dann bleibt die Datenbank stehen (sie kann nicht mehr schreiben). Deshalb vor dem Bau prüfen und nach dem Start
# aufräumen. Gemessen wird dort, wo Docker seine Daten ablegt (unter Linux /var/lib/docker; mit Docker Desktop oder
# OrbStack liegt das in deren eigener VM und wird hier nicht geprüft), und wo die Sicherungen liegen.
MIN_FREI_GB="${MIN_FREI_GB:-$(wert MIN_FREI_GB | tr -d '"')}"
MIN_FREI_GB="${MIN_FREI_GB:-5}"
case "$MIN_FREI_GB" in
  '' | *[!0-9]*) echo "MIN_FREI_GB muss eine ganze Zahl sein (GB), nicht: $MIN_FREI_GB – Update abgebrochen, nichts verändert." >&2; exit 1 ;;
esac
frei_gb() { [ -d "$1" ] && df -Pk "$1" | awk 'NR==2 { print int($4 / 1048576) }'; }
aufraeumen() {
  # Nur, was sich neu bauen lässt: Build-Cache (auch anderer Projekte auf demselben Rechner – deren nächster Bau dauert
  # dann nur länger) und Programme dieser Installation ohne Namen. latest, vorher, Datenbank und Sicherungen bleiben.
  docker builder prune -af > /dev/null && docker image prune -f --filter label=com.docker.compose.project=gefluegelschau > /dev/null
}
zu_knapp() {
  sicherungen="$PWD"
  [ ! -d backups ] || sicherungen="$PWD/backups"
  for ort in "$(docker info -f '{{.DockerRootDir}}' 2>/dev/null)" "$sicherungen"; do
    frei=$(frei_gb "$ort" || true)
    if [ -n "$frei" ] && [ "$frei" -lt "$MIN_FREI_GB" ]; then echo "$ort: nur $frei GB frei"; return 0; fi
  done
  return 1
}
if knapp=$(zu_knapp); then
  echo "$knapp – räume Build-Cache und Programme ohne Namen auf …"
  aufraeumen || echo "Aufräumen fehlgeschlagen." >&2
  if knapp=$(zu_knapp); then
    echo "$knapp, mindestens $MIN_FREI_GB GB nötig – Update abgebrochen, Installation unverändert. Platz schaffen (z. B. alte Sicherungen außer Haus kopieren und löschen)." >&2
    exit 1
  fi
fi
if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  docker compose run --rm --no-deps backup einmal vor-update
fi
# Programmstand eines Images: Version und Migrationen (leer, wenn nicht lesbar). Beides zählt: Commits mit neuer
# Migration laufen eine Zeit lang unter der alten Versionsnummer (erhöht wird erst am Ende eines Blocks).
stand_von() {
  docker run --rm --pull never --network none --entrypoint cat "$1" packages/domain/src/version.ts apps/server/drizzle/meta/_journal.json 2>/dev/null || true
}
version_in() { printf '%s\n' "$1" | sed -n 's/.*VERSION = "\([^"]*\)".*/\1/p'; }
# Das laufende Programm VOR dem Neubau unter einem eigenen Namen festhalten: danach ist es ohne Namen (und wird beim
# Aufräumen gelöscht).
bisher=""
if docker image inspect gefluegelschau-app:latest > /dev/null 2>&1; then
  docker tag gefluegelschau-app:latest gefluegelschau-app:bisher
  bisher=$(docker image inspect -f '{{.Id}}' gefluegelschau-app:bisher)
fi
docker compose build app backup
neu=$(docker image inspect -f '{{.Id}}' gefluegelschau-app:latest)
# vorher = der letzte ANDERE Programmstand. Nach dem Aufräumen baut derselbe Stand ohne Cache ein Image mit neuer ID;
# ein Vergleich nur der ID ersetzte vorher dann durch denselben Stand, und das Zurücknehmen liefe ins Leere.
if [ -n "$bisher" ] && [ "$bisher" != "$neu" ]; then
  s_bisher=$(stand_von gefluegelschau-app:bisher)
  s_neu=$(stand_von gefluegelschau-app:latest)
  if [ -z "$s_bisher" ] || [ -z "$s_neu" ] || [ "$s_bisher" != "$s_neu" ]; then
    docker tag gefluegelschau-app:bisher gefluegelschau-app:vorher
    v_bisher=$(version_in "$s_bisher")
    echo "Bisheriges Programm ${v_bisher:+($v_bisher) }aufgehoben als gefluegelschau-app:vorher."
  fi
fi
[ -z "$bisher" ] || docker image rm gefluegelschau-app:bisher > /dev/null
docker compose up -d
# Das Update ist da – ein gescheitertes Aufräumen ist nur eine Warnung.
aufraeumen || echo "Warnung: Aufräumen fehlgeschlagen (Update ist aktiv). Später: docker builder prune -af" >&2
