/**
 * Slalom 3D — bajar entre las puertas antes que la máquina.
 *
 * Mismo esqueleto que la Carrera de Obstáculos, con la regla dada la vuelta:
 * allí esquivabas cosas, aquí tienes que PASAR POR ellas. Saltarte una puerta
 * son dos segundos de penalización, así que ir a tumba abierta no compensa: el
 * juego es encontrar la línea, no apretar.
 *
 * Las puertas son las mismas para los dos y el bot tiene tu mismo tope de
 * velocidad, así que la carrera se decide en el trazado.
 */

import { crearMundo, mat, caja, cilindro, suelo, THREE } from '../../core/tres.js';
import { crearBot, selectorDificultad } from '../../core/bot.js';
import { clamp } from '../../core/math2d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const META = 560, ANCHO = 13, SEP = 20;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#cfe4f5', horizonte: '#eef5fb', sol: 3.2, solPos: [16, 40, 10],
    sombraArea: 34, fov: 55, niebla: 0.005,
  });
  suelo(mundo, { color: '#e8f0f7', veta: '#d3e2ee', lineas: 40, repite: 40 });

  const puertas = [];
  for (let z = 55, s = 1; z < META - 25; z += 26 + ctx.rng() * 14, s *= -1) {
    puertas.push({ z, x: s * (2.5 + ctx.rng() * 5.5), pasada: [false, false] });
  }

  const corredor = [0, 1].map((i) => {
    const g = new THREE.Group();
    const c = caja(1.7, 2.4, 1.7, mat(players[i].color, { rug: 0.5 }), [0, 1.2, 0]);
    c.castShadow = true;
    g.add(c);
    g.position.x = i === 0 ? -SEP / 2 : SEP / 2;
    mundo.escena.add(g);
    return { grupo: g, base: g.position.x, x: 0, z: 0, v: 0, fallos: 0 };
  });

  const matA = mat('#ff2e88', { rug: 0.6 });
  const matB = mat('#00a2ff', { rug: 0.6 });
  for (const c of corredor) {
    for (const [i, p] of puertas.entries()) {
      const m = i % 2 ? matB : matA;
      mundo.escena.add(cilindro(0.22, 0.22, 4, m, [c.base + p.x - 2.6, 2, p.z], 8));
      mundo.escena.add(cilindro(0.22, 0.22, 4, m, [c.base + p.x + 2.6, 2, p.z], 8));
    }
  }

  let bot = null, selector = null, jugando = false, acabado = false, sb = null, reloj = 0;
  const V = 40;

  function avanzar(c, dt, giro, tope) {
    c.v += (V * tope - c.v) * (1 - Math.exp(-2.4 * dt));
    const antes = c.z;
    c.z += c.v * dt;
    c.x = clamp(c.x + giro * 22 * dt, -ANCHO / 2, ANCHO / 2);
    c.grupo.position.set(c.base + c.x, 0, c.z);
    for (const p of puertas) {
      if (antes < p.z && c.z >= p.z) {
        if (Math.abs(c.x - p.x) > 2.6) { c.fallos++; audio.error(); ctx.shake(6); }
        else audio.tone({ freq: 1000, dur: 0.05, gain: 0.09, type: 'sine' });
      }
    }
  }

  return {
    init() {
      sb = ctx.ui.scoreboard({ center: 'Slalom' });
      sb.update(0, 0);
      selector = selectorDificultad(ctx.frame, (id) => {
        bot = crearBot({ dificultad: id, rng: ctx.rng });
        jugando = true;
      }, { color: players[0].color });
    },

    update(dt) {
      if (!jugando) { selector?.navegar(input.player(0)); mundo.dibujar(); return; }
      if (acabado) { mundo.dibujar(); return; }
      reloj += dt;

      const yo = input.player(0);
      avanzar(corredor[0], dt, (yo.held('right') ? 1 : 0) - (yo.held('left') ? 1 : 0), 1);

      const b = corredor[1];
      const prox = puertas.find((p) => p.z > b.z);
      const visto = bot.percibir(prox ? prox.x : 0, dt, { escalaError: 3 });
      avanzar(b, dt, bot.mover(b.x, visto, { zonaMuerta: 0.35 }), bot.dificultad.tope);

      sb.update(Math.floor(corredor[0].z / META * 100), Math.floor(b.z / META * 100));
      mundo.camara.position.set(corredor[0].base + corredor[0].x * 0.5, 10, corredor[0].z - 18);
      mundo.camara.lookAt(0, 2, corredor[0].z + 16);

      for (const [i, c] of corredor.entries()) {
        if (c.z >= META && !acabado) {
          acabado = true;
          // Los fallos se pagan al final: dos segundos por puerta saltada.
          const t = [0, 1].map((k) => reloj + corredor[k].fallos * 2);
          const gana = t[0] < t[1] ? 0 : 1;
          ctx.finish({
            winner: gana, scores: [corredor[0].fallos, corredor[1].fallos],
            detail: `${t[gana].toFixed(1)} s con ${corredor[gana].fallos} puertas falladas`,
          });
        }
      }
      mundo.dibujar();
    },

    destroy() { selector?.destruir(); sb?.remove(); mundo.destruir(); },
  };
}
