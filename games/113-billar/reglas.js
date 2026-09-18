/**
 * reglas.js — bola 8, con las faltas de verdad.
 *
 * El billar de antes solo miraba qué bolas habían caído. Con eso puedes tirar
 * a la bola del contrario, colar una tuya de carambola y seguir tirando; o
 * dar un tacazo a la nada, no tocar bola, y no pasa nada. Aquí se registra la
 * tirada entera —qué tocó primero la blanca, si algo llegó a banda después,
 * qué cayó— y se juzga con las reglas normales:
 *
 *   · Hay que golpear PRIMERO una bola de tu grupo (cualquiera si están sin
 *     repartir; la negra solo cuando ya no te queda ninguna).
 *   · Tras el contacto, o entra una bola o alguna tiene que tocar banda. Si no,
 *     es «tirada blanda» y es falta.
 *   · Falta ⇒ el rival tira con BOLA EN MANO: la coloca donde quiera. Es lo que
 *     convierte una falta en un castigo de verdad y no en un simple cambio de
 *     turno.
 *   · La negra cierra la partida, y meterla antes de tiempo —o meterla junto a
 *     la blanca— la pierde.
 *
 * Este módulo no sabe nada de 3D ni de turnos: recibe el parte de la tirada y
 * devuelve qué pasa. Así se puede añadir la bola 9 al lado sin tocar el juego.
 */

export const ROJAS = [1, 2, 3, 4, 5, 6, 7];
export const AMARILLAS = [9, 10, 11, 12, 13, 14, 15];

/** Parte en blanco de una tirada; el juego lo va rellenando mientras rueda. */
export function nuevaTirada() {
  return {
    metidas: [],            // números embolsados, en orden
    primerContacto: null,   // primera bola que tocó la blanca
    bandaTrasContacto: false,
    blancaDentro: false,
    esSaque: false,
  };
}

export function crearPartida(players) {
  /** 'rojas' | 'amarillas' | null mientras están sin repartir */
  const grupo = [null, null];
  let turno = 0;
  let saqueHecho = false;

  const grupoDe = (j) => (grupo[j] === 'rojas' ? ROJAS : grupo[j] === 'amarillas' ? AMARILLAS : null);
  const nombreGrupo = (j) => grupo[j] || 'sin repartir';

  /** Las bolas que le quedan a un jugador sobre la mesa. */
  function restan(j, vivas) {
    const g = grupoDe(j);
    if (!g) return vivas.filter((n) => n !== 0 && n !== 8).length;
    return vivas.filter((n) => g.includes(n)).length;
  }

  /** ¿A este jugador solo le queda la negra? */
  const aLaNegra = (j, vivas) => !!grupoDe(j) && restan(j, vivas) === 0;

  /**
   * Juzga una tirada.
   *
   * @param {object} t      parte de la tirada
   * @param {number[]} vivas números de las bolas que siguen en la mesa DESPUÉS
   * @returns {object} { falta, razon, sigue, bolaEnMano, fin, ganador, mensaje }
   */
  function juzgar(t, vivas) {
    const res = {
      falta: false, razon: '', sigue: false, bolaEnMano: false,
      fin: false, ganador: -1, mensaje: '', reparto: null,
    };
    const propias = t.metidas.filter((n) => n !== 0 && n !== 8);

    /* --- Reparto de colores ---
       Se hace ANTES de juzgar: si el saque cuela una bola, esa bola decide el
       color y la tirada se juzga ya con el grupo asignado. */
    if (!grupo[0] && propias.length && (saqueHecho || t.esSaque)) {
      // Con bolas de los dos colores metidas de golpe manda la primera.
      const esRoja = ROJAS.includes(propias[0]);
      grupo[turno] = esRoja ? 'rojas' : 'amarillas';
      grupo[1 - turno] = esRoja ? 'amarillas' : 'rojas';
      res.reparto = grupo[turno];
    }

    /* --- La negra --- */
    if (t.metidas.includes(8)) {
      res.fin = true;
      // Solo vale si ya no le quedaba ninguna y no coló también la blanca.
      const limpio = aLaNegra(turno, vivas) && !t.blancaDentro;
      res.ganador = limpio ? turno : 1 - turno;
      res.mensaje = limpio
        ? `${players[turno].name} cierra con la negra`
        : t.blancaDentro
          ? `${players[turno].name} metió la negra y la blanca`
          : `${players[turno].name} metió la negra antes de tiempo`;
      return res;
    }

    /* --- Faltas --- */
    const mio = grupoDe(turno);
    const debiaNegra = aLaNegra(turno, vivas.concat(propias));

    if (t.blancaDentro) {
      res.falta = true;
      res.razon = 'la blanca dentro';
    } else if (t.primerContacto === null) {
      res.falta = true;
      res.razon = 'no tocaste ninguna bola';
    } else if (mio && !debiaNegra && t.primerContacto === 8) {
      res.falta = true;
      res.razon = 'tocaste la negra primero';
    } else if (mio && !debiaNegra && !mio.includes(t.primerContacto)) {
      res.falta = true;
      res.razon = `tocaste ${nombreGrupo(1 - turno)} primero`;
    } else if (!t.metidas.length && !t.bandaTrasContacto) {
      res.falta = true;
      res.razon = 'ninguna bola llegó a banda';
    }

    if (res.falta) {
      res.bolaEnMano = true;
      res.sigue = false;
    } else {
      // Sigue tirando solo si metió alguna SUYA.
      const mias = mio ? propias.filter((n) => mio.includes(n)) : propias;
      res.sigue = mias.length > 0;
      if (res.sigue) {
        res.mensaje = mias.length === 1 ? '¡Dentro! Sigues' : `¡${mias.length} de golpe! Sigues`;
      }
    }

    if (t.esSaque) saqueHecho = true;
    return res;
  }

  return {
    get turno() { return turno; },
    set turno(v) { turno = v; },
    get saqueHecho() { return saqueHecho; },
    grupo,
    grupoDe,
    nombreGrupo,
    restan,
    aLaNegra,
    juzgar,
    cambiarTurno() { turno = 1 - turno; },
  };
}

/**
 * Triángulo reglamentario: la 8 en el centro de la tercera fila y los dos
 * colores alternados, con una lisa y una rayada en las esquinas de atrás.
 */
export const ORDEN_TRIANGULO = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
