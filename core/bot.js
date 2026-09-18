/**
 * bot.js — el rival de la máquina.
 *
 * Un bot que juega perfecto no es difícil: es insufrible. Lo que hace que
 * competir contra la máquina enganche es que se parezca a un humano, y un
 * humano tiene cuatro defectos que aquí se modelan a propósito:
 *
 *   1. TARDA en reaccionar. Ve la pelota cambiar de dirección y pasa un
 *      instante hasta que mueve. Sin esto, devuelve todo y no hay partido.
 *   2. APUNTA MAL. Un error que se arrastra durante un rato en vez de sortearse
 *      cada fotograma: si el error fuera ruido blanco, el bot temblaría y aun
 *      así acertaría de media. El error tiene que PERSISTIR para fallar.
 *   3. SE DESPISTA. De vez en cuando se queda quieto un momento.
 *   4. NO ES MÁS RÁPIDO QUE TÚ. El tope de velocidad es el mismo que el humano;
 *      un bot que se mueve el doble no es difícil, es tramposo, y se nota.
 *
 * Las tres dificultades no cambian las reglas, solo estos cuatro números. Eso
 * mantiene honesto el marcador: ganarle en «duro» es ganarle al mismo juego.
 */

export const DIFICULTADES = [
  { id: 'facil',  nombre: 'Fácil',  reaccion: 0.34, error: 0.30, despiste: 0.16, tope: 0.82 },
  { id: 'normal', nombre: 'Normal', reaccion: 0.20, error: 0.16, despiste: 0.07, tope: 0.94 },
  { id: 'duro',   nombre: 'Duro',   reaccion: 0.10, error: 0.07, despiste: 0.02, tope: 1.0 },
];

export const dificultadPorId = (id) => DIFICULTADES.find((d) => d.id === id) || DIFICULTADES[1];

/**
 * @param {object} o
 * @param {string} [o.dificultad]  'facil' | 'normal' | 'duro'
 * @param {function} [o.rng]       para partidas reproducibles
 */
export function crearBot({ dificultad = 'normal', rng = Math.random } = {}) {
  const d = dificultadPorId(dificultad);

  /* El objetivo que el bot CREE que hay, que va por detrás del real. */
  let percibido = null;
  let reloj = 0;
  let sesgo = 0;          // error actual, que se renueva despacio
  let sesgoT = 0;
  let despiste = 0;

  return {
    dificultad: d,
    get nombre() { return d.nombre; },

    /**
     * Actualiza la percepción del bot. Llamar una vez por fotograma con el
     * valor real que persigue (una posición, un ángulo, lo que sea).
     * @returns {number} el valor que el bot cree, ya con retraso y error
     */
    percibir(real, dt, { escalaError = 1 } = {}) {
      reloj += dt;
      sesgoT -= dt;
      if (sesgoT <= 0) {
        // Error nuevo cada medio segundo largo. Persiste: es lo que hace que
        // falle de verdad en vez de temblar alrededor del acierto.
        sesgo = (rng() * 2 - 1) * d.error * escalaError;
        sesgoT = 0.45 + rng() * 0.5;
      }
      if (despiste > 0) despiste -= dt;
      else if (rng() < d.despiste * dt) despiste = 0.12 + rng() * 0.3;

      if (percibido === null) percibido = real;
      // Persecución exponencial: el retraso sale del tiempo de reacción, así
      // que un cambio brusco del objetivo tarda en llegarle.
      const k = 1 - Math.exp(-dt / Math.max(0.016, d.reaccion));
      percibido += (real - percibido) * k;
      return percibido + sesgo;
    },

    /** ¿Está despistado ahora mismo? Mientras lo esté, no debería moverse. */
    get distraido() { return despiste > 0; },

    /**
     * Dirección en la que moverse para alcanzar un objetivo en un eje.
     * @returns {number} −1, 0 o 1, ya multiplicado por el tope de velocidad
     */
    mover(actual, objetivo, { zonaMuerta = 0.02 } = {}) {
      if (despiste > 0) return 0;
      const dif = objetivo - actual;
      if (Math.abs(dif) < zonaMuerta) return 0;
      return Math.sign(dif) * d.tope;
    },

    /** Decide un sí/no con la probabilidad dada, ponderada por dificultad. */
    decide(prob) { return rng() < prob * (0.6 + d.tope * 0.5); },

    /** Reinicia la percepción: úsalo entre puntos o rondas. */
    reiniciar() { percibido = null; sesgo = 0; sesgoT = 0; despiste = 0; },
  };
}

/**
 * Selector de dificultad para el HUD.
 * Los juegos contra bot lo enseñan al empezar; sin poder elegir, la mitad
 * abandona en el primer minuto y la otra mitad se aburre.
 */
export function selectorDificultad(raiz, alElegir, { color = '#00e5ff' } = {}) {
  const caja = document.createElement('div');
  caja.style.cssText = `
    position:absolute; inset:0; z-index:9; display:flex;
    align-items:center; justify-content:center; flex-direction:column; gap:18px;
    background:rgba(4,6,12,0.82); font-family:var(--font-ui,system-ui); color:#fff;`;
  caja.innerHTML = `
    <p style="margin:0;font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.55">
      Contra la máquina
    </p>
    <div style="display:flex;gap:12px"></div>
    <p style="margin:0;font-size:11.5px;opacity:.45">← → elegir · acción empezar</p>`;

  const fila = caja.querySelector('div');
  let i = 1;
  const botones = DIFICULTADES.map((d, k) => {
    const b = document.createElement('button');
    b.textContent = d.nombre;
    b.style.cssText = `
      padding:13px 26px; border-radius:999px; font-size:15px; font-weight:600;
      border:2px solid #ffffff26; background:#ffffff10; color:#fff; cursor:pointer;`;
    b.addEventListener('click', () => { i = k; pintar(); elegir(); });
    fila.appendChild(b);
    return b;
  });

  function pintar() {
    botones.forEach((b, k) => {
      const on = k === i;
      b.style.borderColor = on ? color : '#ffffff26';
      b.style.background = on ? `${color}2e` : '#ffffff10';
      b.style.transform = on ? 'scale(1.06)' : 'none';
    });
  }
  function elegir() { caja.remove(); alElegir(DIFICULTADES[i].id); }

  pintar();
  raiz.appendChild(caja);

  return {
    /** Un fotograma de navegación con las teclas del jugador 1. */
    navegar(p) {
      if (p.pressed('left')) { i = (i + DIFICULTADES.length - 1) % DIFICULTADES.length; pintar(); }
      if (p.pressed('right')) { i = (i + 1) % DIFICULTADES.length; pintar(); }
      if (p.pressed('a') || p.pressed('b')) elegir();
    },
    get vivo() { return !!caja.parentNode; },
    destruir() { caja.remove(); },
  };
}
