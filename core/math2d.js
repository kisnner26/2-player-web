/**
 * math2d.js — utilidades compartidas de geometría, colisión y aleatoriedad.
 * Sin estado: todo son funciones puras salvo el generador con semilla.
 */

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };
export const angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
export const deg = (r) => (r * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;

/** Diferencia angular mínima con signo, en (-π, π]. */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Aproxima `v` a `target` como máximo `step` (evita el temblor del lerp). */
export function approach(v, target, step) {
  if (v < target) return Math.min(v + step, target);
  if (v > target) return Math.max(v - step, target);
  return target;
}

/** Amortiguación independiente del framerate. `k` mayor = más rápido. */
export function damp(a, b, k, dt) {
  return lerp(a, b, 1 - Math.exp(-k * dt));
}

/* ---------------- Colisiones ---------------- */

export function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function circleHit(a, b) {
  const r = a.r + b.r;
  return dist2(a.x, a.y, b.x, b.y) <= r * r;
}

export function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  return dist2(cx, cy, nx, ny) <= cr * cr;
}

export function pointInRect(px, py, x, y, w, h) {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

/** Intersección de segmentos. Devuelve {x,y,t} o null. */
export function segIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
  const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), t };
}

/** Rebote elástico de dos círculos con masa. Modifica los objetos en sitio. */
export function elasticBounce(a, b, restitution = 1) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const nx = dx / d, ny = dy / d;
  const overlap = a.r + b.r - d;
  if (overlap <= 0) return false;
  const ma = a.m ?? 1, mb = b.m ?? 1;
  const total = ma + mb;
  // Separación proporcional a la masa para que no se atraviesen.
  a.x -= nx * overlap * (mb / total);
  a.y -= ny * overlap * (mb / total);
  b.x += nx * overlap * (ma / total);
  b.y += ny * overlap * (ma / total);

  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn > 0) return true;   // ya se están separando
  const j = (-(1 + restitution) * vn) / (1 / ma + 1 / mb);
  a.vx -= (j * nx) / ma; a.vy -= (j * ny) / ma;
  b.vx += (j * nx) / mb; b.vy += (j * ny) / mb;
  return true;
}

/* ---------------- Aleatoriedad ---------------- */

export const rand = (a = 1, b = null) => (b === null ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** PRNG con semilla (mulberry32) — para partidas reproducibles. */
export function seeded(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (a, b) => a + next() * (b - a);
  next.int = (a, b) => Math.floor(a + next() * (b - a + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}

/* ---------------- Partículas ---------------- */

/** Sistema de partículas mínimo y reutilizable. */
export class Particles {
  constructor(max = 400) {
    this.max = max;
    this.list = [];
  }
  /** @param {object} o {x,y,vx,vy,life,size,color,gravity,drag,shape} */
  spawn(o) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({
      x: 0, y: 0, vx: 0, vy: 0, life: 0.6, maxLife: 0.6,
      size: 3, color: '#fff', gravity: 0, drag: 0.98, shape: 'square', rot: 0, vr: 0,
      ...o,
    });
  }
  burst(x, y, n, opts = {}) {
    const { speed = 160, spread = TAU, dir = 0, ...rest } = opts;
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.spawn({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.3 + Math.random() * 0.5, maxLife: 0.8,
        vr: (Math.random() - 0.5) * 12,
        ...rest,
      });
    }
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }
  render(c) {
    for (const p of this.list) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      c.save();
      c.globalAlpha = a;
      c.fillStyle = p.color;
      if (p.shape === 'circle') {
        c.beginPath();
        c.arc(p.x, p.y, p.size * a, 0, TAU);
        c.fill();
      } else if (p.shape === 'spark') {
        c.strokeStyle = p.color;
        c.lineWidth = Math.max(1, p.size * a * 0.6);
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        c.stroke();
      } else {
        const s = p.size * a;
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillRect(-s / 2, -s / 2, s, s);
      }
      c.restore();
    }
  }
  clear() { this.list.length = 0; }
}

/** Rastro de posiciones para estelas (motos de luz, serpientes, etc.). */
export class Trail {
  constructor(max = 60) { this.max = max; this.pts = []; }
  push(x, y) {
    this.pts.push({ x, y });
    if (this.pts.length > this.max) this.pts.shift();
  }
  clear() { this.pts.length = 0; }
  render(c, color, width = 4) {
    if (this.pts.length < 2) return;
    c.save();
    c.strokeStyle = color;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (let i = 1; i < this.pts.length; i++) {
      const t = i / this.pts.length;
      c.globalAlpha = t * 0.8;
      c.lineWidth = width * t;
      c.beginPath();
      c.moveTo(this.pts[i - 1].x, this.pts[i - 1].y);
      c.lineTo(this.pts[i].x, this.pts[i].y);
      c.stroke();
    }
    c.restore();
  }
}
