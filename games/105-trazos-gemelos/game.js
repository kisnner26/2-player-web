/**
 * Trazos Gemelos — cada uno dibuja su mitad de la figura en su propia pantalla.
 *
 * Por qué necesita mando: hacen falta dos superficies de dibujo privadas a la
 * vez. En una sola pantalla compartida cada uno vería lo que hace el otro y se
 * copiarían; con un ratón, además, solo puede dibujar uno.
 *
 * La pantalla de la Mac enseña la figura objetivo en gris. Cada jugador dibuja
 * en su iPad la mitad que le toca, a ciegas respecto al otro, y al soltar el
 * dedo las dos mitades se juntan y se puntúan.
 *
 * La nota compara el trazo con la plantilla en una rejilla gruesa: premia
 * cubrir la figura y penaliza pintar fuera. No busca precisión de calco, que
 * con un dedo sería frustrante, sino que se reconozca la forma.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

/* Figuras como polilíneas en coordenadas 0..1. La coordenada x va de 0 a 1
   sobre la figura entera; cada jugador recibe su mitad al puntuar. */
const FIGURAS = [
  {
    nombre: 'Corazón',
    trazos: [[
      [0.5, 0.88], [0.18, 0.52], [0.14, 0.3], [0.28, 0.16], [0.42, 0.2], [0.5, 0.34],
      [0.58, 0.2], [0.72, 0.16], [0.86, 0.3], [0.82, 0.52], [0.5, 0.88],
    ]],
  },
  {
    nombre: 'Estrella',
    trazos: [[
      [0.5, 0.1], [0.61, 0.4], [0.92, 0.4], [0.67, 0.59], [0.77, 0.89],
      [0.5, 0.7], [0.23, 0.89], [0.33, 0.59], [0.08, 0.4], [0.39, 0.4], [0.5, 0.1],
    ]],
  },
  {
    nombre: 'Casa',
    trazos: [
      [[0.5, 0.12], [0.12, 0.44], [0.88, 0.44], [0.5, 0.12]],
      [[0.2, 0.44], [0.2, 0.88], [0.8, 0.88], [0.8, 0.44]],
    ],
  },
  {
    nombre: 'Pez',
    trazos: [[
      [0.2, 0.5], [0.42, 0.28], [0.68, 0.32], [0.82, 0.5], [0.68, 0.68],
      [0.42, 0.72], [0.2, 0.5], [0.06, 0.32], [0.08, 0.68], [0.2, 0.5],
    ]],
  },
  {
    nombre: 'Luna',
    trazos: [[
      [0.62, 0.12], [0.36, 0.22], [0.24, 0.5], [0.36, 0.78], [0.62, 0.88],
      [0.44, 0.7], [0.4, 0.5], [0.44, 0.3], [0.62, 0.12],
    ]],
  },
  {
    nombre: 'Paraguas',
    trazos: [
      [[0.1, 0.46], [0.3, 0.18], [0.7, 0.18], [0.9, 0.46], [0.1, 0.46]],
      [[0.5, 0.46], [0.5, 0.82], [0.66, 0.86]],
    ],
  },
  {
    nombre: 'Rayo',
    trazos: [[
      [0.6, 0.08], [0.3, 0.5], [0.5, 0.5], [0.36, 0.92], [0.72, 0.44], [0.5, 0.44], [0.6, 0.08],
    ]],
  },
  {
    nombre: 'Taza',
    trazos: [
      [[0.24, 0.28], [0.28, 0.8], [0.66, 0.8], [0.7, 0.28], [0.24, 0.28]],
      [[0.7, 0.4], [0.86, 0.44], [0.84, 0.62], [0.7, 0.64]],
    ],
  },
];

