/**
 * Backgammon — reglas completas, incluidas las que todo el mundo se salta.
 *
 * Está todo: los dobles se juegan cuatro veces, una ficha sola es un "blot" y
 * comerla la manda a la barra, con ficha en la barra no se puede hacer nada
 * más hasta reentrarla, y solo se saca del tablero cuando las quince están en
 * casa —con la regla fina de que un dado mayor del necesario solo vale si no
 * queda nada más atrás.
 *
 * Lo que no está es el cubo de doblar: en una partida de sofá, doblar la
 * apuesta con un marcador histórico de por medio solo complica el reparto.
 */

export const meta = { render: 'canvas', sinCuentaAtras: true };

/** puntos[i] = número de fichas; signo indica dueño (+ = J1, − = J2). */
const INICIAL = [
  2, 0, 0, 0, 0, -5, 0, -3, 0, 0, 0, 5,
  -2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5,
];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let puntos = [];
  let barra = [0, 0], fuera = [0, 0];
  let turno = 0, dados = [], usados = [], dadoSel = 0;
  let cursor = 23, mensaje = '', terminado = false, t = 0;
  let sb = null;

  /** Dirección de avance: J1 va de 23 a 0, J2 de 0 a 23. */
  const dir = (j) => (j === 0 ? -1 : 1);
  const mio = (j, i) => (j === 0 ? puntos[i] > 0 : puntos[i] < 0);
  const cuantas = (i) => Math.abs(puntos[i]);
  const dueño = (i) => (puntos[i] === 0 ? -1 : puntos[i] > 0 ? 0 : 1);
  const casaDe = (j) => (j === 0 ? [0, 1, 2, 3, 4, 5] : [18, 19, 20, 21, 22, 23]);

  function todasEnCasa(j) {
    if (barra[j] > 0) return false;
    for (let i = 0; i < 24; i++) {
      if (mio(j, i) && !casaDe(j).includes(i)) return false;
    }
    return true;
  }

  /** Ficha más atrasada respecto a la salida, para la regla del dado grande. */
  function masLejos(j) {
    const casa = casaDe(j);
    let peor = -1;
    for (const i of casa) if (mio(j, i)) peor = j === 0 ? Math.max(peor, i) : (peor < 0 ? i : Math.min(peor, i));
    return peor;
  }

  function libresPara(j, destino) {
    if (destino < 0 || destino > 23) return false;
    return dueño(destino) === -1 || dueño(destino) === j || cuantas(destino) === 1;
  }

  /** ¿Se puede mover desde `desde` con este valor de dado? */
  function legal(j, desde, valor) {
    if (barra[j] > 0 && desde !== -1) return false;
    if (desde === -1) {
      if (barra[j] === 0) return false;
      const entrada = j === 0 ? 24 - valor : valor - 1;
      return libresPara(j, entrada);
    }
    if (!mio(j, desde)) return false;
    const destino = desde + dir(j) * valor;
    if (destino >= 0 && destino <= 23) return libresPara(j, destino);
    // Sacar del tablero.
    if (!todasEnCasa(j)) return false;
    const exacto = j === 0 ? desde + 1 : 24 - desde;
    if (valor === exacto) return true;
    if (valor < exacto) return false;
    // Dado mayor del necesario: solo si no queda nada más atrás en la casa.
    const lejos = masLejos(j);
    return j === 0 ? desde === lejos : desde === lejos;
  }

  function pendientes() {
    return dados.filter((_, k) => !usados[k]);
  }

  function hayJugada(j) {
    for (let k = 0; k < dados.length; k++) {
      if (usados[k]) continue;
      if (barra[j] > 0) { if (legal(j, -1, dados[k])) return true; continue; }
      for (let i = 0; i < 24; i++) if (legal(j, i, dados[k])) return true;
    }
    return false;
  }

  /**
   * Tira y, si al jugador no le sale ninguna jugada, pasa y vuelve a tirar por
   * el otro. Es un bucle y no una llamada recursiva a propósito: con los dos
   * bloqueados podrían encadenarse muchos turnos vacíos seguidos.
   */
  function tirar() {
    for (let intento = 0; intento < 40; intento++) {
      const a = 1 + Math.floor(rng() * 6);
      const b = 1 + Math.floor(rng() * 6);
      dados = a === b ? [a, a, a, a] : [a, b];
      usados = dados.map(() => false);
      dadoSel = 0;
      audio.tone({ freq: 460, dur: 0.1, gain: 0.15, type: 'square' });
      if (hayJugada(turno)) {
        mensaje = a === b ? `¡Dobles de ${a}! cuatro movimientos` : `${a} y ${b}`;
        haptics.play('click', { player: turno });
        return;
      }
      mensaje = `${players[turno].name} saca ${a} y ${b}: sin jugadas, pasa`;
      turno = 1 - turno;
      cursor = barra[turno] > 0 ? -1 : (turno === 0 ? 23 : 0);
    }
  }

  function cambiarTurno() {
    turno = 1 - turno;
    cursor = barra[turno] > 0 ? -1 : (turno === 0 ? 23 : 0);
    tirar();
  }

  function primerDadoLegal(desde) {
    // Se prueba primero el dado seleccionado y después el resto.
    const orden = [dadoSel, ...dados.map((_, k) => k)];
    for (const k of orden) {
      if (usados[k]) continue;
      if (legal(turno, desde, dados[k])) return k;
    }
    return -1;
  }

  function mover(desde) {
    const k = primerDadoLegal(desde);
    if (k < 0) {
      mensaje = 'Con ese dado no puedes';
      audio.error();
      haptics.error(turno);
      return;
    }
    const valor = dados[k];
    const j = turno;
    const signo = j === 0 ? 1 : -1;

    if (desde === -1) {
      const entrada = j === 0 ? 24 - valor : valor - 1;
      comer(entrada, j);
      puntos[entrada] += signo;
      barra[j]--;
      cursor = entrada;
    } else {
      const destino = desde + dir(j) * valor;
      puntos[desde] -= signo;
      if (destino < 0 || destino > 23) {
        fuera[j]++;
        audio.pickup();
        particles.burst(W / 2, H / 2, 16, { speed: 200, color: players[j].color, size: 4, drag: 0.9 });
      } else {
        comer(destino, j);
        puntos[destino] += signo;
        cursor = destino;
      }
    }

    usados[k] = true;
    audio.place();
    haptics.play('click', { player: j });
    sb.update(fuera[0], fuera[1]);

    if (fuera[j] >= 15) {
      terminado = true;
      audio.win();
      haptics.victory(j);
      const gammon = fuera[1 - j] === 0;
      ctx.finish({
        winner: j, scores: fuera,
        detail: gammon ? '¡Gammon! el rival no sacó ninguna' : `${fuera[1 - j]} fichas del rival fuera`,
      });
      return;
    }

    if (!pendientes().length || !hayJugada(j)) {
      mensaje = 'Turno completado';
      cambiarTurno();
    }
  }

  function comer(destino, j) {
    if (dueño(destino) === 1 - j && cuantas(destino) === 1) {
      puntos[destino] = 0;
      barra[1 - j]++;
      audio.hit();
      haptics.impact(1 - j, 1.1);
      ctx.shake(6);
      mensaje = `¡Come! ${players[1 - j].name} a la barra`;
    }
  }

  /* ---------------- Dibujo ---------------- */

  const margen = () => Math.min(60, W * 0.05);
  const anchoPunto = () => (W - margen() * 2 - 40) / 12;
  const altoPunto = () => H * 0.36;

  function posPunto(i) {
    // 0-11 abajo de derecha a izquierda; 12-23 arriba de izquierda a derecha.
    const an = anchoPunto();
    if (i < 12) {
      const col = 11 - i;
      const x = margen() + col * an + (col >= 6 ? 40 : 0);
      return { x: x + an / 2, y: H * 0.88, abajo: true };
    }
    const col = i - 12;
    const x = margen() + col * an + (col >= 6 ? 40 : 0);
    return { x: x + an / 2, y: H * 0.12, abajo: false };
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      puntos = [...INICIAL];
      barra = [0, 0];
      fuera = [0, 0];
      turno = 0;
      cursor = 23;
      sb = ui.scoreboard({ center: 'saca tus 15 fichas' });
      tirar();
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);
      const pl = input.player(turno);

      if (barra[turno] > 0) {
        cursor = -1;
        if (pl.pressed('a')) mover(-1);
        if (pl.pressed('b')) siguienteDado();
        return;
      }

      if (pl.pressed('left')) { cursor = (cursor + 23) % 24; audio.tick(); }
      if (pl.pressed('right')) { cursor = (cursor + 1) % 24; audio.tick(); }
      if (pl.pressed('up') || pl.pressed('down')) siguienteDado();
      if (pl.pressed('b')) siguienteDado();
      if (pl.pressed('a')) mover(cursor);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#1a1008');

      // Paño y marco
      g.fillStyle = '#2a1a0e';
      g.fillRect(margen() - 12, H * 0.06, W - margen() * 2 + 24, H * 0.86);
      const an = anchoPunto(), al = altoPunto();

      for (let i = 0; i < 24; i++) {
        const p = posPunto(i);
        const claro = i % 2 === 0;
        g.fillStyle = claro ? '#c8a06a' : '#7a4a2c';
        g.beginPath();
        if (p.abajo) {
          g.moveTo(p.x - an / 2 + 3, p.y);
          g.lineTo(p.x + an / 2 - 3, p.y);
          g.lineTo(p.x, p.y - al);
        } else {
          g.moveTo(p.x - an / 2 + 3, p.y);
          g.lineTo(p.x + an / 2 - 3, p.y);
          g.lineTo(p.x, p.y + al);
        }
        g.closePath();
        g.fill();

        if (i === cursor && !terminado) {
          g.strokeStyle = players[turno].color;
          g.lineWidth = 3;
          g.stroke();
        }

        const n = cuantas(i);
        const j = dueño(i);
        const r = Math.min(an * 0.42, 18);
        for (let k = 0; k < Math.min(n, 6); k++) {
          const y = p.abajo ? p.y - r - k * r * 1.9 : p.y + r + k * r * 1.9;
          g.save();
          g.shadowColor = '#000a';
          g.shadowBlur = 6;
          g.fillStyle = players[j].color;
          g.beginPath(); g.arc(p.x, y, r, 0, Math.PI * 2); g.fill();
          g.restore();
          g.fillStyle = '#00000033';
          g.beginPath(); g.arc(p.x, y, r * 0.6, 0, Math.PI * 2); g.fill();
        }
        if (n > 6) {
          const y = p.abajo ? p.y - r - 5 * r * 1.9 : p.y + r + 5 * r * 1.9;
          ctx.engine.text(String(n), p.x, y, { size: 13, color: '#0d0d16', font: 'system-ui' });
        }
      }

      // Barra central
      g.fillStyle = '#160d07';
      g.fillRect(margen() + an * 6, H * 0.06, 40, H * 0.86);
      for (const j of [0, 1]) {
        for (let k = 0; k < barra[j]; k++) {
          const y = H * (j === 0 ? 0.62 : 0.38) + (j === 0 ? 1 : -1) * k * 16;
          ctx.engine.glowCircle(margen() + an * 6 + 20, y, 11, players[j].color, barra[turno] > 0 && j === turno ? 20 : 6);
        }
      }

      // Dados y estado
      const dy = H * 0.5 - 22;
      pendientes().length && dados.forEach((d, k) => {
        if (usados[k]) return;
        const dx = W * 0.62 + k * 44;
        const sel = k === dadoSel;
        g.fillStyle = sel ? '#fff8e0' : '#c9c3b0';
        g.beginPath(); g.roundRect(dx, dy, 36, 36, 7); g.fill();
        if (sel) {
          g.strokeStyle = players[turno].color;
          g.lineWidth = 3;
          g.stroke();
        }
        ctx.engine.text(String(d), dx + 18, dy + 19, { size: 19, color: '#221a12', font: 'system-ui' });
      });

      ctx.engine.text(`TURNO DE ${players[turno].name.toUpperCase()}`, W * 0.5, H * 0.47, {
        size: 15, color: players[turno].color, font: 'system-ui',
      });
      ctx.engine.text(mensaje, W * 0.5, H * 0.53, { size: 12, color: '#d8c8a8', font: 'system-ui' });
      for (const j of [0, 1]) {
        ctx.engine.text(`fuera: ${fuera[j]}/15`, j === 0 ? 16 : W - 16, H * 0.5, {
          size: 12, color: players[j].color, align: j === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }

      particles.render(g);
      ctx.engine.text('←/→ eligen punto · tu tecla mueve · la especial cambia de dado · con ficha en la barra, primero entra',
        W / 2, H - 8, { size: 11, color: '#8a7a5a', font: 'system-ui' });
    },
  };

  function siguienteDado() {
    const libres = dados.map((_, k) => k).filter((k) => !usados[k]);
    if (libres.length < 2) return;
    const pos = libres.indexOf(dadoSel);
    dadoSel = libres[(pos + 1) % libres.length];
    audio.blip();
  }
}
