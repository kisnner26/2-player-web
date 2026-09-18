/**
 * piezas.js — el catálogo de lo que se puede colocar.
 *
 * Cada pieza declara qué ES (forma, color, si estorba, si mata, si se recoge)
 * y NO cómo se dibuja ni cómo choca: de eso se encarga `runtime.js` una sola
 * vez para todas. Así añadir una pieza nueva son diez líneas aquí y ni una
 * sola en el intérprete, que es la prueba de que la separación está bien
 * hecha: el editor también se entera solo, porque construye su paleta
 * recorriendo este catálogo.
 *
 * `props` son las propiedades editables de cada tipo, con su tipo de control
 * para que el inspector del editor se dibuje solo.
 */

export const FAMILIAS = {
  actores: { nombre: 'Actores', color: '#ff2e88' },
  terreno: { nombre: 'Terreno', color: '#5b8cff' },
  objetos: { nombre: 'Objetos', color: '#ffd166' },
  zonas: { nombre: 'Zonas', color: '#a8ff3e' },
};

/* Tipos de control que entiende el inspector: numero | texto | color |
   opcion | interruptor. */
const num = (nombre, def, min, max, paso = 1) => ({ control: 'numero', nombre, def, min, max, paso });
const opc = (nombre, def, opciones) => ({ control: 'opcion', nombre, def, opciones });
const bool = (nombre, def) => ({ control: 'interruptor', nombre, def });

