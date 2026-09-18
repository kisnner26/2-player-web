/**
 * Rey de la Colina — no gana quien empuja más, gana quien AGUANTA arriba.
 *
 * El marcador solo corre mientras estás en la cima, así que atacar es
 * literalmente perder tiempo: cada segundo peleando abajo es un segundo que no
 * cuenta para nadie. La tentación de bajar a por él está ahí todo el rato y
 * casi siempre es mala idea.
 *
 * La cima se muda cada pocos segundos, con aviso. Eso rompe el
 * atrincheramiento y obliga a cruzar el mapa justo cuando estabas cómodo.
 */

import { clamp, TAU, elasticBounce } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe, pasoAnimado } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const META = 25;               // segundos arriba para ganar
const CAMBIO = 11;             // cada cuánto se muda la cima

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let cima = { x: 0, y: 0, r: 0 }, proxima = null, relojCima = CAMBIO;
  const jug = [crear(0), crear(1)];
  let sb = null, t = 0, terminado = false;

  function crear(i) {
    return { i, x: 0, y: 0, vx: 0, vy: 0, r: 22, m: 1, tiempo: 0, embiste: 0, aturdido: 0, mira: 1 };
  }

  function moverCima() {
    const r = Math.min(W, H) * 0.13;
    proxima = {
      x: r * 1.6 + rng() * Math.max(1, W - r * 3.2),
      y: r * 1.6 + rng() * Math.max(1, H - r * 3.6),
      r,
    };
    audio.tone({ freq: 420, dur: 0.2, gain: 0.14, type: 'triangle' });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      cima = { x: W / 2, y: H / 2, r: Math.min(W, H) * 0.13 };
      for (const p of jug) {
        p.x = W * (p.i === 0 ? 0.15 : 0.85);
        p.y = H * 0.5;
      }
      sb = ui.scoreboard({ center: `${META} s arriba` });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);

      relojCima -= dt;
      if (relojCima <= CAMBIO * 0.28 && !proxima) moverCima();
      if (relojCima <= 0) {
        cima = proxima || cima;
        proxima = null;
        relojCima = CAMBIO;
        particles.burst(cima.x, cima.y, 20, { speed: 200, color: '#ffd166', size: 4, drag: 0.9 });
      }

      for (const p of jug) {
        const pl = input.player(p.i);
        if (p.aturdido > 0) { p.aturdido -= dt; }
        else {
          const ex = pl.ax, ey = pl.ay;
          const l = Math.hypot(ex, ey) || 1;
          if (ex || ey) {
            p.vx += (ex / l) * 1300 * dt;
            p.vy += (ey / l) * 1300 * dt;
            p.mira = ex >= 0 ? 1 : -1;
          }
          if (pl.pressed('a') && p.embiste <= 0) {
            p.embiste = 0.22;
            const a = (ex || ey) ? Math.atan2(ey, ex) : (p.mira > 0 ? 0 : Math.PI);
            p.vx = Math.cos(a) * 640;
            p.vy = Math.sin(a) * 640;
            audio.swoosh();
            haptics.impact(p.i, 0.8);
          }
        }
        if (p.embiste > 0) { p.embiste -= dt; if (p.embiste <= 0) p.aturdido = 0.3; }

        p.vx *= Math.pow(0.12, dt);
        p.vy *= Math.pow(0.12, dt);
        p.x = clamp(p.x + p.vx * dt, p.r, W - p.r);
        p.y = clamp(p.y + p.vy * dt, p.r, H - p.r);
      }

      // Quien embiste pesa más en el choque: por eso empuja de verdad.
      jug[0].m = jug[0].embiste > 0 ? 3 : 1;
      jug[1].m = jug[1].embiste > 0 ? 3 : 1;
      const antes = Math.hypot(jug[0].vx - jug[1].vx, jug[0].vy - jug[1].vy);
      if (elasticBounce(jug[0], jug[1], 1.2) && antes > 120) {
        audio.hit();
        haptics.impact(null, clamp(antes / 400, 0.5, 1.4));
        ctx.shake(clamp(antes / 60, 3, 11));
        particles.burst((jug[0].x + jug[1].x) / 2, (jug[0].y + jug[1].y) / 2, 14,
          { speed: 240, color: '#ffffff', size: 4, shape: 'spark', drag: 0.9 });
      }

      // Solo suma quien esté arriba, y solo si está solo.
      const arriba = jug.filter((p) => Math.hypot(p.x - cima.x, p.y - cima.y) < cima.r);
      if (arriba.length === 1) {
        const p = arriba[0];
        p.tiempo += dt;
        if (rng() < dt * 10) {
          particles.spawn({
            x: cima.x + (rng() - 0.5) * cima.r * 1.6, y: cima.y + (rng() - 0.5) * cima.r * 1.6,
            vx: 0, vy: -50, life: 0.5, maxLife: 0.5, size: 3, color: players[p.i].color,
          });
        }
      }
      sb.update(Math.floor(jug[0].tiempo), Math.floor(jug[1].tiempo));

      for (const p of jug) {
        if (p.tiempo >= META) {
          terminado = true;
          audio.win();
          haptics.victory(p.i);
          ctx.finish({
            winner: p.i,
            scores: [Math.floor(jug[0].tiempo), Math.floor(jug[1].tiempo)],
            detail: `${META} s en la cima`,
          });
          return;
        }
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0b0a16');

      g.strokeStyle = '#ffffff08';
      for (let x = 0; x < W; x += 46) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y < H; y += 46) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

      if (proxima) {
        g.save();
        g.globalAlpha = 0.35 + Math.sin(t * 8) * 0.2;
        g.strokeStyle = '#ffd166';
        g.lineWidth = 3;
        g.setLineDash([8, 10]);
        g.beginPath(); g.arc(proxima.x, proxima.y, proxima.r, 0, TAU); g.stroke();
        g.restore();
        ctx.engine.text(`se muda en ${relojCima.toFixed(1)}`, proxima.x, proxima.y,
          { size: 12, color: '#ffd166', font: 'system-ui' });
      }

      const arriba = jug.filter((p) => Math.hypot(p.x - cima.x, p.y - cima.y) < cima.r);
      const dueño = arriba.length === 1 ? arriba[0].i : -1;
      const col = dueño >= 0 ? players[dueño].color : '#ffd166';
      g.save();
      g.shadowColor = col;
      g.shadowBlur = 30;
      g.fillStyle = `${col}22`;
      g.beginPath(); g.arc(cima.x, cima.y, cima.r, 0, TAU); g.fill();
      g.restore();
      g.strokeStyle = col;
      g.lineWidth = 4;
      g.beginPath(); g.arc(cima.x, cima.y, cima.r, 0, TAU); g.stroke();
      ctx.engine.text(arriba.length === 2 ? 'DISPUTADA' : dueño < 0 ? 'LIBRE' : players[dueño].name.toUpperCase(),
        cima.x, cima.y, { size: 14, color: col, font: 'system-ui' });

      particles.render(g);

      for (const p of jug) {
        const c = players[p.i].color;
        ctx.engine.glowCircle(p.x, p.y, p.r, c, p.embiste > 0 ? 30 : 14);
        const anim = pasoAnimado(p, { vx: p.vx, suelo: true, dt: 1 / 60 });
        dibujarPersonaje(g, personajeDe(players[p.i], p.i), p.x, p.y + p.r * 0.5, p.r * 2, {
          ...anim, acento: c, brillo: p.embiste > 0 ? 20 : 0,
        });
        if (p.aturdido > 0) {
          ctx.engine.text('•••', p.x, p.y - p.r - 14, { size: 13, color: '#ffffff88', font: 'system-ui' });
        }
      }

      for (const p of jug) {
        const x = p.i === 0 ? 16 : W - 156;
        g.fillStyle = '#00000088';
        g.fillRect(x, 20, 140, 10);
        g.fillStyle = players[p.i].color;
        g.fillRect(x, 20, 140 * clamp(p.tiempo / META, 0, 1), 10);
        ctx.engine.text(`${p.tiempo.toFixed(1)} / ${META}s`, p.i === 0 ? 16 : W - 16, 44, {
          size: 12, color: players[p.i].color, align: p.i === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }

      ctx.engine.text('El reloj solo corre si estás SOLO en la cima · tu tecla embiste · la cima se muda',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
