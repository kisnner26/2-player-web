/**
 * Torre a Dos — grúa por turnos: apilen la torre más alta posible.
 *
 * El bloque oscila sobre la torre y cada jugador suelta el suyo por turnos.
 * Lo que sobresale se corta, así que un error del primero se lo come el
 * segundo: la torre es de los dos y la culpa también.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const ALTO_BLOQUE = 26;
const ANCHO_INICIAL = 240;
const PERFECTO = 4;            // px de tolerancia para un apilado perfecto

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let torre = [];              // {x, w, due}
  let movil = null;            // {x, w, dir, vel}
  let turno = 0;
  let camara = 0;              // desplazamiento vertical de la vista
  let perfectos = 0;
  let sb = null;
  let terminado = false;
  let pausa = 0;

  function baseY() { return H - 60; }

  function reiniciar() {
    torre = [{ x: W / 2 - ANCHO_INICIAL / 2, w: ANCHO_INICIAL, due: -1 }];
    camara = 0;
    perfectos = 0;
    turno = 0;
    nuevoMovil();
  }

  function nuevoMovil() {
    const ultimo = torre[torre.length - 1];
    // La velocidad sube con la altura: la torre se vuelve exigente sola.
    const vel = 190 + torre.length * 11;
    movil = {
      x: turno === 0 ? 20 : W - ultimo.w - 20,
      w: ultimo.w,
      dir: turno === 0 ? 1 : -1,
      vel,
    };
  }

  function yDe(indice) {
    return baseY() - indice * ALTO_BLOQUE + camara;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: 'altura 1' });
      ui.banner(`Se turnan · <b>${players[0].name}</b> empieza`);
    },
    resize(nw, nh) { W = nw; H = nh; reiniciar(); },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      if (pausa > 0) { pausa -= dt; particles.update(dt); return; }

      if (movil) {
        movil.x += movil.dir * movil.vel * dt;
        if (movil.x <= 0) { movil.x = 0; movil.dir = 1; }
        if (movil.x + movil.w >= W) { movil.x = W - movil.w; movil.dir = -1; }

        if (input.player(turno).pressed('a')) soltar();
      }

      // La cámara sigue a la torre suavemente.
      const objetivo = Math.max(0, (torre.length - 8) * ALTO_BLOQUE);
      camara += (objetivo - camara) * Math.min(1, dt * 6);

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a0a18');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#10102a');
      grd.addColorStop(1, '#241a38');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // Suelo
      g.fillStyle = '#2a2038';
      g.fillRect(0, baseY() + camara + ALTO_BLOQUE * 0 + 2, W, H);

      // Torre
      torre.forEach((b, i) => {
        const y = yDe(i);
        if (y < -50 || y > H + 50) return;
        const col = b.due < 0 ? '#6b6b8a' : players[b.due].color;
        g.save();
        g.shadowColor = col;
        g.shadowBlur = 12;
        g.fillStyle = col;
        g.fillRect(b.x, y - ALTO_BLOQUE, b.w, ALTO_BLOQUE - 2);
        g.restore();
        g.fillStyle = '#ffffff28';
        g.fillRect(b.x, y - ALTO_BLOQUE, b.w, 3);
      });

      // Bloque móvil
      if (movil) {
        const y = yDe(torre.length);
        const col = players[turno].color;
        g.save();
        g.globalAlpha = 0.9;
        g.shadowColor = col;
        g.shadowBlur = 24;
        g.fillStyle = col;
        g.fillRect(movil.x, y - ALTO_BLOQUE, movil.w, ALTO_BLOQUE - 2);
        g.restore();
        // Cable de la grúa
        g.strokeStyle = '#ffffff44';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(movil.x + movil.w / 2, 0);
        g.lineTo(movil.x + movil.w / 2, y - ALTO_BLOQUE);
        g.stroke();

        // Guía de alineación con el bloque de abajo
        const ultimo = torre[torre.length - 1];
        g.strokeStyle = '#ffffff22';
        g.setLineDash([4, 6]);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(ultimo.x, 0); g.lineTo(ultimo.x, H);
        g.moveTo(ultimo.x + ultimo.w, 0); g.lineTo(ultimo.x + ultimo.w, H);
        g.stroke();
        g.setLineDash([]);
      }

      particles.render(g);

      // Indicador de turno
      ctx.engine.text(`Suelta ${players[turno].name}`, W / 2, 52, {
        size: 12, color: players[turno].color, font: 'system-ui',
      });
      if (perfectos > 1) {
        ctx.engine.text(`${perfectos} perfectos seguidos`, W / 2, H - 22, {
          size: 11, color: '#ffd166', font: 'system-ui',
        });
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function soltar() {
    const ultimo = torre[torre.length - 1];
    const izq = Math.max(movil.x, ultimo.x);
    const der = Math.min(movil.x + movil.w, ultimo.x + ultimo.w);
    const solape = der - izq;
    const y = yDe(torre.length);

    if (solape <= 0) {
      caer();
      return;
    }

    const desalineado = Math.abs(movil.x - ultimo.x);
    const esPerfecto = desalineado <= PERFECTO;

    if (esPerfecto) {
      // Un apilado perfecto no recorta: recompensa la precisión.
      perfectos++;
      torre.push({ x: ultimo.x, w: ultimo.w, due: turno });
      audio.win();
      haptics.play('victory', { player: turno, scale: 0.7 });
      ui.toast('¡Perfecto!', { ms: 800, color: '#ffd166' });
      particles.burst(ultimo.x + ultimo.w / 2, y, 18, {
        speed: 200, color: '#ffd166', size: 4, gravity: -60,
      });
    } else {
      perfectos = 0;
      torre.push({ x: izq, w: solape, due: turno });
      audio.thud();
      haptics.impact(turno, clamp(desalineado / 60, 0.5, 1.3));
      ctx.shake(clamp(desalineado / 10, 2, 8));
      // Trozo cortado que cae
      const trozoX = movil.x < ultimo.x ? movil.x : der;
      const trozoW = movil.w - solape;
      for (let k = 0; k < 10; k++) {
        particles.spawn({
          x: trozoX + (trozoW * k) / 10, y: y - ALTO_BLOQUE / 2,
          vx: (movil.x < ultimo.x ? -1 : 1) * (40 + Math.random() * 90),
          vy: -50 + Math.random() * 40,
          life: 1.1, maxLife: 1.1, size: 6, gravity: 900,
          color: players[turno].color,
        });
      }
    }

    sb.update(torre.length - 1, perfectos);
    sb.setCenter(`altura ${torre.length - 1}`);

    if (torre[torre.length - 1].w < 14) {
      finalizar('La torre se quedó demasiado fina');
      return;
    }

    turno = 1 - turno;
    nuevoMovil();
  }

  function caer() {
    audio.explosion();
    haptics.explosion(turno);
    ctx.shake(18);
    const y = yDe(torre.length);
    particles.burst(movil.x + movil.w / 2, y, 30, {
      speed: 200, color: players[turno].color, size: 6, gravity: 900,
    });
    finalizar('El bloque falló la torre por completo');
  }

  function finalizar(motivo) {
    terminado = true;
    const altura = torre.length - 1;
    const porJugador = [
      torre.filter((b) => b.due === 0).length,
      torre.filter((b) => b.due === 1).length,
    ];
    ctx.finish({
      winner: -1,
      scores: porJugador,
      detail: `Altura ${altura} · ${motivo}`,
      record: ctx.record('altura', altura, 'high'),
    });
  }
}
