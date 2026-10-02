export const adminAreas = [
  { id: 'overview', label: 'Resumen', items: [
    { id: 'dashboard', label: 'Resumen', description: 'Ingresos, egresos y pendientes de la Logia.' },
  ] },
  { id: 'members', label: 'Miembros', items: [
    { id: 'users', label: 'Directorio', description: 'Busca miembros y consulta su estado e historial.' },
    { id: 'requests', label: 'Solicitudes', description: 'Revisa las solicitudes de ingreso pendientes.' },
    { id: 'create-user', label: 'Crear miembro', description: 'Registra un miembro aunque todavía no tenga cuenta.' },
    { id: 'manual-merge', label: 'Vincular cuenta', description: 'Asocia un miembro existente con su usuario real y conserva su historial.' },
  ] },
  { id: 'finance', label: 'Finanzas', items: [
    { id: 'treasury', label: 'Tesorería', description: 'Registra y consulta ingresos, egresos y asignaciones.' },
    { id: 'payment-matrix', label: 'Matriz de pagos', description: 'Consulta pagos por miembro, período y concepto.' },
    { id: 'receipts', label: 'Comprobantes', description: 'Revisa, aprueba y consulta la evidencia de pago.' },
    { id: 'fees', label: 'Cuotas', description: 'Configura cuotas mensuales y extraordinarias.' },
    { id: 'projects', label: 'Proyectos', description: 'Controla aportaciones, gastos y resultados de cada proyecto.' },
    { id: 'banks', label: 'Bancos y efectivo', description: 'Consulta y actualiza saldos bancarios y de caja.' },
    { id: 'debt-notify', label: 'Recordatorios', description: 'Prepara avisos de adeudo para los miembros.' },
  ] },
  { id: 'organization', label: 'Organización', items: [
    { id: 'attendance', label: 'Asistencia', description: 'Registra reuniones y consulta la asistencia.' },
    { id: 'notices', label: 'Avisos', description: 'Publica comunicados para la Logia.' },
    { id: 'tasks', label: 'Tareas', description: 'Organiza tareas individuales y de equipo.' },
    { id: 'visits', label: 'Visitas', description: 'Coordina visitas y conversaciones entre logias.' },
  ] },
  { id: 'learning', label: 'Formación', items: [
    { id: 'trivia', label: 'Trivia', description: 'Administra preguntas y actividades de formación. La biblioteca está en la navegación principal.' },
  ] },
] as const;
export type AdminTab = typeof adminAreas[number]['items'][number]['id'];
export const findAdminArea = (tab: AdminTab) => adminAreas.find(area => area.items.some(item => item.id === tab))!;
