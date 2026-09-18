/**
 * Arena de Bombas — receta de ejemplo del creador.
 *
 * Demuestra: dos jugadores humanos, objetos con física que ruedan y matan,
 * cintas transportadoras, vidas y victoria por eliminación.
 */
export default {
  version: 1,
  id: 'receta-arena',
  nombre: 'Arena de Bombas',
  descripcion: 'Esquiva las bombas y empuja al otro contra ellas. Tres vidas.',
  arena: { ancho: 1200, alto: 700, fondo: '#0d0a12', reja: true, muros: true, friccion: 2.6 },
  ajustes: { duracion: 0, paraGanar: 0, vidas: 3 },
  piezas: [
    { id: 'j1', tipo: 'jugador', x: 260, y: 350, props: { slot: 0, velocidad: 300 } },
    { id: 'j2', tipo: 'jugador', x: 940, y: 350, props: { slot: 1, velocidad: 300 } },

    { id: 'c1', tipo: 'cinta', x: 600, y: 140, ancho: 420, alto: 90, props: { direccion: 0, fuerza: 300 } },
    { id: 'c2', tipo: 'cinta', x: 600, y: 560, ancho: 420, alto: 90, props: { direccion: 180, fuerza: 300 } },

    { id: 'm1', tipo: 'muro', x: 600, y: 350, ancho: 30, alto: 190 },
    { id: 'm2', tipo: 'muro', x: 380, y: 350, ancho: 130, alto: 26 },
    { id: 'm3', tipo: 'muro', x: 820, y: 350, ancho: 130, alto: 26 },

    { id: 'g1', tipo: 'generador', x: 300, y: 350, props: { que: 'bomba', cada: 4, tope: 3, impulso: 320 } },
    { id: 'g2', tipo: 'generador', x: 900, y: 350, props: { que: 'bomba', cada: 4, tope: 3, impulso: 320 } },
  ],
  reglas: [
    { id: 'r1', cuando: { tipo: 'inicio' }, entonces: [
      { tipo: 'mensaje', texto: 'Tres vidas. Las bombas ruedan y no perdonan.', segundos: 3 },
    ] },
    { id: 'r2', unaVez: false, cuando: { tipo: 'muerte', slot: -1 }, entonces: [
      { tipo: 'sonido', cual: 'error' },
      { tipo: 'mensaje', texto: '¡Una vida menos!', segundos: 1.2 },
    ] },
  ],
};
