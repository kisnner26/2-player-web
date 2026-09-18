/**
 * Atlas a Contrarreloj — geografía a botonazo limpio.
 *
 * Sin mapas de internet: el "mapa" es un conjunto de siluetas dibujadas por
 * código (polígonos simplificados) y un dataset propio de países. Todo local,
 * como el resto del proyecto.
 *
 * Formato buzzer: sale una pregunta, los dos ven las mismas cuatro opciones y
 * el primero que pulsa su tecla se lleva el turno de responder. Si falla, el
 * otro tiene una ventana corta para robar. Eso premia saber Y arriesgarse.
 */

import { escapeHtml } from '../../core/ui.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const RONDAS = 12;
const T_RESPUESTA = 7;
const T_ROBO = 4;

/**
 * Dataset propio. `sil` son polígonos normalizados (0..1) que insinúan la
 * forma del territorio: no es cartografía exacta, es una pista visual.
 */
const PAISES = [
  { n: 'Chile',     cap: 'Santiago',      cont: 'América del Sur', sil: [[.44,0],[.56,.06],[.6,.3],[.54,.62],[.5,.86],[.44,1],[.38,.84],[.42,.58],[.38,.3]] },
  { n: 'Italia',    cap: 'Roma',          cont: 'Europa',          sil: [[.36,0],[.5,.08],[.56,.3],[.7,.52],[.82,.72],[.78,.84],[.62,.74],[.5,.54],[.36,.34],[.28,.14]] },
  { n: 'Japón',     cap: 'Tokio',         cont: 'Asia',            sil: [[.2,.08],[.34,.02],[.44,.2],[.58,.34],[.72,.5],[.8,.7],[.68,.78],[.56,.6],[.42,.44],[.28,.28]] },
  { n: 'Egipto',    cap: 'El Cairo',      cont: 'África',          sil: [[.14,.16],[.86,.16],[.86,.62],[.6,.62],[.6,.9],[.42,.9],[.42,.62],[.14,.62]] },
  { n: 'Brasil',    cap: 'Brasilia',      cont: 'América del Sur', sil: [[.3,.08],[.62,.04],[.84,.28],[.86,.56],[.66,.86],[.4,.92],[.2,.7],[.14,.4]] },
  { n: 'India',     cap: 'Nueva Delhi',   cont: 'Asia',            sil: [[.24,.1],[.7,.06],[.86,.26],[.72,.5],[.56,.86],[.46,.96],[.36,.7],[.2,.4]] },
  { n: 'Francia',   cap: 'París',         cont: 'Europa',          sil: [[.34,.1],[.64,.08],[.82,.3],[.76,.6],[.56,.84],[.32,.76],[.18,.5],[.2,.26]] },
  { n: 'México',    cap: 'Ciudad de México', cont: 'América del Norte', sil: [[.08,.14],[.42,.12],[.56,.34],[.78,.44],[.9,.66],[.78,.74],[.6,.6],[.42,.5],[.24,.44],[.1,.32]] },
  { n: 'Australia', cap: 'Camberra',      cont: 'Oceanía',         sil: [[.12,.28],[.4,.14],[.7,.18],[.9,.36],[.86,.62],[.62,.78],[.34,.74],[.14,.56]] },
  { n: 'Noruega',   cap: 'Oslo',          cont: 'Europa',          sil: [[.62,.02],[.76,.14],[.62,.4],[.5,.62],[.4,.84],[.3,.96],[.24,.8],[.36,.56],[.48,.3],[.52,.1]] },
  { n: 'Nicaragua', cap: 'Managua',       cont: 'América Central', sil: [[.2,.16],[.6,.1],[.82,.32],[.76,.6],[.58,.82],[.36,.78],[.2,.56],[.16,.34]] },
  { n: 'España',    cap: 'Madrid',        cont: 'Europa',          sil: [[.14,.24],[.5,.14],[.84,.22],[.9,.46],[.74,.72],[.44,.8],[.2,.66],[.1,.44]] },
  { n: 'Canadá',    cap: 'Ottawa',        cont: 'América del Norte', sil: [[.06,.2],[.36,.1],[.66,.14],[.94,.24],[.9,.52],[.66,.66],[.38,.62],[.14,.5]] },
  { n: 'Kenia',     cap: 'Nairobi',       cont: 'África',          sil: [[.2,.2],[.62,.12],[.84,.34],[.74,.62],[.5,.84],[.28,.7],[.16,.44]] },
  { n: 'Argentina', cap: 'Buenos Aires',  cont: 'América del Sur', sil: [[.42,.02],[.62,.1],[.6,.36],[.66,.6],[.54,.84],[.46,1],[.36,.8],[.34,.5],[.36,.24]] },
  { n: 'Grecia',    cap: 'Atenas',        cont: 'Europa',          sil: [[.24,.12],[.6,.08],[.8,.26],[.66,.46],[.72,.66],[.54,.78],[.4,.6],[.28,.44]] },
  { n: 'Portugal',  cap: 'Lisboa',        cont: 'Europa',          sil: [[.36,.06],[.6,.1],[.58,.4],[.62,.7],[.5,.94],[.36,.86],[.34,.54]] },
  { n: 'Perú',      cap: 'Lima',          cont: 'América del Sur', sil: [[.28,.08],[.66,.14],[.8,.4],[.66,.68],[.48,.9],[.3,.7],[.2,.4]] },
  { n: 'Marruecos', cap: 'Rabat',         cont: 'África',          sil: [[.14,.3],[.5,.14],[.84,.28],[.78,.56],[.5,.76],[.24,.62]] },
  { n: 'Colombia',  cap: 'Bogotá',        cont: 'América del Sur', sil: [[.3,.08],[.66,.12],[.82,.38],[.7,.68],[.5,.9],[.3,.68],[.2,.38]] },
];

