import { test } from "node:test";
import assert from "node:assert/strict";
import { nextLabel, waitMeta } from "./wait-meta";
import { K, MIN_ENDS_DELTA, TINT_MAX_LUMINANCE, deltaE, mixHex, relativeLuminance, tintEnds } from "@/components/kura/tint";

// Run: pnpm tsx --test src/modules/backlog/wait-meta.test.ts

test("nextLabel: countdown, date, today", () => {
  assert.equal(nextLabel("3 d"), "en 3 d");
  assert.equal(nextLabel("14 h"), "en 14 h");
  assert.equal(nextLabel("16 oct"), "el 16 oct");
  assert.equal(nextLabel("hoy"), "hoy");
  assert.equal(nextLabel("oct 2026"), "en oct 2026");
  assert.equal(nextLabel("2027"), "en 2027");
});

test("waitMeta never says «el próximo el ya salió»", () => {
  assert.equal(waitMeta(5, ["ya salió", "16 oct", "3 d"]), "5 títulos · 1 ya salió · el próximo el 16 oct");
  assert.equal(waitMeta(2, ["ya salió", "ya salió"]), "2 títulos · 2 ya salieron");
  assert.equal(waitMeta(1, ["3 d"]), "1 título · el próximo en 3 d");
  assert.equal(waitMeta(0, []), "0 títulos");
  assert.equal(waitMeta(1, ["sin fecha"]), "1 título");
});

// WCAG 1.4.3 on tinted surfaces (critique 2026-09-27): text-2 on either end.
const TEXT_2 = "#b9b8c2";
const ratio = (a: string, b: string) => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("tintEnds caps pale palettes so --text-2 keeps AA", () => {
  for (const hexes of [["#ffffff"], ["#e8e4dc", "#c9c2b8"], ["#f5d0c0", "#ffffff"], ["#9a9a9a"]]) {
    for (const end of tintEnds(hexes)) {
      assert.ok(relativeLuminance(end) <= TINT_MAX_LUMINANCE + 1e-3, `${hexes} → ${end}`);
      assert.ok(ratio(TEXT_2, end) >= 4.5, `${hexes} → ${end}: ${ratio(TEXT_2, end).toFixed(2)}`);
    }
  }
});

test("tintEnds leaves dark, saturated palettes as they were", () => {
  const [top] = tintEnds(["#7a2e14", "#301008"]);
  // Under the cap, so exactly the system's mix (k = 1 − 0.45·0.78).
  assert.equal(top, mixHex("#7a2e14", "#101013", K));
  assert.ok(relativeLuminance(top) < TINT_MAX_LUMINANCE);
});

test("saveSheetLabel describes the change", async () => {
  const { saveSheetLabel } = await import("./save-label");
  const names: Record<string, string> = { a: "ghibli completo", b: "música 2026", c: "pendientes" };
  const of = (id: string) => names[id];
  assert.equal(saveSheetLabel(["a"], new Set(["a"]), of), "Listo");
  assert.equal(saveSheetLabel(["a"], new Set(["a", "b"]), of), "Guardar en música 2026");
  assert.equal(saveSheetLabel([], new Set(["b"]), of), "Guardar en música 2026");
  assert.equal(saveSheetLabel(["a"], new Set(["a", "b", "c"]), of), "Guardar en 2 colecciones");
  assert.equal(saveSheetLabel(["a", "b"], new Set(["a"]), of), "Quitar de música 2026");
  assert.equal(saveSheetLabel(["a"], new Set(), of), "Quitar de tus colecciones");
  assert.equal(saveSheetLabel([], new Set(), of), "Elige una colección");
  assert.equal(saveSheetLabel(["a"], new Set(["b"]), of), "Guardar cambios");
});

// Degradado plano (founder 2026-09-28): the two most dominant colours of a
// cover are often one hue twice — tone 2 then comes from the rest of the palette.
test("tintEnds picks a distinct tone 2 when the first two collapse", () => {
  const flat = {
    burning: ["#325aa6", "#4c6ab1", "#3562ac", "#164893", "#193a70"],
    hermoso: ["#ce2727", "#b62426", "#e62e29", "#4f58a6", "#ec8e52"],
    mosca: ["#082b7d", "#2e498c", "#354777", "#173783", "#26396e"],
  };
  for (const [name, hexes] of Object.entries(flat)) {
    const [top, end] = tintEnds(hexes);
    const [, plain] = tintEnds(hexes.slice(0, 2));
    assert.ok(deltaE(top, plain) < MIN_ENDS_DELTA, `${name}: the first pair really is flat`);
    assert.ok(deltaE(top, end) > deltaE(top, plain), `${name}: ${plain} → ${end}`);
    assert.ok(ratio(TEXT_2, end) >= 4.5, `${name}: AA on the new tone 2`);
  }
});

test("tintEnds keeps tone 2 = second colour when the pair already reads", () => {
  const lively = ["#82c5c7", "#d22917", "#eaac5c", "#b6b2a6", "#f2ecda"];
  assert.deepEqual(tintEnds(lively), tintEnds(lively.slice(0, 2)));
});
