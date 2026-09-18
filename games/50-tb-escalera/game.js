/**
 * Escalera de Nervios — sube escalones para multiplicar o plántate y guarda.
 *
 * Cada escalón de la barra multiplica lo acumulado, pero uno de ellos está
 * trucado y se lo lleva todo. En tu turno decides: subir (tocar el siguiente
 * escalón) o plantarte (tocar el botón de la izquierda). El truco está en que
 * los escalones ya pisados por el rival son seguros para ti: cada ronda te
 * llegas con más información y menos margen.
 */

import { prepararPantalla } from '../../core/tbgame.js';
import { icon } from '../../core/icons.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const ESCALONES = 10;
const RONDAS = 4;
const BASE = 10;

export function create(ctx) {
  const { touchbar, audio, haptics, players } = ctx;

  let cab = null, espejo = null, disponible = false, pantalla = null;
  let elPanel = null;
  let trampa = 0;
  let altura = 0;               // escalón alcanzado en la ronda actual
  let seguros = [];             // escalones ya comprobados esta ronda
  let acumulado = 0;
  let turno = 0, ronda = 1;
  let fase = 'jugando';         // jugando | resuelto | fin
  let pausa = 0;
  const banco = [0, 0];
  let desuscribir = null;

  const multiplicador = (n) => Math.round((1 + n * 0.55) * 10) / 10;

  function nuevaRonda() {
    trampa = Math.floor(Math.random() * ESCALONES);
    altura = 0;
    seguros = [];
    acumulado = BASE;
    // Alterna quién empieza; el que empieza tiene menos información.
    turno = (ronda - 1) % 2;
    fase = 'jugando';
    pintar();
    actualizar();
  }

  function pintar() {
    const celdas = [];
    // Primer botón: plantarse
    celdas.push({ label: '$', bg: '#f2f2f2', color: '#000000' });
    for (let i = 0; i < ESCALONES; i++) {
      if (fase === 'resuelto' && i === trampa) {
        celdas.push({ label: 'X', bg: '#ff2e2e', color: '#ffffff', clase: 'viva' });
      } else if (seguros.includes(i)) {
        celdas.push({ label: '✓', bg: '#1f7a3a', color: '#ffffff' });
      } else if (i === altura) {
        celdas.push({ label: '▲', bg: players[turno].color, color: '#000000', clase: 'viva' });
      } else {
        celdas.push({ label: `×${multiplicador(i + 1)}`, bg: '#1a1a1a', color: '#8a8a8a', clase: 'tenue' });
      }
    }
    espejo?.pintar(celdas);
    if (!disponible) return;
    touchbar.set([
      { type: 'button', id: 'plantar', label: `PLANTARSE (${Math.round(acumulado)})`, bg: '#f2f2f2', color: '#000000' },
      ...Array.from({ length: ESCALONES }, (_, i) => ({
        type: 'button', id: `e${i}`,
        label: seguros.includes(i) ? '✓' : `×${multiplicador(i + 1)}`,
        bg: seguros.includes(i) ? '#1f7a3a' : i === altura ? players[turno].color : '#1a1a1a',
        color: seguros.includes(i) || i === altura ? '#000000' : '#8a8a8a',
        enabled: i === altura,
      })),
    ]);
  }

  function actualizar() {
    const p = players[turno];
    cab.resaltar(turno);
    cab.decir(
      `Ronda ${ronda}/${RONDAS} · <b style="color:${p.color}">${p.name}</b> ·
       acumulado <b>${Math.round(acumulado)}</b> ·
       sube al escalón ×${multiplicador(altura + 1)} o plántate`
    );
    elPanel.innerHTML = `
      <div class="es-cols">
        ${[0, 1].map((j) => `
          <div class="es-col" style="--c:${players[j].color}">
            <div class="es-banco">${banco[j]}</div>
            <div class="es-et">en el banco</div>
          </div>`).join('<div class="es-vs">·</div>')}
      </div>
      <div class="es-riesgo">Riesgo del siguiente escalón:
        <b>${Math.round((1 / (ESCALONES - seguros.length)) * 100)}%</b></div>`;
  }

  function subir(i) {
    if (fase !== 'jugando' || i !== altura) return;
    espejo?.destello(i + 1, i === trampa ? '#ff2e2e' : '#a8ff3e');

    if (i === trampa) {
      fase = 'resuelto';
      pausa = 2.2;
      audio.explosion();
      haptics.explosion(turno);
      touchbar.haptic('heavy');
      cab.decir(`${icon('bomb', { size: 15 })} <b style="color:${players[turno].color}">${players[turno].name}</b> pisó el escalón trucado
                 y pierde los ${Math.round(acumulado)} puntos acumulados`);
      pintar();
      return;
    }

    seguros.push(i);
    altura++;
    acumulado = BASE * multiplicador(altura);
    audio.tone({ freq: 300 + altura * 60, dur: 0.09, gain: 0.15, type: 'square' });
    haptics.play('bounce', { player: turno, scale: 0.6 + altura * 0.06 });
    touchbar.haptic('light');

    if (altura >= ESCALONES) {
      // Llegó arriba sin pisar la trampa: se lleva todo con bono.
      fase = 'resuelto';
      pausa = 2.2;
      banco[turno] += Math.round(acumulado * 1.5);
      cab.marcar(banco[0], banco[1]);
      audio.win();
      haptics.play('victory', { player: turno });
      cab.decir(`${icon('trophy', { size: 15 })} <b style="color:${players[turno].color}">${players[turno].name}</b> llegó arriba ·
                 +${Math.round(acumulado * 1.5)} con bono`);
      pintar();
      return;
    }

    // Sigue el mismo jugador hasta que se planta o revienta.
    pintar();
    actualizar();
  }

  function plantarse() {
    if (fase !== 'jugando') return;
    if (altura === 0) { audio.error(); haptics.error(turno); return; }
    fase = 'resuelto';
    pausa = 1.8;
    banco[turno] += Math.round(acumulado);
    cab.marcar(banco[0], banco[1]);
    audio.score(turno);
    haptics.score(turno);
    touchbar.haptic('medium');
    cab.decir(`<b style="color:${players[turno].color}">${players[turno].name}</b> se planta en el escalón
               ${altura} y guarda <b>${Math.round(acumulado)}</b>`);
    pintar();
  }

  return {
    async init() {
      inyectarEstilos();
      const p = await prepararPantalla(ctx, { titulo: 'Escalera de Nervios', segmentos: ESCALONES + 1 });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible; pantalla = p.pantalla;
      cab.marcar(0, 0);

      elPanel = document.createElement('div');
      elPanel.className = 'es-panel';
      pantalla.appendChild(elPanel);

      if (!disponible) return;
      desuscribir = touchbar.on((ev) => {
        if (ev.type !== 'click') return;
        if (ev.id === 'plantar') plantarse();
        else if (ev.id.startsWith('e')) subir(parseInt(ev.id.slice(1), 10));
      });
      nuevaRonda();
    },

    update(dt) {
      if (!disponible || fase !== 'resuelto') return;
      pausa -= dt;
      if (pausa > 0) return;

      // Cada ronda la juegan los dos: primero uno, luego el otro con la
      // información de los escalones que el primero destapó.
      if (turno === (ronda - 1) % 2) {
        turno = 1 - turno;
        altura = 0;
        acumulado = BASE;
        // Los escalones seguros descubiertos se conservan: esa es la ventaja
        // de ir segundo, y por eso se alterna quién empieza cada ronda.
        fase = 'jugando';
        pintar();
        actualizar();
        return;
      }

      ronda++;
      if (ronda > RONDAS) {
        ctx.finish({
          winner: banco[0] === banco[1] ? -1 : banco[0] > banco[1] ? 0 : 1,
          scores: [banco[0], banco[1]],
          detail: `${RONDAS} rondas de escalera`,
          record: ctx.record('banco', Math.max(banco[0], banco[1]), 'high'),
        });
        return;
      }
      nuevaRonda();
    },

    destroy() { desuscribir?.(); touchbar.clear(); touchbar.setFocus(false); ctx.root.innerHTML = ''; },
  };
}

function inyectarEstilos() {
  if (document.getElementById('es-css')) return;
  const s = document.createElement('style');
  s.id = 'es-css';
  s.textContent = `
    .es-panel { text-align:center; }
    .es-cols { display:flex; align-items:center; justify-content:center; gap:36px; }
    .es-col { text-align:center; }
    .es-banco { font-family:var(--font-display); font-size:26px; color:var(--c); }
    .es-et { font-size:10px; color:var(--ink-faint); letter-spacing:.1em; text-transform:uppercase; }
    .es-vs { color:var(--ink-faint); }
    .es-riesgo { margin-top:16px; font-size:13px; color:var(--ink-dim); }
    .es-riesgo b { color:var(--danger); }
  `;
  document.head.appendChild(s);
}
