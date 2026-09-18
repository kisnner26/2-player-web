/**
 * mandos.js — mandos físicos (DualShock 4 y compatibles) por la Gamepad API.
 *
 * La idea es la misma que en core/red.js con los iPad: un mando no habla con
 * los juegos, habla con core/input.js. Lo que pulsa entra por `accionRemota` y
 * `stickRemoto`, exactamente igual que una tecla, así que TODOS los juegos del
 * catálogo funcionan con mando sin tocar una línea de su código.
 *
 * Tres cosas que conviene saber antes de tocar nada:
 *
 *   1. El objeto Gamepad hay que volver a pedirlo cada fotograma. En Chrome y
 *      en Safari, `navigator.getGamepads()` devuelve una foto: el objeto que
 *      guardaste en la conexión NO se actualiza solo y sus botones se quedan
 *      congelados a false para siempre.
 *
 *   2. Hay dos mapas de botones. Con `mapping === 'standard'` los índices son
 *      los del estándar (✕ = 0, cruceta = 12-15). Safari, y algunos DS4 por
 *      Bluetooth, exponen el mapa crudo del mando: ✕ pasa a ser el botón 1 y
 *      la cruceta desaparece de los botones para convertirse en un "hat" en el
 *      eje 9. Se soportan los dos.
 *
 *   3. Nunca se envía una acción que ya está sostenida, y antes de soltar se
 *      comprueba que de verdad lo estaba. Así el módulo se recupera solo de un
 *      `input.releaseAll()` (pausa, pérdida de foco) sin dejar el personaje
 *      andando ni un botón pegado.
 *
 * Emparejamiento: el primer mando que se conecta es el jugador 1 y el segundo
 * el jugador 2, en el mismo orden que usa core/haptics.js para el rumble, de
 * modo que quien pulsa es quien vibra.
 */

import { input } from './input.js';

/** Por debajo de esto, la palanca se considera centrada (los DS4 usados derivan). */
const ZONA_MUERTA = 0.26;

/** Índices del mapa estándar (Chrome, Edge, Firefox con perfil conocido). */
const ESTANDAR = {
  a: [0],            // ✕
  b: [1, 2],         // ○ y △
  hombros: [4, 5, 6, 7],
  opciones: [9],
  arriba: 12, abajo: 13, izquierda: 14, derecha: 15,
  ejeX: 0, ejeY: 1,
};

/**
 * Mapa crudo del DualShock 4 (Safari y algunos emparejamientos por Bluetooth).
 * La cruceta no son botones: es un "hat" de ocho posiciones en el eje 9.
 */
const CRUDO = {
  a: [1],            // ✕
  b: [2, 3],         // ○ y △
  hombros: [4, 5, 6, 7],
  opciones: [9],
  hat: 9,
  ejeX: 0, ejeY: 1,
};

/** Las ocho posiciones del hat, en el orden en que las numera el mando. */
const HAT = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

/** ¿Este mando expone el mapa estándar? */
function esEstandar(pad) {
  if (pad.mapping === 'standard') return true;
  // Sin mapping declarado, 16+ botones y 4 ejes es la firma del perfil estándar.
  return pad.buttons.length >= 16 && pad.axes.length >= 4 && pad.mapping !== '';
}

const pulsado = (pad, i) => {
  const b = pad.buttons[i];
  return !!b && (typeof b === 'object' ? b.pressed || b.value > 0.5 : b > 0.5);
};

const alguno = (pad, lista) => lista.some((i) => pulsado(pad, i));

class Mandos {
  constructor() {
    /** `gamepad.index` asignado a cada jugador, o null. */
    this.slots = [null, null];
    this._arrancado = false;
    this._raf = 0;
    this._reparto = 0;
    this._oyentes = new Set();
    this._opciones = [false, false];
  }

  /** Cuántos mandos hay repartidos ahora mismo. */
  get hay() { return this.slots.filter((s) => s != null).length; }

