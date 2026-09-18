/**
 * Guerra de Cartas — tres cartas a la vista y una regla que lo cambia todo.
 *
 * Las manos son abiertas: los dos veis exactamente lo que tiene el otro. Aquí
 * no hay azar oculto, solo lectura. Y la regla que convierte esto en un duelo
 * de verdad es esta: la carta GANADORA se quema y la perdedora vuelve a la
 * mano.
 *
 * Así que llevarse una baza con el trece cuesta perder el trece, y tirar el
 * dos para que te lo maten es una forma legítima de guardar munición. Cada
 * baza es la misma pregunta: ¿esta la quiero yo, o prefiero que la quiera él?
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const BAZAS = 7;
const MANO = 3;
const PALO = ['♠', '♥', '♦', '♣'];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [crear(0), crear(1)];
  let sb = null, fase = 'eligiendo', espera = 0, terminado = false, t = 0;
  let bazaValor = 1, mensaje = 'Elige carta y confirma', ganadorBaza = -1;

  function crear(i) {
    // `jugada` guarda una copia de la carta descubierta: la mano se modifica al
    // resolver y el índice `elegida` deja de valer para dibujar.
    return { i, mano: [], cursor: 0, elegida: -1, jugada: null, bazas: 0, listo: false };
  }

  function nuevaCarta() {
    return { v: 1 + Math.floor(rng() * 13), palo: Math.floor(rng() * 4) };
  }

  function rellenar(p) {
    while (p.mano.length < MANO) p.mano.push(nuevaCarta());
    p.cursor = clamp(p.cursor, 0, p.mano.length - 1);
  }

  function resolver() {
    const [a, b] = jug;
    const ca = a.mano[a.elegida], cb = b.mano[b.elegida];
    a.jugada = { ...ca };
    b.jugada = { ...cb };

    if (ca.v === cb.v) {
      // Empate: las dos se queman y la siguiente baza vale doble.
      ganadorBaza = -1;
      bazaValor++;
      mensaje = `Empate a ${ca.v} · la próxima vale ${bazaValor}`;
      a.mano.splice(a.elegida, 1);
      b.mano.splice(b.elegida, 1);
      audio.error();
      haptics.play('soft');
    } else {
      const g = ca.v > cb.v ? 0 : 1;
      ganadorBaza = g;
      jug[g].bazas += bazaValor;
      mensaje = `${players[g].name} se lleva ${bazaValor} baza${bazaValor > 1 ? 's' : ''}`;
      // La ganadora se quema; la perdedora vuelve a su mano.
      jug[g].mano.splice(jug[g].elegida, 1);
      bazaValor = 1;
      audio.score(g);
      haptics.score(g);
      particles.burst(W / 2, H * 0.45, 22, { speed: 220, color: players[g].color, size: 4, drag: 0.9 });
      sb.update(jug[0].bazas, jug[1].bazas);
    }

    for (const p of jug) rellenar(p);
    fase = 'mostrando';
    espera = 1.8;
  }

  function acabar() {
    if (terminado) return;
    terminado = true;
    const [a, b] = jug;
    const g = a.bazas === b.bazas ? -1 : (a.bazas > b.bazas ? 0 : 1);
    audio.win();
    ctx.finish({
      winner: g, scores: [a.bazas, b.bazas],
      detail: `${BAZAS} bazas para cerrar la partida`,
    });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      for (const p of jug) rellenar(p);
      sb = ui.scoreboard({ center: `a ${BAZAS} bazas` });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);

      if (fase === 'mostrando') {
        espera -= dt;
        if (espera <= 0) {
          if (jug.some((p) => p.bazas >= BAZAS)) { acabar(); return; }
          for (const p of jug) { p.elegida = -1; p.listo = false; p.jugada = null; }
          ganadorBaza = -1;
          mensaje = bazaValor > 1 ? `Baza doble: vale ${bazaValor}` : 'Elige carta y confirma';
          fase = 'eligiendo';
        }
        return;
      }

      for (const p of jug) {
        const pl = input.player(p.i);
        if (p.listo) {
          // Se puede rectificar mientras el otro siga pensando.
          if (pl.pressed('b')) { p.listo = false; p.elegida = -1; audio.back(); }
          continue;
        }
        if (pl.pressed('left')) { p.cursor = (p.cursor + p.mano.length - 1) % p.mano.length; audio.tick(); }
        if (pl.pressed('right')) { p.cursor = (p.cursor + 1) % p.mano.length; audio.tick(); }
        if (pl.pressed('a')) {
          p.elegida = p.cursor;
          p.listo = true;
          audio.select();
          haptics.click(p.i);
        }
      }

      if (jug.every((p) => p.listo)) {
        fase = 'revelando';
        resolver();
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a0712');

      // Tapete
      const paño = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      paño.addColorStop(0, '#123021');
      paño.addColorStop(1, '#080d0c');
      g.fillStyle = paño;
      g.fillRect(0, 0, W, H);

      const anchoC = Math.min(120, W * 0.14);
      const altoC = anchoC * 1.45;

      const pintarCarta = (x, y, carta, { oculta = false, resaltada = false, escala = 1, color = '#ffffff' } = {}) => {
        g.save();
        g.translate(x, y);
        g.scale(escala, escala);
        g.shadowColor = '#000000aa';
        g.shadowBlur = 14;
        g.fillStyle = oculta ? '#2a2050' : '#f6f3ea';
        g.beginPath(); g.roundRect(-anchoC / 2, -altoC / 2, anchoC, altoC, 9); g.fill();
        g.shadowBlur = 0;
        if (oculta) {
          g.strokeStyle = color;
          g.lineWidth = 2;
          for (let i = -2; i <= 2; i++) {
            g.beginPath();
            g.moveTo(-anchoC / 2 + 8, i * 14);
            g.lineTo(anchoC / 2 - 8, i * 14 + 10);
            g.stroke();
          }
        } else {
          const rojo = carta.palo === 1 || carta.palo === 2;
          const tinta = rojo ? '#d8344f' : '#1c1c28';
          ctx.engine.text(String(carta.v), 0, -altoC * 0.14, { size: anchoC * 0.42, color: tinta, font: 'system-ui' });
          ctx.engine.text(PALO[carta.palo], 0, altoC * 0.22, { size: anchoC * 0.3, color: tinta, font: 'system-ui' });
        }
        if (resaltada) {
          g.strokeStyle = color;
          g.lineWidth = 4;
          g.shadowColor = color;
          g.shadowBlur = 18;
          g.beginPath(); g.roundRect(-anchoC / 2, -altoC / 2, anchoC, altoC, 9); g.stroke();
        }
        g.restore();
      };

      // Centro: las cartas jugadas.
      for (const p of jug) {
        const cx = W / 2 + (p.i === 0 ? -1 : 1) * anchoC * 0.75;
        const cy = H * 0.4;
        if (p.jugada && fase !== 'eligiendo') {
          const brinco = ganadorBaza === p.i ? Math.sin(t * 9) * 5 : 0;
          pintarCarta(cx, cy + brinco, p.jugada, {
            resaltada: ganadorBaza === p.i, color: players[p.i].color, escala: 1.1,
          });
        } else if (p.listo) {
          pintarCarta(cx, cy, null, { oculta: true, color: players[p.i].color });
        }
      }

      ctx.engine.text(mensaje, W / 2, H * 0.66, { size: 15, color: '#ffd166', font: 'system-ui' });
      if (bazaValor > 1 && fase === 'eligiendo') {
        ctx.engine.text(`×${bazaValor}`, W / 2, H * 0.4, { size: 46, color: '#ff475766' });
      }

      // Manos abiertas, arriba y abajo.
      for (const p of jug) {
        const y = p.i === 0 ? H * 0.14 : H * 0.87;
        const total = p.mano.length;
        for (let i = 0; i < total; i++) {
          const x = W / 2 + (i - (total - 1) / 2) * (anchoC * 0.92);
          const elegida = p.listo && i === p.elegida;
          pintarCarta(x, y, p.mano[i], {
            resaltada: !p.listo && i === p.cursor,
            color: players[p.i].color,
            escala: elegida ? 0.72 : 0.8,
          });
        }
        ctx.engine.text(
          p.listo ? `${players[p.i].name}: listo` : `${players[p.i].name} elige…`,
          W / 2 + (total / 2 + 0.9) * anchoC * 0.92, y,
          { size: 12, color: p.listo ? '#a8ff3e' : players[p.i].color, align: 'left', font: 'system-ui' },
        );
      }

      particles.render(g);
      ctx.engine.text('←/→ eligen · tu tecla confirma · la carta que GANA se quema, la que pierde vuelve a tu mano',
        W / 2, H - 12, { size: 11, color: '#6a7a70', font: 'system-ui' });
    },
  };
}
