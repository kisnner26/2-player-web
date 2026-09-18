/**
 * Sumo 3D — tirar al bot de la plataforma antes de que te tire a ti.
 *
 * Disco circular sobre el vacío, dos bolas pesadas y física de empuje. La
 * gracia está en el impulso: acelerar es fácil, frenar no. El que se lanza a
 * por el rival gana el choque pero se queda vendido si falla, porque sale
 * disparado hacia el borde con su propia inercia.
 *
 * El disco encoge cada pocos segundos. Sin eso, dos jugadores prudentes se
 * pasan la vida dando vueltas sin tocarse.
 */

import { crearMundo, mat, esfera, cilindro, sala, THREE } from '../../core/tres.js';
import { crearBot, selectorDificultad } from '../../core/bot.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const RADIO0 = 15;
const RADIO_MIN = 6.5;
const R_BOLA = 1.5;
const RONDAS = 5;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#070a12', horizonte: '#161d2e', sol: 2.4, solPos: [10, 30, 14],
    sombraArea: 22, fov: 42, niebla: 0.012,
  });
  sala(mundo, { color: '#0c1018', tam: 120, alto: 40 });
  mundo.camara.position.set(0, 26, 26);
  mundo.camara.lookAt(0, 0, 0);

  let radio = RADIO0;
  const disco = cilindro(RADIO0, RADIO0, 1.2, mat('#2a3346', { rug: 0.9 }), [0, -0.6, 0], 48);
  disco.receiveShadow = true;
  mundo.escena.add(disco);
  const borde = new THREE.Mesh(
    new THREE.TorusGeometry(RADIO0, 0.28, 8, 64),
    mat('#5b8cff', { rug: 0.3, emisivo: '#5b8cff', brillo: 1.6 }),
  );
  borde.rotation.x = Math.PI / 2;
  mundo.escena.add(borde);

  const bolas = [0, 1].map((i) => {
    const m = esfera(R_BOLA, mat(players[i].color, { rug: 0.35, met: 0.2 }), [0, R_BOLA, 0], 24);
    m.castShadow = true;
    mundo.escena.add(m);
    return { malla: m, x: 0, z: 0, vx: 0, vz: 0, vivo: true };
  });

  let bot = null, selector = null, jugando = false;
  let marcador = [0, 0];
  let ronda = 1;
  let pausa = 0;
  let sb = null;

  function colocar() {
    radio = RADIO0;
    bolas.forEach((b, i) => {
      b.x = i === 0 ? -RADIO0 * 0.45 : RADIO0 * 0.45;
      b.z = 0; b.vx = 0; b.vz = 0; b.vivo = true;
      b.malla.visible = true;
      b.malla.position.set(b.x, R_BOLA, b.z);
    });
    bot?.reiniciar();
    pausa = 1;
  }

  function caer(i) {
    if (!bolas[i].vivo) return;
    bolas[i].vivo = false;
    bolas[i].malla.visible = false;
    const gana = 1 - i;
    marcador[gana]++;
    sb?.update(marcador[0], marcador[1]);
    audio.score(gana);
    haptics.explosion(i);
    if (marcador[gana] > RONDAS / 2) {
      setTimeout(() => ctx.finish({
        winner: gana, scores: marcador, detail: `${marcador[0]}-${marcador[1]} en ${ronda} rondas`,
      }), 900);
      pausa = 99;
      return;
    }
    ronda++;
    sb?.setCenter(`Ronda ${ronda}`);
    setTimeout(colocar, 700);
    pausa = 99;
  }

  return {
    init() {
      sb = ctx.ui.scoreboard({ center: 'Ronda 1' });
      sb.update(0, 0);
      colocar();
      selector = selectorDificultad(ctx.frame, (id) => {
        bot = crearBot({ dificultad: id, rng: ctx.rng });
        jugando = true;
        colocar();
      }, { color: players[0].color });
    },

    update(dt) {
      if (!jugando) { selector?.navegar(input.player(0)); mundo.dibujar(); return; }
      if (pausa > 0) { pausa -= dt; mundo.dibujar(); return; }

      // El disco encoge: obliga a buscarse.
      radio = Math.max(RADIO_MIN, radio - dt * 0.42);
      const escala = radio / RADIO0;
      disco.scale.set(escala, 1, escala);
      borde.scale.set(escala, escala, 1);

      const yo = input.player(0);
      const EMPUJE = 30;

      // --- Humano ---
      if (bolas[0].vivo) {
        const ax = (yo.held('right') ? 1 : 0) - (yo.held('left') ? 1 : 0);
        const az = (yo.held('down') ? 1 : 0) - (yo.held('up') ? 1 : 0);
        bolas[0].vx += ax * EMPUJE * dt;
        bolas[0].vz += az * EMPUJE * dt;
      }

      // --- Bot: va a por ti, pero mide. Si estás más cerca del borde que él,
      //     carga; si no, orbita esperando que te pases de frenada. ---
      if (bolas[1].vivo && bolas[0].vivo) {
        const b = bolas[1], h = bolas[0];
        const miDist = Math.hypot(b.x, b.z);
        const tuDist = Math.hypot(h.x, h.z);
        let objX, objZ;
        if (tuDist > miDist || tuDist > radio * 0.62) {
          objX = h.x; objZ = h.z;                       // a por él
        } else {
          const a = Math.atan2(b.z, b.x) + 1.1;         // orbitar
          objX = Math.cos(a) * radio * 0.5;
          objZ = Math.sin(a) * radio * 0.5;
        }
        const px = bot.percibir(objX, dt, { escalaError: radio * 0.4 });
        const pz = bot.percibir(objZ, dt, { escalaError: radio * 0.4 });
        if (!bot.distraido) {
          const dx = px - b.x, dz = pz - b.z;
          const n = Math.hypot(dx, dz) || 1;
          b.vx += (dx / n) * EMPUJE * bot.dificultad.tope * dt;
          b.vz += (dz / n) * EMPUJE * bot.dificultad.tope * dt;
        }
      }

      // --- Física ---
      for (const b of bolas) {
        if (!b.vivo) continue;
        b.vx *= Math.exp(-1.1 * dt);        // rozamiento: frenar cuesta
        b.vz *= Math.exp(-1.1 * dt);
        b.x += b.vx * dt;
        b.z += b.vz * dt;
      }

      // Choque elástico entre las dos bolas.
      const [a, c] = bolas;
      if (a.vivo && c.vivo) {
        const dx = c.x - a.x, dz = c.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < R_BOLA * 2 && d > 0.001) {
          const nx = dx / d, nz = dz / d;
          const rel = (c.vx - a.vx) * nx + (c.vz - a.vz) * nz;
          if (rel < 0) {
            const j = -rel * 1.75;           // >1: el choque añade energía
            a.vx -= j * nx; a.vz -= j * nz;
            c.vx += j * nx; c.vz += j * nz;
            const solape = R_BOLA * 2 - d;
            a.x -= nx * solape / 2; a.z -= nz * solape / 2;
            c.x += nx * solape / 2; c.z += nz * solape / 2;
            audio.tone({ freq: 180 + Math.abs(j) * 12, dur: 0.09, gain: 0.16, type: 'triangle', sweep: -80 });
            haptics.impact(0, Math.min(1, Math.abs(j) / 20));
            ctx.shake(Math.min(12, Math.abs(j)));
          }
        }
      }

      bolas.forEach((b, i) => {
        if (!b.vivo) return;
        b.malla.position.set(b.x, R_BOLA, b.z);
        if (Math.hypot(b.x, b.z) > radio + R_BOLA * 0.4) caer(i);
      });

      mundo.dibujar();
    },

    destroy() { selector?.destruir(); sb?.remove(); mundo.destruir(); },
  };
}
