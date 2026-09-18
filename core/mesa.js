/**
 * mesa.js — partidas de hasta cuatro puestos, con equipos y bots.
 *
 * El resto del arcade es de dos jugadores por diseño: dos perfiles, dos juegos
 * de teclas, un marcador con dos lados. Hay juegos que piden más gente —una
 * subasta con un solo rival no es una subasta— y esto es lo que se lo da, sin
 * tocar el motor:
 *
 *   · Los puestos 1 y 2 son los jugadores de siempre (sus perfiles, sus colores
 *     y sus teclas, remapeables desde Ajustes).
 *   · Los puestos 3 y 4 son teclas propias de este módulo, elegidas lejos de
 *     las otras dos para que el teclado no se coma pulsaciones simultáneas.
 *   · Los puestos que nadie ocupa los lleva un bot con carácter propio.
 *
 * Cada puesto necesita SOLO DOS TECLAS (aceptar y rechazar/pujar y pasar). Es
 * una restricción deliberada: con cuatro personas apretadas delante del mismo
 * teclado, cualquier cosa más complicada acaba en codazos.
 *
 * El ganador se devuelve al shell traducido a su mundo de dos: si gana el
 * equipo del jugador 1 o el del 2, se marca ese; si gana un bot, empate con el
 * detalle contando lo que pasó de verdad.
 */

import { PLAYER_COLORS } from './storage.js';
import { avatarFor } from './avatar.js';
import { escapeHtml } from './ui.js';

/** Dos teclas por puesto, en clusters separados del teclado. */
export const TECLAS = [
  { accion: null, especial: null, etiqueta: ['␣', 'E'] },     // puesto 1: las suyas del perfil
  { accion: null, especial: null, etiqueta: ['M', 'N'] },     // puesto 2: idem
  { accion: 'KeyF', especial: 'KeyG', etiqueta: ['F', 'G'] },
  { accion: 'KeyJ', especial: 'KeyK', etiqueta: ['J', 'K'] },
];

const NOMBRES_BOT = [
  'Rex', 'Vegetta', 'Luzu', 'Alexby', 'Lolito', 'Auron', 'Mangel', 'Cheeto',
  'Perxitaa', 'Ampeter', 'Roier', 'Spreen',
];

/** Cada bot tiene manías: eso es lo que hace que la subasta tenga historia. */
const CARACTERES = [
  { nombre: 'prudente', riesgo: 0.72, farol: 0.05, tope: 0.8 },
  { nombre: 'tiburón', riesgo: 1.18, farol: 0.28, tope: 1.15 },
  { nombre: 'caprichoso', riesgo: 1.0, farol: 0.4, tope: 1.0 },
  { nombre: 'contable', riesgo: 0.9, farol: 0.02, tope: 0.92 },
  { nombre: 'showman', riesgo: 1.3, farol: 0.5, tope: 1.25 },
];

/**
 * Crea la mesa.
 *
 * @param {object} ctx            contexto del juego
 * @param {object} o
 * @param {number} o.humanos      1 a 4 puestos humanos
 * @param {number} o.equipos      cuántos equipos (3 en parejas, 2-4 individual)
 * @param {number} o.porEquipo    1 o 2 puestos por equipo
 * @param {number} [o.dificultad] 0 fácil · 1 normal · 2 duro
 */
