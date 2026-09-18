/**
 * taller.js — el panel de personalización, dentro de la partida.
 *
 * Todo lo que se elige en el billar —la sala, el juego de bolas, la blanca y
 * el taco— vive aquí, en un solo sitio y con nombre. Antes cada cosa era una
 * tecla suelta anunciada en letra pequeña en el pie: quien no leyera esa línea
 * no sabía siquiera que existía la sala Circuito.
 *
 * Se abre sin salir de la mesa y se aplica en caliente, así que se ve el
 * cambio mientras se elige. Lo maneja quien tenga el turno, con sus propias
 * teclas: arriba/abajo cambia de fila, izquierda/derecha de opción, acción
 * cierra. No hace falta ratón ni pausar.
 */

const FILAS = [
  { clave: 'sala', etiqueta: 'Sala', icono: '◧' },
  { clave: 'bolas', etiqueta: 'Bolas', icono: '●' },
  { clave: 'blanca', etiqueta: 'Blanca', icono: '○' },
  { clave: 'taco', etiqueta: 'Taco', icono: '╱' },
  { clave: 'musica', etiqueta: 'Música', icono: '♪' },
];

/**
 * @param {HTMLElement} raiz
 * @param {object} catalogos  { sala: [], bolas: [], blanca: [], taco: [] }
 * @param {function} alCambiar  (clave, opcion) cada vez que se mueve la selección
 */
export function crearTaller(raiz, catalogos, alCambiar) {
  const el = document.createElement('div');
  /* Acoplado al lado y SIN velo que tape la mesa.
     Antes era un modal centrado con desenfoque detrás: elegías a ciegas y solo
     veías el cambio al cerrar, que es justo lo contrario de lo que sirve un
     personalizador. Ahora ocupa una columna estrecha, la mesa se sigue viendo
     entera y cada cambio se aplica delante de ti. */
  el.style.cssText = `
    position:absolute; left:0; top:0; bottom:0; width:330px; z-index:8;
    pointer-events:none; display:flex; align-items:center; padding:0 0 0 14px;
    opacity:0; transform:translateX(-14px);
    transition:opacity .18s, transform .18s; font-family:var(--font-ui, system-ui);`;

  const caja = document.createElement('div');
  caja.style.cssText = `
    width:100%; padding:16px 16px 12px; border-radius:18px;
    background:linear-gradient(180deg,#0e1219e6,#070a10f2);
    border:1px solid #ffffff1f; box-shadow:0 24px 60px -28px #000;
    backdrop-filter:blur(6px); color:#fff;`;
  el.appendChild(caja);
  raiz.appendChild(el);

  const titulo = document.createElement('h3');
  titulo.style.cssText = `
    margin:0 0 16px; font-size:13px; letter-spacing:.16em; text-transform:uppercase;
    opacity:.6; font-weight:700;`;
  titulo.textContent = 'Personalizar · en vivo';
  caja.appendChild(titulo);

  /* Estado: qué opción está elegida en cada fila. */
  const indice = {};
  for (const f of FILAS) indice[f.clave] = 0;
  let fila = 0;
  let abierto = false;

  const nodos = FILAS.map((f, i) => {
    const linea = document.createElement('div');
    linea.style.cssText = `
      display:grid; grid-template-columns:20px 1fr auto; align-items:center; gap:9px;
      padding:8px 10px; border-radius:12px; margin-bottom:4px;
      border:1px solid transparent; transition:background .12s, border-color .12s;`;
    linea.innerHTML = `
      <span data-i style="opacity:.45;font-size:13px;text-align:center"></span>
      <span style="min-width:0">
        <small data-e style="font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;opacity:.45;display:block"></small>
        <b data-n style="font-size:14px;display:block;line-height:1.2"></b>
        <small data-d style="font-size:10.5px;opacity:.5;display:block;line-height:1.3"></small>
      </span>
      <span data-c style="font-size:10px;opacity:.4;font-variant-numeric:tabular-nums"></span>`;
    linea.querySelector('[data-i]').textContent = f.icono;
    linea.querySelector('[data-e]').textContent = f.etiqueta;
    caja.appendChild(linea);
    return linea;
  });

  const pie = document.createElement('p');
  pie.style.cssText = 'margin:10px 2px 0;font-size:10px;opacity:.45;text-align:center;line-height:1.5';
  pie.innerHTML = '↑ ↓ elegir qué · ← → cambiar · <b>acción</b> cerrar';
  caja.appendChild(pie);

  function pintar(color) {
    FILAS.forEach((f, i) => {
      const lista = catalogos[f.clave];
      const op = lista[indice[f.clave]];
      const n = nodos[i];
      n.querySelector('[data-n]').textContent = op.nombre;
      n.querySelector('[data-d]').textContent = op.descripcion || '';
      n.querySelector('[data-c]').textContent = `${indice[f.clave] + 1}/${lista.length}`;
      const activa = i === fila;
      n.style.background = activa ? `${color}22` : 'transparent';
      n.style.borderColor = activa ? `${color}88` : 'transparent';
    });
  }

  return {
    get abierto() { return abierto; },

    abrir(color) {
      abierto = true;
      el.style.opacity = '1';
      el.style.transform = 'translateX(0)';
      pintar(color);
    },
    cerrar() {
      abierto = false;
      el.style.opacity = '0';
      el.style.transform = 'translateX(-14px)';
    },

    /** Selección inicial, para que el panel arranque coincidiendo con la mesa. */
    fijar(clave, id) {
      const i = catalogos[clave].findIndex((o) => o.id === id);
      if (i >= 0) indice[clave] = i;
    },

    /**
     * Un fotograma de navegación. Devuelve true si hay que cerrar.
     * Se le pasan flancos, no teclas mantenidas: en un menú, repetir sesenta
     * veces por segundo es inservible.
     */
    navegar(p, color) {
      let cambio = false;
      if (p.pressed('up')) { fila = (fila + FILAS.length - 1) % FILAS.length; cambio = true; }
      if (p.pressed('down')) { fila = (fila + 1) % FILAS.length; cambio = true; }

      const f = FILAS[fila];
      const lista = catalogos[f.clave];
      if (p.pressed('left')) {
        indice[f.clave] = (indice[f.clave] + lista.length - 1) % lista.length;
        alCambiar(f.clave, lista[indice[f.clave]]);
        cambio = true;
      }
      if (p.pressed('right')) {
        indice[f.clave] = (indice[f.clave] + 1) % lista.length;
        alCambiar(f.clave, lista[indice[f.clave]]);
        cambio = true;
      }
      if (cambio) pintar(color);
      return p.pressed('a') || p.pressed('b');
    },

    destruir() { el.remove(); },
  };
}
