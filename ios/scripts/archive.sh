#!/usr/bin/env bash
# Kura · archive + export para TestFlight.
#
#   KURA_TEAM_ID=ABCDE12345 ios/scripts/archive.sh            # archive + .ipa en ios/build/export
#   KURA_TEAM_ID=ABCDE12345 KURA_ASC_KEY_ID=… KURA_ASC_ISSUER_ID=… KURA_ASC_KEY_PATH=…/AuthKey_….p8 \
#     ios/scripts/archive.sh --upload                          # además lo sube a App Store Connect
#
# Variables:
#   KURA_TEAM_ID        (obligatoria) Team ID de 10 caracteres. Si no está en el entorno se lee de
#                       ios/Config/Team.xcconfig (gitignoreado) cuando existe.
#   KURA_BUILD_NUMBER   (opcional) CFBundleVersion. Por defecto `git rev-list --count HEAD`.
#   KURA_ASC_KEY_ID / KURA_ASC_ISSUER_ID / KURA_ASC_KEY_PATH
#                       (opcionales; obligatorias con --upload) llave de la App Store Connect API.
#                       Si están, xcodebuild las usa también para firmar/aprovisionar (no hace falta
#                       tener la cuenta dada de alta en Xcode › Settings › Accounts).
#   KURA_CLOUD_SIGNING=1
#                       (opcional) no exigir un certificado "Apple Distribution" local: el export lo
#                       firma con el certificado de distribución administrado en la nube (requiere
#                       rol Account Holder/Admin y cuenta en Xcode, o la llave ASC).
#
# Salidas (gitignoreadas): ios/build/Kura.xcarchive, ios/build/export/Kura.ipa, ios/build/*.log.
set -euo pipefail

# ── helpers ──────────────────────────────────────────────────────────────────────────────────────
bold=$'\033[1m'; red=$'\033[31m'; yellow=$'\033[33m'; green=$'\033[32m'; reset=$'\033[0m'
[[ -t 1 ]] || { bold=; red=; yellow=; green=; reset=; }
step() { printf '%s==>%s %s\n' "$bold" "$reset" "$*"; }
warn() { printf '%sAVISO:%s %s\n' "$yellow" "$reset" "$*" >&2; }
fail() {
  printf '\n%sERROR:%s %s\n' "$red" "$reset" "$1" >&2
  shift
  for line in "$@"; do printf '  %s\n' "$line" >&2; done
  exit 1
}

usage() {
  # Imprime el bloque de comentarios del encabezado (de la línea 2 a la primera que no empieza con #).
  awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"
  exit "${1:-0}"
}

UPLOAD=0
for arg in "$@"; do
  case "$arg" in
    --upload) UPLOAD=1 ;;
    -h|--help) usage 0 ;;
    *) printf 'Opción desconocida: %s\n\n' "$arg" >&2; usage 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$IOS_DIR/build"
ARCHIVE_PATH="$BUILD_DIR/Kura.xcarchive"
EXPORT_PATH="$BUILD_DIR/export"
DERIVED_DATA="$BUILD_DIR/DerivedData"
EXPORT_OPTIONS="$BUILD_DIR/ExportOptions.plist"
ARCHIVE_LOG="$BUILD_DIR/archive.log"
EXPORT_LOG="$BUILD_DIR/export.log"

