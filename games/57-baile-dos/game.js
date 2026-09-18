/**
 * Baile a Dos — ritmo cooperativo: el combo solo sube si aciertan LOS DOS.
 *
 * A diferencia del juego de Ritmo normal, aquí las flechas caen por una sola
 * pista compartida y ambos tienen que pulsar la misma dirección casi a la vez.
 * Uno solo no puede salvar la canción, y eso obliga a llevar el compás juntos
 * en voz alta ("¡izquierda… ahora!").
 */

import { TAU, clamp } from '../../core/math2d.js';
import { createSoulBand } from '../../core/soul.js';

export const meta = { render: 'canvas' };

const BPM = 108;
const NEGRA = 60 / BPM;
const CAIDA = 1.7;
const COMPASES = 26;
const DIRS = ['left', 'up', 'down', 'right'];
const FLECHAS = ['◀', '▲', '▼', '▶'];
const COLORES = ['#ff6ec7', '#a8ff3e', '#00e5ff', '#ffd166'];
const VENTANA = 0.19;          // margen para acertar
const JUNTOS = 0.13;           // margen entre los dos para contar "a la vez"

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let notas = [];
  let reloj = -2.4;
  let sb = null;
  let puntos = 0, combo = 0, mejorCombo = 0;
  let perfectas = 0, aMedias = 0, falladas = 0;
  let juicio = null;
  const brillo = [[0, 0, 0, 0], [0, 0, 0, 0]];
  let ultimoBeat = -1;
  let terminado = false;
  let energia = 0.6;           // barra compartida: si llega a 0, se acaba
  const banda = createSoulBand({ volumen: 0.5 });

  function generar() {
    notas = [];
    const total = COMPASES * 4;
    for (let b = 0; b < total; b++) {
      const t = b * NEGRA;
      const prog = b / total;
      if (b < 4) continue;                          // dos compases de entrada
      if (rng() < 0.55 + prog * 0.3) {
        notas.push({ t, lane: Math.floor(rng() * 4), p: [null, null], resuelta: false });
      }
      if (prog > 0.45 && rng() < prog * 0.32) {
        notas.push({ t: t + NEGRA / 2, lane: Math.floor(rng() * 4), p: [null, null], resuelta: false });
      }
    }
    notas.sort((a, b) => a.t - b.t);
  }

  const carril = () => Math.min(96, (W - 120) / 4);
  const receptorY = () => H - 130;

  return {
    init() {
      W = ctx.W; H = ctx.H;
      generar();
      banda.reset();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Pulsen la <b>misma flecha a la vez</b> · el combo es de los dos');
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      reloj += dt;

      // Banda soul en vivo, en vez del metrónomo plano de antes.
      const beat = Math.floor(reloj / NEGRA);
      if (beat !== ultimoBeat && reloj >= 0) {
        ultimoBeat = beat;
        banda.tick(beat);
      }

      // Entradas
      for (let j = 0; j < 2; j++) {
        const pl = input.player(j);
        for (let l = 0; l < 4; l++) {
          if (!pl.pressed(DIRS[l])) continue;
          brillo[j][l] = 1;
          registrar(j, l);
        }
        for (let l = 0; l < 4; l++) brillo[j][l] = Math.max(0, brillo[j][l] - dt * 6);
      }

      // Resolver notas cuya ventana ya pasó
      for (const n of notas) {
        if (n.resuelta) continue;
        if (reloj - n.t > VENTANA) resolverNota(n);
      }

      if (juicio) { juicio.t -= dt; if (juicio.t <= 0) juicio = null; }

      const resueltas = notas.filter((n) => n.resuelta).length;
      sb.update(puntos, combo);
      sb.setCenter(`${Math.round((resueltas / notas.length) * 100)}%  ·  combo ${combo}`);

      if (energia <= 0) return terminar('Se les fue el ritmo');
      if (resueltas >= notas.length) return terminar('¡Canción completa!');
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a0414');

      // Pista de baile pulsante
      const fase = ((reloj % NEGRA) + NEGRA) % NEGRA / NEGRA;
      const grd = g.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H) * 0.75);
      grd.addColorStop(0, `rgba(${90 + (1 - fase) * 90}, 20, ${110 + (1 - fase) * 60}, .55)`);
      grd.addColorStop(1, '#07030f');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      const lw = carril();
      const x0 = W / 2 - lw * 2;
      const ry = receptorY();

      // Carriles
      for (let l = 0; l < 4; l++) {
        g.fillStyle = l % 2 ? '#ffffff07' : '#ffffff03';
        g.fillRect(x0 + l * lw, 0, lw, ry + 60);
      }

      // Receptores
      for (let l = 0; l < 4; l++) {
        const x = x0 + l * lw + lw / 2;
        const br = Math.max(brillo[0][l], brillo[1][l]);
        const ambos = brillo[0][l] > 0.2 && brillo[1][l] > 0.2;
        g.save();
        g.globalAlpha = 0.3 + br * 0.7;
        g.strokeStyle = ambos ? '#ffffff' : COLORES[l];
        g.lineWidth = 2 + br * 4;
        if (br > 0) { g.shadowColor = ambos ? '#fff' : COLORES[l]; g.shadowBlur = 30 * br; }
        g.beginPath();
        g.roundRect(x - lw * 0.36, ry - lw * 0.36, lw * 0.72, lw * 0.72, 10);
        g.stroke();
        g.restore();
        ctx.engine.text(FLECHAS[l], x, ry, { size: lw * 0.34, color: `rgba(255,255,255,${0.35 + br * 0.65})` });

        // Marca de quién ha pulsado ya esa flecha
        for (let j = 0; j < 2; j++) {
          if (brillo[j][l] <= 0.15) continue;
          g.fillStyle = players[j].color;
          g.globalAlpha = brillo[j][l];
          g.beginPath();
          g.arc(x + (j === 0 ? -lw * 0.28 : lw * 0.28), ry + lw * 0.5, 5, 0, TAU);
          g.fill();
          g.globalAlpha = 1;
        }
      }

      // Notas
      for (const n of notas) {
        if (n.resuelta) continue;
        const dtn = n.t - reloj;
        if (dtn > CAIDA || dtn < -0.4) continue;
        const y = ry - (dtn / CAIDA) * ry;
        const x = x0 + n.lane * lw + lw / 2;
        // Un anillo por jugador: se ve quién ya la pulsó.
        g.save();
        g.shadowColor = COLORES[n.lane];
        g.shadowBlur = 16;
        g.fillStyle = COLORES[n.lane];
        g.beginPath();
        g.roundRect(x - lw * 0.32, y - lw * 0.32, lw * 0.64, lw * 0.64, 9);
        g.fill();
        g.restore();
        ctx.engine.text(FLECHAS[n.lane], x, y, { size: lw * 0.32, color: '#0a0a12' });
        for (let j = 0; j < 2; j++) {
          if (n.p[j] == null) continue;
          g.strokeStyle = players[j].color;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(x + (j === 0 ? -lw * 0.4 : lw * 0.4), y, 6, 0, TAU);
          g.stroke();
        }
      }

      particles.render(g);

      // Juicio y combo
      if (juicio) {
        g.save();
        g.globalAlpha = clamp(juicio.t * 2.5, 0, 1);
        ctx.engine.text(juicio.texto, W / 2, ry - 120, { size: 19, color: juicio.color, glow: 16 });
        g.restore();
      }
      if (combo > 2) {
        ctx.engine.text(`${combo}`, W / 2, H * 0.22, { size: 40, color: '#ff6ec7', glow: 20 });
        ctx.engine.text('JUNTOS', W / 2, H * 0.22 + 30, { size: 10, color: '#ffffff66' });
      }

      // Energía compartida
      const bw = Math.min(420, W * 0.55);
      const bx = (W - bw) / 2;
      g.fillStyle = '#ffffff14';
      g.fillRect(bx, 54, bw, 10);
      g.fillStyle = energia > 0.5 ? '#ff6ec7' : energia > 0.25 ? '#ffd166' : '#ff4757';
      g.fillRect(bx, 54, bw * clamp(energia, 0, 1), 10);
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function registrar(j, lane) {
    // Busca la nota más cercana de ese carril dentro de la ventana.
    let mejor = null, md = Infinity;
    for (const n of notas) {
      if (n.resuelta || n.lane !== lane || n.p[j] != null) continue;
      const d = Math.abs(n.t - reloj);
      if (d < md) { md = d; mejor = n; }
    }
    if (!mejor || md > VENTANA) {
      // Pulsar de más rompe el combo: no se puede machacar.
      if (combo > 3) juicio = { texto: 'FUERA DE TIEMPO', color: '#ff4757', t: 0.5 };
      combo = 0;
      energia = Math.max(0, energia - 0.02);
      audio.tick();
      return;
    }
    mejor.p[j] = reloj;
    audio.tone({ freq: 520 + lane * 110, dur: 0.05, gain: 0.09, type: 'square' });
    haptics.play('click', { player: j, scale: 0.7 });
    if (mejor.p[0] != null && mejor.p[1] != null) resolverNota(mejor);
  }

  function resolverNota(n) {
    n.resuelta = true;
    const [a, b] = n.p;
    const lw = carril();
    const x = W / 2 - lw * 2 + n.lane * lw + lw / 2;

    if (a == null && b == null) {
      falladas++;
      combo = 0;
      energia = Math.max(0, energia - 0.05);
      juicio = { texto: 'PERDIDA', color: '#ff4757', t: 0.5 };
      haptics.play('error');
      return;
    }
    if (a == null || b == null) {
      // Solo uno la pulsó: no cuenta como acierto de pareja.
      aMedias++;
      combo = 0;
      energia = Math.max(0, energia - 0.03);
      const solo = a == null ? 1 : 0;
      juicio = { texto: `SOLO ${players[solo].name.toUpperCase()}`, color: players[solo].color, t: 0.55 };
      audio.error();
      haptics.play('soft', { player: solo });
      return;
    }

    const dif = Math.abs(a - b);
    const desfase = Math.abs((a + b) / 2 - n.t);
    combo++;
    mejorCombo = Math.max(mejorCombo, combo);
    perfectas++;
    energia = Math.min(1, energia + 0.035);

    let texto, color, base;
    if (dif <= JUNTOS * 0.4 && desfase < 0.06) { texto = '¡EN SINCRONÍA!'; color = '#ff6ec7'; base = 130; }
    else if (dif <= JUNTOS * 0.7) { texto = 'MUY JUNTOS'; color = '#a8ff3e'; base = 90; }
    else { texto = 'JUNTOS'; color = '#00e5ff'; base = 55; }

    puntos += Math.round(base * (1 + Math.min(1, combo / 40)));
    juicio = { texto, color, t: 0.5 };
    audio.tone({ freq: 780 + n.lane * 90, dur: 0.07, gain: 0.11 });
    haptics.play(base > 100 ? 'impact' : 'bounce', { scale: 0.8 });
    particles.burst(x, receptorY(), base > 100 ? 16 : 9, {
      speed: 200, color, size: 4, shape: 'spark',
    });
  }

  function terminar(motivo) {
    terminado = true;
    const total = perfectas + aMedias + falladas;
    const pct = total ? Math.round((perfectas / total) * 100) : 0;
    let veredicto;
    if (pct >= 85) veredicto = 'Bailan como si lo hubieran ensayado.';
    else if (pct >= 65) veredicto = 'Buen compás entre los dos.';
    else if (pct >= 40) veredicto = 'Se pisaron un poco, pero salió.';
    else veredicto = 'Cada uno con su música. Otra vez.';
    ctx.finish({
      winner: -1,
      scores: [puntos, mejorCombo],
      detail: `${motivo} · ${pct}% al unísono · ${veredicto}`,
      record: ctx.record('puntos', puntos, 'high'),
    });
  }
}
