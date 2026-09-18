/**
 * mando.js — el iPad o el móvil convertido en mando del arcade.
 *
 * Esta página no sabe jugar a nada. Se une a una sala, recibe de la Mac qué
 * botonera dibujar y devuelve pulsaciones. Toda la lógica sigue en la Mac,
 * que es lo que permite que un juego de hace tres meses funcione con mando
 * sin que nadie lo toque.
 *
 * Detalles que importan en un cristal y no en un teclado:
 *   - se usan eventos de puntero con captura, para que dos pulgares a la vez
 *     no se pisen y soltar fuera del botón no deje la tecla trabada;
 *   - nada de scroll, zoom ni rebote: `touch-action: none` y `preventDefault`;
 *   - se pide Wake Lock para que la pantalla no se apague a mitad de partida.
 */

/* ---------------- Conexión ---------------- */

const el = {
  entrar: document.getElementById('p-entrar'),
  mando: document.getElementById('p-mando'),
  codigo: document.getElementById('codigo'),
  error: document.getElementById('entrar-error'),
  quien: document.getElementById('mando-quien'),
  juego: document.getElementById('mando-juego'),
  aviso: document.getElementById('mando-aviso'),
  cuerpo: document.getElementById('mando-cuerpo'),
  pie: document.getElementById('mando-pie'),
  top: document.querySelector('.mando-top'),
};

const COLORES = ['#ff2e88', '#00e5ff'];

let ws = null;
let slot = 0;
let codigoSala = '';
let wakeLock = null;

/* La URL puede traerlo todo hecho: así el enlace que enseña la Mac conecta
   de un toque, sin teclear el código. */
const params = new URLSearchParams(location.search);
if (params.get('slot') === '1') elegirSlot(1);
if (params.get('sala')) {
  el.codigo.value = params.get('sala').toUpperCase().slice(0, 4);
  // El enlace ya trae todo: conectar de un toque y no de tres.
  if (el.codigo.value.length === 4) requestAnimationFrame(conectar);
}

function elegirSlot(n) {
  slot = n;
  document.querySelectorAll('.jug').forEach((b) => b.classList.toggle('on', +b.dataset.slot === n));
}
document.querySelectorAll('.jug').forEach((b) => {
  b.addEventListener('click', () => elegirSlot(+b.dataset.slot));
});

el.codigo.addEventListener('input', () => {
  el.codigo.value = el.codigo.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  if (el.codigo.value.length === 4) conectar();
});
document.getElementById('btn-entrar').addEventListener('click', conectar);
document.getElementById('mando-salir').addEventListener('click', () => {
  ws?.close();
  location.href = location.pathname;
});

function conectar() {
  const codigo = el.codigo.value.trim().toUpperCase();
  if (codigo.length !== 4) { el.error.textContent = 'El código tiene cuatro caracteres.'; return; }
  el.error.textContent = 'Conectando…';

  ws?.close();
  ws = new WebSocket(`ws://${location.host}/ws`);

  ws.addEventListener('open', () => ws.send(JSON.stringify({ tipo: 'unir', codigo, slot })));

  ws.addEventListener('message', (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    recibir(msg);
  });

  ws.addEventListener('close', () => {
    if (el.mando.classList.contains('oculta')) {
      el.error.textContent = 'Se perdió la conexión con la Mac.';
      return;
    }
    mostrarAviso('Conexión perdida. Vuelve a entrar con el código.');
    el.top.classList.add('caido');
    el.cuerpo.classList.add('caido');
  });

  ws.addEventListener('error', () => {
    el.error.textContent = 'No se pudo conectar. ¿Estás en la misma wifi que la Mac?';
  });
}

