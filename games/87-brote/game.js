/**
 * Brote — la doctora diseña el patógeno, el ingeniero levanta la respuesta.
 *
 * Información asimétrica de verdad: cada jugador ve SU panel y no el del otro
 * (patrón de 63-escapa-juntos). Ella ve carga viral, vectores y mutaciones;
 * él ve telemetría, cobertura de red y despliegues. Los dos miran el mismo
 * mapa, pero leen cosas distintas de él.
 *
 * Dos modos:
 *   versus  — ella intenta llegar al 100% de infección, él a contenerla.
 *   coop    — los dos contra un brote automático que escala solo.
 *
 * El modelo es un SEIR simplificado por regiones, con R0 efectivo por región.
 * No pretende ser epidemiología publicable, pero las palancas son las reales:
 * transmisibilidad, letalidad (que se penaliza sola: un patógeno que mata
 * rápido se propaga peor), incubación, y del otro lado detección, trazado,
 * aislamiento y vacuna. La parte de informática no es decorado: el ingeniero
 * gestiona ancho de banda de cómputo y se enfrenta a caídas de servicio.
 */

import { escapeHtml } from '../../core/ui.js';
import { icon } from '../../core/icons.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const REGIONES = [
  { id: 'norte',   nom: 'Norte',    pob: 12_000_000, dens: 0.9, x: 30, y: 18 },
  { id: 'centro',  nom: 'Centro',   pob: 28_000_000, dens: 1.4, x: 48, y: 38 },
  { id: 'costa',   nom: 'Costa',    pob: 18_000_000, dens: 1.1, x: 22, y: 52 },
  { id: 'sierra',  nom: 'Sierra',   pob: 8_000_000,  dens: 0.6, x: 66, y: 30 },
  { id: 'sur',     nom: 'Sur',      pob: 15_000_000, dens: 0.8, x: 55, y: 72 },
  { id: 'islas',   nom: 'Islas',    pob: 4_000_000,  dens: 0.5, x: 82, y: 62 },
];

/** Aristas de contagio entre regiones (peso = flujo de personas). */
const RUTAS = [
  ['norte', 'centro', 1.0], ['centro', 'costa', 0.9], ['centro', 'sierra', 0.7],
  ['centro', 'sur', 0.8], ['costa', 'sur', 0.5], ['sur', 'islas', 0.4],
  ['sierra', 'norte', 0.4], ['costa', 'islas', 0.3],
];

/* ---------------- Árboles de mejora ---------------- */

const PATOGENO = [
  { id: 'aerea',    nom: 'Transmisión aérea',  cost: 3, ic: 'droplet', desc: '+R0 en regiones densas', ef: (p) => { p.r0 += 0.55; p.densBonus += 0.25; } },
  { id: 'fomite',   nom: 'Superficies',        cost: 2, ic: 'chest',   desc: '+R0 base, poco visible', ef: (p) => { p.r0 += 0.3; p.sigilo += 0.1; } },
  { id: 'asintom',  nom: 'Portador asintomático', cost: 4, ic: 'eyeOff', desc: 'Baja mucho la detección', ef: (p) => { p.sigilo += 0.35; p.incub += 2; } },
  { id: 'incuba',   nom: 'Incubación larga',   cost: 3, ic: 'timer',   desc: 'Se propaga antes de verse', ef: (p) => { p.incub += 3; p.sigilo += 0.12; } },
  { id: 'mutacion', nom: 'Deriva antigénica',  cost: 5, ic: 'virus',   desc: 'Reduce eficacia de vacuna', ef: (p) => { p.escape += 0.4; } },
  { id: 'letal',    nom: 'Alta letalidad',     cost: 2, ic: 'bomb',    desc: 'Más muertes, menos contagio', ef: (p) => { p.letal += 0.035; p.r0 -= 0.15; } },
  { id: 'resist',   nom: 'Resistencia',        cost: 4, ic: 'shield',  desc: 'Aguanta el aislamiento',   ef: (p) => { p.resist += 0.3; } },
];

