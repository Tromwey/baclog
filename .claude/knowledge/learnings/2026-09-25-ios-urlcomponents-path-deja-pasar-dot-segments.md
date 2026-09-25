---
id: 2026-09-25-ios-urlcomponents-path-deja-pasar-dot-segments
domain: security
guardrail: none (la app iOS no tiene target de tests; el tipo `APIPath` lo hace estructural — todo `\(valor)` en un path pasa por `PathSegment.encode` — y el script de verificación vive fuera del repo)
status: resolved
---

# Un handle `../../account/x` en la app iOS llegaba a `/api/account/x` con el bearer

## Síntoma
`LiveAPI` interpolaba ids/handles en paths (`"people/\(handle)"`) y los asignaba a `URLComponents.path`. Con `handle = "../../account/x"` la URL resultante, ya normalizada por el servidor, era `/api/account/x`: un valor que viene del servidor, de un deep link o de un push podía dirigir un request CON bearer a otra ruta.

## Causa raíz
`URLComponents.path` percent-codifica lo que no es válido en un path, pero `/` y `.` SÍ son válidos: no los toca. Y el parser WHATWG (el de Next/Vercel) trata también `%2e`/`%2E` como punto en un dot-segment, así que codificar los puntos no basta.

## Prevención
- `APIPath` (`ios/Kura/Services/LiveAPI.swift`): cada interpolación = UN segmento, codificado con `urlPathAllowed` menos `/` y `;`; `""`, `.` y `..` se rechazan sin enviar. El request se arma con `percentEncodedPath` (el setter `path` re-codificaría el `%`).
- Guardrail: estructural (los helpers de `Endpoint` solo aceptan `APIPath`, y su interpolación solo acepta `String` → no hay forma de concatenar sin codificar). No hay test en el repo: la app iOS no tiene target de tests.
- Callejón sin salida: "codificar los puntos como `%2E`" — el servidor los vuelve a leer como `..`. Hay que rechazarlos.
