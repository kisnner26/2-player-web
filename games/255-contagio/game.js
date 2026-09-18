/**
 * Contagio — puntúas mientras NO lo tengas.
 *
 * Uno empieza infectado. Tocar al otro se lo pasa, y hay un segundo de gracia
 * para que no rebote al instante. El marcador sube solo para el que está sano,
 * así que no es «pillar»: es no dejar que te pillen.
 *
 * El giro: el infectado se mueve MÁS RÁPIDO. Ir perdiendo te da la herramienta
 * para dejar de perder, y por eso una partida nunca se decide en el minuto uno.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const DURACION = 70;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [0, 1].map((i) => ({ i, x: 0, y: 0, vx: 0, vy: 0, r: 19, puntos: 0 }));
  let infectado = 0;
  let gracia = 0;
  let reloj = DURACION;
  let sb = null, t = 0;
  let obstaculos = [];

  function colocar() {
    jug[0].x = W * 0.25; jug[0].y = H / 2;
    jug[1].x = W * 0.75; jug[1].y = H / 2;
    obstaculos = [];
    for (let i = 0; i < 5; i++) {
      obstaculos.push({
        x: W * (0.2 + ctx.rng() * 0.6), y: H * (0.2 + ctx.rng() * 0.6),
        r: 26 + ctx.rng() * 26,
      });
    }
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      colocar();
      infectado = ctx.rng() < 0.5 ? 0 : 1;
      gracia = 1.4;
      sb = ctx.ui.scoreboard({ center: `${DURACION} s` });
      sb.update(0, 0);
    },

    resize(nw, nh) { W = nw; H = nh; colocar(); },

    update(dt) {
      t += dt;
      reloj -= dt;
      sb?.setCenter(`${Math.max(0, Math.ceil(reloj))} s`);
      if (reloj <= 0) {
        const gana = jug[0].puntos === jug[1].puntos ? -1 : (jug[0].puntos > jug[1].puntos ? 0 : 1);
        ctx.finish({ winner: gana, scores: [jug[0].puntos, jug[1].puntos], detail: 'Segundos limpio' });
        return;
      }
      if (gracia > 0) gracia -= dt;

      // El sano puntúa. Es la única forma de marcar.
      const sano = jug[1 - infectado];
      sano.puntos += dt * 10;
      sb.update(Math.floor(jug[0].puntos), Math.floor(jug[1].puntos));

      for (const j of jug) {
        const p = input.player(j.i);
        // El infectado corre más: ir perdiendo te da con qué remontar.
        const vel = j.i === infectado ? 1750 : 1320;
        const ax = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
        const ay = (p.held('down') ? 1 : 0) - (p.held('up') ? 1 : 0);
        j.vx += ax * vel * dt;
        j.vy += ay * vel * dt;
        j.vx *= Math.exp(-3.6 * dt);
        j.vy *= Math.exp(-3.6 * dt);
        j.x = clamp(j.x + j.vx * dt, j.r, W - j.r);
        j.y = clamp(j.y + j.vy * dt, j.r, H - j.r);

        for (const o of obstaculos) {
          const dx = j.x - o.x, dy = j.y - o.y;
          const d = Math.hypot(dx, dy);
          if (d > o.r + j.r) continue;
          const nx = dx / (d || 1), ny = dy / (d || 1);
          j.x = o.x + nx * (o.r + j.r);
          j.y = o.y + ny * (o.r + j.r);
          const vn = j.vx * nx + j.vy * ny;
          j.vx -= 1.6 * vn * nx; j.vy -= 1.6 * vn * ny;
        }
      }

      const [a, b] = jug;
      if (gracia <= 0 && Math.hypot(b.x - a.x, b.y - a.y) < a.r + b.r) {
        infectado = 1 - infectado;
        gracia = 1.1;
        audio.hit();
        haptics.explosion(infectado);
        ctx.shake(9);
        particles.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 22, {
          speed: 250, color: '#a8ff3e', size: 4, drag: 0.9,
        });
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d1408');

      g.fillStyle = '#1b2a12';
      for (const o of obstaculos) {
        g.beginPath(); g.arc(o.x, o.y, o.r, 0, Math.PI * 2); g.fill();
      }
      particles.render(g);

      for (const j of jug) {
        const esInf = j.i === infectado;
        if (esInf) {
          // Halo pulsante: hay que ver de un vistazo quién la lleva.
          g.globalAlpha = 0.28 + Math.sin(t * 9) * 0.12;
          g.fillStyle = '#a8ff3e';
          g.beginPath(); g.arc(j.x, j.y, j.r + 16, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
        }
        g.fillStyle = players[j.i].color;
        g.beginPath(); g.arc(j.x, j.y, j.r, 0, Math.PI * 2); g.fill();
        if (esInf) {
          g.strokeStyle = '#a8ff3e'; g.lineWidth = 4;
          g.beginPath(); g.arc(j.x, j.y, j.r + 5, 0, Math.PI * 2); g.stroke();
        }
      }

      g.textAlign = 'center';
      g.fillStyle = '#a8ff3e';
      g.font = 'bold 19px system-ui, sans-serif';
      g.fillText(`${players[infectado].name} lo tiene · corre más`, W / 2, 42);
      g.fillStyle = '#ffffff55';
      g.font = '12px system-ui, sans-serif';
      g.fillText('Puntúas mientras NO lo tengas', W / 2, H - 20);
    },

    destroy() { sb?.remove(); },
  };
}
