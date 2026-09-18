/**
 * formato.js — qué ES un juego creado por un jugador.
 *
 * Los 244 juegos del catálogo son módulos JS escritos a mano, y eso tiene un
 * techo: no hay forma de recombinar código escrito. Un editor necesita que un
 * juego sea DATOS —una lista de piezas y una lista de reglas— para poder
 * añadir, mover y borrar sin escribir una línea. Es lo que hacen los formatos de
 * nivel de los juegos con editor: objetos con propiedades y disparadores.
 *
 * Esa es toda la idea del creador: `runtime.js` interpreta esta receta usando
 * el MISMO motor que los juegos escritos a mano, así que una receta tiene
 * acceso a las colisiones, las partículas, el sonido, los bots y los personajes que
 * ya existen. No se reimplementa nada.
 *
 * La versión del formato se guarda dentro. Cuando el catálogo de piezas
 * cambie, `migrar()` sube las recetas viejas en vez de romperlas: un juego que
 * alguien hizo hace tres meses tiene que seguir abriendo.
 */

export const VERSION = 1;

/** Tamaño lógico de la arena. El runtime escala esto al lienzo real. */
export const ARENA = { ancho: 1200, alto: 700 };

export const RECETA_BASE = {
  version: VERSION,
  id: '',
  nombre: 'Juego sin nombre',
  descripcion: '',
  autor: '',
  arena: {
    ancho: ARENA.ancho,
    alto: ARENA.alto,
    fondo: '#0b0d16',
    reja: true,
    muros: true,            // bordes sólidos; si no, se sale por los lados
    friccion: 3.2,          // rozamiento del suelo (0 = hielo en toda la arena)
  },
  ajustes: {
    duracion: 0,            // 0 = sin límite de tiempo
    paraGanar: 0,           // 0 = no se gana por marcador
    vidas: 0,               // 0 = no se muere por vidas
  },
  piezas: [],
  reglas: [],
};

/** Una pieza colocada. `props` son las propiedades propias de su tipo. */
export const PIEZA_BASE = {
  id: '',
  tipo: 'muro',
  x: 0, y: 0,
  ancho: 60, alto: 60,
  angulo: 0,
  color: null,              // null = el color por defecto del tipo
  etiqueta: '',             // nombre para referirse a ella desde las reglas
  props: {},
};

let contador = 0;
/** Identificador corto y único dentro de una receta. */
export function nuevoId(prefijo = 'p') {
  contador += 1;
  return `${prefijo}${contador.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/**
 * Completa una receta con los valores por defecto y la deja utilizable.
 * No lanza nunca: una receta rota debe poder abrirse para arreglarla, no
 * dejar al jugador con una pantalla en blanco.
 */
export function normalizar(cruda) {
  const r = {
    ...structuredClone(RECETA_BASE),
    ...(cruda || {}),
    arena: { ...RECETA_BASE.arena, ...(cruda?.arena || {}) },
    ajustes: { ...RECETA_BASE.ajustes, ...(cruda?.ajustes || {}) },
  };
  r.piezas = (Array.isArray(cruda?.piezas) ? cruda.piezas : []).map((p) => ({
    ...structuredClone(PIEZA_BASE),
    ...p,
    id: p.id || nuevoId(),
    props: { ...(p.props || {}) },
  }));
  r.reglas = (Array.isArray(cruda?.reglas) ? cruda.reglas : []).map((g) => ({
    id: g.id || nuevoId('r'),
    cuando: g.cuando || { tipo: 'inicio' },
    entonces: Array.isArray(g.entonces) ? g.entonces : [],
    unaVez: g.unaVez !== false,        // por defecto, un disparador salta una vez
    disparada: false,
  }));
  return r;
}

/**
 * Sube una receta de versiones anteriores.
 * Hoy solo hay la 1; la función existe desde el principio a propósito, porque
 * el día que haga falta ya habrá recetas guardadas por ahí.
 */
export function migrar(cruda) {
  const r = { ...(cruda || {}) };
  if (!r.version || r.version < 1) r.version = 1;
  return normalizar(r);
}

/**
 * Revisa una receta y devuelve los problemas en lenguaje llano.
 * Es para el editor: avisar de «esto no se va a poder jugar» ANTES de darle a
 * probar es la diferencia entre una herramienta y un juguete.
 */
export function revisar(receta) {
  const r = normalizar(receta);
  const avisos = [];
  const jugadores = r.piezas.filter((p) => p.tipo === 'jugador');
  if (!jugadores.length) avisos.push('No hay ningún jugador colocado: nadie podría jugar.');
  if (jugadores.some((p) => (p.props.slot ?? 0) === 1) && jugadores.length < 2) {
    avisos.push('Hay un jugador 2 pero no un jugador 1.');
  }
  /* Una meta que gana también termina la partida: el validador no lo sabía y
     avisaba en falso en cualquier juego de carrera, que es el caso más obvio
     de todos. */
  const hayMeta = r.piezas.some((p) => p.tipo === 'meta' && p.props?.gana !== false);
  const puedeAcabar = r.ajustes.duracion > 0 || r.ajustes.paraGanar > 0
    || r.ajustes.vidas > 0 || hayMeta
    || r.reglas.some((g) => g.entonces.some((a) => a.tipo === 'terminar'));
  if (!puedeAcabar) {
    avisos.push('La partida no puede terminar nunca: pon tiempo, marcador, vidas, una meta o una regla que termine.');
  }
  /* Y aun con meta, sin reloj una partida en la que nadie llega no acaba. */
  if (hayMeta && !r.ajustes.duracion && !r.ajustes.vidas) {
    avisos.push('Hay meta pero no hay tiempo límite: si nadie llega, la partida no termina.');
  }
  const etiquetas = new Set();
  for (const p of r.piezas) {
    if (!p.etiqueta) continue;
    if (etiquetas.has(p.etiqueta)) avisos.push(`La etiqueta «${p.etiqueta}» está repetida: las reglas no sabrán a cuál te refieres.`);
    etiquetas.add(p.etiqueta);
  }
  return avisos;
}

/** Serializa a texto para exportar a un archivo `.2pa`. */
export function aTexto(receta) {
  const r = normalizar(receta);
  // Sin `disparada`, que es estado de la partida y no del juego.
  r.reglas = r.reglas.map(({ disparada, ...g }) => g);
  return JSON.stringify(r, null, 2);
}

export function desdeTexto(texto) {
  return migrar(JSON.parse(texto));
}
