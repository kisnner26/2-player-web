/**
 * Baloncesto — seis tiros cada uno desde donde quieras.
 *
 * El aro es un aro: un anillo con grosor contra el que la pelota rebota de
 * verdad, y un tablero detrás que devuelve los tiros pasados. Por eso aquí
 * pasan las cosas que pasan en una canasta — la bola que da dos vueltas al hierro
 * y entra, la que se queda sentada en el aro y sale, la tabla que salva un tiro
 * largo.
 *
 * Se elige sitio, ángulo y fuerza. De cerca vale casi cualquier ángulo; de tres
 * hay que bombear, y ahí es donde se separan los dos jugadores.
 */

import { crearMundo, crearPanel, mat, caja, cilindro, esfera, suelo, texturaGrano, sombraContacto, gradas, THREE } from '../../core/tres.js';
import * as F from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const ARO_Y = 3.05;            // altura reglamentaria
const ARO_R = 0.2275;
const TUBO = 0.02;
const BOLA_R = 0.121;
const TRIPLE = 6.75;           // distancia de la línea de tres
const TIROS = 6;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#0d1018', horizonte: '#2a3348', sol: 2.2, solPos: [8, 20, 14],
    sombraArea: 16, fov: 45, niebla: 0.008, lejos: 200,
  });
  const panel = crearPanel(ctx.root);

  /* ---------------- Pista ---------------- */

  const parquet = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 34),
    new THREE.MeshStandardMaterial({
      map: texturaGrano('#c08a4a', '#9a6a34', { lineas: 60, repite: 5, ruido: 0.05 }),
      roughness: 0.42, metalness: 0.02,
    }),
  );
  parquet.rotation.x = -Math.PI / 2;
  parquet.position.z = 10;
  parquet.receiveShadow = true;
  mundo.escena.add(parquet);
  suelo(mundo, { color: '#14161d', veta: '#0f1116', repite: 40, tam: 200 });
  gradas(mundo, { filas: 3, porFila: 22, radio: 20, alturaBase: 1.5 });

  // Línea de tres: un aro fino pintado en el suelo.
  const linea = new THREE.Mesh(
    new THREE.RingGeometry(TRIPLE - 0.05, TRIPLE, 64, 1, Math.PI, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  linea.rotation.x = -Math.PI / 2;
  linea.position.y = 0.012;
  mundo.escena.add(linea);

  /* ---------------- Canasta ---------------- */

  const poste = cilindro(0.12, 0.14, ARO_Y + 1.4, mat('#20242e', { rug: 0.4, met: 0.6 }), [0, (ARO_Y + 1.4) / 2, -1.6], 12);
  mundo.escena.add(poste);
  mundo.escena.add(caja(0.5, 0.14, 1.3, mat('#20242e', { met: 0.6 }), [0, ARO_Y + 0.5, -1.0]));

  const TABLERO_Z = -0.6;
  const tablero = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 1.05, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xdfe8f2, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.55 }),
  );
  tablero.position.set(0, ARO_Y + 0.35, TABLERO_Z - 0.05);
  mundo.escena.add(tablero);
  // Cuadro del tablero: la referencia real para tirar a tabla.
  const cuadro = new THREE.Mesh(
    new THREE.BoxGeometry(0.59, 0.45, 0.01),
    new THREE.MeshBasicMaterial({ color: 0xff5533 }),
  );
  cuadro.position.set(0, ARO_Y + 0.22, TABLERO_Z + 0.01);
  mundo.escena.add(cuadro);
  const marco = new THREE.Mesh(new THREE.BoxGeometry(1.84, 1.09, 0.02), new THREE.MeshBasicMaterial({ color: 0xff5533 }));
  marco.position.set(0, ARO_Y + 0.35, TABLERO_Z - 0.09);
  mundo.escena.add(marco);

  const aro = new THREE.Mesh(
    new THREE.TorusGeometry(ARO_R, TUBO, 8, 32),
    mat('#ff6a1f', { rug: 0.35, met: 0.7 }),
  );
  aro.rotation.x = -Math.PI / 2;
  aro.position.set(0, ARO_Y, 0);
  aro.castShadow = true;
  mundo.escena.add(aro);

  // Red: doce cuerdas colgando en cono. Puro atrezo, pero sin ella no es canasta.
  const red = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(a) * ARO_R, 0, Math.sin(a) * ARO_R),
      new THREE.Vector3(Math.cos(a) * ARO_R * 0.55, -0.42, Math.sin(a) * ARO_R * 0.55),
    ]);
    red.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.7 })));
  }
  red.position.set(0, ARO_Y, 0);
  mundo.escena.add(red);

  /* ---------------- Balón ---------------- */

  const bola = F.cuerpo({ r: BOLA_R, masa: 0.62 });
  bola.malla = esfera(BOLA_R, mat('#d2662a', { rug: 0.85 }), null, 22);
  // Costuras: se ve girar el balón, que es lo que da sensación de tiro.
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.TorusGeometry(BOLA_R * 1.002, 0.006, 6, 28), mat('#20130a', { rug: 1 }));
    c.rotation.set(i === 0 ? 0 : Math.PI / 2, i === 2 ? Math.PI / 2 : 0, 0);
    bola.malla.add(c);
  }
  mundo.escena.add(bola.malla);
  const sombra = sombraContacto(BOLA_R * 1.4, 0.38);
  mundo.escena.add(sombra);

  const guiaGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const guia = new THREE.Line(guiaGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  mundo.escena.add(guia);

  /* ---------------- Estado ---------------- */

  let turno = 0;
  let tiro = 0;
  let fase = 'colocar';            // colocar | volar | pausa
  let angSuelo = Math.PI / 2;      // posición en el arco alrededor de la canasta
  let distancia = 4.6;
  let elevacion = 0.92;            // radianes sobre la horizontal
  let fuerza = 0;
  let cargando = false;
  let espera = 0;
  let tocoAro = false;
  let tocoTablero = false;
  let anotado = false;
  const puntos = [0, 0];
  const encestes = [0, 0];
  let aviso = '', avisoT = 0;
  let marcador = null;
  let acabado = false;

  const decir = (t, s = 2) => { aviso = t; avisoT = s; };
  const posicionTiro = () => new THREE.Vector3(Math.cos(angSuelo) * distancia, 1.9, Math.sin(angSuelo) * distancia);
  const vale3 = () => distancia >= TRIPLE;

  function colocarBola() {
    const p = posicionTiro();
    bola.pos.copy(p);
    bola.vel.set(0, 0, 0);
    bola.malla.position.copy(p);
  }

  function tirar() {
    const p = posicionTiro();
    const haciaAro = new THREE.Vector3(-p.x, 0, -p.z).normalize();
    const v = 4 + fuerza * 9.5;
    bola.vel.set(
      haciaAro.x * Math.cos(elevacion) * v,
      Math.sin(elevacion) * v,
      haciaAro.z * Math.cos(elevacion) * v,
    );
    fase = 'volar';
    tocoAro = tocoTablero = anotado = false;
    cargando = false;
    audio.tone({ freq: 260, dur: 0.08, gain: 0.14, type: 'triangle', sweep: 120 });
    haptics.impact(turno, 0.4 + fuerza * 0.6);
  }

  /** Rebote contra el anillo: el punto más cercano del aro es el del círculo. */
  function chocarAro() {
    const dx = bola.pos.x, dz = bola.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-5) return;
    const cx = (dx / d) * ARO_R, cz = (dz / d) * ARO_R;
    const px = bola.pos.x - cx, py = bola.pos.y - ARO_Y, pz = bola.pos.z - cz;
    const dist = Math.hypot(px, py, pz);
    const min = BOLA_R + TUBO;
    if (dist >= min || dist < 1e-6) return;
    const nx = px / dist, ny = py / dist, nz = pz / dist;
    bola.pos.set(cx + nx * min, ARO_Y + ny * min, cz + nz * min);
    const vn = bola.vel.x * nx + bola.vel.y * ny + bola.vel.z * nz;
    if (vn < 0) {
      const rest = 1.55;   // 1 + restitución 0,55
      bola.vel.x -= rest * vn * nx;
      bola.vel.y -= rest * vn * ny;
      bola.vel.z -= rest * vn * nz;
      bola.vel.multiplyScalar(0.93);
      tocoAro = true;
      audio.tone({ freq: 780, dur: 0.09, gain: 0.13, type: 'square', sweep: -320 });
      haptics.tick(turno);
    }
  }

  function chocarTablero() {
    const dentroX = Math.abs(bola.pos.x) < 0.9 + BOLA_R;
    const dentroY = Math.abs(bola.pos.y - (ARO_Y + 0.35)) < 0.53 + BOLA_R;
    if (!dentroX || !dentroY) return;
    if (bola.pos.z - BOLA_R < TABLERO_Z && bola.vel.z < 0) {
      bola.pos.z = TABLERO_Z + BOLA_R;
      bola.vel.z = -bola.vel.z * 0.62;
      bola.vel.x *= 0.9; bola.vel.y *= 0.9;
      tocoTablero = true;
      audio.tone({ freq: 180, dur: 0.09, gain: 0.13, type: 'sine', sweep: -60 });
    }
  }

  function comprobarCanasta(yAntes) {
    if (anotado) return;
    // Cruza el plano del aro de arriba abajo y dentro del anillo: dentro.
    if (yAntes > ARO_Y && bola.pos.y <= ARO_Y && bola.vel.y < 0) {
      const d = Math.hypot(bola.pos.x, bola.pos.z);
      if (d < ARO_R - BOLA_R * 0.35) {
        anotado = true;
        const limpio = !tocoAro && !tocoTablero;
        const valor = vale3() ? 3 : 2;
        puntos[turno] += valor;
        encestes[turno]++;
        decir(limpio ? `¡LIMPIA! +${valor}` : `Canasta +${valor}`, 1.8);
        audio.arp(limpio ? [660, 880, 1320] : [520, 700], 0.06);
        haptics.score(turno);
        marcador?.update(puntos[0], puntos[1]);
      }
    }
  }

  function paso(dt) {
    const SUB = 4, s = dt / SUB;
    for (let k = 0; k < SUB; k++) {
      const yAntes = bola.pos.y;
      // Arrastre bajo: un balón de baloncesto casi no lo nota, pero suaviza.
      F.integrar(bola, s, { gravedad: 9.81, arrastre: 0.06 });
      chocarTablero();
      chocarAro();
      comprobarCanasta(yAntes);
      const golpe = F.rebotarSuelo(bola, 0, { restitucion: 0.72, friccion: 0.94, minRebote: 0.6 });
      if (golpe > 1.4) audio.tone({ freq: 120, dur: 0.1, gain: Math.min(0.2, golpe * 0.03), type: 'sine', sweep: -40 });
    }
    F.rodarMalla(bola, dt);
    bola.malla.position.copy(bola.pos);

    const parado = bola.pos.y < BOLA_R + 0.02 && Math.hypot(bola.vel.x, bola.vel.z) < 0.7;
    if (parado || bola.pos.length() > 40) {
      if (!anotado) { decir('Fuera', 1.4); haptics.error(turno); }
      fase = 'pausa';
      espera = 0.9;
    }
  }

  function siguiente() {
    tiro++;
    turno = 1 - turno;
    if (tiro >= TIROS * 2) {
      acabado = true;
      ctx.finish({
        winner: puntos[0] === puntos[1] ? -1 : (puntos[0] > puntos[1] ? 0 : 1),
        scores: [puntos[0], puntos[1]],
        detail: `${encestes[0]}/${TIROS} y ${encestes[1]}/${TIROS} tiros dentro`,
        record: ctx.record('puntos', Math.max(...puntos), 'high'),
      });
      return;
    }
    // Cada jugador vuelve a colocarse donde quiera.
    fuerza = 0;
    fase = 'colocar';
    colocarBola();
  }

  function moverCamara(dt) {
    const p = posicionTiro();
    const objetivo = fase === 'volar'
      ? new THREE.Vector3(p.x * 1.25, 3.4, p.z * 1.25 + 1)
      : new THREE.Vector3(p.x * 1.35, 3.0, p.z * 1.35 + 0.8);
    mundo.camara.position.lerp(objetivo, 1 - Math.exp(-3.4 * dt));
    mundo.camara.lookAt(0, ARO_Y - 0.4, 0);
  }

  function pintarGuia() {
    const ver = fase === 'colocar' && !acabado;
    guia.visible = ver;
    if (!ver) return;
    const p = posicionTiro();
    const hacia = new THREE.Vector3(-p.x, 0, -p.z).normalize();
    const largo = 1 + fuerza * 2.5;
    const arr = guiaGeo.attributes.position.array;
    arr[0] = p.x; arr[1] = p.y; arr[2] = p.z;
    arr[3] = p.x + hacia.x * Math.cos(elevacion) * largo;
    arr[4] = p.y + Math.sin(elevacion) * largo;
    arr[5] = p.z + hacia.z * Math.cos(elevacion) * largo;
    guiaGeo.attributes.position.needsUpdate = true;
  }

  function pintarPanel() {
    if (acabado) { panel.centro('Se acabaron los tiros'); panel.barra(null); return; }
    const j = players[turno];
    const nTiro = Math.floor(tiro / 2) + 1;
    panel.centro(`Tiro ${nTiro}/${TIROS} · <span style="color:${j.color}">${j.name}</span> · ${vale3() ? 'triple' : 'de dos'}`);
    panel.sub(avisoT > 0 ? aviso
      : `${distancia.toFixed(1)} m · ángulo ${Math.round(elevacion * 180 / Math.PI)}°`);
    panel.pie(`${players[0].name} ${puntos[0]} — ${puntos[1]} ${players[1].name} · ← → moverse · ↑ ↓ ángulo · acción: tirar`);
    panel.barra(fase === 'colocar' ? fuerza : null, fuerza > 0.85 ? '#ff4757' : j.color);
  }

  return {
    init() {
      colocarBola();
      marcador = ctx.ui.scoreboard({ center: 'Tiro 1' });
      marcador.update(0, 0);
    },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      const p = input.player(turno);

      if (fase === 'colocar' && !acabado) {
        if (!cargando) {
          if (p.held('left')) angSuelo += 0.7 * dt;
          if (p.held('right')) angSuelo -= 0.7 * dt;
          if (p.held('up')) elevacion = Math.min(1.32, elevacion + 0.6 * dt);
          if (p.held('down')) elevacion = Math.max(0.42, elevacion - 0.6 * dt);
          colocarBola();
        }
        if (p.pressed('a')) { cargando = true; fuerza = 0; }
        if (cargando && p.held('a')) fuerza = Math.min(1, fuerza + dt * 0.75);
        if (cargando && p.released('a')) tirar();
        // La tecla especial salta de distancia: bandeja, media, tres, esquina.
        if (p.pressed('b') && !cargando) { distancia = distancia > 7.4 ? 2.2 : distancia + 1.3; colocarBola(); }
      } else if (fase === 'volar') {
        paso(dt);
      } else if (fase === 'pausa') {
        espera -= dt;
        if (espera <= 0 && !acabado) siguiente();
      }

      sombra.position.set(bola.pos.x, 0.014, bola.pos.z);
      const alt = Math.max(0, bola.pos.y);
      sombra.scale.setScalar(Math.max(0.3, 1 - alt / 8));
      sombra.material.opacity = 0.38 * Math.max(0.25, 1 - alt / 8);
      pintarGuia();
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
