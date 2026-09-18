/**
 * Salto de Esquí — tres momentos y ya está.
 *
 * Impulso en la mesa, postura en el aire y aterrizaje. Cada uno tiene su
 * ventana y ninguna se puede arreglar después: un mal impulso no se compensa
 * volando bien, solo se hace menos ruinoso.
 *
 * En el aire hay que buscar el ángulo en el que el cuerpo hace de ala. Ni muy
 * tumbado (te caes de morro) ni muy erguido (frenas). Y el telemark del final
 * puntúa aparte, porque en el salto de verdad también.
 */

import { crearMundo, crearPanel, suelo, mat, caja, cilindro, esfera, THREE } from '../../core/tres.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const SALTOS = 3;              // por jugador

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#8fb8e0', horizonte: '#eef4fa', sol: 2.6, solPos: [24, 36, 18],
    sombraArea: 50, fov: 46, niebla: 0.004,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#f0f6fc', veta: '#e2ebf4', repite: 90 });

  /** Perfil del trampolín: rampa, mesa de despegue y pista de caída. */
  const RAMPA_Z0 = 60, MESA_Z = 0;
  const perfil = (z) => {
    if (z > MESA_Z) return (z - MESA_Z) * 0.55 + 2;         // rampa de bajada
    return 2 - Math.pow(-z / 26, 1.9) * 22;                  // pista de aterrizaje
  };

  // Geometría del trampolín aproximada con losetas.
  for (let z = RAMPA_Z0; z > -120; z -= 4) {
    const y = perfil(z);
    const l = caja(9, 0.5, 4.2, mat(z > MESA_Z ? '#dfe8f2' : '#e8eff8', { rug: 0.85 }), [0, y - 0.25, z]);
    l.receiveShadow = true;
    mundo.escena.add(l);
  }
  // Marcas de distancia
  for (const d of [40, 60, 80, 100]) {
    mundo.escena.add(caja(11, 0.06, 0.5, mat('#3aa0ff'), [0, perfil(-d) + 0.3, -d]));
  }

  const jug = [0, 1].map((i) => {
    const g = new THREE.Group();
    const c = cilindro(0.28, 0.32, 1.6, mat(players[i].color, { rug: 0.6 }), [0, 0.8, 0]);
    c.castShadow = true;
    g.add(c, esfera(0.24, mat('#e0b890'), [0, 1.76, 0], 12));
    g.add(caja(0.16, 0.05, 2.1, mat('#2a2a38'), [-0.18, 0.03, 0]));
    g.add(caja(0.16, 0.05, 2.1, mat('#2a2a38'), [0.18, 0.03, 0]));
    g.visible = false;
    mundo.escena.add(g);
    return { i, g, mejor: 0, saltos: 0 };
  });

  let turno = 0, fase = 'bajando', z = RAMPA_Z0, y = perfil(RAMPA_Z0), vz = 0, vy = 0;
  let postura = 0.6, impulso = 0, marcador = null, mensaje = '', espera = 0, terminado = false;
  let distancia = 0, estilo = 0, t = 0;

  function nuevoSalto() {
    z = RAMPA_Z0;
    y = perfil(RAMPA_Z0);
    vz = -6;
    vy = 0;
    postura = 0.6;
    impulso = 0;
    distancia = 0;
    estilo = 0;
    fase = 'bajando';
    mensaje = '';
    for (const p of jug) p.g.visible = p.i === turno;
  }

  function puntuar() {
    const p = jug[turno];
    const total = Math.round(distancia * 1.8 + estilo * 20);
    p.mejor = Math.max(p.mejor, total);
    p.saltos++;
    marcador.update(jug[0].mejor, jug[1].mejor);
    mensaje = `${distancia.toFixed(1)} m · estilo ${(estilo * 20).toFixed(0)} · <b>${total} puntos</b>`;
    fase = 'pausa';
    espera = 2.6;
    audio.score(turno);
    haptics.score(turno);
  }

  function siguiente() {
    if (jug[0].saltos >= SALTOS && jug[1].saltos >= SALTOS) {
      terminado = true;
      const g = jug[0].mejor === jug[1].mejor ? -1 : (jug[0].mejor > jug[1].mejor ? 0 : 1);
      ctx.finish({
        winner: g, scores: [jug[0].mejor, jug[1].mejor],
        detail: `mejor salto: ${jug[0].mejor} y ${jug[1].mejor} puntos`,
        record: ctx.record('puntos', Math.max(jug[0].mejor, jug[1].mejor), 'high'),
      });
      return;
    }
    turno = jug[1].saltos < jug[0].saltos ? 1 : 0;
    nuevoSalto();
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `${SALTOS} saltos cada uno` });
      nuevoSalto();
    },

    update(dt) {
      if (terminado) return;
      t += dt;
      const p = input.player(turno);
      const fig = jug[turno].g;

      if (fase === 'bajando') {
        vz -= 26 * dt;
        z += vz * dt;
        y = perfil(z);
        // Ventana de impulso: solo cuenta muy cerca del canto de la mesa.
        if (p.pressed('a')) {
          const d = Math.abs(z - MESA_Z);
          impulso = Math.max(0, 1 - d / 7);
          audio.jump();
          haptics.impact(turno, 0.5 + impulso);
          fase = 'volando';
          vy = 3.6 + impulso * 7.4;
          vz = vz * (0.9 + impulso * 0.2);
          if (impulso < 0.2) mensaje = 'impulso flojo';
        } else if (z < MESA_Z - 2) {
          // Se pasó la mesa sin saltar.
          fase = 'volando';
          vy = 1.2;
          mensaje = 'sin impulso';
        }
      } else if (fase === 'volando') {
        if (p.held('up')) postura = Math.min(1.25, postura + 1.6 * dt);
        if (p.held('down')) postura = Math.max(0, postura - 1.6 * dt);
        // Sustentación máxima en torno a 0,65: ni tumbado ni erguido.
        const eficacia = Math.max(0, 1 - Math.abs(postura - 0.65) / 0.65);
        estilo += eficacia * dt * 0.5;
        vy += (-9.8 + eficacia * 6.4) * dt;
        vz -= eficacia * 2.2 * dt;
        y += vy * dt;
        z += vz * dt;
        fig.rotation.x = -postura * 0.9;

        if (y <= perfil(z) + 0.1) {
          y = perfil(z) + 0.1;
          distancia = Math.max(0, -z);
          // Telemark: aterrizar con la postura recogida puntúa.
          const suave = Math.max(0, 1 - Math.abs(vy) / 26);
          estilo = Math.min(3, estilo + suave);
          if (suave < 0.25) { mensaje = '¡caída!'; estilo *= 0.35; audio.explosion(); haptics.explosion(turno); }
          puntuar();
        }
      } else if (fase === 'pausa') {
        espera -= dt;
        if (espera <= 0) siguiente();
      }

      fig.position.set(0, y, z);
      const objetivo = new THREE.Vector3(9, y + 5, z + 14);
      mundo.camara.position.lerp(objetivo, Math.min(1, dt * 2.6));
      mundo.camara.lookAt(0, y, z - 6);

      panel.centro(fase === 'pausa'
        ? mensaje
        : `salta <b style="color:${players[turno].color}">${players[turno].name}</b> · ${fase === 'bajando' ? 'prepara el impulso' : `${Math.max(0, -z).toFixed(1)} m`}`);
      panel.sub(fase === 'volando'
        ? `postura ${(postura * 100).toFixed(0)}% — busca el ángulo de vuelo con ↑ y ↓`
        : mensaje || `mejor salto: ${jug[0].mejor} — ${jug[1].mejor}`);
      panel.pie('Tu tecla da el impulso justo en el canto de la mesa · ↑ y ↓ ajustan la postura en el aire');
      panel.barra(fase === 'volando' ? Math.max(0, 1 - Math.abs(postura - 0.65) / 0.65) : null, '#a8ff3e');
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
