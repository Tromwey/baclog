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

- **Item data lives at THREE levels — don't read state off `backlog_item`.** `backlog_item` is pure **membership** (which backlog a title is in: `id`, `backlogId`, `userId`, `catalogItemId`, `addedAt`). The user's **per-title state** (`status`, `verdict`, `obsessed`, `sourceCrossMediaRecId`) lives on **`user_item`** (one row per `userId+catalogItemId`), so it's identical across every backlog a title is filed under. The cover **palette** lives on **`catalog_item.paletteHex`** (shared, cover-derived, extracted on-device once). Reads join `backlog_item → user_item` on `(userId, catalogItemId)` for state and `→ catalog_item` for palette. State mutations key on `catalogItemId` via `assertOwnsUserItem`; `removeMembershipAction` drops one membership (+ GC's the `user_item` if it was the last), `removeFromLibraryAction` drops all. Profile/recap counts scan `user_item` so a title in two backlogs counts once.

- **Reseñas (F3.9) son UGC, y viven en su propia tabla.** `item_review` es una fila por `(userId, catalogItemId)` — NO columnas en `user_item`: el feed lee "todas las reseñas de ESTE título" (índice `(catalog_item_id, created_at)`), la moderación (`hidden_at`) no es estado del usuario, y una tabla aparte deja seleccionar una lista blanca público-safe sin rozar status/verdict/procedencia. **No hay FK que cascadee desde `user_item`**: `removeMembershipAction` (al GC-ear) y `removeFromLibraryAction` borran la reseña explícitamente — si agregas otra ruta que quite un título de la biblioteca, bórrala ahí también. Escribir se **desbloquea al reaccionar** (`obsessed || verdict !== null`) y esa regla se re-checa en `saveReviewAction`, no solo en la UI. Editar **NO** limpia `hidden_at` (decisión del founder, 2026-09-02): una reseña que moderación ocultó sigue oculta aunque el autor la reescriba — solo Restaurar en la Torre la re-publica; la nota al autor lo dice tal cual. Una reseña pública SÍ se ve en todos los feeds (ítem público, feed social): es la intención, no una fuga.

- **El feed social (F3.10) es DERIVADO, y sus lecturas cross-user van con lista blanca.** La única tabla nueva es `user_follow` (arista A→B, unilateral, solo hacia perfiles públicos). El feed NO tiene tabla: es un merge keyset de `backlog_item.added_at` / `user_item.status_changed_at` / `user_item.obsessed_at` / `item_review.created_at` sobre los ids seguidos (`src/modules/social/queries.ts`), y **cada rama re-gatea `users.isPublic = true AND username IS NOT NULL` DENTRO de la query** (postura de `public.ts`/reseñas) con lista blanca de campos — por eso un seguido que se vuelve privado desaparece del feed al instante y su fila de follow queda **inerte a propósito: nunca la limpies**. Reglas que no se ven en el código a primera vista: `unfollowUserAction` **no** gatea en `isPublic` (si lo gateas, el follow a un perfil ya-privado se vuelve imborrable de la lista); los conteos de seguidores son públicos pero las **listas** solo las ve su dueño (no hay ruta pública de listas); los seguidores sin handle público se agregan como conteo anónimo, nunca como identidad; y "feed" está en `RESERVED` de `claimUsernameAction`. "No puede esperar" en el feed NO es un tipo de evento — es un add cuyo `releaseDate > now()`, igual que F3.8, y caduca solo. **La visibilidad por backlog (F3.10.1) es del CONTENEDOR, no del título**: `backlog.is_public` + `show_on_profile` dan tres estados (Privado = su URL pública 404 idéntico a inexistente Y sus adds desaparecen del feed · Público = link directo vivo, fuera del perfil · Perfil = el escaparate, `featured` se DERIVA como `is_public AND show_on_profile`, nunca se persiste); lo que el usuario hace con un TÍTULO (completar, obsesionarse, reseñar, "no puede esperar") sigue gateado solo por `users.isPublic` — ocultar un estante nunca oculta actividad per-título, a propósito. Cualquier query nueva que toque `backlog`/`backlog_item` cross-user tiene que gatear en `backlogs.isPublic` además del gate de usuario.

