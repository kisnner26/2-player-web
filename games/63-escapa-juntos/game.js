/**
 * Escapa Juntos — uno ve los cables, el otro el manual. Solo hablando salen.
 *
 * Es el patrón de información asimétrica: en una misma pantalla, cada mitad
 * es ilegible para el otro papel. El que corta NO puede leer las reglas y el
 * del manual NO puede tocar nada. La única herramienta es hablar, y bajo un
 * reloj que corre, que es donde aparecen los gritos y las risas.
 *
 * Las reglas se evalúan EN ORDEN: la primera que se cumple manda. Es
 * importante que sea así, porque es lo que obliga a leer el manual entero en
 * voz alta en vez de buscar la línea que suene bien.
 */

import { escapeHtml } from '../../core/ui.js';
import { icon } from '../../core/icons.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const TIEMPO = 240;
const FALLOS_MAX = 3;
const MODULOS = 4;

const COLORES = [
  { id: 'rojo', hex: '#ff4757', nombre: 'rojo' },
  { id: 'azul', hex: '#3a86ff', nombre: 'azul' },
  { id: 'amarillo', hex: '#ffd166', nombre: 'amarillo' },
  { id: 'blanco', hex: '#f0f0f5', nombre: 'blanco' },
  { id: 'negro', hex: '#2a2a35', nombre: 'negro' },
];

/**
 * Reglas del manual, en orden de prioridad. `cond` recibe los cables y
 * devuelve si aplica; `elegir` devuelve el índice del cable a cortar.
 */
const REGLAS = [
  {
    txt: 'Si hay <b>exactamente un cable rojo</b>, corta ese.',
    cond: (c) => c.filter((x) => x.id === 'rojo').length === 1,
    elegir: (c) => c.findIndex((x) => x.id === 'rojo'),
  },
  {
    txt: 'Si no hay ningún cable azul, corta el <b>segundo</b> cable.',
    cond: (c) => !c.some((x) => x.id === 'azul'),
    elegir: () => 1,
  },
  {
    txt: 'Si el <b>último</b> cable es blanco, corta el <b>primero</b>.',
    cond: (c) => c[c.length - 1].id === 'blanco',
    elegir: () => 0,
  },
  {
    txt: 'Si hay <b>más de un amarillo</b>, corta el <b>último amarillo</b>.',
    cond: (c) => c.filter((x) => x.id === 'amarillo').length > 1,
    elegir: (c) => c.map((x) => x.id).lastIndexOf('amarillo'),
  },
  {
    txt: 'Si hay <b>dos o más negros</b>, corta el <b>penúltimo</b> cable.',
    cond: (c) => c.filter((x) => x.id === 'negro').length >= 2,
    elegir: (c) => c.length - 2,
  },
  {
    txt: 'En cualquier otro caso, corta el <b>último</b> cable.',
    cond: () => true,
    elegir: (c) => c.length - 1,
  },
];

