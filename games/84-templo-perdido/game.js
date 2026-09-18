/**
 * Templo Perdido — salas de acertijos para resolver entre los dos.
 *
 * Cada sala es un puzle distinto y todas comparten una regla: ninguno puede
 * resolverla solo. O la información está repartida (uno ve lo que el otro
 * necesita), o hace falta accionar dos cosas a la vez. La presión no es de
 * reflejos sino de cabeza, con un reloj generoso.
 *
 * Las salas son datos (`SALAS`), no código suelto: cada una declara cómo se
 * dibuja y cómo se comprueba, así que añadir una nueva no toca el motor.
 */

import { escapeHtml } from '../../core/ui.js';
import { icon } from '../../core/icons.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const TIEMPO = 300;

const SIMBOLOS = ['star', 'moon', 'sun', 'droplet', 'flame', 'gem'];
const NOMBRE_SIM = { star: 'estrella', moon: 'luna', sun: 'sol', droplet: 'gota', flame: 'llama', gem: 'gema' };

export function create(ctx) {
  const { input, audio, haptics, players, root, rng } = ctx;

  let sala = 0;
  let tiempo = TIEMPO;
  let fase = 'jugando';        // jugando | resuelta | fin
  let pausa = 0;
  let pistas = 0;
  let mensaje = '';
  let desuscribir = null;
  let est = null;              // estado interno de la sala actual

  /* ---------------- Definición de salas ---------------- */

  const SALAS = [
    {
      titulo: 'La Puerta de Símbolos',
      reto: 'Uno ve el orden, el otro ve las losas. Hay que pisarlas en el orden correcto.',
      init() {
        const orden = [...SIMBOLOS].sort(() => rng() - 0.5).slice(0, 4);
        const losas = [...orden].sort(() => rng() - 0.5);
        return { orden, losas, paso: 0, cursor: 0, fallo: 0 };
      },
      // P1 ve el pergamino con el orden; P2 ve las losas y las pisa.
      render(e) {
        return `
          <div class="tp-dos">
            <div class="tp-panel" style="--c:${players[0].color}">
              <h3>${escapeHtml(players[0].name)} · el pergamino</h3>
              <p class="tp-nota">Solo tú ves el orden. Dícelo en voz alta.</p>
              <div class="tp-fila">
                ${e.orden.map((s, i) => `
                  <div class="tp-sim ${i < e.paso ? 'hecho' : ''}">
                    <span class="tp-n">${i + 1}</span>${icon(s, { size: 26 })}
                  </div>`).join('')}
              </div>
            </div>
            <div class="tp-panel" style="--c:${players[1].color}">
              <h3>${escapeHtml(players[1].name)} · las losas</h3>
              <p class="tp-nota">No sabes el orden. Pisa la que te diga.</p>
              <div class="tp-fila">
                ${e.losas.map((s, i) => `
                  <div class="tp-losa ${i === e.cursor ? 'sel' : ''}">${icon(s, { size: 26 })}</div>`).join('')}
              </div>
              <p class="tp-nota">Paso ${e.paso + 1} de ${e.orden.length}</p>
            </div>
          </div>`;
      },
      tecla(e, code, j) {
        if (j !== 1) return false;
        const map = input.player(1).map;
        if (code === map.left) { e.cursor = (e.cursor - 1 + e.losas.length) % e.losas.length; audio.tick(); return true; }
        if (code === map.right) { e.cursor = (e.cursor + 1) % e.losas.length; audio.tick(); return true; }
        if (code === map.a) {
          if (e.losas[e.cursor] === e.orden[e.paso]) {
            e.paso++;
            audio.blip();
            if (e.paso >= e.orden.length) return 'resuelta';
            decir(`Bien · falta${e.orden.length - e.paso > 1 ? 'n' : ''} ${e.orden.length - e.paso}`);
          } else {
            e.paso = 0; e.fallo++;
            tiempo -= 8;
            audio.error(); haptics.error(1);
            decir('Mal. Vuelta a empezar (−8s)');
          }
          return true;
        }
        return false;
      },
    },

    {
      titulo: 'La Balanza de Piedra',
      reto: 'Dos pesos deben sumar exactamente lo grabado. Cada uno controla el suyo.',
      init() {
        const objetivo = 30 + Math.floor(rng() * 40);
        return { objetivo, val: [1, 1], max: objetivo - 1 };
      },
      render(e) {
        const suma = e.val[0] + e.val[1];
        const dif = suma - e.objetivo;
        const incl = Math.max(-14, Math.min(14, dif * 0.6));
        return `
          <div class="tp-balanza">
            <div class="tp-objetivo">Grabado en la piedra: <b>${e.objetivo}</b></div>
            <svg viewBox="0 0 200 90" class="tp-svg-bal">
              <line x1="100" y1="20" x2="100" y2="78" stroke="#6b5a3a" stroke-width="4"/>
              <g transform="rotate(${incl} 100 20)">
                <line x1="30" y1="20" x2="170" y2="20" stroke="#8a7a4a" stroke-width="5"/>
                <circle cx="30" cy="20" r="6" fill="${players[0].color}"/>
                <circle cx="170" cy="20" r="6" fill="${players[1].color}"/>
              </g>
              <rect x="70" y="78" width="60" height="8" fill="#6b5a3a"/>
            </svg>
            <div class="tp-dos">
              ${[0, 1].map((j) => `
                <div class="tp-panel" style="--c:${players[j].color}">
                  <h3>${escapeHtml(players[j].name)}</h3>
                  <div class="tp-num">${e.val[j]}</div>
                  <p class="tp-nota">↑/↓ ajustar · acción para fijar</p>
                </div>`).join('')}
            </div>
            <p class="tp-nota tp-centro">
              Suma actual: <b>${suma}</b> ·
              ${dif === 0 ? '¡equilibrada!' : dif > 0 ? `sobra ${dif}` : `falta ${-dif}`}
            </p>
          </div>`;
      },
      tecla(e, code, j) {
        const map = input.player(j).map;
        if (code === map.up) { e.val[j] = Math.min(e.max, e.val[j] + 1); audio.tick(); return true; }
        if (code === map.down) { e.val[j] = Math.max(1, e.val[j] - 1); audio.tick(); return true; }
        if (code === map.right) { e.val[j] = Math.min(e.max, e.val[j] + 5); audio.tick(); return true; }
        if (code === map.left) { e.val[j] = Math.max(1, e.val[j] - 5); audio.tick(); return true; }
        if (code === map.a) {
          if (e.val[0] + e.val[1] === e.objetivo) return 'resuelta';
          tiempo -= 5;
          audio.error(); haptics.error(j);
          decir('La balanza no cede (−5s)');
          return true;
        }
        return false;
      },
    },

    {
      titulo: 'Las Antorchas Gemelas',
      reto: 'Cuatro antorchas, dos interruptores. Solo se abren si las cuatro arden a la vez.',
      init() {
        // Cada jugador alterna un patrón distinto de antorchas: hay que
        // encontrar el momento en que los dos patrones coinciden encendidos.
        return {
          luz: [false, false, false, false],
          // Máscaras: qué antorchas alterna cada jugador
          mask: [[0, 1], [1, 2], [2, 3], [3, 0]],
          sel: [0, 2],
        };
      },
      render(e) {
        return `
          <div class="tp-antorchas">
            <div class="tp-fila tp-centro">
              ${e.luz.map((on, i) => `
                <div class="tp-antorcha ${on ? 'on' : ''}">
                  ${icon('flame', { size: 30 })}
                  <span class="tp-n">${i + 1}</span>
                </div>`).join('')}
            </div>
            <div class="tp-dos">
              ${[0, 1].map((j) => `
                <div class="tp-panel" style="--c:${players[j].color}">
                  <h3>${escapeHtml(players[j].name)}</h3>
                  <p class="tp-nota">Tu palanca alterna las antorchas
                    <b>${e.mask[e.sel[j]].map((n) => n + 1).join(' y ')}</b></p>
                  <p class="tp-nota">←/→ cambiar palanca · acción para tirar</p>
                </div>`).join('')}
            </div>
            <p class="tp-nota tp-centro">Encendidas: ${e.luz.filter(Boolean).length} de 4</p>
          </div>`;
      },
      tecla(e, code, j) {
        const map = input.player(j).map;
        if (code === map.left) { e.sel[j] = (e.sel[j] - 1 + e.mask.length) % e.mask.length; audio.tick(); return true; }
        if (code === map.right) { e.sel[j] = (e.sel[j] + 1) % e.mask.length; audio.tick(); return true; }
        if (code === map.a) {
          for (const i of e.mask[e.sel[j]]) e.luz[i] = !e.luz[i];
          audio.tone({ freq: 340, dur: 0.08, gain: 0.12, type: 'triangle' });
          haptics.play('tap', { player: j });
          if (e.luz.every(Boolean)) return 'resuelta';
          return true;
        }
        return false;
      },
    },

    {
      titulo: 'El Sello Final',
      reto: 'Cada uno ve la mitad del código. Compónganlo hablando y márquenlo a la vez.',
      init() {
        const codigo = Array.from({ length: 6 }, () => Math.floor(rng() * 6));
        return { codigo, entrada: [0, 0, 0, 0, 0, 0], cursor: [0, 0], listo: [false, false] };
      },
      render(e) {
        // P1 ve las posiciones pares, P2 las impares.
        return `
          <div class="tp-sello">
            <div class="tp-dos">
              ${[0, 1].map((j) => `
                <div class="tp-panel" style="--c:${players[j].color}">
                  <h3>${escapeHtml(players[j].name)} · tu mitad</h3>
                  <div class="tp-fila">
                    ${e.codigo.map((s, i) => `
                      <div class="tp-sim ${i % 2 === j ? '' : 'oculto'}">
                        <span class="tp-n">${i + 1}</span>
                        ${i % 2 === j ? icon(SIMBOLOS[s], { size: 22 }) : '<span class="tp-int">?</span>'}
                      </div>`).join('')}
                  </div>
                </div>`).join('')}
            </div>
            <div class="tp-entrada">
              <p class="tp-nota tp-centro">El sello (los dos lo ven)</p>
              <div class="tp-fila tp-centro">
                ${e.entrada.map((s, i) => `
                  <div class="tp-losa ${e.cursor[0] === i ? 'sel-p1' : ''} ${e.cursor[1] === i ? 'sel-p2' : ''}">
                    ${icon(SIMBOLOS[s], { size: 24 })}
                  </div>`).join('')}
              </div>
              <p class="tp-nota tp-centro">
                ←/→ mover · ↑/↓ cambiar símbolo · acción cuando creas que está
                ${e.listo[0] ? `· <b style="color:${players[0].color}">${escapeHtml(players[0].name)} listo</b>` : ''}
                ${e.listo[1] ? `· <b style="color:${players[1].color}">${escapeHtml(players[1].name)} listo</b>` : ''}
              </p>
            </div>
          </div>`;
      },
      tecla(e, code, j) {
        const map = input.player(j).map;
        if (code === map.left) { e.cursor[j] = (e.cursor[j] - 1 + 6) % 6; e.listo[j] = false; audio.tick(); return true; }
        if (code === map.right) { e.cursor[j] = (e.cursor[j] + 1) % 6; e.listo[j] = false; audio.tick(); return true; }
        if (code === map.up || code === map.down) {
          const i = e.cursor[j];
          const d = code === map.up ? 1 : -1;
          e.entrada[i] = (e.entrada[i] + d + SIMBOLOS.length) % SIMBOLOS.length;
          e.listo[0] = e.listo[1] = false;
          audio.tick();
          return true;
        }
        if (code === map.a) {
          e.listo[j] = true;
          audio.blip();
          if (e.listo[0] && e.listo[1]) {
            if (e.entrada.every((v, i) => v === e.codigo[i])) return 'resuelta';
            e.listo = [false, false];
            tiempo -= 10;
            audio.error(); haptics.error(j);
            decir('El sello rechaza el código (−10s)');
          } else {
            decir(`Falta ${escapeHtml(players[1 - j].name)}`);
          }
          return true;
        }
        return false;
      },
    },
  ];

  function decir(t) { mensaje = t; }

  function cargarSala() {
    est = SALAS[sala].init();
    mensaje = '';
    fase = 'jugando';
    pintar();
  }

  function resolver() {
    fase = 'resuelta';
    pausa = 1.8;
    audio.win();
    haptics.play('victory');
    decir('¡Sala superada!');
    pintar();
  }

  function terminar(exito) {
    fase = 'fin';
    const usado = TIEMPO - tiempo;
    ctx.finish({
      winner: -1,
      scores: [sala, SALAS.length],
      detail: exito
        ? `Templo completo · ${SALAS.length} salas en ${Math.round(usado)}s`
        : `Se quedaron en la sala ${sala + 1} de ${SALAS.length}`,
      record: exito && ctx.record('tiempo', Math.round(usado), 'low'),
    });
  }

  function pintar() {
    if (fase === 'fin') return;
    const s = SALAS[sala];
    const min = Math.floor(Math.max(0, tiempo) / 60);
    const seg = Math.floor(Math.max(0, tiempo) % 60);
    root.innerHTML = `
      <div class="tp-wrap">
        <div class="tp-top">
          <span>Sala ${sala + 1} / ${SALAS.length}</span>
          <span class="tp-titulo">${escapeHtml(s.titulo)}</span>
          <span class="tp-reloj ${tiempo < 45 ? 'urgente' : ''}">${min}:${String(seg).padStart(2, '0')}</span>
        </div>
        <p class="tp-reto">${escapeHtml(s.reto)}</p>
        ${fase === 'resuelta'
          ? `<div class="tp-exito">${icon('check', { size: 46 })}<p>Sala superada</p></div>`
          : s.render(est)}
        <p class="tp-msg">${mensaje}</p>
      </div>`;
  }

  function tecla(ev) {
    if (fase !== 'jugando') return;
    for (let j = 0; j < 2; j++) {
      const r = SALAS[sala].tecla(est, ev.code, j);
      if (r === 'resuelta') { resolver(); return; }
      if (r) { pintar(); return; }
    }
  }

  return {
    init() {
      inyectarEstilos();
      desuscribir = input.onAny(tecla);
      cargarSala();
    },

    update(dt) {
      if (fase === 'fin') return;

      if (fase === 'resuelta') {
        pausa -= dt;
        if (pausa <= 0) {
          sala++;
          if (sala >= SALAS.length) return terminar(true);
          cargarSala();
        }
        return;
      }

      tiempo -= dt;
      if (tiempo <= 0) return terminar(false);

      const el = root.querySelector('.tp-reloj');
      if (el) {
        const min = Math.floor(Math.max(0, tiempo) / 60);
        const seg = Math.floor(Math.max(0, tiempo) % 60);
        el.textContent = `${min}:${String(seg).padStart(2, '0')}`;
        el.classList.toggle('urgente', tiempo < 45);
      }
    },

    destroy() { desuscribir?.(); root.innerHTML = ''; },
  };
}

