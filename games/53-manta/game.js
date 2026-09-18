/**
 * La Manta — la manta no da para los dos, y esa es toda la mecánica.
 *
 * Un tira y afloja donde ganar es perder: la manta mide lo que mide, así que
 * lo que uno se lleva se lo quita al otro. Si a cualquiera de los dos se le
 * congela el termómetro, la noche se acaba MAL PARA AMBOS — no hay ganador
 * individual posible, solo dormir bien o no dormir.
 *
 * Y para que no valga quedarse quieto en el 50-50, cada pocos segundos baja la
 * temperatura o entra una corriente que pide más manta de un lado concreto.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const DURACION = 70;
const TIRON = 0.055;           // fracción de manta que mueve cada tirón
const RECUPERA = 0.16;         // la manta vuelve al centro poco a poco
const FRIO_MAX = 100;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let reparto = 0.5;           // 0 = toda para P1, 1 = toda para P2
  let frio = [0, 0];
  let necesita = [0.42, 0.42]; // cuánta manta pide cada uno ahora mismo
  let corriente = 0, proxima = 4, ladoCorriente = 0;
  let tiempo = DURACION, tirones = [0, 0];
  let sb = null, terminado = false, temblor = [0, 0];

  /** Manta efectiva de cada jugador. Suman siempre 1: no hay manta extra. */
  const parte = (i) => (i === 0 ? 1 - reparto : reparto);

  function reiniciar() {
    reparto = 0.5;
    frio = [0, 0];
    necesita = [0.42, 0.42];
    corriente = 0; proxima = 4; ladoCorriente = 0;
    tiempo = DURACION; tirones = [0, 0];
    terminado = false;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Tira de la manta con tu tecla · si uno se congela, <b>pierden los dos</b>');
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo -= dt;

      // Corrientes de aire: suben lo que necesita un lado durante unos segundos.
      proxima -= dt;
      if (proxima <= 0) {
        ladoCorriente = rng() < 0.5 ? 0 : 1;
        corriente = 4 + rng() * 3;
        proxima = 9 + rng() * 6;
        audio.noise({ dur: 0.6, gain: 0.12, filter: 700, sweep: -300 });
        ui.toast(`Corriente por el lado de ${players[ladoCorriente].name}`, { ms: 1300, color: '#8fd5ff' });
      }
      if (corriente > 0) corriente -= dt;

      // La noche avanza y hace más frío: lo que hace falta va subiendo para los dos.
      const avance = 1 - tiempo / DURACION;
      for (let i = 0; i < 2; i++) {
        necesita[i] = 0.38 + avance * 0.16 + (corriente > 0 && ladoCorriente === i ? 0.16 : 0);
      }

      for (let i = 0; i < 2; i++) {
        const pl = input.player(i);
        if (pl.pressed('a')) {
          tirones[i]++;
          temblor[i] = 1;
          reparto = clamp(reparto + (i === 0 ? -TIRON : TIRON), 0.06, 0.94);
          audio.tone({ freq: 160 + rng() * 40, dur: 0.06, gain: 0.12, type: 'triangle' });
          haptics.play('tap', { player: i });
          particles.burst(W * (i === 0 ? 0.3 : 0.7), H * 0.55, 4, {
            speed: 70, color: players[i].color, size: 3, shape: 'circle',
          });
        }
        temblor[i] = Math.max(0, temblor[i] - dt * 3);
      }

      // La manta resbala hacia el centro: nadie conserva ventaja sin tirar.
      reparto += (0.5 - reparto) * RECUPERA * dt;

      for (let i = 0; i < 2; i++) {
        const falta = necesita[i] - parte(i);
        // Destapado: se enfría. Bien tapado: recupera, pero más despacio.
        frio[i] = clamp(frio[i] + (falta > 0 ? falta * 62 : falta * 26) * dt, 0, FRIO_MAX);
      }

      sb.update(Math.round(FRIO_MAX - frio[0]), Math.round(FRIO_MAX - frio[1]));
      sb.setCenter(`${Math.max(0, tiempo).toFixed(0)}s de noche`);

      if (frio[0] >= FRIO_MAX || frio[1] >= FRIO_MAX) return terminar(false);
      if (tiempo <= 0) return terminar(true);

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a0f1a');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#101a2e');
      grd.addColorStop(1, '#070b14');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // Cama
      const camaY = H * 0.34, camaH = H * 0.44;
      g.fillStyle = '#1c2438';
      g.fillRect(W * 0.08, camaY, W * 0.84, camaH);
      g.fillStyle = '#28324c';
      g.fillRect(W * 0.08, camaY, W * 0.84, 16);

      // Los dos, tumbados, cada uno en su mitad
      for (let i = 0; i < 2; i++) {
        const cx = i === 0 ? W * 0.28 : W * 0.72;
        const t = temblor[i] * 3;
        g.save();
        g.translate(cx + Math.sin(t * 12) * t, camaY + camaH * 0.55);
        ctx.engine.glowCircle(0, 0, 26, players[i].color, 14);
        g.restore();
      }

      // La manta: un rectángulo que se reparte por el borde móvil.
      const bordeX = W * 0.08 + W * 0.84 * (1 - reparto);
      const mantaY = camaY + camaH * 0.3;
      const mantaH = camaH * 0.62;
      g.fillStyle = players[0].color + '55';
      g.fillRect(W * 0.08, mantaY, bordeX - W * 0.08, mantaH);
      g.fillStyle = players[1].color + '55';
      g.fillRect(bordeX, mantaY, W * 0.92 - bordeX, mantaH);
      // Pliegues, para que se lea como tela y no como dos rectángulos.
      g.save();
      g.strokeStyle = '#ffffff18';
      g.lineWidth = 2;
      for (let x = W * 0.1; x < W * 0.92; x += 26) {
        g.beginPath();
        g.moveTo(x, mantaY);
        g.lineTo(x + Math.sin(x * 0.05) * 8, mantaY + mantaH);
        g.stroke();
      }
      g.restore();
      g.strokeStyle = '#fff';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(bordeX, mantaY - 8); g.lineTo(bordeX, mantaY + mantaH + 8); g.stroke();

      particles.render(g);

      // Termómetros: lo único que hay que mirar mientras se juega.
      for (let i = 0; i < 2; i++) {
        const x = i === 0 ? W * 0.1 : W * 0.9 - 22;
        const alto = H * 0.2;
        const y = H * 0.08;
        g.fillStyle = '#ffffff14';
        g.fillRect(x, y, 22, alto);
        const k = frio[i] / FRIO_MAX;
        const col = k > 0.8 ? '#8fd5ff' : k > 0.5 ? '#ffd166' : players[i].color;
        g.fillStyle = col;
        g.fillRect(x, y + alto * (1 - (1 - k)), 22, alto * (1 - k));
        g.strokeStyle = '#ffffff33';
        g.lineWidth = 1;
        g.strokeRect(x, y, 22, alto);
        if (k > 0.75) {
          ctx.engine.text('¡FRÍO!', x + 11, y + alto + 18, { size: 10, color: '#8fd5ff', glow: 8 });
        }
      }

      // Lo que pide cada uno, marcado sobre la manta: la negociación en curso.
      for (let i = 0; i < 2; i++) {
        const nx = W * 0.08 + W * 0.84 * (i === 0 ? necesita[0] : 1 - necesita[1]);
        g.save();
        g.setLineDash([5, 5]);
        g.strokeStyle = players[i].color + 'aa';
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(nx, mantaY - 14); g.lineTo(nx, mantaY + mantaH + 14); g.stroke();
        g.restore();
      }

      if (corriente > 0) {
        const x = ladoCorriente === 0 ? W * 0.16 : W * 0.84;
        g.save();
        g.globalAlpha = 0.35 + Math.sin(ctx.engine.time * 8) * 0.15;
        ctx.engine.text('≈≈≈', x, H * 0.3, { size: 22, color: '#8fd5ff', glow: 10 });
        g.restore();
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar(aguantaron) {
    terminado = true;
    const congelado = frio[0] >= FRIO_MAX ? 0 : frio[1] >= FRIO_MAX ? 1 : -1;
    let veredicto;
    if (aguantaron && Math.abs(frio[0] - frio[1]) < 15) veredicto = 'Noche entera y ninguno pasó frío. Eso es un acuerdo.';
    else if (aguantaron) veredicto = `Durmieron, pero ${players[frio[0] > frio[1] ? 0 : 1].name} se llevó la peor parte.`;
    else veredicto = `${players[congelado].name} se quedó helado: nadie duerme así.`;
    if (aguantaron) { audio.win(); haptics.play('score'); } else { audio.lose(); haptics.defeat(); }
    ctx.finish({
      winner: -1,
      scores: [tirones[0], tirones[1]],
      detail: `${veredicto} · ${tirones[0]} y ${tirones[1]} tirones`,
      record: ctx.record('noche', Math.round(DURACION - Math.max(0, tiempo)), 'high'),
    });
  }
}
