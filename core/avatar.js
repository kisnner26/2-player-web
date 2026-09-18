/**
 * avatar.js — convierte una foto normal en un avatar arcade.
 *
 * No hay red neuronal ni servidor: todo es procesamiento de imagen en canvas,
 * local y offline. El resultado no es un retrato literal (eso requeriría detección
 * de rasgos faciales), sino una estilización fuerte y consistente que hace que
 * dos fotos cualesquiera se vean como parte del mismo juego.
 *
 * Cadena de proceso:
 *   1. Recorte cuadrado centrado (con encuadre ajustable por el usuario).
 *   2. Auto-niveles: estira el histograma para que la cara no salga lavada.
 *   3. Ajustes de brillo / contraste / saturación.
 *   4. Cuantización a una paleta fija (es lo que da el look "de consola").
 *   5. Pixelado por vecino más cercano.
 *   6. Contorno por detección de bordes (Sobel), como los sprites dibujados.
 *   7. Máscara circular + aro del color del jugador.
 */

import { retratoDe } from './personaje.js';

export const PALETTES = {
  neon: {
    nombre: 'Neón',
    colors: ['#0d0221', '#241734', '#3b1e57', '#7b2d8e', '#c62368', '#ff2e88',
             '#ff6ec7', '#00e5ff', '#3effc8', '#ffd166', '#fff3b0', '#ffffff'],
  },
  gameboy: {
    nombre: 'Game Boy',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  },
  nes: {
    nombre: 'NES',
    colors: ['#000000', '#3d2c2c', '#7c3f2e', '#c4703a', '#e8a56b', '#fcd8b0',
             '#1c3a70', '#3b6ea5', '#6bb8e8', '#2a6b3f', '#63c14e', '#b8e05a',
             '#a02c2c', '#e04c4c', '#f2f2f2', '#8a8a8a'],
  },
  pastel: {
    nombre: 'Pastel',
    colors: ['#2b2438', '#5c4f6e', '#a08bb5', '#d9b8d0', '#f7d6e0', '#fff1e6',
             '#b8e0d2', '#95b8d1', '#eac4d5', '#f6bd60'],
  },
  sepia: {
    nombre: 'Arcade sepia',
    colors: ['#1a1109', '#3d2817', '#6b4423', '#9c6b3f', '#c99e6b', '#e8cfa8', '#fff4e0'],
  },
  duo: {
    nombre: 'Dúo (color del jugador)',
    dynamic: true,   // se genera a partir del color del jugador
  },
};

export const STYLES = {
  pixel:  { nombre: 'Pixel',   pixelSize: 28, posterize: 0, outline: 0.55, contrast: 1.25, saturation: 1.35, palette: 'nes' },
  arcade: { nombre: 'Arcade',  pixelSize: 40, posterize: 0, outline: 0.7,  contrast: 1.35, saturation: 1.6,  palette: 'neon' },
  chunky: { nombre: 'Chunky',  pixelSize: 16, posterize: 0, outline: 0.4,  contrast: 1.2,  saturation: 1.2,  palette: 'pastel' },
  boy:    { nombre: 'Game Boy',pixelSize: 32, posterize: 0, outline: 0.5,  contrast: 1.45, saturation: 0,    palette: 'gameboy' },
  duotono:{ nombre: 'Duotono', pixelSize: 36, posterize: 0, outline: 0.65, contrast: 1.4,  saturation: 1.1,  palette: 'duo' },
  suave:  { nombre: 'Suave',   pixelSize: 96, posterize: 6, outline: 0.3,  contrast: 1.15, saturation: 1.25, palette: 'sepia' },
};

const hexToRgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const clamp = (v, a = 0, b = 255) => (v < a ? a : v > b ? b : v);

/** Paleta de 8 tonos derivada del color del jugador: de casi negro a casi blanco. */
function duoPalette(accent) {
  const [r, g, b] = hexToRgb(accent);
  const out = [];
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    // Curva: sombras frías tirando al color, luces hacia el blanco.
    const mix = t < 0.5 ? t * 2 : 1;
    const lift = t < 0.5 ? 0 : (t - 0.5) * 2;
    out.push([
      clamp(Math.round(r * mix * (1 - lift) + 255 * lift)),
      clamp(Math.round(g * mix * (1 - lift) + 255 * lift)),
      clamp(Math.round(b * mix * (1 - lift) + 255 * lift)),
    ]);
  }
  out[0] = [12, 8, 20];
  return out;
}

