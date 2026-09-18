/**
 * Aleteo — carrera de aleteo entre tuberías. No se muere: se pierde tiempo.
 *
 * Chocar no elimina, te frena. Así una carrera de dos no termina en dos
 * segundos por un error tonto y siempre hay remontada posible.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const META = 60;              // tuberías hasta la meta
const GRAV = 1450;
const IMPULSO = 430;
const VEL_AVANCE = 190;
const SEP_TUBOS = 230;
const HUECO = 150;
const R = 15;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let carrilAlto = 0;
  const jug = [ave(0), ave(1)];
  let tubos = [];
  let sb = null;

  function ave(i) {
    return { i, x: 0, y: 0, vy: 0, avance: 0, pasados: 0, choque: 0, ala: 0, terminado: false };
  }

  function generar() {
    tubos = [];
    let x = 420;
    for (let k = 0; k < META + 6; k++) {
      const margen = 70;
      const cy = margen + HUECO / 2 + rng() * (carrilAlto - HUECO - margen * 2);
      tubos.push({ x, cy, k });
      // Los tubos se acercan según avanza la carrera: dificultad creciente.
      x += SEP_TUBOS - Math.min(70, k * 1.6);
    }
  }

  function medir() { carrilAlto = (H - 60) / 2; }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      medir();
      generar();
      for (let i = 0; i < 2; i++) {
        const p = jug[i];
        p.x = 90;
        p.y = carrilAlto / 2;
        p.vy = 0; p.avance = 0; p.pasados = 0; p.terminado = false;
      }
      sb = ui.scoreboard({ center: `0 / ${META}` });
    },
    resize(nw, nh) { W = nw; H = nh; medir(); },

    update(dt) {
      let algunoVivo = false;
      for (const p of jug) {
        if (p.terminado) continue;
        algunoVivo = true;
        const pl = input.player(p.i);

        if (pl.pressed('up') || pl.pressed('a')) {
          p.vy = -IMPULSO;
          p.ala = 1;
          audio.tone({ freq: 480, dur: 0.05, gain: 0.11, type: 'square', sweep: 200 });
          haptics.play('tap', { player: p.i });
        }
        p.ala = Math.max(0, p.ala - dt * 6);

        p.vy += GRAV * dt;
        p.y += p.vy * dt;

        // El choque solo penaliza velocidad durante un instante.
        const frenado = p.choque > 0 ? 0.32 : 1;
        if (p.choque > 0) p.choque -= dt;
        p.avance += VEL_AVANCE * frenado * dt;

        if (p.y < R) { p.y = R; p.vy = 0; chocar(p); }
        if (p.y > carrilAlto - R) { p.y = carrilAlto - R; p.vy = 0; chocar(p); }

        // Colisión con tubos en su propio carril
        for (const t of tubos) {
          const tx = t.x - p.avance;
          if (tx + 34 < p.x - R || tx > p.x + R) continue;
          if (Math.abs(p.y - t.cy) > HUECO / 2 - R) { chocar(p); break; }
        }

        const pasados = tubos.filter((t) => t.x - p.avance < p.x - 34).length;
        if (pasados > p.pasados) {
          p.pasados = pasados;
          audio.blip();
          haptics.play('tick', { player: p.i });
          if (p.pasados >= META) llegar(p);
        }
      }
      sb.update(jug[0].pasados, jug[1].pasados);
      sb.setCenter(`${Math.max(jug[0].pasados, jug[1].pasados)} / ${META}`);
      particles.update(dt);
      if (!algunoVivo) return;
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d1b2a');

      for (let i = 0; i < 2; i++) {
        const p = jug[i];
        const top = 20 + i * (carrilAlto + 20);
        g.save();
        g.translate(0, top);
        g.beginPath();
        g.rect(0, 0, W, carrilAlto);
        g.clip();

        // Cielo del carril
        const grd = g.createLinearGradient(0, 0, 0, carrilAlto);
        grd.addColorStop(0, i === 0 ? '#1a2c4a' : '#1a2a3f');
        grd.addColorStop(1, '#0e1826');
        g.fillStyle = grd;
        g.fillRect(0, 0, W, carrilAlto);

        // Tubos
        for (const t of tubos) {
          const tx = t.x - p.avance;
          if (tx < -60 || tx > W + 20) continue;
          g.fillStyle = '#2d7a4a';
          g.fillRect(tx, 0, 34, t.cy - HUECO / 2);
          g.fillRect(tx, t.cy + HUECO / 2, 34, carrilAlto);
          g.fillStyle = '#3d9a5a';
          g.fillRect(tx - 4, t.cy - HUECO / 2 - 16, 42, 16);
          g.fillRect(tx - 4, t.cy + HUECO / 2, 42, 16);
        }

        // Línea de meta
        const metaX = tubos[META - 1] ? tubos[META - 1].x - p.avance + 60 : Infinity;
        if (metaX < W + 40) {
          for (let y = 0; y < carrilAlto; y += 18) {
            g.fillStyle = (Math.floor(y / 18) % 2) ? '#fff' : '#111';
            g.fillRect(metaX, y, 14, 18);
          }
        }

        // Ave
        const col = players[i].color;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(clamp(p.vy / 900, -0.5, 1.1));
        if (p.choque > 0) g.globalAlpha = 0.5 + Math.sin(ctx.engine.time * 30) * 0.3;
        g.shadowColor = col; g.shadowBlur = 14;
        g.fillStyle = col;
        g.beginPath(); g.ellipse(0, 0, R, R * 0.8, 0, 0, TAU); g.fill();
        g.shadowBlur = 0;
        g.fillStyle = '#ffd166';
        g.beginPath(); g.moveTo(R * 0.8, 0); g.lineTo(R * 1.6, 3); g.lineTo(R * 0.8, 6); g.closePath(); g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(R * 0.3, -4, 4, 0, TAU); g.fill();
        g.fillStyle = '#111';
        g.beginPath(); g.arc(R * 0.4, -4, 2, 0, TAU); g.fill();
        // Ala
        g.fillStyle = '#ffffffcc';
        const av = -3 - p.ala * 9;
        g.beginPath(); g.ellipse(-3, av, R * 0.55, R * 0.3, 0, 0, TAU); g.fill();
        g.restore();

        g.restore();

        // Etiqueta del carril
        ctx.engine.text(players[i].name, 14, top + 16, {
          size: 11, color: col, align: 'left', font: 'system-ui',
        });
      }

      // Separador
      g.fillStyle = '#ffffff18';
      g.fillRect(0, 20 + carrilAlto + 8, W, 4);

      particles.render(g);
    },

    destroy() { sb?.remove(); },
  };

  function chocar(p) {
    if (p.choque > 0) return;
    p.choque = 0.55;
    audio.hit();
    haptics.impact(p.i, 0.9);
    ctx.shake(6);
    const top = 20 + p.i * (carrilAlto + 20);
    particles.burst(p.x, p.y + top, 12, { speed: 180, color: players[p.i].color, size: 4 });
  }

  function llegar(p) {
    p.terminado = true;
    const otro = jug[1 - p.i];
    audio.win();
    haptics.victory(p.i);
    ctx.finish({
      winner: p.i,
      scores: [jug[0].pasados, jug[1].pasados],
      detail: `Ventaja de ${META - otro.pasados} tuberías`,
    });
  }
}
