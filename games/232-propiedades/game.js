/**
 * Barrio en Venta — comprar calles, cobrar alquileres y arruinar al vecino.
 *
 * Un juego de propiedades por turnos para dos a cuatro personas (los puestos
 * libres los llevan bots). Las mecánicas clásicas están todas —grupos que
 * doblan el alquiler, casas, calabozo, cartas— con dos decisiones propias:
 *
 *   · SI NO COMPRAS, SE SUBASTA. Es la regla que casi nadie aplica en casa y
 *     la que hace que el juego no se atasque: una calle nunca se queda sin
 *     dueño porque el que cayó no tuviera dinero.
 *
 *   · LA PARTIDA TIENE FINAL. A las doce rondas gana el patrimonio más alto,
 *     así que no hace falta arruinar a nadie para terminar (aunque se puede).
 *
 * Todo se maneja con DOS TECLAS por puesto: acción y especial. Con cuatro
 * personas delante del mismo teclado, cualquier cosa más rica es injugable.
 */

import { crearMesa, pantallaMesa } from '../../core/mesa.js';
import { escapeHtml } from '../../core/ui.js';
import {
  CASILLAS, GRUPOS, SUERTE, CASAS_MAX, PRECIO_CASA, SUELDO_SALIDA, FIANZA,
  alquiler, tieneGrupo, patrimonio, coordenadas, delGrupo,
} from './tablero.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const DINERO_INICIAL = 1500;
const RONDAS = 12;
const PUJA_MIN = 20;
const RELOJ_SUBASTA = 6;