function paletteRgb(name, accent = '#ff2e88') {
  const p = PALETTES[name];
  if (!p) return null;
  if (p.dynamic) return duoPalette(accent);
  return p.colors.map(hexToRgb);
}

/** Color de la paleta más cercano en distancia euclídea ponderada por percepción. */
function nearest(pal, r, g, b) {
  let best = pal[0], bd = Infinity;
  for (const c of pal) {
    const dr = r - c[0], dg = g - c[1], db = b - c[2];
    // Pesos aproximados a la sensibilidad del ojo humano.
    const d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

/** Estira el histograma descartando el 2% de los extremos (evita fotos lavadas). */
function autoLevels(data) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const l = (data[i] * 0.30 + data[i + 1] * 0.59 + data[i + 2] * 0.11) | 0;
    hist[l]++;
  }
  const total = data.length / 4;
  const cut = total * 0.02;
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > cut) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > cut) { hi = i; break; } }
  if (hi - lo < 24) return;   // imagen ya plana: no forzar
  const scale = 255 / (hi - lo);
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = clamp((data[i] - lo) * scale);
    data[i + 1] = clamp((data[i + 1] - lo) * scale);
    data[i + 2] = clamp((data[i + 2] - lo) * scale);
  }
}

/** Magnitud de borde por Sobel sobre la luminancia. Devuelve Float32Array 0..1 */
function sobel(data, w, h) {
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    lum[p] = (data[i] * 0.30 + data[i + 1] * 0.59 + data[i + 2] * 0.11) / 255;
  }
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] +
         lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1];
      const gy =
        -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] +
         lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      out[i] = Math.min(1, Math.hypot(gx, gy));
    }
  }
  return out;
}

/**
 * Genera el avatar.
 * @param {HTMLImageElement|HTMLCanvasElement} source
 * @param {object} opts
 * @returns {string} dataURL PNG
 */
export function generateAvatar(source, opts = {}) {
  const {
    style = 'arcade',
    palette: paletteOverride = null,
    accent = '#ff2e88',
    size = 256,          // tamaño final en px
    zoom = 1,            // encuadre: 1 = recorte cuadrado completo
    offsetX = 0,         // -1..1 desplazamiento del encuadre
    offsetY = 0,
    brightness = 0,      // -1..1
    contrast = null,     // null = el del estilo
    saturation = null,
    pixelSize = null,    // resolución interna (px por lado antes de escalar)
    outline = null,      // 0..1 fuerza del contorno
    circular = true,
    ring = true,
    transparentBg = false,
  } = opts;

  const st = STYLES[style] || STYLES.arcade;
  const px = Math.max(8, Math.round(pixelSize ?? st.pixelSize));
  const ctr = contrast ?? st.contrast;
  const sat = saturation ?? st.saturation;
  const outl = outline ?? st.outline;
  const palName = paletteOverride ?? st.palette;
  const pal = paletteRgb(palName, accent);

  /* 1. Recorte cuadrado a la resolución interna */
  const small = document.createElement('canvas');
  small.width = small.height = px;
  const sc = small.getContext('2d', { willReadFrequently: true });
  sc.imageSmoothingEnabled = true;
  sc.imageSmoothingQuality = 'high';

  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  const side = Math.min(sw, sh) / Math.max(0.35, zoom);
  const maxDX = (sw - side) / 2;
  const maxDY = (sh - side) / 2;
  const sx = (sw - side) / 2 + offsetX * maxDX;
  const sy = (sh - side) / 2 + offsetY * maxDY;
  sc.drawImage(source, sx, sy, side, side, 0, 0, px, px);

  const img = sc.getImageData(0, 0, px, px);
  const d = img.data;

  /* 2. Auto-niveles */
  autoLevels(d);

  /* 3. Brillo / contraste / saturación */
  const bAdd = brightness * 90;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] + bAdd, g = d[i + 1] + bAdd, b = d[i + 2] + bAdd;
    r = (r - 128) * ctr + 128;
    g = (g - 128) * ctr + 128;
    b = (b - 128) * ctr + 128;
    const l = r * 0.30 + g * 0.59 + b * 0.11;
    r = l + (r - l) * sat;
    g = l + (g - l) * sat;
    b = l + (b - l) * sat;
    d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b);
  }

  /* 4. Bordes (antes de cuantizar, sobre la imagen con más información) */
  const edges = outl > 0 ? sobel(d, px, px) : null;

  /* 5. Posterizar y/o cuantizar a la paleta */
  const post = st.posterize;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (post > 1) {
      const q = 255 / (post - 1);
      r = Math.round(r / q) * q; g = Math.round(g / q) * q; b = Math.round(b / q) * q;
    }
    if (pal) {
      const c = nearest(pal, r, g, b);
      r = c[0]; g = c[1]; b = c[2];
    }
    if (edges) {
      const e = edges[p];
      if (e > 0.45) {
        // Oscurece el píxel proporcionalmente al borde: contorno dibujado.
        const k = 1 - Math.min(0.92, (e - 0.45) * 1.9 * outl);
        r *= k; g *= k; b *= k;
      }
    }
    d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b);
  }
  sc.putImageData(img, 0, 0);

  /* 6-7. Escalado duro + máscara circular */
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const oc = out.getContext('2d');
  oc.imageSmoothingEnabled = false;

  if (circular) {
    oc.save();
    oc.beginPath();
    oc.arc(size / 2, size / 2, size / 2 - (ring ? size * 0.045 : 0), 0, Math.PI * 2);
    oc.clip();
    if (!transparentBg) {
      oc.fillStyle = pal ? `rgb(${pal[0].join(',')})` : '#12121f';
      oc.fillRect(0, 0, size, size);
    }
    oc.drawImage(small, 0, 0, size, size);
    oc.restore();
    if (ring) {
      oc.strokeStyle = accent;
      oc.lineWidth = size * 0.055;
      oc.shadowColor = accent;
      oc.shadowBlur = size * 0.09;
      oc.beginPath();
      oc.arc(size / 2, size / 2, size / 2 - size * 0.032, 0, Math.PI * 2);
      oc.stroke();
    }
  } else {
    oc.drawImage(small, 0, 0, size, size);
  }

  return out.toDataURL('image/png');
}

