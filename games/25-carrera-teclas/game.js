/**
 * Carrera de Teclas — mecanografía por turnos.
 *
 * Con un solo teclado no se puede escribir a la vez, así que cada jugador
 * corre su turno contra el reloj y luego se comparan tiempos. Los errores
 * suman dos segundos de penalización: precisión por encima de velocidad.
 *
 * Lee las teclas en crudo con `input.onAny` en lugar de usar un <input>,
 * porque el sistema de control hace preventDefault sobre varias teclas y un
 * campo de texto real se comportaría de forma inconsistente.
 */

import { escapeHtml } from '../../core/ui.js';
import { avatarFor } from '../../core/avatar.js';
import { icon } from '../../core/icons.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const PENALIZACION = 2;      // segundos por error

const FRASES = [
  'el gato duerme sobre el teclado caliente',
  'nadie sabe cuantas estrellas caben en el cielo',
  'la lluvia de agosto huele distinto en la ciudad',
  'prefiero el cafe frio antes que perder la partida',
  'un dragon pequeno tambien puede quemar el bosque',
  'las mejores ideas llegan cuando ya es muy tarde',
  'caminamos despacio porque el camino era bonito',
  'el reloj de la cocina siempre va cinco minutos tarde',
  'tres pajaros discutian sobre el mejor arbol del parque',
  'guardo tus cartas en una caja de galletas vacia',
];

export function create(ctx) {
  const { input, audio, haptics, players, root, rng } = ctx;

  let frase = '';
  let fase = 'intro';         // intro | escribiendo | entreTurnos | fin
  let turno = 0;
  let escrito = '';
  let errores = 0;
  let inicio = 0;
  let transcurrido = 0;
  const resultados = [null, null];
  let desuscribir = null;

  function elegirFrase() {
    frase = FRASES[Math.floor(rng() * FRASES.length)];
  }

  function pintar() {
    const p = players[turno];
    if (fase === 'intro' || fase === 'entreTurnos') {
      root.innerHTML = `
        <div class="tk-wrap">
          <div class="tk-turno" style="--c:${p.color}">
            <img src="${avatarFor(p)}" alt="">
            <div>
              <div class="tk-quien">Turno de <b>${escapeHtml(p.name)}</b></div>
              <div class="tk-sub">${turno === 0 ? 'Empiezas tú' : 'Ahora te toca'}</div>
            </div>
          </div>
          ${resultados[0] ? resumenParcial() : ''}
          <p class="tk-frase-preview">${escapeHtml(frase)}</p>
          <p class="tk-hint">Pulsa <span class="kbd">${input.player(turno).keyLabel('a')}</span> para empezar</p>
        </div>`;
      return;
    }
    if (fase === 'fin') { pintarFin(); return; }

    // Escribiendo
    const hechas = escapeHtml(frase.slice(0, escrito.length));
    const actual = escapeHtml(frase[escrito.length] || '');
    const resto = escapeHtml(frase.slice(escrito.length + 1));
    root.innerHTML = `
      <div class="tk-wrap">
        <div class="tk-hud">
          <span class="tk-nombre" style="color:${p.color}">${escapeHtml(p.name)}</span>
          <span class="tk-crono">${transcurrido.toFixed(1)}s</span>
          <span class="tk-err">${errores} error${errores === 1 ? '' : 'es'}</span>
        </div>
        <p class="tk-frase">
          <span class="tk-ok">${hechas}</span><span class="tk-cursor" style="background:${p.color}">${actual === ' ' ? '&nbsp;' : actual}</span><span class="tk-resto">${resto}</span>
        </p>
        <div class="tk-pista">
          <div class="tk-barra" style="width:${(escrito.length / frase.length) * 100}%;background:${p.color}"></div>
          <div class="tk-corredor" style="left:${(escrito.length / frase.length) * 100}%">${icon('kart', { size: 16 })}</div>
        </div>
      </div>`;
  }

  function resumenParcial() {
    const r = resultados[0];
    return `<p class="tk-parcial">${escapeHtml(players[0].name)}: <b>${r.total.toFixed(1)}s</b>
            <span>(${r.tiempo.toFixed(1)}s + ${r.errores} × ${PENALIZACION}s)</span></p>`;
  }

  function pintarFin() {
    root.innerHTML = `<div class="tk-wrap"><p class="tk-hint">Calculando…</p></div>`;
  }

  function empezarTurno() {
    fase = 'escribiendo';
    escrito = '';
    errores = 0;
    transcurrido = 0;
    inicio = performance.now();
    audio.select();
    pintar();
  }

  function tecla(e) {
    if (fase === 'intro' || fase === 'entreTurnos') {
      if (e.code === input.player(turno).map.a) empezarTurno();
      return;
    }
    if (fase !== 'escribiendo') return;

    // Solo caracteres imprimibles; se ignoran modificadores y navegación.
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
    const esperado = frase[escrito.length];
    const tecleado = e.key.toLowerCase();

    if (tecleado === esperado) {
      escrito += tecleado;
      audio.tone({ freq: 620 + escrito.length * 3, dur: 0.03, gain: 0.08, type: 'square' });
      haptics.play('click', { player: turno });
      if (escrito.length >= frase.length) return terminarTurno();
    } else {
      errores++;
      audio.error();
      haptics.error(turno);
      root.querySelector('.tk-frase')?.animate(
        [{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }],
        { duration: 160 }
      );
    }
    pintar();
  }

  function terminarTurno() {
    const tiempo = (performance.now() - inicio) / 1000;
    resultados[turno] = {
      tiempo,
      errores,
      total: tiempo + errores * PENALIZACION,
      ppm: Math.round((frase.split(' ').length / tiempo) * 60),
    };
    audio.win();
    haptics.play('score', { player: turno });

    if (turno === 0) {
      turno = 1;
      fase = 'entreTurnos';
      pintar();
    } else {
      fase = 'fin';
      const [a, b] = resultados;
      ctx.finish({
        winner: a.total === b.total ? -1 : a.total < b.total ? 0 : 1,
        scores: [a.total.toFixed(1), b.total.toFixed(1)],
        detail: `${players[0].name}: ${a.ppm} ppm · ${players[1].name}: ${b.ppm} ppm`,
        record: ctx.record('ppm', Math.max(a.ppm, b.ppm), 'high'),
      });
    }
  }

  return {
    init() {
      elegirFrase();
      inyectarEstilos();
      pintar();
      desuscribir = input.onAny(tecla);
    },

    update(dt) {
      if (fase !== 'escribiendo') return;
      transcurrido += dt;
      const el = root.querySelector('.tk-crono');
      if (el) el.textContent = `${transcurrido.toFixed(1)}s`;
    },

    destroy() { desuscribir?.(); root.innerHTML = ''; },
  };
}

