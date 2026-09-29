---
id: 2026-09-29-kura-seal-iniciales-descentradas
domain: frontend
guardrail: none (CSS en cascada; no hay test visual — el fix es inline en `Seal`)
status: resolved
---

# Las iniciales del sello (`Seal`) salen arriba a la izquierda del disco

## Síntoma
Un `Seal` sin foto (iniciales) dibuja el texto pegado al borde superior-izquierdo del círculo, no
centrado. `getComputedStyle(seal).display` da `block` (o `inline-block`) aunque el componente lleva
`className="kura-seal flex items-center justify-center …"`.

## Causa raíz
`globals.css` tiene DOS reglas `.kura-seal`: la del wordmark B (mono "KURA": `display: inline-block`,
`padding-left: .24em`, `letter-spacing: .24em`) y la del sello de persona (Newsreader itálica). Son
CSS sin capa, y el CSS sin capa le gana a cualquier utilidad de Tailwind v4 (`@layer utilities`): el
`flex` del componente pierde contra el `inline-block` de la marca B, y el `padding-left` de la B
empuja las iniciales a la derecha. Dentro de un padre flex, `inline-block` se "blockifica" → `block`.

## Prevención
- Fix: `Seal` (`src/components/kura/components.tsx`) pone `display: flex; padding-left: 0` INLINE
  (el inline gana a ambas reglas). El arreglo de fondo sería renombrar la clase del wordmark B
  (`.kura-seal` → p. ej. `.kura-wordmark-b`) en `globals.css` + `Wordmark`.
- Regla general: una clase de `globals.css` sin capa anula las utilidades de Tailwind del mismo
  elemento. Si un `flex`/`p-*` "no hace nada", busca la clase global con `grep -n "^\.<clase>"`
  antes de pelearte con el orden de las utilidades.
- Callejón sin salida: subir la especificidad con `!flex` o añadir más utilidades — el problema es
  la capa, no el orden.
