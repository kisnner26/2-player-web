/**
 * Salto de Longitud — la tabla no perdona un centímetro.
 *
 * Tres intentos por cabeza y una decisión repetida: correr más rápido alarga el
 * salto, pero la tabla está donde está y llegar lanzado hace mucho más fácil
 * pasarse. Un nulo no vale nada, así que el salto bueno casi nunca es el más
 * veloz: es el que bate justo.
 *
 * El ángulo se elige en carrera. Los 45° de los libros de física no son la
 * respuesta aquí, porque batir muy alto cuesta velocidad: el óptimo real está
 * más abajo, y encontrarlo es parte del juego.
 */

import { crearMundo, crearPanel, suelo, mat, caja, esfera, cilindro, gradas, sombraContacto, ajustarSombra, THREE } from '../../core/tres.js';
import { cuerpo, integrar } from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const INTENTOS = 3;
const PISTA = 34;              // metros de carrera hasta la tabla
const TABLA_Z = 0;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#3a5a8a', horizonte: '#9ab8c8', sol: 2.7, solPos: [18, 30, 12],
    sombraArea: 26, fov: 46, niebla: 0.005,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#3f6a3f', veta: '#365c36', repite: 60 });
  gradas(mundo, { filas: 3, porFila: 24, radio: 26, alturaBase: 1.6 });

  // Pasillo, tabla de batida y foso de arena.
  mundo.escena.add(caja(2.6, 0.06, PISTA + 8, mat('#b2603c', { rug: 0.95 }), [0, 0.04, -PISTA / 2 - 2]));
  const tabla = caja(2.6, 0.08, 0.5, mat('#f2f2f2'), [0, 0.08, TABLA_Z]);
  mundo.escena.add(tabla);
  mundo.escena.add(caja(2.6, 0.04, 0.16, mat('#e8523c'), [0, 0.1, TABLA_Z + 0.3]));
  mundo.escena.add(caja(4.2, 0.1, 12, mat('#e0cf9a', { rug: 1 }), [0, 0.05, 6.5]));
  // Marcas de metro en el foso: la referencia para leer la distancia.
  for (let m = 2; m <= 11; m++) {
    mundo.escena.add(caja(4.2, 0.02, 0.03, mat(m % 5 === 0 ? '#c0392b' : '#c8b880'), [0, 0.11, m]));
  }

  const atleta = new THREE.Group();
  const tronco = cilindro(0.28, 0.32, 1.6, mat(players[0].color, { rug: 0.6 }), [0, 0.8, 0]);
  const cabeza = esfera(0.24, mat('#e0b890'), [0, 1.78, 0], 14);
  const pierna = caja(0.16, 0.85, 0.16, mat('#2a2a38'), [0, 0.42, 0]);
  atleta.add(tronco, cabeza, pierna);
  mundo.escena.add(atleta);
  const sombra = sombraContacto(0.4, 0.32);
  mundo.escena.add(sombra);

  const salto = cuerpo({ x: 0, y: 1, z: 0, r: 0.3 });

  let turno = 0, intento = [1, 1], mejor = [0, 0];
  let fase = 'carrera', z = -PISTA, vel = 0, ultima = '', cadencia = 0, angulo = 0.45;
  let reloj = 0, marca = 0, nulo = false;
  let marcador = null, acabado = false, aviso = 'Alterna ← y → para coger carrera';

  mundo.camara.position.set(6, 3, -PISTA + 8);
  mundo.camara.lookAt(0, 1, -PISTA + 2);

  function preparar() {
    fase = 'carrera';
    z = -PISTA; vel = 0; ultima = ''; cadencia = 0; angulo = 0.45;
    reloj = 0; marca = 0; nulo = false;
    aviso = 'Alterna ← y → para coger carrera';
    atleta.rotation.z = 0;
  }

  function batir() {
    // Distancia con signo a la tabla: positivo = pasado (nulo).
    const pisada = z - TABLA_Z;
    nulo = pisada > 0.12;
    fase = 'vuelo';
    salto.pos.set(0, 1, Math.min(z, TABLA_Z));
    // Batir alto cuesta velocidad horizontal: ese es el compromiso del salto.
    const merma = 1 - Math.sin(angulo) * 0.34;
    salto.vel.set(0, vel * Math.sin(angulo) * 0.95, vel * Math.cos(angulo) * merma);
    salto.quieto = false;
    audio.jump();
    haptics.impact(turno, 0.9);
    aviso = nulo ? '¡Nulo! Pisó pasada la tabla' : 'volando…';
  }

  function aterrizar() {
    marca = nulo ? 0 : Math.max(0, salto.pos.z - TABLA_Z);
    fase = 'juzgar';
    reloj = 0;
    if (!nulo) {
      mejor[turno] = Math.max(mejor[turno], marca);
      audio.thud();
      haptics.play('impact');
      aviso = `${marca.toFixed(2)} m`;
    } else {
      audio.error();
      haptics.error(turno);
    }
    marcador?.update(mejor[0].toFixed(2), mejor[1].toFixed(2));
  }

  function siguiente() {
    intento[turno]++;
    if (intento[0] > INTENTOS && intento[1] > INTENTOS) return rematar();
    if (intento[1 - turno] <= INTENTOS) turno = 1 - turno;
    tronco.material.color.set(players[turno].color);
    preparar();
  }

  function rematar() {
    acabado = true;
    const gan = Math.abs(mejor[0] - mejor[1]) < 0.005 ? -1 : mejor[0] > mejor[1] ? 0 : 1;
    audio.win();
    if (gan >= 0) haptics.victory(gan);
    ctx.finish({
      winner: gan,
      scores: [+mejor[0].toFixed(2), +mejor[1].toFixed(2)],
      detail: gan < 0 ? 'Empate al centímetro' : `${players[gan].name} salta ${mejor[gan].toFixed(2)} m`,
      record: ctx.record('metros', +Math.max(mejor[0], mejor[1]).toFixed(2), 'high'),
    });
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `${INTENTOS} intentos` });
      preparar();
    },

    update(dt) {
      if (acabado) return;
      reloj += dt;
      const pl = input.player(turno);

      if (fase === 'carrera') {
        let paso = false;
        if (pl.pressed('left') && ultima !== 'left') { ultima = 'left'; paso = true; }
        if (pl.pressed('right') && ultima !== 'right') { ultima = 'right'; paso = true; }
        if (paso) {
          const err = Math.abs(cadencia - 0.14);
          vel += err < 0.05 ? 1.5 : err < 0.11 ? 1 : 0.4;
          cadencia = 0;
          audio.tone({ freq: 280 + vel * 10, dur: 0.02, gain: 0.06, type: 'square' });
        }
        cadencia += dt;
        vel = Math.max(0, vel - (1.5 + vel * 0.2) * dt);
        z += vel * dt;

        if (pl.held('up')) angulo = Math.min(0.95, angulo + 0.8 * dt);
        if (pl.held('down')) angulo = Math.max(0.15, angulo - 0.8 * dt);
        if (pl.pressed('a')) batir();
        // Si se pasa de largo sin batir, nulo automático.
        else if (z > TABLA_Z + 1.2) { nulo = true; batir(); }

        atleta.position.set(0, 0, z);
        atleta.rotation.x = -Math.min(0.3, vel * 0.016);
        pierna.rotation.x = Math.sin(reloj * vel * 1.4) * 0.9;
      } else if (fase === 'vuelo') {
        integrar(salto, dt, { arrastre: 0.02 });
        atleta.position.set(0, Math.max(0, salto.pos.y - 0.9), salto.pos.z);
        atleta.rotation.x = -0.4 - Math.min(0.6, salto.vel.y * 0.05);
        pierna.rotation.x = 0.9;
        if (salto.pos.y <= 1) aterrizar();
      } else if (fase === 'juzgar') {
        if (reloj > 2) siguiente();
      }

      ajustarSombra(sombra, atleta, 0.06, 4);

      // Cámara: sigue de lado, y en el vuelo se abre para ver la caída.
      const foco = fase === 'carrera' ? z : salto.pos.z;
      const deseada = new THREE.Vector3(fase === 'vuelo' ? 8 : 6, fase === 'vuelo' ? 3.4 : 2.6, foco + 7);
      mundo.camara.position.lerp(deseada, Math.min(1, dt * 3));
      mundo.camara.lookAt(0, 1, foco + 1);

      panel.centro(`<b style="color:${players[turno].color}">${players[turno].name}</b> · intento ${Math.min(intento[turno], INTENTOS)}/${INTENTOS} · ${aviso}`);
      panel.sub(`${vel.toFixed(1)} m/s · ángulo ${Math.round(angulo * 57)}° · `
        + `a la tabla ${Math.max(0, TABLA_Z - z).toFixed(1)} m · mejores ${mejor[0].toFixed(2)} — ${mejor[1].toFixed(2)}`);
      panel.pie('alterna ← y → para correr · ↑ ↓ ajustan el ángulo de batida · tu tecla bate');
      panel.barra(fase === 'carrera' ? Math.min(1, vel / 11) : null, players[turno].color);
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
