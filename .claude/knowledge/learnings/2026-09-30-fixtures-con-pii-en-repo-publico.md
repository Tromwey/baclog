---
id: 2026-09-30-fixtures-con-pii-en-repo-publico
domain: security
guardrail: android/app/src/test/java/com/tromwey/kura/data/FixturePrivacyTest.kt (falla con handles/nombres/correos reales en los fixtures)
status: resolved
---

# Fixtures capturados con la cuenta del founder se commitearon a un repo PÚBLICO

## Síntoma
La auditoría de seguridad de la app Android encontró en `android/app/src/test/resources/fixtures/`
(commit `de7ea4a`, ya en `origin/main`, y `Tromwey/baclog` es público) los handles y nombres reales de
las listas de seguidos/seguidores del founder — que él tiene en `followListsVisibility: private` —, el
UUID de su cuenta, llaves de avatar, una reseña y el id de una playlist. El bearer, el correo y los
tokens sí se habían redactado.

## Causa raíz
El carril de datos capturó respuestas reales del servidor local (que es la DB de prod) para que los
modelos decodificaran "la verdad", con la instrucción de quitar "email y cualquier token". Nadie
enumeró handles, nombres, ids de usuario y texto libre como PII, y `state/android.md` documentó "sin
PII" sin verificarlo. Además nadie tenía presente que el repo es público.

## Prevención
- `FixturePrivacyTest` corre con la suite y rechaza cualquier fixture con datos reales.
- Recapturar = curl al servidor → `_anonymize.py --map-out` FUERA del repo → copiar solo la salida
  (`_FIXTURES.md`). Nunca commitear capturas crudas "mientras tanto".
- En cualquier brief que pida capturar datos reales: la lista de PII es handles, nombres, ids de
  usuario, correos, tokens, llaves de avatar y TODO texto escrito por usuarios (reseñas, bios, nombres
  de colecciones/fiestas). Y recordar que el repo es público.
- El historial sigue conteniendo los datos: limpiarlo (`git filter-repo` + push forzado) o volver el
  repo privado es decisión del founder; anotar aquí cuando se haga.
- Callejón sin salida: "es un test, nadie lo lee" — GitHub indexa los repos públicos.
