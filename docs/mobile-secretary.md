# Secretaría simple para celular

Asistencia conserva su navegación y almacenamiento anteriores. Secretaría sigue siendo una adición, con tres vistas: **Grabar**, **Transcripción** e **Informe y tareas**. El formulario anterior permanece detrás de «Guardar, respaldos y más opciones → Importar texto y opciones avanzadas».

## Grabar una reunión

1. Abre **Comunidad → Secretaría y actas** y crea una reunión. Puedes recuperar la última o elegir **Mis reuniones**.
2. Pulsa **Grabar**. **Pausar** detiene temporalmente la captura sin cerrar el archivo; **Continuar** la reanuda. El tiempo de pausa no se suma a la duración grabada ni a las marcas de hablante.
3. **Terminar audio** cierra y guarda ese archivo incluso estando en pausa. Nunca termina automáticamente la reunión ni llama a la IA. Si faltó algo, pulsa **Grabar otro audio**; el primero permanece guardado y el nuevo comienza en el punto siguiente de la línea de tiempo.
4. **Habla → Cambiar** abre una hoja con buscador y miembros activos o presentes. La selección de presentes consulta la asistencia existente; no modifica registros ni mueve el apartado de Asistencia.
5. Los audios y sus reproductores están plegados. Cada archivo se escucha y descarga por separado; no se concatenan contenedores MP4/WebM de forma inválida.

Los subtítulos en vivo son opcionales y dependen del reconocimiento de voz del navegador. Se muestran resultados provisionales mientras se habla, y solo se guardan los finales. El navegador puede usar internet o su proveedor de voz. Esta opción no llama a Gemini. No garantiza funcionamiento offline, compatibilidad en todos los iPhone ni grabación ininterrumpida ante llamadas o cierre de Safari. Ante una interrupción se conserva el tramo y se puede iniciar otro. Antes de una tenida, prueba el iPhone y micrófono reales.

## Un botón para transcribir y preparar el informe

Cuando termines los audios, pulsa **Transcribir y crear informe**. La app sube los archivos finalizados y los envía juntos al servidor. Los archivos ya subidos no se vuelven a subir si conservan el mismo tamaño e identificador.

Una única solicitud de generación a Gemini recibe los audios en orden y devuelve **la transcripción original y los campos del informe**. No se hacen una llamada de transcripción y otra de resumen. Esto reduce solicitudes, pero no significa un token ni una tarifa fija: los datos y tokens dependen de la duración y el plan de Google. No se garantiza que una reunión larga quepa en las cuotas gratuitas.

La app mantiene la transcripción original sin edición, el informe editable y los audios por separado. La transcripción de IA también puede contener errores: el audio es la referencia. El modelo de audio se configura con `GEMINI_AUDIO_MODEL`; por defecto se usa `gemini-3.1-flash-lite`, que tiene nivel gratuito. Las respuestas temporales 503 de Google se muestran como fallo recuperable y no disparan nuevas llamadas de generación por sí solas.

Los informes son borradores y requieren revisión humana. Las tareas de acuerdos se preparan mediante el flujo de confirmación editable existente; procesar audio nunca crea tareas ni movimientos financieros.

Los campos manuales se conservan. El formato del informe se configura en un panel plegado: títulos, instrucciones y puntos de llenado manual. Para modificar solo el informe después de transcribir, usa **Actualizar informe usando solo el texto**, evitando volver a enviar los audios. Si agregas más audio después de procesar, se requiere un nuevo análisis de la grabación completa.

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
