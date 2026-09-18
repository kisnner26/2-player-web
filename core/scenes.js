/**
 * scenes.js — retratos animados de cada juego para el hub.
 *
 * El hub no enseña cartas: enseña el juego. Cada entrada del catálogo tiene
 * aquí una escena que se parece a lo que va a pasar cuando pulses jugar —
 * las estelas de Curvas, el laberinto de Bombas, el tablero de Ajedrez, los
 * carriles de Ritmo. Dibujar ochenta y tres ilustraciones a mano no era
 * realista, así que el catálogo se agrupa en arquetipos: una escena escrita
 * una vez y parametrizada por juego (variante, semilla y colores propios).
 *
 * Todas las escenas son funciones puras de (contexto, ancho, alto, estado):
 * no guardan nada entre fotogramas. El estado que necesitan —el tiempo y una
 * aleatoriedad estable— llega en `S`, de forma que animar es solo volver a
 * llamarlas con otra `S.t`, y parar es dejar de llamarlas. Eso es lo que
 * permite que una ficha se anime solo mientras el ratón está encima.
 *
 * `S.r(i)` es aleatoriedad determinista por índice: la misma ficha dibuja
 * siempre el mismo laberinto, no uno nuevo en cada fotograma.
 */

import { TAU, clamp, lerp } from './math2d.js';

/* ---------------- Color ---------------- */

function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex, a) {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function mix(hexA, hexB, t) {
  const a = rgbOf(hexA), b = rgbOf(hexB);
  const c = (i) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}

/* ---------------- Primitivas de dibujo ---------------- */

/** Ejecuta `fn` con resplandor de neón: el acabado común de todo el catálogo. */
function glow(c, color, blur, fn) {
  c.save();
  c.shadowColor = color;
  c.shadowBlur = blur;
  fn();
  c.restore();
}

function rr(c, x, y, w, h, r) {
  const k = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  c.beginPath();
  c.moveTo(x + k, y);
  c.arcTo(x + w, y, x + w, y + h, k);
  c.arcTo(x + w, y + h, x, y + h, k);
  c.arcTo(x, y + h, x, y, k);
  c.arcTo(x, y, x + w, y, k);
  c.closePath();
}

function disco(c, x, y, r, color, blur = 10) {
  glow(c, color, blur, () => {
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  });
}

function linea(c, x1, y1, x2, y2, color, ancho, blur = 0) {
  const trazo = () => {
    c.strokeStyle = color;
    c.lineWidth = ancho;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  };
  if (blur) glow(c, color, blur, trazo); else trazo();
}

/**
 * Silueta de personaje: un cuerpo redondeado con dos ojos.
 * Aparece en media docena de escenas y es lo que da al catálogo la sensación
 * de que todos los juegos son del mismo mundo.
 */
function figura(c, x, y, s, color, { mirando = 1, ojos = true, patas = 0 } = {}) {
  glow(c, color, s * 0.5, () => {
    c.fillStyle = color;
    rr(c, x - s * 0.5, y - s * 0.62, s, s * 1.1, s * 0.42);
    c.fill();
  });
  if (patas) {
    c.strokeStyle = color;
    c.lineWidth = Math.max(1.4, s * 0.14);
    c.lineCap = 'round';
    for (const lado of [-1, 1]) {
      const p = Math.sin(patas + (lado > 0 ? Math.PI : 0)) * s * 0.22;
      c.beginPath();
      c.moveTo(x + lado * s * 0.22, y + s * 0.42);
      c.lineTo(x + lado * s * 0.22 + p, y + s * 0.78);
      c.stroke();
    }
  }
  if (ojos) {
    c.fillStyle = '#06060c';
    for (const lado of [-1, 1]) {
      c.beginPath();
      c.arc(x + s * (0.16 * lado + 0.1 * mirando), y - s * 0.14, s * 0.11, 0, TAU);
      c.fill();
    }
  }
}

/** Rejilla tenue: base común de las escenas de tablero y laberinto. */
function rejilla(c, x, y, w, h, paso, color) {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i <= Math.round(w / paso); i++) { c.moveTo(x + i * paso, y); c.lineTo(x + i * paso, y + h); }
  for (let j = 0; j <= Math.round(h / paso); j++) { c.moveTo(x, y + j * paso); c.lineTo(x + w, y + j * paso); }
  c.stroke();
  c.restore();
}

/* ---------------- Escenas ---------------- */
/* Firma común: (c, w, h, S, v) — v es la variante del juego concreto. */

const ESC = {};

/* — Paletas: Pong, Hockey, Pong Lineal — */
ESC.paletas = (c, w, h, S, v) => {
  const cy = h * 0.5;
  const t = S.t * 1.5;
  const bx = w * 0.5 + Math.sin(t) * w * 0.3;
  const by = cy + Math.sin(t * 1.7) * h * 0.26;
  const alto = h * (v === 'linea' ? 0.06 : 0.24);

  if (v === 'aire') {
    // Hockey: círculo central y línea de medio campo.
    c.strokeStyle = rgba('#ffffff', 0.14);
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(w * 0.5, cy, h * 0.2, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(w * 0.5, 0); c.lineTo(w * 0.5, h); c.stroke();
  }

  // Estela de la bola: cuatro fantasmas hacia atrás en el tiempo.
  for (let i = 4; i > 0; i--) {
    const tt = t - i * 0.08;
    c.globalAlpha = 0.1 * (5 - i);
    disco(c, w * 0.5 + Math.sin(tt) * w * 0.3, cy + Math.sin(tt * 1.7) * h * 0.26, h * 0.035, '#ffffff', 0);
  }
  c.globalAlpha = 1;
  disco(c, bx, by, h * 0.045, '#ffffff', 16);

  const paleta = (x, col, y) => glow(c, col, 14, () => {
    c.fillStyle = col;
    rr(c, x, y - alto / 2, w * 0.035, alto, w * 0.02);
    c.fill();
  });
  paleta(w * 0.09, S.a, cy + Math.sin(t * 1.7) * h * 0.2);
  paleta(w * 0.875, S.b, cy + Math.sin(t * 1.7 + 0.7) * h * 0.2);
};

/* — Muro de ladrillos: Muro Doble — */
ESC.ladrillos = (c, w, h, S) => {
  const cols = 7, filas = 3;
  const bw = (w * 0.7) / cols, bh = (h * 0.26) / filas;
  const ox = w * 0.15, oy = h * 0.37;
  for (let y = 0; y < filas; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (S.r(i) < 0.22 + Math.sin(S.t * 0.8 + i) * 0.06) continue;
      c.fillStyle = rgba(y === 0 ? S.a : y === 2 ? S.b : S.cat, 0.55);
      rr(c, ox + x * bw + 1.5, oy + y * bh + 1.5, bw - 3, bh - 3, 2);
      c.fill();
    }
  }
  const t = S.t * 2;
  disco(c, w * 0.5 + Math.sin(t) * w * 0.28, h * 0.2, h * 0.035, '#ffffff', 14);
  disco(c, w * 0.5 - Math.sin(t * 1.2) * w * 0.28, h * 0.8, h * 0.035, '#ffffff', 14);
  glow(c, S.a, 12, () => { c.fillStyle = S.a; rr(c, w * 0.5 + Math.sin(t) * w * 0.24 - w * 0.09, h * 0.06, w * 0.18, h * 0.035, 3); c.fill(); });
  glow(c, S.b, 12, () => { c.fillStyle = S.b; rr(c, w * 0.5 - Math.sin(t * 1.2) * w * 0.24 - w * 0.09, h * 0.9, w * 0.18, h * 0.035, 3); c.fill(); });
};

/* — Estelas curvas: Curvas — */
ESC.estela = (c, w, h, S) => {
  const dibujar = (color, semilla, fase) => {
    c.strokeStyle = color;
    c.lineWidth = Math.max(2, h * 0.028);
    c.lineCap = 'round';
    let x = w * (0.2 + S.r(semilla) * 0.2), y = h * (0.25 + S.r(semilla + 1) * 0.5), ang = S.r(semilla + 2) * TAU;
    const largo = 70;
    const avance = clamp(S.t * 26 + 24, 0, largo);
    glow(c, color, 12, () => {
      c.beginPath();
      let pintando = true;
      for (let i = 0; i < avance; i++) {
        ang += Math.sin(i * 0.19 + fase + semilla) * 0.24;
        x += Math.cos(ang) * w * 0.023;
        y += Math.sin(ang) * w * 0.023;
        if (x < w * 0.06 || x > w * 0.94) ang = Math.PI - ang;
        if (y < h * 0.08 || y > h * 0.92) ang = -ang;
        x = clamp(x, w * 0.06, w * 0.94);
        y = clamp(y, h * 0.08, h * 0.92);
        // Huecos: la marca de la casa en este juego.
        const hueco = i % 17 > 14;
        if (hueco) { pintando = false; continue; }
        if (!pintando) { c.moveTo(x, y); pintando = true; } else c.lineTo(x, y);
      }
      c.stroke();
    });
    return [x, y];
  };
  const p1 = dibujar(S.a, 3, 0);
  const p2 = dibujar(S.b, 11, 2.1);
  disco(c, p1[0], p1[1], h * 0.028, '#ffffff', 10);
  disco(c, p2[0], p2[1], h * 0.028, '#ffffff', 10);
};

/* — Estelas en ángulo recto: Ciclos de Luz — */
ESC.ciclos = (c, w, h, S) => {
  const paso = Math.max(8, Math.min(w, h) * 0.09);
  rejilla(c, 0, 0, w, h, paso, rgba(S.cat, 0.13));
  const trazar = (color, semilla, dirIni) => {
    let x = Math.round(w * (0.25 + S.r(semilla) * 0.1) / paso) * paso;
    let y = Math.round(h * 0.5 / paso) * paso;
    let d = dirIni;
    const pasos = Math.min(22, 8 + Math.floor(S.t * 7));
    glow(c, color, 12, () => {
      c.strokeStyle = color;
      c.lineWidth = Math.max(2, paso * 0.22);
      c.lineJoin = 'miter';
      c.beginPath();
      c.moveTo(x, y);
      for (let i = 0; i < pasos; i++) {
        if (S.r(semilla + i * 3) < 0.42) d = (d + (S.r(semilla + i * 5) < 0.5 ? 1 : 3)) % 4;
        const largo = paso * (1 + Math.floor(S.r(semilla + i * 7) * 2));
        x += [largo, 0, -largo, 0][d];
        y += [0, largo, 0, -largo][d];
        x = clamp(x, paso, w - paso); y = clamp(y, paso, h - paso);
        c.lineTo(x, y);
      }
      c.stroke();
    });
    return [x, y];
  };
  const a = trazar(S.a, 2, 0);
  const b = trazar(S.b, 17, 2);
  disco(c, a[0], a[1], paso * 0.24, '#ffffff', 12);
  disco(c, b[0], b[1], paso * 0.24, '#ffffff', 12);
};

/* — Laberinto: Tanques, Bombas, Bolitas vs Fantasma — */
ESC.laberinto = (c, w, h, S, v) => {
  const cols = 9, filas = Math.max(5, Math.round(cols * h / w));
  const cw = w / cols, ch = h / filas;
  const solido = (x, y) => (x % 2 === 1 && y % 2 === 1) || S.r(y * cols + x) < 0.16;

  for (let y = 0; y < filas; y++) {
    for (let x = 0; x < cols; x++) {
      if (!solido(x, y)) continue;
      c.fillStyle = v === 'come' ? rgba(S.cat, 0.3) : rgba('#ffffff', 0.1);
      rr(c, x * cw + 1, y * ch + 1, cw - 2, ch - 2, 2.5);
      c.fill();
      if (v !== 'come') {
        c.strokeStyle = rgba(S.cat, 0.35);
        c.lineWidth = 1;
        c.stroke();
      }
    }
  }

  if (v === 'come') {
    // Puntitos por comer en los pasillos libres.
    for (let y = 0; y < filas; y++) {
      for (let x = 0; x < cols; x++) {
        if (solido(x, y) || S.r(200 + y * cols + x) < 0.4) continue;
        c.fillStyle = rgba('#ffffff', 0.35);
        c.beginPath(); c.arc(x * cw + cw / 2, y * ch + ch / 2, 1.6, 0, TAU); c.fill();
      }
    }
  }

  const ciclo = (S.t * 0.9) % 1;
  const px = cw * (0.5 + 2 + Math.sin(S.t * 1.3) * 1.6), py = ch * (filas - 1.5);
  const qx = cw * (cols - 2.5 - Math.sin(S.t) * 1.4), qy = ch * 1.5;

  if (v === 'bala') {
    // Trayectoria de bala con un rebote en la pared.
    const bx = lerp(px, w * 0.9, ciclo), by = lerp(py, h * 0.15, ciclo);
    linea(c, px, py, bx, by, rgba('#ffffff', 0.5), 1.4);
    disco(c, bx, by, 2.4, '#ffffff', 8);
    glow(c, S.a, 12, () => { c.fillStyle = S.a; rr(c, px - cw * 0.32, py - ch * 0.32, cw * 0.64, ch * 0.64, 3); c.fill(); });
    glow(c, S.b, 12, () => { c.fillStyle = S.b; rr(c, qx - cw * 0.32, qy - ch * 0.32, cw * 0.64, ch * 0.64, 3); c.fill(); });
  } else if (v === 'bomba') {
    // Onda expansiva en cruz.
    const r = ciclo;
    glow(c, '#ffd166', 20, () => {
      c.fillStyle = rgba('#ffd166', 0.7 * (1 - r));
      const l = cw * 2.2 * r;
      c.fillRect(w * 0.5 - l, h * 0.5 - ch * 0.3, l * 2, ch * 0.6);
      c.fillRect(w * 0.5 - cw * 0.3, h * 0.5 - l * 0.8, cw * 0.6, l * 1.6);
    });
    figura(c, px, py, cw * 0.6, S.a);
    figura(c, qx, qy, cw * 0.6, S.b, { mirando: -1 });
  } else {
    figura(c, px, py, cw * 0.62, S.a);
    // Fantasma: cuerpo con faldón ondulado.
    glow(c, S.b, 12, () => {
      c.fillStyle = S.b;
      c.beginPath();
      c.arc(qx, qy - ch * 0.1, cw * 0.32, Math.PI, 0);
      c.lineTo(qx + cw * 0.32, qy + ch * 0.3);
      for (let i = 0; i < 3; i++) c.lineTo(qx + cw * 0.32 - cw * 0.213 * (i + 1), qy + ch * (i % 2 ? 0.3 : 0.14));
      c.closePath();
      c.fill();
    });
  }
};

