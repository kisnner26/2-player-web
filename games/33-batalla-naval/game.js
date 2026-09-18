/**
 * Batalla Naval — colocación secreta con cortina y luego turnos de disparo.
 *
 * Compartir pantalla es el problema real de este juego: entre turno y turno
 * aparece una cortina que hay que confirmar, para que quien pasa la máquina
 * no vea el tablero del otro. Es la versión digital de girar el tablero.
 */

import { Tablero } from '../../core/boardgame.js';
import { escapeHtml } from '../../core/ui.js';
import { avatarFor } from '../../core/avatar.js';
import { icon } from '../../core/icons.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const N = 8;
const FLOTA = [
  { nombre: 'Portaaviones', largo: 4 },
  { nombre: 'Crucero', largo: 3 },
  { nombre: 'Submarino', largo: 3 },
  { nombre: 'Destructor', largo: 2 },
  { nombre: 'Patrullera', largo: 2 },
];

export function create(ctx) {
  const { audio, haptics, players, root, input } = ctx;

  // Por jugador: barcos colocados y disparos recibidos
  const flotas = [[], []];
  const disparos = [                       // disparos[i] = tablero de i sobre el rival
    Array.from({ length: N }, () => new Array(N).fill(null)),
    Array.from({ length: N }, () => new Array(N).fill(null)),
  ];

  let fase = 'colocando';        // colocando | cortina | disparando | fin
  let jugadorActivo = 0;
  let indiceBarco = 0;
  let horizontal = true;
  let tab = null;
  let cortinaSiguiente = null;   // función a ejecutar al levantar la cortina
  let desuscribirCortina = null;

  /* ---------------- Colocación ---------------- */

  function celdasDe(barco) {
    const out = [];
    for (let k = 0; k < barco.largo; k++) {
      out.push(barco.horizontal ? { x: barco.x + k, y: barco.y } : { x: barco.x, y: barco.y + k });
    }
    return out;
  }

  function cabe(flota, x, y, largo, horiz) {
    for (let k = 0; k < largo; k++) {
      const cx = horiz ? x + k : x;
      const cy = horiz ? y : y + k;
      if (cx >= N || cy >= N) return false;
      for (const b of flota) {
        if (celdasDe(b).some((c) => c.x === cx && c.y === cy)) return false;
      }
    }
    return true;
  }

  function pintarColocacion(x, y) {
    const flota = flotas[jugadorActivo];
    const clases = [];
    let html = '';
    let estilo = 'background:#0d2440;';

    const ocupada = flota.some((b) => celdasDe(b).some((c) => c.x === x && c.y === y));
    if (ocupada) html = `<div class="bn-barco" style="background:${players[jugadorActivo].color}"></div>`;

    // Vista previa del barco que se está colocando
    const actual = FLOTA[indiceBarco];
    if (actual && tab) {
      const cx = tab.cursor.x, cy = tab.cursor.y;
      const valido = cabe(flota, cx, cy, actual.largo, horizontal);
      for (let k = 0; k < actual.largo; k++) {
        const px = horizontal ? cx + k : cx;
        const py = horizontal ? cy : cy + k;
        if (px === x && py === y) clases.push(valido ? 'bn-preview' : 'bn-preview-mal');
      }
    }
    return { html, clases, estilo };
  }

  function colocar(x, y) {
    const actual = FLOTA[indiceBarco];
    if (!actual) return;
    if (!cabe(flotas[jugadorActivo], x, y, actual.largo, horizontal)) {
      audio.error();
      haptics.error(jugadorActivo);
      return;
    }
    flotas[jugadorActivo].push({ ...actual, x, y, horizontal, tocados: 0 });
    audio.place();
    haptics.play('impact', { player: jugadorActivo, scale: 0.7 });
    indiceBarco++;

    if (indiceBarco >= FLOTA.length) {
      if (jugadorActivo === 0) {
        mostrarCortina(1, 'Coloca tu flota', () => {
          jugadorActivo = 1;
          indiceBarco = 0;
          horizontal = true;
          construirTablero();
        });
      } else {
        mostrarCortina(0, 'Empieza el combate', () => {
          fase = 'disparando';
          jugadorActivo = 0;
          construirTablero();
        });
      }
      return;
    }
    tab.refrescar();
    actualizarPieColocacion();
  }

  function actualizarPieColocacion() {
    const actual = FLOTA[indiceBarco];
    tab.pie(`Coloca: <b>${actual.nombre}</b> (${actual.largo} casillas) ·
             <span class="kbd">${input.player(jugadorActivo).keyLabel('b')}</span> rota
             (${horizontal ? 'horizontal' : 'vertical'})`);
  }

  /* ---------------- Disparos ---------------- */

  function pintarDisparo(x, y) {
    const mio = disparos[jugadorActivo];
    const v = mio[y][x];
    const clases = [];
    let html = '';
    if (v === 'agua') html = '<div class="bn-agua">·</div>';
    if (v === 'tocado') html = `<div class="bn-tocado">${icon('target', { size: 16 })}</div>`;
    if (v === 'hundido') html = `<div class="bn-hundido">${icon('close', { size: 16 })}</div>`;
    return { html, clases, estilo: 'background:#0a1e38;' };
  }

  function disparar(x, y) {
    const mio = disparos[jugadorActivo];
    if (mio[y][x] != null) { audio.error(); haptics.error(jugadorActivo); return; }

    const rival = 1 - jugadorActivo;
    const barco = flotas[rival].find((b) => celdasDe(b).some((c) => c.x === x && c.y === y));

    if (!barco) {
      mio[y][x] = 'agua';
      audio.tone({ freq: 220, dur: 0.16, gain: 0.16, type: 'sine', sweep: -80 });
      haptics.play('soft', { player: jugadorActivo });
      tab.refrescar();
      setTimeout(() => {
        mostrarCortina(rival, 'Te toca disparar', () => {
          jugadorActivo = rival;
          construirTablero();
        });
      }, 700);
      return;
    }

    barco.tocados++;
    const hundido = barco.tocados >= barco.largo;
    mio[y][x] = hundido ? 'hundido' : 'tocado';
    if (hundido) {
      // Se marcan todas las casillas del barco hundido.
      for (const c of celdasDe(barco)) mio[c.y][c.x] = 'hundido';
      audio.explosion();
      haptics.explosion(jugadorActivo);
      tab.pie(`¡Hundido el <b>${escapeHtml(barco.nombre)}</b>!`);
    } else {
      audio.hit();
      haptics.impact(jugadorActivo, 1.1);
      tab.pie('<b>¡Tocado!</b> Repites disparo');
    }
    tab.refrescar();

    // Acertar da otro disparo: acelera el final y premia deducir.
    if (flotas[rival].every((b) => b.tocados >= b.largo)) {
      setTimeout(() => fin(jugadorActivo), 900);
    }
  }

  /* ---------------- Cortina ---------------- */

  function mostrarCortina(paraQuien, texto, continuar) {
    fase = 'cortina';
    cortinaSiguiente = continuar;
    const p = players[paraQuien];
    root.innerHTML = `
      <div class="bn-cortina">
        <div class="bn-ojo">${icon('eyeOff', { size: 40 })}</div>
        <h2>Pásale la Mac a <b style="color:${p.color}">${escapeHtml(p.name)}</b></h2>
        <p>${escapeHtml(texto)}. Que el otro no mire.</p>
        <img class="bn-av" src="${avatarFor(p)}" alt="">
        <p class="bn-listo">Pulsa <span class="kbd">${input.player(paraQuien).keyLabel('a')}</span> cuando estés</p>
      </div>`;
    audio.back();
    desuscribirCortina?.();
    desuscribirCortina = input.onAny((e) => {
      if (e.code !== input.player(paraQuien).map.a) return;
      desuscribirCortina?.();
      desuscribirCortina = null;
      audio.select();
      cortinaSiguiente?.();
    });
  }

  /* ---------------- Tablero ---------------- */

  function construirTablero() {
    tab?.destruir();
    tab = new Tablero(ctx, {
      cols: N, filas: N, celda: 54,
      turnoInicial: jugadorActivo,
      pintarCelda: fase === 'colocando' ? pintarColocacion : pintarDisparo,
      onConfirmar: (x, y) => (fase === 'colocando' ? colocar(x, y) : disparar(x, y)),
      onCursor: () => tab.refrescar(),
    });
    tab.turno = jugadorActivo;
    tab.actualizarTurno(fase === 'colocando' ? 'colocando flota' : 'disparando');
    if (fase === 'colocando') actualizarPieColocacion();
    else tab.pie(pieFlotaPropia());
  }

  function pieFlotaPropia() {
    const rival = 1 - jugadorActivo;
    const restantes = flotas[rival].filter((b) => b.tocados < b.largo);
    const mia = flotas[jugadorActivo].filter((b) => {
      const tocadosRival = disparos[rival];
      return celdasDe(b).some((c) => tocadosRival[c.y][c.x] == null);
    });
    return `Barcos enemigos a flote: <b>${restantes.length}</b> · los tuyos: <b>${mia.length}</b>`;
  }

  function fin(ganador) {
    fase = 'fin';
    tab.bloqueado = true;
    const aciertos = [0, 1].map((i) =>
      disparos[i].flat().filter((v) => v === 'tocado' || v === 'hundido').length
    );
    ctx.finish({
      winner: ganador,
      scores: aciertos,
      detail: 'Flota enemiga hundida',
    });
  }

  return {
    init() {
      inyectarEstilos();
      mostrarCortina(0, 'Coloca tu flota', () => {
        fase = 'colocando';
        jugadorActivo = 0;
        construirTablero();
      });
    },

    update(dt) {
      if (fase === 'cortina' || fase === 'fin') return;
      tab?.actualizar(dt);
      // Rotar el barco durante la colocación
      if (fase === 'colocando' && input.player(jugadorActivo).pressed('b')) {
        horizontal = !horizontal;
        audio.tick();
        haptics.play('click', { player: jugadorActivo });
        tab.refrescar();
        actualizarPieColocacion();
      }
      if (fase === 'disparando') {
        const pie = tab.elPie;
        if (pie && !pie.innerHTML.includes('Tocado') && !pie.innerHTML.includes('Hundido')) {
          pie.innerHTML = pieFlotaPropia();
        }
      }
    },

    destroy() { desuscribirCortina?.(); tab?.destruir(); root.innerHTML = ''; },
  };
}

