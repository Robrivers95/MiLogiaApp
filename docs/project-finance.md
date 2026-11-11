# Proyectos financieros

El módulo **Proyectos** agrega rentabilidad por evento/proyecto sin crear una segunda Tesorería.

## Fuentes de información

1. **Cuotas extraordinarias vinculadas**
   - Un proyecto puede vincular uno o varios conceptos de cuota extraordinaria.
   - Los ingresos se calculan por miembro/período con el mayor entre el acumulado histórico del ledger y el total de comprobantes aprobados.
   - Esto conserva excedentes reales (por ejemplo, meta $2,000 y aportación $4,000) sin duplicar el mismo dinero si el ledger histórico ya contenía ese excedente.
   - Los comprobantes se muestran como líneas individuales; cualquier parte del ledger que no esté explicada por comprobantes se muestra como `Saldo histórico`.

2. **Movimientos de Tesorería asociados al proyecto**
   - Los gastos e ingresos manuales creados desde Proyectos se guardan en la colección existente `groups/{groupId}/treasury` con `projectId`.
   - También se puede vincular un movimiento de Tesorería ya existente sin copiarlo ni cambiar su monto.
   - Desvincular un movimiento solo quita `projectId`; el movimiento permanece en Tesorería.

## Resultado

`Ingresos totales = cuotas vinculadas + otros ingresos de Tesorería`

`Resultado = ingresos totales - gastos de Tesorería`

El módulo muestra además margen porcentual cuando existen ingresos.

## Evidencia

Los movimientos manuales de proyecto aceptan comentario y múltiples imágenes/PDF. Los archivos se almacenan bajo `groups/{groupId}/project-evidence/{projectId}/...` y las URLs quedan en el movimiento de Tesorería.

## Seguridad

- No migra ni reescribe ledgers de miembros.
- No modifica la Matriz de Pagos.
- No duplica movimientos de Tesorería.
- Los proyectos solo pueden ser escritos por administradores/master según `firestore.rules`.