export function crearMesa(ctx, { humanos = 2, equipos = 4, porEquipo = 1, dificultad = 1 } = {}) {
  const { input, players, rng = Math.random } = ctx;

  const totalPuestos = equipos * porEquipo;
  const usados = new Set([players[0].color, players[1].color]);
  const paleta = PLAYER_COLORS.filter((c) => !usados.has(c));
  const nombresLibres = [...NOMBRES_BOT].sort(() => rng() - 0.5);

  /* ---------------- Puestos ---------------- */

  const puestos = [];
  for (let i = 0; i < totalPuestos; i++) {
    const humano = i < humanos && i < 4;
    const perfil = i < 2 ? players[i] : null;
    puestos.push({
      i,
      humano,
      // Los puestos 3 y 4 no tienen perfil: se les da nombre y color propios.
      nombre: humano ? (perfil ? perfil.name : `Jugador ${i + 1}`) : nombresLibres[i % nombresLibres.length],
      color: perfil ? perfil.color : paleta[i % paleta.length],
      avatar: perfil ? avatarFor(perfil) : null,
      teclas: TECLAS[Math.min(i, 3)],
      caracter: CARACTERES[Math.floor(rng() * CARACTERES.length)],
    });
  }

  /* ---------------- Equipos ---------------- */

  const listaEquipos = [];
  for (let e = 0; e < equipos; e++) {
    const mios = puestos.slice(e * porEquipo, e * porEquipo + porEquipo);
    const humano = mios.some((p) => p.humano);
    listaEquipos.push({
      id: e,
      puestos: mios,
      humano,
      esBot: !humano,
      // El nombre del equipo sale de quien lo forma, no de un "Equipo 2".
      nombre: mios.map((p) => p.nombre).join(' y '),
      color: mios[0].color,
      caracter: mios[0].caracter,
      // Si el equipo lo lleva el jugador 1 o el 2, el shell puede coronarlo.
      slotShell: mios.some((p) => p.i === 0) ? 0 : mios.some((p) => p.i === 1) ? 1 : -1,
      vivo: true,
    });
  }

  /* ---------------- Entrada ---------------- */

  // Los puestos 3 y 4 se escuchan por tecla física, igual que hacen los juegos
  // de machaque con la L. Los flancos se guardan hasta que el juego los mira.
  const pendientes = new Set();
  const sueltas = [];
  for (let i = 2; i < Math.min(totalPuestos, 4); i++) {
    const t = TECLAS[i];
    for (const [accion, code] of [['accion', t.accion], ['especial', t.especial]]) {
      sueltas.push(input.on(code, () => {
        if (puestos[i]?.humano) pendientes.add(`${i}:${accion}`);
      }));
    }
  }

  /** ¿Este puesto acaba de pulsar? `accion` = 'accion' | 'especial'. */
  function pulsoPuesto(i, accion = 'accion') {
    const p = puestos[i];
    if (!p || !p.humano) return false;
    if (i < 2) return input.player(i).pressed(accion === 'accion' ? 'a' : 'b');
    return pendientes.has(`${i}:${accion}`);
  }

  /** ¿Alguien de este equipo acaba de pulsar? Devuelve el puesto o null. */
  function pulsoEquipo(equipo, accion = 'accion') {
    for (const p of equipo.puestos) if (pulsoPuesto(p.i, accion)) return p;
    return null;
  }

  /** Limpia los flancos propios. El juego la llama al final de su update. */
  function finFrame() { pendientes.clear(); }

  /* ---------------- Ayudas para los bots ---------------- */

  const DIF = [
    { ruido: 0.55, reaccion: [0.9, 2.1] },   // fácil: valora fatal y va lento
    { ruido: 0.3, reaccion: [0.55, 1.5] },
    { ruido: 0.14, reaccion: [0.3, 0.9] },   // duro: casi no se equivoca
  ][Math.max(0, Math.min(2, dificultad))];

  /** Valor que un bot CREE que tiene algo, con su error y su carácter. */
  function tasar(equipo, valorReal) {
    const err = 1 + (rng() * 2 - 1) * DIF.ruido;
    return valorReal * err * equipo.caracter.riesgo;
  }

  /** Cuánto tarda un bot en decidirse, en segundos. */
  function demora() {
    const [a, b] = DIF.reaccion;
    return a + rng() * (b - a);
  }

  function destruir() { sueltas.forEach((f) => f()); pendientes.clear(); }

  return {
    puestos, equipos: listaEquipos, porEquipo, dificultad,
    pulsoPuesto, pulsoEquipo, finFrame, tasar, demora, destruir,
    /** Equipos que siguen en juego. */
    get activos() { return listaEquipos.filter((e) => e.vivo); },
  };
}

/* ═══════════════ Pantalla de configuración ═══════════════ */

