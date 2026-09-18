/**
 * Dardos — 501 a la baja, tres dardos por turno.
 *
 * La diana es la de verdad: veinte sectores en el orden reglamentario, anillo
 * de dobles fuera, de triples a media distancia, y los dos círculos del centro.
 * La puntuación sale de convertir el punto de impacto a ángulo y radio, así que
 * rozar el triple 20 por un milímetro te deja en 20, como debe ser.
 *
 * La dificultad no está en apuntar, está en aguantar. La mira flota sola con un
 * vaivén que crece cuanto más tardas: puedes corregirla con las teclas, pero
 * cada segundo que pasa se mueve más. Tirar rápido es tirar mejor.
 */

import { crearMundo, crearPanel, mat, caja, cilindro, esfera, THREE } from '../../core/tres.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

/** Orden real de los sectores de una diana, empezando arriba y en sentido horario. */
const SECTORES = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

const RADIO = 1.7;                 // radio del alambre exterior
const rDobleFuera = 1.0, rDobleDentro = 0.94;
const rTripleFuera = 0.63, rTripleDentro = 0.57;
const rBull = 0.06, rBullVerde = 0.145;

const INICIO = 501;
const DARDOS = 3;

/** Textura de la diana dibujada por código: nada de imágenes en el repo. */
function texturaDiana() {
  const L = 1024, c = document.createElement('canvas');
  c.width = c.height = L;
  const g = c.getContext('2d');
  const R = L / 2;
  const esc = R / RADIO;

  g.fillStyle = '#0b0b0e';
  g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.fill();

  const anillo = (r1, r2, i, colorA, colorB) => {
    const a0 = (i * 18 - 9 - 90) * Math.PI / 180;
    const a1 = ((i + 1) * 18 - 9 - 90) * Math.PI / 180;
    g.beginPath();
    g.arc(R, R, r2 * esc, a0, a1);
    g.arc(R, R, r1 * esc, a1, a0, true);
    g.closePath();
    g.fillStyle = i % 2 === 0 ? colorA : colorB;
    g.fill();
  };

  for (let i = 0; i < 20; i++) {
    anillo(rDobleDentro, rDobleFuera, i, '#c9282f', '#1f7a3d');      // dobles
    anillo(rTripleFuera, rDobleDentro, i, '#0c0c10', '#e8dcc0');     // cuerpo exterior
    anillo(rTripleDentro, rTripleFuera, i, '#c9282f', '#1f7a3d');    // triples
    anillo(rBullVerde, rTripleDentro, i, '#0c0c10', '#e8dcc0');      // cuerpo interior
  }
  g.fillStyle = '#1f7a3d';
  g.beginPath(); g.arc(R, R, rBullVerde * esc, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c9282f';
  g.beginPath(); g.arc(R, R, rBull * esc, 0, Math.PI * 2); g.fill();

  // Alambres y números del aro exterior.
  g.strokeStyle = '#8d8d96';
  g.lineWidth = 2.5;
  for (let i = 0; i < 20; i++) {
    const a = (i * 18 - 9 - 90) * Math.PI / 180;
    g.beginPath();
    g.moveTo(R + Math.cos(a) * rBullVerde * esc, R + Math.sin(a) * rBullVerde * esc);
    g.lineTo(R + Math.cos(a) * rDobleFuera * esc, R + Math.sin(a) * rDobleFuera * esc);
    g.stroke();
  }
  for (const r of [rBull, rBullVerde, rTripleDentro, rTripleFuera, rDobleDentro, rDobleFuera]) {
    g.beginPath(); g.arc(R, R, r * esc, 0, Math.PI * 2); g.stroke();
  }
  g.fillStyle = '#efe9dc';
  g.font = `bold ${Math.round(esc * 0.24)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 20; i++) {
    const a = (i * 18 - 90) * Math.PI / 180;
    const r = (rDobleFuera + 0.22) * esc;
    g.fillText(String(SECTORES[i]), R + Math.cos(a) * r, R + Math.sin(a) * r);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Puntuación de un impacto en coordenadas de la diana (metros, centro en 0,0). */
function puntuar(x, y) {
  const r = Math.hypot(x, y);
  if (r <= rBull) return { valor: 50, texto: 'DIANA' };
  if (r <= rBullVerde) return { valor: 25, texto: '25' };
  if (r > rDobleFuera) return { valor: 0, texto: 'FUERA' };
  // El sector 20 está centrado arriba; los ángulos crecen en sentido horario.
  const ang = (Math.atan2(x, y) * 180) / Math.PI;
  const i = Math.floor((((ang + 9) % 360) + 360) % 360 / 18);
  const n = SECTORES[i];
  if (r >= rDobleDentro) return { valor: n * 2, texto: `D${n}`, doble: true };
  if (r >= rTripleDentro && r <= rTripleFuera) return { valor: n * 3, texto: `T${n}`, triple: true };
  return { valor: n, texto: String(n) };
}

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#0b0c12', horizonte: '#232a3a', sol: 1.4, solPos: [4, 8, 12],
    sombraArea: 8, fov: 34, niebla: 0.02,
  });
  const panel = crearPanel(ctx.root);

  const CENTRO_Y = 5.2;
  // Distancia parecida a la del tiro real: la diana ocupa su sitio y se ve la
  // pared del local alrededor, que es lo que da la escala.
  mundo.camara.position.set(0, CENTRO_Y + 0.1, 10.5);
  mundo.camara.lookAt(0, CENTRO_Y, 0);

  /* Pared del bar, tablero de corcho y diana. */
  mundo.escena.add(caja(26, 16, 0.6, mat('#241c1a', { rug: 0.95 }), [0, 7, -0.6]));
  mundo.escena.add(caja(60, 0.4, 26, mat('#1a1512', { rug: 1 }), [0, -0.2, -6]));
  const corcho = cilindro(2.5, 2.5, 0.25, mat('#5a4326', { rug: 1 }), [0, CENTRO_Y, -0.15], 40);
  corcho.rotation.x = Math.PI / 2;
  mundo.escena.add(corcho);

  const diana = new THREE.Mesh(
    new THREE.CircleGeometry(RADIO, 64),
    new THREE.MeshStandardMaterial({ map: texturaDiana(), roughness: 0.85 }),
  );
  diana.position.set(0, CENTRO_Y, 0.02);
  diana.receiveShadow = true;
  mundo.escena.add(diana);

  const aroLuz = new THREE.PointLight(0xffe9c0, 22, 12, 2);
  aroLuz.position.set(0, CENTRO_Y + 1.4, 2.2);
  mundo.escena.add(aroLuz);

  /* Mira: un aro fino delante de la diana. */
  const mira = new THREE.Group();
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.016, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const punto = esfera(0.022, new THREE.MeshBasicMaterial({ color: 0xff4757 }), null, 8);
  mira.add(aro, punto);
  mira.position.set(0, CENTRO_Y, 0.5);
  mundo.escena.add(mira);

  /* Dardos clavados: se quedan en la diana hasta el fin del turno. */
  const clavados = [];
  function crearDardo() {
    const g = new THREE.Group();
    const punta = cilindro(0.008, 0.02, 0.22, mat('#c0c4cc', { rug: 0.3, met: 0.8 }), [0, 0, 0.11], 8);
    punta.rotation.x = Math.PI / 2;
    const barril = cilindro(0.038, 0.032, 0.34, mat('#2b2f3a', { rug: 0.35, met: 0.6 }), [0, 0, 0.39], 10);
    barril.rotation.x = Math.PI / 2;
    const canya = cilindro(0.018, 0.018, 0.2, mat('#d9dde6', { rug: 0.5 }), [0, 0, 0.66], 8);
    canya.rotation.x = Math.PI / 2;
    const aleta = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), mat('#ff5aa8', { rug: 0.8, lados: 'doble' }));
    aleta.position.z = 0.82;
    const aleta2 = aleta.clone();
    aleta2.rotation.z = Math.PI / 2;
    g.add(punta, barril, canya, aleta, aleta2);
    return g;
  }

  /* ---------------- Estado ---------------- */

  let turno = 0;
  const restante = [INICIO, INICIO];
  let dardosTurno = DARDOS;
  let tirados = [];
  let fase = 'apuntar';            // apuntar | volando | pausa
  let t = 0;                       // tiempo apuntando (alimenta el vaivén)
  let mx = 0, my = 0;              // corrección del jugador
  let vuelo = null;
  let espera = 0;
  let aviso = '';
  let avisoT = 0;
  let marcador = null;
  let acabado = false;

  const decir = (txt, s = 2) => { aviso = txt; avisoT = s; };

  /** Vaivén de la mano: dos senos desfasados cuya amplitud crece con el tiempo. */
  function vaiven() {
    const amp = Math.min(0.42, 0.07 + t * 0.055);
    return {
      x: Math.sin(t * 1.7) * amp + Math.sin(t * 0.83 + 1.1) * amp * 0.6,
      y: Math.cos(t * 1.31 + 0.4) * amp * 0.8 + Math.sin(t * 2.2) * amp * 0.35,
    };
  }

  function lanzar() {
    const v = vaiven();
    const destino = new THREE.Vector3(mx + v.x, CENTRO_Y + my + v.y, 0.06);
    const dardo = crearDardo();
    dardo.position.set(destino.x * 0.2, CENTRO_Y - 1.6, 6.4);
    mundo.escena.add(dardo);
    vuelo = { malla: dardo, desde: dardo.position.clone(), hasta: destino, t: 0 };
    fase = 'volando';
    audio.swoosh();
    haptics.tap(turno);
  }

  function impacto() {
    const d = vuelo.hasta;
    const p = puntuar(d.x, d.y - CENTRO_Y);
    vuelo.malla.position.copy(d);
    vuelo.malla.rotation.set(-0.22 + Math.random() * 0.1, (Math.random() - 0.5) * 0.2, Math.random() * Math.PI);
    clavados.push(vuelo.malla);
    tirados.push(p);
    vuelo = null;

    audio.tone({ freq: p.valor === 0 ? 160 : 700 + p.valor * 4, dur: 0.07, gain: 0.16, type: 'square', sweep: -200 });
    audio.noise({ dur: 0.06, gain: 0.1, filter: 4000 });

    const nuevo = restante[turno] - p.valor;
    if (nuevo === 0) {
      restante[turno] = 0;
      acabado = true;
      audio.win();
      haptics.victory(turno);
      decir(`¡${players[turno].name} cierra con ${p.texto}!`, 3);
      setTimeout(() => ctx.finish({
        winner: turno,
        detail: `Cerró en ${p.texto} · al rival le quedaban ${restante[1 - turno]}`,
        scores: [INICIO - restante[0], INICIO - restante[1]],
      }), 1200);
      return;
    }
    if (nuevo < 0) {
      // Pasarse anula el turno entero: se devuelve lo tirado.
      decir(`${p.texto} — te pasas, turno anulado`, 2.4);
      audio.error();
      haptics.error(turno);
      // Este dardo aún no se había restado: solo se devuelven los anteriores.
      for (const q of tirados.slice(0, -1)) restante[turno] += q.valor;
      dardosTurno = 0;
    } else {
      restante[turno] = nuevo;
      decir(p.valor === 0 ? 'Fuera de la diana' : `${p.texto} · quedan ${nuevo}`, 1.6);
      if (p.triple || p.valor === 50) haptics.score(turno);
      dardosTurno--;
    }
    marcador?.update(restante[0], restante[1]);
    fase = 'pausa';
    espera = dardosTurno > 0 ? 0.55 : 1.3;
  }

  function siguiente() {
    if (dardosTurno > 0) { fase = 'apuntar'; t = 0; return; }
    for (const d of clavados) mundo.escena.remove(d);
    clavados.length = 0;
    tirados = [];
    dardosTurno = DARDOS;
    turno = 1 - turno;
    t = 0;
    mx = my = 0;
    fase = 'apuntar';
  }

  function pintarPanel() {
    const j = players[turno];
    if (acabado) { panel.centro('¡Cerrado!'); panel.sub(aviso); panel.barra(null); return; }
    panel.centro(`<span style="color:${j.color}">${j.name}</span> · le quedan <b>${restante[turno]}</b>`);
    panel.sub(avisoT > 0 ? aviso : `Dardos: ${'●'.repeat(dardosTurno)}${'○'.repeat(DARDOS - dardosTurno)} · cuanto más tardes, más te baila el pulso`);
    panel.pie(`${players[0].name} ${restante[0]} — ${restante[1]} ${players[1].name} · flechas: corregir · acción: tirar`);
    // La barra marca lo nervioso que está el pulso ahora mismo.
    panel.barra(fase === 'apuntar' ? Math.min(1, t / 7) : null, t > 4 ? '#ff4757' : '#a8ff3e');
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: '501' });
      marcador.update(INICIO, INICIO);
    },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      const p = input.player(turno);

      if (fase === 'apuntar') {
        t += dt;
        const v = 1.5;
        if (p.held('left')) mx -= v * dt;
        if (p.held('right')) mx += v * dt;
        if (p.held('up')) my += v * dt;
        if (p.held('down')) my -= v * dt;
        mx = Math.max(-2.1, Math.min(2.1, mx));
        my = Math.max(-2.1, Math.min(2.1, my));
        const s = vaiven();
        mira.position.set(mx + s.x, CENTRO_Y + my + s.y, 0.5);
        if (p.pressed('a')) lanzar();
      } else if (fase === 'volando') {
        vuelo.t += dt / 0.34;
        const k = Math.min(1, vuelo.t);
        const pos = vuelo.desde.clone().lerp(vuelo.hasta, k);
        // Parábola: el dardo sube y cae dentro de su corto vuelo.
        pos.y += Math.sin(k * Math.PI) * 0.55;
        vuelo.malla.position.copy(pos);
        vuelo.malla.lookAt(vuelo.hasta.x, vuelo.hasta.y - 0.3, vuelo.hasta.z - 1);
        if (k >= 1) impacto();
      } else if (fase === 'pausa') {
        espera -= dt;
        if (espera <= 0 && !acabado) siguiente();
      }

      mira.visible = fase === 'apuntar';
      // La cámara se desplaza un poco con la mira: da sensación de cabeza.
      mundo.camara.position.x += (mx * 0.12 - mundo.camara.position.x) * Math.min(1, dt * 4);
      mundo.camara.lookAt(0, CENTRO_Y, 0);
      pintarPanel();
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
