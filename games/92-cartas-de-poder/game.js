/**
 * Cartas de Poder — duelo de cartas por turnos con criaturas y hechizos.
 *
 * Como en 34-ajedrez, las reglas viven separadas del render: `aplicar()` y sus
 * ayudantes no tocan el DOM, así que la mecánica se puede razonar (y romper)
 * sin pelearse con la interfaz.
 *
 * El bucle es el clásico del género: robas, subes una gema de energía por
 * turno, juegas lo que te alcance y atacas. Las criaturas entran "mareadas"
 * (no atacan el turno que caen), las defensoras obligan a pasar por encima
 * antes de tocar al rival, y cada carta tiene una palabra clave que cambia
 * cómo se juega alrededor de ella.
 *
 * Todas las cartas son originales de este proyecto.
 */

import { escapeHtml } from '../../core/ui.js';
import { icon } from '../../core/icons.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const VIDA_INI = 24;
const MANO_MAX = 7;
const MESA_MAX = 5;
const GEMA_MAX = 10;

/**
 * Cartas. `tipo`: criatura | hechizo.
 * Palabras clave: defensora (obliga a atacarla), veloz (ataca al entrar),
 * doble (golpea dos veces), robo (roba al entrar), drenaje (cura al golpear).
 */
const CARTAS = [
  { id: 'ascua',     nom: 'Ascua Menor',      cost: 1, tipo: 'criatura', at: 2, vd: 1, ic: 'flame',   txt: 'Veloz', clave: 'veloz' },
  { id: 'centinela', nom: 'Centinela',        cost: 2, tipo: 'criatura', at: 1, vd: 4, ic: 'shield',  txt: 'Defensora', clave: 'defensora' },
  { id: 'lobo',      nom: 'Lobo de Escarcha', cost: 2, tipo: 'criatura', at: 3, vd: 2, ic: 'dog',     txt: '' },
  { id: 'buho',      nom: 'Búho Archivista',  cost: 2, tipo: 'criatura', at: 1, vd: 2, ic: 'bird',    txt: 'Roba una carta', clave: 'robo' },
  { id: 'golem',     nom: 'Golem de Piedra',  cost: 4, tipo: 'criatura', at: 3, vd: 6, ic: 'chest',   txt: 'Defensora', clave: 'defensora' },
  { id: 'gemelas',   nom: 'Hojas Gemelas',    cost: 3, tipo: 'criatura', at: 2, vd: 3, ic: 'swords',  txt: 'Golpea dos veces', clave: 'doble' },
  { id: 'sanguijuela', nom: 'Sanguijuela',    cost: 3, tipo: 'criatura', at: 3, vd: 3, ic: 'droplet', txt: 'Drenaje', clave: 'drenaje' },
  { id: 'dragon',    nom: 'Dragón de Brasa',  cost: 6, tipo: 'criatura', at: 6, vd: 5, ic: 'dragon',  txt: 'Veloz', clave: 'veloz' },
  { id: 'titan',     nom: 'Titán Antiguo',    cost: 7, tipo: 'criatura', at: 8, vd: 8, ic: 'lion',    txt: '' },
  { id: 'espectro',  nom: 'Espectro',         cost: 4, tipo: 'criatura', at: 5, vd: 2, ic: 'ghost',   txt: 'Veloz', clave: 'veloz' },
  { id: 'rayo',      nom: 'Rayo Partido',     cost: 2, tipo: 'hechizo',  dano: 4, ic: 'bolt',   txt: '4 de daño a una criatura', obj: 'criatura' },
  { id: 'meteoro',   nom: 'Meteoro',          cost: 5, tipo: 'hechizo',  dano: 3, ic: 'bomb',   txt: '3 de daño a TODAS las criaturas', obj: 'todas' },
  { id: 'chispazo',  nom: 'Chispazo',         cost: 1, tipo: 'hechizo',  dano: 2, ic: 'star',   txt: '2 de daño al rival', obj: 'rival' },
  { id: 'cura',      nom: 'Savia Curativa',   cost: 2, tipo: 'hechizo',  cura: 5, ic: 'heart',  txt: 'Recupera 5 de vida', obj: 'propio' },
  { id: 'furia',     nom: 'Furia',            cost: 2, tipo: 'hechizo',  buff: 3, ic: 'trophy', txt: '+3 ataque a una criatura', obj: 'criatura' },
];

