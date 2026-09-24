---
id: 2026-09-24-instancias-estaticas-de-fuente-variable-comparten-nombre
domain: infra
guardrail: none (proceso de assets; la app iOS verifica en DEBUG que `UIFont(name:)` no sea nil para cada peso)
status: resolved
---

# Las instancias estáticas sacadas de una fuente variable con fontTools salen TODAS con el mismo PostScript name

## Síntoma
Al instanciar `Newsreader[opsz,wght].ttf` en Regular/Medium/Italic/MediumItalic con `fontTools.varLib.instancer`, los cuatro TTF quedan con `nameID 6 = Newsreader16pt-Regular` (o `-Italic`) y la familia "Newsreader 16pt". En iOS, registrar dos archivos con el mismo PostScript name hace que solo uno "gane": `UIFont(name: "Newsreader-Medium")` devuelve nil y todo cae en Regular sin ningún error de build.

## Causa raíz
`instantiateVariableFont(..., updateFontNames=True)` solo reescribe la tabla `name` si el STAT de la fuente tiene un Axis Value para CADA coordenada pedida; Newsreader no tiene Axis Values para `opsz` intermedios (36, 24), así que lanza "Cannot find Axis Values" y el fallback deja la tabla `name` del default instance. Hanken Grotesk y Red Hat Mono sí actualizan, pero ponen el peso en la FAMILIA ("Hanken Grotesk Medium" / subfamilia "Regular"), que tampoco es lo que iOS espera.

## Prevención
- Tras instanciar, reescribir la tabla `name` a mano (IDs 1, 2, 4, 6, 16, 17) con `familia` + `subfamilia` + PostScript único (`Newsreader-MediumItalic`), y alinear `OS/2.usWeightClass`, `fsSelection` y `head.macStyle`. Es lo que hizo el script de la sesión 2026-09-24 (los TTF resultantes están en `ios/Kura/Resources/Fonts/`).
- Guardrail: la app iOS comprueba en DEBUG que cada nombre registrado en `UIAppFonts` resuelve con `UIFont(name:)`; si uno es nil imprime `UIFont.familyNames`. No hay guardrail en CI porque no hay CI para `ios/`.
- Callejón sin salida: pedir `axes: ["opsz"]` a `next/font/google` con `weight: ["400","500"]` falla ("Axes can only be defined for variable fonts when the weight property is nonexistent or set to `variable`") — para la web la variable se carga entera con `weight: "variable"`; instanciar estáticos es solo para iOS.