/* — Órbita y gravedad: Duelo Estelar, Piloto y Artillero — */
ESC.orbita = (c, w, h, S, v) => {
  const cx = w * 0.5, cy = h * 0.5;
  const sol = Math.min(w, h) * 0.1;
  for (let i = 3; i > 0; i--) {
    c.strokeStyle = rgba(S.cat, 0.1);
    c.lineWidth = 1;
    c.beginPath(); c.ellipse(cx, cy, sol * (1.8 + i * 1.1), sol * (1.2 + i * 0.8), 0.4, 0, TAU); c.stroke();
  }
  for (let i = 0; i < 14; i++) {
    c.fillStyle = rgba('#ffffff', 0.15 + S.r(i) * 0.4);
    c.beginPath(); c.arc(S.r(i * 2) * w, S.r(i * 2 + 1) * h, 0.9, 0, TAU); c.fill();
  }
  if (v !== 'torreta') disco(c, cx, cy, sol, mix(S.cat, '#ffffff', 0.35), 34);

  const nave = (ang, r, color, disparo) => {
    const x = cx + Math.cos(ang) * r * 1.7, y = cy + Math.sin(ang) * r;
    c.save();
    c.translate(x, y);
    c.rotate(ang + Math.PI / 2);
    glow(c, color, 14, () => {
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(0, -h * 0.07); c.lineTo(h * 0.045, h * 0.05); c.lineTo(0, h * 0.025); c.lineTo(-h * 0.045, h * 0.05);
      c.closePath(); c.fill();
    });
    // Llama del propulsor, parpadeando.
    c.fillStyle = rgba('#ffd166', 0.5 + Math.sin(S.t * 22) * 0.3);
    c.beginPath(); c.moveTo(-h * 0.018, h * 0.045); c.lineTo(0, h * 0.11); c.lineTo(h * 0.018, h * 0.045); c.closePath(); c.fill();
    c.restore();
    if (disparo) linea(c, x, y, x + Math.cos(ang - 1.6) * w * 0.3, y + Math.sin(ang - 1.6) * w * 0.3, rgba(color, 0.55), 1.6, 8);
    return [x, y];
  };

  if (v === 'torreta') {
    // Una sola nave: uno pilota, el otro apunta.
    const x = cx, y = cy;
    glow(c, S.a, 16, () => { c.fillStyle = S.a; c.beginPath(); c.arc(x, y, sol * 0.9, 0, TAU); c.fill(); });
    const ang = S.t * 1.6;
    linea(c, x, y, x + Math.cos(ang) * w * 0.42, y + Math.sin(ang) * w * 0.42, S.b, 3, 14);
    disco(c, x + Math.cos(ang) * w * 0.42, y + Math.sin(ang) * w * 0.42, 3, '#ffffff', 10);
    for (let i = 0; i < 5; i++) {
      const a = S.r(i) * TAU + S.t * 0.4;
      const rr2 = Math.min(w, h) * (0.35 + S.r(i + 9) * 0.2);
      c.strokeStyle = rgba('#ffffff', 0.4);
      c.lineWidth = 1.4;
      c.beginPath(); c.arc(cx + Math.cos(a) * rr2 * 1.5, cy + Math.sin(a) * rr2, Math.min(w, h) * 0.05, 0, TAU); c.stroke();
    }
  } else {
    nave(S.t * 1.1, sol * 2.6, S.a, true);
    nave(S.t * 1.1 + Math.PI, sol * 2.6, S.b, false);
  }
};

/* — Alunizaje — */
ESC.alunizaje = (c, w, h, S) => {
  for (let i = 0; i < 16; i++) {
    c.fillStyle = rgba('#ffffff', 0.2 + S.r(i) * 0.4);
    c.beginPath(); c.arc(S.r(i * 3) * w, S.r(i * 3 + 1) * h * 0.6, 0.9, 0, TAU); c.fill();
  }
  // Relieve lunar con una plataforma llana para posarse.
  c.beginPath();
  c.moveTo(0, h);
  let y = h * 0.78;
  for (let x = 0; x <= w; x += w / 10) {
    const plano = x > w * 0.55 && x < w * 0.78;
    y = plano ? h * 0.8 : h * (0.66 + S.r(Math.round(x)) * 0.22);
    c.lineTo(x, y);
  }
  c.lineTo(w, h);
  c.closePath();
  c.fillStyle = rgba(S.cat, 0.22);
  c.fill();
  c.strokeStyle = rgba(S.cat, 0.7);
  c.lineWidth = 1.4;
  c.stroke();
  linea(c, w * 0.57, h * 0.8, w * 0.76, h * 0.8, S.b, 2.5, 10);

  const desc = (Math.sin(S.t * 0.9) * 0.5 + 0.5);
  const nx = w * 0.5, ny = lerp(h * 0.2, h * 0.66, desc);
  const inc = Math.sin(S.t * 1.4) * 0.28;
  c.save();
  c.translate(nx, ny);
  c.rotate(inc);
  glow(c, S.a, 14, () => { c.fillStyle = S.a; rr(c, -h * 0.05, -h * 0.05, h * 0.1, h * 0.09, h * 0.03); c.fill(); });
  c.strokeStyle = S.a; c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(-h * 0.04, h * 0.04); c.lineTo(-h * 0.07, h * 0.1);
  c.moveTo(h * 0.04, h * 0.04); c.lineTo(h * 0.07, h * 0.1);
  c.stroke();
  glow(c, '#ffd166', 16, () => {
    c.fillStyle = rgba('#ffd166', 0.75);
    c.beginPath(); c.moveTo(-h * 0.025, h * 0.045); c.lineTo(0, h * 0.16 * (0.6 + Math.sin(S.t * 20) * 0.4)); c.lineTo(h * 0.025, h * 0.045); c.closePath(); c.fill();
  });
  c.restore();
};

/* — Balística por turnos: Artillería, Pelea de Nieve — */
ESC.balistica = (c, w, h, S, v) => {
  const suelo = (x) => h * (0.74 + Math.sin(x / w * 5 + 1) * 0.06);
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= w; x += 6) c.lineTo(x, suelo(x));
  c.lineTo(w, h);
  c.closePath();
  c.fillStyle = v === 'nieve' ? rgba('#dff2ff', 0.18) : rgba(S.cat, 0.2);
  c.fill();
  c.strokeStyle = v === 'nieve' ? rgba('#dff2ff', 0.6) : rgba(S.cat, 0.6);
  c.lineWidth = 1.4;
  c.stroke();

  // Parábola completa, dibujada punteada como la línea de tiro.
  const p = (S.t * 0.55) % 1;
  const x0 = w * 0.16, y0 = suelo(x0) - h * 0.08;
  const x1 = w * 0.84, y1 = suelo(x1) - h * 0.08;
  c.save();
  c.setLineDash([3, 4]);
  c.strokeStyle = rgba('#ffffff', 0.3);
  c.lineWidth = 1.2;
  c.beginPath();
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    const x = lerp(x0, x1, u), y = lerp(y0, y1, u) - Math.sin(u * Math.PI) * h * 0.42;
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.stroke();
  c.restore();
  disco(c, lerp(x0, x1, p), lerp(y0, y1, p) - Math.sin(p * Math.PI) * h * 0.42, h * 0.035, '#ffffff', 12);

  if (v === 'nieve') {
    for (let i = 0; i < 12; i++) {
      const x = (S.r(i) * w + S.t * 8) % w;
      c.fillStyle = rgba('#ffffff', 0.35);
      c.beginPath(); c.arc(x, (S.r(i + 20) * h * 0.7 + S.t * 12) % (h * 0.7), 1.3, 0, TAU); c.fill();
    }
  }
  figura(c, x0, y0 - h * 0.02, h * 0.15, S.a);
  figura(c, x1, y1 - h * 0.02, h * 0.15, S.b, { mirando: -1 });
};

/* — Arena circular: Sumo — */
ESC.arena = (c, w, h, S) => {
  const cx = w * 0.5, cy = h * 0.55;
  const r = Math.min(w, h) * (0.4 - Math.abs(Math.sin(S.t * 0.5)) * 0.06);
  glow(c, S.cat, 22, () => {
    c.strokeStyle = rgba(S.cat, 0.85);
    c.lineWidth = 2.5;
    c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke();
  });
  c.fillStyle = rgba(S.cat, 0.08);
  c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
  c.strokeStyle = rgba('#ffffff', 0.1);
  c.lineWidth = 1;
  c.beginPath(); c.arc(cx, cy, r * 0.6, 0, TAU); c.stroke();

  const empuje = Math.sin(S.t * 2.4) * r * 0.3;
  figura(c, cx - r * 0.34 + empuje, cy, r * 0.55, S.a);
  figura(c, cx + r * 0.34 + empuje, cy, r * 0.55, S.b, { mirando: -1 });
  // Chispa del choque, solo mientras se tocan.
  const choque = clamp(1 - Math.abs(empuje) / (r * 0.18), 0, 1);
  if (choque > 0) disco(c, cx + empuje, cy - r * 0.1, r * 0.12 * choque, '#ffffff', 18);
};

/* — Pulso lineal: Tira y Afloja, Pulso Chino, cuerdas táctiles — */
ESC.pulso = (c, w, h, S, v) => {
  const cy = h * 0.5;
  const marca = Math.sin(S.t * 1.6) * w * 0.22;
  linea(c, w * 0.1, cy, w * 0.9, cy, rgba('#ffffff', 0.25), v === 'barra' ? 6 : 3);
  if (v === 'barra') {
    // Barra táctil: el campo es la propia tira.
    c.strokeStyle = rgba('#ffffff', 0.18);
    c.lineWidth = 1;
    rr(c, w * 0.08, cy - h * 0.09, w * 0.84, h * 0.18, h * 0.05);
    c.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const x = lerp(w * 0.28, w * 0.72, i / 4);
    linea(c, x, cy - h * 0.06, x, cy + h * 0.06, rgba('#ffffff', i === 2 ? 0.4 : 0.15), 1.4);
  }
  glow(c, S.cat, 18, () => {
    c.fillStyle = mix(S.a, S.b, marca / (w * 0.44) + 0.5);
    rr(c, w * 0.5 + marca - w * 0.02, cy - h * 0.14, w * 0.04, h * 0.28, w * 0.02);
    c.fill();
  });
  figura(c, w * 0.13, cy, h * 0.2, S.a, { patas: S.t * 8 });
  figura(c, w * 0.87, cy, h * 0.2, S.b, { mirando: -1, patas: S.t * 8 + 1 });
};

/* — Deporte con pelota: Voley Slime, Fútbol Cabezón — */
ESC.deporte = (c, w, h, S, v) => {
  const suelo = h * 0.82;
  linea(c, 0, suelo, w, suelo, rgba('#ffffff', 0.25), 2);
  if (v === 'red') {
    linea(c, w * 0.5, suelo, w * 0.5, h * 0.34, rgba('#ffffff', 0.4), 2.5);
  } else {
    for (const x of [w * 0.04, w * 0.96]) {
      c.strokeStyle = rgba('#ffffff', 0.35);
      c.lineWidth = 2;
      c.strokeRect(x - w * 0.03, suelo - h * 0.26, w * 0.06, h * 0.26);
    }
  }
  const u = (S.t * 0.7) % 1;
  const bx = lerp(w * 0.24, w * 0.76, u);
  const by = suelo - h * 0.12 - Math.sin(u * Math.PI) * h * 0.5;
  disco(c, bx, by, h * 0.05, '#ffffff', 14);

  const salto = (f) => Math.max(0, Math.sin(S.t * 2.2 + f)) * h * 0.16;
  // Slime: media luna apoyada en el suelo.
  const cuerpo = (x, col, f) => glow(c, col, 14, () => {
    c.fillStyle = col;
    c.beginPath();
    c.arc(x, suelo - salto(f), h * 0.13, Math.PI, 0);
    c.closePath();
    c.fill();
  });
  cuerpo(w * 0.22, S.a, 0);
  cuerpo(w * 0.78, S.b, 1.6);
};

/* — Vuelo entre obstáculos: Aleteo, Justa Aérea, Globo — */
ESC.vuelo = (c, w, h, S, v) => {
  if (v === 'tuberias') {
    for (let i = 0; i < 3; i++) {
      const x = ((i * w * 0.42) - (S.t * 42) % (w * 0.42) + w * 0.3);
      const hueco = h * (0.34 + S.r(i) * 0.3);
      c.fillStyle = rgba(S.cat, 0.35);
      c.fillRect(x, 0, w * 0.09, hueco - h * 0.14);
      c.fillRect(x, hueco + h * 0.14, w * 0.09, h);
      c.strokeStyle = rgba(S.cat, 0.8);
      c.lineWidth = 1.4;
      c.strokeRect(x, 0, w * 0.09, hueco - h * 0.14);
      c.strokeRect(x, hueco + h * 0.14, w * 0.09, h - hueco - h * 0.14);
    }
  } else if (v === 'globo') {
    linea(c, 0, h * 0.88, w, h * 0.88, rgba('#ffffff', 0.2), 2);
    const gx = w * 0.5 + Math.sin(S.t * 0.9) * w * 0.18;
    const gy = h * 0.3 + Math.sin(S.t * 1.7) * h * 0.1;
    glow(c, S.cat, 20, () => {
      c.fillStyle = rgba(S.cat, 0.8);
      c.beginPath(); c.ellipse(gx, gy, h * 0.11, h * 0.13, 0, 0, TAU); c.fill();
    });
    linea(c, gx, gy + h * 0.13, gx, gy + h * 0.2, rgba('#ffffff', 0.5), 1.2);
  } else {
    for (let i = 0; i < 3; i++) {
      const y = h * (0.35 + i * 0.2);
      linea(c, w * (0.1 + S.r(i) * 0.2), y, w * (0.5 + S.r(i + 5) * 0.4), y, rgba('#ffffff', 0.18), 3);
    }
  }
  const ala = Math.sin(S.t * 11);
  const pajaro = (x, y, col, dir) => {
    glow(c, col, 12, () => {
      c.fillStyle = col;
      c.beginPath(); c.ellipse(x, y, h * 0.055, h * 0.045, 0, 0, TAU); c.fill();
    });
    c.strokeStyle = col;
    c.lineWidth = 2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x - dir * h * 0.09, y - ala * h * 0.07);
    c.stroke();
    c.fillStyle = '#06060c';
    c.beginPath(); c.arc(x + dir * h * 0.02, y - h * 0.012, h * 0.011, 0, TAU); c.fill();
  };
  pajaro(w * 0.3, h * (0.45 + Math.sin(S.t * 2.1) * 0.16), S.a, 1);
  pajaro(w * 0.62, h * (0.5 + Math.sin(S.t * 2.1 + 2) * 0.16), S.b, -1);
};

/* — Circuito visto desde arriba: Circuito, Turbo Circuito — */
ESC.circuito = (c, w, h, S, v) => {
  const cx = w * 0.5, cy = h * 0.5;
  const rx = w * 0.33, ry = h * 0.3;
  const pista = (ancho, color) => {
    c.strokeStyle = color;
    c.lineWidth = ancho;
    c.beginPath(); c.ellipse(cx, cy, rx, ry, 0.18, 0, TAU); c.stroke();
  };
  pista(Math.min(w, h) * 0.22, rgba('#ffffff', 0.09));
  c.save();
  c.setLineDash([6, 8]);
  pista(1.4, rgba('#ffffff', 0.28));
  c.restore();
  // Meta a cuadros.
  c.save();
  c.translate(cx + Math.cos(-0.4) * rx * Math.cos(0.18), cy + Math.sin(-0.4) * ry);
  c.rotate(0.9);
  for (let i = 0; i < 6; i++) {
    c.fillStyle = i % 2 ? '#ffffff' : '#00000000';
    c.fillRect(-Math.min(w, h) * 0.11 + i * Math.min(w, h) * 0.037, -2.5, Math.min(w, h) * 0.037, 5);
  }
  c.restore();

  const coche = (fase, color) => {
    const a = S.t * 1.2 + fase;
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    c.save();
    c.translate(x, y);
    c.rotate(a + Math.PI / 2 + 0.18);
    glow(c, color, 12, () => { c.fillStyle = color; rr(c, -h * 0.03, -h * 0.05, h * 0.06, h * 0.1, h * 0.02); c.fill(); });
    if (v === 'turbo') {
      c.fillStyle = rgba('#ffd166', 0.5);
      c.beginPath(); c.moveTo(-h * 0.02, h * 0.05); c.lineTo(0, h * 0.13); c.lineTo(h * 0.02, h * 0.05); c.closePath(); c.fill();
    }
    c.restore();
  };
  coche(0, S.a);
  coche(0.85, S.b);
};

/* — Duelo en línea: Esgrima, Golpe Final, Duelo del Oeste — */
ESC.duelo = (c, w, h, S, v) => {
  const suelo = h * 0.78;
  linea(c, 0, suelo, w, suelo, rgba('#ffffff', 0.25), 2);
  if (v === 'oeste') {
    // Sol bajo y siluetas: el instante antes de desenfundar.
    disco(c, w * 0.5, suelo - h * 0.02, h * 0.3, rgba('#ffd166', 0.18), 0);
    const listo = Math.sin(S.t * 1.2) > 0.6;
    if (listo) disco(c, w * 0.5, h * 0.2, h * 0.06, '#ffd166', 24);
  }
  const lunge = Math.max(0, Math.sin(S.t * 2)) * w * 0.1;
  const fa = w * 0.26 + lunge, fb = w * 0.74;
  figura(c, fa, suelo - h * 0.14, h * 0.2, S.a, { patas: S.t * 5 });
  figura(c, fb, suelo - h * 0.14, h * 0.2, S.b, { mirando: -1, patas: S.t * 5 + 2 });
  if (v === 'espada') {
    linea(c, fa + h * 0.08, suelo - h * 0.18, fa + h * 0.34, suelo - h * 0.24, S.a, 2.5, 12);
    linea(c, fb - h * 0.08, suelo - h * 0.2, fb - h * 0.3, suelo - h * 0.14, S.b, 2.5, 12);
  } else if (v === 'pelea') {
    disco(c, fa + h * 0.16, suelo - h * 0.2, h * 0.045, S.a, 14);
    if (lunge > w * 0.07) {
      glow(c, '#ffffff', 20, () => {
        c.strokeStyle = '#ffffff'; c.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          c.beginPath();
          c.moveTo(fb - h * 0.12 + Math.cos(a) * h * 0.04, suelo - h * 0.2 + Math.sin(a) * h * 0.04);
          c.lineTo(fb - h * 0.12 + Math.cos(a) * h * 0.09, suelo - h * 0.2 + Math.sin(a) * h * 0.09);
          c.stroke();
        }
      });
    }
  }
};

