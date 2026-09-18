/**
 * runtime.js — el intérprete: juega una receta.
 *
 * Devuelve un objeto con la MISMA forma que cualquier `game.js` escrito a
 * mano (`init`, `update`, `render`, `destroy`), así que el shell no se entera
 * de que esto no es un juego normal: se carga igual, tiene marcador, pausa,
 * cuenta atrás, torneo y récords. Ésa es toda la gracia de haber separado el
 * shell del juego desde el principio.
 *
 * Y no reimplementa nada: colisiones y rebote de core/math2d.js, partículas y
 * sonido del contexto, bots de core/bot.js, personajes de core/personaje.js.
 * Una receta tiene acceso a lo mismo que un juego escrito a mano.
 */

import { normalizar } from './formato.js';
import { PIEZAS, crearPieza } from './piezas.js';
import { evalua, encaja } from './reglas.js';
import { crearBot } from '../bot.js';
import { clamp, aabb, circleHit, circleRect, elasticBounce, rad } from '../math2d.js';
import { dibujarPersonaje, personajeDe } from '../personaje.js';

/** Caja envolvente de una entidad, para las colisiones. */
const caja = (e) => ({ x: e.x - e.ancho / 2, y: e.y - e.alto / 2, w: e.ancho, h: e.alto });
const esCirculo = (e) => (PIEZAS[e.tipo]?.forma === 'circulo');