const TIPOS = ['capital', 'continente', 'silueta'];

export function create(ctx) {
  const { input, audio, haptics, players, root, rng } = ctx;

  let ronda = 0;
  let pregunta = null;
  let fase = 'espera';           // espera | buzz | robo | revelado | fin
  let quien = -1;                // quién tiene el turno de responder
  let cursor = 0;
  let t = 0;
  const score = [0, 0];
  let elegida = -1;
  let desuscribir = null;
  let mensaje = '';

  function barajar(a) {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  }

  function nuevaPregunta() {
    ronda++;
    if (ronda > RONDAS) return terminar();

    const tipo = TIPOS[Math.floor(rng() * TIPOS.length)];
    const p = PAISES[Math.floor(rng() * PAISES.length)];
    let texto, correcta, opciones;

    if (tipo === 'capital') {
      texto = `¿Cuál es la capital de <b>${p.n}</b>?`;
      correcta = p.cap;
      opciones = barajar([p.cap, ...barajar(PAISES.filter((x) => x.cap !== p.cap)).slice(0, 3).map((x) => x.cap)]);
    } else if (tipo === 'continente') {
      texto = `¿Dónde está <b>${p.n}</b>?`;
      correcta = p.cont;
      const otros = [...new Set(PAISES.map((x) => x.cont))].filter((c) => c !== p.cont);
      opciones = barajar([p.cont, ...barajar(otros).slice(0, 3)]);
    } else {
      texto = '¿Qué territorio es este?';
      correcta = p.n;
      opciones = barajar([p.n, ...barajar(PAISES.filter((x) => x.n !== p.n)).slice(0, 3).map((x) => x.n)]);
    }

    pregunta = { tipo, pais: p, texto, correcta, opciones };
    fase = 'buzz'; quien = -1; cursor = 0; elegida = -1;
    t = T_RESPUESTA;
    mensaje = 'El primero que pulse responde';
    audio.select();
    pintar();
  }

  function pulsar(j) {
    if (fase !== 'buzz') return;
    if (quien !== -1) return;
    quien = j;
    fase = 'responde';
    t = T_RESPUESTA;
    mensaje = `${players[j].name} responde`;
    audio.tone({ freq: 620, dur: 0.09, gain: 0.14, type: 'square' });
    haptics.play('tap', { player: j });
    pintar();
  }

  function confirmar(j) {
    if (j !== quien) return;
    if (fase !== 'responde' && fase !== 'robo') return;
    elegida = cursor;
    const bien = pregunta.opciones[cursor] === pregunta.correcta;
    if (bien) {
      score[j] += fase === 'robo' ? 2 : 1;
      mensaje = `¡Correcto! ${fase === 'robo' ? '+2 (robo)' : '+1'}`;
      audio.win();
      haptics.play('victory', { player: j });
      fase = 'revelado'; t = 1.8;
    } else {
      audio.error();
      haptics.error(j);
      if (fase === 'responde') {
        // El otro puede robar
        quien = 1 - j;
        fase = 'robo';
        t = T_ROBO;
        cursor = 0; elegida = -1;
        mensaje = `Falló · ${players[quien].name} puede robar (vale doble)`;
      } else {
        mensaje = `Nadie acertó · era ${pregunta.correcta}`;
        fase = 'revelado'; t = 1.8;
      }
    }
    pintar();
  }

  function tiempoFuera() {
    if (fase === 'buzz') { mensaje = 'Nadie se atrevió'; fase = 'revelado'; t = 1.6; }
    else if (fase === 'responde') {
      quien = 1 - quien; fase = 'robo'; t = T_ROBO; cursor = 0;
      mensaje = `Se acabó el tiempo · ${players[quien].name} puede robar`;
    } else { mensaje = `Era ${pregunta.correcta}`; fase = 'revelado'; t = 1.6; }
    audio.back();
    pintar();
  }

  function terminar() {
    fase = 'fin';
    const [a, b] = score;
    ctx.finish({
      winner: a === b ? -1 : a > b ? 0 : 1,
      scores: [a, b],
      detail: `${RONDAS} preguntas de geografía`,
      record: ctx.record('aciertos', Math.max(a, b), 'high'),
    });
  }

  function silueta(p) {
    const pts = p.sil.map(([x, y]) => `${x * 100},${y * 100}`).join(' ');
    return `
      <svg class="at-sil" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <polygon points="${pts}" />
      </svg>`;
  }

  function pintar() {
    if (fase === 'fin') return;
    const p = pregunta;
    root.innerHTML = `
      <div class="at-wrap">
        <div class="at-top">
          <span>Pregunta ${ronda}/${RONDAS}</span>
          <span class="at-marcador">
            <b style="color:${players[0].color}">${score[0]}</b>
            —
            <b style="color:${players[1].color}">${score[1]}</b>
          </span>
          <span class="at-reloj ${t < 3 ? 'urgente' : ''}">${Math.max(0, t).toFixed(1)}s</span>
        </div>

        ${p.tipo === 'silueta' ? `<div class="at-mapa">${silueta(p.pais)}</div>` : ''}
        <h2 class="at-preg">${p.texto}</h2>

        <div class="at-ops">
          ${p.opciones.map((o, i) => {
            const cls = ['at-op'];
            if (quien >= 0 && i === cursor && fase !== 'revelado') cls.push('sel');
            if (fase === 'revelado' || elegida >= 0) {
              if (o === p.correcta) cls.push('ok');
              else if (i === elegida) cls.push('mal');
            }
            return `<div class="${cls.join(' ')}" style="--c:${quien >= 0 ? players[quien].color : 'var(--ink-dim)'}">
                      ${escapeHtml(o)}
                    </div>`;
          }).join('')}
        </div>

        <p class="at-msg">${escapeHtml(mensaje)}</p>
        <p class="at-hint">
          ${fase === 'buzz'
            ? `<b style="color:${players[0].color}">${escapeHtml(players[0].name)}</b> y
               <b style="color:${players[1].color}">${escapeHtml(players[1].name)}</b>: el primero que pulse su tecla de acción`
            : fase === 'revelado'
              ? 'Siguiente pregunta…'
              : `<span class="kbd">←</span><span class="kbd">→</span> elegir · tu tecla de acción para confirmar`}
        </p>
      </div>`;
  }

  function tecla(e) {
    for (let j = 0; j < 2; j++) {
      const map = input.player(j).map;
      if (fase === 'buzz' && e.code === map.a) { pulsar(j); return; }
      if ((fase === 'responde' || fase === 'robo') && j === quien) {
        if (e.code === map.left) { cursor = (cursor + 3) % 4; audio.tick(); pintar(); return; }
        if (e.code === map.right) { cursor = (cursor + 1) % 4; audio.tick(); pintar(); return; }
        if (e.code === map.a) { confirmar(j); return; }
      }
    }
  }

  return {
    init() {
      inyectarEstilos();
      desuscribir = input.onAny(tecla);
      nuevaPregunta();
    },

    update(dt) {
      if (fase === 'fin') return;
      t -= dt;
      if (t <= 0) {
        if (fase === 'revelado') nuevaPregunta();
        else tiempoFuera();
        return;
      }
      const el = root.querySelector('.at-reloj');
      if (el) {
        el.textContent = `${Math.max(0, t).toFixed(1)}s`;
        el.classList.toggle('urgente', t < 3);
      }
    },

    destroy() { desuscribir?.(); root.innerHTML = ''; },
  };
}

