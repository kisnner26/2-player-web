/**
 * Topos — dos rejillas de 3×3, una por jugador, mapeadas a teclas contiguas.
 *
 * Cada jugador usa un bloque de nueve teclas que caen bajo su mano izquierda o
 * derecha, así que la posición de la tecla coincide con la posición del agujero
 * en pantalla: se juega por memoria muscular, no leyendo etiquetas.
 *
 * Este juego lee `e.code` en crudo (no el mapeo de acciones) porque necesita
 * nueve teclas por jugador, más de las seis que expone el sistema de control.
 */

import { TAU, clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const DURACION = 40;
const TECLAS = [
  ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyX', 'KeyC'],
  ['KeyU', 'KeyI', 'KeyO', 'KeyJ', 'KeyK', 'KeyL', 'KeyM', 'Comma', 'Period'],
];
const ETIQUETAS = [
  ['Q', 'W', 'E', 'A', 'S', 'D', 'Z', 'X', 'C'],
  ['U', 'I', 'O', 'J', 'K', 'L', 'M', ',', '.'],
];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  const score = [0, 0];
  const fallos = [0, 0];
  // Cada celda: null o { tipo:'topo'|'bomba', vida, aparecido }
  const celdas = [new Array(9).fill(null), new Array(9).fill(null)];
  const golpe = [new Array(9).fill(0), new Array(9).fill(0)];
  let tiempo = DURACION;
  let spawn = [0.6, 0.6];
  let sb = null;
  let desuscribir = null;

  function aparecer(lado) {
    const libres = [];
    for (let k = 0; k < 9; k++) if (!celdas[lado][k]) libres.push(k);
    if (!libres.length) return;
    const k = libres[Math.floor(rng() * libres.length)];
    // Las bombas aparecen más a menudo según avanza la partida.
    const progreso = 1 - tiempo / DURACION;
    const esBomba = rng() < 0.14 + progreso * 0.16;
    celdas[lado][k] = {
      tipo: esBomba ? 'bomba' : 'topo',
      vida: esBomba ? 1.5 : clamp(1.5 - progreso * 0.75, 0.6, 1.5),
      max: 0,
    };
    celdas[lado][k].max = celdas[lado][k].vida;
  }

  function pulsar(lado, k) {
    golpe[lado][k] = 1;
    const c = celdas[lado][k];
    if (!c) {
      // Golpear un agujero vacío también penaliza: castiga el machaque.
      fallos[lado]++;
      score[lado] = Math.max(0, score[lado] - 1);
      audio.tick();
      haptics.play('tick', { player: lado });
      sb.update(score[0], score[1]);
      return;
    }
    celdas[lado][k] = null;
    const px = posX(lado, k), py = posY(k);
    if (c.tipo === 'bomba') {
      score[lado] = Math.max(0, score[lado] - 3);
      fallos[lado]++;
      audio.explosion();
      haptics.explosion(lado);
      ctx.shake(10);
      particles.burst(px, py, 22, { speed: 220, color: '#ff4757', size: 5 });
    } else {
      score[lado]++;
      audio.pickup();
      haptics.play('impact', { player: lado, scale: 0.7 });
      particles.burst(px, py, 12, { speed: 170, color: players[lado].color, size: 4 });
    }
    sb.update(score[0], score[1]);
  }

  function posX(lado, k) {
    const anchoLado = W / 2;
    const cellW = Math.min(anchoLado / 4.2, H / 5.2);
    const baseX = lado === 0 ? anchoLado / 2 : anchoLado + anchoLado / 2;
    return baseX + ((k % 3) - 1) * cellW * 1.15;
  }
  function posY(k) {
    const cellW = Math.min(W / 2 / 4.2, H / 5.2);
    return H * 0.52 + (Math.floor(k / 3) - 1) * cellW * 1.15;
  }
  function radio() {
    return Math.min(W / 2 / 4.2, H / 5.2) * 0.46;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      sb = ui.scoreboard({ center: `${DURACION}s` });
      desuscribir = input.onAny((e) => {
        for (let lado = 0; lado < 2; lado++) {
          const k = TECLAS[lado].indexOf(e.code);
          if (k >= 0) { pulsar(lado, k); return; }
        }
      });
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      tiempo -= dt;
      sb.setCenter(`${Math.max(0, tiempo).toFixed(1)}s`);
      if (tiempo <= 0) return terminar();

      for (let lado = 0; lado < 2; lado++) {
        spawn[lado] -= dt;
        if (spawn[lado] <= 0) {
          aparecer(lado);
          const progreso = 1 - tiempo / DURACION;
          spawn[lado] = clamp(0.85 - progreso * 0.55, 0.24, 0.85) * (0.7 + rng() * 0.6);
        }
        for (let k = 0; k < 9; k++) {
          const c = celdas[lado][k];
          if (c) {
            c.vida -= dt;
            if (c.vida <= 0) {
              celdas[lado][k] = null;
              // Dejar escapar un topo no penaliza; dejar una bomba, tampoco.
              if (c.tipo === 'topo') audio.back();
            }
          }
          golpe[lado][k] = Math.max(0, golpe[lado][k] - dt * 6);
        }
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#12200e');

      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#1a2c14');
      grd.addColorStop(1, '#2e4620');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // Separador
      g.strokeStyle = '#ffffff18';
      g.lineWidth = 3;
      g.setLineDash([12, 12]);
      g.beginPath(); g.moveTo(W / 2, 60); g.lineTo(W / 2, H - 40); g.stroke();
      g.setLineDash([]);

      const r = radio();

      for (let lado = 0; lado < 2; lado++) {
        const col = players[lado].color;
        for (let k = 0; k < 9; k++) {
          const x = posX(lado, k), y = posY(k);

          // Agujero
          g.save();
          g.fillStyle = '#1a1208';
          g.beginPath(); g.ellipse(x, y + r * 0.25, r * 1.05, r * 0.55, 0, 0, TAU); g.fill();
          g.restore();

          const c = celdas[lado][k];
          if (c) {
            const t = c.vida / c.max;
            // Sale y se esconde: escala según el tiempo restante.
            const salida = clamp(Math.min(1, (1 - t) * 5, t * 5), 0, 1);
            const alto = r * 1.5 * salida;
            g.save();
            g.beginPath();
            g.rect(x - r * 1.1, y - r * 2, r * 2.2, r * 2 + r * 0.25);
            g.clip();
            if (c.tipo === 'bomba') {
              g.shadowColor = '#ff4757'; g.shadowBlur = 18;
              g.fillStyle = '#2a2a33';
              g.beginPath(); g.arc(x, y + r * 0.25 - alto, r * 0.72, 0, TAU); g.fill();
              g.shadowBlur = 0;
              g.strokeStyle = '#ffd166'; g.lineWidth = 3;
              g.beginPath();
              g.moveTo(x + r * 0.4, y + r * 0.25 - alto - r * 0.55);
              g.lineTo(x + r * 0.7, y + r * 0.25 - alto - r * 0.95);
              g.stroke();
            } else {
              g.fillStyle = '#8a6a4a';
              g.beginPath(); g.arc(x, y + r * 0.25 - alto, r * 0.75, 0, TAU); g.fill();
              g.fillStyle = '#c9a86b';
              g.beginPath(); g.ellipse(x, y + r * 0.45 - alto, r * 0.4, r * 0.3, 0, 0, TAU); g.fill();
              g.fillStyle = '#111';
              g.beginPath(); g.arc(x - r * 0.26, y + r * 0.1 - alto, r * 0.1, 0, TAU); g.fill();
              g.beginPath(); g.arc(x + r * 0.26, y + r * 0.1 - alto, r * 0.1, 0, TAU); g.fill();
            }
            g.restore();
          }

          // Aro de la tecla
          const gl = golpe[lado][k];
          g.save();
          g.globalAlpha = 0.35 + gl * 0.65;
          g.strokeStyle = col;
          g.lineWidth = 2 + gl * 3;
          g.beginPath(); g.ellipse(x, y + r * 0.25, r * 1.05, r * 0.55, 0, 0, TAU); g.stroke();
          g.restore();

          ctx.engine.text(ETIQUETAS[lado][k], x, y + r * 1.15, {
            size: 11, color: '#ffffff88', font: 'system-ui',
          });
        }
      }

      particles.render(g);
    },

    destroy() { sb?.remove(); desuscribir?.(); },
  };

  function terminar() {
    const [a, b] = score;
    ctx.finish({
      winner: a === b ? -1 : a > b ? 0 : 1,
      scores: [a, b],
      detail: `Fallos: ${fallos[0]} · ${fallos[1]}`,
      record: ctx.record('topos', Math.max(a, b), 'high'),
    });
  }
}