/* — Autoscroll rítmico: Salto Sincronizado — */
ESC.autoscroll = (c, w, h, S) => {
  const desp = (S.t * 60) % (w * 0.25);
  for (const [carril, col, fase] of [[0.42, S.a, 0], [0.78, S.b, 1.2]]) {
    const suelo = h * carril;
    linea(c, 0, suelo, w, suelo, rgba(col, 0.35), 2);
    for (let i = 0; i < 5; i++) {
      const x = i * w * 0.25 - desp;
      // Pinchos triangulares, la firma del género.
      c.fillStyle = rgba(col, 0.55);
      c.beginPath();
      c.moveTo(x, suelo); c.lineTo(x + w * 0.03, suelo - h * 0.08); c.lineTo(x + w * 0.06, suelo);
      c.closePath(); c.fill();
    }
    const salto = Math.abs(Math.sin(S.t * 3 + fase)) * h * 0.16;
    c.save();
    c.translate(w * 0.24, suelo - h * 0.05 - salto);
    c.rotate(S.t * 3 + fase);
    glow(c, col, 14, () => { c.fillStyle = col; rr(c, -h * 0.045, -h * 0.045, h * 0.09, h * 0.09, h * 0.015); c.fill(); });
    c.restore();
  }
};

/* — Serpiente Doble — */
ESC.serpiente = (c, w, h, S) => {
  const paso = Math.max(7, Math.min(w, h) * 0.085);
  rejilla(c, 0, 0, w, h, paso, rgba('#ffffff', 0.05));
  const cuerpo = (color, semilla, fase) => {
    let x = Math.round(w * (0.3 + S.r(semilla) * 0.3) / paso) * paso;
    let y = Math.round(h * (0.3 + S.r(semilla + 1) * 0.4) / paso) * paso;
    let d = Math.floor(S.r(semilla + 2) * 4);
    const n = 9;
    const avance = Math.floor(S.t * 4 + fase) % 4;
    for (let i = 0; i < n; i++) {
      if (S.r(semilla + i * 3 + avance) < 0.35) d = (d + 1) % 4;
      x = clamp(x + [paso, 0, -paso, 0][d], paso, w - paso);
      y = clamp(y + [0, paso, 0, -paso][d], paso, h - paso);
      c.fillStyle = rgba(color, 1 - i / (n + 3));
      rr(c, x - paso * 0.42, y - paso * 0.42, paso * 0.84, paso * 0.84, paso * 0.24);
      c.fill();
      if (i === 0) glow(c, color, 12, () => { c.fillStyle = color; c.fill(); });
    }
  };
  cuerpo(S.a, 4, 0);
  cuerpo(S.b, 21, 2);
  disco(c, Math.round(w * 0.5 / paso) * paso, Math.round(h * 0.5 / paso) * paso, paso * 0.26, '#ffd166', 14);
};

/* — Bloques que caen o se apilan — */
ESC.bloques = (c, w, h, S, v) => {
  const cols = v === 'torre' ? 1 : 6;
  const cw = w / (v === 'torre' ? 5 : 12);
  const base = h * 0.92;

  if (v === 'torre') {
    // Torre apilada con desalineación creciente.
    for (let i = 0; i < 7; i++) {
      const desv = Math.sin(i * 1.3 + S.r(i) * 3) * cw * 0.5;
      c.fillStyle = i % 2 ? rgba(S.a, 0.85) : rgba(S.b, 0.85);
      rr(c, w * 0.5 - cw * 1.1 + desv, base - (i + 1) * h * 0.1, cw * 2.2, h * 0.09, 3);
      c.fill();
    }
    const bx = w * 0.5 + Math.sin(S.t * 1.6) * w * 0.3;
    glow(c, S.cat, 16, () => {
      c.fillStyle = S.cat;
      rr(c, bx - cw * 1.1, base - 8 * h * 0.1 - h * 0.06, cw * 2.2, h * 0.09, 3);
      c.fill();
    });
    linea(c, bx, 0, bx, base - 8 * h * 0.1 - h * 0.06, rgba('#ffffff', 0.25), 1.2);
    return;
  }

  // Dos pozos enfrentados, como el versus real.
  for (const [ox, col, semilla] of [[w * 0.06, S.a, 0], [w * 0.55, S.b, 40]]) {
    c.strokeStyle = rgba('#ffffff', 0.15);
    c.lineWidth = 1;
    c.strokeRect(ox, h * 0.08, cw * cols, base - h * 0.08);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < cols; x++) {
        if (S.r(semilla + y * cols + x) < 0.42) continue;
        c.fillStyle = rgba(mix(col, '#ffffff', S.r(semilla + y * 9 + x) * 0.4), 0.75);
        rr(c, ox + x * cw + 1, base - (y + 1) * cw + 1, cw - 2, cw - 2, 2);
        c.fill();
      }
    }
    // Pieza cayendo: la posición depende del tiempo, el resto no.
    const caida = ((S.t * 0.8 + semilla * 0.01) % 1);
    const py = lerp(h * 0.12, base - 5 * cw, caida);
    const px = ox + Math.floor(2 + S.r(semilla + 3) * 2) * cw;
    glow(c, col, 14, () => {
      c.fillStyle = col;
      rr(c, px + 1, py + 1, cw - 2, cw - 2, 2); c.fill();
      rr(c, px + cw + 1, py + 1, cw - 2, cw - 2, 2); c.fill();
      rr(c, px + 1, py + cw + 1, cw - 2, cw - 2, 2); c.fill();
    });
  }
};

/* — Lluvia de Meteoros — */
ESC.lluvia = (c, w, h, S) => {
  const arena = Math.min(w, h) * (0.42 - Math.abs(Math.sin(S.t * 0.4)) * 0.05);
  c.strokeStyle = rgba(S.cat, 0.5);
  c.lineWidth = 2;
  c.beginPath(); c.arc(w * 0.5, h * 0.62, arena, 0, TAU); c.stroke();
  for (let i = 0; i < 7; i++) {
    const x = S.r(i) * w;
    const y = ((S.r(i + 10) + S.t * 0.35) % 1) * h;
    linea(c, x, y - h * 0.12, x, y, rgba(mix(S.cat, '#ffffff', 0.4), 0.5), 2);
    disco(c, x, y, h * 0.022, '#ffffff', 12);
  }
  figura(c, w * 0.5 - arena * 0.35, h * 0.62, arena * 0.4, S.a);
  figura(c, w * 0.5 + arena * 0.35, h * 0.62, arena * 0.4, S.b, { mirando: -1 });
};

/* — Brote: mapa con contagio — */
ESC.brote = (c, w, h, S) => {
  const cx = w * 0.5, cy = h * 0.5, r = Math.min(w, h) * 0.36;
  c.strokeStyle = rgba(S.cat, 0.4);
  c.lineWidth = 1.4;
  c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke();
  for (let i = 1; i < 4; i++) {
    c.beginPath();
    c.ellipse(cx, cy, r * Math.abs(Math.cos(i * 0.7)), r, 0, 0, TAU);
    c.stroke();
    c.beginPath();
    c.moveTo(cx - r, cy - r + (i * r * 2) / 4);
    c.lineTo(cx + r, cy - r + (i * r * 2) / 4);
    c.stroke();
  }
  const nodos = 6;
  for (let i = 0; i < nodos; i++) {
    const a = (i / nodos) * TAU + 0.4;
    const rr2 = r * (0.35 + S.r(i) * 0.5);
    const x = cx + Math.cos(a) * rr2, y = cy + Math.sin(a) * rr2;
    const infectado = ((S.t * 0.5 + i / nodos) % 1) < 0.55;
    disco(c, x, y, r * 0.07, infectado ? S.a : S.b, 12);
    if (infectado && i > 0) {
      const a0 = ((i - 1) / nodos) * TAU + 0.4;
      const r0 = r * (0.35 + S.r(i - 1) * 0.5);
      linea(c, cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, x, y, rgba(S.a, 0.35), 1.2);
    }
  }
};

/* — Señal de reacción: Reflejos, Duelo Táctil, Precisión — */
ESC.senal = (c, w, h, S, v) => {
  const fase = (S.t * 0.8) % 1;
  const encendido = fase > 0.55;
  if (v === 'medidor') {
    // Barra con zona verde y un marcador que la barre.
    const bx = w * 0.12, bw = w * 0.76;
    c.strokeStyle = rgba('#ffffff', 0.2);
    c.lineWidth = 1;
    rr(c, bx, h * 0.42, bw, h * 0.16, h * 0.06); c.stroke();
    c.fillStyle = rgba('#a8ff3e', 0.35);
    rr(c, bx + bw * 0.44, h * 0.42, bw * 0.12, h * 0.16, h * 0.05); c.fill();
    const mx = bx + bw * (0.5 + Math.sin(S.t * 3) * 0.46);
    glow(c, '#ffffff', 16, () => { c.fillStyle = '#ffffff'; c.fillRect(mx - 1.5, h * 0.38, 3, h * 0.24); });
  } else {
    disco(c, w * 0.5, h * 0.42, Math.min(w, h) * (encendido ? 0.2 : 0.11),
      encendido ? '#a8ff3e' : rgba('#ffffff', 0.12), encendido ? 34 : 0);
    if (encendido) {
      c.strokeStyle = rgba('#a8ff3e', 0.5 * (1 - (fase - 0.55) / 0.45));
      c.lineWidth = 2;
      c.beginPath(); c.arc(w * 0.5, h * 0.42, Math.min(w, h) * (0.2 + (fase - 0.55) * 0.9), 0, TAU); c.stroke();
    }
  }
  const golpe = (lado) => (encendido && S.r(lado + Math.floor(S.t * 0.8) * 3) > 0.5 ? h * 0.05 : 0);
  figura(c, w * 0.18, h * 0.78 - golpe(0), h * 0.2, S.a);
  figura(c, w * 0.82, h * 0.78 - golpe(1), h * 0.2, S.b, { mirando: -1 });
};

/* — Secuencia de colores: Simón, Simón Táctil — */
ESC.secuencia = (c, w, h, S, v) => {
  const cols = ['#a8ff3e', '#ff4757', '#ffd166', '#00e5ff'];
  const activo = Math.floor(S.t * 2.2) % 4;
  if (v === 'barra') {
    const bx = w * 0.1, bw = w * 0.8, bh = h * 0.24;
    for (let i = 0; i < 4; i++) {
      const on = i === activo;
      const x = bx + (bw / 4) * i;
      c.fillStyle = on ? cols[i] : rgba(cols[i], 0.2);
      if (on) glow(c, cols[i], 22, () => { rr(c, x + 2, h * 0.5 - bh / 2, bw / 4 - 4, bh, 4); c.fill(); });
      else { rr(c, x + 2, h * 0.5 - bh / 2, bw / 4 - 4, bh, 4); c.fill(); }
    }
    c.strokeStyle = rgba('#ffffff', 0.2);
    c.lineWidth = 1;
    rr(c, bx - 4, h * 0.5 - bh / 2 - 4, bw + 8, bh + 8, 8);
    c.stroke();
    return;
  }
  const cx = w * 0.5, cy = h * 0.5, r = Math.min(w, h) * 0.36;
  for (let i = 0; i < 4; i++) {
    const on = i === activo;
    c.fillStyle = on ? cols[i] : rgba(cols[i], 0.22);
    const trazo = () => {
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, r, (i / 4) * TAU + 0.04, ((i + 1) / 4) * TAU - 0.04);
      c.closePath();
      c.fill();
    };
    if (on) glow(c, cols[i], 26, trazo); else trazo();
  }
  c.fillStyle = '#06060c';
  c.beginPath(); c.arc(cx, cy, r * 0.34, 0, TAU); c.fill();
  c.strokeStyle = rgba('#ffffff', 0.2);
  c.lineWidth = 1.2;
  c.stroke();
};

/* — Rejilla de botones: Topos, Atrapa la Mosca, Ruleta — */
ESC.rejillaBotones = (c, w, h, S, v) => {
  const cols = v === 'ruleta' ? 8 : 3;
  const filas = v === 'ruleta' ? 1 : 3;
  const cw = Math.min(w / (cols + 1.5), h / (filas + 1.2));
  const ox = w * 0.5 - (cols * cw) / 2, oy = h * 0.5 - (filas * cw) / 2;
  const activo = Math.floor(S.t * 2.5) % (cols * filas);

  for (let i = 0; i < cols * filas; i++) {
    const x = ox + (i % cols) * cw, y = oy + Math.floor(i / cols) * cw;
    const on = i === activo;
    c.fillStyle = rgba('#ffffff', 0.06);
    rr(c, x + 2, y + 2, cw - 4, cw - 4, cw * 0.22);
    c.fill();
    c.strokeStyle = rgba('#ffffff', 0.12);
    c.lineWidth = 1;
    c.stroke();
    if (!on) continue;
    const col = v === 'ruleta' ? '#ff4757' : S.cat;
    glow(c, col, 20, () => {
      c.fillStyle = col;
      if (v === 'mosca') { c.beginPath(); c.arc(x + cw / 2, y + cw / 2, cw * 0.16, 0, TAU); c.fill(); }
      else { rr(c, x + 4, y + 4, cw - 8, cw - 8, cw * 0.2); c.fill(); }
    });
  }
  const lado = (col, x, dir) => figura(c, x, h * 0.85, h * 0.16, col, { mirando: dir });
  lado(S.a, w * 0.1, 1);
  lado(S.b, w * 0.9, -1);
};

/* — Texto y preguntas: Trivia, Atlas, Carrera de Teclas, salas de acertijos — */
ESC.texto = (c, w, h, S, v) => {
  const bx = w * 0.12, bw = w * 0.76;
  c.fillStyle = rgba(S.tinta, 0.08);
  rr(c, bx, h * 0.14, bw, h * 0.34, 6);
  c.fill();
  c.strokeStyle = rgba(S.cat, 0.45);
  c.lineWidth = 1.2;
  c.stroke();
  // Renglones: barras de longitud fija por semilla, no texto real.
  for (let i = 0; i < 3; i++) {
    const largo = bw * (0.45 + S.r(i) * 0.45);
    c.fillStyle = rgba(S.tinta, 0.42 - i * 0.09);
    rr(c, bx + bw * 0.06, h * 0.2 + i * h * 0.09, largo, h * 0.045, 2);
    c.fill();
  }
  if (v === 'escribir') {
    const escrito = (S.t * 0.4) % 1;
    c.fillStyle = rgba(S.a, 0.7);
    rr(c, bx + bw * 0.06, h * 0.2, bw * 0.8 * escrito, h * 0.045, 2);
    c.fill();
    linea(c, bx + bw * (0.06 + 0.8 * escrito), h * 0.19, bx + bw * (0.06 + 0.8 * escrito), h * 0.255,
      rgba(S.tinta, Math.sin(S.t * 8) > 0 ? 0.9 : 0.2), 2);
  }
  // Opciones tipo test: una se enciende por turnos.
  const activo = Math.floor(S.t * 1.3) % 2;
  for (let i = 0; i < 2; i++) {
    const on = i === activo;
    const x = bx + i * (bw / 2);
    c.fillStyle = on ? rgba(i ? S.b : S.a, 0.45) : rgba(S.tinta, 0.1);
    rr(c, x + 4, h * 0.56, bw / 2 - 8, h * 0.13, 4);
    c.fill();
    if (on) { c.strokeStyle = i ? S.b : S.a; c.lineWidth = 1.5; c.stroke(); }
  }
  figura(c, w * 0.22, h * 0.86, h * 0.16, S.a);
  figura(c, w * 0.78, h * 0.86, h * 0.16, S.b, { mirando: -1 });
};

