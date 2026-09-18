/**
 * Carrera de obstáculos 3D — llegar antes que la máquina.
 *
 * Dos carriles paralelos, el mismo trazado de obstáculos para los dos y una
 * cámara que persigue. Es una carrera justa a propósito: el bot corre por el
 * MISMO recorrido, con los mismos obstáculos y el mismo tope de velocidad, así
 * que si te gana es porque esquiva mejor, no porque le hayan dado un motor.
 *
 * Chocar no te elimina: te frena. Es lo que mantiene la carrera viva hasta el
 * final en vez de resolverla en el primer error.
 */

import { crearMundo, mat, caja, cilindro, suelo, THREE } from '../../core/tres.js';
import { crearBot, selectorDificultad } from '../../core/bot.js';
import { clamp } from '../../core/math2d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const META = 620;
const ANCHO_CARRIL = 9;
const SEPARACION = 16;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#0a1220', horizonte: '#1d2c46', sol: 2.6, solPos: [18, 34, 12],
    sombraArea: 34, fov: 55, niebla: 0.008,
  });
  suelo(mundo, { color: '#1b2436', veta: '#141b29', lineas: 40, repite: 40 });

  /* Un solo trazado para los dos: mismos obstáculos, mismas distancias. */
  const obstaculos = [];
  for (let z = 60; z < META - 30; z += 22 + ctx.rng() * 26) {
    obstaculos.push({ z, x: (ctx.rng() * 2 - 1) * (ANCHO_CARRIL * 0.62) });
  }

  const corredor = [0, 1].map((i) => {
    const g = new THREE.Group();
    const cuerpo = caja(1.9, 2.6, 1.9, mat(players[i].color, { rug: 0.5 }), [0, 1.3, 0]);
    cuerpo.castShadow = true;
    g.add(cuerpo);
    g.position.x = i === 0 ? -SEPARACION / 2 : SEPARACION / 2;
    mundo.escena.add(g);
    return { grupo: g, base: g.position.x, x: 0, z: 0, v: 0, freno: 0, meta: 0 };
  });

  // Los obstáculos se instancian por carril para que se vean los dos.
  const matObs = mat('#ff4757', { rug: 0.6, emisivo: '#ff4757', brillo: 0.4 });
  for (const c of corredor) {
    for (const o of obstaculos) {
      const m = caja(3.4, 2.2, 1.6, matObs, [c.base + o.x, 1.1, o.z]);
      m.castShadow = true;
      mundo.escena.add(m);
    }
  }
  for (const c of corredor) {
    mundo.escena.add(cilindro(0.4, 0.4, 8, mat('#a8ff3e', { emisivo: '#a8ff3e', brillo: 1.2 }),
      [c.base - ANCHO_CARRIL / 2, 4, META], 8));
    mundo.escena.add(cilindro(0.4, 0.4, 8, mat('#a8ff3e', { emisivo: '#a8ff3e', brillo: 1.2 }),
      [c.base + ANCHO_CARRIL / 2, 4, META], 8));
  }

  let bot = null, selector = null, jugando = false;
  let sb = null, acabado = false, reloj = 0;

  const V_MAX = 46;

  function avanzar(c, dt, giro, tope) {
    c.freno = Math.max(0, c.freno - dt);
    const objetivo = c.freno > 0 ? V_MAX * 0.34 : V_MAX * tope;
    c.v += (objetivo - c.v) * (1 - Math.exp(-2.6 * dt));
    c.z += c.v * dt;
    c.x = clamp(c.x + giro * 26 * dt, -ANCHO_CARRIL / 2, ANCHO_CARRIL / 2);
    c.grupo.position.set(c.base + c.x, 0, c.z);

    for (const o of obstaculos) {
      if (Math.abs(o.z - c.z) < 1.8 && Math.abs(o.x - c.x) < 2.4) {
        if (c.freno <= 0) {
          c.freno = 0.75;
          c.v *= 0.35;
          audio.hit();
          ctx.shake(8);
        }
      }
    }
  }

  return {
    init() {
      sb = ctx.ui.scoreboard({ center: 'A la meta' });
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
      const giro = (yo.held('right') ? 1 : 0) - (yo.held('left') ? 1 : 0);
      avanzar(corredor[0], dt, giro, 1);

      // --- Bot: busca el hueco libre más cercano entre los obstáculos que
      //     tiene delante. Con la reacción alta, los ve tarde y choca. ---
      const b = corredor[1];
      let objetivo = 0;
      const proximo = obstaculos.find((o) => o.z > b.z && o.z - b.z < 34);
      if (proximo) {
        // Esquivar hacia el lado con más sitio.
        const izq = proximo.x - (-ANCHO_CARRIL / 2);
        const der = (ANCHO_CARRIL / 2) - proximo.x;
        objetivo = izq > der ? proximo.x - 3.4 : proximo.x + 3.4;
        objetivo = clamp(objetivo, -ANCHO_CARRIL / 2, ANCHO_CARRIL / 2);
      }
      const visto = bot.percibir(objetivo, dt, { escalaError: 3.2 });
      const dirBot = bot.mover(b.x, visto, { zonaMuerta: 0.4 });
      avanzar(b, dt, dirBot, bot.dificultad.tope);

      sb.update(Math.floor(corredor[0].z / META * 100), Math.floor(b.z / META * 100));

      // Cámara persiguiendo al humano, con el rival siempre en cuadro.
      const zc = corredor[0].z;
      mundo.camara.position.set(corredor[0].base + corredor[0].x * 0.4, 11, zc - 20);
      mundo.camara.lookAt(0, 2, zc + 16);

      for (const [i, c] of corredor.entries()) {
        if (c.z >= META && !acabado) {
          acabado = true;
          audio.win();
          ctx.finish({
            winner: i, scores: [Math.floor(corredor[0].z), Math.floor(corredor[1].z)],
            detail: `${reloj.toFixed(1)} s`,
          });
        }
      }
      mundo.dibujar();
    },

    destroy() { selector?.destruir(); sb?.remove(); mundo.destruir(); },
  };
}
