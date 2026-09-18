/**
 * Curling — cuatro piedras cada uno y a ver quién queda más cerca del centro.
 *
 * Tiene las tres cosas del curling de verdad. El efecto: la piedra sale girando
 * y se curva cada vez más según pierde velocidad, así que se puede rodear una
 * guarda. El barrido: mientras se desliza, machacar la tecla pule el hielo,
 * alarga el recorrido y endereza la curva. Y el choque: las piedras se pegan
 * entre ellas, y sacar la del rival del centro vale tanto como colocar la tuya.
 *
 * Puntúa quien tenga la piedra más cerca de la diana, y suma una por cada
 * piedra suya que esté más cerca que la mejor del rival.
 */

import { crearMundo, crearPanel, mat, caja, cilindro, esfera, texturaGrano, THREE } from '../../core/tres.js';
import * as F from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const LARGO = 42;
const MEDIO = 2.4;
const CASA_Z = 16;
const R = 0.29;
const PIEDRAS = 4;          // por jugador
const ANILLOS = [1.83, 1.22, 0.61, 0.16];

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#0d1622', horizonte: '#2e4a66', sol: 1.9, solPos: [10, 26, -14],
    sombraArea: 22, fov: 40, niebla: 0.009, lejos: 260,
  });
  const panel = crearPanel(ctx.root);

  /* ---------------- Pista de hielo ---------------- */

  const hielo = new THREE.Mesh(
    new THREE.BoxGeometry(MEDIO * 2, 0.3, LARGO),
    new THREE.MeshStandardMaterial({
      map: texturaGrano('#dbe9f2', '#c3d8e8', { repite: 3, ruido: 0.03 }),
      roughness: 0.09, metalness: 0.16,
    }),
  );
  hielo.position.set(0, -0.15, LARGO / 2 - 8);
  hielo.receiveShadow = true;
  mundo.escena.add(hielo);
  mundo.escena.add(caja(40, 0.2, 70, mat('#0a1018', { rug: 1 }), [0, -0.35, 10]));
  for (const s of [-1, 1]) {
    mundo.escena.add(caja(0.35, 0.5, LARGO, mat('#22303f', { rug: 0.8 }), [s * (MEDIO + 0.17), 0.1, LARGO / 2 - 8]));
  }

  // La casa: cuatro anillos pintados bajo el hielo.
  const colores = ['#2a6fb0', '#f2f5f8', '#c0392b', '#f2f5f8'];
  ANILLOS.forEach((r, i) => {
    const anillo = new THREE.Mesh(
      new THREE.CircleGeometry(r, 48),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(colores[i]), roughness: 0.5 }),
    );
    anillo.rotation.x = -Math.PI / 2;
    anillo.position.set(0, 0.003 + i * 0.002, CASA_Z);
    mundo.escena.add(anillo);
  });
  // Línea de tee y de salida: referencias que se usan al apuntar.
  for (const z of [CASA_Z, 0]) {
    mundo.escena.add(caja(MEDIO * 2, 0.006, 0.06, mat('#8fa9bd', { rug: 0.7 }), [0, 0.008, z]));
  }

  /* ---------------- Piedras ---------------- */

  const piedras = [];

  function crearPiedra(jugador) {
    const g = new THREE.Group();
    const granito = cilindro(R, R * 0.94, 0.24, mat('#4a4f57', { rug: 0.35, met: 0.1 }), [0, 0, 0], 24);
    const banda = cilindro(R * 1.01, R * 1.01, 0.07, mat(players[jugador].color, { rug: 0.5 }), [0, 0.06, 0], 24);
    const asa = new THREE.Group();
    asa.add(caja(0.05, 0.05, 0.3, mat('#e8e8ee', { rug: 0.4 }), [0, 0.2, 0]));
    asa.add(caja(0.05, 0.13, 0.05, mat('#e8e8ee', { rug: 0.4 }), [0, 0.13, 0.13]));
    g.add(granito, banda, asa);
    g.castShadow = true;
    g.position.y = 0.14;
    mundo.escena.add(g);
    const c = F.cuerpo({ y: 0.14, r: R, masa: 19, malla: g });
    c.jugador = jugador;
    c.efecto = 0;
    c.retirada = false;
    piedras.push(c);
    return c;
  }

  /* ---------------- Estado ---------------- */

  let turno = 0;
  const lanzadas = [0, 0];
  let actual = null;
  let fase = 'apuntar';        // apuntar | fuerza | deslizando | pausa
  let angulo = 0;
  let fuerza = 0;
  let efecto = 1;              // -1 antihorario, 1 horario
  let barridos = 0;
  let espera = 0;
  let aviso = '', avisoT = 0;
  let marcador = null;
  let acabado = false;

  const decir = (t, s = 2.2) => { aviso = t; avisoT = s; };
  const dCasa = (p) => Math.hypot(p.pos.x, p.pos.z - CASA_Z);
  const enCasa = (p) => !p.retirada && dCasa(p) < ANILLOS[0] + R;

  const guiaGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const guia = new THREE.Line(guiaGeo, new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.5, gapSize: 0.4, transparent: true, opacity: 0.6 }));
  mundo.escena.add(guia);

  function prepararTirada() {
    actual = crearPiedra(turno);
    actual.pos.set(0, 0.14, -6);
    actual.malla.position.copy(actual.pos);
    angulo = 0;
    fuerza = 0;
    barridos = 0;
    fase = 'apuntar';
  }

  function lanzar() {
    const v = 4.2 + fuerza * 6.4;
    actual.vel.set(Math.sin(angulo) * v, 0, Math.cos(angulo) * v);
    actual.efecto = efecto;
    actual.quieto = false;
    fase = 'deslizando';
    audio.tone({ freq: 120, dur: 0.4, gain: 0.14, type: 'sine', sweep: -30 });
    audio.noise({ dur: 0.6, gain: 0.06, filter: 900 });
    haptics.impact(turno, 0.4 + fuerza * 0.5);
  }

  function paso(dt) {
    // El barrido pule el hielo: menos rozamiento y menos curva.
    const barre = input.player(turno).held('a') || input.player(turno).pressed('a');
    if (input.player(turno).pressed('a')) barridos++;
    const pulido = barre ? 0.55 : 1;

    for (const p of piedras) {
      if (p.retirada) continue;
      const v = Math.hypot(p.vel.x, p.vel.z);
      if (p === actual && v > 0.2) {
        // La curva crece cuando la piedra pierde velocidad: es lo que hace que
        // el curling se juegue con paciencia y no a lo bruto. La aceleración va
        // perpendicular a la marcha, hacia el lado del efecto.
        const curva = (p.efecto * 1.5 * pulido) / (v + 1.2);
        p.vel.x += (p.vel.z / v) * curva * dt;
        p.vel.z += (-p.vel.x / v) * curva * dt;
      }
      F.integrar(p, dt, { gravedad: 0 });
      F.rodar(p, dt, { friccion: 0.135 * pulido, umbral: 0.09 });
      // Fuera de la pista o pasada de largo: la piedra se retira.
      if (Math.abs(p.pos.x) > MEDIO || p.pos.z > CASA_Z + 6 || p.pos.z < -8) {
        p.retirada = true;
        p.malla.visible = false;
        if (p === actual) { decir('Se fue larga', 1.8); audio.error(); }
      }
      p.malla.position.copy(p.pos);
      p.malla.rotation.y += p.efecto * v * dt * 0.6;
    }

    for (let i = 0; i < piedras.length; i++) {
      if (piedras[i].retirada) continue;
      for (let j = i + 1; j < piedras.length; j++) {
        if (piedras[j].retirada) continue;
        const g = F.chocar(piedras[i], piedras[j], 0.9);
        if (g > 0.4) {
          audio.tone({ freq: 300, dur: 0.12, gain: Math.min(0.2, 0.06 + g * 0.05), type: 'sine', sweep: -120 });
          audio.noise({ dur: 0.08, gain: 0.08, filter: 1800 });
          haptics.impact(turno, Math.min(1, g * 0.5));
        }
      }
    }

    if (F.todoQuieto(piedras, 0.1)) { fase = 'pausa'; espera = 1; }
  }

  function siguiente() {
    lanzadas[turno]++;
    const mejor = piedras.filter(enCasa).sort((a, b) => dCasa(a) - dCasa(b))[0];
    if (mejor && mejor === actual) { decir(`${players[turno].name} manda en la casa`, 2); haptics.score(turno); }
    marcador?.update(...contar());

    if (lanzadas[0] >= PIEDRAS && lanzadas[1] >= PIEDRAS) { terminar(); return; }
    // Se alterna siempre; si a uno no le quedan, tira el otro.
    turno = lanzadas[1 - turno] < PIEDRAS ? 1 - turno : turno;
    prepararTirada();
  }

  /** Puntos de cada jugador con las piedras que hay ahora en la casa. */
  function contar() {
    const dentro = piedras.filter(enCasa).sort((a, b) => dCasa(a) - dCasa(b));
    if (!dentro.length) return [0, 0];
    const dueño = dentro[0].jugador;
    let n = 0;
    for (const p of dentro) { if (p.jugador === dueño) n++; else break; }
    return dueño === 0 ? [n, 0] : [0, n];
  }

  function terminar() {
    acabado = true;
    const [a, b] = contar();
    const dentro = piedras.filter(enCasa).sort((x, y) => dCasa(x) - dCasa(y));
    ctx.finish({
      winner: a === b ? -1 : (a > b ? 0 : 1),
      scores: [a, b],
      detail: dentro.length
        ? `Piedra más cercana a ${dCasa(dentro[0]).toFixed(2)} m del centro`
        : 'Ninguna piedra se quedó en la casa',
      record: ctx.record('puntos', Math.max(a, b), 'high'),
    });
  }

  function moverCamara(dt) {
    const foco = fase === 'deslizando' && actual && !actual.retirada
      ? actual.pos
      : new THREE.Vector3(0, 0, fase === 'pausa' ? CASA_Z : 2);
    const objetivo = new THREE.Vector3(foco.x * 0.4, 6.4, foco.z - 11);
    mundo.camara.position.lerp(objetivo, 1 - Math.exp(-2.6 * dt));
    mundo.camara.lookAt(foco.x * 0.5, 0, foco.z + 6);
  }

  function pintarGuia() {
    const ver = (fase === 'apuntar' || fase === 'fuerza') && actual;
    guia.visible = !!ver;
    if (!ver) return;
    const arr = guiaGeo.attributes.position.array;
    arr[0] = actual.pos.x; arr[1] = 0.05; arr[2] = actual.pos.z;
    arr[3] = actual.pos.x + Math.sin(angulo) * 16;
    arr[4] = 0.05;
    arr[5] = actual.pos.z + Math.cos(angulo) * 16;
    guiaGeo.attributes.position.needsUpdate = true;
    guia.computeLineDistances();
  }

  function pintarPanel() {
    if (acabado) { panel.centro('Fin del end'); panel.barra(null); return; }
    const j = players[turno];
    const [a, b] = contar();
    panel.centro(`<span style="color:${j.color}">${j.name}</span> · piedra ${lanzadas[turno] + 1}/${PIEDRAS}`);
    const txt = {
      apuntar: `Efecto ${efecto > 0 ? 'horario ↻' : 'antihorario ↺'} — cambia con ↑ ↓`,
      fuerza: 'Suelta cuando tengas el peso',
      deslizando: `¡Barre! Machaca la tecla de acción · ${barridos} barridos`,
      pausa: 'Midiendo…',
    }[fase];
    panel.sub(avisoT > 0 ? aviso : txt);
    panel.pie(`En la casa: ${players[0].name} ${a} — ${b} ${players[1].name} · ← → apuntar · acción: fuerza y barrido`);
    panel.barra(fase === 'apuntar' || fase === 'fuerza' ? fuerza : null, fuerza > 0.85 ? '#ff4757' : j.color);
  }

  return {
    init() {
      prepararTirada();
      marcador = ctx.ui.scoreboard({ center: 'Curling' });
      marcador.update(0, 0);
    },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      const p = input.player(turno);

      if (fase === 'apuntar') {
        if (p.held('left')) angulo += 0.16 * dt;
        if (p.held('right')) angulo -= 0.16 * dt;
        angulo = Math.max(-0.16, Math.min(0.16, angulo));
        if (p.pressed('up') || p.pressed('down')) { efecto = -efecto; audio.blip(); }
        if (p.pressed('a')) { fase = 'fuerza'; fuerza = 0; }
      } else if (fase === 'fuerza') {
        fuerza = Math.min(1, fuerza + dt * 0.55);
        if (p.released('a') || fuerza >= 1) lanzar();
      } else if (fase === 'deslizando') {
        paso(dt);
      } else if (fase === 'pausa') {
        espera -= dt;
        if (espera <= 0 && !acabado) siguiente();
      }

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
