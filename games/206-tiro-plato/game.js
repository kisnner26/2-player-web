/**
 * Tiro al Plato — dos cartuchos y un plato que no espera.
 *
 * La escopeta abre un cono: no hace falta clavar el punto exacto, hace falta
 * llegar A TIEMPO. Y ahí está el juego, porque el plato acelera al salir y va
 * frenando, así que el momento fácil es justo al principio, cuando todavía no
 * te ha dado tiempo a llevar la mira.
 *
 * Dos cartuchos por plato: el primero es el bueno y el segundo es el de la
 * desesperación, con el plato ya lejos y pequeño.
 */

import { crearMundo, crearPanel, suelo, mat, caja, esfera, cilindro, THREE } from '../../core/tres.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const PLATOS = 6;              // por jugador
const CONO = 0.085;            // apertura del disparo, en radianes
const CARTUCHOS = 2;

export function create(ctx) {
  const { input, audio, haptics, players, rng } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#7fb4d8', horizonte: '#d8e2ea', sol: 2.6, solPos: [10, 30, 20],
    sombraArea: 26, fov: 46, niebla: 0.008,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#4a6b3c', veta: '#3f5e33', repite: 60 });

  // Casetas de lanzamiento y árboles lejanos, para dar escala al cielo.
  mundo.escena.add(caja(2.4, 1.2, 2, mat('#4a4030'), [-9, 0.6, -10]));
  for (let i = 0; i < 22; i++) {
    const x = (rng() - 0.5) * 120;
    const z = -30 - rng() * 60;
    const alto = 4 + rng() * 5;
    mundo.escena.add(cilindro(0.1, 0.4, alto, mat('#2e3f28'), [x, alto / 2, z]));
  }

  const plato = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), vivo: false, giro: 0 };
  plato.malla = cilindro(0.42, 0.42, 0.09, mat('#e8722c', { rug: 0.6 }), [0, 0, 0], 20);
  plato.malla.visible = false;
  mundo.escena.add(plato.malla);

  const trozos = [];
  for (let i = 0; i < 14; i++) {
    const m = caja(0.16, 0.05, 0.16, mat('#e8722c'), [0, -50, 0]);
    m.visible = false;
    mundo.escena.add(m);
    trozos.push({ m, vel: new THREE.Vector3(), vida: 0 });
  }

  let turno = 0, lanzados = [0, 0], aciertos = [0, 0], cartuchos = CARTUCHOS;
  let mira = { x: 0, y: 0.32 }, fase = 'listo', espera = 1, t = 0, mensaje = '';
  let marcador = null, terminado = false, fogonazo = 0;

  const camBase = new THREE.Vector3(0, 1.7, 14);

  function lanzarPlato() {
    const desdeIzq = rng() < 0.5;
    plato.pos.set(desdeIzq ? -9 : 9, 1.3, -10);
    // Trayectoria alta que cruza el campo de visión.
    plato.vel.set((desdeIzq ? 1 : -1) * (9 + rng() * 5), 9 + rng() * 2.4, -3 - rng() * 5);
    plato.vivo = true;
    plato.malla.visible = true;
    plato.giro = 0;
    cartuchos = CARTUCHOS;
    fase = 'volando';
    mensaje = '';
    audio.tone({ freq: 300, dur: 0.12, gain: 0.14, type: 'square' });
  }

  function romper() {
    plato.vivo = false;
    plato.malla.visible = false;
    aciertos[turno]++;
    marcador.update(aciertos[0], aciertos[1]);
    audio.explosion();
    haptics.score(turno);
    let k = 0;
    for (const tr of trozos) {
      if (k++ > 12) break;
      tr.m.position.copy(plato.pos);
      tr.m.visible = true;
      tr.vel.set((rng() - 0.5) * 9, rng() * 6, (rng() - 0.5) * 9);
      tr.vida = 1.6;
    }
    mensaje = '¡Roto!';
    fase = 'pausa';
    espera = 1.4;
  }

  function disparar() {
    if (cartuchos <= 0) return;
    cartuchos--;
    fogonazo = 0.12;
    audio.noise({ dur: 0.3, gain: 0.34, filter: 1400, sweep: -900 });
    haptics.impact(turno, 1.4);
    ctx.shake?.(6);

    if (!plato.vivo) return;
    // ¿El plato cae dentro del cono de la mira?
    const dir = new THREE.Vector3(Math.sin(mira.x), Math.sin(mira.y), -1).normalize();
    const hacia = plato.pos.clone().sub(mundo.camara.position).normalize();
    const ang = dir.angleTo(hacia);
    const dist = plato.pos.distanceTo(mundo.camara.position);
    // El cono se abre con la distancia, pero también se diluye: lejos hay que afinar.
    if (ang < CONO * (1 + dist / 90)) romper();
    else if (cartuchos === 0) { mensaje = 'Los dos cartuchos fuera'; fase = 'pausa'; espera = 1.2; }
  }

  function siguiente() {
    lanzados[turno]++;
    if (lanzados[0] >= PLATOS && lanzados[1] >= PLATOS) {
      terminado = true;
      const g = aciertos[0] === aciertos[1] ? -1 : (aciertos[0] > aciertos[1] ? 0 : 1);
      ctx.finish({
        winner: g, scores: aciertos,
        detail: `${aciertos[0]} y ${aciertos[1]} platos de ${PLATOS}`,
        record: ctx.record('platos', Math.max(...aciertos), 'high'),
      });
      return;
    }
    turno = lanzados[1] < lanzados[0] ? 1 : 0;
    mira = { x: 0, y: 0.32 };
    plato.vivo = false;
    plato.malla.visible = false;
    fase = 'listo';
    espera = 1;
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `${PLATOS} platos cada uno` });
      mundo.camara.position.copy(camBase);
    },

    update(dt) {
      if (terminado) return;
      t += dt;
      fogonazo = Math.max(0, fogonazo - dt);
      const p = input.player(turno);

      if (fase === 'listo') {
        espera -= dt;
        if (p.pressed('a') || espera <= 0) lanzarPlato();
      } else if (fase === 'volando') {
        plato.vel.y -= 9.8 * dt;
        plato.vel.multiplyScalar(Math.exp(-0.35 * dt));
        plato.pos.addScaledVector(plato.vel, dt);
        plato.giro += dt * 14;
        plato.malla.position.copy(plato.pos);
        plato.malla.rotation.set(Math.PI / 2 - 0.3, plato.giro, 0);
        if (plato.pos.y < 0.2 || Math.abs(plato.pos.x) > 40) {
          mensaje = 'Al suelo';
          fase = 'pausa';
          espera = 1.1;
        }
      } else if (fase === 'pausa') {
        espera -= dt;
        if (espera <= 0) siguiente();
      }

      if (fase !== 'pausa') {
        const v = 1.15;
        if (p.held('left')) mira.x -= v * dt;
        if (p.held('right')) mira.x += v * dt;
        if (p.held('up')) mira.y += v * dt;
        if (p.held('down')) mira.y -= v * dt;
        mira.x = Math.max(-0.9, Math.min(0.9, mira.x));
        mira.y = Math.max(-0.1, Math.min(0.85, mira.y));
        if (p.pressed('a') && fase === 'volando') disparar();
      }

      for (const tr of trozos) {
        if (tr.vida <= 0) { tr.m.visible = false; continue; }
        tr.vida -= dt;
        tr.vel.y -= 9.8 * dt;
        tr.m.position.addScaledVector(tr.vel, dt);
        tr.m.rotation.x += dt * 6;
      }

      // La cámara ES la mira: mirar y apuntar son lo mismo.
      mundo.camara.position.copy(camBase);
      const objetivo = new THREE.Vector3(
        camBase.x + Math.sin(mira.x) * 40,
        camBase.y + Math.sin(mira.y) * 40,
        camBase.z - 40,
      );
      mundo.camara.lookAt(objetivo);

      panel.centro(fase === 'pausa'
        ? mensaje
        : `tira <b style="color:${players[turno].color}">${players[turno].name}</b> · plato ${lanzados[turno] + 1}/${PLATOS}`);
      panel.sub(fogonazo > 0
        ? '¡BANG!'
        : `cartuchos: ${'●'.repeat(cartuchos)}${'○'.repeat(CARTUCHOS - cartuchos)} · aciertos ${aciertos[0]} — ${aciertos[1]}`);
      panel.pie('Mueve la mira con tus direcciones · tu tecla dispara (y lanza el plato al empezar)');
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
