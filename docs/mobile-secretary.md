# Secretaría simple para celular

Asistencia conserva su navegación y almacenamiento anteriores. Secretaría sigue siendo una adición, con tres vistas: **Grabar**, **Transcripción** e **Acta y tareas**. El formulario anterior permanece detrás de «Guardar, respaldos y más opciones → Importar texto y opciones avanzadas».

## Grabar una reunión

1. Abre **Comunidad → Secretaría y actas** y crea una reunión. Puedes recuperar la última o elegir **Mis reuniones**.
2. Pulsa **Grabar**. **Pausar** detiene temporalmente la captura sin cerrar el archivo; **Continuar** la reanuda. El tiempo de pausa no se suma a la duración grabada ni a las marcas de hablante.
3. **Terminar audio** cierra y guarda ese archivo incluso estando en pausa. Nunca termina automáticamente la reunión ni llama a la IA. Si faltó algo, pulsa **Grabar otro audio**; el primero permanece guardado y el nuevo comienza en el punto siguiente de la línea de tiempo.
4. **Habla → Cambiar** abre una hoja con buscador y miembros activos o presentes. La selección de presentes consulta la asistencia existente; no modifica registros ni mueve el apartado de Asistencia.
5. Los audios y sus reproductores están plegados. Cada archivo se escucha y descarga por separado; no se concatenan contenedores MP4/WebM de forma inválida.

Los subtítulos en vivo son opcionales y dependen del reconocimiento de voz del navegador. Se muestran resultados provisionales mientras se habla, y solo se guardan los finales. El navegador puede usar internet o su proveedor de voz. Esta opción no llama a Gemini. No garantiza funcionamiento offline, compatibilidad en todos los iPhone ni grabación ininterrumpida ante llamadas o cierre de Safari. Ante una interrupción se conserva el tramo y se puede iniciar otro. Antes de una tenida, prueba el iPhone y micrófono reales.

## Transcripción y resumen en pasos separados

Después de guardar uno o varios audios, pulsa **Transcribir audios**. Los audios finalizados se envían juntos para obtener solo la transcripción literal, sin pedir campos de informe. Puedes continuar con **Grabar otro audio**; los audios nuevos quedan pendientes de transcribir. Para incluirlos, vuelve a transcribir antes de resumir. Los archivos ya subidos no se vuelven a subir, aunque el nuevo análisis sí consume tokens por la grabación completa.

Dentro de **Grabar** y **Transcripción** aparecen dos cuadros de texto: **Transcripción completa** (original de solo lectura) y **Resumen de IA** (vista del acta, inicialmente vacía). Los cuadros tienen desplazamiento interno y se pueden ampliar. No hace falta descargar archivos para leerlos. Los subtítulos finales se conservan en el cuadro de transcripción; los provisionales siguen apareciendo en vivo.

Cuando termine la tenida, pulsa **Terminar tenida** (distinto de Terminar audio). Si está grabando o en pausa, primero cierra y guarda ese archivo. El estado **Tenida terminada** se conserva al recargar. Luego pulsa **Transcribir audios** si hay tramos pendientes; cuando esté lista la transcripción, pulsa **Resumir con IA** y confirma. **Continuar tenida** permite volver a grabar sin perder los audios ni el acta. Esta acción usa únicamente el texto existente para llenar el formato del acta. Cancelar no hace ninguna llamada al modelo. Grabar, pausar, terminar un audio, transcribirlo o abrir un resultado guardado no genera resúmenes nuevos. El resumen no se habilita si quedan audios pendientes de transcribir. Puedes grabar más después de un resumen; el acta anterior permanece visible hasta que solicites otro análisis.

La transcripción y el resumen son dos solicitudes separadas, cada una con su propio consumo. La transcripción por audio sigue usando Gemini; los subtítulos opcionales usan el reconocimiento del navegador. Los datos y tokens dependen de la duración y del plan de Google.