function recibir(msg) {
  switch (msg.tipo) {
    case 'unido':
      codigoSala = msg.codigo;
      slot = msg.slot;
      document.documentElement.style.setProperty('--yo', COLORES[slot] || COLORES[0]);
      el.quien.textContent = `Jugador ${slot + 1}`;
      el.entrar.classList.add('oculta');
      el.mando.classList.remove('oculta');
      el.top.classList.remove('caido');
      el.cuerpo.classList.remove('caido');
      pintar(PERFIL_BASE);
      pedirWakeLock();
      sugerirGirar();
      break;

    case 'perfil':
      pintar(msg);
      break;

    case 'aviso':
      // Los avisos del juego (gol, golpe, error) suenan y vibran en el mando:
      // así el jugador se entera sin apartar la vista de la pantalla grande.
      responder(msg.patron || 'aviso');
      if (msg.texto) {
        mostrarAviso(msg.texto);
        setTimeout(ocultarAviso, 1600);
      }
      break;

    case 'pantalla-fuera':
      mostrarAviso('Cambiando de juego…');
      el.cuerpo.classList.add('caido');
      break;

    case 'pantalla-vuelve':
      ocultarAviso();
      el.cuerpo.classList.remove('caido');
      break;

    case 'sala-cerrada':
      mostrarAviso('La sala se cerró en la Mac.');
      el.cuerpo.classList.add('caido');
      break;

    case 'error':
      el.error.textContent = msg.razon;
      break;
  }
}

function enviar(objeto) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(objeto));
}

function mostrarAviso(texto) {
  el.aviso.textContent = texto;
  el.aviso.classList.remove('oculta');
}
function ocultarAviso() { el.aviso.classList.add('oculta'); }

/* ---------------- Respuesta física: sonido y vibración ---------------- */

/*
 * Un mando que no responde al dedo se siente como una foto de un mando. En un
 * cristal no hay recorrido de tecla, así que el «clic» hay que fabricarlo:
 * un golpe de sonido corto, una vibración a juego y un destello en el botón.
 * Los tres a la vez son lo que convierte un rectángulo en algo que se pulsa.
 *
 * El sonido se sintetiza aquí, en el propio iPad, y no se manda por red: unos
 * milisegundos de latencia bastarían para que el chasquido llegara después
 * del dedo y estropeara justo lo que se busca.
 */

let ac = null;

/** El navegador solo deja sonar tras un gesto del usuario; se abre en el primero. */
function despertarAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ac = new AC();
  }
  if (ac?.state === 'suspended') ac.resume();
}

/** Golpe corto sintetizado. `tipo` decide el carácter del sonido. */
function sonar(tipo) {
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime;
  const perfiles = {
    tecla: { f: 660, f2: 320, dur: 0.055, onda: 'square', vol: 0.16 },
    soltar: { f: 380, f2: 300, dur: 0.035, onda: 'square', vol: 0.07 },
    palanca: { f: 240, f2: 200, dur: 0.04, onda: 'triangle', vol: 0.08 },
    punto: { f: 520, f2: 900, dur: 0.16, onda: 'triangle', vol: 0.2 },
    error: { f: 220, f2: 110, dur: 0.2, onda: 'sawtooth', vol: 0.18 },
    golpe: { f: 150, f2: 60, dur: 0.18, onda: 'sawtooth', vol: 0.22 },
    aviso: { f: 440, f2: 660, dur: 0.12, onda: 'sine', vol: 0.14 },
  };
  const p = perfiles[tipo] || perfiles.tecla;

  const osc = ac.createOscillator();
  const gan = ac.createGain();
  osc.type = p.onda;
  osc.frequency.setValueAtTime(p.f, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, p.f2), t + p.dur);
  gan.gain.setValueAtTime(p.vol, t);
  // Caída exponencial: un corte seco chasquearía por el salto de amplitud.
  gan.gain.exponentialRampToValueAtTime(0.0008, t + p.dur);
  osc.connect(gan).connect(ac.destination);
  osc.start(t);
  osc.stop(t + p.dur + 0.02);
}

/* Patrones de vibración por tipo de suceso. Android los ejecuta tal cual;
   iOS ignora la API, y por eso el sonido y el destello no son opcionales. */
