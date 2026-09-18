/**
 * Esgrima — duelo de estocadas por el control del terreno.
 *
 * No se gana matando, se gana avanzando: al morir reapareces y el rival
 * conserva el terreno ganado. Tres alturas de guarda (alta, media, baja):
 * si tu punta está a la altura del cuerpo del otro y él no cubre esa altura,
 * el golpe entra.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const SALAS = 5;              // pantallas de terreno
const VEL = 210;
const ALCANCE = 62;
const ESTOCADA_DUR = 0.2;
const RECARGA = 0.3;
const REAPARICION = 1.0;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let suelo = 0;
  let sala = Math.floor(SALAS / 2);       // 0 = salida de P1, SALAS-1 = salida de P2
  const jug = [esgrimista(0), esgrimista(1)];
  let sb = null, congelado = 0;

  function esgrimista(i) {
    return { i, x: 0, guarda: 1, estocada: 0, recarga: 0, vivo: true, revive: 0,
             mirando: i === 0 ? 1 : -1, muertes: 0 };
  }

  function colocarEnSala(quienAvanza = -1) {
    suelo = H * 0.72;
    if (quienAvanza === 0) { jug[0].x = W * 0.2; jug[1].x = W * 0.8; }
    else if (quienAvanza === 1) { jug[0].x = W * 0.2; jug[1].x = W * 0.8; }
    else { jug[0].x = W * 0.3; jug[1].x = W * 0.7; }
    for (const p of jug) { p.estocada = 0; p.recarga = 0; p.guarda = 1; }
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      colocarEnSala();
      for (const p of jug) { p.vivo = true; p.revive = 0; }
      sb = ui.scoreboard({ center: `sala ${sala + 1} / ${SALAS}` });
      ui.toast('Avanza hasta la salida del rival', { ms: 2200 });
    },
    resize(nw, nh) { W = nw; H = nh; suelo = H * 0.72; },

    update(dt) {
      if (congelado > 0) { congelado -= dt; particles.update(dt); return; }

      for (const p of jug) {
        const pl = input.player(p.i);

        if (!p.vivo) {
          p.revive -= dt;
          if (p.revive <= 0) {
            p.vivo = true;
            // Reaparece en su propio lado de la sala actual.
            p.x = p.i === 0 ? W * 0.12 : W * 0.88;
            p.estocada = 0;
          }
          continue;
        }

        // Guarda: arriba / media / abajo
        if (pl.pressed('up')) { p.guarda = 0; audio.tick(); }
        if (pl.pressed('down')) { p.guarda = 2; audio.tick(); }
        if (!pl.held('up') && !pl.held('down')) p.guarda = 1;

        const dx = pl.x;
        if (dx) p.mirando = dx;
        // Durante la estocada no puedes moverte: compromete.
        if (p.estocada <= 0) p.x = clamp(p.x + dx * VEL * dt, 24, W - 24);

        if (p.recarga > 0) p.recarga -= dt;
        if (p.estocada > 0) p.estocada -= dt;
        if (pl.pressed('a') && p.recarga <= 0 && p.estocada <= 0) {
          p.estocada = ESTOCADA_DUR;
          p.recarga = ESTOCADA_DUR + RECARGA;
          audio.swoosh();
          haptics.play('tap', { player: p.i });
        }
      }

      resolverEstocadas();

      // Cambio de sala al salir por un borde
      if (jug[0].vivo && jug[0].x >= W - 26 && !jug[1].vivo) avanzar(0);
      if (jug[1].vivo && jug[1].x <= 26 && !jug[0].vivo) avanzar(1);

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a0612');

      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#160c22');
      grd.addColorStop(1, '#2a1030');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // Suelo
      g.fillStyle = '#2c1a38';
      g.fillRect(0, suelo, W, H - suelo);
      g.fillStyle = '#453055';
      g.fillRect(0, suelo, W, 4);

      // Progreso de salas
      const bw = W * 0.5, bx = (W - bw) / 2, by = 62;
      g.fillStyle = '#ffffff14';
      g.fillRect(bx, by, bw, 10);
      const seg = bw / SALAS;
      for (let k = 0; k < SALAS; k++) {
        g.strokeStyle = '#ffffff22';
        g.lineWidth = 1;
        g.strokeRect(bx + k * seg, by, seg, 10);
      }
      g.fillStyle = players[0].color;
      g.fillRect(bx, by, seg * sala, 10);
      g.fillStyle = players[1].color;
      g.fillRect(bx + seg * (sala + 1), by, bw - seg * (sala + 1), 10);
      g.fillStyle = '#fff';
      g.fillRect(bx + seg * sala, by - 3, seg, 16);

      particles.render(g);

      for (const p of jug) {
        const col = players[p.i].color;
        const y = suelo;
        g.save();
        if (!p.vivo) {
          g.globalAlpha = 0.25;
        }
        // Cuerpo
        g.shadowColor = col; g.shadowBlur = 14;
        g.fillStyle = col;
        g.fillRect(p.x - 8, y - 54, 16, 54);
        g.shadowBlur = 0;
        g.fillStyle = '#0f0a16';
        g.fillRect(p.x - 5, y - 50, 10, 12);

        if (p.vivo) {
          // Espada: la altura depende de la guarda, el largo de la estocada.
          const alturaY = y - [46, 32, 16][p.guarda];
          const ext = p.estocada > 0 ? ALCANCE : ALCANCE * 0.45;
          g.strokeStyle = '#e8e8ff';
          g.lineWidth = 3;
          g.shadowColor = '#fff';
          g.shadowBlur = p.estocada > 0 ? 16 : 4;
          g.beginPath();
          g.moveTo(p.x + p.mirando * 8, alturaY);
          g.lineTo(p.x + p.mirando * ext, alturaY);
          g.stroke();
          g.restore();

          // Marca de guarda
          g.fillStyle = col;
          g.globalAlpha = 0.5;
          g.fillRect(p.x - 14, alturaY - 1, 3, 3);
          g.globalAlpha = 1;
        } else {
          g.restore();
        }
      }
    },

    destroy() { sb?.remove(); },
  };

  function resolverEstocadas() {
    for (const atacante of jug) {
      if (!atacante.vivo || atacante.estocada <= 0) continue;
      const victima = jug[1 - atacante.i];
      if (!victima.vivo) continue;

      const punta = atacante.x + atacante.mirando * ALCANCE;
      const alcanza = atacante.mirando > 0
        ? punta >= victima.x - 10 && atacante.x < victima.x
        : punta <= victima.x + 10 && atacante.x > victima.x;
      if (!alcanza) continue;

      // Choque de espadas: si el otro también ataca a la misma altura, se paran.
      if (victima.estocada > 0 && victima.guarda === atacante.guarda) {
        atacante.estocada = 0; victima.estocada = 0;
        atacante.recarga = victima.recarga = 0.35;
        audio.hit();
        haptics.impact(null, 0.8);
        ctx.shake(6);
        particles.burst((atacante.x + victima.x) / 2, suelo - 32, 12, {
          speed: 220, color: '#fff', size: 3, shape: 'spark',
        });
        continue;
      }
      // Parada: la guarda del defensor cubre la altura del ataque.
      if (victima.guarda === atacante.guarda && victima.estocada <= 0) {
        atacante.estocada = 0;
        atacante.recarga = 0.45;
        audio.tick();
        haptics.play('bounce', { player: victima.i });
        particles.burst(victima.x, suelo - 32, 8, { speed: 150, color: '#ffd166', size: 3, shape: 'spark' });
        continue;
      }
      abatir(victima, atacante);
    }
  }

  function abatir(victima, atacante) {
    victima.vivo = false;
    victima.revive = REAPARICION;
    victima.muertes++;
    atacante.estocada = 0;
    audio.hit();
    haptics.impact(atacante.i, 1.4);
    haptics.defeat(victima.i);
    ctx.shake(14);
    particles.burst(victima.x, suelo - 30, 30, {
      speed: 260, color: players[victima.i].color, size: 5, gravity: 500,
    });
    sb.update(jug[1].muertes, jug[0].muertes);   // toques dados por cada uno
  }

  function avanzar(quien) {
    const dir = quien === 0 ? 1 : -1;
    sala += dir;
    audio.score(quien);
    haptics.score(quien);

    if (sala < 0 || sala >= SALAS) {
      ctx.finish({
        winner: quien,
        scores: [jug[1].muertes, jug[0].muertes],
        detail: 'Llegó a la salida',
      });
      return;
    }
    sb.setCenter(`sala ${sala + 1} / ${SALAS}`);
    ui.toast(`${players[quien].name} avanza`, { ms: 1100, color: players[quien].color });
    congelado = 0.5;
    colocarEnSala(quien);
    for (const p of jug) { p.vivo = true; p.revive = 0; }
  }
}
