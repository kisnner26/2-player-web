/**
 * lista.js — el catálogo de desafíos generados.
 *
 * Genera N recetas de forma DETERMINISTA a partir de una semilla fija. Es la
 * parte que importa: la misma semilla da siempre el mismo juego, así que un
 * desafío tiene récords, aparece en la rivalidad y se puede recomendar a
 * alguien por su nombre. Sin determinismo esto no serían juegos, sería ruido.
 *
 * Se generan al cargar el módulo en vez de escribirse a mano en el manifiesto
 * porque son doscientos y pico: una lista literal de esa longitud haría el
 * manifiesto ilegible y no aportaría nada — los parámetros SON la entrada.
 *
 * Qué son, sin adornos: variaciones bien afinadas de ocho formas de arena. No
 * son ocho ideas nuevas cada una. Están para las tardes largas y para que el
 * catálogo tenga fondo, no para llevar una portada.
 */

import { seeded } from '../../core/math2d.js';
import { FAMILIAS, NOMBRES_FAMILIA } from './familias.js';

/* Vocabulario para los nombres.
   Los adjetivos van en las DOS formas y cada lugar declara su género: sin eso
   salían cosas como «Túnel Vacía», que delata al instante que el nombre lo ha
   puesto una máquina. Y los nombres se comprueban para que no se repita
   ninguno: dos desafíos con el mismo nombre son imposibles de recomendar. */
const ADJETIVOS = [
  ['Rojo', 'Roja'], ['Azul', 'Azul'], ['Negro', 'Negra'], ['Dorado', 'Dorada'],
  ['Perdido', 'Perdida'], ['Último', 'Última'], ['Roto', 'Rota'], ['Antiguo', 'Antigua'],
  ['Salvaje', 'Salvaje'], ['Silencioso', 'Silenciosa'], ['Helado', 'Helada'],
  ['Ardiente', 'Ardiente'], ['Profundo', 'Profunda'], ['Alto', 'Alta'],
  ['Estrecho', 'Estrecha'], ['Oculto', 'Oculta'], ['Torcido', 'Torcida'],
  ['Doble', 'Doble'], ['Lejano', 'Lejana'], ['Amargo', 'Amarga'],
  ['Rápido', 'Rápida'], ['Lento', 'Lenta'], ['Vacío', 'Vacía'], ['Ciego', 'Ciega'],
  ['Hueco', 'Hueca'], ['Tenso', 'Tensa'], ['Turbio', 'Turbia'], ['Nítido', 'Nítida'],
  ['Falso', 'Falsa'], ['Justo', 'Justa'], ['Áspero', 'Áspera'], ['Quieto', 'Quieta'],
];
/* [nombre, género] · 0 masculino, 1 femenino */
const LUGARES = [
  ['Cantera', 1], ['Bodega', 1], ['Azotea', 1], ['Cripta', 1], ['Fábrica', 1],
  ['Estación', 1], ['Bahía', 1], ['Chatarrería', 1], ['Terminal', 1], ['Cocina', 1],
  ['Biblioteca', 1], ['Aduana', 1], ['Cochera', 1], ['Refinería', 1], ['Trinchera', 1],
  ['Antena', 1], ['Presa', 1], ['Nave', 1], ['Cúpula', 1], ['Cantina', 1],
  ['Almacén', 0], ['Muelle', 0], ['Foso', 0], ['Túnel', 0], ['Reactor', 0],
  ['Invernadero', 0], ['Andén', 0], ['Sótano', 0], ['Mirador', 0], ['Cauce', 0],
  ['Puente', 0], ['Taller', 0], ['Horno', 0], ['Patio', 0], ['Pozo', 0],
];

const FAMS = Object.keys(FAMILIAS);
const PATRONES = ['columnas', 'cruz', 'anillo', 'celdas', 'pasillo'];
const TERRENOS = ['ninguno', 'hielo', 'barro', 'cinta'];
const FONDOS = ['#0b0d16', '#120b16', '#0a1016', '#141008', '#0d1408', '#101018', '#0f0a0a'];

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/**
 * Un desafío: sus parámetros salen de la semilla y su receta de la familia.
 * @param {number} n índice estable
 */
