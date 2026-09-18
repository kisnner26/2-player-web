/**
 * ui.js — capas de interfaz que comparten todos los juegos:
 * cuenta atrás, marcador, menú de pausa, pantalla de ganador y avisos.
 *
 * Todo es DOM sobre el canvas (no dibujado dentro del canvas) para que el
 * texto se vea nítido en retina y sea accesible sin reimplementar tipografía.
 */

import { avatarFor } from './avatar.js';

/* ---------------- Lectura de los controles ---------------- */

/*
 * Los controles se declaran en el manifiesto como texto suelto
 * («A/D: dirigir», «Espacio: poner bomba», «Eres Llama: muere en el agua»).
 * Impreso tal cual se lee como una lista de la compra: todo del mismo peso y
 * sin distinguir qué hay que pulsar de qué hay que saber.
 *
 * Estas dos funciones separan la tecla de la acción para poder dibujar la
 * tecla como tecla y la acción como texto. Lo que no es una pulsación —una
 * advertencia, una regla— se marca aparte en vez de disfrazarse de control.
 */

/** Tokens que se dibujan como tecla física. */
const ES_TECLA = /^(?:[A-ZÑ0-9]|↑|↓|←|→|␣|Espacio|Esc|Intro|Enter|Shift|Ctrl|Alt|Tab|Barra)$/i;

function partirControl(linea) {
  const corte = linea.indexOf(':');
  if (corte < 0) return { nota: linea };
  const izquierda = linea.slice(0, corte).trim();
  const accion = linea.slice(corte + 1).trim();
  const tokens = izquierda.split(/[\s/+]+/).filter(Boolean);
  // Solo es un control si TODO lo de la izquierda son teclas: así
  // «Eres Llama: muere en el agua» no acaba pintado como si fuera una tecla.
  if (!tokens.length || !tokens.every((t) => ES_TECLA.test(t))) return { nota: linea };
  const union = izquierda.includes('+') ? '+' : (izquierda.includes('/') ? '/' : '');
  return { teclas: tokens, union, accion };
}

/** Lista de controles de un jugador, ya maquetada. */
export function filasDeControles(lista) {
  const filas = (lista?.length ? lista : ['Sin controles propios']).map((linea) => {
    const c = partirControl(linea);
    if (c.nota) return `<div class="ctrl-nota">${escapeHtml(c.nota)}</div>`;
    const teclas = c.teclas
      .map((t) => `<span class="tecla-fis">${escapeHtml(t === 'Espacio' ? '␣' : t)}</span>`)
      .join(c.union ? `<i class="ctrl-union">${c.union}</i>` : '');
    return `
      <div class="ctrl-fila">
        <span class="ctrl-teclas">${teclas}</span>
        <span class="ctrl-accion">${escapeHtml(c.accion)}</span>
      </div>`;
  });
  return `<div class="ctrl-lista">${filas.join('')}</div>`;
}
import { audio } from './audio.js';
import { haptics } from './haptics.js';
import { icon } from './icons.js';
import { mandos } from './mandos.js';
import { ambiente } from './ambiente.js';

export class GameUI {
  /**
   * @param {HTMLElement} root  contenedor con position:relative sobre el canvas
   * @param {Array} players     perfiles de los dos jugadores
   */
  constructor(root, players) {
    this.root = root;
    this.players = players;
    this.layer = document.createElement('div');
    this.layer.className = 'ui-layer';
    root.appendChild(this.layer);
    this._toastTimer = 0;
  }

  clear() { this.layer.innerHTML = ''; }

  /* ---------------- Marcador superior ---------------- */

