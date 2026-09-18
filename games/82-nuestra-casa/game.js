/**
 * Nuestra Casa — construyen y decoran una casa que es de los dos.
 *
 * Como la mascota, la casa PERSISTE entre partidas (core/storage.js): lo que
 * pongan hoy sigue ahí mañana. Cada mueble recuerda quién lo puso, así que
 * con el tiempo el plano cuenta quién decoró qué.
 *
 * Los dos cursores están en pantalla a la vez y se mueven en simultáneo:
 * no hay turnos, decoran juntos y se pelean por el sitio, que es la gracia.
 */

import { escapeHtml } from '../../core/ui.js';
import { loadCasa, saveCasa } from '../../core/storage.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const COLS = 16, FILAS = 10;
const HABITACIONES = ['salon', 'cocina', 'dormitorio', 'jardin'];
const NOMBRE_HAB = { salon: 'Salón', cocina: 'Cocina', dormitorio: 'Dormitorio', jardin: 'Jardín' };

const SUELO = {
  salon:      { base: '#3b2a20', alt: '#43301f' },
  cocina:     { base: '#2b3038', alt: '#333a44' },
  dormitorio: { base: '#33253a', alt: '#3b2b44' },
  jardin:     { base: '#1f3a24', alt: '#25452a' },
};

/**
 * Catálogo de muebles. `w`/`h` en celdas; `dib` pinta la pieza dentro de su
 * caja para que todo se dibuje por código (sin imágenes que descargar).
 */