/* — Carriles de ritmo: Ritmo, Baile a Dos — */
ESC.ritmo = (c, w, h, S, v) => {
  const carriles = 4;
  const zona = h * 0.76;
  for (let lado = 0; lado < 2; lado++) {
    const ox = lado ? w * 0.53 : w * 0.05;
    const cw = (w * 0.42) / carriles;
    const col = lado ? S.b : S.a;
    for (let i = 0; i < carriles; i++) {
      const x = ox + i * cw;
      c.fillStyle = rgba('#ffffff', 0.04);
      c.fillRect(x + 1, h * 0.06, cw - 2, zona - h * 0.06);
      // Notas: la fase depende del carril, del lado y del tiempo.
      for (let k = 0; k < 2; k++) {
        const u = ((S.t * 0.65 + i * 0.23 + k * 0.5 + lado * 0.11) % 1);
        const y = lerp(h * 0.06, zona, u);
        const cerca = u > 0.86;
        glow(c, col, cerca ? 18 : 8, () => {
          c.fillStyle = cerca ? '#ffffff' : col;
          rr(c, x + 3, y - h * 0.028, cw - 6, h * 0.056, 3);
          c.fill();
        });
      }
    }
    glow(c, col, 14, () => {
      c.fillStyle = rgba(col, 0.85);
      c.fillRect(ox, zona - 2, w * 0.42, 3);
    });
  }
  if (v === 'unisono') {
    // El combo solo sube si los dos aciertan: se marca con un vínculo central.
    linea(c, w * 0.47, h * 0.4, w * 0.53, h * 0.4, rgba('#ff6ec7', 0.6), 2, 12);
  }
};

/* — Cuerda que gira: Salta la Cuerda, Carrera de Tres Piernas — */
ESC.saltar = (c, w, h, S, v) => {
  const suelo = h * 0.82;
  linea(c, 0, suelo, w, suelo, rgba('#ffffff', 0.22), 2);
  if (v === 'cuerda') {
    const fase = S.t * 2.6;
    const abertura = Math.abs(Math.sin(fase));
    c.strokeStyle = rgba(S.cat, 0.8);
    c.lineWidth = 2.2;
    glow(c, S.cat, 12, () => {
      c.beginPath();
      c.ellipse(w * 0.5, suelo - h * 0.16, w * 0.32, h * 0.3 * abertura, 0, 0, TAU);
      c.stroke();
    });
    const salto = Math.max(0, Math.sin(fase)) * h * 0.12;
    figura(c, w * 0.42, suelo - h * 0.12 - salto, h * 0.2, S.a, { patas: fase });
    figura(c, w * 0.58, suelo - h * 0.12 - salto, h * 0.2, S.b, { mirando: -1, patas: fase });
  } else {
    // Tres piernas: un solo cuerpo con dos mitades atadas.
    const p = S.t * 5;
    const x = w * (0.3 + ((S.t * 0.25) % 1) * 0.45);
    figura(c, x - h * 0.07, suelo - h * 0.16, h * 0.2, S.a, { patas: p });
    figura(c, x + h * 0.07, suelo - h * 0.16, h * 0.2, S.b, { mirando: -1, patas: p + Math.PI });
    linea(c, x - h * 0.03, suelo - h * 0.02, x + h * 0.03, suelo - h * 0.02, '#ffd166', 3, 10);
  }
};

/* — Tablero de casillas: Ajedrez, Damas, Reversi, Tres en Raya, Batalla Naval — */
ESC.tablero = (c, w, h, S, v) => {
  const n = v === 'raya' ? 3 : v === 'naval' ? 7 : 8;
  const lado = Math.min(w * 0.72, h * 0.82);
  const cw = lado / n;
  const ox = w * 0.5 - lado / 2, oy = h * 0.5 - lado / 2;

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (v === 'raya' || v === 'naval') {
        c.strokeStyle = rgba(S.tinta, 0.3);
        c.lineWidth = 1.2;
        c.strokeRect(ox + x * cw, oy + y * cw, cw, cw);
      } else {
        c.fillStyle = (x + y) % 2 ? rgba(S.cat, 0.22) : rgba(S.tinta, 0.08);
        c.fillRect(ox + x * cw, oy + y * cw, cw, cw);
      }
    }
  }

  const pieza = (gx, gy, color, forma) => {
    const x = ox + gx * cw + cw / 2, y = oy + gy * cw + cw / 2;
    if (forma === 'x') {
      linea(c, x - cw * 0.24, y - cw * 0.24, x + cw * 0.24, y + cw * 0.24, color, 2.6, 10);
      linea(c, x + cw * 0.24, y - cw * 0.24, x - cw * 0.24, y + cw * 0.24, color, 2.6, 10);
    } else if (forma === 'o') {
      glow(c, color, 10, () => {
        c.strokeStyle = color; c.lineWidth = 2.6;
        c.beginPath(); c.arc(x, y, cw * 0.26, 0, TAU); c.stroke();
      });
    } else if (forma === 'barco') {
      c.fillStyle = rgba(color, 0.65);
      rr(c, x - cw * 0.36, y - cw * 0.3, cw * 1.4, cw * 0.6, cw * 0.25);
      c.fill();
    } else if (forma === 'rey') {
      glow(c, color, 10, () => {
        c.fillStyle = color;
        c.beginPath();
        c.moveTo(x, y - cw * 0.34);
        c.lineTo(x + cw * 0.24, y + cw * 0.12);
        c.lineTo(x + cw * 0.14, y + cw * 0.3);
        c.lineTo(x - cw * 0.14, y + cw * 0.3);
        c.lineTo(x - cw * 0.24, y + cw * 0.12);
        c.closePath();
        c.fill();
      });
    } else {
      disco(c, x, y, cw * 0.32, color, 10);
    }
  };

  if (v === 'raya') {
    pieza(0, 0, S.a, 'x'); pieza(1, 1, S.b, 'o'); pieza(2, 0, S.a, 'x'); pieza(0, 2, S.b, 'o');
    const parpadeo = Math.sin(S.t * 3) * 0.5 + 0.5;
    c.strokeStyle = rgba(S.cat, 0.4 + parpadeo * 0.6);
    c.lineWidth = 2;
    c.strokeRect(ox + cw * 2, oy + cw * 2, cw, cw);
  } else if (v === 'naval') {
    pieza(1, 1, S.a, 'barco');
    pieza(3, 4, S.b, 'barco');
    for (let i = 0; i < 5; i++) {
      const gx = Math.floor(S.r(i) * n), gy = Math.floor(S.r(i + 7) * n);
      const agua = S.r(i + 3) < 0.6;
      disco(c, ox + gx * cw + cw / 2, oy + gy * cw + cw / 2, cw * 0.14,
        agua ? rgba(S.tinta, 0.45) : '#ff4757', agua ? 0 : 12);
    }
  } else if (v === 'ajedrez') {
    for (let x = 0; x < n; x++) {
      pieza(x, 0, S.b, x === 4 ? 'rey' : 'peon');
      pieza(x, n - 1, S.a, x === 4 ? 'rey' : 'peon');
    }
    // Casilla iluminada: el cursor moviéndose por el tablero.
    const gx = Math.floor(S.t * 1.4) % n, gy = 3 + (Math.floor(S.t * 1.4 / n) % 2);
    c.fillStyle = rgba(S.cat, 0.3 + Math.sin(S.t * 5) * 0.15);
    c.fillRect(ox + gx * cw, oy + gy * cw, cw, cw);
  } else {
    // Reversi / Damas: fichas que se voltean con el tiempo.
    for (let i = 0; i < 14; i++) {
      const gx = Math.floor(S.r(i * 2) * n), gy = Math.floor(S.r(i * 2 + 1) * n);
      const volteada = ((S.t * 0.5 + i * 0.1) % 1) > 0.5;
      pieza(gx, gy, volteada ? S.a : S.b, 'peon');
    }
  }
};

/* — Fichas que caen o líneas que se cierran: Conecta 4, Timbiriche — */
ESC.conecta = (c, w, h, S, v) => {
  if (v === 'cajitas') {
    const n = 5;
    const lado = Math.min(w * 0.7, h * 0.75), paso = lado / (n - 1);
    const ox = w * 0.5 - lado / 2, oy = h * 0.5 - lado / 2;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        // Aristas: aparecen progresivamente con el tiempo.
        const trazadas = Math.floor(S.t * 3) % 26;
        if (x < n - 1 && S.r(y * n + x) * 26 < trazadas) {
          linea(c, ox + x * paso, oy + y * paso, ox + (x + 1) * paso, oy + y * paso,
            S.r(y * n + x + 50) < 0.5 ? S.a : S.b, 2.4, 8);
        }
        if (y < n - 1 && S.r(100 + y * n + x) * 26 < trazadas) {
          linea(c, ox + x * paso, oy + y * paso, ox + x * paso, oy + (y + 1) * paso,
            S.r(y * n + x + 70) < 0.5 ? S.a : S.b, 2.4, 8);
        }
        c.fillStyle = rgba(S.tinta, 0.55);
        c.beginPath(); c.arc(ox + x * paso, oy + y * paso, 2.2, 0, TAU); c.fill();
      }
    }
    return;
  }

  const cols = 7, filas = 6;
  const cw = Math.min(w * 0.72 / cols, h * 0.8 / filas);
  const ox = w * 0.5 - (cols * cw) / 2, oy = h * 0.5 - (filas * cw) / 2;
  c.fillStyle = rgba(S.cat, 0.16);
  rr(c, ox - 4, oy - 4, cols * cw + 8, filas * cw + 8, 6);
  c.fill();
  for (let y = 0; y < filas; y++) {
    for (let x = 0; x < cols; x++) {
      const lleno = y >= filas - 2 - Math.floor(S.r(x) * 2.5);
      c.fillStyle = lleno ? (S.r(y * cols + x) < 0.5 ? S.a : S.b) : '#06060c';
      c.beginPath();
      c.arc(ox + x * cw + cw / 2, oy + y * cw + cw / 2, cw * 0.36, 0, TAU);
      c.fill();
    }
  }
  // Ficha cayendo por la columna.
  const u = (S.t * 0.8) % 1;
  const colX = Math.floor(S.r(Math.floor(S.t * 0.8)) * cols);
  disco(c, ox + colX * cw + cw / 2, lerp(oy - cw, oy + (filas - 3) * cw, u), cw * 0.36, S.cat, 14);
};

/* — Cartas: Cartas de Poder, Memoria, Subasta, Cofres — */
ESC.cartas = (c, w, h, S, v) => {
  if (v === 'parejas') {
    const cols = 4, filas = 3;
    const cw = Math.min(w * 0.76 / cols, h * 0.8 / filas);
    const ox = w * 0.5 - (cols * cw) / 2, oy = h * 0.5 - (filas * cw) / 2;
    const vuelta = Math.floor(S.t * 1.4) % (cols * filas);
    for (let i = 0; i < cols * filas; i++) {
      const x = ox + (i % cols) * cw, y = oy + Math.floor(i / cols) * cw;
      const abierta = i === vuelta || i === (vuelta + 5) % (cols * filas);
      c.fillStyle = abierta ? rgba(S.r(i) < 0.5 ? S.a : S.b, 0.75) : rgba(S.tinta, 0.13);
      rr(c, x + 3, y + 3, cw - 6, cw * 1.15 - 6, cw * 0.14);
      c.fill();
      c.strokeStyle = abierta ? rgba(S.tinta, 0.5) : rgba(S.cat, 0.35);
      c.lineWidth = 1.2;
      c.stroke();
    }
    return;
  }

  // Mano en abanico + una carta jugada en la mesa.
  const cw = Math.min(w * 0.2, h * 0.34), ch = cw * 1.45;
  const abanico = (cy, color, dir) => {
    for (let i = -1; i <= 1; i++) {
      c.save();
      c.translate(w * 0.5 + i * cw * 0.6, cy + Math.abs(i) * h * 0.02 * dir);
      c.rotate(i * 0.18 * dir);
      c.fillStyle = rgba(color, 0.85);
      rr(c, -cw / 2, -ch / 2, cw, ch, cw * 0.12);
      c.fill();
      c.strokeStyle = rgba(S.tinta, 0.4);
      c.lineWidth = 1.2;
      c.stroke();
      c.fillStyle = rgba('#06060c', 0.35);
      rr(c, -cw * 0.32, -ch * 0.28, cw * 0.64, ch * 0.34, 3);
      c.fill();
      c.restore();
    }
  };
  abanico(h * 0.86, S.a, 1);
  abanico(h * 0.14, S.b, -1);
  const flota = Math.sin(S.t * 1.6) * h * 0.02;
  c.save();
  c.translate(w * 0.5, h * 0.5 + flota);
  c.rotate(Math.sin(S.t * 0.9) * 0.06);
  glow(c, S.cat, 20, () => {
    c.fillStyle = mix(S.cat, '#000000', 0.35);
    rr(c, -cw * 0.6, -ch * 0.6, cw * 1.2, ch * 1.2, cw * 0.14);
    c.fill();
  });
  c.strokeStyle = S.cat;
  c.lineWidth = 1.6;
  c.stroke();
  c.restore();
};

/* — Cocina y defensa por casillas: Cocina Caos, Jardín Bajo Asedio — */
ESC.cocina = (c, w, h, S, v) => {
  const filas = 4;
  const fh = h / filas;
  for (let y = 0; y < filas; y++) {
    c.fillStyle = y % 2 ? rgba('#ffffff', 0.04) : rgba(S.cat, 0.07);
    c.fillRect(0, y * fh, w, fh);
  }
  if (v === 'defensa') {
    // Plantas fijas a la izquierda, oleada entrando por la derecha.
    for (let y = 0; y < filas; y++) {
      for (let x = 0; x < 2; x++) {
        if (S.r(y * 3 + x) < 0.35) continue;
        disco(c, w * (0.12 + x * 0.13), y * fh + fh / 2, fh * 0.22, y % 2 ? S.a : S.b, 10);
      }
      const ex = w - ((S.t * 22 + S.r(y + 9) * w) % (w * 0.8));
      figura(c, ex, y * fh + fh / 2, fh * 0.4, '#ff4757', { mirando: -1 });
    }
    disco(c, w * 0.5, h * 0.12, h * 0.05, '#ffd166', 18);
  } else {
    // Encimeras y dos cocineros llevando platos.
    for (const [x, y] of [[0.1, 0.2], [0.5, 0.2], [0.8, 0.6], [0.2, 0.7]]) {
      c.fillStyle = rgba('#ffffff', 0.12);
      rr(c, w * x, h * y, w * 0.14, h * 0.14, 4);
      c.fill();
      c.strokeStyle = rgba(S.cat, 0.4);
      c.lineWidth = 1;
      c.stroke();
    }
    figura(c, w * (0.3 + Math.sin(S.t) * 0.12), h * 0.5, h * 0.18, S.a, { patas: S.t * 6 });
    figura(c, w * (0.68 + Math.sin(S.t * 1.3 + 2) * 0.12), h * 0.65, h * 0.18, S.b, { mirando: -1, patas: S.t * 6 + 2 });
    disco(c, w * 0.9, h * 0.2, h * 0.045, '#ffd166', 14);
  }
};

