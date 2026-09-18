/**
 * engine.js — bucle de juego, canvas retina y control de pausa.
 *
 * Paso fijo con acumulador: la física es determinista aunque el navegador
 * pierda cuadros. El render interpola nada (los juegos son de baja latencia
 * y a 60/120 Hz el jitter no se percibe), pero el dt de update es constante.
 */

export class Engine {
  /**
   * @param {object} o
   * @param {HTMLCanvasElement} o.canvas
   * @param {(dt:number)=>void} o.update   dt en segundos, siempre igual a `step`
   * @param {(alpha:number)=>void} o.render
   * @param {number} [o.step]              paso fijo en segundos
   * @param {number} [o.width]             ancho lógico fijo (si se omite: tamaño del contenedor)
   * @param {number} [o.height]
   */
  constructor({ canvas, update, render, step = 1 / 120, width = 0, height = 0 }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.updateFn = update;
    this.renderFn = render;
    this.step = step;
    this.fixedSize = width > 0 && height > 0;
    this.W = width;
    this.H = height;

    this.running = false;
    this.paused = false;
    this.time = 0;         // segundos de juego transcurridos (no cuenta pausa)
    this.frame = 0;
    this._acc = 0;
    this._last = 0;
    this._raf = 0;
    this._shake = { mag: 0, decay: 8 };

    this._onResize = () => this.resize();
    this._onBlur = () => { if (this.running && !this.paused) this.onAutoPause?.(); };

    this.resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('blur', this._onBlur);
  }

  /** Ajusta el backing store al devicePixelRatio para que se vea nítido en retina. */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = this.canvas.parentElement?.getBoundingClientRect();
    if (!this.fixedSize) {
      this.W = Math.max(1, Math.floor(box?.width || window.innerWidth));
      this.H = Math.max(1, Math.floor(box?.height || window.innerHeight));
    }
    this.dpr = dpr;
    this.canvas.width = Math.floor(this.W * dpr);
    this.canvas.height = Math.floor(this.H * dpr);
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.onResize?.(this.W, this.H);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._acc = 0;
    const tick = (now) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(tick);
      // Un salto > 250 ms (pestaña oculta, sleep) no se recupera: se descarta.
      let delta = Math.min((now - this._last) / 1000, 0.25);
      this._last = now;
      if (this.paused) { this._draw(0); return; }

      this._acc += delta;
      let guard = 0;
      while (this._acc >= this.step && guard++ < 8) {
        this.updateFn(this.step);
        this.time += this.step;
        this._acc -= this.step;
      }
      if (this._shake.mag > 0) {
        this._shake.mag = Math.max(0, this._shake.mag - this._shake.decay * delta * this._shake.mag);
        if (this._shake.mag < 0.05) this._shake.mag = 0;
      }
      this.frame++;
      this._draw(this._acc / this.step);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _draw(alpha) {
    const c = this.ctx;
    c.save();
    if (this._shake.mag > 0) {
      const m = this._shake.mag;
      c.translate((Math.random() * 2 - 1) * m, (Math.random() * 2 - 1) * m);
    }
    this.renderFn(alpha);
    c.restore();
  }

  /** Sacudida de cámara — el componente visual del sistema háptico. */
  shake(magnitude = 6, decay = 8) {
    this._shake.mag = Math.max(this._shake.mag, magnitude);
    this._shake.decay = decay;
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; this._last = performance.now(); this._acc = 0; }
  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }
  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('blur', this._onBlur);
  }

  /* ---------- Ayudas de dibujo comunes ---------- */

  clear(color = '#06060c') {
    const c = this.ctx;
    c.fillStyle = color;
    c.fillRect(0, 0, this.W, this.H);
  }

  /** Rectángulo con brillo neón (relleno + halo). */
  glowRect(x, y, w, h, color, blur = 18) {
    const c = this.ctx;
    c.save();
    c.shadowColor = color;
    c.shadowBlur = blur;
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
    c.restore();
  }

  glowCircle(x, y, r, color, blur = 18) {
    const c = this.ctx;
    c.save();
    c.shadowColor = color;
    c.shadowBlur = blur;
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  text(str, x, y, { size = 16, color = '#fff', align = 'center', font = 'var(--font-display)', glow = 0 } = {}) {
    const c = this.ctx;
    c.save();
    c.font = `${size}px ${font.includes('var(') ? '"Press Start 2P", monospace' : font}`;
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = 'middle';
    if (glow) { c.shadowColor = color; c.shadowBlur = glow; }
    c.fillText(str, x, y);
    c.restore();
  }
}

/** Rejilla de fondo estilo arcade — usada por varios juegos. */
export function drawGrid(c, W, H, cell = 40, color = '#ffffff08') {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = 1;
  c.beginPath();
  for (let x = 0; x <= W; x += cell) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); }
  for (let y = 0; y <= H; y += cell) { c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); }
  c.stroke();
  c.restore();
}
