/**
 * Tenis de mesa — con bote, red y efecto de verdad.
 *
 * La bola vive en tres dimensiones: cae, pica en la mesa perdiendo altura y
 * puede quedarse en la red. Las reglas van con eso — tu golpe tiene que picar
 * en el campo contrario, y si pica dos veces ahí, el punto es tuyo.
 *
 * El efecto es la sal. Golpeando con arriba pulsado sale liftada (baja antes y
 * salta hacia delante al picar) y con abajo sale cortada (flota más y frena al
 * botar). Contra una cortada bien puesta, devolver plano se va largo.
 */

import { crearMundo, crearPanel, mat, caja, cilindro, esfera, texturaGrano, sombraContacto, THREE } from '../../core/tres.js';
import * as F from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: false };

const MX = 3.8;            // media anchura de la mesa
const MZ = 6.8;            // media longitud
const MESA_Y = 0;
const RED = 0.62;
const BR = 0.19;           // radio de la bola
const PUNTOS = 7;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#0a0d14', horizonte: '#1e2a3c', sol: 2.3, solPos: [8, 20, 6],
    sombraArea: 14, fov: 40, niebla: 0.008,
  });
  const panel = crearPanel(ctx.root);

  // Cámara de televisión: desde un costado y alto, con las dos mitades a la vista.
  mundo.camara.position.set(9.5, 9.5, 13.5);
  mundo.camara.lookAt(0, 0.6, 0);

  /* ---------------- Mesa ---------------- */

  const tablero = new THREE.Mesh(
    new THREE.BoxGeometry(MX * 2, 0.35, MZ * 2),
    new THREE.MeshStandardMaterial({
      map: texturaGrano('#12508c', '#0d3f70', { repite: 3, ruido: 0.035 }), roughness: 0.42,
    }),
  );
  tablero.position.y = MESA_Y - 0.175;
  tablero.receiveShadow = true;
  mundo.escena.add(tablero);

  const raya = (an, fo, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(an, fo), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, MESA_Y + 0.006, z);
    mundo.escena.add(m);
  };
  raya(MX * 2, 0.09, 0, -MZ + 0.05); raya(MX * 2, 0.09, 0, MZ - 0.05);
  raya(0.09, MZ * 2, -MX + 0.05, 0); raya(0.09, MZ * 2, MX - 0.05, 0);
  raya(0.06, MZ * 2, 0, 0);

  const red = new THREE.Mesh(
    new THREE.PlaneGeometry(MX * 2 + 0.6, RED),
    new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.9, transparent: true, opacity: 0.72, side: THREE.DoubleSide }),
  );
  red.position.set(0, MESA_Y + RED / 2, 0);
  mundo.escena.add(red);
  const cintaRed = caja(MX * 2 + 0.7, 0.07, 0.05, mat('#f0f0f4', { rug: 0.7 }), [0, MESA_Y + RED, 0]);
  mundo.escena.add(cintaRed);

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    mundo.escena.add(caja(0.3, 4, 0.3, mat('#20242c', { rug: 0.5, met: 0.4 }), [sx * (MX - 0.5), -2.2, sz * (MZ - 0.6)]));
  }
  mundo.escena.add(caja(40, 0.4, 40, mat('#151a24', { rug: 1 }), [0, -4.4, 0]));

  /* ---------------- Palas ---------------- */

  function crearPala(color) {
    const g = new THREE.Group();
    const madera = cilindro(0.95, 0.95, 0.09, mat('#c98a4a', { rug: 0.6 }), [0, 0, 0], 22);
    madera.rotation.x = Math.PI / 2;
    const goma = cilindro(0.9, 0.9, 0.05, mat(color, { rug: 0.9 }), [0, 0, 0.07], 22);
    goma.rotation.x = Math.PI / 2;
    const mango = caja(0.28, 0.9, 0.16, mat('#3a2415', { rug: 0.7 }), [0, -1.3, 0]);
    g.add(madera, goma, mango);
    g.castShadow = true;
    mundo.escena.add(g);
    return g;
  }

  const palas = [0, 1].map((i) => ({
    malla: crearPala(players[i].color),
    x: 0,
    z: (i === 0 ? 1 : -1) * (MZ + 1.6),
    swing: 0,
  }));

  /* ---------------- Bola ---------------- */

  const bola = F.cuerpo({ y: 2, r: BR, masa: 0.0027 });
  bola.malla = esfera(BR, mat('#f7f3d8', { rug: 0.5 }), [0, 2, 0], 14);
  mundo.escena.add(bola.malla);
  const sombra = sombraContacto(BR * 2, 0.35);
  mundo.escena.add(sombra);
  let efecto = 0;            // >0 liftada, <0 cortada

  /* ---------------- Estado ---------------- */

  const puntos = [0, 0];
  let saca = 0;
  let ultimoGolpe = -1;
  let botes = 0;
  let fase = 'saque';         // saque | juego | punto
  let espera = 0;
  let aviso = '', avisoT = 0;
  let marcador = null;
  let acabado = false;

  const decir = (t, s = 1.8) => { aviso = t; avisoT = s; };
  const ladoDe = (j) => (j === 0 ? 1 : -1);

  function preparaSaque() {
    fase = 'saque';
    ultimoGolpe = -1;
    botes = 0;
    efecto = 0;
    bola.pos.set(palas[saca].x, 1.6, ladoDe(saca) * (MZ - 1.2));
    bola.vel.set(0, 0, 0);
    bola.malla.position.copy(bola.pos);
  }

  function punto(j, razon) {
    if (fase === 'punto' || acabado) return;
    puntos[j]++;
    marcador?.update(puntos[0], puntos[1]);
    audio.score(j);
    haptics.score(j);
    decir(`${razon} · punto para ${players[j].name}`, 2);
    fase = 'punto';
    espera = 1.5;
    // Saca quien recibió: cambio de servicio en cada punto.
    saca = 1 - saca;
    if (puntos[j] >= PUNTOS) {
      acabado = true;
      setTimeout(() => ctx.finish({
        winner: j,
        scores: [puntos[0], puntos[1]],
        detail: `${puntos[0]} — ${puntos[1]} en la mesa`,
      }), 900);
    }
  }

  /** Golpe de pala: dirección según dónde le des y qué tecla tengas pulsada. */
  function golpear(j) {
    const p = palas[j];
    const d = Math.hypot(bola.pos.x - p.x, bola.pos.z - p.z);
    if (d > 2.2 || Math.abs(bola.pos.y) > 3.4) return false;

    const hacia = -ladoDe(j);
    const entrada = input.player(j);
    const lift = entrada.held('up') ? 1 : entrada.held('down') ? -1 : 0;
    efecto = lift;

    // Cuanto más descentrada le das, más ángulo sale.
    const desvio = (bola.pos.x - p.x) * 0.9;
    const potencia = 11 + Math.random() * 1.5 + (lift > 0 ? 2.5 : lift < 0 ? -1.5 : 0);
    bola.vel.set(desvio, 2.2 + (lift < 0 ? 1.6 : lift > 0 ? -0.4 : 0.6), hacia * potencia);
    ultimoGolpe = j;
    botes = 0;
    p.swing = 1;
    audio.tone({ freq: 900 + Math.random() * 200, dur: 0.045, gain: 0.16, type: 'square', sweep: -400 });
    haptics.tap(j);
    if (fase === 'saque') fase = 'juego';
    return true;
  }

  function paso(dt) {
    const SUB = 5, s = dt / SUB;
    for (let k = 0; k < SUB; k++) {
      // Magnus simplificado: la liftada baja antes, la cortada flota.
      bola.vel.y -= efecto * 7 * s;
      F.integrar(bola, s, { gravedad: 9.81, arrastre: 0.22 });

      // Red: si la toca por debajo de la cinta, se queda ahí.
      if (Math.abs(bola.pos.z) < BR + 0.06 && bola.pos.y < MESA_Y + RED && Math.abs(bola.vel.z) > 0.2) {
        if (bola.pos.y > MESA_Y + RED - 0.12 && Math.random() < 0.5) {
          // Roza la cinta: pasa muerta al otro lado. Suerte pura, como en la mesa.
          bola.vel.z *= 0.45; bola.vel.y = 1.4;
          audio.tick();
        } else {
          bola.vel.z *= -0.18;
          bola.vel.y *= 0.4;
          audio.tone({ freq: 200, dur: 0.06, gain: 0.1, type: 'triangle' });
          if (ultimoGolpe >= 0) { punto(1 - ultimoGolpe, 'A la red'); return; }
        }
      }

      const enMesa = Math.abs(bola.pos.x) < MX && Math.abs(bola.pos.z) < MZ;
      if (enMesa && bola.pos.y - BR <= MESA_Y && bola.vel.y < 0) {
        bola.pos.y = MESA_Y + BR;
        bola.vel.y = -bola.vel.y * 0.78;
        // El efecto se descarga en el bote: liftada acelera, cortada frena.
        bola.vel.z *= 1 + efecto * 0.12;
        efecto *= 0.4;
        audio.tone({ freq: 1500, dur: 0.03, gain: 0.1, type: 'square' });
        const lado = Math.sign(bola.pos.z);
        if (ultimoGolpe < 0) {
          // Todavía es el saque: si la bola bota dos veces sin que nadie le dé,
          // el saque se ha perdido y el punto es del que recibe.
          botes++;
          if (botes >= 2) { punto(1 - saca, 'Saque fallado'); return; }
        } else {
          if (lado === ladoDe(ultimoGolpe)) { punto(1 - ultimoGolpe, 'Picó en su campo'); return; }
          botes++;
          if (botes >= 2) { punto(ultimoGolpe, 'Doble bote'); return; }
        }
      }

      if (bola.pos.y < -4) {
        if (ultimoGolpe < 0) { punto(1 - saca, 'Saque fallado'); return; }
        punto(botes >= 1 ? ultimoGolpe : 1 - ultimoGolpe, botes >= 1 ? 'Sin devolver' : 'Fuera');
        return;
      }
    }
    bola.malla.position.copy(bola.pos);
    bola.malla.rotation.x += dt * 12;
  }

  function mover(j, dt) {
    const p = palas[j];
    const e = input.player(j);
    // Al jugador de enfrente se le invierte la izquierda: cada uno juega desde
    // su lado aunque la cámara sea la misma.
    const signo = j === 0 ? 1 : -1;
    const v = 11;
    if (e.held('left')) p.x -= v * dt * signo;
    if (e.held('right')) p.x += v * dt * signo;
    p.x = Math.max(-MX - 1, Math.min(MX + 1, p.x));
    // La pala se adelanta un poco al golpear.
    p.swing = Math.max(0, p.swing - dt * 4);
    p.malla.position.set(p.x, MESA_Y + 1.1, p.z - ladoDe(j) * p.swing * 1.2);
    p.malla.rotation.y = j === 0 ? 0 : Math.PI;
    p.malla.rotation.x = -0.35 - p.swing * 0.5;

    if (e.pressed('a')) {
      if (fase === 'saque' && j === saca) {
        // Saque: primero se lanza la bola al aire y el mismo botón la golpea.
        if (bola.vel.lengthSq() < 0.01) {
          bola.vel.set(0, 5.4, 0);
          audio.blip();
        } else golpear(j);
      } else if (fase === 'juego') {
        if (!golpear(j)) { p.swing = 0.6; audio.tone({ freq: 300, dur: 0.04, gain: 0.05, type: 'sine' }); }
      }
    }
  }

  function pintarPanel() {
    panel.centro(avisoT > 0 ? aviso : `${puntos[0]} — ${puntos[1]}`);
    panel.sub(fase === 'saque'
      ? `Saca ${players[saca].name}: acción para lanzar y otra vez para golpear`
      : `Efecto: ↑ liftada · ↓ cortada`);
    panel.pie('← → mover la pala · acción: golpear · el saque cambia en cada punto');
    panel.barra(null);
  }

  return {
    init() {
      preparaSaque();
      marcador = ctx.ui.scoreboard({ center: `a ${PUNTOS}` });
      marcador.update(0, 0);
    },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      if (acabado) { mundo.dibujar(); return; }

      mover(0, dt);
      mover(1, dt);

      if (fase === 'juego' || (fase === 'saque' && bola.vel.lengthSq() > 0.01)) paso(dt);
      else if (fase === 'punto') {
        espera -= dt;
        if (espera <= 0) preparaSaque();
      }

      sombra.position.set(bola.pos.x, MESA_Y + 0.01, bola.pos.z);
      const alt = Math.max(0, bola.pos.y);
      sombra.scale.setScalar(Math.max(0.35, 1 - alt / 6));
      sombra.visible = Math.abs(bola.pos.x) < MX && Math.abs(bola.pos.z) < MZ;

      pintarPanel();
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
