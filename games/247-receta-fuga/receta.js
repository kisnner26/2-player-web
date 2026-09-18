/**
 * La Fuga — receta de ejemplo del creador.
 *
 * Demuestra: meta que gana, un bot que te persigue, barro que frena, zonas
 * con nombre y una regla que usa una zona para dar un empujón (el atajo).
 */
export default {
  version: 1,
  id: 'receta-fuga',
  nombre: 'La Fuga',
  descripcion: 'Llega a la meta con un perseguidor pisándote los talones.',
  arena: { ancho: 1200, alto: 700, fondo: '#0a1014', reja: true, muros: true, friccion: 3 },
  ajustes: { duracion: 0, paraGanar: 0, vidas: 1 },
  piezas: [
    { id: 'j1', tipo: 'jugador', x: 90, y: 350, props: { slot: 0, velocidad: 310 } },
    { id: 'b1', tipo: 'bot', x: 90, y: 600, etiqueta: 'perseguidor',
      props: { dificultad: 'normal', velocidad: 250, persigue: 'jugador' } },

    { id: 'meta', tipo: 'meta', x: 1120, y: 350, ancho: 100, alto: 200, props: { gana: true } },

    { id: 'z1', tipo: 'zona', x: 620, y: 120, ancho: 150, alto: 120, etiqueta: 'atajo' },

    { id: 'm1', tipo: 'muro', x: 340, y: 200, ancho: 26, alto: 340 },
    { id: 'm2', tipo: 'muro', x: 620, y: 480, ancho: 26, alto: 340 },
    { id: 'm3', tipo: 'muro', x: 880, y: 220, ancho: 26, alto: 340 },
    { id: 'l1', tipo: 'lento', x: 480, y: 560, ancho: 240, alto: 200, props: { factor: 0.4 } },
    { id: 'l2', tipo: 'lento', x: 760, y: 150, ancho: 200, alto: 180, props: { factor: 0.4 } },

    { id: 'p1', tipo: 'pincho', x: 500, y: 350, ancho: 160, alto: 22 },
    { id: 'p2', tipo: 'pincho', x: 1000, y: 480, ancho: 160, alto: 22 },
  ],
  reglas: [
    { id: 'r1', cuando: { tipo: 'inicio' }, entonces: [
      { tipo: 'mensaje', texto: 'Llega a la meta. El atajo de arriba te impulsa.', segundos: 3 },
    ] },
    { id: 'r2', unaVez: false, cuando: { tipo: 'choque', a: 'jugador', b: 'atajo' }, entonces: [
      { tipo: 'empujar', objetivo: 'causante', direccion: 0, fuerza: 620 },
      { tipo: 'sonido', cual: 'jump' },
    ] },
    { id: 'r3', unaVez: false, cuando: { tipo: 'choque', a: 'perseguidor', b: 'jugador' }, entonces: [
      { tipo: 'matar', objetivo: 'otro' },
    ] },
  ],
};
