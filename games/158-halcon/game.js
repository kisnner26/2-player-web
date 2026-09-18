/**
 * Ojo de Halcón — todo igual menos una cosa, y está en uno de los cuatro lados.
 *
 * No hay cursor que mover: se contesta con la dirección del cuadrante donde
 * está el intruso, así que entre verlo y decirlo no hay ni una décima perdida.
 * Es puro ojo.
 *
 * Cada ronda que se resuelve, la rejilla crece y la diferencia se afina — se
 * empieza distinguiendo un círculo de un cuadrado y se acaba distinguiendo dos
 * tonos del mismo color. Ahí es donde la gente empieza a acercarse a la
 * pantalla sin darse cuenta.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 8;
const CASTIGO = 1.4;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let cols = 4, filas = 3, intruso = 0, cuadrante = 0, nivel = 0;
  let base = { forma: 0, tono: 0, giro: 0 }, raro = { forma: 0, tono: 0, giro: 0 };
  let fase = 'espera', reloj = 1, t = 0, acertante = -1;
  const jug = [{ i: 0, puntos: 0, hielo: 0 }, { i: 1, puntos: 0, hielo: 0 }];
  let sb = null;
  const POS = ['up', 'right', 'down', 'left'];   // arriba, derecha, abajo, izquierda

  const TONOS = ['#ff2e88', '#00e5ff', '#a8ff3e', '#ffd166', '#b04cff', '#ff8c42'];

  function nuevaRonda() {
    nivel = jug[0].puntos + jug[1].puntos;
    cols = 4 + Math.min(6, Math.floor(nivel / 2));
    filas = 3 + Math.min(4, Math.floor(nivel / 3));
    const tono = Math.floor(rng() * TONOS.length);
    base = { forma: Math.floor(rng() * 3), tono, giro: 0 };

    // La diferencia se va afinando: forma → giro → tono casi idéntico.
    const modo = nivel < 3 ? 0 : nivel < 6 ? Math.floor(rng() * 2) : Math.floor(rng() * 3);
    raro = { ...base };
    if (modo === 0) raro.forma = (base.forma + 1 + Math.floor(rng() * 2)) % 3;
    else if (modo === 1) raro.giro = 0.5 + rng() * 0.5;
    else raro.tono = -1;        // -1 = mismo color pero un pelín más claro

    // El intruso va en una casilla cualquiera y el cuadrante se deduce de
    // ella. Repartir al revés dejaba las esquinas en dos cuadrantes a la vez,
    // que es la peor injusticia posible en un juego de reflejos.
    intruso = Math.floor(rng() * cols * filas);
    cuadrante = regionDe(intruso);

    fase = 'buscando';
    reloj = 9;
    acertante = -1;
    audio.blip();
  }

  /**
   * Cuadrante de una casilla: el eje que más se aleja del centro manda, así
   * que la rejilla queda partida en cuatro cuñas sin solapes.
   */
  function regionDe(i) {
    const dx = (i % cols) - (cols - 1) / 2;
    const dy = Math.floor(i / cols) - (filas - 1) / 2;
    // Se normaliza por el tamaño de cada eje: si no, en rejillas anchas todo
    // caería a izquierda o derecha.
    const nx = dx / Math.max(1, cols - 1);
    const ny = dy / Math.max(1, filas - 1);
    if (Math.abs(nx) >= Math.abs(ny)) return nx >= 0 ? 1 : 3;
    return ny >= 0 ? 2 : 0;
  }

  function pintar(g, x, y, r, cfg, resaltar) {
    const col = cfg.tono === -1 ? aclarar(TONOS[base.tono]) : TONOS[cfg.tono];
    g.save();
    g.translate(x, y);
    g.rotate(cfg.giro * TAU / 4);
    g.fillStyle = col;
    if (resaltar) { g.shadowColor = '#ffffff'; g.shadowBlur = 22; }
    if (cfg.forma === 0) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); }
    else if (cfg.forma === 1) g.fillRect(-r, -r, r * 2, r * 2);
    else {
      g.beginPath();
      g.moveTo(0, -r); g.lineTo(r, r * 0.8); g.lineTo(-r, r * 0.8);
      g.closePath(); g.fill();
    }
    g.restore();
  }

  /** Aclarado sutil: la diferencia de tono más difícil del juego. */
  function aclarar(hex) {
    const n = parseInt(hex.slice(1), 16);
    const sube = (v) => Math.min(255, Math.round(v + 34));
    return `rgb(${sube((n >> 16) & 255)},${sube((n >> 8) & 255)},${sube(n & 255)})`;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      fase = 'espera';
      reloj = 1;
      sb = ui.scoreboard({ center: `a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      t += dt;
      particles.update(dt);
      for (const p of jug) if (p.hielo > 0) p.hielo -= dt;

      if (fase !== 'buscando') {
        reloj -= dt;
        if (reloj <= 0) {
          const g = jug.find((p) => p.puntos >= PARA_GANAR);
          if (g) { ctx.finish({ winner: g.i, scores: [jug[0].puntos, jug[1].puntos] }); return; }
          nuevaRonda();
        }
        return;
      }

      reloj -= dt;
      for (const p of jug) {
        if (p.hielo > 0) continue;
        const pl = input.player(p.i);
        for (let k = 0; k < 4; k++) {
          if (!pl.pressed(POS[k])) continue;
          if (k === cuadrante) {
            p.puntos++;
            acertante = p.i;
            fase = 'resuelta';
            reloj = 1.1;
            sb.update(jug[0].puntos, jug[1].puntos);
            audio.score(p.i);
            haptics.score(p.i);
            particles.burst(W / 2, H * 0.5, 22, { speed: 240, color: players[p.i].color, size: 4, drag: 0.9 });
          } else {
            p.hielo = CASTIGO;
            audio.error();
            haptics.error(p.i);
            ctx.shake(4);
          }
          break;
        }
      }
      if (reloj <= 0) { fase = 'resuelta'; reloj = 1.3; }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#06060d');

      const an = Math.min((W * 0.8) / cols, (H * 0.66) / filas);
      const ox = (W - an * cols) / 2;
      const oy = H * 0.2;
      const r = an * 0.32;

      for (let i = 0; i < cols * filas; i++) {
        const x = ox + (i % cols + 0.5) * an;
        const y = oy + (Math.floor(i / cols) + 0.5) * an;
        const esRaro = i === intruso;
        g.save();
        g.globalAlpha = fase === 'buscando' ? 1 : (esRaro ? 1 : 0.28);
        pintar(g, x, y, r, esRaro ? raro : base, fase === 'resuelta' && esRaro);
        g.restore();
      }

      // Guías de cuadrante, muy suaves.
      g.strokeStyle = '#ffffff0d';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(ox + an * cols / 2, oy); g.lineTo(ox + an * cols / 2, oy + an * filas);
      g.moveTo(ox, oy + an * filas / 2); g.lineTo(ox + an * cols, oy + an * filas / 2);
      g.stroke();

      const etiquetas = ['↑ arriba', '→ derecha', '↓ abajo', '← izquierda'];
      ctx.engine.text(fase === 'buscando' ? '¿dónde está el distinto?' : etiquetas[cuadrante],
        W / 2, H * 0.13, { size: 18, color: fase === 'buscando' ? '#f2f2ff' : '#a8ff3e', font: 'system-ui' });

      for (const p of jug) {
        const x = p.i === 0 ? 26 : W - 26;
        const al = p.i === 0 ? 'left' : 'right';
        ctx.engine.text(String(p.puntos), x, H * 0.12, { size: 32, color: players[p.i].color, align: al });
        if (p.hielo > 0) {
          g.save();
          g.globalAlpha = 0.5 + Math.sin(t * 22) * 0.3;
          ctx.engine.text('fallo', x, H * 0.18, { size: 12, color: '#ff4757', align: al, font: 'system-ui' });
          g.restore();
        }
      }
      if (acertante >= 0 && fase === 'resuelta') {
        ctx.engine.text(`${players[acertante].name} lo ve`, W / 2, H * 0.92,
          { size: 15, color: players[acertante].color, font: 'system-ui' });
      }

      particles.render(g);
      ctx.engine.text('Pulsa la dirección del cuadrante donde está el intruso · fallar bloquea',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
