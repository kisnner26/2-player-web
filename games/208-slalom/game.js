/**
 * Slalom — la misma pista para los dos y el reloj de juez.
 *
 * Esquiar bien no es ir recto: es llegar a la puerta ya girado. El canto
 * agarra según lo inclinado que vayas, así que girar tarde te saca de la
 * trazada y girar pronto te frena. Toda la bajada es esa negociación.
 *
 * Saltarse una puerta son dos segundos de penalización, no una
 * descalificación: así una bajada rota sigue siendo una bajada, y remontar
 * dos puertas malas es posible si el resto va fino.
 */

import { crearMundo, crearPanel, suelo, mat, caja, cilindro, esfera, THREE } from '../../core/tres.js';

export const meta = { render: 'dom' };

const PUERTAS = 18;
const SEPARACION = 26;
const PENALIZACION = 2;

export function create(ctx) {
  const { input, audio, haptics, players, rng } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#9fc8e8', horizonte: '#e8f0f8', sol: 2.8, solPos: [20, 40, 10],
    sombraArea: 40, fov: 52, niebla: 0.006,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#eef4fa', veta: '#dfe8f2', repite: 120 });

  // Pendiente: la pista baja en Y a medida que avanza en Z.
  const PENDIENTE = 0.16;
  const alturaEn = (z) => -z * PENDIENTE;

  const puertas = [];
  for (let i = 0; i < PUERTAS; i++) {
    const z = -(i + 1) * SEPARACION;
    const x = Math.sin(i * 1.35) * 9 + (rng() - 0.5) * 3;
    const g = new THREE.Group();
    const col = i % 2 === 0 ? '#ff2e88' : '#3aa0ff';
    for (const lado of [-1, 1]) {
      const palo = cilindro(0.09, 0.09, 3, mat(col, { emisivo: col, brillo: 0.2 }), [lado * 2.2, 1.5, 0]);
      g.add(palo);
    }
    g.position.set(x, alturaEn(z), z);
    mundo.escena.add(g);
    puertas.push({ x, z, g, col });
  }
  // Meta
  const metaZ = -(PUERTAS + 1) * SEPARACION;
  const metaG = caja(14, 0.4, 0.6, mat('#ffd166'), [0, alturaEn(metaZ) + 2.6, metaZ]);
  mundo.escena.add(metaG);

  const jug = [0, 1].map((i) => {
    const g = new THREE.Group();
    const c = cilindro(0.28, 0.32, 1.6, mat(players[i].color, { rug: 0.6 }), [0, 0.8, 0]);
    c.castShadow = true;
    g.add(c, esfera(0.24, mat('#e0b890'), [0, 1.76, 0], 12));
    g.add(caja(0.16, 0.06, 1.7, mat('#2a2a38'), [-0.16, 0.05, 0]));
    g.add(caja(0.16, 0.06, 1.7, mat('#2a2a38'), [0.16, 0.05, 0]));
    mundo.escena.add(g);
    return { i, g, x: 0, z: 0, vz: 0, vx: 0, inclina: 0, puerta: 0, fallos: 0, tiempo: 0, fin: 0 };
  });

  let marcador = null, terminado = false, aviso = '', avisoT = 0;

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `${PUERTAS} puertas` });
    },

    update(dt) {
      if (terminado) return;
      if (avisoT > 0) avisoT -= dt;

      for (const p of jug) {
        if (p.fin) continue;
        p.tiempo += dt;
        const pl = input.player(p.i);
        // Inclinación: es lo que gira de verdad, y tarda en entrar.
        const quiere = pl.ax;
        p.inclina += (quiere - p.inclina) * Math.min(1, dt * 4.5);
        // Cuanto más inclinado, más agarre lateral y más freno.
        const agarre = Math.abs(p.inclina);
        p.vx += p.inclina * 26 * dt;
        p.vx *= Math.exp(-(2.2 + agarre * 3) * dt);
        // Aceleración por la pendiente, frenada por el canto.
        p.vz -= (16 - agarre * 11) * dt;
        if (pl.held('a')) p.vz *= Math.exp(-2.4 * dt);      // cuña de freno
        p.vz = Math.max(-38, Math.min(-2, p.vz));
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.x = Math.max(-18, Math.min(18, p.x));

        p.g.position.set(p.x, alturaEn(p.z), p.z);
        p.g.rotation.z = -p.inclina * 0.5;
        p.g.rotation.y = -p.vx * 0.02;

        // Puertas: se comprueba al pasarlas de largo.
        const sig = puertas[p.puerta];
        if (sig && p.z < sig.z) {
          const dentro = Math.abs(p.x - sig.x) < 2.2;
          if (!dentro) {
            p.fallos++;
            aviso = `${players[p.i].name} se salta una puerta (+${PENALIZACION}s)`;
            avisoT = 1.8;
            audio.error();
            haptics.error(p.i);
          } else {
            audio.tick();
            haptics.tick(p.i);
          }
          p.puerta++;
        }

        if (p.z < metaZ) {
          p.fin = p.tiempo + p.fallos * PENALIZACION;
          audio.win();
          haptics.victory(p.i);
        }
      }

      marcador.update(jug[0].puerta, jug[1].puerta);

      if (jug.every((p) => p.fin)) {
        terminado = true;
        const g = jug[0].fin === jug[1].fin ? -1 : (jug[0].fin < jug[1].fin ? 0 : 1);
        ctx.finish({
          winner: g,
          scores: [Math.round(jug[0].fin * 100) / 100, Math.round(jug[1].fin * 100) / 100],
          detail: `${jug[0].fin.toFixed(2)}s (${jug[0].fallos} fallos) contra ${jug[1].fin.toFixed(2)}s (${jug[1].fallos})`,
          record: ctx.record('tiempo', Math.round(Math.min(jug[0].fin, jug[1].fin) * 100) / 100, 'low'),
        });
        return;
      }

      // Cámara sobre el que va primero, con los dos a la vista.
      const lider = jug[0].z < jug[1].z ? jug[0] : jug[1];
      const objetivo = new THREE.Vector3(lider.x * 0.4, alturaEn(lider.z) + 7, lider.z + 15);
      mundo.camara.position.lerp(objetivo, Math.min(1, dt * 2.4));
      mundo.camara.lookAt(lider.x * 0.3, alturaEn(lider.z - 12), lider.z - 12);

      panel.centro(`${jug[0].fin ? jug[0].fin.toFixed(2) + 's' : jug[0].tiempo.toFixed(2)} — `
        + `${jug[1].fin ? jug[1].fin.toFixed(2) + 's' : jug[1].tiempo.toFixed(2)}`);
      panel.sub(avisoT > 0 ? aviso : `puertas ${jug[0].puerta}/${PUERTAS} — ${jug[1].puerta}/${PUERTAS} · fallos ${jug[0].fallos} — ${jug[1].fallos}`);
      panel.pie('Inclínate con izquierda y derecha · tu tecla es la cuña de freno · saltarse una puerta cuesta 2 s');
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
