
import React, { useState, useEffect } from 'react';
import { Group } from '../types';
import { dataService } from '../services/api';

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

  // Error/Rules State
  const [showRules, setShowRules] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

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
      console.error(error);
      if (error.code === 'permission-denied' || error.message?.includes('permission') || error.message?.includes('Missing or insufficient permissions')) {
          setErrorMsg("⛔ Error de Permisos: Tu base de datos no permite crear Logias.");
          setShowRules(true);
      } else {
          alert("Error creando logia: " + error.message);
      }
    } finally {
        setCreating(false);
    }
  };

  const openEditModal = (g: Group, e: React.MouseEvent) => {
      e.stopPropagation(); // Stop navigating to group
      setEditingGroup(g);
      setEditName(g.name);
      setEditDesc(g.description);
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
          console.error(e);
           if (e.code === 'permission-denied' || e.message?.includes('permission') || e.message?.includes('Missing or insufficient permissions')) {
              setErrorMsg("⛔ Error de Permisos: No puedes editar esta Logia.");
              setShowRules(true);
          } else {
              alert("Error actualizando la logia");
          }
      } finally {
          setSavingEdit(false);
      }
  };

  return (
    <div className="min-h-screen bg-logia-900 p-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <header className="flex justify-between items-center border-b border-logia-700 pb-4">
          <div className="flex flex-col">
            <h1 className="text-3xl font-bold text-white">Panel Maestro</h1>
            <p className="text-indigo-400 text-sm">Administración Multi-Logia</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setErrorMsg(''); setShowRules(true); }} className="bg-gray-800 hover:bg-gray-700 text-yellow-500 border border-yellow-500/30 px-3 py-2 rounded text-xs font-bold flex items-center gap-1">
                🛡️ Reglas BD
            </button>
            <button onClick={onLogout} className="text-gray-400 hover:text-white border border-gray-600 px-4 py-2 rounded">
                Cerrar Sesión
            </button>
          </div>
        </header>

        <div className="flex justify-end">
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
                    className="bg-logia-800 p-6 rounded-xl border border-logia-700 shadow-lg hover:bg-logia-700 cursor-pointer transition-all group relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 text-6xl pointer-events-none">
                        🏛️
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">{group.name}</h3>
                    <p className="text-gray-400 text-sm mb-4">{group.description || 'Sin descripción'}</p>
                    <div className="flex justify-between items-center mt-4">
                        <span className="text-xs text-gray-500 uppercase tracking-wider">ID: {group.id.slice(0,8)}...</span>
                        <div className="flex gap-2">
                             <button 
                                onClick={(e) => openEditModal(group, e)}
                                className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1 rounded-full text-xs font-bold border border-gray-600 z-10"
                             >
                                ✏️ Editar
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

      {/* SECURITY RULES MODAL */}
      {showRules && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4">
          <div className="bg-logia-800 w-full max-w-3xl rounded-xl border border-logia-700 shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
             <button onClick={() => setShowRules(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl">✕</button>
             
             {errorMsg && (
                 <div className="bg-red-500/10 border border-red-500/50 p-4 rounded mb-6 flex items-start gap-3">
                     <span className="text-2xl">⚠️</span>
                     <div>
                         <h3 className="text-red-400 font-bold">Acción Bloqueada</h3>
                         <p className="text-red-200 text-sm">{errorMsg}</p>
                     </div>
                 </div>
             )}

             <h3 className="text-xl font-bold text-white mb-2">Actualizar Reglas de Seguridad</h3>
             <p className="text-gray-400 text-sm mb-4">
                 Para que los usuarios puedan ver la lista de logias al registrarse, actualiza las reglas:
             </p>
             <div className="relative">
                <pre className="bg-black p-4 rounded text-green-400 text-xs overflow-x-auto select-all border border-gray-700">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helpers
    function isSignedIn() { return request.auth != null; }
    function isOwner(userId) { return isSignedIn() && request.auth.uid == userId; }
    
    function isAdmin() { 
      return isSignedIn() && 
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'master']; 
    }

    // USUARIOS
    match /users/{userId} {
      allow read: if isSignedIn();
      allow write: if isOwner(userId) || isAdmin();
      
      match /ledger/{docId} { 
        allow read: if isSignedIn();
        allow write: if isAdmin(); 
      }
      match /attendance/{docId} { 
        allow read: if isSignedIn();
        allow write: if isAdmin(); 
      }
    }
    
    // LOGIAS (Grupos) - Permitir lectura pública para registro
    match /groups/{groupId} {
      allow read: if true; // <--- CAMBIO: Permitir ver lista al registrarse
      allow write: if isAdmin(); 
      
      match /treasury/{docId} {
        allow read: if isSignedIn();
        allow write: if isAdmin();
      }
      
      match /notices/{noticeId} {
        allow read: if isSignedIn();
        allow write: if isAdmin();
      }
    }
    
    // TRIVIA
    match /trivias/{triviaId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
      match /answers/{userId} {
         allow read: if isSignedIn();
         allow write: if isOwner(userId) || isAdmin();
      }
    }
  }
}`}
                </pre>
                <button 
                  onClick={() => {
                      navigator.clipboard.writeText(`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isOwner(userId) { return isSignedIn() && request.auth.uid == userId; }
    function isAdmin() { 
      return isSignedIn() && 
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'master']; 
    }

    match /users/{userId} {
      allow read: if isSignedIn();
      allow write: if isOwner(userId) || isAdmin();
      
      match /ledger/{docId} { 
        allow read: if isSignedIn();
        allow write: if isAdmin(); 
      }
      match /attendance/{docId} { 
        allow read: if isSignedIn();
        allow write: if isAdmin(); 
      }
    }
    
    match /groups/{groupId} {
      allow read: if true;
      allow write: if isAdmin();
      
      match /treasury/{docId} {
        allow read: if isSignedIn();
        allow write: if isAdmin();
      }
      
      match /notices/{noticeId} {
        allow read: if isSignedIn();
        allow write: if isAdmin();
      }
    }
    
    match /trivias/{triviaId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
      match /answers/{userId} {
         allow read: if isSignedIn();
         allow write: if isOwner(userId) || isAdmin();
      }
    }
  }
}`);
                      alert("Reglas copiadas al portapapeles");
                  }}
                  className="absolute top-2 right-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1 rounded"
                >
                    Copiar
                </button>
             </div>
             <div className="mt-6 flex justify-end">
                 <button onClick={() => setShowRules(false)} className="bg-gray-700 text-white px-6 py-2 rounded font-bold hover:bg-gray-600">
                     Cerrar
                 </button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default MasterDashboard;
