import assert from "node:assert/strict";
import test from "node:test";
import { toastText } from "./toast-text";

test("toastText drops the final period of a one-sentence aviso", () => {
  assert.equal(toastText("Esa fiesta ya no está disponible."), "Esa fiesta ya no está disponible");
  assert.equal(toastText("Link copiado"), "Link copiado");
  assert.equal(toastText("¿Seguro?"), "¿Seguro?");
  assert.equal(toastText("¡Listo!"), "¡Listo!");
  assert.equal(toastText("Esperando…"), "Esperando…");
});

test("toastText leaves two-or-more sentence avisos intact", () => {
  for (const s of [
    "Link nuevo listo. El anterior ya no funciona.",
    "¿Seguro? Esto no se deshace.",
    "Listo! Ya quedó.",
  ]) {
    assert.equal(toastText(s), s);
  }
});
