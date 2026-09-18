/**
 * Rally — tres vueltas a pantalla partida.
 *
 * El coche no gira: derrapa. La velocidad se guarda como vector y se separa en
 * cada cuadro en lo que va hacia delante y lo que va de lado; el agarre come lo
 * segundo poco a poco. Levantar el pie en una curva rápida deja el morro
 * girando mientras el coche sigue yendo hacia donde iba, que es exactamente la
 * sensación que se busca.
 *
 * Fuera del asfalto el agarre cae y el rozamiento sube: cortar por la grava se
 * puede, pero cuesta. El circuito es una curva cerrada y los controles de paso
 * se generan de ella, así que cambiar el trazado es cambiar una lista de puntos.
 */

import { crearMundo, crearPanel, mat, caja, cilindro, suelo, texturaGrano, perseguir, THREE } from '../../core/tres.js';

export const meta = { render: 'dom', sinCuentaAtras: false };

const VUELTAS = 3;
const ANCHO_PISTA = 9;
const CONTROLES = 12;

/** Trazado: puntos de control de la curva cerrada, en metros. */
const TRAZADO = [
  [0, 0, -60], [38, 0, -52], [58, 0, -22], [48, 0, 8], [62, 0, 34],
  [40, 0, 58], [4, 0, 62], [-26, 0, 50], [-30, 0, 22], [-56, 0, 10],
  [-62, 0, -22], [-40, 0, -52],
];

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#9dc4e6', horizonte: '#e2eef8', sol: 2.7, solPos: [40, 50, 20],
    sombraArea: 60, fov: 62, niebla: 0.0045, lejos: 800,
  });
  const panel = crearPanel(ctx.root);
  mundo.ambiente.intensity = 1.35;
  mundo.luzSol.shadow?.mapSize.set(1024, 1024);

  suelo(mundo, { color: '#5d7a3a', veta: '#48602c', repite: 160, tam: 900 });

  /* ---------------- Circuito ---------------- */

  const curva = new THREE.CatmullRomCurve3(TRAZADO.map((p) => new THREE.Vector3(...p)), true, 'catmullrom', 0.5);
  const MUESTRAS = 320;
  const puntos = curva.getSpacedPoints(MUESTRAS);
  const tangentes = puntos.map((_, i) => {
    const a = puntos[(i - 1 + MUESTRAS) % MUESTRAS], b = puntos[(i + 1) % MUESTRAS];
    return new THREE.Vector3().subVectors(b, a).setY(0).normalize();
  });
  const normales = tangentes.map((t) => new THREE.Vector3(-t.z, 0, t.x));

  // Cinta de asfalto: dos vértices por muestra y dos triángulos por tramo.
  const vertices = [], uvs = [], indices = [];
  for (let i = 0; i < MUESTRAS; i++) {
    const p = puntos[i], n = normales[i];
    vertices.push(p.x + n.x * ANCHO_PISTA / 2, 0.02, p.z + n.z * ANCHO_PISTA / 2);
    vertices.push(p.x - n.x * ANCHO_PISTA / 2, 0.02, p.z - n.z * ANCHO_PISTA / 2);
    uvs.push(0, i * 0.5, 1, i * 0.5);
  }
  for (let i = 0; i < MUESTRAS; i++) {
    const a = i * 2, b = i * 2 + 1;
    const c = ((i + 1) % MUESTRAS) * 2, d = ((i + 1) % MUESTRAS) * 2 + 1;
    // Ojo con el orden: con el sentido contrario las normales miran al suelo y
    // el asfalto desaparece por descarte de caras traseras.
    indices.push(a, c, b, b, c, d);
  }
  const geoPista = new THREE.BufferGeometry();
  geoPista.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geoPista.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geoPista.setIndex(indices);
  geoPista.computeVertexNormals();
  const pista = new THREE.Mesh(geoPista, new THREE.MeshStandardMaterial({
    map: texturaGrano('#3c3f45', '#2e3136', { repite: 1, ruido: 0.08 }), roughness: 0.95,
  }));
  pista.receiveShadow = true;
  mundo.escena.add(pista);

  // Pianos y postes: bordes legibles a la velocidad a la que se juega.
  const matRojo = mat('#d43b3b', { rug: 0.8 });
  const matBlanco = mat('#f0f0f0', { rug: 0.8 });
  for (let i = 0; i < MUESTRAS; i += 4) {
    const p = puntos[i], n = normales[i], t = tangentes[i];
    for (const s of [1, -1]) {
      const piano = caja(1.1, 0.08, 2.6, (i / 4) % 2 ? matRojo : matBlanco, [
        p.x + n.x * s * (ANCHO_PISTA / 2 + 0.5), 0.05, p.z + n.z * s * (ANCHO_PISTA / 2 + 0.5),
      ]);
      piano.rotation.y = Math.atan2(t.x, t.z);
      piano.castShadow = false;
      mundo.escena.add(piano);
    }
  }
  for (let i = 0; i < MUESTRAS; i += 16) {
    const p = puntos[i], n = normales[i];
    for (const s of [1, -1]) {
      mundo.escena.add(cilindro(0.12, 0.12, 1.5, mat('#e8e8ee', { rug: 0.6 }), [
        p.x + n.x * s * (ANCHO_PISTA / 2 + 2.2), 0.75, p.z + n.z * s * (ANCHO_PISTA / 2 + 2.2),
      ], 6));
    }
  }
  // Árboles de fondo: dan referencia de velocidad por el rabillo del ojo.
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + Math.random();
    const r = 78 + Math.random() * 60;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9;
    const tronco = cilindro(0.28, 0.36, 2.4, mat('#5a3a22'), [x, 1.2, z], 6);
    const copa = new THREE.Mesh(new THREE.ConeGeometry(1.9, 5, 7), mat('#2f5a2a', { rug: 1 }));
    copa.position.set(x, 4.4, z);
    copa.castShadow = true;
    mundo.escena.add(tronco, copa);
  }

  // Meta: arco y línea a cuadros sobre la muestra 0.
  const metaN = normales[0], metaP = puntos[0], metaT = tangentes[0];
  const lineaMeta = caja(ANCHO_PISTA, 0.03, 1.6, new THREE.MeshStandardMaterial({
    map: (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        g.fillStyle = (i + j) % 2 ? '#f4f4f4' : '#141414';
        g.fillRect(i * 8, j * 8, 8, 8);
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })(), roughness: 0.9,
  }), [metaP.x, 0.04, metaP.z]);
  lineaMeta.rotation.y = Math.atan2(metaT.x, metaT.z);
  mundo.escena.add(lineaMeta);
  for (const s of [1, -1]) {
    mundo.escena.add(cilindro(0.2, 0.2, 7, mat('#d8d8e0', { rug: 0.5 }), [
      metaP.x + metaN.x * s * (ANCHO_PISTA / 2 + 1), 3.5, metaP.z + metaN.z * s * (ANCHO_PISTA / 2 + 1)], 8));
  }

  /* ---------------- Coches ---------------- */

  function crearCoche(color) {
    const g = new THREE.Group();
    const carroceria = caja(1.9, 0.62, 4.2, mat(color, { rug: 0.32, met: 0.35 }), [0, 0.62, 0]);
    const cabina = caja(1.66, 0.52, 1.8, mat('#151a22', { rug: 0.15, met: 0.5 }), [0, 1.16, -0.15]);
    const aleron = caja(1.9, 0.1, 0.5, mat('#22252c', { rug: 0.5 }), [0, 1.35, -2.05]);
    const morro = caja(1.7, 0.3, 0.5, mat('#22252c', { rug: 0.5 }), [0, 0.5, 2.1]);
    g.add(carroceria, cabina, aleron, morro);
    const ruedas = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const r = cilindro(0.44, 0.44, 0.36, mat('#15161a', { rug: 0.9 }), [sx * 0.95, 0.44, sz * 1.4], 14);
      r.rotation.z = Math.PI / 2;
      g.add(r);
      ruedas.push(r);
    }
    for (const sx of [-1, 1]) {
      const faro = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
      faro.position.set(sx * 0.6, 0.72, 2.15);
      g.add(faro);
    }
    mundo.escena.add(g);
    return { g, ruedas };
  }

  const coches = [0, 1].map((i) => {
    const { g, ruedas } = crearCoche(players[i].color);
    return {
      malla: g, ruedas,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      rumbo: 0,
      derrape: 0,
      vuelta: 1,
      control: 0,
      mejor: 0,
      tiempoVuelta: 0,
      cam: mundo.camaraExtra(62),
      terminado: false,
    };
  });

  function colocarSalida() {
    const t = tangentes[0], n = normales[0];
    coches.forEach((c, i) => {
      const p = puntos[MUESTRAS - 8];
      c.pos.set(p.x + n.x * (i ? 2.2 : -2.2), 0, p.z + n.z * (i ? 2.2 : -2.2));
      c.rumbo = Math.atan2(t.x, t.z);
      c.vel.set(0, 0, 0);
      c.malla.position.copy(c.pos);
      c.malla.rotation.y = c.rumbo;
      c.cam.position.set(c.pos.x, 4, c.pos.z);
    });
  }

  /* ---------------- Estado ---------------- */

  let tiempo = 0;
  let acabado = false;
  let marcador = null;
  const polvo = [];

  /** Muestra de pista más cercana: sirve para el agarre y los controles de paso. */
  function muestraCercana(c) {
    // Búsqueda local alrededor del último control conocido: barrer las 320
    // muestras por coche y por cuadro sería tirar el presupuesto de CPU.
    let mejor = c.iMuestra ?? 0, mejorD = Infinity;
    for (let k = -14; k <= 26; k++) {
      const i = ((c.iMuestra ?? 0) + k + MUESTRAS) % MUESTRAS;
      const d = (puntos[i].x - c.pos.x) ** 2 + (puntos[i].z - c.pos.z) ** 2;
      if (d < mejorD) { mejorD = d; mejor = i; }
    }
    c.iMuestra = mejor;
    return { i: mejor, d: Math.sqrt(mejorD) };
  }

  function conducir(c, p, dt) {
    const { i, d } = muestraCercana(c);
    const enPista = d < ANCHO_PISTA / 2 + 0.8;

    const acelera = p.held('a') || p.held('up');
    const frena = p.held('b') || p.held('down');
    const giro = (p.held('left') ? 1 : 0) - (p.held('right') ? 1 : 0);

    const rapidez = Math.hypot(c.vel.x, c.vel.z);
    const adelante = new THREE.Vector3(Math.sin(c.rumbo), 0, Math.cos(c.rumbo));
    const lateral = new THREE.Vector3(Math.cos(c.rumbo), 0, -Math.sin(c.rumbo));

    // Dirección: el volante muerde menos parado y menos a tope de velocidad.
    const eficacia = Math.min(1, rapidez / 6) * (1 - Math.min(0.45, rapidez / 90));
    c.rumbo += giro * 2.3 * eficacia * dt;

    const potencia = enPista ? 26 : 14;
    if (acelera) c.vel.addScaledVector(adelante, potencia * dt);
    if (frena) {
      const yendoDelante = c.vel.dot(adelante) > 0;
      c.vel.addScaledVector(adelante, (yendoDelante ? -34 : -10) * dt);
    }

    // Agarre: se descompone la velocidad y se recorta la parte lateral.
    const vAdelante = c.vel.dot(adelante);
    const vLateral = c.vel.dot(lateral);
    const agarre = enPista ? (frena ? 3.4 : 7.5) : 2.4;
    const nuevaLateral = vLateral * Math.exp(-agarre * dt);
    c.derrape = Math.min(1, Math.abs(nuevaLateral) / 9);
    c.vel.copy(adelante).multiplyScalar(vAdelante * Math.exp(-(enPista ? 0.35 : 1.9) * dt))
      .addScaledVector(lateral, nuevaLateral);

    const tope = enPista ? 44 : 26;
    if (rapidez > tope) c.vel.multiplyScalar(tope / rapidez);

    c.pos.addScaledVector(c.vel, dt);
    c.malla.position.copy(c.pos);
    c.malla.position.y = Math.abs(Math.sin(tiempo * 12 + c.pos.x)) * (enPista ? 0.01 : 0.06);
    c.malla.rotation.y = c.rumbo;
    // Balanceo de carrocería: el coche se apoya en la curva.
    c.malla.rotation.z = -vLateral * 0.012;
    c.malla.rotation.x = (frena ? 0.02 : acelera ? -0.015 : 0) * Math.min(1, rapidez / 10);

    const giroRueda = rapidez * dt / 0.44;
    c.ruedas.forEach((r, k) => {
      r.rotation.x -= giroRueda;
      if (k < 2) r.rotation.y = giro * 0.4;
    });

    // Polvo al derrapar o al pisar tierra.
    if ((c.derrape > 0.35 || !enPista) && rapidez > 8 && Math.random() < dt * 30) {
      const p3 = new THREE.Mesh(
        new THREE.SphereGeometry(0.3 + Math.random() * 0.3, 6, 5),
        new THREE.MeshBasicMaterial({ color: enPista ? 0x555555 : 0xb09a6a, transparent: true, opacity: 0.5 }),
      );
      p3.position.set(c.pos.x - adelante.x * 2, 0.3, c.pos.z - adelante.z * 2);
      mundo.escena.add(p3);
      polvo.push({ malla: p3, vida: 0.8 });
    }

    // Controles de paso: hay que cruzarlos en orden para que valga la vuelta.
    const sector = Math.floor((i / MUESTRAS) * CONTROLES);
    if (sector === (c.control + 1) % CONTROLES) {
      // Solo cuenta vuelta si se entra en el sector 0 viniendo del último: así
      // no vale dar media vuelta y volver a cruzar la meta al revés.
      const cerroVuelta = sector === 0;
      c.control = sector;
      if (cerroVuelta) {
        c.vuelta++;
        c.mejor = c.mejor ? Math.min(c.mejor, c.tiempoVuelta) : c.tiempoVuelta;
        c.tiempoVuelta = 0;
        if (c.vuelta > VUELTAS) terminar(c);
        else { audio.beep(880); haptics.tick(c === coches[0] ? 0 : 1); }
      }
    }
    c.tiempoVuelta += dt;

    if (rapidez > 4 && Math.random() < dt * 4) {
      audio.tone({ freq: 60 + rapidez * 4, dur: 0.06, gain: 0.03, type: 'sawtooth' });
    }
  }

  function terminar(c) {
    if (acabado) return;
    acabado = true;
    const g = c === coches[0] ? 0 : 1;
    audio.win();
    haptics.victory(g);
    setTimeout(() => ctx.finish({
      winner: g,
      scores: [coches[0].vuelta - 1, coches[1].vuelta - 1],
      detail: `${VUELTAS} vueltas · mejor vuelta ${c.mejor.toFixed(1)} s`,
      record: ctx.record('vuelta', Math.round(c.mejor * 10) / 10, 'low'),
    }), 700);
  }

  function pintarPanel() {
    const [a, b] = coches;
    panel.centro('');
    panel.sub('');
    panel.pie(`${players[0].name}: vuelta ${Math.min(a.vuelta, VUELTAS)}/${VUELTAS} · ${players[1].name}: vuelta ${Math.min(b.vuelta, VUELTAS)}/${VUELTAS}`);
    panel.barra(null);
  }

  return {
    init() {
      colocarSalida();
      marcador = ctx.ui.scoreboard({ center: `0/${VUELTAS}` });
      marcador.update(0, 0);
    },

    update(dt) {
      tiempo += dt;
      if (!acabado) {
        conducir(coches[0], input.player(0), dt);
        conducir(coches[1], input.player(1), dt);
      }

      for (let i = polvo.length - 1; i >= 0; i--) {
        const p = polvo[i];
        p.vida -= dt;
        p.malla.material.opacity = Math.max(0, p.vida * 0.55);
        p.malla.scale.multiplyScalar(1 + dt * 1.6);
        p.malla.position.y += dt * 0.6;
        if (p.vida <= 0) { mundo.escena.remove(p.malla); p.malla.geometry.dispose(); p.malla.material.dispose(); polvo.splice(i, 1); }
      }

      for (const c of coches) {
        // La cámara se abre al derrapar: se ve hacia dónde va el coche.
        perseguir(c.cam, c.malla, dt, {
          distancia: 10 + Math.hypot(c.vel.x, c.vel.z) * 0.09,
          altura: 4.2, mirarAlto: 1.2, suavidad: 4.5, giro: c.rumbo,
        });
      }

      marcador?.update(Math.min(coches[0].vuelta, VUELTAS), Math.min(coches[1].vuelta, VUELTAS));
      pintarPanel();
      mundo.dibujarPartida(coches[0].cam, coches[1].cam);
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
