/**
 * Demolición — tres bolas, una torre y toda la culpa repartida.
 *
 * Cada uno tiene su torre idéntica y le lanza a la suya, así que no hay excusa
 * de "me tocó la fácil". Puntúa cada caja que acaba TUMBADA, no las que se
 * mueven: empujar la torre de lado no vale, hay que quitarle la base.
 *
 * Las cajas se caen unas sobre otras. Por eso el tiro bueno casi nunca es el
 * más fuerte al centro, sino el que descalza una esquina de abajo y deja que
 * el resto haga el trabajo.
 */

import { crearMundo, crearPanel, suelo, mat, caja, esfera, sombraContacto, ajustarSombra, THREE } from '../../core/tres.js';
import { cuerpo, integrar, rebotarSuelo, pieza, pasoPieza, empujar } from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const TIROS = 3;
const FILAS = 4, POR_FILA = 3;
const LADO = 0.9;
const TORRE_Z = -17;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#5a6a8a', horizonte: '#b8a890', sol: 2.6, solPos: [16, 28, 14],
    sombraArea: 26, fov: 46, niebla: 0.005,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#8a7a5a', veta: '#75664c', repite: 70 });

  /** Una torre de cajas apiladas para un jugador. */
  function construir(cx, color) {
    const piezas = [];
    for (let f = 0; f < FILAS; f++) {
      for (let k = 0; k < POR_FILA; k++) {
        const desfase = f % 2 ? LADO * 0.5 : 0;
        // La altura parte de la plataforma (0,3), no del suelo: si no, la
        // primera pasada de física las sube de golpe y la torre "salta" sola.
        const m = caja(LADO, LADO, LADO, mat(f % 2 ? color : '#a08a68', { rug: 0.85 }),
          [cx + (k - (POR_FILA - 1) / 2) * (LADO * 1.06) + desfase, 0.3 + LADO / 2 + f * LADO, TORRE_Z]);
        mundo.escena.add(m);
        piezas.push(pieza(m, { r: LADO / 2, alto: LADO, masa: 1 }));
      }
    }
    return piezas;
  }

  const torres = [construir(-5, players[0].color), construir(5, players[1].color)];
  const plataformas = [-5, 5].map((x) => caja(4.4, 0.3, 4.4, mat('#6b6b74', { rug: 1 }), [x, 0.15, TORRE_Z]));
  mundo.escena.add(...plataformas);

  const bola = cuerpo({ x: 0, y: 1, z: 4, r: 0.42, masa: 12 });
  bola.malla = esfera(0.42, mat('#3a3a44', { rug: 0.5, met: 0.6 }), [0, 1, 4], 20);
  mundo.escena.add(bola.malla);
  const sombra = sombraContacto(0.45, 0.32);
  mundo.escena.add(sombra);

  const mira = new THREE.Group();
  const flecha = caja(0.06, 0.06, 4, mat('#ffffff', { emisivo: '#ffffff', brillo: 0.6 }), [0, 0, -2]);
  mira.add(flecha);
  mundo.escena.add(mira);

  let turno = 0, tiro = [1, 1];
  let fase = 'apuntar', angulo = 0, elevacion = 0.6, fuerza = 0, cargando = false, reloj = 0;
  let marcador = null, acabado = false, aviso = '';

  const base = () => new THREE.Vector3(turno === 0 ? -5 : 5, 1.2, 4);
  const tumbadas = (i) => torres[i].filter((p) => p.caida).length;

  function lanzar() {
    const b = base();
    bola.pos.copy(b);
    const v = 11 + fuerza * 15;
    bola.vel.set(
      Math.sin(angulo) * v * Math.cos(elevacion),
      v * Math.sin(elevacion),
      -Math.cos(angulo) * v * Math.cos(elevacion),
    );
    bola.quieto = false;
    fase = 'volando';
    reloj = 0;
    audio.swoosh();
    haptics.impact(turno, 0.9);
  }

  function siguiente() {
    tiro[turno]++;
    if (tiro[0] > TIROS && tiro[1] > TIROS) return rematar();
    if (tiro[1 - turno] <= TIROS) turno = 1 - turno;
    fase = 'apuntar';
    angulo = 0; elevacion = 0.6; fuerza = 0; cargando = false;
    bola.pos.copy(base());
    bola.vel.set(0, 0, 0);
  }

  function rematar() {
    acabado = true;
    const a = tumbadas(0), b = tumbadas(1);
    const gan = a === b ? -1 : a > b ? 0 : 1;
    audio.win();
    if (gan >= 0) haptics.victory(gan);
    ctx.finish({
      winner: gan,
      scores: [a, b],
      detail: gan < 0
        ? `Empate: ${a} cajas cada uno`
        : `${players[gan].name} tira ${Math.max(a, b)} de ${FILAS * POR_FILA}`,
      record: ctx.record('cajas', Math.max(a, b), 'high'),
    });
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `${TIROS} tiros cada uno` });
      marcador.update(0, 0);
      mundo.camara.position.set(0, 6, 12);
      mundo.camara.lookAt(0, 2, TORRE_Z);
    },

    update(dt) {
      if (acabado) return;
      reloj += dt;
      const pl = input.player(turno);

      if (fase === 'apuntar') {
        if (pl.held('left')) angulo -= 0.5 * dt;
        if (pl.held('right')) angulo += 0.5 * dt;
        angulo = Math.max(-0.5, Math.min(0.5, angulo));
        if (pl.held('up')) elevacion = Math.min(1.2, elevacion + 0.6 * dt);
        if (pl.held('down')) elevacion = Math.max(0.05, elevacion - 0.6 * dt);
        if (pl.pressed('a')) { cargando = true; fuerza = 0; }
        if (cargando) {
          fuerza = Math.min(1, fuerza + dt * 0.8);
          if (!pl.held('a') || fuerza >= 1) { cargando = false; lanzar(); }
        }
        const b = base();
        bola.pos.copy(b);
        mira.position.copy(b);
        mira.rotation.set(0, -angulo, 0);
        flecha.position.set(0, Math.sin(elevacion) * 2, -2 * Math.cos(elevacion));
        mira.visible = true;
      } else if (fase === 'volando') {
        mira.visible = false;
        integrar(bola, dt, { arrastre: 0.03 });
        const imp = rebotarSuelo(bola, 0, { restitucion: 0.32, friccion: 0.7, minRebote: 0.8 });
        if (imp > 2) audio.thud();

        // Impacto contra las cajas: se empuja la golpeada y se contagia a las
        // vecinas, que es lo que hace que una torre se venga abajo entera.
        for (const p of torres[turno]) {
          const d = p.pos.distanceTo(bola.pos);
          if (d > bola.r + p.r * 1.5) continue;
          const dir = new THREE.Vector3().subVectors(p.pos, bola.pos);
          const fuerzaGolpe = Math.min(9, bola.vel.length() * 0.5);
          if (fuerzaGolpe < 0.6) continue;
          empujar(p, dir, fuerzaGolpe);
          bola.vel.multiplyScalar(0.62);
          audio.hit();
          haptics.impact(null, Math.min(1.2, fuerzaGolpe / 6));
          ctx.shake?.(6);
        }

        // El turno acaba cuando se para todo, con un tope por si algo rueda
        // eternamente: una torre que no termina de caerse bloquea la partida.
        if (reloj > 3) {
          const quietas = torres[turno].every((p) => p.quieto);
          const parada = bola.pos.y <= bola.r + 0.06 && Math.hypot(bola.vel.x, bola.vel.z) < 0.4;
          if ((quietas && parada) || reloj > 9) {
            aviso = `${tumbadas(turno)} cajas tumbadas`;
            siguiente();
          }
        }
      }

      // Las cajas caen solas y se contagian entre ellas por contacto.
      for (const t of torres) {
        for (const p of t) {
          pasoPieza(p, dt, { sueloY: 0.3 });
          if (p.quieto) continue;
          for (const o of t) {
            if (o === p || o.quieto) continue;
            const d = p.pos.distanceTo(o.pos);
            if (d < LADO * 0.95 && d > 0.001) {
              const dir = new THREE.Vector3().subVectors(o.pos, p.pos);
              empujar(o, dir, Math.min(3, p.vel.length() * 0.7));
            }
          }
        }
      }

      bola.malla.position.copy(bola.pos);
      ajustarSombra(sombra, bola.malla, 0, 8);
      marcador?.update(tumbadas(0), tumbadas(1));

      const foco = fase === 'volando' ? bola.pos : new THREE.Vector3(turno === 0 ? -5 : 5, 2, TORRE_Z);
      mundo.camara.position.lerp(
        new THREE.Vector3(foco.x * 0.6, 6, Math.max(TORRE_Z + 9, foco.z + 9)), Math.min(1, dt * 2.2),
      );
      mundo.camara.lookAt(turno === 0 ? -5 : 5, 1.8, TORRE_Z);

      panel.centro(fase === 'apuntar'
        ? `<b style="color:${players[turno].color}">${players[turno].name}</b> · tiro ${Math.min(tiro[turno], TIROS)}/${TIROS}`
        : 'volando…');
      panel.sub(`cajas tumbadas: ${tumbadas(0)} — ${tumbadas(1)} de ${FILAS * POR_FILA}`
        + ` · elevación ${Math.round(elevacion * 57)}°${aviso ? ` · ${aviso}` : ''}`);
      panel.pie('← → apuntan · ↑ ↓ dan elevación · mantén tu tecla para cargar y suéltala para lanzar');
      panel.barra(fase === 'apuntar' ? fuerza : null, players[turno].color);
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