/* — Plataformas cooperativas — */
ESC.plataformas = (c, w, h, S, v) => {
  const plataformas = [[0.0, 0.86, 0.4], [0.55, 0.86, 0.45], [0.12, 0.58, 0.3], [0.6, 0.44, 0.32]];
  for (const [x, y, an] of plataformas) {
    c.fillStyle = rgba('#ffffff', 0.12);
    rr(c, w * x, h * y, w * an, h * 0.05, 3);
    c.fill();
    c.strokeStyle = rgba(S.cat, 0.4);
    c.lineWidth = 1;
    c.stroke();
  }
  if (v === 'elementos') {
    // Charco y lava: cada uno mata a uno de los dos.
    c.fillStyle = rgba('#00e5ff', 0.3);
    c.fillRect(w * 0.4, h * 0.9, w * 0.15, h * 0.1);
    c.fillStyle = rgba('#ff4757', 0.35);
    c.fillRect(w * 0.72, h * 0.9, w * 0.16, h * 0.1);
  } else if (v === 'luz') {
    // Cono de luz proyectado desde una lámpara.
    const on = Math.sin(S.t * 1.1) > 0;
    glow(c, '#ffd166', on ? 30 : 0, () => {
      c.fillStyle = rgba('#ffd166', on ? 0.16 : 0.03);
      c.beginPath();
      c.moveTo(w * 0.5, h * 0.05);
      c.lineTo(w * 0.28, h * 0.86);
      c.lineTo(w * 0.72, h * 0.86);
      c.closePath();
      c.fill();
    });
    disco(c, w * 0.5, h * 0.05, h * 0.03, on ? '#ffd166' : rgba('#ffffff', 0.2), on ? 20 : 0);
  }
  // Puerta de salida: pide a los dos.
  c.strokeStyle = rgba('#a8ff3e', 0.7);
  c.lineWidth = 2;
  rr(c, w * 0.86, h * 0.28, w * 0.1, h * 0.16, 3);
  c.stroke();

  const salto = (f) => Math.max(0, Math.sin(S.t * 2 + f)) * h * 0.12;
  figura(c, w * 0.2, h * 0.79 - salto(0), h * 0.17, S.a, { patas: S.t * 6 });
  figura(c, w * 0.7, h * 0.79 - salto(1.7), h * 0.17, S.b, { mirando: -1, patas: S.t * 6 + 2 });
};

/* — Cuerda elástica: Atados, El Nudo — */
ESC.cuerda = (c, w, h, S, v) => {
  const ax = w * (0.24 + Math.sin(S.t * 0.9) * 0.1), ay = h * (0.4 + Math.sin(S.t * 1.3) * 0.16);
  const bx = w * (0.74 + Math.sin(S.t * 1.1 + 2) * 0.1), by = h * (0.6 + Math.sin(S.t * 0.8 + 1) * 0.16);
  const comba = Math.hypot(bx - ax, by - ay) * 0.28;
  c.strokeStyle = mix(S.a, S.b, 0.5);
  c.lineWidth = 2.4;
  c.lineCap = 'round';
  glow(c, S.cat, 10, () => {
    c.beginPath();
    c.moveTo(ax, ay);
    if (v === 'nudo') {
      // Un bucle: la cuerda se cruza sobre sí misma.
      c.bezierCurveTo(ax + comba * 1.6, ay - comba, bx - comba * 1.8, by + comba * 1.4, bx, by);
      c.moveTo(ax, ay);
      c.bezierCurveTo(ax - comba, ay + comba * 1.5, bx + comba * 1.4, by - comba * 1.6, bx, by);
    } else {
      c.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + comba, bx, by);
    }
    c.stroke();
  });
  if (v !== 'nudo') {
    for (let i = 0; i < 3; i++) {
      const x = w * (0.2 + S.r(i) * 0.6), y = h * (0.15 + S.r(i + 4) * 0.7);
      const pulso = 0.7 + Math.sin(S.t * 3 + i) * 0.3;
      glow(c, '#ff6ec7', 14 * pulso, () => {
        c.fillStyle = '#ff6ec7';
        c.beginPath();
        c.moveTo(x, y + h * 0.03);
        c.bezierCurveTo(x - h * 0.055, y - h * 0.015, x - h * 0.04, y - h * 0.06, x, y - h * 0.03);
        c.bezierCurveTo(x + h * 0.04, y - h * 0.06, x + h * 0.055, y - h * 0.015, x, y + h * 0.03);
        c.closePath();
        c.fill();
      });
    }
  }
  figura(c, ax, ay, h * 0.16, S.a);
  figura(c, bx, by, h * 0.16, S.b, { mirando: -1 });
};

/* — Hogar compartido: Nuestra Casa, Nuestra Mascota — */
ESC.hogar = (c, w, h, S, v) => {
  if (v === 'mascota') {
    const respira = 1 + Math.sin(S.t * 1.6) * 0.05;
    const cx = w * 0.5, cy = h * 0.55;
    const r = Math.min(w, h) * 0.22 * respira;
    glow(c, S.cat, 26, () => {
      c.fillStyle = mix(S.cat, '#ffffff', 0.25);
      c.beginPath();
      c.ellipse(cx, cy, r, r * 0.9, 0, 0, TAU);
      c.fill();
    });
    // Orejas.
    for (const lado of [-1, 1]) {
      c.fillStyle = mix(S.cat, '#ffffff', 0.25);
      c.beginPath();
      c.moveTo(cx + lado * r * 0.5, cy - r * 0.6);
      c.lineTo(cx + lado * r * 0.85, cy - r * 1.15);
      c.lineTo(cx + lado * r * 0.15, cy - r * 0.9);
      c.closePath();
      c.fill();
    }
    const guino = Math.sin(S.t * 0.9) > 0.93;
    c.fillStyle = '#06060c';
    for (const lado of [-1, 1]) {
      if (guino) { linea(c, cx + lado * r * 0.34 - r * 0.1, cy - r * 0.1, cx + lado * r * 0.34 + r * 0.1, cy - r * 0.1, '#06060c', 2.4); continue; }
      c.beginPath(); c.arc(cx + lado * r * 0.34, cy - r * 0.12, r * 0.11, 0, TAU); c.fill();
    }
    c.strokeStyle = '#06060c';
    c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cy + r * 0.15, r * 0.22, 0.2, Math.PI - 0.2); c.stroke();
    for (let i = 0; i < 3; i++) {
      const u = ((S.t * 0.4 + i / 3) % 1);
      c.globalAlpha = 1 - u;
      const hx = cx + (i - 1) * r * 0.5, hy = cy - r - u * h * 0.25;
      c.fillStyle = '#ff6ec7';
      c.beginPath();
      c.moveTo(hx, hy + 4);
      c.bezierCurveTo(hx - 7, hy - 2, hx - 5, hy - 8, hx, hy - 4);
      c.bezierCurveTo(hx + 5, hy - 8, hx + 7, hy - 2, hx, hy + 4);
      c.fill();
      c.globalAlpha = 1;
    }
    return;
  }

  // Casa: cimientos, tejado y muebles que van apareciendo.
  const suelo = h * 0.85;
  linea(c, 0, suelo, w, suelo, rgba('#ffffff', 0.25), 2);
  c.strokeStyle = rgba(S.cat, 0.7);
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(w * 0.2, suelo);
  c.lineTo(w * 0.2, h * 0.42);
  c.lineTo(w * 0.5, h * 0.2);
  c.lineTo(w * 0.8, h * 0.42);
  c.lineTo(w * 0.8, suelo);
  c.stroke();
  c.fillStyle = rgba(S.cat, 0.1);
  c.fill();
  // `y` es la línea de apoyo del mueble; el rectángulo crece hacia arriba.
  const puestos = 1 + Math.floor((S.t * 0.7) % 4);
  const muebles = [[0.3, 0.84, 0.1, 0.14], [0.46, 0.84, 0.14, 0.22], [0.66, 0.84, 0.1, 0.12], [0.3, 0.56, 0.16, 0.08]];
  muebles.slice(0, puestos).forEach(([x, y, an, al], i) => {
    c.fillStyle = rgba(i % 2 ? S.a : S.b, 0.6);
    rr(c, w * x, h * y - h * al, w * an, h * al, 3);
    c.fill();
  });
  const cursor = Math.floor(S.t * 1.5) % 4;
  const [cxp, cyp, can, cal] = muebles[cursor];
  c.strokeStyle = rgba('#ffffff', 0.5 + Math.sin(S.t * 6) * 0.3);
  c.lineWidth = 1.4;
  c.setLineDash([3, 3]);
  c.strokeRect(w * cxp - 3, h * cyp - h * cal - 3, w * can + 6, h * cal + 6);
  c.setLineDash([]);
};

/* — Creadores de Mundos — */
ESC.mundo = (c, w, h, S) => {
  const cx = w * 0.5, cy = h * 0.62, r = Math.min(w, h) * 0.34;
  glow(c, S.cat, 26, () => {
    c.fillStyle = mix('#00e5ff', '#06060c', 0.55);
    c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
  });
  // Continentes: manchas deterministas sobre el planeta.
  c.save();
  c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.clip();
  for (let i = 0; i < 5; i++) {
    c.fillStyle = rgba('#a8ff3e', 0.35 + S.r(i) * 0.25);
    c.beginPath();
    c.ellipse(cx + (S.r(i * 2) - 0.5) * r * 1.5, cy + (S.r(i * 2 + 1) - 0.5) * r * 1.5,
      r * (0.18 + S.r(i + 8) * 0.22), r * (0.12 + S.r(i + 12) * 0.16), S.r(i) * TAU, 0, TAU);
    c.fill();
  }
  // Erupción parpadeante.
  const erup = (Math.sin(S.t * 1.4) * 0.5 + 0.5);
  disco(c, cx - r * 0.3, cy - r * 0.2, r * 0.12 * erup, '#ff4757', 20 * erup);
  c.restore();
  c.strokeStyle = rgba('#ffffff', 0.2);
  c.lineWidth = 1;
  c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke();
  // Dos manos divinas: los cursores de cada jugador.
  const mano = (color, fase) => {
    const a = S.t * 0.7 + fase;
    disco(c, cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r * 1.25 - h * 0.05, h * 0.03, color, 16);
  };
  mano(S.a, 0);
  mano(S.b, Math.PI);
};

/* — Barra táctil: escenas de los juegos de Touch Bar — */
ESC.barra = (c, w, h, S, v) => {
  const bx = w * 0.06, bw = w * 0.88, by = h * 0.4, bh = h * 0.2;
  c.fillStyle = '#000000';
  rr(c, bx, by, bw, bh, bh * 0.28);
  c.fill();
  c.strokeStyle = rgba('#ffffff', 0.22);
  c.lineWidth = 1.2;
  c.stroke();

  if (v === 'cinta') {
    for (let i = 0; i < 5; i++) {
      const x = bx + ((S.r(i) * bw + S.t * 40) % bw);
      const mia = S.r(i + 9) < 0.5;
      c.fillStyle = mia ? S.a : S.b;
      rr(c, x, by + bh * 0.2, bw * 0.07, bh * 0.6, 2);
      c.fill();
    }
  } else if (v === 'morse') {
    for (let i = 0; i < 7; i++) {
      const on = ((Math.floor(S.t * 4) + i) % 4) < 2;
      const raya = S.r(i) < 0.5;
      c.fillStyle = on ? S.cat : rgba('#ffffff', 0.12);
      rr(c, bx + bw * 0.06 + i * bw * 0.13, by + bh * 0.3, bw * (raya ? 0.09 : 0.035), bh * 0.4, 2);
      c.fill();
    }
  } else if (v === 'escalera') {
    for (let i = 0; i < 6; i++) {
      const alcanzado = i <= Math.floor((S.t * 1.2) % 6);
      c.fillStyle = alcanzado ? rgba(S.a, 0.8) : rgba('#ffffff', 0.1);
      rr(c, bx + bw * 0.05 + i * bw * 0.15, by + bh * 0.22, bw * 0.12, bh * 0.56, 3);
      c.fill();
      if (i === 4) { c.fillStyle = rgba('#ff4757', 0.5); c.fill(); }
    }
  } else if (v === 'cofres') {
    for (let i = 0; i < 8; i++) {
      const abierto = i === Math.floor(S.t * 1.8) % 8;
      c.fillStyle = abierto ? '#ffd166' : rgba(i < 4 ? S.a : S.b, 0.35);
      rr(c, bx + bw * 0.03 + i * bw * 0.12, by + bh * 0.22, bw * 0.09, bh * 0.56, 2);
      c.fill();
    }
  } else if (v === 'color') {
    const cols = ['#ff4757', '#ffd166', '#a8ff3e', '#00e5ff', '#b04cff'];
    for (let i = 0; i < 5; i++) {
      const activo = i === Math.floor(S.t * 2) % 5;
      c.fillStyle = activo ? cols[i] : rgba(cols[i], 0.3);
      const trazo = () => { c.beginPath(); c.arc(bx + bw * (0.16 + i * 0.17), by + bh / 2, bh * 0.3, 0, TAU); c.fill(); };
      if (activo) glow(c, cols[i], 20, trazo); else trazo();
    }
  } else {
    // Caja fuerte: barrido con zona caliente.
    const mx = bx + bw * (0.5 + Math.sin(S.t * 2) * 0.44);
    c.fillStyle = rgba('#a8ff3e', 0.3);
    rr(c, bx + bw * 0.6, by, bw * 0.1, bh, 3);
    c.fill();
    glow(c, '#ffffff', 16, () => { c.fillStyle = '#ffffff'; c.fillRect(mx - 1.5, by - h * 0.03, 3, bh + h * 0.06); });
  }

  figura(c, w * 0.16, h * 0.79, h * 0.15, S.a);
  figura(c, w * 0.84, h * 0.79, h * 0.15, S.b, { mirando: -1 });
};

