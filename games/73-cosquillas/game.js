/**
 * Cosquillas — dos rondas con los papeles cambiados, gana quien rompa antes.
 *
 * El que ataca machaca su tecla y elige zona con las direcciones. Hay una zona
 * DÉBIL que se mueve sola y que solo se descubre por lo que sube la risa, así
 * que atacar bien es ir buscándola, no machacar más rápido.
 *
 * El que resiste aguanta la respiración manteniendo su tecla: frena la risa
 * pero gasta aire, y sin aire se ríe el doble. Hay que soltar y recuperar en el
 * momento justo, que es justo cuando el otro está buscando la zona.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const ZONAS = ['Pies', 'Costillas', 'Cuello'];
const TOPE = 25;               // segundos que dura una ronda
const RISA_MAX = 100;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let atacante = 0, ronda = 1;
  let zona = 1, debil = 0, cambiaDebil = 3;
  let risa = 0, aire = 1, reloj = 0;
  let marcas = [null, null];    // segundos que tardó cada atacante
  let sb = null, terminado = false, pausa = 0, golpe = 0;

  function nuevaRonda() {
    zona = 1;
    debil = Math.floor(rng() * ZONAS.length);
    cambiaDebil = 3 + rng() * 3;
    risa = 0; aire = 1; reloj = 0;
    golpe = 0;
  }

  function reiniciar() {
    atacante = 0; ronda = 1;
    marcas = [null, null];
    pausa = 0;
    nuevaRonda();
    terminado = false;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner(`Ronda 1: ataca ${players[0].name} · resiste ${players[1].name}`);
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }

      if (pausa > 0) {
        pausa -= dt;
        if (pausa <= 0) {
          if (ronda >= 2) return terminar();
          ronda = 2;
          atacante = 1;
          nuevaRonda();
          ui.banner(`Ronda 2: ataca ${players[1].name} · resiste ${players[0].name}`);
        }
        return;
      }

      reloj += dt;
      golpe = Math.max(0, golpe - dt * 4);

      cambiaDebil -= dt;
      if (cambiaDebil <= 0) {
        debil = Math.floor(rng() * ZONAS.length);
        cambiaDebil = 3 + rng() * 3.5;
      }

      const ata = input.player(atacante);
      const res = input.player(1 - atacante);

      if (ata.pressed('left')) { zona = clamp(zona - 1, 0, ZONAS.length - 1); audio.blip(); }
      if (ata.pressed('right')) { zona = clamp(zona + 1, 0, ZONAS.length - 1); audio.blip(); }

      // Aguantar la respiración: mientras se mantiene, la risa sube mucho menos.
      const aguantando = res.held('a') && aire > 0.02;
      aire = clamp(aire + (aguantando ? -0.34 : 0.19) * dt, 0, 1);
      const frenoAire = aguantando ? 0.34 : (aire < 0.15 ? 1.7 : 1);

      if (ata.pressed('a')) {
        const acierto = zona === debil ? 2.9 : 1.1;
        risa = clamp(risa + acierto * frenoAire, 0, RISA_MAX);
        golpe = 1;
        audio.tone({ freq: 620 + acierto * 120 + rng() * 80, dur: 0.04, gain: 0.09, type: 'sine' });
        haptics.play('tick', { player: atacante });
        if (zona === debil) {
          particles.burst(W / 2, zonaY(zona), 5, { speed: 110, color: '#ffd166', size: 3, shape: 'circle' });
        }
      }

      // La risa baja sola si no te tocan: hay que insistir.
      risa = clamp(risa - 4.6 * dt, 0, RISA_MAX);

      sb.update(marcas[0] == null ? 0 : Math.round(marcas[0] * 10) / 10, marcas[1] == null ? 0 : Math.round(marcas[1] * 10) / 10);
      sb.setCenter(`Ronda ${ronda} · ${Math.max(0, TOPE - reloj).toFixed(1)}s · risa ${Math.round(risa)}%`);

      if (risa >= RISA_MAX) return cerrarRonda(reloj);
      if (reloj >= TOPE) return cerrarRonda(null);

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#170f18');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#2a1a2c');
      grd.addColorStop(1, '#120a14');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // El sofá donde ocurre todo
      g.fillStyle = '#3a2842';
      g.fillRect(W * 0.1, H * 0.24, W * 0.8, H * 0.6);
      g.fillStyle = '#4a3454';
      g.fillRect(W * 0.1, H * 0.24, W * 0.8, 16);

      const colRes = players[1 - atacante].color;

      // La víctima, tumbada, con sus tres zonas.
      for (let i = 0; i < ZONAS.length; i++) {
        const y = zonaY(i);
        const activa = i === zona;
        g.save();
        g.globalAlpha = activa ? 1 : 0.4;
        g.strokeStyle = activa ? players[atacante].color : '#ffffff44';
        g.lineWidth = activa ? 4 : 2;
        g.beginPath();
        g.roundRect ? g.roundRect(W * 0.3, y - 26, W * 0.4, 52, 14) : g.rect(W * 0.3, y - 26, W * 0.4, 52);
        g.stroke();
        g.restore();
        ctx.engine.text(ZONAS[i], W * 0.24, y, { size: 11, color: activa ? '#fff' : '#ffffff66', align: 'right' });
        if (i === debil && risa > 12) {
          // La pista solo aparece cuando ya se ha reído algo: se descubre jugando.
          g.save();
          g.globalAlpha = 0.5 + Math.sin(ctx.engine.time * 6) * 0.3;
          ctx.engine.text('¡ahí!', W * 0.76, y, { size: 11, color: '#ffd166', align: 'left' });
          g.restore();
        }
      }

      // Cuerpo
      g.save();
      g.globalAlpha = 0.9;
      ctx.engine.glowCircle(W * 0.5, zonaY(0) + 40, 22 + golpe * 6, colRes, 14);
      g.strokeStyle = colRes;
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(W * 0.5, zonaY(2) - 20);
      g.lineTo(W * 0.5, zonaY(0) + 20);
      g.stroke();
      g.restore();

      // La mano que hace cosquillas
      g.save();
      g.translate(W * 0.72 + golpe * 10, zonaY(zona));
      g.fillStyle = players[atacante].color;
      for (let k = -2; k <= 2; k++) {
        g.fillRect(-6, k * 7 - 2, 22 + Math.abs(k) * -3, 4);
      }
      g.restore();

      particles.render(g);

      // Risa y aire
      const bw = Math.min(320, W * 0.5);
      g.fillStyle = '#ffffff14';
      g.fillRect(W / 2 - bw / 2, 46, bw, 14);
      g.fillStyle = risa > 75 ? '#ff4757' : '#ffd166';
      g.fillRect(W / 2 - bw / 2, 46, bw * (risa / RISA_MAX), 14);
      ctx.engine.text('risa', W / 2, 72, { size: 10, color: '#ffffff88' });

      g.fillStyle = '#ffffff14';
      g.fillRect(W / 2 - bw / 2, H - 46, bw, 10);
      g.fillStyle = aire < 0.2 ? '#ff4757' : '#8fd5ff';
      g.fillRect(W / 2 - bw / 2, H - 46, bw * aire, 10);
      ctx.engine.text(`aire de ${players[1 - atacante].name} · mantén tu tecla para aguantar`, W / 2, H - 24, {
        size: 10, color: '#ffffff88',
      });

      if (pausa > 0) {
        ctx.engine.text(ronda >= 2 ? 'fin' : 'cambio de papeles…', W / 2, H / 2, { size: 20, color: '#fff', glow: 12 });
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function zonaY(i) { return H * 0.36 + i * (H * 0.16); }

  function cerrarRonda(segundos) {
    marcas[atacante] = segundos;
    pausa = 1.8;
    if (segundos == null) {
      audio.lose();
      haptics.play('soft');
      ui.toast(`${players[1 - atacante].name} aguantó los ${TOPE} s`, { ms: 1500, color: '#8fd5ff' });
    } else {
      audio.win();
      haptics.play('score', { player: atacante });
      ctx.shake(6);
      ui.toast(`${players[1 - atacante].name} se partió en ${segundos.toFixed(1)} s`, { ms: 1500, color: '#ffd166' });
    }
  }

  function terminar() {
    terminado = true;
    // Menos tiempo es mejor; no romper al otro equivale a algo peor que el tope.
    const a = marcas[0] == null ? TOPE + 5 : marcas[0];
    const b = marcas[1] == null ? TOPE + 5 : marcas[1];
    const gan = Math.abs(a - b) < 0.15 ? -1 : a < b ? 0 : 1;
    const txt = (m) => (m == null ? 'no pudo' : `${m.toFixed(1)} s`);
    ctx.finish({
      winner: gan,
      scores: [marcas[0] == null ? 0 : Math.round(marcas[0] * 10) / 10, marcas[1] == null ? 0 : Math.round(marcas[1] * 10) / 10],
      detail: `${players[0].name}: ${txt(marcas[0])} · ${players[1].name}: ${txt(marcas[1])}`,
      record: ctx.record('rapidez', Math.round(Math.min(a, b) * 10) / 10, 'low'),
    });
  }
}
