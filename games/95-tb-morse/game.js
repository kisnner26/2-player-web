/**
 * Código Táctil — uno transmite en pulsos, el otro descifra.
 *
 * Información asimétrica sobre la barra: el emisor ve en PANTALLA la palabra
 * secreta y su patrón de pulsos (cortos y largos). El receptor solo ve la
 * barra encenderse y tiene que reconstruir el patrón tocando las celdas.
 *
 * No es morse real (sería injugable sin practicar): es un alfabeto propio de
 * 3 pulsos por símbolo, corto o largo, que se aprende en la primera ronda.
 * Se turnan el papel de emisor cada ronda.
 */

import { prepararPantalla, indicadorTurno } from '../../core/tbgame.js';
import { escapeHtml } from '../../core/ui.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const CELDAS = 12;
const RONDAS = 6;

/** Cada símbolo son 3 pulsos: 0 = corto, 1 = largo. */
const SIMBOLOS = [
  { s: 'A', p: [0, 0, 0] }, { s: 'B', p: [0, 0, 1] }, { s: 'C', p: [0, 1, 0] },
  { s: 'D', p: [0, 1, 1] }, { s: 'E', p: [1, 0, 0] }, { s: 'F', p: [1, 0, 1] },
  { s: 'G', p: [1, 1, 0] }, { s: 'H', p: [1, 1, 1] },
];

export function create(ctx) {
  const { touchbar, audio, haptics, players, rng } = ctx;

  let cab = null, espejo = null, disponible = false, pantalla = null;
  let elPanel = null;
  let emisor = 0;
  let ronda = 0;
  let objetivo = null;         // símbolo a transmitir
  let entrada = [];            // pulsos que va marcando el receptor
  let fase = 'transmite';      // transmite | descifra | revelado | fin
  let pausa = 0;
  const aciertos = [0, 0];
  let destello = -1, destelloT = 0;
  let desuscribir = null;

  const receptor = () => 1 - emisor;

  function nuevaRonda() {
    ronda++;
    if (ronda > RONDAS) return terminar();
    emisor = (ronda - 1) % 2;
    objetivo = SIMBOLOS[Math.floor(rng() * SIMBOLOS.length)];
    entrada = [];
    fase = 'transmite';
    pintar(); pintarPanel();
  }

  /**
   * La barra: mitad izquierda = pulso corto, derecha = pulso largo.
   * El emisor toca para transmitir; el receptor toca para anotar lo que cree.
   */
  function pintar() {
    const celdas = [];
    for (let i = 0; i < CELDAS; i++) {
      const largo = i >= CELDAS / 2;
      const activa = destelloT > 0 && (destello === 1) === largo;
      celdas.push({
        label: activa ? (largo ? '━' : '•') : '',
        bg: activa ? '#ffd166' : largo ? '#1a1a26' : '#141420',
        color: '#000000',
        clase: activa ? 'viva' : 'tenue',
      });
    }
    espejo?.pintar(celdas);
    if (!disponible) return;
    const quien = fase === 'transmite' ? emisor : receptor();
    touchbar.set([
      indicadorTurno(players, quien),
      ...celdas.map((c, i) => ({
        type: 'button', id: `p${i}`,
        label: i < CELDAS / 2 ? '·' : '—',
        bg: c.bg, color: '#c8c8d8',
      })),
    ]);
  }

  function pintarPanel() {
    const em = players[emisor], re = players[receptor()];
    if (fase === 'transmite') {
      elPanel.innerHTML = `
        <div class="mo-dos">
          <div class="mo-panel" style="--c:${em.color}">
            <h3>${escapeHtml(em.name)} · transmite</h3>
            <div class="mo-simbolo">${objetivo.s}</div>
            <div class="mo-pulsos">
              ${objetivo.p.map((v, i) => `
                <span class="mo-pulso ${i < entrada.length ? 'hecho' : ''}">${v ? '━' : '•'}</span>`).join('')}
            </div>
            <p class="mo-nota">Toca la <b>izquierda</b> para punto y la <b>derecha</b> para raya</p>
          </div>
          <div class="mo-panel oculto" style="--c:${re.color}">
            <h3>${escapeHtml(re.name)} · escucha</h3>
            <div class="mo-simbolo">?</div>
            <p class="mo-nota">Mira la barra, no la pantalla del otro</p>
          </div>
        </div>`;
    } else if (fase === 'descifra') {
      elPanel.innerHTML = `
        <div class="mo-dos">
          <div class="mo-panel oculto" style="--c:${em.color}">
            <h3>${escapeHtml(em.name)} · transmitido</h3>
            <div class="mo-simbolo">✓</div>
            <p class="mo-nota">Ya no puedes ayudar</p>
          </div>
          <div class="mo-panel" style="--c:${re.color}">
            <h3>${escapeHtml(re.name)} · descifra</h3>
            <div class="mo-pulsos">
              ${[0, 1, 2].map((i) => `
                <span class="mo-pulso ${i < entrada.length ? 'hecho' : ''}">
                  ${i < entrada.length ? (entrada[i] ? '━' : '•') : '_'}
                </span>`).join('')}
            </div>
            <p class="mo-nota">Repite el patrón: izquierda punto, derecha raya</p>
          </div>
        </div>`;
    } else {
      const bien = entrada.length === 3 && entrada.every((v, i) => v === objetivo.p[i]);
      elPanel.innerHTML = `
        <div class="mo-revelado ${bien ? 'ok' : 'mal'}">
          <div class="mo-simbolo">${objetivo.s}</div>
          <p>${bien ? '¡Descifrado!' : 'No era eso'}</p>
          <div class="mo-pulsos">
            ${objetivo.p.map((v) => `<span class="mo-pulso">${v ? '━' : '•'}</span>`).join('')}
          </div>
        </div>`;
    }
    cab.decir(
      fase === 'transmite'
        ? `Ronda ${ronda}/${RONDAS} · transmite <b style="color:${em.color}">${escapeHtml(em.name)}</b>`
        : fase === 'descifra'
          ? `Ronda ${ronda}/${RONDAS} · descifra <b style="color:${re.color}">${escapeHtml(re.name)}</b>`
          : `Aciertos: ${aciertos[0]} · ${aciertos[1]}`
    );
    cab.resaltar(fase === 'transmite' ? emisor : receptor());
  }

  function tocar(i) {
    if (fase === 'revelado' || fase === 'fin') return;
    const largo = i >= CELDAS / 2 ? 1 : 0;

    if (fase === 'transmite') {
      // El emisor manda el pulso que toca; la barra parpadea para el receptor.
      const esperado = objetivo.p[entrada.length];
      destello = largo; destelloT = largo ? 0.5 : 0.22;
      audio.tone({ freq: largo ? 260 : 520, dur: largo ? 0.3 : 0.1, gain: 0.15, type: 'square' });
      haptics.play('tap', { player: emisor });
      touchbar.haptic(largo ? 'heavy' : 'light');
      entrada.push(largo);
      // Se registra lo que REALMENTE mandó, aunque se equivoque.
      if (entrada.length >= 3) {
        objetivo = { ...objetivo, enviado: [...entrada] };
        entrada = [];
        fase = 'descifra';
      }
      pintar(); pintarPanel();
      return;
    }

    // Receptor anotando
    entrada.push(largo);
    destello = largo; destelloT = 0.18;
    audio.tone({ freq: largo ? 300 : 560, dur: 0.07, gain: 0.1, type: 'triangle' });
    haptics.play('tap', { player: receptor() });
    touchbar.haptic('light');

    if (entrada.length >= 3) {
      const patron = objetivo.enviado || objetivo.p;
      const bien = entrada.every((v, i) => v === patron[i]);
      if (bien) {
        aciertos[receptor()]++;
        audio.win(); haptics.play('victory', { player: receptor() });
        touchbar.haptic('heavy');
      } else {
        audio.error(); haptics.error(receptor());
      }
      cab.marcar(aciertos[0], aciertos[1]);
      fase = 'revelado';
      pausa = 2;
    }
    pintar(); pintarPanel();
  }

  function terminar() {
    fase = 'fin';
    const [a, b] = aciertos;
    ctx.finish({
      winner: a === b ? -1 : a > b ? 0 : 1,
      scores: [a, b],
      detail: `${RONDAS} mensajes · ${a + b} descifrados`,
      record: ctx.record('descifrados', a + b, 'high'),
    });
  }

  return {
    async init() {
      inyectarEstilos();
      const p = await prepararPantalla(ctx, { titulo: 'Código Táctil', segmentos: CELDAS });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible; pantalla = p.pantalla;
      cab.marcar(0, 0);

      elPanel = document.createElement('div');
      elPanel.className = 'mo-wrap';
      pantalla.appendChild(elPanel);

      if (!disponible) return;
      desuscribir = touchbar.on((ev) => {
        if (ev.type !== 'click') return;
        const i = parseInt(ev.id.slice(1), 10);
        if (!Number.isNaN(i)) tocar(i);
      });
      nuevaRonda();
    },

    update(dt) {
      if (!disponible) return;
      if (destelloT > 0) {
        destelloT -= dt;
        if (destelloT <= 0) pintar();
      }
      if (fase === 'revelado') {
        pausa -= dt;
        if (pausa <= 0) nuevaRonda();
      }
    },

    destroy() { desuscribir?.(); touchbar.clear(); touchbar.setFocus(false); ctx.root.innerHTML = ''; },
  };
}