export function crearDesdeReceta(ctx, recetaCruda) {
  const { input, audio, haptics, players, particles } = ctx;
  const receta = normalizar(recetaCruda);
  const A = receta.arena;

  /* La arena tiene medidas lógicas propias y se escala al lienzo. Así una
     receta se ve igual en cualquier ventana, que es imprescindible si la vas
     a compartir con alguien que tiene otra pantalla. */
  let escala = 1, offX = 0, offY = 0;
  function encuadrar() {
    escala = Math.min(ctx.W / A.ancho, ctx.H / A.alto);
    offX = (ctx.W - A.ancho * escala) / 2;
    offY = (ctx.H - A.alto * escala) / 2;
  }

  let ents = [];
  let puntos = [0, 0];
  let vidas = [receta.ajustes.vidas, receta.ajustes.vidas];
  let tiempo = 0;
  let acabado = false;
  let sb = null;
  let mensaje = '', mensajeT = 0;
  const sucesos = [];
  const bots = new Map();

  function nace(pieza) {
    const def = PIEZAS[pieza.tipo] || PIEZAS.muro;
    const e = {
      ...pieza,
      def,
      vx: 0, vy: 0,
      vivo: true,
      turbo: 1, turboT: 0,
      reaparece: 0,
      generado: 0,
      slot: pieza.props?.slot ?? null,
    };
    if (pieza.tipo === 'bot') {
      bots.set(e, crearBot({ dificultad: pieza.props?.dificultad || 'normal', rng: ctx.rng }));
    }
    ents.push(e);
    return e;
  }

  function reiniciar() {
    ents = [];
    bots.clear();
    for (const p of receta.piezas) nace({ ...p, props: { ...p.props } });
    puntos = [0, 0];
    vidas = [receta.ajustes.vidas, receta.ajustes.vidas];
    tiempo = 0;
    acabado = false;
    for (const g of receta.reglas) g.disparada = false;
    sucesos.push({ tipo: 'inicio' });
  }

  const decir = (t, s = 2) => { mensaje = t; mensajeT = s; };

  function terminar(ganador) {
    if (acabado) return;
    acabado = true;
    let g = ganador;
    if (g === 'puntos') g = puntos[0] === puntos[1] ? -1 : (puntos[0] > puntos[1] ? 0 : 1);
    setTimeout(() => ctx.finish({
      winner: g, scores: puntos,
      detail: `${puntos[0]} – ${puntos[1]}`,
    }), 700);
  }

  function sumar(slot, cantidad) {
    if (slot !== 0 && slot !== 1) return;
    puntos[slot] += cantidad;
    sb?.update(puntos[0], puntos[1]);
    sucesos.push({ tipo: 'puntos', slot });
    if (receta.ajustes.paraGanar > 0 && puntos[slot] >= receta.ajustes.paraGanar) terminar(slot);
  }

  function morir(e) {
    if (!e.vivo) return;
    e.vivo = false;
    particles.burst(e.x, e.y, 18, { speed: 220, color: colorDe(e), size: 4, drag: 0.9 });
    audio.explosion();
    sucesos.push({ tipo: 'muerte', entidad: e, slot: e.slot });
    if (e.slot === 0 || e.slot === 1) {
      haptics.explosion(e.slot);
      if (receta.ajustes.vidas > 0) {
        vidas[e.slot]--;
        if (vidas[e.slot] <= 0) { terminar(1 - e.slot); return; }
      }
      // Reaparece donde empezó: en una arena, eliminar al jugador para siempre
      // convierte la partida en mirar la pantalla.
      const orig = receta.piezas.find((p) => p.id === e.id);
      setTimeout(() => {
        if (acabado) return;
        e.vivo = true;
        e.x = orig?.x ?? A.ancho / 2;
        e.y = orig?.y ?? A.alto / 2;
        e.vx = e.vy = 0;
      }, 900);
    }
  }

  const colorDe = (e) => e.color
    || (e.tipo === 'jugador' && e.slot != null ? players[e.slot].color : null)
    || e.def.color || '#8f98a6';

  /** Resuelve un «objetivo» de una acción a una lista de entidades. */
  function resolver(objetivo, etiqueta, ctxDisparo) {
    switch (objetivo) {
      case 'causante': return ctxDisparo.causante ? [ctxDisparo.causante] : [];
      case 'otro': return ctxDisparo.otro ? [ctxDisparo.otro] : [];
      case 'jugador1': return ents.filter((e) => e.tipo === 'jugador' && e.slot === 0);
      case 'jugador2': return ents.filter((e) => e.tipo === 'jugador' && e.slot === 1);
      case 'etiqueta': return ents.filter((e) => encaja(e, etiqueta));
      default: return [];
    }
  }

  function ejecutar(accion, d) {
    const objetivos = () => resolver(accion.objetivo, accion.etiqueta, d);
    switch (accion.tipo) {
      case 'puntos': {
        const slot = accion.a === 'causante'
          ? (d.causante?.slot ?? d.causanteSlot ?? null) : accion.a;
        sumar(slot, accion.cantidad ?? 1);
        break;
      }
      case 'eliminar': for (const e of objetivos()) e.vivo = false; break;
      case 'matar': for (const e of objetivos()) morir(e); break;
      case 'teletransportar':
        for (const e of objetivos()) { e.x = accion.x ?? e.x; e.y = accion.y ?? e.y; e.vx = e.vy = 0; }
        break;
      case 'velocidad':
        for (const e of objetivos()) { e.turbo = accion.factor ?? 1.5; e.turboT = accion.durante ?? 5; }
        break;
      case 'empujar': {
        const a = rad(accion.direccion ?? 0), f = accion.fuerza ?? 300;
        for (const e of objetivos()) { e.vx += Math.cos(a) * f; e.vy += Math.sin(a) * f; }
        break;
      }
      case 'generar': {
        const n = accion.cuantas ?? 1;
        for (let i = 0; i < n; i++) {
          const x = accion.alAzar === 'azar' ? ctx.rng() * A.ancho : (accion.x ?? A.ancho / 2);
          const y = accion.alAzar === 'azar' ? ctx.rng() * A.alto : (accion.y ?? A.alto / 2);
          nace({ ...crearPieza(accion.que || 'moneda', x, y), id: `g${ents.length}` });
        }
        break;
      }
      case 'mensaje': decir(accion.texto || '', accion.segundos ?? 2); break;
      case 'sonido': audio[accion.cual]?.(); break;
      case 'terminar': {
        const g = accion.ganador === 'causante'
          ? (d.causante?.slot ?? d.causanteSlot ?? -1) : accion.ganador;
        terminar(g);
        break;
      }
      default: break;
    }
  }

  /** Pasa todos los sucesos del fotograma por todas las reglas. */
  function aplicarReglas(dt) {
    const estado = { tiempo, dt, puntos };
    const lista = sucesos.splice(0, sucesos.length);
    // Los disparadores de tiempo no vienen de un suceso: se prueban siempre.
    lista.push({ tipo: '_reloj' });
    for (const g of receta.reglas) {
      if (g.unaVez && g.disparada) continue;
      for (const s of lista) {
        const d = evalua(g, s, estado);
        if (!d) continue;
        g.disparada = true;
        for (const a of g.entonces) ejecutar(a, d);
        break;
      }
    }
  }

  /* ---------------- Movimiento ---------------- */

  function mueveActores(dt) {
    for (const e of ents) {
      if (!e.vivo || !e.def.movil) continue;
      if (e.turboT > 0) { e.turboT -= dt; if (e.turboT <= 0) e.turbo = 1; }

      const vel = (e.props.velocidad ?? 240) * e.turbo;

      if (e.tipo === 'jugador' && e.slot != null) {
        const p = input.player(e.slot);
        const ax = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
        const ay = (p.held('down') ? 1 : 0) - (p.held('up') ? 1 : 0);
        const n = Math.hypot(ax, ay) || 1;
        e.vx += (ax / n) * vel * 7 * dt;
        e.vy += (ay / n) * vel * 7 * dt;
      } else if (e.tipo === 'bot') {
        const bot = bots.get(e);
        const objetivo = objetivoDelBot(e);
        if (objetivo && !bot.distraido) {
          const bx = bot.percibir(objetivo.x, dt, { escalaError: A.ancho * 0.25 });
          const by = bot.percibir(objetivo.y, dt, { escalaError: A.alto * 0.25 });
          let dx = bx - e.x, dy = by - e.y;
          if (e.props.persigue === 'huye') { dx = -dx; dy = -dy; }
          const n = Math.hypot(dx, dy) || 1;
          const t = bot.dificultad.tope;
          e.vx += (dx / n) * vel * t * 7 * dt;
          e.vy += (dy / n) * vel * t * 7 * dt;
        }
      }

      // Rozamiento, y el del suelo que se esté pisando.
      let fric = A.friccion;
      let factor = 1;
      for (const s of ents) {
        if (!s.vivo || !s.def.suelo) continue;
        if (!aabb(caja(e), caja(s))) continue;
        if (s.tipo === 'hielo') fric = s.props.friccion ?? 0.3;
        if (s.tipo === 'lento') factor = s.props.factor ?? 0.45;
        if (s.tipo === 'cinta') {
          const a = rad(s.props.direccion ?? 0);
          e.vx += Math.cos(a) * (s.props.fuerza ?? 260) * dt;
          e.vy += Math.sin(a) * (s.props.fuerza ?? 260) * dt;
        }
      }
      e.vx *= Math.exp(-fric * dt);
      e.vy *= Math.exp(-fric * dt);
      const tope = vel * factor;
      const v = Math.hypot(e.vx, e.vy);
      if (v > tope) { e.vx = (e.vx / v) * tope; e.vy = (e.vy / v) * tope; }

      e.x += e.vx * dt;
      e.y += e.vy * dt;

      if (A.muros) {
        const r = e.ancho / 2;
        if (e.x < r) { e.x = r; e.vx = Math.abs(e.vx) * (e.def.fisica ? (e.props.rebote ?? 0.8) : 0); }
        if (e.x > A.ancho - r) { e.x = A.ancho - r; e.vx = -Math.abs(e.vx) * (e.def.fisica ? (e.props.rebote ?? 0.8) : 0); }
        if (e.y < r) { e.y = r; e.vy = Math.abs(e.vy) * (e.def.fisica ? (e.props.rebote ?? 0.8) : 0); }
        if (e.y > A.alto - r) { e.y = A.alto - r; e.vy = -Math.abs(e.vy) * (e.def.fisica ? (e.props.rebote ?? 0.8) : 0); }
      }
    }
  }

  function objetivoDelBot(e) {
    const modo = e.props.persigue || 'jugador';
    if (modo === 'moneda') {
      const m = ents.filter((o) => o.vivo && o.def.recoge)
        .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
      if (m) return m;
    }
    if (modo === 'patrulla') {
      return { x: A.ancho / 2 + Math.cos(tiempo * 0.6) * A.ancho * 0.35,
               y: A.alto / 2 + Math.sin(tiempo * 0.8) * A.alto * 0.35 };
    }
    return ents.find((o) => o.vivo && o.tipo === 'jugador');
  }

  function generadores(dt) {
    for (const g of ents) {
      if (!g.vivo || g.tipo !== 'generador') continue;
      g.generado -= dt;
      if (g.generado > 0) continue;
      g.generado = g.props.cada ?? 3;
      const vivos = ents.filter((e) => e.vivo && e.nacidoDe === g.id).length;
      if (vivos >= (g.props.tope ?? 6)) continue;
      const n = nace({ ...crearPieza(g.props.que || 'moneda', g.x, g.y), id: `s${ents.length}` });
      n.nacidoDe = g.id;
      const imp = g.props.impulso ?? 0;
      if (imp) {
        const a = ctx.rng() * Math.PI * 2;
        n.vx = Math.cos(a) * imp;
        n.vy = Math.sin(a) * imp;
      }
    }
  }

  function colisiones() {
    const vivos = ents.filter((e) => e.vivo);
    for (let i = 0; i < vivos.length; i++) {
      for (let j = i + 1; j < vivos.length; j++) {
        const a = vivos[i], b = vivos[j];
        if (!tocan(a, b)) continue;
        sucesos.push({ tipo: 'choque', a, b });
        resolverPar(a, b);
        resolverPar(b, a);
        // Sólido contra sólido: se separan y rebotan.
        if (a.def.solido && b.def.solido && (a.def.movil || b.def.movil)) separar(a, b);
      }
    }
  }

  function tocan(a, b) {
    if (esCirculo(a) && esCirculo(b)) {
      return circleHit({ x: a.x, y: a.y, r: a.ancho / 2 }, { x: b.x, y: b.y, r: b.ancho / 2 });
    }
    if (esCirculo(a)) return circleRect(a.x, a.y, a.ancho / 2, b.x - b.ancho / 2, b.y - b.alto / 2, b.ancho, b.alto);
    if (esCirculo(b)) return circleRect(b.x, b.y, b.ancho / 2, a.x - a.ancho / 2, a.y - a.alto / 2, a.ancho, a.alto);
    return aabb(caja(a), caja(b));
  }

  /** Efectos de `a` sobre `b`: matar, recogerse, ganar. */
  function resolverPar(a, b) {
    if (!b.def.movil || !b.vivo) return;
    if (a.def.mata && b.tipo !== a.tipo) { morir(b); return; }
    if (a.def.recoge && (b.tipo === 'jugador' || b.tipo === 'bot')) {
      a.vivo = false;
      audio.pickup();
      particles.burst(a.x, a.y, 10, { speed: 150, color: colorDe(a), size: 3, drag: 0.9 });
      sucesos.push({ tipo: 'recoge', quien: b, objeto: a });
      sumar(b.slot, a.props.puntos ?? 1);
      if (a.props.reaparece > 0) setTimeout(() => { if (!acabado) a.vivo = true; }, a.props.reaparece * 1000);
      return;
    }
    if (a.tipo === 'meta' && a.props.gana && (b.tipo === 'jugador' || b.tipo === 'bot')) {
      audio.win();
      terminar(b.slot ?? 1);
    }
  }

  /**
   * Separa dos sólidos y les aplica el rebote.
   *
   * `elasticBounce()` exige `r` en los dos y MUTA los objetos que recibe, así
   * que hay que darle discos de verdad y copiar el resultado de vuelta. Con
   * copias sin radio devolvía NaN y no rebotaba nada: parecían imanes.
   */
  function separar(a, b) {
    const movA = a.def.movil, movB = b.def.movil;
    if (!movA && !movB) return;

    // Contra algo inmóvil no hay choque elástico: se empuja fuera y se refleja.
    if (!movA || !movB) {
      const fijo = movA ? b : a;
      const libre = movA ? a : b;
      const dx = libre.x - fijo.x, dy = libre.y - fijo.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const solape = (libre.ancho + fijo.ancho) / 2 - d;
      if (solape <= 0) return;
      const nx = dx / d, ny = dy / d;
      libre.x += nx * solape;
      libre.y += ny * solape;
      const rebote = fijo.props?.rebota || libre.def.fisica ? (libre.props.rebote ?? 0.7) : 0;
      const vn = libre.vx * nx + libre.vy * ny;
      if (vn < 0) {
        libre.vx -= (1 + rebote) * vn * nx;
        libre.vy -= (1 + rebote) * vn * ny;
      }
      return;
    }

    const da = { x: a.x, y: a.y, vx: a.vx, vy: a.vy, r: a.ancho / 2, m: a.props.masa ?? 1 };
    const db = { x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.ancho / 2, m: b.props.masa ?? 1 };
    if (!elasticBounce(da, db, Math.max(a.props.rebote ?? 0.6, b.props.rebote ?? 0.6))) return;
    a.x = da.x; a.y = da.y; a.vx = da.vx; a.vy = da.vy;
    b.x = db.x; b.y = db.y; b.vx = db.vx; b.vy = db.vy;
  }

  /* ---------------- Dibujo ---------------- */

  function pintarPieza(g, e) {
    const col = colorDe(e);
    const x = e.x, y = e.y, w = e.ancho, h = e.alto;

    if (e.tipo === 'jugador' && e.props.personaje !== false && e.slot != null) {
      dibujarPersonaje(g, personajeDe(players[e.slot], e.slot), x, y + h / 2, h * 1.5, {
        acento: players[e.slot].color,
        mirando: e.vx < -4 ? -1 : 1,
        pose: Math.hypot(e.vx, e.vy) > 20 ? 'anda' : 'quieto',
        frame: Math.floor(tiempo * 8) % 4,
      });
      return;
    }

    g.fillStyle = col;
    switch (e.def.forma) {
      case 'circulo':
        g.beginPath(); g.arc(x, y, w / 2, 0, Math.PI * 2); g.fill();
        break;
      case 'sierra': {
        const dientes = Math.max(2, Math.round(w / 18));
        g.beginPath();
        g.moveTo(x - w / 2, y + h / 2);
        for (let i = 0; i < dientes; i++) {
          g.lineTo(x - w / 2 + (i + 0.5) * (w / dientes), y - h / 2);
          g.lineTo(x - w / 2 + (i + 1) * (w / dientes), y + h / 2);
        }
        g.closePath(); g.fill();
        break;
      }
      case 'diamante':
        g.beginPath();
        g.moveTo(x, y - h / 2); g.lineTo(x + w / 2, y);
        g.lineTo(x, y + h / 2); g.lineTo(x - w / 2, y);
        g.closePath(); g.fill();
        break;
      default:
        if (e.def.zona || e.def.suelo) {
          g.globalAlpha = 0.24;
          g.fillRect(x - w / 2, y - h / 2, w, h);
          g.globalAlpha = 1;
          g.strokeStyle = col; g.lineWidth = 2;
          g.strokeRect(x - w / 2, y - h / 2, w, h);
        } else {
          g.fillRect(x - w / 2, y - h / 2, w, h);
        }
    }
  }

  return {
    init() {
      encuadrar();
      reiniciar();
      sb = ctx.ui.scoreboard({ center: receta.nombre });
      sb.update(0, 0);
    },

    resize() { encuadrar(); },

    update(dt) {
      if (mensajeT > 0) mensajeT -= dt;
      if (acabado) { particles.update(dt); return; }
      tiempo += dt;

      generadores(dt);
      mueveActores(dt);
      colisiones();
      aplicarReglas(dt);
      particles.update(dt);

      ents = ents.filter((e) => e.vivo || e.def.recoge || e.tipo === 'jugador');

      if (receta.ajustes.duracion > 0) {
        const queda = receta.ajustes.duracion - tiempo;
        sb?.setCenter(`${Math.max(0, Math.ceil(queda))} s`);
        if (queda <= 0) terminar('puntos');
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear(A.fondo);
      g.save();
      g.translate(offX, offY);
      g.scale(escala, escala);

      if (A.reja) {
        g.strokeStyle = '#ffffff0d';
        g.lineWidth = 1;
        for (let x = 0; x <= A.ancho; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, A.alto); g.stroke(); }
        for (let y = 0; y <= A.alto; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(A.ancho, y); g.stroke(); }
      }
      g.strokeStyle = '#ffffff26';
      g.lineWidth = 3;
      g.strokeRect(0, 0, A.ancho, A.alto);

      // Zonas y suelos primero: son el fondo sobre el que pasa todo.
      for (const e of ents) if (e.vivo && (e.def.zona || e.def.suelo)) pintarPieza(g, e);
      for (const e of ents) if (e.vivo && !e.def.zona && !e.def.suelo && !e.def.movil) pintarPieza(g, e);
      particles.render(g);
      for (const e of ents) if (e.vivo && e.def.movil) pintarPieza(g, e);
      g.restore();

      if (mensajeT > 0) {
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        g.font = 'bold 26px system-ui, sans-serif';
        g.fillText(mensaje, ctx.W / 2, ctx.H * 0.18);
      }
    },

    destroy() { sb?.remove(); },
  };
}
