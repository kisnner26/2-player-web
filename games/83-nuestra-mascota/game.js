/**
 * Nuestra Mascota — una criatura que crían los dos, y que sigue viva
 * entre partidas.
 *
 * A diferencia del resto del catálogo, este "juego" no se gana: el estado
 * de la mascota se guarda en localStorage (core/storage.js) y decae con el
 * TIEMPO REAL, así que si pasan tres días sin abrirla, la encuentran con
 * hambre. Eso es lo que la convierte en algo de la pareja y no en una
 * partida más.
 *
 * El reparto de trabajo es explícito a propósito: cada acción registra
 * quién la hizo, y la mascota agradece que se turnen (el vínculo sube más
 * si los dos cuidan por igual). Cuidarla entre los dos es la mecánica.
 */

import { escapeHtml } from '../../core/ui.js';
import { icon } from '../../core/icons.js';
import { loadMascota, saveMascota } from '../../core/storage.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const MAX = 100;
const MS_HORA = 3600_000;

/** Cuánto baja cada barra por hora real transcurrida. */
const DECAIMIENTO = { hambre: 3.2, animo: 2.4, energia: 2.0, limpieza: 1.6 };

const TIPOS = {
  gato:    { nombre: 'Gato',    icono: 'cat' },
  perro:   { nombre: 'Perro',   icono: 'dog' },
  dragon:  { nombre: 'Dragón',  icono: 'dragon' },
  unicorn: { nombre: 'Unicornio', icono: 'unicorn' },
  ave:     { nombre: 'Ave',     icono: 'bird' },
  tortuga: { nombre: 'Tortuga', icono: 'turtle' },
};

const COLORES = ['#ffd166', '#ff6ec7', '#a8ff3e', '#00e5ff', '#b04cff', '#ff7847'];

/**
 * Acciones de cuidado. `sube` es lo que mejora, `baja` el coste: nada es
 * gratis, y por eso hay que coordinarse en vez de machacar un solo botón.
 */
const ACCIONES = [
  { id: 'comer',  et: 'Dar de comer', icono: 'apple',  sube: { hambre: 26 },  baja: { limpieza: 5 } },
  { id: 'jugar',  et: 'Jugar',        icono: 'note',   sube: { animo: 24 },   baja: { energia: 12, hambre: 6 } },
  { id: 'banar',  et: 'Bañar',        icono: 'droplet', sube: { limpieza: 32 }, baja: { animo: 6 } },
  { id: 'dormir', et: 'Dormir',       icono: 'moon',   sube: { energia: 30 }, baja: { hambre: 8 } },
  { id: 'mimar',  et: 'Mimar',        icono: 'heart',  sube: { animo: 14, energia: 4 }, baja: {} },
];

const clamp01 = (v) => Math.max(0, Math.min(MAX, v));

/** Estado de ánimo derivado: no se guarda, se calcula de las barras. */
function humor(m) {
  const media = (m.hambre + m.animo + m.energia + m.limpieza) / 4;
  if (m.hambre < 20) return { id: 'hambriento', txt: 'Tiene hambre' };
  if (m.energia < 20) return { id: 'agotado', txt: 'Está agotada' };
  if (m.limpieza < 20) return { id: 'sucio', txt: 'Necesita un baño' };
  if (media > 78) return { id: 'feliz', txt: 'Está feliz' };
  if (media > 50) return { id: 'bien', txt: 'Está bien' };
  return { id: 'triste', txt: 'Está decaída' };
}

function nivelVinculo(v) {
  if (v >= 400) return { n: 5, et: 'Inseparables' };
  if (v >= 220) return { n: 4, et: 'Familia' };
  if (v >= 120) return { n: 3, et: 'Cómplices' };
  if (v >= 50) return { n: 2, et: 'Amigos' };
  return { n: 1, et: 'Recién conocidos' };
}

