/**
 * personaje.js — creador y dibujante del personaje arcade de cada jugador.
 *
 * Un personaje es un objeto plano de rasgos (`piel: 2, pelo: 5, gorro: 3…`),
 * no una imagen. Eso es lo que permite que el mismo personaje se dibuje como
 * retrato de 256 px en el menú y como sprite de 30 px corriendo dentro de una
 * partida, sin guardar dos versiones ni que se parezcan solo de lejos.
 *
 * Se dibuja siempre sobre una rejilla lógica de 24 × 32 píxeles y luego se
 * escala con el suavizado apagado. Ese rodeo es justo lo que da el acabado de
 * consola: si se dibujara directamente al tamaño final, los bordes saldrían
 * difuminados y a tamaño pequeño el personaje se volvería una mancha.
 *
 * Añadir una pieza nueva (un peinado, un sombrero) es añadir una función al
 * catálogo correspondiente. El editor se entera solo: recorre los catálogos
 * para construir sus controles.
 */

/* ---------------- Rejilla ---------------- */

const AN = 24;                 // ancho lógico en píxeles
const AL = 32;                 // alto lógico en píxeles

/* Anatomía de referencia. Todas las piezas se cuelgan de estas medidas, así
   que mover la cabeza aquí mueve pelo, ojos y gorros a la vez. */
const CABEZA = { x: 7, y: 3, w: 10, h: 9 };
const CARA_Y = CABEZA.y + 4;   // altura de los ojos
const TORSO_Y = 13;
const TORSO_H = 9;
const PIERNA_Y = TORSO_Y + TORSO_H;

/* ---------------- Paletas ---------------- */

export const PIELES = [
  '#ffe0c4', '#f7d5b5', '#eabb92', '#d29a6e',
  '#b87a4f', '#8d5524', '#67421f', '#432a16',
  '#c9e8d5', '#d5c9f0',                          // dos tonos de fantasía
];

export const PELOS = [
  '#141014', '#2e2320', '#4a3222', '#6b4423', '#a56a3a',
  '#d9a441', '#f2e0a0', '#c4423a', '#e05fa8', '#7b4bbd',
  '#2f7fd1', '#39b58a', '#a8ff3e', '#dcdcdc', '#ffffff',
];

export const ROPAS = [
  '#ff2e88', '#00e5ff', '#a8ff3e', '#ffd166', '#b04cff', '#ff7847',
  '#3effc8', '#ff4757', '#5b8cff', '#ffffff', '#2b2b3d', '#8d5524',
  '#1f6f4a', '#7a1f3d', '#e8e2d0', '#3a3550',
];

/* ---------------- Utilidades de dibujo ---------------- */

/** Pinta un rectángulo de píxeles lógicos, recortado a la rejilla. */
function bloque(g, x, y, w, h, color) {
  if (w <= 0 || h <= 0) return;
  g.fillStyle = color;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Versión espejada horizontalmente respecto al centro de la rejilla. */
function bloqueSim(g, x, y, w, h, color) {
  bloque(g, x, y, w, h, color);
  bloque(g, AN - x - w, y, w, h, color);
}

function oscurecer(hex, f = 0.7) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const v = Math.round(((n >> 8) & 255) * f);
  const a = Math.round((n & 255) * f);
  return `rgb(${r},${v},${a})`;
}
function aclarar(hex, f = 0.25) {
  const n = parseInt(hex.slice(1), 16);
  const m = (c) => Math.round(c + (255 - c) * f);
  return `rgb(${m((n >> 16) & 255)},${m((n >> 8) & 255)},${m(n & 255)})`;
}

/* ---------------- Catálogos de piezas ---------------- */
/* Cada entrada: { nombre, pinta(g, r, c) } donde `r` son los rasgos y `c` los
   colores ya resueltos. El orden del array ES el índice guardado, así que las
   piezas nuevas van al final para no cambiar personajes ya creados. */

export const COMPLEXIONES = [
  { nombre: 'Normal', torso: 0, hombro: 0 },
  { nombre: 'Delgada', torso: -1, hombro: -1 },
  { nombre: 'Fuerte', torso: 1, hombro: 1 },
];