function generar(n) {
  const rng = seeded(0x9e37 + n * 2654435761);
  const familia = FAMS[n % FAMS.length];              // reparto parejo
  const rival = rng() < 0.45 ? 'humano' : 'bot';
  const o = {
    rival,
    dificultad: pick(rng, ['facil', 'normal', 'duro']),
    velocidad: 240 + Math.round(rng() * 130),
    friccion: 2.4 + rng() * 1.6,
    patron: pick(rng, PATRONES),
    terreno: pick(rng, TERRENOS),
    densidad: 0.3 + rng() * 0.7,
    peligro: 2 + Math.round(rng() * 5),
    ritmo: 0.8 + rng() * 2.4,
    siembra: 4 + Math.round(rng() * 8),
    duracion: [45, 60, 75, 90][Math.floor(rng() * 4)],
    fondo: pick(rng, FONDOS),
  };

  const receta = FAMILIAS[familia](rng, o);
  receta.id = `des-${n}`;
  return { n, familia, receta, o, rng };
}

/**
 * Pone nombre a todos de una vez, comprobando que ninguno se repita.
 * Se hace en una pasada aparte y no dentro de `generar()` porque la unicidad
 * es una propiedad del conjunto, no de cada uno por su lado.
 */
function bautizar(lista) {
  const usados = new Set();
  for (const d of lista) {
    const rng = d.rng;
    let nombre = '';
    for (let intento = 0; intento < 60; intento++) {
      const [lugar, genero] = pick(rng, LUGARES);
      const adj = pick(rng, ADJETIVOS)[genero];
      nombre = `${lugar} ${adj}`;
      if (!usados.has(nombre)) break;
      // Si tras muchos intentos sigue chocando, se desempata con el ordinal:
      // más feo que un nombre limpio, pero mejor que dos juegos iguales.
      if (intento === 59) nombre = `${lugar} ${adj} ${d.n}`;
    }
    usados.add(nombre);
    d.nombre = nombre;
    d.receta.nombre = nombre;
  }
  return lista;
}

/** Cuántos desafíos hay. Cambiarlo cambia el tamaño del catálogo. */
export const CUANTOS = 261;

/* Se generan una sola vez al importar: son objetos planos y baratos, pero
   rehacerlos en cada pintado del hub sí se notaría. */
const DESAFIOS = bautizar(Array.from({ length: CUANTOS }, (_, i) => generar(i)));

export const recetaDe = (id) => DESAFIOS.find((d) => `desafio-${d.n}` === id)?.receta || null;

/* Arquetipo de miniatura por familia. Que la portada se parezca a lo que vas
   a jugar es la mitad de que un catálogo grande se pueda recorrer. */
const ESCENA = {
  recolecta: 'arena', supervivencia: 'lluvia', carrera: 'circuito',
  empuje: 'duelo', custodia: 'orbita', cosecha: 'brote',
  laberinto: 'laberinto', bolos: 'ladrillos',
};

const DESC = {
  recolecta: (o) => `Más monedas que ${o.rival === 'bot' ? 'la máquina' : 'el otro'} en ${o.duracion} s.`,
  supervivencia: () => 'Aguanta vivo entre las bombas. Una vida.',
  carrera: () => 'Llega a la meta esquivando los pinchos.',
  empuje: () => 'Sácalo del ring tres veces. El suelo resbala.',
  custodia: (o) => `Aguanta en el centro: ahí salen las monedas. ${o.duracion} s.`,
  cosecha: (o) => `Oleadas de monedas cada ${(o.ritmo * 3).toFixed(0)} s.`,
  laberinto: () => 'Llega a la meta sin gastar tus tres vidas.',
  bolos: (o) => `Pelotas pesadas rebotando mientras recoges. ${o.duracion} s.`,
};

/** Entradas de catálogo, con la forma de siempre del manifiesto. */
export const GENERADOS = DESAFIOS.map((d) => ({
  id: `desafio-${d.n}`,
  carpeta: 'generados',
  receta: d.receta,
  nombre: d.nombre,
  categoria: 'desafios',
  estetica: 'neon',
  descripcion: `${NOMBRES_FAMILIA[d.familia]}. ${DESC[d.familia](d.o)}`,
  controles: {
    p1: ['W A S D: moverte'],
    p2: [d.o.rival === 'humano' ? '↑ ↓ ← →: moverte' : '—: lo lleva la máquina'],
  },
  duracion: d.receta.ajustes.duracion ? `${Math.round(d.receta.ajustes.duracion / 60) || 1} min` : '1-3 min',
  render: 'canvas',
  // La variante sale del índice: dos desafíos de la misma familia no enseñan
  // exactamente el mismo dibujo.
  escena: [ESCENA[d.familia], d.n % 3],
  generado: true,
  tags: ['desafío', NOMBRES_FAMILIA[d.familia].toLowerCase(), d.o.terreno, d.o.rival],
}));