  /** Nombre legible del mando de un jugador, para la interfaz. */
  nombre(slot) {
    const pad = this._pad(this.slots[slot]);
    if (!pad) return '';
    // Los identificadores traen el fabricante y los códigos USB entre paréntesis.
    return (pad.id || 'Mando').replace(/\s*\([^)]*\)\s*/g, '').trim() || 'Mando';
  }

  /** Suscribe un callback a conexiones y desconexiones. Devuelve el desuscriptor. */
  alCambiar(cb) {
    this._oyentes.add(cb);
    return () => this._oyentes.delete(cb);
  }

  /**
   * Empieza a escuchar. Es idempotente: el hub y el shell la llaman por su
   * cuenta y solo la primera hace algo.
   */
  iniciar() {
    if (this._arrancado || typeof navigator === 'undefined') return;
    if (!navigator.getGamepads) return;      // navegador sin Gamepad API
    this._arrancado = true;

    window.addEventListener('gamepadconnected', () => this._repartir());
    window.addEventListener('gamepaddisconnected', () => this._repartir());
    // Safari no siempre lanza el evento de conexión hasta que se pulsa un botón,
    // y a veces no lo lanza en absoluto: un repaso lento lo cubre.
    setInterval(() => this._repartir(), 1000);

    this._repartir();
    const bucle = () => {
      this._raf = requestAnimationFrame(bucle);
      this._leer();
    };
    this._raf = requestAnimationFrame(bucle);
  }

  parar() {
    cancelAnimationFrame(this._raf);
    this._arrancado = false;
    for (let s = 0; s < 2; s++) if (this.slots[s] != null) input.soltarRemoto(s);
    this.slots = [null, null];
  }

  _pad(indice) {
    if (indice == null) return null;
    const pads = navigator.getGamepads?.() || [];
    const pad = pads[indice];
    return pad && pad.connected !== false ? pad : null;
  }

  /** Reparte los mandos conectados entre los dos jugadores, por orden de índice. */
  _repartir() {
    const pads = (navigator.getGamepads?.() || []).filter(Boolean);
    const nuevos = [pads[0]?.index ?? null, pads[1]?.index ?? null];
    if (nuevos[0] === this.slots[0] && nuevos[1] === this.slots[1]) return;
    // Un jugador que se queda sin mando tiene que soltar lo que tuviera pulsado.
    for (let s = 0; s < 2; s++) {
      if (this.slots[s] != null && nuevos[s] !== this.slots[s]) input.soltarRemoto(s);
    }
    this.slots = nuevos;
    for (const cb of this._oyentes) cb(this);
  }

  _leer() {
    for (let slot = 0; slot < 2; slot++) {
      const pad = this._pad(this.slots[slot]);
      if (!pad) continue;
      const m = esEstandar(pad) ? ESTANDAR : CRUDO;

      /* --- Dirección: palanca izquierda y cruceta en un solo vector --- */
      let x = pad.axes[m.ejeX] || 0;
      let y = pad.axes[m.ejeY] || 0;
      if (Math.hypot(x, y) < ZONA_MUERTA) { x = 0; y = 0; }

      if (m.hat != null) {
        // Hat: valor de -1 a 1 que recorre las ocho direcciones; en reposo
        // vale algo fuera de rango (típicamente 1.28 o 9).
        const v = pad.axes[m.hat];
        if (v != null && v >= -1 && v <= 1.001) {
          const i = Math.round(((v + 1) / 2) * 7);
          const d = HAT[i];
          if (d) { x = d[0] || x; y = d[1] || y; }
        }
      } else {
        if (pulsado(pad, m.izquierda)) x = -1;
        if (pulsado(pad, m.derecha)) x = 1;
        if (pulsado(pad, m.arriba)) y = -1;
        if (pulsado(pad, m.abajo)) y = 1;
      }

      // stickRemoto alimenta a la vez la palanca analógica y las cuatro
      // direcciones por umbral, así que con esta llamada valen los dos estilos
      // de juego: los que leen `ax/ay` y los que leen `held('left')`.
      input.stickRemoto(slot, x, y);

      /* --- Botones de acción --- */
      this._accion(slot, 'a', alguno(pad, m.a) || pulsado(pad, m.hombros[1]) || pulsado(pad, m.hombros[3]));
      this._accion(slot, 'b', alguno(pad, m.b) || pulsado(pad, m.hombros[0]) || pulsado(pad, m.hombros[2]));

      /* --- Options: pausa y menú, igual que Escape --- */
      const opciones = alguno(pad, m.opciones);
      if (opciones && !this._opciones[slot]) this._escape();
      this._opciones[slot] = opciones;
    }
  }

  /**
   * Manda una acción solo cuando cambia de verdad. Consultar antes si ya estaba
   * sostenida es lo que hace que el módulo se recupere de un releaseAll() sin
   * enterarse de que ha ocurrido.
   */
  _accion(slot, accion, abajo) {
    const sostenida = input.sostenidaRemota(slot, accion);
    if (abajo && !sostenida) input.accionRemota(slot, accion, true);
    else if (!abajo && sostenida) input.accionRemota(slot, accion, false);
  }

  /**
   * El botón Options se traduce a un Escape de verdad y no a una llamada
   * directa: así lo recogen a la vez el menú de pausa del shell y los
   * manejadores propios del hub, sin duplicar rutas.
   */
  _escape() {
    for (const tipo of ['keydown', 'keyup']) {
      window.dispatchEvent(new KeyboardEvent(tipo, { code: 'Escape', key: 'Escape', bubbles: true }));
    }
  }
}

/** Instancia única, como input y audio. */
export const mandos = new Mandos();
