#!/usr/bin/env bash
# Guardrail: every haptic in the iOS app goes through `KHaptic.play` (ios/Kura/DesignSystem/Components/Press.swift).
# That is where the semantic vocabulary lives (selection · tap · firm · hit · success · warning · error) and
# where Ajustes › Vibraciones is checked ONCE. A generator or `.sensoryFeedback` anywhere else vibrates with
# the switch off and drifts from "same event = same haptic". Run: `bash scripts/check-haptics.sh` (exit 1 on a hit).
set -euo pipefail
cd "$(dirname "$0")/.."

home="ios/Kura/DesignSystem/Components/Press.swift"
pattern='UIImpactFeedbackGenerator|UISelectionFeedbackGenerator|UINotificationFeedbackGenerator|UIFeedbackGenerator|sensoryFeedback|CHHapticEngine|AudioServicesPlaySystemSound|KHaptic\.(impact|select|notify)\('

hits=$(grep -rnE "$pattern" ios/Kura --include='*.swift' | grep -v "^$home:" || true)
if [[ -n "$hits" ]]; then
  echo "check-haptics: haptics outside KHaptic (use KHaptic.play(.<event>) — see $home):" >&2
  echo "$hits" >&2
  exit 1
fi
echo "check-haptics: ok (every haptic goes through KHaptic.play)"
