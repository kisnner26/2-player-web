/**
 * touchbar.js — cliente del puente con la Touch Bar (lado web).
 *
 * IMPORTANTE: ningún navegador expone la Touch Bar. No existe una Web API.
 * La única vía real es un contenedor nativo, y Electron sí tiene una API
 * `TouchBar` completa. Por eso este módulo habla con `window.__touchbar__`,
 * que solo existe cuando la app corre dentro del envoltorio de `desktop/`.
 *
 * Si el puente no está (Safari, Chrome, otra Mac sin Touch Bar), `available`
 * queda en false y el hub oculta los 10 juegos exclusivos. La web sigue
 * funcionando entera con los otros 40.
 *
 * Los juegos describen la barra de forma declarativa y este módulo se encarga
 * del diffing, así que un juego puede llamar a `set()` en cada frame sin
 * reconstruir la barra nativa (reconstruirla parpadea y es lenta).
 */

const BRIDGE = () => (typeof window !== 'undefined' ? window.__touchbar__ : null);

class TouchBarClient {
  constructor() {
    this._listeners = new Set();
    this._spec = [];
    this._escapeSpec = null;
    this.available = false;
    this.hardware = false;
    this.reason = 'sin puente nativo';
    this._ready = this._probe();
  }

  async _probe() {
    const b = BRIDGE();
    if (!b) { this.reason = 'la app corre en un navegador; se necesita el envoltorio de escritorio'; return false; }
    try {
      const info = await b.probe();
      this.hardware = !!info?.hasTouchBar;
      this.available = this.hardware;
      this.model = info?.model || '';
      this.reason = this.hardware ? 'ok' : 'este Mac no tiene Touch Bar';
      b.onEvent((ev) => {
        for (const cb of this._listeners) cb(ev);
      });
      return this.available;
    } catch (e) {
      this.reason = 'el puente respondió con error: ' + e.message;
      return false;
    }
  }

  /** Espera a la detección. Resuelve a true/false. */
  ready() { return this._ready; }

  /**
   * Define el contenido de la barra.
   * @param {Array<object>} items  cada item: {type, id, ...}
   *   button   {label, bg, color, icon, enabled}
   *   label    {label, color}
   *   slider   {label, value, min, max}
   *   segment  {segments:[string], selected, mode:'single'|'buttons'}
   *   scrubber {items:[string], selected, continuous}
   *   color    {selected}
   *   spacer   {size:'small'|'large'|'flexible'}
   *   popover  {label, items:[...]}
   *   group    {items:[...]}
   */
  set(items) {
    const b = BRIDGE();
    if (!b || !this.available) return;
    const spec = normalize(items);
    if (sameSpec(spec, this._spec)) return;
    // Si solo cambiaron propiedades y no la estructura, se hace un update parcial.
    if (structureMatches(spec, this._spec)) {
      const patch = diffProps(spec, this._spec);
      if (patch.length) b.update(patch);
    } else {
      b.setBar(spec, this._escapeSpec);
    }
    this._spec = spec;
  }

  /** Cambia propiedades de un item sin tocar el resto de la barra. */
  update(id, props) {
    const b = BRIDGE();
    if (!b || !this.available) return;
    const item = findById(this._spec, id);
    if (item) Object.assign(item, props);
    b.update([{ id, ...props }]);
  }

  /** Varios updates de golpe (más eficiente en un bucle de juego). */
  updateMany(patches) {
    const b = BRIDGE();
    if (!b || !this.available || !patches.length) return;
    for (const p of patches) {
      const item = findById(this._spec, p.id);
      if (item) Object.assign(item, p);
    }
    b.update(patches);
  }

  /** Sustituye el botón de escape (esquina izquierda). */
  setEscape(item) {
    const b = BRIDGE();
    if (!b || !this.available) return;
    this._escapeSpec = item ? normalize([item])[0] : null;
    b.setBar(this._spec, this._escapeSpec);
  }

  /**
   * Escucha eventos de la barra.
   * ev = { id, type:'click'|'change'|'select'|'highlight', value }
   * @returns {()=>void} para dejar de escuchar
   */
  on(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  /** Vacía la barra y devuelve el control al sistema. */
  clear() {
    const b = BRIDGE();
    this._spec = [];
    this._escapeSpec = null;
    b?.clear();
  }

  /** Pide un pulso al Taptic Engine del trackpad (si el puente lo soporta). */
  haptic(kind = 'light') { BRIDGE()?.haptic?.(kind); }

  /** Marca la ventana como ocupada para que el sistema no robe la barra. */
  setFocus(on) { BRIDGE()?.setFocus?.(!!on); }
}

/* ---------------- Helpers de spec ---------------- */

let autoId = 0;
function normalize(items) {
  return items.map((it) => {
    const o = { ...it };
    if (!o.id) o.id = `_auto${autoId++}`;
    if (!o.type) o.type = 'button';
    if (o.items) o.items = normalize(o.items);
    return o;
  });
}

function findById(spec, id) {
  for (const it of spec) {
    if (it.id === id) return it;
    if (it.items) { const f = findById(it.items, id); if (f) return f; }
  }
  return null;
}

function structureMatches(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].type !== b[i].type || a[i].id !== b[i].id) return false;
    if (a[i].items || b[i].items) {
      if (!a[i].items || !b[i].items) return false;
      if (!structureMatches(a[i].items, b[i].items)) return false;
    }
  }
  return true;
}

function diffProps(next, prev) {
  const out = [];
  for (let i = 0; i < next.length; i++) {
    const n = next[i], p = prev[i];
    const patch = {};
    for (const k of Object.keys(n)) {
      if (k === 'id' || k === 'type' || k === 'items') continue;
      if (JSON.stringify(n[k]) !== JSON.stringify(p?.[k])) patch[k] = n[k];
    }
    if (Object.keys(patch).length) out.push({ id: n.id, ...patch });
    if (n.items && p?.items) out.push(...diffProps(n.items, p.items));
  }
  return out;
}

function sameSpec(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const touchbar = new TouchBarClient();

/* ---------------- Utilidades para los juegos ---------------- */

/** Fila de N botones idénticos con ids `${prefix}${i}`. */
export function buttonRow(prefix, count, { labels = null, bg = '#1c1c1c', color = '#ffffff' } = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      type: 'button',
      id: `${prefix}${i}`,
      label: labels ? labels[i] : ' ',
      bg, color,
    });
  }
  return out;
}

/** Barra de progreso dibujada con caracteres de bloque (la Touch Bar no tiene barras). */
export function meterLabel(value, max = 1, width = 12, { full = '█', empty = '·' } = {}) {
  const n = Math.round((Math.max(0, Math.min(1, value / max))) * width);
  return full.repeat(n) + empty.repeat(width - n);
}

/** Convierte una posición 0..1 en un índice de celda para barras de N botones. */
export function cellAt(pos, count) {
  return Math.max(0, Math.min(count - 1, Math.floor(pos * count)));
}