export function create(ctx) {
  const { audio, haptics, rng } = ctx;

  let mesa = null, pantalla = null, el = null, marcador = null;
  let casillas = [], jugadores = [], coords = coordenadas();
  let turno = 0, ronda = 1, fase = 'config';
  let dados = [0, 0], dobles = 0, pasos = 0, animando = 0;
  let mensaje = '', decision = null, subasta = null, botTimer = 0;
  let acabado = false;

  const actual = () => jugadores[turno];
  const vivos = () => jugadores.filter((j) => !j.arruinado);

  /* ---------------- Arranque ---------------- */

  function iniciarPartida(cfg) {
    mesa = crearMesa(ctx, cfg);
    // Copia profunda del tablero: una partida no puede ensuciar la siguiente.
    casillas = CASILLAS.map((c) => ({ ...c, dueno: -1, casas: 0 }));
    jugadores = mesa.equipos.map((e, i) => ({
      id: i, equipo: e, nombre: e.nombre, color: e.color, esBot: e.esBot,
      dinero: DINERO_INICIAL, pos: 0, carcel: 0, arruinado: false,
    }));
    turno = 0; ronda = 1;
    fase = 'turno';
    mensaje = `Empieza ${jugadores[0].nombre}`;
    construirTablero();
    pintar();
  }

  /* ---------------- Turnos ---------------- */

  function tirar() {
    const j = actual();
    dados = [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
    const suma = dados[0] + dados[1];
    audio.tone({ freq: 300, dur: 0.08, gain: 0.14, type: 'square' });
    haptics.play('tick');

    if (j.carcel > 0) {
      if (dados[0] === dados[1]) {
        // Dobles: sale y además avanza con esa tirada, como en el reglamento.
        j.carcel = 0;
        mensaje = `${j.nombre} saca dobles y sale del calabozo`;
      } else {
        j.carcel--;
        if (j.carcel === 0) {
          pagar(j, FIANZA, null);
          mensaje = `${j.nombre} paga la fianza (${FIANZA} €) y sale`;
        } else {
          mensaje = `${j.nombre} sigue en el calabozo (${j.carcel} turnos)`;
          return finTurno();
        }
      }
      pasos = suma;
      fase = 'moviendo';
      animando = 0;
      pintar();
      return;
    }

    if (dados[0] === dados[1]) {
      dobles++;
      if (dobles >= 3) {
        // Tres dobles seguidos es demasiada suerte: al calabozo.
        j.pos = 21;
        j.carcel = 2;
        dobles = 0;
        mensaje = `${j.nombre} saca tres dobles seguidos… al calabozo`;
        audio.error();
        return finTurno();
      }
    } else dobles = 0;

    pasos = suma;
    fase = 'moviendo';
    animando = 0;
    pintar();
  }

  function avanzarPaso() {
    const j = actual();
    j.pos = (j.pos + 1) % casillas.length;
    if (j.pos === 0) {
      j.dinero += SUELDO_SALIDA;
      audio.pickup();
    }
    pasos--;
    audio.tick();
    colocarFichas();
    if (pasos <= 0) resolver();
  }

  function resolver() {
    const j = actual();
    const c = casillas[j.pos];
    fase = 'resolviendo';

    if (c.tipo === 'salida' || c.tipo === 'parking' || c.tipo === 'carcel') {
      mensaje = `${j.nombre} descansa en ${c.nombre}`;
      return finTurno(0.7);
    }
    if (c.tipo === 'alacarcel') {
      j.pos = 7;                       // la casilla de visita, pero preso
      j.carcel = 2;
      mensaje = `${j.nombre} va derecho al calabozo`;
      audio.error();
      haptics.error();
      colocarFichas();
      return finTurno(1);
    }
    if (c.tipo === 'impuesto') {
      pagar(j, c.importe, null);
      mensaje = `${c.nombre}: ${j.nombre} paga ${c.importe} €`;
      return finTurno(1);
    }
    if (c.tipo === 'suerte') {
      const carta = SUERTE[Math.floor(rng() * SUERTE.length)];
      mensaje = `Suerte · ${carta.texto}`;
      if (carta.dinero) {
        if (carta.dinero > 0) { j.dinero += carta.dinero; audio.pickup(); }
        else pagar(j, -carta.dinero, null);
      }
      if (carta.cobrarATodos) {
        for (const o of vivos()) if (o !== j) { pagar(o, carta.cobrarATodos, j); }
      }
      if (carta.ir != null) {
        if (carta.ir === 0) { j.pos = 0; j.dinero += SUELDO_SALIDA; }
        else { j.pos = 7; j.carcel = 2; }
        colocarFichas();
      }
      return finTurno(1.4);
    }

    // Propiedad o transporte
    if (c.dueno === -1) {
      if (j.dinero >= c.precio) {
        decision = { tipo: 'comprar', casilla: c, jugador: j };
        fase = 'decidir';
        mensaje = `${c.nombre} · ${c.precio} €`;
        botTimer = j.esBot ? mesa.demora() : 0;
        pintar();
        return;
      }
      // Sin dinero para comprarla, va directa a subasta.
      return abrirSubasta(c);
    }
    if (c.dueno === j.id) {
      mensaje = `${j.nombre} está en su propia ${c.nombre}`;
      return finTurno(0.7);
    }
    const dueno = jugadores[c.dueno];
    const renta = alquiler(casillas, c, c.dueno);
    pagar(j, renta, dueno);
    mensaje = `${j.nombre} paga ${renta} € a ${dueno.nombre} por ${c.nombre}`;
    audio.score(c.dueno % 2);
    return finTurno(1.2);
  }

  /** Cobro con quiebra: si no llega, entrega lo que tiene y se retira. */
  function pagar(j, cantidad, a) {
    const paga = Math.min(cantidad, j.dinero);
    j.dinero -= paga;
    if (a) a.dinero += paga;
    if (j.dinero <= 0 && paga < cantidad) {
      j.arruinado = true;
      j.dinero = 0;
      for (const c of casillas) if (c.dueno === j.id) { c.dueno = a ? a.id : -1; c.casas = 0; }
      mensaje = `${j.nombre} se arruina y deja el barrio`;
      audio.lose();
      haptics.defeat();
    }
  }

  function comprar(j, c) {
    j.dinero -= c.precio;
    c.dueno = j.id;
    audio.place();
    haptics.play('score');
    mensaje = `${j.nombre} compra ${c.nombre}`;
    decision = null;
    finTurno(0.9);
  }

  /* ---------------- Subasta de la casilla rechazada ---------------- */

  function abrirSubasta(c) {
    const candidatos = vivos().filter((j) => j.dinero >= PUJA_MIN);
    if (!candidatos.length) { mensaje = `${c.nombre} se queda sin dueño`; return finTurno(1); }
    subasta = { casilla: c, precio: PUJA_MIN, lider: null, reloj: RELOJ_SUBASTA, timers: new Map() };
    for (const j of candidatos) if (j.esBot) subasta.timers.set(j.id, mesa.demora());
    fase = 'subasta';
    mensaje = `Nadie la quiso: ${c.nombre} sale a subasta`;
    audio.arp([440, 620, 780], 0.05);
    pintar();
  }

  function pujar(j) {
    if (!subasta || subasta.lider === j) return;
    const coste = subasta.lider ? subasta.precio + PUJA_MIN : subasta.precio;
    if (j.dinero < coste) return;
    subasta.precio = coste;
    subasta.lider = j;
    subasta.reloj = RELOJ_SUBASTA * 0.6;
    audio.tone({ freq: 520, dur: 0.06, gain: 0.14, type: 'square' });
    pintar();
  }

  function cerrarSubasta() {
    const { casilla: c, lider, precio } = subasta;
    if (lider) {
      lider.dinero -= precio;
      c.dueno = lider.id;
      mensaje = `${lider.nombre} se lleva ${c.nombre} por ${precio} €`;
      audio.place();
    } else {
      mensaje = `${c.nombre} se queda sin dueño`;
    }
    subasta = null;
    finTurno(1.2);
  }

  /* ---------------- Construir ---------------- */

  /** Casa más barata que este jugador puede levantar ahora mismo. */
  function dondeConstruir(j) {
    const suyas = casillas.filter((c) => c.tipo === 'propiedad' && c.dueno === j.id
      && c.casas < CASAS_MAX && tieneGrupo(casillas, c.grupo, j.id));
    if (!suyas.length || j.dinero < PRECIO_CASA) return null;
    // Se construye parejo dentro del grupo, como manda el reglamento clásico.
    return suyas.sort((a, b) => a.casas - b.casas || a.precio - b.precio)[0];
  }

  function construir(j) {
    const c = dondeConstruir(j);
    if (!c) return false;
    j.dinero -= PRECIO_CASA;
    c.casas++;
    audio.place();
    haptics.play('click');
    mensaje = `${j.nombre} levanta una casa en ${c.nombre} (${c.casas})`;
    pintar();
    return true;
  }

  /* ---------------- Fin de turno ---------------- */

  let esperaFin = 0;
  function finTurno(espera = 0.5) {
    esperaFin = espera;
    fase = 'pasando';
    pintar();
  }

  function pasarTurno() {
    if (vivos().length <= 1) return terminar();
    const j = actual();
    // Los dobles repiten turno, salvo desde el calabozo.
    if (dobles > 0 && !j.arruinado && j.carcel === 0) {
      fase = 'turno';
      mensaje = `${j.nombre} repite por dobles`;
      botTimer = j.esBot ? mesa.demora() : 0;
      pintar();
      return;
    }
    let guarda = 0;
    do {
      turno = (turno + 1) % jugadores.length;
      if (turno === 0) ronda++;
    } while (jugadores[turno].arruinado && guarda++ < 8);
    dobles = 0;
    if (ronda > RONDAS) return terminar();
    fase = 'turno';
    mensaje = `Turno de ${actual().nombre}`;
    botTimer = actual().esBot ? mesa.demora() : 0;
    pintar();
  }

  function terminar() {
    if (acabado) return;
    acabado = true;
    fase = 'fin';
    const orden = [...jugadores].sort((a, b) => patrimonio(casillas, b) - patrimonio(casillas, a));
    const campeon = orden[0];
    const quedan = vivos();
    // Sin escapar: la pantalla de fin de partida ya escapa el detalle.
    const detalle = quedan.length === 1
      ? `${campeon.nombre} se queda el barrio entero`
      : `${campeon.nombre} cierra con ${patrimonio(casillas, campeon)} € de patrimonio`;
    ctx.finish({
      winner: campeon.equipo.slotShell,
      scores: [
        patrimonio(casillas, jugadores.find((j) => j.equipo.slotShell === 0) || { id: -9, dinero: 0 }),
        patrimonio(casillas, jugadores.find((j) => j.equipo.slotShell === 1) || { id: -9, dinero: 0 }),
      ],
      detail: detalle,
      record: ctx.record('patrimonio', patrimonio(casillas, campeon), 'high'),
    });
  }

  /* ---------------- Bots ---------------- */

  function pensarBot(dt) {
    const j = actual();
    botTimer -= dt;

    if (fase === 'subasta') {
      for (const b of vivos().filter((x) => x.esBot && subasta.lider !== x)) {
        const t = (subasta.timers.get(b.id) ?? 0) - dt;
        subasta.timers.set(b.id, t);
        if (t > 0) continue;
        subasta.timers.set(b.id, mesa.demora());
        const tope = mesa.tasar(b.equipo, valorPara(b, subasta.casilla));
        const coste = subasta.lider ? subasta.precio + PUJA_MIN : subasta.precio;
        if (coste <= tope * 0.8 && b.dinero >= coste) pujar(b);
      }
      return;
    }

    if (!j.esBot || botTimer > 0) return;
    botTimer = mesa.demora();

    if (fase === 'turno') {
      // Construir antes de tirar si le sobra dinero: los bots que ahorran
      // demasiado no dan partida.
      if (j.dinero > PRECIO_CASA * 2.4 && rng() < 0.6 && construir(j)) return;
      tirar();
    } else if (fase === 'decidir' && decision) {
      const c = decision.casilla;
      const vale = mesa.tasar(j.equipo, valorPara(j, c));
      const reserva = j.dinero - c.precio;
      if (vale >= c.precio && reserva > 120) comprar(j, c);
      else { decision = null; abrirSubasta(c); }
    }
  }

  /** Lo que una casilla vale PARA este jugador (completar grupo vale más). */
  function valorPara(j, c) {
    if (c.tipo === 'transporte') {
      const mios = casillas.filter((x) => x.tipo === 'transporte' && x.dueno === j.id).length;
      return c.precio * (1 + mios * 0.35);
    }
    const grupo = delGrupo(casillas, c.grupo);
    const mios = grupo.filter((x) => x.dueno === j.id).length;
    const rivales = grupo.filter((x) => x.dueno !== -1 && x.dueno !== j.id).length;
    // Completar grupo dobla el alquiler y abre las casas: se paga de más.
    if (mios === grupo.length - 1) return c.precio * 1.9;
    if (rivales === grupo.length - 1) return c.precio * 0.55;   // bloquear vale poco
    return c.precio * 1.05;
  }

  /* ---------------- Pintado ---------------- */

  function construirTablero() {
    el.innerHTML = `
      <div class="pr-mesa">
        <div class="pr-tablero" id="pr-tablero"></div>
        <div class="pr-panel">
          <div class="pr-jugadores" id="pr-jug"></div>
          <div class="pr-centro" id="pr-centro"></div>
        </div>
      </div>`;
    const t = el.querySelector('#pr-tablero');
    casillas.forEach((c, i) => {
      const [x, y] = coords[i];
      const d = document.createElement('div');
      d.className = `pr-casilla t-${c.tipo}`;
      d.style.gridColumn = x + 1;
      d.style.gridRow = y + 1;
      d.dataset.i = i;
      t.appendChild(d);
    });
    // Centro decorativo del tablero.
    const centro = document.createElement('div');
    centro.className = 'pr-logo';
    centro.style.gridArea = '2 / 2 / 8 / 8';
    centro.innerHTML = '<span>BARRIO<br>EN VENTA</span>';
    t.appendChild(centro);
    refrescarCasillas();
  }

  function refrescarCasillas() {
    const t = el.querySelector('#pr-tablero');
    if (!t) return;
    casillas.forEach((c, i) => {
      const d = t.querySelector(`[data-i="${i}"]`);
      if (!d) return;
      const g = c.grupo ? GRUPOS[c.grupo] : null;
      const dueno = c.dueno >= 0 ? jugadores[c.dueno] : null;
      d.style.setProperty('--g', g ? g.color : 'transparent');
      d.style.setProperty('--d', dueno ? dueno.color : 'transparent');
      d.classList.toggle('conDueno', !!dueno);
      d.innerHTML = `
        ${g ? '<i class="pr-banda"></i>' : ''}
        <span class="pr-nom">${escapeHtml(c.nombre)}</span>
        ${c.precio ? `<span class="pr-precio">${c.precio}</span>` : ''}
        ${c.casas ? `<span class="pr-casas">${'▲'.repeat(c.casas)}</span>` : ''}
        <span class="pr-fichas" data-fichas="${i}"></span>`;
    });
    colocarFichas();
  }

  function colocarFichas() {
    const t = el.querySelector('#pr-tablero');
    if (!t) return;
    t.querySelectorAll('[data-fichas]').forEach((s) => { s.innerHTML = ''; });
    for (const j of jugadores) {
      if (j.arruinado) continue;
      const s = t.querySelector(`[data-fichas="${j.pos}"]`);
      if (!s) continue;
      const f = document.createElement('i');
      f.className = 'pr-ficha' + (jugadores[turno] === j ? ' activo' : '');
      f.style.background = j.color;
      s.appendChild(f);
    }
  }

  function pintar() {
    if (!el || fase === 'config') return;
    refrescarCasillas();

    const jug = el.querySelector('#pr-jug');
    if (jug) {
      jug.innerHTML = jugadores.map((j) => `
        <div class="pr-j ${j === actual() ? 'turno' : ''} ${j.arruinado ? 'fuera' : ''}" style="--c:${j.color}">
          <b>${escapeHtml(j.nombre)}</b>
          <span class="pr-din">${j.dinero} €</span>
          <span class="pr-meta">${j.esBot ? j.equipo.caracter.nombre
            : j.equipo.puestos.map((p) => `<i>${p.teclas.etiqueta[0]}</i>`).join('')}
            ${j.carcel ? ' · preso' : ''}</span>
        </div>`).join('');
    }

    const centro = el.querySelector('#pr-centro');
    if (!centro) return;
    const j = actual();
    let cuerpo = `<p class="pr-msg">${mensaje}</p>`;

    if (fase === 'turno') {
      const casa = dondeConstruir(j);
      cuerpo += `<div class="pr-dados"><i>${dados[0] || '·'}</i><i>${dados[1] || '·'}</i></div>`;
      if (!j.esBot) {
        cuerpo += `<p class="pr-acciones"><b>acción</b> tira los dados`
          + (casa ? ` · <b>especial</b> construye en ${escapeHtml(casa.nombre)} (${PRECIO_CASA} €)` : '')
          + `</p>`;
      }
    } else if (fase === 'decidir' && decision) {
      const c = decision.casilla;
      cuerpo += `<div class="pr-carta" style="--g:${c.grupo ? GRUPOS[c.grupo].color : '#8a8a95'}">
          <b>${escapeHtml(c.nombre)}</b>
          <span>${c.precio} €</span>
          <span class="pr-alq">alquiler ${alquiler(casillas, c, j.id)} €</span>
        </div>`;
      if (!j.esBot) cuerpo += `<p class="pr-acciones"><b>acción</b> comprar · <b>especial</b> a subasta</p>`;
    } else if (fase === 'subasta' && subasta) {
      cuerpo += `<div class="pr-carta" style="--g:${subasta.casilla.grupo ? GRUPOS[subasta.casilla.grupo].color : '#8a8a95'}">
          <b>${escapeHtml(subasta.casilla.nombre)}</b>
          <span class="pr-puja">${subasta.precio} €</span>
          <span class="pr-alq">${subasta.lider ? `manda ${escapeHtml(subasta.lider.nombre)}` : 'sin pujas'}</span>
        </div>
        <div class="pr-reloj"><i style="width:${(subasta.reloj / RELOJ_SUBASTA) * 100}%"></i></div>
        <p class="pr-acciones">todos pujan con su <b>acción</b> (+${PUJA_MIN} €)</p>`;
    }
    centro.innerHTML = `<div class="pr-ronda">Ronda ${Math.min(ronda, RONDAS)} de ${RONDAS}</div>${cuerpo}`;
  }

  /* ---------------- Ciclo ---------------- */

  return {
    init() {
      inyectarEstilos();
      el = document.createElement('div');
      el.className = 'pr-wrap';
      ctx.root.appendChild(el);
      marcador = ctx.ui.scoreboard({ center: 'Barrio en Venta' });

      pantalla = pantallaMesa(ctx, {
        titulo: 'Barrio en Venta',
        subtitulo: 'Propiedades, alquileres y casas. Si no compras la casilla donde caes, sale a subasta para todos.',
        formatos: [
          { id: 'cuatro', etiqueta: '4 propietarios', equipos: 4, porEquipo: 1, nota: 'Cuatro en el tablero; los puestos que no ocupéis los llevan bots.' },
          { id: 'tres', etiqueta: '3 propietarios', equipos: 3, porEquipo: 1, nota: 'Partida más corta y con más calles libres por cabeza.' },
          { id: 'dos', etiqueta: '2 propietarios', equipos: 2, porEquipo: 1, nota: 'El clásico duelo: todo se decide en los grupos.' },
        ],
      }, (cfg) => { iniciarPartida(cfg); });
    },

    update(dt) {
      if (fase === 'config') { pantalla.actualizar(); return; }
      if (acabado) return;

      const j = actual();

      if (fase === 'moviendo') {
        animando -= dt;
        if (animando <= 0) { animando = 0.16; avanzarPaso(); }
      } else if (fase === 'pasando') {
        esperaFin -= dt;
        if (esperaFin <= 0) pasarTurno();
      } else if (fase === 'subasta' && subasta) {
        subasta.reloj -= dt;
        const barra = el.querySelector('.pr-reloj i');
        if (barra) barra.style.width = `${Math.max(0, (subasta.reloj / RELOJ_SUBASTA) * 100)}%`;
        for (const jj of vivos()) if (!jj.esBot && mesa.pulsoEquipo(jj.equipo, 'accion')) pujar(jj);
        if (subasta.reloj <= 0) cerrarSubasta();
      } else if (!j.esBot) {
        if (fase === 'turno') {
          if (mesa.pulsoEquipo(j.equipo, 'accion')) tirar();
          else if (mesa.pulsoEquipo(j.equipo, 'especial')) construir(j);
        } else if (fase === 'decidir' && decision) {
          if (mesa.pulsoEquipo(j.equipo, 'accion')) comprar(j, decision.casilla);
          else if (mesa.pulsoEquipo(j.equipo, 'especial')) { const c = decision.casilla; decision = null; abrirSubasta(c); }
        }
      }

      pensarBot(dt);

      const a = jugadores.find((x) => x.equipo.slotShell === 0);
      const b = jugadores.find((x) => x.equipo.slotShell === 1);
      marcador?.update(a ? a.dinero : 0, b ? b.dinero : 0);
      mesa.finFrame();
    },

    destroy() {
      pantalla?.cerrar();
      mesa?.destruir();
      marcador?.remove();
      el?.remove();
    },
  };
}

/* ---------------- Estilos ---------------- */

function inyectarEstilos() {
  if (document.getElementById('pr-css')) return;
  const s = document.createElement('style');
  s.id = 'pr-css';
  s.textContent = `
    .pr-wrap { position:absolute; inset:0; padding:58px 18px 14px; font-family:var(--font-ui, system-ui); color:var(--ink); }
    .pr-mesa { height:100%; display:grid; grid-template-columns: minmax(0, 1fr) 260px; gap:16px; }
    .pr-tablero { display:grid; grid-template-columns:repeat(8, 1fr); grid-template-rows:repeat(8, 1fr);
      gap:3px; aspect-ratio:1; max-height:100%; margin:0 auto; }
    .pr-casilla { position:relative; border-radius:6px; background:#ffffff0a; border:1px solid var(--line);
      padding:3px 2px 2px; font-size:8px; line-height:1.15; overflow:hidden; text-align:center; }
    .pr-casilla.conDueno { box-shadow: inset 0 0 0 2px var(--d); }
    .pr-banda { position:absolute; inset:0 0 auto 0; height:6px; background:var(--g); }
    .pr-nom { display:block; margin-top:7px; color:var(--ink-dim); }
    .pr-precio { display:block; font-family:var(--font-display); font-size:9px; }
    .pr-casas { display:block; color:#a8ff3e; font-size:8px; }
    .pr-fichas { position:absolute; bottom:2px; left:0; right:0; display:flex; gap:2px; justify-content:center; }
    .pr-ficha { width:8px; height:8px; border-radius:50%; box-shadow:0 0 0 1px #0008; }
    .pr-ficha.activo { box-shadow:0 0 0 2px #fff; }
    .pr-casilla.t-salida, .pr-casilla.t-carcel, .pr-casilla.t-parking, .pr-casilla.t-alacarcel { background:#ffffff14; }
    .pr-casilla.t-suerte { background:#ffd16618; }
    .pr-casilla.t-impuesto { background:#ff475718; }
    .pr-logo { display:grid; place-items:center; font-family:var(--font-display); font-size:20px;
      color:#ffffff22; text-align:center; letter-spacing:.08em; }
    .pr-panel { display:flex; flex-direction:column; gap:10px; min-height:0; }
    .pr-jugadores { display:flex; flex-direction:column; gap:6px; }
    .pr-j { padding:6px 10px; border-radius:9px; background:#ffffff08; border-left:4px solid var(--c);
      font-size:12px; }
    .pr-j.turno { background:#ffffff18; box-shadow:0 0 0 1px var(--c) inset; }
    .pr-j.fuera { opacity:.35; text-decoration:line-through; }
    .pr-j b { display:block; }
    .pr-din { font-family:var(--font-display); font-size:14px; }
    .pr-meta { font-size:10px; color:var(--ink-dim); }
    .pr-meta i { font-style:normal; padding:0 4px; border-radius:4px; background:#ffffff18;
      font-family:var(--font-mono, monospace); }
    .pr-centro { flex:1; padding:12px; border-radius:12px; background:#ffffff08; border:1px solid var(--line);
      display:flex; flex-direction:column; gap:8px; align-items:center; text-align:center; overflow:auto; }
    .pr-ronda { font-size:11px; color:var(--ink-dim); letter-spacing:.1em; text-transform:uppercase; }
    .pr-msg { font-size:13px; margin:0; line-height:1.45; }
    .pr-dados { display:flex; gap:8px; }
    .pr-dados i { width:34px; height:34px; border-radius:8px; background:#f2f2f2; color:#14141c;
      display:grid; place-items:center; font-style:normal; font-family:var(--font-display); font-size:17px; }
    .pr-acciones { font-size:11px; color:var(--ink-dim); margin:0; }
    .pr-acciones b { color:var(--ink); }
    .pr-carta { width:100%; padding:10px; border-radius:10px; background:#ffffff0c;
      border-top:6px solid var(--g); }
    .pr-carta b { display:block; font-size:13px; }
    .pr-carta span { display:block; font-family:var(--font-display); font-size:18px; }
    .pr-carta .pr-alq { font-family:var(--font-ui, system-ui); font-size:11px; color:var(--ink-dim); }
    .pr-puja { color:#ffd166; }
    .pr-reloj { width:100%; height:6px; border-radius:4px; background:#ffffff14; overflow:hidden; }
    .pr-reloj i { display:block; height:100%; background:#ffd166; }
  `;
  document.head.appendChild(s);
}
