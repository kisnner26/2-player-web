/**
 * reglas.js — disparadores y acciones.
 *
 * Una regla es «CUANDO pase esto, HAZ esto otro». Es el sistema de Geometry
 * Dash y funciona por la misma razón: cada pieza suelta es tonta, pero
 * encadenar tres disparadores da comportamientos que nadie programó.
 *
 * Aquí no hay estado de partida. Este módulo solo sabe DECIDIR si un
 * disparador se cumple y DESCRIBIR qué hay que hacer; ejecutarlo es cosa de
 * `runtime.js`, que es quien tiene las entidades. Separarlo así permite que
 * el editor liste y valide reglas sin arrancar ninguna partida.
 */

const num = (nombre, def, min, max, paso = 1) => ({ control: 'numero', nombre, def, min, max, paso });
const opc = (nombre, def, opciones) => ({ control: 'opcion', nombre, def, opciones });
const txt = (nombre, def = '') => ({ control: 'texto', nombre, def });

/* Un «objetivo» es a qué se le aplica algo: una etiqueta, un tipo de pieza,
   o quien haya disparado la regla. Es lo que evita tener veinte acciones
   distintas para lo mismo. */
const OBJETIVO = opc('A quién', 'causante', [
  { v: 'causante', n: 'Quien lo provocó' },
  { v: 'otro', n: 'La otra pieza' },
  { v: 'jugador1', n: 'Jugador 1' },
  { v: 'jugador2', n: 'Jugador 2' },
  { v: 'etiqueta', n: 'Una etiqueta…' },
]);

export const DISPARADORES = {
  inicio: {
    nombre: 'Al empezar', descripcion: 'Nada más arrancar la partida.',
    campos: {},
  },
  tiempo: {
    nombre: 'Al pasar un tiempo', descripcion: 'Cuando lleve N segundos jugados.',
    campos: { segundos: num('Segundos', 10, 0.5, 600, 0.5) },
  },
  cada: {
    nombre: 'Cada cierto tiempo', descripcion: 'Se repite mientras dure la partida.',
    campos: { segundos: num('Cada (s)', 5, 0.2, 120, 0.1) },
  },
  choque: {
    nombre: 'Al chocar', descripcion: 'Cuando dos piezas se tocan.',
    campos: { a: txt('Etiqueta o tipo A', 'jugador'), b: txt('Etiqueta o tipo B', 'muro') },
  },
  recoge: {
    nombre: 'Al recoger', descripcion: 'Cuando alguien coge un objeto recogible.',
    campos: { que: txt('Etiqueta o tipo', 'moneda') },
  },
  marcador: {
    nombre: 'Al llegar a puntos', descripcion: 'Cuando un jugador alcanza una puntuación.',
    campos: {
      slot: opc('Quién', 0, [{ v: 0, n: 'Jugador 1' }, { v: 1, n: 'Jugador 2' }, { v: -1, n: 'Cualquiera' }]),
      puntos: num('Puntos', 10, 1, 999),
    },
  },
  muerte: {
    nombre: 'Al morir alguien', descripcion: 'Cuando un actor toca algo que mata.',
    campos: { slot: opc('Quién', -1, [{ v: 0, n: 'Jugador 1' }, { v: 1, n: 'Jugador 2' }, { v: -1, n: 'Cualquiera' }]) },
  },
};

