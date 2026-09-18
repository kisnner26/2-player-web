/**
 * Doce Uvas — las campanadas no van a esperar a nadie.
 *
 * Doce campanadas con un ritmo que se acelera y que además tiene un hueco raro
 * a mitad (como las de verdad, que siempre pillan a alguien). Cada uno come su
 * uva pulsando su tecla dentro de la ventana de la campanada.
 *
 * Que sea cooperativo cambia el juego: la campanada solo cuenta DOBLE si los
 * dos aciertan, así que al que va atragantado le interesa recuperar el ritmo
 * del otro en vez de machacar por su cuenta.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const UVAS = 12;
const VENTANA = 0.34;          // margen (s) a cada lado de la campanada

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let tiempos = [];
  let reloj = 0, indice = 0;
  let comidas = [0, 0], falladas = [0, 0], dobles = 0, puntos = 0;
  let usada = [false, false], sonada = false;
  let sb = null, terminado = false, campana = 0, aviso = '';

  function calendario() {
    // Intervalos decrecientes; el hueco largo del número siete es el clásico.
    const t = [];
    let acc = 2.2;
    for (let i = 0; i < UVAS; i++) {
      t.push(acc);
      const base = 1.5 - i * 0.055;
      acc += i === 6 ? base + 0.55 : base;
    }
    return t;
  }

  function reiniciar() {
    tiempos = calendario();
    reloj = 0; indice = 0;
    comidas = [0, 0]; falladas = [0, 0]; dobles = 0; puntos = 0;
    usada = [false, false]; sonada = false;
    campana = 0; aviso = '';
    terminado = false;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Una uva por campanada · si aciertan los dos, cuenta <b>doble</b>');
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      reloj += dt;
      campana = Math.max(0, campana - dt * 3);

      const ahora = tiempos[indice];

      // Campanada: suena una sola vez, al cruzar su instante.
      if (indice < UVAS && !sonada && reloj >= ahora) {
        sonada = true;
        campana = 1;
        audio.tone({ freq: 196, dur: 0.7, gain: 0.22, type: 'sine' });
        audio.tone({ freq: 392, dur: 0.5, gain: 0.1, type: 'sine', delay: 0.02 });
        haptics.play('impact');
      }

      for (let i = 0; i < 2; i++) {
        if (!input.player(i).pressed('a') || usada[i]) continue;
        const err = Math.abs(reloj - ahora);
        if (err <= VENTANA) {
          usada[i] = true;
          comidas[i]++;
          audio.tone({ freq: 700 + (1 - err / VENTANA) * 300, dur: 0.07, gain: 0.12, type: 'triangle' });
          haptics.play('tick', { player: i });
          particles.burst(W * (i === 0 ? 0.32 : 0.68), H * 0.56, 6, {
            speed: 110, color: '#a05ac0', size: 3, shape: 'circle',
          });
        } else {
          falladas[i]++;
          audio.error();
          haptics.play('tap', { player: i });
          aviso = err > 0 && reloj < ahora ? '¡demasiado pronto!' : '¡tarde!';
        }
      }

      // Se cierra la campanada cuando pasa su ventana.
      if (indice < UVAS && reloj > ahora + VENTANA) {
        const dos = usada[0] && usada[1];
        if (dos) {
          dobles++;
          puntos += 25;
          ui.toast(`¡Las dos! ×${dobles}`, { ms: 700, color: '#ffd166' });
          haptics.play('score');
        } else if (usada[0] || usada[1]) {
          puntos += 8;
        } else {
          aviso = 'campanada perdida';
        }
        usada = [false, false];
        sonada = false;
        indice++;
      }

      sb.update(comidas[0], comidas[1]);
      sb.setCenter(indice >= UVAS ? '¡Feliz año!' : `Campanada ${indice + 1}/${UVAS} · ${puntos} pts`);

      if (indice >= UVAS) return terminar();

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0b0a16');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#171432');
      grd.addColorStop(1, '#08070f');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // El reloj de la plaza
      const cx = W / 2, cy = H * 0.3, r = Math.min(W, H) * 0.16;
      g.save();
      g.shadowColor = '#ffd166';
      g.shadowBlur = 20 + campana * 40;
      g.fillStyle = '#e8dcc0';
      g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
      g.restore();
      g.fillStyle = '#1a1424';
      g.beginPath(); g.arc(cx, cy, r * 0.88, 0, TAU); g.fill();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU - Math.PI / 2;
        g.fillStyle = i < indice ? '#ffd166' : '#ffffff44';
        g.beginPath();
        g.arc(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72, i < indice ? 6 : 4, 0, TAU);
        g.fill();
      }
      // Manecillas en las doce, temblando con cada campanada.
      g.save();
      g.translate(cx, cy);
      g.rotate(campana * 0.06);
      g.strokeStyle = '#ffd166';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r * 0.62); g.stroke();
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r * 0.44); g.stroke();
      g.restore();

      // Ventana de la campanada actual: la ayuda visual del ritmo.
      if (indice < UVAS) {
        const falta = tiempos[indice] - reloj;
        const k = clamp(1 - Math.abs(falta) / 1.2, 0, 1);
        g.save();
        g.globalAlpha = 0.25 + k * 0.7;
        g.strokeStyle = Math.abs(falta) <= VENTANA ? '#a8ff3e' : '#ffffff66';
        g.lineWidth = 4 + k * 5;
        g.beginPath();
        g.arc(cx, cy, r + 16 + (1 - k) * 44, 0, TAU);
        g.stroke();
        g.restore();
      }

      // Los dos, con su racimo
      for (let i = 0; i < 2; i++) {
        const x = W * (i === 0 ? 0.32 : 0.68);
        const y = H * 0.62;
        ctx.engine.glowCircle(x, y, 26, players[i].color, usada[i] ? 24 : 10);
        // Racimo: una uva por cada una que le queda.
        const quedan = UVAS - comidas[i];
        for (let k = 0; k < quedan; k++) {
          const ux = x + ((k % 4) - 1.5) * 13;
          const uy = y + 46 + Math.floor(k / 4) * 12;
          g.fillStyle = '#7a3f9a';
          g.beginPath(); g.arc(ux, uy, 5.5, 0, TAU); g.fill();
        }
        if (usada[i]) ctx.engine.text('¡ñam!', x, y - 40, { size: 11, color: '#a8ff3e' });
      }

      particles.render(g);

      // Confeti al final de cada campanada doble
      if (aviso) ctx.engine.text(aviso, cx, H * 0.9, { size: 12, color: '#ff8f8f' });
      ctx.engine.text(`${dobles} campanadas a dúo`, cx, H * 0.83, { size: 11, color: '#ffd166' });
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar() {
    terminado = true;
    let veredicto;
    if (dobles === UVAS) veredicto = 'Doce a dúo. Ese año va a ir bien.';
    else if (dobles >= 8) veredicto = 'Casi todas juntas: buen año.';
    else if (dobles >= 4) veredicto = 'Se atragantaron a la vez, que también une.';
    else veredicto = 'Cada uno comió a su ritmo. Como siempre.';
    if (dobles >= 6) { audio.win(); haptics.victory(0); } else { audio.lose(); haptics.play('soft'); }
    particles.burst(W / 2, H * 0.4, 30, { speed: 260, color: '#ffd166', size: 4, gravity: 140 });
    ctx.finish({
      winner: -1,
      scores: [comidas[0], comidas[1]],
      detail: `${puntos} pts · ${dobles}/${UVAS} a dúo · ${falladas[0] + falladas[1]} uvas fuera de tiempo · ${veredicto}`,
      record: ctx.record('duo', dobles, 'high'),
    });
  }
}