- **Authorization is 100% app-layer** (`src/authz`), no RLS. Server actions derive the user via `assertUser`/`assertOwnsBacklog`; never accept a `userId` across an RPC boundary. Three deliberate exceptions: `getPublicProfile` in `modules/backlog/public.ts` (gated on `users.isPublic`, public-safe field list, identical 404 for private vs. nonexistent — no enumeration oracle), `updateItemPaletteAction`/`getPaletteBackfillTargetsAction` in `app/actions/palette-backfill-actions.ts` (admin-gated via `user.isAdmin`, not ownership — writes `catalogItems.paletteHex` only, the shared cover-derived palette cache, for the ADN palette maintenance backfill), the **feed público de reseñas** (`src/modules/reviews/queries.ts`, gated on `users.isPublic = true AND username IS NOT NULL AND item_review.hidden_at IS NULL` with a public-safe field list — same posture as `public.ts`), and the **Torre de Control** (`src/modules/admin/*` + `app/(app)/admin/**`, admin-gated via `requireAdmin()` in `modules/admin/guard.ts` — cross-user aggregates for monitoring: user counts, funnel, analytics país/device, reco meters, LLM telemetry; no per-user PII beyond what F3.4 already stores, and non-admins get an identical 404). Adyacente pero NO excepción: **las lecturas del feed social F3.10** (`src/modules/social/queries.ts`) corren CON sesión pero leen filas ajenas — mismo gate `publicAuthor` + lista blanca por query (ver el bullet F3.10 arriba); cualquier auditoría de lecturas cross-user tiene que incluirlas. The portal was READ-ONLY until F3.9; its **only** write is `app/actions/review-moderation-actions.ts` (ocultar / restaurar / descartar), which touches `item_review.hidden_at` + `report.resolved_at` and NOTHING else — it never edits or deletes another user's text. Keep it that way: a new admin write needs the same justification UGC had. ⚠️ **`isFounder` is a BADGE, not a role**: F3.2 auto-grants it to the first ~100 accounts, so gating anything operational on it hands the portal to the whole cohort — operational gates use **`users.isAdmin`** (assigned manually in the DB; today only the founder's account).

- **The dev server HMR buffer replays stale compile errors** after a mid-edit save. If the console shows an error but a fresh SSR fetch returns 200 with real content (and `tsc`/`build` are clean), it's a stale buffer artifact — restart the dev server to clear it, don't chase a phantom bug.

- **The design system is borderless, glow-free, and pulse-free** (item-flow HANDOFF §7: "el aura es la única fuente de luz"). Do NOT add `border-*` to buttons/chips/cards/inputs/sheets (flat surface fills + fill-change selection/focus states instead), no light/colored `shadow-*` glows, no heartbeat/pulse animations on icons or glyphs. Exempt: dashed mock affordances ("Nuevo backlog" card, empty tile), content hairline dividers (coach marks, group headers, attribution, stat dividers), dark neutral depth shadows (dock, tinted cover, portaled sheets), text-shadows, loading-skeleton pulses, one-shot entrance animations, and the aura system itself. User-facing copy says **backlog**, never "estante".

# Shared agent brain — `.claude/knowledge/`

This file holds the **evergreen** rules ("how we do things here"). Everything that changes as the
code changes lives versioned in **`.claude/knowledge/`** — read it before you touch anything, whatever
your specialty:

- **`state/<domain>.md`** — how the project is **today** (mutable, gets overwritten). Domains:
  `overview`, `backend`, `frontend`, `data`, `security`, `recs`, `infra`.
- **`learnings/YYYY-MM-DD-slug.md`** — bugs already solved and gotchas. **Append-only, never delete**
  (deleting = losing the lesson = the bug comes back).
- **`guardrails.md`** — the automated checks that keep those bugs from returning, plus the honest list
  of what nothing catches today.

The router (what to read for which task) is `.claude/knowledge/README.md`. It is the source of truth
for *code* state; the Obsidian vault (`~/Documents/Baclog`, start at `estado-actual.md`) stays the
source of truth for *product* state — screens, roadmap, milestones.

## The cycle — part of "definition of done", not optional

1. **Before starting** → read the `state/<your-domain>.md` you're about to touch and run
   `grep -ri "<keyword>" .claude/knowledge/learnings/`. Do it *before* debugging, not after losing an
   hour.
2. **After solving a non-obvious bug** → add `learnings/YYYY-MM-DD-slug.md` (copy `_TEMPLATE.md`). The
   filter: *would a reasonable person have fallen for this?* If you can lock it in with an executable
   guardrail (test/lint/CI), do that and record it — **that** is what prevents the relapse; the doc is
   the backup.
3. **After changing state** (new feature, migration, architecture decision, new dependency) → update
   the matching `state/` file **in the same commit/PR**. A `state/` updated "later" is a lying
   `state/`, and a lying one is worse than none because it gets read with confidence.

Rule of thumb for where something belongs: true regardless of the current code → this file. True
today, may change → `state/`. Already happened and hurt → `learnings/`.
