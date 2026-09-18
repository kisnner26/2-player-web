/**
 * Bolos — cinco rondas, dos bolas por ronda, y los pinos se tiran entre ellos.
 *
 * Lo que hace que unos bolos se sientan bien no es la bola: son los pinos. Aquí
 * cada uno es una pieza con su volteo, y cuando cae empuja a los vecinos que
 * tenga al lado, así que un pleno se propaga en cadena desde el punto de
 * entrada. Un pino tocado de refilón se tambalea y a veces se queda de pie.
 *
 * Tirar tiene tres tiempos, como en la bolera: te colocas, cargas la fuerza y,
 * mientras la bola baja, todavía puedes darle efecto. Ese último tiempo es el
 * que convierte el tiro en una decisión y no en un botón.
 */

import { crearMundo, crearPanel, mat, esfera, caja, cilindro, texturaGrano, sombraContacto, THREE } from '../../core/tres.js';
import * as F from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const LARGO = 52;          // de la línea de falta a los pinos
const MEDIO = 4.2;         // media anchura de la pista
const CANAL = 1.1;         // anchura del canalón a cada lado
const R = 0.9;             // radio de bola
const RONDAS = 5;

/** Triángulo de diez pinos, en coordenadas (x lateral, z hacia el fondo). */
const PINOS = (() => {
  const p = [];
  const paso = 1.5;
  for (let fila = 0; fila < 4; fila++) {
    for (let k = 0; k <= fila; k++) {
      p.push([(k - fila / 2) * paso, LARGO + fila * paso * 0.87]);
    }
  }
  return p;
})();

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#080a10', horizonte: '#1d2436', sol: 1.6, solPos: [10, 30, -20],
    sombraArea: 22, fov: 46, niebla: 0.012, lejos: 300,
  });
  const panel = crearPanel(ctx.root);

  /* ---------------- Bolera ---------------- */

  const pista = new THREE.Mesh(
    new THREE.BoxGeometry(MEDIO * 2, 0.5, LARGO + 14),
    new THREE.MeshStandardMaterial({
      map: texturaGrano('#c69355', '#8d5f2c', { lineas: 40, repite: 3, ruido: 0.04 }),
      roughness: 0.28, metalness: 0.05,
    }),
  );
  pista.position.set(0, -0.25, (LARGO + 14) / 2 - 6);
  pista.receiveShadow = true;
  mundo.escena.add(pista);

  // Canalones: hundidos, para que se vea que la bola se ha ido.
  for (const s of [-1, 1]) {
    const c = caja(CANAL, 0.6, LARGO + 14, mat('#22252e', { rug: 0.5, met: 0.3 }),
      [s * (MEDIO + CANAL / 2), -0.55, (LARGO + 14) / 2 - 6]);
    mundo.escena.add(c);
  }
  // Fondo de la bolera y paredes: encierran la escena y dan escala.
  mundo.escena.add(caja(30, 14, 1, mat('#141821'), [0, 6, LARGO + 9]));
  mundo.escena.add(caja(30, 6, 1, mat('#2b1c3a', { emisivo: '#4b2d6e', brillo: 0.35 }), [0, 10, LARGO + 8.4]));
  for (const s of [-1, 1]) {
    mundo.escena.add(caja(1, 10, LARGO + 18, mat('#101420'), [s * 14, 4, LARGO / 2]));
  }
  // Flechas de puntería del suelo: referencia real para apuntar.
  for (let i = -3; i <= 3; i++) {
    if (!i) continue;
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 3), mat('#3a2410', { rug: 0.6 }));
    f.rotation.x = -Math.PI / 2;
    f.position.set(i * 0.95, 0.005, 12 + Math.abs(i) * 1.6);
    mundo.escena.add(f);
  }

  /* ---------------- Bola y pinos ---------------- */

  const bola = F.cuerpo({ y: R, r: R, masa: 6 });
  bola.malla = esfera(R, mat('#1b1f8c', { rug: 0.16, met: 0.2 }), [0, R, 0], 24);
  // Agujeros de los dedos: giran con la bola y delatan el efecto.
  for (const [dx, dy] of [[-0.2, 0.2], [0.2, 0.2], [0, -0.05]]) {
    const h = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), mat('#05050a', { rug: 1 }));
    h.position.set(dx, dy, R * 0.97);
    bola.malla.add(h);
  }
  mundo.escena.add(bola.malla);
  const sombraBola = sombraContacto(R * 1.1, 0.4);
  mundo.escena.add(sombraBola);

  const matPino = mat('#f4f1e6', { rug: 0.32 });
  const matFranja = mat('#d32f3a', { rug: 0.4 });
  const pinos = [];

  function crearPino(x, z) {
    const g = new THREE.Group();
    const cuerpoPino = cilindro(0.24, 0.36, 1.5, matPino, [0, 0, 0], 14);
    const cuello = cilindro(0.17, 0.24, 0.5, matPino, [0, 0.95, 0], 12);
    const cabeza = esfera(0.24, matPino, [0, 1.32, 0], 12);
    const franja = cilindro(0.245, 0.235, 0.16, matFranja, [0, 0.62, 0], 14);
    g.add(cuerpoPino, cuello, cabeza, franja);
    g.position.set(x, 0.75, z);
    g.castShadow = true;
    mundo.escena.add(g);
    const p = F.pieza(g, { r: 0.36, alto: 1.5, masa: 1 });
    p.viva = true;
    pinos.push(p);
    return p;
  }

  function plantarPinos() {
    for (const p of pinos) mundo.escena.remove(p.malla);
    pinos.length = 0;
    for (const [x, z] of PINOS) crearPino(x, z);
  }

  /* ---------------- Cámaras ---------------- */

  const camJuego = mundo.camara;
  camJuego.position.set(0, 5.5, -11);
  camJuego.lookAt(0, 1.4, 20);

  /* ---------------- Estado ---------------- */

  let turno = 0;
  let ronda = 1;
  let tiro = 1;                  // 1 o 2 dentro de la ronda
  let fase = 'colocar';          // colocar | fuerza | rodando | recuento
  let salida = 0;                // posición lateral de salida
  let fuerza = 0;
  let efecto = 0;
  let espera = 0;
  let derribadosTiro = 0;
  let derribadosPrevios = 0;     // pinos ya caídos al empezar la segunda bola
  const puntos = [0, 0];
  const historial = [[], []];
  let aviso = '';
  let avisoT = 0;
  let marcador = null;
  let acabado = false;

  const decir = (t, s = 2) => { aviso = t; avisoT = s; };
  const enPie = () => pinos.filter((p) => p.viva && !p.caida).length;

  function prepararTiro() {
    bola.pos.set(salida, R, 0);
    bola.vel.set(0, 0, 0);
    bola.quieto = false;
    bola.malla.quaternion.identity();
    efecto = 0;
    fuerza = 0;
    fase = 'colocar';
  }

  function lanzar() {
    const v = 16 + fuerza * 22;
    bola.vel.set(0, 0, v);
    audio.tone({ freq: 90, dur: 0.3, gain: 0.22, type: 'sine', sweep: 40 });
    audio.noise({ dur: 0.5, gain: 0.1, filter: 500 });
    haptics.impact(turno, 0.6 + fuerza);
    fase = 'rodando';
  }

  function golpearPino(p, dir, fza) {
    if (!p.viva) return;
    F.empujar(p, dir, fza);
    p.viva = true;
  }

  function recuento() {
    const caidos = pinos.filter((p) => p.caida).length;
    derribadosTiro = caidos - derribadosPrevios;
    let suma = derribadosTiro;
    if (tiro === 1 && caidos === 10) { suma += 10; decir('¡PLENO! +10 de premio', 2.6); audio.win(); }
    else if (tiro === 2 && caidos === 10) { suma += 5; decir('¡Semipleno! +5', 2.2); audio.arp([523, 659, 784, 1046], 0.07); }
    else if (derribadosTiro === 0) { decir('Ni uno…'); audio.error(); }
    else decir(`${derribadosTiro} pinos`);

    puntos[turno] += suma;
    historial[turno].push(derribadosTiro);
    if (suma > 0) haptics.score(turno); else haptics.error(turno);
    marcador?.update(puntos[0], puntos[1]);

    const plenoDirecto = tiro === 1 && caidos === 10;
    if (tiro === 1 && !plenoDirecto) {
      tiro = 2;
      derribadosPrevios = caidos;
      prepararTiro();
      return;
    }

    // Cambio de jugador (y de ronda cuando le toca otra vez al primero).
    tiro = 1;
    derribadosPrevios = 0;
    plantarPinos();
    if (turno === 1) ronda++;
    turno = 1 - turno;

    if (ronda > RONDAS) {
      acabado = true;
      const ganador = puntos[0] === puntos[1] ? -1 : (puntos[0] > puntos[1] ? 0 : 1);
      ctx.finish({
        winner: ganador,
        scores: [puntos[0], puntos[1]],
        detail: `${RONDAS} rondas · máximo de la partida ${Math.max(...puntos)} puntos`,
        record: ctx.record('bolos', Math.max(...puntos), 'high'),
      });
      return;
    }
    prepararTiro();
  }

  /* ---------------- Física del tiro ---------------- */

  function paso(dt) {
    // El efecto solo actúa mientras la bola tiene agarre, o sea al principio.
    const avance = Math.min(1, bola.pos.z / LARGO);
    bola.vel.x += efecto * 9 * dt * (1 - avance * 0.55);
    F.integrar(bola, dt, { gravedad: 0 });
    F.rodar(bola, dt, { friccion: 0.06, umbral: 0.4 });
    F.rodarMalla(bola, dt);
    bola.malla.position.copy(bola.pos);

    const fuera = Math.abs(bola.pos.x) > MEDIO - R * 0.5;
    if (fuera && bola.pos.y > -1) {
      // Canalón: la bola cae y ya no derriba nada.
      bola.vel.y -= 22 * dt;
      bola.vel.x *= 0.9;
      bola.pos.x = Math.sign(bola.pos.x) * Math.min(Math.abs(bola.pos.x), MEDIO + CANAL / 2);
    }

    if (!fuera) {
      for (const p of pinos) {
        if (!p.viva || p.caida) continue;
        const d = Math.hypot(bola.pos.x - p.pos.x, bola.pos.z - p.pos.z);
        if (d < R + 0.34) {
          const dir = new THREE.Vector3(p.pos.x - bola.pos.x, 0, p.pos.z - bola.pos.z);
          const fza = Math.min(9, 1.4 + Math.abs(bola.vel.z) * 0.28);
          golpearPino(p, dir.lengthSq() > 1e-6 ? dir : new THREE.Vector3(0, 0, 1), fza);
          bola.vel.multiplyScalar(0.94);
          audio.tone({ freq: 420, dur: 0.06, gain: 0.14, type: 'square', sweep: -160 });
          audio.noise({ dur: 0.12, gain: 0.12, filter: 2600 });
          haptics.impact(turno, 0.7);
        }
      }
    }

    // Pinos entre sí: un pino que se mueve arrastra a los que toca.
    for (let i = 0; i < pinos.length; i++) {
      const a = pinos[i];
      F.pasoPieza(a, dt, { sueloY: 0.75 - 0.36, friccion: 3.6 });
      if (a.quieto) continue;
      for (let j = 0; j < pinos.length; j++) {
        if (i === j) continue;
        const b = pinos[j];
        if (b.caida || !b.viva) continue;
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
        if (d < 0.78 && d > 1e-4) {
          const dir = new THREE.Vector3(b.pos.x - a.pos.x, 0, b.pos.z - a.pos.z);
          golpearPino(b, dir, Math.min(5, 0.8 + a.vel.length() * 0.5));
          a.vel.multiplyScalar(0.7);
        }
      }
    }

    const paradoTodo = (bola.pos.z > LARGO + 8 || bola.pos.y < -2 || bola.vel.length() < 0.6)
      && pinos.every((p) => p.quieto || !p.viva);
    if (paradoTodo) { fase = 'recuento'; espera = 1.1; }
  }

  /* ---------------- Cámara ---------------- */

  function moverCamara(dt) {
    const objetivoZ = fase === 'rodando' ? Math.min(bola.pos.z - 12, LARGO - 22) : -11;
    const objetivoY = fase === 'rodando' ? 4.6 : 5.5;
    const k = 1 - Math.exp(-3 * dt);
    camJuego.position.z += (objetivoZ - camJuego.position.z) * k;
    camJuego.position.y += (objetivoY - camJuego.position.y) * k;
    camJuego.position.x += ((fase === 'rodando' ? bola.pos.x * 0.4 : salida * 0.5) - camJuego.position.x) * k;
    camJuego.lookAt(fase === 'rodando' ? bola.pos.x * 0.5 : 0, 1.2, fase === 'rodando' ? LARGO + 2 : 22);
  }

  function pintarPanel() {
    const j = players[turno];
    if (acabado) { panel.centro('Fin'); panel.barra(null); return; }
    panel.centro(`Ronda ${ronda}/${RONDAS} · <span style="color:${j.color}">${j.name}</span> · bola ${tiro}`);
    const texto = {
      colocar: 'Colócate con ← → y mantén acción para cargar',
      fuerza: 'Suelta acción cuando quieras',
      rodando: 'Dale efecto con ← → mientras baja',
      recuento: 'Contando pinos…',
    }[fase];
    panel.sub(avisoT > 0 ? aviso : texto);
    panel.pie(`${players[0].name} ${puntos[0]} — ${puntos[1]} ${players[1].name} · en pie: ${enPie()}`);
    panel.barra(fase === 'colocar' || fase === 'fuerza' ? fuerza : null, fuerza > 0.85 ? '#ff4757' : j.color);
  }

  return {
    init() {
      plantarPinos();
      prepararTiro();
      marcador = ctx.ui.scoreboard({ center: `Ronda 1/${RONDAS}` });
      marcador.update(0, 0);
    },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      const p = input.player(turno);

      if (fase === 'colocar') {
        if (p.held('left')) salida = Math.max(-MEDIO + 1.2, salida - 5 * dt);
        if (p.held('right')) salida = Math.min(MEDIO - 1.2, salida + 5 * dt);
        bola.pos.x = salida;
        bola.malla.position.copy(bola.pos);
        if (p.pressed('a')) { fase = 'fuerza'; fuerza = 0; }
      } else if (fase === 'fuerza') {
        fuerza = Math.min(1, fuerza + dt * 0.8);
        if (p.released('a') || fuerza >= 1) lanzar();
      } else if (fase === 'rodando') {
        if (p.held('left')) efecto = Math.max(-1, efecto - 2.2 * dt);
        if (p.held('right')) efecto = Math.min(1, efecto + 2.2 * dt);
        paso(dt);
      } else if (fase === 'recuento') {
        espera -= dt;
        if (espera <= 0 && !acabado) recuento();
      }

      sombraBola.position.set(bola.pos.x, 0.02, bola.pos.z);
      sombraBola.visible = bola.pos.y > -0.5;
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
