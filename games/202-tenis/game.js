/**
 * Tenis — pista de verdad: bote obligatorio, red que perdona poco y efecto.
 *
 * La bola tiene que botar en su campo antes de que la golpee: si le da al aire
 * fuera de la pista, punto tuyo. Y el efecto no es decoración — liftado cae
 * antes y bota alto, cortado se queda corto y muere. Elegir el golpe es
 * elegir dónde va a botar.
 *
 * La cámara va detrás del que resta, así que la pista se lee como en la tele
 * y los dos ven lo mismo. Se juega a un juego corto: cuatro puntos.
 */

import { crearMundo, crearPanel, suelo, mat, caja, esfera, cilindro, sombraContacto, ajustarSombra, THREE } from '../../core/tres.js';

export const meta = { render: 'dom' };

const LARGO = 24;              // de fondo a fondo
const ANCHO = 11;
const RED_ALTO = 1.1;
const PARA_GANAR = 4;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#3a6ea8', horizonte: '#8fb0c8', sol: 2.6, solPos: [12, 30, 8],
    sombraArea: 30, fov: 42, niebla: 0.004,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#2f6a4a', veta: '#28603f', repite: 40 });

  // Pista
  const pista = caja(ANCHO + 4, 0.1, LARGO + 6, mat('#1f6ea8', { rug: 0.9 }), [0, 0.01, 0]);
  mundo.escena.add(pista);
  const lineas = new THREE.Group();
  const linea = (an, fo, x, z) => caja(an, 0.02, fo, mat('#f2f2f2', { rug: 0.6 }), [x, 0.07, z]);
  lineas.add(linea(ANCHO, 0.14, 0, -LARGO / 2), linea(ANCHO, 0.14, 0, LARGO / 2));
  lineas.add(linea(0.14, LARGO, -ANCHO / 2, 0), linea(0.14, LARGO, ANCHO / 2, 0));
  lineas.add(linea(ANCHO, 0.1, 0, -LARGO * 0.25), linea(ANCHO, 0.1, 0, LARGO * 0.25));
  mundo.escena.add(lineas);

  // Red
  const red = caja(ANCHO + 1.2, RED_ALTO, 0.08, mat('#e8e8f0', { rug: 0.9, transparente: 0.75 }), [0, RED_ALTO / 2, 0]);
  mundo.escena.add(red);
  mundo.escena.add(caja(ANCHO + 1.2, 0.08, 0.14, mat('#ffffff'), [0, RED_ALTO, 0]));

  const bola = { pos: new THREE.Vector3(0, 1, LARGO * 0.4), vel: new THREE.Vector3(), r: 0.16, botes: 0, ultimo: 1 };
  bola.malla = esfera(bola.r, mat('#d8f24a', { rug: 0.6 }), [0, 1, 0], 16);
  bola.malla.castShadow = true;
  mundo.escena.add(bola.malla);
  const sombraBola = sombraContacto(0.3, 0.4);
  mundo.escena.add(sombraBola);

  const jug = [0, 1].map((i) => {
    const g = new THREE.Group();
    const cuerpoM = cilindro(0.32, 0.36, 1.7, mat(players[i].color, { rug: 0.6 }), [0, 0.85, 0]);
    cuerpoM.castShadow = true;
    const cabeza = esfera(0.26, mat('#e8c9a0'), [0, 1.9, 0], 14);
    const raqueta = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.05, 8, 20),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#222'), roughness: 0.6 }),
    );
    raqueta.position.set(0.55, 1.2, 0);
    g.add(cuerpoM, cabeza, raqueta);
    mundo.escena.add(g);
    return { i, g, raqueta, x: 0, z: (i === 0 ? 1 : -1) * LARGO * 0.42, golpe: 0, puntos: 0 };
  });

  let fase = 'saque', sacador = 0, aviso = '', avisoT = 0, marcador = null, terminado = false;

  function sacar() {
    const s = jug[sacador];
    bola.pos.set(s.x, 1.5, s.z - Math.sign(s.z) * 0.6);
    bola.vel.set(0, 0, 0);
    bola.botes = 0;
    bola.ultimo = sacador;
    fase = 'saque';
  }

  function golpear(p, efecto) {
    const haciaZ = p.z > 0 ? -1 : 1;
    const dx = bola.pos.x - p.x;
    // El punto de impacto en la raqueta decide la dirección: pegarle "tarde"
    // la abre y pegarle centrada la manda recta.
    const v = 15 + Math.abs(dx) * 2;
    bola.vel.set(dx * 3.4, efecto === 'liftado' ? 5.2 : 7.4, haciaZ * v);
    if (efecto === 'liftado') bola.vel.multiplyScalar(1.18);
    if (efecto === 'cortado') { bola.vel.z *= 0.72; bola.vel.y *= 0.8; }
    bola.efecto = efecto;
    bola.botes = 0;
    bola.ultimo = p.i;
    p.golpe = 0.18;
    fase = 'juego';
    audio.hit();
    haptics.impact(p.i, 1);
  }

  function punto(quien, motivo) {
    jug[quien].puntos++;
    marcador.update(jug[0].puntos, jug[1].puntos);
    aviso = motivo;
    avisoT = 2;
    audio.score(quien);
    haptics.score(quien);
    if (jug[quien].puntos >= PARA_GANAR) {
      terminado = true;
      ctx.finish({
        winner: quien, scores: [jug[0].puntos, jug[1].puntos],
        detail: `${PARA_GANAR} puntos`,
      });
      return;
    }
    sacador = 1 - quien;
    sacar();
  }

  mundo.camara.position.set(0, 6.5, LARGO * 0.78);
  mundo.camara.lookAt(0, 1, 0);

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `a ${PARA_GANAR} puntos` });
      sacar();
    },

    update(dt) {
      if (terminado) return;
      if (avisoT > 0) avisoT -= dt;

      for (const p of jug) {
        const pl = input.player(p.i);
        p.golpe = Math.max(0, p.golpe - dt);
        p.x = Math.max(-ANCHO / 2 - 1.5, Math.min(ANCHO / 2 + 1.5, p.x + pl.ax * 9 * dt));
        const avanza = pl.ay * (p.z > 0 ? 1 : -1);
        p.z = Math.max(Math.min(p.z - avanza * 5 * dt, LARGO * 0.5), 1.4) * (p.z > 0 ? 1 : 1);
        if (p.i === 1) p.z = Math.min(Math.max(p.z, -LARGO * 0.5), -1.4);
        p.g.position.set(p.x, 0, p.z);
        p.g.rotation.y = p.z > 0 ? Math.PI : 0;
        p.raqueta.rotation.z = p.golpe > 0 ? -1.2 : -0.3;

        const cerca = Math.hypot(bola.pos.x - p.x, bola.pos.z - p.z) < 1.9 && bola.pos.y < 2.6;
        if (fase === 'saque' && p.i === sacador && pl.pressed('a')) {
          bola.pos.set(p.x, 2.2, p.z - Math.sign(p.z) * 0.6);
          bola.vel.set(0, 1.6, 0);
          fase = 'juego';
          audio.blip();
        } else if (fase === 'juego' && cerca && bola.ultimo !== p.i) {
          if (pl.pressed('a')) golpear(p, 'liftado');
          else if (pl.pressed('b')) golpear(p, 'cortado');
        }
      }

      if (fase === 'juego') {
        bola.vel.y -= 19 * dt;
        if (bola.efecto === 'liftado') bola.vel.y -= 11 * dt;
        bola.vel.multiplyScalar(Math.exp(-0.12 * dt));
        bola.pos.addScaledVector(bola.vel, dt);

        // Red
        if (Math.abs(bola.pos.z) < 0.2 && bola.pos.y < RED_ALTO + bola.r) {
          punto(bola.ultimo === 0 ? 1 : 0, 'A la red');
          return;
        }

        if (bola.pos.y <= bola.r) {
          bola.pos.y = bola.r;
          bola.vel.y = Math.abs(bola.vel.y) * (bola.efecto === 'cortado' ? 0.42 : 0.62);
          bola.vel.x *= 0.86;
          bola.vel.z *= 0.86;
          bola.botes++;
          audio.tick();
          const dentro = Math.abs(bola.pos.x) < ANCHO / 2 + 0.1 && Math.abs(bola.pos.z) < LARGO / 2 + 0.1;
          if (!dentro) { punto(bola.ultimo, 'Fuera'); return; }
          if (bola.botes >= 2) { punto(bola.ultimo, 'Dos botes'); return; }
        }

        if (Math.abs(bola.pos.z) > LARGO * 0.8 || Math.abs(bola.pos.x) > ANCHO) {
          punto(bola.ultimo, 'Fuera de pista');
          return;
        }
      } else {
        const s = jug[sacador];
        bola.pos.set(s.x, 1.5, s.z - Math.sign(s.z) * 0.6);
      }

      bola.malla.position.copy(bola.pos);
      ajustarSombra(sombraBola, bola.malla, 0.02, 6);

      // Cámara detrás del que resta.
      const restador = jug[1 - bola.ultimo];
      const objetivo = new THREE.Vector3(bola.pos.x * 0.3, 6.5, Math.sign(restador.z) * LARGO * 0.78);
      mundo.camara.position.lerp(objetivo, Math.min(1, dt * 1.4));
      mundo.camara.lookAt(bola.pos.x * 0.3, 1.2, 0);

      panel.centro(fase === 'saque'
        ? `saca <b style="color:${players[sacador].color}">${players[sacador].name}</b>`
        : `${jug[0].puntos} — ${jug[1].puntos}`);
      panel.sub(avisoT > 0 ? aviso : 'tu tecla golpea liftado · la especial, cortado');
      panel.pie('Muévete con tus direcciones · la bola debe botar en tu campo antes de golpearla');
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
