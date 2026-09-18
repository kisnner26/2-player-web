/**
 * Teclas Robadas — cuando le das al otro, le quitas una tecla.
 *
 * La idea: en casi todos los juegos los controles son una constante. Aquí son
 * el RECURSO por el que se pelea. Cada golpe le roba al rival una de sus
 * cuatro direcciones durante ocho segundos, y esa tecla pasa a darte a ti un
 * empujón extra. Quien va ganando se mueve mejor y quien va perdiendo se
 * mueve peor, así que la ventaja se nota en los dedos y no en un número.
 *
 * Y tiene su propio freno: una tecla robada VUELVE sola, y mientras la tienes
 * robada el otro sabe exactamente cuál le falta porque se le pinta en rojo en
 * su esquina. Perder es incómodo, pero nunca deja de ser jugable.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const ROBO = 8;              // segundos que dura una tecla robada
const PARA_GANAR = 7;
const DIRS = ['up', 'down', 'left', 'right'];
const NOMBRE_DIR = { up: '↑', down: '↓', left: '←', right: '→' };

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [0, 1].map((i) => ({
    i, x: 0, y: 0, vx: 0, vy: 0, r: 20,
    robadas: {},              // dir → segundos que le quedan robada
    ganadas: {},              // dir → segundos que le quedan de empujón extra
    invul: 0, puntos: 0,
  }));
  let sb = null;
  let aviso = '', avisoT = 0;

  const decir = (t, s = 1.6) => { aviso = t; avisoT = s; };

  function colocar() {
    jug[0].x = W * 0.25; jug[0].y = H / 2;
    jug[1].x = W * 0.75; jug[1].y = H / 2;
    for (const j of jug) { j.vx = j.vy = 0; j.invul = 1.2; }
  }

  function golpe(atacante, victima) {
    // Se roba una dirección que aún le quede: robar la ya robada no haría nada.
    const libres = DIRS.filter((d) => !(victima.robadas[d] > 0));
    if (!libres.length) return;
    const dir = libres[Math.floor(ctx.rng() * libres.length)];
    victima.robadas[dir] = ROBO;
    atacante.ganadas[dir] = ROBO;
    atacante.puntos++;
    victima.invul = 1.4;
    sb.update(jug[0].puntos, jug[1].puntos);
    audio.hit();
    haptics.explosion(victima.i);
    ctx.shake(10);
    particles.burst(victima.x, victima.y, 20, {
      speed: 240, color: players[atacante.i].color, size: 4, drag: 0.9,
    });
    decir(`${players[atacante.i].name} le roba ${NOMBRE_DIR[dir]}`, 2);
    if (atacante.puntos >= PARA_GANAR) {
      ctx.finish({
        winner: atacante.i, scores: [jug[0].puntos, jug[1].puntos],
        detail: `${PARA_GANAR} teclas robadas`,
      });
    }
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      colocar();
      sb = ctx.ui.scoreboard({ center: `A ${PARA_GANAR} robos` });
      sb.update(0, 0);
      decir('Chocar con el rival le roba una tecla', 3);
    },

    resize(nw, nh) { W = nw; H = nh; colocar(); },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;

      for (const j of jug) {
        const p = input.player(j.i);
        if (j.invul > 0) j.invul -= dt;

        let ax = 0, ay = 0;
        for (const d of DIRS) {
          if (j.robadas[d] > 0) { j.robadas[d] -= dt; continue; }   // no responde
          if (!p.held(d)) continue;
          // Una dirección robada al otro empuja más: el premio se nota al mover.
          const fuerza = j.ganadas[d] > 0 ? 1.85 : 1;
          if (d === 'up') ay -= fuerza;
          if (d === 'down') ay += fuerza;
          if (d === 'left') ax -= fuerza;
          if (d === 'right') ax += fuerza;
        }
        for (const d of DIRS) if (j.ganadas[d] > 0) j.ganadas[d] -= dt;

        j.vx += ax * 1500 * dt;
        j.vy += ay * 1500 * dt;
        j.vx *= Math.exp(-3.4 * dt);
        j.vy *= Math.exp(-3.4 * dt);
        j.x = clamp(j.x + j.vx * dt, j.r, W - j.r);
        j.y = clamp(j.y + j.vy * dt, j.r, H - j.r);
      }

      // Choque: gana quien llega más rápido, que es lo que premia embestir.
      const [a, b] = jug;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < a.r + b.r && a.invul <= 0 && b.invul <= 0) {
        const va = Math.hypot(a.vx, a.vy), vb = Math.hypot(b.vx, b.vy);
        if (Math.abs(va - vb) > 40) golpe(va > vb ? a : b, va > vb ? b : a);
        const nx = (b.x - a.x) / (d || 1), ny = (b.y - a.y) / (d || 1);
        a.vx -= nx * 260; a.vy -= ny * 260;
        b.vx += nx * 260; b.vy += ny * 260;
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d0f18');
      ctx.engine.drawGrid?.(g, W, H, 48);
      particles.render(g);

      for (const j of jug) {
        g.save();
        g.globalAlpha = j.invul > 0 ? 0.55 : 1;
        g.fillStyle = players[j.i].color;
        g.beginPath(); g.arc(j.x, j.y, j.r, 0, Math.PI * 2); g.fill();
        g.restore();

        /* Las cuatro teclas de cada uno, en su esquina: rojas si se las han
           robado y con halo si son las que ha ganado. Sin esto no hay forma de
           saber qué te falta hasta que la pulsas y no pasa nada. */
        const bx = j.i === 0 ? 26 : W - 118;
        const by = H - 96;
        const pos = { up: [34, 0], down: [34, 34], left: [0, 34], right: [68, 34] };
        for (const dir of DIRS) {
          const [ox, oy] = pos[dir];
          const robada = j.robadas[dir] > 0;
          const ganada = j.ganadas[dir] > 0;
          g.fillStyle = robada ? '#ff4757' : (ganada ? players[j.i].color : '#ffffff26');
          g.fillRect(bx + ox, by + oy, 28, 28);
          g.fillStyle = robada ? '#ffffff' : '#ffffffcc';
          g.font = 'bold 15px system-ui, sans-serif';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(NOMBRE_DIR[dir], bx + ox + 14, by + oy + 15);
          if (robada) {
            g.fillStyle = '#ffffff';
            g.font = '9px system-ui';
            g.fillText(Math.ceil(j.robadas[dir]), bx + ox + 14, by + oy + 26);
          }
        }
      }

      if (avisoT > 0) {
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        g.font = 'bold 21px system-ui, sans-serif';
        g.fillText(aviso, W / 2, 54);
      }
    },

    destroy() { sb?.remove(); },
  };
}
