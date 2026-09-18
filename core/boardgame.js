/**
 * boardgame.js — armazón compartido de los juegos de tablero por turnos.
 *
 * Resuelve lo que los ocho juegos de tablero repiten: pintar una rejilla,
 * mover un cursor con las teclas del jugador que tiene el turno, confirmar
 * con su tecla de acción, mostrar de quién es el turno y anunciar el final.
 *
 * Cada juego solo implementa sus reglas: qué hay en cada casilla, si un
 * movimiento es legal y quién gana.
 */

import { avatarFor } from './avatar.js';
import { escapeHtml } from './ui.js';

export class Tablero {
  /**
   * @param {object} ctx    contexto del juego (el que da el shell)
   * @param {object} o
   * @param {number} o.cols
   * @param {number} o.filas
   * @param {number} [o.celda]         px por casilla (se ajusta a la ventana)
   * @param {(x,y,jugador)=>void} o.onConfirmar
   * @param {(x,y,jugador)=>void} [o.onCursor]
   * @param {(x,y)=>{html?:string, clases?:string[], estilo?:string}} o.pintarCelda
   * @param {number} [o.turnoInicial]
   * @param {boolean} [o.cursorLibre]  false = el cursor no puede salir del tablero
   */
  constructor(ctx, o) {
    this.ctx = ctx;
    this.cols = o.cols;
    this.filas = o.filas;
    this.celdaBase = o.celda || 56;
    this.onConfirmar = o.onConfirmar;
    this.onCursor = o.onCursor;
    this.pintarCelda = o.pintarCelda;
    this.turno = o.turnoInicial ?? 0;
    this.cursor = { x: Math.floor(this.cols / 2), y: Math.floor(this.filas / 2) };
    this.bloqueado = false;
    this._repeticion = 0;
    this._ultimaDir = '';
    this._marcador = null;

    this._construir();
    this._desuscribir = ctx.input.onAny(() => {});   // reservado, se usa update()
  }

  _construir() {
    const { root, players } = this.ctx;
    root.innerHTML = `
      <div class="bg-wrap">
        <div class="bg-turno" id="bg-turno"></div>
        <div class="bg-tablero" id="bg-tablero"></div>
        <div class="bg-pie" id="bg-pie"></div>
      </div>`;
    this.elTablero = root.querySelector('#bg-tablero');
    this.elTurno = root.querySelector('#bg-turno');
    this.elPie = root.querySelector('#bg-pie');

    inyectarEstilos();
    this._ajustarTamano();
    this._crearCeldas();
    this.refrescar();
    this.actualizarTurno();
  }

  _ajustarTamano() {
    const dispW = (this.ctx.frame?.clientWidth || window.innerWidth) - 60;
    const dispH = (this.ctx.frame?.clientHeight || window.innerHeight) - 200;
    const c = Math.floor(Math.min(dispW / this.cols, dispH / this.filas, this.celdaBase));
    this.celda = Math.max(22, c);
    this.elTablero.style.gridTemplateColumns = `repeat(${this.cols}, ${this.celda}px)`;
    this.elTablero.style.gridTemplateRows = `repeat(${this.filas}, ${this.celda}px)`;
  }

  _crearCeldas() {
    this.celdas = [];
    const frag = document.createDocumentFragment();
    for (let y = 0; y < this.filas; y++) {
      for (let x = 0; x < this.cols; x++) {
        const d = document.createElement('div');
        d.className = 'bg-celda';
        d.dataset.x = x;
        d.dataset.y = y;
        // También se puede jugar con el trackpad; el teclado sigue siendo el
        // camino principal, pero un clic no debería estar prohibido.
        d.addEventListener('click', () => {
          if (this.bloqueado) return;
          this.cursor = { x, y };
          this.refrescar();
          this.onConfirmar?.(x, y, this.turno);
        });
        frag.appendChild(d);
        this.celdas.push(d);
      }
    }
    this.elTablero.appendChild(frag);
  }

  celdaEn(x, y) { return this.celdas[y * this.cols + x]; }

  /** Repinta todas las casillas preguntando al juego qué va en cada una. */
  refrescar() {
    const col = this.ctx.players[this.turno].color;
    for (let y = 0; y < this.filas; y++) {
      for (let x = 0; x < this.cols; x++) {
        const el = this.celdaEn(x, y);
        const info = this.pintarCelda(x, y) || {};
        el.className = 'bg-celda' + (info.clases?.length ? ' ' + info.clases.join(' ') : '');
        if (this.cursor.x === x && this.cursor.y === y && !this.bloqueado) {
          el.classList.add('bg-cursor');
          el.style.setProperty('--cur', col);
        }
        const html = info.html ?? '';
        if (el.innerHTML !== html) el.innerHTML = html;
        el.style.cssText = (info.estilo || '') + (el.classList.contains('bg-cursor') ? `--cur:${col};` : '');
      }
    }
  }