export const PEINADOS = [
  {
    nombre: 'Rapado',
    pinta(g, r, c) { bloque(g, CABEZA.x, CABEZA.y - 1, CABEZA.w, 2, c.pelo); },
  },
  {
    nombre: 'Corto',
    pinta(g, r, c) {
      bloque(g, CABEZA.x - 1, CABEZA.y - 2, CABEZA.w + 2, 4, c.pelo);
      bloqueSim(g, CABEZA.x - 1, CABEZA.y + 1, 1, 3, c.pelo);
    },
  },
  {
    nombre: 'Flequillo',
    pinta(g, r, c) {
      bloque(g, CABEZA.x - 1, CABEZA.y - 2, CABEZA.w + 2, 4, c.pelo);
      bloque(g, CABEZA.x, CABEZA.y + 2, CABEZA.w - 3, 1, c.pelo);
      bloqueSim(g, CABEZA.x - 1, CABEZA.y + 1, 1, 4, c.pelo);
    },
  },
  {
    nombre: 'Melena',
    pinta(g, r, c) {
      bloque(g, CABEZA.x - 1, CABEZA.y - 2, CABEZA.w + 2, 4, c.pelo);
      bloqueSim(g, CABEZA.x - 2, CABEZA.y + 1, 2, 9, c.pelo);
      bloque(g, CABEZA.x - 2, CABEZA.y + 9, 2, 2, oscurecer(c.pelo, 0.85));
      bloque(g, AN - CABEZA.x, CABEZA.y + 9, 2, 2, oscurecer(c.pelo, 0.85));
    },
  },
  {
    nombre: 'Coleta',
    pinta(g, r, c) {
      bloque(g, CABEZA.x - 1, CABEZA.y - 2, CABEZA.w + 2, 4, c.pelo);
      bloque(g, AN - CABEZA.x, CABEZA.y + 1, 2, 7, c.pelo);
      bloque(g, AN - CABEZA.x + 1, CABEZA.y + 7, 2, 3, c.pelo);
    },
  },
  {
    nombre: 'Afro',
    pinta(g, r, c) {
      bloque(g, CABEZA.x - 2, CABEZA.y - 4, CABEZA.w + 4, 6, c.pelo);
      bloqueSim(g, CABEZA.x - 3, CABEZA.y - 2, 1, 5, c.pelo);
      bloque(g, CABEZA.x - 1, CABEZA.y - 5, CABEZA.w + 2, 1, aclarar(c.pelo, 0.15));
    },
  },
  {
    nombre: 'Cresta',
    pinta(g, r, c) {
      bloque(g, CABEZA.x + 3, CABEZA.y - 5, 4, 7, c.pelo);
      bloque(g, CABEZA.x + 4, CABEZA.y - 6, 2, 1, aclarar(c.pelo, 0.3));
      bloqueSim(g, CABEZA.x, CABEZA.y - 1, 3, 2, oscurecer(c.pelo, 0.6));
    },
  },
  {
    nombre: 'Rizado',
    pinta(g, r, c) {
      bloque(g, CABEZA.x - 1, CABEZA.y - 3, CABEZA.w + 2, 4, c.pelo);
      for (let i = 0; i < 4; i++) bloque(g, CABEZA.x - 1 + i * 3, CABEZA.y - 4, 2, 2, c.pelo);
      bloqueSim(g, CABEZA.x - 2, CABEZA.y, 1, 5, c.pelo);
    },
  },
  {
    nombre: 'Recogido',
    pinta(g, r, c) {
      bloque(g, CABEZA.x - 1, CABEZA.y - 2, CABEZA.w + 2, 3, c.pelo);
      bloque(g, CABEZA.x + 3, CABEZA.y - 5, 4, 3, c.pelo);
      bloqueSim(g, CABEZA.x - 1, CABEZA.y + 1, 1, 3, c.pelo);
    },
  },
  {
    nombre: 'Largo liso',
    pinta(g, r, c) {
      bloque(g, CABEZA.x - 1, CABEZA.y - 3, CABEZA.w + 2, 5, c.pelo);
      bloqueSim(g, CABEZA.x - 2, CABEZA.y, 2, 13, c.pelo);
      bloque(g, CABEZA.x, CABEZA.y + 2, 3, 1, c.pelo);
    },
  },
  {
    nombre: 'Calvo',
    pinta() { /* sin pelo: la piel de la cabeza ya está dibujada */ },
  },
  {
    nombre: 'Dos moños',
    pinta(g, r, c) {
      bloque(g, CABEZA.x - 1, CABEZA.y - 2, CABEZA.w + 2, 4, c.pelo);
      bloqueSim(g, CABEZA.x - 3, CABEZA.y - 4, 3, 3, c.pelo);
    },
  },
];

export const OJOS = [
  {
    nombre: 'Normales',
    pinta(g, r, c) {
      bloqueSim(g, CABEZA.x + 1, CARA_Y, 2, 2, '#1a1420');
      bloqueSim(g, CABEZA.x + 1, CARA_Y, 1, 1, '#ffffff');
    },
  },
  {
    nombre: 'Grandes',
    pinta(g, r, c) {
      bloqueSim(g, CABEZA.x + 1, CARA_Y - 1, 3, 3, '#ffffff');
      bloqueSim(g, CABEZA.x + 2, CARA_Y, 2, 2, c.iris);
      bloqueSim(g, CABEZA.x + 2, CARA_Y, 1, 1, '#ffffff');
    },
  },
  {
    nombre: 'Rasgados',
    pinta(g, r, c) {
      bloqueSim(g, CABEZA.x + 1, CARA_Y, 3, 1, '#1a1420');
      bloqueSim(g, CABEZA.x + 2, CARA_Y + 1, 1, 1, c.iris);
    },
  },
  {
    nombre: 'Decididos',
    pinta(g, r, c) {
      bloqueSim(g, CABEZA.x + 1, CARA_Y, 3, 2, '#1a1420');
      bloqueSim(g, CABEZA.x + 2, CARA_Y + 1, 1, 1, c.iris);
    },
  },
  {
    nombre: 'Dormilones',
    pinta(g, r, c) {
      bloqueSim(g, CABEZA.x + 1, CARA_Y + 1, 3, 1, '#1a1420');
    },
  },
  {
    nombre: 'Chispeantes',
    pinta(g, r, c) {
      bloqueSim(g, CABEZA.x + 1, CARA_Y - 1, 3, 3, '#1a1420');
      bloqueSim(g, CABEZA.x + 1, CARA_Y - 1, 1, 1, '#ffffff');
      bloqueSim(g, CABEZA.x + 3, CARA_Y + 1, 1, 1, c.iris);
    },
  },
  {
    nombre: 'Cíclope',
    pinta(g, r, c) {
      bloque(g, CABEZA.x + 3, CARA_Y - 1, 4, 3, '#ffffff');
      bloque(g, CABEZA.x + 4, CARA_Y, 2, 2, c.iris);
    },
  },
  {
    nombre: 'Robot',
    pinta(g, r, c) {
      bloqueSim(g, CABEZA.x + 1, CARA_Y, 3, 2, '#1a1420');
      bloqueSim(g, CABEZA.x + 1, CARA_Y, 3, 1, c.iris);
    },
  },
];

export const CEJAS = [
  { nombre: 'Ninguna', pinta() {} },
  { nombre: 'Rectas', pinta(g, r, c) { bloqueSim(g, CABEZA.x + 1, CARA_Y - 2, 3, 1, c.ceja); } },
  { nombre: 'Enfadadas', pinta(g, r, c) { bloqueSim(g, CABEZA.x + 1, CARA_Y - 2, 2, 1, c.ceja); bloqueSim(g, CABEZA.x + 3, CARA_Y - 3, 1, 1, c.ceja); } },
  { nombre: 'Sorprendidas', pinta(g, r, c) { bloqueSim(g, CABEZA.x + 1, CARA_Y - 3, 3, 1, c.ceja); } },
  { nombre: 'Gruesas', pinta(g, r, c) { bloqueSim(g, CABEZA.x + 1, CARA_Y - 2, 3, 2, c.ceja); } },
  { nombre: 'Pícaras', pinta(g, r, c) { bloque(g, CABEZA.x + 1, CARA_Y - 2, 3, 1, c.ceja); bloque(g, AN - CABEZA.x - 4, CARA_Y - 3, 3, 1, c.ceja); } },
];

