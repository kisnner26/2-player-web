/**
 * Grúa — ocho contenedores cada uno y a ver quién levanta la pila más alta.
 *
 * La carga cuelga de un cable, así que no está donde está el carro: va detrás.
 * El balanceo es un péndulo de verdad, movido por la aceleración del carro —
 * frenar en seco lanza el contenedor hacia delante, y salir despacio casi no lo
 * mueve. Soltar bien es esperar a que la carga pase por el punto muerto.
 *
 * Cada contenedor mal puesto desplaza el centro de la pila. Cuando se sale de
 * la base, la torre entera se viene abajo y ese jugador se queda sin nada. Los
 * dos operan a la vez, sin turnos.
 */

import { crearMundo, crearPanel, mat, caja, cilindro, suelo, texturaGrano, THREE } from '../../core/tres.js';
import * as F from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: false };

const CONTENEDORES = 8;
const AN = 3.2, AL = 1.5, FO = 2.2;      // medidas del contenedor
const CARRO_Y = 16;
const BASES = [-9, 9];                    // centro de la plataforma de cada jugador

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#8aa7c0', horizonte: '#c8d8e4', sol: 2.4, solPos: [20, 34, 22],
    sombraArea: 28, fov: 48, niebla: 0.007, lejos: 300,
  });
  const panel = crearPanel(ctx.root);
  mundo.ambiente.intensity = 1.25;

  mundo.camara.position.set(0, 13, 34);
  mundo.camara.lookAt(0, 8, 0);

  suelo(mundo, { color: '#4a4d55', veta: '#3a3d44', repite: 60, tam: 300 });

  // Puerto de fondo: contenedores apilados y grúas lejanas. Solo atrezo.
  for (let i = 0; i < 26; i++) {
    const x = -40 + Math.random() * 80, z = -30 - Math.random() * 26;
    const alto = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < alto; k++) {
      mundo.escena.add(caja(AN, AL, FO, mat(`hsl(${Math.floor(Math.random() * 360)},35%,42%)`, { rug: 0.8 }),
        [x, AL / 2 + k * AL, z]));
    }
  }
  const mar = new THREE.Mesh(new THREE.PlaneGeometry(400, 200),
    new THREE.MeshStandardMaterial({ color: 0x2b5f80, roughness: 0.2, metalness: 0.5 }));
  mar.rotation.x = -Math.PI / 2;
  mar.position.set(0, -0.4, -140);
  mundo.escena.add(mar);

  /* ---------------- Estructura de las grúas ---------------- */

  const matAcero = mat('#d8b02c', { rug: 0.55, met: 0.4 });
  for (const bx of BASES) {
    for (const s of [-1, 1]) {
      mundo.escena.add(cilindro(0.35, 0.4, CARRO_Y, matAcero, [bx + s * 5.5, CARRO_Y / 2, -3], 8));
      mundo.escena.add(cilindro(0.35, 0.4, CARRO_Y, matAcero, [bx + s * 5.5, CARRO_Y / 2, 3], 8));
      mundo.escena.add(caja(0.3, 0.3, 6.4, matAcero, [bx + s * 5.5, CARRO_Y - 1, 0]));
    }
    // Viga por la que corre el carro.
    mundo.escena.add(caja(13, 0.6, 1.2, matAcero, [bx, CARRO_Y + 0.4, 0]));
    // Plataforma de la pila.
    mundo.escena.add(caja(AN + 2.4, 0.5, FO + 2, mat('#5a5f68', { rug: 0.9 }), [bx, 0.25, 0]));
  }

  /* ---------------- Jugadores ---------------- */

  function crearContenedor(color) {
    const g = new THREE.Group();
    const cuerpo = caja(AN, AL, FO, mat(color, { rug: 0.72, met: 0.15 }), [0, 0, 0]);
    g.add(cuerpo);
    // Nervios verticales: sin ellos parece un ladrillo, con ellos un contenedor.
    for (let i = -4; i <= 4; i++) {
      g.add(caja(0.1, AL * 0.92, FO + 0.04, mat('#00000033', { rug: 1 }), [i * (AN / 10), 0, 0]));
    }
    g.add(caja(AN + 0.04, 0.12, FO + 0.04, mat('#ffffff22', { rug: 1 }), [0, AL / 2 - 0.06, 0]));
    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    return g;
  }

  const gruas = [0, 1].map((j) => {
    const carro = new THREE.Group();
    carro.add(caja(1.8, 0.8, 1.8, mat('#2c3038', { rug: 0.5, met: 0.4 }), [0, 0, 0]));
    carro.position.set(BASES[j], CARRO_Y, 0);
    mundo.escena.add(carro);

    const cable = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0x20242c }),
    );
    mundo.escena.add(cable);

    const carga = crearContenedor(players[j].color);
    mundo.escena.add(carga);

    return {
      j, carro, cable, carga,
      x: BASES[j], vx: 0,
      largo: 5,               // longitud de cable
      ang: 0, velAng: 0,      // péndulo
      restantes: CONTENEDORES,
      pila: [],               // { malla, x }
      cayendo: [],
      derrumbada: false,
      soltando: null,
      base: BASES[j],
    };
  });

  const alturaPila = (g) => g.pila.length * AL + 0.5;

  /* ---------------- Estado ---------------- */

  let acabado = false;
  let marcador = null;
  let aviso = '', avisoT = 0;
  const decir = (t, s = 2.2) => { aviso = t; avisoT = s; };

  function posCarga(g) {
    return new THREE.Vector3(
      g.x + Math.sin(g.ang) * g.largo,
      CARRO_Y - Math.cos(g.ang) * g.largo,
      0,
    );
  }

  function soltar(g) {
    if (g.soltando || !g.restantes || g.derrumbada) return;
    const p = posCarga(g);
    const vel = new THREE.Vector3(
      Math.cos(g.ang) * g.velAng * g.largo, Math.sin(g.ang) * g.velAng * g.largo, 0,
    );
    g.soltando = { pos: p.clone(), vel, malla: g.carga };
    g.restantes--;
    // Se prepara ya el siguiente contenedor colgando del gancho.
    g.carga = crearContenedor(players[g.j].color);
    mundo.escena.add(g.carga);
    g.carga.visible = g.restantes > 0;
    audio.tone({ freq: 220, dur: 0.08, gain: 0.12, type: 'square', sweep: -80 });
    haptics.tap(g.j);
  }

  function posar(g) {
    const s = g.soltando;
    const cima = g.pila.length;
    const objetivoX = cima ? g.pila[cima - 1].x : g.base;
    const desvio = s.pos.x - objetivoX;

    if (Math.abs(desvio) > AN * 0.62) {
      // Se sale del apoyo: el contenedor se desploma al suelo y se pierde.
      g.cayendo.push({ malla: s.malla, vel: s.vel.clone(), giro: Math.sign(desvio) * 2.4 });
      audio.explosion();
      haptics.error(g.j);
      decir(`${players[g.j].name} perdió un contenedor`, 2);
      g.soltando = null;
      comprobarFinal();
      return;
    }

    const x = objetivoX + desvio * 0.55;      // se asienta un poco al caer
    s.malla.position.set(x, alturaPila(g) + AL / 2, 0);
    s.malla.rotation.set(0, 0, 0);
    g.pila.push({ malla: s.malla, x });
    g.soltando = null;
    audio.thud();
    haptics.impact(g.j, 0.6);

    // Estabilidad: si el centro de la pila se sale de la base, se cae todo.
    const centro = g.pila.reduce((a, b) => a + b.x, 0) / g.pila.length;
    if (Math.abs(centro - g.base) > AN * 0.55) derrumbar(g);
    else {
      const bien = Math.abs(desvio) < 0.35;
      if (bien) { audio.arp([620, 880], 0.05); haptics.score(g.j); decir(`${players[g.j].name}: ¡clavado!`, 1.4); }
      marcador?.update(gruas[0].pila.length, gruas[1].pila.length);
      comprobarFinal();
    }
  }

  function derrumbar(g) {
    g.derrumbada = true;
    for (const b of g.pila) {
      g.cayendo.push({
        malla: b.malla,
        vel: new THREE.Vector3((Math.random() - 0.5) * 6, 1, (Math.random() - 0.5) * 3),
        giro: (Math.random() - 0.5) * 5,
      });
    }
    g.pila = [];
    audio.explosion();
    haptics.explosion(g.j);
    ctx.shake?.(10, 9);
    decir(`¡La pila de ${players[g.j].name} se vino abajo!`, 3);
    marcador?.update(gruas[0].pila.length, gruas[1].pila.length);
    comprobarFinal();
  }

  function comprobarFinal() {
    if (acabado) return;
    const [a, b] = gruas;
    const hecho = (g) => g.derrumbada || (g.restantes === 0 && !g.soltando);
    if (!hecho(a) || !hecho(b)) return;
    acabado = true;
    setTimeout(() => {
      if (a.pila.length === b.pila.length) {
        ctx.finish({ winner: -1, scores: [a.pila.length, b.pila.length], detail: 'Empate a altura' });
        return;
      }
      const g = a.pila.length > b.pila.length ? 0 : 1;
      ctx.finish({
        winner: g,
        scores: [a.pila.length, b.pila.length],
        detail: `${gruas[g].pila.length} contenedores de ${CONTENEDORES} en pie`,
        record: ctx.record('altura', Math.max(a.pila.length, b.pila.length), 'high'),
      });
    }, 2200);
  }

  function manejar(g, dt) {
    const p = input.player(g.j);
    if (g.derrumbada || !g.restantes) { g.carga.visible = false; return; }

    // Carro: aceleración limitada, para que el balanceo dependa de cómo conduces.
    const pedido = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
    const aCarro = pedido * 9 - g.vx * 2.2;
    g.vx += aCarro * dt;
    g.x += g.vx * dt;
    let acel = aCarro;
    if (g.x < g.base - 5 || g.x > g.base + 5) {
      // Topar con el final del recorrido es un frenazo: la carga sale disparada.
      g.x = Math.max(g.base - 5, Math.min(g.base + 5, g.x));
      acel = -Math.sign(g.vx) * 25;
      g.vx = 0;
    }

    // Cable: bajar acerca la carga y acorta el péndulo (se balancea más rápido).
    const minLargo = Math.max(1.6, CARRO_Y - alturaPila(g) - AL * 1.1);
    if (p.held('down')) g.largo = Math.min(minLargo, g.largo + 5 * dt);
    if (p.held('up')) g.largo = Math.max(2, g.largo - 5 * dt);
    g.largo = Math.min(g.largo, minLargo);

    // Péndulo: la aceleración del carro es lo que lo mueve.
    const aAng = -(9.81 / g.largo) * Math.sin(g.ang) - (acel / g.largo) * Math.cos(g.ang) - g.velAng * 0.5;
    g.velAng += aAng * dt;
    g.ang += g.velAng * dt;

    if (p.pressed('a')) soltar(g);

    g.carro.position.x = g.x;
    const pc = posCarga(g);
    g.carga.position.copy(pc);
    g.carga.rotation.z = -g.ang * 0.35;
    const arr = g.cable.geometry.attributes.position.array;
    arr[0] = g.x; arr[1] = CARRO_Y; arr[2] = 0;
    arr[3] = pc.x; arr[4] = pc.y + AL / 2; arr[5] = pc.z;
    g.cable.geometry.attributes.position.needsUpdate = true;
    g.cable.visible = g.carga.visible;
  }

  function caidas(g, dt) {
    if (g.soltando) {
      const s = g.soltando;
      s.vel.y -= 9.81 * dt;
      s.pos.addScaledVector(s.vel, dt);
      s.malla.position.copy(s.pos);
      if (s.pos.y <= alturaPila(g) + AL / 2) posar(g);
    }
    for (let i = g.cayendo.length - 1; i >= 0; i--) {
      const c = g.cayendo[i];
      c.vel.y -= 9.81 * dt;
      c.malla.position.addScaledVector(c.vel, dt);
      c.malla.rotation.z += c.giro * dt;
      if (c.malla.position.y <= AL / 2) {
        c.malla.position.y = AL / 2;
        c.vel.set(0, 0, 0);
        c.giro *= 0.5;
        if (Math.abs(c.giro) < 0.2) g.cayendo.splice(i, 1);
      }
    }
  }

  function pintarPanel() {
    const [a, b] = gruas;
    panel.centro(avisoT > 0 ? aviso : `${a.pila.length} — ${b.pila.length} contenedores`);
    panel.sub(`<span style="color:${players[0].color}">${players[0].name}: quedan ${a.restantes}</span>
      &nbsp;·&nbsp; <span style="color:${players[1].color}">${players[1].name}: quedan ${b.restantes}</span>`);
    panel.pie('← → mover el carro · ↑ ↓ subir y bajar el cable · acción: soltar');
    panel.barra(null);
  }

  return {
    init() {
      gruas.forEach((g) => { g.carga.position.copy(posCarga(g)); });
      marcador = ctx.ui.scoreboard({ center: 'Grúa' });
      marcador.update(0, 0);
    },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      for (const g of gruas) {
        if (!acabado) manejar(g, dt);
        caidas(g, dt);
      }
      // La cámara se abre hacia arriba según crecen las pilas.
      const alto = Math.max(alturaPila(gruas[0]), alturaPila(gruas[1]));
      const objetivo = new THREE.Vector3(0, 9 + alto * 0.35, 34);
      mundo.camara.position.lerp(objetivo, 1 - Math.exp(-2 * dt));
      mundo.camara.lookAt(0, 5 + alto * 0.5, 0);
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
