/**
 * Precisión — un marcador recorre la barra a toda velocidad; párralo en verde.
 *
 * Es el clásico de las máquinas de feria, pero con la ventaja de que aquí la
 * zona objetivo ocupa centímetros reales bajo tu dedo. La zona se encoge y el
 * marcador acelera cada ronda, así que el margen desaparece rápido.
 */

import { prepararPantalla, indicadorTurno } from '../../core/tbgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const CELDAS = 20;
const RONDAS = 5;

export function create(ctx) {
  const { touchbar, audio, haptics, players } = ctx;

  let cab = null, espejo = null, disponible = false;
  let pos = 0, dir = 1, vel = 1.1;
  let zonaCentro = 0.5, zonaAncho = 0.22;
  let turno = 0, ronda = 1;
  let fase = 'moviendo';        // moviendo | resultado
  let pausa = 0;
  const score = [0, 0];
  let desuscribir = null;

  function prepararRonda() {
    // La zona se encoge y el marcador acelera con cada ronda.
    zonaAncho = Math.max(0.07, 0.24 - (ronda - 1) * 0.035);
    zonaCentro = zonaAncho / 2 + 0.06 + Math.random() * (1 - zonaAncho - 0.12);
    vel = 0.95 + (ronda - 1) * 0.28;
    pos = 0;
    dir = 1;
    fase = 'moviendo';
    cab.resaltar(turno);
    cab.decir(
      `Ronda ${ronda}/${RONDAS} · <b style="color:${players[turno].color}">${players[turno].name}</b> ·
       toca la barra para parar el marcador en la zona verde`
    );
    pintar();
  }

  function enZona(p) { return Math.abs(p - zonaCentro) <= zonaAncho / 2; }

  function pintar() {
    const idx = Math.round(pos * (CELDAS - 1));
    const celdas = [];
    for (let i = 0; i < CELDAS; i++) {
      const p = i / (CELDAS - 1);
      const dentro = enZona(p);
      const centro = Math.abs(p - zonaCentro) <= zonaAncho / 6;
      if (i === idx) {
        celdas.push({ label: '▮', bg: '#ffffff', color: '#000000', clase: 'viva' });
      } else if (centro) {
        celdas.push({ label: '', bg: '#ffd166' });
      } else if (dentro) {
        celdas.push({ label: '', bg: '#1f7a3a' });
      } else {
        celdas.push({ label: '', bg: '#101010', clase: 'tenue' });
      }
    }
    espejo?.pintar(celdas);
    if (!disponible) return;
    touchbar.set([
      indicadorTurno(players, turno),
      ...celdas.map((c, i) => ({
        type: 'button', id: `p${i}`, label: c.label || ' ', bg: c.bg, color: '#000000',
      })),
    ]);
  }

  function parar() {
    if (fase !== 'moviendo') return;
    fase = 'resultado';
    pausa = 1.5;

    const dist = Math.abs(pos - zonaCentro);
    const dentro = dist <= zonaAncho / 2;
    const bull = dist <= zonaAncho / 6;

    let puntos = 0, texto = '';
    if (bull) {
      puntos = 100;
      texto = '¡EN EL CENTRO! +100';
      audio.win();
      haptics.play('victory', { player: turno });
      touchbar.haptic('heavy');
    } else if (dentro) {
      // Puntuación proporcional: rozar el borde vale menos que casi acertar.
      puntos = Math.round(30 + (1 - dist / (zonaAncho / 2)) * 50);
      texto = `En la zona · +${puntos}`;
      audio.score(turno);
      haptics.play('score', { player: turno });
      touchbar.haptic('medium');
    } else {
      puntos = 0;
      texto = `Fuera por ${Math.round((dist - zonaAncho / 2) * 100)}%`;
      audio.error();
      haptics.error(turno);
      touchbar.haptic('heavy');
    }

    score[turno] += puntos;
    cab.marcar(score[0], score[1]);
    cab.decir(`<b style="color:${players[turno].color}">${players[turno].name}</b> · ${texto}`);
    espejo?.destello(Math.round(pos * (CELDAS - 1)), dentro ? '#a8ff3e' : '#ff2e2e');
    pintar();
  }

  return {
    async init() {
      const p = await prepararPantalla(ctx, { titulo: 'Precisión', segmentos: CELDAS });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible;
      cab.marcar(0, 0);
      if (!disponible) return;
      desuscribir = touchbar.on((ev) => { if (ev.type === 'click' && ev.id !== '_turno') parar(); });
      prepararRonda();
    },

    update(dt) {
      if (!disponible) return;

      if (fase === 'resultado') {
        pausa -= dt;
        if (pausa > 0) return;
        if (turno === 0) { turno = 1; prepararRonda(); return; }
        turno = 0;
        ronda++;
        if (ronda > RONDAS) {
          const [a, b] = score;
          ctx.finish({
            winner: a === b ? -1 : a > b ? 0 : 1,
            scores: [a, b],
            detail: `${RONDAS} rondas · zona final del ${Math.round(zonaAncho * 100)}%`,
            record: ctx.record('puntos', Math.max(a, b), 'high'),
          });
          return;
        }
        prepararRonda();
        return;
      }

      pos += dir * vel * dt;
      if (pos >= 1) { pos = 1; dir = -1; }
      if (pos <= 0) { pos = 0; dir = 1; }
      // Un pulso muy suave al cruzar la zona: el dedo nota que está encima.
      pintar();
    },

    destroy() { desuscribir?.(); touchbar.clear(); touchbar.setFocus(false); ctx.root.innerHTML = ''; },
  };
}
