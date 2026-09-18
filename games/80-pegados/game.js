/**
 * Bailar Pegados — la pista se apaga y solo quedan encendidas dos baldosas.
 *
 * Los dos tienen que estar SOBRE baldosas encendidas y a la vez lo bastante
 * cerca como para seguir abrazados. Las baldosas se apagan por rachas, así que
 * el sitio bueno para uno casi nunca es el bueno para el otro: hay que elegir
 * el par de baldosas que les sirva a los dos.
 *
 * Si se separan más de la cuenta, el abrazo se rompe: hay un margen de gracia
 * de un segundo para volver, y después se acabó el baile.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const COLS = 8, FILAS = 5;
const VEL = 220;
const ABRAZO = 132;            // distancia máxima entre los dos
const GRACIA = 1;              // segundos que se aguanta separados
const DURACION = 80;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [{ i: 0, x: 0, y: 0 }, { i: 1, x: 0, y: 0 }];
  let baldosas = [];
  let compas = 0, ronda = 0;
  let separados = 0, fuera = [0, 0];
  let puntos = 0, tiempo = DURACION, mejorRacha = 0, racha = 0;
  let sb = null, terminado = false;

  const cw = () => (W * 0.8) / COLS;
  const ch = () => (H * 0.56) / FILAS;
  const ox = () => W * 0.1;
  const oy = () => H * 0.26;

  function apagarRacha() {
    // Se apagan unas cuantas al azar, pero nunca todas: siempre hay solución.
    ronda++;
    const apagar = Math.min(COLS * FILAS - 6, 8 + Math.floor(ronda * 0.7));
    baldosas = new Array(COLS * FILAS).fill(true);
    for (let k = 0; k < apagar; k++) {
      baldosas[Math.floor(rng() * baldosas.length)] = false;
    }
    audio.tone({ freq: 320, dur: 0.12, gain: 0.12, type: 'triangle', sweep: -120 });
  }

  function reiniciar() {
    jug[0].x = ox() + cw() * 2.5; jug[0].y = oy() + ch() * 2.5;
    jug[1].x = ox() + cw() * 4.5; jug[1].y = oy() + ch() * 2.5;
    baldosas = new Array(COLS * FILAS).fill(true);
    compas = 0; ronda = 0;
    separados = 0; fuera = [0, 0];
    puntos = 0; tiempo = DURACION; racha = 0; mejorRacha = 0;
    terminado = false;
  }

  /** Índice de baldosa bajo un punto, o -1 si está fuera de la pista. */
  function baldosaEn(x, y) {
    const cx = Math.floor((x - ox()) / cw());
    const cy = Math.floor((y - oy()) / ch());
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= FILAS) return -1;
    return cy * COLS + cx;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Sobre baldosas encendidas y sin separarse · el abrazo tiene un límite');
    },
    resize(nw, nh) { W = nw; H = nh; reiniciar(); },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo -= dt;
      compas += dt;

      // Cada compás se apaga otra racha de baldosas.
      if (compas > Math.max(1.5, 3.2 - ronda * 0.08)) {
        compas = 0;
        apagarRacha();
      }

      for (const p of jug) {
        const pl = input.player(p.i);
        const dx = pl.x, dy = pl.y;
        const len = Math.hypot(dx, dy) || 1;
        p.x = clamp(p.x + (dx / len) * VEL * dt, ox() + 8, ox() + cw() * COLS - 8);
        p.y = clamp(p.y + (dy / len) * VEL * dt, oy() + 8, oy() + ch() * FILAS - 8);
      }

      // El abrazo: si se pasan de distancia, empieza la cuenta de gracia.
      const d = Math.hypot(jug[0].x - jug[1].x, jug[0].y - jug[1].y);
      if (d > ABRAZO) {
        separados += dt;
        if (rng() < dt * 4) haptics.play('tick');
      } else {
        separados = Math.max(0, separados - dt * 1.6);
      }

      // Baldosa apagada: aguanta un momento antes de contar como caída.
      let apagadas = 0;
      for (const p of jug) {
        const k = baldosaEn(p.x, p.y);
        const buena = k >= 0 && baldosas[k];
        fuera[p.i] = buena ? 0 : fuera[p.i] + dt;
        if (!buena) apagadas++;
      }

      if (apagadas === 0 && d <= ABRAZO) {
        racha += dt;
        mejorRacha = Math.max(mejorRacha, racha);
        puntos += 12 * dt;
      } else {
        racha = 0;
      }

      sb.update(Math.round(puntos), ronda);
      sb.setCenter(`${Math.max(0, tiempo).toFixed(0)}s · ${Math.round(puntos)} pts`);

      if (separados > GRACIA) return terminar('abrazo');
      if (Math.max(fuera[0], fuera[1]) > 0.7) return terminar('baldosa');
      if (tiempo <= 0) return terminar('fin');

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0b0812');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#1a1030');
      grd.addColorStop(1, '#08060e');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // Bola de espejos: unos haces que barren la sala.
      g.save();
      g.globalAlpha = 0.12;
      for (let k = 0; k < 6; k++) {
        const a = ctx.engine.time * 0.6 + (k / 6) * TAU;
        g.fillStyle = `hsl(${(k * 60) % 360} 80% 60%)`;
        g.beginPath();
        g.moveTo(W / 2, 0);
        g.lineTo(W / 2 + Math.cos(a) * W, H);
        g.lineTo(W / 2 + Math.cos(a + 0.2) * W, H);
        g.closePath(); g.fill();
      }
      g.restore();

      // La pista
      for (let y = 0; y < FILAS; y++) {
        for (let x = 0; x < COLS; x++) {
          const on = baldosas[y * COLS + x];
          const bx = ox() + x * cw(), by = oy() + y * ch();
          g.fillStyle = on ? '#2f2f5a' : '#120f1c';
          g.fillRect(bx + 2, by + 2, cw() - 4, ch() - 4);
          if (on) {
            g.save();
            g.globalAlpha = 0.5;
            g.strokeStyle = '#7a6cff';
            g.lineWidth = 2;
            g.strokeRect(bx + 2, by + 2, cw() - 4, ch() - 4);
            g.restore();
          }
        }
      }

      // El lazo del abrazo: cambia de color según lo estirado que esté.
      const d = Math.hypot(jug[0].x - jug[1].x, jug[0].y - jug[1].y);
      const k = clamp(d / ABRAZO, 0, 1.4);
      g.save();
      g.strokeStyle = k > 1 ? '#ff4757' : k > 0.8 ? '#ffd166' : '#ff6ec7';
      g.lineWidth = 6 - k * 2.5;
      g.shadowColor = g.strokeStyle;
      g.shadowBlur = 14;
      g.beginPath();
      const mx = (jug[0].x + jug[1].x) / 2;
      const my = (jug[0].y + jug[1].y) / 2 + (1 - Math.min(1, k)) * 26;
      g.moveTo(jug[0].x, jug[0].y);
      g.quadraticCurveTo(mx, my, jug[1].x, jug[1].y);
      g.stroke();
      g.restore();

      particles.render(g);

      for (const p of jug) {
        const kk = baldosaEn(p.x, p.y);
        const buena = kk >= 0 && baldosas[kk];
        ctx.engine.glowCircle(p.x, p.y, 18, players[p.i].color, buena ? 18 : 6);
        if (!buena) {
          g.save();
          g.globalAlpha = 0.6 + Math.sin(ctx.engine.time * 14) * 0.4;
          ctx.engine.text('¡baldosa apagada!', p.x, p.y - 30, { size: 10, color: '#ff4757' });
          g.restore();
        }
      }

      // Avisos de separación y racha
      if (separados > 0.05) {
        const bw = 200;
        g.fillStyle = '#ffffff14';
        g.fillRect(W / 2 - bw / 2, 52, bw, 10);
        g.fillStyle = '#ff4757';
        g.fillRect(W / 2 - bw / 2, 52, bw * clamp(separados / GRACIA, 0, 1), 10);
        ctx.engine.text('¡se están separando!', W / 2, 78, { size: 12, color: '#ff4757', glow: 8 });
      } else if (racha > 1) {
        ctx.engine.text(`${racha.toFixed(1)} s pegados`, W / 2, 62, { size: 13, color: '#ff6ec7', glow: 8 });
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar(motivo) {
    terminado = true;
    let veredicto;
    if (motivo === 'fin') veredicto = 'Canción entera sin soltarse. Eso se llama bailar.';
    else if (motivo === 'abrazo') veredicto = 'Se soltaron y la pista los echó.';
    else veredicto = 'Alguien se quedó en una baldosa apagada.';
    if (motivo === 'fin') { audio.win(); haptics.play('score'); } else { audio.lose(); haptics.defeat(); }
    ctx.finish({
      winner: -1,
      scores: [Math.round(puntos), ronda],
      detail: `${Math.round(puntos)} pts · mejor racha ${mejorRacha.toFixed(1)} s · ${veredicto}`,
      record: ctx.record('puntos', Math.round(puntos), 'high'),
    });
  }
}
