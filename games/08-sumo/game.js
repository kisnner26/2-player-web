/**
 * Sumo — empuja al otro fuera del círculo, que además se va encogiendo.
 *
 * La embestida cuesta energía y deja indefenso un instante, así que lanzarla
 * a lo loco se castiga solo. El borde no mata: se resbala, con lo que hay una
 * ventana para recuperarse si reaccionas rápido.
 */

import { TAU, clamp, elasticBounce } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe, pasoAnimado } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 5;
const R_LUCHADOR = 26;
const ACEL = 1500;
const VEL_MAX = 340;
const EMBESTIDA = 620;
const EMBESTIDA_COSTE = 1;
const ENERGIA_MAX = 3;
const ENCOGE = 0.985;         // factor por segundo

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let cx = 0, cy = 0, radio = 0, radioInicial = 0;
  const jug = [luchador(0), luchador(1)];
  let sb = null, finRonda = 0, ronda = 1, tiempo = 0;

  function luchador(i) {
    return { i, x: 0, y: 0, vx: 0, vy: 0, r: R_LUCHADOR, m: 1, vivo: true, score: 0,
             energia: ENERGIA_MAX, embistiendo: 0, aturdido: 0, cara: 0 };
  }

  function nuevaRonda() {
    cx = W / 2; cy = H / 2;
    radioInicial = Math.min(W, H) * 0.40;
    radio = radioInicial;
    tiempo = 0;
    for (let i = 0; i < 2; i++) {
      const p = jug[i];
      p.x = cx + (i === 0 ? -1 : 1) * radio * 0.45;
      p.y = cy;
      p.vx = p.vy = 0;
      p.vivo = true;
      p.energia = ENERGIA_MAX;
      p.embistiendo = 0;
      p.aturdido = 0;
      p.cara = i === 0 ? 0 : Math.PI;
    }
    finRonda = 0;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: `ronda ${ronda} · a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; nuevaRonda(); },

    update(dt) {
      if (finRonda > 0) {
        finRonda -= dt;
        for (const p of jug) if (!p.vivo) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; }
        particles.update(dt);
        if (finRonda <= 0) siguienteRonda();
        return;
      }

      tiempo += dt;
      // El círculo empieza a encogerse tras unos segundos de calentamiento.
      if (tiempo > 4) radio = Math.max(radioInicial * 0.35, radio * Math.pow(ENCOGE, dt * 60 / 60));

      for (const p of jug) {
        if (!p.vivo) continue;
        const pl = input.player(p.i);

        if (p.aturdido > 0) {
          p.aturdido -= dt;
        } else if (p.embistiendo > 0) {
          p.embistiendo -= dt;
          if (p.embistiendo <= 0) p.aturdido = 0.28;
        } else {
          const dx = pl.x, dy = pl.y;
          const len = Math.hypot(dx, dy) || 1;
          if (dx || dy) {
            p.vx += (dx / len) * ACEL * dt;
            p.vy += (dy / len) * ACEL * dt;
            p.cara = Math.atan2(dy, dx);
          }
          if (pl.pressed('a') && p.energia >= EMBESTIDA_COSTE) {
            p.energia -= EMBESTIDA_COSTE;
            p.embistiendo = 0.22;
            const a = (dx || dy) ? Math.atan2(dy, dx) : p.cara;
            p.vx = Math.cos(a) * EMBESTIDA;
            p.vy = Math.sin(a) * EMBESTIDA;
            audio.swoosh();
            haptics.play('impact', { player: p.i, scale: 0.9 });
            particles.burst(p.x, p.y, 12, {
              speed: 200, dir: a + Math.PI, spread: 1.2, color: players[p.i].color, size: 4, shape: 'spark',
            });
          }
        }

        p.energia = Math.min(ENERGIA_MAX, p.energia + dt * 0.8);

        const v = Math.hypot(p.vx, p.vy);
        const tope = p.embistiendo > 0 ? EMBESTIDA : VEL_MAX;
        if (v > tope) { p.vx *= tope / v; p.vy *= tope / v; }

        // Fricción: menor fuera del círculo (por eso se resbala en el borde).
        const dCentro = Math.hypot(p.x - cx, p.y - cy);
        const fuera = dCentro > radio;
        const fric = fuera ? 0.98 : 0.10;
        p.vx *= Math.pow(fric, dt);
        p.vy *= Math.pow(fric, dt);

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (dCentro > radio + p.r * 1.5) caer(p);
        else if (fuera && Math.random() < dt * 20) {
          particles.spawn({
            x: p.x, y: p.y + p.r, vx: (Math.random() - 0.5) * 60, vy: 40,
            life: 0.4, maxLife: 0.4, size: 3, color: '#ffffff66', gravity: 200,
          });
        }
      }

      // Choque entre luchadores
      if (jug[0].vivo && jug[1].vivo) {
        const antes = Math.hypot(jug[0].vx - jug[1].vx, jug[0].vy - jug[1].vy);
        // Quien embiste pesa más en el intercambio: por eso empuja de verdad.
        jug[0].m = jug[0].embistiendo > 0 ? 3 : 1;
        jug[1].m = jug[1].embistiendo > 0 ? 3 : 1;
        if (elasticBounce(jug[0], jug[1], 1.15) && antes > 90) {
          audio.hit();
          haptics.impact(null, clamp(antes / 500, 0.6, 1.5));
          ctx.shake(clamp(antes / 60, 3, 12));
          const mx = (jug[0].x + jug[1].x) / 2, my = (jug[0].y + jug[1].y) / 2;
          particles.burst(mx, my, 16, { speed: 260, color: '#ffffff', size: 4, shape: 'spark', drag: 0.9 });
        }
      }

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0b0714');

      // Fuera del ring
      g.fillStyle = '#150c1e';
      g.fillRect(0, 0, W, H);

      // Ring
      g.save();
      g.shadowColor = '#ffd166';
      g.shadowBlur = 30;
      g.fillStyle = '#2a2038';
      g.beginPath(); g.arc(cx, cy, radio, 0, TAU); g.fill();
      g.restore();

      g.strokeStyle = '#ffd166';
      g.lineWidth = 4;
      g.beginPath(); g.arc(cx, cy, radio, 0, TAU); g.stroke();
      g.strokeStyle = '#ffffff18';
      g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, radio * 0.6, 0, TAU); g.stroke();
      g.beginPath(); g.arc(cx, cy, radio * 0.25, 0, TAU); g.stroke();

      particles.render(g);

      for (const p of jug) {
        const col = players[p.i].color;
        g.save();
        if (!p.vivo) g.globalAlpha = 0.6;
        const escala = p.embistiendo > 0 ? 1.15 : 1;
        // Disco de fuerza debajo: es lo que empuja de verdad y hay que verlo
        // para juzgar los choques. El personaje va encima, montado en él.
        ctx.engine.glowCircle(p.x, p.y, p.r * escala, col, p.embistiendo > 0 ? 34 : 18);
        // La cara marca hacia dónde embiste.
        g.fillStyle = '#00000099';
        g.beginPath();
        g.arc(p.x + Math.cos(p.cara) * p.r * 0.4, p.y + Math.sin(p.cara) * p.r * 0.4, p.r * 0.28, 0, TAU);
        g.fill();
        const anim = pasoAnimado(p, { vx: p.vx, suelo: true, dt: 1 / 60 });
        dibujarPersonaje(g, personajeDe(players[p.i], p.i), p.x, p.y + p.r * 0.45, p.r * 2.1 * escala, {
          ...anim,
          acento: col,
          brillo: p.embistiendo > 0 ? 20 : 0,
        });
        if (p.aturdido > 0) {
          g.strokeStyle = '#ffffff';
          g.lineWidth = 2;
          for (let k = 0; k < 3; k++) {
            const a = ctx.engine.time * 8 + (k * TAU) / 3;
            g.beginPath();
            g.arc(p.x + Math.cos(a) * (p.r + 12), p.y + Math.sin(a) * (p.r + 12) - 6, 2.5, 0, TAU);
            g.stroke();
          }
        }
        g.restore();

        // Energía
        if (p.vivo) {
          // Por encima de la cabeza del personaje, no del disco: el muñeco
          // sobresale bastante más que el círculo de empuje.
          const bw = 46;
          const by = p.y - p.r * 1.75 - 10;
          g.fillStyle = '#00000077';
          g.fillRect(p.x - bw / 2, by, bw, 5);
          g.fillStyle = col;
          g.fillRect(p.x - bw / 2, by, bw * (p.energia / ENERGIA_MAX), 5);
        }
      }
    },

    destroy() { sb?.remove(); },
  };

  function caer(p) {
    if (!p.vivo || finRonda > 0) return;
    p.vivo = false;
    audio.lose();
    haptics.defeat(p.i);
    ctx.shake(10);
    particles.burst(p.x, p.y, 30, { speed: 220, color: players[p.i].color, size: 5, gravity: 400 });
    const otro = 1 - p.i;
    jug[otro].score++;
    sb.update(jug[0].score, jug[1].score);
    finRonda = 1.5;
  }

  function siguienteRonda() {
    const g = jug.find((p) => p.score >= PARA_GANAR);
    if (g) { ctx.finish({ winner: g.i, scores: [jug[0].score, jug[1].score] }); return; }
    ronda++;
    sb.setCenter(`ronda ${ronda} · a ${PARA_GANAR}`);
    nuevaRonda();
  }
}
