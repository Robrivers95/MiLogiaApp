# Arquitectura breve

`groups/{groupId}/projects/{projectId}` guarda únicamente definición y vínculos del proyecto.

Los movimientos manuales siguen viviendo en `groups/{groupId}/treasury/{entryId}` y llevan `projectId`; por eso Tesorería y Proyectos apuntan al mismo movimiento, no a copias.

Las cuotas extraordinarias vinculadas se leen de ledgers/comprobantes existentes y se presentan como ingresos calculados de solo lectura. El proyecto no modifica esos pagos.