function inyectarEstilos() {
  if (document.getElementById('tk-css')) return;
  const s = document.createElement('style');
  s.id = 'tk-css';
  s.textContent = `
    .tk-wrap { width: min(820px, 92vw); text-align: center; }
    .tk-turno { display:flex; align-items:center; justify-content:center; gap:16px; margin-bottom:22px; }
    .tk-turno img { width:64px; height:64px; border-radius:50%; image-rendering:pixelated; }
    .tk-quien { font-size:20px; }
    .tk-quien b { color: var(--c); }
    .tk-sub { font-size:13px; color: var(--ink-dim); }
    .tk-frase-preview {
      font-family: var(--font-mono); font-size:17px; color: var(--ink-dim);
      background:#ffffff0a; border:1px solid var(--line); border-radius:12px;
      padding:16px 20px; line-height:1.7;
    }
    .tk-hint { color: var(--ink-dim); font-size:14px; margin-top:20px; }
    .tk-parcial { color: var(--ink-dim); font-size:14px; }
    .tk-parcial b { color: var(--ink); }
    .tk-parcial span { opacity:.6; font-size:12px; }
    .tk-hud { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:14px; font-size:13px; }
    .tk-nombre { font-weight:700; }
    .tk-crono { font-family: var(--font-display); font-size:22px; }
    .tk-err { color: var(--danger); }
    .tk-frase {
      font-family: var(--font-mono); font-size:22px; line-height:1.85;
      background:#ffffff0a; border:1px solid var(--line); border-radius:12px;
      padding:20px 24px; word-break: break-word; margin:0;
    }
    .tk-ok { color: var(--ink); opacity:.45; }
    .tk-resto { color: var(--ink-dim); }
    .tk-cursor { color:#08080f; border-radius:3px; padding:1px 2px; animation: tk-blink 1s steps(2) infinite; }
    @keyframes tk-blink { 50% { opacity:.55; } }
    .tk-pista { position:relative; height:8px; background:#ffffff12; border-radius:999px; margin-top:34px; }
    .tk-barra { position:absolute; inset:0 auto 0 0; border-radius:999px; transition:width 90ms linear; }
    .tk-corredor { position:absolute; top:-24px; transform:translateX(-50%); font-size:20px; transition:left 90ms linear; }
  `;
  document.head.appendChild(s);
}
