#!/usr/bin/env bash
# Distribuye una versión de release a los dos canales de prueba:
#   1. Firebase App Distribution (APK, grupo "amigos"): el tester recibe aviso y toca instalar.
#   2. Google Play, pista de pruebas internas (.aab, `scripts/play-upload.py`): les llega como
#      actualización de Play Store, sin liga nueva. Requiere ~/.kura/play-publisher.json; sin ella
#      solo avisa y el .aab queda en dist/ para subirlo a mano.
#   android/scripts/distribute.sh "notas de la versión"            # compila release + sube
#   android/scripts/distribute.sh --no-build "notas"               # solo sube lo que ya está en dist/
# Se niega a compilar con cambios sin commitear en android/ (versionCode = número de commits, y un
# árbol sucio mete trabajo a medias de otra sesión): commitea, o corre desde un worktree limpio.
# Requiere ~/.kura/firebase-sa.json (cuenta de servicio con el rol Firebase App Distribution Admin)
# y ~/.kura/upload.properties (firma de release). Probadores: android/scripts/testers.txt (gitignoreado,
# un correo por línea) — se sincronizan al grupo antes de subir.
set -euo pipefail
cd "$(dirname "$0")/.."
APP_ID="1:744452121919:android:f64698eed2d188cf0a9f8a"
PROJECT="kura-a1f94"
GROUP="amigos"
SA="$HOME/.kura/firebase-sa.json"
[[ -f "$SA" ]] || { echo "Falta $SA (cuenta de servicio de Firebase)"; exit 1; }
export GOOGLE_APPLICATION_CREDENTIALS="$SA"
BUILD=1
if [[ "${1:-}" == "--no-build" ]]; then BUILD=0; shift; fi
NOTES="${1:-Kura Android · build $(git rev-list --count HEAD) ($(git rev-parse --short HEAD))}"
VERSION=$(grep -E 'versionName = "' app/build.gradle.kts | sed -E 's/.*"([^"]+)".*/\1/' | head -1)
APK="dist/kura-${VERSION}-release.apk"
if [[ $BUILD == 1 ]] && [[ -n "$(git status --porcelain -- .)" ]]; then
  echo "android/ tiene cambios sin commitear: commitea o usa un worktree limpio."; exit 1
fi
if [[ $BUILD == 1 ]]; then
  ./gradlew -q :app:assembleRelease
  mkdir -p dist && cp app/build/outputs/apk/release/app-release.apk "$APK"
fi
[[ -f "$APK" ]] || { echo "No existe $APK"; exit 1; }
FB="npx -y firebase-tools@15"
if [[ -f scripts/testers.txt ]]; then
  EMAILS=$(grep -vE '^\s*(#|$)' scripts/testers.txt | paste -sd, -)
  if [[ -n "$EMAILS" ]]; then
    $FB appdistribution:group:create "$GROUP" --project "$PROJECT" >/dev/null 2>&1 || true
    $FB appdistribution:testers:add "$EMAILS" --group-alias "$GROUP" --project "$PROJECT"
  fi
fi
$FB appdistribution:distribute "$APK" --app "$APP_ID" --project "$PROJECT" --groups "$GROUP" --release-notes "$NOTES"
echo "Subida: $APK · notas: $NOTES"

AAB="dist/kura-${VERSION}-release.aab"
if [[ -f "$HOME/.kura/play-publisher.json" ]]; then
  if [[ $BUILD == 1 ]]; then
    ./gradlew -q :app:bundleRelease
    cp app/build/outputs/bundle/release/app-release.aab "$AAB"
  fi
  [[ -f "$AAB" ]] || { echo "No existe $AAB"; exit 1; }
  ./scripts/play-upload.py "$AAB" "$NOTES"
else
  echo "Sin ~/.kura/play-publisher.json: Play no se subió (sube $AAB a mano en Play Console)."
fi
