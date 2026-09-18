/**
 * Un Paraguas para Dos — el paraguas no tiene dueño: está en el medio.
 *
 * El paraguas se coloca solo, en el punto medio de los dos, y cubre un ancho
 * fijo. Eso convierte la distancia entre ellos en la única variable que
 * importa: juntos, los dos secos; separados, los dos mojándose por fuera.
 *
 * Y para que no baste con pegarse y no mirar, el suelo tiene charcos que hay
 * que esquivar y el viento empuja el paraguas de lado, así que "juntos" hay
 * que renegociarlo cada dos segundos.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const DURACION = 70;
const ANCHO_PARAGUAS = 132;
const VEL = 250;
const MOJADO_MAX = 100;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [{ i: 0, x: 0 }, { i: 1, x: 0 }];
  let gotas = [], charcos = [];
  let mojado = [0, 0], viento = 0, proximoViento = 3;
  let tiempo = DURACION, secos = 0;
  let sb = null, terminado = false;

  const sueloY = () => H * 0.82;
  /** El paraguas está donde el punto medio, desviado por el viento. */
  const paraguasX = () => (jug[0].x + jug[1].x) / 2 + viento * 0.9;

  function reiniciar() {
    jug[0].x = W * 0.42; jug[1].x = W * 0.58;
    gotas = [];
    charcos = [];
    mojado = [0, 0];
    viento = 0; proximoViento = 3;
    tiempo = DURACION; secos = 0;
    terminado = false;
  }

  /** ¿Está este jugador bajo el paraguas? */
  function cubierto(p) {
    return Math.abs(p.x - paraguasX()) < ANCHO_PARAGUAS / 2;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('El paraguas va en el punto medio · sepárense y se mojan <b>los dos</b>');
    },
    resize(nw, nh) { W = nw; H = nh; reiniciar(); },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo -= dt;

      proximoViento -= dt;
      if (proximoViento <= 0) {
        viento = (rng() * 2 - 1) * 46;
        proximoViento = 4 + rng() * 4;
        audio.noise({ dur: 0.5, gain: 0.1, filter: 600, sweep: 400 });
      }

      for (const p of jug) {
        const pl = input.player(p.i);
        p.x = clamp(p.x + pl.x * VEL * dt, 24, W - 24);
      }

      // Lluvia
      if (rng() < dt * 55) {
        gotas.push({ x: rng() * W, y: -10, v: 420 + rng() * 260 });
      }
      for (let i = gotas.length - 1; i >= 0; i--) {
        const d = gotas[i];
        d.y += d.v * dt;
        d.x += viento * dt * 0.5;

        // El paraguas para la gota si pasa por su altura dentro de su ancho.
        const py = H * 0.42;
        if (d.y > py && d.y < py + 16 && Math.abs(d.x - paraguasX()) < ANCHO_PARAGUAS / 2) {
          gotas.splice(i, 1);
          particles.spawn({
            x: d.x, y: py, vx: (rng() - 0.5) * 90, vy: 60, life: 0.4, maxLife: 0.4,
            size: 2, color: '#8fd5ff', gravity: 400, shape: 'circle',
          });
          continue;
        }
        if (d.y > sueloY()) { gotas.splice(i, 1); continue; }

        for (const p of jug) {
          if (Math.abs(d.x - p.x) < 18 && Math.abs(d.y - (sueloY() - 34)) < 30) {
            gotas.splice(i, 1);
            if (!cubierto(p)) {
              mojado[p.i] = clamp(mojado[p.i] + 2.1, 0, MOJADO_MAX);
              if (rng() < 0.25) haptics.play('tap', { player: p.i });
            }
            break;
          }
        }
      }

      // Charcos: obligan a apartarse justo cuando conviene estar pegados.
      if (rng() < dt * 0.7) {
        charcos.push({ x: rng() * W, r: 26 + rng() * 26, vida: 6 + rng() * 4 });
      }
      for (let i = charcos.length - 1; i >= 0; i--) {
        const c = charcos[i];
        c.vida -= dt;
        if (c.vida <= 0) { charcos.splice(i, 1); continue; }
        for (const p of jug) {
          if (Math.abs(p.x - c.x) < c.r * 0.6) {
            mojado[p.i] = clamp(mojado[p.i] + 9 * dt, 0, MOJADO_MAX);
            if (rng() < dt * 4) {
              particles.burst(p.x, sueloY() - 4, 3, { speed: 90, color: '#8fd5ff', size: 3, gravity: 300 });
            }
          }
        }
      }

      // Estar bien tapado seca un poco: hay recuperación, no solo castigo.
      for (const p of jug) {
        if (cubierto(p)) mojado[p.i] = clamp(mojado[p.i] - 3.2 * dt, 0, MOJADO_MAX);
      }
      if (cubierto(jug[0]) && cubierto(jug[1])) secos += dt;

      sb.update(Math.round(MOJADO_MAX - mojado[0]), Math.round(MOJADO_MAX - mojado[1]));
      sb.setCenter(`${Math.max(0, tiempo).toFixed(0)}s · ${Math.round(secos)}s bajo el paraguas`);

      if (mojado[0] >= MOJADO_MAX || mojado[1] >= MOJADO_MAX) return terminar(false);
      if (tiempo <= 0) return terminar(true);

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d1420');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#16233a');
      grd.addColorStop(1, '#0a1018');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // Acera
      g.fillStyle = '#1b202b';
      g.fillRect(0, sueloY(), W, H - sueloY());
      g.strokeStyle = '#ffffff10';
      g.lineWidth = 1;
      for (let x = 0; x < W; x += 70) { g.beginPath(); g.moveTo(x, sueloY()); g.lineTo(x, H); g.stroke(); }

      for (const c of charcos) {
        g.save();
        g.globalAlpha = clamp(c.vida / 3, 0, 1) * 0.7;
        g.fillStyle = '#2f6f9e';
        g.beginPath(); g.ellipse(c.x, sueloY() + 8, c.r, c.r * 0.28, 0, 0, TAU); g.fill();
        g.restore();
      }

      // Lluvia
      g.save();
      g.strokeStyle = '#8fd5ff88';
      g.lineWidth = 1.6;
      for (const d of gotas) {
        g.beginPath();
        g.moveTo(d.x, d.y);
        g.lineTo(d.x - viento * 0.02, d.y - 12);
        g.stroke();
      }
      g.restore();

      particles.render(g);

      // Los dos, y su mango hacia el paraguas
      const px = paraguasX(), py = H * 0.42;
      for (const p of jug) {
        const col = players[p.i].color;
        const seco = cubierto(p);
        ctx.engine.glowCircle(p.x, sueloY() - 34, 19, col, seco ? 18 : 6);
        if (!seco) {
          g.save();
          g.globalAlpha = 0.6;
          ctx.engine.text('¡me mojo!', p.x, sueloY() - 70, { size: 10, color: '#8fd5ff' });
          g.restore();
        }
        g.strokeStyle = '#ffffff44';
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(p.x, sueloY() - 44); g.lineTo(px, py + 6); g.stroke();
      }

      // Paraguas
      g.save();
      g.shadowColor = '#000'; g.shadowBlur = 14;
      g.fillStyle = '#33244a';
      g.beginPath();
      g.moveTo(px - ANCHO_PARAGUAS / 2, py + 8);
      g.quadraticCurveTo(px, py - 44, px + ANCHO_PARAGUAS / 2, py + 8);
      // Festón inferior: sin él parece una seta.
      for (let k = 4; k >= 0; k--) {
        const x0 = px - ANCHO_PARAGUAS / 2 + (ANCHO_PARAGUAS / 5) * k;
        g.quadraticCurveTo(x0 + ANCHO_PARAGUAS / 10, py + 20, x0, py + 8);
      }
      g.closePath(); g.fill();
      g.restore();
      g.strokeStyle = '#8b7aa8';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(px, py + 8); g.lineTo(px, py + 56); g.stroke();

      // Viento
      if (Math.abs(viento) > 6) {
        g.save();
        g.globalAlpha = 0.4;
        g.strokeStyle = '#8fd5ff';
        g.lineWidth = 2;
        const dir = Math.sign(viento);
        for (let k = 0; k < 3; k++) {
          const y = H * 0.2 + k * 16;
          g.beginPath();
          g.moveTo(W / 2 - dir * 40, y);
          g.lineTo(W / 2 + dir * 40, y);
          g.lineTo(W / 2 + dir * 32, y - 5);
          g.stroke();
        }
        g.restore();
      }

      // Barras de mojado
      for (let i = 0; i < 2; i++) {
        const x = i === 0 ? 20 : W - 140;
        g.fillStyle = '#ffffff14';
        g.fillRect(x, 52, 120, 8);
        g.fillStyle = mojado[i] > 70 ? '#ff4757' : '#8fd5ff';
        g.fillRect(x, 52, 120 * (mojado[i] / MOJADO_MAX), 8);
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar(aguantaron) {
    terminado = true;
    const peor = mojado[0] > mojado[1] ? 0 : 1;
    let veredicto;
    if (aguantaron && Math.max(...mojado) < 30) veredicto = 'Llegaron secos los dos. Eso no lo hace cualquiera.';
    else if (aguantaron) veredicto = `Llegaron, con ${players[peor].name} chorreando.`;
    else veredicto = `${players[peor].name} acabó calado hasta los huesos.`;
    if (aguantaron) { audio.win(); haptics.play('score'); } else { audio.lose(); haptics.defeat(); }
    ctx.finish({
      winner: -1,
      scores: [Math.round(MOJADO_MAX - mojado[0]), Math.round(MOJADO_MAX - mojado[1])],
      detail: `${Math.round(secos)} s bajo el paraguas · ${veredicto}`,
      record: ctx.record('secos', Math.round(secos), 'high'),
    });
  }
}
