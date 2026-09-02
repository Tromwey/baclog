# Guardrails — checks automáticos y qué error previene cada uno

La documentación ayuda a *recordar*; un guardrail ejecutable es lo que **impide que un error vuelva**.
La meta: cada aprendizaje en `learnings/` que se pueda automatizar termina como una fila de esta tabla.

Una fila se escribe desde el error, no desde el check: la columna *"Qué previene"* debe nombrar el bug
concreto que ya ocurrió, no describir lo que el test hace.

| Guardrail | Dónde corre | Qué previene | Archivo |
|---|---|---|---|
| `pnpm tsx scripts/check-album-match.ts` | manual (correr al tocar `resolvers/match.ts`) | Que el link-out exacto a TIDAL mande a un álbum equivocado: containment («Cars» reclamando «Cars 2», como pasó en recs), matching solo por título sin artista, sufijos «- Single»/«(Deluxe)» rompiendo la igualdad, y que un «(Alternative)» legítimo se colapse | `scripts/check-album-match.ts` |

## Comandos

- `pnpm lint` — ESLint (`eslint.config.mjs`, base `eslint-config-next`).
- `pnpm build` — `next build`; hoy es también el typecheck de facto (falla ante errores de TS).
- `npx tsc --noEmit` — typecheck aislado, más rápido que el build (`tsconfig.json`, `strict`).
- `pnpm tsx scripts/check-album-match.ts` — asserts del matcher de álbumes (puro, sin DB ni red); sale 1 al primer fallo.
- `pnpm eval:recos` — corre el harness de evaluación de recomendaciones
  (`scripts/eval-crossmedia.ts`); mide calidad de recos, **no** es una suite de tests.

## Dónde corre cada capa

- **pre-commit / pre-push**: no hay. El repo no tiene `.husky/` ni `.pre-commit-config.yaml`; nada
  se ejecuta automáticamente al commitear.
- **CI**: no hay. No existe `.github/workflows/` ni equivalente, y Vercel no corre checks en PRs.
- **Deploy**: manual (`pnpm ship` → `vercel --prod`, `pnpm beta` → `scripts/deploy-beta.sh`).
  Mergear a `main` **no** despliega.

Consecuencia: hoy todo check es manual y voluntario. La primera fila de la tabla de arriba
probablemente exija crear también la capa donde corra.

## Huecos conocidos (sin guardrail — cuidado manual)

<!--
Lo que sabemos que puede romperse y NADIE atrapa automáticamente. Cada hueco dice por qué no es
automatizable (o qué falta para serlo) y cuál es la verificación manual mientras tanto. Al crearse el
check, la entrada se mueve a la tabla de arriba.
-->