  actualizarTurno(textoExtra = '') {
    const p = this.ctx.players[this.turno];
    this.elTurno.innerHTML = `
      <span class="turn-badge" style="color:${p.color}">
        <img src="${avatarFor(p)}" alt="">
        Turno de ${escapeHtml(p.name)}
      </span>
      ${textoExtra ? `<span class="bg-extra">${textoExtra}</span>` : ''}`;
  }

  pie(html) { this.elPie.innerHTML = html; }

  cambiarTurno() {
    this.turno = 1 - this.turno;
    this.actualizarTurno();
    this.refrescar();
    this.ctx.audio.select();
  }

  /** Marca visualmente casillas (jugadas legales, amenazas…). */
  resaltar(lista) {
    this._resaltadas = new Set(lista.map(([x, y]) => `${x},${y}`));
  }
  estaResaltada(x, y) { return this._resaltadas?.has(`${x},${y}`); }

  /** Llamar desde update(dt) del juego. Mueve el cursor con auto-repetición. */
  actualizar(dt) {
    if (this.bloqueado) return;
    const pl = this.ctx.input.player(this.turno);
    const dx = pl.x, dy = pl.y;
    const dir = `${dx},${dy}`;

    if (dx || dy) {
      if (dir !== this._ultimaDir) {
        this._mover(dx, dy);
        this._repeticion = 0.25;
        this._ultimaDir = dir;
      } else {
        this._repeticion -= dt;
        if (this._repeticion <= 0) { this._mover(dx, dy); this._repeticion = 0.075; }
      }
    } else this._ultimaDir = '';

    if (pl.pressed('a')) {
      this.ctx.haptics.play('click', { player: this.turno });
      this.onConfirmar?.(this.cursor.x, this.cursor.y, this.turno);
    }
  }

  _mover(dx, dy) {
    const nx = Math.max(0, Math.min(this.cols - 1, this.cursor.x + dx));
    const ny = Math.max(0, Math.min(this.filas - 1, this.cursor.y + dy));
    if (nx === this.cursor.x && ny === this.cursor.y) return;
    this.cursor.x = nx;
    this.cursor.y = ny;
    this.ctx.audio.tick();
    this.ctx.haptics.play('tick', { player: this.turno });
    this.onCursor?.(nx, ny, this.turno);
    this.refrescar();
  }

  ponerCursor(x, y) {
    this.cursor.x = Math.max(0, Math.min(this.cols - 1, x));
    this.cursor.y = Math.max(0, Math.min(this.filas - 1, y));
    this.refrescar();
  }

  destruir() {
    this._desuscribir?.();
    this.ctx.root.innerHTML = '';
  }
}

/** Estilos compartidos por todos los juegos de tablero. */
function inyectarEstilos() {
  if (document.getElementById('bg-css')) return;
  const s = document.createElement('style');
  s.id = 'bg-css';
  s.textContent = `
    .bg-wrap { display:flex; flex-direction:column; align-items:center; gap:16px; }
    .bg-turno { display:flex; align-items:center; gap:14px; min-height:34px; }
    .bg-extra { font-size:13px; color:var(--ink-dim); }
    .bg-tablero {
      display:grid; gap:3px; padding:12px;
      background:#ffffff0a; border:1px solid var(--line); border-radius:14px;
      box-shadow: var(--shadow);
    }
    .bg-celda {
      display:grid; place-items:center;
      background:#ffffff08; border-radius:6px;
      font-family:var(--font-display); font-size:15px;
      position:relative; transition:background 140ms, transform 120ms var(--ease);
      cursor:pointer; user-select:none;
    }
    .bg-celda:hover { background:#ffffff14; }
    .bg-cursor {
      box-shadow: inset 0 0 0 3px var(--cur), 0 0 18px -4px var(--cur);
      transform: scale(1.06); z-index:3;
    }
    .bg-celda.clara { background:#e8dcc0; color:#2a2118; }
    .bg-celda.oscura { background:#6b4f34; color:#f5ecd9; }
    .bg-celda.legal::after {
      content:''; position:absolute; width:26%; height:26%;
      border-radius:50%; background:#ffffff66;
    }
    .bg-celda.legal-captura { box-shadow: inset 0 0 0 3px #ff475799; }
    .bg-celda.marcada { background:#ffd16633; }
    .bg-pie { font-size:13px; color:var(--ink-dim); text-align:center; min-height:20px; }
    .bg-pie b { color:var(--ink); }
    .ficha {
      width:76%; height:76%; border-radius:50%;
      box-shadow: inset 0 -3px 6px #0006, 0 2px 6px #0008;
      animation: pop 220ms var(--ease);
    }
    .ficha.plana { border-radius:20%; }
  `;
  document.head.appendChild(s);
}
