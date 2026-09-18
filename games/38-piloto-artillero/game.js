/**
 * Piloto y Artillero — una nave, dos puestos.
 *
 * El piloto vuela (rotación e impulso) y el artillero gira la torreta y
 * dispara, de forma independiente del morro de la nave. Sobrevivir tantas
 * oleadas como puedan: la puntuación es común, así que no hay a quién echarle
 * la culpa… en teoría.
 */

import { TAU, clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const R_NAVE = 15;
const EMPUJE = 230;
const GIRO = 3.2;
const GIRO_TORRETA = 3.6;
const VEL_BALA = 480;
const RECARGA = 0.22;
const ESCUDO_MAX = 3;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  const nave = { x: 0, y: 0, vx: 0, vy: 0, a: -Math.PI / 2, torreta: -Math.PI / 2, escudo: ESCUDO_MAX, invul: 0, recarga: 0 };
  let balas = [], rocas = [];
  let oleada = 0, puntos = 0, sb = null, terminado = false;
  let entreOleadas = 0;
  let pararRumble = null;

  function nuevaOleada() {
    oleada++;
    rocas = [];
    const n = 2 + oleada;
    for (let i = 0; i < n; i++) crearRoca(3);
    sb.setCenter(`oleada ${oleada}`);
    ui.toast(`Oleada ${oleada}`, { ms: 1200 });
    audio.arp([330, 415, 494]);
  }

  function crearRoca(tam, x, y) {
    // Aparecen en el borde para no materializarse encima de la nave.
    if (x == null) {
      const borde = Math.floor(rng() * 4);
      x = borde === 0 ? 0 : borde === 1 ? W : rng() * W;
      y = borde === 2 ? 0 : borde === 3 ? H : rng() * H;
    }
    const a = rng() * TAU;
    const vel = 30 + rng() * 45 + oleada * 5;
    rocas.push({
      x, y, tam,
      r: tam * 13,
      vx: Math.cos(a) * vel, vy: Math.sin(a) * vel,
      rot: rng() * TAU, vr: (rng() - 0.5) * 2,
      forma: Array.from({ length: 9 }, () => 0.72 + rng() * 0.42),
    });
  }

  const envolver = (o) => {
    if (o.x < -30) o.x = W + 30; else if (o.x > W + 30) o.x = -30;
    if (o.y < -30) o.y = H + 30; else if (o.y > H + 30) o.y = -30;
  };

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nave.x = W / 2; nave.y = H / 2;
      sb = ui.scoreboard({ center: '' });
      ui.banner(`<b style="color:${players[0].color}">${players[0].name}</b> pilota ·
                 <b style="color:${players[1].color}">${players[1].name}</b> dispara`);
      nuevaOleada();
      pararRumble = haptics.sustain(
        () => (input.player(0).held('up') ? 0.5 : 0), { player: 0, period: 90 }
      );
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }

      if (entreOleadas > 0) {
        entreOleadas -= dt;
        if (entreOleadas <= 0) nuevaOleada();
      }

      /* Piloto */
      const p1 = input.player(0);
      nave.a += ((p1.held('right') ? 1 : 0) - (p1.held('left') ? 1 : 0)) * GIRO * dt;
      if (p1.held('up')) {
        nave.vx += Math.cos(nave.a) * EMPUJE * dt;
        nave.vy += Math.sin(nave.a) * EMPUJE * dt;
        particles.spawn({
          x: nave.x - Math.cos(nave.a) * 14, y: nave.y - Math.sin(nave.a) * 14,
          vx: -Math.cos(nave.a) * 130 + (rng() - 0.5) * 50,
          vy: -Math.sin(nave.a) * 130 + (rng() - 0.5) * 50,
          life: 0.3, maxLife: 0.3, size: 3, color: '#ffb347', shape: 'circle',
        });
      }
      if (p1.held('down')) { nave.vx *= Math.pow(0.25, dt); nave.vy *= Math.pow(0.25, dt); }
      nave.vx *= Math.pow(0.72, dt);
      nave.vy *= Math.pow(0.72, dt);
      nave.x += nave.vx * dt;
      nave.y += nave.vy * dt;
      envolver(nave);
      if (nave.invul > 0) nave.invul -= dt;

      /* Artillero */
      const p2 = input.player(1);
      nave.torreta += ((p2.held('right') ? 1 : 0) - (p2.held('left') ? 1 : 0)) * GIRO_TORRETA * dt;
      if (nave.recarga > 0) nave.recarga -= dt;
      if ((p2.held('a') || p2.held('up')) && nave.recarga <= 0) disparar();

      /* Balas */
      for (let i = balas.length - 1; i >= 0; i--) {
        const b = balas[i];
        b.vida -= dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        envolver(b);
        if (b.vida <= 0) { balas.splice(i, 1); continue; }
        for (let j = rocas.length - 1; j >= 0; j--) {
          const r = rocas[j];
          if (Math.hypot(r.x - b.x, r.y - b.y) < r.r) {
            romper(j);
            balas.splice(i, 1);
            break;
          }
        }
      }

      /* Rocas */
      for (const r of rocas) {
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.rot += r.vr * dt;
        envolver(r);
        if (nave.invul <= 0 && Math.hypot(r.x - nave.x, r.y - nave.y) < r.r + R_NAVE) impacto();
      }

      if (rocas.length === 0 && entreOleadas <= 0) entreOleadas = 1.6;

      sb.update(nave.escudo, puntos);
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#03030c');

      for (let i = 0; i < 80; i++) {
        const x = ((i * 7919) % 1000) / 1000 * W;
        const y = ((i * 104729) % 1000) / 1000 * H;
        g.globalAlpha = 0.15 + ((i % 5) / 5) * 0.35;
        g.fillStyle = '#fff';
        g.fillRect(x, y, 1.5, 1.5);
      }
      g.globalAlpha = 1;

      for (const r of rocas) {
        g.save();
        g.translate(r.x, r.y);
        g.rotate(r.rot);
        g.strokeStyle = '#9a9ac0';
        g.lineWidth = 2;
        g.fillStyle = '#2a2a3e';
        g.beginPath();
        r.forma.forEach((f, k) => {
          const a = (k / r.forma.length) * TAU;
          const px = Math.cos(a) * r.r * f, py = Math.sin(a) * r.r * f;
          k === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
        });
        g.closePath();
        g.fill();
        g.stroke();
        g.restore();
      }

      particles.render(g);

      for (const b of balas) ctx.engine.glowCircle(b.x, b.y, 3.5, players[1].color, 14);

      // Nave
      g.save();
      g.translate(nave.x, nave.y);
      if (nave.invul > 0) g.globalAlpha = 0.4 + Math.sin(ctx.engine.time * 22) * 0.35;
      g.save();
      g.rotate(nave.a);
      g.shadowColor = players[0].color; g.shadowBlur = 16;
      g.fillStyle = players[0].color;
      g.beginPath();
      g.moveTo(R_NAVE + 5, 0);
      g.lineTo(-R_NAVE, -R_NAVE * 0.8);
      g.lineTo(-R_NAVE * 0.4, 0);
      g.lineTo(-R_NAVE, R_NAVE * 0.8);
      g.closePath();
      g.fill();
      g.restore();
      // Torreta, independiente del morro
      g.save();
      g.rotate(nave.torreta);
      g.shadowColor = players[1].color; g.shadowBlur = 14;
      g.strokeStyle = players[1].color;
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(R_NAVE + 12, 0); g.stroke();
      g.restore();
      g.fillStyle = players[1].color;
      g.beginPath(); g.arc(0, 0, 5.5, 0, TAU); g.fill();
      g.restore();

      // Escudo
      for (let k = 0; k < ESCUDO_MAX; k++) {
        g.fillStyle = k < nave.escudo ? '#00e5ff' : '#ffffff20';
        g.fillRect(18 + k * 18, H - 28, 13, 13);
      }
      ctx.engine.text('ESCUDO', 18, H - 40, { size: 9, color: '#ffffff55', align: 'left', font: 'system-ui' });
    },

    destroy() { sb?.remove(); ui.hideBanner(); pararRumble?.(); },
  };

  function disparar() {
    nave.recarga = RECARGA;
    balas.push({
      x: nave.x + Math.cos(nave.torreta) * (R_NAVE + 14),
      y: nave.y + Math.sin(nave.torreta) * (R_NAVE + 14),
      vx: nave.vx + Math.cos(nave.torreta) * VEL_BALA,
      vy: nave.vy + Math.sin(nave.torreta) * VEL_BALA,
      vida: 1.3,
    });
    audio.laser();
    haptics.play('click', { player: 1 });
  }

  function romper(j) {
    const r = rocas[j];
    rocas.splice(j, 1);
    puntos += r.tam * 20;
    audio.hit();
    haptics.impact(1, 0.6 + r.tam * 0.2);
    particles.burst(r.x, r.y, 12 + r.tam * 6, {
      speed: 180, color: '#9a9ac0', size: 4, drag: 0.92,
    });
    // Se parte en dos pedazos más pequeños, como en el original.
    if (r.tam > 1) {
      crearRoca(r.tam - 1, r.x, r.y);
      crearRoca(r.tam - 1, r.x, r.y);
    }
  }

  function impacto() {
    nave.escudo--;
    nave.invul = 1.6;
    audio.explosion();
    haptics.explosion();
    ctx.shake(20);
    particles.burst(nave.x, nave.y, 34, { speed: 260, color: '#00e5ff', size: 5 });
    if (nave.escudo <= 0) {
      terminado = true;
      ctx.finish({
        winner: -1,
        scores: [oleada, puntos],
        detail: `Oleada ${oleada} · ${puntos} puntos entre los dos`,
        record: ctx.record('puntos', puntos, 'high'),
      });
    }
  }
}
