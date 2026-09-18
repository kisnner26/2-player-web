/**
 * main.js — proceso principal de Electron.
 *
 * Este envoltorio existe por una sola razón: la Touch Bar no tiene ninguna API
 * web. Ningún navegador puede dibujarla ni leerla. Electron sí expone la API
 * nativa `TouchBar`, así que la app web se carga aquí dentro y el proceso
 * principal traduce las descripciones declarativas que le manda el juego a
 * objetos TouchBarButton / TouchBarSlider / etc. reales.
 *
 * Todo lo demás (los 212 juegos de teclado) funciona igual en un navegador
 * normal; este contenedor solo añade los 20 exclusivos.
 */

const { app, BrowserWindow, TouchBar, ipcMain, shell } = require('electron');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Nombre visible en el menú, el Dock y el conmutador de apps (Cmd+Tab).
// Hay que fijarlo antes de app.whenReady(): si no, en modo desarrollo
// (electron . sin empaquetar) todo el sistema muestra el genérico "Electron".
app.setName('2 Player Arcade');

const {
  TouchBarButton, TouchBarLabel, TouchBarSlider, TouchBarSpacer,
  TouchBarSegmentedControl, TouchBarScrubber, TouchBarColorPicker,
  TouchBarPopover, TouchBarGroup,
} = TouchBar;

/**
 * Identificadores de hardware con Touch Bar.
 * No existe una API que lo pregunte directamente, así que se compara el modelo
 * con la lista conocida. Las MacBook Pro de 2021 en adelante (MacBookPro18,x)
 * volvieron a las teclas de función y quedan fuera a propósito.
 */
const MODELOS_CON_TOUCHBAR = [
  'MacBookPro13,2', 'MacBookPro13,3',
  'MacBookPro14,2', 'MacBookPro14,3',
  'MacBookPro15,1', 'MacBookPro15,2', 'MacBookPro15,3', 'MacBookPro15,4',
  'MacBookPro16,1', 'MacBookPro16,2', 'MacBookPro16,3', 'MacBookPro16,4',
  'MacBookPro17,1',   // MacBook Pro 13" M1 (2020)
  'Mac14,7',          // MacBook Pro 13" M2 (2022)
];

let ventana = null;
let itemsPorId = new Map();
let modelo = '';

function detectarModelo() {
  if (modelo) return modelo;
  try {
    modelo = execFileSync('sysctl', ['-n', 'hw.model'], { encoding: 'utf8' }).trim();
  } catch {
    modelo = 'desconocido';
  }
  return modelo;
}

function tieneTouchBar() {
  if (process.platform !== 'darwin') return false;
  // Permite forzar la detección para desarrollo o para modelos futuros.
  if (process.env.FORZAR_TOUCHBAR === '1') return true;
  return MODELOS_CON_TOUCHBAR.includes(detectarModelo());
}

/* ---------------- Construcción de la barra ---------------- */

function emitir(id, tipo, valor) {
  if (!ventana || ventana.isDestroyed()) return;
  ventana.webContents.send('touchbar:evento', { id, type: tipo, value: valor });
}

/**
 * Traduce un item declarativo a su equivalente nativo.
 * Los ids se guardan en `itemsPorId` para poder actualizarlos después sin
 * reconstruir la barra entera (reconstruirla parpadea y es lenta).
 */
