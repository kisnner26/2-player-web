/**
 * Cuenta Rápida — cuántos bichos había, y no vale volver a mirar.
 *
 * El enjambre aparece menos de un segundo y desaparece. Por debajo de cinco o
 * seis el número se ve de golpe, sin contar; por encima ya no, y el cerebro
 * pasa a estimar. Ese salto es exactamente donde vive el juego.
 *
 * Las opciones falsas están pegadas a la buena (±1, ±2) para que estimar "más
 * o menos" no baste. Y el que responde primero se lleva el punto, así que hay
 * que decidir si te fías de tu vistazo o esperas medio segundo más… que no
 * tienes.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 7;
const CASTIGO = 1.5;
const FORMAS = ['circulo', 'cuadro', 'triangulo'];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let bichos = [], cuantos = 0, opciones = [], correcta = 0;
  let fase = 'espera', reloj = 1.2, t = 0, ronda = 0, acertante = -1;
  const jug = [{ i: 0, puntos: 0, hielo: 0 }, { i: 1, puntos: 0, hielo: 0 }];
  let sb = null;
  const POS = ['up', 'right', 'down', 'left'];

  function nuevaRonda() {
    ronda++;
    cuantos = 4 + Math.floor(rng() * (5 + Math.min(9, ronda)));
    bichos = [];
    const forma = FORMAS[Math.floor(rng() * FORMAS.length)];
    const col = players[Math.floor(rng() * 2)].color;
    for (let i = 0; i < cuantos; i++) {
      bichos.push({
        x: W * (0.16 + rng() * 0.68),
        y: H * (0.2 + rng() * 0.42),
        r: 9 + rng() * 9,
        rot: rng() * TAU,
        forma, col,
      });
    }
    const set = new Set([cuantos]);
    for (const d of [1, -1, 2, -2, 3].sort(() => rng() - 0.5)) {
      if (set.size < 4 && cuantos + d > 0) set.add(cuantos + d);
    }
    while (set.size < 4) set.add(cuantos + 4 + Math.floor(rng() * 3));
    opciones = [...set].sort(() => rng() - 0.5);
    correcta = opciones.indexOf(cuantos);
    fase = 'mostrando';
    // El vistazo se acorta a medida que suben los puntos.
    reloj = clamp(0.95 - (jug[0].puntos + jug[1].puntos) * 0.035, 0.42, 0.95);
    acertante = -1;
    audio.blip();
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      fase = 'espera';
      reloj = 1.2;
      sb = ui.scoreboard({ center: `a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      t += dt;
      particles.update(dt);
      for (const p of jug) if (p.hielo > 0) p.hielo -= dt;

      if (fase === 'espera' || fase === 'resuelta') {
        reloj -= dt;
        if (reloj <= 0) {
          const g = jug.find((p) => p.puntos >= PARA_GANAR);
          if (g) { ctx.finish({ winner: g.i, scores: [jug[0].puntos, jug[1].puntos] }); return; }
          nuevaRonda();
        }
        return;
      }

      if (fase === 'mostrando') {
        reloj -= dt;
        if (reloj <= 0) { fase = 'preguntando'; reloj = 6; audio.tone({ freq: 400, dur: 0.08, gain: 0.13 }); }
        return;
      }

      // fase preguntando
      reloj -= dt;
      for (const p of jug) {
        if (p.hielo > 0) continue;
        const pl = input.player(p.i);
        for (let k = 0; k < 4; k++) {
          if (!pl.pressed(POS[k])) continue;
          if (k === correcta) {
            p.puntos++;
            acertante = p.i;
            fase = 'resuelta';
            reloj = 1.2;
            sb.update(jug[0].puntos, jug[1].puntos);
            audio.score(p.i);
            haptics.score(p.i);
            particles.burst(W / 2, H * 0.35, 22, { speed: 240, color: players[p.i].color, size: 4, drag: 0.9 });
          } else {
            p.hielo = CASTIGO;
            audio.error();
            haptics.error(p.i);
            ctx.shake(4);
          }
          break;
        }
      }
      if (reloj <= 0) { fase = 'resuelta'; reloj = 1.2; }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#06060e');

      if (fase === 'mostrando') {
        for (const b of bichos) {
          g.save();
          g.translate(b.x, b.y);
          g.rotate(b.rot);
          g.fillStyle = b.col;
          g.shadowColor = b.col;
          g.shadowBlur = 12;
          if (b.forma === 'circulo') { g.beginPath(); g.arc(0, 0, b.r, 0, TAU); g.fill(); }
          else if (b.forma === 'cuadro') g.fillRect(-b.r, -b.r, b.r * 2, b.r * 2);
          else {
            g.beginPath();
            g.moveTo(0, -b.r); g.lineTo(b.r, b.r); g.lineTo(-b.r, b.r);
            g.closePath(); g.fill();
          }
          g.restore();
        }
        ctx.engine.text('¡mira!', W / 2, H * 0.12, { size: 16, color: '#ffd166', font: 'system-ui' });
      } else if (fase === 'preguntando' || fase === 'resuelta') {
        ctx.engine.text(fase === 'resuelta' ? `eran ${cuantos}` : '¿cuántos había?', W / 2, H * 0.28,
          { size: fase === 'resuelta' ? 34 : 22, color: fase === 'resuelta' ? '#a8ff3e' : '#f2f2ff', glow: 10 });

        const r = Math.min(W * 0.17, H * 0.17);
        const cx = W / 2, cy = H * 0.62;
        const sitios = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        const glifos = ['↑', '→', '↓', '←'];
        for (let k = 0; k < 4; k++) {
          const x = cx + sitios[k][0] * r * 1.5;
          const y = cy + sitios[k][1] * r * 0.9;
          const buena = fase === 'resuelta' && k === correcta;
          g.fillStyle = buena ? '#1e3a20' : '#14142a';
          g.beginPath(); g.roundRect(x - r * 0.7, y - r * 0.38, r * 1.4, r * 0.76, 10); g.fill();
          g.strokeStyle = buena ? '#a8ff3e' : '#2c2c46';
          g.lineWidth = 2;
          g.beginPath(); g.roundRect(x - r * 0.7, y - r * 0.38, r * 1.4, r * 0.76, 10); g.stroke();
          ctx.engine.text(String(opciones[k]), x, y, { size: r * 0.4, color: buena ? '#a8ff3e' : '#dfe0ff' });
          ctx.engine.text(glifos[k], x - r * 0.56, y, { size: r * 0.22, color: '#57577a', font: 'system-ui' });
        }
      } else {
        ctx.engine.text('prepárate…', W / 2, H * 0.45, { size: 20, color: '#4a4a6a', font: 'system-ui' });
      }

      for (const p of jug) {
        const x = p.i === 0 ? 28 : W - 28;
        const al = p.i === 0 ? 'left' : 'right';
        ctx.engine.text(String(p.puntos), x, H * 0.14, { size: 34, color: players[p.i].color, align: al });
        if (p.hielo > 0) {
          g.save();
          g.globalAlpha = 0.5 + Math.sin(t * 22) * 0.3;
          ctx.engine.text('fallo', x, H * 0.2, { size: 12, color: '#ff4757', align: al, font: 'system-ui' });
          g.restore();
        }
      }
      if (acertante >= 0 && fase === 'resuelta') {
        ctx.engine.text(`punto para ${players[acertante].name}`, W / 2, H * 0.36,
          { size: 14, color: players[acertante].color, font: 'system-ui' });
      }

      particles.render(g);
      ctx.engine.text('Un vistazo y responde con las direcciones · fallar te bloquea',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
