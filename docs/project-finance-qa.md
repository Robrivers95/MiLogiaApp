# QA — Proyectos financieros

- Crear proyecto sin cuotas vinculadas: balance inicia en $0.
- Crear proyecto vinculado a `Evento Cactus 2`: ingresos usan el mayor entre ledger y comprobantes aprobados por miembro/período.
- Caso meta $2,000 / comprobante $4,000 / ledger $2,000: ingreso del proyecto = $4,000.
- Caso ledger histórico $4,000 / comprobante $4,000: ingreso del proyecto = $4,000, no $8,000.
- Registrar gasto desde Proyectos: aparece en el proyecto y en Tesorería con el mismo documento.
- Vincular movimiento existente: no crea copia ni modifica monto.
- Desvincular movimiento: desaparece del proyecto pero permanece en Tesorería.
- Editar movimiento: conserva comprobantes previos y permite agregar nuevos.
- Matriz de Pagos conserva filtros y vistas existentes; este módulo no modifica su tabla.
