/**
 * Lanzamiento de Martillo — coger velocidad es fácil; soltar en el sector, no.
 *
 * El martillo gira alrededor del atleta y solo acelera si empujas cuando pasa
 * por la zona marcada: la fuerza se mete en un punto concreto del giro, no en
 * todo el giro. Empujar fuera de esa zona frena, así que machacar es la peor
 * estrategia posible.
 *
 * Al soltar, el martillo sale POR LA TANGENTE, no hacia donde miras. Eso es lo
 * que hace que un lanzamiento rapidísimo se vaya fuera del sector y valga cero:
 * hay que soltar un cuarto de vuelta antes de donde el instinto pide.
 */

import { crearMundo, crearPanel, suelo, mat, caja, esfera, cilindro, gradas, sombraContacto, ajustarSombra, THREE } from '../../core/tres.js';
import { cuerpo, integrar, G } from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const INTENTOS = 3;
const RADIO = 1.9;             // largo del cable
const SECTOR = 0.61;           // media apertura del sector válido (35°)
const ZONA = 0.7;              // media apertura de la zona donde se empuja
const ELEVACION = 0.72;        // ángulo de salida, fijo y realista (41°)

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#4a6a9a', horizonte: '#a8c0c8', sol: 2.6, solPos: [20, 32, 14],
    sombraArea: 30, fov: 48, niebla: 0.004, lejos: 600,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#4a7a44', veta: '#3f6b3a', repite: 90, tam: 500 });
  gradas(mundo, { filas: 3, porFila: 26, radio: 24, alturaBase: 1.6 });

  // Círculo de lanzamiento y jaula.
  const circulo = new THREE.Mesh(
    new THREE.CircleGeometry(1.07, 28),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#cfcfd4'), roughness: 0.9 }),
  );
  circulo.rotation.x = -Math.PI / 2;
  circulo.position.y = 0.02;
  circulo.receiveShadow = true;
  mundo.escena.add(circulo);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.45 + (i / 6) * Math.PI * 1.1;
    mundo.escena.add(cilindro(0.06, 0.06, 5, mat('#8a8a95'), [Math.cos(a) * 3.4, 2.5, Math.sin(a) * 3.4]));
  }

  // Líneas del sector válido, que es la información más importante en pantalla.
  for (const s of [-1, 1]) {
    const linea = caja(0.12, 0.02, 90, mat('#f2f2f2'), [0, 0.03, -45]);
    linea.rotation.y = s * SECTOR;
    mundo.escena.add(linea);
  }
  for (let m = 20; m <= 80; m += 20) {
    const arco = new THREE.Mesh(
      new THREE.RingGeometry(m - 0.12, m + 0.12, 64, 1, Math.PI / 2 - SECTOR, SECTOR * 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff'), transparent: true, opacity: 0.35 }),
    );
    arco.rotation.x = -Math.PI / 2;
    arco.position.y = 0.04;
    mundo.escena.add(arco);
  }

  const atleta = new THREE.Group();
  const tronco = cilindro(0.36, 0.4, 1.6, mat(players[0].color, { rug: 0.65 }), [0, 0.8, 0]);
  atleta.add(tronco, esfera(0.26, mat('#e0b890'), [0, 1.8, 0], 14));
  mundo.escena.add(atleta);

  const bola = cuerpo({ x: RADIO, y: 1.2, z: 0, r: 0.36, masa: 7 });
  bola.malla = esfera(0.36, mat('#4a4a55', { rug: 0.4, met: 0.7 }), [RADIO, 1.2, 0], 20);
  mundo.escena.add(bola.malla);
  const cable = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xd8d8e0 }),
  );
  mundo.escena.add(cable);
  const sombra = sombraContacto(0.4, 0.3);
  mundo.escena.add(sombra);

  let turno = 0, intento = [1, 1], mejor = [0, 0];
  let fase = 'girando', ang = 0, omega = 2.2, vueltas = 0, reloj = 0;
  let marca = 0, nulo = false, marcador = null, acabado = false, aviso = 'Empuja al pasar por la zona';

  mundo.camara.position.set(7, 4, 8);
  mundo.camara.lookAt(0, 1.4, -6);

  function preparar() {
    fase = 'girando';
    ang = 0; omega = 2.2; vueltas = 0; reloj = 0;
    marca = 0; nulo = false;
    bola.vel.set(0, 0, 0);
    bola.quieto = false;
    aviso = 'Empuja al pasar por la zona marcada';
    tronco.material.color.set(players[turno].color);
  }

  /**
   * ¿El martillo está en la zona donde se puede empujar? Es el arco de delante
   * del atleta, media vuelta antes del punto de soltada: así empujar y soltar
   * son dos momentos distintos del mismo giro y no una sola tecla repetida.
   */
  function enZona() {
    const d = Math.atan2(Math.sin(ang), Math.cos(ang));
    return Math.abs(d) < ZONA;
  }

  function soltar() {
    // Tangente al giro: derivada de (cos, sin), o sea (-sin, cos). Por eso la
    // bola sale hacia el campo cuando está a la izquierda del atleta y no
    // cuando apunta al campo.
    const tx = -Math.sin(ang), tz = Math.cos(ang);
    const v = omega * RADIO;
    const horizontal = v * Math.cos(ELEVACION);
    bola.pos.set(Math.cos(ang) * RADIO, 1.6, Math.sin(ang) * RADIO);
    bola.vel.set(tx * horizontal, v * Math.sin(ELEVACION), tz * horizontal);
    bola.quieto = false;
    fase = 'vuelo';
    audio.swoosh();
    haptics.impact(turno, 1);
  }

  function aterrizar() {
    const d = Math.hypot(bola.pos.x, bola.pos.z);
    // Fuera del sector = nulo, por muy lejos que haya caído.
    const desvio = Math.abs(Math.atan2(bola.pos.x, -bola.pos.z));
    nulo = desvio > SECTOR;
    marca = nulo ? 0 : d;
    fase = 'juzgar';
    reloj = 0;
    if (nulo) {
      audio.error();
      haptics.error(turno);
      aviso = `Nulo: se fue ${Math.round((desvio - SECTOR) * 57)}° fuera del sector`;
    } else {
      mejor[turno] = Math.max(mejor[turno], marca);
      audio.thud();
      haptics.play('heavy');
      aviso = `${marca.toFixed(2)} m`;
    }
    marcador?.update(mejor[0].toFixed(1), mejor[1].toFixed(1));
  }

  function siguiente() {
    intento[turno]++;
    if (intento[0] > INTENTOS && intento[1] > INTENTOS) return rematar();
    if (intento[1 - turno] <= INTENTOS) turno = 1 - turno;
    preparar();
  }

  function rematar() {
    acabado = true;
    const gan = Math.abs(mejor[0] - mejor[1]) < 0.01 ? -1 : mejor[0] > mejor[1] ? 0 : 1;
    audio.win();
    if (gan >= 0) haptics.victory(gan);
    ctx.finish({
      winner: gan,
      scores: [+mejor[0].toFixed(2), +mejor[1].toFixed(2)],
      detail: gan < 0 ? 'Empate' : `${players[gan].name} lanza a ${mejor[gan].toFixed(2)} m`,
      record: ctx.record('metros', +Math.max(mejor[0], mejor[1]).toFixed(2), 'high'),
    });
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `${INTENTOS} lanzamientos` });
      preparar();
    },

    update(dt) {
      if (acabado) return;
      reloj += dt;
      const pl = input.player(turno);

      if (fase === 'girando') {
        const antes = ang;
        ang += omega * dt;
        if (Math.floor(ang / (Math.PI * 2)) > Math.floor(antes / (Math.PI * 2))) vueltas++;
        omega = Math.max(1.4, omega - 0.28 * dt);

        if (pl.pressed('a')) {
          if (enZona()) {
            omega += 1.15;
            audio.tone({ freq: 140 + omega * 30, dur: 0.06, gain: 0.12, type: 'sawtooth' });
            haptics.play('tick', { player: turno });
          } else {
            omega = Math.max(1.4, omega * 0.78);
            audio.error();
            haptics.play('tap', { player: turno });
          }
        }
        if (pl.pressed('b')) {
          if (vueltas < 1) { aviso = 'Da al menos una vuelta antes de soltar'; audio.blip(); }
          else soltar();
        }
        // A partir de cierta velocidad ya no se sostiene: se va solo.
        if (omega > 13) { aviso = 'Se te va de las manos'; soltar(); }

        bola.pos.set(Math.cos(ang) * RADIO, 1.2 + Math.sin(ang * 2) * 0.12, Math.sin(ang) * RADIO);
        atleta.rotation.y = -ang;
      } else if (fase === 'vuelo') {
        integrar(bola, dt, { arrastre: 0.012 });
        if (bola.pos.y <= bola.r) { bola.pos.y = bola.r; aterrizar(); }
      } else if (fase === 'juzgar') {
        if (reloj > 2.2) siguiente();
      }

      bola.malla.position.copy(bola.pos);
      ajustarSombra(sombra, bola.malla, 0, 12);
      const puntos = fase === 'girando'
        ? [new THREE.Vector3(0, 1.3, 0), bola.pos.clone()]
        : [new THREE.Vector3(), new THREE.Vector3()];
      cable.geometry.setFromPoints(puntos);

      const objetivo = fase === 'vuelo'
        ? new THREE.Vector3(bola.pos.x + 9, bola.pos.y + 6, bola.pos.z + 13)
        : new THREE.Vector3(7, 4.4, 9);
      mundo.camara.position.lerp(objetivo, Math.min(1, dt * 2.4));
      mundo.camara.lookAt(bola.pos.x * 0.4, 1.4, fase === 'vuelo' ? bola.pos.z : -8);

      const teorico = (omega * RADIO) ** 2 * Math.sin(2 * ELEVACION) / G;
      panel.centro(`<b style="color:${players[turno].color}">${players[turno].name}</b> · intento ${Math.min(intento[turno], INTENTOS)}/${INTENTOS} · ${aviso}`);
      panel.sub(fase === 'girando'
        ? `${vueltas} vueltas · ${(omega * RADIO).toFixed(1)} m/s ≈ ${teorico.toFixed(0)} m${enZona() ? ' · <b>¡ZONA!</b>' : ''}`
        : `mejores marcas: ${mejor[0].toFixed(2)} m — ${mejor[1].toFixed(2)} m`);
      panel.pie('tu tecla de acción empuja (solo dentro de la zona) · la especial suelta · sale por la tangente');
      panel.barra(fase === 'girando' ? Math.min(1, omega / 13) : null,
        enZona() ? '#a8ff3e' : players[turno].color);
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
