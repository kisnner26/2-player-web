/**
 * Trivia Buzzer — pregunta en pantalla, buzzer y cuatro opciones.
 *
 * Quien pulsa primero su buzzer se lleva el derecho a responder, y desde ese
 * momento solo sus teclas de dirección funcionan. Fallar cede el turno al
 * rival con la mitad del tiempo: arriesgarse tiene coste.
 */

import { escapeHtml } from '../../core/ui.js';
import { PREGUNTAS } from './preguntas.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const RONDAS = 10;
const TIEMPO_LECTURA = 12;
const TIEMPO_RESPUESTA = 7;

export function create(ctx) {
  const { input, audio, haptics, players, root, rng } = ctx;

  let banco = [];
  let ronda = 0;
  let pregunta = null;
  let orden = [];              // orden barajado de las opciones
  let fase = 'leyendo';        // leyendo | respondiendo | revelado | fin
  let quienResponde = -1;
  const yaFallaron = [false, false];
  let reloj = 0;
  const score = [0, 0];
  let desuscribir = null;
  let seleccion = -1;

  function barajar(a) {
    const c = [...a];
    for (let i = c.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [c[i], c[j]] = [c[j], c[i]];
    }
    return c;
  }

  function siguientePregunta() {
    ronda++;
    if (ronda > RONDAS || banco.length === 0) return terminar();
    pregunta = banco.pop();
    orden = barajar([0, 1, 2, 3]);
    fase = 'leyendo';
    quienResponde = -1;
    yaFallaron[0] = yaFallaron[1] = false;
    seleccion = -1;
    reloj = TIEMPO_LECTURA;
    audio.select();
    pintar();
  }

  function pintar() {
    if (fase === 'fin') return;
    const opciones = orden.map((idx, pos) => {
      const texto = pregunta.opciones[idx];
      const esCorrecta = idx === 0;
      let clase = 'tv-op';
      if (fase === 'revelado') {
        if (esCorrecta) clase += ' correcta';
        else if (pos === seleccion) clase += ' incorrecta';
      }
      const tecla = ['W / ↑', 'A / ←', 'S / ↓', 'D / →'][pos];
      return `<div class="${clase}">
                <span class="tv-tecla">${tecla}</span>
                <span class="tv-txt">${escapeHtml(texto)}</span>
              </div>`;
    }).join('');

    const estado = fase === 'leyendo'
      ? `<span class="tv-estado">Pulsa tu buzzer para responder</span>`
      : fase === 'respondiendo'
        ? `<span class="tv-estado" style="color:${players[quienResponde].color}">
             Responde <b>${escapeHtml(players[quienResponde].name)}</b></span>`
        : `<span class="tv-estado">${pregunta.opciones[0] === (pregunta.opciones[orden[seleccion]] ?? null) ? '' : ''}</span>`;

    root.innerHTML = `
      <div class="tv-wrap">
        <div class="tv-top">
          <span class="tv-ronda">Pregunta ${ronda} / ${RONDAS}</span>
          <span class="tv-cat">${escapeHtml(pregunta.categoria)}</span>
          <span class="tv-reloj ${reloj < 4 ? 'urgente' : ''}">${Math.max(0, reloj).toFixed(1)}s</span>
        </div>
        <h2 class="tv-preg">${escapeHtml(pregunta.texto)}</h2>
        <div class="tv-ops">${opciones}</div>
        <div class="tv-bottom">
          ${estado}
          <div class="tv-buzzers">
            ${[0, 1].map((i) => `
              <span class="tv-buzz ${quienResponde === i ? 'activo' : ''} ${yaFallaron[i] ? 'fallo' : ''}"
                    style="--c:${players[i].color}">
                ${escapeHtml(players[i].name)} · <span class="kbd">${input.player(i).keyLabel('a')}</span>
                <b>${score[i]}</b>
              </span>`).join('')}
          </div>
        </div>
      </div>`;
  }

  function tecla(e) {
    if (fase === 'leyendo') {
      for (let i = 0; i < 2; i++) {
        if (e.code === input.player(i).map.a && !yaFallaron[i]) {
          quienResponde = i;
          fase = 'respondiendo';
          reloj = TIEMPO_RESPUESTA;
          audio.beep(880);
          haptics.play('impact', { player: i });
          pintar();
          return;
        }
      }
      return;
    }
    if (fase !== 'respondiendo') return;

    const pl = input.player(quienResponde);
    const mapa = [pl.map.up, pl.map.left, pl.map.down, pl.map.right];
    const pos = mapa.indexOf(e.code);
    if (pos < 0) return;
    responder(pos);
  }

  function responder(pos) {
    seleccion = pos;
    const acierto = orden[pos] === 0;
    if (acierto) {
      score[quienResponde]++;
      audio.win();
      haptics.play('score', { player: quienResponde });
      fase = 'revelado';
      reloj = 2.4;
    } else {
      score[quienResponde] = Math.max(0, score[quienResponde] - 1);
      yaFallaron[quienResponde] = true;
      audio.error();
      haptics.error(quienResponde);
      const otro = 1 - quienResponde;
      if (!yaFallaron[otro]) {
        // El rival hereda la pregunta con menos tiempo.
        quienResponde = otro;
        fase = 'respondiendo';
        reloj = TIEMPO_RESPUESTA / 2;
        seleccion = -1;
      } else {
        fase = 'revelado';
        reloj = 2.4;
      }
    }
    pintar();
  }

  function terminar() {
    fase = 'fin';
    const [a, b] = score;
    ctx.finish({
      winner: a === b ? -1 : a > b ? 0 : 1,
      scores: [a, b],
      detail: `${RONDAS} preguntas`,
    });
  }

  return {
    init() {
      inyectarEstilos();
      banco = barajar(PREGUNTAS).slice(0, RONDAS);
      desuscribir = input.onAny(tecla);
      siguientePregunta();
    },

    update(dt) {
      if (fase === 'fin') return;
      reloj -= dt;
      const el = root.querySelector('.tv-reloj');
      if (el) {
        el.textContent = `${Math.max(0, reloj).toFixed(1)}s`;
        el.classList.toggle('urgente', reloj < 4);
      }
      if (reloj > 0) return;

      if (fase === 'leyendo') { fase = 'revelado'; reloj = 2.4; seleccion = -1; audio.back(); pintar(); }
      else if (fase === 'respondiendo') {
        // Se acabó el tiempo: cuenta como fallo.
        yaFallaron[quienResponde] = true;
        const otro = 1 - quienResponde;
        if (!yaFallaron[otro]) { quienResponde = otro; reloj = TIEMPO_RESPUESTA / 2; }
        else { fase = 'revelado'; reloj = 2.4; }
        audio.error();
        pintar();
      }
      else if (fase === 'revelado') siguientePregunta();
    },

    destroy() { desuscribir?.(); root.innerHTML = ''; },
  };
}

