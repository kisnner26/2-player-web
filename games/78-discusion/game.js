/**
 * La Discusión — hablar es fácil; el problema es hablar cuando el otro calla.
 *
 * Cada uno gana razón mientras MANTIENE su tecla, o sea mientras habla. Pero si
 * los dos hablan a la vez nadie avanza y la tensión sube; y si la tensión llega
 * al techo, la discusión se convierte en bronca y pierden los dos, por mucha
 * razón que llevaran.
 *
 * Así que gana quien mejor lea los silencios del otro. Cada tanto salta un
 * TEMA DELICADO: hablar en ese momento sube la tensión al doble.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const META = 100;
const DURACION = 80;
const TEMAS = ['tu madre', 'el dinero', 'la boda de tu prima', 'quién friega', 'el año pasado'];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let razon = [0, 0], tension = 0;
  let hablando = [false, false], solapes = 0;
  let delicado = 0, proximo = 7, tema = 0;
  let tiempo = DURACION;
  let sb = null, terminado = false, onda = [];

  function reiniciar() {
    razon = [0, 0]; tension = 0;
    hablando = [false, false]; solapes = 0;
    delicado = 0; proximo = 7; tema = 0;
    tiempo = DURACION;
    onda = new Array(64).fill(0);
    terminado = false;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Mantén tu tecla para hablar · si hablan los dos, sube la <b>tensión</b>');
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo -= dt;

      proximo -= dt;
      if (proximo <= 0) {
        delicado = 3.5 + rng() * 2.5;
        proximo = 10 + rng() * 8;
        tema = Math.floor(rng() * TEMAS.length);
        audio.tone({ freq: 180, dur: 0.3, gain: 0.16, type: 'sawtooth', sweep: -60 });
        ui.toast(`Tema delicado: ${TEMAS[tema]}`, { ms: 1600, color: '#ff4757' });
      }
      if (delicado > 0) delicado -= dt;

      for (let i = 0; i < 2; i++) hablando[i] = input.player(i).held('a');
      const ambos = hablando[0] && hablando[1];
      const solo = hablando[0] !== hablando[1];

      if (ambos) {
        solapes += dt;
        tension = clamp(tension + (delicado > 0 ? 26 : 14) * dt, 0, 100);
        if (rng() < dt * 8) {
          particles.burst(W / 2, H * 0.42, 3, { speed: 130, color: '#ff4757', size: 3 });
          haptics.play('tick');
        }
      } else if (solo) {
        const quien = hablando[0] ? 0 : 1;
        razon[quien] = clamp(razon[quien] + 11 * dt, 0, META);
        tension = clamp(tension + (delicado > 0 ? 7 : -3.4) * dt, 0, 100);
        if (rng() < dt * 4) haptics.play('tick', { player: quien });
      } else {
        // El silencio compartido es lo único que baja la tensión de verdad.
        tension = clamp(tension - 9 * dt, 0, 100);
      }

      // Onda de voz para que se vea quién está hablando sin leer nada.
      onda.push(ambos ? (rng() - 0.5) * 2 : solo ? (hablando[0] ? -1 : 1) * (0.4 + rng() * 0.5) : 0);
      if (onda.length > 64) onda.shift();

      sb.update(Math.round(razon[0]), Math.round(razon[1]));
      sb.setCenter(`tensión ${Math.round(tension)}% · ${Math.max(0, tiempo).toFixed(0)}s`);

      if (tension >= 100) return terminar('bronca');
      if (razon[0] >= META || razon[1] >= META) return terminar('razon');
      if (tiempo <= 0) return terminar('tiempo');

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#12101a');
      const rojo = tension / 100;
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, `rgb(${26 + rojo * 90}, ${22 - rojo * 10}, ${38 - rojo * 12})`);
      grd.addColorStop(1, '#0a0810');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // La mesa de la cocina, donde pasan estas cosas
      g.fillStyle = '#3a2f28';
      g.fillRect(W * 0.18, H * 0.62, W * 0.64, H * 0.1);
      g.fillStyle = '#2c231e';
      g.fillRect(W * 0.24, H * 0.72, W * 0.52, H * 0.08);

      // Los dos, enfrentados
      for (let i = 0; i < 2; i++) {
        const x = i === 0 ? W * 0.26 : W * 0.74;
        const y = H * 0.5;
        const habla = hablando[i];
        ctx.engine.glowCircle(x, y, 30 + (habla ? 4 : 0), players[i].color, habla ? 26 : 8);
        // Bocadillo cuando habla
        if (habla) {
          g.save();
          g.fillStyle = '#ffffffdd';
          g.beginPath();
          const bx = i === 0 ? x + 44 : x - 44 - 90;
          g.roundRect ? g.roundRect(bx, y - 58, 90, 34, 10) : g.rect(bx, y - 58, 90, 34);
          g.fill();
          g.fillStyle = '#222';
          g.font = '12px system-ui, sans-serif';
          g.textAlign = 'center';
          g.fillText('…y otra cosa', bx + 45, y - 38);
          g.restore();
        }
      }

      // Onda de voz central
      g.save();
      g.strokeStyle = hablando[0] && hablando[1] ? '#ff4757' : '#ffffff77';
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i < onda.length; i++) {
        const x = W * 0.1 + (W * 0.8 * i) / onda.length;
        const y = H * 0.34 + onda[i] * 26;
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
      g.restore();

      particles.render(g);

      // Barras de razón
      for (let i = 0; i < 2; i++) {
        const x = i === 0 ? 24 : W - 164;
        g.fillStyle = '#ffffff14';
        g.fillRect(x, 52, 140, 12);
        g.fillStyle = players[i].color;
        g.fillRect(x, 52, 140 * (razon[i] / META), 12);
        ctx.engine.text('razón', x + 70, 78, { size: 10, color: '#ffffff77' });
      }

      // Tensión: la barra que arruina la partida a los dos
      const bw = Math.min(300, W * 0.44);
      g.fillStyle = '#ffffff14';
      g.fillRect(W / 2 - bw / 2, H - 54, bw, 14);
      g.fillStyle = tension > 70 ? '#ff4757' : tension > 40 ? '#ffd166' : '#a8ff3e';
      g.fillRect(W / 2 - bw / 2, H - 54, bw * (tension / 100), 14);
      ctx.engine.text('tensión', W / 2, H - 26, { size: 11, color: '#ffffff88' });
      if (tension > 78) {
        g.save();
        g.globalAlpha = 0.5 + Math.sin(ctx.engine.time * 10) * 0.4;
        ctx.engine.text('¡CÁLLENSE LOS DOS!', W / 2, H * 0.2, { size: 16, color: '#ff4757', glow: 14 });
        g.restore();
      }
      if (delicado > 0) {
        ctx.engine.text(`tema delicado: ${TEMAS[tema]}`, W / 2, H * 0.26, { size: 12, color: '#ff8f8f' });
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar(motivo) {
    terminado = true;
    let gan = -1, detalle = '';
    if (motivo === 'bronca') {
      detalle = `Bronca a los ${Math.round(DURACION - tiempo)} s · ${Math.round(solapes)} s hablando encima`;
      audio.explosion();
      haptics.explosion();
    } else {
      gan = razon[0] === razon[1] ? -1 : razon[0] > razon[1] ? 0 : 1;
      detalle = gan < 0
        ? 'Empate técnico: nadie convenció a nadie'
        : `${players[gan].name} tenía razón · ${Math.round(solapes)} s hablando encima`;
      if (gan < 0) audio.arp([440, 440, 392], 0.12); else { audio.win(); haptics.victory(gan); }
    }
    ctx.finish({
      winner: gan,
      scores: [Math.round(razon[0]), Math.round(razon[1])],
      detail: detalle,
      record: ctx.record('razon', Math.round(Math.max(...razon)), 'high'),
    });
  }
}
