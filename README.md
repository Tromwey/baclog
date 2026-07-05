# Baclog

Tus obsesiones — películas, series y música — en backlogs compartibles como tarjetas 9:16.

**PWA mobile-first** · Next.js (App Router) en Vercel · Neon Postgres + Drizzle · Auth.js v5 (email OTP, sin contraseñas).

## Correr localmente

```bash
pnpm install
cp .env.example .env.local   # y llena las vars de abajo
pnpm exec drizzle-kit migrate
pnpm dev
```

En dev, los códigos OTP se imprimen en la consola del server (`[dev-mailer] OTP para …`).

## Variables de entorno

| Var | Requerida | Notas |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon pooled connection string |
| `DATABASE_URL_UNPOOLED` | migraciones | Conexión directa para drizzle-kit |
| `AUTH_SECRET` | ✅ | `openssl rand -base64 32` |
| `TMDB_API_KEY` | opcional | Sin ella el catálogo de cine/series usa **fixtures** (la interfaz `VideoCatalog` intercambia la implementación sin tocar código) |
| `RESEND_API_KEY` | opcional | Sin ella el OTP va a consola. Con ella, emails reales vía Resend |
| `ODESLI_API_KEY` | opcional | Free tier keyless por default |

## Los 5 módulos (`src/modules/`)

Límites de monolito modular (ADR-010): extraer después es extracción, no rewrite.

- **`catalog`** — búsqueda TMDB + iTunes, caché de metadatos en Postgres (`refreshed_at` ≤ 3 meses), imágenes siempre hotlinked (nunca proxeadas)
- **`backlog`** — backlogs, ítems, estados, rating, eras mensuales (derivadas en lectura); `public.ts` = la única vía de lectura sin sesión (gateada por `isPublic`)
- **`links`** — deep links lazy: Odesli (música) + TMDB watch/providers (video) cacheados en `media_links`; fallback de búsqueda = nunca un tap muerto
- **`cards`** — render 100% client-side de tarjetas 1080×1920 (receipt/ticket/patrón); `CardItem` no tiene campo de imagen: los PNG exportados no pueden contener artwork (ADR-008)
- **`recs`** — sugerencias content-based (TMDB /similar o match por género), presentadas como IA

## Seguridad

- **Autorización en capa de app** (`src/authz`): todo acceso a datos de usuario pasa por `assertUser` / `assertOwnsBacklog` / `assertOwnsBacklogItem` — filtran por `userId` dentro del query y responden 404 (nunca confirman existencia ajena).
- Privacidad (Pilar 4): solo email + nombre visible + año de nacimiento (gate <13, jamás se muestra ni serializa). Borrar cuenta = cascade total. Backlogs privados por default; página pública es opt-in explícito.

## Docs

La fuente de verdad del producto vive en el vault de Obsidian del proyecto (requerimientos, ADRs, roadmap, pantallas).
