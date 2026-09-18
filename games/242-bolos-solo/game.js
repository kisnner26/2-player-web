/**
 * Bolos — cinco rondas contra la máquina.
 *
 * Los pinos son `pieza()` de core/fisica3d.js, el mismo tipo que ya usan los
 * juegos de derribo: caen, ruedan y se empujan entre sí con `pasoPieza()` y
 * `empujar()`. No hay física propia aquí; solo la bolera y el turno.
 *
 * El bot apunta al centro con el error de core/bot.js encima, así que en fácil
 * manda la bola al canalón de vez en cuando y en duro hace pleno a menudo.
 */

import { crearMundo, mat, esfera, caja, cilindro, suelo, sala } from '../../core/tres.js';
import * as F from '../../core/fisica3d.js';
import { crearBot, selectorDificultad } from '../../core/bot.js';
import { clamp } from '../../core/math2d.js';

export const meta = { render: 'dom', sinCuentaAtras: true, turnos: true };

const LARGO = 60, ANCHO = 7, RONDAS = 5;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#0d1119', horizonte: '#1e2738', sol: 2.5, solPos: [6, 30, 20],
    sombraArea: 26, fov: 38, niebla: 0.008,
  });
  sala(mundo, { color: '#141a26', tam: 90, alto: 26 });
  const pista = caja(ANCHO * 2, 0.4, LARGO, mat('#b98b4e', { rug: 0.5 }), [0, 0, -LARGO / 2 + 6]);
  pista.receiveShadow = true;
  mundo.escena.add(pista);
  for (const s of [-1, 1]) {
    mundo.escena.add(caja(1.6, 0.9, LARGO, mat('#2a3242'), [s * (ANCHO + 0.8), -0.3, -LARGO / 2 + 6]));
  }
  mundo.camara.position.set(0, 11, 20);
  mundo.camara.lookAt(0, 1, -22);

  const bola = F.cuerpo({ r: 1.5, masa: 6 });
  bola.malla = esfera(1.5, mat('#1a1a2e', { rug: 0.2, met: 0.3 }), [0, 1.5, 12], 20);
  bola.malla.castShadow = true;
  mundo.escena.add(bola.malla);

  let pinos = [];
  function plantarPinos() {
    for (const p of pinos) mundo.escena.remove(p.malla);
    pinos = [];
    const z0 = -LARGO + 12;
    let i = 0;
    for (let fila = 0; fila < 4; fila++) {
      for (let k = 0; k <= fila; k++) {
        const m = cilindro(0.42, 0.55, 3, mat('#f3efe4', { rug: 0.5 }), null, 12);
        m.castShadow = true;
        mundo.escena.add(m);
        const p = F.pieza(m, { r: 0.55, alto: 3, masa: 1 });
        p.pos.set((k - fila / 2) * 2.2, 1.5, z0 - fila * 2);
        m.position.copy(p.pos);
        pinos.push(p);
        i++;
      }
    }
  }

  let bot = null, selector = null, jugando = false;
  let turno = 0, ronda = 1, marcador = [0, 0], sb = null;
  let fase = 'apuntar', mira = 0, dirMira = 1, potencia = 0, cargando = false, reloj = 0;

  function nuevaTirada() {
    plantarPinos();
    bola.pos.set(0, 1.5, 12);
    bola.vel.set(0, 0, 0);
    bola.malla.position.copy(bola.pos);
    mira = 0; dirMira = 1; potencia = 0; cargando = false;
    fase = 'apuntar'; reloj = 0;
    bot?.reiniciar();
  }

  function contarYSeguir() {
    const caidos = pinos.filter((p) => Math.abs(p.malla.rotation.x) > 0.7 || Math.abs(p.malla.rotation.z) > 0.7).length;
    marcador[turno] += caidos;
    sb?.update(marcador[0], marcador[1]);
    audio[caidos >= 10 ? 'win' : 'pickup']();
    haptics.score(turno);
    turno = 1 - turno;
    if (turno === 0) {
      ronda++;
      if (ronda > RONDAS) {
        const gana = marcador[0] === marcador[1] ? -1 : (marcador[0] > marcador[1] ? 0 : 1);
        ctx.finish({ winner: gana, scores: marcador, detail: `${marcador[0]}-${marcador[1]} bolos` });
        fase = 'fin';
        return;
      }
      sb?.setCenter(`Ronda ${ronda}/${RONDAS}`);
    }
    setTimeout(nuevaTirada, 900);
    fase = 'espera';
  }

  function lanzar(x, fuerza) {
    bola.pos.x = clamp(x, -ANCHO + 1, ANCHO - 1);
    bola.vel.set(0, 0, -(28 + fuerza * 22));
    fase = 'rodando';
    reloj = 0;
    audio.tone({ freq: 90, dur: 0.3, gain: 0.22, type: 'sine', sweep: -30 });
    haptics.impact(turno, 0.7);
  }

  return {
    init() {
      sb = ctx.ui.scoreboard({ center: `Ronda 1/${RONDAS}` });
      sb.update(0, 0);
      plantarPinos();
      selector = selectorDificultad(ctx.frame, (id) => {
        bot = crearBot({ dificultad: id, rng: ctx.rng });
        jugando = true;
        nuevaTirada();
      }, { color: players[0].color });
    },

    update(dt) {
      if (!jugando) { selector?.navegar(input.player(0)); mundo.dibujar(); return; }

      if (fase === 'apuntar') {
        mira += dirMira * dt * 1.3;
        if (Math.abs(mira) > 1) { mira = Math.sign(mira); dirMira *= -1; }
        if (turno === 0) {
          const p = input.player(0);
          if (p.pressed('a')) { cargando = true; potencia = 0; }
          if (cargando && p.held('a')) potencia = Math.min(1, potencia + dt * 0.8);
          if (cargando && p.released('a')) lanzar(mira * (ANCHO - 1.5), potencia);
        } else {
          reloj += dt;
          const visto = bot.percibir(0, dt, { escalaError: ANCHO * 0.9 });
          if (reloj > 1.1) lanzar(clamp(visto, -ANCHO + 1, ANCHO - 1), 0.55 + bot.dificultad.tope * 0.4);
        }
        bola.pos.x = turno === 0 ? mira * (ANCHO - 1.5) : bola.pos.x;
        bola.malla.position.copy(bola.pos);
      } else if (fase === 'rodando') {
        reloj += dt;
        F.integrar(bola, dt, { gravedad: 0 });
        bola.pos.x = clamp(bola.pos.x, -ANCHO + 1.5, ANCHO - 1.5);
        F.rodarMalla(bola, dt);
        bola.malla.position.copy(bola.pos);
        for (const p of pinos) {
          if (F.distXZ(bola, p) < 2.1) F.empujar(p, { x: bola.vel.x, z: bola.vel.z }, 3.2);
          F.pasoPieza(p, dt, { sueloY: 0 });
        }
        // Choques entre pinos: es lo que propaga el pleno.
        for (let i = 0; i < pinos.length; i++) {
          for (let j = i + 1; j < pinos.length; j++) {
            if (F.distXZ(pinos[i], pinos[j]) < 1.2) {
              F.empujar(pinos[j], { x: pinos[i].vel.x, z: pinos[i].vel.z }, 0.9);
            }
          }
        }
        if (reloj > 4.5 || bola.pos.z < -LARGO + 4) contarYSeguir();
      }
      mundo.dibujar();
    },

    destroy() { selector?.destruir(); sb?.remove(); mundo.destruir(); },
  };
}
