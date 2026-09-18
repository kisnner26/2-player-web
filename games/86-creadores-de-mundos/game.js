/**
 * Creadores de Mundos — dos dioses moldeando el mismo planeta.
 *
 * Simulación por celdas con autómata: el terreno decide qué puede crecer,
 * las civilizaciones se expanden hacia lo fértil, y las catástrofes lo
 * reescriben todo. Cada dios tiene su propia fe (energía) que se recarga
 * sola y se gasta en actos: levantar montañas, plantar bosque, sembrar vida
 * o soltar un desastre.
 *
 * Dos formas de jugarlo, elegidas al empezar:
 *   coop   — un solo pueblo compartido; el objetivo es que llegue a 400
 *            almas sin extinguirse.
 *   versus — cada dios tiene su pueblo y compiten por población.
 *
 * El alcance está deliberadamente acotado (rejilla fija, reglas simples):
 * es un juego de sesión corta, no una simulación abierta.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const COLS = 44, FILAS = 28;
const TICK = 0.42;               // segundos por paso de simulación
const META_COOP = 400;
const DURACION = 150;

// Tipos de terreno
const AGUA = 0, ARENA = 1, HIERBA = 2, BOSQUE = 3, MONTANA = 4, CENIZA = 5;
const COLOR_T = {
  [AGUA]:    ['#12345c', '#16406e'],
  [ARENA]:   ['#c9b083', '#d6bd8f'],
  [HIERBA]:  ['#3f7a3a', '#478a41'],
  [BOSQUE]:  ['#1f5230', '#245c36'],
  [MONTANA]: ['#6b6b78', '#7a7a88'],
  [CENIZA]:  ['#3a3238', '#443a40'],
};

const ACTOS = [
  { id: 'tierra',   nom: 'Alzar tierra',  cost: 8,  desc: 'Agua → arena → hierba' },
  { id: 'bosque',   nom: 'Sembrar bosque', cost: 12, desc: 'Hierba → bosque (más comida)' },
  { id: 'montana',  nom: 'Alzar montaña', cost: 18, desc: 'Barrera infranqueable' },
  { id: 'vida',     nom: 'Dar vida',      cost: 25, desc: 'Funda un asentamiento' },
  { id: 'diluvio',  nom: 'Diluvio',       cost: 20, desc: 'Inunda una zona' },
  { id: 'volcan',   nom: 'Volcán',        cost: 30, desc: 'Arrasa y deja ceniza fértil' },
];

export function create(ctx) {
  const { input, audio, haptics, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let celda = 16, offX = 0, offY = 0;
  let terreno = [], pob = [], duenoPob = [];
  let modo = null;
  let fase = 'modo';             // modo | jugando | fin
  let acum = 0, tiempo = 0;
  let aviso = 'Elijan modo', avisoT = 3;
  const fe = [40, 40];
  const cur = [
    { x: 12, y: 14, acto: 0, mov: 0 },
    { x: 31, y: 14, acto: 0, mov: 0 },
  ];

  function medir() {
    celda = Math.floor(Math.min((W - 80) / COLS, (H - 170) / FILAS));
    celda = clamp(celda, 8, 22);
    offX = Math.floor((W - COLS * celda) / 2);
    offY = 92;
  }

  /** Mundo inicial: ruido suave de valores para que salgan islas creíbles. */
  function generarMundo() {
    terreno = Array.from({ length: FILAS }, () => new Array(COLS).fill(AGUA));
    pob = Array.from({ length: FILAS }, () => new Array(COLS).fill(0));
    duenoPob = Array.from({ length: FILAS }, () => new Array(COLS).fill(-1));

    // Semillas de continente
    const semillas = [];
    for (let k = 0; k < 5; k++) semillas.push({ x: rng() * COLS, y: rng() * FILAS, r: 5 + rng() * 7 });

    for (let y = 0; y < FILAS; y++) {
      for (let x = 0; x < COLS; x++) {
        let h = 0;
        for (const s of semillas) {
          const d = Math.hypot(x - s.x, y - s.y);
          h += Math.max(0, 1 - d / s.r);
        }
        h += (rng() - 0.5) * 0.28;
        terreno[y][x] = h > 0.82 ? MONTANA : h > 0.5 ? HIERBA : h > 0.34 ? ARENA : AGUA;
        if (terreno[y][x] === HIERBA && rng() < 0.28) terreno[y][x] = BOSQUE;
      }
    }
  }

  const dentro = (x, y) => x >= 0 && y >= 0 && x < COLS && y < FILAS;
  const habitable = (t) => t === HIERBA || t === BOSQUE || t === ARENA || t === CENIZA;

  /** Comida que da cada celda: define cuánta gente aguanta. */
  function capacidad(t) {
    if (t === BOSQUE) return 14;
    if (t === HIERBA) return 10;
    if (t === CENIZA) return 12;   // ceniza volcánica: fértil
    if (t === ARENA) return 3;
    return 0;
  }

  function decir(t) { aviso = t; avisoT = 2.6; }

  function poblacionDe(j) {
    let s = 0;
    for (let y = 0; y < FILAS; y++) for (let x = 0; x < COLS; x++) {
      if (modo === 'coop' ? pob[y][x] > 0 : duenoPob[y][x] === j) s += pob[y][x];
    }
    return Math.round(s);
  }

  /* ---------------- Actos divinos ---------------- */

  function ejecutar(j) {
    const c = cur[j];
    const acto = ACTOS[c.acto];
    if (fe[j] < acto.cost) { decir('Fe insuficiente'); audio.error(); haptics.error(j); return; }
    fe[j] -= acto.cost;

    const px = offX + c.x * celda + celda / 2, py = offY + c.y * celda + celda / 2;

    if (acto.id === 'tierra') {
      enRadio(c.x, c.y, 2, (x, y) => {
        const t = terreno[y][x];
        if (t === AGUA) terreno[y][x] = ARENA;
        else if (t === ARENA) terreno[y][x] = HIERBA;
      });
      audio.tone({ freq: 180, dur: 0.16, gain: 0.13, type: 'triangle', sweep: 90 });
    } else if (acto.id === 'bosque') {
      enRadio(c.x, c.y, 2, (x, y) => { if (terreno[y][x] === HIERBA) terreno[y][x] = BOSQUE; });
      audio.tone({ freq: 420, dur: 0.14, gain: 0.11, type: 'sine' });
    } else if (acto.id === 'montana') {
      enRadio(c.x, c.y, 1, (x, y) => { if (terreno[y][x] !== AGUA) terreno[y][x] = MONTANA; });
      audio.tone({ freq: 120, dur: 0.2, gain: 0.14, type: 'sawtooth' });
      ctx.shake(3, 4);
    } else if (acto.id === 'vida') {
      if (!habitable(terreno[c.y][c.x])) { decir('Ahí no puede vivir nadie'); fe[j] += acto.cost; audio.error(); return; }
      pob[c.y][c.x] += 8;
      duenoPob[c.y][c.x] = modo === 'coop' ? 0 : j;
      audio.win();
      particles.burst(px, py, 16, { speed: 130, dir: -Math.PI / 2, spread: Math.PI * 2, color: '#ffd166', size: 2.4, drag: 0.91 });
    } else if (acto.id === 'diluvio') {
      enRadio(c.x, c.y, 3, (x, y) => {
        if (terreno[y][x] !== MONTANA) { terreno[y][x] = AGUA; pob[y][x] = 0; duenoPob[y][x] = -1; }
      });
      audio.tone({ freq: 90, dur: 0.3, gain: 0.15, type: 'sine' });
      ctx.shake(5, 7);
    } else if (acto.id === 'volcan') {
      enRadio(c.x, c.y, 3, (x, y) => {
        const d = Math.hypot(x - c.x, y - c.y);
        pob[y][x] = 0; duenoPob[y][x] = -1;
        terreno[y][x] = d < 1.2 ? MONTANA : CENIZA;
      });
      particles.burst(px, py, 34, { speed: 260, dir: -Math.PI / 2, spread: Math.PI * 2, color: '#ff4d2e', size: 3.2, shape: 'spark', drag: 0.93 });
      audio.explosion();
      ctx.shake(9, 12);
      haptics.explosion(j);
    }
    decir(`${players[j].name}: ${acto.nom}`);
    haptics.play('impact', { player: j });
  }

  function enRadio(cx, cy, r, fn) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!dentro(x, y)) continue;
        if (Math.hypot(x - cx, y - cy) > r + 0.2) continue;
        fn(x, y);
      }
    }
  }

  /* ---------------- Simulación ---------------- */

  function paso() {
    const nuevaPob = pob.map((f) => [...f]);
    const nuevoDueno = duenoPob.map((f) => [...f]);

    for (let y = 0; y < FILAS; y++) {
      for (let x = 0; x < COLS; x++) {
        const p = pob[y][x];
        if (p <= 0) continue;
        const cap = capacidad(terreno[y][x]);
        if (cap === 0) { nuevaPob[y][x] = 0; nuevoDueno[y][x] = -1; continue; }

        // Crecimiento logístico
        const crec = p * 0.11 * (1 - p / cap);
        nuevaPob[y][x] = clamp(p + crec, 0, cap);

        // Migración a la mejor casilla vecina libre
        if (p > cap * 0.72) {
          const vec = [];
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (!dentro(nx, ny)) continue;
            if (!habitable(terreno[ny][nx])) continue;
            if (duenoPob[ny][nx] !== -1 && duenoPob[ny][nx] !== duenoPob[y][x]) continue;
            const espacio = capacidad(terreno[ny][nx]) - pob[ny][nx];
            if (espacio > 1) vec.push({ nx, ny, espacio });
          }
          if (vec.length) {
            const d = vec.reduce((a, b) => (b.espacio > a.espacio ? b : a));
            const migra = Math.min(p * 0.2, d.espacio);
            nuevaPob[y][x] -= migra;
            nuevaPob[d.ny][d.nx] += migra;
            nuevoDueno[d.ny][d.nx] = duenoPob[y][x];
          }
        }
      }
    }
    pob = nuevaPob; duenoPob = nuevoDueno;

    // Los bosques reverdecen la ceniza con el tiempo
    if (rng() < 0.3) {
      const x = Math.floor(rng() * COLS), y = Math.floor(rng() * FILAS);
      if (terreno[y][x] === CENIZA && rng() < 0.5) terreno[y][x] = HIERBA;
    }

    for (let j = 0; j < 2; j++) fe[j] = Math.min(120, fe[j] + 2.4);
    comprobarFin();
  }

  function comprobarFin() {
    if (fase === 'fin') return;
    if (modo === 'coop') {
      const total = poblacionDe(0);
      if (total >= META_COOP) return terminar(-1, `¡Civilización próspera! ${total} almas en ${Math.round(tiempo)}s`);
      if (tiempo > 25 && total === 0) return terminar(-1, 'Se extinguieron. Prueben otra vez.');
    }
    if (tiempo >= DURACION) {
      if (modo === 'coop') return terminar(-1, `${poblacionDe(0)} almas al final`);
      const a = poblacionDe(0), b = poblacionDe(1);
      return terminar(a === b ? -1 : a > b ? 0 : 1, `${a} vs ${b} almas`);
    }
  }

  function terminar(winner, detail) {
    fase = 'fin';
    ctx.finish({
      winner,
      scores: [poblacionDe(0), poblacionDe(1)],
      detail,
      record: ctx.record('poblacion', Math.max(poblacionDe(0), poblacionDe(1)), 'high'),
    });
  }

  function moverCursor(j, dt) {
    const p = input.player(j), c = cur[j];
    c.mov -= dt;
    const dx = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
    const dy = (p.held('down') ? 1 : 0) - (p.held('up') ? 1 : 0);
    if ((dx || dy) && c.mov <= 0) {
      c.x = clamp(c.x + dx, 0, COLS - 1);
      c.y = clamp(c.y + dy, 0, FILAS - 1);
      c.mov = 0.075;
    }
    if (!dx && !dy) c.mov = 0;
  }

  return {
    init() { medir(); generarMundo(); },
    resize(w, h) { W = w; H = h; medir(); },

    update(dt) {
      if (fase === 'fin') return;
      if (avisoT > 0) avisoT -= dt;

      if (fase === 'modo') {
        for (let j = 0; j < 2; j++) {
          const p = input.player(j);
          if (p.pressed('left')) { modo = 'coop'; audio.tick(); }
          if (p.pressed('right')) { modo = 'versus'; audio.tick(); }
          if (p.pressed('a')) {
            if (!modo) modo = 'coop';
            fase = 'jugando';
            decir(modo === 'coop' ? 'Un solo pueblo: lleguen a 400' : 'Cada dios, su pueblo');
            audio.select();
          }
        }
        return;
      }

      tiempo += dt;
      for (let j = 0; j < 2; j++) {
        moverCursor(j, dt);
        const p = input.player(j);
        if (p.pressed('a')) ejecutar(j);
        if (p.held('b')) {
          if (p.pressed('right')) { cur[j].acto = (cur[j].acto + 1) % ACTOS.length; audio.select(); }
          if (p.pressed('left')) { cur[j].acto = (cur[j].acto - 1 + ACTOS.length) % ACTOS.length; audio.select(); }
        }
      }
      acum += dt;
      if (acum >= TICK) { acum = 0; paso(); }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#050810');

      if (fase === 'modo') {
        ctx.engine.text('CREADORES DE MUNDOS', W / 2, H * 0.3, { size: 24, color: '#ffd166', glow: 16 });
        ctx.engine.text('← Cooperativo: un pueblo, lleguen a 400 almas', W / 2, H * 0.45, {
          size: 14, color: modo === 'coop' ? '#a8ff3e' : '#ffffff77', font: 'system-ui',
        });
        ctx.engine.text('→ Versus: cada dios su pueblo, gana quien tenga más', W / 2, H * 0.52, {
          size: 14, color: modo === 'versus' ? '#ff6ec7' : '#ffffff77', font: 'system-ui',
        });
        ctx.engine.text('Pulsen su tecla de acción para empezar', W / 2, H * 0.64, {
          size: 12, color: '#ffffff55', font: 'system-ui',
        });
        return;
      }

      // Terreno
      for (let y = 0; y < FILAS; y++) {
        for (let x = 0; x < COLS; x++) {
          const t = terreno[y][x];
          const par = (x + y) % 2;
          g.fillStyle = COLOR_T[t][par];
          g.fillRect(offX + x * celda, offY + y * celda, celda, celda);
        }
      }

      // Población: puntos que crecen con la densidad
      for (let y = 0; y < FILAS; y++) {
        for (let x = 0; x < COLS; x++) {
          const p = pob[y][x];
          if (p <= 0.4) continue;
          const cap = Math.max(1, capacidad(terreno[y][x]));
          const frac = clamp(p / cap, 0, 1);
          const d = duenoPob[y][x];
          const col = modo === 'coop' ? '#ffd166' : (d >= 0 ? players[d].color : '#ffd166');
          g.save();
          g.globalAlpha = 0.45 + frac * 0.55;
          g.shadowColor = col; g.shadowBlur = 6;
          g.fillStyle = col;
          const r = celda * (0.16 + frac * 0.24);
          g.beginPath();
          g.arc(offX + x * celda + celda / 2, offY + y * celda + celda / 2, r, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
      }

      particles.render(g);

      // Cursores
      for (let j = 0; j < 2; j++) {
        const c = cur[j];
        const acto = ACTOS[c.acto];
        const px = offX + c.x * celda, py = offY + c.y * celda;
        const r = acto.id === 'volcan' || acto.id === 'diluvio' ? 3 : acto.id === 'montana' || acto.id === 'vida' ? 1 : 2;
        g.save();
        g.strokeStyle = players[j].color;
        g.lineWidth = 2;
        g.globalAlpha = fe[j] >= acto.cost ? 0.9 : 0.3;
        g.beginPath();
        g.arc(px + celda / 2, py + celda / 2, (r + 0.5) * celda, 0, Math.PI * 2);
        g.stroke();
        g.strokeRect(px, py, celda, celda);
        g.restore();
      }

      // HUD
      ctx.engine.text(modo === 'coop' ? 'COOPERATIVO' : 'VERSUS', W / 2, 24, { size: 11, color: '#ffffff66', font: 'system-ui' });
      if (modo === 'coop') {
        const tot = poblacionDe(0);
        ctx.engine.text(`${tot} / ${META_COOP} almas`, W / 2, 46, { size: 17, color: '#ffd166' });
      } else {
        ctx.engine.text(`${poblacionDe(0)}  —  ${poblacionDe(1)}`, W / 2, 46, { size: 17, color: '#ffffff' });
      }
      ctx.engine.text(`${Math.max(0, DURACION - tiempo).toFixed(0)}s`, W / 2, 66, { size: 11, color: '#ffffff66', font: 'system-ui' });

      for (let j = 0; j < 2; j++) {
        const acto = ACTOS[cur[j].acto];
        const x = j === 0 ? 16 : W - 16;
        const al = j === 0 ? 'left' : 'right';
        ctx.engine.text(`${players[j].name} · fe ${Math.floor(fe[j])}`, x, 26, { size: 12, color: players[j].color, align: al, font: 'system-ui' });
        ctx.engine.text(`${acto.nom} (${acto.cost})`, x, 44, {
          size: 12.5, color: fe[j] >= acto.cost ? '#ffffff' : '#ffffff55', align: al, font: 'system-ui',
        });
        ctx.engine.text(acto.desc, x, 60, { size: 10, color: '#ffffff55', align: al, font: 'system-ui' });
      }

      if (avisoT > 0) {
        ctx.engine.text(aviso, W / 2, offY + FILAS * celda + 22, { size: 12.5, color: '#ffd166', font: 'system-ui' });
      }
      ctx.engine.text('Mover: dirección · A: obrar · B+←/→: cambiar acto',
        W / 2, H - 12, { size: 10.5, color: '#ffffff44', font: 'system-ui' });
    },

    destroy() {},
  };
}
