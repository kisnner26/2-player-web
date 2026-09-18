/**
 * Alunizaje a Dos — un jugador rota la nave y el otro maneja los propulsores.
 *
 * Cooperativo forzado: ninguno de los dos puede aterrizar solo. El que rota no
 * controla la potencia y el que empuja no controla la dirección, así que hay
 * que hablarlo en voz alta. Ahí está la gracia.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const GRAV = 42;
const EMPUJE = 118;
const LATERAL = 55;
const GIRO = 2.2;
const COMBUSTIBLE = 100;
const VEL_SEGURA = 42;         // m/s máximos al tocar
const ANG_SEGURO = 0.26;       // radianes de inclinación tolerada
const NIVELES = 4;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let terreno = [];              // puntos {x,y}
  let plataformas = [];          // {x1,x2,y,mult}
  const nave = { x: 0, y: 0, vx: 0, vy: 0, a: 0, fuel: COMBUSTIBLE, viva: true };
  let nivel = 1;
  let puntos = 0;
  let sb = null;
  let estado = 'volando';        // volando | posado | roto
  let pausa = 0;
  let pararRumble = null;

  function generar() {
    terreno = [];
    plataformas = [];
    const segmentos = 16;
    const paso = W / segmentos;
    let y = H * 0.72;
    // Se eligen dos tramos planos: son las plataformas de aterrizaje.
    const idxPlano = new Set();
    while (idxPlano.size < 2) idxPlano.add(2 + Math.floor(rng() * (segmentos - 4)));

    for (let i = 0; i <= segmentos; i++) {
      if (idxPlano.has(i)) {
        terreno.push({ x: i * paso, y });
        terreno.push({ x: (i + 1) * paso, y });
        const ancho = paso;
        plataformas.push({
          x1: i * paso, x2: (i + 1) * paso, y,
          // Plataforma estrecha = más puntos. Aparece a partir del nivel 2.
          mult: nivel > 1 && rng() < 0.5 ? 3 : 1,
        });
        i++;
        continue;
      }
      terreno.push({ x: i * paso, y });
      y = clamp(y + (rng() - 0.5) * H * 0.16 * (1 + nivel * 0.12), H * 0.42, H * 0.9);
    }
    // La plataforma de x3 se estrecha para que valga la pena el riesgo.
    for (const p of plataformas) {
      if (p.mult === 3) {
        const centro = (p.x1 + p.x2) / 2;
        p.x1 = centro - paso * 0.22;
        p.x2 = centro + paso * 0.22;
      }
    }
  }

  function alturaTerreno(x) {
    for (let i = 0; i < terreno.length - 1; i++) {
      const a = terreno[i], b = terreno[i + 1];
      if (x >= a.x && x <= b.x) {
        const t = (x - a.x) / (b.x - a.x || 1);
        return a.y + (b.y - a.y) * t;
      }
    }
    return H;
  }

  function reiniciarNave() {
    nave.x = W * (0.2 + rng() * 0.6);
    nave.y = 70;
    nave.vx = (rng() - 0.5) * 30;
    nave.vy = 6;
    nave.a = 0;
    nave.fuel = COMBUSTIBLE;
    nave.viva = true;
    estado = 'volando';
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      generar();
      reiniciarNave();
      sb = ui.scoreboard({ center: `nivel 1 / ${NIVELES}` });
      ui.banner(`<b style="color:${players[0].color}">${players[0].name}</b> rota ·
                 <b style="color:${players[1].color}">${players[1].name}</b> empuja`);
      pararRumble = haptics.sustain(() => (empujando() ? 0.6 : 0), { period: 80 });
    },
    resize(nw, nh) { W = nw; H = nh; generar(); },

    update(dt) {
      if (estado !== 'volando') {
        pausa -= dt;
        if (pausa <= 0) siguiente();
        particles.update(dt);
        return;
      }

      // Jugador 1: solo rotación
      const p1 = input.player(0);
      nave.a += ((p1.held('right') ? 1 : 0) - (p1.held('left') ? 1 : 0)) * GIRO * dt;
      nave.a = clamp(nave.a, -1.35, 1.35);

      // Jugador 2: propulsores
      const p2 = input.player(1);
      const principal = p2.held('up') && nave.fuel > 0;
      const izq = p2.held('left') && nave.fuel > 0;
      const der = p2.held('right') && nave.fuel > 0;

      if (principal) {
        nave.vx += Math.sin(nave.a) * EMPUJE * dt;
        nave.vy -= Math.cos(nave.a) * EMPUJE * dt;
        nave.fuel = Math.max(0, nave.fuel - dt * 22);
        llama(0);
      }
      if (izq) { nave.vx += LATERAL * dt; nave.fuel = Math.max(0, nave.fuel - dt * 8); llama(-1); }
      if (der) { nave.vx -= LATERAL * dt; nave.fuel = Math.max(0, nave.fuel - dt * 8); llama(1); }

      nave.vy += GRAV * dt;
      nave.x += nave.vx * dt;
      nave.y += nave.vy * dt;

      if (nave.x < 10) { nave.x = 10; nave.vx = Math.abs(nave.vx) * 0.4; }
      if (nave.x > W - 10) { nave.x = W - 10; nave.vx = -Math.abs(nave.vx) * 0.4; }

      const suelo = alturaTerreno(nave.x);
      if (nave.y + 14 >= suelo) aterrizar(suelo);

      sb.update(Math.round(nave.fuel), Math.round(puntos));
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#04060f');

      // Estrellas
      for (let i = 0; i < 70; i++) {
        const x = ((i * 7919) % 1000) / 1000 * W;
        const y = ((i * 104729) % 1000) / 1000 * H * 0.7;
        g.globalAlpha = 0.2 + ((i % 4) / 4) * 0.4;
        g.fillStyle = '#fff';
        g.fillRect(x, y, 1.6, 1.6);
      }
      g.globalAlpha = 1;

      // Terreno
      g.beginPath();
      g.moveTo(0, H);
      for (const p of terreno) g.lineTo(p.x, p.y);
      g.lineTo(W, H);
      g.closePath();
      g.fillStyle = '#1c1c2e';
      g.fill();
      g.strokeStyle = '#7a7ab0';
      g.lineWidth = 2;
      g.beginPath();
      terreno.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.stroke();

      // Plataformas
      for (const p of plataformas) {
        const col = p.mult === 3 ? '#ffd166' : '#a8ff3e';
        g.save();
        g.shadowColor = col; g.shadowBlur = 20;
        g.strokeStyle = col;
        g.lineWidth = 5;
        g.beginPath(); g.moveTo(p.x1, p.y); g.lineTo(p.x2, p.y); g.stroke();
        g.restore();
        ctx.engine.text(`×${p.mult}`, (p.x1 + p.x2) / 2, p.y + 16, { size: 10, color: col, font: 'system-ui' });
      }

      particles.render(g);

      // Nave
      if (nave.viva) {
        g.save();
        g.translate(nave.x, nave.y);
        g.rotate(nave.a);
        g.shadowColor = '#dfe8ff'; g.shadowBlur = 12;
        g.fillStyle = '#dfe8ff';
        g.beginPath();
        g.moveTo(0, -16);
        g.lineTo(11, 8);
        g.lineTo(-11, 8);
        g.closePath();
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = '#8a94b8';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(-8, 8); g.lineTo(-13, 16);
        g.moveTo(8, 8); g.lineTo(13, 16);
        g.stroke();
        // Cabina con los dos colores: recuerda que van los dos dentro.
        g.fillStyle = players[0].color;
        g.beginPath(); g.arc(-3, -2, 3.2, 0, TAU); g.fill();
        g.fillStyle = players[1].color;
        g.beginPath(); g.arc(3, -2, 3.2, 0, TAU); g.fill();
        g.restore();
      }

      // Telemetría
      const suelo = alturaTerreno(nave.x);
      const vel = Math.hypot(nave.vx, nave.vy);
      const alt = Math.max(0, suelo - nave.y - 14);
      panel(g, 16, 74, [
        ['ALTURA', `${alt.toFixed(0)} m`, '#ffffff'],
        ['VEL', `${vel.toFixed(0)} m/s`, vel > VEL_SEGURA ? '#ff4757' : '#a8ff3e'],
        ['INCL', `${Math.abs(nave.a * 57).toFixed(0)}°`, Math.abs(nave.a) > ANG_SEGURO ? '#ff4757' : '#a8ff3e'],
      ]);

      // Combustible
      const bw = 180;
      g.fillStyle = '#ffffff18';
      g.fillRect(W - bw - 16, 78, bw, 10);
      g.fillStyle = nave.fuel > 25 ? '#00e5ff' : '#ff4757';
      g.fillRect(W - bw - 16, 78, bw * (nave.fuel / COMBUSTIBLE), 10);
      ctx.engine.text('COMBUSTIBLE', W - 16, 66, { size: 9, color: '#ffffff66', align: 'right', font: 'system-ui' });
    },

    destroy() { sb?.remove(); ui.hideBanner(); pararRumble?.(); },
  };

  function empujando() {
    const p2 = input.player(1);
    return nave.viva && nave.fuel > 0 && (p2.held('up') || p2.held('left') || p2.held('right'));
  }

  function panel(g, x, y, filas) {
    filas.forEach(([et, val, col], i) => {
      ctx.engine.text(et, x, y + i * 22, { size: 9, color: '#ffffff55', align: 'left', font: 'system-ui' });
      ctx.engine.text(val, x + 62, y + i * 22, { size: 12, color: col, align: 'left', font: 'system-ui' });
    });
  }

  function llama(lado) {
    const base = nave.a + (lado === 0 ? Math.PI / 2 : lado > 0 ? 0 : Math.PI);
    particles.spawn({
      x: nave.x - Math.sin(nave.a) * (lado === 0 ? 12 : 0),
      y: nave.y + Math.cos(nave.a) * (lado === 0 ? 12 : 0),
      vx: Math.cos(base) * 70 + (rng() - 0.5) * 30,
      vy: Math.sin(base) * 70 + (rng() - 0.5) * 30,
      life: 0.26, maxLife: 0.26, size: lado === 0 ? 4 : 2.5,
      color: lado === 0 ? '#ffb347' : '#8fd5ff', shape: 'circle',
    });
  }

  function aterrizar(suelo) {
    const vel = Math.hypot(nave.vx, nave.vy);
    const plat = plataformas.find((p) => nave.x >= p.x1 && nave.x <= p.x2 && Math.abs(p.y - suelo) < 2);
    const bien = plat && vel <= VEL_SEGURA && Math.abs(nave.a) <= ANG_SEGURO;

    nave.y = suelo - 14;
    nave.vx = nave.vy = 0;

    if (bien) {
      estado = 'posado';
      pausa = 1.8;
      const bono = Math.round((100 + nave.fuel) * plat.mult);
      puntos += bono;
      audio.win();
      haptics.play('victory');
      ui.toast(`¡Posados! +${bono} (×${plat.mult})`, { ms: 1700, color: '#a8ff3e' });
      particles.burst(nave.x, suelo, 22, { speed: 130, dir: -Math.PI / 2, spread: 2, color: '#a8ff3e', size: 4 });
    } else {
      estado = 'roto';
      pausa = 2;
      nave.viva = false;
      audio.explosion();
      haptics.explosion();
      ctx.shake(24);
      particles.burst(nave.x, suelo, 50, { speed: 300, color: '#ff7847', size: 6, gravity: 200, drag: 0.92 });
      const motivo = !plat ? 'fuera de la plataforma'
        : vel > VEL_SEGURA ? `demasiado rápido (${vel.toFixed(0)} m/s)`
        : 'demasiado inclinados';
      ui.toast(`Estrellados: ${motivo}`, { ms: 1900, color: '#ff4757' });
    }
  }

  function siguiente() {
    if (estado === 'roto') {
      // Los dos pierden juntos: es cooperativo, no hay ganador individual.
      ctx.finish({
        winner: -1,
        scores: [nivel - 1, Math.round(puntos)],
        detail: `Alunizajes logrados: ${nivel - 1} · ${Math.round(puntos)} puntos`,
        record: ctx.record('puntos', Math.round(puntos), 'high'),
      });
      return;
    }
    nivel++;
    if (nivel > NIVELES) {
      ctx.finish({
        winner: -1,
        scores: [NIVELES, Math.round(puntos)],
        detail: `¡Misión completa! ${Math.round(puntos)} puntos entre los dos`,
        record: ctx.record('puntos', Math.round(puntos), 'high'),
      });
      return;
    }
    sb.setCenter(`nivel ${nivel} / ${NIVELES}`);
    generar();
    reiniciarNave();
  }
}