function construirItem(spec) {
  const { id, type } = spec;
  let item;

  switch (type) {
    case 'label':
      item = new TouchBarLabel({
        label: spec.label ?? '',
        textColor: spec.color || undefined,
      });
      break;

    case 'slider':
      item = new TouchBarSlider({
        label: spec.label ?? '',
        value: spec.value ?? 0,
        minValue: spec.min ?? 0,
        maxValue: spec.max ?? 100,
        change: (v) => emitir(id, 'change', v),
      });
      break;

    case 'segment':
      item = new TouchBarSegmentedControl({
        segmentStyle: spec.estilo || 'automatic',
        mode: spec.mode || 'single',
        segments: (spec.segments || []).map((s) =>
          typeof s === 'string' ? { label: s } : s),
        selectedIndex: spec.selected ?? 0,
        change: (i) => emitir(id, 'select', i),
      });
      break;

    case 'scrubber':
      item = new TouchBarScrubber({
        items: (spec.items || []).map((s) => (typeof s === 'string' ? { label: s } : s)),
        selectedStyle: spec.selectedStyle || 'outline',
        overlayStyle: spec.overlayStyle || 'none',
        continuous: spec.continuous !== false,
        mode: spec.scrollMode || 'free',
        showArrowButtons: !!spec.arrows,
        select: (i) => emitir(id, 'select', i),
        highlight: (i) => emitir(id, 'highlight', i),
      });
      break;

    case 'color':
      item = new TouchBarColorPicker({
        availableColors: spec.colors || undefined,
        selectedColor: spec.selected || undefined,
        change: (c) => emitir(id, 'change', c),
      });
      break;

    case 'spacer':
      item = new TouchBarSpacer({ size: spec.size || 'small' });
      break;

    case 'popover':
      item = new TouchBarPopover({
        label: spec.label ?? '',
        icon: undefined,
        showCloseButton: spec.showCloseButton !== false,
        items: new TouchBar({ items: (spec.items || []).map(construirItem) }),
      });
      break;

    case 'group':
      item = new TouchBarGroup({
        items: new TouchBar({ items: (spec.items || []).map(construirItem) }),
      });
      break;

    case 'button':
    default:
      item = new TouchBarButton({
        label: spec.label ?? ' ',
        backgroundColor: spec.bg || undefined,
        // Electron ignora `enabled` en TouchBarButton, así que un botón
        // desactivado se representa apagándolo visualmente y filtrando el
        // clic en el propio juego.
        click: () => { if (spec.enabled !== false) emitir(id, 'click'); },
      });
      break;
  }

  item.__id = id;
  itemsPorId.set(id, item);
  return item;
}

function aplicarBarra(spec, escapeSpec) {
  if (!ventana || ventana.isDestroyed()) return;
  itemsPorId = new Map();
  const items = (spec || []).map(construirItem);
  const barra = new TouchBar({
    items,
    escapeItem: escapeSpec ? construirItem(escapeSpec) : null,
  });
  ventana.setTouchBar(barra);
}

/**
 * Actualiza propiedades de items existentes. Las propiedades de TouchBar en
 * Electron son reactivas: asignarlas refresca la barra al instante.
 */
function actualizarItems(patches) {
  for (const p of patches || []) {
    const item = itemsPorId.get(p.id);
    if (!item) continue;
    if (p.label !== undefined && 'label' in item) item.label = String(p.label);
    if (p.bg !== undefined && 'backgroundColor' in item) item.backgroundColor = p.bg;
    if (p.color !== undefined && 'textColor' in item) item.textColor = p.color;
    if (p.value !== undefined && 'value' in item) item.value = p.value;
    if (p.selected !== undefined && 'selectedIndex' in item) item.selectedIndex = p.selected;
    if (p.segments !== undefined && 'segments' in item) {
      item.segments = p.segments.map((s) => (typeof s === 'string' ? { label: s } : s));
    }
    if (p.items !== undefined && 'items' in item) {
      item.items = p.items.map((s) => (typeof s === 'string' ? { label: s } : s));
    }
  }
}

/* ---------------- IPC ---------------- */

ipcMain.handle('touchbar:probe', () => ({
  hasTouchBar: tieneTouchBar(),
  model: detectarModelo(),
  platform: process.platform,
}));

ipcMain.on('touchbar:set', (_e, spec, escapeSpec) => aplicarBarra(spec, escapeSpec));
ipcMain.on('touchbar:update', (_e, patches) => actualizarItems(patches));
ipcMain.on('touchbar:clear', () => {
  itemsPorId = new Map();
  if (ventana && !ventana.isDestroyed()) ventana.setTouchBar(null);
});

/**
 * Pulso háptico. Electron no expone NSHapticFeedbackManager, y la Touch Bar
 * en sí no vibra: el motor táptil está en el trackpad. Se deja el canal
 * abierto para no cambiar la API del cliente, pero hoy no hace nada.
 * La vibración real del juego la produce la capa sónica de core/haptics.js.
 */
ipcMain.on('touchbar:haptic', () => {});

ipcMain.on('touchbar:focus', () => {});

