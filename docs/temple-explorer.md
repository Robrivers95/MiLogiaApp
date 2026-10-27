# Templo 3D de Aprendiz

**Comunidad → Explorar el templo** abre un recorrido en tercera persona con cámara baja, detrás del hombro. La palanca izquierda permite avanzar, retroceder y desplazarse a los lados. Arrastrar la vista gira la cámara; los botones ↶/↷ permiten girar por pasos. En PC: WASD para caminar, flechas para avanzar/girar y E para abrir la ficha cercana. No es un modo de combate. Ampliar usa pantalla completa cuando el navegador la admite.

El personaje se desplaza continuamente según el tiempo, con colisiones y deslizamiento junto a paredes/mobiliario. No avanza por casillas. La cámara lo sigue y la marcha mueve brazos/piernas. Se detiene al soltar la palanca, perder foco, ocultar la página o abrir una lectura. El motor 3D se carga únicamente al entrar al recorrido; limita resolución y frecuencia para celulares y libera recursos al salir.

## Distribución y contenido

Se utilizó la imagen adjunta como referencia de planta: Oriente elevado, altar central y pavimento, entrada en Occidente, B y J, Secretaría y Elocuencia a los lados de Oriente y los puestos de Vigilancia. La imagen no se publica como fondo porque contiene etiquetas que no se necesitan en el recorrido de Aprendiz. El enlace compartido de Google no era accesible; la imagen adjunta sí se pudo revisar.

La fuente principal es el PDF original «Liturgia de Primer Grado Completa», 101 páginas. Se incorporan doce columnas laterales (seis por lado) con signos zodiacales en los capiteles, las esferas de B/J, piedras, bóveda estrellada, Sol/Luna, altar, tres luces, Mar de Bronce y las figuras Minerva/Sabiduría, Hércules/Fuerza y Venus/Belleza. Las proporciones están adaptadas para caminar y el orden zodiacal por pared es una decisión del mapa: no está fijado por el PDF. No se presentan las constelaciones como si cada una tuviera una enseñanza masónica individual descrita por la liturgia.

Las 26 fichas incluyen referencias a páginas del PDF; las explicaciones fueron redactadas a partir de las secciones de decoración y simbolismo de primer grado (páginas 9–10, 91–93 y 98). La tribuna también explica su relación con Secretaría y las tareas confirmadas de la app. No se importan lecciones de otros grados ni se generan mediante IA. Las palabras, signos y ceremonias no se copian a las fichas: el lector puede consultar el PDF completo de primer grado que el usuario pidió añadir.

## PDF en la app

**Liturgia de Primer Grado · PDF** está en el encabezado del juego, en las fichas (página de referencia) y en Biblioteca. Ofrece visor, abrir en otra pestaña y descarga. Se conserva el original de 756720 bytes, SHA-256 `eca9fa5e4cc9b2028e4d9297ba064006d568a8a74736199ecd0bf06224b0f117`, sin modificar sus páginas. CI verifica el hash antes de publicarlo en `templeStudy/liturgia-primer-grado.pdf` del bucket existente. La app descarga los bytes autenticados y crea un enlace temporal local; no añade un token público al objeto. Las reglas permiten leer ese archivo a usuarios autenticados, impiden escrituras desde clientes y excluyen el prefijo de la regla general de archivos. Esta protección se refiere al acceso desde Storage; la copia del archivo fuente forma parte del repositorio del proyecto.

## Arte

Archivo del juego: `public/temple/virtudes.webp` (291414 bytes). Mural de tres cuadros originales generado con la herramienta incorporada de imágenes y convertido a WebP para la app. No es una fotografía del PDF ni una atribución histórica de autor. Cada tercio se aplica a un marco independiente en el modelo 3D.

Prompt final: «One coherent panoramic triptych mural texture, three equal vertical half-length classical oil-painted portraits: left Minerva fully clothed with bronze helmet and owl, middle Hercules with lion pelt and resting club, right Venus fully clothed in pale rose robes. Matching warm gold lighting and navy backgrounds, recognizable identities, no words, logos, ritual diagrams or nudity.»

## Verificación

- Política: 26 puntos alcanzables con colisiones reales; doce columnas/seis por pared; tres figuras; movimiento continuo, giro, límite de tiempo de fotograma y altura de las gradas.
- Navegador: WebGL2 real con cámara al hombro, movimiento teclado/palanca, giro, neutral al soltar, ficha B con fuente, visor PDF y 320/390/1440 px.
- Emuladores: PDF legible con sesión, anónimo denegado, escritura y escape por regla general denegados; protecciones de audios y comprobantes conservadas.
- Build de producción; prueba real del iPhone/micrófono sigue dependiendo del dispositivo. Si WebGL no está disponible, se informa del problema; el PDF sigue disponible.
