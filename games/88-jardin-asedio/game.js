/**
 * Jardín Bajo Asedio — defensa de torres cooperativa, a lo Plantas vs Zombis.
 *
 * Los dos defienden el MISMO jardín con una economía COMPARTIDA: el sol es de
 * los dos, así que plantar algo caro es una decisión conjunta, no individual.
 * Cada uno lleva su propio cursor y puede plantar en cualquier carril, pero si
 * uno se gasta el sol en girasoles el otro se queda sin defensas — de ahí sale
 * la conversación.
 *
 * Si un bicho llega al borde izquierdo, pierden los dos. No hay ganador
 * individual: o aguantan las oleadas o caen juntos.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const CARRILES = 5;
const COLS = 9;
const OLEADAS = 8;

const PLANTAS = [
  { id: 'girasol',  nom: 'Girasol',  cost: 50,  vida: 60,  ic: 'sol',    col: '#ffd166', desc: 'Produce sol' },
  { id: 'guisante', nom: 'Guisante', cost: 100, vida: 70,  ic: 'bala',   col: '#3fbf5a', desc: 'Dispara al frente' },
  { id: 'muro',     nom: 'Muro',     cost: 50,  vida: 320, ic: 'muro',   col: '#b08a5a', desc: 'Aguanta mordiscos' },
  { id: 'hielo',    nom: 'Hielo',    cost: 175, vida: 70,  ic: 'hielo',  col: '#6fd0f0', desc: 'Dispara y ralentiza' },
  { id: 'mina',     nom: 'Mina',     cost: 25,  vida: 1,   ic: 'mina',   col: '#ff4757', desc: 'Explota al contacto' },
];

const BICHOS = [
  { id: 'basico', vida: 100, vel: 14, dano: 12, col: '#9a7fb8' },
  { id: 'casco',  vida: 220, vel: 12, dano: 14, col: '#7f9ab8' },
  { id: 'rapido', vida: 80,  vel: 26, dano: 10, col: '#b87f9a' },
  { id: 'bruto',  vida: 420, vel: 9,  dano: 22, col: '#b8967f' },
];

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let celda = 62, offX = 0, offY = 0;

  let sol = 150;                 // economía COMPARTIDA
  let rejilla = [];              // [fila][col] = planta | null
  let bichos = [], balas = [], soles = [];
  let oleada = 0, enOleada = false, restanPorSalir = 0, tSalida = 0, tOleada = 4;
  let tSolNatural = 0;
  let estado = 'jugando';        // jugando | fin
  let aviso = 'Preparen la defensa', avisoT = 3;
  let tiempo = 0;
  const plantadas = [0, 0];      // cuántas plantó cada uno

  const cur = [
    { x: 1, y: 1, sel: 0, mov: 0 },
    { x: 1, y: 3, sel: 1, mov: 0 },
  ];

  function medir() {
    celda = Math.floor(Math.min((W - 150) / COLS, (H - 190) / CARRILES));
    celda = clamp(celda, 34, 78);
    offX = Math.floor((W - COLS * celda) / 2) + 20;
    offY = Math.floor((H - CARRILES * celda) / 2) + 22;
  }

  function reset() {
    rejilla = Array.from({ length: CARRILES }, () => new Array(COLS).fill(null));
    bichos = []; balas = []; soles = [];
    sol = 150; oleada = 0; enOleada = false; tOleada = 4;
    estado = 'jugando'; tiempo = 0;
  }

  const decir = (t) => { aviso = t; avisoT = 2.6; };
  const cx = (col) => offX + col * celda + celda / 2;
  const cy = (fil) => offY + fil * celda + celda / 2;

  function plantar(j) {
    const c = cur[j];
    const def = PLANTAS[c.sel];
    if (rejilla[c.y][c.x]) { decir('Ya hay algo ahí'); audio.error(); return; }
    if (sol < def.cost) { decir(`Faltan ${def.cost - sol} de sol`); audio.error(); haptics.error(j); return; }
    sol -= def.cost;
    rejilla[c.y][c.x] = { ...def, vida: def.vida, vidaMax: def.vida, t: 0, por: j };
    plantadas[j]++;
    audio.blip();
    haptics.play('soft', { player: j });
    particles.burst(cx(c.x), cy(c.y), 10, { speed: 120, dir: -Math.PI / 2, spread: Math.PI * 2, color: def.col, size: 2.2, drag: 0.91 });
  }

  function quitar(j) {
    const c = cur[j];
    if (!rejilla[c.y][c.x]) return;
    sol += Math.floor(rejilla[c.y][c.x].cost * 0.4);
    rejilla[c.y][c.x] = null;
    audio.back();
  }

  function recogerSol(j) {
    const c = cur[j];
    const px = cx(c.x), py = cy(c.y);
    for (let i = soles.length - 1; i >= 0; i--) {
      const s = soles[i];
      if (Math.hypot(s.x - px, s.y - py) < celda * 0.85) {
        sol += s.valor;
        soles.splice(i, 1);
        audio.tone({ freq: 620, dur: 0.07, gain: 0.12, type: 'sine' });
        return true;
      }
    }
    return false;
  }

  function lanzarOleada() {
    oleada++;
    enOleada = true;
    restanPorSalir = 3 + oleada * 2;
    tSalida = 0;
    decir(`Oleada ${oleada} de ${OLEADAS}`);
    audio.arp([330, 262, 220], 0.14);
    haptics.play('impact');
  }

  function sacarBicho() {
    const dificultad = oleada / OLEADAS;
    let pool = [BICHOS[0]];
    if (oleada >= 2) pool.push(BICHOS[2]);
    if (oleada >= 3) pool.push(BICHOS[1]);
    if (oleada >= 5) pool.push(BICHOS[3]);
    const def = pool[Math.floor(Math.random() * pool.length)];
    bichos.push({
      ...def,
      vida: def.vida * (1 + dificultad * 0.5),
      vidaMax: def.vida * (1 + dificultad * 0.5),
      fila: Math.floor(Math.random() * CARRILES),
      x: offX + COLS * celda + 20,
      lento: 0, come: null, t: 0,
    });
  }

  function actualizar(dt) {
    tiempo += dt;
    if (avisoT > 0) avisoT -= dt;

    // Sol natural del cielo
    tSolNatural += dt;
    if (tSolNatural > 7) {
      tSolNatural = 0;
      soles.push({ x: offX + Math.random() * COLS * celda, y: offY - 20, vy: 26, valor: 25, vida: 14 });
    }

    // Oleadas
    if (!enOleada) {
      tOleada -= dt;
      if (tOleada <= 0) {
        if (oleada >= OLEADAS) return ganar();
        lanzarOleada();
      }
    } else {
      tSalida -= dt;
      if (restanPorSalir > 0 && tSalida <= 0) {
        sacarBicho(); restanPorSalir--;
        tSalida = clamp(2.4 - oleada * 0.14, 0.5, 2.4);
      }
      if (restanPorSalir === 0 && bichos.length === 0) {
        enOleada = false;
        tOleada = 6;
        sol += 25;
        decir(`Oleada ${oleada} despejada · +25 sol`);
        audio.win();
      }
    }

    // Plantas
    for (let f = 0; f < CARRILES; f++) {
      for (let c = 0; c < COLS; c++) {
        const p = rejilla[f][c];
        if (!p) continue;
        p.t += dt;

        if (p.id === 'girasol' && p.t > 6) {
          p.t = 0;
          soles.push({ x: cx(c), y: cy(f), vy: 0, valor: 25, vida: 12 });
        }
        if ((p.id === 'guisante' || p.id === 'hielo') && p.t > (p.id === 'hielo' ? 1.9 : 1.4)) {
          // Solo dispara si hay un bicho en su carril y por delante.
          if (bichos.some((b) => b.fila === f && b.x > cx(c) - celda * 0.3)) {
            p.t = 0;
            balas.push({ x: cx(c) + celda * 0.28, y: cy(f), fila: f, vel: 340, dano: 25, hiela: p.id === 'hielo' });
            audio.tone({ freq: p.id === 'hielo' ? 700 : 480, dur: 0.045, gain: 0.07, type: 'square' });
          }
        }
        if (p.id === 'mina') {
          const victima = bichos.find((b) => b.fila === f && Math.abs(b.x - cx(c)) < celda * 0.5);
          if (victima && p.t > 2) {
            victima.vida -= 900;
            rejilla[f][c] = null;
            particles.burst(cx(c), cy(f), 22, { speed: 230, dir: -Math.PI / 2, spread: Math.PI * 2, color: '#ff4757', size: 3, shape: 'spark', drag: 0.93 });
            audio.explosion(); ctx.shake(4, 6);
          }
        }
      }
    }

    // Balas
    for (let i = balas.length - 1; i >= 0; i--) {
      const b = balas[i];
      b.x += b.vel * dt;
      const golpe = bichos.find((z) => z.fila === b.fila && Math.abs(z.x - b.x) < celda * 0.42);
      if (golpe) {
        golpe.vida -= b.dano;
        if (b.hiela) golpe.lento = 3;
        particles.burst(b.x, b.y, 4, { speed: 90, dir: 0, spread: Math.PI, color: b.hiela ? '#6fd0f0' : '#a8ff3e', size: 1.8, drag: 0.88 });
        balas.splice(i, 1);
        continue;
      }
      if (b.x > offX + COLS * celda + 40) balas.splice(i, 1);
    }

    // Soles cayendo
    for (let i = soles.length - 1; i >= 0; i--) {
      const s = soles[i];
      s.y += s.vy * dt;
      s.vida -= dt;
      if (s.vida <= 0) soles.splice(i, 1);
    }

    // Bichos
    for (let i = bichos.length - 1; i >= 0; i--) {
      const b = bichos[i];
      b.t += dt;
      if (b.lento > 0) b.lento -= dt;

      if (b.vida <= 0) {
        particles.burst(b.x, cy(b.fila), 14, { speed: 170, dir: -Math.PI / 2, spread: Math.PI * 2, color: b.col, size: 2.6, drag: 0.92 });
        bichos.splice(i, 1);
        audio.tone({ freq: 150, dur: 0.1, gain: 0.1, type: 'sawtooth' });
        continue;
      }

      // ¿Hay planta justo delante en su carril?
      const colDelante = Math.floor((b.x - offX - celda * 0.35) / celda);
      const p = colDelante >= 0 && colDelante < COLS ? rejilla[b.fila][colDelante] : null;

      if (p) {
        b.come = p;
        if (b.t > 0.7) {
          b.t = 0;
          p.vida -= b.dano;
          audio.tone({ freq: 110, dur: 0.05, gain: 0.06, type: 'square' });
          if (p.vida <= 0) {
            rejilla[b.fila][colDelante] = null;
            particles.burst(cx(colDelante), cy(b.fila), 10, { speed: 120, dir: -Math.PI / 2, spread: Math.PI * 2, color: p.col, size: 2.2, drag: 0.91 });
          }
        }
      } else {
        b.come = null;
        b.x -= b.vel * (b.lento > 0 ? 0.42 : 1) * dt;
      }

      if (b.x < offX - 10) return perder();
    }

    particles.update(dt);
  }

  function ganar() {
    if (estado === 'fin') return;
    estado = 'fin';
    ctx.finish({
      winner: -1,
      scores: [plantadas[0], plantadas[1]],
      detail: `¡Jardín defendido! ${OLEADAS} oleadas en ${Math.round(tiempo)}s`,
      record: ctx.record('tiempo', Math.round(tiempo), 'low'),
    });
  }

  function perder() {
    if (estado === 'fin') return;
    estado = 'fin';
    audio.lose();
    haptics.play('defeat');
    ctx.finish({
      winner: -1,
      scores: [plantadas[0], plantadas[1]],
      detail: `Cayeron en la oleada ${oleada} de ${OLEADAS}`,
      record: ctx.record('oleada', oleada, 'high'),
    });
  }

  function moverCursor(j, dt) {
    const p = input.player(j), c = cur[j];
    c.mov -= dt;
    const dx = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
    const dy = (p.held('down') ? 1 : 0) - (p.held('up') ? 1 : 0);
    if ((dx || dy) && c.mov <= 0) {
      c.x = clamp(c.x + dx, 0, COLS - 1);
      c.y = clamp(c.y + dy, 0, CARRILES - 1);
      c.mov = 0.12;
      audio.tick();
    }
    if (!dx && !dy) c.mov = 0;
  }

  function dibujarPlanta(g, p, x, y, s) {
    g.save();
    g.translate(x, y);
    const vidaFrac = p.vida / p.vidaMax;
    if (vidaFrac < 0.999) {
      g.fillStyle = '#00000088'; g.fillRect(-s * 0.4, -s * 0.58, s * 0.8, 4);
      g.fillStyle = vidaFrac > 0.4 ? '#a8ff3e' : '#ff4757';
      g.fillRect(-s * 0.4, -s * 0.58, s * 0.8 * vidaFrac, 4);
    }
    g.fillStyle = p.col;
    g.shadowColor = p.col; g.shadowBlur = 10;
    if (p.id === 'girasol') {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.sin(tiempo) * 0.1;
        g.beginPath(); g.ellipse(Math.cos(a) * s * 0.22, Math.sin(a) * s * 0.22, s * 0.11, s * 0.07, a, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#8a5a20'; g.beginPath(); g.arc(0, 0, s * 0.15, 0, Math.PI * 2); g.fill();
    } else if (p.id === 'muro') {
      g.fillRect(-s * 0.3, -s * 0.34, s * 0.6, s * 0.68);
      g.fillStyle = '#00000033';
      for (let k = 1; k < 4; k++) g.fillRect(-s * 0.3, -s * 0.34 + k * s * 0.17, s * 0.6, 2);
    } else if (p.id === 'mina') {
      g.beginPath(); g.arc(0, s * 0.12, s * 0.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffd166'; g.fillRect(-2, -s * 0.2, 4, s * 0.2);
    } else {
      g.beginPath(); g.arc(0, 0, s * 0.24, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(s * 0.2, -s * 0.05, s * 0.11, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0; g.fillStyle = '#0a2a12';
      g.beginPath(); g.arc(-s * 0.06, -s * 0.05, 2.4, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(s * 0.06, -s * 0.05, 2.4, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  return {
    init() { medir(); reset(); },
    resize(w, h) { W = w; H = h; medir(); },

    update(dt) {
      if (estado === 'fin') return;
      for (let j = 0; j < 2; j++) {
        moverCursor(j, dt);
        const p = input.player(j);
        if (p.pressed('a')) { if (!recogerSol(j)) plantar(j); }
        if (p.pressed('b')) quitar(j);
        // Cambiar planta seleccionada con B mantenido + izquierda/derecha
        if (p.held('b')) {
          if (p.pressed('right')) { cur[j].sel = (cur[j].sel + 1) % PLANTAS.length; audio.select(); }
          if (p.pressed('left')) { cur[j].sel = (cur[j].sel - 1 + PLANTAS.length) % PLANTAS.length; audio.select(); }
        }
      }
      actualizar(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d1a0e');

      // Césped a cuadros
      for (let f = 0; f < CARRILES; f++) {
        for (let c = 0; c < COLS; c++) {
          g.fillStyle = (f + c) % 2 ? '#1c3520' : '#213d26';
          g.fillRect(offX + c * celda, offY + f * celda, celda, celda);
        }
      }
      // Zona de casa (izquierda) y de entrada (derecha)
      g.fillStyle = '#3a2a1a';
      g.fillRect(offX - 20, offY, 20, CARRILES * celda);
      g.strokeStyle = '#ffffff14'; g.lineWidth = 1;
      for (let f = 0; f <= CARRILES; f++) { g.beginPath(); g.moveTo(offX, offY + f * celda); g.lineTo(offX + COLS * celda, offY + f * celda); g.stroke(); }

      // Plantas
      for (let f = 0; f < CARRILES; f++) {
        for (let c = 0; c < COLS; c++) {
          const p = rejilla[f][c];
          if (p) dibujarPlanta(g, p, cx(c), cy(f), celda);
        }
      }

      // Balas
      for (const b of balas) {
        g.save(); g.shadowColor = b.hiela ? '#6fd0f0' : '#a8ff3e'; g.shadowBlur = 8;
        g.fillStyle = b.hiela ? '#6fd0f0' : '#a8ff3e';
        g.beginPath(); g.arc(b.x, b.y, celda * 0.09, 0, Math.PI * 2); g.fill(); g.restore();
      }

      // Bichos
      for (const b of bichos) {
        const y = cy(b.fila);
        g.save();
        g.translate(b.x, y);
        if (b.lento > 0) { g.shadowColor = '#6fd0f0'; g.shadowBlur = 12; }
        const bob = Math.sin(tiempo * 6 + b.x * 0.05) * 2;
        g.fillStyle = b.col;
        g.fillRect(-celda * 0.17, -celda * 0.3 + bob, celda * 0.34, celda * 0.52);
        g.beginPath(); g.arc(0, -celda * 0.33 + bob, celda * 0.15, 0, Math.PI * 2); g.fill();
        g.shadowBlur = 0;
        g.fillStyle = '#1a0a12';
        g.beginPath(); g.arc(-celda * 0.05, -celda * 0.35 + bob, 2.2, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(celda * 0.05, -celda * 0.35 + bob, 2.2, 0, Math.PI * 2); g.fill();
        // Barra de vida
        const vf = b.vida / b.vidaMax;
        g.fillStyle = '#00000088'; g.fillRect(-celda * 0.2, -celda * 0.55, celda * 0.4, 3.5);
        g.fillStyle = vf > 0.5 ? '#a8ff3e' : vf > 0.25 ? '#ffd166' : '#ff4757';
        g.fillRect(-celda * 0.2, -celda * 0.55, celda * 0.4 * vf, 3.5);
        g.restore();
      }

      // Soles
      for (const s of soles) {
        g.save();
        g.globalAlpha = s.vida < 3 ? 0.4 + Math.sin(tiempo * 12) * 0.35 : 1;
        g.shadowColor = '#ffd166'; g.shadowBlur = 16; g.fillStyle = '#ffd166';
        g.beginPath(); g.arc(s.x, s.y, celda * 0.16, 0, Math.PI * 2); g.fill();
        g.restore();
      }

      particles.render(g);

      // Cursores
      for (let j = 0; j < 2; j++) {
        const c = cur[j];
        const def = PLANTAS[c.sel];
        const px = offX + c.x * celda, py = offY + c.y * celda;
        const puede = !rejilla[c.y][c.x] && sol >= def.cost;
        g.save();
        g.globalAlpha = 0.35;
        dibujarPlanta(g, { ...def, vida: def.vida, vidaMax: def.vida }, cx(c.x), cy(c.y), celda);
        g.restore();
        g.strokeStyle = puede ? players[j].color : '#ff4757';
        g.lineWidth = 2.5;
        g.strokeRect(px + 2, py + 2, celda - 4, celda - 4);
        ctx.engine.text(players[j].name, px + celda / 2, py - 4, {
          size: 9.5, color: players[j].color, font: 'system-ui',
        });
      }

      // HUD
      g.save();
      g.shadowColor = '#ffd166'; g.shadowBlur = 12; g.fillStyle = '#ffd166';
      g.beginPath(); g.arc(30, 26, 11, 0, Math.PI * 2); g.fill(); g.restore();
      ctx.engine.text(`${sol}`, 48, 30, { size: 16, color: '#ffd166', align: 'left' });
      ctx.engine.text(
        enOleada ? `Oleada ${oleada}/${OLEADAS} · faltan ${restanPorSalir + bichos.length}` : `Siguiente oleada en ${Math.ceil(tOleada)}s`,
        W / 2, 26, { size: 12.5, color: enOleada ? '#ff9f1c' : '#ffffff99', font: 'system-ui' }
      );

      // Catálogo de cada jugador
      for (let j = 0; j < 2; j++) {
        const def = PLANTAS[cur[j].sel];
        const x = j === 0 ? 16 : W - 16;
        ctx.engine.text(`${def.nom} · ${def.cost}`, x, H - 40, {
          size: 12, color: players[j].color, align: j === 0 ? 'left' : 'right', font: 'system-ui',
        });
        ctx.engine.text(def.desc, x, H - 24, {
          size: 10, color: '#ffffff55', align: j === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }

      if (avisoT > 0) {
        ctx.engine.text(aviso, W / 2, offY + CARRILES * celda + 26, { size: 13, color: '#ffd166', font: 'system-ui' });
      }
      ctx.engine.text('A: plantar / recoger sol · B: quitar · B+←/→: cambiar planta · el sol es de los dos',
        W / 2, H - 8, { size: 10, color: '#ffffff44', font: 'system-ui' });
    },

    destroy() {},
  };
}