function inyectarEstilos() {
  if (document.getElementById('bn-css')) return;
  const s = document.createElement('style');
  s.id = 'bn-css';
  s.textContent = `
    .bn-barco { width:86%; height:86%; border-radius:5px; box-shadow: inset 0 -2px 5px #0007; }
    .bn-preview { box-shadow: inset 0 0 0 3px #a8ff3ecc !important; background:#a8ff3e22 !important; }
    .bn-preview-mal { box-shadow: inset 0 0 0 3px #ff4757cc !important; background:#ff475722 !important; }
    .bn-agua { color:#4a7ab0; font-size:1.4em; }
    .bn-tocado { color:#ffd166; font-size:1.1em; animation:pop 240ms var(--ease); }
    .bn-hundido { color:#ff4757; font-size:1.1em; }
    .bn-cortina { text-align:center; max-width:min(520px,90vw); animation:pop 260ms var(--ease); }
    .bn-ojo { font-size:64px; margin-bottom:12px; }
    .bn-cortina h2 { font-size:22px; margin:0 0 8px; font-weight:600; }
    .bn-cortina p { color:var(--ink-dim); font-size:14px; margin:6px 0; }
    .bn-av { width:80px; height:80px; border-radius:50%; image-rendering:pixelated; margin:18px 0; }
    .bn-listo { margin-top:10px !important; }
  `;
  document.head.appendChild(s);
}
