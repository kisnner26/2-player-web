/**
 * Nunca Dos Veces — pulsa lo que quieras menos lo que ya has pulsado.
 *
 * Tienes seis teclas y un plazo que se acorta. Cada vez hay que meter una
 * NUEVA; cuando has gastado las seis, la vuelta se reinicia y empiezas otra
 * vez con todas disponibles.
 *
 * Parece trivial hasta que el plazo baja de medio segundo: entonces la mano ya
 * no piensa, va sola, y va sola justo a la que acabas de usar. Se aguanta más
 * teniendo un orden fijo en la cabeza que intentando improvisar.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const VIDAS = 3;
const PLAZO_INICIAL = 1.5;
const PLAZO_MIN = 0.34;
const ACCIONES = ['left', 'up', 'right', 'down', 'a', 'b'];
const GLIFOS = { left: '←', up: '↑', right: '→', down: '↓', a: '●', b: '◆' };

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [crear(0), crear(1)];
  let sb = null, t = 0, terminado = false;

  function crear(i) {
    return { i, usadas: new Set(), vidas: VIDAS, plazo: PLAZO_INICIAL, limite: PLAZO_INICIAL,
             vueltas: 0, castigo: 0, ultima: '', acierto: 0, fallo: 0 };
  }

  function nuevoPlazo(p) {
    // El plazo se acorta con las vueltas completas, no con el tiempo: quien
    // juega bien es quien acelera el juego, y eso es lo justo.
    p.limite = Math.max(PLAZO_MIN, PLAZO_INICIAL - p.vueltas * 0.13);
    p.plazo = p.limite;
  }

  function penalizar(p, motivo) {
    if (p.castigo > 0) return;
    p.vidas--;
    p.castigo = 0.8;
    p.fallo = 0.5;
    p.usadas.clear();
    nuevoPlazo(p);
    audio.error();
    haptics.error(p.i);
    ctx.shake(6);
    particles.burst(centroX(p.i), H * 0.5, 18, { speed: 200, color: '#ff4757', size: 4, drag: 0.9 });
    ui.toast(`${players[p.i].name}: ${motivo}`, { ms: 800, color: '#ff4757' });
    sb.update(jug[0].vidas, jug[1].vidas);
    if (p.vidas <= 0) acabar(p.i);
  }

  function acabar(perdedor) {
    if (terminado) return;
    terminado = true;
    const g = 1 - perdedor;
    audio.win();
    haptics.victory(g);
    ctx.finish({
      winner: g,
      scores: [jug[0].vueltas, jug[1].vueltas],
      detail: `${jug[g].vueltas} vueltas completas`,
      record: ctx.record('vueltas', Math.max(jug[0].vueltas, jug[1].vueltas), 'high'),
    });
  }

  const centroX = (i) => W * (i === 0 ? 0.27 : 0.73);

  return {
    init() {
      W = ctx.W; H = ctx.H;
      sb = ui.scoreboard({ center: `${VIDAS} vidas` });
      sb.update(VIDAS, VIDAS);
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);

      for (const p of jug) {
        p.acierto = Math.max(0, p.acierto - dt);
        p.fallo = Math.max(0, p.fallo - dt);
        if (p.castigo > 0) { p.castigo -= dt; continue; }

        const pl = input.player(p.i);
        for (const a of ACCIONES) {
          if (!pl.pressed(a)) continue;
          if (p.usadas.has(a)) { penalizar(p, 'repetida'); break; }
          p.usadas.add(a);
          p.ultima = a;
          p.acierto = 0.3;
          audio.tone({ freq: 420 + p.usadas.size * 70, dur: 0.05, gain: 0.13, type: 'square' });
          haptics.tick(p.i);
          if (p.usadas.size >= ACCIONES.length) {
            p.usadas.clear();
            p.vueltas++;
            audio.pickup();
            haptics.score(p.i);
            particles.burst(centroX(p.i), H * 0.5, 16, { speed: 220, color: players[p.i].color, size: 4, drag: 0.9 });
          }
          nuevoPlazo(p);
          break;
        }

        p.plazo -= dt;
        if (p.plazo <= 0) penalizar(p, 'se te acabó el plazo');
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#07060f');

      for (const p of jug) {
        const cx = centroX(p.i);
        const col = players[p.i].color;

        // Las seis teclas en corro: las gastadas se apagan.
        const r = Math.min(W * 0.14, H * 0.2);
        ACCIONES.forEach((a, k) => {
          const ang = -Math.PI / 2 + (k / ACCIONES.length) * Math.PI * 2;
          const x = cx + Math.cos(ang) * r;
          const y = H * 0.5 + Math.sin(ang) * r;
          const gastada = p.usadas.has(a);
          const recien = p.ultima === a && p.acierto > 0;
          g.save();
          if (recien) { g.shadowColor = col; g.shadowBlur = 24; }
          g.fillStyle = gastada ? '#191828' : `${col}22`;
          g.beginPath(); g.arc(x, y, r * 0.31, 0, Math.PI * 2); g.fill();
          g.restore();
          g.strokeStyle = gastada ? '#2b2a40' : col;
          g.lineWidth = 2.5;
          g.beginPath(); g.arc(x, y, r * 0.31, 0, Math.PI * 2); g.stroke();
          ctx.engine.text(GLIFOS[a], x, y, {
            size: r * 0.3, color: gastada ? '#3d3c55' : '#f0f0ff', font: 'system-ui',
          });
        });

        // Plazo como anillo que se vacía.
        const prog = clamp(p.plazo / p.limite, 0, 1);
        g.save();
        g.strokeStyle = prog < 0.3 ? '#ff4757' : col;
        g.lineWidth = 6;
        g.shadowColor = prog < 0.3 ? '#ff4757' : col;
        g.shadowBlur = 12;
        g.beginPath();
        g.arc(cx, H * 0.5, r * 0.52, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
        g.stroke();
        g.restore();

        ctx.engine.text(String(p.vueltas), cx, H * 0.5, { size: r * 0.4, color: '#f2f2ff' });
        ctx.engine.text('vueltas', cx, H * 0.5 + r * 0.3, { size: 10, color: '#6a6a88', font: 'system-ui' });

        ctx.engine.text(players[p.i].name, cx, H * 0.17, { size: 15, color: col, font: 'system-ui' });
        ctx.engine.text('♥'.repeat(Math.max(0, p.vidas)) + '·'.repeat(VIDAS - Math.max(0, p.vidas)),
          cx, H * 0.23, { size: 18, color: p.vidas <= 1 ? '#ff4757' : col, font: 'system-ui' });
        ctx.engine.text(`plazo ${p.limite.toFixed(2)}s`, cx, H * 0.84,
          { size: 11, color: '#6a6a88', font: 'system-ui' });

        if (p.castigo > 0) {
          g.save();
          g.globalAlpha = clamp(p.castigo, 0, 1) * 0.35;
          g.fillStyle = '#ff4757';
          g.fillRect(p.i === 0 ? 0 : W / 2, 0, W / 2, H);
          g.restore();
        }
      }

      g.strokeStyle = '#ffffff10';
      g.beginPath(); g.moveTo(W / 2, H * 0.12); g.lineTo(W / 2, H * 0.9); g.stroke();

      particles.render(g);
      ctx.engine.text('Pulsa una tecla NUEVA antes de que se acabe el plazo · las seis completan vuelta y aceleran',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
