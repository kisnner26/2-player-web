/**
 * Lluvia de Meteoros — esquivar mientras la arena se encoge.
 *
 * La esquiva (tecla de acción) da medio segundo de invulnerabilidad con
 * enfriamiento: no es un botón de "no morir", es un recurso que hay que
 * guardar para el meteoro que no ves venir.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const R = 16;
const VEL = 320;
const ESQUIVA_DUR = 0.45;
const ESQUIVA_RECARGA = 2.2;
const ENCOGE_DESDE = 8;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let cx = 0, cy = 0, radio = 0, radioIni = 0;
  const jug = [nave(0), nave(1)];
  let meteoros = [];
  let tiempo = 0, spawn = 0, sb = null, terminado = false;

  function nave(i) {
    return { i, x: 0, y: 0, vivo: true, esquiva: 0, recarga: 0, sobrevivido: 0 };
  }

  function reiniciar() {
    cx = W / 2; cy = H / 2;
    radioIni = Math.min(W, H) * 0.42;
    radio = radioIni;
    for (let i = 0; i < 2; i++) {
      const p = jug[i];
      p.x = cx + (i === 0 ? -1 : 1) * radio * 0.4;
      p.y = cy;
      p.vivo = true;
      p.esquiva = 0; p.recarga = 0; p.sobrevivido = 0;
    }
    meteoros = [];
    tiempo = 0; spawn = 0;
  }

  return {
    init() { W = ctx.W; H = ctx.H; reiniciar(); sb = ui.scoreboard({ center: '0.0 s' }); },
    resize(nw, nh) { W = nw; H = nh; reiniciar(); },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo += dt;
      sb.setCenter(`${tiempo.toFixed(1)} s`);

      if (tiempo > ENCOGE_DESDE) {
        radio = Math.max(radioIni * 0.28, radio - dt * 11);
      }

      // Cadencia creciente de meteoros
      spawn -= dt;
      if (spawn <= 0) {
        lanzarMeteoro();
        spawn = clamp(0.85 - tiempo * 0.022, 0.16, 0.85);
      }

      for (const p of jug) {
        if (!p.vivo) continue;
        p.sobrevivido = tiempo;
        const pl = input.player(p.i);
        const dx = pl.x, dy = pl.y;
        const len = Math.hypot(dx, dy) || 1;
        const mult = p.esquiva > 0 ? 1.7 : 1;
        p.x += (dx / len) * VEL * mult * dt;
        p.y += (dy / len) * VEL * mult * dt;

        if (p.recarga > 0) p.recarga -= dt;
        if (p.esquiva > 0) p.esquiva -= dt;
        if (pl.pressed('a') && p.recarga <= 0) {
          p.esquiva = ESQUIVA_DUR;
          p.recarga = ESQUIVA_RECARGA;
          audio.swoosh();
          haptics.play('soft', { player: p.i });
        }

        // Fuera del círculo: muere.
        if (Math.hypot(p.x - cx, p.y - cy) > radio - R * 0.5) {
          const a = Math.atan2(p.y - cy, p.x - cx);
          const d = radio - R * 0.5;
          p.x = cx + Math.cos(a) * d;
          p.y = cy + Math.sin(a) * d;
        }
      }

      for (let i = meteoros.length - 1; i >= 0; i--) {
        const m = meteoros[i];
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.rot += m.vr * dt;
        if (m.x < -120 || m.x > W + 120 || m.y < -120 || m.y > H + 120) { meteoros.splice(i, 1); continue; }

        for (const p of jug) {
          if (!p.vivo || p.esquiva > 0) continue;
          if (Math.hypot(p.x - m.x, p.y - m.y) < R + m.r) impacto(p, m);
        }
      }

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#03030c');

      g.save();
      g.shadowColor = '#00e5ff';
      g.shadowBlur = 26;
      g.fillStyle = '#0a1424';
      g.beginPath(); g.arc(cx, cy, radio, 0, TAU); g.fill();
      g.restore();
      g.strokeStyle = tiempo > ENCOGE_DESDE ? '#ff4757' : '#00e5ff';
      g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cy, radio, 0, TAU); g.stroke();

      particles.render(g);

      for (const m of meteoros) {
        g.save();
        g.translate(m.x, m.y);
        g.rotate(m.rot);
        g.shadowColor = '#ff7847'; g.shadowBlur = 16;
        g.fillStyle = '#6b4030';
        g.beginPath();
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * TAU;
          const rr = m.r * (0.78 + ((k * 37) % 10) / 40);
          k === 0 ? g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
        g.fillStyle = '#8a5a3a';
        g.beginPath(); g.arc(-m.r * 0.2, -m.r * 0.2, m.r * 0.3, 0, TAU); g.fill();
        g.restore();
      }

      for (const p of jug) {
        if (!p.vivo) continue;
        const col = players[p.i].color;
        g.save();
        if (p.esquiva > 0) {
          g.globalAlpha = 0.5;
          g.strokeStyle = '#fff';
          g.lineWidth = 2;
          g.beginPath(); g.arc(p.x, p.y, R + 8, 0, TAU); g.stroke();
        }
        ctx.engine.glowCircle(p.x, p.y, R, col, 20);
        g.restore();

        // Recarga de esquiva
        const bw = 34;
        g.fillStyle = '#ffffff22';
        g.fillRect(p.x - bw / 2, p.y + R + 6, bw, 4);
        g.fillStyle = p.recarga <= 0 ? '#a8ff3e' : col;
        g.fillRect(p.x - bw / 2, p.y + R + 6, bw * (1 - clamp(p.recarga / ESQUIVA_RECARGA, 0, 1)), 4);
      }
    },

    destroy() { sb?.remove(); },
  };

  function lanzarMeteoro() {
    const a = rng() * TAU;
    const dist = radio + 90;
    const x = cx + Math.cos(a) * dist;
    const y = cy + Math.sin(a) * dist;
    // Apunta al centro con desviación: pasan cerca de los dos, no persiguen.
    const objetivoA = a + Math.PI + (rng() - 0.5) * 0.7;
    const vel = 160 + rng() * 140 + tiempo * 5;
    const r = 10 + rng() * 16;
    meteoros.push({
      x, y, r,
      vx: Math.cos(objetivoA) * vel,
      vy: Math.sin(objetivoA) * vel,
      rot: rng() * TAU, vr: (rng() - 0.5) * 4,
    });
  }

  function impacto(p, m) {
    p.vivo = false;
    audio.explosion();
    haptics.explosion(p.i);
    ctx.shake(20);
    particles.burst(p.x, p.y, 44, { speed: 300, color: players[p.i].color, size: 5, drag: 0.92 });

    const otro = jug[1 - p.i];
    if (!otro.vivo) {
      // Los dos en el mismo instante: empate.
      terminado = true;
      ctx.finish({ winner: -1, detail: `Aguantaron ${tiempo.toFixed(1)} s` });
      return;
    }
    terminado = true;
    const nuevoRecord = ctx.record('supervivencia', Math.round(tiempo * 10) / 10, 'high');
    ctx.finish({
      winner: otro.i,
      detail: `Aguantaron ${tiempo.toFixed(1)} s`,
      record: nuevoRecord,
    });
  }
}
