/**
 * Karaoke a Dos — una canción con estrofas repartidas y estribillos juntos.
 *
 * No se cantan notas sueltas: se SOSTIENEN frases. Cada frase es una barra que
 * dura lo que dura, y hay que mantener la tecla exactamente ese rato — soltar
 * antes o pasarse la corta.
 *
 * Los estribillos van marcados y piden a los dos a la vez. Ahí es donde se
 * gana o se pierde la actuación, porque sostener a dúo es mucho más difícil
 * que sostener solo: uno siempre respira antes.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const VEL = 150;               // píxeles por segundo del rollo de letra

/** [texto, quién (0,1,2=dúo), duración] */
const CANCION = [
  ['Se apagan las farolas de la calle', 0, 1.6],
  ['y alguien pone un disco al otro lado', 1, 1.6],
  ['Los dos sabemos cómo sigue esto', 2, 2.0],
  ['y aun así lo volvemos a cantar', 2, 2.0],
  ['Tú llevabas el mapa del verano', 0, 1.8],
  ['yo llevaba las llaves y el reloj', 1, 1.8],
  ['Perdimos las dos cosas en el puerto', 2, 2.2],
  ['y no nos importó', 2, 1.6],
  ['Que suene otra vez', 0, 1.2],
  ['que suene otra vez', 1, 1.2],
  ['Aunque no nos sepamos la mitad', 2, 2.4],
  ['la cantamos igual', 2, 2.0],
];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let frases = [], tiempo = 0, terminado = false;
  let sostenido = [0, 0], puntos = 0, maximo = 0, racha = 0, mejorRacha = 0;
  let sb = null, brillo = [0, 0];

  function preparar() {
    frases = [];
    let t = 3;
    for (const [texto, quien, dur] of CANCION) {
      frases.push({ texto, quien, t, dur, cubierto: [0, 0], juzgada: false });
      maximo += dur * (quien === 2 ? 2 : 1);
      t += dur + 0.55;
    }
  }

  const lineaY = () => H * 0.66;

  function juzgar(f) {
    f.juzgada = true;
    const quienes = f.quien === 2 ? [0, 1] : [f.quien];
    let bien = 0;
    for (const j of quienes) {
      const p = clamp(f.cubierto[j] / f.dur, 0, 1);
      puntos += f.cubierto[j];
      if (p > 0.75) bien++;
    }
    if (bien === quienes.length) {
      racha++;
      mejorRacha = Math.max(mejorRacha, racha);
      audio.tone({ freq: 520 + racha * 25, dur: 0.2, gain: 0.13, type: 'sine' });
      haptics.score(f.quien === 2 ? null : f.quien);
      particles.burst(W / 2, lineaY(), 12, { speed: 160, color: '#ffd166', size: 4, drag: 0.9 });
    } else {
      racha = 0;
      audio.tone({ freq: 180, dur: 0.16, gain: 0.1, type: 'sawtooth' });
    }
    sb.update(Math.round(puntos), mejorRacha);
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      preparar();
      sb = ui.scoreboard({ center: 'cantad juntos' });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      tiempo += dt;
      particles.update(dt);
      brillo = brillo.map((b) => Math.max(0, b - dt * 4));

      for (const j of [0, 1]) sostenido[j] = input.player(j).held('a') ? 1 : 0;

      for (const f of frases) {
        if (f.juzgada) continue;
        const dentro = tiempo >= f.t && tiempo <= f.t + f.dur;
        if (dentro) {
          const quienes = f.quien === 2 ? [0, 1] : [f.quien];
          for (const j of quienes) {
            if (sostenido[j]) {
              f.cubierto[j] += dt;
              brillo[j] = 1;
              if (Math.random() < dt * 10) {
                particles.spawn({
                  x: W / 2 + (j === 0 ? -1 : 1) * (40 + Math.random() * 90), y: lineaY(),
                  vx: 0, vy: -50 - Math.random() * 40, life: 0.6, maxLife: 0.6,
                  size: 3, color: players[j].color, shape: 'circle',
                });
              }
            }
          }
        }
        if (tiempo > f.t + f.dur) juzgar(f);
      }

      const ultima = frases[frases.length - 1];
      if (tiempo > ultima.t + ultima.dur + 2) {
        terminado = true;
        const nota = clamp(puntos / maximo, 0, 1);
        audio.win();
        haptics.victory(null);
        ctx.finish({
          winner: -1,
          scores: [Math.round(nota * 100), mejorRacha],
          detail: `${Math.round(nota * 100)} de nota · mejor racha ${mejorRacha} frases`,
          record: ctx.record('nota', Math.round(nota * 100), 'high'),
        });
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d0618');

      const focos = g.createRadialGradient(W / 2, H * 0.2, 0, W / 2, H * 0.2, H);
      focos.addColorStop(0, '#2a1040');
      focos.addColorStop(1, '#08040f');
      g.fillStyle = focos;
      g.fillRect(0, 0, W, H);

      // Línea de canto
      g.save();
      g.strokeStyle = '#ffd166';
      g.lineWidth = 3;
      g.shadowColor = '#ffd166';
      g.shadowBlur = 14;
      g.beginPath(); g.moveTo(W * 0.08, lineaY()); g.lineTo(W * 0.92, lineaY()); g.stroke();
      g.restore();

      for (const f of frases) {
        const x0 = W * 0.5 + (f.t - tiempo) * VEL;
        const an = f.dur * VEL;
        if (x0 > W || x0 + an < 0) continue;
        const y = f.quien === 2 ? lineaY() - 34 : lineaY() - 34 + (f.quien === 0 ? -46 : 46);
        const col = f.quien === 2 ? '#ffd166' : players[f.quien].color;
        g.save();
        g.globalAlpha = f.juzgada ? 0.3 : 1;
        g.fillStyle = `${col}33`;
        g.beginPath(); g.roundRect(x0, y, an, 30, 8); g.fill();
        g.strokeStyle = col;
        g.lineWidth = 2;
        g.beginPath(); g.roundRect(x0, y, an, 30, 8); g.stroke();
        // Relleno de lo ya sostenido
        const quienes = f.quien === 2 ? [0, 1] : [f.quien];
        const medio = quienes.reduce((a, j) => a + f.cubierto[j], 0) / quienes.length;
        g.fillStyle = col;
        g.globalAlpha = 0.55;
        g.fillRect(x0, y, an * clamp(medio / f.dur, 0, 1), 30);
        g.restore();
        ctx.engine.text(f.texto, x0 + an / 2, y + 15, {
          size: 13, color: '#f6f2ff', font: 'system-ui',
        });
        if (f.quien === 2) {
          ctx.engine.text('LOS DOS', x0 + an / 2, y - 12, { size: 10, color: '#ffd166', font: 'system-ui' });
        }
      }

      // Micros
      for (const j of [0, 1]) {
        const x = W * (j === 0 ? 0.16 : 0.84);
        const y = H * 0.86;
        g.save();
        g.shadowColor = players[j].color;
        g.shadowBlur = 8 + brillo[j] * 30;
        g.fillStyle = sostenido[j] ? players[j].color : '#3a3550';
        g.beginPath(); g.roundRect(x - 9, y - 34, 18, 34, 9); g.fill();
        g.restore();
        g.fillStyle = '#2a2540';
        g.fillRect(x - 3, y, 6, 22);
        ctx.engine.text(players[j].name, x, y + 36, { size: 12, color: players[j].color, font: 'system-ui' });
      }

      particles.render(g);
      ctx.engine.text(`nota ${Math.round(clamp(puntos / maximo, 0, 1) * 100)} · racha ${racha}`,
        W / 2, H * 0.09, { size: 15, color: '#ffd166', font: 'system-ui' });
      ctx.engine.text('Mantén tu tecla mientras dure TU frase · las doradas se sostienen entre los dos',
        W / 2, H - 12, { size: 11, color: '#6a5a80', font: 'system-ui' });
    },
  };
}
