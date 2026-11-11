#!/usr/bin/env bash
# Writes tools/fixtures/creative-analysis-vectors.json with the classes of the Propwash 0.6.0 release jar
# (see the head of CreativeVectors.java). Compiles to a temp folder outside the repo, nothing is built with Gradle.
#
#   tools/creative-java/run.sh [<output json>]
#
# Overrides: JDK (default /opt/homebrew/opt/openjdk@25), PROPWASH_JAR, LOOM_MC (Fabric Loom cache of Minecraft 26.3),
# GRADLE_MODULES (Gradle module cache).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SITE="$(cd "$HERE/../.." && pwd)"
JDK="${JDK:-/opt/homebrew/opt/openjdk@25}"
PROPWASH_JAR="${PROPWASH_JAR:-$HOME/Documents/propwash/release/0.6.0/propwash-fpv/propwash-fabric-26.3-0.6.0.jar}"
LOOM_MC="${LOOM_MC:-$HOME/.gradle/caches/fabric-loom/26.3}"
GRADLE_MODULES="${GRADLE_MODULES:-$HOME/.gradle/caches/modules-2/files-2.1}"
OUT="${1:-$SITE/tools/fixtures/creative-analysis-vectors.json}"

for file in "$JDK/bin/javac" "$PROPWASH_JAR" "$LOOM_MC/mojang_minecraft_info.json"; do
  [ -e "$file" ] || { echo "missing: $file" >&2; exit 1; }
done
MC_JAR="$LOOM_MC/minecraft-merged.jar"
[ -f "$MC_JAR" ] || MC_JAR="$LOOM_MC/minecraft-common.jar"
[ -f "$MC_JAR" ] || { echo "missing: Minecraft 26.3 jar in $LOOM_MC" >&2; exit 1; }

# Libraries of Minecraft 26.3 (group:artifact:version without natives) from the Gradle cache.
CP="$PROPWASH_JAR:$MC_JAR"
MISSING=0
while read -r coord; do
  IFS=: read -r group artifact version <<<"$coord"
  jar="$(ls "$GRADLE_MODULES/$group/$artifact/$version"/*/"$artifact-$version.jar" 2>/dev/null | head -n 1 || true)"
  if [ -z "$jar" ]; then
    echo "library not in the Gradle cache: $coord" >&2
    MISSING=1
    continue
  fi
  CP="$CP:$jar"
done < <(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$LOOM_MC/mojang_minecraft_info.json" \
  | sed 's/.*"\([^"]*\)"$/\1/' | awk -F: 'NF == 3 && !seen[$0]++')
[ "$MISSING" = 0 ] || exit 1

TMP="$(mktemp -d /tmp/creative-java.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
"$JDK/bin/javac" -nowarn -encoding UTF-8 -cp "$CP" -d "$TMP" "$HERE/CreativeVectors.java"
"$JDK/bin/java" -cp "$TMP:$CP" CreativeVectors "$PROPWASH_JAR" "$OUT"
