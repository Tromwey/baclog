---
id: 2026-09-21-theme-inline-redefinir-un-token-por-subarbol-no-hace-nada
domain: frontend
guardrail: none (comprobación manual — ver Prevención)
status: resolved
---

# Con `@theme inline`, redefinir un token de Tailwind en un subárbol NO hace nada (y compila limpio)

## Síntoma

Para darle Space Mono SOLO al feed se scopeó el token:

```css
.feed-v8 { --font-mono: "Space Mono", ui-monospace, monospace; }
```

`tsc`, `eslint` y `next build` pasan, la regla se emite tal cual en el CSS
compilado… y el feed sigue renderizando **Red Hat Mono**. Nada avisa: no hay
error, no hay warning, y la regla existe en el bundle, así que revisar el CSS
generado buscando `.feed-v8` te confirma un cambio que no tiene efecto.

## Causa raíz

`src/app/globals.css` declara el bloque como **`@theme inline`** (línea ~125).
El modificador `inline` hace que Tailwind **sustituya el VALOR** del token
dentro de la utility en vez de emitir una referencia a la variable. La utility
compilada es:

```css
.font-mono{font-family:var(--font-red-hat-mono), "Red Hat Mono", ui-monospace, monospace}
```

No aparece `var(--font-mono)` por ningún lado. Por eso re-apuntar `--font-mono`
en un subárbol es inerte: ningún selector lo lee. Sin `inline`, la utility
habría salido como `font-family:var(--font-mono)` y el scope habría funcionado.

## Prevención

- **El fix**: una regla real, no una redefinición de token.

  ```css
  .feed-v8 .font-mono { font-family: "Space Mono", ui-monospace, monospace; }
  ```

  Va **sin `@layer`**, así que le gana a la utility (que vive en
  `@layer utilities`) sin pelear especificidad.
- **La comprobación que de verdad cierra el caso** es el estilo COMPUTADO en el
  navegador, no el CSS emitido:
  `getComputedStyle(document.querySelector('.feed-v8 .font-mono')).fontFamily`.
  Debe decir `"Space Mono"`, y fuera del scope debe seguir diciendo
  `"Red Hat Mono"`. Mirar el bundle no distingue "la regla existe" de "la regla
  manda" — que es justo el modo de fallo.
- **Callejón sin salida**: pensar que con que `.feed-v8` (0,1,0) empate a
  `:root` (0,1,0) y venga después en el archivo ya gana. El problema no es
  cascada ni orden: es que la utility **nunca lee la variable**.
- Aplica a CUALQUIER token de `@theme inline` que se quiera variar por
  pantalla, no solo a las fuentes. Los colores del mismo scope (`--text-2`,
  `--text-3`, `--glass-bg`) SÍ funcionan porque esas utilities se generan
  desde `--color-*` en el bloque `:root` normal y sí emiten `var(...)`.
