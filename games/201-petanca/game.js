/**
 * Petanca — la bola más cerca del boliche, y ahí empieza la discusión.
 *
 * Se tira por turnos, pero no siempre le toca al mismo: tira quien va
 * PERDIENDO, que es la regla de verdad y la que hace que la última bola valga
 * tanto. Si te pones cerca, el otro sigue tirando hasta que se acerque más o
 * se quede sin bolas.
 *
 * Y como todo choca con todo, la jugada buena casi nunca es acercarse: es
 * darle a la suya y mandarla a tomar viento. Eso es el "tiro" de la petanca de
 * verdad y aquí funciona igual.
 */

import { crearMundo, crearPanel, suelo, mat, esfera, cilindro, sombraContacto, ajustarSombra, THREE } from '../../core/tres.js';
import { cuerpo, integrar, rodar, rodarMalla, rebotarSuelo, chocar, todoQuieto } from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const BOLAS = 3;               // por jugador
const R_BOLA = 0.37;
const R_BOCHE = 0.16;
const LARGO = 26;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#7fa8c8', horizonte: '#c9b489', sol: 2.4, solPos: [16, 26, 10],
    sombraArea: 22, fov: 38, niebla: 0.006,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#b8a173', veta: '#a08a5e', repite: 90, lineas: 0 });

  // Cancha marcada con dos listones.
  for (const z of [2, -LARGO]) {
    const l = cilindro(0.08, 0.08, 9, mat('#5a4630'), [0, 0.08, z]);
    l.rotation.z = Math.PI / 2;
    mundo.escena.add(l);
  }

  const boche = cuerpo({ x: 0, y: R_BOCHE, z: -LARGO * 0.72, r: R_BOCHE });
  boche.malla = esfera(R_BOCHE, mat('#e8523c', { rug: 0.5 }), [0, R_BOCHE, boche.pos.z], 18);
  boche.malla.castShadow = true;
  mundo.escena.add(boche.malla);

  const bolas = [];
  const sombras = [];
  let turno = 0, restantes = [BOLAS, BOLAS];
  let fase = 'apuntar', angulo = 0, fuerza = 0, subiendo = true, altura = 0.35;
  let marcador = null, t = 0, acabado = false, aviso = '';

  const mira = new THREE.Group();
  const flecha = cilindro(0.05, 0.05, 3.4, mat('#ffffff', { emisivo: '#ffffff', brillo: 0.5 }), [0, 0.06, -1.7]);
  flecha.rotation.x = Math.PI / 2;
  mira.add(flecha);
  mundo.escena.add(mira);

  mundo.camara.position.set(0, 4.4, 7.2);
  mundo.camara.lookAt(0, 0.4, -LARGO * 0.5);

  function lanzar() {
    const c = cuerpo({ x: 0, y: altura, z: 1.2, r: R_BOLA, masa: 1 });
    const col = players[turno].color;
    c.malla = esfera(R_BOLA, mat(col, { rug: 0.28, met: 0.7 }), [0, altura, 1.2], 22);
    c.malla.castShadow = true;
    c.due = turno;
    mundo.escena.add(c.malla);
    const s = sombraContacto(R_BOLA * 1.1, 0.34);
    mundo.escena.add(s);
    sombras.push({ s, c });
    const v = 5 + fuerza * 16;
    c.vel.set(Math.sin(angulo) * v, 2.4 + fuerza * 1.6, -Math.cos(angulo) * v);
    bolas.push(c);
    restantes[turno]--;
    fase = 'rodando';
    audio.swoosh();
    haptics.impact(turno, 0.8);
  }

  /** Distancia horizontal de una bola al boliche. */
  const dist = (c) => Math.hypot(c.pos.x - boche.pos.x, c.pos.z - boche.pos.z);

  /** Quién manda ahora mismo y con cuántas bolas. */
  function situacion() {
    if (!bolas.length) return { lider: -1, puntos: 0 };
    const orden = [...bolas].sort((a, b) => dist(a) - dist(b));
    const lider = orden[0].due;
    let puntos = 0;
    for (const c of orden) { if (c.due === lider) puntos++; else break; }
    return { lider, puntos };
  }

  function siguienteTurno() {
    const { lider } = situacion();
    // Tira el que va perdiendo; si no le quedan bolas, tira el otro.
    let quien = lider < 0 ? turno : 1 - lider;
    if (restantes[quien] <= 0) quien = 1 - quien;
    if (restantes[0] <= 0 && restantes[1] <= 0) { rematar(); return; }
    turno = quien;
    fase = 'apuntar';
    angulo = 0;
    fuerza = 0;
    subiendo = true;
  }

  function rematar() {
    acabado = true;
    const { lider, puntos } = situacion();
    audio.win();
    if (lider >= 0) haptics.victory(lider);
    ctx.finish({
      winner: lider,
      scores: lider === 0 ? [puntos, 0] : [0, puntos],
      detail: lider < 0 ? 'Nadie se acercó' : `${players[lider].name} se lleva ${puntos} punto${puntos > 1 ? 's' : ''}`,
      record: ctx.record('puntos', puntos, 'high'),
    });
  }

  function pintarPanel() {
    const { lider, puntos } = situacion();
    panel.centro(acabado ? 'Fin de la mano'
      : fase === 'apuntar'
        ? `<b style="color:${players[turno].color}">${players[turno].name}</b> tira`
        : 'rodando…');
    panel.sub(lider < 0
      ? `bolas: ${restantes[0]} — ${restantes[1]}`
      : `manda <b style="color:${players[lider].color}">${players[lider].name}</b> con ${puntos} · bolas: ${restantes[0]} — ${restantes[1]}${aviso ? ` · ${aviso}` : ''}`);
    panel.pie('← → apuntan · ↑ ↓ cambian la altura de tiro · tu tecla lanza (la barra es la fuerza)');
    panel.barra(fase === 'apuntar' ? fuerza : null, players[turno].color);
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `${BOLAS} bolas cada uno` });
      marcador.update(BOLAS, BOLAS);
    },

    update(dt) {
      t += dt;
      const p = input.player(turno);

      if (fase === 'apuntar') {
        if (p.held('left')) angulo -= 0.55 * dt;
        if (p.held('right')) angulo += 0.55 * dt;
        angulo = Math.max(-0.42, Math.min(0.42, angulo));
        if (p.held('up')) altura = Math.min(1.5, altura + 0.9 * dt);
        if (p.held('down')) altura = Math.max(0.18, altura - 0.9 * dt);
        // Barra de fuerza que va y viene: el clásico y sigue siendo el mejor.
        fuerza += (subiendo ? 1 : -1) * dt * 0.85;
        if (fuerza >= 1) { fuerza = 1; subiendo = false; }
        if (fuerza <= 0) { fuerza = 0; subiendo = true; }
        mira.position.set(0, 0, 1.2);
        mira.rotation.y = -angulo;
        mira.visible = true;
        if (p.pressed('a')) lanzar();
      } else if (fase === 'rodando') {
        mira.visible = false;
        for (const c of bolas) {
          integrar(c, dt, { arrastre: 0.05 });
          const imp = rebotarSuelo(c, 0, { restitucion: 0.22, friccion: 0.72, minRebote: 0.7 });
          if (imp > 1.4) { audio.thud(); haptics.play('tick'); }
          rodar(c, dt, { friccion: 1.15, umbral: 0.09 });
          rodarMalla(c, dt);
          c.malla.position.copy(c.pos);
        }
        integrar(boche, dt, { arrastre: 0.05 });
        rebotarSuelo(boche, 0, { restitucion: 0.2, friccion: 0.7 });
        rodar(boche, dt, { friccion: 1.5, umbral: 0.09 });
        boche.malla.position.copy(boche.pos);

        for (let i = 0; i < bolas.length; i++) {
          for (let k = i + 1; k < bolas.length; k++) {
            const v = chocar(bolas[i], bolas[k], 0.86);
            if (v > 1.2) { audio.hit(); haptics.impact(null, Math.min(1.3, v / 6)); }
          }
          const vb = chocar(bolas[i], boche, 0.8);
          if (vb > 1) audio.blip();
        }

        if (todoQuieto([...bolas, boche], 0.1)) {
          const { lider } = situacion();
          aviso = lider >= 0 ? `bola de ${players[lider].name} más cerca` : '';
          if (restantes[0] <= 0 && restantes[1] <= 0) rematar();
          else siguienteTurno();
        }
      }

      for (const { s, c } of sombras) ajustarSombra(s, c.malla, 0, 4);
      const foco = fase === 'rodando' && bolas.length ? bolas[bolas.length - 1].pos : new THREE.Vector3(0, 0, -LARGO * 0.5);
      mundo.camara.position.x += (foco.x * 0.25 - mundo.camara.position.x) * Math.min(1, dt * 2);
      mundo.camara.lookAt(0, 0.4, Math.min(-4, foco.z));
      pintarPanel();
      marcador?.update(restantes[0], restantes[1]);
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
