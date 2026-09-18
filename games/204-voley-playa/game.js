/**
 * Vóley Playa — dos toques por lado y el segundo es el que decide.
 *
 * Con un solo toque esto sería un frontón; con dos, aparece el juego real:
 * el primero levanta y el segundo remata. Levantar bien —alto y centrado— es
 * lo que te deja rematar, y rematar sin haber levantado sale siempre plano.
 *
 * La arena frena al saltar y el viento empuja la bola un poco. Nada de eso se
 * anuncia con números: se ve en la bandera del fondo.
 */

import { crearMundo, crearPanel, suelo, mat, caja, esfera, cilindro, sombraContacto, ajustarSombra, THREE } from '../../core/tres.js';

export const meta = { render: 'dom' };

const LARGO = 16;
const ANCHO = 8;
const RED_ALTO = 2.24;
const PARA_GANAR = 7;

export function create(ctx) {
  const { input, audio, haptics, players, rng } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#5aa8d8', horizonte: '#e8d4a8', sol: 2.8, solPos: [18, 26, 6],
    sombraArea: 24, fov: 44, niebla: 0.004,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#e0c48a', veta: '#d4b478', repite: 70 });

  mundo.escena.add(caja(ANCHO + 0.2, 0.03, LARGO + 0.2, mat('#d8b878', { rug: 1 }), [0, 0.03, 0]));
  const cinta = (an, fo, x, z) => caja(an, 0.02, fo, mat('#f2f2f2'), [x, 0.06, z]);
  mundo.escena.add(cinta(ANCHO, 0.09, 0, -LARGO / 2), cinta(ANCHO, 0.09, 0, LARGO / 2));
  mundo.escena.add(cinta(0.09, LARGO, -ANCHO / 2, 0), cinta(0.09, LARGO, ANCHO / 2, 0));

  mundo.escena.add(caja(ANCHO, RED_ALTO * 0.45, 0.06,
    mat('#20242c', { rug: 1, transparente: 0.75 }), [0, RED_ALTO - RED_ALTO * 0.22, 0]));
  mundo.escena.add(caja(ANCHO, 0.09, 0.12, mat('#ffffff'), [0, RED_ALTO, 0]));
  for (const x of [-ANCHO / 2, ANCHO / 2]) {
    mundo.escena.add(cilindro(0.07, 0.07, RED_ALTO + 0.3, mat('#8a7a5a'), [x, (RED_ALTO + 0.3) / 2, 0]));
  }

  // Bandera de viento al fondo.
  const mastil = cilindro(0.05, 0.05, 4, mat('#8a7a5a'), [ANCHO * 0.9, 2, -LARGO * 0.55]);
  mundo.escena.add(mastil);
  const bandera = caja(1.2, 0.5, 0.02, mat('#ff5a5a'), [ANCHO * 0.9 + 0.6, 3.6, -LARGO * 0.55]);
  mundo.escena.add(bandera);

  const bola = { pos: new THREE.Vector3(0, 2, LARGO * 0.3), vel: new THREE.Vector3(), r: 0.21, ultimo: 1, toques: 0 };
  bola.malla = esfera(bola.r, mat('#f6f2e0', { rug: 0.7 }), [0, 2, 0], 18);
  bola.malla.castShadow = true;
  mundo.escena.add(bola.malla);
  const sombraBola = sombraContacto(0.35, 0.4);
  mundo.escena.add(sombraBola);

  const jug = [0, 1].map((i) => {
    const g = new THREE.Group();
    const c = cilindro(0.3, 0.34, 1.7, mat(players[i].color, { rug: 0.7 }), [0, 0.85, 0]);
    c.castShadow = true;
    g.add(c, esfera(0.25, mat('#e0b890'), [0, 1.88, 0], 14));
    mundo.escena.add(g);
    return { i, g, x: 0, z: (i === 0 ? 1 : -1) * LARGO * 0.3, y: 0, vy: 0, puntos: 0, salto: false };
  });

  let viento = new THREE.Vector3((rng() - 0.5) * 1.6, 0, 0);
  let fase = 'saque', sacador = 0, aviso = '', avisoT = 0, marcador = null, terminado = false;

  function sacar() {
    fase = 'saque';
    bola.vel.set(0, 0, 0);
    bola.ultimo = sacador;
    bola.toques = 0;
    viento = new THREE.Vector3((rng() - 0.5) * 1.8, 0, 0);
  }

  function tocar(p) {
    const mio = bola.ultimo === p.i;
    bola.toques = mio ? bola.toques + 1 : 1;
    if (bola.toques > 2) { punto(1 - p.i, 'Tres toques'); return; }
    bola.ultimo = p.i;
    const haciaZ = p.z > 0 ? -1 : 1;
    const dx = bola.pos.x - p.x;
    if (bola.toques === 1) {
      // Levantada: alta y casi vertical, para poder rematar después.
      bola.vel.set(dx * 1.2, 9.4, haciaZ * 1.6);
      audio.blip();
    } else {
      // Remate: si estás alto, va fuerte y hacia abajo.
      const alto = p.y > 0.4 || bola.pos.y > RED_ALTO;
      bola.vel.set(dx * 2.6, alto ? 1.4 : 6.2, haciaZ * (alto ? 17 : 9));
      audio.hit();
      haptics.impact(p.i, alto ? 1.3 : 0.8);
    }
    fase = 'juego';
  }

  function punto(quien, motivo) {
    jug[quien].puntos++;
    marcador.update(jug[0].puntos, jug[1].puntos);
    aviso = motivo;
    avisoT = 1.8;
    audio.score(quien);
    haptics.score(quien);
    if (jug[quien].puntos >= PARA_GANAR) {
      terminado = true;
      ctx.finish({ winner: quien, scores: [jug[0].puntos, jug[1].puntos], detail: `a ${PARA_GANAR}` });
      return;
    }
    sacador = quien;
    sacar();
  }

  mundo.camara.position.set(0, 6.2, LARGO * 0.9);
  mundo.camara.lookAt(0, 1.6, 0);

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `a ${PARA_GANAR}` });
      sacar();
    },

    update(dt) {
      if (terminado) return;
      if (avisoT > 0) avisoT -= dt;

      for (const p of jug) {
        const pl = input.player(p.i);
        p.x = Math.max(-ANCHO / 2 - 0.6, Math.min(ANCHO / 2 + 0.6, p.x + pl.ax * 7 * dt));
        const avanza = pl.ay * (p.z > 0 ? 1 : -1);
        p.z -= avanza * 5 * dt;
        p.z = p.i === 0
          ? Math.max(0.9, Math.min(LARGO * 0.5, p.z))
          : Math.min(-0.9, Math.max(-LARGO * 0.5, p.z));

        // Salto: la arena resta impulso, por eso se salta poco.
        if (pl.pressed('b') && p.y <= 0.001) { p.vy = 5.4; }
        p.vy -= 17 * dt;
        p.y = Math.max(0, p.y + p.vy * dt);
        if (p.y === 0) p.vy = 0;

        p.g.position.set(p.x, p.y, p.z);
        p.g.rotation.y = p.z > 0 ? Math.PI : 0;

        const cerca = Math.hypot(bola.pos.x - p.x, bola.pos.z - p.z) < 1.8
          && bola.pos.y < 2.4 + p.y && bola.pos.y > p.y - 0.2;
        const miLado = p.z > 0 ? bola.pos.z > 0 : bola.pos.z < 0;
        if (fase === 'saque' && p.i === sacador && pl.pressed('a')) {
          bola.pos.set(p.x, 2.2, p.z - Math.sign(p.z) * 0.5);
          bola.toques = 1;
          bola.ultimo = p.i;
          const haciaZ = p.z > 0 ? -1 : 1;
          bola.vel.set(0, 7, haciaZ * 11);
          fase = 'juego';
          audio.hit();
        } else if (fase === 'juego' && cerca && miLado && pl.pressed('a')) {
          tocar(p);
          if (terminado) return;
        }
      }

      if (fase === 'juego') {
        bola.vel.y -= 17 * dt;
        bola.vel.addScaledVector(viento, dt);
        bola.vel.multiplyScalar(Math.exp(-0.16 * dt));
        bola.pos.addScaledVector(bola.vel, dt);

        if (Math.abs(bola.pos.z) < 0.18 && bola.pos.y < RED_ALTO) {
          punto(bola.ultimo === 0 ? 1 : 0, 'A la red');
          return;
        }
        if (bola.pos.y <= bola.r) {
          const dentro = Math.abs(bola.pos.x) < ANCHO / 2 + 0.1 && Math.abs(bola.pos.z) < LARGO / 2 + 0.1;
          punto(dentro ? bola.ultimo : (bola.ultimo === 0 ? 1 : 0), dentro ? 'Toca arena' : 'Fuera');
          return;
        }
      } else {
        const s = jug[sacador];
        bola.pos.set(s.x, 1.9, s.z - Math.sign(s.z) * 0.5);
      }

      bola.malla.position.copy(bola.pos);
      bola.malla.rotation.x += bola.vel.z * dt * 0.5;
      bola.malla.rotation.z -= bola.vel.x * dt * 0.5;
      ajustarSombra(sombraBola, bola.malla, 0.04, 6);
      bandera.rotation.y = Math.atan2(viento.x, 0.2) * 0.5;
      bandera.position.x = ANCHO * 0.9 + Math.sign(viento.x || 1) * 0.6;

      const restador = jug[1 - bola.ultimo];
      const objetivo = new THREE.Vector3(bola.pos.x * 0.25, 6.2, Math.sign(restador.z) * LARGO * 0.9);
      mundo.camara.position.lerp(objetivo, Math.min(1, dt * 1.4));
      mundo.camara.lookAt(bola.pos.x * 0.25, 1.6, 0);

      panel.centro(fase === 'saque'
        ? `saca <b style="color:${players[sacador].color}">${players[sacador].name}</b>`
        : `${jug[0].puntos} — ${jug[1].puntos} · toque ${bola.toques}/2`);
      panel.sub(avisoT > 0 ? aviso : 'primer toque levanta, segundo remata · la especial salta');
      panel.pie(`viento ${viento.x > 0 ? '→' : '←'} · mira la bandera del fondo`);
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
