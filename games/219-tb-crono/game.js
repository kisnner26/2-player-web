/**
 * Cronómetro Exacto — para en cinco segundos clavados, sin ver el reloj.
 *
 * La barra se llena durante el primer segundo y medio y después se apaga del
 * todo: a partir de ahí no hay ninguna referencia visual. Solo tu cuenta
 * interna.
 *
 * Tres intentos cada uno y se puntúa la diferencia en milésimas. La gracia es
 * que casi nadie falla por mucho — se falla por dos décimas, y esas dos
 * décimas se sienten larguísimas.
 */

import { prepararPantalla, indicadorTurno } from '../../core/tbgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const CELDAS = 16;
const OBJETIVO = 5;
const INTENTOS = 3;
const PISTA = 1.5;             // segundos con referencia visual

export function create(ctx) {
  const { touchbar, audio, haptics, players } = ctx;

  let cab = null, espejo = null, disponible = false, desuscribir = null;
  let reloj = 0, fase = 'listo', pausa = 0;
  let turno = 0, intento = [0, 0];
  const error = [[], []];

  function nuevoIntento() {
    reloj = 0;
    fase = 'listo';
    cab.resaltar(turno);
    cab.decir(`<b style="color:${players[turno].color}">${players[turno].name}</b> · intento ${intento[turno] + 1}/${INTENTOS} · toca para arrancar`);
    pintar();
  }

  function pintar() {
    const celdas = [];
    // Solo hay referencia durante el primer segundo y medio.
    const visible = fase === 'contando' && reloj < PISTA;
    const llenas = visible ? Math.round((reloj / PISTA) * CELDAS) : 0;
    for (let i = 0; i < CELDAS; i++) {
      if (fase === 'listo') celdas.push({ label: i === Math.floor(CELDAS / 2) ? '▶' : '', bg: '#1b2430', color: '#8fc0e0' });
      else if (visible && i < llenas) celdas.push({ label: '', bg: '#3aa0ff' });
      else if (fase === 'contando') celdas.push({ label: '', bg: '#08080c', clase: 'tenue' });
      else celdas.push({ label: '', bg: '#101018', clase: 'tenue' });
    }
    espejo?.pintar(celdas);
    if (!disponible) return;
    touchbar.set([
      indicadorTurno(players, turno),
      ...celdas.map((c, i) => ({
        type: 'button', id: `t${i}`, label: c.label || ' ', bg: c.bg, color: c.color || '#000000',
      })),
    ]);
  }

  function parar() {
    if (fase !== 'contando') return;
    fase = 'resultado';
    pausa = 2.2;
    const dif = reloj - OBJETIVO;
    error[turno].push(Math.abs(dif));
    const ms = Math.round(Math.abs(dif) * 1000);
    cab.decir(`${reloj.toFixed(3)} s · ${dif >= 0 ? 'te pasas' : 'te quedas corto'} ${ms} ms`);
    if (ms < 60) { audio.win(); haptics.victory(turno); touchbar.haptic('heavy'); }
    else if (ms < 250) { audio.score(turno); haptics.score(turno); touchbar.haptic('medium'); }
    else { audio.error(); haptics.error(turno); touchbar.haptic('light'); }
    // Se enciende el trozo de barra que corresponde al error, como regla.
    const celdas = [];
    const marca = Math.min(CELDAS - 1, Math.round(Math.abs(dif) * 4));
    for (let i = 0; i < CELDAS; i++) {
      celdas.push({
        label: i === marca ? (dif >= 0 ? '+' : '−') : '',
        bg: i === marca ? (ms < 250 ? '#1f7a3a' : '#7a2020') : '#101018',
        color: '#ffffff',
      });
    }
    espejo?.pintar(celdas);
    if (disponible) {
      touchbar.set([
        indicadorTurno(players, turno),
        ...celdas.map((c, i) => ({ type: 'button', id: `r${i}`, label: c.label || ' ', bg: c.bg, color: c.color })),
      ]);
    }
    const media = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    cab.marcar(Math.round(media(error[0]) * 1000), Math.round(media(error[1]) * 1000));
  }

  return {
    async init() {
      const p = await prepararPantalla(ctx, { titulo: 'Cronómetro', segmentos: CELDAS });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible;
      cab.marcar(0, 0);
      if (!disponible) return;
      desuscribir = touchbar.on((ev) => {
        if (ev.type !== 'click' || ev.id === '_turno') return;
        if (fase === 'listo') {
          fase = 'contando';
          reloj = 0;
          audio.blip();
          touchbar.haptic('light');
          cab.decir(`corriendo… para en ${OBJETIVO} segundos exactos`);
          pintar();
        } else if (fase === 'contando') parar();
      });
      nuevoIntento();
    },

    update(dt) {
      if (!disponible) return;

      if (fase === 'contando') {
        const antes = reloj;
        reloj += dt;
        // Se repinta solo mientras hay pista: después la barra queda muerta.
        if (antes < PISTA) pintar();
        else if (antes < PISTA + dt) pintar();
        if (reloj > OBJETIVO * 3) parar();
        return;
      }

      if (fase === 'resultado') {
        pausa -= dt;
        if (pausa > 0) return;
        intento[turno]++;
        if (turno === 0) { turno = 1; nuevoIntento(); return; }
        turno = 0;
        if (intento[0] >= INTENTOS && intento[1] >= INTENTOS) {
          const media = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
          const a = media(error[0]), b = media(error[1]);
          ctx.finish({
            winner: a === b ? -1 : a < b ? 0 : 1,
            scores: [Math.round(a * 1000), Math.round(b * 1000)],
            detail: `error medio: ${Math.round(a * 1000)} ms contra ${Math.round(b * 1000)} ms`,
            record: ctx.record('error', Math.round(Math.min(a, b) * 1000), 'low'),
          });
          return;
        }
        nuevoIntento();
      }
    },

    destroy() {
      desuscribir?.();
      touchbar.clear();
    },
  };
}
