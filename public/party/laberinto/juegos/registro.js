// Registro de minijuegos. Para agregar uno: crear juegos/<id>.js que llame a registerMinigame y sumar su ruta aquí.
// Contrato: { id, title, seconds, create(root, { params, seed, sfx, reducedMotion }) → { start(token), onWin, onLose, destroy() } }
const RUTAS = {
  memorama: './memorama.js',
  simon: './simon.js',
  deslizante: './deslizante.js',
  almas: './almas.js',
  cerradura: './cerradura.js',
  raices: './raices.js',
};
const juegos = new Map();

export function registerMinigame(def) {
  if (!def || !def.id || typeof def.create !== 'function') throw new Error('registerMinigame: falta id o create()');
  juegos.set(def.id, def);
}
export const disponible = id => juegos.has(id) || id in RUTAS;
export async function cargarMinijuego(id) {
  if (!juegos.has(id) && RUTAS[id]) await import(RUTAS[id]);
  return juegos.get(id) || null;
}