export function create(ctx) {
  const { input, audio, haptics, players, root, rng } = ctx;

  let cables = [];
  let cortados = [];
  let cursor = 0;
  let modulo = 1;
  let fallos = 0;
  let tiempo = TIEMPO;
  let pagina = 0;
  let fase = 'jugando';         // jugando | resuelto | fin
  let pausa = 0;
  let mensaje = '';
  let mensajeOk = false;
  let desuscribir = null;

  const REGLAS_POR_PAGINA = 2;
  const totalPaginas = Math.ceil(REGLAS.length / REGLAS_POR_PAGINA);

  function nuevoModulo() {
    const n = 4 + Math.floor(rng() * 2);      // 4 o 5 cables
    cables = Array.from({ length: n }, () => COLORES[Math.floor(rng() * COLORES.length)]);
    cortados = new Array(n).fill(false);
    cursor = 0;
    mensaje = '';
    mensajeOk = false;
    fase = 'jugando';
    pintar();
  }

  /** Índice correcto según la primera regla que se cumple. */
  function correcto() {
    for (const r of REGLAS) {
      if (r.cond(cables)) {
        const i = r.elegir(cables);
        if (i >= 0 && i < cables.length) return i;
      }
    }
    return cables.length - 1;
  }

  function pintar() {
    if (fase === 'fin') return;
    const p1 = players[0], p2 = players[1];
    const desde = pagina * REGLAS_POR_PAGINA;
    const reglasPag = REGLAS.slice(desde, desde + REGLAS_POR_PAGINA);

    root.innerHTML = `
      <div class="ej-wrap">
        <div class="ej-top">
          <span>Módulo ${modulo} / ${MODULOS}</span>
          <span class="ej-reloj ${tiempo < 45 ? 'urgente' : ''}">${fmt(tiempo)}</span>
          <span class="ej-fallos">${icon('close', { size: 12 }).repeat(fallos)}${'·'.repeat(FALLOS_MAX - fallos)}</span>
        </div>

        <div class="ej-paneles">
          <!-- Panel del que corta -->
          <div class="ej-panel ej-bomba" style="--c:${p1.color}">
            <div class="ej-rol">${icon('bomb', { size: 14 })} ${escapeHtml(p1.name)} · corta</div>
            <div class="ej-cables">
              ${cables.map((c, i) => `
                <div class="ej-cable ${cortados[i] ? 'cortado' : ''} ${i === cursor ? 'sel' : ''}">
                  <span class="ej-num">${i + 1}</span>
                  <span class="ej-linea" style="--w:${c.hex}"></span>
                </div>`).join('')}
            </div>
            <div class="ej-ayuda">
              <span class="kbd">${input.player(0).keyLabel('up')}</span>
              <span class="kbd">${input.player(0).keyLabel('down')}</span> elegir ·
              <span class="kbd">${input.player(0).keyLabel('a')}</span> cortar
            </div>
          </div>

          <!-- Panel del manual -->
          <div class="ej-panel ej-manual" style="--c:${p2.color}">
            <div class="ej-rol">${icon('book', { size: 14 })} ${escapeHtml(p2.name)} · manual</div>
            <div class="ej-reglas">
              ${reglasPag.map((r, k) => `
                <div class="ej-regla">
                  <span class="ej-n">${desde + k + 1}</span>
                  <span>${r.txt}</span>
                </div>`).join('')}
            </div>
            <div class="ej-paginacion">
              página ${pagina + 1} / ${totalPaginas} ·
              <span class="kbd">${input.player(1).keyLabel('up')}</span>
              <span class="kbd">${input.player(1).keyLabel('down')}</span>
            </div>
          </div>
        </div>

        <div class="ej-aviso">
          ${mensaje || 'Las reglas se aplican <b>en orden</b>: manda la primera que se cumpla.'}
        </div>
      </div>`;
  }

  const fmt = (s) => {
    const t = Math.max(0, Math.ceil(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };

  function tecla(e) {
    if (fase !== 'jugando') return;
    const m1 = input.player(0).map, m2 = input.player(1).map;

    // El que corta
    if (e.code === m1.up) { moverCursor(-1); return; }
    if (e.code === m1.down) { moverCursor(1); return; }
    if (e.code === m1.a) { cortar(); return; }

    // El del manual
    if (e.code === m2.up) { pagina = (pagina - 1 + totalPaginas) % totalPaginas; audio.tick(); haptics.play('tick', { player: 1 }); pintar(); return; }
    if (e.code === m2.down) { pagina = (pagina + 1) % totalPaginas; audio.tick(); haptics.play('tick', { player: 1 }); pintar(); return; }
  }

  function moverCursor(d) {
    const n = cables.length;
    let k = cursor;
    // Salta los ya cortados.
    for (let intento = 0; intento < n; intento++) {
      k = (k + d + n) % n;
      if (!cortados[k]) break;
    }
    cursor = k;
    audio.tick();
    haptics.play('tick', { player: 0 });
    pintar();
  }

  function cortar() {
    if (cortados[cursor]) return;
    const bien = cursor === correcto();
    cortados[cursor] = true;

    if (bien) {
      fase = 'resuelto';
      pausa = 2;
      mensajeOk = true;
      mensaje = `${icon('check', { size: 15 })} Cable ${cursor + 1} correcto · módulo desactivado`;
      audio.win();
      haptics.play('victory');
    } else {
      fallos++;
      audio.explosion();
      haptics.explosion();
      mensajeOk = false;
      mensaje = `${icon('bomb', { size: 15 })} ¡Cable equivocado! Era el <b>${correcto() + 1}</b> · fallo ${fallos}/${FALLOS_MAX}`;
      if (fallos >= FALLOS_MAX) {
        fase = 'fin';
        pintar();
        setTimeout(() => terminar(false, 'La bomba explotó'), 1200);
        return;
      }
      // Reinicia el módulo con cables nuevos: hay que volver a leer.
      fase = 'resuelto';
      pausa = 2.4;
      cortados = new Array(cables.length).fill(true);
    }
    pintar();
  }

  function terminar(exito, motivo) {
    fase = 'fin';
    const usado = TIEMPO - tiempo;
    ctx.finish({
      winner: -1,
      scores: [modulo - (exito ? 0 : 1), fallos],
      detail: exito
        ? `¡Desactivada! ${MODULOS} módulos en ${fmt(usado)} con ${fallos} fallo(s)`
        : `${motivo} · llegaron al módulo ${modulo}`,
      record: exito && ctx.record('tiempo', Math.round(usado), 'low'),
    });
  }

  return {
    init() {
      inyectarEstilos();
      desuscribir = input.onAny(tecla);
      nuevoModulo();
    },

    update(dt) {
      if (fase === 'fin') return;

      if (fase === 'resuelto') {
        pausa -= dt;
        if (pausa > 0) return;
        if (mensajeOk) {
          modulo++;
          if (modulo > MODULOS) return terminar(true, '');
        }
        nuevoModulo();
        return;
      }

      tiempo -= dt;
      const rel = root.querySelector('.ej-reloj');
      if (rel) {
        rel.textContent = fmt(tiempo);
        rel.classList.toggle('urgente', tiempo < 45);
      }
      if (tiempo <= 30 && Math.random() < dt * 1.4) audio.tick();
      if (tiempo <= 0) return terminar(false, 'Se acabó el tiempo');
    },

    destroy() { desuscribir?.(); root.innerHTML = ''; },
  };
}

function inyectarEstilos() {
  if (document.getElementById('ej-css')) return;
  const s = document.createElement('style');
  s.id = 'ej-css';
  s.textContent = `
    .ej-wrap { width:min(940px,95vw); display:flex; flex-direction:column; gap:16px; }
    .ej-top { display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--ink-dim); }
    .ej-reloj { font-family:var(--font-display); font-size:22px; color:var(--ink); }
    .ej-reloj.urgente { color:var(--danger); animation:pulse-glow .5s infinite; }
    .ej-fallos { font-family:var(--font-mono); color:var(--danger); letter-spacing:3px; }

    .ej-paneles { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
    .ej-panel {
      padding:18px; border-radius:16px; background:#ffffff07;
      border:2px solid var(--c); min-height:270px;
      display:flex; flex-direction:column; gap:14px;
    }
    .ej-rol { font-size:12px; color:var(--c); font-weight:600; letter-spacing:.04em; }

    .ej-cables { display:flex; flex-direction:column; gap:11px; flex:1; justify-content:center; }
    .ej-cable { display:flex; align-items:center; gap:12px; padding:6px 8px; border-radius:8px; transition:all 140ms; }
    .ej-cable.sel { background:#ffffff14; box-shadow:inset 0 0 0 2px var(--c); }
    .ej-cable.cortado { opacity:.28; }
    .ej-cable.cortado .ej-linea { background:repeating-linear-gradient(90deg, var(--w) 0 8px, transparent 8px 16px); }
    .ej-num { font-family:var(--font-mono); font-size:12px; color:var(--ink-faint); width:16px; }
    .ej-linea { flex:1; height:10px; border-radius:5px; background:var(--w); box-shadow:0 2px 6px #0007; }

    .ej-reglas { display:flex; flex-direction:column; gap:12px; flex:1; }
    .ej-regla {
      display:flex; gap:10px; font-size:13px; line-height:1.6;
      background:#ffffff08; padding:12px 14px; border-radius:10px;
    }
    .ej-regla b { color:var(--gold); }
    .ej-n {
      flex:none; width:20px; height:20px; border-radius:50%;
      background:#ffffff18; display:grid; place-items:center;
      font-size:11px; font-family:var(--font-mono);
    }
    .ej-paginacion, .ej-ayuda { font-size:11px; color:var(--ink-faint); text-align:center; }

    .ej-aviso {
      text-align:center; font-size:13px; padding:12px; border-radius:10px;
      background:#ffffff08; color:var(--ink-dim); min-height:20px;
    }
    .ej-aviso b { color:var(--ink); }
    @media (max-width:760px) { .ej-paneles { grid-template-columns:1fr; } }
  `;
  document.head.appendChild(s);
}
