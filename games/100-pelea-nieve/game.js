/**
 * Pelea de Nieve — bolas de nieve, parapetos y frío.
 *
 * Reglas simples de leer en tres segundos: te mueves, agachas y lanzas. Las
 * bolas vuelan en arco, así que hay que calcular un poco; agacharse esquiva
 * lo que viene alto y los muretes paran lo que viene bajo.
 *
 * El detalle que le da fondo: no tienes munición infinita. Agacharte junto a
 * la nieve del suelo te recarga, y recargar te deja quieto. Quien dispara
 * todo de golpe se queda vendido.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const VIDAS = 5;
const MAX_BOLAS = 5;
const GRAV = 620;
const VEL = 195;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let suelo = 0;
  let bolas = [];
  let muros = [];
  let copos = [];
  let estado = 'jugando';
  let pausa = 0;
  let aviso = '', avisoT = 0;
  let tiempo = 0;

  const jug = [crear(0), crear(1)];

  function crear(i) {
    return {
      i, x: 0, y: 0, vy: 0,
      mira: i === 0 ? 1 : -1,
      vidas: VIDAS, bolas: MAX_BOLAS,
      agachado: false, recargando: 0, cadencia: 0,
      invul: 0, aciertos: 0,
    };
  }

  function medir() {
    suelo = H * 0.78;
    jug[0].x = jug[0].x || W * 0.18;
    jug[1].x = jug[1].x || W * 0.82;
    muros = [
      { x: W * 0.36, w: 26, h: 62 },
      { x: W * 0.64, w: 26, h: 62 },
    ];
  }

  function reset() {
    jug[0] = crear(0); jug[1] = crear(1);
    jug[0].x = W * 0.18; jug[1].x = W * 0.82;
    jug[0].y = jug[1].y = suelo;
    bolas = [];
    copos = Array.from({ length: 60 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      v: 18 + Math.random() * 34, s: 1 + Math.random() * 2,
      d: Math.random() * Math.PI * 2,
    }));
    estado = 'jugando';
  }

  const decir = (t) => { aviso = t; avisoT = 2; };
  const altura = (p) => (p.agachado ? 34 : 58);

  function lanzar(p) {
    if (p.bolas <= 0 || p.cadencia > 0 || p.recargando > 0) return;
    p.bolas--;
    p.cadencia = 0.34;
    bolas.push({
      x: p.x + p.mira * 18,
      y: p.y - altura(p) * 0.82,
      vx: p.mira * 330,
      vy: p.agachado ? -110 : -175,
      de: p.i, vida: 4,
    });
    audio.tone({ freq: 380, dur: 0.06, gain: 0.11, type: 'triangle', sweep: -140 });
    haptics.play('tap', { player: p.i });
  }

  function golpear(p, bola) {
    if (p.invul > 0) return;
    p.vidas--;
    p.invul = 1;
    jug[bola.de].aciertos++;
    particles.burst(bola.x, bola.y, 20, {
      speed: 200, dir: bola.vx > 0 ? 0 : Math.PI, spread: 1.7,
      color: '#ffffff', size: 3, shape: 'spark', drag: 0.92,
    });
    audio.explosion();
    haptics.explosion(p.i);
    ctx.shake(5, 6);
    decir(`${players[bola.de].name} acierta · a ${players[p.i].name} le quedan ${p.vidas}`);
    if (p.vidas <= 0) { estado = 'fin'; pausa = 1.6; }
  }

  function controlar(p, dt) {
    const ip = input.player(p.i);
    if (p.cadencia > 0) p.cadencia -= dt;
    if (p.invul > 0) p.invul -= dt;

    p.agachado = ip.held('down');

    // Recargar: agachado y quieto con el botón secundario
    if (ip.held('b') && p.agachado) {
      p.recargando += dt;
      if (p.recargando >= 0.55) {
        p.recargando = 0;
        p.bolas = Math.min(MAX_BOLAS, p.bolas + 1);
        audio.tone({ freq: 560, dur: 0.07, gain: 0.09, type: 'sine' });
      }
    } else p.recargando = 0;

    const dx = (ip.held('right') ? 1 : 0) - (ip.held('left') ? 1 : 0);
    if (dx) p.mira = dx;
    const vel = VEL * (p.agachado ? 0.42 : 1);
    p.x = clamp(p.x + dx * vel * dt, 26, W - 26);

    if (ip.pressed('a')) lanzar(p);
  }

  function moverBolas(dt) {
    for (let i = bolas.length - 1; i >= 0; i--) {
      const b = bolas[i];
      b.vy += GRAV * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vida -= dt;

      // Rastro
      if (Math.random() < 0.5) {
        particles.burst(b.x, b.y, 1, { speed: 12, dir: 0, spread: 6.2, color: '#ffffff66', size: 1.6, drag: 0.94 });
      }

      // Muretes: paran lo que viene por debajo de su altura
      let chocoMuro = false;
      for (const m of muros) {
        if (Math.abs(b.x - m.x) < m.w / 2 && b.y > suelo - m.h) { chocoMuro = true; break; }
      }
      if (chocoMuro) {
        particles.burst(b.x, b.y, 10, { speed: 130, dir: -Math.PI / 2, spread: 2.4, color: '#dfefff', size: 2.2, drag: 0.91 });
        audio.tone({ freq: 190, dur: 0.05, gain: 0.07, type: 'square' });
        bolas.splice(i, 1);
        continue;
      }

      // Impacto en el rival
      const obj = jug[1 - b.de];
      const h = altura(obj);
      if (Math.abs(b.x - obj.x) < 17 && b.y > obj.y - h && b.y < obj.y + 4) {
        golpear(obj, b);
        bolas.splice(i, 1);
        continue;
      }

      if (b.y > suelo || b.x < -20 || b.x > W + 20 || b.vida <= 0) {
        if (b.y > suelo) {
          particles.burst(b.x, suelo, 8, { speed: 110, dir: -Math.PI / 2, spread: 1.9, color: '#eaf4ff', size: 2, drag: 0.91 });
        }
        bolas.splice(i, 1);
      }
    }
  }

  function dibujarJugador(g, p) {
    const h = altura(p);
    const col = players[p.i].color;
    g.save();
    if (p.invul > 0) g.globalAlpha = 0.45 + Math.sin(tiempo * 26) * 0.35;

    // Sombra
    g.fillStyle = '#00000044';
    g.beginPath(); g.ellipse(p.x, suelo + 2, 18, 5, 0, 0, Math.PI * 2); g.fill();

    g.shadowColor = col; g.shadowBlur = 12;
    g.fillStyle = col;
    if (g.roundRect) { g.beginPath(); g.roundRect(p.x - 14, p.y - h, 28, h, 7); g.fill(); }
    else g.fillRect(p.x - 14, p.y - h, 28, h);
    g.shadowBlur = 0;

    // Gorro y cara
    g.fillStyle = '#f4f8ff';
    g.beginPath(); g.arc(p.x, p.y - h - 4, 11, Math.PI, 0); g.fill();
    g.fillStyle = '#0a0a12';
    g.beginPath(); g.arc(p.x + p.mira * 4, p.y - h + 8, 2.4, 0, Math.PI * 2); g.fill();

    // Bola en la mano si tiene munición
    if (p.bolas > 0) {
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(p.x + p.mira * 17, p.y - h * 0.62, 5, 0, Math.PI * 2); g.fill();
    }
    if (p.recargando > 0) {
      g.fillStyle = '#6fd0f0';
      g.fillRect(p.x - 12, p.y - h - 16, 24 * (p.recargando / 0.55), 3);
    }
    g.restore();
  }

  return {
    init() { medir(); reset(); },
    resize(w, h) { W = w; H = h; medir(); jug[0].y = jug[1].y = suelo; },

    update(dt) {
      tiempo += dt;
      if (avisoT > 0) avisoT -= dt;

      for (const c of copos) {
        c.y += c.v * dt; c.x += Math.sin(tiempo + c.d) * 8 * dt;
        if (c.y > H) { c.y = -4; c.x = Math.random() * W; }
      }

      if (estado === 'fin') {
        pausa -= dt;
        moverBolas(dt); particles.update(dt);
        if (pausa <= 0) {
          const g = jug[0].vidas > 0 ? 0 : 1;
          ctx.finish({
            winner: g,
            scores: [jug[0].aciertos, jug[1].aciertos],
            detail: `${players[g].name} aguantó con ${jug[g].vidas} vida(s)`,
            record: ctx.record('aciertos', Math.max(jug[0].aciertos, jug[1].aciertos), 'high'),
          });
        }
        return;
      }

      for (const p of jug) { p.y = suelo; controlar(p, dt); }
      moverBolas(dt);
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a1420');

      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#16273c'); grd.addColorStop(1, '#0a1420');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);

      // Nieve de fondo
      g.fillStyle = '#ffffff';
      for (const c of copos) {
        g.globalAlpha = 0.35;
        g.beginPath(); g.arc(c.x, c.y, c.s, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;

      // Suelo nevado
      g.fillStyle = '#e8f2ff';
      g.fillRect(0, suelo, W, H - suelo);
      g.fillStyle = '#cfe2f5';
      g.fillRect(0, suelo, W, 5);

      // Muretes
      for (const m of muros) {
        g.fillStyle = '#dce9f7';
        if (g.roundRect) { g.beginPath(); g.roundRect(m.x - m.w / 2, suelo - m.h, m.w, m.h, 5); g.fill(); }
        else g.fillRect(m.x - m.w / 2, suelo - m.h, m.w, m.h);
        g.fillStyle = '#ffffff';
        g.fillRect(m.x - m.w / 2, suelo - m.h, m.w, 5);
      }

      particles.render(g);

      // Bolas
      for (const b of bolas) {
        g.save();
        g.shadowColor = '#ffffff'; g.shadowBlur = 10;
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(b.x, b.y, 6, 0, Math.PI * 2); g.fill();
        g.restore();
      }

      for (const p of jug) dibujarJugador(g, p);

      // HUD: vidas y munición
      for (let i = 0; i < 2; i++) {
        const p = jug[i];
        const x = i === 0 ? 18 : W - 18;
        const al = i === 0 ? 'left' : 'right';
        ctx.engine.text(players[i].name, x, 24, { size: 12.5, color: players[i].color, align: al, font: 'system-ui' });
        for (let k = 0; k < VIDAS; k++) {
          const bx = i === 0 ? 18 + k * 15 : W - 24 - k * 15;
          g.fillStyle = k < p.vidas ? players[i].color : '#ffffff22';
          g.beginPath(); g.arc(bx + 5, 40, 5, 0, Math.PI * 2); g.fill();
        }
        for (let k = 0; k < MAX_BOLAS; k++) {
          const bx = i === 0 ? 18 + k * 13 : W - 22 - k * 13;
          g.fillStyle = k < p.bolas ? '#ffffff' : '#ffffff26';
          g.beginPath(); g.arc(bx + 4, 58, 4, 0, Math.PI * 2); g.fill();
        }
      }

      if (avisoT > 0) ctx.engine.text(aviso, W / 2, 30, { size: 12.5, color: '#ffd166', font: 'system-ui' });
      ctx.engine.text('←/→ moverse · ↓ agacharse · A lanzar · agachado + B para recargar',
        W / 2, H - 12, { size: 10.5, color: '#ffffff66', font: 'system-ui' });
    },

    destroy() {},
  };
}
