/**
 * Tiro con arco — seis flechas cada uno a setenta metros.
 *
 * A esa distancia una flecha cae varios metros y el viento cruzado la desplaza
 * medio cuerpo, así que apuntar al centro es fallar: hay que tirar por encima y
 * a barlovento. La bandera del campo dice hacia dónde sopla y la fuerza con que
 * ondea; el arco no ayuda más que eso.
 *
 * Tensar cansa. El pulso empieza firme y se va abriendo mientras mantienes la
 * cuerda, de modo que hay una ventana buena — ni disparar sin fuerza ni
 * quedarse admirando la diana.
 */

import { crearMundo, crearPanel, mat, caja, cilindro, esfera, suelo, THREE } from '../../core/tres.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const DISTANCIA = 70;
const DIANA_Y = 1.3;
const DIANA_R = 0.61;
const FLECHAS = 6;
const OJO = new THREE.Vector3(0, 1.6, 0);

/** Colores de la diana oficial, de fuera hacia dentro. */
const ANILLOS = [
  ['#f2f2f2', 1], ['#f2f2f2', 2], ['#1a1a1a', 3], ['#1a1a1a', 4],
  ['#3d7fd6', 5], ['#3d7fd6', 6], ['#e02b2b', 7], ['#e02b2b', 8],
  ['#f4d03f', 9], ['#f4d03f', 10],
];

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#8fbfe8', horizonte: '#d8e9f7', sol: 2.6, solPos: [-20, 26, 30],
    sombraArea: 20, fov: 32, niebla: 0.0035, lejos: 600,
  });
  const panel = crearPanel(ctx.root);
  mundo.ambiente.intensity = 1.4;

  suelo(mundo, { color: '#4a7a3a', veta: '#3a6330', repite: 120, tam: 600 });

  /* ---------------- Diana ---------------- */

  const diana = new THREE.Group();
  diana.position.set(0, DIANA_Y, -DISTANCIA);
  mundo.escena.add(diana);
  for (let i = ANILLOS.length - 1; i >= 0; i--) {
    const r = DIANA_R * ((i + 1) / ANILLOS.length);
    const anillo = new THREE.Mesh(
      new THREE.CircleGeometry(r, 48),
      mat(ANILLOS[i][0], { rug: 0.9 }),
    );
    anillo.position.z = 0.004 * (ANILLOS.length - i);
    diana.add(anillo);
  }
  const tripode = cilindro(0.05, 0.06, DIANA_Y * 2, mat('#6b4a2a', { rug: 0.9 }), [0, -DIANA_Y / 2, -0.1], 8);
  diana.add(tripode);

  /* Bandera del viento junto a la diana: la única lectura del viento. */
  const mastil = new THREE.Group();
  mastil.position.set(2.6, 0, -DISTANCIA + 2);
  mastil.add(cilindro(0.04, 0.04, 4, mat('#dddddd', { rug: 0.5 }), [0, 2, 0], 8));
  const trapo = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), mat('#ff5533', { rug: 0.9, lados: 'doble' }));
  trapo.position.set(0.45, 3.6, 0);
  mastil.add(trapo);
  mundo.escena.add(mastil);

  // Postes de referencia: sin ellos, setenta metros de césped no se leen.
  for (let i = 1; i <= 6; i++) {
    const p = caja(0.12, 0.9, 0.12, mat('#e8e2d0', { rug: 0.8 }), [-3.4, 0.45, -i * 11]);
    mundo.escena.add(p);
  }

  /* ---------------- Arco y flecha ---------------- */

  const arco = new THREE.Group();
  const pala = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.022, 6, 24, Math.PI * 1.1),
    mat('#2b3a4a', { rug: 0.4, met: 0.3 }));
  pala.rotation.y = Math.PI / 2;
  pala.rotation.z = Math.PI * 0.45;
  arco.add(pala);
  // El arco cuelga de la cámara, no del mundo: así se mueve con la vista en
  // vez de quedarse plantado en el césped mientras el arquero gira la cabeza.
  arco.position.set(0.22, -0.14, -0.7);
  mundo.camara.add(arco);
  mundo.escena.add(mundo.camara);

  function crearFlecha() {
    const g = new THREE.Group();
    const asta = cilindro(0.008, 0.008, 0.75, mat('#e0e4ea', { rug: 0.4, met: 0.3 }), [0, 0, 0], 6);
    asta.rotation.x = Math.PI / 2;
    const punta = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.07, 6), mat('#8a8f99', { met: 0.7, rug: 0.3 }));
    punta.rotation.x = -Math.PI / 2;
    punta.position.z = -0.4;
    const pluma = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.16), mat('#ff3d7f', { rug: 0.9, lados: 'doble' }));
    pluma.position.z = 0.33;
    const pluma2 = pluma.clone();
    pluma2.rotation.z = Math.PI / 2;
    g.add(asta, punta, pluma, pluma2);
    return g;
  }

  const clavadas = [];

  /* ---------------- Estado ---------------- */

  let turno = 0;
  let tiradas = 0;
  const puntos = [0, 0];
  const dianas = [0, 0];
  let fase = 'apuntar';        // apuntar | volando | pausa
  let yaw = 0, pitch = 0.032;
  let tension = 0;
  let tensando = false;
  let fatiga = 0;
  let vuelo = null;
  let espera = 0;
  let viento = { x: 0, z: 0 };
  let aviso = '', avisoT = 0;
  let marcador = null;
  let acabado = false;

  const decir = (t, s = 2) => { aviso = t; avisoT = s; };

  function nuevoViento() {
    // Viento sobre todo cruzado: el que de verdad castiga a un arquero.
    viento = { x: (Math.random() * 2 - 1) * 3.2, z: (Math.random() * 2 - 1) * 0.8 };
  }

  const fuerzaViento = () => Math.hypot(viento.x, viento.z);

  /** Temblor del pulso: crece con la fatiga de mantener tensada la cuerda. */
  function pulso(t) {
    const amp = 0.0009 + fatiga * 0.0042;
    return {
      x: Math.sin(t * 5.1) * amp + Math.sin(t * 2.3 + 0.7) * amp * 0.7,
      y: Math.cos(t * 4.2 + 1.2) * amp * 0.8,
    };
  }

  function soltar() {
    const v = 46 + tension * 34;
    const s = pulso(performance.now() / 1000);
    const yy = yaw + s.x, pp = pitch + s.y;
    const flecha = crearFlecha();
    mundo.escena.add(flecha);
    vuelo = {
      malla: flecha,
      pos: OJO.clone().add(new THREE.Vector3(0.22, -0.05, -0.5)),
      vel: new THREE.Vector3(Math.sin(yy) * v, Math.sin(pp) * v, -Math.cos(yy) * Math.cos(pp) * v),
      t: 0,
    };
    fase = 'volando';
    tensando = false;
    audio.tone({ freq: 1400, dur: 0.09, gain: 0.15, type: 'sawtooth', sweep: -900 });
    audio.noise({ dur: 0.18, gain: 0.09, filter: 2600, sweep: -1200 });
    haptics.impact(turno, 0.5 + tension * 0.6);
  }

  function puntuar(x, y) {
    const r = Math.hypot(x, y);
    if (r > DIANA_R) return { valor: 0, texto: 'fuera' };
    const anillo = Math.min(9, Math.floor((r / DIANA_R) * 10));
    const valor = 10 - anillo;
    return { valor, texto: valor === 10 ? '¡DIEZ!' : `${valor}` };
  }

  function impactar(x, y) {
    const p = puntuar(x, y);
    puntos[turno] += p.valor;
    if (p.valor === 10) dianas[turno]++;
    marcador?.update(puntos[0], puntos[1]);
    if (p.valor >= 9) { audio.arp([660, 990, 1320], 0.06); haptics.score(turno); }
    else if (p.valor === 0) { audio.error(); haptics.error(turno); }
    else { audio.tone({ freq: 300 + p.valor * 40, dur: 0.1, gain: 0.14, type: 'triangle' }); haptics.tick(turno); }
    decir(`${p.texto}${p.valor ? ` · ${(Math.hypot(x, y) * 100).toFixed(0)} cm del centro` : ''}`, 2.2);
    fase = 'pausa';
    espera = 1.5;
  }

  function siguiente() {
    tiradas++;
    if (tiradas >= FLECHAS * 2) {
      acabado = true;
      ctx.finish({
        winner: puntos[0] === puntos[1] ? -1 : (puntos[0] > puntos[1] ? 0 : 1),
        scores: [puntos[0], puntos[1]],
        detail: `${FLECHAS} flechas cada uno · dieces: ${dianas[0]} y ${dianas[1]}`,
        record: ctx.record('puntos', Math.max(...puntos), 'high'),
      });
      return;
    }
    turno = 1 - turno;
    // Solo se dejan clavadas las últimas: sirven de referencia sin tapar la diana.
    while (clavadas.length > 3) { const f = clavadas.shift(); f.parent?.remove(f); }
    tension = 0; fatiga = 0;
    yaw = 0; pitch = 0.032;
    nuevoViento();
    fase = 'apuntar';
  }

  function pasoVuelo(dt) {
    const SUB = 3, s = dt / SUB;
    for (let k = 0; k < SUB; k++) {
      vuelo.vel.y -= 9.81 * s;
      // El viento actúa sobre el asta como sobre una vela pequeña.
      vuelo.vel.x += viento.x * 0.55 * s;
      vuelo.vel.z += viento.z * 0.55 * s;
      vuelo.vel.multiplyScalar(Math.exp(-0.055 * s));
      const zAntes = vuelo.pos.z;
      vuelo.pos.addScaledVector(vuelo.vel, s);
      vuelo.t += s;

      // Plano de la diana: se interpola el cruce para no perder precisión.
      if (zAntes > -DISTANCIA && vuelo.pos.z <= -DISTANCIA) {
        const f = (zAntes + DISTANCIA) / (zAntes - vuelo.pos.z);
        const x = vuelo.pos.x * f + (vuelo.pos.x - vuelo.vel.x * s) * (1 - f);
        const y = vuelo.pos.y * f + (vuelo.pos.y - vuelo.vel.y * s) * (1 - f);
        vuelo.malla.position.set(x, y, -DISTANCIA + 0.06);
        vuelo.malla.rotation.set(0, 0, Math.random() * Math.PI);
        clavadas.push(vuelo.malla);
        const guardada = vuelo;
        vuelo = null;
        impactar(x, y - DIANA_Y);
        if (Math.hypot(x, y - DIANA_Y) > DIANA_R) {
          // Falló la diana: la flecha sigue de largo hasta el suelo.
          guardada.malla.position.z = -DISTANCIA - 2;
        }
        return;
      }
      if (vuelo.pos.y < 0.05) {
        vuelo.malla.position.copy(vuelo.pos);
        vuelo.malla.rotation.x = -1.1;
        clavadas.push(vuelo.malla);
        vuelo = null;
        decir('Corta: se clavó en la hierba', 2);
        audio.thud();
        haptics.error(turno);
        fase = 'pausa';
        espera = 1.3;
        return;
      }
    }
    vuelo.malla.position.copy(vuelo.pos);
    // La flecha apunta a donde va: se ve la caída al final del vuelo.
    vuelo.malla.lookAt(vuelo.pos.clone().addScaledVector(vuelo.vel, 0.1));
    vuelo.malla.rotateY(Math.PI);
  }

  function moverCamara(dt) {
    if (fase === 'volando' && vuelo) {
      // Cámara de seguimiento por detrás y un poco por encima.
      const atras = vuelo.vel.clone().normalize().multiplyScalar(-4.5);
      const objetivo = vuelo.pos.clone().add(atras).add(new THREE.Vector3(0, 1.1, 0));
      mundo.camara.position.lerp(objetivo, 1 - Math.exp(-9 * dt));
      mundo.camara.lookAt(vuelo.pos.x, vuelo.pos.y, vuelo.pos.z - 6);
      return;
    }
    if (fase === 'pausa') {
      const objetivo = new THREE.Vector3(0.4, DIANA_Y + 0.6, -DISTANCIA + 3.4);
      mundo.camara.position.lerp(objetivo, 1 - Math.exp(-4 * dt));
      mundo.camara.lookAt(0, DIANA_Y, -DISTANCIA);
      return;
    }
    const s = pulso(performance.now() / 1000);
    mundo.camara.position.lerp(OJO, 1 - Math.exp(-6 * dt));
    // Apuntar es mover la cámara: la mira está siempre en el centro.
    mundo.camara.rotation.set(pitch + s.y, yaw + s.x, 0, 'YXZ');
  }

  function pintarPanel() {
    if (acabado) { panel.centro('Fin de la tanda'); panel.barra(null); return; }
    const j = players[turno];
    const flecha = Math.floor(tiradas / 2) + 1;
    const dir = viento.x > 0.3 ? '→' : viento.x < -0.3 ? '←' : '·';
    panel.centro(`Flecha ${flecha}/${FLECHAS} · <span style="color:${j.color}">${j.name}</span>`);
    panel.sub(avisoT > 0 ? aviso
      : `Viento ${dir} ${fuerzaViento().toFixed(1)} m/s · elevación ${(pitch * 180 / Math.PI).toFixed(1)}° · deriva ${(yaw * 180 / Math.PI).toFixed(1)}°`);
    panel.pie(`${players[0].name} ${puntos[0]} — ${puntos[1]} ${players[1].name} · flechas: apuntar · mantener acción: tensar · soltar: disparar`);
    panel.barra(fase === 'apuntar' ? tension : null, fatiga > 0.6 ? '#ff4757' : j.color);
  }

  /** Cruz de puntería dibujada en DOM: siempre nítida y siempre centrada. */
  const cruz = document.createElement('div');
  cruz.style.cssText = `position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;
    pointer-events:none;z-index:6;`;
  cruz.innerHTML = `<svg viewBox="0 0 56 56" width="56" height="56">
      <circle cx="28" cy="28" r="17" fill="none" stroke="#ffffff88" stroke-width="1.2"/>
      <path d="M28 4v12M28 40v12M4 28h12M40 28h12" stroke="#ffffffcc" stroke-width="1.4"/>
      <circle cx="28" cy="28" r="1.6" fill="#ff4757"/>
    </svg>`;
  ctx.root.appendChild(cruz);

  return {
    init() {
      nuevoViento();
      marcador = ctx.ui.scoreboard({ center: 'Flecha 1' });
      marcador.update(0, 0);
    },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      const p = input.player(turno);

      if (fase === 'apuntar' && !acabado) {
        const v = tensando ? 0.014 : 0.03;
        if (p.held('left')) yaw += v * dt;
        if (p.held('right')) yaw -= v * dt;
        if (p.held('up')) pitch = Math.min(0.14, pitch + v * dt);
        if (p.held('down')) pitch = Math.max(-0.02, pitch - v * dt);
        if (p.pressed('a')) { tensando = true; tension = 0; fatiga = 0; }
        if (tensando && p.held('a')) {
          tension = Math.min(1, tension + dt * 1.1);
          if (tension >= 1) fatiga = Math.min(1, fatiga + dt * 0.42);
        }
        if (tensando && p.released('a')) soltar();
      } else if (fase === 'volando') {
        pasoVuelo(dt);
      } else if (fase === 'pausa') {
        espera -= dt;
        if (espera <= 0 && !acabado) siguiente();
      }

      arco.visible = fase === 'apuntar';
      cruz.style.display = fase === 'apuntar' ? 'block' : 'none';
      trapo.rotation.y = Math.atan2(viento.x, viento.z) + Math.sin(performance.now() * 0.006) * 0.25 * fuerzaViento() * 0.3;
      trapo.scale.x = 0.35 + Math.min(1, fuerzaViento() / 3.2);
      moverCamara(dt);
      pintarPanel();
      mundo.dibujar();
    },

    destroy() {
      cruz.remove();
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
