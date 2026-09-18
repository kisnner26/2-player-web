/**
 * Bádminton — el volante no es una pelota y se nota en todo.
 *
 * Frena muchísimo con el aire: sale disparado y se para en el sitio. Eso hace
 * que el juego no vaya de potencia sino de profundidad — un remate corto cae
 * muerto delante de la red y un globo largo te da tiempo a recolocarte.
 *
 * No hay botes: en cuanto toca el suelo, se acabó el punto. Así que la pista
 * está siempre viva y no existe el "ya lo cojo tras el bote".
 */

import { crearMundo, crearPanel, suelo, mat, caja, esfera, cilindro, sombraContacto, ajustarSombra, THREE } from '../../core/tres.js';

export const meta = { render: 'dom' };

const LARGO = 13.4;
const ANCHO = 6.1;
const RED_ALTO = 1.55;
const PARA_GANAR = 7;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#161c28', horizonte: '#2a3448', sol: 2.2, solPos: [6, 20, 6],
    sombraArea: 20, fov: 44,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#3a2a1e', veta: '#33251a', repite: 30 });

  mundo.escena.add(caja(ANCHO + 2, 0.08, LARGO + 3, mat('#2a6b4a', { rug: 0.9 }), [0, 0.02, 0]));
  const linea = (an, fo, x, z) => caja(an, 0.02, fo, mat('#f0f0f0'), [x, 0.07, z]);
  mundo.escena.add(linea(ANCHO, 0.1, 0, -LARGO / 2), linea(ANCHO, 0.1, 0, LARGO / 2));
  mundo.escena.add(linea(0.1, LARGO, -ANCHO / 2, 0), linea(0.1, LARGO, ANCHO / 2, 0));
  mundo.escena.add(linea(ANCHO, 0.08, 0, -2), linea(ANCHO, 0.08, 0, 2));

  mundo.escena.add(caja(ANCHO + 0.6, RED_ALTO * 0.6, 0.06,
    mat('#dfe4ee', { rug: 1, transparente: 0.7 }), [0, RED_ALTO - RED_ALTO * 0.3, 0]));
  mundo.escena.add(caja(ANCHO + 0.6, 0.07, 0.12, mat('#ffffff'), [0, RED_ALTO, 0]));
  for (const x of [-ANCHO / 2 - 0.3, ANCHO / 2 + 0.3]) {
    mundo.escena.add(cilindro(0.05, 0.05, RED_ALTO, mat('#8a8a98'), [x, RED_ALTO / 2, 0]));
  }

  const vol = { pos: new THREE.Vector3(0, 1.4, LARGO * 0.3), vel: new THREE.Vector3(), ultimo: 1 };
  const volGrupo = new THREE.Group();
  volGrupo.add(esfera(0.09, mat('#e8e8f0'), [0, 0, 0], 12));
  const falda = cilindro(0.2, 0.06, 0.3, mat('#ffffff', { rug: 0.9, transparente: 0.9 }), [0, 0.18, 0]);
  volGrupo.add(falda);
  volGrupo.castShadow = true;
  mundo.escena.add(volGrupo);
  const sombraVol = sombraContacto(0.22, 0.35);
  mundo.escena.add(sombraVol);

  const jug = [0, 1].map((i) => {
    const g = new THREE.Group();
    const c = cilindro(0.28, 0.32, 1.65, mat(players[i].color, { rug: 0.6 }), [0, 0.82, 0]);
    c.castShadow = true;
    g.add(c, esfera(0.24, mat('#e8c9a0'), [0, 1.82, 0], 14));
    const raq = new THREE.Mesh(
      new THREE.TorusGeometry(0.26, 0.035, 8, 18),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#f2f2f2'), roughness: 0.5 }),
    );
    raq.position.set(0.5, 1.4, 0);
    g.add(raq);
    mundo.escena.add(g);
    return { i, g, raq, x: 0, z: (i === 0 ? 1 : -1) * LARGO * 0.33, golpe: 0, puntos: 0 };
  });

  let fase = 'saque', sacador = 0, aviso = '', avisoT = 0, marcador = null, terminado = false;

  function sacar() {
    fase = 'saque';
    vol.vel.set(0, 0, 0);
    vol.ultimo = sacador;
  }

  function golpear(p, remate) {
    const haciaZ = p.z > 0 ? -1 : 1;
    const dx = vol.pos.x - p.x;
    // Remate: rápido y plano. Globo: lento y muy alto.
    const v = remate ? 26 : 12;
    vol.vel.set(dx * 2.6, remate ? 1.2 : 8.6, haciaZ * v);
    vol.ultimo = p.i;
    p.golpe = 0.18;
    fase = 'juego';
    audio.hit();
    haptics.impact(p.i, remate ? 1.2 : 0.7);
  }

  function punto(quien, motivo) {
    jug[quien].puntos++;
    marcador.update(jug[0].puntos, jug[1].puntos);
    aviso = motivo;
    avisoT = 1.8;
    audio.score(quien);
    haptics.score(quien);
    if (jug[quien].puntos >= PARA_GANAR) {
      terminado = true;
      ctx.finish({ winner: quien, scores: [jug[0].puntos, jug[1].puntos], detail: `a ${PARA_GANAR}` });
      return;
    }
    sacador = quien;
    sacar();
  }

  mundo.camara.position.set(0, 5.4, LARGO * 0.86);
  mundo.camara.lookAt(0, 1.4, 0);

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `a ${PARA_GANAR}` });
      sacar();
    },

    update(dt) {
      if (terminado) return;
      if (avisoT > 0) avisoT -= dt;

      for (const p of jug) {
        const pl = input.player(p.i);
        p.golpe = Math.max(0, p.golpe - dt);
        p.x = Math.max(-ANCHO / 2 - 0.8, Math.min(ANCHO / 2 + 0.8, p.x + pl.ax * 7.5 * dt));
        const avanza = pl.ay * (p.z > 0 ? 1 : -1);
        p.z -= avanza * 5 * dt;
        p.z = p.i === 0
          ? Math.max(1.1, Math.min(LARGO * 0.52, p.z))
          : Math.min(-1.1, Math.max(-LARGO * 0.52, p.z));
        p.g.position.set(p.x, 0, p.z);
        p.g.rotation.y = p.z > 0 ? Math.PI : 0;
        p.raq.rotation.z = p.golpe > 0 ? -1.4 : -0.2;

        const cerca = Math.hypot(vol.pos.x - p.x, vol.pos.z - p.z) < 1.8 && vol.pos.y < 3.4;
        if (fase === 'saque' && p.i === sacador && pl.pressed('a')) {
          vol.pos.set(p.x, 1.6, p.z - Math.sign(p.z) * 0.5);
          golpear(p, false);
        } else if (fase === 'juego' && cerca && vol.ultimo !== p.i) {
          if (pl.pressed('a')) golpear(p, vol.pos.y > 2);
          else if (pl.pressed('b')) golpear(p, false);
        }
      }

      if (fase === 'juego') {
        vol.vel.y -= 16 * dt;
        // Arrastre enorme: es lo que define al volante.
        vol.vel.multiplyScalar(Math.exp(-2.1 * dt));
        vol.pos.addScaledVector(vol.vel, dt);

        if (Math.abs(vol.pos.z) < 0.18 && vol.pos.y < RED_ALTO) {
          punto(vol.ultimo === 0 ? 1 : 0, 'A la red');
          return;
        }
        if (vol.pos.y <= 0.1) {
          const dentro = Math.abs(vol.pos.x) < ANCHO / 2 + 0.1 && Math.abs(vol.pos.z) < LARGO / 2 + 0.1;
          punto(dentro ? vol.ultimo : (vol.ultimo === 0 ? 1 : 0), dentro ? 'Al suelo' : 'Fuera');
          return;
        }
      } else {
        const s = jug[sacador];
        vol.pos.set(s.x, 1.5, s.z - Math.sign(s.z) * 0.5);
      }

      volGrupo.position.copy(vol.pos);
      // El volante siempre cae de corcho: la falda mira hacia donde vino.
      const dir = vol.vel.clone().normalize().multiplyScalar(-1);
      volGrupo.lookAt(vol.pos.clone().add(dir.length() ? dir : new THREE.Vector3(0, 1, 0)));
      ajustarSombra(sombraVol, volGrupo, 0.02, 5);

      const restador = jug[1 - vol.ultimo];
      const objetivo = new THREE.Vector3(vol.pos.x * 0.25, 5.4, Math.sign(restador.z) * LARGO * 0.86);
      mundo.camara.position.lerp(objetivo, Math.min(1, dt * 1.5));
      mundo.camara.lookAt(vol.pos.x * 0.25, 1.4, 0);

      panel.centro(fase === 'saque'
        ? `saca <b style="color:${players[sacador].color}">${players[sacador].name}</b>`
        : `${jug[0].puntos} — ${jug[1].puntos}`);
      panel.sub(avisoT > 0 ? aviso : 'tu tecla: remate si viene alto, si no golpe normal · la especial: globo');
      panel.pie('No hay botes: si toca el suelo, punto');
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
