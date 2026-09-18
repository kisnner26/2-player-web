/**
 * preload.js — puente seguro entre la app web y el proceso principal.
 *
 * Se expone únicamente `window.__touchbar__`, con la superficie mínima que
 * necesita core/touchbar.js. No hay acceso a Node, al sistema de archivos ni a
 * nada más: los juegos solo pueden pintar la barra y escuchar sus eventos.
 */

const { contextBridge, ipcRenderer } = require('electron');

let escuchador = null;

ipcRenderer.on('touchbar:evento', (_e, ev) => {
  if (escuchador) escuchador(ev);
});

contextBridge.exposeInMainWorld('__touchbar__', {
  /** @returns {Promise<{hasTouchBar:boolean, model:string, platform:string}>} */
  probe: () => ipcRenderer.invoke('touchbar:probe'),

  /** Define el contenido completo de la barra. */
  setBar: (spec, escapeSpec) => ipcRenderer.send('touchbar:set', spec, escapeSpec ?? null),

  /** Cambia propiedades de items ya existentes, sin reconstruir. */
  update: (patches) => ipcRenderer.send('touchbar:update', patches),

  /** Devuelve la barra al sistema. */
  clear: () => ipcRenderer.send('touchbar:clear'),

  /** Reservado: pulso háptico (ver la nota en main.js). */
  haptic: (tipo) => ipcRenderer.send('touchbar:haptic', tipo),

  setFocus: (on) => ipcRenderer.send('touchbar:focus', on),

  /** Solo puede haber un escuchador: el juego activo. */
  onEvent: (cb) => { escuchador = cb; },
});

/* ---------------- Pantalla completa ----------------
   Va por aquí y no por `requestFullscreen()` a propósito. La pantalla completa
   HTML es una propiedad del DOCUMENTO: al navegar del menú a un juego el
   documento se destruye, el navegador la cancela y Electron encoge la ventana
   detrás. Ése era el «se sale solo al entrar a ciertos juegos».
   La nativa es una propiedad de la VENTANA y sobrevive a cualquier navegación. */
contextBridge.exposeInMainWorld('__ventana__', {
  /** @returns {Promise<boolean>} estado tras alternar */
  alternarCompleta: () => ipcRenderer.invoke('ventana:completa-alternar'),
  /** @returns {Promise<boolean>} */
  estaCompleta: () => ipcRenderer.invoke('ventana:completa-estado'),
  /** Fija la pantalla completa: nada que no sea el usuario podrá quitarla. */
  fijarCompleta: (on) => ipcRenderer.invoke('ventana:completa-fijar', on),
});
