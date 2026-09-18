/**
 * consola.js — piel «Consola»: las partes que no se pueden hacer solo con CSS.
 *
 * El aspecto vive entero en core/consola.css; aquí solo están las tres cosas que
 * necesitan JavaScript:
 *
 *   1. El reloj de la barra superior, que es media identidad del menú HOME.
 *   2. La barra inferior que imita la pantalla del GamePad. Las acciones del
 *      catálogo (Mandos, Torneo, Al azar…) se MUEVEN ahí, que es donde una
 *      Consola las pone. Se mueven los mismos nodos, así que los listeners que
 *      enlazó hub.js siguen funcionando: no hay que tocar nada de hub.js.
 *   3. Los sonidos de interfaz. En vez de sembrar `if (skin)` por las mil
 *      seiscientas líneas del hub, la piel sustituye los métodos de UI del bus
 *      de audio (blip / select / back / tick) mientras está activa y guarda los
 *      originales para devolverlos al apagarla. Un cambio, reversible.
 *
 * La piel se aplica ANTES de que cargue este módulo, con una línea en el
 * <head> de index.html y play.html: si esperásemos al módulo se vería el
 * neón oscuro un instante antes de volverse blanco.
 */

import { updateSettings } from './storage.js';
import { audio } from './audio.js';

const RAIZ = document.documentElement;

/* ---------------- Sonidos ----------------
   El menú de consola no suena a recreativa: son senos limpios, cortos y
   suaves, sin el cuadrado chiptune del resto del proyecto. */

const SONIDOS = {
  /* Mover el foco de una loseta a otra: un toque agudo y seco. */
  blip() {
    audio.tone({ freq: 1180, dur: 0.05, gain: 0.09, type: 'sine' });
    audio.tone({ freq: 1760, dur: 0.035, gain: 0.045, type: 'sine', delay: 0.008 });
  },
  /* Abrir algo o entrar en un juego: dos notas que suben. */
  select() {
    audio.tone({ freq: 880, dur: 0.09, gain: 0.11, type: 'sine' });
    audio.tone({ freq: 1318, dur: 0.16, gain: 0.10, type: 'sine', delay: 0.055 });
    audio.noise({ dur: 0.05, gain: 0.03, filter: 4200, type: 'highpass' });
  },
  /* Cerrar o volver: las mismas dos notas, al revés. */
  back() {
    audio.tone({ freq: 784, dur: 0.09, gain: 0.10, type: 'sine' });
    audio.tone({ freq: 523, dur: 0.16, gain: 0.09, type: 'sine', delay: 0.055 });
  },
  tick() {
    audio.tone({ freq: 2093, dur: 0.02, gain: 0.05, type: 'sine' });
  },
};

/* Los originales viven en el prototipo de AudioBus, así que basta con poner
   —o quitar— una propiedad propia en la instancia para taparlos o destaparlos.
   No hace falta guardar copias de nada. */
function aplicarSonidos(activar) {
  for (const nombre of Object.keys(SONIDOS)) {
    if (activar) audio[nombre] = SONIDOS[nombre];
    else delete audio[nombre];
  }
}

/* ---------------- Reloj ---------------- */

function montarReloj(cabecera) {
  const caja = document.createElement('div');
  caja.className = 'cn-reloj';
  caja.innerHTML = '<span class="cn-fecha"></span><span class="cn-hora"></span>';
  cabecera.appendChild(caja);

  const fecha = caja.querySelector('.cn-fecha');
  const hora = caja.querySelector('.cn-hora');

  function pintar() {
    const d = new Date();
    fecha.textContent = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    hora.textContent = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
  pintar();
  // Se engancha al cambio de minuto en vez de sondear cada segundo.
  setTimeout(function alMinuto() {
    pintar();
    setInterval(pintar, 60000);
  }, (60 - new Date().getSeconds()) * 1000);

  return caja;
}

/* ---------------- Barra del GamePad ---------------- */

function montarGamePad() {
  const barra = document.createElement('footer');
  barra.className = 'cn-barra-mando';
  barra.innerHTML = `
    <div class="cn-mando-icono" aria-hidden="true"><i></i><b></b></div>
    <div class="cn-mando-texto">
      <span class="cn-mando-sub">En la pantalla</span>
      <span class="cn-mando-titulo"></span>
    </div>`;

  // Las acciones del catálogo bajan aquí: mismos nodos, mismos listeners.
  const acciones = document.querySelector('.hub-acciones');
  if (acciones) barra.appendChild(acciones);

  document.body.appendChild(barra);

  /* La pantallita del GamePad refleja el juego que está en el escenario, igual
     que el mando de una consola refleja lo que hay en la tele. Se sigue con un
     observador del título en vez de llamar a hub.js: la piel no necesita saber
     cómo funciona el catálogo, solo mirar lo que ya está pintado. */
  const titulo = barra.querySelector('.cn-mando-titulo');
  const origen = document.getElementById('esc-titulo');
  if (origen) {
    const refrescar = () => { titulo.textContent = origen.textContent.trim(); };
    refrescar();
    new MutationObserver(refrescar).observe(origen, { childList: true, characterData: true, subtree: true });
  }
  return barra;
}

/* ---------------- Montaje ---------------- */

let montado = false;

function montarChrome() {
  if (montado || !document.body.classList.contains('hub')) return;
  const cabecera = document.querySelector('.hub-top');
  if (!cabecera) return;
  montado = true;
  montarReloj(cabecera);
  montarGamePad();
}

export const consola = {
  get activa() { return RAIZ.dataset.skin === 'consola'; },

  /** Nombre viejo de esta piel, aceptado al leer ajustes guardados. */
  get alias() { return ['consola', 'wiiu']; },

  /**
   * Enciende o apaga la piel. Cambiarla en caliente obligaría a repintar el
   * catálogo entero (las losetas cambian de proporción y los retratos se miden
   * al montarse), así que se guarda y se recarga: es instantáneo y no deja
   * medio menú con la piel vieja.
   */
  alternar() {
    const nueva = this.activa ? 'arcade' : 'consola';
    updateSettings({ skin: nueva });
    location.reload();
  },
};

/* Arranque: el atributo ya lo puso el <head>; aquí van los sonidos y, si
   estamos en el menú, el chrome. */
aplicarSonidos(consola.activa);
if (consola.activa) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarChrome);
  else montarChrome();
}