export const BOCAS = [
  { nombre: 'Sonrisa', pinta(g, r, c) { bloque(g, CABEZA.x + 3, CARA_Y + 3, 4, 1, '#8a3a44'); bloqueSim(g, CABEZA.x + 2, CARA_Y + 2, 1, 1, '#8a3a44'); } },
  { nombre: 'Seria', pinta(g, r, c) { bloque(g, CABEZA.x + 3, CARA_Y + 3, 4, 1, '#8a3a44'); } },
  { nombre: 'Risa', pinta(g, r, c) { bloque(g, CABEZA.x + 3, CARA_Y + 2, 4, 2, '#6d2a33'); bloque(g, CABEZA.x + 3, CARA_Y + 2, 4, 1, '#ffffff'); } },
  { nombre: 'Pequeña', pinta(g, r, c) { bloque(g, CABEZA.x + 4, CARA_Y + 3, 2, 1, '#8a3a44'); } },
  { nombre: 'Sorpresa', pinta(g, r, c) { bloque(g, CABEZA.x + 4, CARA_Y + 2, 2, 2, '#6d2a33'); } },
  { nombre: 'Chulesca', pinta(g, r, c) { bloque(g, CABEZA.x + 3, CARA_Y + 3, 3, 1, '#8a3a44'); bloque(g, CABEZA.x + 6, CARA_Y + 2, 1, 1, '#8a3a44'); } },
  { nombre: 'Colmillos', pinta(g, r, c) { bloque(g, CABEZA.x + 3, CARA_Y + 2, 4, 1, '#6d2a33'); bloqueSim(g, CABEZA.x + 3, CARA_Y + 3, 1, 1, '#ffffff'); } },
];

export const NARICES = [
  { nombre: 'Ninguna', pinta() {} },
  { nombre: 'Punto', pinta(g, r, c) { bloque(g, CABEZA.x + 4, CARA_Y + 1, 2, 1, c.sombra); } },
  { nombre: 'Recta', pinta(g, r, c) { bloque(g, CABEZA.x + 4, CARA_Y, 1, 2, c.sombra); } },
  { nombre: 'Ancha', pinta(g, r, c) { bloque(g, CABEZA.x + 3, CARA_Y + 1, 4, 1, c.sombra); } },
];

export const VELLOS = [
  { nombre: 'Nada', pinta() {} },
  { nombre: 'Bigote', pinta(g, r, c) { bloque(g, CABEZA.x + 3, CARA_Y + 2, 4, 1, c.pelo); } },
  { nombre: 'Perilla', pinta(g, r, c) { bloque(g, CABEZA.x + 4, CARA_Y + 4, 2, 2, c.pelo); } },
  {
    nombre: 'Barba',
    pinta(g, r, c) {
      bloqueSim(g, CABEZA.x, CARA_Y + 1, 1, 4, c.pelo);
      bloque(g, CABEZA.x + 1, CARA_Y + 4, CABEZA.w - 2, 2, c.pelo);
    },
  },
  {
    nombre: 'Barba larga',
    pinta(g, r, c) {
      bloqueSim(g, CABEZA.x, CARA_Y + 1, 1, 5, c.pelo);
      bloque(g, CABEZA.x + 1, CARA_Y + 4, CABEZA.w - 2, 4, c.pelo);
      bloque(g, CABEZA.x + 3, CARA_Y + 8, 4, 2, c.pelo);
    },
  },
];

/* --- Ropa de arriba. Recibe el ancho real del torso según complexión. --- */

export const CAMISETAS = [
  {
    nombre: 'Camiseta',
    pinta(g, r, c, t) { bloque(g, t.x, TORSO_Y, t.w, TORSO_H, c.arriba); },
  },
  {
    nombre: 'Rayas',
    pinta(g, r, c, t) {
      bloque(g, t.x, TORSO_Y, t.w, TORSO_H, c.arriba);
      for (let y = TORSO_Y + 1; y < TORSO_Y + TORSO_H; y += 2) {
        bloque(g, t.x, y, t.w, 1, oscurecer(c.arriba, 0.72));
      }
    },
  },
  {
    nombre: 'Tirantes',
    pinta(g, r, c, t) {
      bloque(g, t.x, TORSO_Y + 2, t.w, TORSO_H - 2, c.arriba);
      bloque(g, t.x + 1, TORSO_Y, 2, 2, c.arriba);
      bloque(g, t.x + t.w - 3, TORSO_Y, 2, 2, c.arriba);
      bloque(g, t.x + 3, TORSO_Y, t.w - 6, 2, c.piel);
    },
  },
  {
    nombre: 'Chaqueta',
    pinta(g, r, c, t) {
      bloque(g, t.x, TORSO_Y, t.w, TORSO_H, oscurecer(c.arriba, 0.8));
      bloque(g, t.x + t.w / 2 - 1, TORSO_Y, 2, TORSO_H, aclarar(c.arriba, 0.35));
      bloque(g, t.x, TORSO_Y, 2, 3, c.arriba);
      bloque(g, t.x + t.w - 2, TORSO_Y, 2, 3, c.arriba);
    },
  },
  {
    nombre: 'Sudadera',
    pinta(g, r, c, t) {
      bloque(g, t.x, TORSO_Y, t.w, TORSO_H, c.arriba);
      bloque(g, t.x + 1, TORSO_Y + 4, t.w - 2, 3, oscurecer(c.arriba, 0.82));
      bloque(g, t.x + 2, TORSO_Y - 1, t.w - 4, 2, oscurecer(c.arriba, 0.7));
    },
  },
  {
    nombre: 'Peto',
    pinta(g, r, c, t) {
      bloque(g, t.x, TORSO_Y, t.w, 2, c.piel);
      bloque(g, t.x + 1, TORSO_Y, 2, 3, c.arriba);
      bloque(g, t.x + t.w - 3, TORSO_Y, 2, 3, c.arriba);
      bloque(g, t.x, TORSO_Y + 2, t.w, TORSO_H - 2, c.arriba);
      bloqueSim(g, t.x + 2, TORSO_Y + 4, 1, 1, '#ffd166');
    },
  },
  {
    nombre: 'Armadura',
    pinta(g, r, c, t) {
      bloque(g, t.x - 1, TORSO_Y, t.w + 2, TORSO_H, '#8b93a8');
      bloque(g, t.x, TORSO_Y + 1, t.w, 2, '#c3cad9');
      bloque(g, t.x + t.w / 2 - 2, TORSO_Y + 3, 4, 4, c.arriba);
      bloqueSim(g, t.x - 1, TORSO_Y, 3, 2, '#5f6779');
    },
  },
  {
    nombre: 'Túnica',
    pinta(g, r, c, t) {
      bloque(g, t.x - 1, TORSO_Y, t.w + 2, TORSO_H + 3, c.arriba);
      bloque(g, t.x + t.w / 2 - 1, TORSO_Y, 2, TORSO_H, oscurecer(c.arriba, 0.75));
      bloque(g, t.x - 1, TORSO_Y + 5, t.w + 2, 1, '#ffd166');
    },
  },
  {
    nombre: 'Sin camiseta',
    pinta(g, r, c, t) {
      bloque(g, t.x, TORSO_Y, t.w, TORSO_H, c.piel);
      bloque(g, t.x + 1, TORSO_Y + 3, t.w - 2, 1, oscurecer(c.piel, 0.88));
    },
  },
  {
    nombre: 'Deportiva',
    pinta(g, r, c, t) {
      bloque(g, t.x, TORSO_Y, t.w, TORSO_H, c.arriba);
      bloqueSim(g, t.x, TORSO_Y, 1, TORSO_H, '#ffffff');
      bloque(g, t.x + t.w / 2 - 1, TORSO_Y + 2, 2, 2, '#ffffff');
    },
  },
];

