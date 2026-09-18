/**
 * Futbolín — dos barras por jugador, a la vez, hasta cinco goles.
 *
 * Cada uno maneja su defensa y su delantera: se cambia de barra con la tecla
 * especial, se desliza con izquierda y derecha, y se chuta con la de acción.
 * El golpe no es instantáneo — los muñecos giran durante un cuarto de segundo,
 * así que hay que anticiparse a por dónde va a pasar la bola.
 *
 * La bola rueda con rozamiento de fórmica, rebota en las bandas y sale
 * despedida cuando la pilla un muñeco girando. Las paredes del fondo tienen un
 * hueco: la portería.
 */

import { crearMundo, crearPanel, mat, caja, cilindro, esfera, texturaGrano, THREE } from '../../core/tres.js';
import * as F from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: false };

const LX = 4.6;            // media anchura de la mesa
const LZ = 8;              // media longitud
const PORTERIA = 1.5;      // media anchura de la portería
const BOLA_R = 0.3;
const FIG_R = 0.42;
const GOLES = 5;

/** Barras: z, muñecos (desplazamiento respecto al centro de la barra) y dueño. */
const BARRAS = [
  { z: -6.0, figuras: [-1.9, 0, 1.9], jugador: 0, recorrido: 2.0, nombre: 'defensa' },
  { z: -1.4, figuras: [-2.6, 0, 2.6], jugador: 0, recorrido: 1.6, nombre: 'delantera' },
  { z: 1.4, figuras: [-2.6, 0, 2.6], jugador: 1, recorrido: 1.6, nombre: 'delantera' },
  { z: 6.0, figuras: [-1.9, 0, 1.9], jugador: 1, recorrido: 2.0, nombre: 'defensa' },
];

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#0c0f16', horizonte: '#243046', sol: 2.4, solPos: [6, 24, 8],
    sombraArea: 14, fov: 40, niebla: 0.006,
  });
  const panel = crearPanel(ctx.root);

  mundo.camara.position.set(0, 15.5, 12.5);
  mundo.camara.lookAt(0, 0, 0);

  /* ---------------- Mesa ---------------- */

  const campo = new THREE.Mesh(
    new THREE.BoxGeometry(LX * 2, 0.4, LZ * 2),
    new THREE.MeshStandardMaterial({
      map: texturaGrano('#1f7a45', '#186236', { repite: 4, ruido: 0.05 }), roughness: 0.55,
    }),
  );
  campo.position.y = -0.2;
  campo.receiveShadow = true;
  mundo.escena.add(campo);

  // Marcas del campo, en blanco tenue.
  const marca = (an, fo, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(an, fo), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    mundo.escena.add(m);
  };
  marca(LX * 2, 0.08, 0, 0);
  const circulo = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.58, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, side: THREE.DoubleSide }));
  circulo.rotation.x = -Math.PI / 2;
  circulo.position.y = 0.012;
  mundo.escena.add(circulo);
  for (const s of [-1, 1]) marca(3.4, 0.08, 0, s * (LZ - 1.6));

  const matMadera = mat('#6b4526', { rug: 0.6 });
  for (const s of [-1, 1]) {
    mundo.escena.add(caja(0.6, 1.5, LZ * 2 + 1.2, matMadera, [s * (LX + 0.3), 0.55, 0]));
    // Fondo con hueco de portería: tres cajas dejan el vano en el centro.
    const ala = (LX * 2 - PORTERIA * 2) / 2;
    for (const t of [-1, 1]) {
      mundo.escena.add(caja(ala, 1.5, 0.6, matMadera, [t * (PORTERIA + ala / 2), 0.55, s * (LZ + 0.3)]));
    }
    mundo.escena.add(caja(PORTERIA * 2, 0.7, 0.6, mat('#1a1a22', { rug: 0.9 }), [0, 1.1, s * (LZ + 0.3)]));
    // Red de la portería, insinuada.
    const red = new THREE.Mesh(new THREE.PlaneGeometry(PORTERIA * 2, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, side: THREE.DoubleSide }));
    red.position.set(0, 0.5, s * (LZ + 0.55));
    mundo.escena.add(red);
  }
  // Patas.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    mundo.escena.add(caja(0.7, 4, 0.7, mat('#3d2515'), [sx * (LX - 0.2), -2.2, sz * (LZ - 0.4)]));
  }

  /* ---------------- Barras y muñecos ---------------- */

  const barras = BARRAS.map((b, i) => {
    const grupo = new THREE.Group();
    grupo.position.z = b.z;
    // La barra va a la altura justa para que los pies de los muñecos rocen el
    // tablero: más arriba y la bola les pasaría por debajo.
    const eje = cilindro(0.09, 0.09, LX * 2 + 3, mat('#c8ccd4', { rug: 0.3, met: 0.8 }), [0, 1.45, 0], 10);
    eje.rotation.z = Math.PI / 2;
    mundo.escena.add(eje);
    const figuras = b.figuras.map((off) => {
      const f = new THREE.Group();
      const cuerpo = caja(0.42, 0.9, 0.34, mat(players[b.jugador].color, { rug: 0.4 }), [0, -0.45, 0]);
      const cabeza = esfera(0.22, mat('#f0c9a0', { rug: 0.7 }), [0, 0.1, 0], 10);
      const piernas = caja(0.5, 0.55, 0.3, mat('#20242c', { rug: 0.6 }), [0, -1.15, 0]);
      f.add(cuerpo, cabeza, piernas);
      f.position.set(off, 1.45, 0);
      grupo.add(f);
      return f;
    });
    mundo.escena.add(grupo);
    return { ...b, i, grupo, eje, figuras, desliz: 0, giro: 0, golpe: 0 };
  });

  /* ---------------- Bola ---------------- */

  const bola = F.cuerpo({ y: BOLA_R, r: BOLA_R, masa: 1 });
  bola.malla = esfera(BOLA_R, mat('#f2f2ee', { rug: 0.35 }), [0, BOLA_R, 0], 18);
  mundo.escena.add(bola.malla);

  /* ---------------- Estado ---------------- */

  const activa = [1, 2];      // índice de barra activa por jugador
  const goles = [0, 0];
  let saque = 0;
  let espera = 0;
  let aviso = '', avisoT = 0;
  let marcador = null;
  let acabado = false;

  const decir = (t, s = 1.8) => { aviso = t; avisoT = s; };

  function sacar(hacia) {
    bola.pos.set((Math.random() - 0.5) * 2, BOLA_R, 0);
    bola.vel.set((Math.random() - 0.5) * 3, 0, hacia * 3.5);
    bola.malla.position.copy(bola.pos);
    espera = 0.7;
  }

  function gol(jugador) {
    goles[jugador]++;
    marcador?.update(goles[0], goles[1]);
    audio.score(jugador);
    haptics.score(jugador);
    ctx.shake?.(8, 10);
    decir(`¡GOL de ${players[jugador].name}!`, 2.2);
    if (goles[jugador] >= GOLES) {
      acabado = true;
      ctx.finish({
        winner: jugador,
        scores: [goles[0], goles[1]],
        detail: `${goles[0]} — ${goles[1]} en la mesa`,
      });
      return;
    }
    sacar(jugador === 0 ? -1 : 1);
  }

  /** Choque de la bola con un muñeco, con el extra de estar chutando. */
  function chocarFigura(barra, xFig) {
    const dx = bola.pos.x - xFig;
    const dz = bola.pos.z - barra.z;
    const d = Math.hypot(dx, dz);
    const min = BOLA_R + FIG_R;
    if (d >= min || d < 1e-5) return;
    const nx = dx / d, nz = dz / d;
    bola.pos.x = xFig + nx * min;
    bola.pos.z = barra.z + nz * min;
    const vn = bola.vel.x * nx + bola.vel.z * nz;
    if (vn < 0) {
      bola.vel.x -= 1.5 * vn * nx;
      bola.vel.z -= 1.5 * vn * nz;
    }
    if (barra.golpe > 0) {
      // Chut: el muñeco está girando y empuja hacia la portería contraria.
      const hacia = barra.jugador === 0 ? 1 : -1;
      bola.vel.z += hacia * 15 * barra.golpe;
      bola.vel.x += nx * 4;
      audio.tone({ freq: 240, dur: 0.07, gain: 0.2, type: 'square', sweep: -120 });
      haptics.impact(barra.jugador, 0.8);
      barra.golpe = 0;
    } else {
      audio.tone({ freq: 420, dur: 0.04, gain: 0.1, type: 'triangle' });
    }
  }

  function paso(dt) {
    const SUB = 5, s = dt / SUB;
    for (let k = 0; k < SUB; k++) {
      F.integrar(bola, s, { gravedad: 0 });
      F.rodar(bola, s, { friccion: 0.5, umbral: 0.05 });
      // Bandas laterales.
      if (bola.pos.x - BOLA_R < -LX) { bola.pos.x = -LX + BOLA_R; bola.vel.x = Math.abs(bola.vel.x) * 0.72; }
      if (bola.pos.x + BOLA_R > LX) { bola.pos.x = LX - BOLA_R; bola.vel.x = -Math.abs(bola.vel.x) * 0.72; }
      // Fondos: pared salvo en la boca de la portería.
      for (const sgn of [-1, 1]) {
        const enBoca = Math.abs(bola.pos.x) < PORTERIA;
        if (sgn > 0 ? bola.pos.z + BOLA_R > LZ : bola.pos.z - BOLA_R < -LZ) {
          if (enBoca) { gol(sgn > 0 ? 0 : 1); return; }
          bola.pos.z = sgn > 0 ? LZ - BOLA_R : -LZ + BOLA_R;
          bola.vel.z *= -0.72;
        }
      }
      for (const b of barras) {
        for (const off of b.figuras) chocarFigura(b, b.desliz + off);
      }
    }
    F.rodarMalla(bola, dt);
    bola.malla.position.copy(bola.pos);

    // Si la bola se queda muerta en una esquina, se reactiva sola.
    if (Math.hypot(bola.vel.x, bola.vel.z) < 0.25) {
      bola.vel.x += (Math.random() - 0.5) * 0.6;
      bola.vel.z += (Math.random() - 0.5) * 0.6;
    }
  }

  function mandar(j, dt) {
    const p = input.player(j);
    if (p.pressed('b')) {
      // Cambiar de barra: entre las dos que tiene cada jugador.
      const suyas = barras.filter((b) => b.jugador === j).map((b) => b.i);
      activa[j] = suyas[(suyas.indexOf(activa[j]) + 1) % suyas.length];
      audio.blip();
    }
    const b = barras[activa[j]];
    // El jugador 2 ve el campo del revés: se le invierte el eje para que
    // izquierda sea izquierda desde su lado de la mesa.
    const signo = j === 0 ? 1 : -1;
    const v = 7.5;
    if (p.held('left')) b.desliz -= v * dt * signo;
    if (p.held('right')) b.desliz += v * dt * signo;
    b.desliz = Math.max(-b.recorrido, Math.min(b.recorrido, b.desliz));
    if (p.pressed('a')) {
      b.golpe = 1;
      b.giro = 1;
      audio.tone({ freq: 700, dur: 0.04, gain: 0.08, type: 'square' });
    }
  }

  function pintarPanel() {
    const na = barras[activa[0]].nombre, nb = barras[activa[1]].nombre;
    panel.centro(avisoT > 0 ? aviso : `${goles[0]} — ${goles[1]}`);
    panel.sub(`<span style="color:${players[0].color}">${players[0].name}: ${na}</span> · <span style="color:${players[1].color}">${players[1].name}: ${nb}</span>`);
    panel.pie('← → deslizar la barra · acción: chutar · especial: cambiar de barra');
    panel.barra(null);
  }

  return {
    init() {
      sacar(Math.random() < 0.5 ? 1 : -1);
      marcador = ctx.ui.scoreboard({ center: `a ${GOLES}` });
      marcador.update(0, 0);
    },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      if (acabado) { mundo.dibujar(); return; }

      mandar(0, dt);
      mandar(1, dt);

      for (const b of barras) {
        if (b.golpe > 0) b.golpe = Math.max(0, b.golpe - dt * 4);
        // El giro del muñeco se ve: sube el pie, golpea y vuelve.
        b.giro = Math.max(0, b.giro - dt * 3.4);
        const ang = Math.sin(b.giro * Math.PI) * (b.jugador === 0 ? -1 : 1) * 1.5;
        b.grupo.position.x = b.desliz;
        b.figuras.forEach((f) => { f.rotation.x = ang; });
      }

      if (espera > 0) { espera -= dt; } else { paso(dt); }
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