/** Carga un File/Blob en un HTMLImageElement. */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('El archivo no es una imagen.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}

/**
 * Avatar de reserva cuando no hay foto: si el jugador eligió un emoji en el
 * editor de perfil se dibuja ese (elección suya, no decoración del sistema);
 * si no, se dibuja su inicial sobre el disco, sin caer en un emoji por
 * defecto que nadie pidió.
 */
export function fallbackAvatar({ emoji = '', nombre = '', color = '#ff2e88', size = 256 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const grd = x.createLinearGradient(0, 0, size, size);
  grd.addColorStop(0, color);
  grd.addColorStop(1, '#12121f');
  x.beginPath();
  x.arc(size / 2, size / 2, size / 2 - size * 0.045, 0, Math.PI * 2);
  x.fillStyle = grd;
  x.fill();
  const texto = emoji || (nombre.trim().slice(0, 1).toUpperCase() || '?');
  x.font = emoji
    ? `${Math.round(size * 0.5)}px system-ui`
    : `700 ${Math.round(size * 0.42)}px "Press Start 2P", "Courier New", monospace`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = emoji ? '#000000' : '#ffffff';
  x.fillText(texto, size / 2, size / 2 + size * 0.04);
  x.strokeStyle = color;
  x.lineWidth = size * 0.055;
  x.shadowColor = color;
  x.shadowBlur = size * 0.09;
  x.beginPath();
  x.arc(size / 2, size / 2, size / 2 - size * 0.032, 0, Math.PI * 2);
  x.stroke();
  return c.toDataURL('image/png');
}

/* Retratos de personaje ya generados. `retratoDe` redibuja el sprite y lo
   pasa a data URL, y `avatarFor` se llama en cada repintado del marcador:
   sin memoria, eso sería regenerar la misma imagen decenas de veces. */
const cacheRetratos = new Map();

/**
 * Devuelve el avatar de un perfil.
 *
 * Prioridad: la foto que el jugador haya subido, después su personaje del
 * creador, y como último recurso el disco con su inicial. `modoAvatar` deja
 * que elija explícitamente cuál de los dos primeros manda, porque se pueden
 * tener las dos cosas guardadas a la vez.
 */
export function avatarFor(profile) {
  const quierePersonaje = profile.modoAvatar === 'personaje' || (!profile.avatar && profile.personaje);
  if (quierePersonaje && profile.personaje) {
    const clave = JSON.stringify(profile.personaje) + profile.color;
    if (!cacheRetratos.has(clave)) {
      if (cacheRetratos.size > 24) cacheRetratos.clear();
      cacheRetratos.set(clave, retratoDe(profile.personaje, { acento: profile.color }));
    }
    return cacheRetratos.get(clave);
  }
  return profile.avatar || fallbackAvatar({ emoji: profile.emoji, nombre: profile.name, color: profile.color });
}
