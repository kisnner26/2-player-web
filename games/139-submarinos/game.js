/**
 * Submarinos — duelo a ciegas en aguas negras.
 *
 * No se ve al rival: se ve su ECO. Cada ping ilumina un anillo que se expande
 * y solo deja marcada la última posición conocida del otro, con la antigüedad
 * pintada encima (el eco se apaga). Disparar a un eco de hace tres segundos es
 * disparar a donde el otro YA no está.
 *
 * Y hay una trampa deliciosa: el ping también te delata a ti. El submarino que
 * pinga aparece en la pantalla del rival. Así que la información no es gratis,
 * se paga con posición, y saber cuándo NO pingar es media partida.
 */

import { TAU, clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 3;
const EMPUJE = 340;
const VEL_MAX = 190;
const PING_RECARGA = 2.4;
const PING_VEL = 620;
const TORPEDOS = 4;            // por ronda: obliga a apuntar, no a regar
const TORPEDO_VEL = 260;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let superficie = 0, fondo = 0;
  const jug = [crear(0), crear(1)];
  const pings = [];             // anillos en expansión
  const ecos = [];              // marcas de contacto, con antigüedad
  const torpedos = [];
  let sb = null, pausa = 0, ronda = 1, tocado = -1, t = 0;

  function crear(i) {
    return { i, x: 0, y: 0, vx: 0, vy: 0, r: 18, score: 0, vivo: true,
             mira: i === 0 ? 1 : -1, ping: 0, municion: TORPEDOS, recarga: 0, delator: 0 };
  }

  function nuevaRonda() {
    superficie = H * 0.16;
    fondo = H * 0.9;
    for (const p of jug) {
      p.x = W * (p.i === 0 ? 0.12 : 0.88);
      p.y = (superficie + fondo) / 2;
      p.vx = p.vy = 0;
      p.vivo = true;
      p.ping = 0;
      p.municion = TORPEDOS;
      p.recarga = 0;
      p.delator = 0;
      p.mira = p.i === 0 ? 1 : -1;
    }
    pings.length = 0;
    ecos.length = 0;
    torpedos.length = 0;
    tocado = -1;
    pausa = 0;
  }

  function pingar(p) {
    if (p.ping > 0) return;
    p.ping = PING_RECARGA;
    p.delator = 1.8;
    pings.push({ x: p.x, y: p.y, r: 0, de: p.i, vida: 1 });
    audio.tone({ freq: 900, dur: 0.22, gain: 0.16, type: 'sine', sweep: -260 });
    audio.tone({ freq: 1400, dur: 0.1, gain: 0.08, type: 'sine', delay: 0.05 });
    haptics.tick(p.i);
  }

  function disparar(p) {
    if (p.recarga > 0 || p.municion <= 0) return;
    p.municion--;
    p.recarga = 1.1;
    torpedos.push({ x: p.x + p.mira * 24, y: p.y, vx: p.mira * TORPEDO_VEL, vy: 0, de: p.i, vida: 6 });
    audio.noise({ dur: 0.3, gain: 0.14, filter: 700, sweep: 900, type: 'bandpass', q: 3 });
    haptics.impact(p.i, 0.7);
  }

  function hundir(p) {
    if (!p.vivo || tocado >= 0) return;
    p.vivo = false;
    tocado = p.i;
    jug[1 - p.i].score++;
    sb.update(jug[0].score, jug[1].score);
    audio.explosion();
    haptics.explosion(p.i);
    ctx.shake(14);
    particles.burst(p.x, p.y, 34, { speed: 260, color: '#ffd166', size: 5, drag: 0.9 });
    for (let k = 0; k < 22; k++) {
      particles.spawn({ x: p.x + (rng() - 0.5) * 40, y: p.y, vx: (rng() - 0.5) * 40, vy: -60 - rng() * 90,
        life: 1.4, maxLife: 1.4, size: 4, color: '#9fd8ff', shape: 'circle', drag: 0.99 });
    }
    ui.toast(`${players[1 - p.i].name} lo hunde`, { ms: 1200, color: players[1 - p.i].color });
    pausa = 2;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: `ronda ${ronda} · a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; nuevaRonda(); },
    destroy() { sb?.remove(); },

    update(dt) {
      t += dt;
      particles.update(dt);

      if (pausa > 0) {
        pausa -= dt;
        if (pausa <= 0) {
          const g = jug.find((p) => p.score >= PARA_GANAR);
          if (g) { ctx.finish({ winner: g.i, scores: [jug[0].score, jug[1].score] }); return; }
          ronda++;
          sb.setCenter(`ronda ${ronda} · a ${PARA_GANAR}`);
          nuevaRonda();
        }
        return;
      }

      for (const p of jug) {
        if (!p.vivo) continue;
        const pl = input.player(p.i);
        p.ping = Math.max(0, p.ping - dt);
        p.recarga = Math.max(0, p.recarga - dt);
        p.delator = Math.max(0, p.delator - dt);

        const ex = pl.ax, ey = pl.ay;
        if (ex) { p.vx += ex * EMPUJE * dt; p.mira = ex > 0 ? 1 : -1; }
        if (ey) p.vy += ey * EMPUJE * 0.8 * dt;
        if (pl.pressed('a')) disparar(p);
        if (pl.pressed('b')) pingar(p);

        // El agua frena mucho: los submarinos derrapan poco y se posicionan.
        p.vx *= Math.pow(0.25, dt);
        p.vy *= Math.pow(0.25, dt);
        const v = Math.hypot(p.vx, p.vy);
        if (v > VEL_MAX) { p.vx *= VEL_MAX / v; p.vy *= VEL_MAX / v; }
        p.x = clamp(p.x + p.vx * dt, p.r, W - p.r);
        p.y = clamp(p.y + p.vy * dt, superficie + p.r, fondo - p.r);

        // Burbujas al moverse: rastro corto que también delata de cerca.
        if (v > 60 && rng() < dt * 14) {
          particles.spawn({ x: p.x - p.mira * 20, y: p.y + 4, vx: -p.mira * 20, vy: -50,
            life: 0.9, maxLife: 0.9, size: 3, color: '#9fd8ff88', shape: 'circle', drag: 0.99 });
        }
      }

      // Pings: al pasar el anillo por encima de un submarino, deja un eco.
      for (let i = pings.length - 1; i >= 0; i--) {
        const s = pings[i];
        const antes = s.r;
        s.r += PING_VEL * dt;
        s.vida -= dt * 0.55;
        for (const p of jug) {
          if (!p.vivo) continue;
          const d = Math.hypot(p.x - s.x, p.y - s.y);
          if (d > antes && d <= s.r) {
            ecos.push({ x: p.x, y: p.y, de: p.i, edad: 0 });
            if (p.i !== s.de) { audio.tone({ freq: 1500, dur: 0.09, gain: 0.14, type: 'sine' }); haptics.tick(s.de); }
          }
        }
        if (s.vida <= 0) pings.splice(i, 1);
      }
      for (let i = ecos.length - 1; i >= 0; i--) {
        ecos[i].edad += dt;
        if (ecos[i].edad > 4.5) ecos.splice(i, 1);
      }

      for (let i = torpedos.length - 1; i >= 0; i--) {
        const b = torpedos[i];
        b.vida -= dt;
        // Flotan un poco: a larga distancia el torpedo sube, y hay que contarlo.
        b.vy -= 22 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (rng() < dt * 30) {
          particles.spawn({ x: b.x, y: b.y, vx: 0, vy: -20, life: 0.7, maxLife: 0.7,
            size: 2.5, color: '#ffffff55', shape: 'circle' });
        }
        const o = jug[1 - b.de];
        if (o.vivo && Math.hypot(b.x - o.x, b.y - o.y) < o.r + 5) { hundir(o); torpedos.splice(i, 1); break; }
        if (b.vida <= 0 || b.x < -20 || b.x > W + 20 || b.y < superficie || b.y > fondo) {
          particles.burst(b.x, b.y, 8, { speed: 90, color: '#9fd8ff', size: 3, shape: 'circle' });
          torpedos.splice(i, 1);
        }
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#02060f');

      // Agua: degradado y unas motas para dar sensación de profundidad.
      const agua = g.createLinearGradient(0, superficie, 0, fondo);
      agua.addColorStop(0, '#0a2140');
      agua.addColorStop(1, '#020610');
      g.fillStyle = agua;
      g.fillRect(0, superficie, W, fondo - superficie);
      g.fillStyle = '#7fc7ff10';
      for (let i = 0; i < 40; i++) {
        const x = (i * 173) % W;
        const y = superficie + ((i * 97 + t * 12) % (fondo - superficie));
        g.fillRect(x, y, 2, 2);
      }

      // Superficie y fondo
      g.fillStyle = '#0d3357';
      g.fillRect(0, 0, W, superficie);
      g.strokeStyle = '#4aa8ff66';
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x <= W; x += 10) g.lineTo(x, superficie + Math.sin(x * 0.03 + t * 1.6) * 3);
      g.stroke();
      g.fillStyle = '#0b1a24';
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 24) g.lineTo(x, fondo + Math.sin(x * 0.012) * 12);
      g.lineTo(W, H);
      g.fill();

      // Anillos de sonar
      for (const s of pings) {
        g.save();
        g.globalAlpha = clamp(s.vida, 0, 1) * 0.6;
        g.strokeStyle = players[s.de].color;
        g.lineWidth = 2;
        g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.stroke();
        g.restore();
      }

      // Ecos: cruces que se apagan con la edad.
      for (const e of ecos) {
        const a = clamp(1 - e.edad / 4.5, 0, 1);
        g.save();
        g.globalAlpha = a;
        g.strokeStyle = players[e.de].color;
        g.lineWidth = 2;
        const s = 9;
        g.beginPath();
        g.moveTo(e.x - s, e.y - s); g.lineTo(e.x + s, e.y + s);
        g.moveTo(e.x + s, e.y - s); g.lineTo(e.x - s, e.y + s);
        g.stroke();
        g.globalAlpha = a * 0.5;
        ctx.engine.text(`${e.edad.toFixed(1)}s`, e.x, e.y - 18, { size: 9, color: players[e.de].color, font: 'system-ui' });
        g.restore();
      }

      particles.render(g);

      for (const b of torpedos) {
        ctx.engine.glowCircle(b.x, b.y, 4, '#ffd166', 14);
      }

      // El submarino propio siempre se ve; el rival solo mientras delata.
      for (const p of jug) {
        if (!p.vivo) continue;
        const visible = p.delator > 0;
        g.save();
        g.globalAlpha = visible ? 1 : 0.85;
        const col = players[p.i].color;
        g.save();
        g.translate(p.x, p.y);
        g.scale(p.mira, 1);
        g.shadowColor = col;
        g.shadowBlur = visible ? 28 : 12;
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(0, 0, 24, 11, 0, 0, TAU);
        g.fill();
        g.fillRect(-4, -18, 11, 10);       // torreta
        g.fillStyle = '#0a0a14';
        g.beginPath(); g.arc(11, -1, 4, 0, TAU); g.fill();
        g.restore();
        g.restore();

        // Munición y sonar: en la esquina de cada jugador.
        const x = p.i === 0 ? 16 : W - 16;
        const al = p.i === 0 ? 'left' : 'right';
        ctx.engine.text(`${'▮'.repeat(p.municion)}${'▯'.repeat(TORPEDOS - p.municion)}`, x, superficie + 22,
          { size: 13, color: players[p.i].color, align: al, font: 'system-ui' });
        ctx.engine.text(p.ping > 0 ? `sonar ${p.ping.toFixed(1)}s` : 'sonar listo', x, superficie + 40,
          { size: 10, color: p.ping > 0 ? '#5a6a80' : '#3effc8', align: al, font: 'system-ui' });
      }

      ctx.engine.text('Tu tecla de acción dispara · la especial hace ping (y te delata) · los ecos envejecen',
        W / 2, H - 12, { size: 11, color: '#4a5a70', font: 'system-ui' });
    },
  };
}
