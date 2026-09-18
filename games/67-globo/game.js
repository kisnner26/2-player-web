/**
 * Globo al Aire — no dejen que toque el suelo. Cooperativo puro.
 *
 * Cada uno controla su lado del campo y "sopla" hacia arriba cuando el
 * globo pasa cerca. Rachas de viento lo empujan lateralmente cada pocos
 * segundos, así que no basta con quedarse quieto debajo: hay que
 * perseguirlo y turnarse los golpes de aire.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const GRAV = 210;
const SOPLO = 780;
const ALCANCE_SOPLO = 90;
const R = 22;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [{ i: 0, x: 0, y: 0, soplando: 0 }, { i: 1, x: 0, y: 0, soplando: 0 }];
  const globo = { x: 0, y: 0, vx: 0, vy: 0 };
  let toques = 0, mejorRacha = 0;
  let viento = 0, proximoViento = 3;
  let tiempo = 0;
  let terminado = false;
  let sb = null;

  function reiniciar() {
    jug[0].x = W * 0.3; jug[0].y = H * 0.82;
    jug[1].x = W * 0.7; jug[1].y = H * 0.82;
    globo.x = W / 2; globo.y = H * 0.35;
    globo.vx = 0; globo.vy = 0;
    toques = 0; tiempo = 0; viento = 0; proximoViento = 3;
    terminado = false;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '0 toques' });
      ui.banner('Suelten aire con su tecla cuando el globo pase cerca');
    },
    resize(nw, nh) { W = nw; H = nh; reiniciar(); },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo += dt;

      proximoViento -= dt;
      if (proximoViento <= 0) {
        viento = (rng() * 2 - 1) * 46;
        proximoViento = 3 + rng() * 3;
      }

      for (const p of jug) {
        const pl = input.player(p.i);
        const dx = pl.x, dy = pl.y;
        const len = Math.hypot(dx, dy) || 1;
        p.x = clamp(p.x + (dx / len) * 260 * dt, 20, W - 20);
        p.y = clamp(p.y + (dy / len) * 260 * dt, H * 0.5, H - 24);
        p.soplando = Math.max(0, p.soplando - dt * 3);

        if (pl.pressed('a')) {
          p.soplando = 1;
          audio.tone({ freq: 220, dur: 0.14, gain: 0.1, type: 'sine', sweep: -60 });
          const d = Math.hypot(globo.x - p.x, globo.y - p.y);
          if (d < ALCANCE_SOPLO) {
            const fuerza = (1 - d / ALCANCE_SOPLO) * SOPLO;
            const ang = Math.atan2(globo.y - p.y, globo.x - p.x);
            globo.vy -= fuerza;
            globo.vx += Math.cos(ang) * fuerza * 0.3;
            haptics.play('soft', { player: p.i });
            toques++;
            mejorRacha = Math.max(mejorRacha, toques);
            sb.update(toques, Math.round(tiempo));
            particles.burst(globo.x, globo.y, 6, { speed: 90, color: players[p.i].color, size: 3 });
          } else {
            haptics.play('tap', { player: p.i });
          }
        }
      }

      globo.vy += GRAV * dt;
      globo.vx += (viento - globo.vx) * dt * 0.4;
      globo.x += globo.vx * dt;
      globo.y += globo.vy * dt;
      globo.vx *= Math.pow(0.7, dt);

      if (globo.x < R) { globo.x = R; globo.vx *= -0.6; }
      if (globo.x > W - R) { globo.x = W - R; globo.vx *= -0.6; }
      if (globo.y < R + 40) { globo.y = R + 40; globo.vy *= -0.4; }

      if (globo.y > H - R) return terminar();

      sb.setCenter(`${Math.round(tiempo)}s`);
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a1626');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#1a3050'); grd.addColorStop(1, '#0c1a2c');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);

      // Suelo (línea de peligro)
      g.fillStyle = '#ff475722';
      g.fillRect(0, H - R, W, R);
      g.strokeStyle = '#ff4757aa'; g.lineWidth = 2; g.setLineDash([8, 8]);
      g.beginPath(); g.moveTo(0, H - R); g.lineTo(W, H - R); g.stroke();
      g.setLineDash([]);

      // Indicador de viento
      g.save();
      g.globalAlpha = 0.5; g.strokeStyle = '#8fd5ff'; g.lineWidth = 2;
      const wx = W / 2, wy = 30, len = clamp(viento * 1.4, -60, 60);
      g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + len, wy);
      g.lineTo(wx + len - Math.sign(len) * 6, wy - 5);
      g.moveTo(wx + len, wy); g.lineTo(wx + len - Math.sign(len) * 6, wy + 5);
      g.stroke();
      g.restore();

      particles.render(g);

      for (const p of jug) {
        const col = players[p.i].color;
        ctx.engine.glowCircle(p.x, p.y, 18, col, 12 + p.soplando * 16);
        if (p.soplando > 0.05) {
          g.save();
          g.globalAlpha = p.soplando * 0.5;
          g.strokeStyle = '#fff'; g.lineWidth = 2;
          g.beginPath(); g.arc(p.x, p.y, 30 + (1 - p.soplando) * 40, 0, TAU); g.stroke();
          g.restore();
        }
      }

      // Globo
      g.save();
      g.shadowColor = '#ff6ec7'; g.shadowBlur = 18;
      g.fillStyle = '#ff6ec7';
      g.beginPath(); g.ellipse(globo.x, globo.y, R, R * 1.15, 0, 0, TAU); g.fill();
      g.restore();
      g.strokeStyle = '#ffffff55'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(globo.x, globo.y + R); g.lineTo(globo.x, globo.y + R + 22); g.stroke();
      g.fillStyle = '#ffffff33';
      g.beginPath(); g.ellipse(globo.x - R * 0.3, globo.y - R * 0.4, R * 0.3, R * 0.5, -0.4, 0, TAU); g.fill();
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar() {
    terminado = true;
    audio.lose();
    haptics.defeat();
    ctx.shake(14);
    particles.burst(globo.x, H - 10, 26, { speed: 200, color: '#ff6ec7', size: 5, gravity: 200 });
    let veredicto;
    if (tiempo >= 60) veredicto = 'Aguantaron un minuto entero. Impresionante equipo.';
    else if (tiempo >= 30) veredicto = 'Buen aguante, se coordinan bien.';
    else veredicto = 'Se les escapó rápido… otra vez, y hablando más.';
    ctx.finish({
      winner: -1,
      scores: [Math.round(tiempo), toques],
      detail: `${tiempo.toFixed(1)} s en el aire · ${toques} soplidos · ${veredicto}`,
      record: ctx.record('tiempo', Math.round(tiempo * 10) / 10, 'high'),
    });
  }
}