export const PANTALONES = [
  { nombre: 'Largo', h: 6 },
  { nombre: 'Corto', h: 3 },
  { nombre: 'Falda', h: 3, falda: true },
  { nombre: 'Pirata', h: 4, roto: true },
  { nombre: 'Mallas', h: 7 },
];

export const CALZADOS = [
  { nombre: 'Zapatillas' },
  { nombre: 'Botas', alto: true },
  { nombre: 'Descalzo', ninguno: true },
  { nombre: 'Botines', bajo: true },
];

/* `cubre` dice qué rasgo esconde este accesorio. Lo usa el editor para no
   enseñarte doce peinados idénticos bajo el mismo casco: al comparar las
   opciones de un rasgo tapado, la miniatura se quita el estorbo. */
export const ACCESORIOS = [
  { nombre: 'Nada', pinta() {} },
  {
    nombre: 'Gafas',
    cubre: 'ojos',
    pinta(g, r, c) {
      bloqueSim(g, CABEZA.x, CARA_Y - 1, 4, 4, '#1a1420');
      bloqueSim(g, CABEZA.x + 1, CARA_Y, 2, 2, '#8fd9ff');
      bloque(g, CABEZA.x + 4, CARA_Y, 2, 1, '#1a1420');
    },
  },
  {
    nombre: 'Gafas de sol',
    cubre: 'ojos',
    pinta(g, r, c) {
      bloque(g, CABEZA.x, CARA_Y - 1, CABEZA.w, 3, '#14101a');
      bloqueSim(g, CABEZA.x + 1, CARA_Y - 1, 1, 1, '#5f6779');
    },
  },
  {
    nombre: 'Gorra',
    cubre: 'pelo',
    pinta(g, r, c) {
      bloque(g, CABEZA.x - 1, CABEZA.y - 3, CABEZA.w + 2, 3, c.extra);
      bloque(g, CABEZA.x - 3, CABEZA.y, CABEZA.w - 2, 1, oscurecer(c.extra, 0.75));
    },
  },
  {
    nombre: 'Gorro',
    cubre: 'pelo',
    pinta(g, r, c) {
      bloque(g, CABEZA.x - 1, CABEZA.y - 4, CABEZA.w + 2, 4, c.extra);
      bloque(g, CABEZA.x - 1, CABEZA.y - 1, CABEZA.w + 2, 2, aclarar(c.extra, 0.3));
      bloque(g, CABEZA.x + 4, CABEZA.y - 6, 2, 2, '#ffffff');
    },
  },
  {
    nombre: 'Casco',
    cubre: 'pelo',
    pinta(g, r, c) {
      bloque(g, CABEZA.x - 2, CABEZA.y - 4, CABEZA.w + 4, 5, c.extra);
      bloqueSim(g, CABEZA.x - 2, CABEZA.y + 1, 2, 3, c.extra);
      bloque(g, CABEZA.x + 4, CABEZA.y - 6, 2, 2, '#ffd166');
    },
  },
  {
    nombre: 'Diadema',
    cubre: 'pelo',
    pinta(g, r, c) {
      bloque(g, CABEZA.x - 1, CABEZA.y - 1, CABEZA.w + 2, 1, c.extra);
      bloque(g, CABEZA.x + 4, CABEZA.y - 3, 2, 2, c.extra);
    },
  },
  {
    nombre: 'Auriculares',
    cubre: 'pelo',
    pinta(g, r, c) {
      bloque(g, CABEZA.x, CABEZA.y - 3, CABEZA.w, 1, c.extra);
      bloqueSim(g, CABEZA.x - 2, CABEZA.y + 1, 2, 4, c.extra);
    },
  },
  {
    nombre: 'Corona',
    cubre: 'pelo',
    pinta(g, r, c) {
      bloque(g, CABEZA.x, CABEZA.y - 3, CABEZA.w, 2, '#ffd166');
      bloque(g, CABEZA.x, CABEZA.y - 5, 2, 2, '#ffd166');
      bloque(g, CABEZA.x + 4, CABEZA.y - 5, 2, 2, '#ffd166');
      bloque(g, CABEZA.x + 8, CABEZA.y - 5, 2, 2, '#ffd166');
      bloque(g, CABEZA.x + 4, CABEZA.y - 2, 2, 1, '#ff4757');
    },
  },
  {
    nombre: 'Antifaz',
    cubre: 'ojos',
    pinta(g, r, c) {
      bloque(g, CABEZA.x - 1, CARA_Y - 1, CABEZA.w + 2, 3, c.extra);
      bloqueSim(g, CABEZA.x + 1, CARA_Y, 2, 1, '#ffffff');
    },
  },
  {
    nombre: 'Orejas',
    cubre: 'pelo',
    pinta(g, r, c) {
      bloqueSim(g, CABEZA.x, CABEZA.y - 3, 3, 3, c.extra);
      bloqueSim(g, CABEZA.x + 1, CABEZA.y - 2, 1, 1, '#ff8fbf');
    },
  },
  {
    nombre: 'Cuernos',
    cubre: 'pelo',
    pinta(g, r, c) {
      bloqueSim(g, CABEZA.x, CABEZA.y - 3, 2, 3, c.extra);
      bloqueSim(g, CABEZA.x - 1, CABEZA.y - 4, 1, 2, c.extra);
    },
  },
  {
    nombre: 'Flor',
    cubre: 'pelo',
    pinta(g, r, c) {
      bloque(g, CABEZA.x + 8, CABEZA.y - 2, 2, 2, c.extra);
      bloque(g, CABEZA.x + 9, CABEZA.y - 1, 1, 1, '#ffd166');
    },
  },
];