const PATRONES = {
  tecla: 14,
  soltar: 0,
  toque: 12,
  palanca: 6,
  golpe: [0, 45, 30, 25],
  error: [0, 60, 50, 60],
  punto: [0, 20, 40, 20, 40, 45],
  aviso: [0, 25, 60, 25],
};

let respuestaActiva = true;

/** Sonido + vibración a la vez: la unidad de respuesta del mando. */
function responder(tipo) {
  if (!respuestaActiva) return;
  sonar(tipo);
  const patron = PATRONES[tipo];
  if (patron) navigator.vibrate?.(patron);
}

/** Compatibilidad con el resto del archivo. */
function vibrar(patron) { responder(patron); }

/** Evita que el iPad apague la pantalla entre pulsación y pulsación. */
async function pedirWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch { /* no está disponible en todos los navegadores; no es crítico */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !wakeLock) pedirWakeLock();
});

/* ---------------- Botonera ---------------- */

/** Mando por defecto: sirve para moverse por el menú y para la mayoría de juegos. */
const PERFIL_BASE = {
  juego: 'Menú',
  disposicion: 'dual',
  pie: 'Mira la pantalla de la Mac',
  controles: [
    { tipo: 'cruz' },
    { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Acción' }, { a: 'b', etiqueta: 'Especial' }] },
  ],
};

const GLIFO = { up: '▲', down: '▼', left: '◀', right: '▶' };

function pintar(perfil) {
  const p = { ...PERFIL_BASE, ...perfil };
  el.juego.textContent = p.juego || '';
  el.pie.textContent = p.pie || '';
  el.cuerpo.className = `mando-cuerpo ${p.disposicion || 'dual'}`;
  el.cuerpo.innerHTML = '';

  for (const control of p.controles || []) {
    const nodo = construir(control);
    if (nodo) el.cuerpo.appendChild(nodo);
  }
  // Cambiar de botonera con un dedo apoyado dejaría la acción trabada.
  soltarTodo();
}

function construir(control) {
  switch (control.tipo) {
    case 'cruz': return construirCruz();
    case 'palanca': return construirPalanca();
    case 'acciones': return construirAcciones(control.botones || []);
    case 'trazo': return construirTrazo(control);
    case 'secreto': return construirSecreto(control);
    default: return null;
  }
}

function construirCruz() {
  const cruz = document.createElement('div');
  cruz.className = 'cruz';
  for (const a of ['up', 'left', 'right', 'down']) {
    const b = document.createElement('button');
    b.className = `tecla ${a}`;
    b.innerHTML = `<span class="glifo">${GLIFO[a]}</span>`;
    ligarTecla(b, a);
    cruz.appendChild(b);
  }
  const centro = document.createElement('span');
  centro.className = 'centro';
  cruz.appendChild(centro);
  return cruz;
}

function construirAcciones(botones) {
  const caja = document.createElement('div');
  caja.className = `acciones n${Math.min(4, botones.length)}`;
  for (const def of botones) {
    const b = document.createElement('button');
    b.className = 'tecla' + (botones.length === 1 ? ' enorme' : '');
    b.innerHTML = def.glifo
      ? `<span class="glifo">${def.glifo}</span>${def.etiqueta ? `<small>${def.etiqueta}</small>` : ''}`
      : `${def.etiqueta || def.a.toUpperCase()}`;
    if (def.color) b.style.setProperty('--yo', def.color);
    ligarTecla(b, def.a);
    caja.appendChild(b);
  }
  return caja;
}

function construirSecreto(control) {
  const caja = document.createElement('div');
  caja.className = 'secreto';
  caja.innerHTML = `
    <h3>${escapar(control.titulo || 'Solo para ti')}</h3>
    ${control.texto ? `<p>${escapar(control.texto)}</p>` : ''}
    ${control.dato ? `<span class="dato">${escapar(control.dato)}</span>` : ''}`;
  return caja;
}

/**
 * Onda que sale del punto exacto donde cayó el dedo.
 *
 * Es la pieza que más se nota de las tres: el sonido y la vibración dicen
 * «ha pasado algo», pero solo la onda dice «ha pasado AQUÍ», y con dos
 * pulgares sobre el cristal eso es lo que confirma que pulsaste el botón que
 * querías y no el de al lado.
 */
function onda(nodo, e) {
  const r = nodo.getBoundingClientRect();
  const o = document.createElement('span');
  o.className = 'onda';
  o.style.left = `${e.clientX - r.left}px`;
  o.style.top = `${e.clientY - r.top}px`;
  nodo.appendChild(o);
  o.addEventListener('animationend', () => o.remove());
}

/* ---------------- Teclas ---------------- */

/* Se guarda qué puntero mantiene cada tecla: con dos pulgares a la vez, el
   pointerup de uno no puede levantar la tecla del otro. */
const punteros = new Map();   // pointerId -> { nodo, accion }

function ligarTecla(nodo, accion) {
  nodo.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    despertarAudio();
    nodo.setPointerCapture(e.pointerId);
    punteros.set(e.pointerId, { nodo, accion });
    nodo.classList.add('on');
    enviar({ tipo: 'accion', a: accion, v: 1 });
    responder('tecla');
    onda(nodo, e);
  });

  const soltar = (e) => {
    const reg = punteros.get(e.pointerId);
    if (!reg || reg.nodo !== nodo) return;
    punteros.delete(e.pointerId);
    nodo.classList.remove('on');
    enviar({ tipo: 'accion', a: accion, v: 0 });
    responder('soltar');
  };
  nodo.addEventListener('pointerup', soltar);
  nodo.addEventListener('pointercancel', soltar);
  // Con captura el puntero no "sale" del nodo, pero si el sistema la rompe
  // (una llamada entrante, por ejemplo) esto evita dejar la tecla pulsada.
  nodo.addEventListener('lostpointercapture', soltar);
}

