/**
 * Duelo Estelar — dos naves, un sol que tira de todo y balas que también caen.
 *
 * La gravedad afecta por igual a naves y proyectiles, así que se puede
 * disparar "en órbita" y darle al rival por la espalda. El sol mata al
 * contacto: es a la vez arma, obstáculo y castigo por descuidarse.
 */

import { TAU, clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 5;
const G = 62000;             // constante gravitatoria del sol
const R_SOL = 26;
const R_NAVE = 11;
const EMPUJE = 190;
const GIRO = 3.4;
const VEL_BALA = 240;
const RECARGA = 0.5;
const COMBUSTIBLE_MAX = 3.2;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let sol = { x: 0, y: 0 };
  const jug = [nave(0), nave(1)];
  let balas = [];
  let sb = null, finRonda = 0, ronda = 1;

  function nave(i) {
    return { i, x: 0, y: 0, vx: 0, vy: 0, a: 0, vivo: true, score: 0, recarga: 0, fuel: COMBUSTIBLE_MAX, empujando: false, invul: 0 };
  }

  function nuevaRonda() {
    sol.x = W / 2; sol.y = H / 2;
    const r = Math.min(W, H) * 0.34;
    for (let i = 0; i < 2; i++) {
      const p = jug[i];
      const ang = i === 0 ? Math.PI : 0;
      p.x = sol.x + Math.cos(ang) * r;
      p.y = sol.y + Math.sin(ang) * r;
      // Velocidad tangencial inicial: entran ya en órbita, no cayendo.
      const vOrb = Math.sqrt(G / r) * 0.95;
      p.vx = -Math.sin(ang) * vOrb;
      p.vy = Math.cos(ang) * vOrb;
      p.a = ang + Math.PI / 2;
      p.vivo = true;
      p.recarga = 0;
      p.fuel = COMBUSTIBLE_MAX;
      p.invul = 1;
    }
    balas = [];
    finRonda = 0;
  }

  function gravedad(o, dt) {
    const dx = sol.x - o.x, dy = sol.y - o.y;
    const d2 = Math.max(400, dx * dx + dy * dy);
    const d = Math.sqrt(d2);
    const a = G / d2;
    o.vx += (dx / d) * a * dt;
    o.vy += (dy / d) * a * dt;
  }

  function envolver(o) {
    if (o.x < 0) o.x += W; else if (o.x > W) o.x -= W;
    if (o.y < 0) o.y += H; else if (o.y > H) o.y -= H;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: `ronda ${ronda} · a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; nuevaRonda(); },

    update(dt) {
      if (finRonda > 0) {
        finRonda -= dt;
        moverBalas(dt);
        particles.update(dt);
        if (finRonda <= 0) siguienteRonda();
        return;
      }

      for (const p of jug) {
        if (!p.vivo) continue;
        const pl = input.player(p.i);
        p.a += ((pl.held('right') ? 1 : 0) - (pl.held('left') ? 1 : 0)) * GIRO * dt;

        p.empujando = pl.held('up') && p.fuel > 0;
        if (p.empujando) {
          p.vx += Math.cos(p.a) * EMPUJE * dt;
          p.vy += Math.sin(p.a) * EMPUJE * dt;
          p.fuel = Math.max(0, p.fuel - dt);
          particles.spawn({
            x: p.x - Math.cos(p.a) * 12, y: p.y - Math.sin(p.a) * 12,
            vx: -Math.cos(p.a) * 120 + (rng() - 0.5) * 40,
            vy: -Math.sin(p.a) * 120 + (rng() - 0.5) * 40,
            life: 0.3, maxLife: 0.3, size: 3, color: '#ffb347', shape: 'circle',
          });
          if (Math.random() < dt * 12) haptics.play('engine', { player: p.i });
        } else {
          p.fuel = Math.min(COMBUSTIBLE_MAX, p.fuel + dt * 0.32);
        }

        gravedad(p, dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        envolver(p);
        if (p.invul > 0) p.invul -= dt;

        if (p.recarga > 0) p.recarga -= dt;
        if (pl.pressed('a') && p.recarga <= 0) disparar(p);

        if (Math.hypot(p.x - sol.x, p.y - sol.y) < R_SOL + R_NAVE) morir(p, null);
      }

      moverBalas(dt);
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#03030a');

      // Estrellas de fondo, estables entre cuadros
      g.save();
      for (let i = 0; i < 60; i++) {
        const x = ((i * 9301 + 49297) % 233280) / 233280 * W;
        const y = ((i * 4021 + 12345) % 233280) / 233280 * H;
        g.globalAlpha = 0.15 + ((i % 5) / 5) * 0.35;
        g.fillStyle = '#fff';
        g.fillRect(x, y, 1.5, 1.5);
      }
      g.restore();

      // Sol con corona pulsante
      const pulso = 1 + Math.sin(ctx.engine.time * 3) * 0.06;
      g.save();
      const grd = g.createRadialGradient(sol.x, sol.y, 0, sol.x, sol.y, R_SOL * 4);
      grd.addColorStop(0, '#fff6c9');
      grd.addColorStop(0.25, '#ffb347cc');
      grd.addColorStop(1, '#ff634700');
      g.fillStyle = grd;
      g.beginPath(); g.arc(sol.x, sol.y, R_SOL * 4, 0, TAU); g.fill();
      g.restore();
      ctx.engine.glowCircle(sol.x, sol.y, R_SOL * pulso, '#fff0b0', 40);

      particles.render(g);

      for (const b of balas) {
        ctx.engine.glowCircle(b.x, b.y, 3, players[b.due].color, 12);
      }

      for (const p of jug) {
        if (!p.vivo) continue;
        const col = players[p.i].color;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.a);
        if (p.invul > 0) g.globalAlpha = 0.4 + Math.sin(ctx.engine.time * 22) * 0.3;
        g.shadowColor = col; g.shadowBlur = 16;
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(R_NAVE + 4, 0);
        g.lineTo(-R_NAVE, -R_NAVE * 0.8);
        g.lineTo(-R_NAVE * 0.45, 0);
        g.lineTo(-R_NAVE, R_NAVE * 0.8);
        g.closePath();
        g.fill();
        g.restore();
      }

      // Combustible
      for (let i = 0; i < 2; i++) {
        const p = jug[i];
        const bw = 120, bx = i === 0 ? 18 : W - 18 - bw, by = H - 22;
        g.fillStyle = '#ffffff18';
        g.fillRect(bx, by, bw, 6);
        g.fillStyle = p.fuel > 0.6 ? players[i].color : '#ff4757';
        const w = bw * (p.fuel / COMBUSTIBLE_MAX);
        g.fillRect(i === 0 ? bx : bx + bw - w, by, w, 6);
      }
    },

    destroy() { sb?.remove(); },
  };

  function disparar(p) {
    p.recarga = RECARGA;
    balas.push({
      x: p.x + Math.cos(p.a) * (R_NAVE + 6),
      y: p.y + Math.sin(p.a) * (R_NAVE + 6),
      vx: p.vx + Math.cos(p.a) * VEL_BALA,
      vy: p.vy + Math.sin(p.a) * VEL_BALA,
      due: p.i, vida: 4.5, gracia: 0.18,
    });
    // Retroceso: disparar te cambia la órbita. Detalle del original de 1962.
    p.vx -= Math.cos(p.a) * 22;
    p.vy -= Math.sin(p.a) * 22;
    audio.laser();
    haptics.play('bounce', { player: p.i });
  }

  function moverBalas(dt) {
    for (let i = balas.length - 1; i >= 0; i--) {
      const b = balas[i];
      b.vida -= dt;
      if (b.gracia > 0) b.gracia -= dt;
      if (b.vida <= 0) { balas.splice(i, 1); continue; }
      gravedad(b, dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      envolver(b);

      if (Math.hypot(b.x - sol.x, b.y - sol.y) < R_SOL) {
        particles.burst(b.x, b.y, 6, { speed: 120, color: '#ffd166', size: 3 });
        balas.splice(i, 1);
        continue;
      }
      for (const p of jug) {
        if (!p.vivo || p.invul > 0) continue;
        if (b.due === p.i && b.gracia > 0) continue;
        if (Math.hypot(p.x - b.x, p.y - b.y) < R_NAVE + 4) {
          morir(p, b.due);
          balas.splice(i, 1);
          break;
        }
      }
    }
  }

  function morir(p, porQuien) {
    if (!p.vivo || finRonda > 0) return;
    p.vivo = false;
    audio.explosion();
    haptics.explosion(p.i);
    ctx.shake(20);
    particles.burst(p.x, p.y, 50, { speed: 300, color: players[p.i].color, size: 5, drag: 0.92 });
    particles.burst(p.x, p.y, 24, { speed: 180, color: '#ffd166', size: 3, shape: 'circle' });

    const otro = 1 - p.i;
    if (porQuien === otro || porQuien === null) jug[otro].score++;
    if (porQuien === null) ui.toast('Absorbido por el sol', { ms: 1500 });
    if (porQuien === p.i) ui.toast('¡Tu propia bala!', { ms: 1500 });
    sb.update(jug[0].score, jug[1].score);
    finRonda = 1.6;
  }

  function siguienteRonda() {
    const g = jug.find((p) => p.score >= PARA_GANAR);
    if (g) { ctx.finish({ winner: g.i, scores: [jug[0].score, jug[1].score] }); return; }
    ronda++;
    sb.setCenter(`ronda ${ronda} · a ${PARA_GANAR}`);
    nuevaRonda();
  }
}
