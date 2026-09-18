/**
 * Bomba a Cuatro Manos — uno tiene los cables y el otro el manual.
 *
 * El reparto es lo que hace el juego: quien corta NO puede leer las reglas
 * cómodamente (son ocho páginas y solo se ve una), y quien lee no puede tocar
 * nada. Todo tiene que pasar por la voz, y es exactamente ahí donde la gente
 * se lía: "el tercero", "¿el tercero desde arriba o desde la izquierda?".
 *
 * Las reglas son de verdad condicionales encadenadas, del estilo del manual de
 * desactivación clásico. Ninguna se puede resolver mirando solo los cables.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const TIEMPO = 150;
const MODULOS = 4;
const NOMBRES = ['rojo', 'azul', 'verde', 'amarillo', 'blanco'];
const COLORES = ['#ff4757', '#3aa0ff', '#a8ff3e', '#ffd166', '#e8e8f0'];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let modulos = [], actual = 0, pagina = 0;
  let cursor = 0, reloj = TIEMPO, fallos = 0, terminado = false, t = 0;
  let mensaje = 'Módulo 1: el que lee, busca la regla', sb = null;

  /**
   * Cada módulo es un manojo de cables con una regla propia. La regla se
   * escribe con el número de serie y el color de los cables, nunca solo con
   * "corta el segundo": si no, no haría falta hablar.
   */
  function generarModulo(n) {
    const cuantos = 4 + Math.floor(rng() * 3);
    const cables = Array.from({ length: cuantos }, () => Math.floor(rng() * COLORES.length));
    const serie = `${1000 + Math.floor(rng() * 8999)}`;
    const parImpar = (+serie[serie.length - 1]) % 2 === 0;

    // Resolución de la regla, en el mismo orden que la escribe el manual.
    let correcto;
    const cuenta = (c) => cables.filter((v) => v === c).length;
    if (cuenta(0) > 1 && !parImpar) correcto = cables.lastIndexOf(0);
    else if (cuenta(3) === 0) correcto = 0;
    else if (cables[cables.length - 1] === 4) correcto = cables.length - 1;
    else if (cuenta(1) >= 2) correcto = cables.indexOf(1);
    else if (parImpar) correcto = cables.length - 1;
    else correcto = 1;

    return { n, cables, serie, parImpar, correcto, cortados: [] };
  }

  const PAGINAS = [
    ['REGLA 1', 'Si hay dos o más cables ROJOS', 'y la serie acaba en IMPAR:', 'corta el ÚLTIMO rojo.'],
    ['REGLA 2', 'Si no hay ningún cable AMARILLO:', 'corta el PRIMER cable.'],
    ['REGLA 3', 'Si el último cable es BLANCO:', 'corta ese último cable.'],
    ['REGLA 4', 'Si hay dos o más cables AZULES:', 'corta el PRIMER azul.'],
    ['REGLA 5', 'Si la serie acaba en PAR:', 'corta el ÚLTIMO cable.'],
    ['REGLA 6', 'En cualquier otro caso:', 'corta el SEGUNDO cable.'],
    ['ORDEN', 'Las reglas se leen de la 1 a la 6.', 'Se aplica la PRIMERA que encaje', 'y se ignoran las demás.'],
    ['AVISO', 'Cada corte equivocado', 'quita 20 segundos.', 'Tres errores y explota.'],
  ];

  function cortar() {
    if (terminado) return;
    const m = modulos[actual];
    if (m.cortados.includes(cursor)) return;
    m.cortados.push(cursor);

    if (cursor === m.correcto) {
      audio.pickup();
      haptics.score(0);
      particles.burst(cableX(), cableY(cursor), 14, { speed: 180, color: '#a8ff3e', size: 4, drag: 0.9 });
      actual++;
      if (actual >= MODULOS) {
        terminado = true;
        audio.win();
        haptics.victory(0);
        ctx.finish({
          winner: -1,
          scores: [MODULOS, Math.round(reloj)],
          detail: `¡Desactivada! con ${Math.round(reloj)} s de sobra y ${fallos} fallos`,
          record: ctx.record('sobra', Math.round(reloj), 'high'),
        });
        return;
      }
      cursor = 0;
      mensaje = `Módulo ${actual + 1} de ${MODULOS}`;
      sb.update(actual, fallos);
    } else {
      fallos++;
      reloj -= 20;
      mensaje = '¡Cable equivocado! −20 segundos';
      audio.error();
      haptics.error(1);
      ctx.shake(12);
      particles.burst(cableX(), cableY(cursor), 20, { speed: 220, color: '#ff4757', size: 4, drag: 0.9 });
      sb.update(actual, fallos);
      if (fallos >= 3) explotar('tres cortes equivocados');
    }
  }

  function explotar(motivo) {
    terminado = true;
    audio.explosion();
    haptics.explosion(null);
    ctx.shake(24);
    particles.burst(W / 2, H / 2, 60, { speed: 460, color: '#ff8c42', size: 6, drag: 0.9 });
    ctx.finish({
      winner: -1,
      scores: [actual, fallos],
      detail: `Explotó: ${motivo} · ${actual} de ${MODULOS} módulos`,
    });
  }

  const panelX = () => W * 0.26;
  const cableX = () => panelX();
  const cableY = (i) => {
    const m = modulos[actual];
    const n = m ? m.cables.length : 5;
    return H * 0.36 + (i - (n - 1) / 2) * Math.min(46, H * 0.09);
  };

  return {
    init() {
      W = ctx.W; H = ctx.H;
      modulos = Array.from({ length: MODULOS }, (_, i) => generarModulo(i));
      sb = ui.scoreboard({ center: 'desactivadla juntos' });
      // Los papeles son fijos y se anuncian: si no, los dos hacen lo mismo.
      ui.toast(`${players[0].name} corta · ${players[1].name} lee el manual`, { ms: 2600 });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);
      const antes = Math.ceil(reloj);
      reloj -= dt;
      if (Math.ceil(reloj) !== antes && reloj <= 10 && reloj > 0) audio.countdown(Math.ceil(reloj));
      if (reloj <= 0) { explotar('se acabó el tiempo'); return; }

      const m = modulos[actual];
      const p0 = input.player(0);
      if (p0.pressed('up')) { cursor = (cursor + m.cables.length - 1) % m.cables.length; audio.tick(); }
      if (p0.pressed('down')) { cursor = (cursor + 1) % m.cables.length; audio.tick(); }
      if (p0.pressed('a')) cortar();

      const p1 = input.player(1);
      if (p1.pressed('up') || p1.pressed('left')) { pagina = (pagina + PAGINAS.length - 1) % PAGINAS.length; audio.blip(); }
      if (p1.pressed('down') || p1.pressed('right') || p1.pressed('a')) { pagina = (pagina + 1) % PAGINAS.length; audio.blip(); }
    },

    render() {
      const g = ctx.c;
      const apuro = reloj < 20;
      ctx.engine.clear(apuro ? '#170810' : '#0a0a12');

      const m = modulos[actual];

      // Panel de cables
      g.fillStyle = '#171422';
      g.beginPath(); g.roundRect(panelX() - W * 0.19, H * 0.14, W * 0.38, H * 0.62, 14); g.fill();
      g.strokeStyle = `${players[0].color}66`;
      g.lineWidth = 2;
      g.stroke();
      ctx.engine.text(`MÓDULO ${actual + 1}/${MODULOS}`, panelX(), H * 0.2, {
        size: 14, color: players[0].color, font: 'system-ui',
      });
      ctx.engine.text(`serie ${m.serie}`, panelX(), H * 0.25, { size: 15, color: '#e8e8f0', font: 'system-ui' });

      m.cables.forEach((c, i) => {
        const y = cableY(i);
        const cortado = m.cortados.includes(i);
        const x0 = panelX() - W * 0.15, x1 = panelX() + W * 0.15;
        g.save();
        g.strokeStyle = COLORES[c];
        g.lineWidth = 9;
        g.lineCap = 'round';
        if (!cortado) { g.shadowColor = COLORES[c]; g.shadowBlur = 10; }
        g.beginPath();
        if (cortado) {
          g.moveTo(x0, y); g.lineTo(panelX() - 16, y + 8); g.stroke();
          g.beginPath(); g.moveTo(panelX() + 16, y - 8); g.lineTo(x1, y);
        } else {
          g.moveTo(x0, y); g.lineTo(x1, y);
        }
        g.stroke();
        g.restore();
        // Número visible: para poder decir "el tres" en voz alta.
        ctx.engine.text(String(i + 1), x0 - 18, y, { size: 13, color: '#7a7a98', font: 'system-ui' });
        ctx.engine.text(NOMBRES[c], x1 + 12, y, { size: 11, color: `${COLORES[c]}cc`, align: 'left', font: 'system-ui' });
        if (i === cursor && !cortado) {
          g.strokeStyle = '#ffffff';
          g.lineWidth = 2;
          g.setLineDash([4, 4]);
          g.strokeRect(x0 - 6, y - 12, x1 - x0 + 12, 24);
          g.setLineDash([]);
        }
      });

      // Manual
      const mx = W * 0.73;
      g.fillStyle = '#f4efe2';
      g.beginPath(); g.roundRect(mx - W * 0.19, H * 0.14, W * 0.38, H * 0.62, 10); g.fill();
      g.fillStyle = '#d8d0bc';
      g.fillRect(mx - W * 0.19, H * 0.14, W * 0.38, 34);
      ctx.engine.text(`MANUAL · página ${pagina + 1}/${PAGINAS.length}`, mx, H * 0.14 + 17,
        { size: 12, color: '#4a4232', font: 'system-ui' });
      PAGINAS[pagina].forEach((linea, i) => {
        ctx.engine.text(linea, mx, H * 0.26 + i * 30, {
          size: i === 0 ? 19 : 15, color: i === 0 ? '#a03020' : '#2a2418', font: 'system-ui',
        });
      });

      // Reloj
      g.save();
      if (apuro) g.globalAlpha = 0.6 + Math.sin(t * 14) * 0.4;
      ctx.engine.text(`${Math.floor(Math.max(0, reloj) / 60)}:${String(Math.floor(Math.max(0, reloj) % 60)).padStart(2, '0')}`,
        W / 2, H * 0.085, { size: 34, color: apuro ? '#ff4757' : '#f2f2ff', glow: apuro ? 20 : 0 });
      g.restore();
      ctx.engine.text(mensaje, W / 2, H * 0.83, { size: 14, color: '#c9c9e0', font: 'system-ui' });
      ctx.engine.text(`fallos: ${fallos}/3`, W / 2, H * 0.87, {
        size: 12, color: fallos ? '#ff4757' : '#6a6a88', font: 'system-ui',
      });

      particles.render(g);
      ctx.engine.text(`${players[0].name}: ↑↓ elige cable y corta · ${players[1].name}: pasa páginas del manual`,
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