# Resume un log de xcodebuild: causa probable (patrones conocidos) + las primeras líneas "error:".
explain_failure() {
  local log="$1" what="$2" hints=()
  grep -q "No Account for Team\|No accounts found\|no account for team" "$log" 2>/dev/null &&
    hints+=("Xcode no tiene una cuenta con acceso al team $KURA_TEAM_ID: Xcode › Settings › Accounts › + (Apple ID del founder), o exporta KURA_ASC_KEY_ID/KURA_ASC_ISSUER_ID/KURA_ASC_KEY_PATH.")
  grep -qi "Unable to find a team with the given Team ID\|is not a valid team\|team.*not found\|No team found" "$log" 2>/dev/null &&
    hints+=("El Team ID '$KURA_TEAM_ID' no existe o la cuenta no pertenece a él: revísalo en developer.apple.com › Account › Membership details.")
  grep -qi "requires a development team" "$log" 2>/dev/null &&
    hints+=("Falta el team: DEVELOPMENT_TEAM no llegó al build (¿KURA_TEAM_ID vacío?).")
  grep -qi "No profiles for 'io.communeo.kura'\|bundle identifier.*not available\|Failed Registering Bundle Identifier\|cannot be registered to your development team" "$log" 2>/dev/null &&
    hints+=("No hay App ID/perfil para io.communeo.kura en ese team: créalo en developer.apple.com › Identifiers (Bundle ID explícito, sin capacidades) y vuelve a correr (el script ya pasa -allowProvisioningUpdates).")
  grep -qi "has no devices\|no devices from which to generate" "$log" 2>/dev/null &&
    hints+=("El team no tiene ningún iPhone registrado y la firma automática lo necesita para el perfil de desarrollo del archive: conecta tu iPhone y ábrelo una vez en Xcode (o regístralo en developer.apple.com › Devices).")
  grep -qi "No signing certificate\|No certificate for team\|doesn't include signing certificate\|no valid signing identit" "$log" 2>/dev/null &&
    hints+=("No hay certificado de firma válido para ese team: Xcode › Settings › Accounts › Manage Certificates › + (Apple Development y Apple Distribution).")
  grep -qi "agreement\|PLA Update\|Program License Agreement" "$log" 2>/dev/null &&
    hints+=("Hay un acuerdo pendiente de aceptar: developer.apple.com › Account y App Store Connect › Business.")
  grep -qi "Authentication failed\|Invalid authentication\|NOT_AUTHORIZED\|401" "$log" 2>/dev/null && [[ -n "${KURA_ASC_KEY_ID:-}" ]] &&
    hints+=("La llave de App Store Connect API fue rechazada: revisa KURA_ASC_KEY_ID / KURA_ASC_ISSUER_ID / KURA_ASC_KEY_PATH y que la llave tenga rol App Manager o Admin.")
  grep -qi "No suitable application records were found\|Cannot determine the Apple ID from Bundle ID" "$log" 2>/dev/null &&
    hints+=("App Store Connect no tiene una app con el Bundle ID io.communeo.kura: créala en App Store Connect › Apps › + antes de subir.")
  grep -qi "bundle version must be higher\|The bundle version.*has already been used\|Redundant Binary Upload" "$log" 2>/dev/null &&
    hints+=("Ese número de build ya se subió: haz commit (sube git rev-list --count) o exporta KURA_BUILD_NUMBER mayor.")
  [[ ${#hints[@]} -eq 0 ]] && hints+=("Causa no reconocida; mira las líneas de error de abajo y el log completo.")

  local errors
  errors="$(grep -E '(^|: )error: |^error:|\*\* (ARCHIVE|EXPORT) FAILED' "$log" 2>/dev/null | sed 's/^[[:space:]]*//' | awk '!seen[$0]++' | head -8 || true)"
  local lines=("Causa probable:")
  for h in "${hints[@]}"; do lines+=("  - $h"); done
  if [[ -n "$errors" ]]; then
    lines+=("" "Errores de xcodebuild:")
    while IFS= read -r e; do lines+=("  $e"); done <<<"$errors"
  fi
  lines+=("" "Log completo: $log")
  fail "$what falló." "${lines[@]}"
}

# ── (c) herramientas ────────────────────────────────────────────────────────────────────────────
step "Verificando herramientas"
XCODEGEN="$(command -v xcodegen || true)"
[[ -z "$XCODEGEN" && -x /opt/homebrew/bin/xcodegen ]] && XCODEGEN=/opt/homebrew/bin/xcodegen
[[ -n "$XCODEGEN" ]] || fail "No encuentro xcodegen." "Instálalo con: brew install xcodegen"
command -v xcodebuild >/dev/null || fail "No encuentro xcodebuild." "Instala Xcode y corre: sudo xcode-select -s /Applications/Xcode.app"
xcodebuild -version >/dev/null 2>&1 || fail "xcodebuild no funciona (¿Command Line Tools en vez de Xcode?)." \
  "Corre: sudo xcode-select -s /Applications/Xcode.app && sudo xcodebuild -license accept"
for tool in git plutil security; do
  command -v "$tool" >/dev/null || fail "No encuentro $tool en el PATH."
done
printf '    %s · xcodegen %s\n' "$(xcodebuild -version | head -1)" "$("$XCODEGEN" --version | awk '{print $NF}')"

# ── (a) team ────────────────────────────────────────────────────────────────────────────────────
step "Verificando KURA_TEAM_ID"
if [[ -z "${KURA_TEAM_ID:-}" && -f "$IOS_DIR/Config/Team.xcconfig" ]]; then
  KURA_TEAM_ID="$(sed -nE 's/^[[:space:]]*KURA_TEAM_ID[[:space:]]*=[[:space:]]*([A-Za-z0-9]+).*/\1/p' "$IOS_DIR/Config/Team.xcconfig" | head -1)"
  [[ -n "$KURA_TEAM_ID" ]] && printf '    (leído de ios/Config/Team.xcconfig)\n'
fi
[[ -n "${KURA_TEAM_ID:-}" ]] || fail "KURA_TEAM_ID no está definido." \
  "Es el Team ID de 10 caracteres de tu cuenta de Apple Developer:" \
  "developer.apple.com › Account › Membership details › Team ID." \
  "" \
  "  export KURA_TEAM_ID=ABCDE12345 && ios/scripts/archive.sh" \
  "" \
  "o déjalo fijo en ios/Config/Team.xcconfig (copia ios/Config/Team.xcconfig.example; está gitignoreado)."
[[ "$KURA_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]] || fail "KURA_TEAM_ID='$KURA_TEAM_ID' no parece un Team ID." \
  "Debe ser de 10 caracteres, mayúsculas y dígitos (p. ej. ABCDE12345)."
printf '    team %s\n' "$KURA_TEAM_ID"

# ── upload: llave ASC ──────────────────────────────────────────────────────────────────────────
AUTH_ARGS=()
if [[ -n "${KURA_ASC_KEY_ID:-}${KURA_ASC_ISSUER_ID:-}${KURA_ASC_KEY_PATH:-}" ]]; then
  [[ -n "${KURA_ASC_KEY_ID:-}" && -n "${KURA_ASC_ISSUER_ID:-}" && -n "${KURA_ASC_KEY_PATH:-}" ]] ||
    fail "Definiste solo parte de la llave de App Store Connect API." \
      "Hacen falta las tres: KURA_ASC_KEY_ID, KURA_ASC_ISSUER_ID y KURA_ASC_KEY_PATH (ruta al AuthKey_XXXX.p8)."
  [[ -f "$KURA_ASC_KEY_PATH" ]] || fail "KURA_ASC_KEY_PATH no existe: $KURA_ASC_KEY_PATH"
  AUTH_ARGS=(-authenticationKeyPath "$KURA_ASC_KEY_PATH" -authenticationKeyID "$KURA_ASC_KEY_ID" -authenticationKeyIssuerID "$KURA_ASC_ISSUER_ID")
fi
if [[ $UPLOAD -eq 1 && ${#AUTH_ARGS[@]} -eq 0 ]]; then
  fail "--upload necesita la llave de App Store Connect API." \
    "App Store Connect › Users and Access › Integrations › App Store Connect API › + (rol App Manager)," \
    "descarga el .p8 (solo se puede una vez) y exporta:" \
    "  KURA_ASC_KEY_ID=…  KURA_ASC_ISSUER_ID=…  KURA_ASC_KEY_PATH=/ruta/AuthKey_….p8" \
    "Sin --upload el script deja el .ipa y lo subes con Transporter (ver ios/README.md › TestFlight)."
fi

# ── (b) identidad de firma ─────────────────────────────────────────────────────────────────────
step "Verificando identidades de firma"
IDENTITIES="$(security find-identity -v -p codesigning 2>/dev/null || true)"
VALID_COUNT="$(printf '%s\n' "$IDENTITIES" | grep -cE '^[[:space:]]*[0-9]+\)' || true)"
if [[ "$VALID_COUNT" -eq 0 && ${#AUTH_ARGS[@]} -eq 0 ]]; then
  fail "No hay ninguna identidad de firma válida en el llavero." \
    "Abre Xcode › Settings › Accounts, agrega el Apple ID del team $KURA_TEAM_ID y en" \
    "Manage Certificates crea 'Apple Development' y 'Apple Distribution'." \
    "(O exporta KURA_ASC_KEY_ID/KURA_ASC_ISSUER_ID/KURA_ASC_KEY_PATH para que xcodebuild los cree.)"
fi
printf '%s\n' "$IDENTITIES" | grep -E '^[[:space:]]*[0-9]+\)' | sed 's/^[[:space:]]*/    /' || true
if ! printf '%s\n' "$IDENTITIES" | grep -qE '"(Apple|iPhone) Distribution'; then
  if [[ "${KURA_CLOUD_SIGNING:-0}" == "1" || ${#AUTH_ARGS[@]} -gt 0 ]]; then
    warn "no hay certificado 'Apple Distribution' local; el export usará la firma de distribución en la nube."
  else
    fail "No hay certificado 'Apple Distribution' en el llavero (solo de desarrollo)." \
      "El .ipa para TestFlight se firma con Apple Distribution. Opciones:" \
      "  1. Xcode › Settings › Accounts › (tu Apple ID) › Manage Certificates › + › Apple Distribution, y vuelve a correr." \
      "  2. KURA_CLOUD_SIGNING=1 para usar el certificado administrado en la nube (Account Holder/Admin)." \
      "  3. Exportar KURA_ASC_KEY_ID/KURA_ASC_ISSUER_ID/KURA_ASC_KEY_PATH (firma y sube con la llave)."
  fi
fi

# ── versión ─────────────────────────────────────────────────────────────────────────────────────
BUILD_NUMBER="${KURA_BUILD_NUMBER:-$(git -C "$IOS_DIR" rev-list --count HEAD)}"
[[ "$BUILD_NUMBER" =~ ^[0-9]+(\.[0-9]+){0,2}$ ]] || fail "Número de build inválido: '$BUILD_NUMBER' (enteros separados por punto)."
if [[ -z "${KURA_BUILD_NUMBER:-}" && -n "$(git -C "$IOS_DIR" status --porcelain -- . 2>/dev/null)" ]]; then
  warn "ios/ tiene cambios sin commit: el build $BUILD_NUMBER no los identifica y un segundo upload con el mismo número será rechazado."
fi

# ── generar proyecto ────────────────────────────────────────────────────────────────────────────
step "Generando Kura.xcodeproj (xcodegen)"
( cd "$IOS_DIR" && "$XCODEGEN" generate --quiet ) || fail "xcodegen generate falló (revisa ios/project.yml)."
MARKETING_VERSION="$(sed -nE 's/^[[:space:]]*MARKETING_VERSION:[[:space:]]*"?([0-9.]+)"?.*/\1/p' "$IOS_DIR/project.yml" | head -1)"

# ── archive ─────────────────────────────────────────────────────────────────────────────────────
mkdir -p "$BUILD_DIR"
rm -rf "$ARCHIVE_PATH" "$EXPORT_PATH"
step "Archivando Kura $MARKETING_VERSION ($BUILD_NUMBER) · Release · generic/platform=iOS"
printf '    log: %s\n' "$ARCHIVE_LOG"
if ! xcodebuild archive \
    -project "$IOS_DIR/Kura.xcodeproj" \
    -scheme Kura \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    -archivePath "$ARCHIVE_PATH" \
    -derivedDataPath "$DERIVED_DATA" \
    -allowProvisioningUpdates \
    ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} \
    DEVELOPMENT_TEAM="$KURA_TEAM_ID" \
    CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
    >"$ARCHIVE_LOG" 2>&1; then
  explain_failure "$ARCHIVE_LOG" "El archive"
fi

# ── validar el binario archivado (antes de exportar/subir) ────────────────────────────────────
EXPECTED_API_BASE="https://baclog.app/api/v1"
APP_PLIST="$ARCHIVE_PATH/Products/Applications/Kura.app/Info.plist"
[[ -f "$APP_PLIST" ]] || fail "El archive no contiene Products/Applications/Kura.app/Info.plist." \
  "xcodebuild dijo que terminó pero el .xcarchive está incompleto. Log: $ARCHIVE_LOG"
API_BASE="$(plutil -extract KuraAPIBase raw "$APP_PLIST" 2>/dev/null || true)"
[[ "$API_BASE" == "$EXPECTED_API_BASE" ]] || fail "El build archivado no apunta a producción." \
  "KuraAPIBase = '${API_BASE:-(ausente)}' (se esperaba exactamente $EXPECTED_API_BASE)." \
  "Revisa KURA_API_SCHEME / KURA_API_HOST de la config Release en ios/project.yml." \
  "No se exportó ni se subió nada."
VERSION="$(plutil -extract CFBundleShortVersionString raw "$APP_PLIST" 2>/dev/null || true)"
BUILT="$(plutil -extract CFBundleVersion raw "$APP_PLIST" 2>/dev/null || true)"
[[ -n "$VERSION" && -n "$BUILT" ]] || fail "El Info.plist archivado no trae CFBundleShortVersionString / CFBundleVersion." \
  "Revisa MARKETING_VERSION / CURRENT_PROJECT_VERSION en ios/project.yml."
[[ "$BUILT" == "$BUILD_NUMBER" ]] || fail "El build archivado es '$BUILT' pero se pidió '$BUILD_NUMBER'." \
  "CURRENT_PROJECT_VERSION no llegó al binario; no se exportó ni se subió nada."
printf '    Kura %s (%s) · API %s\n' "$VERSION" "$BUILT" "$API_BASE"

# ── export ──────────────────────────────────────────────────────────────────────────────────────
cp "$IOS_DIR/ExportOptions.plist" "$EXPORT_OPTIONS"
plutil -replace teamID -string "$KURA_TEAM_ID" "$EXPORT_OPTIONS"
if [[ $UPLOAD -eq 1 ]]; then
  plutil -replace destination -string upload "$EXPORT_OPTIONS"
  step "Exportando y subiendo a App Store Connect"
else
  step "Exportando .ipa (app-store-connect)"
fi
printf '    log: %s\n' "$EXPORT_LOG"
if ! xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportOptionsPlist "$EXPORT_OPTIONS" \
    -exportPath "$EXPORT_PATH" \
    -allowProvisioningUpdates \
    ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} \
    >"$EXPORT_LOG" 2>&1; then
  explain_failure "$EXPORT_LOG" "El export"
fi

# ── resultado ───────────────────────────────────────────────────────────────────────────────────
grep -q '\*\* EXPORT SUCCEEDED \*\*' "$EXPORT_LOG" || {
  tail -25 "$EXPORT_LOG" >&2
  fail "xcodebuild -exportArchive salió con 0 pero el log no dice '** EXPORT SUCCEEDED **' (arriba, el final del log)." \
    "Log completo: $EXPORT_LOG"
}

if [[ $UPLOAD -eq 1 ]]; then
  # Xcode registra la subida en el log del export ("Upload succeeded." / "Uploaded Kura" según versión).
  if ! grep -qiE 'upload(ed)? succeeded|successfully uploaded|^[[:space:]]*Uploaded Kura' "$EXPORT_LOG"; then
    tail -40 "$EXPORT_LOG" >&2
    fail "El export terminó pero el log no confirma la subida a App Store Connect (arriba, el final del log)." \
      "No des el build por subido: revisa App Store Connect › TestFlight y el log completo: $EXPORT_LOG" \
      "Si no aparece, sube el .xcarchive desde Xcode › Organizer o genera el .ipa sin --upload y usa Transporter."
  fi
else
  IPA="$(find "$EXPORT_PATH" -maxdepth 1 -name '*.ipa' -print -quit 2>/dev/null || true)"
  [[ -n "$IPA" && -s "$IPA" ]] || fail "El export terminó pero no hay ningún .ipa en $EXPORT_PATH." \
    "Contenido: $(ls -1 "$EXPORT_PATH" 2>/dev/null | tr '\n' ' ')" \
    "Revisa ios/ExportOptions.plist (destination debe ser export) y el log: $EXPORT_LOG"
fi

printf '\n%sListo.%s\n' "$green" "$reset"
printf '  versión   %s\n  build     %s\n  API       %s\n  archive   %s\n' "$VERSION" "$BUILT" "$API_BASE" "$ARCHIVE_PATH"
if [[ $UPLOAD -eq 1 ]]; then
  printf '  subida    confirmada en el log; aparece en TestFlight tras el procesamiento (~5–30 min).\n'
else
  printf '  ipa       %s\n\n' "$IPA"
  printf 'Para subirlo (nunca pongas la contraseña en la línea de comandos):\n'
  printf '  · Transporter: arrastra el .ipa › Deliver.\n'
  printf '  · Con la llave ASC (el .p8 en ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8):\n'
  printf '      xcrun altool --upload-app -f "%s" -t ios --apiKey <KEY_ID> --apiIssuer <ISSUER_ID>\n' "$IPA"
  printf '  · Con contraseña de app guardada en el llavero (ver ios/README.md › TestFlight):\n'
  printf '      xcrun altool --upload-app -f "%s" -t ios -u <apple-id> -p @keychain:AC_PASSWORD\n' "$IPA"
  printf '  · O vuelve a correr este script con --upload y KURA_ASC_KEY_ID/KURA_ASC_ISSUER_ID/KURA_ASC_KEY_PATH.\n'
fi
