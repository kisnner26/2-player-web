/**
 * Cofres Gemelos — memoria espacial repartida entre los dos.
 *
 * Doce cofres en la barra esconden seis parejas. Se turnan destapando dos
 * cofres, pero con un giro: cada jugador SOLO puede destapar cofres de su
 * mitad, así que para hacer pareja con algo del otro lado hay que pedirle al
 * compañero que lo abra él. Nadie puede completar una pareja cruzada solo.
 *
 * La puntuación es de la pareja: importa cuántas encuentran entre los dos y
 * en cuántos intentos, no quién las encontró.
 */

import { prepararPantalla, indicadorTurno } from '../../core/tbgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const CELDAS = 12;
const MITAD = CELDAS / 2;
const PAREJAS = CELDAS / 2;

/** Símbolos de una sola letra: la barra nativa solo admite texto plano. */
const SIMBOLOS = ['A', 'B', 'C', 'D', 'E', 'F'];
const COLORES = ['#ff4d2e', '#2ea8ff', '#a8ff3e', '#ffd166', '#b04cff', '#ff6ec7'];

export function create(ctx) {
  const { touchbar, audio, haptics, players, rng } = ctx;

  let cab = null, espejo = null, disponible = false;
  let cofres = [];             // {sim, color, abierto, resuelto}
  let abiertos = [];           // índices destapados este turno
  let turno = 0;
  let intentos = 0, encontradas = 0;
  let espera = 0;
  let fase = 'jugando';
  let desuscribir = null;

  const mitadDe = (i) => (i < MITAD ? 0 : 1);

  function repartir() {
    const mazo = [];
    for (let k = 0; k < PAREJAS; k++) {
      mazo.push({ sim: SIMBOLOS[k], color: COLORES[k] });
      mazo.push({ sim: SIMBOLOS[k], color: COLORES[k] });
    }
    for (let i = mazo.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [mazo[i], mazo[j]] = [mazo[j], mazo[i]];
    }
    cofres = mazo.map((c) => ({ ...c, abierto: false, resuelto: false }));
  }

  function pintar() {
    const celdas = cofres.map((c, i) => {
      if (c.resuelto) return { label: c.sim, bg: c.color, color: '#000000' };
      if (c.abierto) return { label: c.sim, bg: c.color, color: '#000000', clase: 'viva' };
      const m = mitadDe(i);
      return { label: '?', bg: m === 0 ? '#241418' : '#141c24', color: '#7a7a8a', clase: 'tenue' };
    });
    espejo?.pintar(celdas);
    if (!disponible) return;
    touchbar.set([
      indicadorTurno(players, turno),
      ...celdas.map((c, i) => ({
        type: 'button', id: `k${i}`,
        label: c.label,
        bg: c.bg, color: c.color,
        enabled: !cofres[i].resuelto && !cofres[i].abierto && fase === 'jugando',
      })),
    ]);
  }

  function texto() {
    const p = players[turno];
    cab.decir(
      `Parejas <b>${encontradas}</b>/${PAREJAS} · intentos <b>${intentos}</b> · ` +
      `abre <b style="color:${p.color}">${p.name}</b> (solo tu mitad)`
    );
    cab.resaltar(turno);
  }

  function tocar(i) {
    if (fase !== 'jugando' || espera > 0) return;
    const c = cofres[i];
    if (c.abierto || c.resuelto) return;

    if (mitadDe(i) !== turno) {
      // Ese cofre es del otro lado: hay que pedírselo al compañero.
      cab.decir(`Ese cofre es de <b style="color:${players[1 - turno].color}">${players[1 - turno].name}</b>: pídeselo`);
      audio.error();
      haptics.error(turno);
      touchbar.haptic('medium');
      return;
    }

    c.abierto = true;
    abiertos.push(i);
    espejo?.destello(i, c.color);
    audio.blip();
    haptics.play('soft', { player: turno });
    touchbar.haptic('light');
    pintar();

    if (abiertos.length === 2) {
      intentos++;
      const [a, b] = abiertos.map((k) => cofres[k]);
      if (a.sim === b.sim) {
        a.resuelto = b.resuelto = true;
        encontradas++;
        abiertos = [];
        audio.win();
        haptics.play('score');
        touchbar.haptic('heavy');
        cab.marcar(encontradas, intentos);
        if (encontradas >= PAREJAS) return terminar();
        // Acertar deja seguir al mismo jugador.
        texto(); pintar();
      } else {
        espera = 1.1;
        audio.error();
        touchbar.haptic('medium');
      }
    } else {
      texto();
    }
  }

  function terminar() {
    fase = 'fin';
    audio.win();
    haptics.play('victory');
    const perfectas = PAREJAS;
    ctx.finish({
      winner: -1,
      scores: [encontradas, intentos],
      detail: `${PAREJAS} parejas en ${intentos} intentos` +
              (intentos <= perfectas + 2 ? ' · casi perfecto' : ''),
      record: ctx.record('intentos', intentos, 'low'),
    });
  }

  return {
    async init() {
      const p = await prepararPantalla(ctx, { titulo: 'Cofres Gemelos', segmentos: CELDAS });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible;
      cab.marcar(0, 0);
      repartir();
      if (!disponible) return;
      desuscribir = touchbar.on((ev) => {
        if (ev.type !== 'click') return;
        const i = parseInt(ev.id.slice(1), 10);
        if (!Number.isNaN(i)) tocar(i);
      });
      texto(); pintar();
    },

    update(dt) {
      if (!disponible || fase !== 'jugando') return;
      if (espera > 0) {
        espera -= dt;
        if (espera <= 0) {
          for (const k of abiertos) cofres[k].abierto = false;
          abiertos = [];
          turno = 1 - turno;
          texto(); pintar();
        }
      }
    },

    destroy() { desuscribir?.(); touchbar.clear(); touchbar.setFocus(false); ctx.root.innerHTML = ''; },
  };
}
