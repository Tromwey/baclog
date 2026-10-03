#!/bin/sh
# Runs every guardrail in scripts/ (check-*.ts with tsx, check-*.sh with bash)
# and fails if ANY failed — all of them run, so one red check doesn't hide
# the next. Each is pure (no DB, no network). `pnpm check` chains this after
# the typecheck and the lint. Named run-* so it never matches its own glob.
cd "$(dirname "$0")/.." || exit 1
failed=""
for f in scripts/check-*.ts; do
  if out=$(pnpm -s tsx "$f" 2>&1); then
    echo "ok    $f"
  else
    echo "FAIL  $f"
    echo "$out" | grep -iE "fail|error|assert" | head -20 | sed 's/^/      /'
    failed="$failed $f"
  fi
done
for f in scripts/check-*.sh; do
  if out=$(bash "$f" 2>&1); then
    echo "ok    $f"
  else
    echo "FAIL  $f"
    echo "$out" | head -20 | sed 's/^/      /'
    failed="$failed $f"
  fi
done
if [ -n "$failed" ]; then
  echo ""
  echo "guardrails en rojo:$failed"
  exit 1
fi
echo ""
echo "guardrails ok"