function inyectarEstilos() {
  if (document.getElementById('tv-css')) return;
  const s = document.createElement('style');
  s.id = 'tv-css';
  s.textContent = `
    .tv-wrap { width:min(900px,94vw); display:flex; flex-direction:column; gap:18px; }
    .tv-top { display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--ink-dim); }
    .tv-cat { text-transform:uppercase; letter-spacing:.12em; color:var(--gold); }
    .tv-reloj { font-family:var(--font-display); font-size:16px; color:var(--ink); }
    .tv-reloj.urgente { color:var(--danger); animation:pulse-glow .5s infinite; }
    .tv-preg { font-size:clamp(19px,2.6vw,28px); line-height:1.45; margin:0; text-align:center; }
    .tv-ops { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .tv-op {
      display:flex; align-items:center; gap:12px; padding:16px 18px;
      background:#ffffff0a; border:1px solid var(--line); border-radius:12px;
      font-size:15px; transition:all 180ms var(--ease);
    }
    .tv-op.correcta { background:#a8ff3e22; border-color:var(--lime); box-shadow:0 0 24px -6px var(--lime); }
    .tv-op.incorrecta { background:#ff475722; border-color:var(--danger); }
    .tv-tecla {
      flex:none; font-family:var(--font-mono); font-size:11px; color:var(--ink-faint);
      background:#ffffff10; border-radius:6px; padding:4px 8px; min-width:52px; text-align:center;
    }
    .tv-bottom { display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; }
    .tv-estado { font-size:13px; color:var(--ink-dim); }
    .tv-buzzers { display:flex; gap:12px; }
    .tv-buzz {
      display:inline-flex; align-items:center; gap:7px; padding:7px 14px;
      border-radius:999px; border:1px solid var(--c); color:var(--c);
      font-size:12px; opacity:.55; transition:all 160ms;
    }
    .tv-buzz.activo { opacity:1; box-shadow:0 0 20px -4px var(--c); background:#ffffff0d; }
    .tv-buzz.fallo { opacity:.22; text-decoration:line-through; }
    .tv-buzz b { font-family:var(--font-display); font-size:13px; }
    @media (max-width:640px) { .tv-ops { grid-template-columns:1fr; } }
  `;
  document.head.appendChild(s);
}
