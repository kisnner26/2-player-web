/**
 * Guerra de Almohadas — pelea boba sobre la cama.
 *
 * No hay barra de vida: hay PLUMAS. Cada almohadazo suelta plumas de la
 * almohada del otro, y cuando una se queda vacía, se revienta. También se
 * puede ganar tirando al rival de la cama, que es más humillante y por eso
 * vale doble.
 *
 * Las almohadas se recargan solas si te quedas quieto un momento, así que
 * machacar sin parar acaba dejándote sin munición.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const GRAV = 1900;
const VEL = 270;
const SALTO = 660;
const R = 22;
const PLUMAS_MAX = 12;
const GOLPE_ALCANCE = 78;
const GOLPE_DUR = 0.22;
const GOLPE_RECARGA = 0.34;
const PARA_GANAR = 3;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let camaX = 0, camaY = 0, camaW = 0, camaH = 0;
  const jug = [luchador(0), luchador(1)];
  let finRonda = 0, ronda = 1, sb = null;
  let plumasSueltas = [];

  function luchador(i) {
    return {
      i, x: 0, y: 0, vx: 0, vy: 0, enSuelo: false, score: 0,
      plumas: PLUMAS_MAX, golpe: 0, recarga: 0, mirando: i === 0 ? 1 : -1,
      aturdido: 0, quieto: 0, vivo: true,
    };
  }

  function medir() {
    camaW = Math.min(W * 0.72, 820);
    camaH = 26;
    camaX = (W - camaW) / 2;
    camaY = H * 0.72;
  }

  function nuevaRonda() {
    medir();
    for (let i = 0; i < 2; i++) {
      const p = jug[i];
      p.x = camaX + camaW * (i === 0 ? 0.25 : 0.75);
      p.y = camaY;
      p.vx = p.vy = 0;
      p.plumas = PLUMAS_MAX;
      p.golpe = 0; p.recarga = 0; p.aturdido = 0;
      p.vivo = true;
      p.enSuelo = true;
    }
    plumasSueltas = [];
    finRonda = 0;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: `ronda ${ronda} · a ${PARA_GANAR}` });
      ui.banner('Almohadazos · quien se queda sin plumas o cae, pierde');
    },
    resize(nw, nh) { W = nw; H = nh; nuevaRonda(); },

    update(dt) {
      if (finRonda > 0) {
        finRonda -= dt;
        moverPlumas(dt);
        particles.update(dt);
        if (finRonda <= 0) siguienteRonda();
        return;
      }

      for (const p of jug) {
        if (!p.vivo) continue;
        const pl = input.player(p.i);

        if (p.aturdido > 0) {
          p.aturdido -= dt;
        } else {
          const dx = pl.x;
          if (dx) { p.mirando = dx; p.quieto = 0; } else p.quieto += dt;
          p.vx += (dx * VEL - p.vx) * Math.min(1, dt * 14);

          if (pl.pressed('up') && p.enSuelo) {
            p.vy = -SALTO;
            p.enSuelo = false;
            p.quieto = 0;
            audio.jump();
            haptics.play('soft', { player: p.i });
          }
          if (pl.pressed('a') && p.recarga <= 0 && p.plumas > 0) {
            p.golpe = GOLPE_DUR;
            p.recarga = GOLPE_DUR + GOLPE_RECARGA;
            p.quieto = 0;
            audio.swoosh();
            haptics.play('tap', { player: p.i });
          }
        }

        // Las almohadas se rellenan si te estás quieto: castiga el machaque.
        if (p.quieto > 1.2 && p.plumas < PLUMAS_MAX) {
          p.plumas = Math.min(PLUMAS_MAX, p.plumas + dt * 2.2);
        }

        if (p.recarga > 0) p.recarga -= dt;
        if (p.golpe > 0) p.golpe -= dt;

        p.vy += GRAV * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Cama: solo se apoya encima de ella.
        if (p.vy >= 0 && p.x > camaX - R && p.x < camaX + camaW + R
            && p.y >= camaY && p.y - p.vy * dt <= camaY + 4) {
          p.y = camaY;
          p.vy = 0;
          p.enSuelo = true;
        } else if (p.y > camaY) {
          p.enSuelo = false;
        }

        // Caerse de la cama
        if (p.y > H + 60) caer(p);
        p.x = clamp(p.x, -60, W + 60);
      }

      resolverGolpes();
      moverPlumas(dt);
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#1a1024');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#2a1838');
      grd.addColorStop(1, '#140a1c');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // Cabecero
      g.fillStyle = '#3d2450';
      g.fillRect(camaX - 24, camaY - 150, 20, 150);
      g.fillRect(camaX + camaW + 4, camaY - 150, 20, 150);

      // Colchón
      g.fillStyle = '#f0e6ee';
      g.fillRect(camaX, camaY, camaW, camaH);
      g.fillStyle = '#d8c8d6';
      g.fillRect(camaX, camaY + camaH - 8, camaW, 8);
      g.fillStyle = '#c9b4c6';
      g.fillRect(camaX, camaY + camaH, camaW, 16);
      // Rayas de la sábana
      g.strokeStyle = '#dccfdb';
      g.lineWidth = 2;
      for (let x = camaX + 30; x < camaX + camaW; x += 46) {
        g.beginPath(); g.moveTo(x, camaY); g.lineTo(x, camaY + camaH); g.stroke();
      }

      // Plumas flotando
      for (const f of plumasSueltas) {
        g.save();
        g.globalAlpha = clamp(f.vida / 2.4, 0, 1) * 0.9;
        g.translate(f.x, f.y);
        g.rotate(f.rot);
        g.fillStyle = '#fff';
        g.beginPath();
        g.ellipse(0, 0, 7, 3, 0, 0, TAU);
        g.fill();
        g.restore();
      }

      particles.render(g);

      // Luchadores
      for (const p of jug) {
        if (!p.vivo) continue;
        const col = players[p.i].color;
        g.save();
        if (p.aturdido > 0) g.globalAlpha = 0.55 + Math.sin(ctx.engine.time * 22) * 0.3;

        // Almohada (arma)
        const ext = p.golpe > 0 ? GOLPE_ALCANCE : GOLPE_ALCANCE * 0.45;
        const ang = p.golpe > 0 ? -0.5 + (1 - p.golpe / GOLPE_DUR) * 1.5 : -0.7;
        g.save();
        g.translate(p.x, p.y - R * 1.3);
        g.rotate(p.mirando > 0 ? ang : Math.PI - ang);
        g.fillStyle = '#fdfbff';
        g.shadowColor = '#fff';
        g.shadowBlur = p.golpe > 0 ? 18 : 6;
        g.beginPath();
        g.roundRect(ext * 0.45, -16, 46, 32, 12);
        g.fill();
        g.restore();

        // Cuerpo
        g.shadowColor = col;
        g.shadowBlur = 16;
        g.fillStyle = col;
        g.beginPath();
        g.arc(p.x, p.y - R, R, 0, TAU);
        g.fill();
        g.shadowBlur = 0;
        // Cara
        g.fillStyle = '#00000099';
        const ex = p.x + p.mirando * 7;
        g.beginPath(); g.arc(ex - 4, p.y - R - 4, 3, 0, TAU); g.fill();
        g.beginPath(); g.arc(ex + 4, p.y - R - 4, 3, 0, TAU); g.fill();
        g.strokeStyle = '#00000099';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(ex, p.y - R + 4, 5, 0.15 * Math.PI, 0.85 * Math.PI);
        g.stroke();
        g.restore();

        // Plumas restantes
        const bw = 54;
        g.fillStyle = '#00000066';
        g.fillRect(p.x - bw / 2, p.y - R * 2 - 22, bw, 7);
        g.fillStyle = p.plumas > 4 ? '#fff' : '#ff6ec7';
        g.fillRect(p.x - bw / 2, p.y - R * 2 - 22, bw * (p.plumas / PLUMAS_MAX), 7);
      }

      // Marcador de plumas por jugador
      for (let i = 0; i < 2; i++) {
        ctx.engine.text(`${Math.ceil(jug[i].plumas)} plumas`, i === 0 ? 18 : W - 18, H - 22, {
          size: 11, color: players[i].color, align: i === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function resolverGolpes() {
    for (const atacante of jug) {
      if (!atacante.vivo || atacante.golpe <= 0) continue;
      const v = jug[1 - atacante.i];
      if (!v.vivo || v.aturdido > 0) continue;

      const px = atacante.x + atacante.mirando * GOLPE_ALCANCE;
      const py = atacante.y - R * 1.3;
      if (Math.hypot(v.x - px, v.y - R - py) > R + 30) continue;

      atacante.golpe = 0;
      atacante.plumas = Math.max(0, atacante.plumas - 1);
      v.plumas = Math.max(0, v.plumas - 1);
      v.aturdido = 0.32;
      v.vx = atacante.mirando * 430;
      v.vy = -260;

      audio.thud();
      haptics.impact(atacante.i, 1.1);
      haptics.play('soft', { player: v.i });
      ctx.shake(9);
      soltarPlumas(v.x, v.y - R, 8);
      particles.burst(v.x, v.y - R, 10, { speed: 200, color: players[v.i].color, size: 4 });

      if (v.plumas <= 0) reventar(v);
      else if (atacante.plumas <= 0) reventar(atacante);
    }
  }

  function soltarPlumas(x, y, n) {
    for (let k = 0; k < n; k++) {
      plumasSueltas.push({
        x, y,
        vx: (rng() - 0.5) * 220,
        vy: -60 - rng() * 130,
        rot: rng() * TAU,
        vr: (rng() - 0.5) * 6,
        vida: 2.4,
      });
    }
  }

  function moverPlumas(dt) {
    for (let i = plumasSueltas.length - 1; i >= 0; i--) {
      const f = plumasSueltas[i];
      f.vida -= dt;
      if (f.vida <= 0) { plumasSueltas.splice(i, 1); continue; }
      // Caída con revoloteo: las plumas no caen rectas.
      f.vy += 130 * dt;
      f.vy *= 0.97;
      f.vx += Math.sin(f.vida * 6 + f.rot) * 22 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
    }
  }

  function reventar(p) {
    if (!p.vivo || finRonda > 0) return;
    p.vivo = false;
    audio.explosion();
    haptics.explosion(p.i);
    ctx.shake(16);
    soltarPlumas(p.x, p.y - R, 26);
    particles.burst(p.x, p.y - R, 26, { speed: 240, color: players[p.i].color, size: 5 });
    ui.toast('¡Se reventó la almohada!', { ms: 1400, color: players[p.i].color });
    puntoPara(1 - p.i, 1);
  }

  function caer(p) {
    if (!p.vivo || finRonda > 0) return;
    p.vivo = false;
    audio.lose();
    haptics.defeat(p.i);
    ui.toast(`${players[p.i].name} se cayó de la cama · ¡doble!`, { ms: 1600, color: players[1 - p.i].color });
    puntoPara(1 - p.i, 2);
  }

  function puntoPara(quien, cuantos) {
    jug[quien].score += cuantos;
    sb.update(jug[0].score, jug[1].score);
    audio.score(quien);
    haptics.score(quien);
    finRonda = 1.7;
  }

  function siguienteRonda() {
    const g = jug.find((p) => p.score >= PARA_GANAR);
    if (g) {
      ctx.finish({
        winner: g.i,
        scores: [jug[0].score, jug[1].score],
        detail: `${ronda} asaltos de almohada`,
      });
      return;
    }
    ronda++;
    sb.setCenter(`ronda ${ronda} · a ${PARA_GANAR}`);
    nuevaRonda();
  }
}
