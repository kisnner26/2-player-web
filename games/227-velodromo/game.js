/**
 * Velódromo — dos vueltas, y el que va delante hace el trabajo.
 *
 * Se pedalea alternando las dos direcciones, pero la carrera no la decide la
 * cadencia: la decide el REBUFO. Ir pegado a la rueda del otro te ahorra un
 * tercio del esfuerzo, así que quien se pone primero se desgasta y quien se
 * esconde llega fresco al sprint.
 *
 * Y hay una moneda de cambio más: la cuerda. Por dentro se recorren menos
 * metros por vuelta, pero ahí no hay rueda a la que agarrarse. Toda la partida
 * es elegir entre metros y rebufo.
 */

import { crearMundo, crearPanel, suelo, mat, caja, cilindro, esfera, gradas, THREE } from '../../core/tres.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const RADIO = 40;              // radio de la cuerda: vuelta de ~251 m
const CARRIL = 2.2;            // metros entre la cuerda y el balcón
const VUELTAS = 2;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#1a2030', horizonte: '#3a4658', sol: 2.5, solPos: [24, 40, 10],
    sombraArea: 34, fov: 58, lejos: 500,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#2a2f3a', veta: '#232833', repite: 60, tam: 400 });
  gradas(mundo, { filas: 4, porFila: 40, radio: RADIO + 9, alturaBase: 2.5 });

  // La pista: un anillo de madera peraltado, hecho con un toro achatado.
  const pista = new THREE.Mesh(
    new THREE.TorusGeometry(RADIO + CARRIL, CARRIL + 1.6, 8, 96),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#c2884a'), roughness: 0.85 }),
  );
  pista.rotation.x = -Math.PI / 2;
  pista.scale.y = 0.14;
  pista.position.y = 0.4;
  pista.receiveShadow = true;
  mundo.escena.add(pista);

  // Cuerda (línea negra interior) y línea de meta.
  const cuerda = new THREE.Mesh(
    new THREE.RingGeometry(RADIO - 0.12, RADIO + 0.12, 96),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#141414') }),
  );
  cuerda.rotation.x = -Math.PI / 2;
  cuerda.position.y = 0.62;
  mundo.escena.add(cuerda);
  mundo.escena.add(caja(0.3, 0.04, CARRIL * 2 + 2, mat('#ffffff'), [RADIO + CARRIL, 0.63, 0]));

  const ciclistas = [0, 1].map((i) => {
    const g = new THREE.Group();
    const cuadro = cilindro(0.1, 0.1, 1.5, mat('#d8d8e0', { met: 0.6, rug: 0.3 }), [0, 0.6, 0]);
    cuadro.rotation.x = Math.PI / 2;
    const torso = cilindro(0.24, 0.26, 0.9, mat(players[i].color, { rug: 0.6 }), [0, 1.05, 0]);
    const rueda1 = cilindro(0.34, 0.34, 0.06, mat('#1a1a22'), [0, 0.34, 0.62], 18);
    const rueda2 = cilindro(0.34, 0.34, 0.06, mat('#1a1a22'), [0, 0.34, -0.62], 18);
    rueda1.rotation.z = Math.PI / 2;
    rueda2.rotation.z = Math.PI / 2;
    g.add(cuadro, torso, esfera(0.2, mat('#e0b890'), [0, 1.62, 0], 12), rueda1, rueda2);
    mundo.escena.add(g);
    return {
      i, g, ruedas: [rueda1, rueda2],
      s: i * 1.6, carril: i === 0 ? 0.2 : 1.6, vel: 9, ultima: '', cadencia: 0,
      reserva: 1, rebufo: 0, fin: 0, tiempo: 0, vueltas: 0,
    };
  });

  const camaras = [mundo.camaraExtra(58), mundo.camaraExtra(58)];
  let marcador = null, acabado = false;

  const radioDe = (p) => RADIO + p.carril;
  const largoVuelta = (p) => 2 * Math.PI * radioDe(p);
  /** Ángulo del ciclista en la pista. */
  const anguloDe = (p) => p.s / radioDe(p);

  /** Distancia por delante del otro, en metros de pista (positiva = va detrás). */
  function huecoDelante(p, otro) {
    const da = anguloDe(otro) - anguloDe(p);
    const norm = Math.atan2(Math.sin(da), Math.cos(da));
    return norm * RADIO;
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `${VUELTAS} vueltas` });
      marcador.update(0, 0);
    },

    update(dt) {
      if (acabado) return;

      for (const p of ciclistas) {
        if (p.fin) continue;
        p.tiempo += dt;
        const pl = input.player(p.i);

        let pedalada = false;
        if (pl.pressed('left') && p.ultima !== 'left') { p.ultima = 'left'; pedalada = true; }
        if (pl.pressed('right') && p.ultima !== 'right') { p.ultima = 'right'; pedalada = true; }
        if (pedalada) {
          const err = Math.abs(p.cadencia - 0.15);
          p.vel += err < 0.05 ? 1.5 : err < 0.11 ? 1 : 0.4;
          p.cadencia = 0;
          audio.tone({ freq: 200 + p.vel * 6, dur: 0.02, gain: 0.05, type: 'square' });
        }
        p.cadencia += dt;

        // Sprint: gasta reserva y da un empujón real mientras dure.
        if (pl.held('a') && p.reserva > 0) {
          p.reserva = Math.max(0, p.reserva - 0.34 * dt);
          p.vel += 5.5 * dt;
          if (Math.random() < dt * 4) haptics.play('tick', { player: p.i });
        } else {
          p.reserva = Math.min(1, p.reserva + 0.09 * dt);
        }

        // Carril: por dentro se corren menos metros, por fuera se coge rueda.
        p.carril = Math.max(0, Math.min(CARRIL, p.carril + pl.y * 1.6 * dt));

        // Rebufo: pegado a la rueda del otro, un tercio menos de arrastre.
        const otro = ciclistas[1 - p.i];
        const hueco = huecoDelante(p, otro);
        const cerca = hueco > 0.8 && hueco < 8 && Math.abs(p.carril - otro.carril) < 1.1;
        p.rebufo = cerca ? Math.min(1, p.rebufo + dt * 2.5) : Math.max(0, p.rebufo - dt * 2.5);

        const arrastre = (0.055 - p.rebufo * 0.019) * p.vel * p.vel;
        p.vel = Math.max(0, p.vel - (arrastre + 0.5) * dt);
        p.s += p.vel * dt;

        const dadas = Math.floor(p.s / largoVuelta(p));
        if (dadas > p.vueltas) {
          p.vueltas = dadas;
          audio.tick();
          if (p.vueltas >= VUELTAS) {
            p.fin = p.tiempo;
            audio.win();
            haptics.victory(p.i);
          }
        }

        const a = anguloDe(p);
        const r = radioDe(p);
        p.g.position.set(Math.cos(a) * r, 0.62 + p.carril * 0.1, Math.sin(a) * r);
        p.g.rotation.y = -a + Math.PI / 2;
        // Peralte: la bici se tumba hacia dentro, más cuanto más rápido.
        p.g.rotation.z = -Math.min(0.5, (p.vel * p.vel) / (r * 30)) - p.carril * 0.05;
        for (const rueda of p.ruedas) rueda.rotation.x -= (p.vel / 0.34) * dt;
      }

      for (let i = 0; i < 2; i++) {
        const p = ciclistas[i];
        const a = anguloDe(p);
        const r = radioDe(p);
        const c = camaras[i];
        // Cámara detrás y por fuera: se ve la rueda de delante, que es el juego.
        const objetivo = new THREE.Vector3(
          Math.cos(a - 0.13) * (r + 2.6), 3.4, Math.sin(a - 0.13) * (r + 2.6),
        );
        c.position.lerp(objetivo, Math.min(1, dt * 4));
        c.lookAt(Math.cos(a + 0.16) * r, 1.1, Math.sin(a + 0.16) * r);
      }

      marcador?.update(ciclistas[0].vueltas, ciclistas[1].vueltas);

      if (ciclistas.every((p) => p.fin)) {
        acabado = true;
        const [a, b] = ciclistas;
        const gan = Math.abs(a.fin - b.fin) < 0.01 ? -1 : a.fin < b.fin ? 0 : 1;
        ctx.finish({
          winner: gan,
          scores: [+a.fin.toFixed(2), +b.fin.toFixed(2)],
          detail: `${a.fin.toFixed(2)}s contra ${b.fin.toFixed(2)}s`,
          record: ctx.record('tiempo', +Math.min(a.fin, b.fin).toFixed(2), 'low'),
        });
        return;
      }

      const linea = (p) => `${(p.vel * 3.6).toFixed(0)} km/h${p.rebufo > 0.5 ? ' · rebufo' : ''}`;
      panel.centro(`<b style="color:${players[0].color}">${linea(ciclistas[0])}</b> — <b style="color:${players[1].color}">${linea(ciclistas[1])}</b>`);
      panel.sub(`vuelta ${Math.min(VUELTAS, ciclistas[0].vueltas + 1)} y ${Math.min(VUELTAS, ciclistas[1].vueltas + 1)} de ${VUELTAS}`
        + ` · reserva ${Math.round(ciclistas[0].reserva * 100)}% — ${Math.round(ciclistas[1].reserva * 100)}%`);
      panel.pie('alterna ← y → para pedalear · ↑ ↓ cambian de carril · mantén tu tecla para esprintar');
      mundo.dibujarPartida(camaras[0], camaras[1]);
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