const RESPUESTA = [
  { id: 'telemetria', nom: 'Telemetría',      cost: 2, ic: 'cpu',      desc: '+detección, revela regiones', ef: (r) => { r.deteccion += 0.3; } },
  { id: 'trazado',    nom: 'Trazado de contactos', cost: 3, ic: 'link', desc: 'Corta cadenas de contagio', ef: (r) => { r.trazado += 0.35; r.compCost += 1; } },
  { id: 'modelo',     nom: 'Modelo predictivo', cost: 4, ic: 'brain',  desc: 'Anticipa el salto entre regiones', ef: (r) => { r.prediccion += 0.5; r.compCost += 2; } },
  { id: 'aislar',     nom: 'Aislamiento',     cost: 3, ic: 'house',    desc: 'Baja R0 donde se aplica',  ef: (r) => { r.aislamiento += 0.4; } },
  { id: 'cluster',    nom: 'Clúster de cómputo', cost: 3, ic: 'bars',  desc: '+capacidad para todo lo demás', ef: (r) => { r.computo += 4; } },
  { id: 'vacuna',     nom: 'Plataforma de vacuna', cost: 6, ic: 'droplet', desc: 'Inmuniza, si no hay escape', ef: (r) => { r.vacuna += 0.45; r.compCost += 2; } },
  { id: 'redundancia', nom: 'Redundancia',    cost: 2, ic: 'gear',     desc: 'Evita caídas de servicio', ef: (r) => { r.uptime += 0.35; } },
];

const TICK = 1.15;               // segundos por día simulado
const DIAS_MAX = 120;

