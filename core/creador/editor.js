/**
 * editor.js — la interfaz para hacer juegos.
 *
 * Tres columnas: la paleta de piezas a la izquierda, la arena en el centro y
 * el inspector a la derecha. Es la disposición de casi
 * cualquier editor de niveles, y lo es por una razón: lo que colocas, dónde lo
 * colocas y cómo es, en ese orden y sin cambiar de pantalla.
 *
 * Ni la paleta ni el inspector tienen nada escrito a mano: se construyen
 * recorriendo los catálogos de `piezas.js` y `reglas.js`, que declaran sus
 * propiedades con su tipo de control. Añadir una pieza nueva son diez líneas
 * allí y CERO aquí. Ésa era toda la apuesta al separar los catálogos.
 *
 * Probar no simula nada: guarda y abre `play.html`, así que lo que pruebas es
 * literalmente el juego final, con su cuenta atrás, su pausa y su marcador.
 */

import { normalizar, revisar, ARENA, nuevoId } from './formato.js';
import { PIEZAS, FAMILIAS, listaPiezas, crearPieza } from './piezas.js';
import { DISPARADORES, ACCIONES } from './reglas.js';
import * as bib from './biblioteca.js';

const REJA = 20;                      // el imán al colocar
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {HTMLElement} raiz    dónde montarlo (normalmente document.body)
 * @param {object} opciones     { receta, alCerrar }
 */