/**
 * Overlay para elegir formato antes de empezar. Se maneja con el ratón o con
 * las teclas del jugador 1, que es quien tiene el mando de la casa.
 *
 * @param {object} ctx
 * @param {object} o  { titulo, formatos: [{id, etiqueta, equipos, porEquipo, nota}] }
 * @param {(cfg)=>void} alEmpezar
 */
export function pantallaMesa(ctx, { titulo, subtitulo = '', formatos }, alEmpezar) {
  const { input, audio, root } = ctx;
  inyectarEstilos();

  let iFormato = 0, humanos = 2, dificultad = 1, foco = 0;
  const el = document.createElement('div');
  el.className = 'mesa-config';
  root.appendChild(el);

  const maxHumanos = () => Math.min(4, formatos[iFormato].equipos * formatos[iFormato].porEquipo);

  function pintar() {
    const f = formatos[iFormato];
    el.innerHTML = `
      <div class="mesa-caja">
        <span class="mesa-tag">Antes de empezar</span>
        <h2>${escapeHtml(titulo)}</h2>
        ${subtitulo ? `<p class="mesa-sub">${subtitulo}</p>` : ''}

        <div class="mesa-fila ${foco === 0 ? 'foco' : ''}" data-fila="0">
          <span class="mesa-etq">Formato</span>
          <div class="mesa-ops">
            ${formatos.map((o, i) => `<button class="mesa-op ${i === iFormato ? 'on' : ''}" data-fmt="${i}">${escapeHtml(o.etiqueta)}</button>`).join('')}
          </div>
        </div>
        <p class="mesa-nota">${escapeHtml(f.nota || '')}</p>

        <div class="mesa-fila ${foco === 1 ? 'foco' : ''}" data-fila="1">
          <span class="mesa-etq">Personas de verdad</span>
          <div class="mesa-ops">
            ${[1, 2, 3, 4].filter((n) => n <= maxHumanos()).map((n) => `<button class="mesa-op ${n === humanos ? 'on' : ''}" data-hum="${n}">${n}</button>`).join('')}
          </div>
        </div>

        <div class="mesa-fila ${foco === 2 ? 'foco' : ''}" data-fila="2">
          <span class="mesa-etq">Nivel de los bots</span>
          <div class="mesa-ops">
            ${['Turista', 'Normal', 'Tiburón'].map((n, i) => `<button class="mesa-op ${i === dificultad ? 'on' : ''}" data-dif="${i}">${n}</button>`).join('')}
          </div>
        </div>

        <div class="mesa-teclas">
          ${Array.from({ length: Math.min(4, f.equipos * f.porEquipo) }, (_, i) => {
            const t = TECLAS[Math.min(i, 3)];
            const quien = i < humanos ? `Puesto ${i + 1}` : 'Bot';
            return `<div class="mesa-tecla ${i < humanos ? '' : 'bot'}">
              <b>${quien}</b>
              <span>${i < humanos ? `<i>${t.etiqueta[0]}</i> <i>${t.etiqueta[1]}</i>` : '—'}</span>
            </div>`;
          }).join('')}
        </div>

        <button class="mesa-empezar ${foco === 3 ? 'foco' : ''}" data-empezar>Empezar</button>
        <p class="mesa-pie">Jugador 1: ↑↓ cambian de fila · ←→ eligen · <i>${escapeHtml(input.player(0).keyLabel('a'))}</i> confirma</p>
      </div>`;
  }

  function empezar() {
    const f = formatos[iFormato];
    audio.select();
    el.remove();
    alEmpezar({ equipos: f.equipos, porEquipo: f.porEquipo, humanos: Math.min(humanos, maxHumanos()), dificultad, formato: f.id });
  }

  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    audio.blip();
    if (b.dataset.fmt != null) { iFormato = +b.dataset.fmt; humanos = Math.min(humanos, maxHumanos()); }
    if (b.dataset.hum != null) humanos = +b.dataset.hum;
    if (b.dataset.dif != null) dificultad = +b.dataset.dif;
    if (b.dataset.empezar != null) return empezar();
    pintar();
  });

  pintar();

  /** El juego llama a esto en su update mientras la pantalla siga abierta. */
  function actualizar() {
    const p = input.player(0);
    if (p.pressed('down')) { foco = Math.min(3, foco + 1); audio.tick(); pintar(); }
    if (p.pressed('up')) { foco = Math.max(0, foco - 1); audio.tick(); pintar(); }
    const dx = (p.pressed('right') ? 1 : 0) - (p.pressed('left') ? 1 : 0);
    if (dx) {
      audio.blip();
      if (foco === 0) { iFormato = (iFormato + dx + formatos.length) % formatos.length; humanos = Math.min(humanos, maxHumanos()); }
      if (foco === 1) humanos = Math.max(1, Math.min(maxHumanos(), humanos + dx));
      if (foco === 2) dificultad = Math.max(0, Math.min(2, dificultad + dx));
      pintar();
    }
    if (p.pressed('a')) {
      if (foco === 3) empezar();
      else { foco = Math.min(3, foco + 1); audio.tick(); pintar(); }
    }
  }

  return { actualizar, cerrar: () => el.remove(), get abierta() { return !!el.parentNode; } };
}

