/**
 * Ritmo — flechas que caen al compás, cuatro pistas por jugador.
 *
 * El patrón se genera desde el BPM en vez de leerse de un archivo, así que
 * cada partida es distinta pero siempre cuadra con la música sintetizada.
 * La nota se juzga por distancia temporal al momento exacto del golpe.
 */

import { clamp, TAU } from '../../core/math2d.js';
import { createSoulBand } from '../../core/soul.js';

export const meta = { render: 'canvas' };

const BPM = 124;
const NEGRA = 60 / BPM;
const CAIDA = 1.5;             // segundos que tarda una nota en llegar
const COMPASES = 32;
const DIRS = ['left', 'up', 'down', 'right'];
const FLECHAS = ['◀', '▲', '▼', '▶'];

const JUICIOS = [
  { max: 0.045, nombre: 'PERFECTO', puntos: 100, color: '#ffd166' },
  { max: 0.09,  nombre: 'GENIAL',   puntos: 70,  color: '#a8ff3e' },
  { max: 0.15,  nombre: 'BIEN',     puntos: 40,  color: '#00e5ff' },
  { max: 0.22,  nombre: 'FLOJO',    puntos: 10,  color: '#b04cff' },
];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let notas = [];                // {t, lane, jugador, golpeada}
  let reloj = -2;                // empieza en negativo: dos segundos de aire
  let sb = null;
  const score = [0, 0];
  const combo = [0, 0];
  const maxCombo = [0, 0];
  const juicio = [null, null];   // {texto, color, t}
  const brilloTecla = [[0, 0, 0, 0], [0, 0, 0, 0]];
  let ultimoBeat = -1;
  let terminado = false;
  const banda = createSoulBand({ volumen: 0.5 });

  function generar() {
    notas = [];
    const total = COMPASES * 4;
    for (let b = 0; b < total; b++) {
      const t = b * NEGRA;
      // Densidad creciente: empieza con negras y acaba con corcheas dobles.
      const progreso = b / total;
      const densidad = 0.42 + progreso * 0.42;
      for (let j = 0; j < 2; j++) {
        if (rng() < densidad) {
          notas.push({ t, lane: Math.floor(rng() * 4), jugador: j, golpeada: false, fallada: false });
        }
        // Corcheas a partir de la mitad
        if (progreso > 0.4 && rng() < progreso * 0.34) {
          notas.push({ t: t + NEGRA / 2, lane: Math.floor(rng() * 4), jugador: j, golpeada: false, fallada: false });
        }
      }
    }
    notas.sort((a, b) => a.t - b.t);
  }

  function medir() {
    return {
      laneW: Math.min(70, (W / 2 - 60) / 4),
      recept: H - 110,
    };
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      generar();
      banda.reset();
      sb = ui.scoreboard({ center: '0 %' });
      ui.toast(`${BPM} BPM · banda soul en vivo · no pierdas el combo`, { ms: 2400 });
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      reloj += dt;

      // Banda soul en vivo: marca el pulso con bajo, batería y acordes en
      // vez de un metrónomo plano, sin usar ninguna grabación con copyright.
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
          brilloTecla[j][l] = 1;
          juzgar(j, l);
        }
        for (let l = 0; l < 4; l++) brilloTecla[j][l] = Math.max(0, brilloTecla[j][l] - dt * 6);
        if (juicio[j]) { juicio[j].t -= dt; if (juicio[j].t <= 0) juicio[j] = null; }
      }

      // Notas pasadas sin golpear
      for (const n of notas) {
        if (n.golpeada || n.fallada) continue;
        if (reloj - n.t > 0.22) {
          n.fallada = true;
          romperCombo(n.jugador);
        }
      }

      sb.update(score[0], score[1]);
      const totalNotas = notas.length;
      const resueltas = notas.filter((n) => n.golpeada || n.fallada).length;
      sb.setCenter(`${Math.round((resueltas / totalNotas) * 100)} %`);

      if (resueltas >= totalNotas) terminar();
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#07030f');
      const { laneW, recept } = medir();

      // Pulso de fondo
      const faseBeat = ((reloj % NEGRA) + NEGRA) % NEGRA / NEGRA;
      g.save();
      g.globalAlpha = 0.07 * (1 - faseBeat);
      g.fillStyle = '#b04cff';
      g.fillRect(0, 0, W, H);
      g.restore();

      for (let j = 0; j < 2; j++) {
        const baseX = j === 0 ? W / 4 : (W * 3) / 4;
        const x0 = baseX - laneW * 2;
        const col = players[j].color;

        // Pistas
        for (let l = 0; l < 4; l++) {
          const x = x0 + l * laneW;
          g.fillStyle = l % 2 ? '#ffffff06' : '#ffffff03';
          g.fillRect(x, 0, laneW, recept + 40);
        }

        // Receptores
        for (let l = 0; l < 4; l++) {
          const x = x0 + l * laneW + laneW / 2;
          const br = brilloTecla[j][l];
          g.save();
          g.globalAlpha = 0.3 + br * 0.7;
          g.strokeStyle = col;
          g.lineWidth = 2 + br * 3;
          if (br > 0) { g.shadowColor = col; g.shadowBlur = 24 * br; }
          g.beginPath();
          g.roundRect(x - laneW * 0.38, recept - laneW * 0.38, laneW * 0.76, laneW * 0.76, 8);
          g.stroke();
          g.restore();
          ctx.engine.text(FLECHAS[l], x, recept, { size: laneW * 0.36, color: `rgba(255,255,255,${0.35 + br * 0.65})` });
        }

        // Notas
        for (const n of notas) {
          if (n.jugador !== j || n.golpeada) continue;
          const dtn = n.t - reloj;
          if (dtn > CAIDA || dtn < -0.35) continue;
          const y = recept - (dtn / CAIDA) * recept;
          const x = x0 + n.lane * laneW + laneW / 2;
          g.save();
          if (n.fallada) g.globalAlpha = 0.25;
          g.shadowColor = col;
          g.shadowBlur = 14;
          g.fillStyle = col;
          g.beginPath();
          g.roundRect(x - laneW * 0.34, y - laneW * 0.34, laneW * 0.68, laneW * 0.68, 7);
          g.fill();
          g.restore();
          ctx.engine.text(FLECHAS[n.lane], x, y, { size: laneW * 0.34, color: '#0a0a12' });
        }

        // Juicio y combo
        if (juicio[j]) {
          g.save();
          g.globalAlpha = clamp(juicio[j].t * 2.5, 0, 1);
          ctx.engine.text(juicio[j].texto, baseX, recept - 90, { size: 15, color: juicio[j].color, glow: 12 });
          g.restore();
        }
        if (combo[j] > 2) {
          ctx.engine.text(`${combo[j]}`, baseX, recept - 140, { size: 26, color: col, glow: 14 });
          ctx.engine.text('COMBO', baseX, recept - 116, { size: 9, color: '#ffffff66' });
        }

        ctx.engine.text(players[j].name, baseX, 40, { size: 11, color: col, font: 'system-ui' });
      }

      // Separador
      g.strokeStyle = '#ffffff12';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(W / 2, 30); g.lineTo(W / 2, H - 30); g.stroke();

      particles.render(g);
    },

    destroy() { sb?.remove(); },
  };

  function juzgar(j, lane) {
    // Se busca la nota más cercana en el tiempo dentro de la ventana.
    let mejor = null, mejorD = Infinity;
    for (const n of notas) {
      if (n.jugador !== j || n.lane !== lane || n.golpeada || n.fallada) continue;
      const d = Math.abs(n.t - reloj);
      if (d < mejorD) { mejorD = d; mejor = n; }
    }
    const ventana = JUICIOS[JUICIOS.length - 1].max;
    if (!mejor || mejorD > ventana) {
      // Pulsar sin nota rompe el combo: no se puede machacar a ciegas.
      romperCombo(j);
      audio.tick();
      return;
    }

    mejor.golpeada = true;
    const jz = JUICIOS.find((x) => mejorD <= x.max) || JUICIOS[JUICIOS.length - 1];
    combo[j]++;
    maxCombo[j] = Math.max(maxCombo[j], combo[j]);
    // El combo multiplica hasta ×2.
    const mult = 1 + Math.min(1, combo[j] / 50);
    score[j] += Math.round(jz.puntos * mult);
    juicio[j] = { texto: jz.nombre, color: jz.color, t: 0.5 };

    audio.tone({ freq: 660 + lane * 90, dur: 0.05, gain: 0.1, type: 'square' });
    haptics.play(jz.nombre === 'PERFECTO' ? 'impact' : 'click', { player: j, scale: 0.8 });

    const { laneW, recept } = medir();
    const baseX = j === 0 ? W / 4 : (W * 3) / 4;
    particles.burst(baseX - laneW * 2 + lane * laneW + laneW / 2, recept, 8, {
      speed: 170, color: jz.color, size: 4, shape: 'spark',
    });
  }

  function romperCombo(j) {
    if (combo[j] > 4) {
      juicio[j] = { texto: 'FALLO', color: '#ff4757', t: 0.5 };
      haptics.error(j);
    }
    combo[j] = 0;
  }

  function terminar() {
    terminado = true;
    const [a, b] = score;
    ctx.finish({
      winner: a === b ? -1 : a > b ? 0 : 1,
      scores: [a, b],
      detail: `Mejor combo: ${maxCombo[0]} · ${maxCombo[1]}`,
      record: ctx.record('puntos', Math.max(a, b), 'high'),
    });
  }
}
