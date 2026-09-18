/**
 * ws.js — WebSocket de servidor, en Node puro y sin dependencias.
 *
 * El proyecto entero presume de no pedir `npm install` a nadie: se abre
 * start.command y se juega. Traer una librería solo para las salas de red
 * rompería eso, así que aquí está el trozo del RFC 6455 que hace falta y
 * nada más: apretón de manos, marcos de texto, ping/pong y cierre.
 *
 * Lo que NO implementa, a propósito, porque esta sala vive en la red de casa
 * y solo habla con nuestro propio mando.html:
 *   - extensiones (permessage-deflate)
 *   - marcos binarios
 *   - fragmentación de mensajes de más de 64 KB
 * Un mensaje de mando son cuarenta bytes; el límite sobra de largo.
 */

import crypto from 'node:crypto';

/** Constante mágica del RFC 6455 para derivar la respuesta del apretón. */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** Tamaño máximo aceptado por mensaje. Un mando manda decenas de bytes. */
const MAX_PAYLOAD = 64 * 1024;

/**
 * Conexión ya establecida. Emite eventos por callbacks simples en vez de
 * EventEmitter: solo hay tres y así se lee de un vistazo.
 */
class Conexion {
  constructor(socket) {
    this.socket = socket;
    this.abierta = true;
    this.datos = {};              // espacio libre para el servidor (sala, rol…)
    this.onMensaje = () => {};
    this.onCierre = () => {};

    this._buffer = Buffer.alloc(0);
    socket.on('data', (trozo) => this._recibir(trozo));
    socket.on('close', () => this._cerrar());
    socket.on('error', () => this._cerrar());
  }

  /** Envía un objeto como JSON en un marco de texto. */
  enviar(objeto) {
    if (!this.abierta) return;
    try {
      this.socket.write(marco(1, Buffer.from(JSON.stringify(objeto))));
    } catch {
      this._cerrar();
    }
  }

  cerrar() {
    if (!this.abierta) return;
    try { this.socket.write(marco(8, Buffer.alloc(0))); } catch {}
    this.socket.end();
    this._cerrar();
  }

  _cerrar() {
    if (!this.abierta) return;
    this.abierta = false;
    this.onCierre();
  }

  _recibir(trozo) {
    this._buffer = Buffer.concat([this._buffer, trozo]);
    // Un solo paquete TCP puede traer varios marcos, o medio marco.
    for (;;) {
      const leido = this._leerMarco();
      if (!leido) break;
    }
  }

  /** Intenta consumir un marco del buffer. Devuelve true si consumió uno. */
  _leerMarco() {
    const b = this._buffer;
    if (b.length < 2) return false;

    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const enmascarado = (b[1] & 0x80) !== 0;
    let largo = b[1] & 0x7f;
    let i = 2;

    if (largo === 126) {
      if (b.length < i + 2) return false;
      largo = b.readUInt16BE(i);
      i += 2;
    } else if (largo === 127) {
      if (b.length < i + 8) return false;
      const grande = b.readBigUInt64BE(i);
      if (grande > BigInt(MAX_PAYLOAD)) { this.cerrar(); return false; }
      largo = Number(grande);
      i += 8;
    }
    if (largo > MAX_PAYLOAD) { this.cerrar(); return false; }

    // El cliente siempre enmascara; un marco sin máscara es protocolo roto.
    if (!enmascarado) { this.cerrar(); return false; }
    if (b.length < i + 4) return false;
    const mascara = b.subarray(i, i + 4);
    i += 4;

    if (b.length < i + largo) return false;
    const carga = Buffer.from(b.subarray(i, i + largo));
    for (let k = 0; k < carga.length; k++) carga[k] ^= mascara[k & 3];
    this._buffer = b.subarray(i + largo);

    if (opcode === 8) { this.cerrar(); return false; }
    if (opcode === 9) { // ping → pong con la misma carga
      try { this.socket.write(marco(10, carga)); } catch {}
      return true;
    }
    if (opcode === 10) return true;               // pong: nada que hacer
    if (opcode === 1 && fin) {
      try {
        this.onMensaje(JSON.parse(carga.toString('utf8')));
      } catch {
        // Un mensaje ilegible no tumba la sala: se ignora y se sigue.
      }
    }
    return true;
  }
}

/** Construye un marco de servidor (nunca enmascarado). */
function marco(opcode, carga) {
  const largo = carga.length;
  let cabecera;
  if (largo < 126) {
    cabecera = Buffer.alloc(2);
    cabecera[1] = largo;
  } else if (largo < 65536) {
    cabecera = Buffer.alloc(4);
    cabecera[1] = 126;
    cabecera.writeUInt16BE(largo, 2);
  } else {
    cabecera = Buffer.alloc(10);
    cabecera[1] = 127;
    cabecera.writeBigUInt64BE(BigInt(largo), 2);
  }
  cabecera[0] = 0x80 | opcode;
  return Buffer.concat([cabecera, carga]);
}

/**
 * Engancha el WebSocket a un servidor HTTP existente.
 * @param {import('node:http').Server} servidor
 * @param {string} ruta            ruta que se acepta como WebSocket
 * @param {(c: Conexion) => void} alConectar
 */
export function montarWebSocket(servidor, ruta, alConectar) {
  servidor.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://local');
    const clave = req.headers['sec-websocket-key'];
    if (url.pathname !== ruta || !clave) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    const aceptar = crypto.createHash('sha1').update(clave + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${aceptar}\r\n\r\n`
    );
    socket.setNoDelay(true);        // los mandos mandan paquetes diminutos
    alConectar(new Conexion(socket));
  });
}
