#!/usr/bin/env bash
# Lokale Entwicklungsdatenbank mit dem installierten PostgreSQL 16.
# Daten liegen in .data/pg (nicht im Git). Port 5442, damit nichts kollidiert.
set -euo pipefail
export LC_ALL=C

PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.data/pg"
PORT="${PGPORT:-5442}"

case "${1:-start}" in
  start)
    if [ ! -d "$DATA" ]; then
      mkdir -p "$DATA"
      "$PG_BIN/initdb" -D "$DATA" -U schau --auth=trust -E UTF8 --locale=C >/dev/null
    fi
    if ! "$PG_BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
      "$PG_BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k '$DATA'" -l "$ROOT/.data/pg.log" start >/dev/null
      sleep 1
    fi
    "$PG_BIN/psql" -h localhost -p "$PORT" -U schau -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='schau'" | grep -q 1 \
      || "$PG_BIN/createdb" -h localhost -p "$PORT" -U schau schau
    "$PG_BIN/psql" -h localhost -p "$PORT" -U schau -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='schau_test'" | grep -q 1 \
      || "$PG_BIN/createdb" -h localhost -p "$PORT" -U schau schau_test
    echo "PostgreSQL läuft auf Port $PORT (DB: schau, schau_test)"
    ;;
  stop)
    "$PG_BIN/pg_ctl" -D "$DATA" stop >/dev/null && echo "PostgreSQL gestoppt"
    ;;
  *)
    echo "Aufruf: $0 start|stop" >&2
    exit 1
    ;;
esac
