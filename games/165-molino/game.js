/**
 * Molino — pon tres en línea y quítale una ficha al otro.
 *
 * Tres fases encadenadas: primero se colocan las nueve fichas, después se
 * mueven de punto a punto por las líneas, y cuando a alguien le quedan tres
 * puede saltar a donde quiera. Esa última fase es la que salva partidas
 * perdidas y por eso está.
 *
 * Cerrar un molino da derecho a comer, pero no vale comer de un molino rival
 * si le queda alguna ficha suelta fuera — sin esa regla, el primero que cierra
 * desmonta al otro sin remedio.
 */

import { Tablero } from '../../core/boardgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

/** Los 24 puntos del molino sobre una rejilla de 7×7. */
const PUNTOS = [
  [0, 0], [3, 0], [6, 0],
  [1, 1], [3, 1], [5, 1],
  [2, 2], [3, 2], [4, 2],
  [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3],
  [2, 4], [3, 4], [4, 4],
  [1, 5], [3, 5], [5, 5],
  [0, 6], [3, 6], [6, 6],
];
const LINEAS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
  [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
];
const VECINOS = (() => {
  const v = Array.from({ length: 24 }, () => []);
  for (const [a, b, c] of LINEAS) {
    v[a].push(b); v[b].push(a, c); v[c].push(b);
  }
  return v.map((l) => [...new Set(l)]);
})();

export function create(ctx) {
  const { audio, haptics, players } = ctx;

  let ocupa = [];              // null | 0 | 1
  let porColocar = [9, 9], enTablero = [0, 0];
  let seleccion = -1, comiendo = false, aviso = '';
  let tab = null, terminado = false, molinoNuevo = [];

  const indiceDe = (x, y) => PUNTOS.findIndex(([px, py]) => px === x && py === y);
  const fase = (j) => (porColocar[j] > 0 ? 'colocar' : enTablero[j] <= 3 ? 'saltar' : 'mover');

  function molinosDe(i, j) {
    return LINEAS.filter((l) => l.includes(i) && l.every((k) => ocupa[k] === j));
  }
  function enMolino(i) {
    const j = ocupa[i];
    return j != null && molinosDe(i, j).length > 0;
  }

  function pintar(x, y) {
    const i = indiceDe(x, y);
    if (i < 0) {
      // Fuera de los puntos: se dibujan las líneas del tablero como fondo.
      const enLinea = PUNTOS.some(([px, py]) => px === x || py === y);
      return { html: '', estilo: `background:${enLinea ? '#2b2418' : '#0000'};pointer-events:none;` };
    }
    const v = ocupa[i];
    let html = '';
    if (v != null) {
      const marca = molinoNuevo.includes(i) ? 'box-shadow:0 0 0 3px #ffd166,0 0 16px #ffd166;' : '';
      html = `<div class="ficha" style="background:${players[v].color};${marca}"></div>`;
    }
    const clases = [];
    if (seleccion === i) clases.push('marcada');
    if (!terminado && legal(i)) clases.push('legal');
    return { html, clases, estilo: 'background:#3a3020;border-radius:50%;' };
  }

  /** ¿Es jugable este punto ahora mismo? */
  function legal(i) {
    if (!tab) return false;
    const j = tab.turno;
    if (comiendo) {
      if (ocupa[i] !== 1 - j) return false;
      const sueltas = ocupa.some((v, k) => v === 1 - j && !enMolino(k));
      return !enMolino(i) || !sueltas;
    }
    if (fase(j) === 'colocar') return ocupa[i] == null;
    if (seleccion < 0) return ocupa[i] === j;
    if (ocupa[i] != null) return false;
    return fase(j) === 'saltar' || VECINOS[seleccion].includes(i);
  }

  function tras(j, i) {
    const nuevos = molinosDe(i, j);
    if (nuevos.length) {
      molinoNuevo = nuevos.flat();
      comiendo = true;
      aviso = 'molino: quítale una ficha';
      audio.capture();
      haptics.score(j);
      tab.actualizarTurno('¡molino!');
      tab.refrescar();
      pie();
      return;
    }
    molinoNuevo = [];
    pasarTurno();
  }

  function pasarTurno() {
    tab.cambiarTurno();
    const j = tab.turno;
    aviso = '';
    seleccion = -1;
    // Sin jugadas posibles, se pierde: es la otra forma de perder en el molino.
    if (fase(j) !== 'colocar' && !ocupa.some((v, i) => v === j && (fase(j) === 'saltar' || VECINOS[i].some((k) => ocupa[k] == null)))) {
      acabar(1 - j, `${players[j].name} se queda sin movimientos`);
      return;
    }
    pie();
  }

  function acabar(g, detalle) {
    terminado = true;
    tab.bloqueado = true;
    tab.refrescar();
    audio.win();
    haptics.victory(g);
    ctx.finish({ winner: g, scores: enTablero, detail: detalle });
  }

  function confirmar(x, y) {
    if (terminado) return;
    const i = indiceDe(x, y);
    const j = tab.turno;
    if (i < 0 || !legal(i)) { audio.error(); haptics.error(j); return; }

    if (comiendo) {
      ocupa[i] = null;
      enTablero[1 - j]--;
      comiendo = false;
      molinoNuevo = [];
      audio.hit();
      haptics.play('impact', { player: j, scale: 0.9 });
      if (enTablero[1 - j] <= 2 && porColocar[1 - j] === 0) {
        acabar(j, `${players[1 - j].name} se queda con dos fichas`);
        return;
      }
      pasarTurno();
      return;
    }

    if (fase(j) === 'colocar') {
      ocupa[i] = j;
      porColocar[j]--;
      enTablero[j]++;
      audio.place();
      haptics.play('click', { player: j });
      tras(j, i);
      return;
    }

    if (seleccion < 0) {
      seleccion = i;
      audio.blip();
      tab.refrescar();
      pie();
      return;
    }
    ocupa[i] = j;
    ocupa[seleccion] = null;
    seleccion = -1;
    audio.place();
    haptics.play('click', { player: j });
    tras(j, i);
  }

  function pie() {
    const j = tab.turno;
    const f = fase(j);
    const texto = comiendo ? aviso
      : f === 'colocar' ? `quedan por colocar: <b>${porColocar[0]}</b> — <b>${porColocar[1]}</b>`
      : f === 'saltar' ? 'con tres fichas puedes saltar a cualquier punto libre'
      : seleccion < 0 ? 'elige una ficha tuya' : 'elige un punto vecino libre';
    tab.pie(texto + (aviso && !comiendo ? ` · <b style="color:#ff4757">${aviso}</b>` : ''));
  }

  return {
    init() {
      ocupa = new Array(24).fill(null);
      porColocar = [9, 9];
      enTablero = [0, 0];
      tab = new Tablero(ctx, {
        cols: 7, filas: 7, celda: 58,
        pintarCelda: pintar,
        onConfirmar: confirmar,
      });
      tab.ponerCursor(0, 0);
      pie();
    },
    update(dt) { tab?.actualizar(dt); },
    destroy() { tab?.destruir(); },
  };
}
