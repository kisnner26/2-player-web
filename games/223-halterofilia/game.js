/**
 * Halterofilia — el peso lo eliges tú, y ahí está el juego.
 *
 * Tres intentos por cabeza. Antes de cada uno se decide cuánto cargar: más kilos
 * valen más, pero el tirón necesita más cadencia y la barra se te va antes al
 * sostenerla. Ir a lo seguro tres veces casi nunca gana; pasarse una vez,
 * tampoco.
 *
 * El levantamiento tiene dos partes de verdad: el TIRÓN (alternar las dos
 * direcciones al ritmo justo, no lo más rápido posible) y el SOSTÉN, donde la
 * barra se inclina sola y hay que corregir tres segundos sin pasarse, porque
 * cada corrección mete inercia y la siguiente llega más fuerte.
 */

import { crearMundo, crearPanel, suelo, sala, mat, caja, esfera, cilindro, gradas, THREE } from '../../core/tres.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const INTENTOS = 3;
const PESOS = [80, 95, 110, 125, 140, 155];
const SOSTEN = 3;              // segundos de barra arriba para validar

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#101828', horizonte: '#243044', sol: 2.6, solPos: [12, 24, 14],
    sombraArea: 16, fov: 42,
  });
  const panel = crearPanel(ctx.root);
  sala(mundo, { color: '#141a26', tam: 64, alto: 20 });
  suelo(mundo, { color: '#3a2f28', veta: '#2e2520', repite: 40 });
  gradas(mundo, { filas: 3, porFila: 22, radio: 20, alturaBase: 2 });

  // Tarima
  mundo.escena.add(caja(8, 0.3, 8, mat('#6b5232', { rug: 0.9 }), [0, 0.15, 0]));

  const atleta = new THREE.Group();
  const tronco = cilindro(0.42, 0.46, 1.5, mat('#e8e0d0', { rug: 0.7 }), [0, 1.05, 0]);
  const cabeza = esfera(0.28, mat('#e0b890'), [0, 2.05, 0], 16);
  const piernaIzq = caja(0.24, 1, 0.24, mat('#2a2a38'), [-0.22, 0.5, 0]);
  const piernaDer = caja(0.24, 1, 0.24, mat('#2a2a38'), [0.22, 0.5, 0]);
  atleta.add(tronco, cabeza, piernaIzq, piernaDer);
  atleta.position.set(0, 0.3, 0);
  mundo.escena.add(atleta);

  // Barra y discos: los discos cambian de tamaño con el peso elegido.
  const barra = new THREE.Group();
  const eje = cilindro(0.05, 0.05, 4.2, mat('#c8ccd4', { rug: 0.3, met: 0.8 }));
  eje.rotation.z = Math.PI / 2;
  barra.add(eje);
  const discos = [];
  for (const s of [-1, 1]) {
    const d = cilindro(0.5, 0.5, 0.22, mat('#1a1a22', { rug: 0.6 }), [s * 1.7, 0, 0], 24);
    d.rotation.z = Math.PI / 2;
    barra.add(d);
    discos.push(d);
  }
  barra.position.set(0, 0.5, 0.55);
  mundo.escena.add(barra);

  let turno = 0, intento = [1, 1], mejor = [0, 0];
  let peso = [2, 2];                 // índice en PESOS por jugador
  let fase = 'elegir';               // elegir | tiron | sosten | juzgar
  let energia = 0, ultima = '', cadencia = 0;
  let altura = 0, inclina = 0, inclinaVel = 0, reloj = 0;
  let marcador = null, acabado = false, aviso = 'Elige el peso';

  mundo.camara.position.set(0, 2.6, 8.2);
  mundo.camara.lookAt(0, 1.5, 0);

  const kilos = () => PESOS[peso[turno]];
  /** Cuánto cuesta este peso, de 0 a 1. Es la dificultad de todo el intento. */
  const dureza = () => peso[turno] / (PESOS.length - 1);

  function empezarIntento() {
    fase = 'tiron';
    energia = 0; ultima = ''; cadencia = 0;
    altura = 0; inclina = 0; inclinaVel = 0; reloj = 0;
    aviso = 'Alterna ← y → con ritmo';
    audio.tone({ freq: 300, dur: 0.12, gain: 0.14, type: 'square' });
  }

  function juzgar(valido) {
    fase = 'juzgar';
    reloj = 0;
    if (valido) {
      mejor[turno] = Math.max(mejor[turno], kilos());
      audio.win();
      haptics.victory(turno);
      aviso = `¡Válido! ${kilos()} kg`;
    } else {
      audio.error();
      haptics.error(turno);
      aviso = 'Nulo';
    }
    marcador?.update(mejor[0], mejor[1]);
  }

  function siguiente() {
    intento[turno]++;
    if (intento[0] > INTENTOS && intento[1] > INTENTOS) return rematar();
    turno = intento[1 - turno] <= INTENTOS ? 1 - turno : turno;
    fase = 'elegir';
    altura = 0; inclina = 0;
    aviso = 'Elige el peso';
  }

  function rematar() {
    acabado = true;
    const gan = mejor[0] === mejor[1] ? -1 : mejor[0] > mejor[1] ? 0 : 1;
    audio.win();
    if (gan >= 0) haptics.victory(gan);
    ctx.finish({
      winner: gan,
      scores: [mejor[0], mejor[1]],
      detail: gan < 0 ? `Empate a ${mejor[0]} kg` : `${players[gan].name} levanta ${mejor[gan]} kg`,
      record: ctx.record('kilos', Math.max(mejor[0], mejor[1]), 'high'),
    });
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `${INTENTOS} intentos` });
      marcador.update(0, 0);
    },

    update(dt) {
      if (acabado) return;
      reloj += dt;
      const pl = input.player(turno);

      if (fase === 'elegir') {
        if (pl.pressed('up')) { peso[turno] = Math.min(PESOS.length - 1, peso[turno] + 1); audio.blip(); }
        if (pl.pressed('down')) { peso[turno] = Math.max(0, peso[turno] - 1); audio.blip(); }
        if (pl.pressed('a')) empezarIntento();
      } else if (fase === 'tiron') {
        let paso = false;
        if (pl.pressed('left') && ultima !== 'left') { ultima = 'left'; paso = true; }
        if (pl.pressed('right') && ultima !== 'right') { ultima = 'right'; paso = true; }
        if (paso) {
          // Cadencia óptima: ni lenta ni frenética. Con más peso, más lenta.
          const ideal = 0.16 + dureza() * 0.06;
          const err = Math.abs(cadencia - ideal);
          energia += err < 0.05 ? 0.1 : err < 0.11 ? 0.06 : 0.02;
          cadencia = 0;
          audio.tone({ freq: 180 + energia * 260, dur: 0.03, gain: 0.08, type: 'square' });
          haptics.play('tick', { player: turno });
        }
        cadencia += dt;
        // El peso tira hacia abajo todo el rato: parar es perder el intento.
        energia = Math.max(0, energia - (0.14 + dureza() * 0.22) * dt);
        altura = energia * 2.2;
        if (energia >= 1) {
          fase = 'sosten';
          reloj = 0;
          inclina = (Math.random() - 0.5) * 0.12;
          inclinaVel = 0;
          aviso = 'Aguanta y corrige con ← →';
          audio.thud();
          haptics.play('heavy');
        } else if (reloj > 9) {
          juzgar(false);
        }
      } else if (fase === 'sosten') {
        altura = 2.2;
        // La barra se cae hacia donde ya está inclinada: cuanto más peso, antes.
        inclinaVel += (Math.sign(inclina) * (0.9 + dureza() * 1.5) * Math.abs(inclina) + pl.x * -2.6) * dt;
        inclinaVel *= Math.pow(0.35, dt);
        inclina += inclinaVel * dt;
        if (Math.abs(inclina) > 0.42) juzgar(false);
        else if (reloj >= SOSTEN) juzgar(true);
      } else if (fase === 'juzgar') {
        altura = Math.max(0, altura - 5 * dt);
        if (reloj > 1.8) siguiente();
      }

      // Puesta en escena del levantamiento
      barra.position.y = 0.5 + altura;
      barra.position.z = 0.55 - altura * 0.22;
      barra.rotation.z = inclina;
      const escala = 0.34 + dureza() * 0.34;
      for (const d of discos) d.scale.set(escala / 0.5, 1, escala / 0.5);
      atleta.position.y = 0.3 - (fase === 'tiron' ? (1 - energia) * 0.35 : 0);
      atleta.rotation.x = fase === 'tiron' ? -(1 - energia) * 0.5 : 0;
      const col = players[turno].color;
      tronco.material.color.set(col);

      mundo.camara.position.y += (2.4 + altura * 0.5 - mundo.camara.position.y) * Math.min(1, dt * 3);
      mundo.camara.lookAt(0, 1.2 + altura * 0.6, 0);

      panel.centro(`<b style="color:${col}">${players[turno].name}</b> · ${kilos()} kg · intento ${Math.min(intento[turno], INTENTOS)}/${INTENTOS}`);
      panel.sub(`${aviso} · mejores marcas: ${mejor[0]} kg — ${mejor[1]} kg`
        + (fase === 'sosten' ? ` · ${Math.max(0, SOSTEN - reloj).toFixed(1)} s` : ''));
      panel.pie(fase === 'elegir'
        ? '↑ ↓ eligen el peso · tu tecla empieza el levantamiento'
        : fase === 'sosten'
          ? '← → corrigen la inclinación · aguanta tres segundos'
          : 'alterna ← y → con ritmo constante, no a lo bruto');
      panel.barra(fase === 'tiron' ? energia : fase === 'sosten' ? 1 - Math.abs(inclina) / 0.42 : null,
        fase === 'sosten' && Math.abs(inclina) > 0.3 ? '#ff4757' : col);
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
