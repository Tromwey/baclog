# Fixtures de API — capturas reales ANONIMIZADAS

- Son respuestas reales del servidor, pasadas por `_anonymize.py`: handles → `qa_founder`/`qa_persona_NN`, nombres → "Persona …", ids de usuario/colección/reseña/fiesta/sesión/evento → UUIDs sintéticos, avatares/tokens/playlists/correos/reseñas/vibras → valores neutros. Títulos del catálogo, portadas, paletas y fechas quedan tal cual.
- **NUNCA commitear fixtures crudos** (el repo es público): traen handles, nombres, avatares e ids de personas reales.
- Recapturar: guarda las respuestas crudas en un directorio fuera del repo (p. ej. el scratchpad), corre `python3 _anonymize.py <dir> --map-out <fuera-del-repo>/map.json` (el script falla cerrado si queda un UUID sin clasificar o un handle/nombre real) y solo entonces copia los `.json` aquí. El `map.json` (real → falso) sirve para actualizar literales de tests y NO se commitea.
- Después: `./gradlew :app:testDebugUnitTest` en verde y el grep de handles reales vacío sobre `android/app/src/test/`.
