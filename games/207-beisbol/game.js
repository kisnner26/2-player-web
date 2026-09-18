/**
 * Béisbol — un lanzador, un bateador y una décima de segundo.
 *
 * El lanzador elige el tipo antes de soltar: recta rápida, curva que se abre o
 * cambio que llega tarde. El bateador solo ve la bola salir de la mano y tiene
 * que decidir con eso. No hay más información y no hace falta.
 *
 * El bateo se resuelve por timing puro: pronto, tarde o justo. Justo manda la
 * bola al fondo; pronto o tarde la escupe de falta. Se juega a tres outs por
 * turno y gana quien más carreras meta.
 */

import { crearMundo, crearPanel, suelo, mat, caja, esfera, cilindro, sombraContacto, ajustarSombra, THREE } from '../../core/tres.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const OUTS = 3;
const ENTRADAS = 2;
const TIPOS = [
  { id: 'recta', nombre: 'Recta', vel: 30, curva: 0, color: '#ff4757' },
  { id: 'curva', nombre: 'Curva', vel: 23, curva: 5.5, color: '#3aa0ff' },
  { id: 'cambio', nombre: 'Cambio', vel: 17, curva: -1.5, color: '#a8ff3e' },
];

export function create(ctx) {
  const { input, audio, haptics, players, rng } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#12203a', horizonte: '#2c4664', sol: 2.4, solPos: [12, 28, 14],
    sombraArea: 24, fov: 40, niebla: 0.004,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#3f7a3a', veta: '#376c33', repite: 50 });

  mundo.escena.add(caja(9, 0.03, 9, mat('#9a7048', { rug: 1 }), [0, 0.03, 6]));
  const home = caja(0.7, 0.03, 0.7, mat('#f2f2f2'), [0, 0.06, 6]);
  home.rotation.y = Math.PI / 4;
  mundo.escena.add(home);
  mundo.escena.add(cilindro(1.6, 1.8, 0.25, mat('#9a7048', { rug: 1 }), [0, 0.12, -12], 20));

  const bola = { pos: new THREE.Vector3(0, 1.8, -12), vel: new THREE.Vector3(), curva: 0, r: 0.11 };
  bola.malla = esfera(bola.r, mat('#f6f6f6'), [0, 1.8, -12], 14);
  bola.malla.castShadow = true;
  mundo.escena.add(bola.malla);
  const sombraBola = sombraContacto(0.2, 0.35);
  mundo.escena.add(sombraBola);

  const bate = caja(0.12, 0.12, 1.1, mat('#c9a86a'), [0.6, 1.1, 6]);
  mundo.escena.add(bate);

  const figura = (color, pos) => {
    const g = new THREE.Group();
    const c = cilindro(0.3, 0.34, 1.7, mat(color, { rug: 0.6 }), [0, 0.85, 0]);
    c.castShadow = true;
    g.add(c, esfera(0.25, mat('#e0b890'), [0, 1.88, 0], 14));
    g.position.copy(pos);
    mundo.escena.add(g);
    return g;
  };
  const lanzador = figura('#ffffff', new THREE.Vector3(0, 0, -12));
  const bateador = figura('#ffffff', new THREE.Vector3(1.1, 0, 6.4));

  let bateando = 0, entrada = 1, outs = 0;
  const carreras = [0, 0];
  let fase = 'eligiendo', tipo = 0, elegido = false, mensaje = '', espera = 0, swing = 0, t = 0;
  let marcador = null, terminado = false, soltada = 0;

  function lanzar() {
    const T = TIPOS[tipo];
    bola.pos.set((rng() - 0.5) * 0.5, 1.75, -12);
    bola.vel.set(0, 0.4, T.vel);
    bola.curva = T.curva * (rng() < 0.5 ? 1 : -1);
    fase = 'volando';
    soltada = 0;
    audio.swoosh();
  }

  function resultado(texto, carrera, out) {
    mensaje = texto;
    if (carrera) {
      carreras[bateando] += carrera;
      audio.win();
      haptics.score(bateando);
    } else if (out) {
      outs++;
      audio.error();
      haptics.error(bateando);
    }
    marcador.update(carreras[0], carreras[1]);
    fase = 'pausa';
    espera = 1.8;
  }

  function siguiente() {
    if (outs >= OUTS) {
      outs = 0;
      if (bateando === 1) entrada++;
      bateando = 1 - bateando;
      if (entrada > ENTRADAS) {
        terminado = true;
        const g = carreras[0] === carreras[1] ? -1 : (carreras[0] > carreras[1] ? 0 : 1);
        ctx.finish({ winner: g, scores: carreras, detail: `${ENTRADAS} entradas` });
        return;
      }
    }
    fase = 'eligiendo';
    elegido = false;
    mensaje = '';
    bola.pos.set(0, 1.8, -12);
  }

  mundo.camara.position.set(2.6, 2.6, 11);
  mundo.camara.lookAt(0, 1.4, -2);

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `entrada 1 de ${ENTRADAS}` });
    },

    update(dt) {
      if (terminado) return;
      t += dt;
      swing = Math.max(0, swing - dt);

      const pl = input.player(1 - bateando);   // lanza el que no batea
      const pb = input.player(bateando);

      if (fase === 'eligiendo') {
        if (pl.pressed('left')) { tipo = (tipo + TIPOS.length - 1) % TIPOS.length; audio.tick(); }
        if (pl.pressed('right')) { tipo = (tipo + 1) % TIPOS.length; audio.tick(); }
        if (pl.pressed('a')) { elegido = true; lanzar(); }
      } else if (fase === 'volando') {
        soltada += dt;
        bola.vel.x += bola.curva * dt;
        bola.vel.y -= 9.8 * dt;
        bola.pos.addScaledVector(bola.vel, dt);

        if (pb.pressed('a') && swing <= 0) {
          swing = 0.25;
          // El timing se mide por lo cerca que estaba la bola del home al batear.
          const d = Math.abs(bola.pos.z - 6);
          audio.hit();
          if (d < 0.7 && Math.abs(bola.pos.x) < 1.4) {
            const potencia = 1 - d / 0.7;
            if (potencia > 0.7) resultado('¡JONRÓN!', 1, false);
            else if (potencia > 0.35) resultado('Hit: base', 0, false);
            else resultado('Roletazo: out', 0, true);
          } else if (d < 2.2) resultado('Falta', 0, false);
          else resultado('Abanica: strike', 0, true);
          return;
        }
        if (bola.pos.z > 8) {
          const zona = Math.abs(bola.pos.x) < 0.6 && bola.pos.y > 0.6 && bola.pos.y < 1.8;
          resultado(zona ? 'Strike cantado' : 'Bola mala', 0, zona);
          return;
        }
      } else if (fase === 'pausa') {
        espera -= dt;
        if (espera <= 0) siguiente();
      }

      bola.malla.position.copy(bola.pos);
      ajustarSombra(sombraBola, bola.malla, 0.05, 6);
      bate.position.set(1.1 - (swing > 0 ? 1.1 : 0), 1.1, 6.2);
      bate.rotation.y = swing > 0 ? -1.4 : -0.2;
      lanzador.position.z = -12 + (fase === 'volando' && soltada < 0.2 ? 0.6 : 0);
      bateador.children[0].material.color.set(players[bateando].color);
      lanzador.children[0].material.color.set(players[1 - bateando].color);

      panel.centro(fase === 'pausa'
        ? mensaje
        : `batea <b style="color:${players[bateando].color}">${players[bateando].name}</b> · outs ${outs}/${OUTS}`);
      panel.sub(fase === 'eligiendo'
        ? `${players[1 - bateando].name} elige lanzamiento: <b style="color:${TIPOS[tipo].color}">${TIPOS[tipo].nombre}</b> (←/→ y tu tecla)`
        : mensaje || 'el bateador solo ve la bola salir');
      panel.pie('El lanzador elige tipo · el bateador batea con su tecla en el momento justo');
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
