
import React, { useEffect, useState } from 'react';
import { User, Notice } from '../types';
import { dataService } from '../services/api';

interface Props {
  user: User;
}

const Notices: React.FC<Props> = ({ user }) => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  
  // Form State
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Delete Modal State
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Solo el rol 'admin' puede crear/borrar. 
  // 'member' y 'viewer' solo ven.
  const isAdmin = user.role === 'admin';

  useEffect(() => {
    if (user.groupId) {
        loadNotices();
    }
  }, [user.groupId]);

  const loadNotices = async () => {
    setLoading(true);
    const data = await dataService.getNotices(user.groupId);
    setNotices(data);
    setLoading(false);
  };

  const resetForm = () => {
    setTitle('');
    setDesc('');
    setEditingId(null);
    setShowForm(false);
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !desc) return;
    setSubmitting(true);
    try {
      if (editingId) {
        await dataService.updateNotice(user.groupId, editingId, {
          title,
          description: desc
        });
      } else {
        await dataService.createNotice({
          groupId: user.groupId,
          title,
          description: desc,
          date: new Date().toISOString(),
          createdBy: user.uid
        });
      }
      resetForm();
      await loadNotices();
    } catch (err) {
      alert("Error al guardar aviso");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (notice: Notice) => {
    setTitle(notice.title);
    setDesc(notice.description);
    setEditingId(notice.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteClick = (id: string) => {
    setDeletingId(id);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    
    // Optimistic Update
    setNotices(prev => prev.filter(n => n.id !== deletingId));
    setShowDeleteModal(false);

    try {
      await dataService.deleteNotice(user.groupId, deletingId);
      if (editingId === deletingId) resetForm();
    } catch (err) {
      console.error(err);
      // Rollback if needed, but usually just reloading works
      await loadNotices();
      alert("Error eliminando aviso");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-4 pb-24 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Avisos y Noticias</h2>
        {isAdmin && (
          <button 
            onClick={() => {
              if (showForm) resetForm();
              else setShowForm(true);
            }} 
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm font-bold"
          >
            {showForm ? 'Cancelar' : '+ Nuevo Aviso'}
          </button>
        )}
      </div>

      {isAdmin && showForm && (
        <form onSubmit={handleCreateOrUpdate} className="bg-logia-800 p-4 rounded-xl border border-logia-700 space-y-3">
          <h3 className="text-white font-bold">{editingId ? 'Editar Aviso' : 'Nuevo Aviso'}</h3>
          <input 
            placeholder="Título del Aviso"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
            required
          />
          <textarea 
            placeholder="Descripción detallada..."
            value={desc}
            onChange={e => setDesc(e.target.value)}
            className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white h-24"
            required
          />
          <div className="flex gap-2">
             <button 
              type="button" 
              onClick={resetForm}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={submitting}
              className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded"
            >
              {submitting ? 'Guardando...' : (editingId ? 'Actualizar Aviso' : 'Publicar Aviso')}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-center text-gray-400">Cargando noticias...</p>
      ) : notices.length === 0 ? (
        <div className="text-center p-8 bg-logia-800/50 rounded-xl border border-dashed border-gray-700">
          <p className="text-gray-400">No hay avisos recientes.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {notices.map(notice => (
            <div key={notice.id} className="bg-logia-800 rounded-xl overflow-hidden border border-logia-700 shadow-lg transition-transform hover:scale-[1.01]">
              <div className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-xl font-bold text-white">{notice.title}</h3>
                  {isAdmin && (
                    <div className="flex gap-2 ml-2">
                        <button onClick={() => handleEdit(notice)} className="text-indigo-400 hover:text-indigo-300 p-1" title="Editar Aviso">✏️</button>
                        <button onClick={() => handleDeleteClick(notice.id)} className="text-red-400 hover:text-red-300 p-1" title="Eliminar Aviso">🗑️</button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-4 font-mono">
                  {new Date(notice.date).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                  {notice.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-6">
            <div className="bg-logia-800 border border-red-500 p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
                <div className="text-4xl mb-4">🗑️</div>
                <h3 className="text-xl font-bold text-white mb-2">¿Eliminar este aviso?</h3>
                <p className="text-gray-400 mb-6">Esta acción no se puede deshacer.</p>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowDeleteModal(false)}
                        className="flex-1 py-3 bg-gray-700 text-white rounded font-bold"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleConfirmDelete}
                        className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded font-bold"
                    >
                        Sí, Eliminar
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Notices;