const MUEBLES = [
  { id: 'sofa', et: 'Sofá', w: 3, h: 1, hab: 'salon', dib: (g, x, y, w, h, c) => {
      g.fillStyle = c; redondo(g, x + 2, y + h * 0.25, w - 4, h * 0.7, 5);
      g.fillStyle = sombra(c); redondo(g, x + 2, y + h * 0.18, w - 4, h * 0.3, 5);
      g.fillStyle = sombra(c); g.fillRect(x + 2, y + h * 0.9, 4, h * 0.12); g.fillRect(x + w - 6, y + h * 0.9, 4, h * 0.12);
    } },
  { id: 'mesa', et: 'Mesa', w: 2, h: 1, hab: 'salon', dib: (g, x, y, w, h, c) => {
      g.fillStyle = c; redondo(g, x + 3, y + h * 0.3, w - 6, h * 0.4, 4);
      g.fillStyle = sombra(c); g.fillRect(x + 6, y + h * 0.68, 3, h * 0.25); g.fillRect(x + w - 9, y + h * 0.68, 3, h * 0.25);
    } },
  { id: 'tv', et: 'Tele', w: 2, h: 1, hab: 'salon', dib: (g, x, y, w, h, c) => {
      g.fillStyle = '#101018'; redondo(g, x + 3, y + h * 0.2, w - 6, h * 0.5, 3);
      g.fillStyle = c; g.globalAlpha = 0.5; redondo(g, x + 5, y + h * 0.26, w - 10, h * 0.38, 2); g.globalAlpha = 1;
      g.fillStyle = sombra(c); g.fillRect(x + w / 2 - 5, y + h * 0.72, 10, 3);
    } },
  { id: 'planta', et: 'Planta', w: 1, h: 1, hab: 'salon', dib: (g, x, y, w, h, c) => {
      g.fillStyle = '#7a4a2a'; redondo(g, x + w * 0.32, y + h * 0.6, w * 0.36, h * 0.3, 2);
      g.fillStyle = '#3fbf5a';
      for (const dx of [-0.18, 0, 0.18]) {
        g.beginPath(); g.ellipse(x + w * (0.5 + dx), y + h * 0.42, w * 0.13, h * 0.24, dx * 3, 0, Math.PI * 2); g.fill();
      }
    } },
  { id: 'lampara', et: 'Lámpara', w: 1, h: 1, hab: 'salon', dib: (g, x, y, w, h, c) => {
      g.fillStyle = c; g.beginPath();
      g.moveTo(x + w * 0.3, y + h * 0.45); g.lineTo(x + w * 0.7, y + h * 0.45); g.lineTo(x + w * 0.6, y + h * 0.2); g.lineTo(x + w * 0.4, y + h * 0.2);
      g.closePath(); g.fill();
      g.fillStyle = sombra(c); g.fillRect(x + w * 0.47, y + h * 0.45, 3, h * 0.35);
      g.save(); g.globalAlpha = 0.22; g.fillStyle = '#ffd166';
      g.beginPath(); g.arc(x + w * 0.5, y + h * 0.5, w * 0.42, 0, Math.PI * 2); g.fill(); g.restore();
    } },
  { id: 'nevera', et: 'Nevera', w: 1, h: 2, hab: 'cocina', dib: (g, x, y, w, h, c) => {
      g.fillStyle = c; redondo(g, x + 3, y + 3, w - 6, h - 6, 4);
      g.fillStyle = sombra(c); g.fillRect(x + 3, y + h * 0.42, w - 6, 2);
      g.fillStyle = '#ffffff55'; g.fillRect(x + w - 9, y + h * 0.22, 2, 8); g.fillRect(x + w - 9, y + h * 0.55, 2, 8);
    } },
  { id: 'fogon', et: 'Fogón', w: 2, h: 1, hab: 'cocina', dib: (g, x, y, w, h, c) => {
      g.fillStyle = '#2a2a33'; redondo(g, x + 2, y + h * 0.25, w - 4, h * 0.6, 3);
      g.fillStyle = c;
      for (const dx of [0.3, 0.7]) { g.beginPath(); g.arc(x + w * dx, y + h * 0.55, w * 0.09, 0, Math.PI * 2); g.fill(); }
    } },
  { id: 'fregadero', et: 'Fregadero', w: 2, h: 1, hab: 'cocina', dib: (g, x, y, w, h, c) => {
      g.fillStyle = '#c8d0d8'; redondo(g, x + 3, y + h * 0.3, w - 6, h * 0.5, 3);
      g.fillStyle = '#8b96a2'; redondo(g, x + 6, y + h * 0.38, w - 12, h * 0.32, 2);
      g.strokeStyle = c; g.lineWidth = 2; g.beginPath();
      g.moveTo(x + w * 0.5, y + h * 0.3); g.lineTo(x + w * 0.5, y + h * 0.16); g.stroke();
    } },
  { id: 'cama', et: 'Cama', w: 3, h: 2, hab: 'dormitorio', dib: (g, x, y, w, h, c) => {
      g.fillStyle = sombra(c); redondo(g, x + 3, y + 4, w - 6, h - 8, 4);
      g.fillStyle = c; redondo(g, x + 3, y + h * 0.4, w - 6, h * 0.5, 4);
      g.fillStyle = '#f0eae0'; redondo(g, x + 6, y + h * 0.14, w * 0.28, h * 0.22, 3);
      g.fillStyle = '#f0eae0'; redondo(g, x + w * 0.42, y + h * 0.14, w * 0.28, h * 0.22, 3);
    } },
  { id: 'armario', et: 'Armario', w: 2, h: 2, hab: 'dormitorio', dib: (g, x, y, w, h, c) => {
      g.fillStyle = c; redondo(g, x + 3, y + 3, w - 6, h - 6, 3);
      g.fillStyle = sombra(c); g.fillRect(x + w / 2 - 1, y + 5, 2, h - 10);
      g.fillStyle = '#ffd166'; g.beginPath();
      g.arc(x + w / 2 - 5, y + h / 2, 2, 0, Math.PI * 2); g.arc(x + w / 2 + 5, y + h / 2, 2, 0, Math.PI * 2); g.fill();
    } },
  { id: 'alfombra', et: 'Alfombra', w: 3, h: 2, hab: 'dormitorio', dib: (g, x, y, w, h, c) => {
      g.save(); g.globalAlpha = 0.75; g.fillStyle = c; redondo(g, x + 3, y + 3, w - 6, h - 6, 8);
      g.globalAlpha = 0.5; g.fillStyle = sombra(c); redondo(g, x + 9, y + 9, w - 18, h - 18, 5); g.restore();
    } },
  { id: 'arbol', et: 'Árbol', w: 2, h: 2, hab: 'jardin', dib: (g, x, y, w, h, c) => {
      g.fillStyle = '#6b4326'; g.fillRect(x + w / 2 - 3, y + h * 0.55, 6, h * 0.38);
      g.fillStyle = '#3fbf5a';
      g.beginPath(); g.arc(x + w * 0.5, y + h * 0.4, w * 0.3, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(x + w * 0.32, y + h * 0.5, w * 0.2, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(x + w * 0.68, y + h * 0.5, w * 0.2, 0, Math.PI * 2); g.fill();
    } },
  { id: 'banco', et: 'Banco', w: 2, h: 1, hab: 'jardin', dib: (g, x, y, w, h, c) => {
      g.fillStyle = '#8a5a30'; redondo(g, x + 3, y + h * 0.45, w - 6, h * 0.16, 2);
      g.fillStyle = '#7a4a26'; redondo(g, x + 3, y + h * 0.24, w - 6, h * 0.12, 2);
      g.fillStyle = '#5a3a1e'; g.fillRect(x + 6, y + h * 0.6, 3, h * 0.28); g.fillRect(x + w - 9, y + h * 0.6, 3, h * 0.28);
    } },
  { id: 'flores', et: 'Flores', w: 1, h: 1, hab: 'jardin', dib: (g, x, y, w, h, c) => {
      for (const [dx, dy] of [[0.3, 0.6], [0.55, 0.42], [0.72, 0.66]]) {
        g.fillStyle = c;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          g.beginPath();
          g.arc(x + w * dx + Math.cos(a) * 4, y + h * dy + Math.sin(a) * 4, 2.6, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = '#ffd166'; g.beginPath(); g.arc(x + w * dx, y + h * dy, 2.4, 0, Math.PI * 2); g.fill();
      }
    } },
  { id: 'fuente', et: 'Fuente', w: 2, h: 2, hab: 'jardin', dib: (g, x, y, w, h, c) => {
      g.fillStyle = '#8b96a2'; g.beginPath(); g.ellipse(x + w / 2, y + h * 0.6, w * 0.36, h * 0.24, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3aa6d8'; g.beginPath(); g.ellipse(x + w / 2, y + h * 0.58, w * 0.27, h * 0.17, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8b96a2'; g.fillRect(x + w / 2 - 3, y + h * 0.26, 6, h * 0.28);
      g.fillStyle = '#6fd0f0'; g.beginPath(); g.arc(x + w / 2, y + h * 0.24, w * 0.1, 0, Math.PI * 2); g.fill();
    } },
];

const PALETA = ['#ff6ec7', '#00e5ff', '#ffd166', '#a8ff3e', '#b04cff', '#ff7847', '#f2f2f2'];

function redondo(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
  g.fill();
}
function sombra(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.65), gg = Math.round(((n >> 8) & 255) * 0.65), b = Math.round((n & 255) * 0.65);
  return `rgb(${r},${gg},${b})`;
}
const mueblePorId = (id) => MUEBLES.find((m) => m.id === id);

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let casa = null;
  let habIdx = 0;
  let celda = 40, offX = 0, offY = 0;
  let aviso = '', avisoT = 0;

  // Un cursor por jugador, con su propio catálogo y color elegido.
  const cur = [
    { x: 3, y: 4, mueble: 0, color: 0, mov: 0, borrando: false },
    { x: 11, y: 4, mueble: 1, color: 1, mov: 0, borrando: false },
  ];

  const habActual = () => HABITACIONES[habIdx];
  const catalogo = () => MUEBLES.filter((m) => m.hab === habActual());

  function medir() {
    celda = Math.floor(Math.min((W - 60) / COLS, (H - 190) / FILAS));
    celda = Math.max(18, celda);
    offX = Math.floor((W - COLS * celda) / 2);
    offY = 96;
  }

  function piezasAqui() {
    return casa.piezas.filter((p) => p.hab === habActual());
  }

  function chocaCon(mx, my, mw, mh, ignorar = null) {
    for (const p of piezasAqui()) {
      if (p === ignorar) continue;
      const d = mueblePorId(p.tipo);
      if (!d) continue;
      if (mx < p.x + d.w && mx + mw > p.x && my < p.y + d.h && my + mh > p.y) return p;
    }
    return null;
  }

  function decir(txt) { aviso = txt; avisoT = 1.8; }

  function poner(j) {
    const c = cur[j];
    const cat = catalogo();
    const def = cat[c.mueble % cat.length];
    if (!def) return;
    if (c.x + def.w > COLS || c.y + def.h > FILAS) { decir('No cabe ahí'); audio.error(); return; }
    if (chocaCon(c.x, c.y, def.w, def.h)) { decir('Ya hay algo ahí'); audio.error(); haptics.error(j); return; }

    casa.piezas.push({ tipo: def.id, hab: habActual(), x: c.x, y: c.y, color: PALETA[c.color], por: j });
    casa.puestas[j]++;
    saveCasa(casa);
    audio.blip();
    haptics.play('soft', { player: j });
    particles.burst(offX + (c.x + def.w / 2) * celda, offY + (c.y + def.h / 2) * celda, 12, {
      speed: 130, dir: -Math.PI / 2, spread: Math.PI * 2, color: PALETA[c.color], size: 2.4, drag: 0.91,
    });
  }

  function quitar(j) {
    const c = cur[j];
    const p = chocaCon(c.x, c.y, 1, 1);
    if (!p) { decir('Nada que quitar'); return; }
    casa.piezas.splice(casa.piezas.indexOf(p), 1);
    if (casa.puestas[p.por] > 0) casa.puestas[p.por]--;
    saveCasa(casa);
    audio.back();
    haptics.play('tap', { player: j });
  }

  function moverCursor(j, dt) {
    const p = input.player(j);
    const c = cur[j];
    c.mov -= dt;
    const dx = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
    const dy = (p.held('down') ? 1 : 0) - (p.held('up') ? 1 : 0);
    if ((dx || dy) && c.mov <= 0) {
      c.x = Math.max(0, Math.min(COLS - 1, c.x + dx));
      c.y = Math.max(0, Math.min(FILAS - 1, c.y + dy));
      c.mov = 0.11;
      audio.tick();
    }
    if (!dx && !dy) c.mov = 0;
  }

  function dibujarPieza(g, p, alpha = 1) {
    const def = mueblePorId(p.tipo);
    if (!def) return;
    g.save();
    g.globalAlpha = alpha;
    def.dib(g, offX + p.x * celda, offY + p.y * celda, def.w * celda, def.h * celda, p.color);
    g.restore();
  }

  return {
    init() {
      casa = loadCasa();
      if (!Array.isArray(casa.piezas)) casa.piezas = [];
      if (!Array.isArray(casa.puestas)) casa.puestas = [0, 0];
      casa.ultimaVisita = Date.now();
      medir();
      decir(casa.piezas.length ? 'Su casa, tal como la dejaron' : 'Casa vacía: pongan lo primero');
    },

    resize(w, h) { W = w; H = h; medir(); },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;

      for (let j = 0; j < 2; j++) {
        moverCursor(j, dt);
        const p = input.player(j);
        if (p.pressed('a')) poner(j);
        if (p.pressed('b')) quitar(j);
      }
      // Cambiar de mueble / habitación con las teclas de sistema de cada uno:
      // se usa el flanco de 'up'/'down' con B mantenido para no robar el movimiento.
      for (let j = 0; j < 2; j++) {
        const p = input.player(j);
        if (p.held('b')) {
          const cat = catalogo();
          if (p.pressed('right')) { cur[j].mueble = (cur[j].mueble + 1) % cat.length; audio.select(); }
          if (p.pressed('left')) { cur[j].mueble = (cur[j].mueble - 1 + cat.length) % cat.length; audio.select(); }
          if (p.pressed('up')) { cur[j].color = (cur[j].color + 1) % PALETA.length; audio.select(); }
        }
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0b0910');

      const suelo = SUELO[habActual()];

      // Suelo a cuadros + paredes
      for (let y = 0; y < FILAS; y++) {
        for (let x = 0; x < COLS; x++) {
          g.fillStyle = (x + y) % 2 ? suelo.base : suelo.alt;
          g.fillRect(offX + x * celda, offY + y * celda, celda, celda);
        }
      }
      g.strokeStyle = '#ffffff10'; g.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) { g.beginPath(); g.moveTo(offX + x * celda, offY); g.lineTo(offX + x * celda, offY + FILAS * celda); g.stroke(); }
      for (let y = 0; y <= FILAS; y++) { g.beginPath(); g.moveTo(offX, offY + y * celda); g.lineTo(offX + COLS * celda, offY + y * celda); g.stroke(); }
      g.strokeStyle = '#ffffff30'; g.lineWidth = 3;
      g.strokeRect(offX, offY, COLS * celda, FILAS * celda);

      // Muebles colocados
      for (const p of piezasAqui()) dibujarPieza(g, p);

      // Fantasma del mueble que lleva cada cursor + el cursor
      for (let j = 0; j < 2; j++) {
        const c = cur[j];
        const cat = catalogo();
        const def = cat[c.mueble % cat.length];
        if (def) {
          const cabe = c.x + def.w <= COLS && c.y + def.h <= FILAS && !chocaCon(c.x, c.y, def.w, def.h);
          dibujarPieza(g, { tipo: def.id, x: c.x, y: c.y, color: PALETA[c.color] }, cabe ? 0.42 : 0.16);
          g.strokeStyle = cabe ? players[j].color : '#ff4757';
          g.lineWidth = 2.5;
          g.strokeRect(offX + c.x * celda + 1, offY + c.y * celda + 1, def.w * celda - 2, def.h * celda - 2);
        }
        // Etiqueta del cursor
        ctx.engine.text(players[j].name, offX + c.x * celda + 4, offY + c.y * celda - 7, {
          size: 10, color: players[j].color, align: 'left', font: 'system-ui',
        });
      }

      particles.render(g);

      // Cabecera: habitación + catálogo de cada jugador
      ctx.engine.text(NOMBRE_HAB[habActual()], W / 2, 30, { size: 17, color: '#ffffff', glow: 10 });
      ctx.engine.text(`${casa.piezas.length} objetos en toda la casa`, W / 2, 50, {
        size: 11, color: '#ffffff77', font: 'system-ui',
      });

      for (let j = 0; j < 2; j++) {
        const cat = catalogo();
        const def = cat[cur[j].mueble % cat.length];
        const x = j === 0 ? 16 : W - 16;
        ctx.engine.text(`${def ? def.et : '—'}`, x, 72, {
          size: 12, color: players[j].color, align: j === 0 ? 'left' : 'right', font: 'system-ui',
        });
        // Muestra del color elegido
        g.fillStyle = PALETA[cur[j].color];
        g.fillRect(j === 0 ? 16 : W - 30, 78, 14, 5);
      }

      if (avisoT > 0) {
        ctx.engine.text(aviso, W / 2, offY + FILAS * celda + 24, {
          size: 12, color: '#ffd166', font: 'system-ui',
        });
      }
      ctx.engine.text(
        'Mover: dirección · A: poner · B: quitar · B+←/→: cambiar mueble · B+↑: color',
        W / 2, H - 16, { size: 10.5, color: '#ffffff55', font: 'system-ui' }
      );
    },

    onFinish() { saveCasa(casa); },

    destroy() {
      if (casa) { casa.ultimaVisita = Date.now(); saveCasa(casa); }
    },
  };
}
