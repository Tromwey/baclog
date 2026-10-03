#!/bin/sh
# `pnpm test:db`: the two harnesses that need a database, against ONE
# throwaway LOCAL Postgres (recipe in the header of scripts/db-harness/run.ts;
# both refuse a host that is not loopback — they TRUNCATE).
#   1. scripts/db-harness/run.ts   — the real modules and cron handlers
#   2. scripts/otp-sql-harness.ts  — the shipped OTP gate SQL (src/auth/otp-sql.ts)
# The second reuses the first's database unless OTP_HARNESS_URL says otherwise.
cd "$(dirname "$0")/.." || exit 1
url="${HARNESS_DATABASE_URL:-postgres://postgres@127.0.0.1:54399/kura}"
pnpm -s tsx --tsconfig scripts/db-harness/tsconfig.json --conditions=react-server scripts/db-harness/run.ts || exit 1
echo ""
echo "── otp-sql-harness ──"
OTP_HARNESS_URL="${OTP_HARNESS_URL:-$url}" pnpm -s tsx scripts/otp-sql-harness.ts || exit 1
