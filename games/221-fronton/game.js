/**
 * Frontón — una pared, una pelota y un turno que no se puede saltar.
 *
 * Se golpea por turnos: si te toca a ti y no llegas, punto para el otro; y si
 * golpeas cuando no te toca, falta. Eso convierte el juego en una negociación
 * de espacio, porque los dos comparten la misma línea y estorbarse es legal.
 *
 * La pelota tiene que llegar a la pared. Un golpe blando muere en el suelo y es
 * punto en contra, así que no vale devolver de cualquier manera para salvarse.
 */

import { crearMundo, crearPanel, suelo, sala, mat, caja, esfera, cilindro, sombraContacto, ajustarSombra, THREE } from '../../core/tres.js';
import { cuerpo, integrar, rebotarSuelo } from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const PARED_Z = -20;           // el frontis
const LINEA_Z = 3;             // donde se golpea
const ANCHO = 7;               // media anchura de la cancha
const PUNTOS = 7;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#141a24', horizonte: '#26303f', sol: 2.4, solPos: [10, 26, 14],
    sombraArea: 24, fov: 48,
  });
  const panel = crearPanel(ctx.root);
  sala(mundo, { color: '#1b2130', tam: 70, alto: 22 });
  suelo(mundo, { color: '#a8814f', veta: '#8e6b3f', repite: 40, lineas: 24 });

  // Frontis con su chapa y su raya de falta.
  mundo.escena.add(caja(ANCHO * 2 + 2, 16, 0.6, mat('#d8d2c4', { rug: 0.9 }), [0, 8, PARED_Z]));
  mundo.escena.add(caja(ANCHO * 2 + 2, 0.35, 0.7, mat('#c0392b'), [0, 1.1, PARED_Z + 0.1]));
  for (const s of [-1, 1]) {
    mundo.escena.add(caja(0.5, 14, 40, mat('#232a38', { rug: 1 }), [s * (ANCHO + 1), 7, PARED_Z + 20]));
  }
  mundo.escena.add(caja(ANCHO * 2, 0.04, 0.3, mat('#ffffff'), [0, 0.05, LINEA_Z]));

  const pala = [0, 1].map((i) => {
    const g = new THREE.Group();
    const cuerpoJug = cilindro(0.3, 0.34, 1.7, mat(players[i].color, { rug: 0.6 }), [0, 0.85, 0]);
    g.add(cuerpoJug, esfera(0.25, mat('#e0b890'), [0, 1.9, 0], 14));
    const brazo = caja(1.5, 0.16, 0.16, mat('#e8e0d0'), [0.9, 1.3, 0]);
    g.add(brazo);
    g.position.set(i === 0 ? -2.2 : 2.2, 0, LINEA_Z);
    mundo.escena.add(g);
    return { i, g, brazo, x: i === 0 ? -2.2 : 2.2, golpe: 0 };
  });

  const bola = cuerpo({ x: 0, y: 1.4, z: LINEA_Z - 1, r: 0.24, masa: 0.2 });
  bola.malla = esfera(0.24, mat('#f4f0e2', { rug: 0.4 }), [0, 1.4, 0], 18);
  mundo.escena.add(bola.malla);
  const sombra = sombraContacto(0.3, 0.3);
  mundo.escena.add(sombra);

  let turno = 0, tanteo = [0, 0], toco = false, fase = 'saque';
  let marcador = null, aviso = 'Saca ' + players[0].name, acabado = false, t = 0;

  mundo.camara.position.set(0, 6.4, LINEA_Z + 13);
  mundo.camara.lookAt(0, 2.2, PARED_Z + 6);

  function servir() {
    bola.pos.set(pala[turno].x, 1.5, LINEA_Z - 0.8);
    bola.vel.set(0, 0, 0);
    bola.quieto = false;
    toco = false;
    fase = 'saque';
    aviso = `Saca ${players[turno].name}`;
  }

  function golpear(p) {
    const dx = bola.pos.x - p.x;
    // La dirección sale de dónde le pega la pala: el centro va recto.
    const objetivoX = -dx * 2.4 + (input.player(p.i).x * 4);
    const dist = Math.hypot(dx, bola.pos.z - LINEA_Z);
    if (dist > 2.2) {
      // Golpe al aire: no es falta, pero pierdes el tempo.
      audio.swoosh();
      return false;
    }
    const fuerza = 15 + Math.random() * 2;
    bola.vel.set(objetivoX * 0.5, 4.4, -fuerza);
    bola.quieto = false;
    p.golpe = 0.18;
    toco = false;
    turno = 1 - p.i;
    audio.hit();
    haptics.impact(p.i, 0.8);
    aviso = `Devuelve ${players[turno].name}`;
    return true;
  }

  function punto(quien, motivo) {
    tanteo[quien]++;
    marcador?.update(tanteo[0], tanteo[1]);
    audio.score(quien);
    haptics.play('score', { player: quien });
    aviso = `${motivo} · punto para ${players[quien].name}`;
    if (tanteo[quien] >= PUNTOS) {
      acabado = true;
      ctx.finish({
        winner: quien,
        scores: [tanteo[0], tanteo[1]],
        detail: `${tanteo[0]} — ${tanteo[1]} · ${motivo.toLowerCase()}`,
        record: ctx.record('tanteo', Math.max(...tanteo), 'high'),
      });
      return;
    }
    turno = 1 - quien;
    servir();
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `a ${PUNTOS} puntos` });
      servir();
    },

    update(dt) {
      if (acabado) return;
      t += dt;

      for (const p of pala) {
        const pl = input.player(p.i);
        p.x = Math.max(-ANCHO + 0.6, Math.min(ANCHO - 0.6, p.x + pl.x * 7.5 * dt));
        p.g.position.x = p.x;
        p.golpe = Math.max(0, p.golpe - dt);
        p.brazo.rotation.z = -p.golpe * 7;

        if (pl.pressed('a')) {
          if (fase === 'saque' && p.i === turno) {
            fase = 'juego';
            bola.pos.set(p.x + 0.4, 1.6, LINEA_Z - 0.9);
            golpear(p);
          } else if (fase === 'juego') {
            if (p.i === turno) golpear(p);
            else punto(turno, 'Golpe fuera de turno');
          }
        }
      }

      if (fase === 'saque') {
        bola.pos.set(pala[turno].x + 0.4, 1.5 + Math.sin(t * 3) * 0.12, LINEA_Z - 0.9);
      } else {
        integrar(bola, dt, { arrastre: 0.12 });
        const imp = rebotarSuelo(bola, 0, { restitucion: 0.72, friccion: 0.95, minRebote: 0.4 });
        if (imp > 1.6) audio.bounce(0.3);

        // Frontis
        if (bola.pos.z - bola.r < PARED_Z + 0.4) {
          bola.pos.z = PARED_Z + 0.4 + bola.r;
          bola.vel.z = Math.abs(bola.vel.z) * 0.92;
          toco = true;
          audio.thud();
          haptics.play('bounce');
        }
        // Paredes laterales
        for (const s of [-1, 1]) {
          if (s * bola.pos.x > ANCHO - 0.4) {
            bola.pos.x = s * (ANCHO - 0.4);
            bola.vel.x *= -0.85;
            audio.tick();
          }
        }

        // Se pasó de la línea sin que la devolviera quien debía.
        if (bola.pos.z > LINEA_Z + 4.5) punto(1 - turno, 'No llegó a la pelota');
        // Murió antes de la pared: golpe corto.
        else if (!toco && bola.pos.y <= bola.r + 0.02 && Math.abs(bola.vel.z) < 2.5) {
          punto(1 - turno, 'La pelota no llegó al frontis');
        }
      }

      bola.malla.position.copy(bola.pos);
      ajustarSombra(sombra, bola.malla, 0, 5);

      // La cámara acompaña de lado, sin perder la pared de vista.
      mundo.camara.position.x += (bola.pos.x * 0.3 - mundo.camara.position.x) * Math.min(1, dt * 2.5);
      mundo.camara.lookAt(bola.pos.x * 0.25, 2, PARED_Z + 7);

      panel.centro(`<b style="color:${players[turno].color}">${players[turno].name}</b> · ${aviso}`);
      panel.sub(`${tanteo[0]} — ${tanteo[1]} · ${toco ? 'la pelota ya tocó el frontis' : 'aún no ha tocado la pared'}`);
      panel.pie('← → te mueven · tu tecla golpea · solo puede golpear quien tiene el turno');
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