function soltarTodo() {
  for (const [, reg] of punteros) {
    reg.nodo.classList.remove('on');
    enviar({ tipo: 'accion', a: reg.accion, v: 0 });
  }
  punteros.clear();
}
window.addEventListener('blur', soltarTodo);

/* ---------------- Palanca analógica ---------------- */

function construirPalanca() {
  const caja = document.createElement('div');
  caja.className = 'palanca';
  const punta = document.createElement('span');
  punta.className = 'punta';
  caja.appendChild(punta);

  let id = null;
  let ultimoEnvio = 0;
  let pendiente = null;

  const mover = (e) => {
    const r = caja.getBoundingClientRect();
    const radio = r.width / 2;
    let dx = (e.clientX - (r.left + radio)) / radio;
    let dy = (e.clientY - (r.top + radio)) / radio;
    const largo = Math.hypot(dx, dy);
    if (largo > 1) { dx /= largo; dy /= largo; }
    punta.style.transform = `translate(${dx * radio * 0.55}px, ${dy * radio * 0.55}px)`;
    pendiente = { tipo: 'stick', x: +dx.toFixed(3), y: +dy.toFixed(3) };
    // A 60 fps un dedo genera más mensajes de los que hacen falta: se manda
    // como mucho uno cada 40 ms y el último siempre llega al soltar.
    const ahora = performance.now();
    if (ahora - ultimoEnvio > 40) { ultimoEnvio = ahora; enviar(pendiente); pendiente = null; }
  };

  caja.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    id = e.pointerId;
    caja.setPointerCapture(id);
    caja.classList.add('activa');
    mover(e);
  });
  caja.addEventListener('pointermove', (e) => { if (e.pointerId === id) mover(e); });

  const soltar = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    pendiente = null;
    caja.classList.remove('activa');
    punta.style.transform = '';
    enviar({ tipo: 'stick', x: 0, y: 0 });
  };
  caja.addEventListener('pointerup', soltar);
  caja.addEventListener('pointercancel', soltar);
  caja.addEventListener('lostpointercapture', soltar);
  return caja;
}

