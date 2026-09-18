/**
 * Cinta Transportadora — cooperativo puro sobre la Touch Bar.
 *
 * Por la barra van pasando cajas de izquierda a derecha. Cada caja tiene un
 * color y hay que tocarla mientras está sobre la celda del color correcto:
 * las rojas en la mitad de Llama (izquierda), las azules en la de Marea
 * (derecha). Si una caja se sale por el borde, la pierden LOS DOS.
 *
 * Es en tiempo real y los dos tienen las manos sobre el mismo cristal, así
 * que la coordinación es física: hay que avisarse en voz alta cuando viene
 * una caja del color del otro.
 */

import { prepararPantalla } from '../../core/tbgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const CELDAS = 16;
const MITAD = CELDAS / 2;
const VIDAS = 5;
const META = 30;

export function create(ctx) {
  const { touchbar, audio, haptics, players } = ctx;

  let cab = null, espejo = null, disponible = false;
  let cajas = [];            // {pos, color, id}
  let vidas = VIDAS, salvadas = 0, fallos = 0;
  const porJugador = [0, 0];
  let vel = 2.2;             // celdas por segundo
  let proxima = 0;
  let fase = 'jugando';      // jugando | fin
  let desuscribir = null;
  let idc = 0;

  const mitadDe = (i) => (i < MITAD ? 0 : 1);
  const COLOR = ['#ff4d2e', '#2ea8ff'];

  function pintar() {
    const celdas = [];
    for (let i = 0; i < CELDAS; i++) {
      const m = mitadDe(i);
      const caja = cajas.find((c) => Math.floor(c.pos) === i);
      if (caja) {
        // La caja se ve del color de quien debe recogerla.
        celdas.push({ label: '▮', bg: COLOR[caja.color], color: '#000000', clase: 'viva' });
      } else {
        celdas.push({ label: '', bg: m === 0 ? '#1a0e0c' : '#0c141a', clase: 'tenue' });
      }
    }
    espejo?.pintar(celdas);
    if (!disponible) return;
    touchbar.set(celdas.map((c, i) => ({
      type: 'button', id: `c${i}`,
      label: c.label || ' ',
      bg: c.bg,
      color: '#000000',
    })));
  }

  function texto() {
    cab.decir(
      `Salvadas <b>${salvadas}</b>/${META} · vidas <b>${vidas}</b> · ` +
      `<b style="color:${COLOR[0]}">rojas</b> a la izquierda · ` +
      `<b style="color:${COLOR[1]}">azules</b> a la derecha`
    );
  }

  function tocar(i) {
    if (fase !== 'jugando') return;
    const quien = mitadDe(i);
    const idx = cajas.findIndex((c) => Math.floor(c.pos) === i);
    if (idx < 0) {
      // Tocar en vacío penaliza un poco: no vale machacar la barra.
      audio.error();
      haptics.error(quien);
      return;
    }
    const caja = cajas[idx];
    if (caja.color !== quien) {
      // Recogida por el jugador equivocado: se pierde.
      cajas.splice(idx, 1);
      vidas--; fallos++;
      espejo?.destello(i, '#ff2e2e');
      audio.explosion();
      haptics.explosion(quien);
      touchbar.haptic('heavy');
      texto();
      if (vidas <= 0) terminar();
      return;
    }
    cajas.splice(idx, 1);
    salvadas++; porJugador[quien]++;
    espejo?.destello(i, COLOR[quien]);
    audio.tone({ freq: 420 + quien * 120, dur: 0.06, gain: 0.13, type: 'square' });
    haptics.play('tap', { player: quien });
    touchbar.haptic('light');
    // Acelera poco a poco: la tensión sube sola.
    vel = Math.min(6.4, vel + 0.11);
    texto();
    if (salvadas >= META) terminar();
  }

  function terminar() {
    if (fase === 'fin') return;
    fase = 'fin';
    const exito = salvadas >= META;
    if (exito) { audio.win(); haptics.play('victory'); }
    else { audio.lose(); haptics.play('defeat'); }
    ctx.finish({
      winner: -1,
      scores: [porJugador[0], porJugador[1]],
      detail: exito
        ? `¡${META} cajas salvadas! ${fallos} fallo(s)`
        : `Se quedaron en ${salvadas} de ${META}`,
      record: ctx.record('salvadas', salvadas, 'high'),
    });
  }

  return {
    async init() {
      const p = await prepararPantalla(ctx, { titulo: 'Cinta Transportadora', segmentos: CELDAS });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible;
      cab.marcar(0, 0);
      if (!disponible) return;
      desuscribir = touchbar.on((ev) => {
        if (ev.type !== 'click') return;
        const i = parseInt(ev.id.slice(1), 10);
        if (!Number.isNaN(i)) tocar(i);
      });
      texto();
      pintar();
    },

    update(dt) {
      if (!disponible || fase !== 'jugando') return;

      proxima -= dt;
      if (proxima <= 0) {
        cajas.push({ pos: -1, color: Math.random() < 0.5 ? 0 : 1, id: ++idc });
        proxima = Math.max(0.55, 1.9 - salvadas * 0.035);
      }

      for (const c of cajas) c.pos += vel * dt;

      // Las que salen por la derecha se pierden
      const antes = cajas.length;
      cajas = cajas.filter((c) => c.pos < CELDAS);
      const perdidas = antes - cajas.length;
      if (perdidas > 0) {
        vidas -= perdidas; fallos += perdidas;
        audio.back();
        haptics.play('defeat');
        touchbar.haptic('medium');
        texto();
        if (vidas <= 0) { terminar(); return; }
      }

      cab.marcar(porJugador[0], porJugador[1]);
      pintar();
    },

    destroy() { desuscribir?.(); touchbar.clear(); touchbar.setFocus(false); ctx.root.innerHTML = ''; },
  };
}
