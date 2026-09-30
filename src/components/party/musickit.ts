"use client";

/**
 * MusicKit JS v3, loaded ON DEMAND (only when someone opens "Llévala a Apple
 * Music" — never on page load): the script tag is injected here, once per
 * page, and resolves on Apple's `musickitloaded` event. Contract
 * `state/export-contract.md` §6.2: script from Apple's CDN, developer token
 * from our server (`getAppleMusicDeveloperTokenAction`, public by design),
 * `MusicKit.configure({ developerToken, app })`.
 *
 * Only the slice of the API the export uses is typed.
 */

const SRC = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
const LOAD_TIMEOUT_MS = 20_000;

export interface MusicKitInstance {
  readonly isAuthorized: boolean;
  /** The user's storefront once authorized ("mx", "us", …). */
  readonly storefrontId?: string;
  authorize(): Promise<string>;
  api: {
    music(
      path: string,
      query?: Record<string, string | number>,
      options?: { fetchOptions?: RequestInit },
    ): Promise<{ data?: unknown } | undefined>;
  };
}

interface MusicKitGlobal {
  configure(opts: { developerToken: string; app: { name: string; build: string } }): Promise<MusicKitInstance>;
  getInstance(): MusicKitInstance | undefined;
}

declare global {
  interface Window {
    MusicKit?: MusicKitGlobal;
  }
}

let script: Promise<MusicKitGlobal> | null = null;

function loadScript(): Promise<MusicKitGlobal> {
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  if (script) return script;
  script = new Promise<MusicKitGlobal>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      if (window.MusicKit) resolve(window.MusicKit);
      else reject(new Error("MusicKit loaded without a global"));
    };
    const timer = setTimeout(() => reject(new Error("MusicKit load timed out")), LOAD_TIMEOUT_MS);
    document.addEventListener("musickitloaded", done, { once: true });
    const tag = document.createElement("script");
    tag.src = SRC;
    tag.async = true;
    tag.dataset.webComponents = "";
    tag.onerror = () => {
      clearTimeout(timer);
      reject(new Error("MusicKit script failed to load"));
    };
    document.head.appendChild(tag);
  }).catch((err: unknown) => {
    script = null; // a later try injects again
    throw err;
  });
  return script;
}

let configured: { instance: MusicKitInstance; expiresAt: number } | null = null;

/**
 * The configured instance. `devToken` is only called when there is none yet
 * or the one it was configured with has expired (1 h, origin-bound).
 */
export async function musicKit(
  devToken: () => Promise<{ token: string; expiresAt: string }>,
): Promise<MusicKitInstance> {
  if (configured && configured.expiresAt > Date.now() + 60_000) return configured.instance;
  const [mk, dev] = await Promise.all([loadScript(), devToken()]);
  const instance = await mk.configure({ developerToken: dev.token, app: { name: "kura", build: "1" } });
  configured = { instance, expiresAt: Date.parse(dev.expiresAt) || Date.now() + 60 * 60_000 };
  return instance;
}
