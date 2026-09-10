import React, { useEffect, useMemo, useState } from 'react';
import type { FinanceProject, FundSource, TreasuryEntry, User } from '../types';
import { projectFinanceService, type ProjectSnapshot } from '../services/projectFinance';

interface Props {
  user: User;
  readOnly: boolean;
}

const money = (value: number) => value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const today = () => new Date().toISOString().slice(0, 10);

const categoryLabels: Record<string, string> = {
  saco_beneficencia: 'Saco de beneficencia',
  cuota_extra: 'Cuota extra',
  evento: 'Evento',
  donacion: 'Donación',
  gasto_operativo: 'Gasto operativo',
  gasto_social: 'Gasto social',
  compra_material: 'Compra de material',
  otro: 'Otro',
};

const sourceLabels: Record<FundSource, string> = {
  tesoro_general: 'Tesoro general',
  beneficencia: 'Beneficencia',
  cuotas: 'Cuotas',
};

const AdminProjects: React.FC<Props> = ({ user, readOnly }) => {
  const [projects, setProjects] = useState<FinanceProject[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [availableConcepts, setAvailableConcepts] = useState<string[]>([]);
  const [assignableTreasury, setAssignableTreasury] = useState<TreasuryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [showNewProject, setShowNewProject] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newStartDate, setNewStartDate] = useState(today());
  const [newConcepts, setNewConcepts] = useState<string[]>([]);

  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStartDate, setEditStartDate] = useState(today());
  const [editEndDate, setEditEndDate] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'closed'>('active');
  const [editConcepts, setEditConcepts] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const [movementId, setMovementId] = useState<string | undefined>();
  const [movementDate, setMovementDate] = useState(today());
  const [movementType, setMovementType] = useState<'income' | 'expense'>('expense');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementDescription, setMovementDescription] = useState('');
  const [movementCategory, setMovementCategory] = useState<TreasuryEntry['category']>('gasto_operativo');
  const [movementSource, setMovementSource] = useState<FundSource>('tesoro_general');
  const [movementNotes, setMovementNotes] = useState('');
  const [movementFiles, setMovementFiles] = useState<File[]>([]);
  const [treasuryToLink, setTreasuryToLink] = useState('');

  const selectedProject = useMemo(
    () => projects.find(project => project.id === selectedId) || null,
    [projects, selectedId]
  );

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    window.setTimeout(() => setMessage(null), 4500);
  };

  const loadProjects = async (preferredId?: string) => {
    if (!user.groupId) return;
    setLoading(true);
    try {
      const [projectList, concepts] = await Promise.all([
        projectFinanceService.getProjects(user.groupId),
        projectFinanceService.getAvailableExtraConcepts(user.groupId),
      ]);
      setProjects(projectList);
      setAvailableConcepts(concepts);
      const nextId = preferredId || selectedId || projectList[0]?.id || '';
      setSelectedId(projectList.some(project => project.id === nextId) ? nextId : (projectList[0]?.id || ''));
    } catch (error) {
      console.error(error);
      notify('No se pudieron cargar los proyectos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const refreshSelected = async () => {
    if (!selectedProject || !user.groupId) {
      setSnapshot(null);
      setAssignableTreasury([]);
      return;
    }
    setLoading(true);
    try {
      const [nextSnapshot, unassigned] = await Promise.all([
        projectFinanceService.getProjectSnapshot(selectedProject),
        projectFinanceService.getAssignableTreasuryEntries(user.groupId),
      ]);
      setSnapshot(nextSnapshot);
      setAssignableTreasury(unassigned);
    } catch (error) {
      console.error(error);
      notify('No se pudo calcular el balance del proyecto.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [user.groupId]);

  useEffect(() => {
    if (!selectedProject) return;
    setEditName(selectedProject.name);
    setEditDescription(selectedProject.description || '');
    setEditStartDate(selectedProject.startDate || today());
    setEditEndDate(selectedProject.endDate || '');
    setEditStatus(selectedProject.status || 'active');
    setEditConcepts(selectedProject.linkedExtraConcepts || []);
    setShowSettings(false);
    resetMovementForm();
    refreshSelected();
  }, [selectedProject?.id]);

  const toggleConcept = (concept: string, selected: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(selected.includes(concept) ? selected.filter(item => item !== concept) : [...selected, concept]);
  };

  const createProject = async () => {
    if (readOnly || !user.groupId || !newName.trim()) return;
    setSaving(true);
    try {
      const id = await projectFinanceService.createProject({
        groupId: user.groupId,
        name: newName.trim(),
        description: newDescription.trim(),
        status: 'active',
        startDate: newStartDate,
        linkedExtraConcepts: newConcepts,
        createdBy: user.uid,
      });
      setNewName('');
      setNewDescription('');
      setNewStartDate(today());
      setNewConcepts([]);
      setShowNewProject(false);
      await loadProjects(id);
      notify('Proyecto creado. Ya puedes registrar y vincular movimientos.');
    } catch (error: any) {
      notify(error?.message || 'No se pudo crear el proyecto.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveProjectSettings = async () => {
    if (readOnly || !selectedProject || !editName.trim()) return;
    setSaving(true);
    try {
      const updated: FinanceProject = {
        ...selectedProject,
        name: editName.trim(),
        description: editDescription.trim(),
        startDate: editStartDate,
        endDate: editEndDate || undefined,
        status: editStatus,
        linkedExtraConcepts: editConcepts,
      };
      await projectFinanceService.updateProject(updated);
      await loadProjects(updated.id);
      setShowSettings(false);
      notify('Proyecto actualizado.');
    } catch (error: any) {
      notify(error?.message || 'No se pudo actualizar el proyecto.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetMovementForm = () => {
    setMovementId(undefined);
    setMovementDate(today());
    setMovementType('expense');
    setMovementAmount('');
    setMovementDescription('');
    setMovementCategory('gasto_operativo');
    setMovementSource('tesoro_general');
    setMovementNotes('');
    setMovementFiles([]);
  };

  const saveMovement = async () => {
    if (readOnly || !selectedProject) return;
    const amount = Number(movementAmount);
    if (!movementDescription.trim() || !Number.isFinite(amount) || amount <= 0) {
      notify('Indica descripción y un monto mayor a cero.', 'error');
      return;
    }
    setSaving(true);
    try {
      await projectFinanceService.saveProjectTreasuryEntry(
        selectedProject,
        {
          date: movementDate,
          type: movementType,
          category: movementCategory,
          description: movementDescription.trim(),
          amount,
          allocations: [{ source: movementSource, amount }],
          createdBy: user.uid,
          notes: movementNotes.trim() || undefined,
          receiptImageUrls: [],
        },
        movementFiles,
        movementId
      );
      resetMovementForm();
      await refreshSelected();
      notify(movementId ? 'Movimiento actualizado.' : 'Movimiento registrado en Proyecto y Tesorería.');
    } catch (error: any) {
      notify(error?.message || 'No se pudo guardar el movimiento.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const editMovement = (entry: TreasuryEntry) => {
    setMovementId(entry.id);
    setMovementDate(entry.date);
    setMovementType(entry.type);
    setMovementAmount(String(entry.amount));
    setMovementDescription(entry.description);
    setMovementCategory(entry.category);
    setMovementSource(entry.allocations?.[0]?.source || 'tesoro_general');
    setMovementNotes(entry.notes || '');
    setMovementFiles([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteMovement = async (entry: TreasuryEntry) => {
    if (readOnly || !user.groupId) return;
    if (!window.confirm(`¿Eliminar el movimiento "${entry.description}" por ${money(entry.amount)}? También se eliminará de Tesorería.`)) return;
    try {
      await projectFinanceService.deleteProjectTreasuryEntry(user.groupId, entry.id);
      await refreshSelected();
      notify('Movimiento eliminado del proyecto y de Tesorería.');
    } catch (error: any) {
      notify(error?.message || 'No se pudo eliminar el movimiento.', 'error');
    }
  };

  const linkTreasuryEntry = async () => {
    if (readOnly || !selectedProject || !user.groupId || !treasuryToLink) return;
    try {
      await projectFinanceService.assignTreasuryEntry(user.groupId, treasuryToLink, selectedProject);
      setTreasuryToLink('');
      await refreshSelected();
      notify('Movimiento existente vinculado al proyecto.');
    } catch (error: any) {
      notify(error?.message || 'No se pudo vincular el movimiento.', 'error');
    }
  };

  const unlinkTreasuryEntry = async (entry: TreasuryEntry) => {
    if (readOnly || !user.groupId) return;
    try {
      await projectFinanceService.unassignTreasuryEntry(user.groupId, entry.id);
      await refreshSelected();
      notify('Movimiento desvinculado. Sigue existiendo en Tesorería.');
    } catch (error: any) {
      notify(error?.message || 'No se pudo desvincular.', 'error');
    }
  };

  const exportCsv = () => {
    if (!selectedProject || !snapshot) return;
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Fecha', 'Tipo', 'Origen', 'Concepto', 'Descripción / miembro', 'Monto', 'Notas'].map(escape).join(','),
      ...snapshot.linkedIncomeRows.map(line => [
        line.date,
        'Ingreso',
        line.source === 'receipt' ? 'Comprobante de cuota' : 'Ledger histórico',
        line.concept,
        `${line.memberName} · ${line.period}`,
        line.amount.toFixed(2),
        line.note || '',
      ].map(escape).join(',')),
      ...snapshot.treasuryEntries.map(entry => [
        entry.date,
        entry.type === 'income' ? 'Ingreso' : 'Gasto',
        'Tesorería',
        categoryLabels[entry.category] || entry.category,
        entry.description,
        entry.amount.toFixed(2),
        entry.notes || '',
      ].map(escape).join(',')),
    ];
    const blob = new Blob(['\uFEFF', rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `proyecto-${selectedProject.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const summary = snapshot?.summary;

  return (
    <div className="space-y-6">
      {message && (
        <div className={`fixed right-4 top-20 z-[140] max-w-md rounded-lg border p-3 shadow-xl ${message.type === 'success' ? 'border-green-600 bg-green-900 text-green-100' : 'border-red-600 bg-red-900 text-red-100'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-logia-800 border border-logia-700 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-white">📁 Proyectos</h3>
            <p className="text-sm text-gray-400 mt-1">Rentabilidad por evento o proyecto, combinando cuotas vinculadas y movimientos reales de Tesorería.</p>
          </div>
          {!readOnly && (
            <button onClick={() => setShowNewProject(value => !value)} className="px-4 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-sm">
              {showNewProject ? 'Cerrar' : '＋ Nuevo proyecto'}
            </button>
          )}
        </div>

        {showNewProject && (
          <div className="mt-5 border border-indigo-700/50 rounded-lg p-4 bg-logia-900/60 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs text-gray-400 font-bold uppercase">Nombre</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej. Evento Cactus 2" className="w-full mt-1 bg-logia-800 border border-logia-700 rounded px-3 py-2 text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-bold uppercase">Fecha inicio</label>
                <input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} className="w-full mt-1 bg-logia-800 border border-logia-700 rounded px-3 py-2 text-white" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 font-bold uppercase">Descripción</label>
              <textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} className="w-full mt-1 bg-logia-800 border border-logia-700 rounded px-3 py-2 text-white" rows={2} />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-bold uppercase mb-2">Cuotas extraordinarias que alimentan los ingresos</p>
              <div className="flex flex-wrap gap-2">
                {availableConcepts.length === 0 && <span className="text-xs text-gray-500">No se encontraron conceptos de cuota extraordinaria todavía.</span>}
                {availableConcepts.map(concept => (
                  <button key={concept} type="button" onClick={() => toggleConcept(concept, newConcepts, setNewConcepts)} className={`px-3 py-1.5 rounded-full text-xs border ${newConcepts.includes(concept) ? 'bg-purple-700 border-purple-500 text-white' : 'bg-logia-800 border-logia-700 text-gray-300'}`}>
                    {newConcepts.includes(concept) ? '✓ ' : '＋ '}{concept}
                  </button>
                ))}
              </div>
            </div>
            <button disabled={saving || !newName.trim()} onClick={createProject} className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 rounded text-white font-bold text-sm">Crear proyecto</button>
          </div>
        )}
      </div>

      {projects.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {projects.map(project => (
            <button key={project.id} onClick={() => setSelectedId(project.id)} className={`min-w-[190px] text-left rounded-xl border p-3 ${selectedId === project.id ? 'bg-indigo-900/60 border-indigo-500' : 'bg-logia-800 border-logia-700 hover:border-logia-600'}`}>
              <div className="font-bold text-white truncate">{project.name}</div>
              <div className="text-[11px] text-gray-400 mt-1">{project.status === 'active' ? '🟢 Activo' : '⚪ Cerrado'} · {project.startDate}</div>
              <div className="text-[11px] text-purple-300 mt-1 truncate">{project.linkedExtraConcepts?.length ? `${project.linkedExtraConcepts.length} cuota(s) vinculada(s)` : 'Sin cuotas vinculadas'}</div>
            </button>
          ))}
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div className="bg-logia-800 border border-logia-700 rounded-xl p-8 text-center text-gray-400">
          <div className="text-4xl mb-3">📁</div>
          <p className="font-bold text-white">Todavía no hay proyectos financieros.</p>
          <p className="text-sm mt-1">Crea uno y vincula, por ejemplo, la cuota extraordinaria “Evento Cactus 2”.</p>
        </div>
      )}

      {selectedProject && (
        <>
          <div className="bg-logia-800 border border-logia-700 rounded-xl p-5">
            <div className="flex flex-wrap justify-between items-start gap-3">
              <div>
                <h4 className="text-xl font-bold text-white">{selectedProject.name}</h4>
                {selectedProject.description && <p className="text-sm text-gray-400 mt-1">{selectedProject.description}</p>}
                <div className="flex flex-wrap gap-2 mt-2">
                  {(selectedProject.linkedExtraConcepts || []).map(concept => <span key={concept} className="text-xs bg-purple-900/50 border border-purple-700 rounded-full px-2 py-1 text-purple-200">⭐ {concept}</span>)}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={exportCsv} disabled={!snapshot} className="px-3 py-2 bg-green-800 hover:bg-green-700 disabled:opacity-40 rounded text-white text-xs font-bold">📥 CSV</button>
                {!readOnly && <button onClick={() => setShowSettings(value => !value)} className="px-3 py-2 bg-logia-700 hover:bg-logia-600 rounded text-white text-xs font-bold">⚙️ Configurar</button>}
                <button onClick={refreshSelected} className="px-3 py-2 bg-logia-700 hover:bg-logia-600 rounded text-white text-xs font-bold">🔄</button>
              </div>
            </div>

            {showSettings && (
              <div className="mt-4 border-t border-logia-700 pt-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input value={editName} onChange={e => setEditName(e.target.value)} className="md:col-span-2 bg-logia-900 border border-logia-700 rounded px-3 py-2 text-white" />
                  <input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} className="bg-logia-900 border border-logia-700 rounded px-3 py-2 text-white" />
                  <select value={editStatus} onChange={e => setEditStatus(e.target.value as 'active' | 'closed')} className="bg-logia-900 border border-logia-700 rounded px-3 py-2 text-white"><option value="active">Activo</option><option value="closed">Cerrado</option></select>
                </div>
                <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={2} className="w-full bg-logia-900 border border-logia-700 rounded px-3 py-2 text-white" placeholder="Descripción" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400">Fecha fin opcional</label>
                    <input type="date" value={editEndDate} onChange={e => setEditEndDate(e.target.value)} className="w-full mt-1 bg-logia-900 border border-logia-700 rounded px-3 py-2 text-white" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableConcepts.map(concept => <button key={concept} type="button" onClick={() => toggleConcept(concept, editConcepts, setEditConcepts)} className={`px-3 py-1.5 rounded-full text-xs border ${editConcepts.includes(concept) ? 'bg-purple-700 border-purple-500 text-white' : 'bg-logia-900 border-logia-700 text-gray-300'}`}>{editConcepts.includes(concept) ? '✓ ' : '＋ '}{concept}</button>)}
                </div>
                <button disabled={saving || !editName.trim()} onClick={saveProjectSettings} className="px-4 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 rounded text-white text-sm font-bold">Guardar configuración</button>
              </div>
            )}
          </div>

          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="bg-logia-800 border border-logia-700 rounded-xl p-4"><div className="text-[11px] uppercase text-gray-500">Cuotas vinculadas</div><div className="text-xl font-bold text-purple-300 mt-1">{money(summary.linkedIncome)}</div></div>
              <div className="bg-logia-800 border border-logia-700 rounded-xl p-4"><div className="text-[11px] uppercase text-gray-500">Otros ingresos</div><div className="text-xl font-bold text-green-300 mt-1">{money(summary.manualIncome)}</div></div>
              <div className="bg-logia-800 border border-logia-700 rounded-xl p-4"><div className="text-[11px] uppercase text-gray-500">Ingresos totales</div><div className="text-xl font-bold text-green-400 mt-1">{money(summary.totalIncome)}</div></div>
              <div className="bg-logia-800 border border-logia-700 rounded-xl p-4"><div className="text-[11px] uppercase text-gray-500">Gastos</div><div className="text-xl font-bold text-red-300 mt-1">{money(summary.expenses)}</div></div>
              <div className={`border rounded-xl p-4 ${summary.balance >= 0 ? 'bg-green-950/50 border-green-700' : 'bg-red-950/50 border-red-700'}`}><div className="text-[11px] uppercase text-gray-400">Resultado</div><div className={`text-xl font-bold mt-1 ${summary.balance >= 0 ? 'text-green-300' : 'text-red-300'}`}>{money(summary.balance)}</div><div className="text-[10px] text-gray-400 mt-1">{summary.balance > 0 ? 'Ganancia' : summary.balance < 0 ? 'Pérdida' : 'Punto de equilibrio'}{summary.marginPct !== null ? ` · ${summary.marginPct.toFixed(1)}%` : ''}</div></div>
            </div>
          )}

          {!readOnly && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="bg-logia-800 border border-logia-700 rounded-xl p-5 space-y-3">
                <div className="flex justify-between items-center"><h4 className="font-bold text-white">{movementId ? '✏️ Editar movimiento' : '＋ Registrar movimiento del proyecto'}</h4>{movementId && <button onClick={resetMovementForm} className="text-xs text-gray-400 underline">Cancelar edición</button>}</div>
                <p className="text-xs text-gray-500">Este movimiento también aparecerá en Tesorería. No necesita estar ligado a un miembro.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-400">Fecha</label><input type="date" value={movementDate} onChange={e => setMovementDate(e.target.value)} className="w-full mt-1 bg-logia-900 border border-logia-700 rounded px-3 py-2 text-white" /></div>
                  <div><label className="text-xs text-gray-400">Tipo</label><select value={movementType} onChange={e => setMovementType(e.target.value as 'income' | 'expense')} className="w-full mt-1 bg-logia-900 border border-logia-700 rounded px-3 py-2 text-white"><option value="expense">🔴 Gasto</option><option value="income">🟢 Ingreso adicional</option></select></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-400">Monto</label><input type="number" min="0" step="0.01" value={movementAmount} onChange={e => setMovementAmount(e.target.value)} className="w-full mt-1 bg-logia-900 border border-logia-700 rounded px-3 py-2 text-white" placeholder="0.00" /></div>
                  <div><label className="text-xs text-gray-400">Origen/destino de fondos</label><select value={movementSource} onChange={e => setMovementSource(e.target.value as FundSource)} className="w-full mt-1 bg-logia-900 border border-logia-700 rounded px-3 py-2 text-white"><option value="tesoro_general">Tesoro general</option><option value="cuotas">Cuotas</option><option value="beneficencia">Beneficencia</option></select></div>
                </div>
                <div><label className="text-xs text-gray-400">Descripción</label><input value={movementDescription} onChange={e => setMovementDescription(e.target.value)} className="w-full mt-1 bg-logia-900 border border-logia-700 rounded px-3 py-2 text-white" placeholder="Ej. Renta de salón, venta de boletos, decoración..." /></div>
                <div><label className="text-xs text-gray-400">Categoría</label><select value={movementCategory} onChange={e => setMovementCategory(e.target.value as TreasuryEntry['category'])} className="w-full mt-1 bg-logia-900 border border-logia-700 rounded px-3 py-2 text-white">{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div><label className="text-xs text-gray-400">Comentario / detalle</label><textarea value={movementNotes} onChange={e => setMovementNotes(e.target.value)} rows={2} className="w-full mt-1 bg-logia-900 border border-logia-700 rounded px-3 py-2 text-white" placeholder="Proveedor, referencia, motivo, aclaración..." /></div>
                <div><label className="text-xs text-gray-400">Comprobantes opcionales</label><input type="file" multiple accept="image/*,application/pdf" onChange={e => setMovementFiles(Array.from(e.target.files || []))} className="w-full mt-1 text-xs text-gray-300" />{movementFiles.length > 0 && <div className="text-[11px] text-gray-500 mt-1">{movementFiles.length} archivo(s) seleccionado(s)</div>}</div>
                <button disabled={saving} onClick={saveMovement} className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 rounded text-white font-bold">{movementId ? 'Guardar cambios' : 'Registrar en Proyecto y Tesorería'}</button>
              </div>

              <div className="bg-logia-800 border border-logia-700 rounded-xl p-5 space-y-3">
                <h4 className="font-bold text-white">🔗 Vincular un movimiento que ya existe en Tesorería</h4>
                <p className="text-xs text-gray-500">No crea otro movimiento ni cambia su monto; solo lo asocia a este proyecto para incluirlo en el balance.</p>
                <select value={treasuryToLink} onChange={e => setTreasuryToLink(e.target.value)} className="w-full bg-logia-900 border border-logia-700 rounded px-3 py-2 text-white text-sm">
                  <option value="">Selecciona un movimiento...</option>
                  {assignableTreasury.map(entry => <option key={entry.id} value={entry.id}>{entry.date} · {entry.type === 'income' ? '+' : '-'}{money(entry.amount)} · {entry.description}</option>)}
                </select>
                <button disabled={!treasuryToLink} onClick={linkTreasuryEntry} className="px-4 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 rounded text-white font-bold text-sm">Vincular sin duplicar</button>
                {assignableTreasury.length === 0 && <div className="text-xs text-gray-500">No hay movimientos manuales de Tesorería sin proyecto.</div>}
              </div>
            </div>
          )}

          <div className="bg-logia-800 border border-logia-700 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-logia-700"><h4 className="font-bold text-white">💰 Ingresos provenientes de cuotas vinculadas</h4><p className="text-xs text-gray-500 mt-1">Los comprobantes muestran el monto real recibido; si un acumulado histórico es mayor que sus comprobantes, la diferencia se identifica como saldo histórico.</p></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-logia-900 text-gray-400 text-xs uppercase"><tr><th className="p-3 text-left">Fecha</th><th className="p-3 text-left">Miembro</th><th className="p-3 text-left">Concepto</th><th className="p-3 text-left">Origen</th><th className="p-3 text-right">Ingreso</th><th className="p-3 text-center">Evidencia</th></tr></thead>
                <tbody>
                  {(snapshot?.linkedIncomeRows || []).map(line => <tr key={line.id} className="border-t border-logia-700/70"><td className="p-3 text-gray-300 whitespace-nowrap">{line.date}</td><td className="p-3 text-white">{line.memberName}<div className="text-[10px] text-gray-500">{line.period}</div></td><td className="p-3 text-purple-200">{line.concept}</td><td className="p-3 text-gray-400">{line.source === 'receipt' ? '🧾 Comprobante' : '📚 Histórico'}</td><td className="p-3 text-right font-bold text-green-300">{money(line.amount)}</td><td className="p-3 text-center">{line.receiptUrls.length ? <div className="flex justify-center gap-1">{line.receiptUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-300 underline">{index + 1}</a>)}</div> : <span className="text-gray-600">—</span>}{line.note && <div title={line.note} className="text-[10px] text-gray-500 mt-1 max-w-[140px] truncate">{line.note}</div>}</td></tr>)}
                  {!loading && (snapshot?.linkedIncomeRows.length || 0) === 0 && <tr><td colSpan={6} className="p-6 text-center text-gray-500">No hay ingresos registrados para los conceptos vinculados.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-logia-800 border border-logia-700 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-logia-700"><h4 className="font-bold text-white">🏦 Movimientos del proyecto en Tesorería</h4><p className="text-xs text-gray-500 mt-1">Incluye movimientos creados desde aquí y movimientos existentes que hayas vinculado.</p></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-logia-900 text-gray-400 text-xs uppercase"><tr><th className="p-3 text-left">Fecha</th><th className="p-3 text-left">Tipo</th><th className="p-3 text-left">Descripción</th><th className="p-3 text-left">Fondos</th><th className="p-3 text-right">Monto</th><th className="p-3 text-center">Comprobante</th><th className="p-3 text-right">Acciones</th></tr></thead>
                <tbody>
                  {(snapshot?.treasuryEntries || []).map(entry => <tr key={entry.id} className="border-t border-logia-700/70"><td className="p-3 text-gray-300 whitespace-nowrap">{entry.date}</td><td className={`p-3 font-bold ${entry.type === 'income' ? 'text-green-300' : 'text-red-300'}`}>{entry.type === 'income' ? 'Ingreso' : 'Gasto'}</td><td className="p-3 text-white">{entry.description}{entry.notes && <div className="text-[10px] text-gray-500 mt-1">{entry.notes}</div>}</td><td className="p-3 text-gray-400">{sourceLabels[entry.allocations?.[0]?.source || 'tesoro_general']}</td><td className={`p-3 text-right font-bold ${entry.type === 'income' ? 'text-green-300' : 'text-red-300'}`}>{entry.type === 'income' ? '+' : '-'}{money(entry.amount)}</td><td className="p-3 text-center">{entry.receiptImageUrls?.length ? <div className="flex justify-center gap-1">{entry.receiptImageUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-300 underline">{index + 1}</a>)}</div> : '—'}</td><td className="p-3"><div className="flex justify-end gap-2">{!readOnly && <><button onClick={() => editMovement(entry)} className="text-xs text-blue-300">Editar</button><button onClick={() => unlinkTreasuryEntry(entry)} className="text-xs text-yellow-300">Desvincular</button><button onClick={() => deleteMovement(entry)} className="text-xs text-red-300">Eliminar</button></>}</div></td></tr>)}
                  {!loading && (snapshot?.treasuryEntries.length || 0) === 0 && <tr><td colSpan={7} className="p-6 text-center text-gray-500">Todavía no hay gastos ni ingresos manuales asociados al proyecto.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {loading && <div className="text-center text-gray-500 py-3">Calculando proyecto…</div>}
    </div>
  );
};

export default AdminProjects;
