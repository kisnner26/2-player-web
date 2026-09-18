/**
 * Bomberos — uno apunta la lanza y el otro le da presión.
 *
 * El chorro es una parábola de verdad: sin presión cae a los pies y con
 * demasiada se pasa por encima del tejado. Ninguno de los dos ve la solución
 * solo — el que apunta ve el ángulo pero no cuánta presión hay, y el que
 * bombea ve el manómetro pero no dónde está el fuego.
 *
 * Y la manguera tiene un límite: pasarse de presión revienta el latiguillo y
 * hay que esperar a que baje. Machacar la tecla es la forma más rápida de
 * quedarse sin agua.
 */

import { clamp, TAU } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const FOCOS = 12;
const PRESION_MAX = 100;
const ROJO = 84;               // por encima de aquí, riesgo de reventón

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let angulo = -0.9, presion = 30, reventado = 0, t = 0, terminado = false;
  let focos = [], gotas = [], apagados = 0, ruina = 0;
  let sb = null;

  function generar() {
    focos = [];
    const casaX = W * 0.62, casaAn = W * 0.32, casaAl = H * 0.5;
    for (let i = 0; i < FOCOS; i++) {
      focos.push({
        x: casaX + (0.08 + rng() * 0.84) * casaAn,
        y: H * 0.78 - rng() * casaAl,
        vida: 1,
        r: 16 + rng() * 10,
        fase: rng() * TAU,
      });
    }
  }

  function acabar(exito, motivo) {
    if (terminado) return;
    terminado = true;
    if (exito) { audio.win(); haptics.victory(null); } else { audio.lose(); }
    ctx.finish({
      winner: -1,
      scores: [apagados, Math.round(100 - ruina)],
      detail: motivo,
      record: exito ? ctx.record('tiempo', Math.round(t), 'low') : false,
    });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      generar();
      sb = ui.scoreboard({ center: 'salvad la casa' });
    },
    resize(nw, nh) { W = nw; H = nh; generar(); },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);

      /* --- Lanza --- */
      const p0 = input.player(0);
      angulo = clamp(angulo + p0.ay * 1.1 * dt, -1.35, -0.12);

      /* --- Presión --- */
      const p1 = input.player(1);
      if (reventado > 0) {
        reventado -= dt;
        presion = Math.max(0, presion - 55 * dt);
      } else {
        if (p1.pressed('a')) {
          presion += 11;
          audio.tone({ freq: 160 + presion * 2, dur: 0.06, gain: 0.1, type: 'square' });
          haptics.tap(1);
        }
        presion -= 13 * dt;
        presion = clamp(presion, 0, PRESION_MAX + 12);
        if (presion > PRESION_MAX) {
          reventado = 3;
          audio.explosion();
          haptics.explosion(1);
          ctx.shake(12);
          particles.burst(W * 0.16, H * 0.72, 26, { speed: 260, color: '#9fd8ff', size: 5, drag: 0.9 });
        }
      }

      /* --- Chorro --- */
      const bocaX = W * 0.18, bocaY = H * 0.66;
      if (presion > 8 && reventado <= 0) {
        const v = 130 + presion * 7.5;
        for (let k = 0; k < 2; k++) {
          gotas.push({
            x: bocaX, y: bocaY,
            vx: Math.cos(angulo) * v * (0.96 + rng() * 0.08),
            vy: Math.sin(angulo) * v * (0.96 + rng() * 0.08),
            vida: 2.4,
          });
        }
        if (rng() < dt * 5) audio.noise({ dur: 0.12, gain: 0.05, filter: 2600, type: 'highpass' });
      }

      for (let i = gotas.length - 1; i >= 0; i--) {
        const d = gotas[i];
        d.vy += 640 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vida -= dt;
        let tocada = false;
        for (const f of focos) {
          if (f.vida <= 0) continue;
          if (Math.hypot(f.x - d.x, f.y - d.y) < f.r) {
            f.vida -= dt * 2.6;
            tocada = true;
            if (rng() < 0.3) {
              particles.spawn({ x: d.x, y: d.y, vx: (rng() - 0.5) * 90, vy: -60 - rng() * 60,
                life: 0.5, maxLife: 0.5, size: 4, color: '#ffffff88', shape: 'circle' });
            }
            if (f.vida <= 0) {
              apagados++;
              audio.pickup();
              haptics.score(null);
              sb.update(apagados, Math.round(100 - ruina));
              particles.burst(f.x, f.y, 18, { speed: 180, color: '#9fd8ff', size: 4, drag: 0.9 });
            }
            break;
          }
        }
        if (tocada || d.vida <= 0 || d.y > H || d.x > W + 40) gotas.splice(i, 1);
      }

      /* --- El fuego se come la casa --- */
      const vivos = focos.filter((f) => f.vida > 0);
      ruina += vivos.length * 0.42 * dt;
      for (const f of vivos) f.vida = Math.min(1.4, f.vida + dt * 0.045);

      if (!vivos.length) { acabar(true, `¡Casa salvada! ${Math.round(100 - ruina)}% en pie · ${Math.round(t)} s`); return; }
      if (ruina >= 100) { acabar(false, `La casa se viene abajo con ${vivos.length} focos vivos`); }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d0a14');

      const suelo = H * 0.82;
      g.fillStyle = '#161222';
      g.fillRect(0, suelo, W, H - suelo);

      // Casa
      const casaX = W * 0.62, casaAn = W * 0.32, casaAl = H * 0.5;
      const dañoV = clamp(ruina / 100, 0, 1);
      g.fillStyle = `rgb(${Math.round(52 - dañoV * 30)},${Math.round(42 - dañoV * 26)},${Math.round(66 - dañoV * 40)})`;
      g.fillRect(casaX, suelo - casaAl, casaAn, casaAl);
      g.fillStyle = '#3a2c4a';
      g.beginPath();
      g.moveTo(casaX - 14, suelo - casaAl);
      g.lineTo(casaX + casaAn / 2, suelo - casaAl - H * 0.1);
      g.lineTo(casaX + casaAn + 14, suelo - casaAl);
      g.fill();
      g.fillStyle = '#0e0a16';
      for (let i = 0; i < 3; i++) {
        for (let k = 0; k < 2; k++) {
          g.fillRect(casaX + casaAn * (0.16 + i * 0.28), suelo - casaAl * (0.8 - k * 0.4), casaAn * 0.16, casaAl * 0.2);
        }
      }

      // Focos de fuego
      for (const f of focos) {
        if (f.vida <= 0) continue;
        const s = f.r * clamp(f.vida, 0.2, 1.4);
        for (let k = 0; k < 3; k++) {
          const a = t * 6 + f.fase + k * 2;
          ctx.engine.glowCircle(
            f.x + Math.sin(a) * 4, f.y - k * s * 0.5 + Math.cos(a) * 3,
            s * (1 - k * 0.22),
            k === 0 ? '#ff4757' : k === 1 ? '#ff8c42' : '#ffd166',
            20,
          );
        }
      }

      // Manguera y bomberos
      const bocaX = W * 0.18, bocaY = H * 0.66;
      dibujarPersonaje(g, personajeDe(players[0], 0), W * 0.13, suelo, 74, {
        pose: 'quieto', acento: players[0].color, mirando: 1,
      });
      dibujarPersonaje(g, personajeDe(players[1], 1), W * 0.06, suelo, 74, {
        pose: presion > 60 ? 'anda' : 'quieto', frame: Math.floor(t * 8) % 4,
        acento: players[1].color, mirando: 1,
      });
      g.save();
      g.strokeStyle = reventado > 0 ? '#ff4757' : '#ffd166';
      g.lineWidth = 7;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(W * 0.06, suelo - 20);
      g.quadraticCurveTo(W * 0.12, suelo + 6, bocaX, bocaY);
      g.stroke();
      g.restore();
      g.save();
      g.translate(bocaX, bocaY);
      g.rotate(angulo);
      g.fillStyle = '#c9c9d8';
      g.fillRect(0, -5, 26, 10);
      g.restore();

      for (const d of gotas) {
        g.save();
        g.globalAlpha = clamp(d.vida, 0, 1);
        g.strokeStyle = '#9fd8ff';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(d.x, d.y);
        g.lineTo(d.x - d.vx * 0.012, d.y - d.vy * 0.012);
        g.stroke();
        g.restore();
      }

      particles.render(g);

      // Manómetro
      const mx = W * 0.1, my = H * 0.2, mr = Math.min(52, H * 0.09);
      g.fillStyle = '#14121e';
      g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
      g.strokeStyle = '#2c2a40';
      g.lineWidth = 3;
      g.stroke();
      g.strokeStyle = '#ff4757';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(mx, my, mr - 8, Math.PI * 0.75 + (ROJO / PRESION_MAX) * Math.PI * 1.5, Math.PI * 0.75 + Math.PI * 1.5);
      g.stroke();
      const ang = Math.PI * 0.75 + clamp(presion / PRESION_MAX, 0, 1) * Math.PI * 1.5;
      g.strokeStyle = reventado > 0 ? '#ff4757' : '#f2f2ff';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(mx, my);
      g.lineTo(mx + Math.cos(ang) * (mr - 12), my + Math.sin(ang) * (mr - 12));
      g.stroke();
      ctx.engine.text(reventado > 0 ? '¡REVENTÓN!' : `${Math.round(presion)} bar`, mx, my + mr + 16, {
        size: 12, color: reventado > 0 ? '#ff4757' : '#c9c9e0', font: 'system-ui',
      });

      // Estado de la casa
      g.fillStyle = '#00000088';
      g.fillRect(W * 0.6, 24, W * 0.34, 10);
      g.fillStyle = dañoV > 0.7 ? '#ff4757' : '#a8ff3e';
      g.fillRect(W * 0.6, 24, W * 0.34 * (1 - dañoV), 10);
      ctx.engine.text(`casa en pie ${Math.round(100 - ruina)}% · focos ${focos.filter((f) => f.vida > 0).length}`,
        W * 0.77, 48, { size: 12, color: '#c9c9e0', font: 'system-ui' });

      ctx.engine.text(`${players[0].name}: ↑↓ apunta la lanza · ${players[1].name}: pulsa para dar presión (sin pasarte)`,
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
