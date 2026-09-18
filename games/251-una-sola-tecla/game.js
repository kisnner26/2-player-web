/**
 * Una Sola Tecla — los dos compartís el MISMO botón.
 *
 * Hay una tecla, la L, y es de quien la coja. Al pulsarla se te asigna durante
 * un segundo y medio y al otro no le responde. Todo el juego es una pelea por
 * el turno de un único botón, que es algo que solo puede pasar con dos
 * personas en el mismo teclado — no tiene equivalente jugando en red.
 *
 * Lo que hace la tecla depende de dónde esté el cursor cuando la coges, así
 * que no vale machacarla: hay que cogerla en el momento bueno.
 */

export const meta = { render: 'canvas' };

const DURACION = 60;
const BLOQUEO = 1.5;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let dueño = -1;             // quién tiene la tecla ahora
  let bloqueo = 0;
  let cursor = 0;             // 0..1, va y viene por la barra
  let dir = 1;
  let puntos = [0, 0];
  let reloj = DURACION;
  let sb = null;
  let flash = 0, ultimo = -1, ultimoValor = 0;

  /* La barra tiene tres zonas: el centro da mucho, los lados quitan. Coger la
     tecla en mal momento te cuesta puntos, y eso es lo que impide machacarla. */
  const valorDe = (c) => {
    const d = Math.abs(c - 0.5);
    if (d < 0.06) return 5;
    if (d < 0.16) return 2;
    if (d < 0.32) return 0;
    return -2;
  };

  function coger(i) {
    if (bloqueo > 0) return;
    dueño = i;
    bloqueo = BLOQUEO;
    const v = valorDe(cursor);
    puntos[i] += v;
    ultimo = i; ultimoValor = v; flash = 0.5;
    sb.update(puntos[0], puntos[1]);
    if (v > 0) { audio.pickup(); haptics.score(i); }
    else if (v < 0) { audio.error(); haptics.error(i); }
    else audio.blip();
    particles.burst(W * cursor, H * 0.5, v > 0 ? 18 : 8, {
      speed: 200, color: v > 0 ? players[i].color : '#ff4757', size: 3, drag: 0.9,
    });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      sb = ctx.ui.scoreboard({ center: `${DURACION} s` });
      sb.update(0, 0);
      // La L se escucha como tecla FÍSICA, igual que los juegos de machaque:
      // es la única forma de que sea de verdad la misma para los dos.
      input.on('KeyL', () => {
        if (bloqueo > 0) return;
        // Quien la coge es quien la pulsa; como es una sola tecla, se reparte
        // por turnos: le toca al que no la tuvo la última vez.
        coger(dueño === 0 ? 1 : 0);
      });
    },

    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      reloj -= dt;
      sb?.setCenter(`${Math.max(0, Math.ceil(reloj))} s`);
      if (reloj <= 0) {
        const gana = puntos[0] === puntos[1] ? -1 : (puntos[0] > puntos[1] ? 0 : 1);
        ctx.finish({ winner: gana, scores: puntos, detail: `${puntos[0]} – ${puntos[1]}` });
        return;
      }
      if (bloqueo > 0) bloqueo -= dt;
      if (flash > 0) flash -= dt;

      // El cursor acelera con el tiempo: al final es un pulso.
      const vel = 0.55 + (1 - reloj / DURACION) * 0.85;
      cursor += dir * vel * dt;
      if (cursor > 1) { cursor = 1; dir = -1; }
      if (cursor < 0) { cursor = 0; dir = 1; }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#100c16');

      const y = H * 0.5, alto = 70;
      // Zonas
      const zonas = [[0, 0.18, '#ff475733'], [0.18, 0.34, '#ffffff10'],
                     [0.34, 0.44, '#ffd16644'], [0.44, 0.56, '#a8ff3e55'],
                     [0.56, 0.66, '#ffd16644'], [0.66, 0.82, '#ffffff10'], [0.82, 1, '#ff475733']];
      for (const [a, b, col] of zonas) {
        g.fillStyle = col;
        g.fillRect(W * a, y - alto / 2, W * (b - a), alto);
      }
      particles.render(g);

      // Cursor
      g.fillStyle = bloqueo > 0 ? '#ffffff55' : '#ffffff';
      g.fillRect(W * cursor - 3, y - alto / 2 - 12, 6, alto + 24);

      // De quién es la tecla ahora
      g.textAlign = 'center';
      g.fillStyle = '#ffffff';
      g.font = 'bold 30px system-ui, sans-serif';
      if (bloqueo > 0 && dueño >= 0) {
        g.fillStyle = players[dueño].color;
        g.fillText(`L de ${players[dueño].name} · ${bloqueo.toFixed(1)}s`, W / 2, y - alto);
      } else {
        g.fillText('L libre', W / 2, y - alto);
      }

      if (flash > 0 && ultimo >= 0) {
        g.globalAlpha = flash * 2;
        g.fillStyle = ultimoValor > 0 ? players[ultimo].color : '#ff4757';
        g.font = 'bold 44px system-ui, sans-serif';
        g.fillText(ultimoValor > 0 ? `+${ultimoValor}` : String(ultimoValor), W / 2, y + alto + 40);
        g.globalAlpha = 1;
      }

      g.fillStyle = '#ffffff66';
      g.font = '13px system-ui, sans-serif';
      g.fillText('Una sola tecla: la L. El centro da 5, los bordes quitan 2.', W / 2, H - 24);
    },

    destroy() { sb?.remove(); },
  };
}
