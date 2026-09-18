/**
 * Torre de Control — el piloto vuela dentro de la nube y el radar está fuera.
 *
 * En la pantalla grande solo se ve la cabina: el morro, el altímetro y una
 * niebla que no deja ver más de dos segundos por delante. El radar completo,
 * con las montañas y la pista, está en el mando del controlador.
 *
 * El controlador no puede tocar los mandos del avión y el piloto no puede ver
 * el radar. Todo se resuelve con instrucciones cortas —"sube dos", "cuatro a
 * la izquierda"— y con la disciplina de repetirlas, igual que en la radio de
 * verdad.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const LARGO = 3600;
const CARRILES = 7;
const TIEMPO = 130;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let avion = { carril: 3, altura: 3, avance: 0, vel: 150 };
  let obstaculos = [], pista = { carril: 3, altura: 1 };
  let combustible = 100, golpes = 0, t = 0, terminado = false, aviso = 0;
  let controlador = 1, sb = null, mensaje = '';

  function generar() {
    obstaculos = [];
    for (let y = 400; y < LARGO - 400; y += 210) {
      // Una pared con un hueco: el hueco es lo que hay que cantar.
      const huecoC = Math.floor(rng() * CARRILES);
      const huecoA = Math.floor(rng() * CARRILES);
      obstaculos.push({ y: y + rng() * 60, huecoC, huecoA });
    }
    pista = { carril: Math.floor(rng() * CARRILES), altura: 0 };
  }

  function mandarRadar() {
    const proximos = obstaculos
      .filter((o) => o.y > avion.avance && o.y < avion.avance + 900)
      .slice(0, 3)
      .map((o, i) => `${i === 0 ? '►' : ' '} a ${Math.round(o.y - avion.avance)} m: hueco col ${o.huecoC + 1}, alt ${o.huecoA + 1}`);
    ctx.mando.perfil(controlador, {
      disposicion: 'pila',
      juego: 'Torre de Control',
      pie: 'Cántale los huecos · no le enseñes la pantalla',
      controles: [
        {
          tipo: 'secreto',
          titulo: 'RADAR',
          texto: proximos.join('\n') || 'cielo despejado',
          dato: `pista: col ${pista.carril + 1}, alt ${pista.altura + 1} · restan ${Math.max(0, Math.round(LARGO - avion.avance))} m`,
        },
      ],
    });
    ctx.mando.perfil(1 - controlador, {
      disposicion: 'dual',
      juego: 'Torre de Control',
      pie: 'Vuela a ciegas: hazle caso',
      controles: [{ tipo: 'cruz' }, { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Gas', glifo: '⏵' }] }],
    });
  }

  function chocar(o) {
    golpes++;
    combustible -= 18;
    aviso = 0.8;
    mensaje = '¡Roce con la pared!';
    audio.explosion();
    haptics.explosion(1 - controlador);
    ctx.shake(14);
    particles.burst(W / 2, H * 0.5, 24, { speed: 260, color: '#ff4757', size: 4, drag: 0.9 });
    avion.vel = 90;
    o.golpeado = true;
    sb.update(Math.round(combustible), golpes);
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      generar();
      sb = ui.scoreboard({ center: 'llegad a la pista' });
      mandarRadar();
      ui.toast(`${players[controlador].name} lleva el radar · ${players[1 - controlador].name} pilota`, { ms: 2800 });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      aviso = Math.max(0, aviso - dt);
      particles.update(dt);

      const pl = input.player(1 - controlador);
      if (pl.pressed('left')) { avion.carril = clamp(avion.carril - 1, 0, CARRILES - 1); audio.tick(); mandarRadar(); }
      if (pl.pressed('right')) { avion.carril = clamp(avion.carril + 1, 0, CARRILES - 1); audio.tick(); mandarRadar(); }
      if (pl.pressed('up')) { avion.altura = clamp(avion.altura + 1, 0, CARRILES - 1); audio.tick(); mandarRadar(); }
      if (pl.pressed('down')) { avion.altura = clamp(avion.altura - 1, 0, CARRILES - 1); audio.tick(); mandarRadar(); }

      const gas = pl.held('a');
      avion.vel = clamp(avion.vel + (gas ? 130 : -60) * dt, 70, 340);
      combustible -= (0.55 + (gas ? 0.9 : 0)) * dt;
      avion.avance += avion.vel * dt;

      if (Math.floor(avion.avance / 150) !== Math.floor((avion.avance - avion.vel * dt) / 150)) mandarRadar();

      for (const o of obstaculos) {
        if (o.golpeado || Math.abs(o.y - avion.avance) > 22) continue;
        if (o.huecoC !== avion.carril || o.huecoA !== avion.altura) chocar(o);
        else {
          o.golpeado = true;
          audio.pickup();
          haptics.score(null);
          particles.burst(W / 2, H * 0.5, 10, { speed: 150, color: '#3effc8', size: 3, drag: 0.9 });
        }
      }

      if (combustible <= 0) {
        terminado = true;
        audio.lose();
        ctx.finish({
          winner: -1, scores: [Math.round((avion.avance / LARGO) * 100), golpes],
          detail: `Sin combustible al ${Math.round((avion.avance / LARGO) * 100)}% del trayecto`,
        });
        return;
      }

      if (avion.avance >= LARGO) {
        terminado = true;
        const bien = avion.carril === pista.carril && avion.altura === pista.altura;
        if (bien) { audio.win(); haptics.victory(null); } else audio.lose();
        ctx.finish({
          winner: -1,
          scores: [Math.round(combustible), golpes],
          detail: bien
            ? `¡Aterrizaje limpio! ${golpes} roces y ${Math.round(combustible)} de combustible`
            : `Fuera de pista: estabais en col ${avion.carril + 1}, alt ${avion.altura + 1}`,
          record: bien ? ctx.record('combustible', Math.round(combustible), 'high') : false,
        });
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a1018');

      // Niebla en capas: da sensación de avance sin ver nada.
      for (let i = 0; i < 7; i++) {
        const z = ((i * 130 + (avion.avance % 130)) % 910) / 910;
        g.fillStyle = `rgba(150,180,210,${0.03 + z * 0.05})`;
        const r = 40 + z * Math.min(W, H) * 0.9;
        g.beginPath(); g.arc(W / 2, H * 0.48, r, 0, Math.PI * 2); g.fill();
      }

      // Obstáculo próximo: aparece solo cuando ya está encima.
      const cerca = obstaculos.find((o) => !o.golpeado && o.y - avion.avance < 190 && o.y > avion.avance);
      if (cerca) {
        const z = clamp(1 - (cerca.y - avion.avance) / 190, 0, 1);
        const lado = Math.min(W, H) * (0.14 + z * 0.7);
        const cx = W / 2, cy = H * 0.48;
        g.save();
        g.globalAlpha = 0.25 + z * 0.7;
        g.strokeStyle = '#7a90a8';
        g.lineWidth = 2;
        for (let i = 0; i <= CARRILES; i++) {
          const x = cx - lado + (i / CARRILES) * lado * 2;
          g.beginPath(); g.moveTo(x, cy - lado); g.lineTo(x, cy + lado); g.stroke();
          const y = cy - lado + (i / CARRILES) * lado * 2;
          g.beginPath(); g.moveTo(cx - lado, y); g.lineTo(cx + lado, y); g.stroke();
        }
        // Hueco iluminado solo cuando ya casi no da tiempo.
        if (z > 0.68) {
          const hx = cx - lado + (cerca.huecoC + 0.5) / CARRILES * lado * 2;
          const hy = cy + lado - (cerca.huecoA + 0.5) / CARRILES * lado * 2;
          ctx.engine.glowCircle(hx, hy, lado / CARRILES * 0.6, '#3effc8', 22);
        }
        g.restore();
      }

      // Cabina
      g.save();
      if (aviso > 0) {
        g.fillStyle = `rgba(255,71,87,${aviso * 0.3})`;
        g.fillRect(0, 0, W, H);
      }
      g.restore();
      g.strokeStyle = '#2a3a4a';
      g.lineWidth = 12;
      g.strokeRect(6, 6, W - 12, H - 12);
      g.fillStyle = '#131c26';
      g.fillRect(0, H * 0.8, W, H * 0.2);

      // Instrumentos: la posición del avión, que el piloto sí ve.
      const l = Math.min(W, H) * 0.16;
      const ix = W * 0.5, iy = H * 0.88;
      g.strokeStyle = '#3a4a5a';
      g.lineWidth = 1;
      for (let i = 0; i <= CARRILES; i++) {
        const x = ix - l + (i / CARRILES) * l * 2;
        g.beginPath(); g.moveTo(x, iy - l * 0.5); g.lineTo(x, iy + l * 0.5); g.stroke();
      }
      const px = ix - l + (avion.carril + 0.5) / CARRILES * l * 2;
      const py = iy + l * 0.5 - (avion.altura + 0.5) / CARRILES * l;
      ctx.engine.glowCircle(px, py, 7, players[1 - controlador].color, 16);
      ctx.engine.text(`col ${avion.carril + 1} · alt ${avion.altura + 1}`, ix, iy - l * 0.65,
        { size: 13, color: '#9fc0d8', font: 'system-ui' });

      ctx.engine.text(`${Math.max(0, Math.round(LARGO - avion.avance))} m · ${Math.round(avion.vel)} kt · combustible ${Math.round(combustible)}`,
        W / 2, H * 0.08, { size: 14, color: combustible < 25 ? '#ff4757' : '#9fc0d8', font: 'system-ui' });
      if (mensaje && aviso > 0) ctx.engine.text(mensaje, W / 2, H * 0.14, { size: 15, color: '#ff4757', font: 'system-ui' });

      particles.render(g);
      if (!ctx.mando.haySala) {
        ctx.engine.text('Este juego necesita un mando táctil para el radar · Menú → Mandos',
          W / 2, H - 12, { size: 12, color: '#ffd166', font: 'system-ui' });
      } else {
        ctx.engine.text(`${players[controlador].name} canta los huecos · ${players[1 - controlador].name} pilota a ciegas`,
          W / 2, H - 12, { size: 11, color: '#4a5a6a', font: 'system-ui' });
      }
    },
  };
}