export const PIEZAS = {
  /* ---------------- Actores ---------------- */
  jugador: {
    nombre: 'Jugador', familia: 'actores', forma: 'circulo',
    ancho: 36, alto: 36, color: null,      // null = color del perfil
    solido: true, movil: true,
    descripcion: 'Lo controla una persona. El color sale de su perfil.',
    props: {
      slot: opc('Quién', 0, [{ v: 0, n: 'Jugador 1' }, { v: 1, n: 'Jugador 2' }]),
      velocidad: num('Velocidad', 260, 60, 900, 10),
      dispara: bool('Puede disparar', false),
      personaje: bool('Usar su personaje', true),
    },
  },
  bot: {
    nombre: 'Bot', familia: 'actores', forma: 'circulo',
    ancho: 36, alto: 36, color: '#8f98a6',
    solido: true, movil: true,
    descripcion: 'Lo lleva la máquina, con el rival de core/bot.js.',
    props: {
      dificultad: opc('Dificultad', 'normal', [
        { v: 'facil', n: 'Fácil' }, { v: 'normal', n: 'Normal' }, { v: 'duro', n: 'Duro' },
      ]),
      velocidad: num('Velocidad', 240, 60, 900, 10),
      persigue: opc('Qué hace', 'jugador', [
        { v: 'jugador', n: 'Persigue al jugador' },
        { v: 'moneda', n: 'Va a por las monedas' },
        { v: 'huye', n: 'Huye del jugador' },
        { v: 'patrulla', n: 'Patrulla' },
      ]),
      dispara: bool('Puede disparar', false),
    },
  },

  /* ---------------- Terreno ---------------- */
  muro: {
    nombre: 'Muro', familia: 'terreno', forma: 'rect',
    ancho: 120, alto: 30, color: '#3b4560', solido: true,
    descripcion: 'Bloquea el paso. La pieza más básica.',
    props: { rebota: bool('Hace rebotar', false) },
  },
  pincho: {
    nombre: 'Pinchos', familia: 'terreno', forma: 'sierra',
    ancho: 90, alto: 24, color: '#ff4757', mata: true,
    descripcion: 'Quien lo toca muere o pierde una vida.',
    props: {},
  },
  hielo: {
    nombre: 'Hielo', familia: 'terreno', forma: 'rect',
    ancho: 160, alto: 160, color: '#8fd9ff', suelo: true,
    descripcion: 'Encima resbalas: casi no hay rozamiento.',
    props: { friccion: num('Rozamiento', 0.3, 0, 3, 0.1) },
  },
  cinta: {
    nombre: 'Cinta', familia: 'terreno', forma: 'rect',
    ancho: 160, alto: 80, color: '#b08050', suelo: true,
    descripcion: 'Te arrastra en una dirección mientras estás encima.',
    props: {
      direccion: num('Dirección (grados)', 0, 0, 359, 15),
      fuerza: num('Fuerza', 260, 20, 900, 20),
    },
  },
  lento: {
    nombre: 'Barro', familia: 'terreno', forma: 'rect',
    ancho: 160, alto: 160, color: '#6b5a3a', suelo: true,
    descripcion: 'Encima te mueves a la mitad.',
    props: { factor: num('Cuánto frena', 0.45, 0.1, 0.95, 0.05) },
  },

  /* ---------------- Objetos ---------------- */
  moneda: {
    nombre: 'Moneda', familia: 'objetos', forma: 'circulo',
    ancho: 22, alto: 22, color: '#ffd166', recoge: true,
    descripcion: 'Se recoge al tocarla y da puntos.',
    props: {
      puntos: num('Puntos', 1, 1, 50),
      reaparece: num('Reaparece a los (s)', 0, 0, 60),
    },
  },
  pelota: {
    nombre: 'Pelota', familia: 'objetos', forma: 'circulo',
    ancho: 30, alto: 30, color: '#f3efe4', solido: true, movil: true, fisica: true,
    descripcion: 'Rueda, rebota y la puedes empujar.',
    props: { rebote: num('Rebote', 0.85, 0, 1, 0.05), masa: num('Peso', 1, 0.2, 8, 0.2) },
  },
  caja: {
    nombre: 'Caja', familia: 'objetos', forma: 'rect',
    ancho: 46, alto: 46, color: '#a0763f', solido: true, movil: true, fisica: true,
    descripcion: 'Se empuja pero pesa: apenas rebota.',
    props: { rebote: num('Rebote', 0.15, 0, 1, 0.05), masa: num('Peso', 3, 0.5, 12, 0.5) },
  },
  bomba: {
    nombre: 'Bomba', familia: 'objetos', forma: 'circulo',
    ancho: 28, alto: 28, color: '#2b2b3d', mata: true, movil: true, fisica: true,
    descripcion: 'Rueda y mata a quien la toque.',
    props: { rebote: num('Rebote', 0.9, 0, 1, 0.05), masa: num('Peso', 1, 0.2, 6, 0.2) },
  },

  /* ---------------- Zonas ---------------- */
  meta: {
    nombre: 'Meta', familia: 'zonas', forma: 'rect',
    ancho: 90, alto: 90, color: '#a8ff3e', zona: true,
    descripcion: 'Quien la pisa gana, salvo que una regla diga otra cosa.',
    props: { gana: bool('Gana quien la toque', true) },
  },
  zona: {
    nombre: 'Zona', familia: 'zonas', forma: 'rect',
    ancho: 140, alto: 140, color: '#00e5ff', zona: true,
    descripcion: 'No hace nada por sí sola: sirve para las reglas.',
    props: {},
  },
  muerte: {
    nombre: 'Zona de muerte', familia: 'zonas', forma: 'rect',
    ancho: 140, alto: 140, color: '#ff2e88', zona: true, mata: true,
    descripcion: 'Como los pinchos, pero un área grande.',
    props: {},
  },
  generador: {
    nombre: 'Generador', familia: 'zonas', forma: 'diamante',
    ancho: 40, alto: 40, color: '#b04cff',
    descripcion: 'Suelta copias de una pieza cada pocos segundos.',
    props: {
      que: opc('Qué genera', 'moneda', [
        { v: 'moneda', n: 'Monedas' }, { v: 'pelota', n: 'Pelotas' },
        { v: 'bomba', n: 'Bombas' }, { v: 'caja', n: 'Cajas' },
      ]),
      cada: num('Cada (s)', 3, 0.3, 30, 0.1),
      tope: num('Máximo a la vez', 6, 1, 40),
      impulso: num('Impulso', 0, 0, 600, 20),
    },
  },
};

export const listaPiezas = () => Object.entries(PIEZAS).map(([id, p]) => ({ id, ...p }));

/** Propiedades por defecto de un tipo, listas para una pieza nueva. */
export function propsPorDefecto(tipo) {
  const def = PIEZAS[tipo];
  if (!def) return {};
  const out = {};
  for (const [clave, meta] of Object.entries(def.props || {})) out[clave] = meta.def;
  return out;
}

/** Crea una pieza colocada de un tipo, con sus medidas y propiedades. */
export function crearPieza(tipo, x, y) {
  const def = PIEZAS[tipo] || PIEZAS.muro;
  return {
    tipo, x, y,
    ancho: def.ancho, alto: def.alto,
    angulo: 0, color: null, etiqueta: '',
    props: propsPorDefecto(tipo),
  };
}