/* — Trazos Gemelos: dos mitades dibujadas por separado — */
ESC.trazo = (c, w, h, S) => {
  const lado = Math.min(w, h) * 0.72;
  const ox = w / 2 - lado / 2, oy = h / 2 - lado / 2;
  c.fillStyle = rgba(S.tinta, 0.05);
  c.fillRect(ox, oy, lado, lado);
  c.strokeStyle = rgba(S.tinta, 0.18);
  c.lineWidth = 1;
  c.strokeRect(ox, oy, lado, lado);
  // La línea de separación: cada uno dibuja a un lado y no ve el otro.
  c.save();
  c.setLineDash([4, 5]);
  c.strokeStyle = rgba(S.cat, 0.5);
  c.beginPath();
  c.moveTo(w / 2, oy);
  c.lineTo(w / 2, oy + lado);
  c.stroke();
  c.restore();

  // Medio corazón por lado, dibujándose con el tiempo.
  const avance = clamp((S.t * 0.5) % 1.4, 0, 1);
  const medio = (color, signo) => {
    c.strokeStyle = color;
    c.lineWidth = Math.max(2.5, lado * 0.05);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    glow(c, color, 10, () => {
      c.beginPath();
      const pasos = Math.max(2, Math.floor(avance * 20));
      for (let i = 0; i <= pasos; i++) {
        const t = i / 20;
        const x = w / 2 + signo * lado * (0.42 * Math.sin(t * Math.PI) * (1 - t * 0.25));
        const y = oy + lado * (0.22 + t * 0.62);
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    });
  };
  medio(S.a, -1);
  medio(S.b, 1);
};

/* — Espías: rejilla de sospechosos con dos miras — */
ESC.espias = (c, w, h, S) => {
  const n = 4;
  const lado = Math.min(w * 0.78, h * 0.78);
  const cw = lado / n;
  const ox = w / 2 - lado / 2, oy = h / 2 - lado / 2;
  const tonos = ['#ff4757', '#5b8cff', '#a8ff3e', '#ffd166'];

  for (let i = 0; i < n * n; i++) {
    const x = ox + (i % n) * cw, y = oy + Math.floor(i / n) * cw;
    c.fillStyle = rgba(S.tinta, 0.06);
    c.fillRect(x + 2, y + 2, cw - 4, cw - 4);
    const col = tonos[Math.floor(S.r(i) * 4)];
    const r = cw * 0.18;
    glow(c, col, 6, () => {
      c.fillStyle = col;
      c.beginPath();
      const forma = Math.floor(S.r(i + 30) * 3);
      if (forma === 0) c.arc(x + cw / 2, y + cw / 2, r, 0, TAU);
      else if (forma === 1) c.rect(x + cw / 2 - r, y + cw / 2 - r, r * 2, r * 2);
      else { c.moveTo(x + cw / 2, y + cw / 2 - r); c.lineTo(x + cw / 2 + r, y + cw / 2 + r); c.lineTo(x + cw / 2 - r, y + cw / 2 + r); }
      c.closePath();
      c.fill();
    });
  }
  // Las dos miras, cada una recorriendo la rejilla a su ritmo.
  const mira = (color, fase, desfase) => {
    const i = Math.floor(S.t * 0.9 + fase) % (n * n);
    const x = ox + (i % n) * cw, y = oy + Math.floor(i / n) * cw;
    glow(c, color, 12, () => {
      c.strokeStyle = color;
      c.lineWidth = 2;
      c.strokeRect(x - desfase, y - desfase, cw + desfase * 2, cw + desfase * 2);
    });
  };
  mira(S.a, 0, 0);
  mira(S.b, 5, 3);
};

/* — Puente Frágil — */
ESC.puente = (c, w, h, S) => {
  const y = h * 0.62;
  const tablas = 8;
  for (let i = 0; i < tablas; i++) {
    const x = w * 0.14 + i * (w * 0.72 / tablas);
    const rota = S.r(i) < 0.2;
    const comba = Math.sin(i / tablas * Math.PI) * h * 0.06;
    c.fillStyle = rota ? rgba('#ff4757', 0.3) : rgba(S.cat, 0.5);
    rr(c, x, y + comba, w * 0.72 / tablas - 3, h * 0.035, 2);
    c.fill();
  }
  // Cuerdas del puente colgante.
  c.strokeStyle = rgba('#ffffff', 0.25);
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(w * 0.12, y - h * 0.12);
  c.quadraticCurveTo(w * 0.5, y + h * 0.06, w * 0.88, y - h * 0.12);
  c.stroke();
  c.fillStyle = rgba('#06060c', 0.6);
  c.fillRect(0, h * 0.82, w, h * 0.18);

  const avance = (S.t * 0.3) % 1;
  figura(c, lerp(w * 0.16, w * 0.6, avance), y - h * 0.06 + Math.sin(avance * Math.PI) * h * 0.05, h * 0.16, S.a, { patas: S.t * 6 });
  figura(c, w * 0.12, y - h * 0.08, h * 0.16, S.b, { mirando: -1 });
};

/* — Tartazo / almohadazo: Tarta a la Cara, Guerra de Almohadas — */
ESC.tartazo = (c, w, h, S, v) => {
  const suelo = h * 0.82;
  if (v === 'cama') {
    c.fillStyle = rgba(S.cat, 0.16);
    rr(c, w * 0.08, suelo - h * 0.06, w * 0.84, h * 0.2, 8);
    c.fill();
    c.strokeStyle = rgba(S.cat, 0.5);
    c.lineWidth = 1.4;
    c.stroke();
  } else {
    linea(c, 0, suelo, w, suelo, rgba('#ffffff', 0.22), 2);
  }
  const u = (S.t * 0.8) % 1;
  const bx = lerp(w * 0.3, w * 0.68, u), by = suelo - h * 0.24 - Math.sin(u * Math.PI) * h * 0.18;
  const impacto = u > 0.92;
  if (impacto) {
    glow(c, '#ffffff', 24, () => {
      c.fillStyle = rgba('#ffffff', 0.8);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        c.beginPath();
        c.arc(w * 0.72 + Math.cos(a) * h * 0.08, suelo - h * 0.24 + Math.sin(a) * h * 0.08, h * 0.02, 0, TAU);
        c.fill();
      }
    });
  } else {
    glow(c, '#ffffff', 12, () => {
      c.fillStyle = v === 'cama' ? mix(S.cat, '#ffffff', 0.5) : '#fff6e0';
      c.beginPath();
      if (v === 'cama') { rr(c, bx - h * 0.07, by - h * 0.045, h * 0.14, h * 0.09, h * 0.03); c.fill(); }
      else { c.arc(bx, by, h * 0.055, 0, TAU); c.fill(); }
    });
  }
  const salto = v === 'cama' ? Math.max(0, Math.sin(S.t * 2.4)) * h * 0.08 : 0;
  figura(c, w * 0.24, suelo - h * 0.14 - salto, h * 0.19, S.a, { patas: S.t * 5 });
  figura(c, w * 0.76, suelo - h * 0.14, h * 0.19, S.b, { mirando: -1 });
};

/* ═══════════ Realismo ═══════════
   Los juegos 3D no se pueden retratar con neón plano: la ficha tiene que
   prometer volumen. Estas escenas comparten un suelo en perspectiva con
   horizonte y sombras de contacto, que es lo que hace que un círculo se lea
   como una bola apoyada y no como un punto. */

/** Suelo en fuga con horizonte: la base de todas las escenas de esta familia. */
function suelo3d(c, w, h, S, { horizonte = 0.44, base = '#2b3038', tinte = 0.18, carriles = 9 } = {}) {
  const hy = h * horizonte;
  const cielo = c.createLinearGradient(0, 0, 0, hy);
  cielo.addColorStop(0, mix(base, '#000000', 0.55));
  cielo.addColorStop(1, mix(base, S.cat, tinte));
  c.fillStyle = cielo;
  c.fillRect(0, 0, w, hy);

  const piso = c.createLinearGradient(0, hy, 0, h);
  piso.addColorStop(0, mix(base, S.cat, tinte * 0.6));
  piso.addColorStop(1, mix(base, '#000000', 0.45));
  c.fillStyle = piso;
  c.fillRect(0, hy, w, h - hy);

  // Líneas que convergen en el punto de fuga: la perspectiva en cuatro trazos.
  c.save();
  c.strokeStyle = rgba('#ffffff', 0.07);
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i <= carriles; i++) {
    const x = (i / carriles) * w;
    c.moveTo(x, h);
    c.lineTo(w * 0.5 + (x - w * 0.5) * 0.12, hy);
  }
  c.stroke();
  c.restore();
  return hy;
}

/** Sombra elíptica de contacto: lo que asienta un objeto en el suelo. */
function sombra3d(c, x, y, r, alfa = 0.34) {
  c.save();
  c.fillStyle = rgba('#000000', alfa);
  c.beginPath();
  c.ellipse(x, y, r, r * 0.34, 0, 0, TAU);
  c.fill();
  c.restore();
}

/** Bola con volumen: relleno, sombreado lateral y brillo especular. */
function bola3d(c, x, y, r, color, { brillo = 0.55 } = {}) {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, mix(color, '#ffffff', brillo));
  g.addColorStop(0.6, color);
  g.addColorStop(1, mix(color, '#000000', 0.55));
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
}

/* — Mesas de juego: Billar, Futbolín, Tenis de mesa — */
ESC.mesa3d = (c, w, h, S, v) => {
  const hy = suelo3d(c, w, h, S, { base: '#20242e', horizonte: 0.32 });
  const paño = v === 'billar' ? '#186b3f' : v === 'futbolin' ? '#1f7a45' : '#12508c';

  // Tablero en trapecio: ancho abajo, estrecho arriba.
  const y0 = hy + h * 0.08, y1 = h * 0.92;
  const ax = w * 0.5 - w * 0.22, bx = w * 0.5 + w * 0.22;
  const cx = w * 0.5 - w * 0.45, dx = w * 0.5 + w * 0.45;
  c.fillStyle = mix(paño, '#000000', 0.25);
  c.beginPath();
  c.moveTo(ax, y0); c.lineTo(bx, y0); c.lineTo(dx, y1); c.lineTo(cx, y1);
  c.closePath();
  c.fill();
  const luz = c.createLinearGradient(0, y0, 0, y1);
  luz.addColorStop(0, rgba('#ffffff', 0.16));
  luz.addColorStop(0.5, rgba('#ffffff', 0.04));
  luz.addColorStop(1, rgba('#000000', 0.2));
  c.fillStyle = luz;
  c.fill();
  c.strokeStyle = mix('#6b4526', '#000000', 0.1);
  c.lineWidth = Math.max(3, h * 0.035);
  c.stroke();

  /** Punto del paño (u, z de 0 a 1) a pantalla, con la fuga aplicada. */
  const punto = (u, z) => {
    const y = lerp(y0, y1, z);
    const izq = lerp(ax, cx, z), der = lerp(bx, dx, z);
    return [lerp(izq, der, u), y];
  };

  if (v === 'billar') {
    const t = S.t * 0.6;
    const bolas = [[0.5, 0.82, '#f3efe4'], [0.42, 0.3, '#c8232b'], [0.5, 0.26, '#e8b21c'],
      [0.58, 0.3, '#0d0d12'], [0.46, 0.22, '#e8b21c'], [0.54, 0.22, '#c8232b']];
    const u0 = 0.5 + Math.sin(t) * 0.2;
    bolas.forEach(([u, z, col], i) => {
      const [x, y] = punto(i === 0 ? u0 : u, z);
      const r = h * (0.028 + z * 0.022);
      sombra3d(c, x, y + r * 0.7, r * 1.1, 0.3);
      bola3d(c, x, y, r, col);
    });
    // Taco apuntando a la blanca.
    const [bxw, byw] = punto(u0, 0.82);
    linea(c, bxw - w * 0.02, byw + h * 0.16, bxw - w * 0.13, byw + h * 0.5, '#c79a5a', h * 0.022);
  } else if (v === 'futbolin') {
    for (let i = 0; i < 4; i++) {
      const z = 0.18 + i * 0.22;
      const [x1, y1b] = punto(0, z), [x2] = punto(1, z);
      linea(c, x1 - w * 0.04, y1b, x2 + w * 0.04, y1b, rgba('#c8ccd4', 0.85), Math.max(1.5, h * 0.012));
      const col = i < 2 ? S.a : S.b;
      const desliz = Math.sin(S.t * 1.6 + i) * 0.18;
      for (const u of [0.28, 0.5, 0.72]) {
        const [fx, fy] = punto(clamp(u + desliz, 0.06, 0.94), z);
        const s = h * (0.05 + z * 0.03);
        sombra3d(c, fx, fy + s * 0.5, s * 0.5, 0.28);
        c.fillStyle = col;
        rr(c, fx - s * 0.22, fy - s * 0.75, s * 0.44, s * 0.95, s * 0.14);
        c.fill();
      }
    }
    const [bx2, by2] = punto(0.5 + Math.sin(S.t * 2.2) * 0.3, 0.55);
    bola3d(c, bx2, by2, h * 0.03, '#f2f2ee');
  } else {
    // Tenis de mesa: red al medio y bola botando de un lado a otro.
    const [nx1, ny1] = punto(0, 0.5), [nx2] = punto(1, 0.5);
    c.fillStyle = rgba('#e8eef5', 0.5);
    c.fillRect(nx1 - w * 0.02, ny1 - h * 0.07, (nx2 - nx1) + w * 0.04, h * 0.07);
    const u = (S.t * 0.55) % 1;
    const z = u < 0.5 ? u * 2 : (1 - u) * 2;
    const [px, py] = punto(0.5 + Math.sin(S.t * 1.1) * 0.22, clamp(z, 0.05, 0.95));
    const alto = Math.abs(Math.sin(u * TAU)) * h * 0.16;
    sombra3d(c, px, py, h * 0.022, 0.3);
    bola3d(c, px, py - alto - h * 0.02, h * 0.022, '#f7f3d8');
    for (const [uu, col] of [[0.5, S.a]]) {
      const [rx, ry] = punto(uu, 0.98);
      c.fillStyle = col;
      c.beginPath();
      c.ellipse(rx, ry - h * 0.02, h * 0.06, h * 0.075, 0.2, 0, TAU);
      c.fill();
    }
  }
};

/* — Lanzamientos: Bolos, Dardos, Arco, Baloncesto — */
ESC.lanzar3d = (c, w, h, S, v) => {
  const hy = suelo3d(c, w, h, S, { base: v === 'arco' ? '#3c5a3c' : '#242a34', horizonte: 0.38 });
  const t = (S.t * 0.5) % 1;

  if (v === 'bolos') {
    // Pista en fuga con los pinos al fondo.
    c.fillStyle = mix('#c69355', '#000000', 0.1);
    c.beginPath();
    c.moveTo(w * 0.42, hy); c.lineTo(w * 0.58, hy); c.lineTo(w * 0.95, h); c.lineTo(w * 0.05, h);
    c.closePath();
    c.fill();
    for (let i = 0; i < 6; i++) {
      const px = w * (0.44 + (i % 3) * 0.04) + (i > 2 ? w * 0.02 : 0);
      const py = hy + h * (0.04 + Math.floor(i / 3) * 0.03);
      sombra3d(c, px, py + h * 0.03, h * 0.018, 0.3);
      c.fillStyle = '#f4f1e6';
      rr(c, px - h * 0.014, py - h * 0.06, h * 0.028, h * 0.09, h * 0.014);
      c.fill();
      c.fillStyle = '#d32f3a';
      c.fillRect(px - h * 0.014, py - h * 0.03, h * 0.028, h * 0.008);
    }
    const z = t;
    const bx = lerp(w * 0.5, w * 0.5, z) + Math.sin(S.t) * w * 0.05 * (1 - z);
    const by = lerp(h * 0.98, hy + h * 0.06, z);
    const r = lerp(h * 0.09, h * 0.022, z);
    sombra3d(c, bx, by + r * 0.6, r * 1.1, 0.34);
    bola3d(c, bx, by, r, '#1b1f8c');
  } else if (v === 'dardos') {
    const cx = w * 0.62, cy = h * 0.45, R = Math.min(w, h) * 0.3;
    for (let i = 10; i >= 1; i--) {
      c.fillStyle = i % 2 ? (i > 7 ? '#c9282f' : '#0c0c10') : (i > 7 ? '#1f7a3d' : '#e8dcc0');
      c.beginPath(); c.arc(cx, cy, R * (i / 10), 0, TAU); c.fill();
    }
    c.fillStyle = '#c9282f';
    c.beginPath(); c.arc(cx, cy, R * 0.08, 0, TAU); c.fill();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      linea(c, cx + Math.cos(a) * R * 0.1, cy + Math.sin(a) * R * 0.1, cx + Math.cos(a) * R, cy + Math.sin(a) * R, rgba('#8d8d96', 0.5), 1);
    }
    // Dardos clavados y uno en vuelo.
    for (const [dx, dy, col] of [[-0.3, -0.35, S.a], [0.25, 0.3, S.b]]) {
      linea(c, cx + dx * R, cy + dy * R, cx + dx * R + w * 0.09, cy + dy * R - h * 0.05, '#d9dde6', 2.5);
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(cx + dx * R + w * 0.09, cy + dy * R - h * 0.05);
      c.lineTo(cx + dx * R + w * 0.13, cy + dy * R - h * 0.09);
      c.lineTo(cx + dx * R + w * 0.13, cy + dy * R - h * 0.02);
      c.closePath(); c.fill();
    }
  } else if (v === 'arco') {
    // Diana lejana y flecha en parábola con la caída bien marcada.
    const dx = w * 0.72, dy = h * 0.46, R = Math.min(w, h) * 0.11;
    ['#f2f2f2', '#1a1a1a', '#3d7fd6', '#e02b2b', '#f4d03f'].forEach((col, i) => {
      c.fillStyle = col;
      c.beginPath(); c.arc(dx, dy, R * (1 - i * 0.19), 0, TAU); c.fill();
    });
    sombra3d(c, dx, h * 0.78, R * 0.8, 0.25);
    const u = t;
    const fx = lerp(w * 0.08, dx, u);
    const fy = lerp(h * 0.72, dy, u) - Math.sin(u * Math.PI) * h * 0.22;
    linea(c, fx - w * 0.05, fy + h * 0.03, fx, fy, '#e0e4ea', 2.5);
    c.fillStyle = S.a;
    c.beginPath(); c.arc(fx, fy, h * 0.014, 0, TAU); c.fill();
  } else {
    // Canasta: aro de perfil, tablero y balón entrando.
    const ax = w * 0.66, ay = h * 0.38;
    c.fillStyle = rgba('#dfe8f2', 0.3);
    rr(c, ax - w * 0.13, ay - h * 0.26, w * 0.26, h * 0.2, 6); c.fill();
    c.strokeStyle = '#ff5533'; c.lineWidth = 2; c.stroke();
    c.strokeStyle = '#ff6a1f';
    c.lineWidth = Math.max(3, h * 0.022);
    c.beginPath(); c.ellipse(ax, ay, w * 0.07, h * 0.022, 0, 0, TAU); c.stroke();
    c.strokeStyle = rgba('#ffffff', 0.5); c.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      c.beginPath();
      c.moveTo(ax + Math.cos(a) * w * 0.07, ay + Math.sin(a) * h * 0.022);
      c.lineTo(ax + Math.cos(a) * w * 0.035, ay + h * 0.1);
      c.stroke();
    }
    const u = t;
    const bx = lerp(w * 0.16, ax, u);
    const by = lerp(h * 0.72, ay + h * 0.12, u) - Math.sin(u * Math.PI) * h * 0.3;
    sombra3d(c, bx, h * 0.9, h * 0.05 * (1 - u * 0.4), 0.24);
    bola3d(c, bx, by, h * 0.045, '#d2662a', { brillo: 0.35 });
  }
};