function inyectarEstilos() {
  if (document.getElementById('mo-css')) return;
  const s = document.createElement('style');
  s.id = 'mo-css';
  s.textContent = `
    .mo-wrap { width:100%; }
    .mo-dos { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .mo-panel {
      padding:14px; border-radius:var(--radius); text-align:center;
      background:#ffffff06; border:1px solid color-mix(in srgb, var(--c) 34%, var(--line) 66%);
    }
    .mo-panel.oculto { opacity:.35; }
    .mo-panel h3 { font-size:12px; color:var(--c); margin:0 0 8px; font-weight:650; }
    .mo-simbolo { font-family:var(--font-display); font-size:34px; color:var(--ink); }
    .mo-pulsos { display:flex; gap:10px; justify-content:center; margin-top:8px; }
    .mo-pulso {
      display:inline-grid; place-items:center;
      min-width:30px; height:30px; border-radius:6px;
      background:#ffffff0d; border:1px solid var(--line);
      font-size:15px; color:var(--ink-dim);
    }
    .mo-pulso.hecho { border-color:#ffd166; color:#ffd166; }
    .mo-nota { font-size:11px; color:var(--ink-faint); margin:8px 0 0; line-height:1.4; }
    .mo-revelado { text-align:center; padding:14px; }
    .mo-revelado.ok { color:#a8ff3e; }
    .mo-revelado.mal { color:var(--danger); }
    .mo-revelado p { font-size:14px; margin:6px 0; }
  `;
  document.head.appendChild(s);
}
