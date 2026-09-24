---
id: 2026-09-24-cron-de-estrenos-avisaba-a-quien-guardo-despues
domain: backend
guardrail: none (el cron no se puede correr contra la DB compartida; la regla vive en UN predicado, `pendingRecipient` en src/app/api/cron/release/route.ts, compartido por la query de títulos y la de dueños)
status: resolved
---

# "Hoy sale X" a quien guardó X días después de que salió, y títulos con dueño que se quedan sin correo

## Síntoma
En la DB, 7 de los 10 `release_notice` enviados eran de usuarios que guardaron el álbum 1–2 días DESPUÉS de su estreno ("Hoy sale …" falso). Y en ventanas con muchos estrenos de charts (18–22 álbumes en `[now−3 d, now]`) el `.limit(20)` se llenaba con álbumes sin dueño o ya avisados: un título con dueño pendiente podía salir de la ventana sin correo, con el run en verde (200).

## Causa raíz
La query de títulos filtraba por "está en la ventana" (+ "es álbum o tiene dueño"), no por "le debe un correo a alguien"; y la de destinatarios no miraba cuándo se guardó. Ventana de 3 días + guardado desde Descubrir/charts = el título ya salió cuando lo guardas, y aun así estás en la ventana.

## Prevención
- UN predicado (`pendingRecipient`: `notifyReleases` ∧ `user_item.added_at < release_date` ∧ sin `release_notice`) usado por las DOS queries — si divergen, un título se elige cada día y no le escribe a nadie, comiéndose el tope.
- `user_item.added_at` es la primera guardada (medido: nunca es posterior al mínimo de `backlog_item.added_at`), así que sirve de gate y de "lo guardaste el …".
- 500 cuando `failed > 0`: un cron que no avisó a nadie no puede verse verde.
- Callejón sin salida: subir el `.limit` o ensanchar la ventana. Solo retrasa el mismo desborde; el filtro correcto es "le debe correo a alguien", no "está en rango".