export function create(ctx) {
  const { input, audio, haptics, players, root } = ctx;

  let m = null;
  let fase = 'cargando';        // nacer | cuidar
  let cursor = 0;               // acción seleccionada
  let turnoSugerido = 0;        // a quién le toca cuidar (solo sugerencia)
  let mensaje = '';
  let animacion = 0;            // rebote al recibir cariño
  let desuscribir = null;
  let selTipo = 0, selColor = 0, selCampo = 0;   // pantalla de nacimiento

  /** Aplica el paso del tiempo real desde la última visita. */
  function aplicarDecaimiento() {
    if (!m.ultimaVisita) return 0;
    const horas = Math.max(0, (Date.now() - m.ultimaVisita) / MS_HORA);
    if (horas < 0.02) return 0;
    for (const [k, tasa] of Object.entries(DECAIMIENTO)) {
      m[k] = clamp01(m[k] - tasa * horas);
    }
    m.edadDias = m.nacida ? Math.floor((Date.now() - m.nacida) / (24 * MS_HORA)) : 0;
    return horas;
  }

  function guardar() {
    m.ultimaVisita = Date.now();
    saveMascota(m);
  }

  /* ---------------- Nacimiento ---------------- */

  function pintarNacer() {
    const tipos = Object.entries(TIPOS);
    const t = tipos[selTipo][1];
    root.innerHTML = `
      <div class="ms-wrap">
        <h2 class="ms-titulo">Su mascota</h2>
        <p class="ms-sub">Elijan juntos. Va a estar aquí cada vez que abran el juego.</p>

        <div class="ms-criatura ms-grande" style="--c:${COLORES[selColor]}">
          ${icon(t.icono, { size: 96 })}
        </div>

        <div class="ms-eleccion ${selCampo === 0 ? 'activo' : ''}">
          <span class="ms-et">Especie</span>
          <div class="ms-ops">
            ${tipos.map(([k, v], i) => `
              <div class="ms-op ${i === selTipo ? 'on' : ''}">${icon(v.icono, { size: 22 })}</div>`).join('')}
          </div>
        </div>

        <div class="ms-eleccion ${selCampo === 1 ? 'activo' : ''}">
          <span class="ms-et">Color</span>
          <div class="ms-ops">
            ${COLORES.map((c, i) => `
              <div class="ms-op-color ${i === selColor ? 'on' : ''}" style="background:${c}"></div>`).join('')}
          </div>
        </div>

        <p class="ms-hint">
          <span class="kbd">↑</span><span class="kbd">↓</span> cambiar fila ·
          <span class="kbd">←</span><span class="kbd">→</span> elegir ·
          cualquiera de los dos pulsa su tecla de acción para adoptarla
        </p>
      </div>`;
  }

  function adoptar() {
    const tipos = Object.keys(TIPOS);
    m.tipo = tipos[selTipo];
    m.color = COLORES[selColor];
    m.nombre = `${TIPOS[m.tipo].nombre} de ${players[0].name} y ${players[1].name}`;
    m.nacida = Date.now();
    m.edadDias = 0;
    m.hambre = m.animo = m.energia = m.limpieza = 80;
    m.diario = [{ t: Date.now(), txt: 'Nació su mascota' }];
    guardar();
    fase = 'cuidar';
    mensaje = '¡Es suya! Cuídenla entre los dos.';
    audio.win();
    haptics.play('victory');
    pintar();
  }

  /* ---------------- Cuidado ---------------- */

  function ejecutar(accion, jugador) {
    for (const [k, v] of Object.entries(accion.sube)) m[k] = clamp01(m[k] + v);
    for (const [k, v] of Object.entries(accion.baja)) m[k] = clamp01(m[k] - v);

    m.cuidados[jugador]++;

    // El vínculo premia el reparto: si uno hace todo, sube mucho menos.
    const [a, b] = m.cuidados;
    const equilibrio = a + b === 0 ? 1 : 1 - Math.abs(a - b) / (a + b);
    m.vinculo += Math.round(2 + 6 * equilibrio);

    animacion = 1;
    mensaje = `${players[jugador].name}: ${accion.et.toLowerCase()}`;
    turnoSugerido = 1 - jugador;
    audio.blip();
    haptics.play('soft', { player: jugador });
    // Se guarda al momento, no en el bucle: durante el briefing previo a la
    // partida el bucle está en pausa y un guardado diferido se perdería.
    guardar();
    pintar();
  }

  function barra(k, et, color) {
    const v = Math.round(m[k]);
    const bajo = v < 25;
    return `
      <div class="ms-barra ${bajo ? 'bajo' : ''}">
        <span class="ms-barra-et">${et}</span>
        <div class="ms-barra-riel"><i style="width:${v}%;background:${color}"></i></div>
        <span class="ms-barra-num">${v}</span>
      </div>`;
  }

  function pintarCuidar() {
    const t = TIPOS[m.tipo] || TIPOS.gato;
    const h = humor(m);
    const vin = nivelVinculo(m.vinculo);
    const [a, b] = m.cuidados;
    const total = a + b || 1;

    root.innerHTML = `
      <div class="ms-wrap">
        <div class="ms-cabecera">
          <div class="ms-info">
            <h2 class="ms-nombre">${escapeHtml(TIPOS[m.tipo].nombre)}</h2>
            <span class="ms-edad">${m.edadDias} día${m.edadDias === 1 ? '' : 's'} con ustedes</span>
          </div>
          <div class="ms-vinculo">
            <span class="ms-vinculo-n">${vin.et}</span>
            <div class="ms-corazones">
              ${[1, 2, 3, 4, 5].map((i) => `
                <span class="${i <= vin.n ? 'on' : ''}">${icon('heart', { size: 13 })}</span>`).join('')}
            </div>
          </div>
        </div>

        <div class="ms-criatura ms-${h.id} ${animacion > 0 ? 'ms-brinca' : ''}" style="--c:${m.color}">
          ${icon(t.icono, { size: 108 })}
        </div>
        <p class="ms-humor">${h.txt}</p>
        ${mensaje ? `<p class="ms-mensaje">${escapeHtml(mensaje)}</p>` : '<p class="ms-mensaje"></p>'}

        <div class="ms-barras">
          ${barra('hambre', 'Hambre', '#ff9f1c')}
          ${barra('animo', 'Ánimo', '#ff6ec7')}
          ${barra('energia', 'Energía', '#a8ff3e')}
          ${barra('limpieza', 'Limpieza', '#00e5ff')}
        </div>

        <div class="ms-acciones">
          ${ACCIONES.map((ac, i) => `
            <div class="ms-accion ${i === cursor ? 'sel' : ''}" style="--c:${players[turnoSugerido].color}">
              ${icon(ac.icono, { size: 20 })}
              <span>${ac.et}</span>
            </div>`).join('')}
        </div>

        <div class="ms-reparto">
          <span style="color:${players[0].color}">${escapeHtml(players[0].name)} ${a}</span>
          <div class="ms-reparto-riel">
            <i style="width:${(a / total) * 100}%;background:${players[0].color}"></i>
            <i style="width:${(b / total) * 100}%;background:${players[1].color}"></i>
          </div>
          <span style="color:${players[1].color}">${b} ${escapeHtml(players[1].name)}</span>
        </div>

        <p class="ms-hint">
          <span class="kbd">←</span><span class="kbd">→</span> elegir cuidado ·
          cada uno con su tecla de acción ·
          le toca a <b style="color:${players[turnoSugerido].color}">${escapeHtml(players[turnoSugerido].name)}</b>
        </p>
      </div>`;
  }

  function pintar() {
    if (fase === 'nacer') pintarNacer();
    else if (fase === 'cuidar') pintarCuidar();
  }

  /* ---------------- Entrada ---------------- */

  function tecla(e) {
    for (let j = 0; j < 2; j++) {
      const map = input.player(j).map;

      if (fase === 'nacer') {
        if (e.code === map.up || e.code === map.down) {
          selCampo = 1 - selCampo; audio.tick(); pintarNacer(); return;
        }
        if (e.code === map.left) {
          if (selCampo === 0) selTipo = (selTipo - 1 + Object.keys(TIPOS).length) % Object.keys(TIPOS).length;
          else selColor = (selColor - 1 + COLORES.length) % COLORES.length;
          audio.tick(); pintarNacer(); return;
        }
        if (e.code === map.right) {
          if (selCampo === 0) selTipo = (selTipo + 1) % Object.keys(TIPOS).length;
          else selColor = (selColor + 1) % COLORES.length;
          audio.tick(); pintarNacer(); return;
        }
        if (e.code === map.a) { adoptar(); return; }
        continue;
      }

      if (fase === 'cuidar') {
        if (e.code === map.left) { cursor = (cursor - 1 + ACCIONES.length) % ACCIONES.length; audio.tick(); pintar(); return; }
        if (e.code === map.right) { cursor = (cursor + 1) % ACCIONES.length; audio.tick(); pintar(); return; }
        if (e.code === map.a) { ejecutar(ACCIONES[cursor], j); return; }
        if (e.code === map.b) { ejecutar(ACCIONES.find((x) => x.id === 'mimar'), j); return; }
      }
    }
  }

  return {
    init() {
      inyectarEstilos();
      m = loadMascota();
      const horas = aplicarDecaimiento();
      fase = m.nacida ? 'cuidar' : 'nacer';

      if (fase === 'cuidar' && horas > 1) {
        const h = Math.floor(horas);
        mensaje = h >= 24
          ? `Han pasado ${Math.floor(h / 24)} día(s). Los echaba de menos.`
          : `Han pasado ${h} hora(s) desde la última visita.`;
      }
      desuscribir = input.onAny(tecla);
      pintar();
    },

    update(dt) {
      if (animacion > 0) {
        animacion -= dt * 2;
        if (animacion <= 0) { animacion = 0; pintar(); }
      }
    },

    destroy() {
      desuscribir?.();
      if (m?.nacida) guardar();
      root.innerHTML = '';
    },
  };
}