let uid = 0;
const instanciar = (def) => ({ ...def, uid: ++uid, mareada: def.clave !== 'veloz', puedeAtacar: def.clave === 'veloz', vdMax: def.vd });

function mazoNuevo(rng) {
  const m = [];
  for (const c of CARTAS) {
    const copias = c.cost <= 2 ? 3 : c.cost <= 4 ? 2 : 1;
    for (let k = 0; k < copias; k++) m.push(c);
  }
  for (let i = m.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [m[i], m[j]] = [m[j], m[i]];
  }
  return m;
}

export function create(ctx) {
  const { input, audio, haptics, players, root, rng } = ctx;

  const jug = [0, 1].map(() => ({
    vida: VIDA_INI, gemas: 0, gemasMax: 0,
    mazo: mazoNuevo(rng), mano: [], mesa: [], fatiga: 0,
  }));

  let turno = 0;
  let zona = 'mano';             // mano | mesa
  let cur = 0;
  let atacante = null;           // uid de la criatura que ataca
  let fase = 'jugando';          // jugando | fin
  let mensaje = '';
  let log = [];
  let desuscribir = null;
  let anim = 0;

  const yo = () => jug[turno];
  const rival = () => jug[1 - turno];

  function decir(t) { mensaje = t; }
  function anotar(t) { log.push(t); if (log.length > 4) log.shift(); }

  /* ---------------- Reglas ---------------- */

  function robar(j, n = 1) {
    const p = jug[j];
    for (let k = 0; k < n; k++) {
      if (p.mazo.length === 0) {
        p.fatiga++;
        p.vida -= p.fatiga;
        anotar(`${players[j].name} sin mazo: ${p.fatiga} de fatiga`);
        continue;
      }
      if (p.mano.length >= MANO_MAX) { p.mazo.shift(); continue; }
      p.mano.push(instanciar(p.mazo.shift()));
    }
  }

  function empezarTurno() {
    const p = yo();
    p.gemasMax = Math.min(GEMA_MAX, p.gemasMax + 1);
    p.gemas = p.gemasMax;
    for (const c of p.mesa) { c.mareada = false; c.puedeAtacar = true; }
    robar(turno, 1);
    zona = 'mano'; cur = 0; atacante = null;
    decir(`Turno de ${players[turno].name}`);
    comprobarFin();
  }

  function pasarTurno() {
    turno = 1 - turno;
    audio.select();
    empezarTurno();
    pintar();
  }

  function jugarCarta(idx) {
    const p = yo();
    const c = p.mano[idx];
    if (!c) return;
    if (c.cost > p.gemas) { decir('No te alcanzan las gemas'); audio.error(); return; }

    if (c.tipo === 'criatura') {
      if (p.mesa.length >= MESA_MAX) { decir('Tu mesa está llena'); audio.error(); return; }
      p.gemas -= c.cost;
      p.mano.splice(idx, 1);
      p.mesa.push(c);
      if (c.clave === 'robo') robar(turno, 1);
      anotar(`${players[turno].name} invoca ${c.nom}`);
      audio.blip();
      haptics.play('soft', { player: turno });
    } else {
      // Hechizos que necesitan objetivo se resuelven sobre la criatura marcada.
      if (c.obj === 'criatura') {
        const objetivos = [...rival().mesa, ...p.mesa];
        if (!objetivos.length) { decir('No hay criaturas en juego'); audio.error(); return; }
        // Objetivo por defecto: la criatura enemiga más fuerte.
        const enemigas = rival().mesa;
        const t = enemigas.length
          ? enemigas.reduce((a, b) => (b.at > a.at ? b : a))
          : p.mesa[0];
        p.gemas -= c.cost;
        p.mano.splice(idx, 1);
        if (c.dano) {
          t.vd -= c.dano;
          anotar(`${c.nom} golpea a ${t.nom}`);
        } else if (c.buff) {
          const mio = p.mesa.length ? p.mesa.reduce((a, b) => (b.at > a.at ? b : a)) : null;
          if (mio) { mio.at += c.buff; anotar(`${mio.nom} gana +${c.buff}`); }
        }
        limpiarMuertas();
      } else if (c.obj === 'rival') {
        p.gemas -= c.cost; p.mano.splice(idx, 1);
        rival().vida -= c.dano;
        anotar(`${c.nom}: ${c.dano} al rival`);
      } else if (c.obj === 'propio') {
        p.gemas -= c.cost; p.mano.splice(idx, 1);
        p.vida = Math.min(VIDA_INI, p.vida + c.cura);
        anotar(`${players[turno].name} cura ${c.cura}`);
      } else if (c.obj === 'todas') {
        p.gemas -= c.cost; p.mano.splice(idx, 1);
        for (const m of [...p.mesa, ...rival().mesa]) m.vd -= c.dano;
        anotar(`${c.nom} arrasa la mesa`);
        limpiarMuertas();
      }
      audio.tone({ freq: 520, dur: 0.12, gain: 0.13, type: 'triangle' });
      haptics.play('impact', { player: turno });
    }
    anim = 0.35;
    if (cur >= p.mano.length) cur = Math.max(0, p.mano.length - 1);
    comprobarFin();
  }

  function limpiarMuertas() {
    for (const p of jug) {
      const antes = p.mesa.length;
      p.mesa = p.mesa.filter((c) => c.vd > 0);
      if (p.mesa.length !== antes) audio.tone({ freq: 150, dur: 0.09, gain: 0.1, type: 'sawtooth' });
    }
  }

  /** Un ataque solo puede ignorar defensoras si no quedan defensoras vivas. */
  function objetivosValidos() {
    const def = rival().mesa.filter((c) => c.clave === 'defensora');
    return def.length ? def : rival().mesa;
  }

  function atacar(atkUid) {
    const p = yo();
    const a = p.mesa.find((c) => c.uid === atkUid);
    if (!a) return;
    if (a.mareada || !a.puedeAtacar) { decir(`${a.nom} no puede atacar aún`); audio.error(); return; }

    const objetivos = objetivosValidos();
    const golpes = a.clave === 'doble' ? 2 : 1;

    if (objetivos.length === 0) {
      // Cara libre
      for (let k = 0; k < golpes; k++) rival().vida -= a.at;
      if (a.clave === 'drenaje') p.vida = Math.min(VIDA_INI, p.vida + a.at);
      anotar(`${a.nom} golpea al rival por ${a.at * golpes}`);
      ctx.shake?.(4, 5);
    } else {
      const t = objetivos.reduce((x, y) => (y.at > x.at ? y : x));
      for (let k = 0; k < golpes; k++) {
        t.vd -= a.at;
        a.vd -= t.at;
        if (a.clave === 'drenaje') p.vida = Math.min(VIDA_INI, p.vida + a.at);
        if (a.vd <= 0 || t.vd <= 0) break;
      }
      anotar(`${a.nom} choca con ${t.nom}`);
    }
    a.puedeAtacar = false;
    audio.tone({ freq: 300, dur: 0.09, gain: 0.14, type: 'square' });
    haptics.play('impact', { player: turno });
    anim = 0.3;
    limpiarMuertas();
    comprobarFin();
  }

  function comprobarFin() {
    if (fase === 'fin') return;
    const m = jug.map((p) => p.vida <= 0);
    if (m[0] || m[1]) {
      fase = 'fin';
      const winner = m[0] && m[1] ? -1 : m[0] ? 1 : 0;
      ctx.finish({
        winner,
        scores: [Math.max(0, jug[0].vida), Math.max(0, jug[1].vida)],
        detail: winner === -1 ? 'Los dos cayeron' : `${players[winner].name} gana con ${jug[winner].vida} de vida`,
      });
    }
  }

  /* ---------------- Render ---------------- */

  function carta(c, opts = {}) {
    const { sel, jugable, enMesa, propia } = opts;
    const cls = ['cp-carta'];
    if (sel) cls.push('sel');
    if (jugable === false) cls.push('cara');
    if (enMesa && c.mareada) cls.push('mareada');
    if (enMesa && c.puedeAtacar) cls.push('lista');
    if (c.clave === 'defensora') cls.push('defensora');
    return `
      <div class="${cls.join(' ')}" style="--c:${propia ? players[turno].color : '#8a8aa0'}">
        <span class="cp-cost">${c.cost}</span>
        <span class="cp-ic">${icon(c.ic, { size: 20 })}</span>
        <span class="cp-nom">${escapeHtml(c.nom)}</span>
        ${c.tipo === 'criatura'
          ? `<span class="cp-stats"><b>${c.at}</b>/<b class="${c.vd < c.vdMax ? 'herida' : ''}">${c.vd}</b></span>`
          : `<span class="cp-stats cp-hech">hechizo</span>`}
        ${c.txt ? `<span class="cp-txt">${escapeHtml(c.txt)}</span>` : ''}
      </div>`;
  }

  function ladoRival() {
    const r = rival();
    return `
      <div class="cp-lado">
        <div class="cp-jug" style="--c:${players[1 - turno].color}">
          ${icon('heart', { size: 14 })} <b>${r.vida}</b>
          <span>${escapeHtml(players[1 - turno].name)}</span>
          <span class="cp-gemas">${r.gemas}/${r.gemasMax}</span>
          <span class="cp-mazo">mazo ${r.mazo.length} · mano ${r.mano.length}</span>
        </div>
        <div class="cp-mesa">
          ${r.mesa.length
            ? r.mesa.map((c) => carta(c, { enMesa: true, propia: false })).join('')
            : '<p class="cp-vacio">mesa vacía</p>'}
        </div>
      </div>`;
  }

  function ladoPropio() {
    const p = yo();
    return `
      <div class="cp-lado">
        <div class="cp-mesa ${zona === 'mesa' ? 'activa' : ''}">
          ${p.mesa.length
            ? p.mesa.map((c, i) => carta(c, { sel: zona === 'mesa' && i === cur, enMesa: true, propia: true })).join('')
            : '<p class="cp-vacio">invoca criaturas desde tu mano</p>'}
        </div>
        <div class="cp-jug propio" style="--c:${players[turno].color}">
          ${icon('heart', { size: 14 })} <b>${p.vida}</b>
          <span>${escapeHtml(players[turno].name)}</span>
          <span class="cp-gemas">${'◆'.repeat(p.gemas)}${'◇'.repeat(Math.max(0, p.gemasMax - p.gemas))} ${p.gemas}/${p.gemasMax}</span>
          <span class="cp-mazo">mazo ${p.mazo.length}</span>
        </div>
        <div class="cp-mano ${zona === 'mano' ? 'activa' : ''}">
          ${p.mano.length
            ? p.mano.map((c, i) => carta(c, { sel: zona === 'mano' && i === cur, jugable: c.cost <= p.gemas, propia: true })).join('')
            : '<p class="cp-vacio">mano vacía</p>'}
        </div>
      </div>`;
  }

  function pintar() {
    if (fase === 'fin') return;
    root.innerHTML = `
      <div class="cp-wrap ${anim > 0 ? 'cp-anim' : ''}">
        ${ladoRival()}
        <div class="cp-centro">
          <span class="cp-msg">${escapeHtml(mensaje)}</span>
          <div class="cp-log">${log.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}</div>
        </div>
        ${ladoPropio()}
        <p class="cp-hint">
          <span class="kbd">←</span><span class="kbd">→</span> elegir ·
          <span class="kbd">↑</span><span class="kbd">↓</span> mano/mesa ·
          <b style="color:${players[turno].color}">acción</b>: jugar o atacar ·
          <b>2ª tecla</b>: terminar turno
        </p>
      </div>`;
  }

  function tecla(e) {
    if (fase === 'fin') return;
    const map = input.player(turno).map;
    const p = yo();
    const lista = zona === 'mano' ? p.mano : p.mesa;

    if (e.code === map.left) { cur = (cur - 1 + Math.max(1, lista.length)) % Math.max(1, lista.length); audio.tick(); pintar(); return; }
    if (e.code === map.right) { cur = (cur + 1) % Math.max(1, lista.length); audio.tick(); pintar(); return; }
    if (e.code === map.up || e.code === map.down) {
      zona = zona === 'mano' ? 'mesa' : 'mano';
      cur = 0; audio.tick(); pintar(); return;
    }
    if (e.code === map.a) {
      if (zona === 'mano') jugarCarta(cur);
      else if (p.mesa[cur]) atacar(p.mesa[cur].uid);
      pintar(); return;
    }
    if (e.code === map.b) { pasarTurno(); return; }
  }

  return {
    init() {
      inyectarEstilos();
      robar(0, 3); robar(1, 4);      // el segundo compensa con una carta más
      desuscribir = input.onAny(tecla);
      empezarTurno();
      pintar();
    },

    update(dt) {
      if (anim > 0) { anim -= dt; if (anim <= 0) pintar(); }
    },

    destroy() { desuscribir?.(); root.innerHTML = ''; },
  };
}

