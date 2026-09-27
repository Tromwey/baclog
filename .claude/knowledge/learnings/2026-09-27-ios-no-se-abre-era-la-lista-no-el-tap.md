---
id: 2026-09-27-ios-no-se-abre-era-la-lista-no-el-tap
domain: frontend
guardrail: none (verificación con XCUITest en una copia de scratch; el repo no tiene target de UI tests)
status: resolved
---

# iOS: "no se abre la página de seguidores de alguien" no era un tap roto

## Síntoma
El founder (iPhone real, build de main cc4f0a0) reportó que al tocar "N seguidores / N siguiendo" en el perfil
de otra persona "no se abre la página". Lo primero que se sospecha es navegación o hit-testing: `store.push` a
otra pila, el HeroHost de la raíz, `dockVisible`, algo encima de `FollowCounts`, un pop inmediato.

## Causa raíz
Nada de eso. Con taps reales (XCUITest) `FollowersView` se abría en TODOS los flujos: perfil directo,
feed→autor, ficha empujada, ficha abierta como héroe sobre Colecciones, mis seguidores→persona, el perfil propio,
en iOS 26.5 y 18.5, e incluso con el dedo 14 pt fuera del texto. En live, para otra persona la página abría
vacía, con "Solo @x ve su lista.", porque no existía ninguna ruta de listas ajenas. Para el usuario eso ES
"no se abre la página para ver los seguidores". El único tap mudo de verdad era `locked` (privado sin seguir o
bloqueado), y en live un privado da 404 antes de llegar ahí.

## Prevención
- El fix de producto: listas ajenas por `GET /people/{handle}/followers|following` según el ajuste del dueño
  (`followListsVisibility`), una nota con las palabras del 403 cuando no te deja, y ningún tap mudo: los
  conteos abren siempre, salvo en la vista previa y con un bloqueado, donde se dibujan como texto plano.
- Reproduce con taps reales antes de teorizar. El MCP del simulador puede quedar sin permiso y el repo no tiene
  target de UI tests. Receta: copia `ios/` al scratchpad (`rsync --exclude scratchpad`), agrega a
  `project.yml` un target `bundle.ui-testing` con `TEST_TARGET_NAME: Kura`, corre `xcodegen generate` (otra vez
  por cada archivo de test nuevo, porque xcodegen lista los archivos) y
  `xcodebuild test ... CODE_SIGNING_ALLOWED=NO`. Lanza con `-kuraScreen …` y busca los botones por label. Para
  simular el dedo fuera del centro, usa
  `app.windows.firstMatch.coordinate(withNormalizedOffset: .zero).withOffset(...)`.
- `isHittable == false` en iOS 18 (`KuraDockTabs`) es un falso negativo: las otras pestañas siguen en el ZStack
  con opacidad 0. El tap igual llega.
- El callejón sin salida: agrandar el área de toque de `FollowCounts` o tocar el NavigationStack "por si
  acaso". Si el tap abre la página en el sim con taps reales, el problema es lo que la página muestra.
