# Kura · la app web firmada adopta el sistema — brief común para los agentes

> Decisión del founder (2026-09-24): **la app web adopta Kura**. El dominio y el proyecto de Vercel siguen como `baclog`; las RUTAS (`/backlogs`, `/item/...`) y la base (`backlog*`) no cambian. Solo cambia lo que el usuario ve y lee.

## Fuentes de verdad (léelas antes de tocar tu área)

- `design/kura/sistema-de-diseno.dc.html` — reglas. Su `<script>` final tiene tokens, escala tipográfica, radios, sombras, medidas, glifos, estados, patrones (vacío · cargando · error · sin conexión · confirmar y deshacer · aviso de estreno · guardar · links y cuenta), privacidad, voz/vocabulario y movimiento.
- `design/kura/flujos-v2.dc.html` — 12 flujos, 89 pantallas de 390×844. Partido por pantalla (HTML con estilos inline, cópialos con fidelidad): `/private/tmp/claude-501/-Users-ericbriseno-baclog/a2c82526-37dc-4405-8355-afb9150bdade/scratchpad/kura/screens-full/NN-<pantalla>.html`. El script de datos completo (regla `adapt()`, `MIX`, `NPEC`, `DF`, `RX`, `ST`…): `.../scratchpad/kura/full-script.js`.
- Feed v10: el mock está descrito en `ios/BRIEF.md` (sección Feed) y ya implementado en la app como "Feed v8 Stack" (`(app)/feed/`); v10 solo cambia detalles.
- Lo ya hecho en web con Kura y que debes REUTILIZAR: `src/components/kura/tint.ts` (superficie teñida `tintSurface` 168° / `tintSurfaceVertical` 180° / `tintCard`, `sealColors`, `releaseLabel` "3 d / 14 h / 16 oct / hoy / ya salió", `releaseSentence`) y `src/components/kura/components.tsx` (Wordmark, BrandLockup, Glyph + `GlyphKind`, `stateGlyph`, CHIP_44/BackChip, SOLID_BUTTON/GLASS_BUTTON/HONEY_BUTTON/FIELD, SectionTitle, Mono, Seal, CountRibbon, formatCount/formatMil, Cover 2:3 · 1:1 con glifo o pill de espera, CollectionCard con lomo (150/120/104), CtaCard, CreditsLink). Las páginas públicas `/u/*` ya son Kura: úsalas como referencia de "cómo se escribe Kura en este repo".

## Ya está hecho a nivel global (no lo repitas)

- `globals.css`: los tokens raíz YA son Kura — `--accent` miel `#efce8d` (`--accent-press`, `--accent-soft`), `--hot`/`--obsessing` coral `#ec8e76`, `--radar` pizarra `#9cbae1`, `--completed` salvia `#a0cba0`, `--st-*`, `--glass-art`, `--r-cover-s/l`, `--r-surface`, `--r-screen`, `--sh-cover/stack/float`; `font-display` y `font-serif` y `font-brand` = **Newsreader**; `font-sans` = Hanken Grotesk; `font-mono` = Red Hat Mono. Utilidades: `bg-honey`, `text-st-obsessed`, `rounded-[var(--r-screen)]`, `shadow-cover`, etc.
- `state-glyph.tsx`: el check "completo" ya va en salvia.
- Bricolage e Instrument Serif salieron de `layout.tsx` (solo quedan como fuentes de documento para las tarjetas exportables en `modules/cards`, que NO se tocan en esta pasada).

## Reglas duras (del sistema, no negociables)

