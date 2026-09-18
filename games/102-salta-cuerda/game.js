/**
 * Salta la Cuerda — cooperativo de ritmo puro.
 *
 * Una cuerda gira y los dos tienen que saltarla. No compiten: cada salto
 * bien dado sube el contador COMÚN, y si uno tropieza se pierden las vidas
 * de los dos. La cuerda acelera poco a poco.
 *
 * Es de los más fáciles de entender del catálogo: un botón, un ritmo. Lo
 * bonito es que a partir de cierta velocidad hay que saltar a la vez y se
 * acaba contando en voz alta.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const VIDAS = 3;
const GIRO_INI = 1.45;            // vueltas por segundo
const GIRO_MAX = 3.6;
const VENTANA = 0.19;             // margen (en fracción de vuelta) para saltar
const AIRE = 0.42;                // duración del salto

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let suelo = 0;
  let fase = 0;                   // 0..1, posición de la cuerda en su vuelta
  let giro = GIRO_INI;
  let vidas = VIDAS;
  let saltos = 0, mejorRacha = 0, racha = 0;
  let estado = 'jugando';
  let pausa = 0;
  let aviso = '¡Salten cuando la cuerda llegue abajo!', avisoT = 3;
  let tiempo = 0;
  let yaContado = false;          // si esta vuelta ya se resolvió

  const jug = [crear(0), crear(1)];
  function crear(i) {
    return { i, aire: 0, saltoEnEstaVuelta: false, fallos: 0, aciertos: 0 };
  }

  const medir = () => { suelo = H * 0.72; };
  const decir = (t) => { aviso = t; avisoT = 2.2; };
  const enElSuelo = (p) => p.aire <= 0;

  function reset() {
    jug[0] = crear(0); jug[1] = crear(1);
    fase = 0; giro = GIRO_INI; vidas = VIDAS;
    saltos = 0; racha = 0; mejorRacha = 0;
    estado = 'jugando'; yaContado = false;
  }

  function saltar(p) {
    if (!enElSuelo(p)) return;
    p.aire = AIRE;
    p.saltoEnEstaVuelta = true;
    audio.tone({ freq: 420 + p.i * 90, dur: 0.06, gain: 0.11, type: 'square', sweep: 150 });
    haptics.play('tap', { player: p.i });
  }

  /** La cuerda pasa por el suelo cuando la fase cruza 0. */
  function resolverVuelta() {
    const fallaron = jug.filter((p) => !p.saltoEnEstaVuelta);
    if (fallaron.length === 0) {
      saltos++; racha++;
      mejorRacha = Math.max(mejorRacha, racha);
      for (const p of jug) p.aciertos++;
      giro = Math.min(GIRO_MAX, giro * 1.022);
      audio.tone({ freq: 620, dur: 0.05, gain: 0.09, type: 'sine' });
      haptics.play('score');
      if (saltos % 10 === 0) decir(`¡${saltos} seguidos!`);
    } else {
      vidas--;
      racha = 0;
      for (const p of fallaron) p.fallos++;
      const nombres = fallaron.map((p) => players[p.i].name).join(' y ');
      decir(`${nombres} tropezó · quedan ${vidas} vida(s)`);
      audio.explosion();
      haptics.play('defeat');
      ctx.shake(5, 6);
      for (const p of fallaron) {
        const x = W / 2 + (p.i === 0 ? -70 : 70);
        particles.burst(x, suelo, 16, {
          speed: 170, dir: -Math.PI / 2, spread: Math.PI * 2,
          color: players[p.i].color, size: 2.8, shape: 'spark', drag: 0.92,
        });
      }
      if (vidas <= 0) { estado = 'fin'; pausa = 1.6; }
    }
    for (const p of jug) p.saltoEnEstaVuelta = false;
  }

  return {
    init() { medir(); reset(); },
    resize(w, h) { W = w; H = h; medir(); },

    update(dt) {
      tiempo += dt;
      if (avisoT > 0) avisoT -= dt;

      if (estado === 'fin') {
        pausa -= dt;
        particles.update(dt);
        if (pausa <= 0) {
          ctx.finish({
            winner: -1,
            scores: [jug[0].aciertos, jug[1].aciertos],
            detail: `${saltos} saltos juntos · mejor racha ${mejorRacha}`,
            record: ctx.record('saltos', saltos, 'high'),
          });
        }
        return;
      }

      for (const p of jug) {
        if (p.aire > 0) p.aire -= dt;
        if (input.player(p.i).pressed('a')) saltar(p);
      }

      const antes = fase;
      fase += giro * dt;
      // La cuerda toca el suelo al cruzar el entero: ahí se juzga.
      if (Math.floor(fase) > Math.floor(antes)) {
        // Cuenta como salto válido quien esté en el aire en ese instante
        for (const p of jug) p.saltoEnEstaVuelta = p.aire > 0;
        resolverVuelta();
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d0a16');

      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#221a38'); grd.addColorStop(1, '#0d0a16');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);

      g.fillStyle = '#1a1428';
      g.fillRect(0, suelo, W, H - suelo);
      g.strokeStyle = '#ff6ec744'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, suelo); g.lineTo(W, suelo); g.stroke();

      // Postes que sujetan la cuerda
      const cx = W / 2, radio = Math.min(W * 0.3, 210);
      for (const s of [-1, 1]) {
        g.fillStyle = '#5a4a6a';
        g.fillRect(cx + s * radio - 4, suelo - 120, 8, 120);
      }

      // Cuerda: un arco que gira. La fase decide dónde está.
      const a = (fase % 1) * TAU;
      g.save();
      g.strokeStyle = '#ffd166';
      g.lineWidth = 4;
      g.shadowColor = '#ffd166'; g.shadowBlur = 10;
      g.beginPath();
      for (let t = 0; t <= 1.001; t += 0.05) {
        const x = cx - radio + t * radio * 2;
        // Semielipse cuya altura depende de la fase (abajo cuando sin(a)>0)
        const comba = Math.sin(Math.PI * t) * 118 * Math.sin(a);
        const y = suelo - 118 + comba + 118 * (1 - Math.sin(a)) * 0;
        t === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
      g.restore();

      // Aviso visual de "ya viene": la zona del suelo se tiñe
      const cerca = Math.abs(Math.sin(a * 0.5)) ;
      const prox = 1 - Math.abs(((fase % 1) + 0.5) % 1 - 0.5) * 2;
      if (prox > 1 - VENTANA * 2) {
        g.save();
        g.globalAlpha = (prox - (1 - VENTANA * 2)) / (VENTANA * 2) * 0.5;
        g.fillStyle = '#ffd166';
        g.fillRect(cx - radio, suelo - 4, radio * 2, 6);
        g.restore();
      }

      particles.render(g);

      // Jugadores
      for (const p of jug) {
        const x = cx + (p.i === 0 ? -70 : 70);
        const alturaSalto = p.aire > 0 ? Math.sin((1 - p.aire / AIRE) * Math.PI) * 74 : 0;
        const y = suelo - alturaSalto;
        const col = players[p.i].color;
        g.save();
        g.fillStyle = '#00000044';
        g.beginPath(); g.ellipse(x, suelo + 2, 16 - alturaSalto * 0.07, 5, 0, 0, TAU); g.fill();
        g.shadowColor = col; g.shadowBlur = 14;
        g.fillStyle = col;
        if (g.roundRect) { g.beginPath(); g.roundRect(x - 13, y - 52, 26, 52, 7); g.fill(); }
        else g.fillRect(x - 13, y - 52, 26, 52);
        g.shadowBlur = 0;
        g.fillStyle = '#0a0812';
        g.beginPath(); g.arc(x - 5, y - 38, 2.6, 0, TAU); g.fill();
        g.beginPath(); g.arc(x + 5, y - 38, 2.6, 0, TAU); g.fill();
        g.restore();
      }

      // HUD
      ctx.engine.text(`${saltos}`, W / 2, 44, { size: 34, color: '#ffffff', glow: 12 });
      ctx.engine.text('saltos juntos', W / 2, 62, { size: 10.5, color: '#ffffff66', font: 'system-ui' });
      for (let k = 0; k < VIDAS; k++) {
        g.fillStyle = k < vidas ? '#ff2e5b' : '#ffffff22';
        g.beginPath(); g.arc(W / 2 - 22 + k * 22, 82, 6, 0, TAU); g.fill();
      }
      for (let i = 0; i < 2; i++) {
        ctx.engine.text(players[i].name, i === 0 ? 16 : W - 16, 26, {
          size: 12, color: players[i].color, align: i === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }
      if (avisoT > 0) ctx.engine.text(aviso, W / 2, H - 40, { size: 13, color: '#ffd166', font: 'system-ui' });
      ctx.engine.text('Los dos saltan con su tecla de acción cuando la cuerda llega abajo',
        W / 2, H - 12, { size: 10.5, color: '#ffffff55', font: 'system-ui' });
    },

    destroy() {},
  };
}