export const CAPAS = [
  { nombre: 'Ninguna' },
  { nombre: 'Capa' },
  { nombre: 'Capa larga' },
  { nombre: 'Alas' },
  { nombre: 'Mochila' },
];

/* Cada rasgo, con su catálogo. El editor construye sus controles a partir de
   esta lista, así que basta con añadir aquí para que aparezca en pantalla. */
export const RASGOS = [
  { clave: 'complexion', etiqueta: 'Complexión', grupo: 'Cuerpo', lista: COMPLEXIONES },
  { clave: 'piel', etiqueta: 'Piel', grupo: 'Cuerpo', colores: PIELES },
  { clave: 'peinado', etiqueta: 'Corte', grupo: 'Cabeza', lista: PEINADOS },
  { clave: 'colorPelo', etiqueta: 'Color de pelo', grupo: 'Cabeza', colores: PELOS },
  { clave: 'vello', etiqueta: 'Vello facial', grupo: 'Cabeza', lista: VELLOS },
  { clave: 'ojos', etiqueta: 'Ojos', grupo: 'Cara', lista: OJOS },
  { clave: 'iris', etiqueta: 'Color de ojos', grupo: 'Cara', colores: ['#4a3222', '#2f7fd1', '#39b58a', '#7b4bbd', '#c4423a', '#d9a441', '#dcdcdc', '#ff2e88'] },
  { clave: 'cejas', etiqueta: 'Cejas', grupo: 'Cara', lista: CEJAS },
  { clave: 'nariz', etiqueta: 'Nariz', grupo: 'Cara', lista: NARICES },
  { clave: 'boca', etiqueta: 'Boca', grupo: 'Cara', lista: BOCAS },
  { clave: 'camiseta', etiqueta: 'Prenda', grupo: 'Ropa', lista: CAMISETAS },
  { clave: 'colorArriba', etiqueta: 'Color de arriba', grupo: 'Ropa', colores: ROPAS },
  { clave: 'pantalon', etiqueta: 'Pantalón', grupo: 'Ropa', lista: PANTALONES },
  { clave: 'colorAbajo', etiqueta: 'Color de abajo', grupo: 'Ropa', colores: ROPAS },
  { clave: 'calzado', etiqueta: 'Calzado', grupo: 'Ropa', lista: CALZADOS },
  { clave: 'colorPies', etiqueta: 'Color del calzado', grupo: 'Ropa', colores: ROPAS },
  { clave: 'accesorio', etiqueta: 'Accesorio', grupo: 'Extras', lista: ACCESORIOS },
  { clave: 'colorExtra', etiqueta: 'Color del accesorio', grupo: 'Extras', colores: ROPAS },
  { clave: 'capa', etiqueta: 'Espalda', grupo: 'Extras', lista: CAPAS },
];

/** Cuántas opciones tiene un rasgo. */
export function opcionesDe(rasgo) {
  return (rasgo.lista || rasgo.colores).length;
}

/** Nombre legible del valor actual de un rasgo. */
export function nombreDe(rasgo, valor) {
  if (rasgo.lista) return rasgo.lista[valor % rasgo.lista.length].nombre;
  return `${(valor % rasgo.colores.length) + 1} de ${rasgo.colores.length}`;
}

/* ---------------- Personaje ---------------- */

export const PERSONAJE_BASE = {
  complexion: 0, piel: 1, peinado: 1, colorPelo: 2, vello: 0,
  ojos: 0, iris: 1, cejas: 1, nariz: 1, boca: 0,
  camiseta: 0, colorArriba: 0, pantalon: 0, colorAbajo: 10,
  calzado: 0, colorPies: 10, accesorio: 0, colorExtra: 3, capa: 0,
};

/* Personaje de salida de cada jugador. Son dos para que, nada más instalar y
   sin pasar por el creador, los dos muñecos ya se distingan entre sí. */
export const PERSONAJES_INICIALES = [
  { ...PERSONAJE_BASE, peinado: 2, colorPelo: 3, ojos: 1, boca: 0, camiseta: 0, colorArriba: 0, colorAbajo: 10, calzado: 0, colorPies: 10 },
  { ...PERSONAJE_BASE, piel: 3, peinado: 4, colorPelo: 0, ojos: 3, boca: 1, camiseta: 4, colorArriba: 1, colorAbajo: 10, calzado: 1, colorPies: 10 },
];

/**
 * Personaje que le toca dibujar a un jugador.
 * Un perfil sin personaje creado no puede dejar el juego sin muñeco, así que
 * cae en el inicial que le corresponde por puesto.
 */
export function personajeDe(perfil, indice = 0) {
  return normalizar(perfil?.personaje || PERSONAJES_INICIALES[indice % 2]);
}

/**
 * Lleva la cuenta del ciclo de pasos y hacia dónde mira.
 *
 * Los juegos ya saben su velocidad y si tocan suelo; esto traduce eso a la
 * pose y el fotograma, y recuerda la última dirección para que un personaje
 * parado no gire de golpe a la derecha.
 *
 * @param {object} estado objeto propio del juego donde guardar la cuenta
 * @returns {{pose: string, frame: number, mirando: number}}
 */
export function pasoAnimado(estado, { vx = 0, suelo = true, dt = 0 }) {
  estado.fase = (estado.fase || 0) + Math.abs(vx) * dt * 0.09;
  if (vx > 2) estado.mira = 1;
  else if (vx < -2) estado.mira = -1;
  return {
    pose: !suelo ? 'salta' : Math.abs(vx) > 4 ? 'anda' : 'quieto',
    frame: Math.floor(estado.fase) % 4,
    mirando: estado.mira ?? 1,
  };
}

