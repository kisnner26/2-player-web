/**
 * Pinball Duelo — dos mesas espejo y UNA sola bola que cruza de una a otra.
 *
 * Cuando la bola sale por arriba de tu mesa, entra por arriba de la suya. Eso
 * convierte cada golpe en un envío: no basta con no perderla, hay que decidir
 * con qué ángulo se la mandas. Un pelotazo recto se lo pones fácil; uno
 * pegado a la pared le llega sin ángulo de paleta.
 *
 * Los tres bumpers de cada mesa dan puntos, pero también devuelven la bola
 * hacia tu propio desagüe. Farmear puntos es exactamente cómo se pierde.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 5;
const GRAVEDAD = 900;
const PALETA_LARGO = 70;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let bola = { x: 0, y: 0, vx: 0, vy: 0, r: 11, lado: 0 };
  const jug = [crear(0), crear(1)];
  let bumpers = [], sb = null, t = 0, pausa = 0, terminado = false;

  function crear(i) {
    return { i, score: 0, puntos: 0, izq: 0, der: 0 };
  }

  const anchoMesa = () => W / 2;
  const mesaX = (lado) => lado * anchoMesa();

  function colocarBumpers() {
    bumpers = [];
    for (const lado of [0, 1]) {
      const bx = mesaX(lado);
      for (const [fx, fy] of [[0.3, 0.34], [0.7, 0.34], [0.5, 0.52]]) {
        bumpers.push({ x: bx + anchoMesa() * fx, y: H * fy, r: Math.min(26, W * 0.024), lado, brillo: 0 });
      }
    }
  }

  function sacar(hacia) {
    bola.lado = hacia;
    bola.x = mesaX(hacia) + anchoMesa() * (0.3 + rng() * 0.4);
    bola.y = H * 0.16;
    bola.vx = (rng() - 0.5) * 160;
    bola.vy = 220;
    pausa = 0.8;
  }

  function perder(lado) {
    const otro = 1 - lado;
    jug[otro].score++;
    sb.update(jug[0].score, jug[1].score);
    audio.lose();
    haptics.defeat(lado);
    ctx.shake(10);
    particles.burst(bola.x, H, 22, { speed: 240, dir: -Math.PI / 2, spread: 1.6, color: '#ff4757', size: 4, drag: 0.9 });
    if (jug[otro].score >= PARA_GANAR) {
      terminado = true;
      ctx.finish({
        winner: otro,
        scores: [jug[0].score, jug[1].score],
        detail: `${jug[0].puntos} y ${jug[1].puntos} puntos de bumper`,
      });
      return;
    }
    sacar(lado);
  }

  /** Extremos de una paleta. `lado` de la mesa, `mano` 0 izquierda 1 derecha. */
  function paleta(lado, mano, alzada) {
    const bx = mesaX(lado);
    const y = H * 0.86;
    const cx = bx + anchoMesa() * (mano === 0 ? 0.32 : 0.68);
    const dir = mano === 0 ? 1 : -1;
    const ang = (alzada ? -0.55 : 0.42) * dir;
    return {
      x1: cx, y1: y,
      x2: cx + Math.cos(ang) * PALETA_LARGO * dir,
      y2: y + Math.sin(ang) * PALETA_LARGO,
    };
  }

  function rebotarPaleta(p, alzada) {
    const dx = p.x2 - p.x1, dy = p.y2 - p.y1;
    const largo2 = dx * dx + dy * dy;
    const tt = clamp(((bola.x - p.x1) * dx + (bola.y - p.y1) * dy) / largo2, 0, 1);
    const px = p.x1 + dx * tt, py = p.y1 + dy * tt;
    const d = Math.hypot(bola.x - px, bola.y - py);
    if (d > bola.r + 6) return false;
    const nx = (bola.x - px) / (d || 1), ny = (bola.y - py) / (d || 1);
    bola.x = px + nx * (bola.r + 6);
    bola.y = py + ny * (bola.r + 6);
    const vn = bola.vx * nx + bola.vy * ny;
    bola.vx -= 2 * vn * nx;
    bola.vy -= 2 * vn * ny;
    // Una paleta que sube da un golpe de verdad; una quieta solo rebota.
    const fuerza = alzada ? 560 : 190;
    bola.vx += nx * fuerza;
    bola.vy += ny * fuerza;
    audio.bounce(0.6);
    haptics.tap(bola.lado);
    return true;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      colocarBumpers();
      sacar(Math.floor(rng() * 2));
      sb = ui.scoreboard({ center: `a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; colocarBumpers(); },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);
      for (const b of bumpers) b.brillo = Math.max(0, b.brillo - dt * 3);

      for (const p of jug) {
        const pl = input.player(p.i);
        p.izq = pl.held('left') || pl.held('a') ? 1 : 0;
        p.der = pl.held('right') || pl.held('b') ? 1 : 0;
      }

      if (pausa > 0) { pausa -= dt; return; }

      bola.vy += GRAVEDAD * dt;
      bola.vx *= Math.pow(0.75, dt);
      bola.x += bola.vx * dt;
      bola.y += bola.vy * dt;

      const bx0 = mesaX(bola.lado), bx1 = bx0 + anchoMesa();
      if (bola.x < bx0 + bola.r) { bola.x = bx0 + bola.r; bola.vx = Math.abs(bola.vx) * 0.86; audio.tick(); }
      if (bola.x > bx1 - bola.r) { bola.x = bx1 - bola.r; bola.vx = -Math.abs(bola.vx) * 0.86; audio.tick(); }

      // Por arriba, cambia de mesa conservando el ángulo.
      if (bola.y < bola.r + H * 0.1) {
        const frac = (bola.x - bx0) / anchoMesa();
        bola.lado = 1 - bola.lado;
        bola.x = mesaX(bola.lado) + anchoMesa() * (1 - frac);
        bola.vx = -bola.vx;
        bola.y = H * 0.1 + bola.r;
        bola.vy = Math.abs(bola.vy) * 0.9 + 60;
        audio.swoosh();
        haptics.tick(bola.lado);
        particles.burst(bola.x, bola.y, 10, { speed: 160, color: players[bola.lado].color, size: 3, drag: 0.9 });
      }

      for (const b of bumpers) {
        if (b.lado !== bola.lado) continue;
        const d = Math.hypot(b.x - bola.x, b.y - bola.y);
        if (d > b.r + bola.r) continue;
        const nx = (bola.x - b.x) / (d || 1), ny = (bola.y - b.y) / (d || 1);
        bola.x = b.x + nx * (b.r + bola.r);
        bola.y = b.y + ny * (b.r + bola.r);
        const vn = bola.vx * nx + bola.vy * ny;
        bola.vx -= 2 * vn * nx;
        bola.vy -= 2 * vn * ny;
        bola.vx += nx * 330;
        bola.vy += ny * 330;
        b.brillo = 1;
        jug[bola.lado].puntos += 10;
        audio.blip();
        haptics.tick(bola.lado);
        particles.burst(b.x, b.y, 8, { speed: 200, color: '#ffd166', size: 3, drag: 0.9 });
      }

      for (const mano of [0, 1]) {
        const alzada = mano === 0 ? jug[bola.lado].izq : jug[bola.lado].der;
        rebotarPaleta(paleta(bola.lado, mano, alzada), alzada);
      }

      const v = Math.hypot(bola.vx, bola.vy);
      if (v > 900) { bola.vx *= 900 / v; bola.vy *= 900 / v; }

      if (bola.y > H + 30) perder(bola.lado);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#080614');

      for (const lado of [0, 1]) {
        const bx = mesaX(lado);
        const col = players[lado].color;
        g.fillStyle = lado === bola.lado ? '#171130' : '#110d22';
        g.fillRect(bx, H * 0.1, anchoMesa(), H - H * 0.1);
        g.strokeStyle = `${col}55`;
        g.lineWidth = 3;
        g.strokeRect(bx + 2, H * 0.1, anchoMesa() - 4, H - H * 0.1);
        // Desagüe
        g.fillStyle = '#2a0d18';
        g.beginPath();
        g.moveTo(bx + anchoMesa() * 0.36, H);
        g.lineTo(bx + anchoMesa() * 0.64, H);
        g.lineTo(bx + anchoMesa() * 0.58, H - 34);
        g.lineTo(bx + anchoMesa() * 0.42, H - 34);
        g.fill();
        ctx.engine.text(`${players[lado].name} · ${jug[lado].puntos}`, bx + anchoMesa() / 2, H * 0.07,
          { size: 13, color: col, font: 'system-ui' });
      }
      // Túnel superior que une las dos mesas
      g.fillStyle = '#1c1638';
      g.fillRect(0, 0, W, H * 0.1);
      g.strokeStyle = '#ffd16644';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, H * 0.1); g.lineTo(W, H * 0.1); g.stroke();
      ctx.engine.text('▲ la bola cruza por arriba ▲', W / 2, H * 0.05,
        { size: 11, color: '#ffd16688', font: 'system-ui' });

      for (const b of bumpers) {
        ctx.engine.glowCircle(b.x, b.y, b.r * (1 + b.brillo * 0.2), b.brillo > 0 ? '#ffffff' : '#ffd166', 12 + b.brillo * 30);
        g.fillStyle = '#2a1f10';
        g.beginPath(); g.arc(b.x, b.y, b.r * 0.5, 0, TAU); g.fill();
      }

      particles.render(g);

      for (const lado of [0, 1]) {
        for (const mano of [0, 1]) {
          const alzada = mano === 0 ? jug[lado].izq : jug[lado].der;
          const p = paleta(lado, mano, alzada);
          g.save();
          g.strokeStyle = players[lado].color;
          g.lineWidth = 12;
          g.lineCap = 'round';
          g.shadowColor = players[lado].color;
          g.shadowBlur = alzada ? 24 : 8;
          g.beginPath(); g.moveTo(p.x1, p.y1); g.lineTo(p.x2, p.y2); g.stroke();
          g.restore();
        }
      }

      ctx.engine.glowCircle(bola.x, bola.y, bola.r, '#f2f2ff', 20);

      ctx.engine.text('Izquierda y derecha son tus dos paletas · la bola cruza por arriba a la otra mesa',
        W / 2, H - 8, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