function inyectarEstilos() {
  if (document.getElementById('at-css')) return;
  const s = document.createElement('style');
  s.id = 'at-css';
  s.textContent = `
    .at-wrap { display:flex; flex-direction:column; align-items:center; gap:12px; width:min(680px,94vw); text-align:center; }
    .at-top { display:flex; align-items:center; justify-content:space-between; width:100%; font-size:12px; color:var(--ink-dim); }
    .at-marcador { font-family:var(--font-display); font-size:16px; }
    .at-reloj { font-family:var(--font-mono); font-size:14px; color:var(--ink); }
    .at-reloj.urgente { color:var(--danger); animation:pulse-glow .7s infinite; }

    .at-mapa { width:180px; height:180px; }
    .at-sil { width:100%; height:100%; }
    .at-sil polygon {
      fill:color-mix(in srgb, var(--p1) 30%, transparent);
      stroke:var(--p1); stroke-width:1.4; stroke-linejoin:round;
      filter: drop-shadow(0 0 10px var(--p1-glow));
    }

    .at-preg { font-size:18px; font-weight:600; margin:0; line-height:1.4; }
    .at-preg b { color:var(--gold); }

    .at-ops { display:grid; grid-template-columns:1fr 1fr; gap:9px; width:100%; }
    .at-op {
      padding:13px 12px; border-radius:var(--radius-sm);
      background:#ffffff07; border:1px solid var(--line);
      font-size:14px; color:var(--ink-dim);
      transition: all 150ms var(--ease);
    }
    .at-op.sel { border-color:var(--c); color:var(--ink); background:color-mix(in srgb, var(--c) 13%, transparent); transform:translateY(-2px); }
    .at-op.ok { border-color:#a8ff3e; color:#a8ff3e; background:#a8ff3e18; }
    .at-op.mal { border-color:var(--danger); color:var(--danger); background:#ff475718; }

    .at-msg { font-size:13px; color:var(--gold); margin:0; min-height:18px; }
    .at-hint { font-size:11.5px; color:var(--ink-faint); margin:0; }
  `;
  document.head.appendChild(s);
}