export const ACCIONES = {
  puntos: {
    nombre: 'Sumar puntos',
    campos: {
      a: opc('A quién', 'causante', [
        { v: 'causante', n: 'Quien lo provocó' }, { v: 0, n: 'Jugador 1' }, { v: 1, n: 'Jugador 2' },
      ]),
      cantidad: num('Cuántos', 1, -50, 50),
    },
  },
  eliminar: { nombre: 'Quitar de la arena', campos: { objetivo: OBJETIVO, etiqueta: txt('Etiqueta', '') } },
  teletransportar: {
    nombre: 'Teletransportar',
    campos: { objetivo: OBJETIVO, etiqueta: txt('Etiqueta', ''), x: num('X', 600, 0, 2000, 10), y: num('Y', 350, 0, 2000, 10) },
  },
  generar: {
    nombre: 'Generar una pieza',
    campos: {
      que: txt('Tipo', 'moneda'),
      x: num('X', 600, 0, 2000, 10), y: num('Y', 350, 0, 2000, 10),
      cuantas: num('Cuántas', 1, 1, 30),
      alAzar: opc('Dónde', 'fijo', [{ v: 'fijo', n: 'Donde diga' }, { v: 'azar', n: 'Al azar en la arena' }]),
    },
  },
  velocidad: {
    nombre: 'Cambiar la velocidad',
    campos: { objetivo: OBJETIVO, etiqueta: txt('Etiqueta', ''), factor: num('Factor', 1.5, 0.1, 4, 0.1), durante: num('Durante (s)', 5, 0, 60, 0.5) },
  },
  empujar: {
    nombre: 'Dar un empujón',
    campos: { objetivo: OBJETIVO, etiqueta: txt('Etiqueta', ''), direccion: num('Dirección (grados)', 0, 0, 359, 15), fuerza: num('Fuerza', 300, 20, 1200, 20) },
  },
  matar: { nombre: 'Eliminar a un actor', campos: { objetivo: OBJETIVO, etiqueta: txt('Etiqueta', '') } },
  mensaje: { nombre: 'Enseñar un mensaje', campos: { texto: txt('Texto', '¡Bien!'), segundos: num('Durante (s)', 2, 0.5, 10, 0.5) } },
  sonido: {
    nombre: 'Sonar',
    campos: {
      cual: opc('Qué suena', 'pickup', [
        { v: 'pickup', n: 'Recoger' }, { v: 'hit', n: 'Golpe' }, { v: 'explosion', n: 'Explosión' },
        { v: 'jump', n: 'Salto' }, { v: 'laser', n: 'Láser' }, { v: 'win', n: 'Victoria' }, { v: 'error', n: 'Error' },
      ]),
    },
  },
  terminar: {
    nombre: 'Terminar la partida',
    campos: {
      ganador: opc('Gana', 'causante', [
        { v: 'causante', n: 'Quien lo provocó' }, { v: 0, n: 'Jugador 1' }, { v: 1, n: 'Jugador 2' },
        { v: 'puntos', n: 'El que más puntos tenga' }, { v: -1, n: 'Empate' },
      ]),
    },
  },
};

export const listaDisparadores = () => Object.entries(DISPARADORES).map(([id, d]) => ({ id, ...d }));
export const listaAcciones = () => Object.entries(ACCIONES).map(([id, a]) => ({ id, ...a }));

/**
 * ¿Se cumple este disparador ahora mismo?
 *
 * @param {object} regla
 * @param {object} suceso  lo que acaba de pasar este fotograma
 * @param {object} estado  { tiempo, puntos, dt }
 * @returns {object|null}  contexto del disparo (con `causante`) o null
 */
export function evalua(regla, suceso, estado) {
  const c = regla.cuando || {};
  switch (c.tipo) {
    case 'inicio':
      return suceso.tipo === 'inicio' ? {} : null;

    case 'tiempo':
      // Salta en el fotograma en que se cruza el umbral, no en todos los de después.
      return (estado.tiempo >= (c.segundos ?? 10)
        && estado.tiempo - estado.dt < (c.segundos ?? 10)) ? {} : null;

    case 'cada': {
      const p = Math.max(0.1, c.segundos ?? 5);
      return (Math.floor(estado.tiempo / p) !== Math.floor((estado.tiempo - estado.dt) / p)) ? {} : null;
    }

    case 'choque': {
      if (suceso.tipo !== 'choque') return null;
      const { a, b } = suceso;
      if (encaja(a, c.a) && encaja(b, c.b)) return { causante: a, otro: b };
      if (encaja(b, c.a) && encaja(a, c.b)) return { causante: b, otro: a };
      return null;
    }

    case 'recoge':
      if (suceso.tipo !== 'recoge') return null;
      return encaja(suceso.objeto, c.que) ? { causante: suceso.quien, otro: suceso.objeto } : null;

    case 'marcador': {
      if (suceso.tipo !== 'puntos') return null;
      const slot = c.slot ?? 0;
      if (slot !== -1 && suceso.slot !== slot) return null;
      return estado.puntos[suceso.slot] >= (c.puntos ?? 10) ? { causanteSlot: suceso.slot } : null;
    }

    case 'muerte': {
      if (suceso.tipo !== 'muerte') return null;
      const slot = c.slot ?? -1;
      if (slot !== -1 && suceso.slot !== slot) return null;
      return { causante: suceso.entidad, causanteSlot: suceso.slot };
    }

    default:
      return null;
  }
}

/** ¿Una entidad encaja con un selector? El selector es una etiqueta o un tipo. */
export function encaja(entidad, selector) {
  if (!entidad || !selector) return false;
  const s = String(selector).trim().toLowerCase();
  if (s === '*' || s === 'cualquiera') return true;
  return entidad.etiqueta?.toLowerCase() === s || entidad.tipo === s;
}
