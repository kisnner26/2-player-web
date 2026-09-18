/**
 * Quoridor — o avanzas tú, o le pones un muro al otro. Nunca las dos cosas.
 *
 * Cada turno es esa única decisión, y ahí está todo el juego: los muros son
 * diez y no vuelven, así que gastarlos pronto te deja indefenso al final,
 * cuando el rival ya solo necesita tres pasos.
 *
 * La regla de oro está implementada de verdad: un muro NO se puede poner si
 * deja a alguien sin ningún camino hasta su meta. Se comprueba con un recorrido
 * por anchura antes de aceptarlo, así que encerrar al otro es imposible por
 * mucho que se intente.
 */

import { Tablero } from '../../core/boardgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const N = 9;                   // casillas por lado
const REJ = N * 2 - 1;         // rejilla mixta: pares = casilla, impares = ranura
const MUROS = 10;

export function create(ctx) {
  const { audio, haptics, players } = ctx;

  let peones = [];             // {x,y} en coordenadas de casilla
  let murosH = new Set(), murosV = new Set();   // "x,y" con x,y en 0..N-2
  let restantes = [MUROS, MUROS];
  let tab = null, terminado = false, aviso = '';

  const metaY = (j) => (j === 0 ? 0 : N - 1);

  /** ¿Se puede ir de (x,y) a la casilla vecina en esa dirección? */
  function pasoLibre(x, y, dx, dy) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= N || ny >= N) return false;
    if (dy === -1) return !(murosH.has(`${x},${y - 1}`) || murosH.has(`${x - 1},${y - 1}`));
    if (dy === 1) return !(murosH.has(`${x},${y}`) || murosH.has(`${x - 1},${y}`));
    if (dx === -1) return !(murosV.has(`${x - 1},${y}`) || murosV.has(`${x - 1},${y - 1}`));
    if (dx === 1) return !(murosV.has(`${x},${y}`) || murosV.has(`${x},${y - 1}`));
    return false;
  }

  /** ¿Le queda camino a este jugador hasta su fila de meta? */
  function hayCamino(j) {
    const vistos = new Set([`${peones[j].x},${peones[j].y}`]);
    const cola = [peones[j]];
    while (cola.length) {
      const p = cola.shift();
      if (p.y === metaY(j)) return true;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        if (!pasoLibre(p.x, p.y, dx, dy)) continue;
        const k = `${p.x + dx},${p.y + dy}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        cola.push({ x: p.x + dx, y: p.y + dy });
      }
    }
    return false;
  }

  /** Casillas a las que puede saltar el peón, con la regla de salto por encima. */
  function movimientos(j) {
    const yo = peones[j], otro = peones[1 - j];
    const salida = [];
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      if (!pasoLibre(yo.x, yo.y, dx, dy)) continue;
      const nx = yo.x + dx, ny = yo.y + dy;
      if (nx !== otro.x || ny !== otro.y) { salida.push({ x: nx, y: ny }); continue; }
      // Hay alguien delante: se salta por encima si se puede, si no en diagonal.
      if (pasoLibre(nx, ny, dx, dy)) { salida.push({ x: nx + dx, y: ny + dy }); continue; }
      for (const [ex, ey] of dx ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]) {
        if (pasoLibre(nx, ny, ex, ey)) salida.push({ x: nx + ex, y: ny + ey });
      }
    }
    return salida;
  }

  function pintar(rx, ry) {
    const esCasilla = rx % 2 === 0 && ry % 2 === 0;
    const x = rx / 2, y = ry / 2;

    if (esCasilla) {
      let html = '';
      for (const j of [0, 1]) {
        if (peones[j].x === x && peones[j].y === y) {
          html = `<div class="ficha" style="background:${players[j].color}"></div>`;
        }
      }
      const legal = !terminado && movimientos(tab?.turno ?? 0).some((m) => m.x === x && m.y === y);
      const meta0 = y === metaY(0), meta1 = y === metaY(1);
      const fondo = meta0 ? `${players[0].color}22` : meta1 ? `${players[1].color}22` : '#1d2a22';
      return { html, clases: legal ? ['legal'] : [], estilo: `background:${fondo};` };
    }

    // Ranuras: horizontales (rx par, ry impar) y verticales (rx impar, ry par).
    const horiz = rx % 2 === 0;
    const mx = horiz ? Math.min(rx / 2, N - 2) : (rx - 1) / 2;
    const my = horiz ? (ry - 1) / 2 : Math.min(ry / 2, N - 2);
    const puesto = horiz
      ? (murosH.has(`${mx},${my}`) || murosH.has(`${mx - 1},${my}`))
      : (murosV.has(`${mx},${my}`) || murosV.has(`${mx},${my - 1}`));
    const cruce = rx % 2 === 1 && ry % 2 === 1;
    const fondo = puesto ? '#d8a34a' : cruce ? '#12180f' : '#161f18';
    return { html: '', estilo: `background:${fondo};border-radius:3px;` };
  }

  function confirmar(rx, ry) {
    if (terminado) return;
    const j = tab.turno;
    const esCasilla = rx % 2 === 0 && ry % 2 === 0;

    if (esCasilla) {
      const x = rx / 2, y = ry / 2;
      if (!movimientos(j).some((m) => m.x === x && m.y === y)) {
        aviso = 'Ahí no puedes ir';
        audio.error(); haptics.error(j); pie(); return;
      }
      peones[j] = { x, y };
      audio.place();
      haptics.play('click', { player: j });
      if (y === metaY(j)) {
        terminado = true;
        tab.refrescar();
        tab.bloqueado = true;
        audio.win();
        haptics.victory(j);
        ctx.finish({ winner: j, scores: restantes, detail: `le sobraban ${restantes[j]} muros` });
        return;
      }
      tab.cambiarTurno();
      aviso = '';
      pie();
      return;
    }

    // Colocar muro: ocupa dos ranuras a partir del punto elegido.
    if (restantes[j] <= 0) { aviso = 'Sin muros'; audio.error(); haptics.error(j); pie(); return; }
    const horiz = rx % 2 === 0;
    const mx = horiz ? rx / 2 : (rx - 1) / 2;
    const my = horiz ? (ry - 1) / 2 : ry / 2;
    if (mx < 0 || my < 0 || mx > N - 2 || my > N - 2) { audio.error(); return; }

    const clave = `${mx},${my}`;
    const set = horiz ? murosH : murosV;
    const otro = horiz ? murosV : murosH;
    // Un muro ocupa dos tramos, así que choca con los suyos a un lado y a otro;
    // y con el de la otra orientación solo si comparten el cruce exacto.
    const solapa = horiz
      ? (murosH.has(`${mx - 1},${my}`) || murosH.has(`${mx + 1},${my}`) || murosH.has(clave))
      : (murosV.has(`${mx},${my - 1}`) || murosV.has(`${mx},${my + 1}`) || murosV.has(clave));
    if (solapa || otro.has(clave)) {
      aviso = 'Ahí no cabe el muro';
      audio.error(); haptics.error(j); pie(); return;
    }

    set.add(clave);
    if (!hayCamino(0) || !hayCamino(1)) {
      set.delete(clave);
      aviso = 'Ese muro dejaría a alguien encerrado';
      audio.error();
      haptics.error(j);
      pie();
      return;
    }
    restantes[j]--;
    audio.thud();
    haptics.play('impact', { player: j, scale: 0.8 });
    tab.cambiarTurno();
    aviso = '';
    pie();
  }

  function pie() {
    tab.pie(
      `Muros: <b style="color:${players[0].color}">${restantes[0]}</b> — ` +
      `<b style="color:${players[1].color}">${restantes[1]}</b>` +
      (aviso ? ` · <b style="color:#ff4757">${aviso}</b>` : ' · muévete o pon un muro'),
    );
  }

  return {
    init() {
      peones = [{ x: 4, y: N - 1 }, { x: 4, y: 0 }];
      murosH = new Set();
      murosV = new Set();
      restantes = [MUROS, MUROS];
      tab = new Tablero(ctx, {
        cols: REJ, filas: REJ, celda: 30,
        pintarCelda: pintar,
        onConfirmar: confirmar,
      });
      // Las ranuras se dibujan más finas que las casillas.
      if (!document.getElementById('quoridor-css')) {
        const s = document.createElement('style');
        s.id = 'quoridor-css';
        s.textContent = `.bg-tablero { gap:0 !important; }`;
        document.head.appendChild(s);
      }
      tab.ponerCursor(8, REJ - 1);
      pie();
    },
    update(dt) { tab?.actualizar(dt); },
    destroy() { tab?.destruir(); },
  };
}
