/**
 * Fiebre del Oro — receta de ejemplo del creador.
 *
 * Demuestra: generadores, recogibles, un bot con objetivo propio, límite de
 * tiempo y una regla encadenada (a los 30 s el generador se acelera soltando
 * una tanda de monedas de golpe).
 */
export default {
  version: 1,
  id: 'receta-monedas',
  nombre: 'Fiebre del Oro',
  descripcion: 'Más monedas que la máquina en 45 segundos.',
  arena: { ancho: 1200, alto: 700, fondo: '#12100a', reja: true, muros: true, friccion: 3.4 },
  ajustes: { duracion: 45, paraGanar: 0, vidas: 0 },
  piezas: [
    { id: 'j1', tipo: 'jugador', x: 240, y: 350, props: { slot: 0, velocidad: 300, personaje: true } },
    { id: 'b1', tipo: 'bot', x: 960, y: 350, props: { dificultad: 'normal', velocidad: 280, persigue: 'moneda' } },

    { id: 'm1', tipo: 'muro', x: 600, y: 180, ancho: 260, alto: 26 },
    { id: 'm2', tipo: 'muro', x: 600, y: 520, ancho: 260, alto: 26 },
    { id: 'm3', tipo: 'muro', x: 340, y: 350, ancho: 26, alto: 200 },
    { id: 'm4', tipo: 'muro', x: 860, y: 350, ancho: 26, alto: 200 },

    { id: 'g1', tipo: 'generador', x: 600, y: 350, props: { que: 'moneda', cada: 1.1, tope: 10, impulso: 160 } },
    { id: 'h1', tipo: 'hielo', x: 200, y: 130, ancho: 220, alto: 160, props: { friccion: 0.25 } },
    { id: 'h2', tipo: 'hielo', x: 1000, y: 570, ancho: 220, alto: 160, props: { friccion: 0.25 } },
    { id: 'p1', tipo: 'pincho', x: 600, y: 60, ancho: 200, alto: 22 },
    { id: 'p2', tipo: 'pincho', x: 600, y: 640, ancho: 200, alto: 22 },
  ],
  reglas: [
    { id: 'r1', cuando: { tipo: 'inicio' }, entonces: [
      { tipo: 'mensaje', texto: '¡Coge más monedas que la máquina!', segundos: 2.5 },
      { tipo: 'generar', que: 'moneda', cuantas: 6, alAzar: 'azar' },
    ] },
    { id: 'r2', cuando: { tipo: 'tiempo', segundos: 30 }, entonces: [
      { tipo: 'mensaje', texto: '¡Lluvia de oro!', segundos: 2 },
      { tipo: 'generar', que: 'moneda', cuantas: 14, alAzar: 'azar' },
      { tipo: 'sonido', cual: 'win' },
    ] },
  ],
};
