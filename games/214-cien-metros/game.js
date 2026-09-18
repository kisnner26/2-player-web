/**
 * Cien Metros — salida, zancada y aguantar los últimos veinte.
 *
 * Se corre alternando las dos teclas de dirección, que es como se ha corrido
 * siempre en los juegos de atletismo. Pero aquí no basta con machacar: hay una
 * cadencia óptima, y pasarse de rápido descoordina la zancada y te FRENA.
 *
 * La salida se juega aparte: hay que reaccionar al disparo, y salir antes es
 * nulo. Los dos corren a la vez y en carriles contiguos, así que se ve
 * perfectamente quién va ganando y por cuánto.
 */

import { crearMundo, crearPanel, suelo, mat, caja, cilindro, esfera, THREE } from '../../core/tres.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const METROS = 100;

export function create(ctx) {
  const { input, audio, haptics, players, rng } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#2a3a5a', horizonte: '#5a7a9a', sol: 2.6, solPos: [16, 30, 10],
    sombraArea: 30, fov: 46, niebla: 0.004,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#3a5a3a', veta: '#345234', repite: 60 });

  // Tartán y carriles
  mundo.escena.add(caja(9, 0.05, METROS + 24, mat('#b2603c', { rug: 0.95 }), [0, 0.03, -METROS / 2 + 6]));
  for (const x of [-1.5, 1.5]) {
    mundo.escena.add(caja(0.08, 0.02, METROS + 24, mat('#f2f2f2'), [x, 0.07, -METROS / 2 + 6]));
  }
  mundo.escena.add(caja(9, 0.02, 0.3, mat('#ffffff'), [0, 0.07, 0]));
  mundo.escena.add(caja(9, 0.02, 0.3, mat('#ffd166'), [0, 0.07, -METROS]));

  const jug = [0, 1].map((i) => {
    const g = new THREE.Group();
    const c = cilindro(0.28, 0.32, 1.7, mat(players[i].color, { rug: 0.6 }), [0, 0.85, 0]);
    c.castShadow = true;
    g.add(c, esfera(0.24, mat('#e0b890'), [0, 1.88, 0], 14));
    const pierna = caja(0.16, 0.8, 0.16, mat('#2a2a38'), [0, 0.4, 0]);
    g.add(pierna);
    g.position.set(i === 0 ? -0.75 : 0.75, 0, 0);
    mundo.escena.add(g);
    return { i, g, pierna, z: 0, vel: 0, ultima: '', paso: 0, cadencia: 0, nulo: false, fin: 0, tiempo: 0 };
  });

  let fase = 'preparados', reloj = 0, disparo = 2 + rng() * 2.5, marcador = null, terminado = false;
  let mensaje = 'En sus marcas…';

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `${METROS} m` });
      mundo.camara.position.set(6, 3, 12);
      mundo.camara.lookAt(0, 1.2, -6);
    },

    update(dt) {
      if (terminado) return;
      reloj += dt;

      if (fase === 'preparados') {
        if (reloj > disparo) {
          fase = 'corriendo';
          reloj = 0;
          mensaje = '¡YA!';
          audio.noise({ dur: 0.2, gain: 0.35, filter: 2000, sweep: -1200 });
          haptics.play('heavy');
        } else {
          for (const p of jug) {
            const pl = input.player(p.i);
            if ((pl.pressed('left') || pl.pressed('right')) && !p.nulo) {
              p.nulo = true;
              mensaje = `${players[p.i].name} sale antes: 0,5 s de castigo`;
              audio.error();
              haptics.error(p.i);
            }
          }
          if (reloj > disparo * 0.6) mensaje = 'Listos…';
        }
        mundo.dibujar();
        pintar();
        return;
      }

      for (const p of jug) {
        if (p.fin) continue;
        p.tiempo += dt;
        const pl = input.player(p.i);
        if (p.nulo && p.tiempo < 0.5) continue;

        let paso = false;
        if (pl.pressed('left') && p.ultima !== 'left') { p.ultima = 'left'; paso = true; }
        if (pl.pressed('right') && p.ultima !== 'right') { p.ultima = 'right'; paso = true; }
        if (paso) {
          const desde = p.cadencia;
          p.cadencia = 0;
          // Cadencia óptima en torno a 0,13 s por zancada: más rápido descoordina.
          const ideal = 0.13;
          const err = Math.abs(desde - ideal);
          const gana = err < 0.05 ? 1.6 : err < 0.11 ? 1.05 : 0.45;
          p.vel += gana;
          p.paso = 0.12;
          audio.tone({ freq: 300 + p.vel * 8, dur: 0.02, gain: 0.06, type: 'square' });
        }
        p.cadencia += dt;
        p.paso = Math.max(0, p.paso - dt);
        // Rozamiento creciente: hay un techo de velocidad y cuesta mantenerlo.
        p.vel = Math.max(0, p.vel - (1.6 + p.vel * 0.22) * dt);
        p.z -= p.vel * dt;

        p.g.position.z = p.z;
        p.pierna.rotation.x = Math.sin(p.tiempo * p.vel * 1.6) * 0.9;
        p.g.rotation.x = -Math.min(0.25, p.vel * 0.014);

        if (-p.z >= METROS) {
          p.fin = p.tiempo + (p.nulo ? 0.5 : 0);
          audio.win();
          haptics.victory(p.i);
        }
      }

      marcador.update(Math.round(-jug[0].z), Math.round(-jug[1].z));

      if (jug.every((p) => p.fin)) {
        terminado = true;
        const g = jug[0].fin === jug[1].fin ? -1 : (jug[0].fin < jug[1].fin ? 0 : 1);
        ctx.finish({
          winner: g,
          scores: [Math.round(jug[0].fin * 100) / 100, Math.round(jug[1].fin * 100) / 100],
          detail: `${jug[0].fin.toFixed(2)}s contra ${jug[1].fin.toFixed(2)}s`,
          record: ctx.record('tiempo', Math.round(Math.min(jug[0].fin, jug[1].fin) * 100) / 100, 'low'),
        });
        return;
      }

      const lider = jug[0].z < jug[1].z ? jug[0] : jug[1];
      mundo.camara.position.lerp(new THREE.Vector3(6, 3, lider.z + 12), Math.min(1, dt * 3));
      mundo.camara.lookAt(0, 1.2, lider.z - 6);
      pintar();
      mundo.dibujar();

      function pintar() {
        panel.centro(fase === 'preparados'
          ? mensaje
          : `${(-jug[0].z).toFixed(0)} m — ${(-jug[1].z).toFixed(0)} m`);
        panel.sub(fase === 'preparados'
          ? 'no toques nada hasta el disparo'
          : `${jug[0].vel.toFixed(1)} m/s — ${jug[1].vel.toFixed(1)} m/s · ${jug[0].fin ? jug[0].fin.toFixed(2) + 's' : jug[0].tiempo.toFixed(2)} — ${jug[1].fin ? jug[1].fin.toFixed(2) + 's' : jug[1].tiempo.toFixed(2)}`);
        panel.pie('Alterna ← y → para correr · hay una cadencia óptima: machacar más rápido te frena');
      }
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