export function abrirEditor(raiz, { receta = null, alCerrar = () => {} } = {}) {
  let r = normalizar(receta || {
    nombre: 'Mi juego', descripcion: '',
    piezas: [{ ...crearPieza('jugador', 200, 350), id: nuevoId(), props: { slot: 0, velocidad: 300, personaje: true, dispara: false } }],
    ajustes: { duracion: 60 },
  });
  let herramienta = 'muro';           // pieza que se coloca al hacer clic
  let sel = null;                     // pieza seleccionada
  let arrastrando = null;

  /* ---------------- Andamio ---------------- */

  const capa = document.createElement('div');
  capa.className = 'ed-capa';
  capa.innerHTML = `
    <div class="ed-top">
      <input class="ed-nombre" value="${esc(r.nombre)}" maxlength="40" aria-label="Nombre del juego">
      <div class="ed-avisos"></div>
      <div class="ed-acciones">
        <button class="btn small" data-act="importar">Importar</button>
        <button class="btn small" data-act="exportar">Exportar</button>
        <button class="btn small primary" data-act="probar">▶ Probar</button>
        <button class="btn small" data-act="cerrar">Cerrar</button>
      </div>
    </div>
    <div class="ed-cuerpo">
      <aside class="ed-paleta"></aside>
      <div class="ed-lienzo"><canvas></canvas><p class="ed-pista"></p></div>
      <aside class="ed-inspector"></aside>
    </div>
    <input type="file" accept=".2pa,application/json" hidden>`;
  raiz.appendChild(capa);

  const cv = capa.querySelector('canvas');
  const g = cv.getContext('2d');
  const elPaleta = capa.querySelector('.ed-paleta');
  const elInsp = capa.querySelector('.ed-inspector');
  const elAvisos = capa.querySelector('.ed-avisos');
  const elPista = capa.querySelector('.ed-pista');
  const elArchivo = capa.querySelector('input[type=file]');

  /* ---------------- Paleta ---------------- */

  function pintarPaleta() {
    const porFamilia = {};
    for (const p of listaPiezas()) (porFamilia[p.familia] ||= []).push(p);
    elPaleta.innerHTML = `<h3>Piezas</h3>` + Object.entries(porFamilia).map(([fam, lista]) => `
      <div class="ed-fam">
        <span style="color:${FAMILIAS[fam]?.color}">${esc(FAMILIAS[fam]?.nombre || fam)}</span>
        <div class="ed-fam-grid">
          ${lista.map((p) => `
            <button class="ed-pieza ${p.id === herramienta ? 'on' : ''}" data-pieza="${p.id}"
                    title="${esc(p.descripcion)}">
              <i style="background:${p.color || 'var(--p1)'}"></i>${esc(p.nombre)}
            </button>`).join('')}
        </div>
      </div>`).join('')
      + `<h3>Arena</h3><div class="ed-arena-cfg"></div>`;

    elPaleta.querySelectorAll('[data-pieza]').forEach((b) => {
      b.addEventListener('click', () => { herramienta = b.dataset.pieza; pintarPaleta(); });
    });
    pintarConfigArena();
  }

  function pintarConfigArena() {
    const cont = elPaleta.querySelector('.ed-arena-cfg');
    if (!cont) return;
    cont.innerHTML = `
      ${campoNum('Duración (s, 0 = sin límite)', r.ajustes.duracion, 0, 600, 5, 'dur')}
      ${campoNum('Ganar con N puntos (0 = no)', r.ajustes.paraGanar, 0, 200, 1, 'pts')}
      ${campoNum('Vidas (0 = infinitas)', r.ajustes.vidas, 0, 9, 1, 'vid')}
      ${campoNum('Rozamiento del suelo', r.arena.friccion, 0, 8, 0.2, 'fric')}
      <label class="ed-check"><input type="checkbox" data-cfg="muros" ${r.arena.muros ? 'checked' : ''}> Bordes sólidos</label>
      <label class="ed-check"><input type="checkbox" data-cfg="reja" ${r.arena.reja ? 'checked' : ''}> Ver la rejilla</label>`;
    cont.querySelectorAll('input[type=number]').forEach((i) => {
      i.addEventListener('input', () => {
        const v = Number(i.value);
        if (i.dataset.k === 'dur') r.ajustes.duracion = v;
        if (i.dataset.k === 'pts') r.ajustes.paraGanar = v;
        if (i.dataset.k === 'vid') r.ajustes.vidas = v;
        if (i.dataset.k === 'fric') r.arena.friccion = v;
        validar();
      });
    });
    cont.querySelectorAll('[data-cfg]').forEach((i) => {
      i.addEventListener('change', () => { r.arena[i.dataset.cfg] = i.checked; dibujar(); });
    });
  }

  const campoNum = (etiqueta, valor, min, max, paso, k) => `
    <label class="ed-campo"><span>${esc(etiqueta)}</span>
      <input type="number" value="${valor}" min="${min}" max="${max}" step="${paso}" data-k="${k}">
    </label>`;

  /* ---------------- Inspector ----------------
     Se genera a partir de `props` del catálogo: cada propiedad dice su
     control, así que esto no sabe qué es una cinta ni un generador. */

  function control(clave, meta, valor, prefijo) {
    const id = `${prefijo}:${clave}`;
    switch (meta.control) {
      case 'numero':
        return `<label class="ed-campo"><span>${esc(meta.nombre)}</span>
          <input type="number" data-prop="${id}" value="${valor ?? meta.def}"
                 min="${meta.min}" max="${meta.max}" step="${meta.paso ?? 1}"></label>`;
      case 'opcion':
        return `<label class="ed-campo"><span>${esc(meta.nombre)}</span>
          <select data-prop="${id}">${meta.opciones.map((o) =>
            `<option value="${o.v}" ${String(o.v) === String(valor ?? meta.def) ? 'selected' : ''}>${esc(o.n)}</option>`).join('')}
          </select></label>`;
      case 'interruptor':
        return `<label class="ed-check"><input type="checkbox" data-prop="${id}"
          ${(valor ?? meta.def) ? 'checked' : ''}> ${esc(meta.nombre)}</label>`;
      default:
        return `<label class="ed-campo"><span>${esc(meta.nombre)}</span>
          <input type="text" data-prop="${id}" value="${esc(valor ?? meta.def)}"></label>`;
    }
  }

  function pintarInspector() {
    if (!sel) {
      elInsp.innerHTML = `<h3>Reglas</h3><div class="ed-reglas"></div>
        <p class="ed-nota">Haz clic en una pieza para ver sus propiedades.</p>`;
      pintarReglas();
      return;
    }
    const def = PIEZAS[sel.tipo];
    elInsp.innerHTML = `
      <h3>${esc(def?.nombre || sel.tipo)}</h3>
      <p class="ed-nota">${esc(def?.descripcion || '')}</p>
      <label class="ed-campo"><span>Etiqueta (para las reglas)</span>
        <input type="text" data-campo="etiqueta" value="${esc(sel.etiqueta)}" placeholder="sin etiqueta"></label>
      <div class="ed-xy">
        ${campoCampo('X', sel.x, 'x')}${campoCampo('Y', sel.y, 'y')}
        ${campoCampo('Ancho', sel.ancho, 'ancho')}${campoCampo('Alto', sel.alto, 'alto')}
      </div>
      ${Object.entries(def?.props || {}).map(([k, m]) => control(k, m, sel.props[k], 'p')).join('')}
      <div class="ed-borrar"><button class="btn small" data-act="duplicar">Duplicar</button>
        <button class="btn small" data-act="borrar-pieza">Borrar pieza</button></div>
      <h3>Reglas</h3><div class="ed-reglas"></div>`;

    elInsp.querySelectorAll('[data-campo]').forEach((i) => {
      i.addEventListener('input', () => { sel.etiqueta = i.value.trim(); validar(); });
    });
    elInsp.querySelectorAll('[data-geo]').forEach((i) => {
      i.addEventListener('input', () => { sel[i.dataset.geo] = Number(i.value); dibujar(); });
    });
    elInsp.querySelectorAll('[data-prop]').forEach((i) => {
      i.addEventListener('input', () => {
        const clave = i.dataset.prop.split(':')[1];
        sel.props[clave] = i.type === 'checkbox' ? i.checked
          : (i.type === 'number' ? Number(i.value) : coerce(i.value));
        dibujar();
      });
    });
    elInsp.querySelector('[data-act="borrar-pieza"]')?.addEventListener('click', () => {
      r.piezas = r.piezas.filter((p) => p !== sel);
      sel = null; pintarInspector(); dibujar(); validar();
    });
    elInsp.querySelector('[data-act="duplicar"]')?.addEventListener('click', () => {
      const copia = { ...structuredClone(sel), id: nuevoId(), x: sel.x + 40, y: sel.y + 40, etiqueta: '' };
      r.piezas.push(copia); sel = copia; pintarInspector(); dibujar();
    });
    pintarReglas();
  }

  const campoCampo = (n, v, k) => `<label class="ed-campo mini"><span>${n}</span>
    <input type="number" data-geo="${k}" value="${Math.round(v)}" step="5"></label>`;

  /** Los `select` devuelven texto; los números tienen que volver a serlo. */
  const coerce = (v) => (v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);

  /* ---------------- Reglas ---------------- */

  function pintarReglas() {
    const cont = elInsp.querySelector('.ed-reglas');
    if (!cont) return;
    cont.innerHTML = r.reglas.map((g, i) => `
      <div class="ed-regla" data-i="${i}">
        <div class="ed-regla-top">
          <b>Cuando</b>
          <select data-cuando="${i}">${Object.entries(DISPARADORES).map(([id, d]) =>
            `<option value="${id}" ${g.cuando.tipo === id ? 'selected' : ''}>${esc(d.nombre)}</option>`).join('')}</select>
          <button class="ed-x" data-quitar="${i}" title="Quitar la regla">×</button>
        </div>
        <div class="ed-regla-campos">
          ${Object.entries(DISPARADORES[g.cuando.tipo]?.campos || {})
            .map(([k, m]) => control(k, m, g.cuando[k], `c${i}`)).join('')}
        </div>
        <div class="ed-regla-top"><b>Entonces</b>
          <select data-nueva-accion="${i}">
            <option value="">añadir acción…</option>
            ${Object.entries(ACCIONES).map(([id, a]) => `<option value="${id}">${esc(a.nombre)}</option>`).join('')}
          </select>
        </div>
        ${g.entonces.map((a, j) => `
          <div class="ed-accion">
            <div class="ed-regla-top"><span>${esc(ACCIONES[a.tipo]?.nombre || a.tipo)}</span>
              <button class="ed-x" data-quitar-accion="${i}:${j}">×</button></div>
            ${Object.entries(ACCIONES[a.tipo]?.campos || {})
              .map(([k, m]) => control(k, m, a[k], `a${i}_${j}`)).join('')}
          </div>`).join('')}
        <label class="ed-check"><input type="checkbox" data-unavez="${i}" ${g.unaVez ? 'checked' : ''}> Solo una vez</label>
      </div>`).join('') + `<button class="btn small" data-act="nueva-regla">+ Nueva regla</button>`;

    cont.querySelector('[data-act="nueva-regla"]')?.addEventListener('click', () => {
      r.reglas.push({ id: nuevoId('r'), cuando: { tipo: 'inicio' }, entonces: [], unaVez: true });
      pintarReglas(); validar();
    });
    cont.querySelectorAll('[data-cuando]').forEach((s) => s.addEventListener('change', () => {
      r.reglas[+s.dataset.cuando].cuando = { tipo: s.value };
      pintarReglas();
    }));
    cont.querySelectorAll('[data-nueva-accion]').forEach((s) => s.addEventListener('change', () => {
      if (!s.value) return;
      const g = r.reglas[+s.dataset.nuevaAccion];
      const campos = ACCIONES[s.value]?.campos || {};
      const a = { tipo: s.value };
      for (const [k, m] of Object.entries(campos)) a[k] = m.def;
      g.entonces.push(a);
      pintarReglas(); validar();
    }));
    cont.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', () => {
      r.reglas.splice(+b.dataset.quitar, 1); pintarReglas(); validar();
    }));
    cont.querySelectorAll('[data-quitar-accion]').forEach((b) => b.addEventListener('click', () => {
      const [i, j] = b.dataset.quitarAccion.split(':').map(Number);
      r.reglas[i].entonces.splice(j, 1); pintarReglas();
    }));
    cont.querySelectorAll('[data-unavez]').forEach((c) => c.addEventListener('change', () => {
      r.reglas[+c.dataset.unavez].unaVez = c.checked;
    }));
    // Los campos de disparadores y acciones comparten el mismo control(),
    // así que se enlazan de una vez mirando el prefijo del id.
    cont.querySelectorAll('[data-prop]').forEach((i) => {
      i.addEventListener('input', () => {
        const [pref, clave] = i.dataset.prop.split(':');
        const valor = i.type === 'checkbox' ? i.checked
          : (i.type === 'number' ? Number(i.value) : coerce(i.value));
        if (pref.startsWith('c')) r.reglas[+pref.slice(1)].cuando[clave] = valor;
        else if (pref.startsWith('a')) {
          const [ri, ai] = pref.slice(1).split('_').map(Number);
          r.reglas[ri].entonces[ai][clave] = valor;
        }
        validar();
      });
    });
  }

  /* ---------------- Lienzo ---------------- */

  let escala = 1;
  function medir() {
    const caja = cv.parentElement.getBoundingClientRect();
    escala = Math.min((caja.width - 24) / r.arena.ancho, (caja.height - 24) / r.arena.alto);
    cv.width = Math.round(r.arena.ancho * escala);
    cv.height = Math.round(r.arena.alto * escala);
    dibujar();
  }

  const aArena = (ev) => {
    const b = cv.getBoundingClientRect();
    return { x: (ev.clientX - b.left) / escala, y: (ev.clientY - b.top) / escala };
  };
  const iman = (v) => Math.round(v / REJA) * REJA;

  function piezaEn(x, y) {
    // De atrás hacia delante: se coge lo que está encima, que es lo que se ve.
    for (let i = r.piezas.length - 1; i >= 0; i--) {
      const p = r.piezas[i];
      if (Math.abs(x - p.x) <= p.ancho / 2 && Math.abs(y - p.y) <= p.alto / 2) return p;
    }
    return null;
  }

  cv.addEventListener('pointerdown', (ev) => {
    const { x, y } = aArena(ev);
    const encima = piezaEn(x, y);
    if (ev.shiftKey || !encima) {
      const nueva = { ...crearPieza(herramienta, iman(x), iman(y)), id: nuevoId() };
      r.piezas.push(nueva);
      sel = nueva;
    } else {
      sel = encima;
      arrastrando = { dx: x - encima.x, dy: y - encima.y };
      cv.setPointerCapture(ev.pointerId);
    }
    pintarInspector(); dibujar(); validar();
  });
  cv.addEventListener('pointermove', (ev) => {
    if (!arrastrando || !sel) return;
    const { x, y } = aArena(ev);
    sel.x = clamp(iman(x - arrastrando.dx), 0, r.arena.ancho);
    sel.y = clamp(iman(y - arrastrando.dy), 0, r.arena.alto);
    dibujar();
  });
  const soltar = () => { if (arrastrando) { arrastrando = null; pintarInspector(); } };
  cv.addEventListener('pointerup', soltar);
  cv.addEventListener('pointercancel', soltar);

  function dibujar() {
    g.clearRect(0, 0, cv.width, cv.height);
    g.save();
    g.scale(escala, escala);
    g.fillStyle = r.arena.fondo;
    g.fillRect(0, 0, r.arena.ancho, r.arena.alto);
    if (r.arena.reja) {
      g.strokeStyle = '#ffffff12';
      g.lineWidth = 1 / escala;
      for (let x = 0; x <= r.arena.ancho; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, r.arena.alto); g.stroke(); }
      for (let y = 0; y <= r.arena.alto; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(r.arena.ancho, y); g.stroke(); }
    }
    for (const p of r.piezas) {
      const def = PIEZAS[p.tipo] || PIEZAS.muro;
      g.fillStyle = p.color || def.color || '#ff2e88';
      g.globalAlpha = def.zona || def.suelo ? 0.3 : 1;
      if (def.forma === 'circulo') {
        g.beginPath(); g.arc(p.x, p.y, p.ancho / 2, 0, Math.PI * 2); g.fill();
      } else {
        g.fillRect(p.x - p.ancho / 2, p.y - p.alto / 2, p.ancho, p.alto);
      }
      g.globalAlpha = 1;
      if (p.etiqueta) {
        g.fillStyle = '#ffffffcc';
        g.font = `${12 / escala}px system-ui`;
        g.textAlign = 'center';
        g.fillText(p.etiqueta, p.x, p.y - p.alto / 2 - 4);
      }
      if (p === sel) {
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2 / escala;
        g.setLineDash([6 / escala, 4 / escala]);
        g.strokeRect(p.x - p.ancho / 2 - 3, p.y - p.alto / 2 - 3, p.ancho + 6, p.alto + 6);
        g.setLineDash([]);
      }
    }
    g.restore();
    elPista.textContent = `Clic: colocar ${PIEZAS[herramienta]?.nombre || ''} · clic en una pieza: seleccionar y arrastrar · Mayús+clic: colocar encima · Supr: borrar`;
  }

  /* ---------------- Validación, guardado y salida ---------------- */

  function validar() {
    const avisos = revisar(r);
    elAvisos.innerHTML = avisos.length
      ? `<span class="ed-aviso">⚠ ${esc(avisos[0])}</span>`
      : `<span class="ed-ok">✓ Listo para jugar · ${r.piezas.length} piezas · ${r.reglas.length} reglas</span>`;
    return avisos;
  }

  function guardar() {
    r.nombre = capa.querySelector('.ed-nombre').value.trim() || 'Mi juego';
    const guardada = bib.guardar(r);
    if (!guardada) { alert('No hay sitio para guardar. Borra algún juego creado.'); return null; }
    r.id = guardada.id;
    return guardada;
  }

  capa.querySelector('.ed-nombre').addEventListener('input', () => { r.nombre = capa.querySelector('.ed-nombre').value; });

  capa.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'probar') {
      const avisos = validar();
      if (avisos.length && !confirm(`${avisos[0]}\n\n¿Probar igualmente?`)) return;
      const gd = guardar();
      if (gd) location.href = `play.html?g=${encodeURIComponent(bib.PREFIJO + gd.id)}`;
    } else if (act === 'exportar') {
      guardar(); bib.exportar(r);
    } else if (act === 'importar') {
      elArchivo.click();
    } else if (act === 'cerrar') {
      guardar(); cerrar();
    }
  });

  elArchivo.addEventListener('change', async () => {
    const f = elArchivo.files[0];
    if (!f) return;
    try {
      const nueva = await bib.importar(f);
      r = normalizar(nueva);
      sel = null;
      capa.querySelector('.ed-nombre').value = r.nombre;
      pintarPaleta(); pintarInspector(); medir(); validar();
    } catch (e) { alert(e.message); }
    elArchivo.value = '';
  });

  function alTeclado(ev) {
    if (ev.target.matches('input, select, textarea')) return;
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel) {
      ev.preventDefault();
      r.piezas = r.piezas.filter((p) => p !== sel);
      sel = null; pintarInspector(); dibujar(); validar();
    }
    if (ev.key === 'Escape') { guardar(); cerrar(); }
  }
  window.addEventListener('keydown', alTeclado);
  window.addEventListener('resize', medir);

  function cerrar() {
    window.removeEventListener('keydown', alTeclado);
    window.removeEventListener('resize', medir);
    capa.remove();
    alCerrar(r);
  }

  pintarPaleta();
  pintarInspector();
  requestAnimationFrame(medir);
  validar();

  return { cerrar, get receta() { return r; } };
}
