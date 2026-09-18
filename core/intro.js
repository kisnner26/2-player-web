/**
 * intro.js — la cortinilla que se ve antes de cada partida.
 *
 * No es decoración gratuita: entre pulsar JUGAR y ver el primer fotograma hay
 * un salto de página y la carga del módulo del juego, y sin nada que mirar ese
 * hueco se siente como un tirón. La cortinilla ocupa ese tiempo, presenta el
 * juego y da a los dos jugadores un par de segundos para colocar las manos.
 *
 * Se dibuja en canvas y no en DOM porque reutiliza la misma escena del hub
 * (core/scenes.js): el retrato que estabas mirando en el catálogo se abre y
 * se convierte en la partida, así que la transición se lee como continua.
 *
 * Dura poco a propósito. Una animación bonita que se ve ochenta veces deja de
 * ser bonita: se puede saltar con cualquier tecla y nunca bloquea más de dos
 * segundos y medio.
 */

import { sceneFor } from './scenes.js';
import { seeded } from './math2d.js';

const DURACION = 2300;         // ms de la cortinilla completa
const SALTABLE_DESDE = 350;    // ms antes de que una tecla pueda saltarla

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function aleatorioEstable(semilla) {
  const cache = new Map();
  return (i) => {
    const k = Math.round(i);
    if (!cache.has(k)) cache.set(k, seeded(semilla + k * 2654435761)());
    return cache.get(k);
  };
}

/** Suavizado de entrada y salida, para que nada empiece ni pare en seco. */
const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const salida = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Reproduce la cortinilla sobre `contenedor`.
 *
 * @param {HTMLElement} contenedor
 * @param {object} juego     entrada del manifiesto (nombre, categoría, id…)
 * @param {Array}  players   perfiles, para teñirla con sus colores
 * @param {string} colorCat  color de la categoría
 * @returns {Promise<void>}  se resuelve cuando termina o alguien la salta
 */
export function reproducirIntro(contenedor, juego, players, colorCat) {
  return new Promise((resolver) => {
    const capa = document.createElement('div');
    capa.className = 'intro';
    const lienzo = document.createElement('canvas');
    capa.appendChild(lienzo);

    // El título va en DOM y no en canvas: así hereda la tipografía del
    // sistema de diseño y se lee nítido en cualquier densidad de pantalla.
    const texto = document.createElement('div');
    texto.className = 'intro-texto';
    texto.innerHTML = `
      <span class="intro-cat"></span>
      <h1 class="intro-titulo"></h1>
      <span class="intro-linea"></span>`;
    texto.querySelector('.intro-cat').textContent = juego.categoriaNombre || '';
    texto.querySelector('.intro-titulo').textContent = juego.nombre || '';
    capa.appendChild(texto);
    capa.style.setProperty('--cc', colorCat);
    contenedor.appendChild(capa);

    const escena = sceneFor(juego);
    const r = aleatorioEstable(hash(juego.id));
    const g = lienzo.getContext('2d');
    let w = 0, h = 0;

    function medir() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = capa.clientWidth;
      h = capa.clientHeight;
      lienzo.width = Math.round(w * dpr);
      lienzo.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    medir();
    window.addEventListener('resize', medir);

    let inicio = 0;
    let raf = 0;
    let cerrado = false;

    function cerrar() {
      if (cerrado) return;
      cerrado = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', medir);
      window.removeEventListener('keydown', alPulsar, true);
      capa.classList.add('fuera');
      // Se espera al fundido de salida para no cortar la animación en seco.
      setTimeout(() => { capa.remove(); resolver(); }, 260);
    }

    function alPulsar() {
      if (performance.now() - inicio > SALTABLE_DESDE) cerrar();
    }
    window.addEventListener('keydown', alPulsar, true);

    function fotograma(ahora) {
      if (!inicio) inicio = ahora;
      const t = Math.min(1, (ahora - inicio) / DURACION);
      raf = requestAnimationFrame(fotograma);

      g.clearRect(0, 0, w, h);

      /* Fondo: el color de la categoría entrando desde el centro. */
      const radio = suave(Math.min(1, t * 2.2)) * Math.hypot(w, h) * 0.62;
      const halo = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(1, radio));
      halo.addColorStop(0, colorCat + '2e');
      halo.addColorStop(0.7, colorCat + '10');
      halo.addColorStop(1, '#00000000');
      g.fillStyle = halo;
      g.fillRect(0, 0, w, h);

      /* La escena del juego, apareciendo dentro de una banda que se abre.
         Es el mismo dibujo que la ficha del catálogo: da continuidad. */
      const apertura = suave(Math.min(1, Math.max(0, (t - 0.1) / 0.45)));
      const bandaH = h * 0.52 * apertura;
      if (bandaH > 2) {
        g.save();
        g.beginPath();
        g.rect(0, h / 2 - bandaH / 2, w, bandaH);
        g.clip();
        const S = {
          t: (ahora - inicio) / 1000,
          cat: colorCat,
          a: players[0].color,
          b: players[1].color,
          r,
          estetica: juego.estetica,
          tinta: juego.estetica === 'papel' ? '#2b2118' : '#ffffff',
        };
        // La escena se dibuja a una proporción fija y centrada, igual que en
        // el escenario del hub, para que no se estire en pantallas anchas.
        const ew = Math.min(w, h * 1.9);
        g.save();
        g.translate((w - ew) / 2, 0);
        try { escena(g, ew, h, S); } catch { /* nunca debe romper la entrada */ }
        g.restore();
        // Velo para que el título de encima se lea sobre cualquier escena.
        g.fillStyle = `rgba(6,6,12,${0.45 + (1 - apertura) * 0.3})`;
        g.fillRect(0, h / 2 - bandaH / 2, w, bandaH);
        g.restore();

        // Filos de la banda, en el color de la categoría.
        g.fillStyle = colorCat;
        g.globalAlpha = 0.9;
        g.fillRect(0, h / 2 - bandaH / 2, w, 2);
        g.fillRect(0, h / 2 + bandaH / 2 - 2, w, 2);
        g.globalAlpha = 1;
      }

      /* Barrido final: la banda crece y se come la pantalla al salir. */
      if (t > 0.82) {
        const cierre = salida((t - 0.82) / 0.18);
        g.fillStyle = '#06060c';
        g.globalAlpha = cierre;
        g.fillRect(0, 0, w, h);
        g.globalAlpha = 1;
      }

      if (t >= 1) cerrar();
    }
    raf = requestAnimationFrame(fotograma);
  });
}
