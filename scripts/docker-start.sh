#!/bin/sh
# Startet bzw. aktualisiert die Installation. Läuft die Datenbank schon, wird vorher gesichert. Bringt der Neubau ein
# anderes Programm hervor, bleibt das bisherige als gefluegelschau-app:vorher erhalten – ein Update mit neuer Migration
# lässt sich so vollständig zurücknehmen:
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
if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  docker compose run --rm --no-deps backup einmal vor-update
fi
# Das laufende Programm VOR dem Neubau unter einem eigenen Namen festhalten: danach ist es ohne Namen (und je nach
# Docker-Umgebung sofort gelöscht).
bisher=""
if docker image inspect gefluegelschau-app:latest > /dev/null 2>&1; then
  docker tag gefluegelschau-app:latest gefluegelschau-app:bisher
  bisher=$(docker image inspect -f '{{.Id}}' gefluegelschau-app:bisher)
fi
docker compose build app backup
neu=$(docker image inspect -f '{{.Id}}' gefluegelschau-app:latest)
if [ -n "$bisher" ] && [ "$bisher" != "$neu" ]; then
  docker tag gefluegelschau-app:bisher gefluegelschau-app:vorher
  echo "Bisheriges Programm aufgehoben als gefluegelschau-app:vorher."
fi
[ -z "$bisher" ] || docker image rm gefluegelschau-app:bisher > /dev/null
docker compose up -d