  /**
   * Marcador fijo arriba. Llamar a `update(a, b)` para refrescarlo.
   * @param {object} o
   * @param {string} [o.center]  texto central (p. ej. el cronómetro)
   */
  scoreboard({ center = '' } = {}) {
    const el = document.createElement('div');
    el.className = 'ui-scoreboard';
    el.innerHTML = `
      <div class="sb-side sb-p1">
        <img class="sb-av" src="${avatarFor(this.players[0])}" alt="">
        <div class="sb-meta">
          <span class="sb-name">${escapeHtml(this.players[0].name)}</span>
          <span class="sb-score" data-score="0">0</span>
        </div>
      </div>
      <div class="sb-center"></div>
      <div class="sb-side sb-p2">
        <div class="sb-meta right">
          <span class="sb-name">${escapeHtml(this.players[1].name)}</span>
          <span class="sb-score" data-score="1">0</span>
        </div>
        <img class="sb-av" src="${avatarFor(this.players[1])}" alt="">
      </div>`;
    this.layer.appendChild(el);
    const s0 = el.querySelector('[data-score="0"]');
    const s1 = el.querySelector('[data-score="1"]');
    const cen = el.querySelector('.sb-center');
    cen.textContent = center;
    const api = {
      el,
      update(a, b) {
        if (s0.textContent !== String(a)) { s0.textContent = a; bump(s0); }
        if (s1.textContent !== String(b)) { s1.textContent = b; bump(s1); }
      },
      setCenter(t) { cen.textContent = t; },
      remove() { el.remove(); },
    };
    this.sb = api;
    return api;
  }

  /* ---------------- Cuenta atrás ---------------- */

