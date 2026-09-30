import { env } from "@/lib/env";

/**
 * Digital Asset Links for the native Android app (Kura, `com.tromwey.kura`).
 *
 * Android verifies App Links (`autoVerify` intent filters for
 * `https://get-kura.app/…` and the legacy `https://baclog.app/…`) by fetching
 * this file from each host and checking that the SHA-256 of the signing
 * certificate of the installed APK is listed. The fingerprints come from
 * `ANDROID_CERT_SHA256` (comma-separated, `AA:BB:…`): today the debug
 * keystore of the founder's Mac; the Play App Signing certificate gets added
 * to the list once it exists.
 *
 * Requirements Google enforces (same posture as the AASA next door): 200 with
 * NO redirect, `application/json`, no auth. The host redirects in
 * `next.config.ts` skip `/.well-known/*`, so both get-kura.app and baclog.app
 * serve it. With no fingerprints configured it still answers 200 (the same
 * statement with an empty `sha256_cert_fingerprints`) — never 404: Google
 * caches a 404 and the app would stay unverified long after the env is fixed.
 *
 * Read at request time (not `force-static`) so a fingerprint change only needs
 * the env var + a redeploy, never a build that happened to run without it.
 */

const PACKAGE_NAME = "com.tromwey.kura";
const FINGERPRINT = /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/;

function fingerprints(): string[] {
  const raw = env.ANDROID_CERT_SHA256 ?? "";
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const value = part.trim().toUpperCase();
    if (!value) continue;
    if (!FINGERPRINT.test(value)) {
      // Loud, not fatal: a malformed entry is skipped so the valid ones still verify.
      console.error(`[assetlinks] ANDROID_CERT_SHA256 has a malformed fingerprint, skipped: "${value}"`);
      continue;
    }
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

export function GET() {
  const statements = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: PACKAGE_NAME,
        sha256_cert_fingerprints: fingerprints(),
      },
    },
  ];
  return Response.json(statements, {
    headers: {
      "Content-Type": "application/json",
      // Google re-fetches on its own schedule; this only bounds OUR edge.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