function inyectarEstilos() {
  if (document.getElementById('tpl-css')) return;
  const s = document.createElement('style');
  s.id = 'tpl-css';
  s.textContent = `
    .tp-wrap { display:flex; flex-direction:column; gap:12px; width:min(900px,95vw); }
    .tp-top { display:flex; align-items:center; justify-content:space-between; font-size:12px; color:var(--ink-dim); }
    .tp-titulo { font-family:var(--font-display); font-size:13px; color:var(--gold); }
    .tp-reloj { font-family:var(--font-mono); font-size:15px; color:var(--ink); }
    .tp-reloj.urgente { color:var(--danger); animation:pulse-glow .8s infinite; }
    .tp-reto { font-size:13px; color:var(--ink-dim); text-align:center; margin:0; line-height:1.5; }

    .tp-dos { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    @media (max-width:680px){ .tp-dos{ grid-template-columns:1fr; } }
    .tp-panel {
      padding:12px; border-radius:var(--radius);
      background:#ffffff06; border:1px solid color-mix(in srgb, var(--c) 34%, var(--line) 66%);
      text-align:center;
    }
    .tp-panel h3 { font-size:12.5px; color:var(--c); margin:0 0 6px; font-weight:650; }
    .tp-nota { font-size:11px; color:var(--ink-faint); margin:4px 0 0; line-height:1.4; }
    .tp-centro { text-align:center; }

    .tp-fila { display:flex; gap:7px; justify-content:center; flex-wrap:wrap; margin-top:6px; }
    .tp-sim, .tp-losa {
      position:relative; width:52px; height:52px;
      display:grid; place-items:center; border-radius:8px;
      background:#ffffff08; border:1px solid var(--line); color:var(--ink-dim);
      transition: all 150ms var(--ease);
    }
    .tp-sim.hecho { border-color:#a8ff3e; color:#a8ff3e; }
    .tp-sim.oculto { opacity:.4; }
    .tp-int { font-size:20px; color:var(--ink-faint); }
    .tp-losa.sel { border-color:var(--gold); color:var(--gold); box-shadow:0 0 16px -5px var(--gold); transform:translateY(-3px); }
    .tp-losa.sel-p1 { border-color:var(--p1); box-shadow:0 0 14px -5px var(--p1); }
    .tp-losa.sel-p2 { border-color:var(--p2); box-shadow:0 0 14px -5px var(--p2); }
    .tp-losa.sel-p1.sel-p2 { border-color:var(--gold); }
    .tp-n { position:absolute; top:2px; left:5px; font-size:9px; color:var(--ink-faint); }

    .tp-balanza, .tp-antorchas, .tp-sello { display:flex; flex-direction:column; gap:10px; }
    .tp-objetivo { text-align:center; font-size:14px; color:var(--ink-dim); }
    .tp-objetivo b { color:var(--gold); font-size:20px; font-family:var(--font-display); }
    .tp-svg-bal { width:100%; max-height:110px; }
    .tp-num { font-family:var(--font-display); font-size:26px; color:var(--c); }

    .tp-antorcha {
      position:relative; width:64px; height:64px;
      display:grid; place-items:center; border-radius:10px;
      background:#ffffff06; border:1px solid var(--line); color:#4a4a55;
      transition: all 200ms var(--ease);
    }
    .tp-antorcha.on {
      color:#ffd166; border-color:#ffd166;
      background:#ffd16614; box-shadow:0 0 24px -6px #ffd166;
    }

    .tp-entrada { padding:10px; border-radius:var(--radius); background:#ffffff05; border:1px solid var(--line); }

    .tp-exito { text-align:center; color:#a8ff3e; padding:26px 0; }
    .tp-exito p { font-size:15px; margin:6px 0 0; }
    .tp-msg { font-size:12.5px; color:var(--gold); text-align:center; margin:0; min-height:18px; }
  `;
  document.head.appendChild(s);
}
