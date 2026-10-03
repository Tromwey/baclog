#!/bin/sh
# `pnpm test`: every *.test.ts under src/ with node:test via tsx. The list is
# built with find because Node 20's `--test` takes files, not globs. Pure
# tests only (no DB, no network) — the DB harness is `pnpm test:db`.
cd "$(dirname "$0")/.." || exit 1
files=$(find src -name "*.test.ts" | sort)
if [ -z "$files" ]; then
  echo "no hay *.test.ts en src/"
  exit 1
fi
# shellcheck disable=SC2086
exec pnpm -s tsx --test $files
