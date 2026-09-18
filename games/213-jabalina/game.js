/**
 * Jabalina — carrera, ángulo y un solo instante para soltar.
 *
 * La carrera se machaca alternando las dos teclas de dirección, como en los
 * juegos de atletismo de siempre. Esa velocidad es la mitad del lanzamiento;
 * la otra mitad es el ángulo, que ronda los 36 grados y no los 45 que dice la
 * intuición, porque la jabalina planea.
 *
 * Pasarse de la línea es nulo, y la línea llega antes de lo que parece cuando
 * vas lanzado. Tres intentos y vale el mejor.
 */

import { crearMundo, crearPanel, suelo, mat, caja, cilindro, esfera, THREE } from '../../core/tres.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const INTENTOS = 3;
const LINEA_Z = 0;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#4a86c0', horizonte: '#cfe0ea', sol: 2.8, solPos: [18, 34, 14],
    sombraArea: 40, fov: 44, niebla: 0.004,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#4f8c48', veta: '#478040', repite: 80 });

  // Pasillo de carrera y línea de nulo
  mundo.escena.add(caja(4, 0.04, 40, mat('#b2603c', { rug: 0.95 }), [0, 0.03, 20]));
  mundo.escena.add(caja(4.4, 0.05, 0.3, mat('#ffffff'), [0, 0.06, LINEA_Z]));
  for (let d = 20; d <= 90; d += 10) {
    mundo.escena.add(caja(16, 0.04, 0.18, mat('#e8e8f0', { transparente: 0.7 }), [0, 0.05, -d]));
  }

  const atleta = new THREE.Group();
  const cuerpoA = cilindro(0.28, 0.32, 1.7, mat('#ffffff', { rug: 0.6 }), [0, 0.85, 0]);
  cuerpoA.castShadow = true;
  atleta.add(cuerpoA, esfera(0.24, mat('#e0b890'), [0, 1.88, 0], 14));
  mundo.escena.add(atleta);

  const jabalina = cilindro(0.03, 0.03, 2.6, mat('#d8d8e8', { met: 0.6, rug: 0.3 }), [0, 1.6, 0]);
  mundo.escena.add(jabalina);

  let turno = 0, intento = [0, 0], mejor = [0, 0];
  let fase = 'corriendo', z = 26, vel = 0, ultimaTecla = '', angulo = 0.62;
  let vuelo = null, marcador = null, terminado = false, mensaje = '', espera = 0;

  function nuevoIntento() {
    z = 26;
    vel = 0;
    angulo = 0.62;
    ultimaTecla = '';
    vuelo = null;
    fase = 'corriendo';
    mensaje = '';
    jabalina.visible = true;
  }

  function soltar(nulo) {
    if (nulo) {
      mensaje = 'NULO: pisó la línea';
      audio.error();
      haptics.error(turno);
      fase = 'pausa';
      espera = 2;
      return;
    }
    // Ángulo óptimo por debajo de 45° porque la jabalina planea.
    const v = 8 + vel * 1.35;
    vuelo = {
      pos: new THREE.Vector3(0, 1.9, z),
      vel: new THREE.Vector3(0, Math.sin(angulo) * v, -Math.cos(angulo) * v),
      giro: angulo,
    };
    fase = 'volando';
    audio.swoosh();
    haptics.impact(turno, 1);
  }

  function aterrizar() {
    const dist = Math.max(0, -vuelo.pos.z + z * 0);
    const metros = Math.round(dist * 10) / 10;
    mejor[turno] = Math.max(mejor[turno], metros);
    intento[turno]++;
    marcador.update(mejor[0], mejor[1]);
    mensaje = `${metros.toFixed(1)} m`;
    audio.score(turno);
    haptics.score(turno);
    fase = 'pausa';
    espera = 2.4;
  }

  function siguiente() {
    if (intento[0] >= INTENTOS && intento[1] >= INTENTOS) {
      terminado = true;
      const g = mejor[0] === mejor[1] ? -1 : (mejor[0] > mejor[1] ? 0 : 1);
      audio.win();
      ctx.finish({
        winner: g, scores: mejor,
        detail: `${mejor[0].toFixed(1)} m contra ${mejor[1].toFixed(1)} m`,
        record: ctx.record('metros', Math.max(...mejor), 'high'),
      });
      return;
    }
    turno = intento[1] < intento[0] ? 1 : 0;
    nuevoIntento();
  }

  mundo.camara.position.set(9, 4, 34);
  mundo.camara.lookAt(0, 1.4, 10);

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `${INTENTOS} intentos` });
      nuevoIntento();
    },

    update(dt) {
      if (terminado) return;
      const p = input.player(turno);

      if (fase === 'corriendo') {
        // Alternar izquierda y derecha: si repites, no suma.
        if (p.pressed('left') && ultimaTecla !== 'left') { vel += 1.5; ultimaTecla = 'left'; audio.tick(); }
        if (p.pressed('right') && ultimaTecla !== 'right') { vel += 1.5; ultimaTecla = 'right'; audio.tick(); }
        if (p.held('up')) angulo = Math.min(1.1, angulo + 0.8 * dt);
        if (p.held('down')) angulo = Math.max(0.15, angulo - 0.8 * dt);
        vel = Math.max(0, vel - 5.5 * dt);
        z -= vel * dt;
        if (p.pressed('a')) { soltar(z < LINEA_Z); }
        else if (z < LINEA_Z - 1.2) soltar(true);
      } else if (fase === 'volando') {
        // Sustentación: cuanto mejor alineada va con su velocidad, más planea.
        const dir = vuelo.vel.clone().normalize();
        const alineada = Math.max(0, 1 - Math.abs(Math.atan2(dir.y, -dir.z) - vuelo.giro) * 1.2);
        vuelo.vel.y += (-9.8 + alineada * 3.4) * dt;
        vuelo.vel.multiplyScalar(Math.exp(-0.06 * dt));
        vuelo.pos.addScaledVector(vuelo.vel, dt);
        vuelo.giro += (Math.atan2(vuelo.vel.y, -vuelo.vel.z) - vuelo.giro) * Math.min(1, dt * 2.5);
        if (vuelo.pos.y <= 0.1) aterrizar();
      } else if (fase === 'pausa') {
        espera -= dt;
        if (espera <= 0) siguiente();
      }

      cuerpoA.material.color.set(players[turno].color);
      if (fase === 'corriendo') {
        atleta.position.set(0, 0, z);
        atleta.visible = true;
        jabalina.position.set(0.35, 1.7, z + 0.2);
        jabalina.rotation.set(Math.PI / 2 - angulo, 0, 0);
      } else if (vuelo) {
        atleta.position.set(0, 0, Math.max(LINEA_Z, z));
        jabalina.position.copy(vuelo.pos);
        jabalina.rotation.set(Math.PI / 2 - vuelo.giro, 0, 0);
      }

      const foco = vuelo ? vuelo.pos.z : z;
      mundo.camara.position.lerp(new THREE.Vector3(9, 4 + (vuelo ? vuelo.pos.y * 0.3 : 0), foco + 16), Math.min(1, dt * 2));
      mundo.camara.lookAt(0, 1.4, foco - 6);

      panel.centro(fase === 'pausa'
        ? mensaje
        : `lanza <b style="color:${players[turno].color}">${players[turno].name}</b> · intento ${intento[turno] + 1}/${INTENTOS}`);
      panel.sub(fase === 'corriendo'
        ? `velocidad ${vel.toFixed(1)} · ángulo ${(angulo * 57.3).toFixed(0)}° — alterna ← y → para correr`
        : mensaje || `mejor: ${mejor[0].toFixed(1)} m — ${mejor[1].toFixed(1)} m`);
      panel.pie('Alterna ← y → para coger carrera · ↑ ↓ ajustan el ángulo · tu tecla suelta (antes de la línea)');
      panel.barra(fase === 'corriendo' ? Math.min(1, vel / 14) : null, players[turno].color);
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
