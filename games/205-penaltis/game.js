/**
 * Penaltis — cinco cada uno y el portero adivina, no reacciona.
 *
 * El portero elige lado ANTES de que salga el disparo, igual que en la vida:
 * una vez sale la pelota ya no hay tiempo. Por eso esto no es un juego de
 * reflejos, es un juego de leerle la cara al otro.
 *
 * El tirador elige lado y altura, y la potencia sube con una barra: pegarle
 * fuerte al ángulo es imparable… si entra. Si te pasas, se va al larguero y
 * la gente se ríe.
 */

import { crearMundo, crearPanel, suelo, mat, caja, esfera, cilindro, sombraContacto, ajustarSombra, THREE } from '../../core/tres.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const TANDAS = 5;
const PORTERIA_AN = 7.32;
const PORTERIA_AL = 2.44;

export function create(ctx) {
  const { input, audio, haptics, players, rng } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#0e1a2c', horizonte: '#1e3550', sol: 2.6, solPos: [8, 24, 16],
    sombraArea: 20, fov: 42, niebla: 0.005,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#2c6b3c', veta: '#256034', repite: 40, lineas: 0 });

  // Portería
  const marco = new THREE.Group();
  const poste = mat('#f2f2f2', { rug: 0.4 });
  marco.add(cilindro(0.09, 0.09, PORTERIA_AL, poste, [-PORTERIA_AN / 2, PORTERIA_AL / 2, 0]));
  marco.add(cilindro(0.09, 0.09, PORTERIA_AL, poste, [PORTERIA_AN / 2, PORTERIA_AL / 2, 0]));
  const larguero = cilindro(0.09, 0.09, PORTERIA_AN, poste, [0, PORTERIA_AL, 0]);
  larguero.rotation.z = Math.PI / 2;
  marco.add(larguero);
  const redM = caja(PORTERIA_AN, PORTERIA_AL, 0.05,
    mat('#dfe6ff', { rug: 1, transparente: 0.22 }), [0, PORTERIA_AL / 2, -1.1]);
  marco.add(redM);
  mundo.escena.add(marco);
  mundo.escena.add(caja(PORTERIA_AN + 12, 0.02, 0.12, mat('#ffffff'), [0, 0.05, 0.02]));

  const bola = { pos: new THREE.Vector3(0, 0.22, 11), vel: new THREE.Vector3(), r: 0.22 };
  bola.malla = esfera(bola.r, mat('#f6f6f6', { rug: 0.6 }), [0, 0.22, 11], 20);
  bola.malla.castShadow = true;
  mundo.escena.add(bola.malla);
  const sombraBola = sombraContacto(0.32, 0.4);
  mundo.escena.add(sombraBola);

  const portero = new THREE.Group();
  const cuerpoP = cilindro(0.3, 0.34, 1.75, mat('#ffd166', { rug: 0.6 }), [0, 0.88, 0]);
  cuerpoP.castShadow = true;
  portero.add(cuerpoP, esfera(0.25, mat('#e0b890'), [0, 1.92, 0], 14));
  portero.position.set(0, 0, 0.4);
  mundo.escena.add(portero);

  const tirador = new THREE.Group();
  const cuerpoT = cilindro(0.3, 0.34, 1.75, mat('#ffffff', { rug: 0.6 }), [0, 0.88, 0]);
  tirador.add(cuerpoT, esfera(0.25, mat('#e0b890'), [0, 1.92, 0], 14));
  tirador.position.set(-0.6, 0, 11.8);
  mundo.escena.add(tirador);

  let tanda = 1, turno = 0;            // turno = quien tira
  let fase = 'eligiendo', ladoP = 1, ladoT = 1, altoT = 1, fuerza = 0, subiendo = true;
  let elegidoP = false, elegidoT = false, espera = 0, t = 0;
  const goles = [0, 0];
  let marcador = null, mensaje = '', terminado = false, saltoP = 0;

  const LADOS = [-1, 0, 1];

  function chutar() {
    const x = LADOS[ladoT] * (PORTERIA_AN / 2 - 0.7);
    const y = altoT === 0 ? 0.5 : altoT === 1 ? 1.3 : PORTERIA_AL - 0.25;
    const dir = new THREE.Vector3(x - bola.pos.x, y - bola.pos.y + 0.3, -bola.pos.z).normalize();
    const v = 16 + fuerza * 15;
    bola.vel.copy(dir.multiplyScalar(v));
    // Cuanto más fuerte, menos preciso: es la tensión del juego.
    bola.vel.x += (rng() - 0.5) * fuerza * 3.4;
    bola.vel.y += (rng() - 0.5) * fuerza * 2.2;
    fase = 'volando';
    saltoP = 0;
    audio.hit();
    haptics.impact(turno, 1.1);
  }

  function resolver(texto, gol) {
    mensaje = texto;
    if (gol) {
      goles[turno]++;
      audio.win();
      haptics.score(turno);
    } else {
      audio.lose();
      haptics.error(turno);
    }
    marcador.update(goles[0], goles[1]);
    fase = 'pausa';
    espera = 2.2;
  }

  function siguiente() {
    if (turno === 1) tanda++;
    turno = 1 - turno;
    if (tanda > TANDAS) {
      terminado = true;
      const g = goles[0] === goles[1] ? -1 : (goles[0] > goles[1] ? 0 : 1);
      ctx.finish({ winner: g, scores: goles, detail: `${TANDAS} penaltis cada uno` });
      return;
    }
    bola.pos.set(0, 0.22, 11);
    bola.vel.set(0, 0, 0);
    portero.position.set(0, 0, 0.4);
    fase = 'eligiendo';
    elegidoP = false;
    elegidoT = false;
    ladoP = 1; ladoT = 1; altoT = 1;
    fuerza = 0;
    mensaje = '';
  }

  mundo.camara.position.set(0, 3.4, 16);
  mundo.camara.lookAt(0, 1.4, 0);

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `tanda 1 de ${TANDAS}` });
    },

    update(dt) {
      if (terminado) return;
      t += dt;

      if (fase === 'eligiendo') {
        const pt = input.player(turno);
        const pp = input.player(1 - turno);
        if (!elegidoT) {
          if (pt.pressed('left')) { ladoT = Math.max(0, ladoT - 1); audio.tick(); }
          if (pt.pressed('right')) { ladoT = Math.min(2, ladoT + 1); audio.tick(); }
          if (pt.pressed('up')) { altoT = Math.min(2, altoT + 1); audio.tick(); }
          if (pt.pressed('down')) { altoT = Math.max(0, altoT - 1); audio.tick(); }
          fuerza += (subiendo ? 1 : -1) * dt * 0.9;
          if (fuerza >= 1) { fuerza = 1; subiendo = false; }
          if (fuerza <= 0) { fuerza = 0; subiendo = true; }
          if (pt.pressed('a')) { elegidoT = true; audio.select(); }
        }
        if (!elegidoP) {
          if (pp.pressed('left')) { ladoP = Math.max(0, ladoP - 1); audio.tick(); }
          if (pp.pressed('right')) { ladoP = Math.min(2, ladoP + 1); audio.tick(); }
          if (pp.pressed('a')) { elegidoP = true; audio.select(); }
        }
        // El portero se coloca solo cuando el tirador ya ha cerrado, para que
        // no se pueda leer la decisión mirando al muñeco.
        if (elegidoT && elegidoP) chutar();
      } else if (fase === 'volando') {
        saltoP = Math.min(1, saltoP + dt * 4);
        const destinoX = LADOS[ladoP] * (PORTERIA_AN / 2 - 0.9);
        portero.position.x += (destinoX - portero.position.x) * Math.min(1, dt * 7);
        portero.position.y = Math.sin(saltoP * Math.PI) * (ladoP === 1 ? 0.5 : 1.1);
        portero.rotation.z = -LADOS[ladoP] * saltoP * 0.9;

        bola.vel.y -= 9.8 * dt;
        bola.pos.addScaledVector(bola.vel, dt);

        // Parada: el portero llega si el balón pasa cerca de él.
        const cerca = Math.abs(bola.pos.z - 0.4) < 0.6;
        if (cerca) {
          const dx = Math.abs(bola.pos.x - portero.position.x);
          const dy = Math.abs(bola.pos.y - (portero.position.y + 1));
          if (dx < 1.1 && dy < 1.3) {
            resolver('¡Parada!', false);
            bola.vel.multiplyScalar(-0.3);
            return;
          }
        }
        if (bola.pos.z < 0) {
          const dentro = Math.abs(bola.pos.x) < PORTERIA_AN / 2 && bola.pos.y < PORTERIA_AL && bola.pos.y > 0;
          resolver(dentro ? '¡GOL!' : (bola.pos.y >= PORTERIA_AL ? 'Al larguero, fuera' : 'Fuera'), dentro);
          return;
        }
      } else if (fase === 'pausa') {
        espera -= dt;
        bola.pos.addScaledVector(bola.vel, dt);
        bola.vel.y -= 9.8 * dt;
        if (bola.pos.y < bola.r) { bola.pos.y = bola.r; bola.vel.y *= -0.4; bola.vel.multiplyScalar(0.7); }
        if (espera <= 0) siguiente();
      }

      bola.malla.position.copy(bola.pos);
      ajustarSombra(sombraBola, bola.malla, 0.03, 8);
      tirador.position.z = 11.8;
      tirador.position.x = fase === 'volando' ? -0.2 : -0.6;
      // Colores de cada papel, para que se sepa quién es quién.
      cuerpoT.material.color.set(players[turno].color);
      cuerpoP.material.color.set(players[1 - turno].color);

      const flechas = ['◀', '●', '▶'];
      panel.centro(fase === 'pausa'
        ? mensaje
        : `tanda ${tanda}/${TANDAS} · tira <b style="color:${players[turno].color}">${players[turno].name}</b>`);
      panel.sub(fase === 'eligiendo'
        ? `${players[turno].name}: ${flechas[ladoT]} ${['raso', 'medio', 'alto'][altoT]} ${elegidoT ? '· LISTO' : ''} — `
          + `${players[1 - turno].name} (portero): ${elegidoP ? 'ya ha elegido' : 'elige lado ' + flechas[ladoP]}`
        : mensaje || 'la bola está en el aire');
      panel.pie('El portero elige lado antes del disparo · el tirador elige lado, altura y fuerza');
      panel.barra(fase === 'eligiendo' && !elegidoT ? fuerza : null, players[turno].color);
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
