/**
 * Azotea — dos tipos con muy mala puntería en dos tejados separados por el vacío.
 *
 * El arma no está para matar: está para EMPUJAR. Cada disparo te lanza hacia
 * atrás por el retroceso y lanza al rival si le da, así que el duelo se gana
 * midiendo dónde estás parado, no apuntando. Disparar de espaldas al abismo es
 * suicidio, y disparar con el rival ya al borde es el remate.
 *
 * No hay puntería manual a propósito: la bala sale con un ángulo aleatorio
 * dentro de un cono. Es lo que hace que ninguna ronda se parezca a la anterior.
 */

import { TAU, clamp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe, pasoAnimado } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 5;
const GRAVEDAD = 1900;
const RETROCESO = 520;
const IMPACTO = 760;
const RECARGA = 0.85;
const SALTO = 700;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  const tejado = [{ x: 0, an: 0, y: 0 }, { x: 0, an: 0, y: 0 }];
  const jug = [crear(0), crear(1)];
  const balas = [];
  let sb = null, ronda = 1, pausa = 0, cayo = -1;

  function crear(i) {
    return { i, x: 0, y: 0, vx: 0, vy: 0, suelo: true, score: 0, recarga: 0,
             mira: i === 0 ? 1 : -1, fase: 0, sacudida: 0, vivo: true };
  }

  function nuevaRonda() {
    const anchoT = Math.min(W * 0.34, 320);
    const alturaA = H * 0.66, alturaB = H * 0.60;
    tejado[0] = { x: W * 0.06, an: anchoT, y: alturaA };
    tejado[1] = { x: W - W * 0.06 - anchoT, an: anchoT, y: alturaB };
    for (const p of jug) {
      const t = tejado[p.i];
      p.x = t.x + t.an * (p.i === 0 ? 0.35 : 0.65);
      p.y = t.y;
      p.vx = p.vy = 0;
      p.suelo = true;
      p.vivo = true;
      p.recarga = 0;
      p.mira = p.i === 0 ? 1 : -1;
    }
    balas.length = 0;
    cayo = -1;
    pausa = 0;
  }

  /** Tejado bajo unas coordenadas, o null si ahí solo hay aire. */
  function tejadoBajo(x) {
    for (const t of tejado) if (x > t.x && x < t.x + t.an) return t;
    return null;
  }

  function disparar(p) {
    if (p.recarga > 0 || !p.vivo) return;
    p.recarga = RECARGA;
    // Cono de dispersión: hacia donde miras, con la mano temblorosa.
    const base = p.mira > 0 ? 0 : Math.PI;
    const ang = base + (rng() - 0.5) * 0.55 - 0.12;
    balas.push({ x: p.x + p.mira * 20, y: p.y - 40, vx: Math.cos(ang) * 900, vy: Math.sin(ang) * 900, de: p.i, vida: 2.2 });
    p.vx -= p.mira * RETROCESO;
    p.vy -= 130;
    p.suelo = false;
    p.sacudida = 0.22;
    audio.laser();
    haptics.impact(p.i, 0.8);
    ctx.shake(5);
    particles.burst(p.x + p.mira * 26, p.y - 40, 10, {
      speed: 320, dir: ang, spread: 0.7, color: '#ffd166', size: 3, shape: 'spark', drag: 0.88,
    });
  }

  function derribar(p) {
    if (!p.vivo || cayo >= 0) return;
    p.vivo = false;
    cayo = p.i;
    jug[1 - p.i].score++;
    sb.update(jug[0].score, jug[1].score);
    audio.lose();
    haptics.defeat(p.i);
    ctx.shake(10);
    ui.toast(`${players[1 - p.i].name} lo tira del tejado`, { ms: 1100, color: players[1 - p.i].color });
    pausa = 1.5;
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
      particles.update(dt);

      if (pausa > 0) {
        pausa -= dt;
        for (const p of jug) fisica(p, dt);
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
        const pl = input.player(p.i);
        p.recarga = Math.max(0, p.recarga - dt);
        p.sacudida = Math.max(0, p.sacudida - dt);

        // Movimiento voluntario mínimo: el juego es el retroceso, no andar.
        if (p.suelo) {
          const eje = pl.ax;
          if (eje) { p.vx += eje * 900 * dt; p.mira = eje > 0 ? 1 : -1; }
          if (pl.pressed('up') || pl.pressed('b')) {
            p.vy = -SALTO; p.suelo = false; audio.jump(); haptics.tap(p.i);
          }
        }
        if (pl.pressed('a')) disparar(p);

        fisica(p, dt);
        if (p.vivo && p.y > H + 60) derribar(p);
      }

      for (let i = balas.length - 1; i >= 0; i--) {
        const b = balas[i];
        b.vy += 420 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vida -= dt;
        particles.spawn({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.16, maxLife: 0.16, size: 3, color: '#ffd166' });

        const o = jug[1 - b.de];
        if (o.vivo && Math.abs(b.x - o.x) < 22 && b.y > o.y - 66 && b.y < o.y - 4) {
          o.vx += Math.sign(b.vx) * IMPACTO;
          o.vy -= 300;
          o.suelo = false;
          o.sacudida = 0.3;
          audio.hit();
          haptics.impact(o.i, 1.3);
          ctx.shake(9);
          particles.burst(b.x, b.y, 18, { speed: 300, dir: Math.atan2(b.vy, b.vx), spread: 1.8,
            color: players[o.i].color, size: 4, shape: 'spark', drag: 0.9 });
          balas.splice(i, 1);
          continue;
        }
        if (b.vida <= 0 || b.y > H + 40 || b.x < -60 || b.x > W + 60) balas.splice(i, 1);
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0b0a18');

      // Ciudad de noche detrás: siluetas y ventanas encendidas.
      const t = ctx.engine.time;
      for (let i = 0; i < 14; i++) {
        const bx = (i * W) / 14;
        const bh = H * (0.22 + ((i * 37) % 11) / 40);
        g.fillStyle = '#141024';
        g.fillRect(bx, H - bh, W / 14 - 6, bh);
        g.fillStyle = '#2d2450';
        for (let k = 0; k < 5; k++) {
          if (((i * 7 + k * 13) % 5) === 0) continue;
          g.fillRect(bx + 8 + (k % 3) * 14, H - bh + 14 + Math.floor(k / 3) * 22, 7, 9);
        }
      }
      // Luna
      ctx.engine.glowCircle(W * 0.82, H * 0.16, 26, '#f6f0d8', 40);

      for (const [i, tj] of tejado.entries()) {
        g.fillStyle = '#1b1530';
        g.fillRect(tj.x, tj.y, tj.an, H - tj.y);
        ctx.engine.glowRect(tj.x, tj.y - 5, tj.an, 5, players[i].color, 16);
        g.fillStyle = '#ffffff08';
        for (let x = tj.x; x < tj.x + tj.an; x += 26) g.fillRect(x, tj.y + 8, 3, H - tj.y);
      }

      particles.render(g);

      for (const b of balas) {
        g.save();
        g.strokeStyle = '#ffd166';
        g.lineWidth = 3;
        g.shadowColor = '#ffd166';
        g.shadowBlur = 12;
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014); g.stroke();
        g.restore();
      }

      for (const p of jug) {
        const col = players[p.i].color;
        const sx = p.sacudida > 0 ? (rng() - 0.5) * p.sacudida * 26 : 0;
        const anim = pasoAnimado(p, { vx: p.vx, suelo: p.suelo, dt: 1 / 60 });
        g.save();
        g.globalAlpha = p.vivo ? 1 : 0.75;
        dibujarPersonaje(g, personajeDe(players[p.i], p.i), p.x + sx, p.y, 70, {
          ...anim, mirando: p.mira, acento: col, brillo: p.recarga > RECARGA * 0.75 ? 22 : 0,
        });
        g.restore();

        // Escopeta: una barra que apunta y se recoge al recargar.
        const listo = p.recarga <= 0;
        g.save();
        g.translate(p.x + sx, p.y - 40);
        g.rotate(p.mira > 0 ? -0.1 : Math.PI + 0.1);
        g.fillStyle = listo ? '#e8e4ff' : '#5b5570';
        g.fillRect(0, -3, 30, 6);
        g.restore();

        // Barra de recarga bajo los pies: se lee de reojo sin dejar de mirar.
        if (!listo) {
          g.fillStyle = '#00000088';
          g.fillRect(p.x - 20, p.y + 6, 40, 4);
          g.fillStyle = col;
          g.fillRect(p.x - 20, p.y + 6, 40 * (1 - p.recarga / RECARGA), 4);
        }
      }

      ctx.engine.text('Disparar te empuja hacia atrás · el que caiga al vacío pierde el punto',
        W / 2, H - 16, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };

  function fisica(p, dt) {
    p.vy += GRAVEDAD * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(p.suelo ? 0.02 : 0.55, dt);

    const t = tejadoBajo(p.x);
    if (t && p.y >= t.y && p.vy >= 0 && p.y < t.y + 44) {
      p.y = t.y;
      p.vy = 0;
      if (!p.suelo) { audio.tick(); particles.burst(p.x, p.y, 6, { speed: 90, dir: -Math.PI / 2, spread: 2, color: '#ffffff55', size: 3 }); }
      p.suelo = true;
    } else {
      p.suelo = false;
    }
    p.x = clamp(p.x, -80, W + 80);
  }
}
