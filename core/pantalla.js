/**
 * pantalla.js — pantalla completa, por el camino que toque en cada sitio.
 *
 * En el navegador solo existe la pantalla completa HTML, que es una propiedad
 * del DOCUMENTO. En Electron eso es una trampa: al navegar del menú a un juego
 * el documento muere, el navegador cancela la pantalla completa y la ventana
 * se encoge sola a mitad de partida. Por eso, cuando hay puente nativo, se usa
 * la pantalla completa de la VENTANA, que sobrevive a cualquier navegación y
 * solo la quita quien la pidió.
 *
 * Un único módulo para los dos sitios que la usaban —el menú y el shell— para
 * que no vuelvan a divergir.
 */

const puente = () => (typeof window !== 'undefined' ? window.__ventana__ : null);

export const pantalla = {
  /** ¿Hay pantalla completa nativa disponible? */
  get nativa() { return !!puente(); },

  /** @returns {Promise<boolean>} estado después de alternar */
  async alternar() {
    const p = puente();
    if (p) return p.alternarCompleta();
    if (document.fullscreenElement) { await document.exitFullscreen(); return false; }
    await document.documentElement.requestFullscreen?.();
    return true;
  },

  async estado() {
    const p = puente();
    if (p) return p.estaCompleta();
    return !!document.fullscreenElement;
  },

  /**
   * Deja la pantalla completa clavada: ni una navegación ni un juego que pida
   * pantalla completa HTML podrán quitarla. Solo existe en Electron.
   */
  async fijar(on) {
    const p = puente();
    return p ? p.fijarCompleta(on) : false;
  },
};