/* ---------------- Ventana ---------------- */

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#06060c',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Los juegos son locales; no hace falta acceso a nada remoto.
      sandbox: false,
    },
  });

  ventana.loadFile(path.join(__dirname, '..', 'index.html'));

  /* ---------------- Pantalla completa que no se cae sola ----------------

     El problema: la app pedía pantalla completa con `requestFullscreen()`, que
     es pantalla completa HTML — una propiedad del DOCUMENTO. Al pasar del menú
     a un juego hay una navegación de verdad, el documento muere, el navegador
     cancela su pantalla completa y Electron devuelve la ventana a 1280×820.
     De ahí que «al entrar a ciertos juegos se salga y se haga ventana».

     La solución tiene dos mitades:
       1. El renderizador ahora pide la pantalla completa NATIVA por IPC (ver
          preload.js). Ésa es de la ventana y le da igual lo que pase con el
          documento.
       2. Y por si algo dentro de una página sigue pidiendo pantalla completa
          HTML —un vídeo, un juego, una librería—, al terminar ésta se vuelve a
          poner la nativa. Así lo único que la quita es el usuario. */
  let completaFijada = false;
  let restaurando = false;

  const reafirmar = () => {
    if (!completaFijada || restaurando || !ventana || ventana.isDestroyed()) return;
    if (ventana.isFullScreen()) return;
    restaurando = true;
    // En el siguiente turno: durante el propio evento, macOS aún está a mitad
    // de la transición y volver a entrar ahí deja la ventana en un estado raro.
    setTimeout(() => {
      restaurando = false;
      if (completaFijada && ventana && !ventana.isDestroyed() && !ventana.isFullScreen()) {
        ventana.setFullScreen(true);
      }
    }, 90);
  };

  ventana.webContents.on('leave-html-full-screen', reafirmar);
  ventana.on('leave-full-screen', reafirmar);
  // Si el usuario entra a lo bruto (botón verde, Cmd+Ctrl+F), se toma como que
  // quiere quedarse: es él pidiéndolo, que es justo la excepción que valía.
  ventana.on('enter-full-screen', () => { completaFijada = true; });

  ipcMain.handle('ventana:completa-alternar', () => {
    const nuevo = !ventana.isFullScreen();
    completaFijada = nuevo;        // salir a mano SÍ desfija: lo ha pedido él
    ventana.setFullScreen(nuevo);
    return nuevo;
  });
  ipcMain.handle('ventana:completa-estado', () => ventana.isFullScreen());
  ipcMain.handle('ventana:completa-fijar', (_e, on) => {
    completaFijada = !!on;
    if (on && !ventana.isFullScreen()) ventana.setFullScreen(true);
    return completaFijada;
  });

  // Los enlaces externos se abren en el navegador, no dentro del juego.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  ventana.on('closed', () => { ventana = null; });
}

app.whenReady().then(() => {
  crearVentana();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });

  /* Los recuentos se leen del manifiesto en vez de escribirse aquí: los tenía
     a mano y llevaban 288 juegos de retraso. Se saca contando `id:` y
     `touchbar: true` con una expresión regular, que es más burdo que importar
     el módulo pero no obliga a meter un módulo ES en el proceso principal. */
  const { teclado, touchbar } = contarJuegos();
  if (!tieneTouchBar()) {
    console.log(
      `\n[2 Player Arcade] Sin Touch Bar detectada (modelo: ${detectarModelo()}).\n` +
      `Los ${teclado} juegos de teclado funcionan igual; los ${touchbar} exclusivos quedan ocultos.\n` +
      `Para forzarlos en pruebas: FORZAR_TOUCHBAR=1 npm start\n`
    );
  } else {
    console.log(`\n[2 Player Arcade] Touch Bar detectada en ${detectarModelo()}. Los ${teclado + touchbar} juegos disponibles.\n`);
  }
});

/**
 * Cuenta los juegos leyendo el manifiesto.
 *
 * Los desafíos generados NO están escritos ahí —se crean al cargar
 * `games/generados/lista.js`— así que se suma su `CUANTOS`. Si algún día
 * cambia el mecanismo, esto cuenta de menos y nunca de más, que es el lado
 * bueno por el que fallar en un mensaje de arranque.
 */
function contarJuegos() {
  try {
    const fs = require('node:fs');
    const raiz = path.join(__dirname, '..', 'games');
    const man = fs.readFileSync(path.join(raiz, 'manifest.js'), 'utf8');
    const total = (man.match(/\bid: '/g) || []).length;
    const touchbar = (man.match(/touchbar: true/g) || []).length;
    const lista = fs.readFileSync(path.join(raiz, 'generados', 'lista.js'), 'utf8');
    const gen = Number((lista.match(/CUANTOS = (\d+)/) || [])[1] || 0);
    return { teclado: total - touchbar + gen, touchbar };
  } catch {
    return { teclado: 0, touchbar: 0 };
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
