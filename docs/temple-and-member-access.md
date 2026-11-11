## Estado de publicación

La interfaz y el logo ya están publicados. La recuperación permanece desactivada mediante services/features.ts. Tras actualizar IAM, las reglas de Firestore se publicaron correctamente el 20 de octubre de 2026. El siguiente paso fue rechazado por falta de iam.serviceAccounts.actAs sobre registrologia@appspot.gserviceaccount.com para la identidad github-deploy@gen-lang-client-0255480722.iam.gserviceaccount.com. Hace falta el rol Service Account User sobre esa cuenta de ejecución. Las funciones todavía no se han publicado y no se han cambiado contraseñas.

Para activarla: conceder a la identidad de despliegue los permisos de Firebase Rules necesarios y verificar los de Cloud Functions; ejecutar Deploy protected member access y comprobar reglas y ambas funciones; cambiar MEMBER_ACCESS_ENABLED a true y publicar el frontend. El workflow de Hosting verifica las dos funciones antes de publicar cuando la opción está activa. No activar el frontend antes de ese despliegue.

# Identidad masónica y recuperación de acceso

La estructura y navegación de V2 se conservan. La piel visual usa azul legible, acentos dorados, sello G con escuadra y compás y un fondo vectorial tenue con columnas J/B, mampostería, mosaico ajedrezado, vela y calavera. Los adornos son decorativos, no capturan eventos ni incorporan imágenes remotas.

## Logo de cada logia

Admin de la logia y Master pueden pulsar el sello/logo del encabezado, elegir JPG/PNG/WebP y guardar. La imagen se reduce a un máximo de 256 px y se almacena en la propia ficha de la logia, con un límite de 150 KB, evitando un almacenamiento público adicional. Los miembros ven el logo junto al nombre; también aparece en la lista del Master. No se sustituye el icono general de la PWA.

## Recuperar correo y asignar temporal

Gestión de miembros → ficha → Perfil y acciones → Recuperar acceso. El servidor consulta la cuenta de Firebase Auth por su UID y devuelve el correo real vinculado. No recupera ni muestra contraseñas actuales. Admin puede actuar sobre miembros y visores de su logia; Master también puede ayudar a Admin, pero nunca a otra cuenta Master ni a sí mismo desde este flujo. Una ficha temporal sin cuenta debe vincularse primero.

Para restablecer se confirma la identidad del miembro y se vuelve a autenticar al administrador con su propia contraseña. La temporal puede generarse o elegirse (mínimo 10 caracteres con letras y números). Tras asignarla, el administrador puede copiar los datos directamente de la ventana. No se envían mensajes automáticamente, no se guardan contraseñas en perfiles, auditorías, localStorage ni repositorio. El servidor solo conserva el estado del cambio y quién lo solicitó.

Al entrar con la temporal se muestra una pantalla obligatoria para elegir contraseña personal. Las reglas impiden acceder a los datos privados y escribir mientras esté pendiente; el estado no puede cambiarse desde el cliente. El backend actualiza Firebase Auth y revoca las sesiones antiguas. Al finalizar vuelve a autenticarse con la nueva contraseña. Las auditorías no son consultables desde los clientes.

La seguridad adicional bloquea que un miembro se cambie el rol o la logia y que un Admin modifique una cuenta de otra logia. Se elimina el ascenso automático a Master por una comparación de email en el cliente; los Master existentes no se modifican. Las invitaciones temporales con rol privilegiado conservan su ficha y requieren vinculación/aprobación del administrador, sin copiar ni eliminar su historial automáticamente.

## Publicación

El backend se verifica y publica antes de integrar el frontend. El workflow usa la identidad ya configurada en FIREBASE_SERVICE_ACCOUNT2. Publica primero las reglas y solo las nuevas funciones adminMemberAccess y finishMemberPasswordChange, sin volver a desplegar las funciones antiguas de notificaciones. Functions se compila con Node 22. Si esa identidad no tiene permisos para Functions o sus APIs, el workflow debe mostrar el permiso faltante; no se debe afirmar que la recuperación está operativa hasta comprobar su despliegue.

Pruebas: account-recovery.mjs con SDK simulado sin cuentas reales, security-rules.mjs en Firestore Emulator, temple-ui.mjs a 1440/390/320 px, member-access-session-ui.mjs con App real y reautenticación simulada y regresiones existentes de cuotas, evidencias y tesorería.
