/**
 * Billar — bola 8 por turnos, con efecto de verdad.
 *
 * El juego está repartido en cinco módulos porque son cinco trabajos que no
 * se parecen en nada, y mezclados no había forma de tocar uno sin romper otro:
 *
 *   fisica.js   patinar/rodar, efecto, bandas con mordida, troneras con
 *               mandíbulas. No sabe qué es un turno.
 *   reglas.js   bola 8 con faltas y bola en mano. No sabe qué es un polígono.
 *   mesa3d.js   la mesa, la sala, el público y los jugadores. Y las MEDIDAS,
 *               que importan todos para no volver a desincronizarse.
 *   bolas.js    las texturas y los cinco juegos de diseño.
 *   temas.js    las dos salas: el club y la Circuito.
 *
 * Aquí solo queda pegarlo: entrada, cámara, HUD y el ciclo de la tirada.
 *
 * Controles, además de los de siempre: mantener ESPECIAL y mover con las
 * flechas coloca el punto de golpeo sobre la blanca. Ahí está medio juego —
 * golpear bajo trae la blanca de vuelta, golpear alto la hace correr detrás
 * de la bola, y el lateral abre o cierra el ángulo de salida de banda.
 */

import { crearMundo, crearPanel, esfera, THREE } from '../../core/tres.js';
import * as F from './fisica.js';
import * as M from './mesa3d.js';
import { DISENOS, BLANCAS, porId as disenoPorId, blancaPorId, materialBola, olvidarTexturas } from './bolas.js';
import { TEMAS, temaPorId } from './temas.js';
import { TACOS, porId as tacoPorId, construirTaco } from './tacos.js';
import { crearTaller } from './taller.js';
import { crearVoz } from './voz.js';
import { ambiente } from '../../core/ambiente.js';
import { crearPartida, nuevaTirada, ORDEN_TRIANGULO } from './reglas.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const FUERZA_MIN = 9;
const FUERZA_MAX = 62;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  let tema = temaPorId('clasico');
  let diseno = disenoPorId(tema.bolas);
  let blancaD = blancaPorId('puntos');     // la de entrenamiento: se le ve el efecto
  let disenoTaco = tacoPorId('arce');

  /* La música también se elige desde el taller. Las paletas viven en
     core/ambiente.js y se sintetizan enteras: no hay ni un archivo de audio
     en el proyecto, así que tampoco hay licencia que respetar. */
  const MUSICAS = [
    { id: 'lofi', nombre: 'Lofi', descripcion: 'Rhodes, caja suave y vinilo. La de fondo por defecto' },
    { id: 'jazz', nombre: 'Jazz de bar', descripcion: 'Contrabajo y escobillas, la de siempre' },
    { id: 'sintetico', nombre: 'Synthwave', descripcion: 'Para la sala Circuito' },
    { id: 'ascensor', nombre: 'Lounge', descripcion: 'Suave y de fondo' },
    { id: 'silencio', nombre: 'Silencio', descripcion: 'Solo el sonido de las bolas' },
  ];

  const voz = crearVoz(players);

  const mundo = crearMundo(ctx.root, tema.mundo);
  const panel = crearPanel(ctx.root);

  /* ---------------- Escenas por tema ----------------
     Cada sala se monta entera una vez y luego solo se enciende o se apaga.
     Reconstruirla al cambiar de tema obligaría a recrear luces, público y
     jugadores en mitad de la partida, y eso sí puede dejar algo a medias.
     Se captura qué hijos añade cada montaje en vez de fiarse de lo que
     devuelve cada ayuda de core/tres.js. */
  const escenas = {};

  function montar(t) {
    const antes = new Set(mundo.escena.children);
    M.construirSala(mundo, t);
    const mesa = M.construirMesa(mundo, t);
    const publico = M.construirPublico(mundo, t);
    const figuras = M.plantarJugadores(mundo, players, t, voz);
    const nuevos = mundo.escena.children.filter((c) => !antes.has(c));
    return { nuevos, mesa, publico, figuras };
  }

  /* La segunda sala se monta la primera vez que se pide, no al arrancar:
     son otra mesa, otro público y otros dos muñecos, y montarlas las dos de
     salida es pagar el doble por una que a lo mejor no se usa. */
  function aplicarTema(id) {
    tema = temaPorId(id);
    if (!escenas[id]) escenas[id] = montar(tema);
    for (const [clave, e] of Object.entries(escenas)) {
      const on = clave === id;
      for (const n of e.nuevos) n.visible = on;
    }
    mundo.escena.background = new THREE.Color(tema.mundo.cielo);
    mundo.escena.fog = tema.mundo.niebla
      ? new THREE.FogExp2(new THREE.Color(tema.mundo.horizonte).getHex(), tema.mundo.niebla)
      : null;
    guia.material.color = new THREE.Color(tema.guia.color);
    guia.material.opacity = tema.guia.opacidad;
    fantasma.material.color = new THREE.Color(tema.guia.marcaObjetivo);
    aplicarDiseno(disenoPorId(tema.bolas));
  }

  const esc = () => escenas[tema.id];

  /* ---------------- Taco ----------------
     Fuera del montaje por sala: el taco tiene catálogo propio y no depende de
     dónde se juegue. Se rehace entero al cambiarlo, que son siete cilindros. */
  let tacoObj = construirTaco(disenoTaco);
  mundo.escena.add(tacoObj);

  function aplicarTaco(d) {
    disenoTaco = d;
    tacoObj.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    mundo.escena.remove(tacoObj);
    tacoObj = construirTaco(d);
    mundo.escena.add(tacoObj);
  }

  /* ---------------- Guías ---------------- */

  const guiaGeo = new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 4 }, () => new THREE.Vector3()),
  );
  const guia = new THREE.Line(guiaGeo, new THREE.LineDashedMaterial({
    color: 0xffffff, dashSize: 0.45, gapSize: 0.3, transparent: true, opacity: 0.55,
  }));
  mundo.escena.add(guia);

  /* Bola fantasma: dónde quedará la blanca al chocar. Es la ayuda que más
     sube el nivel de juego de quien no ha tocado un taco en su vida. */
  const fantasma = new THREE.Mesh(
    new THREE.SphereGeometry(M.R, 18, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, wireframe: true }),
  );
  mundo.escena.add(fantasma);

  /* ---------------- Bolas ---------------- */

  const bolas = [];
  let blanca = null;

  function aplicarBlanca(d) {
    blancaD = d;
    const b = bolas.find((x) => x.n === 0);
    if (!b) return;
    b.malla.material.dispose();
    b.malla.material = materialBola(0, diseno, null, blancaD);
  }

  function aplicarDiseno(d) {
    diseno = d;
    for (const b of bolas) {
      b.malla.material.dispose();
      b.malla.material = materialBola(b.n, diseno, players[b.n > 8 ? 1 : 0].color, blancaD);
    }
  }

  function crearBola(n, x, z) {
    const material = materialBola(n, diseno, players[n > 8 ? 1 : 0].color, blancaD);
    const malla = esfera(M.R, material, [x, M.SUPERFICIE, z], 26);
    malla.castShadow = true;
    mundo.escena.add(malla);
    const b = F.bola({ x, z, y: M.SUPERFICIE, r: M.R, n, malla });
    bolas.push(b);
    return b;
  }

  function colocar() {
    for (const b of bolas) { b.malla.geometry.dispose(); b.malla.material.dispose(); b.malla.parent?.remove(b.malla); }
    bolas.length = 0;
    blanca = crearBola(0, M.CABECERA.x, M.CABECERA.z);
    const x0 = M.LARGO * 0.42;
    const paso = M.R * 2.03;
    let i = 0;
    for (let fila = 0; fila < 5; fila++) {
      for (let k = 0; k <= fila; k++) {
        crearBola(ORDEN_TRIANGULO[i++], x0 + fila * paso * 0.87, (k - fila / 2) * paso);
      }
    }
  }

  const vivas = () => bolas.filter((b) => !b.retirada).map((b) => b.n);

  /* ---------------- Estado ---------------- */

  const partida = crearPartida(players);
  let fase = 'apuntar';       // apuntar | colocando | rodando | fin
  let angulo = 0;
  let fuerza = 0;
  let cargando = false;
  let ajustando = false;      // manteniendo especial: se toca el efecto
  const efecto = { x: 0, y: 0 };
  let tirada = nuevaTirada();
  let aviso = '';
  let avisoT = 0;
  let acabado = false;
  let marcador = null;
  let jaleo = 0;
  let rodando = 0;            // segundos que llevan las bolas en movimiento
  const camObjetivo = new THREE.Vector3(0, 22, 19);

  const decir = (t, s = 2.6) => { aviso = t; avisoT = s; };

  /* ---------------- Diagrama de efecto ---------------- */

  const diagrama = document.createElement('div');
  diagrama.style.cssText = `
    position:absolute; right:18px; bottom:56px; width:96px; height:96px; z-index:6;
    border-radius:50%; pointer-events:none;
    background:radial-gradient(circle at 34% 30%, #ffffff, #cfd4dc 70%, #9aa3af);
    box-shadow:0 6px 20px #0009, inset 0 0 0 2px #ffffff66; transition:opacity .18s;`;
  const punto = document.createElement('i');
  punto.style.cssText = `
    position:absolute; width:22px; height:22px; border-radius:50%;
    left:50%; top:50%; transform:translate(-50%,-50%);
    background:#e33; box-shadow:0 0 0 2px #fff, 0 2px 6px #0007;`;
  diagrama.appendChild(punto);
  const etiquetaDiag = document.createElement('b');
  etiquetaDiag.style.cssText = `
    position:absolute; left:0; right:0; bottom:-20px; text-align:center;
    font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:#fff; opacity:.75;`;
  diagrama.appendChild(etiquetaDiag);
  ctx.root.appendChild(diagrama);

  function pintarDiagrama() {
    const visible = fase === 'apuntar' && !acabado;
    diagrama.style.opacity = visible ? (ajustando ? '1' : '0.55') : '0';
    punto.style.left = `${50 + efecto.x * 34}%`;
    punto.style.top = `${50 - efecto.y * 34}%`;
    punto.style.background = ajustando ? players[partida.turno].color : '#e33';
    const nombre = efecto.y > 0.25 ? 'corrida' : efecto.y < -0.25 ? 'retroceso'
      : Math.abs(efecto.x) > 0.25 ? 'efecto' : 'centro';
    etiquetaDiag.textContent = ajustando ? nombre : 'E · efecto';
  }

  /* ---------------- Taller ----------------
     Un único sitio para elegir sala, bolas, blanca y taco. Antes cada cosa
     era una tecla suelta anunciada en el pie, y quien no leyera esa línea no
     llegaba a saber que existía la sala Circuito. */
  const taller = crearTaller(ctx.root, {
    sala: TEMAS, bolas: DISENOS, blanca: BLANCAS, taco: TACOS, musica: MUSICAS,
  }, (clave, opcion) => {
    if (clave === 'sala') aplicarTema(opcion.id);
    else if (clave === 'bolas') aplicarDiseno(opcion);
    else if (clave === 'blanca') aplicarBlanca(opcion);
    else if (clave === 'taco') aplicarTaco(opcion);
    else if (clave === 'musica') {
      if (opcion.id === 'silencio') ambiente.activa = false;
      else { ambiente.activa = true; ambiente.cambiarPaleta(opcion.id); ambiente.iniciar(ctx.meta, { paleta: opcion.id }); }
    }
    audio.blip();
  });

  /* Aviso permanente de que el taller existe. Es la pieza que convierte
     «hay una tecla escondida» en «hay un sitio donde se cambia todo». */
  const chip = document.createElement('div');
  chip.style.cssText = `
    position:absolute; left:16px; bottom:16px; z-index:6; pointer-events:none;
    padding:7px 13px; border-radius:999px; font-family:var(--font-ui,system-ui);
    font-size:11.5px; letter-spacing:.04em; color:#fff;
    background:rgba(8,12,18,0.62); border:1px solid #ffffff26;`;
  chip.innerHTML = '<b>C</b> · personalizar mesa';
  ctx.root.appendChild(chip);

  /* ---------------- Tirada ---------------- */

  function tirar() {
    const v = FUERZA_MIN + fuerza * (FUERZA_MAX - FUERZA_MIN);
    F.golpear(blanca, angulo, v, efecto);
    fase = 'rodando';
    tirada = nuevaTirada();
    tirada.esSaque = !partida.saqueHecho;
    audio.tone({ freq: 300, dur: 0.08, gain: 0.14 + fuerza * 0.18, type: 'triangle', sweep: -160 });
    audio.noise({ dur: 0.07, gain: 0.09 + fuerza * 0.13, filter: 3600 });
    haptics.impact(partida.turno, 0.5 + fuerza);
    esc().figuras.tirar(partida.turno);
    if (fuerza > 0.75) voz.decir(partida.turno, 'apunta', { prisa: 1.3 });
    fuerza = 0;
    cargando = false;
  }

  function embolsar(b) {
    b.retirada = true;
    b.vel.set(0, 0, 0);
    b.w.set(0, 0, 0);
    b.quieto = true;
    b.malla.visible = false;
    tirada.metidas.push(b.n);
    if (b.n === 0) tirada.blancaDentro = true;
    audio.tone({ freq: 190, dur: 0.18, gain: 0.2, type: 'sine', sweep: -100 });
    audio.noise({ dur: 0.28, gain: 0.13, filter: 640 });
    if (b.n !== 0) jaleo = Math.min(1, jaleo + 0.55);
  }

  function paso(dt) {
    const SUB = F.subpasos(bolas, dt);
    const h = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      for (const b of bolas) {
        if (b.retirada) continue;
        F.pasoPano(b, h);

        // Troneras antes que bandas: mientras la bola está en una boca, esa
        // banda no existe para ella. Si se hiciera al revés, la goma la
        // devolvería al paño antes de poder entrar.
        let enAlguna = false;
        for (const t of M.TRONERAS) {
          if (!F.enBoca(b, t)) continue;
          enAlguna = true;
          const q = F.tronera(b, t);
          if (q === 'dentro') { embolsar(b); break; }
          if (q === 'mandibula') {
            audio.tone({ freq: 120, dur: 0.07, gain: 0.09, type: 'sine' });
            jaleo = Math.min(1, jaleo + 0.15);
          }
        }
        if (b.retirada) continue;
        if (!enAlguna) {
          const golpe = F.bandasConEfecto(b, M.LIMITES);
          if (golpe > 0) {
            if (tirada.primerContacto !== null) tirada.bandaTrasContacto = true;
            if (golpe > 2.5) {
              audio.tone({ freq: 130 + Math.min(90, golpe * 4), dur: 0.06, gain: Math.min(0.1, 0.02 + golpe * 0.006), type: 'sine' });
            }
          }
        }
      }

      for (let i = 0; i < bolas.length; i++) {
        if (bolas[i].retirada) continue;
        for (let j = i + 1; j < bolas.length; j++) {
          if (bolas[j].retirada) continue;
          const golpe = F.chocarBolas(bolas[i], bolas[j]);
          if (golpe > 0.6) {
            // El primer contacto de la blanca decide si la tirada es legal.
            if (tirada.primerContacto === null && (bolas[i] === blanca || bolas[j] === blanca)) {
              tirada.primerContacto = (bolas[i] === blanca ? bolas[j] : bolas[i]).n;
            }
            audio.tone({
              freq: 820 + Math.min(700, golpe * 26), dur: 0.05,
              gain: Math.min(0.19, 0.02 + golpe * 0.008), type: 'square',
            });
          }
        }
      }
    }
    for (const b of bolas) {
      if (b.retirada) continue;
      F.girarMalla(b, dt);
      b.malla.position.set(b.pos.x, M.SUPERFICIE, b.pos.z);
    }
  }

  function resolver() {
    const res = partida.juzgar(tirada, vivas());

    if (res.reparto) decir(`${players[partida.turno].name} juega ${res.reparto}`);

    if (res.fin) {
      acabado = true;
      fase = 'fin';
      jaleo = 1;
      audio.win();
      voz.decir(res.ganador, 'gana');
      setTimeout(() => voz.decir(1 - res.ganador, 'pierde'), 900);
      setTimeout(() => ctx.finish({
        winner: res.ganador,
        detail: res.mensaje,
        scores: [7 - partida.restan(0, vivas()), 7 - partida.restan(1, vivas())],
      }), 1200);
      return;
    }

    if (res.falta) {
      decir(`Falta: ${res.razon} · bola en mano`);
      audio.error();
      haptics.error(partida.turno);
      voz.decir(partida.turno, 'falta');
      // Y el rival se ríe un poco, que es media gracia de jugar en pareja.
      setTimeout(() => voz.decir(1 - partida.turno, 'pica'), 620);
      // La blanca vuelve a la mesa y la coloca el rival.
      blanca.retirada = false;
      blanca.malla.visible = true;
      blanca.pos.set(M.CABECERA.x, M.SUPERFICIE, M.CABECERA.z);
      blanca.vel.set(0, 0, 0);
      blanca.w.set(0, 0, 0);
      blanca.quieto = true;
      partida.cambiarTurno();
      fase = 'colocando';
    } else {
      if (res.mensaje) {
        decir(res.mensaje);
        haptics.score(partida.turno);
        const metidas = tirada.metidas.filter((n) => n !== 0 && n !== 8).length;
        voz.decir(partida.turno, metidas > 1 ? 'acertaza' : 'acierta');
        esc().figuras.animar_(partida.turno, 1);
      } else if (!tirada.metidas.length) {
        voz.decir(partida.turno, 'falla');
        esc().figuras.animar_(partida.turno, -1);
      }
      if (!res.sigue) partida.cambiarTurno();
      fase = 'apuntar';
    }
    efecto.x = 0; efecto.y = 0;
    apuntarAlObjetivo();
  }

  /** Al empezar el turno, el taco mira a la bola propia más razonable. */
  function apuntarAlObjetivo() {
    const g = partida.grupoDe(partida.turno);
    let objetivos = bolas.filter((b) => !b.retirada && b.n !== 0 && b.n !== 8);
    if (g) {
      const mias = objetivos.filter((b) => g.includes(b.n));
      objetivos = mias.length ? mias : bolas.filter((b) => !b.retirada && b.n === 8);
    }
    let mejor = null, mejorD = Infinity;
    for (const o of objetivos) {
      const d = Math.hypot(o.pos.x - blanca.pos.x, o.pos.z - blanca.pos.z);
      if (d < mejorD) { mejorD = d; mejor = o; }
    }
    if (mejor) angulo = Math.atan2(mejor.pos.z - blanca.pos.z, mejor.pos.x - blanca.pos.x);
  }

  /* ---------------- Colocar la blanca (bola en mano) ---------------- */

  function moverBlanca(dt, p) {
    const v = 7;
    if (p.held('left')) blanca.pos.x -= v * dt;
    if (p.held('right')) blanca.pos.x += v * dt;
    if (p.held('up')) blanca.pos.z -= v * dt;
    if (p.held('down')) blanca.pos.z += v * dt;
    blanca.pos.x = Math.max(-M.LARGO + M.R, Math.min(M.LARGO - M.R, blanca.pos.x));
    blanca.pos.z = Math.max(-M.ANCHO + M.R, Math.min(M.ANCHO - M.R, blanca.pos.z));
    blanca.malla.position.set(blanca.pos.x, M.SUPERFICIE, blanca.pos.z);
  }

  /** ¿Cabe la blanca donde está? No puede solaparse con otra. */
  function sitioLibre() {
    return bolas.every((b) => b === blanca || b.retirada
      || Math.hypot(b.pos.x - blanca.pos.x, b.pos.z - blanca.pos.z) > M.R * 2.05);
  }

  /* ---------------- Presentación ---------------- */

  function pintarTaco() {
    const visible = fase === 'apuntar' && !acabado && !taller.abierto;
    tacoObj.visible = visible;
    guia.visible = visible;
    fantasma.visible = visible;
    if (!visible) return;

    /* Todo el taco retrocede como una pieza mientras se carga: antes se movían
       solo dos tramos y los otros cinco se quedaban clavados. */
    tacoObj.position.set(
      blanca.pos.x - Math.cos(angulo) * fuerza * 2.6,
      M.SUPERFICIE + 0.05,
      blanca.pos.z - Math.sin(angulo) * fuerza * 2.6,
    );
    tacoObj.rotation.y = -angulo;
    // El taco se inclina según el efecto vertical: golpear bajo es bajar la
    // mano, y verlo es lo que hace entender qué está pasando.
    tacoObj.rotation.z = efecto.y * 0.18;

    trazarGuia();
  }

  /** Guía de tiro: hasta el primer choque, con el fantasma y, en Circuito, la banda. */
  function trazarGuia() {
    const dir = new THREE.Vector2(Math.cos(angulo), Math.sin(angulo));
    let alcance = 60, chocada = null;

    for (const b of bolas) {
      if (b.retirada || b === blanca) continue;
      const dx = b.pos.x - blanca.pos.x, dz = b.pos.z - blanca.pos.z;
      const proy = dx * dir.x + dz * dir.y;
      if (proy <= 0) continue;
      const lateral = Math.abs(dx * dir.y - dz * dir.x);
      if (lateral >= M.R * 2) continue;
      // Distancia exacta al contacto entre dos esferas, no una aproximación.
      const d = proy - Math.sqrt(Math.max(0, (M.R * 2) ** 2 - lateral * lateral));
      if (d < alcance) { alcance = d; chocada = b; }
    }

    // Y contra las bandas, para no dibujar una línea que atraviesa la mesa.
    let banda = null;
    for (const [lim, comp, n] of [
      [-M.LARGO + M.R, 'x', 1], [M.LARGO - M.R, 'x', -1],
      [-M.ANCHO + M.R, 'z', 1], [M.ANCHO - M.R, 'z', -1],
    ]) {
      const d0 = comp === 'x' ? dir.x : dir.y;
      if (Math.abs(d0) < 1e-4) continue;
      const t = (lim - (comp === 'x' ? blanca.pos.x : blanca.pos.z)) / d0;
      if (t > 0.01 && t < alcance) { alcance = t; chocada = null; banda = { comp, n }; }
    }

    const px = blanca.pos.x + dir.x * alcance;
    const pz = blanca.pos.z + dir.y * alcance;
    const p = guiaGeo.attributes.position.array;
    p[0] = blanca.pos.x; p[1] = M.SUPERFICIE; p[2] = blanca.pos.z;
    p[3] = px; p[4] = M.SUPERFICIE; p[5] = pz;

    fantasma.position.set(px, M.SUPERFICIE, pz);
    fantasma.visible = !!chocada;

    if (banda && tema.guia.prediceBanda) {
      /* Ayuda del Circuito: se dibuja también el rebote, con el efecto lateral ya
         metido en el ángulo de salida. Es la ayuda que justifica la sala
         futurista: no es un filtro de color, cambia lo que puedes planear. */
      let rx = dir.x, rz = dir.y;
      if (banda.comp === 'x') rx = -rx * F.BANDA.RESTITUCION, rz = rz * F.BANDA.ROCE;
      else rz = -rz * F.BANDA.RESTITUCION, rx = rx * F.BANDA.ROCE;
      const desvio = -efecto.x * 0.55;
      const rot = Math.atan2(rz, rx) + desvio;
      const largo = 9;
      p[6] = px; p[7] = M.SUPERFICIE; p[8] = pz;
      p[9] = px + Math.cos(rot) * largo;
      p[10] = M.SUPERFICIE;
      p[11] = pz + Math.sin(rot) * largo;
    } else {
      p[6] = px; p[7] = M.SUPERFICIE; p[8] = pz;
      p[9] = px; p[10] = M.SUPERFICIE; p[11] = pz;
    }
    guiaGeo.attributes.position.needsUpdate = true;
    guia.computeLineDistances();
  }

  function pintarCamara(dt) {
    /* La cámara se abre un poco hacia donde va el tiro mientras se apunta y
       se echa atrás cuando ruedan las bolas. Poco, pero es lo que hace que
       la mesa parezca un sitio y no un plano. */
    if (fase === 'rodando') {
      camObjetivo.set(0, 24, 20.5);
    } else {
      camObjetivo.set(
        -Math.cos(angulo) * 4.5,
        21,
        18 - Math.sin(angulo) * 2.5,
      );
    }
    const k = 1 - Math.exp(-2.2 * dt);
    mundo.camara.position.lerp(camObjetivo, k);
    mundo.camara.lookAt(0, M.ALTO_MESA, 0);
  }

  function pintarPanel() {
    if (acabado) { panel.centro('Fin de la partida'); panel.sub(aviso); panel.barra(null); return; }
    const j = players[partida.turno];
    const g = partida.grupoDe(partida.turno);
    const restan = g ? partida.restan(partida.turno, vivas()) : '—';
    const negra = partida.aLaNegra(partida.turno, vivas());

    panel.centro(`<span style="color:${j.color}">${j.name}</span> · ${partida.nombreGrupo(partida.turno)}`);

    if (fase === 'colocando') {
      panel.sub(`<b>Bola en mano</b> · mueve la blanca con las flechas y confirma con acción${sitioLibre() ? '' : ' <span style="color:#ff6b6b">· ahí no cabe</span>'}`);
      panel.barra(null);
    } else if (fase === 'apuntar') {
      const estado = avisoT > 0 ? aviso
        : negra ? '<b>a por la negra</b>'
        : `te quedan ${restan}`;
      panel.sub(`${estado}${ajustando ? ' · <b>colocando el efecto</b>' : ''}`);
      panel.barra(fuerza, fuerza > 0.82 ? '#ff4757' : j.color);
    } else {
      panel.sub(avisoT > 0 ? aviso : 'las bolas están rodando…');
      panel.barra(null);
    }

    panel.pie('← → apuntar · ↑ ↓ fino · <b>especial</b>+flechas efecto · mantener acción: fuerza');
  }

  /* ---------------- Tecla del taller ----------------
     Va por tecla física y no por acción de mando para no gastar ninguno de
     los dos botones que tiene cada jugador, que están los dos ocupados
     (fuerza y efecto). Una vez dentro, lo maneja quien tenga el turno con
     sus propias teclas. */
  function alTeclado(e) {
    if (e.code !== 'KeyC' || acabado) return;
    if (taller.abierto) { taller.cerrar(); audio.back(); }
    else if (fase === 'apuntar' || fase === 'colocando') {
      taller.abrir(players[partida.turno].color);
      audio.select();
    }
  }

  return {
    init() {
      colocar();
      aplicarTema('clasico');
      apuntarAlObjetivo();
      marcador = ctx.ui.scoreboard({ center: 'Bola 8' });
      marcador.update(0, 0);
      taller.fijar('sala', tema.id);
      taller.fijar('bolas', diseno.id);
      taller.fijar('blanca', blancaD.id);
      taller.fijar('taco', disenoTaco.id);
      taller.fijar('musica', 'lofi');
      ambiente.activa = true;
      ambiente.iniciar(ctx.meta, { paleta: 'lofi' });
      window.addEventListener('keydown', alTeclado);
      decir('Saque: el primero que meta elige color', 4);
      setTimeout(() => voz.decir(0, 'saluda'), 500);
      setTimeout(() => voz.decir(1, 'saluda'), 1250);
    },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      const p = input.player(partida.turno);

      /* Con el taller abierto, las teclas son suyas: si no, apuntar y navegar
         el menú ocurrirían a la vez y no se podría hacer ninguna de las dos. */
      if (taller.abierto) {
        if (taller.navegar(p, players[partida.turno].color)) { taller.cerrar(); audio.back(); }
        pintarTaco();
        pintarCamara(dt);
        pintarDiagrama();
        esc().figuras.postura(partida.turno, false);
        esc().figuras.animar(dt, partida.turno);
        mundo.dibujar();
        return;
      }

      if (fase === 'colocando' && !acabado) {
        moverBlanca(dt, p);
        if (p.pressed('a') && sitioLibre()) {
          fase = 'apuntar';
          apuntarAlObjetivo();
          audio.place();
        }
      } else if (fase === 'apuntar' && !acabado) {
        ajustando = p.held('b');
        if (ajustando) {
          /* Con especial mantenido las flechas mueven el punto de golpeo.
             Se limita al 88 % del radio: más allá el taco resbalaría, que en
             una mesa real es la pifia clásica. */
          const v = 1.15 * dt;
          if (p.held('left')) efecto.x -= v;
          if (p.held('right')) efecto.x += v;
          if (p.held('up')) efecto.y += v;
          if (p.held('down')) efecto.y -= v;
          const mod = Math.hypot(efecto.x, efecto.y);
          if (mod > 0.88) { efecto.x *= 0.88 / mod; efecto.y *= 0.88 / mod; }
        } else {
          const fino = p.held('up') || p.held('down') ? 0.22 : 1;
          if (p.held('left')) angulo -= 1.4 * dt * fino;
          if (p.held('right')) angulo += 1.4 * dt * fino;
        }

        if (p.pressed('a')) { cargando = true; fuerza = 0; }
        if (cargando && p.held('a')) {
          const antes = fuerza;
          fuerza = Math.min(1, fuerza + dt * 0.8);
          if (Math.floor(fuerza * 14) !== Math.floor(antes * 14)) audio.tick();
        }
        if (cargando && p.released('a')) tirar();
      }

      if (fase === 'rodando') {
        paso(dt);
        rodando += dt;
        /* Red de seguridad. El turno no puede resolverse hasta que todo pare,
           así que hay que garantizar que eso pasa siempre:
             · a los 9 s se empieza a frenar todo;
             · a los 13 s se para a la fuerza.
           El corte duro no sobra: midiendo ocho saques a máxima potencia,
           siete se asentaban solos en unos 10 s y uno se quedaba dando
           vueltas indefinidamente —dos bolas encajadas contra una mandíbula
           que se despertaban la una a la otra—. Sin esto, esa partida se
           queda colgada para siempre. */
        if (rodando > 9) {
          const k = Math.exp(-(rodando - 9) * 1.6 * dt);
          for (const b of bolas) if (!b.retirada) { b.vel.multiplyScalar(k); b.w.multiplyScalar(k); }
        }
        if (rodando > 13) {
          for (const b of bolas) if (!b.retirada) { b.vel.set(0, 0, 0); b.w.set(0, 0, 0); b.quieto = true; }
        }
        if (F.todoQuieto(bolas)) { rodando = 0; resolver(); }
      }

      pintarTaco();
      pintarCamara(dt);
      pintarPanel();
      pintarDiagrama();

      const e = esc();
      e.publico.animar(dt, jaleo);
      e.figuras.postura(partida.turno, fase === 'apuntar' && !acabado && !taller.abierto);
      e.figuras.animar(dt, partida.turno);
      jaleo = Math.max(0, jaleo - dt * 0.9);

      // Hasta que no se reparten los colores nadie ha metido nada suyo: sin
      // este resguardo `restan` cuenta las catorce de la mesa y el marcador
      // arrancaba en −7 para los dos.
      if (marcador) {
        const v = vivas();
        marcador.update(
          partida.grupoDe(0) ? 7 - partida.restan(0, v) : 0,
          partida.grupoDe(1) ? 7 - partida.restan(1, v) : 0,
        );
      }
      mundo.dibujar();
    },

    destroy() {
      window.removeEventListener('keydown', alTeclado);
      taller.destruir();
      chip.remove();
      diagrama.remove();
      panel.destruir();
      mundo.destruir();
      olvidarTexturas();
      marcador?.remove();
    },
  };
}
