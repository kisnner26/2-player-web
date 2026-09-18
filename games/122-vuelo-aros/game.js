/**
 * Vuelo por aros — carrera aérea a pantalla partida.
 *
 * La avioneta no gira con el timón: se inclina y la inclinación la lleva. Con
 * las teclas se manda el alabeo y el morro, y el rumbo sale de ahí, así que
 * para cerrar una curva hay que tumbarla y tirar de morro a la vez. Cuesta dos
 * aros aprenderlo y luego se hace solo.
 *
 * Doce aros en orden. El siguiente se enciende y una flecha en el morro señala
 * dónde está; si te lo saltas, tendrás que dar la vuelta. Gana quien complete
 * el circuito antes.
 */

import { crearMundo, crearPanel, mat, caja, cilindro, suelo, perseguir, THREE } from '../../core/tres.js';

export const meta = { render: 'dom', sinCuentaAtras: false };

/** Circuito: centro de cada aro y hacia dónde mira (rumbo en radianes). */
const AROS = [
  [0, 26, -70, 0], [40, 34, -120, -0.5], [110, 44, -140, -1.2], [165, 32, -95, -1.9],
  [175, 24, -30, -2.6], [130, 36, 20, 3.0], [70, 46, 35, 2.5], [10, 30, 20, 2.0],
  [-45, 22, -10, 1.5], [-70, 34, -70, 0.9], [-40, 42, -120, 0.4], [10, 30, -140, 0.1],
];
const AR = 6.5;              // radio del aro

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#7fb2e0', horizonte: '#dbeaf7', sol: 2.6, solPos: [60, 80, 40],
    sombraArea: 90, fov: 68, niebla: 0.0032, lejos: 1400,
  });
  const panel = crearPanel(ctx.root);
  mundo.ambiente.intensity = 1.4;

  suelo(mundo, { color: '#3f6b34', veta: '#31532a', repite: 200, tam: 1600 });

  // Relieve: cerros y torres que dan sensación de velocidad y de altura.
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 320;
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 60;
    const alto = 12 + Math.random() * 34;
    const cerro = new THREE.Mesh(new THREE.ConeGeometry(10 + Math.random() * 16, alto, 6),
      mat(i % 4 ? '#39592f' : '#5b6a4a', { rug: 1 }));
    cerro.position.set(x, alto / 2, z);
    cerro.castShadow = true;
    mundo.escena.add(cerro);
  }
  for (let i = 0; i < 8; i++) {
    const x = -180 + Math.random() * 360, z = -200 + Math.random() * 260;
    mundo.escena.add(cilindro(1.2, 1.6, 40, mat('#c8cad0', { rug: 0.6 }), [x, 20, z], 8));
  }

  /* ---------------- Aros ---------------- */

  const aros = AROS.map(([x, y, z, rumbo], i) => {
    const g = new THREE.Group();
    const anillo = new THREE.Mesh(
      new THREE.TorusGeometry(AR, 0.42, 10, 32),
      mat('#e8e8ee', { rug: 0.4, emisivo: '#333344', brillo: 0.2 }),
    );
    g.add(anillo);
    const poste = cilindro(0.3, 0.4, y, mat('#b8bcc4', { rug: 0.7 }), [0, -y / 2 - AR / 2, 0], 8);
    g.add(poste);
    g.position.set(x, y, z);
    g.rotation.y = rumbo;
    mundo.escena.add(g);
    return { grupo: g, anillo, pos: new THREE.Vector3(x, y, z), i };
  });

  /* ---------------- Avionetas ---------------- */

  function crearAvion(color) {
    const g = new THREE.Group();
    const fuselaje = caja(0.9, 0.9, 5.4, mat(color, { rug: 0.35, met: 0.3 }), [0, 0, 0]);
    const morro = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.4, 10), mat('#20242c', { rug: 0.4, met: 0.5 }));
    morro.rotation.x = Math.PI / 2;
    morro.position.z = 3.2;
    const ala = caja(9.5, 0.16, 1.5, mat(color, { rug: 0.4 }), [0, 0.25, 0.2]);
    const cola = caja(3.4, 0.14, 0.8, mat(color, { rug: 0.4 }), [0, 0.3, -2.4]);
    const deriva = caja(0.14, 1.5, 1, mat(color, { rug: 0.4 }), [0, 0.9, -2.5]);
    const cabina = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), mat('#101820', { rug: 0.1, met: 0.6 }));
    cabina.position.set(0, 0.55, 0.6);
    const helice = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3, 0.1), mat('#1c1c22', { rug: 0.6 }));
    helice.position.z = 3.9;
    g.add(fuselaje, morro, ala, cola, deriva, cabina, helice);
    g.traverse((o) => { o.castShadow = true; });
    mundo.escena.add(g);
    return { g, helice };
  }

  const aviones = [0, 1].map((i) => {
    const { g, helice } = crearAvion(players[i].color);
    return {
      malla: g, helice,
      pos: new THREE.Vector3(i ? 14 : -14, 30, 30),
      rumbo: Math.PI,
      cabeceo: 0,
      alabeo: 0,
      rapidez: 30,
      siguiente: 0,
      cam: mundo.camaraExtra(70),
      tiempo: 0,
      choques: 0,
    };
  });

  /* ---------------- Estado ---------------- */

  let acabado = false;
  let marcador = null;
  let aviso = '', avisoT = 0;
  const decir = (t, s = 2) => { aviso = t; avisoT = s; };

  function volar(av, p, dt) {
    const gas = p.held('a');
    const freno = p.held('b');
    // Alabeo: las teclas piden inclinación y el avión vuelve solo al horizonte.
    const pedido = (p.held('left') ? 1 : 0) - (p.held('right') ? 1 : 0);
    av.alabeo += (pedido * 1.05 - av.alabeo) * Math.min(1, dt * 3.4);
    const pedidoCab = (p.held('up') ? -1 : 0) + (p.held('down') ? 1 : 0);
    av.cabeceo += (pedidoCab * 0.55 - av.cabeceo) * Math.min(1, dt * 3);

    // El rumbo sale de la inclinación, como en un avión de verdad.
    av.rumbo += av.alabeo * 0.95 * dt * Math.min(1.4, av.rapidez / 26);

    const objetivoVel = gas ? 62 : freno ? 20 : 38;
    av.rapidez += (objetivoVel - av.rapidez) * Math.min(1, dt * (gas ? 1.1 : 0.8));
    // Subir cuesta velocidad y bajar la regala: el intercambio de energía.
    av.rapidez -= av.cabeceo * 9 * dt;
    av.rapidez = Math.max(14, Math.min(70, av.rapidez));

    const dir = new THREE.Vector3(
      Math.sin(av.rumbo) * Math.cos(av.cabeceo),
      -Math.sin(av.cabeceo),
      Math.cos(av.rumbo) * Math.cos(av.cabeceo),
    );
    av.pos.addScaledVector(dir, av.rapidez * dt);

    if (av.pos.y < 4) {
      // Contra el suelo: rebote feo, pérdida de velocidad y un susto.
      av.pos.y = 4;
      av.cabeceo = -0.3;
      av.rapidez *= 0.55;
      av.choques++;
      audio.hit();
      haptics.impact(av === aviones[0] ? 0 : 1, 1);
      decir(`${players[av === aviones[0] ? 0 : 1].name} rozó el suelo`, 1.4);
    }
    if (av.pos.y > 120) { av.pos.y = 120; av.cabeceo = 0.2; }

    av.malla.position.copy(av.pos);
    av.malla.rotation.set(0, 0, 0, 'YXZ');
    av.malla.rotation.y = av.rumbo;
    av.malla.rotation.x = av.cabeceo;
    av.malla.rotation.z = -av.alabeo * 0.9;
    av.helice.rotation.z += dt * (12 + av.rapidez * 0.6);
    av.tiempo += dt;

    // ¿Ha cruzado el aro que le toca?
    const aro = aros[av.siguiente];
    if (!aro) return;
    if (av.pos.distanceTo(aro.pos) < AR - 0.6) {
      av.siguiente++;
      audio.arp([700, 1050], 0.05);
      haptics.score(av === aviones[0] ? 0 : 1);
      if (av.siguiente >= aros.length) terminar(av);
    }

    if (Math.random() < dt * 3) audio.tone({ freq: 80 + av.rapidez * 2, dur: 0.05, gain: 0.025, type: 'sawtooth' });
  }

  function terminar(av) {
    if (acabado) return;
    acabado = true;
    const g = av === aviones[0] ? 0 : 1;
    audio.win();
    haptics.victory(g);
    setTimeout(() => ctx.finish({
      winner: g,
      scores: [aviones[0].siguiente, aviones[1].siguiente],
      detail: `${aros.length} aros en ${av.tiempo.toFixed(1)} s · ${av.choques} roces`,
      record: ctx.record('tiempo', Math.round(av.tiempo * 10) / 10, 'low'),
    }), 800);
  }

  function pintarPanel() {
    const [a, b] = aviones;
    panel.centro(avisoT > 0 ? aviso : '');
    panel.sub('');
    panel.pie(`${players[0].name}: aro ${Math.min(a.siguiente + 1, aros.length)}/${aros.length} · ${a.rapidez.toFixed(0)} m/s   —   ${players[1].name}: aro ${Math.min(b.siguiente + 1, aros.length)}/${aros.length} · ${b.rapidez.toFixed(0)} m/s`);
    panel.barra(null);
  }

  return {
    init() {
      aviones.forEach((av) => { av.malla.position.copy(av.pos); av.cam.position.copy(av.pos); });
      marcador = ctx.ui.scoreboard({ center: `0/${aros.length}` });
      marcador.update(0, 0);
    },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      if (!acabado) {
        volar(aviones[0], input.player(0), dt);
        volar(aviones[1], input.player(1), dt);
      }

      // El aro de cada uno late; los pasados se apagan.
      const pulso = 0.55 + Math.sin(performance.now() * 0.005) * 0.45;
      aros.forEach((aro, i) => {
        const objetivo = aviones.some((av) => av.siguiente === i);
        aro.anillo.material.emissive.setStyle(objetivo ? '#ffd166' : '#333344');
        aro.anillo.material.emissiveIntensity = objetivo ? pulso : 0.15;
      });

      for (const av of aviones) {
        perseguir(av.cam, av.malla, dt, {
          distancia: 13 + av.rapidez * 0.1, altura: 3.6 + av.cabeceo * 4,
          mirarAlto: 0.5, suavidad: 5.5, giro: av.rumbo,
        });
      }

      marcador?.update(aviones[0].siguiente, aviones[1].siguiente);
      pintarPanel();
      mundo.dibujarPartida(aviones[0].cam, aviones[1].cam);
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
