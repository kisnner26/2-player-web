/**
 * Minigolf — seis hoyos, por turnos, al que menos golpes le cueste.
 *
 * Cada hoyo es un dato, no código: rectángulos de césped, tablones que hacen de
 * banda, rampas que empujan la bola y algún obstáculo redondo. Añadir un
 * recorrido nuevo es añadir una entrada a `HOYOS` y nada más.
 *
 * Dos detalles que se notan al jugar. Uno: la bola rebota en la madera
 * perdiendo energía, así que el tiro de banda existe y compensa. Dos: si llegas
 * al agujero demasiado fuerte, la bola da la vuelta al borde y sale — como en
 * un minigolf de verdad, meterla es también medir.
 */

import { crearMundo, crearPanel, mat, caja, cilindro, esfera, suelo, texturaGrano, THREE } from '../../core/tres.js';
import * as F from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const R = 0.22;
const MAX_GOLPES = 7;

/**
 * Recorridos. Coordenadas en el plano XZ, con la salida abajo (z negativo) y
 * el agujero arriba. `par` es solo informativo.
 */
const HOYOS = [
  {
    nombre: 'La recta', par: 2,
    verde: [{ x: 0, z: 0, an: 5, fo: 22 }],
    muros: [{ x: -2.7, z: 0, an: 0.4, fo: 22 }, { x: 2.7, z: 0, an: 0.4, fo: 22 },
      { x: 0, z: -11.2, an: 5.8, fo: 0.4 }, { x: 0, z: 11.2, an: 5.8, fo: 0.4 }],
    obstaculos: [], rampas: [],
    salida: [0, -9], hoyo: [0, 9],
  },
  {
    nombre: 'El codo', par: 3,
    verde: [{ x: 0, z: -4, an: 5, fo: 14 }, { x: 5, z: 4.5, an: 15, fo: 5 }],
    muros: [{ x: -2.7, z: -4, an: 0.4, fo: 14 }, { x: 2.7, z: -6.5, an: 0.4, fo: 9 },
      { x: 0, z: -11.2, an: 5.8, fo: 0.4 },
      { x: 0, z: 7.2, an: 5.8, fo: 0.4 }, { x: 6, z: 2, an: 11, fo: 0.4 },
      { x: 12.7, z: 4.5, an: 0.4, fo: 5.4 }, { x: 6, z: 7.2, an: 14, fo: 0.4 }],
    obstaculos: [], rampas: [],
    salida: [0, -9], hoyo: [11, 4.5],
  },
  {
    nombre: 'El molino', par: 3,
    verde: [{ x: 0, z: 0, an: 7, fo: 22 }],
    muros: [{ x: -3.7, z: 0, an: 0.4, fo: 22 }, { x: 3.7, z: 0, an: 0.4, fo: 22 },
      { x: 0, z: -11.2, an: 7.8, fo: 0.4 }, { x: 0, z: 11.2, an: 7.8, fo: 0.4 },
      { x: -1.6, z: 0, an: 3.6, fo: 0.5 }, { x: 2.4, z: 4, an: 2.6, fo: 0.5 }],
    obstaculos: [{ x: 0, z: -4, r: 0.9 }], rampas: [],
    salida: [0, -9], hoyo: [-2, 9],
  },
  {
    nombre: 'La cuesta', par: 3,
    verde: [{ x: 0, z: 0, an: 6, fo: 24 }],
    muros: [{ x: -3.2, z: 0, an: 0.4, fo: 24 }, { x: 3.2, z: 0, an: 0.4, fo: 24 },
      { x: 0, z: -12.2, an: 6.8, fo: 0.4 }, { x: 0, z: 12.2, an: 6.8, fo: 0.4 }],
    obstaculos: [{ x: -1.5, z: 2, r: 0.7 }, { x: 1.5, z: 6, r: 0.7 }],
    rampas: [{ x: 0, z: 0, an: 6, fo: 10, dir: [0, -1], fuerza: 3.4 }],
    salida: [0, -10], hoyo: [0, 10.5],
  },
  {
    // El pasillo y la isla solo se tocan por una pasarela de metro y medio:
    // aquí el tiro es de puntería, no de fuerza.
    nombre: 'La isla', par: 3,
    verde: [{ x: 0, z: -7, an: 5, fo: 10 }, { x: 0, z: 0.5, an: 1.5, fo: 7 }, { x: 0, z: 7, an: 8, fo: 8 }],
    muros: [{ x: -2.7, z: -7, an: 0.4, fo: 10 }, { x: 2.7, z: -7, an: 0.4, fo: 10 },
      { x: 0, z: -12.2, an: 5.8, fo: 0.4 },
      { x: -4.2, z: 7, an: 0.4, fo: 8 }, { x: 4.2, z: 7, an: 0.4, fo: 8 },
      { x: 0, z: 11.2, an: 8.8, fo: 0.4 }],
    obstaculos: [], rampas: [],
    salida: [0, -10], hoyo: [0, 8], agua: true,
  },
  {
    nombre: 'El zigzag', par: 4,
    verde: [{ x: 0, z: 0, an: 12, fo: 24 }],
    muros: [{ x: -6.2, z: 0, an: 0.4, fo: 24 }, { x: 6.2, z: 0, an: 0.4, fo: 24 },
      { x: 0, z: -12.2, an: 12.8, fo: 0.4 }, { x: 0, z: 12.2, an: 12.8, fo: 0.4 },
      { x: -2, z: -4, an: 8.4, fo: 0.5 }, { x: 2, z: 2, an: 8.4, fo: 0.5 },
      { x: -2, z: 8, an: 8.4, fo: 0.5 }],
    obstaculos: [{ x: 4.6, z: 6, r: 0.6 }],
    rampas: [{ x: -4, z: 10, an: 4, fo: 4, dir: [1, 0], fuerza: 2.2 }],
    salida: [-4.5, -10], hoyo: [5, 10.5],
  },
];

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#7fb5e8', horizonte: '#cfe4f5', sol: 2.8, solPos: [18, 30, 12],
    sombraArea: 22, fov: 42, niebla: 0.004, lejos: 400,
  });
  const panel = crearPanel(ctx.root);
  mundo.ambiente.intensity = 1.5;

  suelo(mundo, { color: '#3e7a34', veta: '#2f5f28', repite: 90, tam: 500 });

  const grupoHoyo = new THREE.Group();
  mundo.escena.add(grupoHoyo);

  const matCesped = new THREE.MeshStandardMaterial({
    map: texturaGrano('#4f9d3f', '#3d7c31', { repite: 6, ruido: 0.07 }), roughness: 1,
  });
  const matMadera = mat('#7a4b25', { rug: 0.6 });
  const matAgua = new THREE.MeshStandardMaterial({ color: 0x2a6fa8, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.85 });

  /* ---------------- Bola y banderín ---------------- */

  const bola = F.cuerpo({ r: R, masa: 1 });
  bola.malla = esfera(R, mat('#f8f8f4', { rug: 0.25 }), [0, R, 0], 18);
  mundo.escena.add(bola.malla);

  const bandera = new THREE.Group();
  bandera.add(cilindro(0.035, 0.035, 2.4, mat('#e8e8ee', { rug: 0.4 }), [0, 1.2, 0], 8));
  const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), mat('#ff3355', { rug: 0.9, lados: 'doble' }));
  tela.position.set(0.45, 2.1, 0);
  bandera.add(tela);
  mundo.escena.add(bandera);

  const flecha = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.9, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }),
  );
  flecha.rotation.x = Math.PI / 2;
  mundo.escena.add(flecha);

  /* ---------------- Estado ---------------- */

  let iHoyo = 0;
  let turno = 0;
  let fase = 'apuntar';          // apuntar | rodando | fin-hoyo
  let angulo = 0;
  let fuerza = 0;
  let cargando = false;
  let espera = 0;
  const golpes = [[], []];       // golpes por hoyo y jugador
  let golpesHoyo = 0;
  let ultimaSegura = new THREE.Vector3();
  let aviso = '';
  let avisoT = 0;
  let marcador = null;
  let acabado = false;

  const hoyo = () => HOYOS[iHoyo];
  const total = (j) => golpes[j].reduce((a, b) => a + b, 0);
  const decir = (t, s = 2) => { aviso = t; avisoT = s; };

  /* ---------------- Montaje del hoyo ---------------- */

  function montarHoyo() {
    grupoHoyo.clear();
    const h = hoyo();

    for (const v of h.verde) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(v.an, 0.4, v.fo), matCesped);
      m.position.set(v.x, -0.2, v.z);
      m.receiveShadow = true;
      grupoHoyo.add(m);
    }
    if (h.agua) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 26), matAgua);
      a.position.set(0, -0.35, 0);
      grupoHoyo.add(a);
    }
    for (const m of h.muros) {
      const b = caja(m.an, 0.7, m.fo, matMadera, [m.x, 0.25, m.z]);
      grupoHoyo.add(b);
    }
    for (const o of h.obstaculos) {
      const c = cilindro(o.r, o.r, 1.1, mat('#8b5a2b', { rug: 0.7 }), [o.x, 0.55, o.z], 16);
      grupoHoyo.add(c);
    }
    for (const r of h.rampas) {
      // Las rampas se ven como una franja más clara con flechitas.
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r.an, r.fo), new THREE.MeshStandardMaterial({
        color: 0x9ad76f, roughness: 1, transparent: true, opacity: 0.55,
      }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(r.x, 0.012, r.z);
      grupoHoyo.add(m);
      for (let i = -1; i <= 1; i++) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 3), mat('#ffffff', { rug: 0.8 }));
        f.rotation.x = -Math.PI / 2;
        f.rotation.z = -Math.atan2(r.dir[0], -r.dir[1]);
        f.position.set(r.x + i * r.an * 0.25, 0.05, r.z + i * 0.6);
        grupoHoyo.add(f);
      }
    }
    // Agujero: un cilindro negro hundido y el banderín al lado.
    const copa = cilindro(0.34, 0.34, 0.5, mat('#0a0a0c', { rug: 1 }), [h.hoyo[0], -0.18, h.hoyo[1]], 20);
    grupoHoyo.add(copa);
    const aroCopa = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 24), mat('#e8e8ee', { rug: 0.5 }));
    aroCopa.rotation.x = -Math.PI / 2;
    aroCopa.position.set(h.hoyo[0], 0.015, h.hoyo[1]);
    grupoHoyo.add(aroCopa);
    bandera.position.set(h.hoyo[0], 0, h.hoyo[1]);

    ponerEnSalida();
  }

  function ponerEnSalida() {
    const h = hoyo();
    bola.pos.set(h.salida[0], R, h.salida[1]);
    bola.vel.set(0, 0, 0);
    bola.quieto = false;
    ultimaSegura.copy(bola.pos);
    angulo = Math.atan2(h.hoyo[1] - h.salida[1], h.hoyo[0] - h.salida[0]);
    fuerza = 0;
    cargando = false;
    fase = 'apuntar';
  }

  /* ---------------- Física ---------------- */

  function enRect(x, z, r) {
    return x > r.x - r.an / 2 && x < r.x + r.an / 2 && z > r.z - r.fo / 2 && z < r.z + r.fo / 2;
  }

  /** Rebote contra un tablón: se busca el punto más cercano del rectángulo. */
  function chocarMuro(m) {
    const cx = Math.max(m.x - m.an / 2, Math.min(bola.pos.x, m.x + m.an / 2));
    const cz = Math.max(m.z - m.fo / 2, Math.min(bola.pos.z, m.z + m.fo / 2));
    let dx = bola.pos.x - cx, dz = bola.pos.z - cz;
    let d = Math.hypot(dx, dz);
    if (d >= R) return false;
    if (d < 1e-5) { dx = bola.pos.x - m.x; dz = bola.pos.z - m.z; d = Math.hypot(dx, dz) || 1; }
    const nx = dx / d, nz = dz / d;
    bola.pos.x = cx + nx * R;
    bola.pos.z = cz + nz * R;
    const vn = bola.vel.x * nx + bola.vel.z * nz;
    if (vn < 0) {
      bola.vel.x -= 1.72 * vn * nx;
      bola.vel.z -= 1.72 * vn * nz;
      if (Math.abs(vn) > 1.2) {
        audio.tone({ freq: 220, dur: 0.05, gain: Math.min(0.16, Math.abs(vn) * 0.02), type: 'triangle' });
      }
    }
    return true;
  }

  function paso(dt) {
    const h = hoyo();
    const SUB = 4, s = dt / SUB;
    for (let k = 0; k < SUB; k++) {
      for (const r of h.rampas) {
        if (enRect(bola.pos.x, bola.pos.z, r)) {
          bola.vel.x += r.dir[0] * r.fuerza * s;
          bola.vel.z += r.dir[1] * r.fuerza * s;
        }
      }
      F.integrar(bola, s, { gravedad: 0 });
      F.rodar(bola, s, { friccion: 0.85, umbral: 0.12 });
      for (const m of h.muros) chocarMuro(m);
      for (const o of h.obstaculos) {
        const d = Math.hypot(bola.pos.x - o.x, bola.pos.z - o.z);
        if (d < o.r + R && d > 1e-5) {
          const nx = (bola.pos.x - o.x) / d, nz = (bola.pos.z - o.z) / d;
          bola.pos.x = o.x + nx * (o.r + R);
          bola.pos.z = o.z + nz * (o.r + R);
          const vn = bola.vel.x * nx + bola.vel.z * nz;
          if (vn < 0) { bola.vel.x -= 1.6 * vn * nx; bola.vel.z -= 1.6 * vn * nz; audio.tone({ freq: 300, dur: 0.05, gain: 0.1, type: 'square' }); }
        }
      }

      // ¿Entra? Solo si llega con calma; si no, bordea el agujero y sale.
      const dh = Math.hypot(bola.pos.x - h.hoyo[0], bola.pos.z - h.hoyo[1]);
      const v = Math.hypot(bola.vel.x, bola.vel.z);
      if (dh < 0.3 && v < 4.2) { embocar(); return; }
      if (dh < 0.42 && v >= 4.2) {
        // Labio: la bola se desvía un poco y sigue. Duele, pero es lo justo.
        bola.vel.x *= 0.86; bola.vel.z *= 0.86;
      }
    }

    const enCesped = h.verde.some((v) => enRect(bola.pos.x, bola.pos.z, { ...v, an: v.an + R, fo: v.fo + R }));
    if (!enCesped) { fuera(); return; }

    F.rodarMalla(bola, dt);
    bola.malla.position.copy(bola.pos);

    if (Math.hypot(bola.vel.x, bola.vel.z) < 0.14) {
      bola.vel.set(0, 0, 0);
      ultimaSegura.copy(bola.pos);
      if (golpesHoyo >= MAX_GOLPES) { cerrarHoyo(false); return; }
      fase = 'apuntar';
      angulo = Math.atan2(h.hoyo[1] - bola.pos.z, h.hoyo[0] - bola.pos.x);
    }
  }

  function fuera() {
    golpesHoyo++;
    decir(hoyo().agua ? '¡Al agua! Un golpe de penalización' : 'Fuera de la calle: penalización', 2.2);
    audio.error();
    haptics.error(turno);
    bola.pos.copy(ultimaSegura);
    bola.vel.set(0, 0, 0);
    bola.malla.position.copy(bola.pos);
    if (golpesHoyo >= MAX_GOLPES) { cerrarHoyo(false); return; }
    fase = 'apuntar';
  }

  function embocar() {
    bola.vel.set(0, 0, 0);
    bola.pos.set(hoyo().hoyo[0], -0.1, hoyo().hoyo[1]);
    bola.malla.position.copy(bola.pos);
    audio.arp([660, 880, 1320], 0.07);
    haptics.score(turno);
    cerrarHoyo(true);
  }

  function cerrarHoyo(dentro) {
    const h = hoyo();
    golpes[turno].push(golpesHoyo);
    const dif = golpesHoyo - h.par;
    decir(!dentro ? `Máximo de golpes en ${h.nombre}`
      : dif <= -2 ? '¡ÁGUILA!' : dif === -1 ? '¡Birdie!' : dif === 0 ? 'Par' : `${dif} sobre par`, 2.4);
    marcador?.update(total(0), total(1));
    fase = 'fin-hoyo';
    espera = 1.8;
  }

  function siguiente() {
    golpesHoyo = 0;
    if (turno === 0) { turno = 1; montarHoyo(); return; }
    turno = 0;
    iHoyo++;
    if (iHoyo >= HOYOS.length) {
      acabado = true;
      const a = total(0), b = total(1);
      ctx.finish({
        winner: a === b ? -1 : (a < b ? 0 : 1),
        scores: [a, b],
        detail: `${HOYOS.length} hoyos · gana el que menos golpes hace`,
        record: ctx.record('golpes', Math.min(a, b), 'low'),
      });
      return;
    }
    montarHoyo();
  }

  /* ---------------- Presentación ---------------- */

  function moverCamara(dt) {
    const h = hoyo();
    // Detrás de la bola y mirando hacia el agujero: siempre se ve adónde vas.
    const haciaX = h.hoyo[0] - bola.pos.x, haciaZ = h.hoyo[1] - bola.pos.z;
    const d = Math.hypot(haciaX, haciaZ) || 1;
    const dist = 7 + Math.min(6, d * 0.35);
    const objetivo = new THREE.Vector3(
      bola.pos.x - (haciaX / d) * dist,
      6.5 + Math.min(4, d * 0.25),
      bola.pos.z - (haciaZ / d) * dist,
    );
    mundo.camara.position.lerp(objetivo, 1 - Math.exp(-2.6 * dt));
    mundo.camara.lookAt(bola.pos.x + haciaX * 0.35, 0.4, bola.pos.z + haciaZ * 0.35);
  }

  function pintarFlecha() {
    const ver = fase === 'apuntar' && !acabado;
    flecha.visible = ver;
    if (!ver) return;
    const largo = 1 + fuerza * 3;
    flecha.position.set(bola.pos.x + Math.cos(angulo) * (0.5 + largo * 0.5), 0.16, bola.pos.z + Math.sin(angulo) * (0.5 + largo * 0.5));
    flecha.rotation.z = -angulo - Math.PI / 2;
    flecha.scale.set(1, 0.6 + fuerza * 1.6, 1);
    flecha.material.color.setStyle(fuerza > 0.8 ? '#ff4757' : players[turno].color);
  }

  function pintarPanel() {
    if (acabado) { panel.centro('Recorrido terminado'); panel.barra(null); return; }
    const h = hoyo(), j = players[turno];
    panel.centro(`Hoyo ${iHoyo + 1}/${HOYOS.length} · ${h.nombre} (par ${h.par}) · <span style="color:${j.color}">${j.name}</span>`);
    panel.sub(avisoT > 0 ? aviso : `Golpes en este hoyo: ${golpesHoyo}`);
    panel.pie(`${players[0].name} ${total(0)} — ${total(1)} ${players[1].name} · ← → apuntar · mantener acción: fuerza`);
    panel.barra(fase === 'apuntar' ? fuerza : null, fuerza > 0.8 ? '#ff4757' : j.color);
  }

  return {
    init() {
      montarHoyo();
      marcador = ctx.ui.scoreboard({ center: 'Hoyo 1' });
      marcador.update(0, 0);
    },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      const p = input.player(turno);

      if (fase === 'apuntar' && !acabado) {
        if (p.held('left')) angulo -= 1.6 * dt;
        if (p.held('right')) angulo += 1.6 * dt;
        if (p.pressed('a')) { cargando = true; fuerza = 0; }
        if (cargando && p.held('a')) fuerza = Math.min(1, fuerza + dt * 0.9);
        if (cargando && p.released('a')) {
          const v = 3 + fuerza * 15;
          bola.vel.set(Math.cos(angulo) * v, 0, Math.sin(angulo) * v);
          golpesHoyo++;
          cargando = false;
          fase = 'rodando';
          audio.tone({ freq: 500, dur: 0.06, gain: 0.14 + fuerza * 0.12, type: 'triangle', sweep: -260 });
          haptics.impact(turno, 0.4 + fuerza);
        }
      } else if (fase === 'rodando') {
        paso(dt);
      } else if (fase === 'fin-hoyo') {
        espera -= dt;
        if (espera <= 0 && !acabado) siguiente();
      }

      // La bandera ondea: la escena está viva aunque nadie se mueva.
      bandera.children[1].rotation.y = Math.sin(performance.now() * 0.003) * 0.35;
      pintarFlecha();
      moverCamara(dt);
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
