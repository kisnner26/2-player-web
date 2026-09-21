/**
 * red.js — cliente de sala del lado de la pantalla (la Mac).
 *
 * Abre una sala en server/servidor.js, recibe lo que pulsan los mandos y lo
 * mete en core/input.js como si fueran teclas. Ese es todo el truco: para un
 * juego no hay ninguna diferencia entre un dedo en un iPad y la tecla W, así
 * que los ochenta y tres juegos que ya existen funcionan con mando sin tocar
 * una línea de su código.
 *
 * La sala sobrevive al salto del menú a la partida: el código se guarda en
 * sessionStorage y al cargar la página siguiente se reclama la misma sala.
 * Por eso el iPad no tiene que reemparejarse en cada juego.
 *
 * Si no hay servidor de Node detrás (por ejemplo, con `python3 -m http.server`)
 * la conexión falla en silencio y el arcade sigue funcionando con el teclado:
 * las salas son un extra, nunca un requisito.
 */

import { input } from './input.js';

const CLAVE_SALA = '2pa:sala';
const ACCIONES = new Set(['up', 'down', 'left', 'right', 'a', 'b']);

class Red {
  constructor() {
    this.ws = null;
    this.codigo = null;
    this.direcciones = [];
    this.puerto = Number(location.port) || 80;
    this.mandos = [];          // slots ocupados, p.ej. [0] o [0, 1]
    this.estado = 'apagada';   // apagada | conectando | abierta | error
    this.motivo = '';
    this._oyentes = new Set();
    this._perfilVigente = new Map();
    this._reintento = null;
    this._limite = null;
  }

  /** Suscribe un callback a cualquier cambio de estado. Devuelve el desuscriptor. */
  alCambiar(cb) {
    this._oyentes.add(cb);
    return () => this._oyentes.delete(cb);
  }
  _avisar() { for (const cb of this._oyentes) cb(this); }

  get activa() { return this.estado === 'abierta'; }
  /** URL que hay que teclear en el iPad. */
  get url() {
    const ip = this.direcciones[0] || location.hostname;
    return `http://${ip}:${this.puerto}/mando`;
  }

