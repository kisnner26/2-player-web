/**
 * Shuffleboard — llegar al final de la tabla sin pasarse.
 *
 * La tabla está encerada y el disco casi no frena, así que el juego entero
 * cabe en un empujón: pasarse un pelo y se cae por el borde, quedarse corto y
 * te lo tira el rival de un golpe.
 *
 * Puntúa solo el disco que esté MÁS lejos, y solo cuentan los que estén por
 * delante del suyo. Por eso la última tirada suele ser defensiva: no vale con
 * tener uno bueno, hay que tener el mejor.
 */

import { crearMundo, crearPanel, mat, caja, cilindro, sombraContacto, ajustarSombra, THREE } from '../../core/tres.js';
import { cuerpo, integrar, rodar, chocar, todoQuieto } from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const DISCOS = 4;
const LARGO = 30;
const ANCHO = 2.6;
const R = 0.34;
const ZONAS = [
  { desde: -LARGO * 0.5, hasta: -LARGO * 0.38, pts: 3, color: '#ff2e88' },
  { desde: -LARGO * 0.38, hasta: -LARGO * 0.26, pts: 2, color: '#ffd166' },
  { desde: -LARGO * 0.26, hasta: -LARGO * 0.12, pts: 1, color: '#3aa0ff' },
];

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#141019', horizonte: '#2a2436', sol: 2.2, solPos: [6, 18, 12],
    sombraArea: 18, fov: 34,
  });
  const panel = crearPanel(ctx.root);

  mundo.escena.add(caja(60, 0.4, 60, mat('#1a141f', { rug: 1 }), [0, -0.4, 0]));
  const tabla = caja(ANCHO, 0.3, LARGO, mat('#c9a86a', { rug: 0.2 }), [0, 0, 0]);
  tabla.receiveShadow = true;
  mundo.escena.add(tabla);
  for (const z of ZONAS) {
    mundo.escena.add(caja(ANCHO, 0.02, z.hasta - z.desde,
      mat(z.color, { rug: 0.4, transparente: 0.35 }), [0, 0.17, (z.desde + z.hasta) / 2]));
  }

  const discos = [];
  const sombras = [];
  let turno = 0, restantes = [DISCOS, DISCOS];
  let fase = 'apuntar', desvio = 0, fuerza = 0, subiendo = true;
  let marcador = null, terminado = false, aviso = '';

  const guia = caja(0.06, 0.05, 6, mat('#ffffff', { emisivo: '#ffffff', brillo: 0.4 }), [0, 0.2, LARGO * 0.36]);
  mundo.escena.add(guia);

  mundo.camara.position.set(0, 9, LARGO * 0.62);
  mundo.camara.lookAt(0, 0, -LARGO * 0.15);

  function lanzar() {
    const c = cuerpo({ x: desvio, y: 0.32, z: LARGO * 0.46, r: R, masa: 1 });
    c.due = turno;
    c.malla = cilindro(R, R, 0.16, mat(players[turno].color, { rug: 0.35, met: 0.4 }), [desvio, 0.24, LARGO * 0.46], 22);
    c.malla.castShadow = true;
    mundo.escena.add(c.malla);
    const s = sombraContacto(R * 1.2, 0.3);
    mundo.escena.add(s);
    sombras.push({ s, c });
    c.vel.set(0, 0, -(7 + fuerza * 13));
    discos.push(c);
    restantes[turno]--;
    fase = 'rodando';
    audio.swoosh();
    haptics.impact(turno, 0.7);
  }

  /** Puntuación: solo cuenta el bando cuyo disco está más adelantado. */
  function contar() {
    const validos = discos.filter((c) => c.pos.z < ZONAS[2].hasta && Math.abs(c.pos.x) < ANCHO / 2 && c.pos.y > -1);
    if (!validos.length) return { lider: -1, pts: 0 };
    const orden = [...validos].sort((a, b) => a.pos.z - b.pos.z);
    const lider = orden[0].due;
    let pts = 0;
    for (const c of orden) {
      if (c.due !== lider) break;
      const z = ZONAS.find((zz) => c.pos.z >= zz.desde && c.pos.z < zz.hasta);
      pts += z ? z.pts : 0;
    }
    return { lider, pts };
  }

  function siguiente() {
    if (restantes[0] <= 0 && restantes[1] <= 0) {
      terminado = true;
      const { lider, pts } = contar();
      audio.win();
      if (lider >= 0) haptics.victory(lider);
      ctx.finish({
        winner: lider,
        scores: lider === 0 ? [pts, 0] : [0, pts],
        detail: lider < 0 ? 'Ningún disco en zona' : `${players[lider].name} se lleva ${pts} puntos`,
        record: ctx.record('puntos', pts, 'high'),
      });
      return;
    }
    turno = restantes[1 - turno] > 0 ? 1 - turno : turno;
    fase = 'apuntar';
    desvio = 0;
    fuerza = 0;
    subiendo = true;
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `${DISCOS} discos cada uno` });
      marcador.update(DISCOS, DISCOS);
    },

    update(dt) {
      if (terminado) return;
      const p = input.player(turno);

      if (fase === 'apuntar') {
        guia.visible = true;
        if (p.held('left')) desvio -= 1.4 * dt;
        if (p.held('right')) desvio += 1.4 * dt;
        desvio = Math.max(-ANCHO / 2 + R, Math.min(ANCHO / 2 - R, desvio));
        fuerza += (subiendo ? 1 : -1) * dt * 0.75;
        if (fuerza >= 1) { fuerza = 1; subiendo = false; }
        if (fuerza <= 0) { fuerza = 0; subiendo = true; }
        guia.position.set(desvio, 0.2, LARGO * 0.36);
        if (p.pressed('a')) lanzar();
      } else if (fase === 'rodando') {
        guia.visible = false;
        for (const c of discos) {
          if (c.pos.y < -1) continue;
          integrar(c, dt, { gravedad: Math.abs(c.pos.x) > ANCHO / 2 || c.pos.z < -LARGO / 2 ? 9.8 : 0 });
          rodar(c, dt, { friccion: 0.42, umbral: 0.12 });
          c.malla.position.copy(c.pos);
          c.malla.position.y = c.pos.y - 0.08;
        }
        for (let i = 0; i < discos.length; i++) {
          for (let k = i + 1; k < discos.length; k++) {
            const v = chocar(discos[i], discos[k], 0.9);
            if (v > 1) { audio.hit(); haptics.impact(null, Math.min(1.2, v / 8)); }
          }
        }
        if (todoQuieto(discos.filter((c) => c.pos.y > -1), 0.14)
            && discos.every((c) => c.pos.y > -1 || c.pos.y < -6)) {
          const { lider, pts } = contar();
          aviso = lider < 0 ? 'nadie en zona' : `manda ${players[lider].name} con ${pts}`;
          siguiente();
        }
      }

      for (const { s, c } of sombras) ajustarSombra(s, c.malla, 0.16, 4);
      const { lider, pts } = contar();
      panel.centro(fase === 'apuntar'
        ? `tira <b style="color:${players[turno].color}">${players[turno].name}</b>`
        : 'deslizando…');
      panel.sub(`discos: ${restantes[0]} — ${restantes[1]}${lider >= 0 ? ` · manda <b style="color:${players[lider].color}">${players[lider].name}</b> con ${pts}` : ''}`);
      panel.pie('← → colocan el disco · tu tecla lo suelta con la fuerza de la barra · si se cae, no cuenta');
      panel.barra(fase === 'apuntar' ? fuerza : null, players[turno].color);
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
