/**
 * logros.js — metas a largo plazo.
 *
 * Un catálogo de 500 juegos no da por sí solo ninguna razón para volver
 * mañana: das una vuelta, pruebas cuatro y se acabó. Los logros son lo que
 * convierte «tenemos muchos juegos» en «nos faltan cosas», que es un motivo
 * distinto y mucho más fuerte.
 *
 * Reglas que me he impuesto al escribirlos:
 *   · Ninguno pide moler. «Juega 1000 partidas» no es una meta, es un peaje.
 *   · Casi todos se consiguen JUGANDO NORMAL, no desviándote. El que te obliga
 *     a cambiar de plan tiene que valer la pena.
 *   · Cada uno se comprueba con datos que YA se guardan (rivalidad, probados,
 *     favoritos, récords): ningún logro añade contabilidad nueva al shell.
 *
 * Se evalúan al terminar una partida y al abrir el menú. Son baratos: leer
 * cuatro claves de localStorage y contar.
 */

import {
  loadRivalry, loadPlayed, loadFavoritos, loadRecords, loadRecientes,
} from './storage.js';

const CLAVE = '2pa:logros';

const leer = () => {
  try { return JSON.parse(localStorage.getItem(CLAVE) || '{}'); } catch { return {}; }
};
const escribir = (v) => { try { localStorage.setItem(CLAVE, JSON.stringify(v)); } catch {} };

/**
 * Cada logro: `mide(datos)` devuelve el progreso actual y `de` el objetivo.
 * Guardar progreso y no solo sí/no permite enseñar «17 de 25», que es lo que
 * hace que se persiga en vez de descubrirse por accidente.
 */
export const LOGROS = [
  {
    id: 'primera', nombre: 'La primera de muchas', icono: 'play',
    desc: 'Terminad vuestra primera partida.',
    de: 1, mide: (d) => Math.min(1, d.partidas),
  },
  {
    id: 'catador', nombre: 'Catadores', icono: 'grid',
    desc: 'Probad 25 juegos distintos.',
    de: 25, mide: (d) => d.probados,
  },
  {
    id: 'trotamundos', nombre: 'Trotamundos', icono: 'globe',
    desc: 'Probad 100 juegos distintos.',
    de: 100, mide: (d) => d.probados,
  },
  {
    id: 'enciclopedia', nombre: 'Enciclopedia', icono: 'brain',
    desc: 'Probad 250 juegos distintos. Casi nadie llega aquí.',
    de: 250, mide: (d) => d.probados,
  },
  {
    id: 'todoterreno', nombre: 'Todoterreno', icono: 'target',
    desc: 'Jugad al menos uno de cada categoría.',
    de: 8, mide: (d) => d.categorias,
  },
  {
    id: 'reincidentes', nombre: 'Reincidentes', icono: 'flame',
    desc: 'Jugad diez veces al mismo juego.',
    de: 10, mide: (d) => d.masRepetido,
  },
  {
    id: 'parejo', nombre: 'De igual a igual', icono: 'handshake',
    desc: 'Llegad a 20 partidas con menos de tres de diferencia entre los dos.',
    de: 1, mide: (d) => (d.partidas >= 20 && Math.abs(d.victorias[0] - d.victorias[1]) < 3 ? 1 : 0),
  },
  {
    id: 'racha', nombre: 'Rey de la casa', icono: 'trophy',
    desc: 'Que alguien gane 25 partidas.',
    de: 25, mide: (d) => Math.max(d.victorias[0], d.victorias[1]),
  },
  {
    id: 'coleccionista', nombre: 'Coleccionistas', icono: 'star',
    desc: 'Marcad 15 favoritos.',
    de: 15, mide: (d) => d.favoritos,
  },
  {
    id: 'plusmarquista', nombre: 'Plusmarquistas', icono: 'bolt',
    desc: 'Batid 20 récords.',
    de: 20, mide: (d) => d.records,
  },
  {
    id: 'arquitecto', nombre: 'Arquitectos', icono: 'palette',
    desc: 'Haced un juego con el creador y jugadlo.',
    de: 1, mide: (d) => (d.creadosJugados ? 1 : 0),
  },
  {
    id: 'desafiantes', nombre: 'Desafiantes', icono: 'dice',
    desc: 'Superad 20 desafíos generados.',
    de: 20, mide: (d) => d.desafios,
  },
  {
    id: 'trasnochadores', nombre: 'Trasnochadores', icono: 'house',
    desc: 'Jugad diez juegos distintos en una misma sesión.',
    de: 10, mide: (d) => d.recientes,
  },
  {
    id: 'empatadores', nombre: 'Ni para ti ni para mí', icono: 'link',
    desc: 'Acabad cinco partidas en empate.',
    de: 5, mide: (d) => d.empates,
  },
];

/** Reúne de una vez todo lo que miran los logros. */
function datos() {
  const riv = loadRivalry();
  const probados = loadPlayed();
  const ids = Object.keys(probados);
  const porJuego = Object.values(riv.byGame || {});
  return {
    partidas: riv.total[0] + riv.total[1] + (riv.draws || 0),
    victorias: riv.total,
    empates: riv.draws || 0,
    probados: ids.length,
    masRepetido: porJuego.reduce((m, g) => Math.max(m, g.plays || 0), 0),
    favoritos: Object.keys(loadFavoritos()).length,
    records: Object.keys(loadRecords()).length,
    recientes: loadRecientes().length,
    creadosJugados: ids.some((id) => id.startsWith('creado:')),
    desafios: ids.filter((id) => id.startsWith('desafio-')).length,
    // Cuántas categorías distintas se han tocado. Se deduce de los ids
    // probados cruzándolos con el manifiesto, que lo pasa quien llama.
    categorias: 0,
  };
}

/**
 * Estado de todos los logros.
 * @param {Array} juegos catálogo, para saber la categoría de lo ya probado
 */
export function estado(juegos = []) {
  const d = datos();
  if (juegos.length) {
    const probados = loadPlayed();
    const cats = new Set();
    for (const g of juegos) if (probados[g.id]) cats.add(g.categoria);
    d.categorias = cats.size;
  }
  const guardados = leer();
  return LOGROS.map((l) => {
    const hecho = Math.min(l.de, Math.max(0, l.mide(d)));
    return {
      ...l,
      progreso: hecho,
      conseguido: hecho >= l.de,
      cuando: guardados[l.id] || null,
    };
  });
}

/**
 * Comprueba y devuelve los que se acaban de conseguir AHORA.
 * Se apunta la fecha para no volver a anunciarlos: un logro que salta dos
 * veces deja de significar nada.
 */
export function revisar(juegos = []) {
  const guardados = leer();
  const nuevos = [];
  for (const l of estado(juegos)) {
    if (!l.conseguido || guardados[l.id]) continue;
    guardados[l.id] = Date.now();
    nuevos.push(l);
  }
  if (nuevos.length) escribir(guardados);
  return nuevos;
}

export const contar = (juegos = []) => {
  const e = estado(juegos);
  return { hechos: e.filter((l) => l.conseguido).length, total: e.length };
};
