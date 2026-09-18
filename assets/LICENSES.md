# Licencias y procedencia de los recursos

Este proyecto está construido para no depender de nada externo. A día de hoy
**no incluye ningún archivo de imagen, sonido ni fuente de terceros**.

## Qué se usa y de dónde sale

| Recurso | Origen | Licencia |
|---|---|---|
| Todo el arte de los juegos | Generado por código en tiempo real (Canvas 2D y CSS) | Propio de este proyecto |
| Todos los efectos de sonido | Sintetizados con WebAudio en `core/audio.js` (osciladores y ruido) | Propio de este proyecto |
| Iconos y avatares por defecto | Emojis del sistema operativo | Los provee macOS, no se redistribuyen |
| Tipografías | Fuentes del sistema (SF Mono, sistema de macOS) | Las provee macOS |

Esto significa que **no hay ninguna atribución obligatoria** y el proyecto se
puede modificar y redistribuir libremente.

## Si quieres añadir assets externos

Las dos fuentes recomendadas, ambas compatibles con este proyecto:

### Kenney (kenney.nl)
Más de 60.000 sprites, iconos de interfaz, efectos de sonido y modelos 3D.
Licencia **CC0 1.0 (dominio público)**: uso libre, también comercial, y sin
atribución obligatoria. Es la mejor fuente para darle un aspecto de pixel art
"de verdad" a las categorías `pixel`.

- Packs útiles aquí: *Platformer Art*, *UI Pack*, *Space Shooter Redux*,
  *Board Game Icons*, *Interface Sounds*, *Impact Sounds*.

### OpenGameArt (opengameart.org)
Muy variado, pero **hay que filtrar por licencia**. Solo son directamente
compatibles con lo anterior los recursos marcados **CC0**. Los marcados
CC-BY o CC-BY-SA obligan a dar crédito y, en el caso de SA, a licenciar tu
trabajo derivado igual — si usas alguno, apúntalo en la tabla de arriba.

### Fuentes tipográficas
*Press Start 2P* (Google Fonts) es la fuente arcade clásica y está bajo
**SIL Open Font License 1.1**, que permite empaquetarla con el proyecto.
Instrucciones para añadirla en `assets/fonts/fonts.css`.

## Reglas que sigue este proyecto

1. **Solo CC0, OFL o MIT.** Nada que obligue a dar crédito en pantalla ni que
   contamine la licencia del resto.
2. **Todo vendorizado.** Ningún recurso se carga desde una URL externa: el
   juego tiene que funcionar sin internet y sin CDN.
3. **Nombres y arte propios.** Las *mecánicas* de juego no tienen copyright,
   pero los nombres y los personajes sí. Por eso el juego de bombas se llama
   "Bombas" y no como la saga de Hudson Soft, y ningún sprite imita a un
   personaje registrado.
4. **Cada recurso que se añada se apunta en la tabla de arriba**, con su origen
   y su licencia, el mismo día que entra.
