---
id: 2026-09-27-transformar-la-base-le-quita-el-safe-area
domain: frontend
guardrail: none (geometría de SwiftUI en runtime; se ve con `-kuraBodyLog YES` + `kDebugScrollLog` en el simulador, sin tests de UI en ios/)
status: resolved
---

# iOS: al cerrar un héroe (colección desde el perfil, ficha desde Masonry) la pantalla de atrás "se traba o parpadea" en el último frame

## Síntoma
Abrir se veía bien; al cerrar (Volver o borde), justo cuando la copia aterriza en su fila/celda, todo el
perfil o Tus colecciones salta ~34–96 pt en UN frame (se ve como parpadeo o doble imagen). Solo si esa
pantalla estaba desplazada hasta abajo (lo normal para llegar a la vitrina o a la Masonry). Ningún crash
y casi ningún body re-evaluado por frame: no era rendimiento.

## Causa raíz
La geometría del `ScrollView` de la BASE cambiaba mientras el héroe estaba abierto (log de
`onScrollGeometryChange`: contenedor 874 → 778 pt, offset 358 → 454, y de vuelta al final):
1. **Una transformación no-identidad alrededor de una vista le corta el safe area a todo lo de adentro.**
   La recesión del 4 % (`scaleEffect` — y también `visualEffect { scaleEffect }` — sobre la base) hacía
   que el scroll view dejara de extenderse bajo las barras; volvía a hacerlo cuando la escala regresaba a
   ~1, o sea en los últimos frames del cierre. Con `s = 1` constante el contenedor quedaba en 874 todo el
   tiempo.
2. Ocultar/mostrar la tab bar para el héroe (`store.heroCovers`) cambia el safe area inferior (83 → 34):
   con el scroll en su final, el offset se reajusta.

## Prevención
- La base de `HeroHost` ignora el safe area inferior (sus páginas ya traen 140/150 de padding para el
  dock) y NO lleva ninguna transformación: la recesión es `.heroRecedes()` sobre el CONTENIDO del
  scroll view de cada base (carrusel, perfil, colección), anclada al punto 50 %/40 % del host. Una
  transformación sobre el contenido de un scroll view no toca la geometría del scroll view.
- Regla: nunca escalar/rotar/desplazar con un efecto geométrico un contenedor que tiene scroll views
  que dependen del safe area; transforma su contenido o una capa sin scroll.
- Ya que estaba: la copia volando de un título dibujaba su `CoverView` con radio variable (body por
  frame) → ahora el radio va en un `clipShape` externo; y `CoverImageStore.anyCached(url)` evita que la
  copia muestre su paleta un par de frames al abrir (otro tamaño de la misma portada como suplente).
- Sin guardrail ejecutable. Para verlo: `-kuraBodyLog YES` (logs `SCROLL <base> off/ins/box`) con
  `-kuraScrollBottom YES -kuraHeroCollection <id> -kuraHeroDemo close`.
- Callejón sin salida: culpar al rendimiento del build Debug o a la recarga de imágenes, o "arreglarlo"
  retrasando la tab bar / alargando el resorte. El salto viene de la geometría, no del tiempo.
