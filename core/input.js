/**
 * input.js — teclado para dos jugadores en un mismo teclado.
 *
 * Todo se lee por `e.code` (posición física de la tecla), no por `e.key`.
 * Así los controles funcionan igual en layout español, inglés o Dvorak,
 * y no dependen de mayúsculas ni de acentos.
 *
 * Restricciones de diseño por el ghosting de teclados no-gaming:
 *   - máximo 2-3 teclas SOSTENIDAS por jugador a la vez
 *   - los clusters de cada jugador están físicamente separados
 *   - las teclas de acción son de pulsación corta, no sostenida
 */

import { loadSettings } from './storage.js';

export const ACTIONS = ['up', 'down', 'left', 'right', 'a', 'b'];

export const DEFAULT_MAPS = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', a: 'Space', b: 'KeyE' },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', a: 'KeyM', b: 'KeyN' },
];

/** Nombre legible de un e.code, para mostrar en pantalla. */
export function codeLabel(code) {
  if (!code) return '—';
  const map = {
    Space: '␣ Espacio', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Enter: '⏎', Escape: 'Esc', ShiftLeft: '⇧ izq', ShiftRight: '⇧ der',
    ControlLeft: '⌃ izq', ControlRight: '⌃ der', AltLeft: '⌥ izq', AltRight: '⌥ der',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    Tab: '⇥', CapsLock: '⇪',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

export const ACTION_LABEL = {
  up: 'Arriba', down: 'Abajo', left: 'Izquierda', right: 'Derecha', a: 'Acción', b: 'Especial',
};

/**
 * Teclas que el navegador usa para desplazar la página o activar atajos.
 * Se les hace preventDefault siempre que estén mapeadas, para que el juego
 * no mueva el scroll ni active la búsqueda rápida de Safari.
 */
const ALWAYS_PREVENT = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Slash', 'Quote',
]);

/**
 * ¿El evento venía de un sitio donde el usuario está escribiendo?
 *
 * Sin esto, escribir el nombre de un jugador es imposible: las teclas de
 * control (W A S D, E, M, N, flechas, espacio) están mapeadas, así que el
 * gestor las consumía y les hacía preventDefault incluso dentro de un campo
 * de texto. El resultado era un campo que se come letras y, de paso, mueve
 * el menú por detrás. Aquí el teclado se aparta: mientras haya un campo
 * enfocado, el juego no escucha.
 */