/* — Deslizar hasta un objetivo: Curling, Minigolf — */
ESC.deslizar3d = (c, w, h, S, v) => {
  const hielo = v === 'curling';
  const hy = suelo3d(c, w, h, S, { base: hielo ? '#8fb6cf' : '#3d7c31', horizonte: 0.3, tinte: 0.1 });

  // Pista en fuga.
  c.fillStyle = hielo ? rgba('#dbe9f2', 0.85) : mix('#4f9d3f', '#000000', 0.12);
  c.beginPath();
  c.moveTo(w * 0.4, hy); c.lineTo(w * 0.6, hy); c.lineTo(w * 0.98, h); c.lineTo(w * 0.02, h);
  c.closePath();
  c.fill();

  const casaY = hy + h * 0.16;
  if (hielo) {
    ['#2a6fb0', '#f2f5f8', '#c0392b', '#f2f5f8'].forEach((col, i) => {
      c.fillStyle = col;
      c.beginPath();
      c.ellipse(w * 0.5, casaY, w * 0.16 * (1 - i * 0.24), h * 0.05 * (1 - i * 0.24), 0, 0, TAU);
      c.fill();
    });
  } else {
    c.fillStyle = '#0a0a0c';
    c.beginPath(); c.ellipse(w * 0.5, casaY, w * 0.035, h * 0.014, 0, 0, TAU); c.fill();
    linea(c, w * 0.5, casaY, w * 0.5, casaY - h * 0.2, '#e8e8ee', 2.5);
    c.fillStyle = '#ff3355';
    c.beginPath();
    c.moveTo(w * 0.5, casaY - h * 0.2);
    c.lineTo(w * 0.5 + w * 0.07, casaY - h * 0.17);
    c.lineTo(w * 0.5, casaY - h * 0.14);
    c.closePath(); c.fill();
  }

  const u = (S.t * 0.35) % 1;
  const z = 1 - u;
  const px = w * (0.5 + Math.sin(u * 2.4) * 0.09 * u);
  const py = lerp(casaY, h * 0.95, z);
  const r = lerp(h * 0.028, h * 0.075, z);
  sombra3d(c, px, py + r * 0.5, r, 0.3);
  if (hielo) {
    c.fillStyle = mix('#4a4f57', '#ffffff', 0.15);
    c.beginPath(); c.ellipse(px, py, r, r * 0.72, 0, 0, TAU); c.fill();
    c.fillStyle = S.a;
    c.beginPath(); c.ellipse(px, py - r * 0.35, r, r * 0.28, 0, 0, TAU); c.fill();
    linea(c, px, py - r * 0.5, px, py - r * 1.5, '#e8e8ee', Math.max(2, r * 0.2));
  } else {
    bola3d(c, px, py, r * 0.5, '#f8f8f4');
  }
};

/* — Vehículos: Rally, Vuelo por aros — */
ESC.vehiculo3d = (c, w, h, S, v) => {
  const vuela = v === 'aire';
  const hy = suelo3d(c, w, h, S, {
    base: vuela ? '#6f9fc8' : '#4a6a34', horizonte: vuela ? 0.55 : 0.36, tinte: 0.12, carriles: vuela ? 0 : 11,
  });

  if (vuela) {
    for (let i = 0; i < 3; i++) {
      const u = ((S.t * 0.35 + i / 3) % 1);
      const esc = 0.12 + u * 0.9;
      const ax = w * 0.5 + Math.sin(i * 2.1) * w * 0.16 * (1 - u);
      const ay = h * 0.42 + u * h * 0.1;
      c.strokeStyle = rgba(i === 0 ? '#ffd166' : '#e8e8ee', 0.35 + u * 0.5);
      c.lineWidth = Math.max(2, h * 0.02 * esc);
      c.beginPath();
      c.ellipse(ax, ay, w * 0.16 * esc, h * 0.26 * esc, 0, 0, TAU);
      c.stroke();
    }
    // Avioneta de espaldas, inclinada en la curva.
    const bal = Math.sin(S.t * 1.2) * 0.35;
    c.save();
    c.translate(w * 0.5, h * 0.72);
    c.rotate(bal);
    c.fillStyle = S.a;
    rr(c, -w * 0.02, -h * 0.05, w * 0.04, h * 0.16, h * 0.02); c.fill();
    rr(c, -w * 0.13, -h * 0.01, w * 0.26, h * 0.022, h * 0.01); c.fill();
    c.fillStyle = mix(S.a, '#000000', 0.4);
    rr(c, -w * 0.05, h * 0.07, w * 0.1, h * 0.016, h * 0.008); c.fill();
    c.restore();
    return;
  }

  // Asfalto que se curva hacia el horizonte.
  const curva = Math.sin(S.t * 0.7) * w * 0.16;
  c.fillStyle = '#3c3f45';
  c.beginPath();
  c.moveTo(w * 0.5 + curva - w * 0.04, hy);
  c.lineTo(w * 0.5 + curva + w * 0.04, hy);
  c.lineTo(w * 1.12, h);
  c.lineTo(-w * 0.12, h);
  c.closePath();
  c.fill();
  for (let i = 0; i < 7; i++) {
    const z = ((i / 7) + (S.t * 0.5) % (1 / 7)) % 1;
    const y = lerp(hy, h, z * z);
    const ancho = lerp(w * 0.01, w * 0.06, z);
    c.fillStyle = rgba('#f0f0f0', 0.5);
    c.fillRect(lerp(w * 0.5 + curva, w * 0.5, z) - ancho / 2, y, ancho, lerp(2, h * 0.05, z));
  }
  // Dos coches, uno delante del otro.
  for (const [j, col, ox, oz] of [[0, S.a, -0.16, 0.86], [1, S.b, 0.14, 0.66]]) {
    const y = lerp(hy, h, oz);
    const s = lerp(0.25, 1, oz);
    const x = w * (0.5 + ox * s) + Math.sin(S.t * 1.4 + j) * w * 0.02;
    sombra3d(c, x, y + h * 0.05 * s, w * 0.06 * s, 0.34);
    c.fillStyle = col;
    rr(c, x - w * 0.06 * s, y - h * 0.06 * s, w * 0.12 * s, h * 0.08 * s, h * 0.014 * s); c.fill();
    c.fillStyle = mix(col, '#000000', 0.55);
    rr(c, x - w * 0.04 * s, y - h * 0.1 * s, w * 0.08 * s, h * 0.05 * s, h * 0.012 * s); c.fill();
    c.fillStyle = '#15161a';
    c.fillRect(x - w * 0.07 * s, y - h * 0.01 * s, w * 0.02 * s, h * 0.035 * s);
    c.fillRect(x + w * 0.05 * s, y - h * 0.01 * s, w * 0.02 * s, h * 0.035 * s);
  }
};

/* — Apilar y derribar: Torre de madera, Grúa, Dominó — */
ESC.apilar3d = (c, w, h, S, v) => {
  const hy = suelo3d(c, w, h, S, { base: v === 'grua' ? '#4a4d55' : '#3a2a1c', horizonte: 0.34 });

  if (v === 'domino') {
    // Fila de fichas en fuga: las primeras ya cayendo, las últimas de pie.
    const caida = (S.t * 0.5) % 1.6;
    for (let i = 0; i < 12; i++) {
      const z = 0.1 + (i / 12) * 0.85;
      const x = lerp(w * 0.86, w * 0.1, z) ;
      const y = lerp(hy + h * 0.05, h * 0.9, z);
      const s = lerp(0.4, 1.15, z);
      const cae = clamp((caida * 12) - (11 - i), 0, 1);
      const ang = cae * 1.35;
      sombra3d(c, x, y, h * 0.05 * s, 0.3);
      c.save();
      c.translate(x, y);
      c.rotate(-ang);
      c.fillStyle = i % 2 ? S.a : S.b;
      rr(c, -w * 0.016 * s, -h * 0.17 * s, w * 0.032 * s, h * 0.17 * s, 2);
      c.fill();
      c.fillStyle = rgba('#000000', 0.35);
      c.fillRect(-w * 0.016 * s, -h * 0.09 * s, w * 0.032 * s, 1.5);
      c.restore();
    }
    return;
  }

  const bx = w * (v === 'grua' ? 0.62 : 0.5);
  const pisos = v === 'grua' ? 6 : 9;
  const inclina = Math.sin(S.t * 1.1) * (v === 'grua' ? 0.01 : 0.03);
  for (let i = 0; i < pisos; i++) {
    const y = h * 0.92 - i * h * 0.075;
    const desv = inclina * i * h * 0.9;
    const an = w * (v === 'grua' ? 0.15 : 0.2);
    const col = v === 'grua' ? (i % 2 ? S.a : S.b) : mix('#c99a5c', '#8d6532', (i % 3) / 3);
    if (i === 0) sombra3d(c, bx, h * 0.95, an * 0.8, 0.36);
    c.fillStyle = col;
    rr(c, bx - an / 2 + desv, y - h * 0.07, an, h * 0.068, 3);
    c.fill();
    c.fillStyle = rgba('#ffffff', 0.12);
    c.fillRect(bx - an / 2 + desv, y - h * 0.07, an, h * 0.012);
    c.fillStyle = rgba('#000000', 0.22);
    c.fillRect(bx - an / 2 + desv, y - h * 0.014, an, h * 0.012);
  }

  if (v === 'grua') {
    // Viga, cable y contenedor colgando con su balanceo.
    linea(c, w * 0.05, h * 0.16, w * 0.95, h * 0.16, '#d8b02c', Math.max(3, h * 0.035));
    const carro = w * (0.4 + Math.sin(S.t * 0.9) * 0.16);
    c.fillStyle = '#2c3038';
    c.fillRect(carro - w * 0.03, h * 0.14, w * 0.06, h * 0.05);
    const ang = Math.sin(S.t * 1.6) * 0.28;
    const lx = carro + Math.sin(ang) * h * 0.34, ly = h * 0.19 + Math.cos(ang) * h * 0.34;
    linea(c, carro, h * 0.19, lx, ly, '#20242c', 2);
    c.save();
    c.translate(lx, ly);
    c.rotate(-ang * 0.4);
    c.fillStyle = S.a;
    rr(c, -w * 0.07, 0, w * 0.14, h * 0.07, 3); c.fill();
    c.fillStyle = rgba('#000000', 0.25);
    for (let k = -3; k <= 3; k++) c.fillRect(k * w * 0.018, 0, 2, h * 0.07);
    c.restore();
  } else {
    // Un bloque saliendo de la torre: el gesto del juego.
    const fuera = (Math.sin(S.t * 1.3) * 0.5 + 0.5) * w * 0.12;
    const y = h * 0.92 - 4 * h * 0.075;
    c.fillStyle = mix('#d4a868', '#ffffff', 0.15);
    rr(c, bx - w * 0.1 + fuera, y - h * 0.07, w * 0.2, h * 0.068, 3);
    c.fill();
    c.strokeStyle = rgba('#ffffff', 0.5);
    c.lineWidth = 1.5;
    c.stroke();
  }
};

/* — Pesca — */
ESC.pesca3d = (c, w, h, S) => {
  const hy = suelo3d(c, w, h, S, { base: '#5b7f9a', horizonte: 0.34, tinte: 0.1, carriles: 0 });

  // Agua con ondas horizontales que se ensanchan al acercarse.
  const agua = c.createLinearGradient(0, hy, 0, h);
  agua.addColorStop(0, '#2f6d92');
  agua.addColorStop(1, mix('#173c55', S.cat, 0.08));
  c.fillStyle = agua;
  c.fillRect(0, hy, w, h - hy);
  for (let i = 0; i < 10; i++) {
    const z = i / 10;
    const y = lerp(hy, h, z * z);
    c.strokeStyle = rgba('#ffffff', 0.06 + z * 0.1);
    c.lineWidth = 1 + z * 2;
    c.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const yy = y + Math.sin(x * 0.03 + S.t * 1.6 + i) * (1 + z * 3);
      if (x === 0) c.moveTo(x, yy); else c.lineTo(x, yy);
    }
    c.stroke();
  }

  // Caña doblada desde la orilla y sedal hasta el flotador.
  const tension = (Math.sin(S.t * 1.4) * 0.5 + 0.5);
  const puntaX = w * 0.3, puntaY = h * 0.16 + tension * h * 0.12;
  c.strokeStyle = '#20242c';
  c.lineWidth = Math.max(2.5, h * 0.018);
  c.beginPath();
  c.moveTo(w * 0.06, h * 0.86);
  c.quadraticCurveTo(w * 0.16, h * 0.4, puntaX, puntaY);
  c.stroke();

  const fx = w * (0.62 + Math.sin(S.t * 0.8) * 0.06);
  const fy = h * (0.7 + Math.sin(S.t * 2.4) * 0.02);
  c.strokeStyle = rgba('#f0f4ff', 0.6);
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(puntaX, puntaY);
  c.quadraticCurveTo((puntaX + fx) / 2, lerp(puntaY, fy, 0.4) + h * 0.06 * (1 - tension), fx, fy);
  c.stroke();

  c.fillStyle = '#ff3d3d';
  c.beginPath(); c.arc(fx, fy - h * 0.012, h * 0.02, Math.PI, 0); c.fill();
  c.fillStyle = '#f4f4f4';
  c.beginPath(); c.arc(fx, fy - h * 0.012, h * 0.02, 0, Math.PI); c.fill();

  // Sombra de un pez grande bajo el agua.
  const px = w * (0.68 + Math.sin(S.t * 0.6 + 1) * 0.12);
  c.fillStyle = rgba('#0d2b3a', 0.55);
  c.beginPath();
  c.ellipse(px, h * 0.84, w * 0.07, h * 0.028, Math.sin(S.t) * 0.2, 0, TAU);
  c.fill();
};

/* ═══════════ Machaque de la tecla L ═══════════
   Los cinco juegos de clics comparten una tecla dibujada que late, y encima
   cada uno enseña su medida propia: la curva, el listón, el bloque, la aguja o
   la apuesta. La tecla es lo que los hace reconocibles como familia en el
   riel del catálogo. */

