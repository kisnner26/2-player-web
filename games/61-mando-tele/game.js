/**
 * La Guerra del Mando — no gana quien más tira, gana quien mejor descansa.
 *
 * El mando se arrastra a machaque, pero el brazo se cansa: cada pulsación gasta
 * fuerza y sin fuerza los tirones valen la mitad. Y mientras hay ANUNCIOS,
 * tener el mando no da nada, así que la jugada buena es soltarlo, recuperar y
 * llegar fresco al siguiente programa.
 *
 * Ese es todo el juego: un tira y afloja donde a veces conviene aflojar.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const META = 100;              // satisfacción para ganar
const DURACION = 90;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let mando = 0.5;             // 0 = lo tiene P1, 1 = lo tiene P2
  let gusto = [0, 0];
  let fuerza = [1, 1];
  let anuncio = false, cambio = 6, canal = 0;
  let tiempo = DURACION, tirones = [0, 0];
  let sb = null, terminado = false;
  const CANALES = ['Fútbol', 'Documental', 'Concurso', 'Serie', 'Noticias'];

  function reiniciar() {
    mando = 0.5;
    gusto = [0, 0];
    fuerza = [1, 1];
    anuncio = false; cambio = 6; canal = 0;
    tiempo = DURACION; tirones = [0, 0];
    terminado = false;
  }

  /** Quién tiene el mando ahora: -1 si está en disputa en el centro. */
  const dueno = () => (mando < 0.38 ? 0 : mando > 0.62 ? 1 : -1);

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Machaca para tirar del mando · durante los <b>anuncios</b> no ganas nada');
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo -= dt;

      cambio -= dt;
      if (cambio <= 0) {
        anuncio = !anuncio;
        cambio = anuncio ? 4 + rng() * 3 : 8 + rng() * 6;
        if (!anuncio) canal = Math.floor(rng() * CANALES.length);
        audio.blip();
        ui.toast(anuncio ? 'ANUNCIOS · nadie gana nada' : `Vuelve: ${CANALES[canal]}`, {
          ms: 1200, color: anuncio ? '#ffd166' : '#a8ff3e',
        });
      }

      for (let i = 0; i < 2; i++) {
        const pl = input.player(i);
        if (pl.pressed('a')) {
          tirones[i]++;
          // Un tirón sin fuerza casi no mueve el mando: machacar en seco no vale.
          const efecto = 0.024 * (0.35 + fuerza[i] * 0.65);
          mando = clamp(mando + (i === 0 ? -efecto : efecto), 0.04, 0.96);
          fuerza[i] = clamp(fuerza[i] - 0.055, 0, 1);
          audio.tone({ freq: 300 + fuerza[i] * 200, dur: 0.04, gain: 0.1, type: 'square' });
          haptics.play('tap', { player: i });
          if (rng() < 0.3) {
            particles.burst(W * (i === 0 ? 0.32 : 0.68), H * 0.62, 3, {
              speed: 90, color: players[i].color, size: 3,
            });
          }
        }
        // Se recupera más rápido si no estás tirando: descansar es una jugada.
        fuerza[i] = clamp(fuerza[i] + (pl.held('a') ? 0.07 : 0.2) * dt, 0, 1);
      }

      // El mando resbala hacia el centro si nadie insiste.
      mando += (0.5 - mando) * 0.35 * dt;

      const d = dueno();
      if (d >= 0 && !anuncio) {
        gusto[d] = clamp(gusto[d] + 9.5 * dt, 0, META);
        if (rng() < dt * 3) haptics.play('tick', { player: d });
      }

      sb.update(Math.round(gusto[0]), Math.round(gusto[1]));
      sb.setCenter(anuncio ? 'ANUNCIOS' : `${CANALES[canal]} · ${Math.max(0, tiempo).toFixed(0)}s`);

      if (gusto[0] >= META || gusto[1] >= META) return terminar();
      if (tiempo <= 0) return terminar();

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d0b12');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#191524');
      grd.addColorStop(1, '#0a0810');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // La tele
      const tw = Math.min(W * 0.5, 420), th = tw * 0.6;
      const tx = W / 2 - tw / 2, ty = H * 0.1;
      g.fillStyle = '#1c1c26';
      g.fillRect(tx - 12, ty - 12, tw + 24, th + 24);
      if (anuncio) {
        // Los anuncios se ven: barras chillonas que cambian.
        for (let k = 0; k < 6; k++) {
          g.fillStyle = `hsl(${(k * 57 + Math.floor(ctx.engine.time * 4) * 30) % 360} 70% 50%)`;
          g.fillRect(tx + (tw / 6) * k, ty, tw / 6, th);
        }
        ctx.engine.text('ANUNCIOS', W / 2, ty + th / 2, { size: 18, color: '#000' });
      } else {
        const col = ['#1d5c2a', '#2a3d5c', '#5c3a1d', '#4a1d5c', '#3a3a3a'][canal];
        g.fillStyle = col;
        g.fillRect(tx, ty, tw, th);
        g.save();
        g.globalAlpha = 0.12;
        g.fillStyle = '#fff';
        for (let y = ty; y < ty + th; y += 4) g.fillRect(tx, y, tw, 1);
        g.restore();
        ctx.engine.text(CANALES[canal], W / 2, ty + th / 2, { size: 16, color: '#ffffffcc' });
      }

      // El sofá y los dos
      const sy = H * 0.72;
      g.fillStyle = '#3a2b3f';
      g.fillRect(W * 0.16, sy, W * 0.68, H * 0.2);
      g.fillStyle = '#4a374f';
      g.fillRect(W * 0.16, sy, W * 0.68, 14);
      for (let i = 0; i < 2; i++) {
        const x = W * (i === 0 ? 0.32 : 0.68);
        ctx.engine.glowCircle(x, sy - 6, 24, players[i].color, 14);
      }

      // La cuerda invisible del mando: la línea entre las dos manos.
      const mx = W * 0.32 + (W * 0.36) * mando;
      g.strokeStyle = '#ffffff22';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(W * 0.32, sy - 6); g.lineTo(mx, sy - 24); g.lineTo(W * 0.68, sy - 6); g.stroke();

      // El mando
      g.save();
      g.translate(mx, sy - 24);
      g.rotate((mando - 0.5) * 0.8);
      g.fillStyle = '#22222c';
      g.fillRect(-11, -26, 22, 52);
      for (let k = 0; k < 4; k++) {
        g.fillStyle = k === 0 ? '#ff4757' : '#5a5a68';
        g.fillRect(-6, -20 + k * 11, 12, 6);
      }
      g.restore();

      // Zona de posesión
      g.fillStyle = '#ffffff10';
      g.fillRect(W * 0.32, sy - 46, W * 0.36, 6);
      g.fillStyle = players[0].color;
      g.fillRect(W * 0.32, sy - 46, W * 0.36 * 0.38, 6);
      g.fillStyle = players[1].color;
      g.fillRect(W * 0.32 + W * 0.36 * 0.62, sy - 46, W * 0.36 * 0.38, 6);

      particles.render(g);

      // Satisfacción y brazo de cada uno
      for (let i = 0; i < 2; i++) {
        const x = i === 0 ? 22 : W - 152;
        g.fillStyle = '#ffffff14';
        g.fillRect(x, 54, 130, 10);
        g.fillStyle = players[i].color;
        g.fillRect(x, 54, 130 * (gusto[i] / META), 10);
        g.fillStyle = '#ffffff14';
        g.fillRect(x, 70, 130, 6);
        g.fillStyle = fuerza[i] < 0.3 ? '#ff4757' : '#ffd166';
        g.fillRect(x, 70, 130 * fuerza[i], 6);
        if (fuerza[i] < 0.25) ctx.engine.text('brazo agotado', x + 65, 88, { size: 9, color: '#ff4757' });
      }

      const d = dueno();
      if (d >= 0 && !anuncio) {
        ctx.engine.text(`manda ${players[d].name}`, W / 2, H * 0.66, { size: 12, color: players[d].color, glow: 8 });
      } else if (d < 0) {
        ctx.engine.text('en disputa', W / 2, H * 0.66, { size: 12, color: '#ffffff88' });
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar() {
    terminado = true;
    const gan = gusto[0] === gusto[1] ? -1 : gusto[0] > gusto[1] ? 0 : 1;
    let veredicto;
    if (gan < 0) veredicto = 'Empate: acabaron viendo la carta de ajuste.';
    else if (Math.abs(gusto[0] - gusto[1]) < 12) veredicto = 'Ganó por un programa de diferencia.';
    else veredicto = `${players[gan].name} controló la noche entera.`;
    ctx.finish({
      winner: gan,
      scores: [Math.round(gusto[0]), Math.round(gusto[1])],
      detail: `${tirones[0]} — ${tirones[1]} tirones · ${veredicto}`,
      record: ctx.record('gusto', Math.round(Math.max(...gusto)), 'high'),
    });
  }
}
