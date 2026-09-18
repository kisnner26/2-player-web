/**
 * Tenis de mesa 3D — a once puntos contra la máquina.
 *
 * Reutiliza el cuerpo físico y el rebote de core/fisica3d.js: la pelota es un
 * `cuerpo()` normal al que se le aplica `integrar()` y `rebotarSuelo()` contra
 * la altura de la mesa. No hay física nueva escrita para este juego — es el
 * mismo motor que mueve el billar y los bolos.
 *
 * La regla de un bote por campo la lleva el propio rebote: si bota dos veces
 * en tu lado, punto para el otro.
 */

import { crearMundo, mat, esfera, caja, cilindro, suelo, sala } from '../../core/tres.js';
import * as F from '../../core/fisica3d.js';
import { crearBot, selectorDificultad } from '../../core/bot.js';
import { clamp } from '../../core/math2d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const LARGO = 14, ANCHO = 8, ALTO = 5, R = 0.34;
const PARA_GANAR = 11;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#0b0f18', horizonte: '#1a2436', sol: 2.6, solPos: [8, 26, 12],
    sombraArea: 20, fov: 40, niebla: 0.01,
  });
  sala(mundo, { color: '#121722', tam: 70, alto: 26 });
  suelo(mundo, { color: '#2a2118', veta: '#1e1811', lineas: 18, repite: 18 });
  mundo.camara.position.set(0, 15, 21);
  mundo.camara.lookAt(0, ALTO, -1);

  const mesa = caja(ANCHO * 2, 0.5, LARGO * 2, mat('#123a6b', { rug: 0.9 }), [0, ALTO, 0]);
  mesa.receiveShadow = true;
  mundo.escena.add(mesa);
  mundo.escena.add(caja(ANCHO * 2 + 1.2, 1.5, 0.16, mat('#e8eef6', { rug: 0.8 }), [0, ALTO + 1, 0]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    mundo.escena.add(caja(0.6, ALTO, 0.6, mat('#2b3242'), [sx * (ANCHO - 0.6), ALTO / 2, sz * (LARGO - 0.6)]));
  }

  const pala = [0, 1].map((i) => {
    const m = cilindro(1.5, 1.5, 0.22, mat(players[i].color, { rug: 0.6 }), null, 20);
    m.rotation.x = Math.PI / 2.6;
    m.castShadow = true;
    mundo.escena.add(m);
    return { malla: m, x: 0, z: i === 0 ? LARGO - 1.4 : -(LARGO - 1.4) };
  });

  const bola = F.cuerpo({ r: R, masa: 0.1 });
  bola.malla = esfera(R, mat('#ffffff', { rug: 0.4 }), [0, ALTO + 3, 0], 14);
  bola.malla.castShadow = true;
  mundo.escena.add(bola.malla);

  let bot = null, selector = null, jugando = false;
  let marcador = [0, 0], saca = 0, sb = null, espera = 0, botes = 0, ultimo = 0, viva = false;

  function sacar() {
    bola.pos.set(pala[saca].x, ALTO + 2.4, pala[saca].z + (saca === 0 ? -0.6 : 0.6));
    bola.vel.set((ctx.rng() - 0.5) * 3, 5, saca === 0 ? -13 : 13);
    bola.malla.visible = true;
    viva = true; botes = 0; ultimo = saca;
    bot?.reiniciar();
    audio.tone({ freq: 900, dur: 0.04, gain: 0.12, type: 'square' });
  }

  function punto(quien) {
    marcador[quien]++;
    sb?.update(marcador[0], marcador[1]);
    viva = false;
    bola.malla.visible = false;
    audio.score(quien);
    haptics.score(quien);
    if (marcador[quien] >= PARA_GANAR && marcador[quien] - marcador[1 - quien] >= 2) {
      setTimeout(() => ctx.finish({
        winner: quien, scores: marcador, detail: `${marcador[0]}-${marcador[1]}`,
      }), 900);
      espera = 99;
      return;
    }
    saca = (marcador[0] + marcador[1]) % 4 < 2 ? 0 : 1;
    espera = 1.1;
  }

  function golpear(quien) {
    const p = pala[quien];
    const dir = quien === 0 ? -1 : 1;
    const desvio = clamp((bola.pos.x - p.x) / 1.6, -1, 1);
    bola.vel.set(desvio * 7, 4.6, dir * (12 + Math.abs(desvio) * 2));
    ultimo = quien; botes = 0;
    audio.tone({ freq: 1200 + Math.abs(desvio) * 400, dur: 0.035, gain: 0.14, type: 'square' });
    haptics.impact(quien, 0.35);
  }

  return {
    init() {
      sb = ctx.ui.scoreboard({ center: `A ${PARA_GANAR}` });
      sb.update(0, 0);
      selector = selectorDificultad(ctx.frame, (id) => {
        bot = crearBot({ dificultad: id, rng: ctx.rng });
        jugando = true;
        espera = 0.9;
      }, { color: players[0].color });
    },

    update(dt) {
      if (!jugando) { selector?.navegar(input.player(0)); mundo.dibujar(); return; }

      const yo = input.player(0);
      const mov = (yo.held('right') ? 1 : 0) - (yo.held('left') ? 1 : 0);
      pala[0].x = clamp(pala[0].x + mov * 17 * dt, -ANCHO, ANCHO);

      // El bot persigue la x de la bola cuando viene hacia él.
      if (viva && bola.vel.z < 0) {
        const visto = bot.percibir(bola.pos.x, dt, { escalaError: ANCHO * 0.5 });
        const d = bot.mover(pala[1].x, visto, { zonaMuerta: 0.3 });
        pala[1].x = clamp(pala[1].x + d * 17 * dt, -ANCHO, ANCHO);
      } else {
        const d = bot.mover(pala[1].x, 0, { zonaMuerta: 0.6 });
        pala[1].x = clamp(pala[1].x + d * 10 * dt, -ANCHO, ANCHO);
      }
      pala.forEach((p) => p.malla.position.set(p.x, ALTO + 0.9, p.z));

      if (espera > 0) { espera -= dt; if (espera <= 0) sacar(); mundo.dibujar(); return; }
      if (!viva) { mundo.dibujar(); return; }

      // Física reutilizada: integrar + rebote contra el tablero.
      F.integrar(bola, dt, { arrastre: 0.12 });
      const sobreMesa = Math.abs(bola.pos.x) < ANCHO && Math.abs(bola.pos.z) < LARGO;
      if (sobreMesa && bola.pos.y - R <= ALTO + 0.25 && bola.vel.y < 0) {
        F.rebotarSuelo(bola, ALTO + 0.25, { restitucion: 0.72, friccion: 0.98, minRebote: 0.6 });
        botes++;
        audio.tone({ freq: 700, dur: 0.03, gain: 0.07, type: 'sine' });
        // Dos botes del mismo lado: punto para el que golpeó.
        if (botes >= 2) { punto(ultimo); mundo.dibujar(); return; }
      }
      bola.malla.position.copy(bola.pos);

      // Golpes
      for (const quien of [0, 1]) {
        const p = pala[quien];
        const viene = quien === 0 ? bola.vel.z > 0 : bola.vel.z < 0;
        if (!viene) continue;
        if (Math.abs(bola.pos.z - p.z) < 0.8 && Math.abs(bola.pos.x - p.x) < 1.8
            && bola.pos.y > ALTO && bola.pos.y < ALTO + 4) {
          if (quien === 0 ? (yo.held('a') || yo.pressed('a')) : !bot.distraido) golpear(quien);
        }
      }

      // Fuera: punto para el contrario del último que tocó.
      if (bola.pos.y < ALTO - 6 || Math.abs(bola.pos.z) > LARGO + 5) {
        punto(botes === 0 ? 1 - ultimo : ultimo);
      }
      mundo.dibujar();
    },

    destroy() { selector?.destruir(); sb?.remove(); mundo.destruir(); },
  };
}
