/**
 * Tiro al plato 3D — más platos que la máquina en un minuto.
 *
 * Los platos salen disparados desde la base y describen una parábola de
 * verdad. Tú apuntas con una mira que se mueve con inercia —no se teletransporta,
 * frena— porque un punto que sigue al ratón exactamente convierte esto en un
 * ejercicio de reflejos y no de puntería.
 *
 * El bot dispara al punto donde el plato ESTARÁ, con el error y el retraso de
 * core/bot.js. En fácil apunta a donde estuvo hace un tercio de segundo, que
 * es exactamente lo que le pasa a un humano que empieza.
 */

import { crearMundo, mat, esfera, cilindro, suelo, sala, THREE } from '../../core/tres.js';
import { crearBot, selectorDificultad } from '../../core/bot.js';
import { clamp } from '../../core/math2d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const DURACION = 60;
const G = 16;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#12233d', horizonte: '#5c7ea6', sol: 3, solPos: [20, 40, 20],
    sombraArea: 40, fov: 50, niebla: 0.004,
  });
  suelo(mundo, { color: '#2e4a26', veta: '#24391d', lineas: 26, repite: 26 });
  mundo.camara.position.set(0, 6, 34);
  mundo.camara.lookAt(0, 14, -30);

  const platos = [];
  const matPlato = mat('#ff8c42', { rug: 0.5 });

  function lanzar() {
    const m = cilindro(1.3, 1.3, 0.32, matPlato, null, 18);
    m.castShadow = true;
    mundo.escena.add(m);
    const lado = ctx.rng() < 0.5 ? -1 : 1;
    platos.push({
      malla: m,
      x: lado * 26, y: 1.5, z: -12 - ctx.rng() * 14,
      vx: -lado * (13 + ctx.rng() * 8),
      vy: 21 + ctx.rng() * 6,
      vz: -(2 + ctx.rng() * 6),
      vivo: true, giro: ctx.rng() * 6,
    });
    audio.tone({ freq: 240, dur: 0.07, gain: 0.1, type: 'square', sweep: 180 });
  }

  /* Mira: se mueve con aceleración, no de un salto. */
  const mira = { x: 0, y: 16, vx: 0, vy: 0 };
  const cruz = new THREE.Group();
  const matCruz = mat(players[0].color, { rug: 0.3, emisivo: players[0].color, brillo: 2.4 });
  for (const [w, h] of [[3.4, 0.18], [0.18, 3.4]]) {
    cruz.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.18), matCruz));
  }
  mundo.escena.add(cruz);

  let bot = null, selector = null, jugando = false;
  let marcador = [0, 0];
  let reloj = DURACION;
  let sb = null, proximo = 0, acabado = false;
  let recarga = [0, 0];

  /** Convierte una posición del mundo al plano de la mira (z = −30). */
  function enPlano(p) { return { x: p.x, y: p.y }; }

  function disparar(quien, px, py) {
    if (recarga[quien] > 0) return;
    recarga[quien] = 0.42;
    audio.laser();
    haptics.impact(quien, 0.4);
    let tocado = null;
    for (const p of platos) {
      if (!p.vivo) continue;
      if (Math.hypot(p.x - px, p.y - py) < 2.6) { tocado = p; break; }
    }
    if (!tocado) return;
    tocado.vivo = false;
    mundo.escena.remove(tocado.malla);
    tocado.malla.geometry.dispose();
    marcador[quien]++;
    sb?.update(marcador[0], marcador[1]);
    audio.explosion();
    haptics.score(quien);
    ctx.shake(5);
  }

  return {
    init() {
      sb = ctx.ui.scoreboard({ center: 'Tiro al plato' });
      sb.update(0, 0);
      selector = selectorDificultad(ctx.frame, (id) => {
        bot = crearBot({ dificultad: id, rng: ctx.rng });
        jugando = true;
      }, { color: players[0].color });
    },

    update(dt) {
      if (!jugando) { selector?.navegar(input.player(0)); mundo.dibujar(); return; }
      if (acabado) { mundo.dibujar(); return; }

      reloj -= dt;
      sb?.setCenter(`${Math.ceil(reloj)} s`);
      if (reloj <= 0) {
        acabado = true;
        const gana = marcador[0] === marcador[1] ? -1 : (marcador[0] > marcador[1] ? 0 : 1);
        ctx.finish({ winner: gana, scores: marcador, detail: `${marcador[0]}-${marcador[1]} platos` });
        return;
      }

      proximo -= dt;
      if (proximo <= 0) { lanzar(); proximo = 0.9 + ctx.rng() * 0.7; }

      for (const r of [0, 1]) if (recarga[r] > 0) recarga[r] -= dt;

      // --- Platos ---
      for (const p of platos) {
        if (!p.vivo) continue;
        p.vy -= G * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.malla.position.set(p.x, p.y, p.z);
        p.malla.rotation.z += p.giro * dt;
        p.malla.rotation.x = Math.PI / 2.4;
        if (p.y < -2) {
          p.vivo = false;
          mundo.escena.remove(p.malla);
          p.malla.geometry.dispose();
        }
      }
      for (let i = platos.length - 1; i >= 0; i--) if (!platos[i].vivo) platos.splice(i, 1);

      // --- Mira humana, con inercia ---
      const yo = input.player(0);
      const ax = (yo.held('right') ? 1 : 0) - (yo.held('left') ? 1 : 0);
      const ay = (yo.held('up') ? 1 : 0) - (yo.held('down') ? 1 : 0);
      mira.vx = (mira.vx + ax * 190 * dt) * Math.exp(-4.2 * dt);
      mira.vy = (mira.vy + ay * 190 * dt) * Math.exp(-4.2 * dt);
      mira.x = clamp(mira.x + mira.vx * dt, -30, 30);
      mira.y = clamp(mira.y + mira.vy * dt, 1, 34);
      cruz.position.set(mira.x, mira.y, -30);
      if (yo.pressed('a')) disparar(0, mira.x, mira.y);

      // --- Bot: elige el plato más alto y le apunta con retraso y error ---
      const objetivo = platos.filter((p) => p.vivo && p.vy < 4).sort((a, b) => b.y - a.y)[0];
      if (objetivo) {
        const bx = bot.percibir(objetivo.x, dt, { escalaError: 9 });
        const by = bot.percibir(objetivo.y, dt, { escalaError: 6 });
        if (!bot.distraido && recarga[1] <= 0
            && Math.hypot(bx - objetivo.x, by - objetivo.y) < 3.2) {
          disparar(1, bx, by);
        }
      }
      mundo.dibujar();
    },

    destroy() { selector?.destruir(); sb?.remove(); mundo.destruir(); },
  };
}
