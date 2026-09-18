/**
 * Caja Fuerte — desliza por la barra buscando el punto exacto de apertura.
 *
 * Aprovecha lo único que la Touch Bar hace mejor que un teclado: el
 * deslizamiento continuo y absoluto. Mientras arrastras el dedo, la barra se
 * tiñe de frío a caliente en tiempo real, así que el dedo "siente" dónde está
 * el punto sin mirar. Se juega por turnos, un intento cada uno.
 */

import { prepararPantalla, indicadorTurno } from '../../core/tbgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const CELDAS = 14;
const TOLERANCIA = 0.028;      // margen de apertura (≈ 30 px de barra)
const MAX_INTENTOS = 6;

export function create(ctx) {
  const { touchbar, audio, haptics, players } = ctx;

  let cab = null, espejo = null, disponible = false;
  let secreto = 0;             // 0..1
  let valor = 0.5;             // posición actual del dedo
  let turno = 0;
  const intentos = [0, 0];
  let fase = 'girando';        // girando | abierta | fallo
  let pausa = 0;
  let desuscribir = null;
  let ultimaCalor = -1;

  function nuevaCaja() {
    // Se evita el punto exacto de los extremos: sería adivinable al instante.
    secreto = 0.08 + Math.random() * 0.84;
    valor = 0.5;
    fase = 'girando';
    pintar();
    actualizarTexto();
  }

  const calor = () => 1 - Math.min(1, Math.abs(valor - secreto) / 0.42);

  function colorCalor(c) {
    // Azul (frío) → rojo (caliente), pasando por ámbar.
    if (c < 0.35) return '#1b3a6b';
    if (c < 0.6) return '#2a6b8a';
    if (c < 0.78) return '#c9a020';
    if (c < 0.92) return '#e06820';
    return '#ff2e2e';
  }

  function pintar() {
    const c = calor();
    const idx = Math.round(valor * (CELDAS - 1));
    const celdas = [];
    for (let i = 0; i < CELDAS; i++) {
      if (fase === 'abierta') {
        celdas.push({ label: i === idx ? '✓' : '', bg: '#1f7a3a', color: '#ffffff' });
      } else if (i === idx) {
        celdas.push({ label: '▮', bg: colorCalor(c), color: '#ffffff', clase: 'viva' });
      } else {
        // Las celdas alrededor insinúan la temperatura sin delatar el punto.
        const d = Math.abs(i - idx) / CELDAS;
        celdas.push({ label: '', bg: d < 0.16 ? colorCalor(c * 0.6) : '#121212' });
      }
    }
    espejo?.pintar(celdas);
    if (!disponible) return;

    touchbar.set([
      indicadorTurno(players, turno),
      { type: 'label', id: 'lbl', label: fase === 'abierta' ? '  ¡ABIERTA!  ' : `  ${etiquetaCalor(c)}  ` },
      { type: 'slider', id: 'dial', label: '', value: Math.round(valor * 100), min: 0, max: 100 },
      { type: 'button', id: 'abrir', label: 'ABRIR', bg: colorCalor(c), color: '#ffffff' },
    ]);
  }

  function etiquetaCalor(c) {
    if (c > 0.94) return 'AL ROJO';
    if (c > 0.82) return 'MUY CALIENTE';
    if (c > 0.62) return 'CALIENTE';
    if (c > 0.4) return 'TIBIO';
    if (c > 0.2) return 'FRÍO';
    return 'HELADO';
  }

  function actualizarTexto() {
    const p = players[turno];
    cab.resaltar(turno);
    cab.decir(
      `Turno de <b style="color:${p.color}">${p.name}</b> ·
       desliza el dial y pulsa <b>ABRIR</b> ·
       intento ${intentos[turno] + 1} de ${MAX_INTENTOS}`
    );
  }

  function mover(v) {
    if (fase !== 'girando') return;
    valor = Math.max(0, Math.min(1, v));
    const c = calor();
    // Realimentación háptica proporcional: es lo que hace que el dedo "lea".
    const nivel = Math.floor(c * 5);
    if (nivel !== ultimaCalor) {
      ultimaCalor = nivel;
      touchbar.haptic(c > 0.85 ? 'heavy' : c > 0.6 ? 'medium' : 'light');
      haptics.play({ lf: 0.12 + c * 0.6, hf: 0.1, dur: 0.05, freq: 50 + c * 60, shake: 0, curve: 'click' },
                   { player: turno });
      audio.tone({ freq: 200 + c * 900, dur: 0.035, gain: 0.07, type: 'sine' });
    }
    pintar();
  }

  function abrir() {
    if (fase !== 'girando') return;
    intentos[turno]++;
    cab.marcar(intentos[0], intentos[1]);
    const dist = Math.abs(valor - secreto);

    if (dist <= TOLERANCIA) {
      fase = 'abierta';
      pausa = 2;
      audio.win();
      haptics.play('victory', { player: turno });
      touchbar.haptic('heavy');
      cab.decir(`<b style="color:${players[turno].color}">${players[turno].name}</b> abre la caja
                 en ${intentos[turno]} intento${intentos[turno] > 1 ? 's' : ''}`);
      pintar();
      return;
    }

    fase = 'fallo';
    pausa = 1.2;
    audio.error();
    haptics.error(turno);
    touchbar.haptic('heavy');
    const direccion = valor < secreto ? 'más a la derecha' : 'más a la izquierda';
    cab.decir(`Fallo · el punto está <b>${direccion}</b> (${etiquetaCalor(calor())})`);
  }

  return {
    async init() {
      const p = await prepararPantalla(ctx, { titulo: 'Caja Fuerte', segmentos: CELDAS });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible;
      cab.marcar(0, 0);
      if (!disponible) return;
      desuscribir = touchbar.on((ev) => {
        if (ev.id === 'dial' && ev.type === 'change') mover(ev.value / 100);
        if (ev.id === 'abrir' && ev.type === 'click') abrir();
      });
      nuevaCaja();
    },

    update(dt) {
      if (!disponible || fase === 'girando') return;
      pausa -= dt;
      if (pausa > 0) return;

      if (fase === 'abierta') {
        const otro = 1 - turno;
        ctx.finish({
          winner: turno,
          scores: [intentos[0], intentos[1]],
          detail: `Abierta en ${intentos[turno]} intentos (rival: ${intentos[otro]})`,
          record: ctx.record('intentos', intentos[turno], 'low'),
        });
        return;
      }

      // Fallo: pasa el turno; si los dos agotan intentos, empate.
      if (intentos[0] >= MAX_INTENTOS && intentos[1] >= MAX_INTENTOS) {
        ctx.finish({
          winner: -1,
          scores: [intentos[0], intentos[1]],
          detail: 'Nadie logró abrirla',
        });
        return;
      }
      do { turno = 1 - turno; } while (intentos[turno] >= MAX_INTENTOS);
      fase = 'girando';
      valor = 0.5;
      ultimaCalor = -1;
      actualizarTexto();
      pintar();
    },

    destroy() { desuscribir?.(); touchbar.clear(); touchbar.setFocus(false); ctx.root.innerHTML = ''; },
  };
}
