<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Baclog — project gotchas

Non-obvious traps that will bite you. The full project state lives in the Obsidian vault at `~/Documents/Baclog` (start at `estado-actual.md`); the M3.5 nav redesign is in `pantallas/m3.5-navegacion.md`.

- **Deploys are MANUAL** via `vercel --prod` (team `communeodevteam`). There is **no** GitHub→Vercel auto-deploy and no Vercel checks on PRs — merging to `main` does not ship. Don't tell the user a merge deployed; it didn't.

- **Modals get trapped under the floating dock.** The dock is `fixed z-10` (persistent). The content wrapper in `src/app/(app)/layout.tsx` is `relative z-10 overflow-x-clip` (needed so content sits above the `z-0` app-wide aura and to contain the carousel page-slide) — but that wrapper is a stacking context that traps `fixed z-20+` modals **under** the dock. Correct fix: **portal the modal to `<body>`** with `createPortal` (see `new-backlog-button.tsx`, `descubrir/search-panel.tsx`). Do NOT lower the aura's z-index to "fix" it.

- **`AuraField` SSR hydration.** `Math.sin` differs in the last ULPs between Node and the browser, so an `AuraField` SSR'd inside a client component hydration-mismatches. `rand()` in `src/components/ui/aura-field.tsx` **quantizes** its output (`Math.round(f * 1e6) / 1e6`); the rest is deterministic IEEE arithmetic. Do NOT remove that quantization.

- **Palette (ADN) aggregation is centralized** in `src/modules/backlog/palette.ts` (`dominantHexes` / `groupDominantHexes` = "take N distinct dominant hexes, deduped case-insensitively"). Use these, don't re-inline the loop.

- **Authorization is 100% app-layer** (`src/authz`), no RLS. Server actions derive the user via `assertUser`/`assertOwnsBacklog`; never accept a `userId` across an RPC boundary. Two deliberate exceptions: `getPublicProfile` in `modules/backlog/public.ts` (gated on `users.isPublic`, public-safe field list, identical 404 for private vs. nonexistent — no enumeration oracle), and `updateItemPaletteAction`/`getPaletteBackfillTargetsAction` in `app/actions/palette-backfill-actions.ts` (founder-gated via `user.isFounder`, not ownership — writes any user's `backlogItems.paletteHex` only, for the ADN palette maintenance backfill).

- **The dev server HMR buffer replays stale compile errors** after a mid-edit save. If the console shows an error but a fresh SSR fetch returns 200 with real content (and `tsc`/`build` are clean), it's a stale buffer artifact — restart the dev server to clear it, don't chase a phantom bug.

- **The design system is borderless, glow-free, and pulse-free** (item-flow HANDOFF §7: "el aura es la única fuente de luz"). Do NOT add `border-*` to buttons/chips/cards/inputs/sheets (flat surface fills + fill-change selection/focus states instead), no light/colored `shadow-*` glows, no heartbeat/pulse animations on icons or glyphs. Exempt: dashed mock affordances ("Nuevo backlog" card, empty tile), content hairline dividers (coach marks, group headers, attribution, stat dividers), dark neutral depth shadows (dock, tinted cover, portaled sheets), text-shadows, loading-skeleton pulses, one-shot entrance animations, and the aura system itself. User-facing copy says **backlog**, never "estante".
