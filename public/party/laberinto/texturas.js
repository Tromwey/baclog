// Texturas procedurales del laberinto (0 KB de imágenes). Cada una devuelve un canvas de color y, si aplica, uno de relieve.
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Ruido fbm que repite en los bordes (para texturas en mosaico)
export function fbm(R, W, H, cx, cy, oct) {
  const out = new Float32Array(W * H); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++, amp *= 0.5) {
    const CX = cx << o, CY = cy << o, g = new Float32Array(CX * CY);
    for (let i = 0; i < g.length; i++) g[i] = R();
    for (let y = 0; y < H; y++) {
      const fy = y / H * CY, y0 = fy | 0, ty = fy - y0, sy = ty * ty * (3 - 2 * ty), r0 = y0 * CX, r1 = (y0 + 1) % CY * CX;
      for (let x = 0; x < W; x++) {
        const fx = x / W * CX, x0 = fx | 0, tx = fx - x0, sx = tx * tx * (3 - 2 * tx), x1 = (x0 + 1) % CX;
        const a = g[r0 + x0] + (g[r0 + x1] - g[r0 + x0]) * sx, b = g[r1 + x0] + (g[r1 + x1] - g[r1 + x0]) * sx;
        out[y * W + x] += amp * (a + (b - a) * sy);
      }
    }
    tot += amp;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function lienzo(W, H) { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
function pintar(W, H, fn) {
  const col = lienzo(W, H), alt = lienzo(W, H);
  const a = col.getContext('2d'), b = alt.getContext('2d'), ia = a.createImageData(W, H), ib = b.createImageData(W, H), o = [0, 0, 0, 0];
  for (let i = 0, j = 0; i < W * H; i++, j += 4) {
    fn(i, i % W, (i / W) | 0, o);
    ia.data[j] = o[0] * 255; ia.data[j + 1] = o[1] * 255; ia.data[j + 2] = o[2] * 255; ia.data[j + 3] = 255;
    ib.data[j] = ib.data[j + 1] = ib.data[j + 2] = o[3] * 255; ib.data[j + 3] = 255;
  }
  a.putImageData(ia, 0, 0); b.putImageData(ib, 0, 0);
  return [col, alt];
}

// Muro de bloques de piedra con musgo. 512 px = 2 m; filas de 0,5 m con juntas desplazadas.
export function texMuro(seed = 3) {
  const R = rng(seed), S = 512, FH = 128, filas = S / FH;
  const n1 = fbm(R, S, S, 6, 6, 5), n2 = fbm(R, S, S, 3, 3, 4), n3 = fbm(R, S, S, 24, 24, 2);
  const bloques = [];
  for (let f = 0; f < filas; f++) {
    const off = R() * S, bordes = []; let x = 0;
    while (x < S - 90) { bordes.push(x); x += 110 + R() * 120; }
    const tonos = bordes.map(() => 0.82 + R() * 0.3);
    bloques.push({ off, bordes, tonos });
  }
  return pintar(S, S, (i, x, y, o) => {
    const f = (y / FH) | 0, yy = y - f * FH, B = bloques[f], xx = (x + B.off) % S;
    let k = 0; while (k + 1 < B.bordes.length && B.bordes[k + 1] <= xx) k++;
    const x0 = B.bordes[k], x1 = k + 1 < B.bordes.length ? B.bordes[k + 1] : S;
    const d = Math.min(xx - x0, x1 - xx, yy, FH - yy) + (n3[i] - 0.5) * 5;
    const junta = sstep(2, 7, d), bisel = sstep(3, 16, d);
    const base = (0.34 + n1[i] * 0.22) * B.tonos[k] * (0.9 + 0.1 * bisel);
    const musgo = sstep(0.56, 0.72, n2[i] * 0.85 + n3[i] * 0.15) * (0.55 + 0.45 * (1 - junta * 0.4));
    let r = base * 1.0, g = base * 0.99, b = base * 0.95;
    r = r + (0.16 - r) * musgo * 0.8; g = g + (0.22 - g) * musgo * 0.8; b = b + (0.11 - b) * musgo * 0.8;
    const m = 0.13 + n3[i] * 0.05;
    o[0] = r * junta + m * (1 - junta); o[1] = g * junta + m * (1 - junta); o[2] = b * junta + m * 0.95 * (1 - junta);
    o[3] = junta * (0.55 + 0.35 * bisel + n3[i] * 0.1);
  });
}

// Suelo de tierra apisonada con piedras sueltas y hojas secas. 512 px = 2 m.
export function texSuelo(seed = 5) {
  const R = rng(seed), S = 512, n1 = fbm(R, S, S, 5, 5, 5), n2 = fbm(R, S, S, 20, 20, 2);
  const [col, alt] = pintar(S, S, (i, x, y, o) => {
    const v = 0.15 + n1[i] * 0.1 + (n2[i] - 0.5) * 0.04;
    o[0] = v * 1.08; o[1] = v; o[2] = v * 0.86; o[3] = 0.3 + n1[i] * 0.25 + n2[i] * 0.1;
  });
  const a = col.getContext('2d'), b = alt.getContext('2d');
  const envolver = (fn, x, y, r) => { for (const dx of [0, -S, S]) for (const dy of [0, -S, S]) if (x + dx > -r && x + dx < S + r && y + dy > -r && y + dy < S + r) fn(x + dx, y + dy); };
  for (let i = 0; i < 90; i++) {
    const x = R() * S, y = R() * S, rx = 4 + R() * 12, ry = rx * (0.6 + R() * 0.4), rot = R() * 3.14, t = 0.22 + R() * 0.14;
    envolver((px, py) => {
      a.fillStyle = `rgb(${t * 255 | 0},${t * 250 | 0},${t * 240 | 0})`; a.beginPath(); a.ellipse(px, py, rx, ry, rot, 0, 6.29); a.fill();
      a.fillStyle = 'rgba(0,0,0,.25)'; a.beginPath(); a.ellipse(px + 1.5, py + 2, rx, ry * 0.9, rot, 0, 3.14); a.fill();
      const gr = b.createRadialGradient(px, py, 0, px, py, rx); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#777');
      b.fillStyle = gr; b.beginPath(); b.ellipse(px, py, rx, ry, rot, 0, 6.29); b.fill();
    }, x, y, 16);
  }
  for (let i = 0; i < 70; i++) {
    const x = R() * S, y = R() * S, l = 5 + R() * 7, rot = R() * 6.28, h = 18 + R() * 20 | 0;
    envolver((px, py) => { a.fillStyle = `hsla(${h},45%,${18 + R() * 10}%,.85)`; a.beginPath(); a.ellipse(px, py, l, l * 0.45, rot, 0, 6.29); a.fill(); }, x, y, 12);
  }
  return [col, alt];
}

// Piedra lisa para lápidas (tileable, pequeña)
export function texPiedra(seed = 9) {
  const R = rng(seed), S = 128, n1 = fbm(R, S, S, 4, 4, 4), n2 = fbm(R, S, S, 16, 16, 2);
  return pintar(S, S, (i, x, y, o) => { const v = 0.5 + n1[i] * 0.22 + (n2[i] - 0.5) * 0.08; o[0] = v; o[1] = v * 0.99; o[2] = v * 0.96; o[3] = 0.5 + n2[i] * 0.5; })[0];
}

// Cara frontal de una lápida con nombre y fechas grabados
// glitch: parte de las fechas que NO se graba (la tapa un glitch animado en 3D); devuelve su lugar en canvas.glitch
export function texGrabado(nombre, fechas, piedra, glitch = null) {
  const W = 256, H = 312, c = lienzo(W, H), g = c.getContext('2d');
  g.fillStyle = g.createPattern(piedra, 'repeat'); g.fillRect(0, 0, W, H);
  const grabar = (t, y, font) => {
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillText(t, W / 2 + 1, y + 1.5);
    g.fillStyle = 'rgba(28,27,30,.88)'; g.fillText(t, W / 2, y);
  };
  g.strokeStyle = 'rgba(30,30,32,.35)'; g.lineWidth = 3; g.strokeRect(16, 16, W - 32, H - 32);
  // [Kura, founder 2026-10-02] Sin la cruz (en iOS el canvas la pintaba como emoji). En su lugar va el sello de
  // cera (motor.js lo coloca aquí arriba); debajo queda grabado su hueco: dos aros, visibles al romper el sello.
  const SY = 66;
  [[40, 2.5], [29, 1.5]].forEach(([r, w]) => {
    g.lineWidth = w;
    g.strokeStyle = 'rgba(255,255,255,.2)'; g.beginPath(); g.arc(W / 2 + 1, SY + 1.5, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(28,27,30,.6)'; g.beginPath(); g.arc(W / 2, SY, r, 0, Math.PI * 2); g.stroke();
  });
  const palabras = nombre.split(' '), lineas = []; let l = '';
  g.font = '700 27px Cinzel, Georgia, serif';
  for (const w of palabras) { const t = l ? l + ' ' + w : w; if (g.measureText(t).width > W - 52 && l) { lineas.push(l); l = w; } else l = t; }
  lineas.push(l);
  const y0 = 158 - (lineas.length - 1) * 17;   // [Kura] 140 → 158: el nombre baja para dejarle sitio al sello
  lineas.forEach((t, i) => grabar(t.toUpperCase(), y0 + i * 34, '700 25px Cinzel, Georgia, serif'));
  const yF = y0 + lineas.length * 34 + 12; let fs = 19;
  const fuente = () => `400 ${fs}px Cinzel, Georgia, serif`;
  g.font = fuente(); while (fs > 12 && g.measureText(fechas || '').width > W - 48) { fs--; g.font = fuente(); }
  const corte = glitch && fechas ? fechas.indexOf(glitch) : -1;
  if (corte < 0) grabar(fechas || '', yF, fuente());
  else {
    const pre = fechas.slice(0, corte), wF = g.measureText(fechas).width, x0 = W / 2 - wF / 2, wPre = g.measureText(pre).width;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillText(pre, x0 + 1, yF + 1.5);
    g.fillStyle = 'rgba(28,27,30,.88)'; g.fillText(pre, x0, yF);
    c.glitch = { x0: x0 + wPre, x1: x0 + wF, y: yF, fs, W, H, n: glitch.length };
  }
  g.fillStyle = 'rgba(40,38,36,.35)'; g.fillRect(W / 2 - 34, H - 44, 68, 2);   // [Kura] remate más abajo: ya no hay sello ahí
  return c;
}

// Letrero tallado para el dintel del mausoleo
export function texLetrero(texto, piedra) {
  const W = 512, H = 64, c = lienzo(W, H), g = c.getContext('2d');
  g.fillStyle = g.createPattern(piedra, 'repeat'); g.fillRect(0, 0, W, H);
  g.font = '700 34px Cinzel, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,.2)'; g.fillText(texto, W / 2 + 1, H / 2 + 2);
  g.fillStyle = 'rgba(26,25,28,.9)'; g.fillText(texto, W / 2, H / 2);
  return c;
}

function envolver(S, fn, x, y, r) { for (const dx of [0, -S, S]) for (const dy of [0, -S, S]) if (x + dx > -r && x + dx < S + r && y + dy > -r && y + dy < S + r) fn(x + dx, y + dy); }

// Adoquín irregular (como el camino de la entrada). 512 px = 2 m; celdas de Voronoi que repiten en los bordes.
export function texAdoquin(seed = 11) {
  const R = rng(seed), S = 512, G = 7, cs = S / G, pts = [];
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) pts.push([(gx + 0.15 + R() * 0.7) * cs, (gy + 0.15 + R() * 0.7) * cs, 0.72 + R() * 0.4]);
  const n1 = fbm(R, S, S, 8, 8, 4), n2 = fbm(R, S, S, 32, 32, 2);
  return pintar(S, S, (i, x, y, o) => {
    const gx = Math.floor(x / cs), gy = Math.floor(y / cs); let d1 = 1e9, d2 = 1e9, b = pts[0];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = gx + dx, cy = gy + dy, p = pts[((cy + G) % G) * G + ((cx + G) % G)];
      const px = p[0] + (cx < 0 ? -S : cx >= G ? S : 0), py = p[1] + (cy < 0 ? -S : cy >= G ? S : 0), d = Math.hypot(x - px, y - py);
      if (d < d1) { d2 = d1; d1 = d; b = p; } else if (d < d2) d2 = d;
    }
    const e = d2 - d1 + (n2[i] - 0.5) * 5, junta = sstep(3, 9, e), bis = sstep(4, 24, e);
    const base = (0.27 + n1[i] * 0.16) * b[2] * (0.82 + 0.18 * bis), m = 0.1 + n2[i] * 0.05;
    o[0] = base * junta + m * 1.05 * (1 - junta); o[1] = base * 0.98 * junta + m * 1.12 * (1 - junta); o[2] = base * 0.93 * junta + m * 0.8 * (1 - junta);
    o[3] = junta * (0.5 + 0.4 * bis) + n2[i] * 0.1;
  });
}

// Pasto seco con claros de tierra. 512 px = 4 m.
export function texPasto(seed = 19) {
  const R = rng(seed), S = 512, n1 = fbm(R, S, S, 4, 4, 5), n2 = fbm(R, S, S, 24, 24, 2);
  const [col, alt] = pintar(S, S, (i, x, y, o) => {
    const t = sstep(0.36, 0.6, n1[i]), v = 0.1 + n2[i] * 0.06;
    o[0] = v * (1.15 - 0.4 * t); o[1] = v * (1.0 + 0.22 * t); o[2] = v * (0.8 - 0.12 * t); o[3] = 0.4 + n2[i] * 0.3;
  });
  const a = col.getContext('2d');
  for (let i = 0; i < 6000; i++) {
    const x = R() * S, y = R() * S, l = 3 + R() * 7, ang = -Math.PI / 2 + (R() - 0.5) * 1.3;
    a.strokeStyle = `hsla(${55 + R() * 40},${18 + R() * 25}%,${12 + R() * 16}%,.8)`; a.lineWidth = 1;
    envolver(S, (px, py) => { a.beginPath(); a.moveTo(px, py); a.lineTo(px + Math.cos(ang) * l, py + Math.sin(ang) * l); a.stroke(); }, x, y, 10);
  }
  return [col, alt];
}

// Hojas de seto / ciprés. 256 px = 1 m.
export function texSeto(seed = 31) {
  const R = rng(seed), S = 256, n1 = fbm(R, S, S, 6, 6, 4);
  const [col, alt] = pintar(S, S, (i, x, y, o) => { const v = 0.05 + n1[i] * 0.07; o[0] = v * 0.8; o[1] = v * 1.3; o[2] = v * 0.72; o[3] = 0.25 + n1[i] * 0.3; });
  const a = col.getContext('2d'), b = alt.getContext('2d');
  for (let i = 0; i < 1100; i++) {
    const x = R() * S, y = R() * S, r = 3 + R() * 5, rot = R() * 6.28, l = 9 + R() * 16, h = 92 + R() * 38, s = 22 + R() * 22, al = 0.35 + R() * 0.55;
    envolver(S, (px, py) => {
      a.fillStyle = `hsl(${h},${s}%,${l}%)`; a.beginPath(); a.ellipse(px, py, r, r * 0.55, rot, 0, 6.29); a.fill();
      b.fillStyle = `rgba(255,255,255,${al})`; b.beginPath(); b.ellipse(px, py, r, r * 0.55, rot, 0, 6.29); b.fill();
    }, x, y, 8);
  }
  return [col, alt];
}
