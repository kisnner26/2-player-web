/**
 * Jetpack Sumo — dos mochilas propulsoras sobre un pozo de lava.
 *
 * El combustible es el reloj de la partida. Volar lo quema, y lo único que lo
 * recarga son dos plataformas — así que nadie puede quedarse arriba flotando y
 * esperar: hay que bajar, y bajar es cuando eres alcanzable.
 *
 * El empujón sale del golpe, no de un botón: chocas y transmites tu velocidad.
 * Lo que gana rondas es coger altura, dejarse caer con el propulsor a tope y
 * clavarle el pico al otro cuando ya no le queda depósito para recuperarse.
 */

import { TAU, clamp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 5;
const GRAVEDAD = 900;
const EMPUJE = 1750;
const LATERAL = 780;
const GASTO = 0.42;            // depósito por segundo con el propulsor abierto
const RECARGA = 0.9;
const VEL_MAX = 620;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let lava = 0, pico = 0;
  const plataformas = [];
  const jug = [crear(0), crear(1)];
  let sb = null, pausa = 0, ronda = 1, quemado = -1, olas = 0;

  function crear(i) {
    return { i, x: 0, y: 0, vx: 0, vy: 0, r: 20, score: 0, vivo: true,
             fuel: 1, motor: 0, golpe: 0, mira: i === 0 ? 1 : -1, apoyado: false };
  }

  function nuevaRonda() {
    lava = H * 0.86;
    pico = H * 0.08;
    plataformas.length = 0;
    const an = Math.min(W * 0.2, 190);
    plataformas.push({ x: W * 0.10, y: H * 0.70, an });
    plataformas.push({ x: W * 0.90 - an, y: H * 0.70, an });
    plataformas.push({ x: (W - an * 0.8) / 2, y: H * 0.42, an: an * 0.8 });
    for (const p of jug) {
      const pl = plataformas[p.i];
      p.x = pl.x + pl.an / 2;
      p.y = pl.y - 1;
      p.vx = p.vy = 0;
      p.fuel = 1;
      p.vivo = true;
      p.golpe = 0;
    }
    quemado = -1;
    pausa = 0;
  }

  function achicharrar(p) {
    if (!p.vivo || quemado >= 0) return;
    p.vivo = false;
    quemado = p.i;
    jug[1 - p.i].score++;
    sb.update(jug[0].score, jug[1].score);
    audio.explosion();
    haptics.explosion(p.i);
    ctx.shake(14);
    particles.burst(p.x, lava, 34, { speed: 340, dir: -Math.PI / 2, spread: 2,
      color: '#ff8c42', size: 6, gravity: 500, drag: 0.93 });
    pausa = 1.5;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: `ronda ${ronda} · a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; nuevaRonda(); },
    destroy() { sb?.remove(); },

    update(dt) {
      particles.update(dt);
      olas += dt;

      if (pausa > 0) {
        pausa -= dt;
        if (pausa <= 0) {
          const g = jug.find((p) => p.score >= PARA_GANAR);
          if (g) { ctx.finish({ winner: g.i, scores: [jug[0].score, jug[1].score] }); return; }
          ronda++;
          sb.setCenter(`ronda ${ronda} · a ${PARA_GANAR}`);
          nuevaRonda();
        }
        return;
      }

      for (const p of jug) {
        if (!p.vivo) continue;
        const pl = input.player(p.i);
        p.golpe = Math.max(0, p.golpe - dt);

        const quiere = pl.held('a') || pl.held('up');
        p.motor = quiere && p.fuel > 0 ? 1 : 0;
        if (p.motor) {
          p.vy -= EMPUJE * dt;
          p.fuel = Math.max(0, p.fuel - GASTO * dt);
          if (rng() < dt * 50) {
            particles.spawn({ x: p.x + (rng() - 0.5) * 12, y: p.y + p.r * 0.8,
              vx: (rng() - 0.5) * 90, vy: 260 + rng() * 200,
              life: 0.3, maxLife: 0.3, size: 5, color: rng() < 0.5 ? '#ffd166' : '#ff8c42', drag: 0.9 });
          }
          if (rng() < dt * 8) audio.tone({ freq: 90 + rng() * 40, dur: 0.05, gain: 0.05, type: 'sawtooth' });
        }

        const eje = pl.ax;
        if (eje) { p.vx += eje * LATERAL * dt; p.mira = eje > 0 ? 1 : -1; }

        p.vy += GRAVEDAD * dt;
        p.vx *= Math.pow(0.4, dt);
        p.vy *= Math.pow(0.85, dt);
        const v = Math.hypot(p.vx, p.vy);
        if (v > VEL_MAX) { p.vx *= VEL_MAX / v; p.vy *= VEL_MAX / v; }

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx) * 0.5; }
        if (p.x > W - p.r) { p.x = W - p.r; p.vx = -Math.abs(p.vx) * 0.5; }
        // El techo es de pinchos: subir a lo tonto también castiga.
        if (p.y < pico + p.r) {
          p.y = pico + p.r;
          p.vy = Math.abs(p.vy) * 0.4 + 180;
          p.golpe = 0.2;
          audio.hit();
          haptics.tap(p.i);
        }

        p.apoyado = false;
        for (const pf of plataformas) {
          if (p.x > pf.x - p.r && p.x < pf.x + pf.an + p.r && p.y >= pf.y - p.r && p.y < pf.y + 26 && p.vy >= 0) {
            p.y = pf.y - p.r;
            p.vy = 0;
            p.apoyado = true;
          }
        }
        if (p.apoyado) {
          const antes = p.fuel;
          p.fuel = Math.min(1, p.fuel + RECARGA * dt);
          if (antes < 1 && p.fuel >= 1) { audio.pickup(); haptics.score(p.i); }
        }

        if (p.y > lava - p.r) { achicharrar(p); break; }
      }

      const [a, b] = jug;
      if (a.vivo && b.vivo) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        if (d < a.r + b.r + 4) {
          const nx = dx / d, ny = dy / d;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            const j = -rel * 1.45;
            a.vx -= nx * j; a.vy -= ny * j;
            b.vx += nx * j; b.vy += ny * j;
            a.golpe = b.golpe = 0.28;
            // Un buen golpe también sacude el depósito del que lo recibe.
            const castigo = clamp(Math.abs(rel) / 1600, 0, 0.22);
            a.fuel = Math.max(0, a.fuel - castigo * (rel < 0 ? 0.5 : 1));
            b.fuel = Math.max(0, b.fuel - castigo * 0.5);
            audio.hit();
            haptics.impact(null, clamp(Math.abs(rel) / 400, 0.5, 1.6));
            ctx.shake(clamp(Math.abs(rel) / 55, 4, 14));
            particles.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 18,
              { speed: 300, color: '#ffffff', size: 4, shape: 'spark', drag: 0.9 });
          }
          const sep = (a.r + b.r + 4 - d) / 2;
          a.x -= nx * sep; a.y -= ny * sep;
          b.x += nx * sep; b.y += ny * sep;
        }
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d0510');

      // Lava: dos ondas desfasadas y un resplandor que sube por la pared.
      const brillo = g.createLinearGradient(0, lava - 130, 0, lava);
      brillo.addColorStop(0, '#00000000');
      brillo.addColorStop(1, '#ff8c4233');
      g.fillStyle = brillo;
      g.fillRect(0, lava - 130, W, 130);
      g.fillStyle = '#ff6b2c';
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 12) {
        const y = lava + Math.sin(x * 0.02 + olas * 2.2) * 5 + Math.sin(x * 0.045 - olas * 3.1) * 3;
        g.lineTo(x, y);
      }
      g.lineTo(W, H);
      g.fill();
      g.fillStyle = '#ffd16655';
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 12) g.lineTo(x, lava + 8 + Math.sin(x * 0.03 - olas * 2.6) * 4);
      g.lineTo(W, H);
      g.fill();

      // Techo de pinchos
      g.fillStyle = '#4a3560';
      g.beginPath();
      for (let x = 0; x < W; x += 24) { g.moveTo(x, pico); g.lineTo(x + 12, pico + 16); g.lineTo(x + 24, pico); }
      g.fill();
      g.fillRect(0, 0, W, pico);

      for (const pf of plataformas) {
        g.fillStyle = '#241a34';
        g.fillRect(pf.x, pf.y, pf.an, 14);
        ctx.engine.glowRect(pf.x, pf.y - 3, pf.an, 3, '#3effc8', 16);
        // Marcas de repostaje
        g.fillStyle = '#3effc855';
        for (let x = pf.x + 8; x < pf.x + pf.an - 6; x += 22) g.fillRect(x, pf.y + 4, 10, 3);
      }

      particles.render(g);

      for (const p of jug) {
        if (!p.vivo) continue;
        const col = players[p.i].color;
        dibujarPersonaje(g, personajeDe(players[p.i], p.i), p.x, p.y + p.r, 52, {
          pose: p.apoyado ? 'quieto' : 'salta', acento: col, mirando: p.mira,
          brillo: p.golpe > 0 ? 26 : (p.motor ? 14 : 0),
        });
        // Mochila
        g.fillStyle = p.motor ? '#ffd166' : '#6b6480';
        g.fillRect(p.x - p.mira * 16, p.y - 10, 8, 18);

        // Depósito flotando encima: sin esto no se puede planear nada.
        const bw = 42, by = p.y - 46;
        g.fillStyle = '#00000099';
        g.fillRect(p.x - bw / 2, by, bw, 6);
        g.fillStyle = p.fuel < 0.25 ? '#ff4757' : col;
        g.fillRect(p.x - bw / 2, by, bw * p.fuel, 6);
        if (p.fuel <= 0) {
          ctx.engine.text('SIN GAS', p.x, by - 10, { size: 9, color: '#ff4757', font: 'system-ui' });
        }
      }

      ctx.engine.text('Mantén tu tecla para volar · el depósito solo se llena en las plataformas',
        W / 2, pico + 26, { size: 11, color: '#7a6f96', font: 'system-ui' });
    },
  };
}
