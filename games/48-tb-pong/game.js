/**
 * Pong Lineal — Pong reducido a una sola dimensión: la barra es el campo.
 *
 * La pelota va y viene por la Touch Bar. Cuando entra en tu zona (los tres
 * botones de tu extremo) tienes que tocarla; si tocas fuera de tiempo o de
 * sitio, punto para el otro. Cada golpe acelera la pelota.
 *
 * Es el único de los diez que va en tiempo real con los dos jugadores a la vez
 * sobre la barra, y funciona porque cada uno tiene su extremo bien separado.
 */

import { prepararPantalla } from '../../core/tbgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const CELDAS = 18;
const ZONA = 3;               // celdas de zona de golpeo en cada extremo
const PARA_GANAR = 7;
const VEL_INICIAL = 6.5;      // celdas por segundo
const VEL_MAX = 26;

export function create(ctx) {
  const { touchbar, audio, haptics, players } = ctx;

  let cab = null, espejo = null, disponible = false;
  let pos = CELDAS / 2;
  let dir = 1;
  let vel = VEL_INICIAL;
  const score = [0, 0];
  let fase = 'jugando';        // jugando | punto
  let pausa = 0;
  let golpes = 0, maxGolpes = 0;
  let desuscribir = null;

  const zonaDe = (i) => (i < ZONA ? 0 : i >= CELDAS - ZONA ? 1 : -1);

  function sacar(hacia) {
    pos = CELDAS / 2;
    dir = hacia === 0 ? -1 : 1;
    vel = VEL_INICIAL;
    golpes = 0;
    fase = 'jugando';
    pintar();
  }

  function pintar() {
    const idx = Math.max(0, Math.min(CELDAS - 1, Math.floor(pos)));
    const celdas = [];
    for (let i = 0; i < CELDAS; i++) {
      const z = zonaDe(i);
      if (i === idx) {
        celdas.push({ label: '●', bg: '#ffffff', color: '#000000', clase: 'viva' });
      } else if (z >= 0) {
        // La zona propia se ilumina cuando la pelota se acerca: aviso previo.
        const cerca = z === 0 ? pos < ZONA + 3 && dir < 0 : pos > CELDAS - ZONA - 3 && dir > 0;
        celdas.push({
          label: '',
          bg: cerca ? players[z].color : sombrear(players[z].color),
          clase: cerca ? '' : 'tenue',
        });
      } else {
        celdas.push({ label: '', bg: '#0d0d0d', clase: 'tenue' });
      }
    }
    espejo?.pintar(celdas);
    if (!disponible) return;
    touchbar.set(celdas.map((c, i) => ({
      type: 'button', id: `t${i}`, label: c.label || ' ', bg: c.bg, color: '#000000',
    })));
  }

  function sombrear(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) * 0.22, g = ((n >> 8) & 255) * 0.22, b = (n & 255) * 0.22;
    return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  }

  function tocar(i) {
    if (fase !== 'jugando') return;
    const z = zonaDe(i);
    if (z < 0) return;                    // el centro no hace nada

    espejo?.destello(i, players[z].color);
    const haciaEl = z === 0 ? dir < 0 : dir > 0;
    const enSuZona = zonaDe(Math.floor(pos)) === z;

    if (haciaEl && enSuZona) {
      // Golpe válido. Acertar la celda exacta da un extra de velocidad.
      const exacto = Math.floor(pos) === i;
      dir *= -1;
      vel = Math.min(VEL_MAX, vel * (exacto ? 1.22 : 1.09));
      golpes++;
      maxGolpes = Math.max(maxGolpes, golpes);
      audio.bounce(z);
      haptics.bounce(z, exacto ? 1.3 : 0.9);
      touchbar.haptic(exacto ? 'medium' : 'light');
      if (exacto) cab.decir(`¡Golpe limpio! · ${golpes} intercambios · velocidad ${vel.toFixed(1)}`);
      else cab.decir(`${golpes} intercambios · velocidad ${vel.toFixed(1)}`);
      pintar();
      return;
    }

    // Tocar sin que la pelota esté ahí: falta.
    punto(1 - z, `${players[z].name} tocó a destiempo`);
  }

  function punto(quien, motivo) {
    fase = 'punto';
    pausa = 1.3;
    score[quien]++;
    cab.marcar(score[0], score[1]);
    cab.resaltar(quien);
    cab.decir(`Punto para <b style="color:${players[quien].color}">${players[quien].name}</b> · ${motivo}`);
    audio.score(quien);
    haptics.score(quien);
    touchbar.haptic('heavy');

    const flash = Array.from({ length: CELDAS }, () => ({ label: '', bg: players[quien].color }));
    espejo?.pintar(flash);
    if (disponible) {
      touchbar.set(flash.map((c, i) => ({ type: 'button', id: `t${i}`, label: ' ', bg: c.bg, color: '#000000' })));
    }
  }

  return {
    async init() {
      const p = await prepararPantalla(ctx, { titulo: 'Pong Lineal', segmentos: CELDAS });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible;
      cab.marcar(0, 0);
      cab.decir('Toca tu extremo cuando la pelota entre en tu zona');
      if (!disponible) return;
      desuscribir = touchbar.on((ev) => {
        if (ev.type !== 'click') return;
        const i = parseInt(ev.id.slice(1), 10);
        if (!Number.isNaN(i)) tocar(i);
      });
      sacar(Math.random() < 0.5 ? 0 : 1);
    },

    update(dt) {
      if (!disponible) return;

      if (fase === 'punto') {
        pausa -= dt;
        if (pausa > 0) return;
        const g = score.findIndex((s) => s >= PARA_GANAR);
        if (g >= 0) {
          ctx.finish({
            winner: g, scores: [score[0], score[1]],
            detail: `Mejor intercambio: ${maxGolpes} golpes`,
            record: ctx.record('intercambio', maxGolpes, 'high'),
          });
          return;
        }
        sacar(score[0] > score[1] ? 0 : 1);
        return;
      }

      pos += dir * vel * dt;
      if (pos < 0) { punto(1, `se le escapó a ${players[0].name}`); return; }
      if (pos > CELDAS) { punto(0, `se le escapó a ${players[1].name}`); return; }
      pintar();
    },

    destroy() { desuscribir?.(); touchbar.clear(); touchbar.setFocus(false); ctx.root.innerHTML = ''; },
  };
}
