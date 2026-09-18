/**
 * Penaltis de Hockey Hielo — aquí el portero lo lleva una persona de verdad.
 *
 * Cinco tiros cada uno, alternando. El que ataca avanza hacia la portería y
 * elige CUÁNDO tirar: cuanto más cerca, más ángulo tiene, pero también menos
 * tiempo le da al portero para reaccionar… y menos tiempo se da a sí mismo.
 *
 * El que para no ve la intención, ve el palo: la posición del disco al salir
 * ya está decidida cuando él mueve el guante, así que se para leyendo el gesto
 * o adivinando. Las dos cosas valen.
 */

import { crearMundo, crearPanel, suelo, sala, mat, caja, esfera, cilindro, sombraContacto, ajustarSombra, THREE } from '../../core/tres.js';
import { cuerpo, integrar } from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const TIROS = 5;
const PORTERIA_Z = -22;
const ANCHO_PORTERIA = 1.83;   // media anchura reglamentaria
const ALTO_PORTERIA = 1.22;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#0e1826', horizonte: '#22344a', sol: 2.6, solPos: [10, 26, 16],
    sombraArea: 20, fov: 46,
  });
  const panel = crearPanel(ctx.root);
  sala(mundo, { color: '#16202e', tam: 70, alto: 18 });
  // Hielo: rugosidad muy baja para que refleje las luces.
  suelo(mundo, { color: '#dfeaf4', veta: '#cfe0ee', repite: 24, rug: 0.15 });
  mundo.escena.add(caja(0.16, 0.02, 46, mat('#c0392b'), [0, 0.02, -12]));

  // Portería: postes, larguero y red insinuada.
  const porteria = new THREE.Group();
  for (const s of [-1, 1]) {
    porteria.add(cilindro(0.07, 0.07, ALTO_PORTERIA, mat('#c0392b'), [s * ANCHO_PORTERIA, ALTO_PORTERIA / 2, 0]));
  }
  const larguero = cilindro(0.07, 0.07, ANCHO_PORTERIA * 2, mat('#c0392b'), [0, ALTO_PORTERIA, 0]);
  larguero.rotation.z = Math.PI / 2;
  porteria.add(larguero);
  const red = new THREE.Mesh(
    new THREE.PlaneGeometry(ANCHO_PORTERIA * 2, ALTO_PORTERIA),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#f0f4f8'), transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
  );
  red.position.set(0, ALTO_PORTERIA / 2, -0.55);
  porteria.add(red);
  porteria.position.set(0, 0, PORTERIA_Z);
  mundo.escena.add(porteria);

  const atacante = new THREE.Group();
  const torso = cilindro(0.32, 0.36, 1.3, mat(players[0].color, { rug: 0.6 }), [0, 0.75, 0]);
  atacante.add(torso, esfera(0.24, mat('#3a3a46'), [0, 1.62, 0], 14));
  const palo = caja(0.1, 0.1, 1.6, mat('#8a6a3a'), [0.42, 0.35, -0.5]);
  atacante.add(palo);
  mundo.escena.add(atacante);

  const portero = new THREE.Group();
  const cuerpoP = caja(0.9, 1.3, 0.5, mat(players[1].color, { rug: 0.7 }), [0, 0.72, 0]);
  const guante = caja(0.42, 0.42, 0.3, mat('#e8e8f0'), [0.62, 1.1, 0.1]);
  const pala = caja(0.5, 0.7, 0.16, mat('#d8d8e0'), [-0.66, 0.5, 0.1]);
  portero.add(cuerpoP, guante, pala, esfera(0.26, mat('#c8c8d4'), [0, 1.62, 0], 14));
  portero.position.set(0, 0, PORTERIA_Z + 0.6);
  mundo.escena.add(portero);

  const disco = cuerpo({ x: 0, y: 0.06, z: 0, r: 0.09, masa: 0.17 });
  disco.malla = cilindro(0.09, 0.09, 0.05, mat('#141418', { rug: 0.6 }), [0, 0.06, 0], 18);
  mundo.escena.add(disco.malla);
  const sombra = sombraContacto(0.12, 0.28);
  mundo.escena.add(sombra);

  let turno = 0, tiro = [1, 1], goles = [0, 0];
  let fase = 'avanzar', z = -4, x = 0, mira = 0, altura = 0.4, reloj = 0;
  let porteroX = 0, porteroY = 0, resultado = '';
  let marcador = null, acabado = false;

  mundo.camara.position.set(0, 3.4, 6);

  function preparar() {
    fase = 'avanzar';
    z = -4; x = 0; mira = 0; altura = 0.4; reloj = 0;
    porteroX = 0; porteroY = 0;
    disco.vel.set(0, 0, 0);
    disco.quieto = false;
    resultado = '';
    torso.material.color.set(players[turno].color);
    cuerpoP.material.color.set(players[1 - turno].color);
  }

  function tirar() {
    fase = 'tiro';
    reloj = 0;
    const dist = Math.abs(PORTERIA_Z - z);
    // Un disparo de hockey vuela recto y rapidísimo: el tiempo de reacción del
    // portero es literalmente la distancia dividida por esta velocidad.
    const v = 26;
    const objetivoX = mira * ANCHO_PORTERIA * 1.15;
    const objetivoY = altura;
    disco.pos.set(x, 0.08, z);
    disco.vel.set(
      (objetivoX - x) / (dist / v),
      (objetivoY - 0.08) / (dist / v) + 0.5 * 9.81 * (dist / v),
      -v,
    );
    audio.hit();
    haptics.impact(turno, 1);
  }

  function juzgar(gol, motivo) {
    fase = 'juzgar';
    reloj = 0;
    resultado = motivo;
    if (gol) {
      goles[turno]++;
      audio.score(turno);
      haptics.play('score', { player: turno });
    } else {
      audio.thud();
      haptics.play('impact', { player: 1 - turno });
    }
    marcador?.update(goles[0], goles[1]);
  }

  function siguiente() {
    tiro[turno]++;
    if (tiro[0] > TIROS && tiro[1] > TIROS) return rematar();
    if (tiro[1 - turno] <= TIROS) turno = 1 - turno;
    preparar();
  }

  function rematar() {
    acabado = true;
    const gan = goles[0] === goles[1] ? -1 : goles[0] > goles[1] ? 0 : 1;
    audio.win();
    if (gan >= 0) haptics.victory(gan);
    ctx.finish({
      winner: gan,
      scores: [goles[0], goles[1]],
      detail: gan < 0 ? `Empate a ${goles[0]}` : `${players[gan].name} marca ${goles[gan]} de ${TIROS}`,
      record: ctx.record('goles', Math.max(...goles), 'high'),
    });
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `${TIROS} tiros cada uno` });
      preparar();
    },

    update(dt) {
      if (acabado) return;
      reloj += dt;
      const ata = input.player(turno);
      const por = input.player(1 - turno);

      // El portero se mueve siempre, incluso mientras el otro se acerca.
      porteroX += por.ax * 3.4 * dt;
      porteroX = Math.max(-ANCHO_PORTERIA - 0.3, Math.min(ANCHO_PORTERIA + 0.3, porteroX));
      if (por.pressed('a')) porteroY = 0.55;         // estirada alta
      porteroY = Math.max(0, porteroY - dt * 0.9);
      portero.position.x = porteroX;
      portero.position.y = porteroY;
      guante.position.y = 1.1 + porteroY * 0.5;

      if (fase === 'avanzar') {
        z -= (5.5 + (ata.held('a') ? 3 : 0)) * dt;
        x += ata.ax * 4.5 * dt;
        x = Math.max(-6, Math.min(6, x));
        if (ata.held('up')) altura = Math.min(ALTO_PORTERIA * 0.95, altura + 1.1 * dt);
        if (ata.held('down')) altura = Math.max(0.05, altura - 1.1 * dt);
        mira = Math.max(-1, Math.min(1, mira + (ata.pressed('left') ? -0.34 : 0) + (ata.pressed('right') ? 0.34 : 0)));

        atacante.position.set(x, 0, z);
        disco.pos.set(x + 0.4, 0.06, z - 0.7);
        if (ata.pressed('b')) tirar();
        else if (z < PORTERIA_Z + 2.2) juzgar(false, 'Se quedó sin sitio: tiro nulo');
      } else if (fase === 'tiro') {
        integrar(disco, dt, { gravedad: 9.81, arrastre: 0.02 });
        if (disco.pos.y < disco.r) { disco.pos.y = disco.r; disco.vel.y = Math.abs(disco.vel.y) * 0.3; }

        // Parada: el guante y la pala cubren un rectángulo alrededor del portero.
        const dz = disco.pos.z - (PORTERIA_Z + 0.6);
        if (dz < 0.25 && dz > -0.4) {
          const dx = Math.abs(disco.pos.x - porteroX);
          const dy = Math.abs(disco.pos.y - (0.7 + porteroY));
          if (dx < 0.75 && dy < 0.85) { juzgar(false, `¡Paradón de ${players[1 - turno].name}!`); }
        }
        if (disco.pos.z <= PORTERIA_Z && fase === 'tiro') {
          const dentro = Math.abs(disco.pos.x) < ANCHO_PORTERIA && disco.pos.y < ALTO_PORTERIA;
          juzgar(dentro, dentro ? '¡GOL!' : 'Fuera');
        }
      } else if (fase === 'juzgar') {
        integrar(disco, dt, { gravedad: 9.81, arrastre: 0.6 });
        if (disco.pos.y < disco.r) { disco.pos.y = disco.r; disco.vel.set(0, 0, 0); }
        if (reloj > 2) siguiente();
      }

      disco.malla.position.copy(disco.pos);
      ajustarSombra(sombra, disco.malla, 0, 3);
      palo.rotation.y = fase === 'tiro' && reloj < 0.2 ? -1.1 : -0.15;

      const foco = fase === 'avanzar' ? z : disco.pos.z;
      mundo.camara.position.lerp(new THREE.Vector3(x * 0.5, 3.2, foco + 7), Math.min(1, dt * 3));
      mundo.camara.lookAt(porteroX * 0.4, 1, PORTERIA_Z);

      panel.centro(fase === 'juzgar'
        ? resultado
        : `Tira <b style="color:${players[turno].color}">${players[turno].name}</b> · para <b style="color:${players[1 - turno].color}">${players[1 - turno].name}</b>`);
      panel.sub(`${goles[0]} — ${goles[1]} · tiro ${Math.min(tiro[turno], TIROS)}/${TIROS}`
        + (fase === 'avanzar' ? ` · a ${Math.abs(PORTERIA_Z - z).toFixed(1)} m · apuntando ${mira < -0.15 ? 'a la izquierda' : mira > 0.15 ? 'a la derecha' : 'al centro'}, ${altura > 0.7 ? 'arriba' : 'abajo'}` : ''));
      panel.pie('atacante: ← → apuntan, ↑ ↓ la altura, acción acelera y especial dispara · portero: ← → mueven el guante, acción estira');
      panel.barra(fase === 'avanzar' ? altura / ALTO_PORTERIA : null, players[turno].color);
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
