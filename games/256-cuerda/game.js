/**
 * Cuerda — vais atados.
 *
 * Una cuerda de largo fijo une a los dos. Mientras no se tensa no notáis nada;
 * en cuanto uno se pasa, tira del otro. No podéis separaros más de la cuenta y
 * cada uno tiene sus propias monedas, repartidas en esquinas opuestas.
 *
 * Es competitivo Y cooperativo a la vez, que es una combinación rara: quieres
 * las tuyas, pero si tiras demasiado arrastras al otro justo a las suyas. El
 * empate mutuo pierde: los dos marcadores cuentan y gana el que más tenga.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const LARGO = 230;
const DURACION = 75;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [0, 1].map((i) => ({ i, x: 0, y: 0, vx: 0, vy: 0, r: 16, puntos: 0 }));
  let monedas = [];
  let reloj = DURACION, sb = null, tension = 0;

  function sembrar() {
    monedas = [];
    for (let i = 0; i < 14; i++) {
      // Las de cada uno, en su mitad: hay que tirar del otro para llegar.
      const dueno = i % 2;
      monedas.push({
        dueno, r: 11, viva: true,
        x: dueno === 0 ? 50 + ctx.rng() * (W * 0.42) : W * 0.58 + ctx.rng() * (W * 0.42 - 50),
        y: 50 + ctx.rng() * (H - 100),
      });
    }
  }

  function colocar() {
    jug[0].x = W * 0.45; jug[0].y = H / 2;
    jug[1].x = W * 0.55; jug[1].y = H / 2;
    for (const j of jug) { j.vx = j.vy = 0; }
    sembrar();
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      colocar();
      sb = ctx.ui.scoreboard({ center: `${DURACION} s` });
      sb.update(0, 0);
    },

    resize(nw, nh) { W = nw; H = nh; colocar(); },

    update(dt) {
      reloj -= dt;
      sb?.setCenter(`${Math.max(0, Math.ceil(reloj))} s`);
      if (reloj <= 0 || monedas.every((m) => !m.viva)) {
        const gana = jug[0].puntos === jug[1].puntos ? -1 : (jug[0].puntos > jug[1].puntos ? 0 : 1);
        ctx.finish({ winner: gana, scores: [jug[0].puntos, jug[1].puntos], detail: 'Atados de principio a fin' });
        return;
      }

      for (const j of jug) {
        const p = input.player(j.i);
        const ax = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
        const ay = (p.held('down') ? 1 : 0) - (p.held('up') ? 1 : 0);
        j.vx += ax * 1400 * dt;
        j.vy += ay * 1400 * dt;
        j.vx *= Math.exp(-3.8 * dt);
        j.vy *= Math.exp(-3.8 * dt);
        j.x = clamp(j.x + j.vx * dt, j.r, W - j.r);
        j.y = clamp(j.y + j.vy * dt, j.r, H - j.r);
      }

      /* La cuerda: solo actúa cuando se pasa del largo, y reparte la
         corrección a medias. Un muelle siempre activo se sentiría como jugar
         dentro de un flan; así solo se nota cuando de verdad tiras. */
      const [a, b] = jug;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      tension = clamp((d - LARGO) / 60, 0, 1);
      if (d > LARGO) {
        const nx = dx / d, ny = dy / d;
        const exceso = d - LARGO;
        a.x += nx * exceso / 2; a.y += ny * exceso / 2;
        b.x -= nx * exceso / 2; b.y -= ny * exceso / 2;
        // Y transmite algo de velocidad: por eso puedes «lanzar» al otro.
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn > 0) {
          a.vx += nx * vn * 0.5; a.vy += ny * vn * 0.5;
          b.vx -= nx * vn * 0.5; b.vy -= ny * vn * 0.5;
        }
      }

      for (const j of jug) {
        for (const m of monedas) {
          if (!m.viva || m.dueno !== j.i) continue;
          if (Math.hypot(m.x - j.x, m.y - j.y) > j.r + m.r) continue;
          m.viva = false;
          j.puntos++;
          sb.update(jug[0].puntos, jug[1].puntos);
          audio.pickup();
          haptics.score(j.i);
          particles.burst(m.x, m.y, 12, { speed: 170, color: players[j.i].color, size: 3, drag: 0.9 });
        }
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#101018');

      for (const m of monedas) {
        if (!m.viva) continue;
        g.fillStyle = players[m.dueno].color;
        g.globalAlpha = 0.85;
        g.beginPath(); g.arc(m.x, m.y, m.r, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
      }
      particles.render(g);

      // La cuerda: se pone roja y recta cuando tira, curva cuando está floja.
      const [a, b] = jug;
      g.strokeStyle = tension > 0.5 ? '#ff4757' : `rgba(255,255,255,${0.25 + tension * 0.5})`;
      g.lineWidth = 3 + tension * 3;
      g.beginPath();
      g.moveTo(a.x, a.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + (1 - tension) * 40;
      g.quadraticCurveTo(mx, my, b.x, b.y);
      g.stroke();

      for (const j of jug) {
        g.fillStyle = players[j.i].color;
        g.beginPath(); g.arc(j.x, j.y, j.r, 0, Math.PI * 2); g.fill();
      }

      g.textAlign = 'center';
      g.fillStyle = '#ffffff55';
      g.font = '12px system-ui, sans-serif';
      g.fillText('Cada uno coge sus monedas. Estáis atados.', W / 2, H - 20);
    },

    destroy() { sb?.remove(); },
  };
}
