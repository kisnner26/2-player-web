/**
 * tablero.js — el barrio: casillas, grupos y cómo se calcula un alquiler.
 *
 * Está separado del juego a propósito, igual que las reglas del ajedrez: aquí
 * no hay ni DOM ni sonido, solo datos y aritmética, así que se puede leer de
 * un vistazo y cambiar el equilibrio del juego sin tocar nada más.
 *
 * Las mecánicas de los juegos de mesa no tienen copyright, pero los nombres y
 * el arte sí (ver README): por eso las calles son inventadas y el juego se
 * llama como se llama.
 */

export const GRUPOS = {
  olmo:    { nombre: 'Barrio Viejo', color: '#8a6a44' },
  rio:     { nombre: 'Ribera',       color: '#5b8cff' },
  mercado: { nombre: 'Mercado',      color: '#ff6ec7' },
  centro:  { nombre: 'Centro',       color: '#ff7847' },
  museo:   { nombre: 'Museos',       color: '#ff4757' },
  alta:    { nombre: 'Zona Alta',    color: '#3effc8' },
};

const p = (nombre, grupo, precio, alquiler) => ({ tipo: 'propiedad', nombre, grupo, precio, alquiler, casas: 0, dueno: -1 });

/**
 * 28 casillas: cuatro esquinas y seis por lado. El orden es el del recorrido,
 * en el sentido de las agujas del reloj empezando por la salida.
 */
export const CASILLAS = [
  { tipo: 'salida', nombre: 'Salida' },
  p('Calle del Olmo', 'olmo', 60, 6),
  p('Calle del Sauce', 'olmo', 60, 6),
  { tipo: 'suerte', nombre: 'Suerte' },
  p('Avenida del Río', 'rio', 100, 10),
  { tipo: 'transporte', nombre: 'Estación Norte', precio: 200, dueno: -1 },
  p('Calle del Puerto', 'rio', 110, 11),

  { tipo: 'carcel', nombre: 'Calabozo (de visita)' },
  p('Paseo Marina', 'rio', 120, 12),
  p('Calle del Mercado', 'mercado', 140, 14),
  { tipo: 'impuesto', nombre: 'Derrama', importe: 120 },
  p('Plaza Mayor', 'mercado', 140, 14),
  { tipo: 'transporte', nombre: 'Estación Sur', precio: 200, dueno: -1 },
  p('Calle de la Feria', 'mercado', 160, 16),

  { tipo: 'parking', nombre: 'Aparcamiento' },
  p('Avenida Central', 'centro', 180, 18),
  { tipo: 'suerte', nombre: 'Suerte' },
  p('Calle del Teatro', 'centro', 180, 18),
  p('Ronda Norte', 'centro', 200, 20),
  { tipo: 'transporte', nombre: 'Estación Este', precio: 200, dueno: -1 },
  p('Gran Vía', 'museo', 220, 22),

  { tipo: 'alacarcel', nombre: 'Al calabozo' },
  p('Calle del Museo', 'museo', 220, 22),
  { tipo: 'impuesto', nombre: 'Basuras', importe: 100 },
  p('Avenida del Palacio', 'museo', 240, 24),
  { tipo: 'transporte', nombre: 'Estación Oeste', precio: 200, dueno: -1 },
  p('Paseo Marítimo', 'alta', 300, 35),
  p('Torre Alta', 'alta', 350, 50),
];

/** Cartas de suerte. `efecto` recibe (juego, jugador) y hace lo suyo. */
export const SUERTE = [
  { texto: 'Te devuelven la fianza del piso: +150 €', dinero: 150 },
  { texto: 'Multa por ruido: −100 €', dinero: -100 },
  { texto: 'Vendes trastos por internet: +80 €', dinero: 80 },
  { texto: 'Se rompe la caldera: −140 €', dinero: -140 },
  { texto: 'Herencia de un tío lejano: +250 €', dinero: 250 },
  { texto: 'Derrama urgente de la comunidad: −80 €', dinero: -80 },
  { texto: 'Avanzas hasta la Salida y cobras', ir: 0 },
  { texto: 'Al calabozo, sin pasar por la Salida', ir: 21 },
  { texto: 'Te toca la lotería del barrio: +320 €', dinero: 320 },
  { texto: 'Cada rival te paga 50 € por la mudanza', cobrarATodos: 50 },
];

export const CASAS_MAX = 4;
export const PRECIO_CASA = 90;
export const SUELDO_SALIDA = 200;
export const FIANZA = 100;

/** Todas las casillas de un grupo. */
export function delGrupo(casillas, grupo) {
  return casillas.filter((c) => c.tipo === 'propiedad' && c.grupo === grupo);
}

/** ¿Este jugador tiene el grupo completo? */
export function tieneGrupo(casillas, grupo, jugador) {
  const g = delGrupo(casillas, grupo);
  return g.length > 0 && g.every((c) => c.dueno === jugador);
}

/**
 * Alquiler de una casilla.
 *
 * Las casas multiplican fuerte a propósito: sin ese salto, la partida se
 * decide por quién cae más veces y no por quién construye, que es donde está
 * la decisión interesante.
 */
export function alquiler(casillas, casilla, dueno) {
  if (casilla.tipo === 'transporte') {
    const n = casillas.filter((c) => c.tipo === 'transporte' && c.dueno === dueno).length;
    return 25 * Math.pow(2, Math.max(0, n - 1));
  }
  if (casilla.tipo !== 'propiedad') return 0;
  const base = casilla.alquiler;
  if (casilla.casas > 0) return Math.round(base * (2 + casilla.casas * 2.6));
  return tieneGrupo(casillas, casilla.grupo, dueno) ? base * 2 : base;
}

/** Patrimonio: dinero más lo que valdría vender todo. */
export function patrimonio(casillas, jugador) {
  let total = 0;
  for (const c of casillas) {
    if (c.dueno !== jugador.id) continue;
    total += (c.precio || 0) + (c.casas || 0) * PRECIO_CASA;
  }
  return jugador.dinero + Math.round(total * 0.7);
}

/**
 * Coordenadas de cada casilla en una rejilla 8×8, recorriendo el perímetro.
 * Se calcula una vez y lo usa el pintado; tenerlo aquí evita que el juego
 * tenga que saber de geometría.
 */
export function coordenadas() {
  const lado = 8;
  const pos = [];
  for (let x = 0; x < lado; x++) pos.push([x, 0]);                     // arriba →
  for (let y = 1; y < lado; y++) pos.push([lado - 1, y]);              // derecha ↓
  for (let x = lado - 2; x >= 0; x--) pos.push([x, lado - 1]);         // abajo ←
  for (let y = lado - 2; y >= 1; y--) pos.push([0, y]);                // izquierda ↑
  return pos.slice(0, CASILLAS.length);
}
