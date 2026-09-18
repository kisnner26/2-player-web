/**
 * Golpe Final — pelea 1v1 con barras de vida, bloqueo y especiales.
 *
 * El proyecto solo da 4 direcciones + 2 botones por jugador (core/input.js),
 * y un juego de pelea clásico pide más. En vez de tocar el sistema compartido
 * —lo usan todos los juegos y el remapeo— los golpes salen de COMBOS de
 * dirección + botón, como ya hace 18-bloques-versus con la rotación:
 *
 *   A            puñetazo rápido (poco daño, se recupera antes)
 *   ↓ + A        barrido bajo (derriba, no se puede bloquear de pie)
 *   ↑ + A        gancho alto (más daño, más lento)
 *   B (mantener) bloqueo (reduce daño, gasta aguante)
 *   ← / →        acercarse o alejarse    ↑  saltar
 *   B + A        especial (gasta la barra de furia, que se llena al golpear)
 *
 * Es el patrón de los juegos de pelea minimalistas: pocas entradas, mucha
 * lectura del rival. Al mejor de 3 asaltos.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const SUELO_Y = 0.78;            // fracción de la altura donde está el suelo
const VEL = 210;
const SALTO = 560;
const GRAV = 1750;
const VIDA_MAX = 100;
const FURIA_MAX = 100;
const ASALTOS = 3;

/** Cada golpe: alcance, daño, fotogramas de inicio/activo/recuperación. */
const GOLPES = {
  punetazo: { alc: 62, alto: [-52, -12], dano: 7,  ini: 0.06, act: 0.09, rec: 0.14, furia: 8,  emp: 90,  et: 'Puñetazo' },
  bajo:     { alc: 70, alto: [-20, 4],   dano: 9,  ini: 0.09, act: 0.11, rec: 0.24, furia: 11, emp: 70,  et: 'Barrido', derriba: true, bajo: true },
  alto:     { alc: 58, alto: [-78, -34], dano: 13, ini: 0.14, act: 0.10, rec: 0.28, furia: 14, emp: 150, et: 'Gancho' },
  especial: { alc: 118, alto: [-72, 0],  dano: 26, ini: 0.18, act: 0.16, rec: 0.38, furia: 0,  emp: 320, et: 'Especial', especial: true },
};

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let suelo = 0;
  let asalto = 1;
  const asaltosGanados = [0, 0];
  let estado = 'combate';        // combate | ko | fin
  let pausa = 0;
  let anuncio = '', anuncioT = 0;
  let tiempo = 0;
  let tAsalto = 60;

  const lu = [crear(0, 0.28), crear(1, 0.72)];

  function crear(i, fx) {
    return {
      i, x: 0, y: 0, vx: 0, vy: 0, mira: i === 0 ? 1 : -1,
      vida: VIDA_MAX, furia: 0, aguante: 100,
      golpe: null, gt: 0, faseG: '', yaGolpeo: false,
      bloqueando: false, agachado: false, suelo: true,
      aturdido: 0, invul: 0, fx,
    };
  }

  function medir() { suelo = H * SUELO_Y; }

  function reiniciarAsalto() {
    for (const l of lu) {
      l.x = W * l.fx; l.y = suelo; l.vx = l.vy = 0;
      l.vida = VIDA_MAX; l.furia = Math.floor(l.furia * 0.4);
      l.golpe = null; l.aturdido = 0; l.suelo = true;
      l.mira = l.i === 0 ? 1 : -1;
    }
    tAsalto = 60;
    estado = 'combate';
    anunciar(`ASALTO ${asalto}`);
  }

  function anunciar(t) { anuncio = t; anuncioT = 1.6; }

  function iniciarGolpe(l, tipo) {
    if (l.golpe || l.aturdido > 0) return;
    const g = GOLPES[tipo];
    if (g.especial) {
      if (l.furia < FURIA_MAX) return;
      l.furia = 0;
      audio.arp([440, 550, 660], 0.09);
      ctx.shake(4, 5);
    }
    l.golpe = tipo; l.gt = 0; l.faseG = 'ini'; l.yaGolpeo = false;
    audio.tone({ freq: tipo === 'alto' ? 220 : 320, dur: 0.05, gain: 0.09, type: 'square' });
  }

  function cajaGolpe(l) {
    const g = GOLPES[l.golpe];
    const x0 = l.mira > 0 ? l.x + 14 : l.x - 14 - g.alc;
    return { x0, x1: x0 + g.alc, y0: l.y + g.alto[0], y1: l.y + g.alto[1] };
  }

  function cajaCuerpo(l) {
    const alto = l.agachado ? 44 : 82;
    return { x0: l.x - 20, x1: l.x + 20, y0: l.y - alto, y1: l.y };
  }

  function solapan(a, b) {
    return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  }

  function impactar(atac, vic) {
    const g = GOLPES[atac.golpe];
    // Bloqueo: de pie bloquea alto y medio; agachado bloquea bajo.
    const bloqueaBien = vic.bloqueando && vic.aguante > 0 &&
      ((g.bajo && vic.agachado) || (!g.bajo && !vic.agachado));

    let dano = g.dano;
    if (bloqueaBien) {
      dano = Math.max(1, Math.round(g.dano * 0.18));
      vic.aguante = Math.max(0, vic.aguante - g.dano * 1.6);
      audio.tone({ freq: 180, dur: 0.07, gain: 0.1, type: 'triangle' });
      particles.burst(vic.x, vic.y - 40, 6, { speed: 110, dir: -atac.mira > 0 ? 0 : Math.PI, spread: 1.2, color: '#6fd0f0', size: 2, drag: 0.91 });
    } else {
      vic.aturdido = g.derriba ? 0.65 : 0.28;
      audio.tone({ freq: 90, dur: 0.11, gain: 0.16, type: 'sawtooth' });
      haptics.play('impact', { player: vic.i });
      ctx.shake(g.especial ? 9 : 5, g.especial ? 10 : 6);
      particles.burst(vic.x, vic.y - 46, g.especial ? 24 : 12, {
        speed: g.especial ? 260 : 170, dir: atac.mira > 0 ? 0 : Math.PI, spread: 1.6,
        color: players[atac.i].color, size: 2.8, shape: 'spark', drag: 0.92,
      });
    }

    vic.vida = Math.max(0, vic.vida - dano);
    vic.vx += atac.mira * g.emp * (bloqueaBien ? 0.35 : 1);
    if (g.derriba && !bloqueaBien) vic.vy = -260;
    atac.furia = Math.min(FURIA_MAX, atac.furia + g.furia);

    if (vic.vida <= 0) ko(atac, vic);
  }

  function ko(ganador, perdedor) {
    estado = 'ko';
    pausa = 2.2;
    asaltosGanados[ganador.i]++;
    anunciar(`${players[ganador.i].name.toUpperCase()} GANA EL ASALTO`);
    audio.win();
    haptics.victory(ganador.i);
    ctx.shake(10, 14);
    particles.burst(perdedor.x, perdedor.y - 40, 30, {
      speed: 280, dir: -Math.PI / 2, spread: Math.PI * 2,
      color: players[ganador.i].color, size: 3.2, shape: 'spark', drag: 0.93,
    });
  }

  function controlar(l, dt) {
    const p = input.player(l.i);
    if (l.aturdido > 0) { l.aturdido -= dt; l.bloqueando = false; return; }

    l.bloqueando = p.held('b') && l.suelo && !l.golpe;
    l.agachado = p.held('down') && l.suelo;

    // Recuperación de aguante al no bloquear
    if (!l.bloqueando) l.aguante = Math.min(100, l.aguante + 26 * dt);

    if (!l.golpe) {
      // Ataques: combos de dirección + A
      if (p.pressed('a')) {
        if (p.held('b')) iniciarGolpe(l, 'especial');
        else if (p.held('down')) iniciarGolpe(l, 'bajo');
        else if (p.held('up')) iniciarGolpe(l, 'alto');
        else iniciarGolpe(l, 'punetazo');
      }

      // Movimiento (bloquear te clava en el sitio)
      if (!l.bloqueando && !l.agachado) {
        const dx = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
        l.vx = dx * VEL;
        if (p.pressed('up') && l.suelo) {
          l.vy = -SALTO; l.suelo = false;
          audio.tone({ freq: 400, dur: 0.06, gain: 0.08, type: 'sine', sweep: 160 });
        }
      } else l.vx *= 0.7;
    } else {
      l.vx *= 0.82;
    }
  }

  function fisica(l, dt) {
    l.vy += GRAV * dt;
    l.x = clamp(l.x + l.vx * dt, 40, W - 40);
    l.y += l.vy * dt;
    if (l.y >= suelo) { l.y = suelo; l.vy = 0; l.suelo = true; }
    if (l.suelo) l.vx *= Math.pow(0.0015, dt);
    else l.vx *= Math.pow(0.4, dt);
  }

  function avanzarGolpe(l, otro, dt) {
    if (!l.golpe) return;
    const g = GOLPES[l.golpe];
    l.gt += dt;
    if (l.faseG === 'ini' && l.gt >= g.ini) { l.faseG = 'act'; l.gt = 0; }
    else if (l.faseG === 'act') {
      if (!l.yaGolpeo && solapan(cajaGolpe(l), cajaCuerpo(otro))) {
        l.yaGolpeo = true;
        impactar(l, otro);
      }
      if (l.gt >= g.act) { l.faseG = 'rec'; l.gt = 0; }
    } else if (l.faseG === 'rec' && l.gt >= g.rec) {
      l.golpe = null; l.faseG = ''; l.gt = 0;
    }
  }

  function dibujarLuchador(g, l) {
    const col = players[l.i].color;
    const alto = l.agachado ? 44 : 82;
    g.save();
    g.translate(l.x, l.y);
    if (l.invul > 0) g.globalAlpha = 0.5;

    // Sombra
    g.fillStyle = '#00000055';
    g.beginPath(); g.ellipse(0, 2, 22, 6, 0, 0, Math.PI * 2); g.fill();

    g.shadowColor = col; g.shadowBlur = l.golpe && l.faseG === 'act' ? 22 : 12;
    g.fillStyle = l.aturdido > 0 ? '#ffffff' : col;

    // Cuerpo
    g.fillRect(-17, -alto, 34, alto);
    // Cabeza
    g.beginPath(); g.arc(0, -alto - 13, 14, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    // Ojos mirando al rival
    g.fillStyle = '#0a0a12';
    g.beginPath(); g.arc(l.mira * 5, -alto - 15, 3, 0, Math.PI * 2); g.fill();

    // Brazo del golpe
    if (l.golpe) {
      const gg = GOLPES[l.golpe];
      const ext = l.faseG === 'act' ? 1 : l.faseG === 'ini' ? 0.45 : 0.7;
      const by = (gg.alto[0] + gg.alto[1]) / 2;
      g.fillStyle = l.golpe === 'especial' ? '#ffd166' : col;
      g.shadowColor = l.golpe === 'especial' ? '#ffd166' : col;
      g.shadowBlur = l.faseG === 'act' ? 20 : 6;
      g.fillRect(l.mira > 0 ? 12 : -12 - gg.alc * ext, by - 7, gg.alc * ext, 14);
      g.shadowBlur = 0;
    }

    // Escudo de bloqueo
    if (l.bloqueando) {
      g.strokeStyle = '#6fd0f0'; g.lineWidth = 3;
      g.globalAlpha = 0.55 + Math.sin(tiempo * 12) * 0.2;
      g.beginPath();
      g.arc(l.mira * 16, -alto / 2, 30, -Math.PI / 2.2, Math.PI / 2.2);
      g.stroke();
    }
    g.restore();
  }

  function barra(g, x, y, w, h, frac, col, derecha) {
    g.fillStyle = '#00000077';
    g.fillRect(x, y, w, h);
    g.fillStyle = col;
    const ww = w * clamp(frac, 0, 1);
    g.fillRect(derecha ? x + w - ww : x, y, ww, h);
    g.strokeStyle = '#ffffff35'; g.lineWidth = 1.5;
    g.strokeRect(x, y, w, h);
  }

  return {
    init() { medir(); reiniciarAsalto(); },
    resize(w, h) { W = w; H = h; medir(); for (const l of lu) l.y = suelo; },

    update(dt) {
      tiempo += dt;
      if (anuncioT > 0) anuncioT -= dt;

      if (estado === 'ko') {
        pausa -= dt;
        for (const l of lu) fisica(l, dt);
        particles.update(dt);
        if (pausa <= 0) {
          const g = asaltosGanados.findIndex((s) => s >= Math.ceil(ASALTOS / 2));
          if (g >= 0) {
            estado = 'fin';
            ctx.finish({
              winner: g,
              scores: [asaltosGanados[0], asaltosGanados[1]],
              detail: `${asaltosGanados[g]}-${asaltosGanados[1 - g]} en ${asalto} asalto(s)`,
            });
          } else { asalto++; reiniciarAsalto(); }
        }
        return;
      }
      if (estado !== 'combate') return;

      tAsalto -= dt;
      if (tAsalto <= 0) {
        // Se acaba el tiempo: gana quien tenga más vida.
        const g = lu[0].vida === lu[1].vida ? null : (lu[0].vida > lu[1].vida ? lu[0] : lu[1]);
        if (g) ko(g, lu[1 - g.i]);
        else { estado = 'ko'; pausa = 2; anunciar('EMPATE'); }
        return;
      }

      // Orientación: siempre mirando al rival
      lu[0].mira = lu[0].x <= lu[1].x ? 1 : -1;
      lu[1].mira = -lu[0].mira;

      for (const l of lu) { controlar(l, dt); fisica(l, dt); }
      avanzarGolpe(lu[0], lu[1], dt);
      avanzarGolpe(lu[1], lu[0], dt);

      // Que no se atraviesen
      const d = lu[1].x - lu[0].x;
      if (Math.abs(d) < 40) {
        const emp = (40 - Math.abs(d)) / 2 * Math.sign(d || 1);
        lu[0].x -= emp; lu[1].x += emp;
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#120a16');

      // Fondo: arena con degradado y suelo
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#241030'); grd.addColorStop(1, '#0d0610');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);

      // Luna / foco
      g.save(); g.globalAlpha = 0.12; g.fillStyle = '#ff6ec7';
      g.beginPath(); g.arc(W * 0.5, H * 0.22, Math.min(W, H) * 0.2, 0, Math.PI * 2); g.fill(); g.restore();

      g.fillStyle = '#1c1024';
      g.fillRect(0, suelo, W, H - suelo);
      g.strokeStyle = '#ff6ec744'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, suelo); g.lineTo(W, suelo); g.stroke();

      particles.render(g);
      for (const l of lu) dibujarLuchador(g, l);

      // HUD: vida, furia, aguante
      const bw = W * 0.36, bh = 17;
      for (let i = 0; i < 2; i++) {
        const l = lu[i];
        const x = i === 0 ? 20 : W - 20 - bw;
        barra(g, x, 22, bw, bh, l.vida / VIDA_MAX, l.vida > 30 ? players[i].color : '#ff2e5b', i === 1);
        barra(g, x, 22 + bh + 3, bw * 0.7, 6, l.furia / FURIA_MAX, l.furia >= FURIA_MAX ? '#ffd166' : '#ffd16688', i === 1);
        barra(g, x, 22 + bh + 11, bw * 0.7, 4, l.aguante / 100, '#6fd0f0', i === 1);
        ctx.engine.text(players[i].name, i === 0 ? x : x + bw, 16, {
          size: 12, color: players[i].color, align: i === 0 ? 'left' : 'right', font: 'system-ui',
        });
        // Asaltos ganados
        for (let k = 0; k < Math.ceil(ASALTOS / 2); k++) {
          g.fillStyle = k < asaltosGanados[i] ? '#ffd166' : '#ffffff22';
          g.beginPath();
          g.arc(i === 0 ? x + 8 + k * 16 : x + bw - 8 - k * 16, 22 + bh + 24, 5, 0, Math.PI * 2);
          g.fill();
        }
      }

      ctx.engine.text(`${Math.ceil(tAsalto)}`, W / 2, 34, { size: 26, color: tAsalto < 10 ? '#ff2e5b' : '#ffffff' });
      ctx.engine.text(`Asalto ${asalto}`, W / 2, 52, { size: 10.5, color: '#ffffff66', font: 'system-ui' });

      if (anuncioT > 0) {
        g.save();
        g.globalAlpha = clamp(anuncioT / 0.6, 0, 1);
        ctx.engine.text(anuncio, W / 2, H * 0.4, { size: 26, color: '#ffd166', glow: 18 });
        g.restore();
      }

      ctx.engine.text('A: puño · ↓+A: barrido · ↑+A: gancho · B: bloquear · B+A: especial (furia llena)',
        W / 2, H - 12, { size: 10.5, color: '#ffffff55', font: 'system-ui' });
    },

    destroy() {},
  };
}
