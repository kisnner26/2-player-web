/**
 * Barca a Dos Remos — cada uno lleva un remo, y un remo solo hace círculos.
 *
 * Una palada empuja la barca y la GIRA hacia el lado contrario. Con esto, la
 * línea recta no es una decisión de nadie: es la consecuencia de alternar. Si
 * uno rema el doble, la barca se va describiendo una curva perfecta hacia el
 * lado del otro y no hay timón con el que arreglarlo.
 *
 * El río empuja, se estrecha y tiene piedras. La corriente ayuda en el centro
 * y castiga en las orillas, así que la trazada buena es la del medio.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const META = 1000;             // metros de río
const GOLPES_MAX = 4;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  const barca = { x: 0, s: 0, vel: 26, ang: 0 };
  let piedras = [], meandros = [];
  let paladas = [0, 0], golpes = 0, tiempo = 0;
  let sb = null, terminado = false, chapoteo = [0, 0];

  const ANCHO_RIO = () => Math.min(W * 0.62, 460);

  function reiniciar() {
    barca.x = 0; barca.s = 0; barca.vel = 26; barca.ang = 0;
    meandros = [];
    for (let m = 60; m < META; m += 120 + rng() * 110) {
      meandros.push({ m, amp: (rng() * 2 - 1) * ANCHO_RIO() * 0.32, largo: 90 + rng() * 70 });
    }
    piedras = [];
    for (let m = 120; m < META; m += 55 + rng() * 70) {
      piedras.push({ m, x: (rng() * 2 - 1) * ANCHO_RIO() * 0.42, r: 16 + rng() * 18 });
    }
    paladas = [0, 0]; golpes = 0; tiempo = 0;
    terminado = false;
  }

  /** Eje del río en un punto del recorrido. */
  function eje(m) {
    let c = 0;
    for (const k of meandros) {
      const d = m - k.m;
      if (Math.abs(d) < k.largo) c += k.amp * Math.cos((d / k.largo) * Math.PI / 2);
    }
    return c;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Cada uno su remo · alternen las paladas o la barca gira');
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo += dt;
      chapoteo[0] = Math.max(0, chapoteo[0] - dt * 4);
      chapoteo[1] = Math.max(0, chapoteo[1] - dt * 4);

      for (let i = 0; i < 2; i++) {
        if (!input.player(i).pressed('a')) continue;
        paladas[i]++;
        chapoteo[i] = 1;
        barca.vel += 22;
        // El remo de babor (P1) empuja la proa a estribor, y al contrario.
        barca.ang += (i === 0 ? 1 : -1) * 0.2;
        audio.noise({ dur: 0.14, gain: 0.12, filter: 900, sweep: -400 });
        haptics.play('tap', { player: i });
        const px = W / 2 + (i === 0 ? -34 : 34);
        particles.burst(px, H * 0.74, 5, { speed: 90, color: '#bfeaea', size: 3, gravity: 160 });
      }

      barca.ang = clamp(barca.ang, -1.1, 1.1);
      barca.vel = Math.max(0, barca.vel - (6 + barca.vel * 0.5) * dt);

      // La corriente arrastra siempre un poco y es más fuerte en el centro.
      const centro = eje(barca.s);
      const fueraDelCentro = Math.abs(barca.x - centro) / (ANCHO_RIO() / 2);
      const corriente = 20 * (1 - fueraDelCentro * 0.65);

      barca.s += (barca.vel + corriente) * dt * 0.1;
      barca.x += Math.sin(barca.ang) * (barca.vel + corriente) * dt * 0.55;
      // La barca se endereza sola muy despacio: no es un timón, es la quilla.
      barca.ang *= Math.pow(0.55, dt);

      const half = ANCHO_RIO() / 2;
      if (Math.abs(barca.x - centro) > half - 20) {
        barca.x = centro + Math.sign(barca.x - centro) * (half - 20);
        barca.vel *= 0.5;
        if (rng() < dt * 5) audio.tone({ freq: 120, dur: 0.08, gain: 0.09, type: 'sawtooth' });
      }

      for (const p of piedras) {
        if (p.frio > 0) { p.frio -= dt; continue; }
        if (Math.abs(p.m - barca.s) > 3) continue;
        if (Math.abs((eje(p.m) + p.x) - barca.x) > p.r + 20) continue;
        p.frio = 2;
        golpes++;
        barca.vel *= 0.2;
        barca.ang += (rng() - 0.5) * 1.4;
        audio.thud();
        haptics.impact(null, 1);
        ctx.shake(13);
        particles.burst(W / 2, H * 0.7, 16, { speed: 200, color: '#bfeaea', size: 4, gravity: 260 });
        ui.toast(golpes >= GOLPES_MAX ? '¡La barca se rompe!' : `Piedra ${golpes}/${GOLPES_MAX}`, {
          ms: 1000, color: '#ff4757',
        });
      }

      sb.update(paladas[0], paladas[1]);
      sb.setCenter(`${Math.round(barca.s)} / ${META} m · ${Math.round(barca.vel)} de ritmo`);

      if (barca.s >= META) return terminar(true);
      if (golpes >= GOLPES_MAX) return terminar(false);

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a1a1c');

      // Orillas
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#1f3a2a');
      bg.addColorStop(1, '#14261c');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      const half = ANCHO_RIO() / 2;
      const cx = W / 2;
      const horizonte = H * 0.3;

      // El río, en franjas, con su meandro
      for (let k = 0; k < 34; k++) {
        const t0 = k / 34, t1 = (k + 1) / 34;
        const m0 = barca.s + t0 * 80, m1 = barca.s + t1 * 80;
        const y0 = H * 0.95 - (H * 0.95 - horizonte) * t0;
        const y1 = H * 0.95 - (H * 0.95 - horizonte) * t1;
        const e0 = 1 - t0 * 0.8, e1 = 1 - t1 * 0.8;
        const c0 = (eje(m0) - barca.x) * e0, c1 = (eje(m1) - barca.x) * e1;
        g.fillStyle = k % 2 ? '#1d4a5c' : '#20536a';
        g.beginPath();
        g.moveTo(cx + c0 - half * e0, y0);
        g.lineTo(cx + c0 + half * e0, y0);
        g.lineTo(cx + c1 + half * e1, y1);
        g.lineTo(cx + c1 - half * e1, y1);
        g.closePath(); g.fill();
      }

      // Reflejos de la corriente
      g.save();
      g.globalAlpha = 0.25;
      g.strokeStyle = '#bfeaea';
      g.lineWidth = 2;
      for (let k = 0; k < 9; k++) {
        const t = ((k / 9) + (tiempo * 0.35) % (1 / 9)) % 1;
        const y = H * 0.95 - (H * 0.95 - horizonte) * t;
        const e = 1 - t * 0.8;
        const c = (eje(barca.s + t * 80) - barca.x) * e;
        g.beginPath();
        g.moveTo(cx + c - half * e * 0.6, y);
        g.lineTo(cx + c + half * e * 0.6, y);
        g.stroke();
      }
      g.restore();

      // Piedras
      for (const p of piedras) {
        const d = p.m - barca.s;
        if (d < -6 || d > 80) continue;
        const t = clamp(d / 80, 0, 1);
        const y = H * 0.95 - (H * 0.95 - horizonte) * t;
        const e = 1 - t * 0.8;
        const x = cx + ((eje(p.m) + p.x) - barca.x) * e;
        g.save();
        g.fillStyle = p.frio > 0 ? '#ff4757' : '#6b6b74';
        g.beginPath(); g.ellipse(x, y, p.r * e, p.r * e * 0.62, 0, 0, TAU); g.fill();
        g.fillStyle = '#ffffff33';
        g.beginPath(); g.ellipse(x - p.r * e * 0.3, y - p.r * e * 0.2, p.r * e * 0.3, p.r * e * 0.2, 0, 0, TAU); g.fill();
        g.restore();
      }

      particles.render(g);

      // La barca
      g.save();
      g.translate(cx, H * 0.78);
      g.rotate(barca.ang * 0.6);
      g.fillStyle = '#8a6a44';
      g.beginPath();
      g.moveTo(0, -46); g.quadraticCurveTo(26, 0, 0, 44); g.quadraticCurveTo(-26, 0, 0, -46);
      g.fill();
      g.strokeStyle = '#6b5232';
      g.lineWidth = 3;
      g.stroke();
      // Remos: se levantan al dar la palada.
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? -1 : 1;
        g.save();
        g.strokeStyle = players[i].color;
        g.lineWidth = 5;
        g.rotate(s * (0.5 + chapoteo[i] * 0.5));
        g.beginPath(); g.moveTo(0, 0); g.lineTo(s * 52, 14); g.stroke();
        g.restore();
        ctx.engine.glowCircle(s * 12, i === 0 ? -6 : 14, 11, players[i].color, 12);
      }
      g.restore();

      // Ritmo y rumbo
      const bw = 150;
      g.fillStyle = '#ffffff14';
      g.fillRect(cx - bw - 8, H - 30, bw, 8);
      g.fillStyle = '#a8ff3e';
      g.fillRect(cx - bw - 8, H - 30, bw * clamp(barca.vel / 90, 0, 1), 8);
      g.fillStyle = '#ffffff14';
      g.fillRect(cx + 8, H - 30, bw, 8);
      g.fillStyle = Math.abs(barca.ang) > 0.6 ? '#ff4757' : '#ffd166';
      g.fillRect(cx + 8 + bw / 2, H - 30, clamp(barca.ang * bw * 0.5, -bw / 2, bw / 2), 8);
      if (Math.abs(barca.ang) > 0.55) {
        ctx.engine.text(barca.ang > 0 ? `¡rema tú, ${players[1].name}!` : `¡rema tú, ${players[0].name}!`,
          cx, H - 50, { size: 12, color: '#ffd166', glow: 8 });
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar(llego) {
    terminado = true;
    const dif = Math.abs(paladas[0] - paladas[1]);
    let veredicto;
    if (llego && dif <= 6) veredicto = 'Paladas casi iguales: eso es remar a dos.';
    else if (llego) veredicto = `Llegaron, con ${dif} paladas de diferencia.`;
    else veredicto = `La barca se quedó en el metro ${Math.round(barca.s)}.`;
    if (llego) { audio.win(); haptics.victory(0); } else { audio.lose(); haptics.defeat(); }
    ctx.finish({
      winner: -1,
      scores: [paladas[0], paladas[1]],
      detail: `${llego ? tiempo.toFixed(1) + ' s' : Math.round(barca.s) + ' m'} · ${golpes} piedras · ${veredicto}`,
      record: llego ? ctx.record('tiempo', Math.round(tiempo * 10) / 10, 'low') : false,
    });
  }
}
