import fs from 'node:fs';

const replaceOrFail = (text, search, replacement, label) => {
  if (!text.includes(search)) throw new Error(`No se encontró bloque: ${label}`);
  return text.replace(search, replacement);
};

let types = fs.readFileSync('types.ts', 'utf8');
types = replaceOrFail(types,
`  assignedTo?: string; // User UID
  assignedToName?: string; // User name for display
  completed: boolean;`,
`  assignedTo?: string; // User UID (tarea individual legacy)
  assignedToName?: string; // User name for display
  assignmentMode?: 'individual' | 'team';
  assignedToMany?: string[]; // UIDs seleccionados para una tarea de equipo
  assignedToNames?: string[]; // Nombres para mostrar
  batchId?: string; // Agrupa tareas individuales creadas en una sola orden
  completed: boolean;`, 'Task interface');
types = types.replace("export type NotificationType = 'attendance' | 'trivia' | 'notice' | 'profile_edit' | 'payment' | 'payment_receipt';", "export type NotificationType = 'attendance' | 'trivia' | 'notice' | 'profile_edit' | 'payment' | 'payment_receipt' | 'task';");
fs.writeFileSync('types.ts', types);

let dashboard = fs.readFileSync('components/Dashboard.tsx', 'utf8');
dashboard = replaceOrFail(dashboard,
`        // Filter tasks assigned to current user and not completed
        const filtered = allTasks.filter(t => t.assignedTo === user.uid && !t.completed);`,
`        // Individual: one document per member. Team: one shared document visible to every selected member.
        const filtered = allTasks.filter(t => !t.completed && (
          t.assignedTo === user.uid ||
          (t.assignmentMode === 'team' && Array.isArray(t.assignedToMany) && t.assignedToMany.includes(user.uid))
        ));`, 'Dashboard filter');
dashboard = dashboard.replace(
`                <h4 className="font-bold text-white text-sm">{task.title}</h4>`,
`                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-white text-sm">{task.title}</h4>
                  {task.assignmentMode === 'team' && <span className="text-[10px] bg-purple-900/50 text-purple-300 border border-purple-600/40 rounded px-2 py-1">👥 Equipo</span>}
                </div>`);
fs.writeFileSync('components/Dashboard.tsx', dashboard);

let admin = fs.readFileSync('components/Admin.tsx', 'utf8');
admin = replaceOrFail(admin,
`  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);`,
`  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskMode, setNewTaskMode] = useState<'individual' | 'team'>('individual');
  const [newTaskAssignees, setNewTaskAssignees] = useState<Set<string>>(new Set());
  const [editingTask, setEditingTask] = useState<Task | null>(null);`, 'Task state');

