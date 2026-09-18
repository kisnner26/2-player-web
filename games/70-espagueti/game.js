/**
 * Un Espagueti, Dos Bocas — sorber hasta el beso sin romper la pasta.
 *
 * Los dos sorben del mismo espagueti, cada uno desde su punta. Lo que lo hace
 * un juego y no un machaque es la TENSIÓN: sorber estira la pasta, y si los dos
 * tiran fuerte a la vez se rompe por el medio y hay que empezar otro.
 *
 * O sea que hay que turnarse: uno sorbe mientras el otro aguanta. Al final
 * quedan dos centímetros y ahí ya no hay técnica, hay valor.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const ESPAGUETIS = 3;
const LARGO = 100;             // "centímetros" de pasta
const DURACION = 60;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let restante = LARGO, tension = 0;
  let comido = [0, 0];
  let intento = 1, besos = 0, roturas = 0;
  let tiempo = DURACION, rotura = 0, beso = 0;
  let sb = null, terminado = false;

  function nuevoEspagueti() {
    restante = LARGO;
    tension = 0;
    comido = [0, 0];
  }

  function reiniciar() {
    nuevoEspagueti();
    intento = 1; besos = 0; roturas = 0;
    tiempo = DURACION; rotura = 0; beso = 0;
    terminado = false;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Sorbe con tu tecla · si los dos sorben a la vez, la pasta se <b>rompe</b>');
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo -= dt;
      rotura = Math.max(0, rotura - dt);
      beso = Math.max(0, beso - dt);

      if (rotura > 0 || beso > 0) { particles.update(dt); return; }

      let sorbiendo = 0;
      for (let i = 0; i < 2; i++) {
        const pl = input.player(i);
        if (pl.pressed('a')) {
          sorbiendo++;
          const trozo = 2.6;
          restante = Math.max(0, restante - trozo);
          comido[i] += trozo;
          tension += 0.17;
          audio.tone({ freq: 520 + rng() * 120, dur: 0.05, gain: 0.09, type: 'sine', sweep: -180 });
          haptics.play('tap', { player: i });
        }
      }

      // Dos sorbidos en el mismo instante castigan doble: la tensión se suma.
      if (sorbiendo === 2) tension += 0.22;
      // La pasta cede sola si la dejas en paz.
      tension = clamp(tension - 0.85 * dt, 0, 1.6);

      // Cuanto menos queda, menos margen hay: el final es siempre a filo.
      const limite = 0.55 + (restante / LARGO) * 0.55;
      if (tension > limite) return romper();
      if (restante <= 2) return besarse();

      sb.update(Math.round(comido[0]), Math.round(comido[1]));
      sb.setCenter(`${Math.round(restante)} cm · espagueti ${intento}/${ESPAGUETIS} · ${Math.max(0, tiempo).toFixed(0)}s`);

      if (tiempo <= 0) return terminar();

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#1a1014');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#2a1a20');
      grd.addColorStop(1, '#140c10');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // Mantel a cuadros: el escenario entero del juego.
      g.save();
      g.globalAlpha = 0.12;
      for (let x = 0; x < W; x += 46) {
        for (let y = H * 0.6; y < H; y += 46) {
          if (((x / 46) + Math.floor(y / 46)) % 2 === 0) { g.fillStyle = '#ff4757'; g.fillRect(x, y, 46, 46); }
        }
      }
      g.restore();

      // El plato
      g.save();
      g.fillStyle = '#e8e4dc';
      g.beginPath(); g.ellipse(W / 2, H * 0.78, W * 0.24, H * 0.09, 0, 0, TAU); g.fill();
      g.fillStyle = '#d8d2c6';
      g.beginPath(); g.ellipse(W / 2, H * 0.78, W * 0.18, H * 0.065, 0, 0, TAU); g.fill();
      g.restore();

      // Las dos caras, separadas por lo que queda de espagueti.
      const sep = (restante / LARGO) * W * 0.3 + 46;
      const cy = H * 0.44;
      const x0 = W / 2 - sep, x1 = W / 2 + sep;

      // El espagueti: una curva que cuelga y se tensa hasta quedar recta.
      const caida = (1 - clamp(tension / 1.1, 0, 1)) * 70;
      g.save();
      g.strokeStyle = tension > 0.75 ? '#ffd166' : '#f0d9a0';
      g.lineWidth = 7 - clamp(tension * 2.4, 0, 3.6);
      g.lineCap = 'round';
      g.shadowColor = tension > 0.9 ? '#ff4757' : 'transparent';
      g.shadowBlur = tension > 0.9 ? 16 : 0;
      g.beginPath();
      g.moveTo(x0, cy);
      g.quadraticCurveTo(W / 2, cy + caida, x1, cy);
      g.stroke();
      g.restore();

      for (let i = 0; i < 2; i++) {
        const x = i === 0 ? x0 : x1;
        ctx.engine.glowCircle(x, cy, 26, players[i].color, 16);
        g.fillStyle = '#00000066';
        g.beginPath(); g.ellipse(x + (i === 0 ? 16 : -16), cy + 4, 7, 5, 0, 0, TAU); g.fill();
      }

      particles.render(g);

      // Tensión: la barra que decide la partida.
      const limite = 0.55 + (restante / LARGO) * 0.55;
      const bw = 240;
      g.fillStyle = '#ffffff14';
      g.fillRect(W / 2 - bw / 2, 52, bw, 12);
      g.fillStyle = tension > limite * 0.8 ? '#ff4757' : '#a8ff3e';
      g.fillRect(W / 2 - bw / 2, 52, bw * clamp(tension / 1.6, 0, 1), 12);
      g.fillStyle = '#fff';
      g.fillRect(W / 2 - bw / 2 + bw * (limite / 1.6), 46, 2, 24);
      ctx.engine.text('tensión', W / 2, 80, { size: 10, color: '#ffffff88' });

      if (rotura > 0) ctx.engine.text('¡ROTO!', W / 2, cy - 60, { size: 22, color: '#ff4757', glow: 14 });
      if (beso > 0) ctx.engine.text('♥', W / 2, cy - 50, { size: 34, color: '#ff6ec7', glow: 20 });
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function romper() {
    roturas++;
    rotura = 1.2;
    audio.hit();
    haptics.error();
    ctx.shake(10);
    particles.burst(W / 2, H * 0.44, 16, { speed: 200, color: '#f0d9a0', size: 4, gravity: 320 });
    ui.toast('Se rompió por el medio', { ms: 1000, color: '#ff4757' });
    if (intento >= ESPAGUETIS) { terminar(); return; }
    intento++;
    nuevoEspagueti();
  }

  function besarse() {
    besos++;
    beso = 1.4;
    audio.arp([660, 880, 1100, 1320], 0.07);
    haptics.play('score');
    particles.burst(W / 2, H * 0.42, 24, { speed: 170, color: '#ff6ec7', size: 5, shape: 'circle', gravity: -70 });
    ui.toast('¡Beso! Como en la peli', { ms: 1200, color: '#ff6ec7' });
    if (intento >= ESPAGUETIS) { terminar(); return; }
    intento++;
    nuevoEspagueti();
  }

  function terminar() {
    terminado = true;
    let veredicto;
    if (besos >= 3) veredicto = 'Tres de tres. Se turnan hasta para comer.';
    else if (besos >= 1) veredicto = `${besos} beso${besos === 1 ? '' : 's'} y ${roturas} rotura${roturas === 1 ? '' : 's'}.`;
    else veredicto = 'Ni un beso: los dos sorbiendo a la vez, siempre.';
    if (besos > 0) { audio.win(); haptics.play('score'); } else { audio.lose(); haptics.defeat(); }
    ctx.finish({
      winner: -1,
      scores: [Math.round(comido[0]), Math.round(comido[1])],
      detail: `${besos} besos · ${roturas} roturas · ${veredicto}`,
      record: ctx.record('besos', besos, 'high'),
    });
  }
}
