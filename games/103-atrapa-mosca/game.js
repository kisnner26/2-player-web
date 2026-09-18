/**
 * Atrapa la Mosca — reflejos puros sobre una rejilla.
 *
 * Una mosca salta de casilla en casilla. Cada uno mueve su matamoscas y
 * golpea; quien la pille se lleva el punto y la mosca reaparece más rápido.
 * Golpear en vacío te bloquea medio segundo, así que machacar el botón es
 * peor que esperar.
 *
 * Es el juego más fácil de explicar del catálogo: mueve, golpea, gana.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const COLS = 9, FILAS = 6;
const PARA_GANAR = 12;
const CASTIGO = 0.5;

export function create(ctx) {
  const { input, audio, haptics, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let celda = 70, offX = 0, offY = 0;
  let mosca = { x: 0, y: 0, t: 0, dur: 1.1, vivaDesde: 0 };
  let salto = 0;                 // animación de reposicionamiento
  const score = [0, 0];
  let estado = 'jugando';
  let pausa = 0;
  let aviso = '', avisoT = 0;
  let tiempo = 0;

  const cur = [
    { x: 2, y: 3, mov: 0, golpe: 0, bloqueo: 0 },
    { x: 6, y: 3, mov: 0, golpe: 0, bloqueo: 0 },
  ];

  function medir() {
    celda = Math.floor(Math.min((W - 80) / COLS, (H - 170) / FILAS));
    celda = clamp(celda, 34, 96);
    offX = Math.floor((W - COLS * celda) / 2);
    offY = Math.floor((H - FILAS * celda) / 2) + 20;
  }

  const decir = (t) => { aviso = t; avisoT = 1.6; };
  const cx = (c) => offX + c * celda + celda / 2;
  const cy = (f) => offY + f * celda + celda / 2;

  function reubicarMosca() {
    let nx, ny;
    do {
      nx = Math.floor(rng() * COLS);
      ny = Math.floor(rng() * FILAS);
    } while (nx === mosca.x && ny === mosca.y);
    mosca.x = nx; mosca.y = ny;
    mosca.t = 0;
    // Cada punto la hace más nerviosa
    const total = score[0] + score[1];
    mosca.dur = Math.max(0.42, 1.25 - total * 0.06);
    salto = 1;
    audio.tone({ freq: 700, dur: 0.03, gain: 0.05, type: 'sine' });
  }

  function golpear(j) {
    const c = cur[j];
    if (c.bloqueo > 0) return;
    c.golpe = 0.16;
    if (c.x === mosca.x && c.y === mosca.y) {
      score[j]++;
      audio.win();
      haptics.play('score', { player: j });
      ctx.shake(3, 4);
      particles.burst(cx(mosca.x), cy(mosca.y), 18, {
        speed: 190, dir: -Math.PI / 2, spread: TAU,
        color: players[j].color, size: 2.8, shape: 'spark', drag: 0.92,
      });
      decir(`${players[j].name} la pilló`);
      reubicarMosca();
      if (score[j] >= PARA_GANAR) { estado = 'fin'; pausa = 1.3; }
    } else {
      c.bloqueo = CASTIGO;
      audio.error();
      haptics.error(j);
      particles.burst(cx(c.x), cy(c.y), 6, {
        speed: 90, dir: -Math.PI / 2, spread: TAU, color: '#ffffff55', size: 1.8, drag: 0.91,
      });
    }
  }

  function mover(j, dt) {
    const p = input.player(j), c = cur[j];
    c.mov -= dt;
    if (c.golpe > 0) c.golpe -= dt;
    if (c.bloqueo > 0) { c.bloqueo -= dt; return; }

    const dx = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
    const dy = (p.held('down') ? 1 : 0) - (p.held('up') ? 1 : 0);
    if ((dx || dy) && c.mov <= 0) {
      c.x = clamp(c.x + dx, 0, COLS - 1);
      c.y = clamp(c.y + dy, 0, FILAS - 1);
      c.mov = 0.1;
      audio.tick();
    }
    if (!dx && !dy) c.mov = 0;
    if (p.pressed('a')) golpear(j);
  }

  return {
    init() { medir(); reubicarMosca(); },
    resize(w, h) { W = w; H = h; medir(); },

    update(dt) {
      tiempo += dt;
      if (avisoT > 0) avisoT -= dt;
      if (salto > 0) salto -= dt * 5;

      if (estado === 'fin') {
        pausa -= dt;
        particles.update(dt);
        if (pausa <= 0) {
          const g = score[0] > score[1] ? 0 : 1;
          ctx.finish({
            winner: g,
            scores: [score[0], score[1]],
            detail: `${score[g]} moscas a ${score[1 - g]}`,
            record: ctx.record('moscas', Math.max(score[0], score[1]), 'high'),
          });
        }
        return;
      }

      for (let j = 0; j < 2; j++) mover(j, dt);

      mosca.t += dt;
      if (mosca.t >= mosca.dur) reubicarMosca();
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0f1208');

      // Mantel a cuadros
      for (let y = 0; y < FILAS; y++) {
        for (let x = 0; x < COLS; x++) {
          g.fillStyle = (x + y) % 2 ? '#1d2410' : '#232c14';
          g.fillRect(offX + x * celda, offY + y * celda, celda, celda);
        }
      }
      g.strokeStyle = '#ffffff18'; g.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) { g.beginPath(); g.moveTo(offX + x * celda, offY); g.lineTo(offX + x * celda, offY + FILAS * celda); g.stroke(); }
      for (let y = 0; y <= FILAS; y++) { g.beginPath(); g.moveTo(offX, offY + y * celda); g.lineTo(offX + COLS * celda, offY + y * celda); g.stroke(); }
      g.strokeStyle = '#ffffff30'; g.lineWidth = 2;
      g.strokeRect(offX, offY, COLS * celda, FILAS * celda);

      // Barra de tiempo de la mosca en su casilla
      const restante = 1 - mosca.t / mosca.dur;
      const mx = cx(mosca.x), my = cy(mosca.y);
      g.fillStyle = '#00000066';
      g.fillRect(mx - celda * 0.32, my + celda * 0.3, celda * 0.64, 4);
      g.fillStyle = restante > 0.35 ? '#a8ff3e' : '#ff2e5b';
      g.fillRect(mx - celda * 0.32, my + celda * 0.3, celda * 0.64 * restante, 4);

      // Mosca
      const bob = Math.sin(tiempo * 14) * 2;
      const esc = 1 + Math.max(0, salto) * 0.5;
      g.save();
      g.translate(mx, my + bob);
      g.scale(esc, esc);
      g.fillStyle = '#1a1a1a';
      g.beginPath(); g.ellipse(0, 0, celda * 0.17, celda * 0.12, 0, 0, TAU); g.fill();
      g.fillStyle = '#ffffff88';
      const alaY = Math.sin(tiempo * 40) * celda * 0.05;
      g.beginPath(); g.ellipse(-celda * 0.1, -celda * 0.1 + alaY, celda * 0.11, celda * 0.05, -0.5, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(celda * 0.1, -celda * 0.1 - alaY, celda * 0.11, celda * 0.05, 0.5, 0, TAU); g.fill();
      g.fillStyle = '#ff2e5b';
      g.beginPath(); g.arc(-celda * 0.05, -celda * 0.03, celda * 0.03, 0, TAU); g.fill();
      g.beginPath(); g.arc(celda * 0.05, -celda * 0.03, celda * 0.03, 0, TAU); g.fill();
      g.restore();

      particles.render(g);

      // Matamoscas de cada jugador
      for (let j = 0; j < 2; j++) {
        const c = cur[j];
        const px = cx(c.x), py = cy(c.y);
        const col = players[j].color;
        const golpeando = c.golpe > 0;
        g.save();
        g.globalAlpha = c.bloqueo > 0 ? 0.35 : 1;
        g.translate(px, py);
        g.rotate(golpeando ? 0 : -0.35);
        const s = golpeando ? 1.16 : 1;
        g.shadowColor = col; g.shadowBlur = golpeando ? 20 : 9;
        g.strokeStyle = col; g.lineWidth = 3;
        g.strokeRect(-celda * 0.3 * s, -celda * 0.3 * s, celda * 0.6 * s, celda * 0.6 * s);
        g.globalAlpha *= 0.28;
        g.fillStyle = col;
        g.fillRect(-celda * 0.3 * s, -celda * 0.3 * s, celda * 0.6 * s, celda * 0.6 * s);
        g.restore();
        if (c.bloqueo > 0) {
          ctx.engine.text('¡fallo!', px, py - celda * 0.42, { size: 10, color: '#ff2e5b', font: 'system-ui' });
        }
      }

      // HUD
      for (let i = 0; i < 2; i++) {
        ctx.engine.text(`${players[i].name} · ${score[i]}/${PARA_GANAR}`, i === 0 ? 16 : W - 16, 28, {
          size: 14, color: players[i].color, align: i === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }
      if (avisoT > 0) ctx.engine.text(aviso, W / 2, 28, { size: 13, color: '#ffd166', font: 'system-ui' });
      ctx.engine.text('Mueve tu matamoscas y golpea con tu tecla de acción · fallar te bloquea medio segundo',
        W / 2, H - 12, { size: 10.5, color: '#ffffff55', font: 'system-ui' });
    },

    destroy() {},
  };
}