const handlerStart = admin.indexOf('  // TASKS HANDLERS');
const handlerEnd = admin.indexOf('  // TRIVIA HANDLERS', handlerStart);
if (handlerStart < 0 || handlerEnd < 0) throw new Error('No se encontró bloque de handlers de tareas');
const handlers = `  // TASKS HANDLERS
  const resetTaskForm = () => {
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskAssignee('');
      setNewTaskAssignees(new Set());
      setNewTaskMode('individual');
      setEditingTask(null);
  };

  const handleSaveTask = async () => {
      if (isReadOnly || !newTaskTitle.trim()) {
          showMessage('El título es obligatorio', 'error');
          return;
      }
      const selectedIds = editingTask
          ? (newTaskAssignee ? [newTaskAssignee] : [])
          : Array.from(newTaskAssignees);
      if (!editingTask && selectedIds.length === 0) {
          showMessage('Selecciona al menos un miembro', 'error');
          return;
      }
      try {
          setIsSubmitting(true);
          if (editingTask) {
              const assignedUser = newTaskAssignee ? users.find(u => u.uid === newTaskAssignee) : undefined;
              await dataService.updateTask(user.groupId, editingTask.id, {
                  title: newTaskTitle.trim(), description: newTaskDesc.trim(),
                  assignedTo: newTaskAssignee || undefined,
                  assignedToName: assignedUser?.name || undefined
              });
              showMessage('Tarea actualizada');
          } else if (newTaskMode === 'team') {
              const selectedUsers = users.filter(u => selectedIds.includes(u.uid));
              await dataService.createTask({
                  groupId: user.groupId, title: newTaskTitle.trim(), description: newTaskDesc.trim(),
                  assignmentMode: 'team', assignedToMany: selectedIds,
                  assignedToNames: selectedUsers.map(u => u.name), completed: false,
                  createdAt: new Date().toISOString(), createdBy: user.uid, createdByName: user.name
              });
              showMessage(`Tarea de equipo creada para ${selectedIds.length} miembros`);
          } else {
              const batchId = `task_batch_${Date.now()}`;
              await Promise.all(selectedIds.map(uid => {
                  const target = users.find(u => u.uid === uid);
                  return dataService.createTask({
                      groupId: user.groupId, title: newTaskTitle.trim(), description: newTaskDesc.trim(),
                      assignmentMode: 'individual', assignedTo: uid, assignedToName: target?.name,
                      batchId, completed: false, createdAt: new Date().toISOString(),
                      createdBy: user.uid, createdByName: user.name
                  });
              }));
              showMessage(`${selectedIds.length} tareas individuales creadas`);
          }
          if (!editingTask && selectedIds.length > 0) {
              try {
                  await notificationService.createNotification(selectedIds, user.groupId, 'task', '✅ Nueva tarea asignada', newTaskTitle.trim());
              } catch (_) {}
          }
          resetTaskForm();
          await loadTasks();
      } catch (e) {
          console.error(e);
          showMessage('Error guardando tarea', 'error');
      } finally { setIsSubmitting(false); }
  };

  const handleToggleTask = async (taskId: string, currentCompleted: boolean) => {
      if (isReadOnly) return;
      try { await dataService.toggleTaskComplete(user.groupId, taskId, !currentCompleted, user.uid); await loadTasks(); }
      catch (e) { console.error(e); showMessage('Error actualizando tarea', 'error'); }
  };

  const handleEditTask = (task: Task) => {
      setEditingTask(task); setNewTaskTitle(task.title); setNewTaskDesc(task.description || '');
      setNewTaskAssignee(task.assignedTo || '');
  };
  const handleDeleteTask = (id: string) => { setDeletingTaskId(id); setShowDeleteTaskModal(true); };
  const handleExecuteDeleteTask = async () => {
      if (isReadOnly || !deletingTaskId) return;
      try { await dataService.deleteTask(user.groupId, deletingTaskId); showMessage('Tarea eliminada'); setShowDeleteTaskModal(false); setDeletingTaskId(null); await loadTasks(); }
      catch (e) { console.error(e); showMessage('Error eliminando tarea', 'error'); }
  };
  const handleCancelEditTask = resetTaskForm;

`;
admin = admin.slice(0, handlerStart) + handlers + admin.slice(handlerEnd);

