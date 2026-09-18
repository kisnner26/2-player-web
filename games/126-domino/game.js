/**
 * Dominó — construid la cadena entre los dos y decidid cuándo empujarla.
 *
 * Por turnos se añade una ficha: eliges cuánto la separas de la anterior y
 * cuánto giras la cadena. Separarlas poco es seguro pero avanza poco; separarlas
 * mucho gana terreno y puede dejar un hueco que la caída no salte. La cadena
 * tiene que llegar hasta la botella del final.
 *
 * En vez de colocar, en tu turno puedes EMPUJAR. Ahí se cae todo de verdad, una
 * ficha detrás de otra, y solo hay dos finales: si la caída llega a la botella,
 * gana quien empujó; si se para por el camino, gana el otro. Así que colocar mal
 * a propósito es una jugada legítima — y empujar demasiado pronto, también un
 * error.
 */

import { crearMundo, crearPanel, mat, caja, cilindro, suelo, texturaGrano, THREE } from '../../core/tres.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const ALTO = 1.6, ANCHO = 0.9, GRUESO = 0.28;
const ALCANCE = ALTO - GRUESO * 0.5;    // hasta dónde llega una ficha al caer
const MAX_FICHAS = 26;
const BOTELLA = new THREE.Vector3(16, 0, -13);

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#0d1017', horizonte: '#2a2a3a', sol: 2.4, solPos: [12, 24, 14],
    sombraArea: 24, fov: 44, niebla: 0.008,
  });
  const panel = crearPanel(ctx.root);

  const mesa = new THREE.Mesh(
    new THREE.BoxGeometry(60, 1, 60),
    new THREE.MeshStandardMaterial({
      map: texturaGrano('#7a5230', '#5c3c22', { lineas: 30, repite: 6, ruido: 0.05 }), roughness: 0.75,
    }),
  );
  mesa.position.y = -0.5;
  mesa.receiveShadow = true;
  mundo.escena.add(mesa);

  /* Botella al final del recorrido: el objetivo de la cadena. */
  const botella = new THREE.Group();
  botella.add(cilindro(0.5, 0.6, 1.8, mat('#2f7a4a', { rug: 0.15, met: 0.2 }), [0, 0.9, 0], 16));
  botella.add(cilindro(0.2, 0.34, 0.9, mat('#2f7a4a', { rug: 0.15, met: 0.2 }), [0, 2.2, 0], 12));
  botella.add(cilindro(0.22, 0.22, 0.2, mat('#c9a227', { rug: 0.4, met: 0.7 }), [0, 2.72, 0], 12));
  botella.position.copy(BOTELLA);
  botella.traverse((o) => { o.castShadow = true; });
  mundo.escena.add(botella);
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 1.9, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(BOTELLA.x, 0.02, BOTELLA.z);
  mundo.escena.add(halo);

  /* ---------------- Fichas ---------------- */

  const matFicha = [0, 1].map((j) => mat(players[j].color, { rug: 0.35 }));
  const matPuntos = mat('#101018', { rug: 0.6 });
  const fichas = [];

  function crearFicha(x, z, rumbo, jugador) {
    const g = new THREE.Group();
    const cuerpo = caja(ANCHO, ALTO, GRUESO, matFicha[jugador], [0, ALTO / 2, 0]);
    g.add(cuerpo);
    // Los puntos de la ficha, en las dos mitades.
    for (const my of [0.42, -0.42]) {
      for (const k of [-0.22, 0.22]) {
        const punto = cilindro(0.06, 0.06, 0.02, matPuntos, [k, ALTO / 2 + my * ALTO / 2, GRUESO / 2 + 0.01], 8);
        punto.rotation.x = Math.PI / 2;
        g.add(punto);
      }
    }
    g.add(caja(ANCHO * 0.9, 0.04, 0.02, matPuntos, [0, ALTO / 2, GRUESO / 2 + 0.01]));
    g.position.set(x, 0, z);
    g.rotation.y = rumbo;
    g.traverse((o) => { o.castShadow = true; });
    mundo.escena.add(g);
    const f = { malla: g, x, z, rumbo, jugador, cayendo: false, angulo: 0, retardo: 0 };
    fichas.push(f);
    return f;
  }

  /* ---------------- Estado ---------------- */

  let turno = 0;
  let separacion = 1.0;
  let giro = 0;
  let fase = 'colocar';           // colocar | cayendo | fin
  let empujador = -1;
  let tCaida = 0;
  let cadenaRota = false;
  let aviso = '', avisoT = 0;
  let marcador = null;
  let acabado = false;

  const decir = (t, s = 2.4) => { aviso = t; avisoT = s; };
  const ultima = () => fichas[fichas.length - 1];

  /** Dónde caería la siguiente ficha con la separación y el giro actuales. */
  function siguientePos() {
    const u = ultima();
    const rumbo = u.rumbo + giro;
    return {
      x: u.x + Math.sin(rumbo) * separacion,
      z: u.z + Math.cos(rumbo) * separacion,
      rumbo,
    };
  }

  // Ficha fantasma que enseña dónde va a quedar la siguiente.
  const fantasma = caja(ANCHO, ALTO, GRUESO, new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false,
  }), [0, ALTO / 2, 0]);
  const fantasmaG = new THREE.Group();
  fantasmaG.add(fantasma);
  mundo.escena.add(fantasmaG);

  function colocar() {
    const p = siguientePos();
    if (Math.hypot(p.x, p.z) > 26) { decir('Fuera de la mesa'); audio.error(); return; }
    crearFicha(p.x, p.z, p.rumbo, turno);
    audio.place();
    haptics.tap(turno);
    turno = 1 - turno;
    if (fichas.length >= MAX_FICHAS) {
      decir('Se acabaron las fichas: se empuja sola', 2.4);
      empujar(1 - turno);
    }
  }

  function empujar(quien) {
    empujador = quien;
    fase = 'cayendo';
    tCaida = 0;
    cadenaRota = false;
    // Se calcula la cadena entera de una vez: qué ficha tumba a la siguiente y
    // cuándo. Animar es solo repasar esa lista.
    let t = 0;
    fichas[0].cayendo = true;
    fichas[0].retardo = 0;
    let ultimaCaida = 0;
    for (let i = 1; i < fichas.length; i++) {
      const a = fichas[i - 1], b = fichas[i];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      // Además de la distancia, cuenta el giro: una ficha muy girada recibe el
      // golpe de refilón y a veces no cae.
      const desvio = Math.abs(((b.rumbo - a.rumbo + Math.PI) % (Math.PI * 2)) - Math.PI);
      const llega = d <= ALCANCE - desvio * 0.55;
      if (!llega) { cadenaRota = true; break; }
      t += 0.055 + d * 0.045;
      b.cayendo = true;
      b.retardo = t;
      ultimaCaida = i;
    }
    const fin = fichas[ultimaCaida];
    const llegoBotella = !cadenaRota && Math.hypot(fin.x - BOTELLA.x, fin.z - BOTELLA.z) < ALCANCE + 1.2;
    audio.tone({ freq: 300, dur: 0.06, gain: 0.14, type: 'square' });

    setTimeout(() => {
      if (acabado) return;
      acabado = true;
      const ganador = llegoBotella ? empujador : 1 - empujador;
      if (llegoBotella) { audio.win(); haptics.victory(ganador); }
      else { audio.lose(); haptics.error(empujador); }
      ctx.finish({
        winner: ganador,
        scores: [fichas.filter((f) => f.jugador === 0).length, fichas.filter((f) => f.jugador === 1).length],
        detail: llegoBotella
          ? `La cadena llegó a la botella con ${fichas.length} fichas`
          : `Se paró en la ficha ${ultimaCaida + 1} de ${fichas.length}`,
        record: ctx.record('fichas', fichas.length, 'high'),
      });
    }, (t + 1.6) * 1000);
  }

  function moverCamara(dt) {
    const u = ultima();
    const foco = fase === 'cayendo'
      ? new THREE.Vector3(BOTELLA.x * 0.5, 0, BOTELLA.z * 0.5)
      : new THREE.Vector3((u.x + BOTELLA.x * 0.35) / 1.35, 0, (u.z + BOTELLA.z * 0.35) / 1.35);
    const objetivo = new THREE.Vector3(foco.x - 6, fase === 'cayendo' ? 16 : 11, foco.z + 14);
    mundo.camara.position.lerp(objetivo, 1 - Math.exp(-2.2 * dt));
    mundo.camara.lookAt(foco.x, 0.6, foco.z);
  }

  function pintarPanel() {
    if (fase === 'cayendo') {
      panel.centro(`Empujó ${players[empujador].name}…`);
      panel.sub('');
      panel.barra(null);
      return;
    }
    const j = players[turno];
    const u = ultima();
    const dBotella = Math.hypot(u.x - BOTELLA.x, u.z - BOTELLA.z);
    const seguro = separacion <= ALCANCE - Math.abs(giro) * 0.55;
    panel.centro(`<span style="color:${j.color}">${j.name}</span> · ficha ${fichas.length + 1}/${MAX_FICHAS}`);
    panel.sub(avisoT > 0 ? aviso
      : `Separación ${separacion.toFixed(2)} ${seguro ? '<span style="color:#a8ff3e">(alcanza)</span>' : '<span style="color:#ff4757">(no alcanza)</span>'} · faltan ${dBotella.toFixed(1)} a la botella`);
    panel.pie('← → girar la cadena · ↑ ↓ separación · acción: colocar · especial: EMPUJAR');
    panel.barra(separacion / (ALTO + 0.2), seguro ? '#a8ff3e' : '#ff4757');
  }

  return {
    init() {
      crearFicha(-14, 12, Math.atan2(BOTELLA.x + 14, BOTELLA.z - 12), 0);
      marcador = ctx.ui.scoreboard({ center: 'Dominó' });
      marcador.update(0, 0);
    },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;

      if (fase === 'colocar') {
        const p = input.player(turno);
        if (p.held('left')) giro = Math.max(-0.42, giro - 0.9 * dt);
        if (p.held('right')) giro = Math.min(0.42, giro + 0.9 * dt);
        if (p.held('up')) separacion = Math.min(ALTO + 0.15, separacion + 0.8 * dt);
        if (p.held('down')) separacion = Math.max(0.42, separacion - 0.8 * dt);
        if (p.pressed('a')) colocar();
        if (p.pressed('b') && fichas.length > 2) empujar(turno);

        const s = siguientePos();
        fantasmaG.visible = true;
        fantasmaG.position.set(s.x, 0, s.z);
        fantasmaG.rotation.y = s.rumbo;
        fantasma.material.color.setStyle(
          separacion <= ALCANCE - Math.abs(giro) * 0.55 ? players[turno].color : '#ff4757');
      } else if (fase === 'cayendo') {
        fantasmaG.visible = false;
        tCaida += dt;
        for (const f of fichas) {
          if (!f.cayendo || tCaida < f.retardo) continue;
          const antes = f.angulo;
          f.angulo = Math.min(Math.PI / 2 - 0.06, f.angulo + dt * 7.5);
          // La ficha gira sobre su canto: se rehace la rotación desde su rumbo
          // y se compensa el pivote adelantando el grupo mientras se tumba.
          f.malla.rotation.set(0, f.rumbo, 0);
          f.malla.rotateX(f.angulo);
          f.malla.position.set(
            f.x + Math.sin(f.rumbo) * (Math.sin(f.angulo) * ALTO * 0.5),
            Math.max(0, -Math.sin(f.angulo) * GRUESO * 0.2),
            f.z + Math.cos(f.rumbo) * (Math.sin(f.angulo) * ALTO * 0.5),
          );
          if (antes === 0) {
            audio.tone({ freq: 620 + Math.random() * 220, dur: 0.045, gain: 0.09, type: 'square', sweep: -180 });
          }
        }
        // La botella cae cuando le llega la última ficha.
        const fin = fichas.filter((f) => f.cayendo).pop();
        if (fin && fin.angulo > 1.2 && Math.hypot(fin.x - BOTELLA.x, fin.z - BOTELLA.z) < ALCANCE + 1.2) {
          botella.rotation.z = Math.min(Math.PI / 2, botella.rotation.z + dt * 3);
          botella.position.y = Math.max(-0.4, botella.position.y - dt * 0.6);
        }
      }

      moverCamara(dt);
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
