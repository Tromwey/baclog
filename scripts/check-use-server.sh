#!/bin/sh
# Guardrail: a "use server" module must not re-export types (`export type { X }` /
# `export { type X }`). Turbopack turns the re-export into a runtime binding and EVERY
# server action in that file throws `ReferenceError: X is not defined` in production.
# See .claude/knowledge/learnings/2026-09-27-export-type-en-use-server-rompe-turbopack.md
set -e
bad=$(grep -rlE '^["'"'"']use server["'"'"']' src --include='*.ts' --include='*.tsx' \
  | xargs grep -nE '^export (type \{|\{[^}]*\btype\b)' 2>/dev/null || true)
if [ -n "$bad" ]; then
  echo "check-use-server: type re-export in a \"use server\" file:"
  echo "$bad"
  exit 1
fi
echo "check-use-server: ok"