/** Personaje al azar. `rnd` permite reproducir el mismo resultado si hace falta. */
export function personajeAleatorio(rnd = Math.random) {
  const p = {};
  for (const r of RASGOS) p[r.clave] = Math.floor(rnd() * opcionesDe(r));
  return p;
}

/** Completa los huecos de un personaje guardado con una versión anterior. */
export function normalizar(p) {
  const out = { ...PERSONAJE_BASE, ...(p || {}) };
  for (const r of RASGOS) {
    const n = opcionesDe(r);
    const v = Number(out[r.clave]);
    out[r.clave] = Number.isFinite(v) ? ((v % n) + n) % n : 0;
  }
  return out;
}

/* ---------------- Dibujo del sprite ---------------- */

/**
 * Pinta el personaje completo en la rejilla lógica de 24 × 32.
 * @param {CanvasRenderingContext2D} g
 * @param {object} p      rasgos ya normalizados
 * @param {object} opciones { pose, frame, acento }
 */
function pintarRejilla(g, p, { pose = 'quieto', frame = 0, acento = '#ff2e88', vista = 'frente' } = {}) {
  const c = {
    piel: PIELES[p.piel],
    pelo: PELOS[p.colorPelo],
    ceja: oscurecer(PELOS[p.colorPelo], 0.75),
    iris: RASGOS.find((r) => r.clave === 'iris').colores[p.iris],
    arriba: ROPAS[p.colorArriba],
    abajo: ROPAS[p.colorAbajo],
    pies: ROPAS[p.colorPies],
    extra: ROPAS[p.colorExtra],
    sombra: oscurecer(PIELES[p.piel], 0.78),
    acento,
  };

  const comp = COMPLEXIONES[p.complexion];
  const torso = { x: 8 - comp.torso, w: 8 + comp.torso * 2 };
  const pant = PANTALONES[p.pantalon];
  const calz = CALZADOS[p.calzado];

  // Balanceo de brazos y piernas. Andar y saltar solo cambian estos dos
  // números: el resto del personaje se dibuja exactamente igual, que es lo
  // que evita tener que redibujar cada pieza por pose.
  let paso = 0, brazo = 0, alturaCabeza = 0;
  if (pose === 'anda') {
    paso = [0, 1, 0, -1][frame % 4];
    brazo = -paso;
    alturaCabeza = frame % 2 === 1 ? -1 : 0;
  } else if (pose === 'salta') {
    paso = -1; brazo = -2; alturaCabeza = -1;
  }

  g.save();
  g.translate(0, alturaCabeza);

  /* --- Espalda (va detrás de todo) --- */
  const capa = CAPAS[p.capa].nombre;
  if (capa === 'Capa' || capa === 'Capa larga') {
    const largo = capa === 'Capa larga' ? TORSO_H + 8 : TORSO_H + 3;
    bloque(g, torso.x - 2, TORSO_Y - 1, torso.w + 4, largo, oscurecer(c.extra, 0.8));
  } else if (capa === 'Alas') {
    bloqueSim(g, torso.x - 4, TORSO_Y - 1, 3, 7, '#f2f2ff');
    bloqueSim(g, torso.x - 5, TORSO_Y + 1, 1, 4, '#d5d5ee');
  } else if (capa === 'Mochila') {
    bloque(g, torso.x - 2, TORSO_Y + 1, torso.w + 4, 6, oscurecer(c.extra, 0.7));
  }

  /* --- Piernas --- */
  const piernaY = PIERNA_Y;
  const largoPierna = 32 - piernaY - (calz.ninguno ? 1 : 2);
  const anchoPierna = 2 + Math.max(0, comp.torso);
  const izqX = 12 - anchoPierna - 1;
  const derX = 12 + 1;

  if (pant.falda) {
    bloque(g, torso.x - 1, piernaY, torso.w + 2, 3, c.abajo);
    bloque(g, torso.x - 2, piernaY + 2, torso.w + 4, 1, oscurecer(c.abajo, 0.8));
  }

  for (const [px, desfase] of [[izqX, paso], [derX, -paso]]) {
    const y = piernaY + Math.max(0, desfase);
    const alto = largoPierna - Math.abs(desfase);
    // Pernera
    const hPant = pant.falda ? 0 : Math.min(pant.h, alto);
    if (hPant > 0) bloque(g, px, y, anchoPierna, hPant, c.abajo);
    if (pant.roto && hPant > 1) bloque(g, px, y + hPant - 1, anchoPierna, 1, oscurecer(c.abajo, 0.7));
    // Piel de la pierna
    if (alto > hPant) bloque(g, px, y + hPant, anchoPierna, alto - hPant, c.piel);
    // Calzado
    if (!calz.ninguno) {
      const hz = calz.alto ? 3 : calz.bajo ? 1 : 2;
      bloque(g, px, piernaY + largoPierna - hz + Math.max(0, desfase), anchoPierna + 1, hz, c.pies);
    }
  }

  /* --- Torso --- */
  CAMISETAS[p.camiseta].pinta(g, p, c, { x: torso.x, w: torso.w });

  /* --- Brazos ---
     De perfil solo se ve uno: el otro queda tapado por el cuerpo. Dibujar
     los dos ahí delataría que en realidad esto es plano. */
  const brazoY = TORSO_Y + 1;
  const mangaLarga = ['Chaqueta', 'Sudadera', 'Túnica', 'Armadura'].includes(CAMISETAS[p.camiseta].nombre);
  const brazos = vista === 'perfil'
    ? [[torso.x + torso.w - 3, brazo]]
    : [[torso.x - 2, brazo], [torso.x + torso.w, -brazo]];
  for (const [bx, desfase] of brazos) {
    const y = brazoY + Math.max(0, desfase);
    const alto = 6 - Math.abs(desfase);
    bloque(g, bx, y, 2, alto, mangaLarga ? c.arriba : c.piel);
    bloque(g, bx, y + alto, 2, 2, c.piel);      // mano
  }

  /* --- Cabeza --- */
  bloque(g, CABEZA.x, CABEZA.y, CABEZA.w, CABEZA.h, c.piel);
  bloque(g, CABEZA.x, CABEZA.y + CABEZA.h, CABEZA.w, 1, oscurecer(c.piel, 0.85)); // cuello

  if (vista === 'espalda') {
    // De espaldas no hay cara. Solo la nuca y el pelo, que aquí baja más.
    bloqueSim(g, CABEZA.x - 1, CABEZA.y + 4, 1, 2, c.piel);
    bloque(g, CABEZA.x, CABEZA.y, CABEZA.w, CABEZA.h - 2, oscurecer(c.pelo, 0.9));
    PEINADOS[p.peinado].pinta(g, p, c);
    ACCESORIOS[p.accesorio].pinta(g, p, c);
  } else if (vista === 'perfil') {
    // De perfil: una sola oreja, la nariz sobresale y la cara se corre hacia
    // el lado que mira. Con eso basta para que se lea como un giro.
    bloque(g, CABEZA.x + 1, CABEZA.y + 4, 1, 2, oscurecer(c.piel, 0.82));   // oreja
    bloque(g, CABEZA.x + CABEZA.w, CARA_Y + 1, 1, 2, c.piel);               // nariz
    g.save();
    g.translate(2, 0);                       // los rasgos se acercan al frente
    OJOS[p.ojos].pinta(g, p, c);
    CEJAS[p.cejas].pinta(g, p, c);
    BOCAS[p.boca].pinta(g, p, c);
    VELLOS[p.vello].pinta(g, p, c);
    g.restore();
    // El segundo ojo no existe de perfil: se tapa con piel.
    bloque(g, CABEZA.x, CARA_Y - 1, 3, 4, c.piel);
    PEINADOS[p.peinado].pinta(g, p, c);
    ACCESORIOS[p.accesorio].pinta(g, p, c);
  } else {
    bloqueSim(g, CABEZA.x - 1, CABEZA.y + 4, 1, 2, c.piel);                 // orejas
    NARICES[p.nariz].pinta(g, p, c);
    OJOS[p.ojos].pinta(g, p, c);
    CEJAS[p.cejas].pinta(g, p, c);
    BOCAS[p.boca].pinta(g, p, c);
    VELLOS[p.vello].pinta(g, p, c);
    PEINADOS[p.peinado].pinta(g, p, c);
    ACCESORIOS[p.accesorio].pinta(g, p, c);
  }

  /* Banda del color del jugador: en una partida hay que distinguir de un
     vistazo quién es quién, por muy personalizados que estén los dos. */
  bloque(g, torso.x, TORSO_Y + TORSO_H - 1, torso.w, 1, acento);

  g.restore();
}