1. **La portada es la única fuente de color.** Superficie teñida = paleta arrastrada hacia negro (`tint.ts`), un solo objeto por superficie, fundida a `--bg` en el último tercio fuera del feed. **Sin glow, sin blur de color, sin aura**: reemplaza `PaletteGlow`/`ProfileBackdrop`/`FeatureAura` por superficies teñidas planas. Sin portada no hay color.
2. **Un color, una función.** Miel solo en Seguir y en LA acción de acento de la pantalla, una vez. Coral = me obsesiona, pizarra = me gusta, salvia = completo, lavanda = aviso de estreno. **Sin rojo**: lo destructivo se entiende por el título y la confirmación.
3. **Sin bordes, sin glows, sin pulsos** (excepto esqueletos con pulso de opacidad 1.6 s entre s1 y s2, y entradas one-shot). Separación por relleno.
4. **Tipografía**: títulos de pantalla Newsreader 400 · 36 en **minúscula** ("tus colecciones"); secciones 24; título de obra Newsreader **itálica** 30 (19 en fila, 14 bajo portada); frase de vacío 32–34 con punto final; cuerpo Hanken 15–16 (400 cuerpo, 500 filas, 600 botones/handles); dato Red Hat Mono 11 MAYÚSCULAS +8 % (conteos 12–13). Nada de `font-extrabold`/`tracking-[-0.02em]` en display: Newsreader va en 400 y sin tracking negativo (salvo el wordmark −3.5 %).
5. **Componentes**: Volver y Opciones (···) 44 px vidrio a 64 del borde superior y 24 de los lados; **todas las acciones secundarias viven en Opciones**, la cabecera no lleva fila de botones. Botón sólido (`--text` sobre `--bg`) = la acción que cierra una hoja o flujo. Vidrio = acciones de pantalla, filtros inactivos. Campo = vidrio radio 16, 52 alto. Hoja = `--s1`/`--s2`, radio 26 arriba (o 36 flotante inset 8), asa 36×5, título Newsreader 22, acción sólida al final; **nunca dos hojas a la vez**. Filas 52 (ajustes) / 72 (gente) / 80 (título en lista). Dock: 4 tabs **Colecciones · Descubrir · Feed · Perfil**, vidrio `rgba(20,20,26,.5)` + blur 26, a 34 del borde inferior, punto en Feed con notificaciones nuevas.
6. **StatusPill**: glifo 13 + mono 12 en vidrio (card), disco 26 `--glass-art` sobre portada (cuadrícula), glifo 12 + conteo (ribbon), glifo 14 solo (filas). Estados como glifos, nunca puntos. Fecha de estreno: mono "17 JUL"; a menos de una semana "3 d"; el último día "14 h"; el día "HOY"; después "ya salió". El reloj es INDICADOR (pedido de aviso), no botón; **reloj y Completar nunca conviven**.
7. **Portadas 2:3 (cine/serie) y 1:1 (álbum)**, radio 14 grandes / 8 chicas, sombra `--sh-cover`. Todas las portadas de una card del mismo alto, alineadas a la base.
8. **Voz**: tuteo; primera persona para lo tuyo ("Me gusta"), tercera para otros ("Le gusta"); errores sin guiño, dicen qué pasó y qué hacer. Vocabulario: **colección** (nunca backlog/lista/estante), **tus colecciones**, **completar**, **guardar** (abre siempre la hoja "guardar en"), **tu gente**, **recap de agosto**, **crear cuenta**, **pediste que te avisáramos**. La marca se escribe **kura** (wordmark) o **Kura** en prosa; nunca "Baclog".
9. **Confirmar y deshacer**: solo se confirma lo irreversible (borrar colección, borrar cuenta escribiendo el @). Todo lo demás se hace al momento con aviso "Deshacer" (píldora `--s2` sobre el dock, 5 s, uno a la vez); fallos con triángulo + Reintentar.
10. **Movimiento**: portada compartida 320 ms spring; tinte 240 ms; hoja 280 ms; cambio de tab 0 ms; lo que cambia solo no se anima. Reusa `bl-press*`, `Sheet`/`useSheetMotion` y los `bl-*` de `globals.css` que ya existen.

## Cómo trabajar

- **Toca solo los archivos de tu área** (lista en tu prompt). Si necesitas cambiar un archivo compartido que no es tuyo, NO lo edites: repórtalo al final con el cambio propuesto.
- Componentes nuevos que sean Kura genéricos van en `src/components/kura/` SOLO si tu prompt te asigna ese directorio; si no, créalos dentro de tu área.
- No corras `pnpm dev` ni `next build` (el orquestador verifica al final). Sí corre `pnpm exec tsc --noEmit -p tsconfig.json` y `pnpm exec eslint <tus archivos>` hasta dejarlos limpios.
- No hagas commits.
- Lo que el mock pide y el producto NO tiene (dato o feature) se omite, no se inventa; lístalo en tu reporte. Lo que el producto tiene y el mock no dibuja se conserva con estilo Kura.
- Lee antes `.claude/knowledge/state/frontend.md` (tu área) y `grep -ri "<palabra>" .claude/knowledge/learnings/`. Al terminar, escribe en tu reporte los cambios de `state/` que el orquestador debe registrar (no edites `state/` tú).
