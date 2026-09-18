/**
 * Artillería — duelo por turnos contra la máquina, con viento.
 *
 * Aquí el bot no necesita trampas ni tablas: usa `velocidadParaAlcance()` de
 * core/fisica3d.js, la MISMA función que resuelve la parábola para cualquiera,
 * y calcula el disparo perfecto. Después le mete el error de core/bot.js.
 * Es la forma honesta de hacer un bot de puntería: sabe apuntar bien y falla
 * a propósito, en vez de acertar por decreto.
 *
 * El viento cambia cada turno y afecta a los dos por igual: es lo que impide
 * memorizar un ángulo y repetirlo toda la partida.
 */

import { crearMundo, mat, esfera, caja, cilindro, suelo, sala, crearPanel } from '../../core/tres.js';
import * as F from '../../core/fisica3d.js';
import { crearBot, selectorDificultad } from '../../core/bot.js';
import { clamp } from '../../core/math2d.js';

export const meta = { render: 'dom', sinCuentaAtras: true, turnos: true };

const SEPARACION = 62;
const VIDAS = 3;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#101b30', horizonte: '#4a6b93', sol: 2.8, solPos: [-20, 34, 16],
    sombraArea: 46, fov: 46, niebla: 0.005,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#3c3222', veta: '#2c2418', lineas: 30, repite: 30 });
  mundo.camara.position.set(0, 26, 62);
  mundo.camara.lookAt(0, 6, 0);

  const canon = [0, 1].map((i) => {
    const x = i === 0 ? -SEPARACION / 2 : SEPARACION / 2;
    const base = cilindro(3, 3.6, 2.4, mat('#4a5568', { rug: 0.7 }), [x, 1.2, 0], 16);
    base.castShadow = true;
    mundo.escena.add(base);
    const tubo = cilindro(0.7, 0.85, 9, mat(players[i].color, { rug: 0.4, met: 0.4 }), null, 12);
    tubo.position.set(x, 3.2, 0);
    tubo.castShadow = true;
    mundo.escena.add(tubo);
    return { x, tubo, vidas: VIDAS, angulo: i === 0 ? 0.9 : Math.PI - 0.9 };
  });

  // Bala reutilizando el cuerpo físico de core/fisica3d.js.
  const bala = F.cuerpo({ r: 0.7, masa: 1 });
  bala.malla = esfera(0.7, mat('#ffd166', { emisivo: '#ffd166', brillo: 1.4 }), [0, -50, 0], 12);
  mundo.escena.add(bala.malla);
  let volando = false;

  let bot = null, selector = null, jugando = false;
  let turno = 0, potencia = 0, cargando = false, viento = 0, sb = null;
  let pausa = 0, acabado = false;
  let aviso = '', avisoT = 0;
  const decir = (t, s = 2.2) => { aviso = t; avisoT = s; };

  function nuevoTurno() {
    viento = (ctx.rng() * 2 - 1) * 9;
    potencia = 0; cargando = false;
    bot?.reiniciar();
    pausa = turno === 1 ? 1.1 : 0;      // el bot "piensa" un momento
  }

  function disparar(quien, ang, fuerza) {
    const c = canon[quien];
    bala.pos.set(c.x + Math.cos(ang) * 6, 4 + Math.sin(ang) * 6, 0);
    bala.vel.set(Math.cos(ang) * fuerza, Math.sin(ang) * fuerza, 0);
    bala.malla.visible = true;
    volando = true;
    audio.tone({ freq: 140, dur: 0.16, gain: 0.24, type: 'square', sweep: -70 });
    audio.noise({ dur: 0.2, gain: 0.16, filter: 900 });
    haptics.impact(quien, 0.9);
    ctx.shake(7);
  }

  function impactoEn(x) {
    for (const [i, c] of canon.entries()) {
      if (Math.abs(x - c.x) > 5) continue;
      c.vidas--;
      sb?.update(canon[0].vidas, canon[1].vidas);
      audio.explosion();
      haptics.explosion(i);
      ctx.shake(16);
      decir(i === 0 ? '¡Te ha dado!' : '¡Impacto!');
      if (c.vidas <= 0) {
        acabado = true;
        setTimeout(() => ctx.finish({
          winner: 1 - i, scores: [canon[0].vidas, canon[1].vidas],
          detail: `${canon[1 - i].vidas} de ${VIDAS} en pie`,
        }), 900);
      }
      return true;
    }
    return false;
  }

  return {
    init() {
      sb = ctx.ui.scoreboard({ center: 'Artillería' });
      sb.update(VIDAS, VIDAS);
      selector = selectorDificultad(ctx.frame, (id) => {
        bot = crearBot({ dificultad: id, rng: ctx.rng });
        jugando = true;
        nuevoTurno();
      }, { color: players[0].color });
    },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      if (!jugando) { selector?.navegar(input.player(0)); mundo.dibujar(); return; }
      if (acabado) { mundo.dibujar(); return; }

      for (const [i, c] of canon.entries()) c.tubo.rotation.z = c.angulo - Math.PI / 2;

      if (volando) {
        F.integrar(bala, dt, { viento: { x: viento, y: 0, z: 0 } });
        bala.malla.position.copy(bala.pos);
        if (bala.pos.y <= 0.7) {
          volando = false;
          bala.malla.visible = false;
          const dio = impactoEn(bala.pos.x);
          if (!dio) { audio.thud(); decir('Fallo'); }
          if (!acabado) { turno = 1 - turno; nuevoTurno(); }
        }
        mundo.dibujar();
        return;
      }

      if (pausa > 0) { pausa -= dt; mundo.dibujar(); return; }

      if (turno === 0) {
        const p = input.player(0);
        if (p.held('up')) canon[0].angulo = clamp(canon[0].angulo + 0.7 * dt, 0.15, 1.5);
        if (p.held('down')) canon[0].angulo = clamp(canon[0].angulo - 0.7 * dt, 0.15, 1.5);
        if (p.pressed('a')) { cargando = true; potencia = 0; }
        if (cargando && p.held('a')) potencia = Math.min(1, potencia + dt * 0.75);
        if (cargando && p.released('a')) {
          disparar(0, canon[0].angulo, 16 + potencia * 30);
          cargando = false;
        }
      } else {
        /* El bot resuelve la parábola de verdad y luego falla a propósito. */
        const dist = canon[0].x - canon[1].x;                     // negativo: dispara a −x
        const ang = Math.PI - 0.82;
        const ideal = F.velocidadParaAlcance(Math.abs(dist), 0, 0.82) || 34;
        // El viento lo compensa a medias: cuanto más fácil, peor lo lee.
        const compensa = -viento * (0.35 + bot.dificultad.tope * 0.55);
        const v = bot.percibir(ideal + compensa, dt, { escalaError: 9 });
        canon[1].angulo = ang;
        disparar(1, ang, clamp(v, 14, 52));
      }
      mundo.dibujar();
    },

    render() {},

    destroy() { selector?.destruir(); sb?.remove(); panel.destruir(); mundo.destruir(); },
  };
}