/* Rejilla de puntuación. Gruesa a propósito: con el dedo nadie calca. */
const REJ_X = 26;
const REJ_Y = 26;
const RONDAS = 4;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let ronda = 0;
  let figura = null;
  let orden = [];
  const trazos = [[], []];      // trazos recibidos por jugador, en 0..1 de SU mitad
  const listo = [false, false];
  let notas = [0, 0];
  let total = [0, 0];
  let estado = 'dibujando';     // dibujando | revisando
  let pausa = 0;
  let aviso = '';
  let avisoT = 0;
  let tiempo = 0;

  function decir(t) { aviso = t; avisoT = 2.6; }

  /** Celdas de la rejilla que cubre la figura objetivo. */
  function celdasDe(trazosFig) {
    const set = new Set();
    for (const linea of trazosFig) {
      for (let i = 1; i < linea.length; i++) {
        const [x0, y0] = linea[i - 1];
        const [x1, y1] = linea[i];
        const pasos = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * Math.max(REJ_X, REJ_Y) * 1.6) + 1;
        for (let k = 0; k <= pasos; k++) {
          const t = k / pasos;
          const cx = Math.floor(clamp(x0 + (x1 - x0) * t, 0, 0.999) * REJ_X);
          const cy = Math.floor(clamp(y0 + (y1 - y0) * t, 0, 0.999) * REJ_Y);
          set.add(cy * REJ_X + cx);
        }
      }
    }
    return set;
  }

  function nuevaRonda() {
    if (!orden.length) {
      orden = FIGURAS.map((_, i) => i).sort(() => ctx.rng() - 0.5);
    }
    figura = FIGURAS[orden.pop()];
    figura.celdas = celdasDe(figura.trazos);
    trazos[0] = [];
    trazos[1] = [];
    listo[0] = listo[1] = false;
    notas = [0, 0];
    estado = 'dibujando';
    decir(`Dibujen: ${figura.nombre}`);

    // El mando de cada uno le dice qué mitad le toca. Es información que solo
    // cabe en su pantalla: en la de la Mac ocuparía sitio y la vería el otro.
    for (const i of [0, 1]) {
      ctx.mando.perfil(i, {
        // «lienzo»: el dibujo se lleva la pantalla entera del aparato. Con la
        // disposición apilada quedaba una franja donde no cabía un garabato.
        disposicion: 'lienzo',
        juego: 'Trazos Gemelos',
        pie: `Tu mitad: ${i === 0 ? 'IZQUIERDA' : 'DERECHA'}`,
        controles: [
          { tipo: 'secreto', titulo: `Ronda ${ronda + 1} de ${RONDAS}`, texto: figura.nombre, dato: i === 0 ? '◧ mitad izquierda' : '◨ mitad derecha' },
          { tipo: 'trazo', pista: 'Dibuja tu mitad y suelta' },
        ],
      });
    }
  }

  /** Nota de 0 a 100 comparando el trazo del jugador con su mitad de la figura. */
  function puntuar(indice) {
    // Celdas de la plantilla que caen en la mitad de este jugador.
    const objetivo = new Set();
    for (const c of figura.celdas) {
      const cx = c % REJ_X;
      const enIzquierda = cx < REJ_X / 2;
      if (enIzquierda === (indice === 0)) objetivo.add(c);
    }
    if (!objetivo.size) return 100;

    // Celdas pintadas por el jugador, trasladadas a la rejilla completa.
    const pintadas = new Set();
    for (const linea of trazos[indice]) {
      for (let i = 1; i < linea.length; i++) {
        const [ax, ay] = linea[i - 1];
        const [bx, by] = linea[i];
        const pasos = Math.ceil(Math.hypot(bx - ax, by - ay) * Math.max(REJ_X, REJ_Y) * 1.6) + 1;
        for (let k = 0; k <= pasos; k++) {
          const t = k / pasos;
          const gx = (ax + (bx - ax) * t) / 2 + (indice === 1 ? 0.5 : 0);
          const gy = ay + (by - ay) * t;
          pintadas.add(Math.floor(clamp(gy, 0, 0.999) * REJ_Y) * REJ_X
                     + Math.floor(clamp(gx, 0, 0.999) * REJ_X));
        }
      }
    }
    if (!pintadas.size) return 0;

    // Se cuenta como acierto una celda vecina, no solo la exacta: con el dedo
    // exigir la casilla justa daría notas ridículas incluso dibujando bien.
    let cubiertas = 0;
    for (const c of objetivo) {
      const cx = c % REJ_X, cy = Math.floor(c / REJ_X);
      let cerca = false;
      for (let dy = -1; dy <= 1 && !cerca; dy++) {
        for (let dx = -1; dx <= 1 && !cerca; dx++) {
          if (pintadas.has((cy + dy) * REJ_X + (cx + dx))) cerca = true;
        }
      }
      if (cerca) cubiertas++;
    }
    const cobertura = cubiertas / objetivo.size;

    let fuera = 0;
    for (const c of pintadas) {
      const cx = c % REJ_X, cy = Math.floor(c / REJ_X);
      let cerca = false;
      for (let dy = -1; dy <= 1 && !cerca; dy++) {
        for (let dx = -1; dx <= 1 && !cerca; dx++) {
          if (objetivo.has((cy + dy) * REJ_X + (cx + dx))) cerca = true;
        }
      }
      if (!cerca) fuera++;
    }
    const exceso = fuera / pintadas.size;

    return Math.round(clamp(cobertura * 100 - exceso * 45, 0, 100));
  }

  function revisar() {
    estado = 'revisando';
    notas = [puntuar(0), puntuar(1)];
    total[0] += notas[0];
    total[1] += notas[1];
    const media = Math.round((notas[0] + notas[1]) / 2);
    pausa = 3;
    decir(media >= 70 ? `¡Clavado! ${media}/100` : media >= 40 ? `Se reconoce: ${media}/100` : `Eso no era: ${media}/100`);
    audio[media >= 70 ? 'win' : media >= 40 ? 'blip' : 'error']?.();
    for (const i of [0, 1]) {
      ctx.mando.vibrar(i, notas[i] >= 60 ? 'punto' : 'error');
      ctx.mando.perfil(i, {
        disposicion: 'solo',
        juego: 'Trazos Gemelos',
        pie: 'Mira la pantalla de la Mac',
        controles: [{ tipo: 'secreto', titulo: 'Tu nota', texto: figura.nombre, dato: `${notas[i]} / 100` }],
      });
    }
    particles.burst(W / 2, H / 2, 26, {
      speed: 240, dir: -Math.PI / 2, spread: Math.PI * 2,
      color: media >= 70 ? '#a8ff3e' : '#ffd166', size: 3, drag: 0.9,
    });
    haptics.play('score', { player: 0 });
  }

  return {
    init() { nuevaRonda(); },
    resize(w, h) { W = w; H = h; },

    update(dt) {
      tiempo += dt;
      avisoT = Math.max(0, avisoT - dt);

      if (estado === 'revisando') {
        pausa -= dt;
        if (pausa <= 0) {
          ronda++;
          if (ronda >= RONDAS) {
            const g0 = total[0], g1 = total[1];
            ctx.record('trazo', Math.round((g0 + g1) / (RONDAS * 2)), 'max');
            ctx.finish({
              winner: g0 === g1 ? -1 : (g0 > g1 ? 0 : 1),
              titulo: `Media de la pareja: ${Math.round((g0 + g1) / (RONDAS * 2))}/100`,
              scores: [Math.round(g0 / RONDAS), Math.round(g1 / RONDAS)],
            });
            return;
          }
          nuevaRonda();
        }
        return;
      }

      // Cada trazo que llega del mando se apunta y se marca al jugador como
      // listo: se dibuja de una tirada, sin botón de confirmar.
      for (const i of [0, 1]) {
        const nuevos = input.player(i).tomarTrazos();
        for (const t of nuevos) {
          if (t.length < 2) continue;
          trazos[i].push(t);
          listo[i] = true;
          audio.blip();
          haptics.play('click', { player: i });
        }
      }
      if (listo[0] && listo[1]) revisar();
    },

    render() {
      const g = ctx.c;
      g.fillStyle = '#161326';
      g.fillRect(0, 0, W, H);

      // Zona de dibujo: cuadrada y centrada, con las dos mitades marcadas.
      const lado = Math.min(W * 0.8, H * 0.7);
      const ox = W / 2 - lado / 2, oy = H / 2 - lado / 2 + 10;

      g.fillStyle = '#ffffff08';
      g.fillRect(ox, oy, lado, lado);
      g.strokeStyle = '#ffffff22';
      g.lineWidth = 1;
      g.strokeRect(ox, oy, lado, lado);
      g.save();
      g.setLineDash([6, 8]);
      g.beginPath();
      g.moveTo(ox + lado / 2, oy);
      g.lineTo(ox + lado / 2, oy + lado);
      g.stroke();
      g.restore();

      // Plantilla en gris: es la referencia común, la ven los dos.
      if (figura) {
        g.strokeStyle = '#ffffff33';
        g.lineWidth = Math.max(6, lado * 0.035);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        for (const linea of figura.trazos) {
          g.beginPath();
          linea.forEach(([x, y], i) => {
            const px = ox + x * lado, py = oy + y * lado;
            i ? g.lineTo(px, py) : g.moveTo(px, py);
          });
          g.stroke();
        }
      }

      // Lo dibujado por cada jugador, cada uno en su mitad y con su color.
      for (const i of [0, 1]) {
        g.strokeStyle = players[i].color;
        g.lineWidth = Math.max(4, lado * 0.022);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.save();
        g.shadowColor = players[i].color;
        g.shadowBlur = 10;
        for (const linea of trazos[i]) {
          g.beginPath();
          linea.forEach(([x, y], k) => {
            const px = ox + (x / 2 + (i === 1 ? 0.5 : 0)) * lado;
            const py = oy + y * lado;
            k ? g.lineTo(px, py) : g.moveTo(px, py);
          });
          g.stroke();
        }
        g.restore();
      }

      particles.render(g);

      /* --- HUD --- */
      ctx.engine.text(`Ronda ${Math.min(ronda + 1, RONDAS)} de ${RONDAS}`, W / 2, 26, { size: 13, color: '#ffffff' });
      if (figura) {
        ctx.engine.text(figura.nombre.toUpperCase(), W / 2, 48, { size: 16, color: '#ffd166' });
      }

      for (const i of [0, 1]) {
        const x = i === 0 ? W * 0.18 : W * 0.82;
        ctx.engine.text(players[i].name, x, oy - 16, { size: 12, color: players[i].color, font: 'system-ui' });
        const texto = estado === 'revisando' ? `${notas[i]}/100` : (listo[i] ? 'listo' : 'dibujando…');
        ctx.engine.text(texto, x, oy - 2, { size: 11, color: listo[i] ? '#a8ff3e' : '#8f8fb0', font: 'system-ui' });
      }

      if (avisoT > 0) {
        ctx.engine.text(aviso, W / 2, oy + lado + 30, { size: 15, color: '#ffd166', font: 'system-ui' });
      }
      if (!ctx.mando.haySala) {
        ctx.engine.text('Este juego necesita dos mandos táctiles · Menú → Mandos',
          W / 2, H - 22, { size: 13, color: '#ffd166', font: 'system-ui' });
      }
    },
  };
}