/** Tecla física con relieve, latiendo al ritmo del machaque. */
function teclaL(c, x, y, s, color, pulsada) {
  const baja = pulsada ? s * 0.09 : 0;
  c.fillStyle = rgba('#000000', 0.45);
  rr(c, x - s / 2, y - s / 2 + s * 0.12, s, s, s * 0.18);
  c.fill();
  glow(c, color, pulsada ? 22 : 8, () => {
    c.fillStyle = mix('#2a2a38', color, pulsada ? 0.5 : 0.18);
    rr(c, x - s / 2, y - s / 2 + baja, s, s * 0.92, s * 0.18);
    c.fill();
  });
  c.fillStyle = rgba('#ffffff', pulsada ? 0.95 : 0.6);
  c.font = `bold ${Math.round(s * 0.52)}px system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('L', x, y + baja + s * 0.04);
}

ESC.clics = (c, w, h, S, v) => {
  // Ritmo del machaque: rápido y con irregularidad, como un dedo de verdad.
  const golpe = (Math.sin(S.t * 17) + Math.sin(S.t * 23.3)) > 0.6;
  const tam = Math.min(w, h) * 0.19;

  if (v === 'cps') {
    // Curva de clics por segundo: sube como un cohete y se desfonda.
    const gx = w * 0.08, gw = w * 0.84, gy = h * 0.66, gh = h * 0.4;
    c.strokeStyle = rgba('#ffffff', 0.08);
    c.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = gy - (i / 3) * gh;
      c.beginPath(); c.moveTo(gx, y); c.lineTo(gx + gw, y); c.stroke();
    }
    for (const [col, desf] of [[S.a, 0], [S.b, 1.7]]) {
      c.strokeStyle = col;
      c.lineWidth = 2.4;
      c.beginPath();
      for (let i = 0; i <= 40; i++) {
        const u = i / 40;
        // Arranque explosivo, caída lenta y temblor: la forma real de la curva.
        const val = Math.min(1, u * 4.5) * (1 - u * 0.42) + Math.sin(u * 14 + desf) * 0.05;
        const x = gx + u * gw, y = gy - clamp(val, 0, 1) * gh;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
    teclaL(c, w * 0.5, h * 0.28, tam, S.cat, golpe);
    if (golpe) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + S.t;
        disco(c, w * 0.5 + Math.cos(a) * tam, h * 0.28 + Math.sin(a) * tam, h * 0.012, S.cat, 8);
      }
    }
    return;
  }

  if (v === 'aguante') {
    // Columna de ritmo contra un listón que sube.
    const cx = w * 0.5, cw = w * 0.16, arriba = h * 0.16, alto = h * 0.62;
    c.fillStyle = rgba('#ffffff', 0.07);
    c.fillRect(cx - cw / 2, arriba, cw, alto);
    const nivel = 0.52 + Math.sin(S.t * 3.1) * 0.18;
    const liston = 0.5 + Math.sin(S.t * 0.6) * 0.1;
    const dentro = nivel >= liston;
    glow(c, dentro ? S.a : '#ff4757', 16, () => {
      c.fillStyle = dentro ? S.a : '#ff4757';
      c.fillRect(cx - cw / 2 + 3, arriba + alto * (1 - nivel), cw - 6, alto * nivel);
    });
    c.strokeStyle = '#ffd166';
    c.lineWidth = 2.5;
    c.setLineDash([7, 5]);
    c.beginPath();
    c.moveTo(cx - cw * 0.9, arriba + alto * (1 - liston));
    c.lineTo(cx + cw * 0.9, arriba + alto * (1 - liston));
    c.stroke();
    c.setLineDash([]);
    teclaL(c, w * 0.2, h * 0.62, tam * 0.85, S.cat, golpe);
    // Barra de aguante bajando.
    const bw = w * 0.5;
    c.fillStyle = rgba('#ffffff', 0.1);
    rr(c, cx - bw / 2, h * 0.86, bw, h * 0.05, h * 0.025); c.fill();
    c.fillStyle = '#a8ff3e';
    rr(c, cx - bw / 2, h * 0.86, bw * (0.35 + Math.sin(S.t * 0.9) * 0.3), h * 0.05, h * 0.025); c.fill();
    return;
  }

  if (v === 'picar') {
    // Bloque agrietándose y esquirlas saltando.
    const lado = Math.min(w, h) * 0.42;
    const bx = w * 0.5 - lado / 2, by = h * 0.46 - lado / 2;
    const tx = golpe ? (S.r(7) - 0.5) * 6 : 0;
    c.save();
    c.translate(tx, 0);
    c.fillStyle = '#7d7d86';
    c.fillRect(bx, by, lado, lado);
    c.fillStyle = rgba('#ffffff', 0.14);
    c.fillRect(bx, by, lado, lado * 0.09);
    c.fillStyle = rgba('#000000', 0.22);
    c.fillRect(bx, by + lado * 0.91, lado, lado * 0.09);
    c.fillStyle = '#5c5c64';
    for (let i = 0; i < 10; i++) {
      c.fillRect(bx + S.r(i) * lado * 0.84, by + S.r(i + 30) * lado * 0.84, lado * 0.12, lado * 0.12);
    }
    const grietas = 3 + Math.floor((Math.sin(S.t * 0.8) * 0.5 + 0.5) * 5);
    c.strokeStyle = rgba('#000000', 0.6);
    c.lineWidth = 2;
    for (let i = 0; i < grietas; i++) {
      const a = (i / 8) * TAU + 0.5;
      c.beginPath();
      c.moveTo(w * 0.5, h * 0.46);
      c.lineTo(w * 0.5 + Math.cos(a) * lado * 0.42, h * 0.46 + Math.sin(a) * lado * 0.38);
      c.stroke();
    }
    c.restore();
    if (golpe) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + S.t * 2;
        c.fillStyle = '#5c5c64';
        c.fillRect(w * 0.5 + Math.cos(a) * lado * 0.62, h * 0.46 + Math.sin(a) * lado * 0.55, 4, 4);
      }
    }
    teclaL(c, w * 0.16, h * 0.78, tam * 0.8, S.cat, golpe);
    return;
  }

  if (v === 'compas') {
    // Dial con franja verde y aguja que oscila alrededor.
    const cx = w * 0.5, cy = h * 0.74, R = Math.min(w * 0.32, h * 0.5);
    const A0 = Math.PI * 1.06, A1 = Math.PI * 1.94;
    c.strokeStyle = rgba('#ffffff', 0.1);
    c.lineWidth = Math.max(8, h * 0.06);
    c.beginPath(); c.arc(cx, cy, R, A0, A1); c.stroke();
    const obj = 0.55 + Math.sin(S.t * 0.5) * 0.18;
    c.strokeStyle = '#a8ff3e';
    c.beginPath();
    c.arc(cx, cy, R, A0 + (A1 - A0) * (obj - 0.09), A0 + (A1 - A0) * (obj + 0.09));
    c.stroke();
    const val = obj + Math.sin(S.t * 2.6) * 0.13;
    const ang = A0 + (A1 - A0) * clamp(val, 0, 1);
    const bien = Math.abs(val - obj) < 0.09;
    linea(c, cx, cy, cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, bien ? '#a8ff3e' : '#ff4757', 3.5, 14);
    disco(c, cx, cy, h * 0.03, S.tinta, 0);
    teclaL(c, w * 0.5, h * 0.24, tam * 0.9, S.cat, golpe);
    return;
  }

  // 'apuesta': la cifra cantada y la barra que corre hacia la meta.
  const bw = w * 0.66, bx = w * 0.5 - bw / 2, by = h * 0.62;
  const u = (S.t * 0.5) % 1.4;
  const llega = u > 1;
  c.fillStyle = rgba('#ffffff', 0.1);
  rr(c, bx, by, bw, h * 0.1, h * 0.05); c.fill();
  glow(c, llega ? '#a8ff3e' : S.a, 16, () => {
    c.fillStyle = llega ? '#a8ff3e' : S.a;
    rr(c, bx, by, bw * Math.min(1, u), h * 0.1, h * 0.05);
    c.fill();
  });
  linea(c, bx + bw, by - h * 0.05, bx + bw, by + h * 0.15, '#ffd166', 3);
  c.fillStyle = '#ffd166';
  c.font = `bold ${Math.round(h * 0.26)}px system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('34', w * 0.5, h * 0.3);
  teclaL(c, w * 0.17, h * 0.32, tam * 0.75, S.cat, golpe);
};

/* ---------------- Asignación juego → escena ---------------- */
/* [arquetipo, variante]. Añadir un juego = añadir una línea aquí; si falta,
   se cae a la escena de su categoría, así que nunca queda una ficha en blanco. */

const ASIGNACION = {
  /* Duelos arcade */
  'pong-neon': ['paletas', 'neon'],
  'hockey-mesa': ['paletas', 'aire'],
  'curvas': ['estela'],
  'ciclos-luz': ['ciclos'],
  'tanques': ['laberinto', 'bala'],
  'duelo-estelar': ['orbita', 'naves'],
  'artilleria': ['balistica', 'tierra'],
  'sumo': ['arena'],
  'voley-slime': ['deporte', 'red'],
  'futbol-cabezon': ['deporte', 'porteria'],
  'bombas': ['laberinto', 'bomba'],
  'justa-aerea': ['vuelo', 'plataformas'],
  'aleteo': ['vuelo', 'tuberias'],
  'circuito': ['circuito', 'clasico'],
  'esgrima': ['duelo', 'espada'],
  'bolitas-fantasma': ['laberinto', 'come'],
  'salto-sincronizado': ['autoscroll'],
  'serpiente-doble': ['serpiente'],
  'pelea-nieve': ['balistica', 'nieve'],

  /* Versus */
  'muro-doble': ['ladrillos'],
  'bloques-versus': ['bloques', 'pozo'],
  'meteoros': ['lluvia'],
  'duelo-oeste': ['duelo', 'oeste'],
  'brote': ['brote'],
  'golpe-final': ['duelo', 'pelea'],
  'turbo-circuito': ['circuito', 'turbo'],

  /* Reflejos */
  'tira-afloja': ['pulso', 'cuerda'],
  'reflejos': ['senal', 'luz'],
  'simon': ['secuencia', 'rueda'],
  'topos': ['rejillaBotones', 'topo'],
  'carrera-teclas': ['texto', 'escribir'],
  'ritmo': ['ritmo', 'versus'],
  'trivia': ['texto', 'test'],
  'atlas-contrarreloj': ['texto', 'test'],
  'torre-bloques': ['bloques', 'torre'],
  'atrapa-mosca': ['rejillaBotones', 'mosca'],

  /* Tablero */
  'tres-en-raya': ['tablero', 'raya'],
  'conecta4': ['conecta', 'fichas'],
  'damas': ['tablero', 'damas'],
  'reversi': ['tablero', 'reversi'],
  'timbiriche': ['conecta', 'cajitas'],
  'batalla-naval': ['tablero', 'naval'],
  'ajedrez': ['tablero', 'ajedrez'],
  'memoria': ['cartas', 'parejas'],
  'cartas-de-poder': ['cartas', 'duelo'],

  /* Cooperativos */
  'alunizaje': ['alunizaje'],
  'cocina-caos': ['cocina', 'cocina'],
  'piloto-artillero': ['orbita', 'torreta'],
  'doble-llave': ['plataformas', 'llaves'],
  'torre-dos': ['bloques', 'torre'],
  'llama-y-marea': ['plataformas', 'elementos'],
  'templo-perdido': ['texto', 'test'],
  'creadores-mundos': ['mundo'],
  'jardin-asedio': ['cocina', 'defensa'],
  'sombra-y-luz': ['plataformas', 'luz'],
  'peso-y-pluma': ['plataformas', 'llaves'],
  'salta-cuerda': ['saltar', 'cuerda'],

  /* Pareja */
  'atados': ['cuerda', 'elastica'],
  'baile-dos': ['ritmo', 'unisono'],
  'almohadas': ['tartazo', 'cama'],
  'nudo': ['cuerda', 'nudo'],
  'escapa-juntos': ['texto', 'test'],
  'tres-piernas': ['saltar', 'piernas'],
  'globo': ['vuelo', 'globo'],
  'pulso': ['pulso', 'cuerda'],
  'tarta': ['tartazo', 'tarta'],
  'puente': ['puente'],
  'nuestra-mascota': ['hogar', 'mascota'],
  'nuestra-casa': ['hogar', 'casa'],

  'fusion': ['bloques', 'pozo'],
  'torneo-machaque': ['pulso', 'cuerda'],
  'nuestro-bicho': ['hogar', 'mascota'],
  'casa-winters': ['laberinto', 'come'],
  'tres-pistas': ['texto', 'test'],

  /* Con mando táctil */
  'dilo-sin-decirlo': ['texto', 'test'],
  'timon-y-canon': ['orbita', 'torreta'],
  'trazos-gemelos': ['trazo'],
  'espias': ['espias'],

  /* Touch Bar */
  'tb-duelo': ['senal', 'luz'],
  'tb-cuerda': ['pulso', 'barra'],
  'tb-caja-fuerte': ['barra', 'caja'],
  'tb-codigo-color': ['barra', 'color'],
  'tb-ruleta': ['rejillaBotones', 'ruleta'],
  'tb-simon': ['secuencia', 'barra'],
  'tb-precision': ['senal', 'medidor'],
  'tb-pong': ['paletas', 'linea'],
  'tb-subasta': ['cartas', 'duelo'],
  'tb-escalera': ['barra', 'escalera'],
  'tb-cinta': ['barra', 'cinta'],
  'tb-relevos': ['pulso', 'barra'],
  'tb-morse': ['barra', 'morse'],
  'tb-cofres': ['barra', 'cofres'],

  /* Realismo */
  'billar': ['mesa3d', 'billar'],
  'futbolin': ['mesa3d', 'futbolin'],
  'tenis-mesa': ['mesa3d', 'pingpong'],
  'bolos': ['lanzar3d', 'bolos'],
  'dardos': ['lanzar3d', 'dardos'],
  'tiro-arco': ['lanzar3d', 'arco'],
  'baloncesto': ['lanzar3d', 'canasta'],
  'curling': ['deslizar3d', 'curling'],
  'minigolf': ['deslizar3d', 'golf'],
  'rally': ['vehiculo3d', 'tierra'],
  'vuelo-aros': ['vehiculo3d', 'aire'],
  'torre-madera': ['apilar3d', 'torre'],
  'grua': ['apilar3d', 'grua'],
  'domino': ['apilar3d', 'domino'],
  'pesca': ['pesca3d'],

  /* Pareja — bloque 51-80 */
  'cafe': ['puente', 'bandeja'],
  'columpio': ['cuerda', 'columpio'],
  'manta': ['pulso', 'manta'],
  'cita-ciegas': ['espias', 'guiar'],
  'carrito': ['circuito', 'carrito'],
  'paraguas': ['lluvia', 'paraguas'],
  'tandem': ['circuito', 'tandem'],
  'mando-tele': ['pulso', 'mando'],
  'pared': ['trazo', 'pared'],
  'sombras': ['hogar', 'sombras'],
  'hamaca': ['cuerda', 'hamaca'],
  'mueble': ['hogar', 'mueble'],
  'espagueti': ['cuerda', 'espagueti'],
  'foto': ['senal', 'foto'],
  'cosquillas': ['tartazo', 'cosquillas'],
  'remos': ['circuito', 'rio'],
  'huevo': ['saltar', 'relevo'],
  'discusion': ['texto', 'discusion'],
  'uvas': ['ritmo', 'campanadas'],
  'pegados': ['ritmo', 'baile'],

  /* Realismo — ampliación */
  'fronton': ['lanzar3d', 'fronton'],
  'golf': ['deslizar3d', 'golf'],
  'halterofilia': ['apilar3d', 'pesas'],
  'salto-longitud': ['lanzar3d', 'salto'],
  'martillo': ['lanzar3d', 'martillo'],
  'piraguismo': ['vehiculo3d', 'agua'],
  'velodromo': ['vehiculo3d', 'pista'],
  'hockey-penaltis': ['lanzar3d', 'porteria'],
  'demolicion': ['apilar3d', 'demolicion'],
  'disc-golf': ['lanzar3d', 'disco'],

  /* Mesa grande */
  'subastas': ['cartas', 'subasta'],
  'propiedades': ['tablero', 'propiedades'],

  /* Machaque de la L */
  'cps-duelo': ['clics', 'cps'],
  'aguante': ['clics', 'aguante'],
  'picar': ['clics', 'picar'],
  'compas': ['clics', 'compas'],
  'apuesta': ['clics', 'apuesta'],
};

/** Escena de reserva por categoría, para un juego aún sin asignar. */
const POR_CATEGORIA = {
  arcade: ['paletas', 'neon'],
  versus: ['duelo', 'pelea'],
  reflejos: ['senal', 'luz'],
  tablero: ['tablero', 'damas'],
  coop: ['plataformas', 'llaves'],
  pareja: ['cuerda', 'elastica'],
  tactil: ['espias'],
  touchbar: ['barra', 'cinta'],
  realismo: ['mesa3d', 'billar'],
};

/** Devuelve `(c, w, h, S) => void` para un juego del manifiesto. */
export function sceneFor(game) {
  /* Una entrada puede traer su escena hecha (`escena: [nombre, variante]`).
     Lo usan los desafíos generados: son 261 y meterlos uno a uno en ASIGNACION
     no aportaría nada, pero sin esto TODOS caían en el arquetipo por defecto y
     el catálogo enseñaba 261 miniaturas idénticas — que es exactamente la
     pinta de un catálogo relleno de paja. */
  const [nombre, variante] = game.escena
    || ASIGNACION[game.id] || POR_CATEGORIA[game.categoria] || POR_CATEGORIA.arcade;
  const fn = ESC[nombre] || ESC.paletas;
  return (c, w, h, S) => fn(c, w, h, S, variante);
}

/** Cuántos juegos comparten arquetipo con este: útil solo para diagnóstico. */
export const ARQUETIPOS = Object.keys(ESC);
export const ASIGNADOS = ASIGNACION;
