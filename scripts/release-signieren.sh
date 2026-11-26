#!/bin/sh
# Release veröffentlichen (nur Maintainer, Entscheidung 037 Nachtrag): Der Workflow „Veröffentlichen“ legt das Release
# als Entwurf mit SHA256SUMS an. Dieses Skript baut die erwarteten Prüfsummen selbst aus dem Tag und der Registry nach,
# vergleicht sie Byte für Byte mit dem Entwurf, signiert sie mit dem Release-Schlüssel – der nie auf GitHub liegt – und
# veröffentlicht erst dann. `schaufuchs update` und install.sh nehmen ab 1.22.1 nur so signierte Releases an.
#
#   sh scripts/release-signieren.sh v1.22.1 /pfad/zum/privaten/schluessel      (aus dem Wurzelverzeichnis des Repos)
set -eu
fehler() { printf '\033[31mFehler:\033[0m %s\n' "$*" >&2; exit 1; }
tag="${1:-}"
schluessel="${2:-}"
[ -n "$tag" ] && [ -f "$schluessel" ] || fehler "Aufruf: sh scripts/release-signieren.sh v1.2.3 /pfad/zum/privaten/schluessel"
cd "$(git rev-parse --show-toplevel)"
command -v gh > /dev/null 2>&1 || fehler "gh (GitHub CLI) fehlt."
version="${tag#v}"
d=$(mktemp -d)
trap 'rm -rf "$d"' EXIT

# Der Tag muss überall derselbe sein: lokal, im eigenen Gitea (origin) und auf GitHub – und auf main von Gitea liegen.
# So signiert niemand einen Stand, den ein übernommenes GitHub-Konto untergeschoben hat.
lokal=$(git rev-parse "$tag^{commit}")
git fetch -q origin main
for remote in origin github; do
  ref=$(git ls-remote "$remote" "refs/tags/$tag^{}" | cut -f1)
  [ -n "$ref" ] || ref=$(git ls-remote "$remote" "refs/tags/$tag" | cut -f1)
  [ "$ref" = "$lokal" ] || fehler "Tag $tag zeigt auf $remote auf einen anderen Stand ($ref statt $lokal) – nicht signiert."
done
git merge-base --is-ancestor "$tag" origin/main || fehler "$tag liegt nicht auf main von origin – nicht signiert."

[ "$(gh release view "$tag" --json isDraft -q .isDraft)" = "true" ] || fehler "$tag ist kein Entwurf (schon veröffentlicht?) – nichts getan."
gh release download "$tag" -p SHA256SUMS -D "$d"

# Erwartete Prüfsummen nachbauen: Dateien aus dem Tag, Programme aus der Registry, Version – in der Form des Workflows.
konto=$(gh repo view --json owner -q .owner.login | tr 'A-Z' 'a-z')
: > "$d/erwartet"
for datei in deploy/docker-compose.yml deploy/Caddyfile deploy/schaufuchs scripts/wiederherstellen.sh; do
  printf '%s  %s\n' "$(git show "$tag:$datei" | shasum -a 256 | cut -d' ' -f1)" "$datei" >> "$d/erwartet"
done
for name in schaufuchs schaufuchs-backup; do
  digest=$(docker buildx imagetools inspect "ghcr.io/$konto/$name:$version" --format '{{json .Manifest.Digest}}' 2> /dev/null | tr -d '"')
  printf '%s\n' "$digest" | grep -Eqx 'sha256:[0-9a-f]{64}' || fehler "Digest von $name nicht aus der Registry lesbar – nicht signiert."
  printf '%s  image/%s\n' "$digest" "$name" >> "$d/erwartet"
done
printf '%s  release\n' "$tag" >> "$d/erwartet"
cmp -s "$d/erwartet" "$d/SHA256SUMS" || { diff "$d/erwartet" "$d/SHA256SUMS" >&2 || true; fehler "SHA256SUMS im Entwurf weicht ab – nicht signiert."; }

# Signieren ohne SSH-Agent (ein Agent im Passwortmanager würde auf eine Bestätigung warten), dann gegen den öffentlichen
# Schlüssel prüfen, den der Tag in deploy/schaufuchs und install.sh mitbringt.
SSH_AUTH_SOCK="" ssh-keygen -Y sign -f "$schluessel" -n schaufuchs-release "$d/SHA256SUMS" < /dev/null
oeffentlich=$(git show "$tag:deploy/schaufuchs" | sed -n 's/^RELEASE_SCHLUESSEL="\(.*\)"$/\1/p')
[ -n "$oeffentlich" ] && [ "$oeffentlich" = "$(git show "$tag:deploy/install.sh" | sed -n 's/^RELEASE_SCHLUESSEL="\(.*\)"$/\1/p')" ] \
  || fehler "Öffentlicher Schlüssel fehlt oder unterscheidet sich zwischen schaufuchs und install.sh – nichts veröffentlicht."
printf 'schaufuchs-release %s\n' "$oeffentlich" > "$d/erlaubt"
ssh-keygen -Y verify -f "$d/erlaubt" -I schaufuchs-release -n schaufuchs-release -s "$d/SHA256SUMS.sig" < "$d/SHA256SUMS" > /dev/null \
  || fehler "Signatur passt nicht zum Schlüssel im Tag – falscher privater Schlüssel? Nichts veröffentlicht."

gh release upload "$tag" "$d/SHA256SUMS.sig"
gh release edit "$tag" --draft=false --latest
echo "$tag signiert und veröffentlicht."
