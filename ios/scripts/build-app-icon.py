#!/usr/bin/env python3
"""Genera ios/Kura/Resources/AppIcon.icon — el ícono Kura por capas (Liquid Glass).

Misma geometría que public/kura-icon.svg (sistema Kura §marca · ícono: un recorte de
colección, portadas 1:1 y 2:3 en cuatro columnas desfasadas, tres en washi, una en miel
con la k del wordmark), pero separada como pide Apple para Icon Composer:

  - Capas PLANAS y opacas: sin sombras, sin el borde-brillo, sin degradados. El vidrio
    (especular, sombra, translucidez) lo pone el sistema, y es dinámico; el SVG web lo
    trae "horneado" porque la web no tiene ese motor.
  - El fondo NO es una capa: es el `fill` del documento.
  - La opacidad de las piezas fantasma se fija aquí (Apple: importar opaco, ajustar en
    Icon Composer), no en el SVG.
  - La k va como trazo (contorno de Newsreader-MediumItalic.ttf): SVG no preserva fuentes.
  - Máximo 4 grupos, de atrás hacia adelante.

Uso:  python3 ios/scripts/build-app-icon.py   (desde la raíz del repo; requiere fontTools)
Afinar el vidrio en Icon Composer y, si se cambia la geometría, cambiar aquí Y en
public/kura-icon.svg. Previsualizar con ictool (ver ios/README.md).
"""
import json
import shutil
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "ios/Kura/Resources/AppIcon.icon"
FONT = ROOT / "ios/Kura/Resources/Fonts/Newsreader-MediumItalic.ttf"

U = 10.24  # el diseño está en una caja de 100; Icon Composer trabaja en 1024

WASHI = "#f4f3ee"
HONEY = "#efce8d"  # --accent
INK = "#0b0b0d"  # --on-accent

# (x, y, formato) en unidades de 100. "sq" = 1:1 (30×30, r 7.2) · "tall" = 2:3 (30×45, r 4.8)
GHOSTS = [
    (-4, -8, "tall"), (-4, 75, "tall"),
    (30, -22, "sq"), (30, 95, "tall"),
    (64, 38, "tall"), (64, 87, "sq"),
    (98, -14, "tall"), (98, 35, "sq"), (98, 69, "tall"),
]
WASHIS = [(-4, 41, "sq"), (30, 61, "sq"), (64, 4, "sq")]
HONEY_PIECE = (30, 12, "tall")


def rect(x, y, kind, fill):
    h, r = (45, 4.8) if kind == "tall" else (30, 7.2)
    f = lambda v: f"{v * U:.2f}".rstrip("0").rstrip(".")
    return (f'<rect x="{f(x)}" y="{f(y)}" width="{f(30)}" height="{f(h)}" '
            f'rx="{f(r)}" fill="{fill}"/>')


def svg(body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" '
            f'width="1024" height="1024">{body}</svg>\n')


def k_path():
    """La k, igual que el <text> del sistema: Newsreader itálica 500, 26/100, centrada
    en x=45 con letter-spacing −.9 y dominant-baseline central en y=35.5."""
    font = TTFont(FONT)
    upm, hhea = font["head"].unitsPerEm, font["hhea"]
    glyphs = font.getGlyphSet()
    name = font.getBestCmap()[ord("k")]
    s = 26 / upm
    width = font["hmtx"][name][0] * s - 0.9
    x0 = 45.0 - width / 2
    baseline = 35.5 + (hhea.ascent + hhea.descent) / 2 * s
    pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    glyphs[name].draw(TransformPen(pen, (s * U, 0, 0, -s * U, x0 * U, baseline * U)))
    return f'<path d="{pen.getCommands()}" fill="{INK}"/>'


def group(name, layer, image, *, specular, shadow, translucency=None, opacity=None):
    lyr = {"name": layer, "image-name": image}
    if opacity is not None:
        lyr["opacity"] = opacity
    g = {
        "name": name,
        "layers": [lyr],
        "lighting": "individual",
        "specular": specular,
        "shadow": {"kind": shadow, "opacity": 0.5},
        "translucency": translucency or {"enabled": False, "value": 0.5},
    }
    return g


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "Assets").mkdir(parents=True)
    assets = {
        "1-fantasmas.svg": "".join(rect(*p, WASHI) for p in GHOSTS),
        "2-washi.svg": "".join(rect(*p, WASHI) for p in WASHIS),
        "3-miel.svg": rect(*HONEY_PIECE, HONEY),
        "4-k.svg": k_path(),
    }
    for fname, body in assets.items():
        (OUT / "Assets" / fname).write_text(svg(body))

    icon = {
        # El mismo degradado del fondo web (#232329 → #0f0f12).
        "fill": {"linear-gradient": [
            "extended-srgb:0.13725,0.13725,0.16078,1.00000",
            "extended-srgb:0.05882,0.05882,0.07059,1.00000",
        ]},
        # Icon Composer lista los grupos de ADELANTE hacia atrás.
        "groups": [
            # La k flota sobre la miel: su propio grupo le da profundidad propia. Sin
            # especular ni sombra — es tinta, no un objeto de vidrio.
            group("4 k", "k", "4-k.svg", specular=False, shadow="none"),
            group("3 Miel", "Miel", "3-miel.svg", specular=True, shadow="neutral"),
            group("2 Washi", "Washi", "2-washi.svg", specular=True, shadow="neutral"),
            # Los fantasmas son la colección "detrás": opacos al importar, 16 % aquí
            # (el rgba(244,243,238,.16) del SVG web), sin sombra para que se hundan.
            group("1 Fantasmas", "Fantasmas", "1-fantasmas.svg", specular=False,
                  shadow="none", opacity=0.16),
        ],
        "supported-platforms": {"squares": ["iOS"]},
    }
    (OUT / "icon.json").write_text(json.dumps(icon, indent=2) + "\n")
    print(f"escrito {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