/* ---------------- Caché de sprites ---------------- */

/* Dibujar la rejilla cuesta unas cien llamadas a fillRect. Hacerlo sesenta
   veces por segundo y por jugador sería un desperdicio, así que cada
   combinación de rasgos y pose se pinta una vez y se guarda. */
const cache = new Map();
const LIMITE_CACHE = 240;

function clave(p, pose, frame, acento, vista) {
  return `${RASGOS.map((r) => p[r.clave]).join(',')}|${pose}|${frame}|${acento}|${vista}`;
}

/**
 * Traduce un ángulo de giro a la vista que toca dibujar y cuánto hay que
 * estrechar el sprite.
 *
 * El personaje es plano: no hay un modelo con volumen que rotar. Pero con
 * tres vistas dibujadas (frente, perfil y espalda), el espejo horizontal y un
 * escorzo que estrecha la figura al ponerse de canto, el ojo lo lee como un
 * muñeco girando sobre una peana. Es el mismo truco de los sprites de los
 * juegos de lucha antiguos, y evita meter un motor 3D entero en un proyecto
 * que se abre con doble clic y no instala nada.
 *
 * @param {number} grados 0 = de frente, 90 = perfil derecho, 180 = espalda
 * @returns {{vista: string, espejo: number, escorzo: number}}
 */
export function vistaDeGiro(grados) {
  const a = ((grados % 360) + 360) % 360;
  // Cuanto más de canto, más estrecho: |cos| va de 1 (frente/espalda) a 0.
  const escorzo = 0.42 + Math.abs(Math.cos((a * Math.PI) / 180)) * 0.58;
  if (a < 45 || a >= 315) return { vista: 'frente', espejo: 1, escorzo };
  if (a < 135) return { vista: 'perfil', espejo: 1, escorzo };
  if (a < 225) return { vista: 'espalda', espejo: 1, escorzo };
  return { vista: 'perfil', espejo: -1, escorzo };
}

/* Margen de un píxel por lado: es donde vive el contorno. */
const MARGEN = 1;
export const SPRITE_AN = AN + MARGEN * 2;
export const SPRITE_AL = AL + MARGEN * 2;

/**
 * Anatomía publicada.
 *
 * El modelo 3D (core/personaje3d.js) tenía copiadas a mano estas medidas y se
 * habían desincronizado: la cara se recortaba en (7,3) olvidando el margen del
 * contorno, así que la textura salía corrida un píxel y con un píxel de más.
 * Exportándolas, las dos representaciones cuelgan del mismo sitio y mover la
 * cabeza aquí las mueve a las dos.
 */
export const ANATOMIA = {
  AN, AL, MARGEN,
  CABEZA, CARA_Y, TORSO_Y, TORSO_H, PIERNA_Y,
  /** Recorte de la cara DENTRO del canvas del sprite (margen ya incluido). */
  recorteCara: { x: CABEZA.x + MARGEN, y: CABEZA.y + MARGEN, w: CABEZA.w, h: CABEZA.h },
};

/* Qué rasgo tapa cada accesorio; se cruza con `cubre` de ACCESORIOS. */
const TAPADO_POR_ACCESORIO = {
  peinado: 'pelo', colorPelo: 'pelo',
  ojos: 'ojos', iris: 'ojos', cejas: 'ojos',
};

/**
 * Personaje para una miniatura de comparación del editor.
 *
 * Es el personaje actual con un rasgo cambiado, pero quitando lo que taparía
 * justo ese rasgo: con un casco puesto, las doce miniaturas de peinado salían
 * idénticas y no había forma de elegir. El accesorio solo se oculta en la
 * miniatura; el personaje guardado no se toca.
 */