function escribiendo(e) {
  const t = e.target;
  if (!t || t === document.body || t === document) return false;
  if (t.isContentEditable) return true;
  const etiqueta = t.tagName;
  if (etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT') return true;
  // Un campo puede estar enfocado aunque el evento se haya redirigido.
  const foco = document.activeElement;
  return !!foco && (foco.tagName === 'INPUT' || foco.tagName === 'TEXTAREA'
    || foco.tagName === 'SELECT' || foco.isContentEditable);
}

class PlayerInput {
  constructor(index, map) {
    this.index = index;
    this.map = { ...map };
    this._held = new Set();
    this._pressed = new Set();   // se limpia cada frame de juego
    this._released = new Set();
    /** Contador de pulsaciones acumuladas — útil para juegos de machaque. */
    this.taps = 0;
    /** Acciones sostenidas desde un mando remoto, aparte de las del teclado. */
    this._remote = new Set();
    /**
     * Palanca analógica del mando, de -1 a 1. Los juegos antiguos no la miran
     * (siguen leyendo x/y, que el mando también alimenta por umbral); los
     * nuevos pueden pedir un movimiento continuo que el teclado no da.
     */
    this.stick = { x: 0, y: 0 };
    /** Trazos del mando pendientes de consumir, para los juegos de dibujo. */
    this.trazos = [];
  }
  /** ¿Está sostenida ahora mismo? */
  held(action) { return this._held.has(action); }
  /** ¿Se presionó en este frame? (flanco de bajada) */
  pressed(action) { return this._pressed.has(action); }
  /** ¿Se soltó en este frame? */
  released(action) { return this._released.has(action); }
  /** -1 / 0 / 1 en el eje horizontal. */
  get x() { return (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0); }
  /** -1 / 0 / 1 en el eje vertical (positivo = abajo, coordenadas de canvas). */
  get y() { return (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0); }
  get anyHeld() { return this._held.size > 0; }

  /** Eje horizontal continuo: la palanca si hay mando, si no el digital. */
  get ax() { return this.stick.x || this.x; }
  /** Eje vertical continuo (positivo = abajo). */
  get ay() { return this.stick.y || this.y; }
  /** ¿Este jugador está usando un mando táctil ahora mismo? */
  get conMando() { return this._mando === true; }

  /** Saca y limpia los trazos recibidos desde el mando. */
  tomarTrazos() {
    const t = this.trazos;
    this.trazos = [];
    return t;
  }

  keyLabel(action) { return codeLabel(this.map[action]); }
}

class InputManager {
  constructor() {
    const s = loadSettings();
    this.players = [
      new PlayerInput(0, s.maps?.[0] || DEFAULT_MAPS[0]),
      new PlayerInput(1, s.maps?.[1] || DEFAULT_MAPS[1]),
    ];
    this._globalHeld = new Set();
    this._globalPressed = new Set();
    this._handlers = new Map();   // e.code -> Set<callback>
    this._anyHandlers = new Set();
    this._enabled = true;
    /** Máximo de teclas simultáneas visto en la sesión — diagnóstico de ghosting. */
    this.maxSimultaneous = 0;
    this._rawHeld = new Set();

    this._onDown = (e) => this._handleDown(e);
    this._onUp = (e) => this._handleUp(e);
    this._onBlur = () => this.releaseAll();
    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup', this._onUp);
    window.addEventListener('blur', this._onBlur);
  }

  player(i) { return this.players[i]; }

  setMap(playerIndex, action, code) {
    this.players[playerIndex].map[action] = code;
  }
  setMaps(maps) {
    maps.forEach((m, i) => { if (this.players[i]) this.players[i].map = { ...m }; });
  }
  get maps() { return this.players.map((p) => ({ ...p.map })); }

  /** ¿Este e.code ya está en uso por algún jugador? Devuelve "P1 · Acción" o null. */
  conflictFor(code, exceptPlayer = -1, exceptAction = '') {
    for (const p of this.players) {
      for (const a of ACTIONS) {
        if (p.index === exceptPlayer && a === exceptAction) continue;
        if (p.map[a] === code) return `P${p.index + 1} · ${ACTION_LABEL[a]}`;
      }
    }
    if (code === 'Escape' || code === 'KeyR') return 'Sistema';
    return null;
  }

  _handleDown(e) {
    if (!this._enabled) return;
    // Escribiendo en un campo: ni se consume la tecla ni se bloquea. Además
    // se suelta lo que hubiera sostenido, para no dejar al personaje andando
    // mientras se teclea un nombre.
    if (escribiendo(e)) { if (this._rawHeld.size) this.releaseAll(); return; }
    if (e.repeat) {
      // Se ignora la autorrepetición del sistema: los flancos los controla el juego.
      if (this._shouldPrevent(e.code)) e.preventDefault();
      return;
    }
    this._rawHeld.add(e.code);
    this.maxSimultaneous = Math.max(this.maxSimultaneous, this._rawHeld.size);

    let consumed = false;
    for (const p of this.players) {
      for (const a of ACTIONS) {
        if (p.map[a] === e.code) {
          p._held.add(a);
          p._pressed.add(a);
          p.taps++;
          consumed = true;
        }
      }
    }
    if (!consumed) {
      this._globalHeld.add(e.code);
      this._globalPressed.add(e.code);
    }
    const set = this._handlers.get(e.code);
    if (set) for (const cb of set) cb(e);
    for (const cb of this._anyHandlers) cb(e);

    if (this._shouldPrevent(e.code)) e.preventDefault();
  }

  _handleUp(e) {
    if (escribiendo(e)) return;
    this._rawHeld.delete(e.code);
    for (const p of this.players) {
      for (const a of ACTIONS) {
        // Si el mando sostiene la misma acción, soltar la tecla no la levanta:
        // los dos mandos de un jugador se suman en vez de pisarse.
        if (p.map[a] === e.code && !p._remote.has(a)) { p._held.delete(a); p._released.add(a); }
      }
    }
    this._globalHeld.delete(e.code);
    if (this._shouldPrevent(e.code)) e.preventDefault();
  }

  /* ---------------- Mandos remotos (core/red.js) ---------------- */

  /**
   * Una de las seis acciones, pulsada o soltada desde un iPad.
   * Entra por el mismo camino que el teclado, así que ningún juego necesita
   * saber que existe: `pressed('a')` funciona igual venga de donde venga.
   */
  accionRemota(slot, accion, abajo) {
    const p = this.players[slot];
    if (!p || !ACTIONS.includes(accion)) return;
    p._mando = true;
    if (abajo) {
      if (p._remote.has(accion)) return;      // el mando repite mientras se mantiene
      p._remote.add(accion);
      p._held.add(accion);
      p._pressed.add(accion);
      p.taps++;
    } else {
      p._remote.delete(accion);
      if (this._rawHeld.has(p.map[accion])) return;   // el teclado la sigue sosteniendo
      p._held.delete(accion);
      p._released.add(accion);
    }
  }

  /**
   * ¿Esta acción la sostiene ahora mismo un mando (no el teclado)?
   *
   * La usa core/mandos.js para no repetir pulsaciones y, sobre todo, para
   * recuperarse de un `releaseAll()`: tras una pausa el mando sigue apretado
   * pero el gestor ya lo soltó, y sin esta consulta la acción se quedaría
   * muerta hasta que el jugador levantara el dedo.
   */
  sostenidaRemota(slot, accion) {
    return !!this.players[slot]?._remote.has(accion);
  }

  /** Palanca analógica. Alimenta también las cuatro direcciones por umbral. */
  stickRemoto(slot, x, y) {
    const p = this.players[slot];
    if (!p) return;
    p._mando = true;
    p.stick.x = Math.max(-1, Math.min(1, +x || 0));
    p.stick.y = Math.max(-1, Math.min(1, +y || 0));
    const umbral = 0.42;
    this.accionRemota(slot, 'right', p.stick.x > umbral);
    this.accionRemota(slot, 'left', p.stick.x < -umbral);
    this.accionRemota(slot, 'down', p.stick.y > umbral);
    this.accionRemota(slot, 'up', p.stick.y < -umbral);
  }

  trazoRemoto(slot, puntos) {
    const p = this.players[slot];
    if (!p || !Array.isArray(puntos)) return;
    p.trazos.push(puntos);
    if (p.trazos.length > 40) p.trazos.shift();
  }

  /** El mando se desconectó: se suelta todo lo suyo y se para la palanca. */
  soltarRemoto(slot) {
    const p = this.players[slot];
    if (!p) return;
    for (const a of [...p._remote]) this.accionRemota(slot, a, false);
    p.stick.x = 0;
    p.stick.y = 0;
    p._mando = false;
  }

  _shouldPrevent(code) {
    if (ALWAYS_PREVENT.has(code)) return true;
    return this.players.some((p) => ACTIONS.some((a) => p.map[a] === code));
  }

  /** Registra un callback para una tecla concreta. Devuelve la función para quitarlo. */
  on(code, cb) {
    if (!this._handlers.has(code)) this._handlers.set(code, new Set());
    this._handlers.get(code).add(cb);
    return () => this._handlers.get(code)?.delete(cb);
  }
  /** Callback para cualquier tecla — usado por el remapeo y el test de teclado. */
  onAny(cb) {
    this._anyHandlers.add(cb);
    return () => this._anyHandlers.delete(cb);
  }

  keyHeld(code) { return this._rawHeld.has(code); }
  get rawHeldCount() { return this._rawHeld.size; }
  get rawHeld() { return [...this._rawHeld]; }

  /** Limpia los flancos. El shell la llama al final de cada frame. */
  endFrame() {
    for (const p of this.players) { p._pressed.clear(); p._released.clear(); }
    this._globalPressed.clear();
  }

  releaseAll() {
    this._rawHeld.clear();
    this._globalHeld.clear();
    for (const p of this.players) {
      p._held.clear(); p._pressed.clear(); p._released.clear();
      p._remote.clear();
      p.stick.x = 0; p.stick.y = 0;
    }
  }

  resetTaps() { for (const p of this.players) p.taps = 0; }

  setEnabled(v) { this._enabled = v; if (!v) this.releaseAll(); }

  destroy() {
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup', this._onUp);
    window.removeEventListener('blur', this._onBlur);
  }
}

/** Instancia única compartida por el hub y por todos los juegos. */
export const input = new InputManager();