  /** Cuenta 3-2-1-¡YA! y resuelve la promesa al terminar. */
  countdown(from = 3) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'ui-countdown';
      this.layer.appendChild(el);
      let n = from;
      const step = () => {
        if (n > 0) {
          el.textContent = String(n);
          el.style.animation = 'none';
          void el.offsetWidth;
          el.style.animation = 'cd-pop 700ms var(--ease)';
          audio.countdown(n);
          haptics.play('tick');
          n--;
          setTimeout(step, 700);
        } else {
          el.textContent = '¡YA!';
          el.classList.add('go');
          el.style.animation = 'none';
          void el.offsetWidth;
          el.style.animation = 'cd-go 520ms var(--ease) forwards';
          audio.countdown(0);
          haptics.play('impact');
          setTimeout(() => { el.remove(); resolve(); }, 520);
        }
      };
      step();
    });
  }

  /* ---------------- Avisos efímeros ---------------- */

  toast(text, { ms = 1400, color = '' } = {}) {
    let el = this.layer.querySelector('.ui-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ui-toast';
      this.layer.appendChild(el);
    }
    el.textContent = text;
    el.style.color = color || 'var(--ink)';
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'toast-in 220ms var(--ease)';
    el.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.style.opacity = '0'; }, ms);
  }

  /** Banner persistente en el centro-superior (p. ej. "Turno de Ana"). */
  banner(html, { color = '' } = {}) {
    let el = this.layer.querySelector('.ui-banner');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ui-banner';
      this.layer.appendChild(el);
    }
    el.innerHTML = html;
    if (color) el.style.borderColor = color;
    return el;
  }
  hideBanner() { this.layer.querySelector('.ui-banner')?.remove(); }

  /* ---------------- Explicación de controles ---------------- */

  /**
   * Pantalla previa a cada partida: qué es el juego y cómo se controla cada
   * jugador, en dos columnas con su color. Sustituye al viejo aviso de
   * esquina — con 80 juegos distintos, un aviso que se puede pasar por alto
   * no es suficiente, y esto además sirve como "portada" del juego.
   * @param {object} meta  {nombre, descripcion, controles:{p1,p2}}
   */
  controlsBriefing({ nombre, descripcion, controles }) {
    const el = document.createElement('div');
    el.className = 'ui-overlay ui-briefing';
    const columna = (i, lista) => `
      <div class="briefing-col" style="--c:${this.players[i].color}">
        <div class="briefing-quien">
          <img src="${avatarFor(this.players[i])}" alt="">
          <h3>${escapeHtml(this.players[i].name)}</h3>
        </div>
        ${filasDeControles(lista)}
      </div>`;
    el.innerHTML = `
      <div class="briefing-card">
        <span class="briefing-tag">Cómo se juega</span>
        <h2 class="briefing-title">${escapeHtml(nombre)}</h2>
        ${descripcion ? `<p class="briefing-desc">${escapeHtml(descripcion)}</p>` : ''}
        <div class="briefing-cols">
          ${columna(0, controles?.p1)}
          ${columna(1, controles?.p2)}
        </div>
        <div class="briefing-bar"><i></i></div>
        ${mandos.hay ? `
          <p class="briefing-foot">
            Con mando: cruceta o palanca ${mandos.hay > 1 ? '' : '(jugador 1)'} ·
            <b>✕</b> hace lo de la tecla de acción · <b>○</b> lo de la especial · <b>Options</b> pausa
          </p>` : ''}
        <p class="briefing-foot">
          Cuando estéis listos, pulsad vuestra tecla de acción
          <span class="briefing-omitir"><span class="kbd">Esc</span> para saltar</span>
        </p>
      </div>`;
    this.layer.appendChild(el);
    return { el, close: () => el.remove() };
  }

  /* ---------------- Pausa ---------------- */

  /**
   * Menú de pausa, que además es el panel de ajustes de la partida.
   *
   * Como la pantalla de controles ya solo sale la primera vez que se estrena
   * un juego, tiene que haber un sitio donde volver a consultarla en mitad de
   * una partida. Ese sitio es este, junto a los ajustes que uno quiere tocar
   * sin salir al menú (volumen, vibración, líneas de escaneo).
   *
   * @param {object} o { meta, settings, onResume, onRestart, onExit, onAjuste }
   */
  pauseMenu({ meta, settings = {}, onResume, onRestart, onExit, onAjuste }) {
    const el = document.createElement('div');
    el.className = 'ui-overlay';

    const fila = (clave, etiqueta, sub = '') => `
      <div class="pausa-fila">
        <label>${escapeHtml(etiqueta)}${sub ? `<span class="sub">${escapeHtml(sub)}</span>` : ''}</label>
        <button class="switch ${settings[clave] ? 'on' : ''}" data-ajuste="${clave}" role="switch"
                aria-checked="${!!settings[clave]}"></button>
      </div>`;

    const columna = (i, lista) => `
      <div class="pausa-col" style="--c:${this.players[i].color}">
        <div class="briefing-quien">
          <img src="${avatarFor(this.players[i])}" alt="">
          <h3>${escapeHtml(this.players[i].name)}</h3>
        </div>
        ${filasDeControles(lista)}
      </div>`;

    el.innerHTML = `
      <div class="ui-card pausa">
        <h2 class="ui-card-title">Pausa</h2>

        <div class="pausa-pestanas">
          <button class="pausa-pestana on" data-panel="menu">Partida</button>
          <button class="pausa-pestana" data-panel="controles">Controles</button>
          <button class="pausa-pestana" data-panel="ajustes">Ajustes</button>
        </div>

        <div class="pausa-panel" data-p="menu">
          <div class="ui-card-actions">
            <button class="btn primary" data-act="resume">Reanudar <span class="kbd">Esc</span></button>
            <button class="btn" data-act="restart">Reiniciar <span class="kbd">R</span></button>
            <button class="btn ghost" data-act="exit">Salir al menú</button>
          </div>
        </div>

        <div class="pausa-panel oculto" data-p="controles">
          <p class="pausa-desc">${escapeHtml(meta?.descripcion || '')}</p>
          <div class="pausa-cols">
            ${columna(0, meta?.controles?.p1)}
            ${columna(1, meta?.controles?.p2)}
          </div>
        </div>

        <div class="pausa-panel oculto" data-p="ajustes">
          <div class="pausa-fila">
            <label>Volumen</label>
            <input type="range" data-vol min="0" max="100" value="${Math.round(audio.volume * 100)}">
          </div>
          <div class="pausa-fila">
            <label>Música de fondo<span class="sub">Volumen de la música y del ambiente</span></label>
            <input type="range" data-mus min="0" max="100" value="${Math.round(ambiente.volumen * 100)}">
          </div>
          ${fila('musica', 'Música y sonido de escenario')}
          ${fila('crtEffect', 'Líneas de escaneo')}
          ${fila('reducedFlash', 'Reducir destellos', 'Quita los flashes de los impactos fuertes')}
          ${fila('showControlsHint', 'Explicar controles al estrenar un juego')}
        </div>
      </div>`;

    this.layer.appendChild(el);
    const close = () => el.remove();

    el.querySelectorAll('[data-panel]').forEach((b) => {
      b.addEventListener('click', () => {
        el.querySelectorAll('[data-panel]').forEach((o) => o.classList.toggle('on', o === b));
        el.querySelectorAll('[data-p]').forEach((p) => p.classList.toggle('oculto', p.dataset.p !== b.dataset.panel));
        audio.blip();
      });
    });

    el.querySelectorAll('[data-ajuste]').forEach((b) => {
      b.addEventListener('click', () => {
        const activo = !b.classList.contains('on');
        b.classList.toggle('on', activo);
        b.setAttribute('aria-checked', String(activo));
        audio.blip();
        onAjuste?.(b.dataset.ajuste, activo);
      });
    });

    el.querySelector('[data-vol]')?.addEventListener('input', (e) => {
      audio.unlock();
      audio.volume = +e.target.value / 100;
      onAjuste?.('volume', audio.volume);
    });

    el.querySelector('[data-mus]')?.addEventListener('input', (e) => {
      audio.unlock();
      ambiente.volumen = +e.target.value / 100;
    });

    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      audio.select();
      if (act === 'resume') { close(); onResume?.(); }
      if (act === 'restart') { close(); onRestart?.(); }
      if (act === 'exit') onExit?.();
    });
    return { close, el };
  }

  /* ---------------- Fin de partida ---------------- */

  /**
   * @param {object} o
   * @param {0|1|-1} o.winner   -1 = empate
   * @param {string} [o.detail] línea secundaria (marcador, tiempo, récord…)
   * @param {boolean} [o.record]
   * @param {object} handlers   { onRematch, onExit, onNext }
   */
  gameOver({ winner, detail = '', record = false, scores = null }, { onRematch, onExit, onNext } = {}) {
    const el = document.createElement('div');
    el.className = 'ui-overlay';
    const draw = winner === -1;
    const p = draw ? null : this.players[winner];
    el.innerHTML = `
      <div class="ui-card win-card" ${p ? `style="--win:${p.color}"` : ''}>
        ${draw ? `
          <div class="win-emoji">${icon('handshake', { size: 48 })}</div>
          <h2 class="ui-card-title">¡Empate!</h2>
        ` : `
          <img class="win-avatar" src="${avatarFor(p)}" alt="">
          <h2 class="ui-card-title win-name">${escapeHtml(p.name)}</h2>
          <p class="win-sub">gana la partida</p>
        `}
        ${scores ? `<p class="win-score">${scores[0]} — ${scores[1]}</p>` : ''}
        ${detail ? `<p class="win-detail">${escapeHtml(detail)}</p>` : ''}
        ${record ? `<p class="win-record">★ ¡Récord nuevo!</p>` : ''}
        <div class="ui-card-actions">
          <button class="btn primary" data-act="rematch">Revancha <span class="kbd">R</span></button>
          ${onNext ? `<button class="btn" data-act="next">Siguiente juego</button>` : ''}
          <button class="btn ghost" data-act="exit">Salir al menú</button>
        </div>
      </div>`;
    this.layer.appendChild(el);
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      audio.select();
      if (act === 'rematch') { el.remove(); onRematch?.(); }
      if (act === 'next') onNext?.();
      if (act === 'exit') onExit?.();
    });
    if (draw) { audio.arp([440, 440, 392], 0.12); }
    else { audio.win(); haptics.victory(winner); }
    return { el, close: () => el.remove() };
  }

  destroy() { this.layer.remove(); }
}

function bump(el) {
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = 'score-bump 320ms var(--ease)';
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Formatea segundos como m:ss */
export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