export function create(ctx) {
  const { input, audio, haptics, players, root } = ctx;

  let modo = null;               // 'versus' | 'coop'
  let fase = 'modo';             // modo | jugando | fin
  let dia = 0, acum = 0;
  let cur = [0, 0];              // cursor en el árbol de cada jugador
  let puntos = [3, 3];           // "ADN" de ella / "presupuesto" de él
  let desuscribir = null;
  let log = [];
  let caida = 0;                 // segundos de caída de servicio (ingeniero)
  let mensaje = '';

  const pat = { r0: 1.6, letal: 0.006, incub: 3, sigilo: 0.1, escape: 0, resist: 0, densBonus: 0, comprados: new Set() };
  const res = { deteccion: 0.1, trazado: 0, prediccion: 0, aislamiento: 0, vacuna: 0, computo: 6, compCost: 0, uptime: 0.5, comprados: new Set() };

  /** Estado epidemiológico por región. */
  const est = REGIONES.map((r) => ({
    id: r.id, pob: r.pob,
    S: r.pob, E: 0, I: 0, R: 0, D: 0, V: 0,
    detectada: false, aislada: false, conocida: 0,
  }));
  const porId = (id) => est.find((e) => e.id === id);

  const infectadosTot = () => est.reduce((a, e) => a + e.I + e.E, 0);
  const poblacionTot = () => est.reduce((a, e) => a + e.pob, 0);
  const muertosTot = () => est.reduce((a, e) => a + e.D, 0);
  const pctInfectado = () => (infectadosTot() / poblacionTot()) * 100;
  const pctInmune = () => (est.reduce((a, e) => a + e.R + e.V, 0) / poblacionTot()) * 100;

  function decir(t) { mensaje = t; }

  /* ---------------- Simulación ---------------- */

  function paso() {
    dia++;

    // El ingeniero gana presupuesto por día; ella gana ADN por infección nueva.
    if (dia % 3 === 0) { puntos[1] += 1; puntos[0] += 1; }

    const servicioCaido = caida > 0;
    if (servicioCaido) caida--;

    // Coste de cómputo: si te pasas de capacidad, el sistema se cae.
    if (!servicioCaido && res.compCost > res.computo && Math.random() < 0.25 * (1 - res.uptime)) {
      caida = 3;
      decir('Caída de servicio: el cómputo excede la capacidad');
      audio.error();
    }

    for (const e of est) {
      if (e.I <= 0 && e.E <= 0) continue;
      const reg = REGIONES.find((r) => r.id === e.id);

      // R0 efectivo: densidad, aislamiento (si la región está aislada y
      // detectada), trazado y resistencia del patógeno.
      let r0 = pat.r0 * (1 + (reg.dens - 1) * pat.densBonus);
      if (e.aislada && !servicioCaido) r0 *= Math.max(0.15, 1 - res.aislamiento * (1 - pat.resist));
      if (!servicioCaido) r0 *= Math.max(0.2, 1 - res.trazado * 0.6 * (1 - pat.resist));

      const frac = e.S / e.pob;
      const nuevos = Math.min(e.S, e.I * r0 * frac * 0.16);
      e.S -= nuevos;
      e.E += nuevos;

      // Incubación -> infeccioso
      const salen = e.E / Math.max(1, pat.incub);
      e.E -= salen; e.I += salen;

      // Resolución: muerte o recuperación
      const muer = e.I * pat.letal;
      const recu = e.I * 0.085;
      e.I -= muer + recu;
      e.D += muer; e.R += recu;

      // Vacunación (si hay plataforma y no la esquiva la mutación)
      if (res.vacuna > 0 && !servicioCaido) {
        const efi = Math.max(0, res.vacuna * (1 - pat.escape));
        const vac = Math.min(e.S, e.pob * efi * 0.012);
        e.S -= vac; e.V += vac;
      }

      // Detección: cuánto sabe el ingeniero de esta región
      const visible = (e.I / e.pob) * 100;
      const det = Math.max(0, res.deteccion * (1 - pat.sigilo)) * (servicioCaido ? 0.2 : 1);
      e.conocida = Math.min(1, e.conocida + det * 0.35);
      if (!e.detectada && e.conocida > 0.35 && visible > 0.02) {
        e.detectada = true;
        log.push(`Día ${dia}: brote detectado en ${reg.nom}`);
        audio.blip();
      }
    }

    // Salto entre regiones
    for (const [a, b, w] of RUTAS) {
      const ea = porId(a), eb = porId(b);
      for (const [src, dst] of [[ea, eb], [eb, ea]]) {
        if (src.I < 40) continue;
        const bloqueo = (src.aislada || dst.aislada) && !servicioCaido ? (1 - res.aislamiento) : 1;
        const flujo = src.I * 0.0012 * w * bloqueo * pat.r0 * 0.5;
        const real = Math.min(dst.S, flujo);
        if (real > 0.5) { dst.S -= real; dst.E += real; }
      }
    }

    // En cooperativo el brote se agrava solo cada 20 días.
    if (modo === 'coop' && dia % 20 === 0) {
      pat.r0 += 0.25; pat.sigilo += 0.05;
      log.push(`Día ${dia}: el patógeno mutó — R0 al alza`);
    }

    comprobarFin();
  }

  function comprobarFin() {
    const inf = pctInfectado(), inm = pctInmune();
    const muertos = muertosTot();
    const activos = infectadosTot();

    if (modo === 'versus') {
      if (inf >= 35) return terminar(0, `Pandemia fuera de control · ${inf.toFixed(1)}% infectado`);
      if (dia >= 60 && activos < poblacionTot() * 0.0002) return terminar(1, `Contenido en ${dia} días`);
    } else {
      if (activos < poblacionTot() * 0.0002 && dia > 25) {
        return terminar(-1, `Brote contenido en ${dia} días · ${Math.round(muertos).toLocaleString('es')} muertes`);
      }
      if (muertos > poblacionTot() * 0.02) return terminar(-1, `El brote los superó · ${(muertos / poblacionTot() * 100).toFixed(1)}% de bajas`);
    }
    if (dia >= DIAS_MAX) {
      if (modo === 'versus') return terminar(inf > 8 ? 0 : 1, `${DIAS_MAX} días · ${inf.toFixed(1)}% infectado`);
      return terminar(-1, `${DIAS_MAX} días · ${Math.round(muertos).toLocaleString('es')} muertes`);
    }
  }

  function terminar(winner, detail) {
    if (fase === 'fin') return;
    fase = 'fin';
    ctx.finish({
      winner,
      scores: [Math.round(pctInfectado() * 10) / 10, Math.round(pctInmune() * 10) / 10],
      detail,
      record: ctx.record(modo === 'coop' ? 'contencion' : 'dias', dia, modo === 'coop' ? 'low' : 'high'),
    });
  }

  /* ---------------- Compras ---------------- */

  function comprar(j) {
    const arbol = j === 0 ? PATOGENO : RESPUESTA;
    const obj = j === 0 ? pat : res;
    const m = arbol[cur[j] % arbol.length];
    if (obj.comprados.has(m.id)) { decir('Ya está desplegado'); audio.error(); return; }
    if (puntos[j] < m.cost) { decir(`Faltan puntos para ${m.nom}`); audio.error(); haptics.error(j); return; }
    puntos[j] -= m.cost;
    obj.comprados.add(m.id);
    m.ef(obj);
    log.push(`Día ${dia}: ${j === 0 ? 'patógeno' : 'respuesta'} — ${m.nom}`);
    audio.select();
    haptics.play('score', { player: j });
    decir(`${m.nom} activo`);
  }

  /** El ingeniero aísla la región donde tiene el cursor (si la ha detectado). */
  function alternarAislamiento() {
    const e = est[cur[1] % est.length];
    if (!e.detectada) { decir('No puedes aislar lo que no has detectado'); audio.error(); return; }
    e.aislada = !e.aislada;
    res.compCost += e.aislada ? 1 : -1;
    audio.tick();
    decir(`${REGIONES.find((r) => r.id === e.id).nom} ${e.aislada ? 'aislada' : 'reabierta'}`);
  }

  /** Ella siembra el brote inicial en la región del cursor. */
  function sembrar() {
    if (dia > 0) return;
    const e = est[cur[0] % est.length];
    e.E = 60; e.S -= 60;
    log.push(`Día 0: brote inicial en ${REGIONES.find((r) => r.id === e.id).nom}`);
    fase = 'jugando';
    audio.win();
    decir('El brote empezó');
  }

  /* ---------------- Render ---------------- */

  function pintarMapa() {
    return `
      <svg class="br-mapa" viewBox="0 0 100 90" preserveAspectRatio="xMidYMid meet">
        ${RUTAS.map(([a, b]) => {
          const ra = REGIONES.find((r) => r.id === a), rb = REGIONES.find((r) => r.id === b);
          return `<line x1="${ra.x}" y1="${ra.y}" x2="${rb.x}" y2="${rb.y}" class="br-ruta"/>`;
        }).join('')}
        ${REGIONES.map((r, i) => {
          const e = porId(r.id);
          const inf = (e.I + e.E) / e.pob;
          const rad = 4 + Math.sqrt(r.pob / 1_000_000) * 0.9;
          const vis = e.detectada || e.conocida > 0.2;
          const col = !vis ? '#2a2a3a' : inf > 0.05 ? '#ff2e5b' : inf > 0.005 ? '#ff9f1c' : '#2ec4b6';
          return `
            <g>
              ${e.aislada ? `<circle cx="${r.x}" cy="${r.y}" r="${rad + 3}" class="br-anillo"/>` : ''}
              <circle cx="${r.x}" cy="${r.y}" r="${rad}" fill="${col}"
                      class="br-region ${inf > 0.02 ? 'br-pulso' : ''}"/>
              <text x="${r.x}" y="${r.y + rad + 4.5}" class="br-etiq">${r.nom}</text>
            </g>`;
        }).join('')}
      </svg>`;
  }

  function panelPatogeno() {
    const e = est[cur[0] % est.length];
    const rn = REGIONES.find((r) => r.id === e.id).nom;
    return `
      <div class="br-panel" style="--c:${players[0].color}">
        <div class="br-panel-top">
          ${icon('virus', { size: 15 })}
          <b>${escapeHtml(players[0].name)}</b>
          <span class="br-rol">Patógeno</span>
          <span class="br-pts">${puntos[0]} ADN</span>
        </div>
        <div class="br-datos">
          <span>R0 <b>${pat.r0.toFixed(2)}</b></span>
          <span>Letalidad <b>${(pat.letal * 100).toFixed(1)}%</b></span>
          <span>Incubación <b>${pat.incub.toFixed(0)}d</b></span>
          <span>Sigilo <b>${Math.round(pat.sigilo * 100)}%</b></span>
        </div>
        <div class="br-foco">Foco: <b>${rn}</b> · ${((e.I + e.E) / e.pob * 100).toFixed(2)}% infectado</div>
        <div class="br-lista">
          ${PATOGENO.map((m, i) => `
            <div class="br-item ${i === cur[0] % PATOGENO.length ? 'sel' : ''} ${pat.comprados.has(m.id) ? 'on' : ''}">
              ${icon(m.ic, { size: 14 })}
              <span class="br-nom">${m.nom}</span>
              <span class="br-cost">${pat.comprados.has(m.id) ? '✓' : m.cost}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function panelRespuesta() {
    const e = est[cur[1] % est.length];
    const r = REGIONES.find((x) => x.id === e.id);
    const conocido = e.detectada || e.conocida > 0.2;
    return `
      <div class="br-panel" style="--c:${players[1].color}">
        <div class="br-panel-top">
          ${icon('cpu', { size: 15 })}
          <b>${escapeHtml(players[1].name)}</b>
          <span class="br-rol">Respuesta</span>
          <span class="br-pts">${puntos[1]} pres.</span>
        </div>
        <div class="br-datos">
          <span>Detección <b>${Math.round(res.deteccion * 100)}%</b></span>
          <span>Trazado <b>${Math.round(res.trazado * 100)}%</b></span>
          <span>Vacuna <b>${Math.round(res.vacuna * 100)}%</b></span>
          <span class="${res.compCost > res.computo ? 'br-alerta' : ''}">Cómputo <b>${res.compCost}/${res.computo}</b></span>
        </div>
        <div class="br-foco">
          Región: <b>${r.nom}</b> ·
          ${conocido ? `${((e.I + e.E) / e.pob * 100).toFixed(2)}% estimado` : '<i>sin telemetría</i>'}
          ${e.aislada ? ' · <b class="br-ais">AISLADA</b>' : ''}
        </div>
        <div class="br-lista">
          ${RESPUESTA.map((m, i) => `
            <div class="br-item ${i === cur[1] % RESPUESTA.length ? 'sel' : ''} ${res.comprados.has(m.id) ? 'on' : ''}">
              ${icon(m.ic, { size: 14 })}
              <span class="br-nom">${m.nom}</span>
              <span class="br-cost">${res.comprados.has(m.id) ? '✓' : m.cost}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function pintar() {
    if (fase === 'modo') {
      root.innerHTML = `
        <div class="br-wrap br-centro">
          <h2 class="br-titulo">Brote</h2>
          <p class="br-sub">
            <b style="color:${players[0].color}">${escapeHtml(players[0].name)}</b> diseña el patógeno ·
            <b style="color:${players[1].color}">${escapeHtml(players[1].name)}</b> levanta la respuesta
          </p>
          <div class="br-modos">
            <div class="br-modo ${modo === 'versus' ? 'sel' : ''}">
              ${icon('swords', { size: 26 })}
              <b>Versus</b>
              <span>Ella quiere el 35% infectado. Él quiere contenerlo.</span>
            </div>
            <div class="br-modo ${modo === 'coop' ? 'sel' : ''}">
              ${icon('handshake', { size: 26 })}
              <b>Cooperativo</b>
              <span>Los dos contra un brote que muta solo. Minimicen muertes.</span>
            </div>
          </div>
          <p class="br-hint">
            <span class="kbd">←</span><span class="kbd">→</span> elegir modo ·
            cualquiera pulsa su tecla de acción para empezar
          </p>
        </div>`;
      return;
    }

    const inf = pctInfectado(), inm = pctInmune();
    root.innerHTML = `
      <div class="br-wrap">
        <div class="br-hud">
          <span>Día <b>${dia}</b>/${DIAS_MAX}</span>
          <span class="br-modo-tag">${modo === 'versus' ? 'VERSUS' : 'COOPERATIVO'}</span>
          <span>Infectado <b class="br-rojo">${inf.toFixed(2)}%</b></span>
          <span>Inmune <b class="br-verde">${inm.toFixed(1)}%</b></span>
          <span>Muertes <b>${Math.round(muertosTot()).toLocaleString('es')}</b></span>
          ${caida > 0 ? '<span class="br-caida">SERVICIO CAÍDO</span>' : ''}
        </div>

        <div class="br-medio">
          ${panelPatogeno()}
          <div class="br-centro-mapa">
            ${pintarMapa()}
            <p class="br-msg">${escapeHtml(mensaje)}</p>
            <div class="br-log">
              ${log.slice(-3).map((l) => `<div>${escapeHtml(l)}</div>`).join('')}
            </div>
          </div>
          ${panelRespuesta()}
        </div>

        <p class="br-hint">
          ${fase === 'sembrar'
            ? `<b style="color:${players[0].color}">${escapeHtml(players[0].name)}</b>: elige región con ←/→ y siembra con tu tecla de acción`
            : `↑/↓ mejora · ←/→ región · acción: comprar · ${escapeHtml(players[1].name)} con su 2ª tecla: aislar región`}
        </p>
      </div>`;
  }

  /* ---------------- Entrada ---------------- */

  function tecla(e) {
    for (let j = 0; j < 2; j++) {
      const map = input.player(j).map;

      if (fase === 'modo') {
        if (e.code === map.left) { modo = 'versus'; audio.tick(); pintar(); return; }
        if (e.code === map.right) { modo = 'coop'; audio.tick(); pintar(); return; }
        if (e.code === map.a) {
          if (!modo) modo = 'versus';
          fase = 'sembrar';
          audio.select();
          decir('Elijan dónde empieza');
          pintar();
          return;
        }
        continue;
      }

      const arbolLen = j === 0 ? PATOGENO.length : RESPUESTA.length;
      if (e.code === map.up) { cur[j] = (cur[j] - 1 + arbolLen) % arbolLen; audio.tick(); pintar(); return; }
      if (e.code === map.down) { cur[j] = (cur[j] + 1) % arbolLen; audio.tick(); pintar(); return; }
      if (e.code === map.left) { cur[j] = (cur[j] - 1 + est.length) % est.length; audio.tick(); pintar(); return; }
      if (e.code === map.right) { cur[j] = (cur[j] + 1) % est.length; audio.tick(); pintar(); return; }

      if (e.code === map.a) {
        if (fase === 'sembrar') { if (j === 0) { sembrar(); pintar(); } return; }
        comprar(j); pintar(); return;
      }
      if (e.code === map.b && j === 1 && fase === 'jugando') { alternarAislamiento(); pintar(); return; }
    }
  }

  return {
    init() {
      inyectarEstilos();
      desuscribir = input.onAny(tecla);
      pintar();
    },

    update(dt) {
      if (fase !== 'jugando') return;
      acum += dt;
      if (acum >= TICK) { acum = 0; paso(); pintar(); }
    },

    destroy() { desuscribir?.(); root.innerHTML = ''; },
  };
}

function inyectarEstilos() {
  if (document.getElementById('br-css')) return;
  const s = document.createElement('style');
  s.id = 'br-css';
  s.textContent = `
    .br-wrap { display:flex; flex-direction:column; gap:9px; width:min(1080px,96vw); }
    .br-centro { align-items:center; text-align:center; gap:14px; }
    .br-titulo { font-family:var(--font-display); font-size:20px; margin:0; }
    .br-sub { font-size:13px; color:var(--ink-dim); margin:0; }

    .br-modos { display:flex; gap:14px; }
    .br-modo {
      display:flex; flex-direction:column; align-items:center; gap:7px;
      width:230px; padding:18px 14px; border-radius:var(--radius);
      background:#ffffff06; border:1px solid var(--line); color:var(--ink-dim);
    }
    .br-modo b { color:var(--ink); font-size:14px; }
    .br-modo span { font-size:11.5px; line-height:1.4; }
    .br-modo.sel { border-color:var(--p1); background:#ffffff10; box-shadow:0 0 24px -10px var(--p1); }

    .br-hud {
      display:flex; gap:16px; justify-content:center; align-items:center; flex-wrap:wrap;
      font-size:12px; color:var(--ink-dim);
      padding:7px 12px; border-radius:var(--radius-sm);
      background:#ffffff06; border:1px solid var(--line);
    }
    .br-hud b { color:var(--ink); }
    .br-rojo { color:#ff2e5b !important; }
    .br-verde { color:#2ec4b6 !important; }
    .br-modo-tag { font-size:9.5px; letter-spacing:.14em; color:var(--ink-faint); }
    .br-caida { color:#ff2e5b; font-weight:700; letter-spacing:.08em; animation:pulse-glow 1s infinite; }

    .br-medio { display:grid; grid-template-columns:1fr 1.15fr 1fr; gap:10px; align-items:start; }
    @media (max-width:900px){ .br-medio{ grid-template-columns:1fr; } }

    .br-panel {
      padding:10px; border-radius:var(--radius);
      background:#ffffff06; border:1px solid color-mix(in srgb, var(--c) 34%, var(--line) 66%);
    }
    .br-panel-top { display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--c); }
    .br-rol { font-size:9.5px; letter-spacing:.12em; color:var(--ink-faint); text-transform:uppercase; }
    .br-pts { margin-left:auto; font-family:var(--font-mono); font-size:11.5px; color:var(--ink); }

    .br-datos { display:grid; grid-template-columns:1fr 1fr; gap:2px 8px; margin:7px 0; font-size:10.5px; color:var(--ink-faint); }
    .br-datos b { color:var(--ink-dim); }
    .br-alerta b { color:#ff2e5b; }
    .br-foco { font-size:11px; color:var(--ink-dim); margin-bottom:6px; }
    .br-ais { color:#ffd166; }

    .br-lista { display:flex; flex-direction:column; gap:3px; }
    .br-item {
      display:flex; align-items:center; gap:6px;
      padding:5px 7px; border-radius:6px;
      background:#ffffff05; border:1px solid transparent;
      font-size:11px; color:var(--ink-dim);
    }
    .br-item.sel { border-color:var(--c); background:color-mix(in srgb, var(--c) 12%, transparent); color:var(--ink); }
    .br-item.on { opacity:.5; }
    .br-nom { flex:1; }
    .br-cost { font-family:var(--font-mono); font-size:10.5px; color:var(--ink-faint); }

    .br-centro-mapa { display:flex; flex-direction:column; align-items:center; gap:5px; }
    .br-mapa { width:100%; max-height:330px; }
    .br-ruta { stroke:#ffffff18; stroke-width:.5; }
    .br-region { transition:fill 400ms; }
    .br-pulso { animation:pulse-glow 1.4s infinite; }
    .br-anillo { fill:none; stroke:#ffd166; stroke-width:.9; stroke-dasharray:2 1.5; }
    .br-etiq { fill:#ffffff88; font-size:3px; text-anchor:middle; font-family:system-ui; }

    .br-msg { font-size:11.5px; color:#ffd166; margin:0; min-height:16px; text-align:center; }
    .br-log { font-size:10px; color:var(--ink-faint); text-align:center; line-height:1.45; }
    .br-hint { font-size:11px; color:var(--ink-faint); text-align:center; margin:0; }
  `;
  document.head.appendChild(s);
}