**Revisar acta y tareas** abre los campos editables. Los cambios manuales se reflejan en el cuadro del resumen y se conservan al solicitar otro análisis. Las tareas mantienen la confirmación editable existente; ninguna transcripción o resumen crea tareas automáticamente. Se conservan las descargas independientes del original y del informe.

La transcripción puede tener errores: el audio es la referencia. El formato sigue siendo configurable en el panel plegado. El modelo de audio se configura con `GEMINI_AUDIO_MODEL`; las respuestas temporales de Google se muestran como fallo recuperable sin repetir llamadas automáticamente.

## Recuperación y privacidad

El original del audio se guarda en IndexedDB del dispositivo en fragmentos de cinco segundos. Al procesar, una copia se sube a `meetingAudio/{group}/{owner}/{meeting}/{take}`. Estas copias son privadas de su autor; no se publican enlaces de descarga. Las reglas excluyen ese prefijo del permiso general de archivos existentes y rechazan sobrescrituras. El servidor valida rol de Secretaría/Admin/Master, logia, actividad, suspensión y sesión antes de crear un proceso y otra vez antes de guardar el resultado. Los miembros ordinarios no pueden iniciar análisis de actas.

`meetingAudioService` crea un trabajo privado en `meetingAudioJobs`, y `processMeetingAudio` lo procesa en segundo plano. El cliente solo puede leer su propio resultado siendo Secretario/Admin/Master de esa logia; no puede crear trabajos ni falsificar estados directamente. El primer evento reclama el trabajo mediante una transacción. Las entregas duplicadas y los reintentos del mismo identificador recuperan el resultado guardado sin repetir la generación. No se reintenta automáticamente un error del proveedor. Una repetición explícita avisa que puede consumir datos y tokens.

Las copias temporales de Google Files se eliminan al terminar el intento. Los audios locales y las copias privadas de Storage se conservan. Un informe guardado en la logia incluye texto, no copias binarias de audio. La clave permanece en el servidor.

Límites actuales: 20 audios, 60 MB por archivo, 120 MB o tres horas por análisis; máximo 120,000 caracteres de transcripción y 15 campos. Una respuesta truncada o fuera de formato se marca como error y no se presenta como transcripción completa. Un proceso interrumpido por tiempo se puede reintentar explícitamente después de diez minutos.

## Verificación

- `tests/secretariat-recorder.mjs`: pausa/continuación nativas, fin desde pausa, tiempos sin silencios de pausa, segundo archivo, desconexión, cuota y permisos tardíos.
- `tests/secretariat-audio.mjs` y `secretariat-audio-backend.mjs`: límites, MIME MP4→M4A, turnos, orden de varios audios, evidencia, una generación por trabajo, reintentos, permisos/sesión/suspensión, limpieza y rechazo de respuestas truncadas.
- `tests/secretariat-audio-security.mjs`: emuladores Storage/Firestore, audio privado sin escape por regla general, archivos inmutables, trabajos privados y compatibilidad de comprobantes.
- `tests/secretariat-mobile-ui.mjs`: Chromium con MediaRecorder real y micrófono simulado; controles visibles, subtítulos provisionales, terminar desde pausa, segundo archivo reproducible/descargable, una solicitud para varios audios, originales separados del informe editable y recuperación al recargar.
- `tests/secretariat-audio-live.mjs`: prueba puntual con voz sintética M4A y Google real, sin grabaciones ni datos privados. El workflow solo se dispara al añadir la muestra sintética en la rama de trabajo, o manualmente.

## Si el resumen está deshabilitado

Debajo del botón aparece el motivo y la acción pendiente: terminar el audio/tenida, transcribir o esperar el proceso. Si se perdió la respuesta al enviar la transcripción, **Reconectar transcripción** vuelve a consultar/enviar el mismo identificador; no inicia automáticamente una generación adicional. Las consultas iniciales de metadatos a Storage pueden devolver 404 antes de subir un archivo nuevo; no equivalen por sí solas a una carga fallida. Los errores reales se muestran en la app. Los avisos de Tailwind y registro de service worker no determinan si el resumen está habilitado.
