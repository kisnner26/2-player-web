/**
 * Mudanza — el sofá por la escalera, cada uno de un extremo.
 *
 * El sofá es una barra rígida: si uno tira, el otro se ve arrastrado. Nadie
 * puede colocarlo solo, y cualquier intento de ir rápido lo estampa contra una
 * esquina. Es el clásico "gíralo, gíralo, ¡no, al revés!" convertido en juego.
 *
 * Los roces no matan, desgastan: cada golpe abolla el sofá y el resultado
 * final se mide en lo entero que llega, no en lo rápido. Eso premia la
 * paciencia y castiga exactamente lo que hace gracia ver fallar.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const LARGO = 128;             // largo del sofá
const VEL = 145;
const TIEMPO = 130;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let extremos = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  let muros = [], meta = { x: 0, y: 0, r: 0 };
  let integridad = 100, reloj = TIEMPO, roce = 0, t = 0, terminado = false;
  let sb = null, esc = 1;

  /** El piso: pasillos en L con puertas estrechas, en coordenadas 0..1. */
  const PLANO = [
    { x: 0.00, y: 0.00, w: 1.00, h: 0.16 },
    { x: 0.00, y: 0.00, w: 0.10, h: 1.00 },
    { x: 0.90, y: 0.00, w: 0.10, h: 1.00 },
    { x: 0.00, y: 0.86, w: 1.00, h: 0.14 },
    { x: 0.28, y: 0.16, w: 0.06, h: 0.42 },
    { x: 0.28, y: 0.70, w: 0.06, h: 0.16 },
    { x: 0.62, y: 0.30, w: 0.06, h: 0.44 },
    { x: 0.62, y: 0.16, w: 0.06, h: 0.06 },
    { x: 0.34, y: 0.52, w: 0.22, h: 0.06 },
  ];

  function medir() {
    esc = Math.min(W, H * 1.4);
    muros = PLANO.map((m) => ({
      x: m.x * W, y: m.y * H, w: m.w * W, h: m.h * H,
    }));
    meta = { x: W * 0.78, y: H * 0.78, r: Math.min(70, W * 0.07) };
    extremos = [
      { x: W * 0.16, y: H * 0.3 },
      { x: W * 0.16, y: H * 0.3 + LARGO },
    ];
  }

  function chocaPunto(x, y) {
    return muros.some((m) => x > m.x && x < m.x + m.w && y > m.y && y < m.y + m.h);
  }

  /** El sofá roza si cualquier punto de su cuerpo toca un muro. */
  function chocaSofa(a, b) {
    for (let s = 0; s <= 1.001; s += 0.08) {
      const x = a.x + (b.x - a.x) * s;
      const y = a.y + (b.y - a.y) * s;
      if (chocaPunto(x, y)) return { x, y };
    }
    return null;
  }

  function acabar(exito) {
    if (terminado) return;
    terminado = true;
    if (exito) { audio.win(); haptics.victory(null); } else { audio.lose(); }
    ctx.finish({
      winner: -1,
      scores: [Math.round(integridad), Math.round(TIEMPO - reloj)],
      detail: exito
        ? `¡Sofá colocado! llega al ${Math.round(integridad)}% en ${Math.round(TIEMPO - reloj)} s`
        : `Se acabó el tiempo con el sofá al ${Math.round(integridad)}%`,
      record: exito ? ctx.record('integridad', Math.round(integridad), 'high') : false,
    });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      medir();
      sb = ui.scoreboard({ center: 'meted el sofá' });
      sb.update(100, TIEMPO);
    },
    resize(nw, nh) { W = nw; H = nh; medir(); },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      roce = Math.max(0, roce - dt);
      particles.update(dt);
      reloj -= dt;
      if (reloj <= 0) { acabar(false); return; }

      const prop = [{ ...extremos[0] }, { ...extremos[1] }];
      for (const i of [0, 1]) {
        const pl = input.player(i);
        const ex = pl.ax, ey = pl.ay;
        const l = Math.hypot(ex, ey) || 1;
        prop[i].x += (ex / l) * VEL * dt;
        prop[i].y += (ey / l) * VEL * dt;
      }

      // La barra es rígida: se corrige la distancia repartiendo el error.
      const dx = prop[1].x - prop[0].x, dy = prop[1].y - prop[0].y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const err = (d - LARGO) / d;
      prop[0].x += dx * err * 0.5;
      prop[0].y += dy * err * 0.5;
      prop[1].x -= dx * err * 0.5;
      prop[1].y -= dy * err * 0.5;

      const golpe = chocaSofa(prop[0], prop[1]);
      if (golpe) {
        // No se avanza y se pierde integridad: el sofá "chirría" contra el muro.
        integridad = Math.max(0, integridad - 11 * dt);
        if (roce <= 0) {
          roce = 0.25;
          audio.tone({ freq: 130, dur: 0.09, gain: 0.09, type: 'sawtooth' });
          haptics.play('tick');
          particles.burst(golpe.x, golpe.y, 5, { speed: 90, color: '#c9a86a', size: 3, drag: 0.9 });
        }
        sb.update(Math.round(integridad), Math.ceil(reloj));
        if (integridad <= 0) { acabar(false); return; }
        return;
      }

      extremos = prop;
      sb.update(Math.round(integridad), Math.ceil(reloj));

      const centro = { x: (extremos[0].x + extremos[1].x) / 2, y: (extremos[0].y + extremos[1].y) / 2 };
      if (Math.hypot(centro.x - meta.x, centro.y - meta.y) < meta.r * 0.6) acabar(true);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#171320');

      // Suelo de parqué
      g.fillStyle = '#3a2a1e';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#00000018';
      for (let y = 0; y < H; y += 26) {
        for (let x = ((y / 26) % 2) * 40; x < W; x += 80) g.fillRect(x, y, 78, 24);
      }

      // Meta
      g.save();
      g.strokeStyle = '#a8ff3e';
      g.lineWidth = 3;
      g.setLineDash([8, 8]);
      g.strokeRect(meta.x - meta.r, meta.y - meta.r * 0.6, meta.r * 2, meta.r * 1.2);
      g.restore();
      ctx.engine.text('aquí', meta.x, meta.y, { size: 13, color: '#a8ff3e', font: 'system-ui' });

      for (const m of muros) {
        g.fillStyle = '#241c30';
        g.fillRect(m.x, m.y, m.w, m.h);
        g.fillStyle = '#342a44';
        g.fillRect(m.x, m.y, m.w, Math.min(8, m.h));
      }

      particles.render(g);

      // Sofá
      const a = extremos[0], b = extremos[1];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      g.save();
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
      g.rotate(ang);
      const desgaste = clamp(integridad / 100, 0, 1);
      g.fillStyle = `rgb(${Math.round(90 + desgaste * 90)},${Math.round(50 + desgaste * 40)},${Math.round(120 + desgaste * 40)})`;
      g.shadowColor = roce > 0 ? '#ff4757' : '#000000aa';
      g.shadowBlur = roce > 0 ? 24 : 12;
      g.beginPath(); g.roundRect(-LARGO / 2 - 8, -22, LARGO + 16, 44, 12); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#00000033';
      g.beginPath(); g.roundRect(-LARGO / 2 + 4, -14, LARGO - 8, 28, 8); g.fill();
      g.restore();

      for (const i of [0, 1]) {
        const e = extremos[i];
        ctx.engine.glowCircle(e.x, e.y, 12, players[i].color, 16);
        ctx.engine.text(players[i].name, e.x, e.y - 24, {
          size: 11, color: players[i].color, font: 'system-ui',
        });
      }

      // Estado
      g.fillStyle = '#00000099';
      g.fillRect(W / 2 - 110, 18, 220, 10);
      g.fillStyle = integridad < 35 ? '#ff4757' : '#a8ff3e';
      g.fillRect(W / 2 - 110, 18, 220 * (integridad / 100), 10);
      ctx.engine.text(`sofá ${Math.round(integridad)}% · ${Math.ceil(Math.max(0, reloj))}s`,
        W / 2, 42, { size: 12, color: '#d8c8b0', font: 'system-ui' });

      ctx.engine.text('Cada uno mueve su extremo · el sofá es rígido: si uno tira, el otro va detrás',
        W / 2, H - 12, { size: 11, color: '#8a7a68', font: 'system-ui' });
    },
  };
}
