/**
 * Cálculo Relámpago — una cuenta, cuatro respuestas y dos dedos.
 *
 * Las opciones se eligen con las cuatro direcciones, así que no hay que buscar
 * ninguna tecla: la posición en pantalla ES la tecla. Eso deja el duelo limpio,
 * porque nadie pierde por torpeza de teclado.
 *
 * Las tres respuestas falsas no son al azar: son los errores que de verdad se
 * cometen —el signo cambiado, el acarreo olvidado, la tabla de al lado—, así
 * que ir rápido a lo que "suena bien" es exactamente cómo se pierde.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 7;
const CASTIGO = 1.6;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let enunciado = '', opciones = [], correcta = 0, nivel = 1;
  let fase = 'pregunta', espera = 0, t = 0, acertante = -1;
  const jug = [{ i: 0, puntos: 0, hielo: 0, fallos: 0 }, { i: 1, puntos: 0, hielo: 0, fallos: 0 }];
  let sb = null;
  const POS = ['up', 'right', 'down', 'left'];

  function nuevaPregunta() {
    const dificultad = Math.min(4, 1 + Math.floor(nivel / 3));
    let a, b, res, texto;
    const tipo = Math.floor(rng() * (dificultad >= 3 ? 4 : 3));

    if (tipo === 0) {
      a = 12 + Math.floor(rng() * (30 * dificultad));
      b = 7 + Math.floor(rng() * (25 * dificultad));
      res = a + b; texto = `${a} + ${b}`;
    } else if (tipo === 1) {
      a = 25 + Math.floor(rng() * (40 * dificultad));
      b = 6 + Math.floor(rng() * 24);
      res = a - b; texto = `${a} − ${b}`;
    } else if (tipo === 2) {
      a = 3 + Math.floor(rng() * (4 + dificultad * 3));
      b = 3 + Math.floor(rng() * (4 + dificultad * 3));
      res = a * b; texto = `${a} × ${b}`;
    } else {
      b = 3 + Math.floor(rng() * 9);
      res = 3 + Math.floor(rng() * 12);
      a = b * res; texto = `${a} ÷ ${b}`;
    }

    // Señuelos plausibles: los fallos típicos, no números cualesquiera.
    const señuelos = new Set();
    const candidatos = [res + 1, res - 1, res + 10, res - 10, res + b, res - b, Math.abs(res - 2), res + 2];
    for (const c of candidatos.sort(() => rng() - 0.5)) {
      if (c !== res && c >= 0 && señuelos.size < 3) señuelos.add(c);
    }
    while (señuelos.size < 3) señuelos.add(res + 3 + Math.floor(rng() * 20));

    const lista = [res, ...señuelos].sort(() => rng() - 0.5);
    enunciado = texto;
    opciones = lista;
    correcta = lista.indexOf(res);
    fase = 'pregunta';
    acertante = -1;
  }

  function responder(p, k) {
    if (fase !== 'pregunta' || p.hielo > 0) return;
    if (k === correcta) {
      p.puntos++;
      acertante = p.i;
      fase = 'resuelta';
      espera = 1.1;
      nivel++;
      sb.update(jug[0].puntos, jug[1].puntos);
      audio.score(p.i);
      haptics.score(p.i);
      particles.burst(W / 2, H * 0.32, 24, { speed: 260, color: players[p.i].color, size: 4, drag: 0.9 });
    } else {
      p.hielo = CASTIGO;
      p.fallos++;
      audio.error();
      haptics.error(p.i);
      ctx.shake(5);
    }
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaPregunta();
      sb = ui.scoreboard({ center: `a ${PARA_GANAR} aciertos` });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      t += dt;
      particles.update(dt);

      if (fase === 'resuelta') {
        espera -= dt;
        if (espera <= 0) {
          const g = jug.find((p) => p.puntos >= PARA_GANAR);
          if (g) {
            ctx.finish({
              winner: g.i, scores: [jug[0].puntos, jug[1].puntos],
              detail: `${jug[0].fallos} y ${jug[1].fallos} fallos`,
            });
            return;
          }
          nuevaPregunta();
        }
        return;
      }

      for (const p of jug) {
        if (p.hielo > 0) { p.hielo -= dt; continue; }
        const pl = input.player(p.i);
        POS.forEach((accion, k) => { if (pl.pressed(accion)) responder(p, k); });
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#07070f');

      ctx.engine.text(enunciado, W / 2, H * 0.24, { size: Math.min(58, W * 0.075), color: '#f2f2ff', glow: 12 });

      // Las cuatro opciones en cruz: arriba, derecha, abajo, izquierda.
      const r = Math.min(W * 0.2, H * 0.19);
      const cx = W / 2, cy = H * 0.6;
      const sitios = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const glifos = ['↑', '→', '↓', '←'];
      for (let k = 0; k < 4; k++) {
        const x = cx + sitios[k][0] * r * 1.55;
        const y = cy + sitios[k][1] * r * 0.95;
        const acertada = fase === 'resuelta' && k === correcta;
        g.save();
        if (acertada) { g.shadowColor = '#a8ff3e'; g.shadowBlur = 26; }
        g.fillStyle = acertada ? '#1e3a20' : '#151528';
        g.beginPath(); g.roundRect(x - r * 0.85, y - r * 0.42, r * 1.7, r * 0.84, 12); g.fill();
        g.restore();
        g.strokeStyle = acertada ? '#a8ff3e' : '#2e2e48';
        g.lineWidth = 2;
        g.beginPath(); g.roundRect(x - r * 0.85, y - r * 0.42, r * 1.7, r * 0.84, 12); g.stroke();
        ctx.engine.text(String(opciones[k]), x, y, { size: r * 0.42, color: acertada ? '#a8ff3e' : '#dfe0ff' });
        ctx.engine.text(glifos[k], x - r * 0.68, y, { size: r * 0.24, color: '#5a5a80', font: 'system-ui' });
      }

      for (const p of jug) {
        const col = players[p.i].color;
        const x = p.i === 0 ? 24 : W - 24;
        const al = p.i === 0 ? 'left' : 'right';
        ctx.engine.text(`${p.puntos}`, x, H * 0.42, { size: 30, color: col, align: al });
        if (p.hielo > 0) {
          g.save();
          g.globalAlpha = 0.5 + Math.sin(t * 22) * 0.3;
          ctx.engine.text(`bloqueado ${p.hielo.toFixed(1)}`, x, H * 0.49,
            { size: 12, color: '#ff4757', align: al, font: 'system-ui' });
          g.restore();
        }
      }

      if (fase === 'resuelta' && acertante >= 0) {
        ctx.engine.text(`¡${players[acertante].name}!`, W / 2, H * 0.4,
          { size: 20, color: players[acertante].color, glow: 14 });
      }

      particles.render(g);
      ctx.engine.text('Responde con las direcciones · fallar te bloquea 1,6 s y el otro sigue solo',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
