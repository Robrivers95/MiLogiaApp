
import React, { useState, useEffect } from 'react';
import { Group } from '../types';
import { dataService, authService } from '../services/api';

interface Props {
  onSelectGroup: (group: Group) => void;
  onLogout: () => void;
}

const MasterDashboard: React.FC<Props> = ({ onSelectGroup, onLogout }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create State
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit State
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete State
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [togglingGroupId, setTogglingGroupId] = useState<string | null>(null);

  // App Icon State
  const [showIconConfig, setShowIconConfig] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [currentIcon, setCurrentIcon] = useState<string | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    setLoading(true);
    const data = await dataService.getAllGroups();
    setGroups(data);
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await dataService.createGroup(newName, newDesc);
      setNewName('');
      setNewDesc('');
      setShowCreate(false);
      await loadGroups();
    } catch (error: any) {
      alert("Error creando logia: " + error.message);
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (g: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGroup(g);
    setEditName(g.name);
    setEditDesc(g.description || '');
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup || !editName.trim()) return;
    setSavingEdit(true);
    try {
      await dataService.updateGroup(editingGroup.id, {
        name: editName,
        description: editDesc
      });
      setEditingGroup(null);
      await loadGroups();
    } catch (e: any) {
      alert("Error actualizando la logia");
    } finally {
      setSavingEdit(false);
    }
  };

  const openDeleteModal = (g: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingGroup(g);
    setDeleteConfirmText('');
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deletingGroup || deleteConfirmText !== 'BORRAR') return;
    try {
      await dataService.deleteGroup(deletingGroup.id);
      setShowDeleteModal(false);
      setDeletingGroup(null);
      setDeleteConfirmText('');
      await loadGroups();
    } catch (e: any) {
      alert("Error eliminando logia: " + e.message);
    }
  };

  const handleToggleGroupStatus = async (group: Group, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = !(group.active !== false);
    setTogglingGroupId(group.id);
    try {
      await dataService.toggleGroupStatus(group.id, newStatus);
      await loadGroups();
    } catch (err: any) {
      alert("Error cambiando estado: " + err.message);
    } finally {
      setTogglingGroupId(null);
    }
  };

  const loadCurrentIcon = async () => {
    try {
      const iconUrl = await authService.getAppIcon('192');
      setCurrentIcon(iconUrl);
    } catch (e) {
      console.error("Error loading icon:", e);
    }
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona una imagen');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('La imagen debe ser menor a 2MB');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setIconPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    setUploadingIcon(true);
    try {
      // Upload as PNG for 192 and 512
      await authService.uploadAppIcon(file, '192');
      await authService.uploadAppIcon(file, '512');
      
      alert('✅ Icono actualizado exitosamente. Los usuarios verán el nuevo icono al reinstalar la app.');
      await loadCurrentIcon();
      setIconPreview(null);
    } catch (e: any) {
      alert('Error subiendo icono: ' + e.message);
    } finally {
      setUploadingIcon(false);
    }
  };

  useEffect(() => {
    if (showIconConfig) {
      loadCurrentIcon();
    }
  }, [showIconConfig]);
  return (
    <div className="min-h-screen bg-logia-900 p-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <header className="flex justify-between items-center border-b border-logia-700 pb-4">
          <div className="flex flex-col">
            <h1 className="text-3xl font-bold text-white">Panel Maestro</h1>
            <p className="text-indigo-400 text-sm">Administración Multi-Logia</p>
          </div>
          <button onClick={onLogout} className="text-gray-400 hover:text-white border border-gray-600 px-4 py-2 rounded">
            Cerrar Sesión
          </button>
        </header>

        <div className="flex justify-end gap-3">
          <button 
            onClick={() => setShowIconConfig(!showIconConfig)}
            className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded shadow-lg transition-transform active:scale-95"
          >
            {showIconConfig ? 'Cerrar Configuración' : '📱 Configurar App'}
          </button>
          <button 
            onClick={() => setShowCreate(!showCreate)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded shadow-lg transition-transform active:scale-95"
          >
            {showCreate ? 'Cancelar' : '+ Nueva Logia'}
          </button>
        </div>

        {showCreate && (
          <div className="bg-logia-800 p-6 rounded-xl border border-logia-700 shadow-2xl animate-fade-in-down">
            <h3 className="text-xl font-bold text-white mb-4">Fundar Nueva Logia</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-gray-400 text-xs uppercase mb-1">Nombre de la Logia</label>
                <input 
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Ej. Jose Eleuterio Gonzalez #24"
                  className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-gray-400 text-xs uppercase mb-1">Descripción / Lema</label>
                <input 
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Ej. Libertad, Igualdad, Fraternidad"
                  className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                />
              </div>
              <button 
                type="submit"
                disabled={creating}
                className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded disabled:opacity-50"
              >
                {creating ? 'Creando...' : 'Crear Logia'}
              </button>
            </form>
          </div>
        )}

        {showIconConfig && (
          <div className="bg-logia-800 p-6 rounded-xl border border-logia-700 shadow-2xl animate-fade-in-down">
            <h3 className="text-xl font-bold text-white mb-4">📱 Configuración del Icono de la App</h3>
            
            <div className="bg-blue-900/30 border border-blue-600/50 rounded-lg p-4 mb-6">
              <p className="text-blue-200 text-sm">
                ℹ️ El icono se mostrará cuando los usuarios instalen la aplicación en sus dispositivos móviles.
                Se recomienda usar una imagen cuadrada de al menos 512x512 píxeles.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-gray-400 text-xs uppercase mb-3">Icono Actual</label>
                <div className="bg-logia-900 border-2 border-logia-700 rounded-xl p-6 flex items-center justify-center h-48">
                  {currentIcon ? (
                    <img src={currentIcon} alt="App Icon" className="max-w-full max-h-full object-contain rounded-xl" />
                  ) : (
                    <div className="text-center">
                      <p className="text-gray-500 text-sm">Sin icono personalizado</p>
                      <p className="text-gray-600 text-xs mt-1">Se usa el icono por defecto</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-gray-400 text-xs uppercase mb-3">Nueva Imagen</label>
                <div className="bg-logia-900 border-2 border-dashed border-logia-700 rounded-xl p-6 flex items-center justify-center h-48">
                  {iconPreview ? (
                    <img src={iconPreview} alt="Preview" className="max-w-full max-h-full object-contain rounded-xl" />
                  ) : (
                    <div className="text-center">
                      <p className="text-gray-500 text-sm">Vista previa</p>
                      <p className="text-gray-600 text-xs mt-1">Selecciona una imagen abajo</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <input
                type="file"
                accept="image/*"
                onChange={handleIconUpload}
                disabled={uploadingIcon}
                className="hidden"
                id="icon-upload"
              />
              <label
                htmlFor="icon-upload"
                className={`block w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded cursor-pointer transition-colors ${
                  uploadingIcon ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {uploadingIcon ? '⏳ Subiendo icono...' : '📤 Seleccionar y Subir Icono'}
              </label>
              <p className="text-gray-500 text-xs mt-2 text-center">
                Formatos aceptados: JPG, PNG, SVG | Tamaño máximo: 2MB
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-400 py-10">Cargando Oriente...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {groups.length === 0 ? (
              <div className="col-span-2 text-center bg-logia-800/50 p-8 rounded-xl border border-dashed border-gray-600 text-gray-400">
                No hay logias registradas. Crea la primera.
              </div>
            ) : (
              groups.map(group => (
                <div 
                  key={group.id}
                  onClick={() => onSelectGroup(group)}
                  className={`bg-logia-800 p-6 rounded-xl border shadow-lg hover:bg-logia-700 cursor-pointer transition-all group relative overflow-hidden ${group.active === false ? 'border-red-700/60' : 'border-logia-700'}`}
                >
                  <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 text-6xl pointer-events-none">
                    🏛️
                  </div>
                  {group.active === false && (
                    <div className="bg-red-900/40 border border-red-700/50 text-red-300 text-xs font-bold px-3 py-1 rounded mb-3 inline-block">
                      ⛔ SUSPENDIDA
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-white mb-2">{group.name}</h3>
                  <p className="text-gray-400 text-sm mb-4">{group.description || 'Sin descripción'}</p>
                  <div className="flex justify-between items-center mt-4">
                    <span className="text-xs text-gray-500 uppercase tracking-wider">ID: {group.id.slice(0,8)}...</span>
                    <div className="flex gap-2 flex-wrap">
                      <button 
                        onClick={(e) => handleToggleGroupStatus(group, e)}
                        disabled={togglingGroupId === group.id}
                        className={`${group.active === false ? 'bg-green-900 hover:bg-green-800 text-green-300 border-green-700' : 'bg-yellow-900 hover:bg-yellow-800 text-yellow-300 border-yellow-700'} px-3 py-1 rounded-full text-xs font-bold border z-10 disabled:opacity-50`}
                      >
                        {togglingGroupId === group.id ? '⏳' : group.active === false ? '✅ Activar' : '⏸️ Suspender'}
                      </button>
                      <button 
                        onClick={(e) => openEditModal(group, e)}
                        className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1 rounded-full text-xs font-bold border border-gray-600 z-10"
                      >
                        ✏️ Editar
                      </button>
                      <button 
                        onClick={(e) => openDeleteModal(group, e)}
                        className="bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1 rounded-full text-xs font-bold border border-red-700 z-10"
                      >
                        🗑️ Eliminar
                      </button>
                      <span className="bg-indigo-900 text-indigo-200 px-3 py-1 rounded-full text-xs font-bold">
                        Entrar &rarr;
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* EDIT MODAL */}
      {editingGroup && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-logia-800 w-full max-w-md rounded-xl border border-logia-700 shadow-2xl p-6 relative">
            <button onClick={() => setEditingGroup(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white">✕</button>
            <h3 className="text-xl font-bold text-white mb-4">Editar Logia</h3>
            
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-gray-400 text-xs uppercase mb-1">Nombre</label>
                <input 
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-gray-400 text-xs uppercase mb-1">Descripción / Lema</label>
                <input 
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setEditingGroup(null)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={savingEdit}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded disabled:opacity-50"
                >
                  {savingEdit ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE MODAL CON CONFIRMACIÓN SEGURA */}
      {showDeleteModal && deletingGroup && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-logia-800 w-full max-w-md rounded-xl border border-red-700 shadow-2xl p-6 relative">
            <button onClick={() => setShowDeleteModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">✕</button>
            <h3 className="text-xl font-bold text-red-400 mb-4">⚠️ Eliminar Logia</h3>
            
            <div className="bg-red-900/20 border border-red-700 p-4 rounded mb-4">
              <p className="text-red-200 text-sm mb-2">
                Estás a punto de eliminar la logia:
              </p>
              <p className="text-white font-bold text-lg">{deletingGroup.name}</p>
            </div>

            <p className="text-gray-300 text-sm mb-4">
              Esta acción es <strong className="text-red-400">IRREVERSIBLE</strong>. Se eliminarán todos los datos asociados.
            </p>

            <div className="mb-4">
              <label className="block text-gray-400 text-xs uppercase mb-2">
                Para confirmar, escribe la palabra: <span className="text-red-400 font-bold">BORRAR</span>
              </label>
              <input 
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value.toUpperCase())}
                placeholder="Escribe: BORRAR"
                className="w-full bg-logia-900 border border-red-700 rounded p-3 text-white focus:ring-2 focus:ring-red-500 outline-none"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded"
              >
                Cancelar
              </button>
              <button 
                onClick={handleDelete}
                disabled={deleteConfirmText !== 'BORRAR'}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteConfirmText === 'BORRAR' ? '🗑️ Eliminar Definitivamente' : 'Confirma escribiendo BORRAR'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default MasterDashboard;
