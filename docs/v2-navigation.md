# V2 Beta: navegación y directorio

## Punto de recuperación V1 Beta

La rama `v1-beta` conserva el commit `25ad647ac833df56dac07f2166ba47035b3133c0` que estaba en `main` al iniciar este cambio. No modificar ni fusionar cambios nuevos en esa rama.

V2 Beta está en `feature/v2-intuitive-navigation`. No requiere migraciones de datos, cambios de reglas, ni funciones de Firebase. Los registros de miembros, cuotas, comprobantes y proyectos conservan su formato.

## Organización

- Inicio, Mis pagos, Comunidad, Biblioteca y Gestionar (según permisos) son la navegación principal.
- Comunidad contiene Avisos y Mi asistencia. Perfil, instalación, cambio de Logia para master y cierre de sesión están en el menú superior.
- Gestionar contiene Resumen, Miembros, Finanzas, Organización y Formación. La búsqueda «Ir a una función» encuentra cualquiera de las 17 pantallas administrativas.
- Miembros reúne Directorio, Solicitudes, Crear miembro y Vincular cuenta.
- Finanzas reúne Tesorería, Matriz de pagos, Comprobantes, Cuotas, Proyectos, Bancos y efectivo y Recordatorios.

## Directorio para más de 100 miembros

Búsqueda por nombre, correo, identificador, grado y cargo, sin distinguir acentos; orden por nombre, mayor adeudo o fecha de registro. Páginas de 25, 50 o 100 miembros y columnas financieras opcionales. El historial se abre bajo demanda como antes.

La búsqueda y la paginación solo afectan al directorio. El CSV incluye todos los resultados de la búsqueda, no solamente la página visible. No cambian los filtros ni el alcance de cuotas masivas, matriz o totales. Las consultas de saldos se ejecutan con un máximo de seis operaciones simultáneas; una respuesta anterior no reemplaza los saldos de una consulta más reciente.

Esto reduce filas renderizadas y tiempo de espera secuencial. No implementa paginación de Firestore: la lista de miembros y los saldos siguen cargándose completos; para miles de miembros se necesitaría una segunda fase con consultas y agregados del servidor.

## Publicación y recuperación

Probar V2 con datos conocidos en un canal de preview antes de publicar en live. Un canal de preview comparte el mismo proyecto Firebase: las operaciones guardadas afectan a los mismos datos. Usar una Logia de pruebas para ensayar operaciones de escritura.

Para volver a V1 en Hosting, hacer checkout de `v1-beta`, instalar con `npm ci`, generar con `npm run build` y ejecutar `firebase deploy --only hosting --project registrologia`. Ese procedimiento recupera el código; no restaura datos modificados por los usuarios. El service worker usa una nueva clave de caché en V2 para actualizar la interfaz.

## Validación

Ejecutar `npm run build`, `npm run test:accounting`, `node tests/project-finance-accounting.mjs` y `node tests/run-directory.mjs`.