/* ---------------- Zona de trazo ---------------- */

function construirTrazo(control) {
  const caja = document.createElement('div');
  caja.className = 'trazo-zona';
  const lienzo = document.createElement('canvas');
  caja.appendChild(lienzo);
  const pista = document.createElement('span');
  pista.className = 'pista';
  pista.textContent = control.pista || 'Dibuja aquí con el dedo';
  caja.appendChild(pista);

  let ctx = null;
  let puntos = [];
  let id = null;

  const medir = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    lienzo.width = caja.clientWidth * dpr;
    lienzo.height = caja.clientHeight * dpr;
    ctx = lienzo.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--yo').trim() || '#ff2e88';
  };
  requestAnimationFrame(medir);
  window.addEventListener('resize', medir);

  const punto = (e) => {
    const r = caja.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  caja.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    despertarAudio();
    id = e.pointerId;
    caja.setPointerCapture(id);
    puntos = [punto(e)];
    ctx?.clearRect(0, 0, caja.clientWidth, caja.clientHeight);
    pista.style.opacity = '0';
    responder('palanca');
  });

  caja.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id || !ctx) return;
    const p = punto(e);
    const previo = puntos[puntos.length - 1];
    puntos.push(p);
    // Trazo con grosor según la velocidad del dedo: rápido y fino, lento y
    // grueso. Es lo que hace que un garabato parezca dibujado y no trazado
    // por una máquina.
    const v = Math.hypot(p.x - previo.x, p.y - previo.y);
    ctx.lineWidth = Math.max(3, 9 - v * 90);
    ctx.beginPath();
    ctx.moveTo(previo.x * caja.clientWidth, previo.y * caja.clientHeight);
    ctx.lineTo(p.x * caja.clientWidth, p.y * caja.clientHeight);
    ctx.stroke();
  });

  const soltar = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    if (puntos.length > 2) {
      enviar({
        tipo: 'trazo',
        // Se recorta a 64 puntos: de sobra para reconocer una figura y evita
        // mandar cuatrocientos por la red en cada garabato.
        puntos: puntos.filter((_, i) => i % Math.ceil(puntos.length / 64) === 0)
          .map((p) => [+p.x.toFixed(3), +p.y.toFixed(3)]),
      });
      responder('punto');
    }
    setTimeout(() => {
      ctx?.clearRect(0, 0, caja.clientWidth, caja.clientHeight);
      pista.style.opacity = '';
    }, 260);
  };
  caja.addEventListener('pointerup', soltar);
  caja.addEventListener('pointercancel', soltar);
  return caja;
}

/* ---------------- Utilidades ---------------- */

function escapar(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Safari en iOS hace zoom con doble toque aunque se le diga que no: esto lo
// remata para que dos toques rápidos en un botón no amplíen la página.
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

/* ---------------- Orientación ---------------- */

/**
 * El mando está pensado para el aparato tumbado: así los pulgares caen sobre
 * las dos esquinas de abajo y el centro queda libre para apoyar las manos.
 * En vertical funciona igual, pero se sugiere girar una sola vez.
 */
function sugerirGirar() {
  if (document.querySelector('.girar')) return;
  if (matchMedia('(orientation: landscape)').matches) return;
  if (sessionStorage.getItem('2pa:girar-visto')) return;

  const aviso = document.createElement('div');
  aviso.className = 'girar';
  aviso.innerHTML = '<span>↻</span><span>Gira el aparato: se juega mucho mejor <b>en horizontal</b></span>';
  document.body.appendChild(aviso);
  sessionStorage.setItem('2pa:girar-visto', '1');
  setTimeout(() => aviso.remove(), 6000);
}

// Al girar, las zonas de dibujo tienen que volver a medirse y ninguna tecla
// puede quedarse pulsada por un dedo que ya no está donde estaba.
matchMedia('(orientation: landscape)').addEventListener('change', () => {
  soltarTodo();
  window.dispatchEvent(new Event('resize'));
});
