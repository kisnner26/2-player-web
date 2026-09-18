/**
 * Ambulancia — uno conduce y el otro mantiene vivo al de atrás.
 *
 * El conductor tiene prisa y el sanitario necesita calma: son objetivos
 * incompatibles a propósito. Cada bache y cada frenazo desestabiliza al
 * paciente, así que la velocidad que le viene bien a uno es exactamente la
 * que le arruina el trabajo al otro.
 *
 * El sanitario juega a mantener las constantes dentro de la banda verde
 * pulsando en el momento justo; si se sale demasiado tiempo, se acaba el
 * viaje. Y el reloj también corre. No hay forma de que los dos vayan cómodos.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const RUTA = 4200;
const TIEMPO = 95;
const VEL_MAX = 340;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let avance = 0, vel = 0, carril = 0.5, reloj = TIEMPO, t = 0, terminado = false;
  let pulso = 0.5, deriva = 0, estable = 0, critico = 0;
  let obstaculos = [], marcador = 0, dirMarc = 1, zona = { a: 0.4, b: 0.6 };
  let sb = null, sacudida = 0, aciertos = 0, fallosSanitario = 0;

  function generar() {
    obstaculos = [];
    for (let y = 400; y < RUTA; y += 150) {
      obstaculos.push({ y: y + rng() * 90, x: 0.15 + rng() * 0.7, tipo: rng() < 0.35 ? 'bache' : 'coche' });
    }
  }

  function golpe(fuerza) {
    sacudida = fuerza;
    deriva += (rng() - 0.5) * fuerza * 0.06;
    audio.hit();
    haptics.impact(0, clamp(fuerza / 10, 0.4, 1.4));
    ctx.shake(fuerza);
  }

  function acabar(exito, motivo) {
    if (terminado) return;
    terminado = true;
    if (exito) { audio.win(); haptics.victory(null); } else { audio.lose(); }
    ctx.finish({
      winner: -1,
      scores: [Math.round((avance / RUTA) * 100), aciertos],
      detail: motivo,
      record: exito ? ctx.record('tiempo', Math.round(TIEMPO - reloj), 'low') : false,
    });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      generar();
      sb = ui.scoreboard({ center: 'al hospital' });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      sacudida = Math.max(0, sacudida - dt * 22);
      particles.update(dt);
      reloj -= dt;
      if (reloj <= 0) { acabar(false, 'Se acabó el tiempo con el paciente a bordo'); return; }

      /* --- Conductor --- */
      const p0 = input.player(0);
      const acelera = p0.held('a') || p0.held('up');
      const frena = p0.held('down');
      vel += (acelera ? 260 : frena ? -420 : -70) * dt;
      vel = clamp(vel, 0, VEL_MAX);
      if (frena && vel > 40) deriva += dt * 0.35;
      carril = clamp(carril + p0.ax * 0.7 * dt, 0.1, 0.9);
      avance += vel * dt;

      // La velocidad desestabiliza sola: es el conflicto del juego.
      deriva += (vel / VEL_MAX) * 0.42 * dt;

      for (const o of obstaculos) {
        if (o.golpeado || Math.abs(o.y - avance) > 26) continue;
        if (Math.abs(o.x - carril) < 0.09) {
          o.golpeado = true;
          if (o.tipo === 'bache') { golpe(7); deriva += 0.1; }
          else { golpe(14); vel *= 0.35; deriva += 0.22; }
          particles.burst(o.x * W, H * 0.66, 16, { speed: 200, color: '#ff8c42', size: 4, drag: 0.9 });
        }
      }

      /* --- Sanitario --- */
      marcador += dirMarc * dt * (0.7 + deriva * 1.6);
      if (marcador > 1) { marcador = 1; dirMarc = -1; }
      if (marcador < 0) { marcador = 0; dirMarc = 1; }

      const p1 = input.player(1);
      if (p1.pressed('a')) {
        if (marcador >= zona.a && marcador <= zona.b) {
          aciertos++;
          deriva = Math.max(0, deriva - 0.34);
          pulso = clamp(pulso + 0.12, 0, 1);
          audio.pickup();
          haptics.score(1);
          // La zona buena se estrecha con los aciertos: no se automatiza.
          const ancho = clamp(0.22 - aciertos * 0.004, 0.09, 0.22);
          const c = 0.15 + rng() * 0.7;
          zona = { a: clamp(c - ancho / 2, 0, 1), b: clamp(c + ancho / 2, 0, 1) };
        } else {
          fallosSanitario++;
          deriva += 0.12;
          audio.error();
          haptics.error(1);
        }
      }

      deriva = clamp(deriva, 0, 1.6);
      pulso = clamp(pulso - deriva * 0.06 * dt + 0.02 * dt, 0, 1);

      if (deriva > 1.2) {
        critico += dt;
        if (Math.floor(critico * 3) !== Math.floor((critico - dt) * 3)) {
          audio.tone({ freq: 180, dur: 0.1, gain: 0.16, type: 'sawtooth' });
          haptics.error(null);
        }
        if (critico > 6) { acabar(false, 'El paciente no aguantó el viaje'); return; }
      } else {
        critico = Math.max(0, critico - dt * 0.7);
        estable += dt;
      }

      sb.update(Math.round((avance / RUTA) * 100), aciertos);

      if (avance >= RUTA) {
        acabar(true, `¡Llegáis! ${aciertos} maniobras buenas y ${Math.round(reloj)} s de margen`);
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#080a12');

      const sx = sacudida ? (rng() - 0.5) * sacudida : 0;
      g.save();
      g.translate(sx, 0);

      /* --- Mitad izquierda: la carretera --- */
      const anchoVia = W * 0.46;
      g.fillStyle = '#1b1b26';
      g.fillRect(0, 0, anchoVia, H);
      g.fillStyle = '#2a2a3a';
      g.fillRect(anchoVia * 0.08, 0, anchoVia * 0.84, H);
      g.strokeStyle = '#ffd16688';
      g.lineWidth = 3;
      g.setLineDash([26, 26]);
      g.lineDashOffset = -avance % 52;
      for (const k of [0.36, 0.64]) {
        g.beginPath(); g.moveTo(anchoVia * k, 0); g.lineTo(anchoVia * k, H); g.stroke();
      }
      g.setLineDash([]);

      for (const o of obstaculos) {
        const y = H * 0.66 - (o.y - avance);
        if (y < -60 || y > H + 60) continue;
        const x = o.x * anchoVia;
        if (o.tipo === 'bache') {
          g.fillStyle = o.golpeado ? '#3a3a4a' : '#141420';
          g.beginPath(); g.ellipse(x, y, 26, 10, 0, 0, Math.PI * 2); g.fill();
        } else {
          g.fillStyle = o.golpeado ? '#4a4050' : '#b04cff';
          g.beginPath(); g.roundRect(x - 20, y - 32, 40, 64, 7); g.fill();
          g.fillStyle = '#00000066';
          g.fillRect(x - 15, y - 22, 30, 16);
        }
      }

      // Ambulancia
      const ax = carril * anchoVia;
      g.save();
      g.translate(ax, H * 0.66);
      g.fillStyle = '#f2f4f8';
      g.beginPath(); g.roundRect(-22, -38, 44, 76, 8); g.fill();
      g.fillStyle = '#ff4757';
      g.fillRect(-22, -6, 44, 9);
      const sirena = Math.sin(t * 12) > 0;
      ctx.engine.glowCircle(-11, -40, 6, sirena ? '#ff4757' : '#3aa0ff', 20);
      ctx.engine.glowCircle(11, -40, 6, sirena ? '#3aa0ff' : '#ff4757', 20);
      g.restore();

      particles.render(g);

      ctx.engine.text(`${Math.round(vel)} km/h`, anchoVia / 2, 28, { size: 15, color: players[0].color, font: 'system-ui' });
      const prog = clamp(avance / RUTA, 0, 1);
      g.fillStyle = '#00000088';
      g.fillRect(anchoVia * 0.1, 46, anchoVia * 0.8, 7);
      g.fillStyle = '#3effc8';
      g.fillRect(anchoVia * 0.1, 46, anchoVia * 0.8 * prog, 7);

      g.restore();

      /* --- Mitad derecha: la camilla --- */
      const bx = anchoVia + 20;
      const bw = W - bx - 20;
      g.fillStyle = '#101820';
      g.fillRect(bx, 0, bw, H);

      // Constantes: la línea del monitor.
      const my = H * 0.3;
      g.strokeStyle = deriva > 1.2 ? '#ff4757' : '#3effc8';
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x < bw; x += 3) {
        const fase = (x / bw) * 8 + t * 3;
        const pico = Math.exp(-Math.pow(((fase % 4) - 1) * 3, 2)) * (30 + pulso * 40);
        const ruido = (rng() - 0.5) * deriva * 12;
        g.lineTo(bx + x, my - pico + ruido);
      }
      g.stroke();
      ctx.engine.text(`${Math.round(60 + pulso * 70)} ppm`, bx + bw / 2, my + 46, {
        size: 14, color: deriva > 1.2 ? '#ff4757' : '#3effc8', font: 'system-ui',
      });

      // Barra de estabilidad y marcador
      const by = H * 0.58;
      g.fillStyle = '#1a2430';
      g.fillRect(bx + 20, by, bw - 40, 32);
      g.fillStyle = '#a8ff3e44';
      g.fillRect(bx + 20 + (bw - 40) * zona.a, by, (bw - 40) * (zona.b - zona.a), 32);
      g.strokeStyle = '#a8ff3e';
      g.lineWidth = 2;
      g.strokeRect(bx + 20 + (bw - 40) * zona.a, by, (bw - 40) * (zona.b - zona.a), 32);
      const mx = bx + 20 + (bw - 40) * marcador;
      ctx.engine.glowRect(mx - 2, by - 6, 4, 44, players[1].color, 16);

      ctx.engine.text('estabiliza en la banda verde', bx + bw / 2, by - 18,
        { size: 12, color: players[1].color, font: 'system-ui' });

      // Nivel de inestabilidad
      g.fillStyle = '#00000088';
      g.fillRect(bx + 20, H * 0.74, bw - 40, 12);
      g.fillStyle = deriva > 1.2 ? '#ff4757' : deriva > 0.7 ? '#ffd166' : '#a8ff3e';
      g.fillRect(bx + 20, H * 0.74, (bw - 40) * clamp(deriva / 1.6, 0, 1), 12);
      ctx.engine.text('inestabilidad', bx + bw / 2, H * 0.79, { size: 11, color: '#7a8a98', font: 'system-ui' });

      if (critico > 0) {
        g.save();
        g.globalAlpha = 0.25 + Math.sin(t * 16) * 0.2;
        g.fillStyle = '#ff4757';
        g.fillRect(bx, 0, bw, H);
        g.restore();
        ctx.engine.text('¡CRÍTICO!', bx + bw / 2, H * 0.88, { size: 24, color: '#ff4757', glow: 18 });
      }

      ctx.engine.text(`${Math.ceil(reloj)}s`, W / 2, H - 34, {
        size: 18, color: reloj < 20 ? '#ff4757' : '#c9c9e0', font: 'system-ui',
      });
      ctx.engine.text(`${players[0].name} conduce (acelera, frena, esquiva) · ${players[1].name} estabiliza`,
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
