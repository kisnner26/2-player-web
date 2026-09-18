/**
 * Rescate Submarino — uno pilota a ciegas y el otro es los ojos.
 *
 * La cueva está completamente oscura salvo por el foco, y el foco no lo lleva
 * quien conduce. El piloto ve una mancha de luz que se mueve sola desde su
 * punto de vista; el del foco ve el fondo pero no manda en el rumbo.
 *
 * El oxígeno es único para los dos y baja siempre, más rápido cuanto más se
 * acelera. Así que la prisa es literalmente lo que os mata, y frenar para
 * mirar bien cuesta aire. Todo el juego cabe en esa cuenta.
 */

import { clamp, TAU, damp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const OXIGENO = 100;
const BUZOS = 4;
const PROFUNDIDAD = 3400;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let sub = { x: 0.5, y: 0, vx: 0, vy: 0 };
  let foco = -Math.PI / 2, apertura = 0.5;
  let oxigeno = OXIGENO, rescatados = 0, t = 0, terminado = false, choque = 0;
  let paredes = [], buzos = [], camara = 0;
  let sb = null;

  function generar() {
    paredes = [];
    buzos = [];
    for (let y = 0; y < PROFUNDIDAD; y += 40) {
      const centro = 0.5 + Math.sin(y * 0.0022) * 0.24 + Math.sin(y * 0.0009) * 0.12;
      const ancho = 0.3 - Math.min(0.14, y / PROFUNDIDAD * 0.14) + Math.sin(y * 0.004) * 0.05;
      paredes.push({ y, izq: clamp(centro - ancho, 0.04, 0.9), der: clamp(centro + ancho, 0.1, 0.96) });
    }
    for (let i = 0; i < BUZOS; i++) {
      const y = 500 + (i / BUZOS) * (PROFUNDIDAD - 800) + rng() * 200;
      const p = paredeEn(y);
      buzos.push({ x: p.izq + (p.der - p.izq) * (0.2 + rng() * 0.6), y, salvado: false, fase: rng() * TAU });
    }
  }

  function paredeEn(y) {
    const i = clamp(Math.floor(y / 40), 0, paredes.length - 1);
    return paredes[i];
  }

  function acabar(exito, motivo) {
    if (terminado) return;
    terminado = true;
    if (exito) { audio.win(); haptics.victory(null); } else { audio.lose(); }
    ctx.finish({
      winner: -1,
      scores: [rescatados, Math.round(oxigeno)],
      detail: motivo,
      record: exito ? ctx.record('oxigeno', Math.round(oxigeno), 'high') : false,
    });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      generar();
      sub = { x: 0.5, y: 40, vx: 0, vy: 0 };
      sb = ui.scoreboard({ center: `${BUZOS} buzos ahí abajo` });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      choque = Math.max(0, choque - dt);
      particles.update(dt);

      /* --- Piloto --- */
      const p0 = input.player(0);
      const empuje = p0.held('a') ? 1 : 0;
      sub.vx += p0.ax * 150 * dt;
      sub.vy += (p0.ay * 120 + empuje * 190 + 26) * dt;
      sub.vx *= Math.pow(0.2, dt);
      sub.vy *= Math.pow(0.3, dt);
      sub.x = clamp(sub.x + (sub.vx / W) * dt, 0.02, 0.98);
      sub.y = Math.max(0, sub.y + sub.vy * dt);

      /* --- Foco --- */
      const p1 = input.player(1);
      foco += p1.ax * 2.4 * dt;
      apertura = clamp(apertura + (p1.held('a') ? -dt * 1.4 : dt * 0.8), 0.16, 0.8);

      // Oxígeno: baja siempre y más al acelerar. El foco estrecho también gasta.
      oxigeno -= (0.9 + empuje * 1.5 + Math.abs(sub.vy) * 0.004 + (0.8 - apertura) * 0.9) * dt;
      if (oxigeno <= 0) { acabar(false, `Sin oxígeno a ${Math.round(sub.y)} m con ${rescatados} buzos`); return; }

      const pared = paredeEn(sub.y);
      if (sub.x < pared.izq + 0.02 || sub.x > pared.der - 0.02) {
        sub.x = clamp(sub.x, pared.izq + 0.02, pared.der - 0.02);
        if (choque <= 0) {
          choque = 0.6;
          oxigeno -= 7;
          sub.vy *= 0.2;
          audio.hit();
          haptics.impact(0, 1.2);
          ctx.shake(10);
          particles.burst(sub.x * W, H * 0.42, 16, { speed: 200, color: '#9fd8ff', size: 4, drag: 0.9 });
        }
      }

      for (const b of buzos) {
        if (b.salvado || Math.abs(b.y - sub.y) > 30) continue;
        if (Math.abs(b.x - sub.x) < 0.05) {
          b.salvado = true;
          rescatados++;
          oxigeno = Math.min(OXIGENO, oxigeno + 14);
          audio.pickup();
          haptics.score(null);
          sb.update(rescatados, Math.round(oxigeno));
          particles.burst(b.x * W, H * 0.42, 20, { speed: 200, color: '#a8ff3e', size: 4, drag: 0.9 });
        }
      }

      camara = damp(camara, sub.y - H * 0.42, 6, dt);

      if (sub.y >= PROFUNDIDAD) {
        acabar(rescatados === BUZOS,
          rescatados === BUZOS
            ? `¡Todos fuera! con ${Math.round(oxigeno)} de oxígeno`
            : `Salís con ${rescatados} de ${BUZOS} buzos`);
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#02060c');
      const aPantalla = (y) => y - camara;

      // Roca visible solo dentro del cono de luz: se dibuja todo y luego se
      // recorta con el foco, que es más barato que iluminar por trozos.
      g.save();
      const sx = sub.x * W, sy = aPantalla(sub.y);
      g.beginPath();
      g.moveTo(sx, sy);
      g.arc(sx, sy, Math.max(W, H), foco - apertura, foco + apertura);
      g.closePath();
      g.clip();

      const luz = g.createRadialGradient(sx, sy, 0, sx, sy, H * 0.9);
      luz.addColorStop(0, '#2a4a60');
      luz.addColorStop(1, '#02060c');
      g.fillStyle = luz;
      g.fillRect(0, 0, W, H);

      g.fillStyle = '#1a2a1e';
      for (const p of paredes) {
        const y = aPantalla(p.y);
        if (y < -50 || y > H + 50) continue;
        g.fillRect(0, y, p.izq * W, 42);
        g.fillRect(p.der * W, y, W - p.der * W, 42);
      }
      for (const b of buzos) {
        if (b.salvado) continue;
        const y = aPantalla(b.y);
        if (y < -30 || y > H + 30) continue;
        ctx.engine.glowCircle(b.x * W, y + Math.sin(t * 2 + b.fase) * 4, 11, '#ffd166', 20);
        g.fillStyle = '#a8ff3e';
        g.fillRect(b.x * W - 3, y + 8, 6, 12);
      }
      g.restore();

      // Contorno tenue de la cueva fuera del foco: se intuye, no se ve.
      g.strokeStyle = '#0f2030';
      g.lineWidth = 2;
      g.beginPath();
      for (const p of paredes) {
        const y = aPantalla(p.y);
        if (y < -50 || y > H + 50) continue;
        g.lineTo(p.izq * W, y);
      }
      g.stroke();
      g.beginPath();
      for (const p of paredes) {
        const y = aPantalla(p.y);
        if (y < -50 || y > H + 50) continue;
        g.lineTo(p.der * W, y);
      }
      g.stroke();

      particles.render(g);

      // Sumergible
      g.save();
      g.translate(sx, sy);
      if (choque > 0) g.globalAlpha = 0.5 + Math.sin(t * 40) * 0.4;
      g.fillStyle = players[0].color;
      g.shadowColor = players[0].color;
      g.shadowBlur = 14;
      g.beginPath(); g.ellipse(0, 0, 20, 13, 0, 0, TAU); g.fill();
      g.restore();
      g.fillStyle = '#0a0a14';
      g.beginPath(); g.arc(sx, sy - 3, 5, 0, TAU); g.fill();
      // Boquilla del foco
      g.save();
      g.strokeStyle = players[1].color;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + Math.cos(foco) * 26, sy + Math.sin(foco) * 26);
      g.stroke();
      g.restore();

      // Indicadores
      g.fillStyle = '#00000099';
      g.fillRect(16, 20, 160, 12);
      g.fillStyle = oxigeno < 25 ? '#ff4757' : '#3effc8';
      g.fillRect(16, 20, 160 * clamp(oxigeno / OXIGENO, 0, 1), 12);
      ctx.engine.text(`O₂ ${Math.round(oxigeno)}`, 16, 46, { size: 12, color: '#8fbfd0', align: 'left', font: 'system-ui' });
      ctx.engine.text(`${Math.round(sub.y)} m de ${PROFUNDIDAD} · buzos ${rescatados}/${BUZOS}`,
        W - 16, 26, { size: 12, color: '#8fbfd0', align: 'right', font: 'system-ui' });

      ctx.engine.text(`${players[0].name} pilota (tu tecla acelera) · ${players[1].name} gira el foco y lo abre o cierra`,
        W / 2, H - 12, { size: 11, color: '#3a5a70', font: 'system-ui' });
    },
  };
}