function inyectarEstilos() {
  if (document.getElementById('cp-css')) return;
  const s = document.createElement('style');
  s.id = 'cp-css';
  s.textContent = `
    .cp-wrap { display:flex; flex-direction:column; gap:7px; width:min(1020px,96vw); }
    .cp-lado { display:flex; flex-direction:column; gap:5px; }

    .cp-jug {
      display:flex; align-items:center; gap:9px;
      padding:5px 11px; border-radius:999px;
      background:#ffffff07; border:1px solid color-mix(in srgb, var(--c) 40%, var(--line) 60%);
      font-size:12px; color:var(--ink-dim); align-self:center;
    }
    .cp-jug b { color:var(--c); font-size:15px; font-family:var(--font-display); }
    .cp-jug.propio { box-shadow:0 0 22px -10px var(--c); }
    .cp-gemas { color:#6fd0f0; font-size:11px; letter-spacing:1px; }
    .cp-mazo { color:var(--ink-faint); font-size:10.5px; }

    .cp-mesa, .cp-mano {
      display:flex; gap:6px; justify-content:center; flex-wrap:wrap;
      min-height:88px; padding:5px; border-radius:var(--radius-sm);
      border:1px dashed transparent;
    }
    .cp-mesa.activa, .cp-mano.activa { border-color:#ffffff20; background:#ffffff04; }
    .cp-vacio { font-size:11px; color:var(--ink-faint); font-style:italic; align-self:center; margin:0; }

    .cp-carta {
      position:relative; width:88px; min-height:82px;
      display:flex; flex-direction:column; align-items:center; gap:2px;
      padding:7px 5px 5px; border-radius:8px;
      background:linear-gradient(160deg, #1b1b2c, #12121e);
      border:1px solid var(--line); color:var(--ink-dim);
      transition: transform 140ms var(--ease), border-color 140ms, box-shadow 140ms;
    }
    .cp-carta.sel { border-color:var(--c); box-shadow:0 0 20px -6px var(--c); transform:translateY(-5px); }
    .cp-carta.cara { opacity:.45; }
    .cp-carta.mareada { filter:grayscale(.6); opacity:.7; }
    .cp-carta.lista::after {
      content:''; position:absolute; inset:-2px; border-radius:9px;
      border:1.5px solid #a8ff3e66; pointer-events:none;
    }
    .cp-carta.defensora { border-left:3px solid #6fd0f0; }

    .cp-cost {
      position:absolute; top:-6px; left:-6px;
      width:20px; height:20px; display:grid; place-items:center;
      border-radius:50%; background:#2a4a6a; color:#cfe9ff;
      font-size:11px; font-weight:700; border:1px solid #6fd0f0;
    }
    .cp-ic { color:var(--c); }
    .cp-nom { font-size:9.5px; text-align:center; line-height:1.15; color:var(--ink); }
    .cp-stats { font-size:12px; font-family:var(--font-mono); color:var(--ink); }
    .cp-stats b { color:#ffd166; }
    .cp-stats b.herida { color:#ff4757; }
    .cp-hech { font-size:9px; color:var(--violet); font-family:var(--font-ui); }
    .cp-txt { font-size:8.5px; color:var(--ink-faint); text-align:center; line-height:1.2; }

    .cp-centro { display:flex; flex-direction:column; align-items:center; gap:2px; min-height:44px; }
    .cp-msg { font-size:12.5px; color:#ffd166; }
    .cp-log { font-size:10px; color:var(--ink-faint); text-align:center; line-height:1.4; }
    .cp-hint { font-size:11px; color:var(--ink-faint); text-align:center; margin:2px 0 0; }
  `;
  document.head.appendChild(s);
}
