/**
 * Montar el Mueble — uno sujeta, el otro atornilla. Y luego se cambian.
 *
 * El que sujeta no puede desentenderse: la pieza se le va de la marca sola y
 * tiene que corregir con sus direcciones mientras mantiene pulsada la tecla.
 * El que atornilla necesita que la pieza esté quieta EN LA MARCA, porque cada
 * vuelta de tornillo solo cuenta si en ese instante estaba centrada.
 *
 * Los roles se cambian a mitad de mueble, así que no vale el reparto "tú
 * siempre lo aburrido".
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const TORNILLOS = 6;
const DURACION = 100;
const ZONA = 34;               // píxeles de margen de la marca

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let sujeta = 0;               // quién sujeta ahora
  let pieza = { x: 0, y: 0, vx: 0, vy: 0 };
  let marca = { x: 0, y: 0 };
  let vuelta = 0, tornillo = 0, caidas = 0;
  let tiempo = DURACION, deriva = 0;
  let sb = null, terminado = false, aviso = 0;

  function colocarMarca() {
    marca.x = W * (0.34 + rng() * 0.32);
    marca.y = H * (0.42 + rng() * 0.24);
  }

  function reiniciar() {
    sujeta = 0;
    pieza = { x: W / 2, y: H * 0.5, vx: 0, vy: 0 };
    colocarMarca();
    vuelta = 0; tornillo = 0; caidas = 0;
    tiempo = DURACION; deriva = rng() * TAU;
    terminado = false;
  }

  const enMarca = () => Math.hypot(pieza.x - marca.x, pieza.y - marca.y) < ZONA;

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Quien sujeta: mantén tu tecla y corrige con las direcciones · quien atornilla: machaca');
    },
    resize(nw, nh) { W = nw; H = nh; reiniciar(); },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo -= dt;
      aviso = Math.max(0, aviso - dt);

      const quienSujeta = input.player(sujeta);
      const quienAtornilla = input.player(1 - sujeta);

      // La pieza pesa: si no la sujetas activamente, se cae hacia abajo.
      const agarrada = quienSujeta.held('a');
      deriva += dt * 1.7;
      const empujeX = Math.cos(deriva) * 46 + Math.sin(deriva * 2.3) * 22;
      const empujeY = agarrada ? Math.sin(deriva * 1.4) * 40 : 420;

      pieza.vx += (empujeX + quienSujeta.x * (agarrada ? 320 : 60)) * dt;
      pieza.vy += (empujeY + quienSujeta.y * (agarrada ? 320 : 60)) * dt;
      pieza.vx *= Math.pow(0.02, dt);
      pieza.vy *= Math.pow(0.02, dt);
      pieza.x = clamp(pieza.x + pieza.vx * dt, 60, W - 60);
      pieza.y = clamp(pieza.y + pieza.vy * dt, 90, H - 70);

      if (!agarrada && pieza.y >= H - 71) {
        // Se cayó: se pierde el avance del tornillo en curso.
        if (vuelta > 0.05) {
          caidas++;
          vuelta = 0;
          audio.thud();
          haptics.error(sujeta);
          ctx.shake(9);
          aviso = 1.2;
          ui.toast('¡Se cayó la pieza! Ese tornillo, otra vez', { ms: 1100, color: '#ff4757' });
        }
      }

      if (quienAtornilla.pressed('a')) {
        if (enMarca() && agarrada) {
          vuelta += 0.12;
          audio.tone({ freq: 300 + vuelta * 400, dur: 0.04, gain: 0.09, type: 'sawtooth' });
          haptics.play('tick', { player: 1 - sujeta });
          particles.burst(marca.x, marca.y, 3, { speed: 70, color: '#c8c8d0', size: 2 });
        } else {
          // Atornillar en el aire estropea la rosca: castigo pequeño pero real.
          vuelta = Math.max(0, vuelta - 0.08);
          audio.error();
          haptics.play('tap', { player: 1 - sujeta });
          aviso = 0.5;
        }
      }

      if (vuelta >= 1) {
        tornillo++;
        vuelta = 0;
        audio.place();
        haptics.play('score');
        particles.burst(marca.x, marca.y, 16, { speed: 170, color: '#ffd166', size: 4 });
        // Cambio de rol a mitad del mueble.
        if (tornillo === Math.floor(TORNILLOS / 2)) {
          sujeta = 1 - sujeta;
          ui.toast('¡Cambio! Ahora al revés', { ms: 1400, color: '#8fd5ff' });
          audio.arp([520, 660, 880], 0.06);
        } else {
          ui.toast(`Tornillo ${tornillo}/${TORNILLOS}`, { ms: 800, color: '#ffd166' });
        }
        colocarMarca();
      }

      sb.update(tornillo, caidas);
      sb.setCenter(`${tornillo}/${TORNILLOS} tornillos · ${Math.max(0, tiempo).toFixed(0)}s`);

      if (tornillo >= TORNILLOS) return terminar(true);
      if (tiempo <= 0) return terminar(false);

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#141118');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#221d2a');
      grd.addColorStop(1, '#100d14');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // Suelo con las instrucciones tiradas
      g.fillStyle = '#1a1620';
      g.fillRect(0, H - 60, W, 60);
      g.save();
      g.globalAlpha = 0.5;
      g.fillStyle = '#e8e0d0';
      g.translate(W * 0.12, H - 34);
      g.rotate(-0.12);
      g.fillRect(-26, -16, 52, 32);
      g.fillStyle = '#9a9aa8';
      for (let k = 0; k < 4; k++) g.fillRect(-20, -10 + k * 7, 40, 2);
      g.restore();

      // El armario a medio montar: una tabla por tornillo puesto.
      const bx = W * 0.5, by = H * 0.2;
      g.save();
      g.globalAlpha = 0.9;
      for (let k = 0; k < tornillo; k++) {
        g.fillStyle = k % 2 ? '#7a5c3a' : '#8a6a44';
        g.fillRect(bx - 70 + (k % 3) * 48, by - 30 + Math.floor(k / 3) * 26, 44, 22);
      }
      g.restore();

      // Marca donde va el tornillo
      g.save();
      const ok = enMarca();
      g.strokeStyle = ok ? '#a8ff3e' : '#ff4757';
      g.lineWidth = 3;
      g.setLineDash([6, 6]);
      g.beginPath(); g.arc(marca.x, marca.y, ZONA, 0, TAU); g.stroke();
      g.restore();
      g.fillStyle = ok ? '#a8ff3e' : '#ff475788';
      g.beginPath(); g.arc(marca.x, marca.y, 5, 0, TAU); g.fill();

      // La pieza
      g.save();
      g.translate(pieza.x, pieza.y);
      g.rotate(Math.atan2(pieza.vy, 400) * 0.4);
      g.fillStyle = '#8a6a44';
      g.fillRect(-58, -16, 116, 32);
      g.fillStyle = '#6b5232';
      g.fillRect(-58, 10, 116, 6);
      g.restore();

      // Las dos manos: la que sujeta pegada a la pieza, la del taladro en la marca.
      ctx.engine.glowCircle(pieza.x, pieza.y + 26, 14, players[sujeta].color,
        input.player(sujeta).held('a') ? 20 : 4);
      g.save();
      g.translate(marca.x + 26, marca.y - 26);
      g.rotate(0.7);
      g.fillStyle = players[1 - sujeta].color;
      g.fillRect(-8, -22, 16, 30);
      g.fillStyle = '#c8c8d0';
      g.fillRect(-3, 8, 6, 18);
      g.restore();

      particles.render(g);

      // Vuelta del tornillo en curso
      g.fillStyle = '#ffffff14';
      g.fillRect(W / 2 - 90, 50, 180, 10);
      g.fillStyle = '#ffd166';
      g.fillRect(W / 2 - 90, 50, 180 * vuelta, 10);
      ctx.engine.text(`sujeta ${players[sujeta].name} · atornilla ${players[1 - sujeta].name}`,
        W / 2, 78, { size: 11, color: '#ffffff99' });
      if (aviso > 0) {
        ctx.engine.text('¡en la marca y sujeta!', W / 2, H * 0.9, { size: 13, color: '#ff4757', glow: 10 });
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar(montado) {
    terminado = true;
    const usado = DURACION - Math.max(0, tiempo);
    let veredicto;
    if (montado && caidas === 0) veredicto = 'Mueble montado sin una sola caída. Sospechoso.';
    else if (montado) veredicto = `Montado, con ${caidas} caída${caidas === 1 ? '' : 's'} y algún grito.`;
    else veredicto = `Se quedó en ${tornillo} de ${TORNILLOS}. Mañana se sigue.`;
    if (montado) { audio.win(); haptics.victory(0); } else { audio.lose(); haptics.defeat(); }
    ctx.finish({
      winner: -1,
      scores: [tornillo, caidas],
      detail: `${montado ? usado.toFixed(1) + ' s' : tornillo + ' tornillos'} · ${veredicto}`,
      record: montado ? ctx.record('tiempo', Math.round(usado * 10) / 10, 'low') : false,
    });
  }
}