const uiStart = admin.indexOf("        {activeTab === 'tasks' && (");
const uiEnd = admin.indexOf("        {activeTab === 'treasury' && (", uiStart);
if (uiStart < 0 || uiEnd < 0) throw new Error('No se encontró interfaz de tareas');
const ui = `        {activeTab === 'tasks' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-white">Gestión de Tareas</h3>
            <div className="bg-logia-800 rounded-xl p-5 border border-logia-700 shadow-lg space-y-4">
              <h4 className="font-bold text-white">{editingTask ? 'Editar tarea' : 'Asignar tarea'}</h4>
              <input type="text" placeholder="Título de la tarea *" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} disabled={isReadOnly} className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white font-bold" />
              <textarea placeholder="Descripción (opcional)" value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)} disabled={isReadOnly} rows={3} className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white" />
              {!editingTask ? <>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setNewTaskMode('individual')} className={`p-3 rounded border text-sm font-bold ${newTaskMode === 'individual' ? 'bg-indigo-700 border-indigo-500 text-white' : 'bg-logia-900 border-logia-700 text-gray-300'}`}>👤 Individual masiva</button>
                  <button onClick={() => setNewTaskMode('team')} className={`p-3 rounded border text-sm font-bold ${newTaskMode === 'team' ? 'bg-purple-700 border-purple-500 text-white' : 'bg-logia-900 border-logia-700 text-gray-300'}`}>👥 Tarea de equipo</button>
                </div>
                <p className="text-xs text-gray-400">{newTaskMode === 'individual' ? 'Se creará una tarea independiente para cada miembro seleccionado.' : 'Se creará una sola tarea compartida por todo el equipo seleccionado.'}</p>
                <div className="flex gap-2">
                  <button onClick={() => setNewTaskAssignees(new Set(users.filter(u => u.active && u.role !== 'viewer').map(u => u.uid)))} className="text-xs bg-logia-900 border border-logia-700 px-3 py-2 rounded text-gray-300">Seleccionar todos</button>
                  <button onClick={() => setNewTaskAssignees(new Set())} className="text-xs bg-logia-900 border border-logia-700 px-3 py-2 rounded text-gray-300">Limpiar</button>
                </div>
                <div className="max-h-64 overflow-y-auto bg-logia-900 rounded border border-logia-700 p-2 space-y-1">
                  {users.filter(u => u.active && u.role !== 'viewer').map(u => <label key={u.uid} className="flex items-center gap-3 p-2 hover:bg-logia-800 rounded cursor-pointer"><input type="checkbox" checked={newTaskAssignees.has(u.uid)} onChange={e => { const next = new Set(newTaskAssignees); e.target.checked ? next.add(u.uid) : next.delete(u.uid); setNewTaskAssignees(next); }} className="w-5 h-5 accent-indigo-500" /><span className="text-gray-300">{u.name}</span></label>)}
                </div>
                <p className="text-xs text-indigo-300">{newTaskAssignees.size} miembro(s) seleccionado(s)</p>
              </> : <select value={newTaskAssignee} onChange={e => setNewTaskAssignee(e.target.value)} className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"><option value="">Sin asignar</option>{users.filter(u => u.active && u.role !== 'viewer').map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}</select>}
              <div className="flex gap-3"><button onClick={handleSaveTask} disabled={isReadOnly || isSubmitting} className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded disabled:opacity-50">{isSubmitting ? 'Guardando...' : editingTask ? 'Actualizar tarea' : newTaskMode === 'team' ? 'Crear tarea de equipo' : `Crear ${newTaskAssignees.size} tarea(s)`}</button>{editingTask && <button onClick={handleCancelEditTask} className="flex-1 bg-gray-700 text-white font-bold py-3 rounded">Cancelar</button>}</div>
            </div>
            <div className="bg-logia-800 rounded-xl border border-logia-700 shadow-lg overflow-hidden">
              <div className="p-4 border-b border-logia-700"><h4 className="font-bold text-white">Lista de Tareas ({tasks.filter(t => !t.completed).length} pendientes / {tasks.filter(t => t.completed).length} completadas)</h4></div>
              <div className="p-4 space-y-2">{tasks.length === 0 ? <p className="text-gray-400 text-center py-4">No hay tareas creadas</p> : tasks.map(task => <div key={task.id} className={`${task.completed ? 'bg-logia-900/50' : 'bg-logia-900'} border border-logia-700 p-4 rounded flex items-start gap-3`}><input type="checkbox" checked={task.completed} onChange={() => handleToggleTask(task.id, task.completed)} disabled={isReadOnly} className="mt-1 w-5 h-5" /><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h5 className={`font-bold ${task.completed ? 'text-gray-500 line-through' : 'text-white'}`}>{task.title}</h5>{task.assignmentMode === 'team' && <span className="text-[10px] bg-purple-900/50 text-purple-300 border border-purple-600/40 rounded px-2 py-1">👥 Equipo</span>}</div>{task.description && <p className="text-sm text-gray-400 mt-1">{task.description}</p>}<p className="text-xs text-blue-300 mt-2">{task.assignmentMode === 'team' ? `Equipo: ${(task.assignedToNames || []).join(', ')}` : task.assignedToName ? `👤 ${task.assignedToName}` : 'Sin asignar'}</p></div><div className="flex gap-2"><button onClick={() => handleEditTask(task)} disabled={isReadOnly || task.assignmentMode === 'team'} className="p-2 bg-logia-800 rounded border border-logia-700 disabled:opacity-30">✏️</button><button onClick={() => handleDeleteTask(task.id)} disabled={isReadOnly} className="p-2 bg-red-600 rounded">🗑️</button></div></div>)}</div>
            </div>
          </div>
        )}

`;
admin = admin.slice(0, uiStart) + ui + admin.slice(uiEnd);
fs.writeFileSync('components/Admin.tsx', admin);

let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '3.9.0';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

let layout = fs.readFileSync('components/Layout.tsx', 'utf8');
layout = layout.replace(/v3\.8\.0/g, 'v3.9.0');
fs.writeFileSync('components/Layout.tsx', layout);
console.log('Bulk/team tasks upgrade applied.');