  /**
   * Abre la sala. Si ya había una en esta sesión, la reclama en vez de crear
   * otra, así el código que el iPad tiene escrito sigue siendo válido.
   */
  abrir() {
    if (this.ws && this.estado !== 'error') return;

    // Una página https o abierta como archivo no puede hablar con el servidor
    // de salas: el navegador bloquea ws:// desde ahí. Se avisa sin esperar.
    if (location.protocol === 'https:') {
      this._fallar('Esta versión publicada (https) no puede hospedar salas. Los mandos táctiles necesitan el servidor local: abre el arcade con start.command.');
      return;
    }
    if (location.protocol === 'file:' || !location.host) {
      this._fallar('El arcade está abierto como archivo. Arráncalo con start.command para usar los mandos táctiles.');
      return;
    }

    this.estado = 'conectando';
    this._avisar();

    let ws;
    try {
      ws = new WebSocket(`ws://${location.host}/ws`);
    } catch {
      this._fallar('Este arcade se está sirviendo sin el servidor de salas.');
      return;
    }
    this.ws = ws;

    // Nunca se queda esperando para siempre: si en 5 s no hay sala, se cuenta.
    clearTimeout(this._limite);
    this._limite = setTimeout(() => {
      if (this.estado !== 'conectando') return;
      this._fallar(`El servidor de ${location.host} no respondió. Cierra otros servidores en ese puerto y abre el arcade con start.command.`);
    }, 5000);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ tipo: 'crear', codigo: sessionStorage.getItem(CLAVE_SALA) || undefined }));
    });

    ws.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this._recibir(msg);
    });

    ws.addEventListener('error', () => {
      // El evento de error no trae motivo; el de cierre decide qué contar.
    });

    ws.addEventListener('close', () => {
      this.ws = null;
      if (this.estado === 'conectando') {
        this._fallar('No hay servidor de salas. Arranca el arcade con start.command.');
        return;
      }
      if (this.estado === 'abierta') {
        // Caída en caliente: se reintenta sola, que el iPad no se entere.
        this.estado = 'conectando';
        this.mandos = [];
        this._avisar();
        clearTimeout(this._reintento);
        this._reintento = setTimeout(() => this.abrir(), 1200);
      }
    });
  }

  _fallar(motivo) {
    clearTimeout(this._limite);
    clearTimeout(this._reintento);
    const ws = this.ws;
    this.ws = null;        // así `abrir()` puede reintentar desde cero
    try { ws?.close(); } catch { /* ya estaba cerrado */ }
    this.estado = 'error';
    this.motivo = motivo;
    this._avisar();
  }

  _recibir(msg) {
    switch (msg.tipo) {
      case 'sala': {
        clearTimeout(this._limite);
        const eraNueva = this.estado !== 'abierta';
        this.estado = 'abierta';
        this.codigo = msg.codigo;
        this.direcciones = msg.direcciones || [];
        this.puerto = msg.puerto || this.puerto;
        this.mandos = msg.mandos || [];
        sessionStorage.setItem(CLAVE_SALA, this.codigo);
        // Los perfiles solo se repiten al (re)abrir la conexión. El servidor
        // ya guarda el vigente y se lo da a cada mando que entra, así que
        // reenviarlos en cada aviso solo generaría tráfico redundante.
        if (eraNueva) for (const [slot, perfil] of this._perfilVigente) this.enviarPerfil(slot, perfil);
        this._avisar();
        break;
      }

      case 'accion':
        if (ACCIONES.has(msg.a)) input.accionRemota(msg.slot, msg.a, !!msg.v);
        break;

      case 'stick':
        input.stickRemoto(msg.slot, msg.x, msg.y);
        break;

      case 'trazo':
        // Los trazos no son acciones: se encolan y los consume el juego que
        // los pidió, con input.player(i).tomarTrazos().
        input.trazoRemoto(msg.slot, msg.puntos);
        break;

      case 'mando-fuera':
        // Se suelta todo lo que tuviera pulsado o el personaje sigue andando.
        input.soltarRemoto(msg.slot);
        this.mandos = this.mandos.filter((s) => s !== msg.slot);
        this._avisar();
        break;

      case 'error':
        this._fallar(msg.razon || 'Error de sala');
        break;
    }
  }

  /**
   * Dice a un mando qué botonera dibujar.
   * @param {number|'todos'} slot
   * @param {object} perfil { juego, titulo, disposicion, botones, color }
   */
  enviarPerfil(slot, perfil) {
    this._perfilVigente.set(slot, perfil);
    if (!this.activa) return;
    this.ws?.send(JSON.stringify({ ...perfil, tipo: 'perfil', slot: slot === 'todos' ? undefined : slot }));
  }

  /** Vibración corta en el mando de un jugador (golpe, gol, error). */
  vibrar(slot, patron = 'toque') {
    if (!this.activa) return;
    this.ws?.send(JSON.stringify({ tipo: 'aviso', slot, patron }));
  }

  cerrar() {
    clearTimeout(this._reintento);
    sessionStorage.removeItem(CLAVE_SALA);
    this.estado = 'apagada';
    this.codigo = null;
    this.mandos = [];
    this.ws?.close();
    this.ws = null;
    this._avisar();
  }
}

/** Instancia única, igual que `input`: el hub y los juegos comparten sala. */
export const red = new Red();

/**
 * Reengancha la sala si esta pestaña ya tenía una abierta.
 * Se llama al cargar el hub y al cargar una partida, de forma que el mando
 * sigue funcionando aunque la página haya cambiado.
 */
export function reanudarSala() {
  if (sessionStorage.getItem(CLAVE_SALA)) red.abrir();
}
