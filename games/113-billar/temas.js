/**
 * temas.js — las dos salas.
 *
 * Un tema no es solo una paleta: cambia la luz, el material del paño, si hay
 * niebla, qué juego de bolas entra por defecto y qué ayudas de puntería se
 * dibujan. Está aparte para que añadir una tercera sala sea añadir un objeto,
 * sin tocar la construcción de la mesa ni la lógica del juego.
 */

export const TEMAS = [
  {
    id: 'clasico',
    nombre: 'Club',
    descripcion: 'Sala de billar, foco cenital y paño de competición',
    bolas: 'clasico',

    mundo: {
      cielo: '#0a0d14', horizonte: '#20293a', sol: 1.5, solPos: [6, 26, 10],
      sombraArea: 16, fov: 38, niebla: 0.006,
    },
    sala: { color: '#171b24', tam: 80, alto: 30 },
    suelo: { color: '#3a2a1e', veta: '#26190f', lineas: 22, repite: 22 },

    pano: { base: '#1a7a46', veta: '#14603a', ruido: 0.09, repite: 10 },
    madera: '#6b3d24',
    maderaOscura: '#40241590',
    faldon: '#4a2a1a',
    patas: '#33200f',
    rombos: '#f0e2c0',       // los rombos de puntería de las bandas
    tronera: '#0a0a10',
    cuero: '#2b1c12',

    /* Un solo foco cenital, como en un club: es lo que hace que el paño se
       vea brillante en el centro y las esquinas queden en penumbra. */
    foco: { color: 0xfff0d0, intensidad: 320, angulo: 0.78, penumbra: 0.55, alto: 13 },
    lampara: '#1c1c22',
    neon: null,
    rejilla: false,
    publico: { color: 0x445, filas: 3, porFila: 22, radio: 26 },

    guia: { color: 0xffffff, opacidad: 0.55, prediceBanda: false, marcaObjetivo: '#ffffff' },
    hud: { acento: '#f0e2c0', fondo: 'rgba(10,10,16,0.55)' },
  },

  {
    id: 'circuito',
    nombre: 'Circuito',
    descripcion: 'Billar futurista: mesa de cristal, bolas emisivas y guía que predice la banda',
    bolas: 'neon',

    mundo: {
      cielo: '#01030a', horizonte: '#04121e', sol: 0.55, solPos: [10, 30, 6],
      sombraArea: 16, fov: 40, niebla: 0.016,
    },
    sala: { color: '#04070f', tam: 90, alto: 34 },
    suelo: { color: '#050912', veta: '#0d2b3d', lineas: 40, repite: 40 },

    pano: { base: '#06222e', veta: '#0d4256', ruido: 0.05, repite: 14 },
    madera: '#0d1622',
    maderaOscura: '#00e5ff40',
    faldon: '#080e18',
    patas: '#0a1220',
    rombos: '#00e5ff',
    tronera: '#000308',
    cuero: '#0a1a24',

    /* Casi sin foco: aquí la luz la ponen las bolas y los bordes de neón. Un
       cenital fuerte apagaría los emisivos y la sala perdería la gracia. */
    foco: { color: 0x9fe8ff, intensidad: 90, angulo: 0.9, penumbra: 0.9, alto: 15 },
    lampara: null,
    neon: '#00e5ff',
    neonSecundario: '#ff2e88',
    rejilla: true,
    publico: { color: 0x0a3, filas: 3, porFila: 22, radio: 26, emisivo: '#00e5ff' },

    guia: { color: 0x00e5ff, opacidad: 0.9, prediceBanda: true, marcaObjetivo: '#00e5ff' },
    hud: { acento: '#00e5ff', fondo: 'rgba(0,12,20,0.6)' },
  },
];

export const temaPorId = (id) => TEMAS.find((t) => t.id === id) || TEMAS[0];
