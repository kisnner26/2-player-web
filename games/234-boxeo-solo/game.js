/**
 * Boxeo — tres asaltos contra la máquina.
 *
 * No es un machaca-botones: es piedra-papel-tijera con tiempo. Golpear deja
 * un hueco en el que estás vendido, cubrirse gasta guardia y esquivar solo
 * sirve si lo haces JUSTO antes del impacto. Ahí está el juego: leer cuándo
 * va a soltar el otro.
 *
 * El bot telegrafía sus golpes —se echa atrás un instante antes— y esa
 * ventana se acorta con la dificultad. Un bot que pega sin avisar no es
 * difícil, es injusto: no te deja aprender nada.
 */

import { crearBot, selectorDificultad } from '../../core/bot.js';
import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const ASALTOS = 3;
const DURA_ASALTO = 45;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let bot = null, selector = null, jugando = false;

  const luchador = () => ({
    vida: 100, guardia: 100, x: 0,
    golpe: 0,        // >0 mientras el puño está fuera
    tipo: null,      // 'jab' | 'cruzado'
    hueco: 0,        // >0 = vulnerable, acaba de fallar o de pegar
    cubre: false,
    esquiva: 0,
    aviso: 0,        // telegrafía del bot
  });

  let l = [luchador(), luchador()];
  let asalto = 1;
  let reloj = DURA_ASALTO;
  let sb = null;
  let mensaje = '';
  let mensajeT = 0;
  let pausa = 0;

  const decir = (t, s = 1.6) => { mensaje = t; mensajeT = s; };

  function nuevoAsalto() {
    l = [luchador(), luchador()];
    l[0].x = W * 0.36; l[1].x = W * 0.64;
    reloj = DURA_ASALTO;
    pausa = 1.2;
    bot?.reiniciar();
    decir(`Asalto ${asalto}`, 2);
    audio.tone({ freq: 880, dur: 0.35, gain: 0.2, type: 'sine' });
  }

  function pegar(quien, tipo) {
    const a = l[quien];
    if (a.golpe > 0 || a.hueco > 0 || a.cubre) return;
    a.tipo = tipo;
    // El cruzado pega más pero deja un hueco mayor. Ése es todo el dilema.
    a.golpe = tipo === 'jab' ? 0.16 : 0.28;
    a.hueco = tipo === 'jab' ? 0.18 : 0.42;
    audio.noise({ dur: 0.05, gain: 0.1, filter: 2600 });
  }

  function impacto(atacante) {
    const def = l[1 - atacante];
    const at = l[atacante];
    const daño = at.tipo === 'jab' ? 6 : 14;

    if (def.esquiva > 0) {
      decir(atacante === 0 ? '¡Te ha esquivado!' : '¡Esquivado!');
      audio.tone({ freq: 300, dur: 0.08, gain: 0.08, sweep: 200 });
      return;
    }
    if (def.cubre && def.guardia > 0) {
      def.guardia = Math.max(0, def.guardia - daño * 1.6);
      audio.tone({ freq: 160, dur: 0.07, gain: 0.12, type: 'square' });
      haptics.impact(1 - atacante, 0.3);
      if (def.guardia === 0) decir('¡Guardia rota!');
      return;
    }
    def.vida = Math.max(0, def.vida - daño);
    // Encajar limpio te deja aturdido un momento: es la ventana del contrario.
    def.hueco = Math.max(def.hueco, at.tipo === 'jab' ? 0.2 : 0.45);
    audio.hit();
    haptics.explosion(1 - atacante);
    ctx.shake(at.tipo === 'jab' ? 5 : 12);
    particles.burst(def.x, H * 0.5, at.tipo === 'jab' ? 10 : 22, {
      speed: 220, color: players[atacante].color, size: 4, drag: 0.9,
    });
    sb?.update(l[0].vida, l[1].vida);

    if (def.vida === 0) {
      setTimeout(() => ctx.finish({
        winner: atacante, scores: [l[0].vida, l[1].vida],
        detail: `K.O. en el asalto ${asalto}`,
      }), 900);
      pausa = 99;
    }
  }

  function decidirBot(dt) {
    const b = l[1], h = l[0];
    // El bot lee tu hueco: si acabas de tirar un cruzado, castiga.
    const oportunidad = h.hueco > 0 ? 1 : (h.cubre ? 0.15 : 0.4);

    if (b.aviso > 0) {
      b.aviso -= dt;
      if (b.aviso <= 0) pegar(1, bot.decide(0.4) ? 'cruzado' : 'jab');
      return;
    }
    if (b.golpe > 0 || b.hueco > 0) { b.cubre = false; return; }

    // Cubrirse cuando tú estás soltando.
    if (h.golpe > 0 && bot.decide(1.6 * dt * 60 * 0.02)) { b.cubre = true; return; }
    b.cubre = h.golpe > 0 && bot.decide(0.9);

    if (!b.cubre && bot.decide(oportunidad * dt * 2.2)) {
      // Telegrafía: se echa atrás antes de soltar. La ventana se acorta con
      // la dificultad, así que en fácil te da tiempo de sobra a reaccionar.
      b.aviso = bot.dificultad.reaccion * 1.4;
    }
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      sb = ctx.ui.scoreboard({ center: `Asalto 1/${ASALTOS}` });
      sb.update(100, 100);
      selector = selectorDificultad(ctx.frame, (id) => {
        bot = crearBot({ dificultad: id, rng: ctx.rng });
        jugando = true;
        nuevoAsalto();
      }, { color: players[0].color });
      l[0].x = W * 0.36; l[1].x = W * 0.64;
    },

    resize(nw, nh) { W = nw; H = nh; l[0].x = W * 0.36; l[1].x = W * 0.64; },

    update(dt) {
      if (mensajeT > 0) mensajeT -= dt;
      if (!jugando) { selector?.navegar(input.player(0)); return; }
      if (pausa > 0) { pausa -= dt; particles.update(dt); return; }

      const yo = input.player(0);

      for (const a of l) {
        if (a.golpe > 0) a.golpe -= dt;
        if (a.hueco > 0) a.hueco -= dt;
        if (a.esquiva > 0) a.esquiva -= dt;
        if (!a.cubre) a.guardia = Math.min(100, a.guardia + 14 * dt);
      }

      // --- Humano ---
      l[0].cubre = yo.held('down') && l[0].golpe <= 0 && l[0].hueco <= 0;
      if (l[0].cubre) l[0].guardia = Math.max(0, l[0].guardia - 9 * dt);
      if (yo.pressed('up') && l[0].esquiva <= 0 && l[0].hueco <= 0) {
        l[0].esquiva = 0.26;
        audio.tone({ freq: 500, dur: 0.05, gain: 0.07, sweep: 240 });
      }
      if (yo.pressed('a')) pegar(0, 'jab');
      if (yo.pressed('b')) pegar(0, 'cruzado');

      // --- Bot ---
      decidirBot(dt);

      // --- Resolución de golpes: impactan al llegar al final del recorrido ---
      for (const quien of [0, 1]) {
        const a = l[quien];
        if (a.tipo && a.golpe > 0 && a.golpe <= dt * 1.5) impacto(quien);
        if (a.golpe <= 0) a.tipo = null;
      }

      // --- Reloj del asalto ---
      reloj -= dt;
      if (reloj <= 0) {
        if (asalto >= ASALTOS) {
          const gana = l[0].vida === l[1].vida ? -1 : (l[0].vida > l[1].vida ? 0 : 1);
          ctx.finish({
            winner: gana, scores: [l[0].vida, l[1].vida],
            detail: 'A los puntos tras 3 asaltos',
          });
          pausa = 99;
          return;
        }
        asalto++;
        sb?.setCenter(`Asalto ${asalto}/${ASALTOS}`);
        nuevoAsalto();
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#14100e');

      // Lona y cuerdas
      g.fillStyle = '#2c2119';
      g.fillRect(W * 0.06, H * 0.28, W * 0.88, H * 0.5);
      g.strokeStyle = '#ffffff22';
      g.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        const y = H * 0.3 + i * H * 0.16;
        g.beginPath(); g.moveTo(W * 0.06, y); g.lineTo(W * 0.94, y); g.stroke();
      }

      particles.render(g);

      // Boxeadores
      for (const quien of [0, 1]) {
        const a = l[quien];
        const dir = quien === 0 ? 1 : -1;
        const y = H * 0.5;
        const atras = a.aviso > 0 ? -8 * dir : 0;
        const esq = a.esquiva > 0 ? 16 * -dir : 0;

        g.save();
        g.translate(a.x + atras + esq, y);
        // Cuerpo
        g.fillStyle = players[quien].color;
        g.globalAlpha = a.hueco > 0 ? 0.6 : 1;
        g.fillRect(-26, -60, 52, 110);
        // Guardia levantada
        g.fillStyle = a.cubre ? '#ffffffdd' : players[quien].color;
        if (a.cubre) g.fillRect(-30, -50, 60, 34);
        // Puño saliendo
        if (a.golpe > 0) {
          const avance = (1 - a.golpe / (a.tipo === 'jab' ? 0.16 : 0.28)) * (a.tipo === 'jab' ? 60 : 86);
          g.fillStyle = '#ffffff';
          g.beginPath();
          g.arc(dir * (26 + avance), -20, a.tipo === 'jab' ? 11 : 15, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();

        // Barras de guardia bajo cada uno
        g.fillStyle = '#00000066';
        g.fillRect(a.x - 34, H * 0.5 + 62, 68, 7);
        g.fillStyle = a.guardia > 30 ? '#8fd9ff' : '#ff8f5a';
        g.fillRect(a.x - 34, H * 0.5 + 62, 68 * (a.guardia / 100), 7);
      }

      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.font = 'bold 26px system-ui, sans-serif';
      g.fillText(Math.ceil(reloj), W / 2, H * 0.22);
      if (mensajeT > 0) {
        g.font = '18px system-ui, sans-serif';
        g.fillStyle = '#ffffffcc';
        g.fillText(mensaje, W / 2, H * 0.86);
      }
      g.font = '12px system-ui, sans-serif';
      g.fillStyle = '#ffffff66';
      g.fillText('← → nada · ↑ esquivar · ↓ cubrirse · acción jab · especial cruzado', W / 2, H * 0.94);
    },

    destroy() { selector?.destruir(); sb?.remove(); },
  };
}