/* ═══════════════ Estilos compartidos ═══════════════ */

function inyectarEstilos() {
  if (document.getElementById('mesa-css')) return;
  const s = document.createElement('style');
  s.id = 'mesa-css';
  s.textContent = `
    .mesa-config { position:absolute; inset:0; display:grid; place-items:center;
      background:#05060ccc; backdrop-filter:blur(6px); z-index:20; }
    .mesa-caja { width:min(620px, 92%); padding:24px 26px; border-radius:18px;
      background:#12121c; border:1px solid var(--line); box-shadow:var(--shadow);
      font-family:var(--font-ui, system-ui); color:var(--ink); text-align:center; }
    .mesa-tag { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-dim); }
    .mesa-caja h2 { font-family:var(--font-display); font-size:22px; margin:6px 0 4px; }
    .mesa-sub { font-size:13px; color:var(--ink-dim); margin:0 0 14px; line-height:1.5; }
    .mesa-fila { display:flex; align-items:center; justify-content:space-between; gap:12px;
      padding:8px 10px; border-radius:10px; margin-top:6px; border:1px solid transparent; }
    .mesa-fila.foco { border-color:var(--p1, #ff2e88); background:#ffffff08; }
    .mesa-etq { font-size:13px; color:var(--ink-dim); }
    .mesa-ops { display:flex; gap:6px; flex-wrap:wrap; }
    .mesa-op { padding:6px 12px; border-radius:8px; border:1px solid var(--line);
      background:#ffffff08; color:var(--ink); font-size:13px; cursor:pointer; }
    .mesa-op.on { background:var(--p1, #ff2e88); color:#0a0a10; border-color:transparent; font-weight:600; }
    .mesa-nota { font-size:12px; color:var(--ink-dim); margin:2px 0 8px; }
    .mesa-teclas { display:flex; gap:8px; justify-content:center; margin:14px 0 4px; flex-wrap:wrap; }
    .mesa-tecla { font-size:11px; padding:6px 10px; border-radius:8px; background:#ffffff08;
      border:1px solid var(--line); min-width:86px; }
    .mesa-tecla.bot { opacity:.5; }
    .mesa-tecla b { display:block; font-size:11px; color:var(--ink-dim); font-weight:500; }
    .mesa-tecla i, .mesa-pie i { font-style:normal; display:inline-block; padding:1px 6px; margin:2px 1px 0;
      border-radius:5px; background:#ffffff14; font-family:var(--font-mono, monospace); font-size:11px; }
    .mesa-empezar { margin-top:14px; padding:10px 26px; border-radius:10px; border:1px solid transparent;
      background:var(--p1, #ff2e88); color:#0a0a10; font-weight:700; font-size:15px; cursor:pointer; }
    .mesa-empezar.foco { box-shadow:0 0 0 3px #ffffff44; }
    .mesa-pie { font-size:11px; color:var(--ink-dim); margin:12px 0 0; }
  `;
  document.head.appendChild(s);
}
