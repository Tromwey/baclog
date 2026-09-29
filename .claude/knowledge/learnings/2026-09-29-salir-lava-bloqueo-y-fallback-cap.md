---
id: 2026-09-29-salir-lava-bloqueo-y-fallback-cap
domain: backend
guardrail: scripts/check-party-rules.ts (casos "Salir y volver a entrar (C3)" y "C5")
status: resolved
---

# Una membresía que se puede borrar y volver a crear lava cualquier estado que viva en su fila

## Síntoma
Revisión de colecciones de fiesta (ronda 2): (1) si "Salir de la fiesta" borrara la fila de
`backlog_collaborator`, un invitado bloqueado por el anfitrión saldría, volvería a entrar por el link
(INSERT nuevo, `blocked_at` null) y podría agregar otra vez. (2) Cuando el INSERT de `addSong` no escribía
nada, el fallback respondía `cap_reached` "por default" — al ANFITRIÓN (que no tiene tope) y en fiestas
ilimitadas, una mentira que la UI dibujaba como la hoja "ya pusiste tus 3.".

## Causa raíz
(1) El bloqueo por fiesta vive en la MISMA fila que la membresía; borrar la membresía borra el bloqueo.
(2) Un "no sé por qué no se escribió" se disfrazó de la causa más común.

## Prevención
- Salir: sin bloqueo se borra la fila; con bloqueo se conserva con `left_at` y re-entrar hace
  `ON CONFLICT DO UPDATE SET left_at = null` sin tocar `blocked_at` (`rules.ts` `leaveEffect`/`joinOutcome`).
  Toda lectura de membresía filtra `left_at IS NULL`. "Quitar y bloquear" a alguien que ya salió INSERTA la
  fila bloqueada (si no, saldría del bloqueo por no tener fila).
- Fallback: re-decidir con estado fresco (`lostAddOutcome`); si el estado fresco permite, es `conflict`
  logueado, nunca una causa inventada. Mismo patrón con RETURNING en quitar / quitar-y-bloquear.
- Callejón sin salida: "guardamos el bloqueo en otra tabla" — funciona, pero duplica el gate en cada
  lectura; la columna `left_at` en la misma fila es más barata y el invariante queda en un solo SQL.
