#!/usr/bin/env sh
# Deploy a beta (preview) build and point beta.baclog.app at it.
#   pnpm beta
# Beta shares the production DB + Resend (real OTP emails). It uploads the
# CURRENT working dir — uncommitted changes included — so you can test on
# mobile before `vercel --prod`.
set -e
set -o pipefail

echo "→ Deploying beta (preview)…"
URL=$(vercel deploy --yes | tail -1)

# Fail closed: `tail` masks a failed `vercel deploy` from set -e (pipefail
# re-exposes it), and a non-URL line would otherwise be aliased as garbage.
case "$URL" in
  https://*) ;;
  *)
    echo "✗ Beta deploy failed — no valid deployment URL (got: '$URL')." >&2
    echo "  Check Vercel auth (vercel whoami), the build logs, and your network." >&2
    exit 1
    ;;
esac
echo "→ Deployed: $URL"

# Stable .vercel.app alias — always works, no DNS. Use this on mobile.
vercel alias set "$URL" baclog-beta.vercel.app || true

# Branded alias — only resolves once beta.baclog.app DNS points at Vercel.
if vercel alias set "$URL" beta.baclog.app; then
  echo "✓ Beta live: https://beta.baclog.app  ·  https://baclog-beta.vercel.app"
else
  echo "✓ Beta live: https://baclog-beta.vercel.app"
  echo "⚠ beta.baclog.app not applied yet — set its Cloudflare DNS record (see README/scripts)."
fi
