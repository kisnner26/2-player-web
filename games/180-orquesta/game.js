/**
 * Orquesta — dos instrumentos, una pieza, y los fallos se oyen.
 *
 * Cada uno lleva su pentagrama y sus cuatro notas. Lo que convierte esto en
 * cooperativo y no en dos juegos de ritmo en paralelo son los ACORDES: notas
 * marcadas que hay que tocar a la vez. Si uno llega tarde, suena desafinado y
 * los dos pierden la racha.
 *
 * La afinación es un único medidor compartido. Cada nota clavada la sube y
 * cada fallo la baja; si se desploma, el público se va y la pieza se acaba
 * antes de tiempo.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const CARRILES = 4;
const ACCIONES = ['left', 'up', 'down', 'right'];
const VELOCIDAD = 260;         // píxeles por segundo que baja la partitura
const VENTANA = 0.14;          // segundos de tolerancia
const NOTAS_BASE = [262, 330, 392, 494];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let notas = [], tiempo = 0, duracion = 78, terminado = false;
  let afinacion = 65, racha = 0, mejorRacha = 0;
  const marcador = [{ buenas: 0, falladas: 0 }, { buenas: 0, falladas: 0 }];
  let sb = null, brillo = [0, 0], acordeFallado = 0;

  function componer() {
    notas = [];
    let t = 3;
    let compas = 0;
    while (t < duracion) {
      compas++;
      const acorde = compas % 4 === 0;
      if (acorde) {
        // Acorde: los dos, mismo instante, carriles distintos.
        const c0 = Math.floor(rng() * CARRILES);
        const c1 = Math.floor(rng() * CARRILES);
        notas.push({ j: 0, carril: c0, t, acorde: true, hecha: false, fallada: false });
        notas.push({ j: 1, carril: c1, t, acorde: true, hecha: false, fallada: false });
      } else {
        const cuantas = 1 + Math.floor(rng() * 2);
        for (let k = 0; k < cuantas; k++) {
          notas.push({
            j: Math.floor(rng() * 2), carril: Math.floor(rng() * CARRILES),
            t: t + k * 0.22, acorde: false, hecha: false, fallada: false,
          });
        }
      }
      t += 0.42 + rng() * 0.34;
    }
  }

  const lineaY = () => H * 0.82;
  const carrilX = (j, c) => {
    const centro = W * (j === 0 ? 0.27 : 0.73);
    const paso = Math.min(64, W * 0.055);
    return centro + (c - (CARRILES - 1) / 2) * paso;
  };

  function acabar(motivo) {
    if (terminado) return;
    terminado = true;
    const total = marcador[0].buenas + marcador[1].buenas;
    audio.win();
    ctx.finish({
      winner: -1,
      scores: [marcador[0].buenas, marcador[1].buenas],
      detail: `${motivo} · ${total} notas limpias, mejor racha ${mejorRacha}`,
      record: ctx.record('racha', mejorRacha, 'high'),
    });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      componer();
      sb = ui.scoreboard({ center: 'tocad la pieza' });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      tiempo += dt;
      particles.update(dt);
      acordeFallado = Math.max(0, acordeFallado - dt);
      brillo = brillo.map((b) => Math.max(0, b - dt * 4));

      for (const j of [0, 1]) {
        const pl = input.player(j);
        ACCIONES.forEach((accion, c) => {
          if (!pl.pressed(accion)) return;
          const cand = notas.find((n) => n.j === j && n.carril === c && !n.hecha && !n.fallada
            && Math.abs(n.t - tiempo) <= VENTANA);
          if (cand) {
            cand.hecha = true;
            marcador[j].buenas++;
            racha++;
            mejorRacha = Math.max(mejorRacha, racha);
            afinacion = clamp(afinacion + (cand.acorde ? 2.2 : 1.2), 0, 100);
            brillo[j] = 1;
            audio.tone({ freq: NOTAS_BASE[c] * (j === 0 ? 1 : 2), dur: 0.16, gain: 0.16, type: j === 0 ? 'triangle' : 'square' });
            haptics.tick(j);
            particles.burst(carrilX(j, c), lineaY(), 8, { speed: 150, color: players[j].color, size: 3, drag: 0.9 });
          } else {
            marcador[j].falladas++;
            racha = 0;
            afinacion = clamp(afinacion - 1.6, 0, 100);
            audio.tone({ freq: 120, dur: 0.1, gain: 0.1, type: 'sawtooth' });
            haptics.error(j);
          }
        });
      }

      for (const n of notas) {
        if (n.hecha || n.fallada) continue;
        if (tiempo - n.t > VENTANA) {
          n.fallada = true;
          marcador[n.j].falladas++;
          racha = 0;
          afinacion = clamp(afinacion - (n.acorde ? 5.5 : 3), 0, 100);
          if (n.acorde) {
            acordeFallado = 0.8;
            audio.tone({ freq: 90, dur: 0.3, gain: 0.16, type: 'sawtooth', sweep: -30 });
            haptics.error(null);
            ctx.shake(5);
          }
        }
      }

      sb.update(marcador[0].buenas, marcador[1].buenas);

      if (afinacion <= 0) { acabar('El público se va a mitad de pieza'); return; }
      if (tiempo > duracion + 1.5) { acabar('¡Pieza terminada!'); }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0b0812');

      if (acordeFallado > 0) {
        g.fillStyle = `rgba(255,71,87,${acordeFallado * 0.18})`;
        g.fillRect(0, 0, W, H);
      }

      for (const j of [0, 1]) {
        const col = players[j].color;
        // Carriles
        for (let c = 0; c < CARRILES; c++) {
          const x = carrilX(j, c);
          g.fillStyle = '#ffffff06';
          g.fillRect(x - 24, H * 0.1, 48, lineaY() - H * 0.1);
        }
        // Línea de toque
        g.save();
        g.strokeStyle = col;
        g.lineWidth = 3;
        g.shadowColor = col;
        g.shadowBlur = 10 + brillo[j] * 26;
        g.beginPath();
        g.moveTo(carrilX(j, 0) - 28, lineaY());
        g.lineTo(carrilX(j, CARRILES - 1) + 28, lineaY());
        g.stroke();
        g.restore();
        ctx.engine.text(players[j].name, W * (j === 0 ? 0.27 : 0.73), H * 0.06,
          { size: 14, color: col, font: 'system-ui' });
        ctx.engine.text(`${marcador[j].buenas} limpias · ${marcador[j].falladas} falladas`,
          W * (j === 0 ? 0.27 : 0.73), H * 0.1, { size: 11, color: '#7a7a98', font: 'system-ui' });
      }

      for (const n of notas) {
        if (n.hecha) continue;
        const y = lineaY() - (n.t - tiempo) * VELOCIDAD;
        if (y < -40 || y > H + 40) continue;
        const x = carrilX(n.j, n.carril);
        const col = n.fallada ? '#4a4458' : (n.acorde ? '#ffd166' : players[n.j].color);
        g.save();
        if (!n.fallada) { g.shadowColor = col; g.shadowBlur = n.acorde ? 20 : 10; }
        g.fillStyle = col;
        g.beginPath();
        g.roundRect(x - 22, y - 9, 44, 18, 5);
        g.fill();
        g.restore();
        if (n.acorde && !n.fallada) {
          // Línea que une las dos notas del acorde: se ve que van juntas.
          const par = notas.find((m) => m !== n && m.acorde && m.t === n.t && m.j !== n.j);
          if (par && n.j === 0) {
            g.strokeStyle = '#ffd16644';
            g.lineWidth = 2;
            g.setLineDash([5, 6]);
            g.beginPath();
            g.moveTo(x + 24, y);
            g.lineTo(carrilX(par.j, par.carril) - 24, y);
            g.stroke();
            g.setLineDash([]);
          }
        }
      }

      // Afinación
      const bw = W * 0.36;
      g.fillStyle = '#1a1a2a';
      g.fillRect(W / 2 - bw / 2, H * 0.9, bw, 14);
      g.fillStyle = afinacion < 25 ? '#ff4757' : afinacion < 55 ? '#ffd166' : '#a8ff3e';
      g.fillRect(W / 2 - bw / 2, H * 0.9, bw * (afinacion / 100), 14);
      ctx.engine.text(`afinación · racha ${racha}`, W / 2, H * 0.875,
        { size: 12, color: '#8f8fb0', font: 'system-ui' });

      particles.render(g);
      ctx.engine.text('Cada uno sus cuatro direcciones · las notas doradas son acordes: hay que tocarlas a la vez',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