function inyectarEstilos() {
  if (document.getElementById('ms-css')) return;
  const s = document.createElement('style');
  s.id = 'ms-css';
  s.textContent = `
    .ms-wrap {
      display:flex; flex-direction:column; align-items:center; gap:10px;
      width:min(680px, 94vw); text-align:center;
    }
    .ms-titulo { font-family:var(--font-display); font-size:17px; margin:0; }
    .ms-sub { font-size:12.5px; color:var(--ink-dim); margin:0 0 4px; }

    .ms-cabecera { display:flex; align-items:center; justify-content:space-between; width:100%; }
    .ms-info { text-align:left; }
    .ms-nombre { font-size:16px; margin:0; font-weight:650; }
    .ms-edad { font-size:11px; color:var(--ink-faint); }
    .ms-vinculo { text-align:right; }
    .ms-vinculo-n { font-size:11px; color:var(--ink-dim); letter-spacing:.06em; text-transform:uppercase; }
    .ms-corazones { display:flex; gap:2px; justify-content:flex-end; margin-top:2px; }
    .ms-corazones span { color:#ffffff20; }
    .ms-corazones span.on { color:#ff6ec7; }

    .ms-criatura {
      color:var(--c); filter: drop-shadow(0 0 22px var(--c));
      transition: transform 200ms var(--ease);
    }
    .ms-grande { margin:6px 0; }
    .ms-brinca { animation: ms-brinca 420ms var(--ease); }
    @keyframes ms-brinca {
      0% { transform: translateY(0) scale(1); }
      35% { transform: translateY(-14px) scale(1.08); }
      100% { transform: translateY(0) scale(1); }
    }
    .ms-hambriento, .ms-agotado, .ms-triste { filter: drop-shadow(0 0 10px var(--c)) grayscale(.45); opacity:.75; }
    .ms-sucio { filter: drop-shadow(0 0 10px var(--c)) sepia(.5); opacity:.8; }
    .ms-feliz { animation: ms-flota 2.4s ease-in-out infinite; }
    @keyframes ms-flota { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }

    .ms-humor { font-size:13px; color:var(--ink); margin:0; }
    .ms-mensaje { font-size:12px; color:var(--ink-dim); margin:0; min-height:17px; }

    .ms-barras { display:grid; grid-template-columns:1fr 1fr; gap:6px 16px; width:100%; margin-top:2px; }
    .ms-barra { display:flex; align-items:center; gap:8px; font-size:11px; }
    .ms-barra-et { width:62px; text-align:left; color:var(--ink-dim); }
    .ms-barra-riel { flex:1; height:7px; border-radius:4px; background:#ffffff12; overflow:hidden; }
    .ms-barra-riel i { display:block; height:100%; transition: width 300ms var(--ease); }
    .ms-barra-num { width:24px; text-align:right; color:var(--ink-faint); font-family:var(--font-mono); }
    .ms-barra.bajo .ms-barra-et, .ms-barra.bajo .ms-barra-num { color:var(--danger); }

    .ms-acciones { display:flex; gap:7px; flex-wrap:wrap; justify-content:center; margin-top:4px; }
    .ms-accion {
      display:flex; flex-direction:column; align-items:center; gap:4px;
      padding:9px 13px; border-radius:var(--radius-sm);
      background:#ffffff08; border:1px solid var(--line);
      font-size:11px; color:var(--ink-dim);
      transition: all 160ms var(--ease);
    }
    .ms-accion.sel {
      border-color:var(--c); color:var(--ink);
      background:color-mix(in srgb, var(--c) 14%, transparent);
      box-shadow:0 0 18px -6px var(--c);
    }

    .ms-reparto { display:flex; align-items:center; gap:9px; width:100%; font-size:10.5px; margin-top:4px; }
    .ms-reparto-riel { flex:1; height:5px; border-radius:3px; overflow:hidden; display:flex; background:#ffffff10; }
    .ms-reparto-riel i { display:block; height:100%; transition: width 300ms var(--ease); }

    .ms-eleccion {
      display:flex; align-items:center; gap:12px; width:100%;
      padding:8px 12px; border-radius:var(--radius-sm);
      border:1px solid transparent;
    }
    .ms-eleccion.activo { border-color:var(--line); background:#ffffff06; }
    .ms-et { font-size:10.5px; color:var(--ink-faint); letter-spacing:.1em; text-transform:uppercase; width:60px; text-align:left; }
    .ms-ops { display:flex; gap:6px; flex-wrap:wrap; }
    .ms-op {
      width:38px; height:38px; display:grid; place-items:center;
      border-radius:var(--radius-sm); background:#ffffff08;
      border:1px solid var(--line); color:var(--ink-dim);
    }
    .ms-op.on { border-color:var(--ink); color:var(--ink); background:#ffffff16; }
    .ms-op-color { width:26px; height:26px; border-radius:50%; border:2px solid transparent; }
    .ms-op-color.on { border-color:#fff; box-shadow:0 0 12px currentColor; }

    .ms-hint { font-size:11px; color:var(--ink-faint); margin:6px 0 0; }
  `;
  document.head.appendChild(s);
}