export function varianteParaMiniatura(rasgos, clave, valor) {
  const v = { ...rasgos, [clave]: Number(valor) };
  const tapa = TAPADO_POR_ACCESORIO[clave];
  if (tapa && ACCESORIOS[v.accesorio]?.cubre === tapa) v.accesorio = 0;
  return v;
}

/**
 * Rodea la silueta con una línea oscura.
 *
 * Es lo que separa un sprite legible de una mancha de colores: sobre el
 * fondo de un juego, sin contorno el personaje se confunde con el escenario
 * en cuanto ambos comparten tono. Se calcula sobre los 26 × 34 píxeles
 * reales, así que cuesta nada aunque se haga por cada pose.
 */
function contornear(g, w, h) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const opaco = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 12;
  const borde = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (opaco(x, y)) continue;
      if (opaco(x - 1, y) || opaco(x + 1, y) || opaco(x, y - 1) || opaco(x, y + 1)) borde.push([x, y]);
    }
  }
  g.fillStyle = '#120d18';
  for (const [x, y] of borde) g.fillRect(x, y, 1, 1);
}

/** Canvas de 26 × 34 (24 × 32 de personaje más el contorno) ya pintado. */
export function spriteDe(personaje, { pose = 'quieto', frame = 0, acento = '#ff2e88', vista = 'frente' } = {}) {
  const p = normalizar(personaje);
  const k = clave(p, pose, frame, acento, vista);
  const guardado = cache.get(k);
  if (guardado) return guardado;

  const off = document.createElement('canvas');
  off.width = SPRITE_AN;
  off.height = SPRITE_AL;
  const g = off.getContext('2d', { willReadFrequently: true });
  g.save();
  g.translate(MARGEN, MARGEN);
  pintarRejilla(g, p, { pose, frame, acento, vista });
  g.restore();
  contornear(g, SPRITE_AN, SPRITE_AL);

  if (cache.size > LIMITE_CACHE) cache.clear();
  cache.set(k, off);
  return off;
}

/**
 * Dibuja el personaje dentro de un juego.
 *
 * Se ancla por los PIES y el centro horizontal, que es como piensan los
 * juegos de plataformas ("estoy de pie en este punto"), y respeta la
 * proporción del sprite para que nunca salga estirado.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {object} personaje
 * @param {number} cx    centro horizontal, en píxeles de pantalla
 * @param {number} suelo posición de los pies
 * @param {number} alto  altura deseada en píxeles de pantalla
 * @param {object} opciones { pose, frame, acento, mirando, alpha, brillo }
 */
export function dibujarPersonaje(g, personaje, cx, suelo, alto, opciones = {}) {
  const { mirando = 1, alpha = 1, brillo = 0, acento = '#ff2e88' } = opciones;
  const sp = spriteDe(personaje, opciones);
  const ancho = alto * (SPRITE_AN / SPRITE_AL);

  g.save();
  g.globalAlpha = alpha;
  g.imageSmoothingEnabled = false;        // sin esto no hay píxel, hay papilla
  if (brillo) { g.shadowColor = acento; g.shadowBlur = brillo; }
  // El espejo se hace alrededor del centro del personaje, no de su borde:
  // así mirar a la izquierda no lo desplaza medio cuerpo.
  g.translate(cx, suelo - alto);
  if (mirando < 0) g.scale(-1, 1);
  g.drawImage(sp, -ancho / 2, 0, ancho, alto);
  g.restore();
}

/**
 * Dibuja el personaje girado sobre su eje, para verlo desde cualquier ángulo.
 *
 * @param {CanvasRenderingContext2D} g
 * @param {object} personaje
 * @param {number} cx     centro horizontal
 * @param {number} suelo  posición de los pies
 * @param {number} alto   altura en píxeles de pantalla
 * @param {number} grados 0 = de frente, 90 = perfil, 180 = de espaldas
 * @param {object} opciones { pose, frame, acento }
 */
export function dibujarPersonajeGirado(g, personaje, cx, suelo, alto, grados, opciones = {}) {
  const { vista, espejo, escorzo } = vistaDeGiro(grados);
  const sp = spriteDe(personaje, { ...opciones, vista });
  const ancho = alto * (SPRITE_AN / SPRITE_AL) * escorzo;

  g.save();
  g.imageSmoothingEnabled = false;
  if (opciones.brillo) { g.shadowColor = opciones.acento || '#ff2e88'; g.shadowBlur = opciones.brillo; }
  g.translate(cx, suelo - alto);
  if (espejo < 0) g.scale(-1, 1);
  g.drawImage(sp, -ancho / 2, 0, ancho, alto);
  g.restore();
}

/**
 * Retrato circular para los avatares del menú y los marcadores.
 * Devuelve un data URL, que es lo que espera `avatarFor`.
 */
export function retratoDe(personaje, { size = 256, acento = '#ff2e88', cuerpo = false } = {}) {
  const lienzo = document.createElement('canvas');
  lienzo.width = size;
  lienzo.height = size;
  const g = lienzo.getContext('2d');

  // Fondo: disco con el color del jugador, muy apagado.
  g.fillStyle = '#12121f';
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  g.fill();
  const halo = g.createRadialGradient(size / 2, size * 0.28, 0, size / 2, size * 0.5, size * 0.62);
  halo.addColorStop(0, acento + '55');
  halo.addColorStop(1, '#00000000');
  g.fillStyle = halo;
  g.fillRect(0, 0, size, size);

  g.save();
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  g.clip();
  g.imageSmoothingEnabled = false;

  const sp = spriteDe(personaje, { acento });
  if (cuerpo) {
    const alto = size * 0.86;
    const ancho = alto * SPRITE_AN / SPRITE_AL;
    g.drawImage(sp, size / 2 - ancho / 2, size * 0.1, ancho, alto);
  } else {
    // Busto: se amplía la franja de la cabeza, con sitio para peinados altos.
    const rec = { x: 3, y: 0, w: 18, h: 16 };
    const zoom = size / rec.w;
    g.drawImage(sp, rec.x, rec.y, rec.w, rec.h,
      size / 2 - (rec.w * zoom) / 2, size * 0.1, rec.w * zoom, rec.h * zoom);
  }
  g.restore();

  // Aro del color del jugador.
  g.strokeStyle = acento;
  g.lineWidth = Math.max(3, size * 0.035);
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - g.lineWidth / 2, 0, Math.PI * 2);
  g.stroke();

  return lienzo.toDataURL();
}
