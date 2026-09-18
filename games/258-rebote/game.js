/**
 * Rebote — no puedes parar.
 *
 * Vas siempre a la misma velocidad y las flechas no te mueven: te GIRAN. Es la
 * diferencia entre conducir y caminar, y cambia por completo cómo se piensa el
 * espacio — dejas de ir a los sitios y empiezas a planear cómo llegar.
 *
 * Las paredes te devuelven con el ángulo de siempre, así que una carambola
 * bien calculada te lleva a la moneda sin tocar el volante. Ahí está la gracia.
 */

export const meta = { render: 'canvas' };

const VEL = 300;
const DURACION = 70;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [0, 1].map((i) => ({ i, x: 0, y: 0, a: 0, r: 14, puntos: 0, estela: [] }));
  let monedas = [];
  let reloj = DURACION, sb = null;

  function sembrar() {
    monedas = [];
    for (let i = 0; i < 6; i++) {
      monedas.push({ x: 70 + ctx.rng() * (W - 140), y: 70 + ctx.rng() * (H - 140), r: 13, viva: true });
    }
  }
  function colocar() {
    jug[0].x = W * 0.25; jug[0].y = H / 2; jug[0].a = 0;
    jug[1].x = W * 0.75; jug[1].y = H / 2; jug[1].a = Math.PI;
    for (const j of jug) j.estela = [];
    sembrar();
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      colocar();
      sb = ctx.ui.scoreboard({ center: `${DURACION} s` });
      sb.update(0, 0);
    },

    resize(nw, nh) { W = nw; H = nh; colocar(); },

    update(dt) {
      reloj -= dt;
      sb?.setCenter(`${Math.max(0, Math.ceil(reloj))} s`);
      if (reloj <= 0) {
        const gana = jug[0].puntos === jug[1].puntos ? -1 : (jug[0].puntos > jug[1].puntos ? 0 : 1);
        ctx.finish({ winner: gana, scores: [jug[0].puntos, jug[1].puntos], detail: 'Sin frenos' });
        return;
      }

      for (const j of jug) {
        const p = input.player(j.i);
        // Las flechas giran; no hay acelerador ni freno.
        const giro = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
        j.a += giro * 3.4 * dt;
        j.x += Math.cos(j.a) * VEL * dt;
        j.y += Math.sin(j.a) * VEL * dt;

        // Rebote con ángulo de verdad: reflejar la componente que toca.
        if (j.x < j.r) { j.x = j.r; j.a = Math.PI - j.a; audio.bounce(j.i); }
        if (j.x > W - j.r) { j.x = W - j.r; j.a = Math.PI - j.a; audio.bounce(j.i); }
        if (j.y < j.r) { j.y = j.r; j.a = -j.a; audio.bounce(j.i); }
        if (j.y > H - j.r) { j.y = H - j.r; j.a = -j.a; audio.bounce(j.i); }

        j.estela.push({ x: j.x, y: j.y });
        if (j.estela.length > 26) j.estela.shift();

        for (const m of monedas) {
          if (!m.viva || Math.hypot(m.x - j.x, m.y - j.y) > j.r + m.r) continue;
          m.viva = false;
          j.puntos++;
          sb.update(jug[0].puntos, jug[1].puntos);
          audio.pickup();
          haptics.score(j.i);
          particles.burst(m.x, m.y, 12, { speed: 180, color: players[j.i].color, size: 3, drag: 0.9 });
        }
      }
      if (monedas.every((m) => !m.viva)) sembrar();
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a0a12');

      for (const m of monedas) {
        if (!m.viva) continue;
        g.fillStyle = '#ffd166';
        g.beginPath(); g.arc(m.x, m.y, m.r, 0, Math.PI * 2); g.fill();
      }
      particles.render(g);

      for (const j of jug) {
        g.strokeStyle = players[j.i].color;
        g.lineWidth = 3;
        g.globalAlpha = 0.35;
        g.beginPath();
        j.estela.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.stroke();
        g.globalAlpha = 1;

        g.save();
        g.translate(j.x, j.y);
        g.rotate(j.a);
        g.fillStyle = players[j.i].color;
        g.beginPath();
        g.moveTo(j.r * 1.5, 0);
        g.lineTo(-j.r, j.r * 0.8);
        g.lineTo(-j.r * 0.4, 0);
        g.lineTo(-j.r, -j.r * 0.8);
        g.closePath();
        g.fill();
        g.restore();
      }

      g.textAlign = 'center';
      g.fillStyle = '#ffffff55';
      g.font = '12px system-ui, sans-serif';
      g.fillText('Las flechas giran. No hay freno.', W / 2, H - 18);
    },

    destroy() { sb?.remove(); },
  };
}
