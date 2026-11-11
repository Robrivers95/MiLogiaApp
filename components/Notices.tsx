import React, { useEffect, useState } from 'react';
import { User, Notice } from '../types';
import { dataService, notificationService } from '../services/api';

interface Props {
  user: User;
}

const Notices: React.FC<Props> = ({ user }) => {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendPush, setSendPush] = useState(true);

  // Image state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);

  // Delete Modal
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Image viewer
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const isAdmin = user.role === 'admin' || user.role === 'master';

  useEffect(() => {
    if (user.groupId) loadNotices();
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
    setImageFile(null);
    setImagePreview(null);
    setExistingImageUrl(null);
    setSendPush(true);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    // Show preview immediately
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !desc) return;
    setSubmitting(true);
    try {
      // Compress image if a new one was selected
      let imageUrl: string | undefined = existingImageUrl || undefined;
      if (imageFile) {
        imageUrl = await dataService.compressImageToBase64(imageFile);
      }

      if (editingId) {
        await dataService.updateNotice(user.groupId, editingId, {
          title,
          description: desc,
          ...(imageUrl !== undefined && { imageUrl })
        });
      } else {
        await dataService.createNotice({
          groupId: user.groupId,
          title,
          description: desc,
          date: new Date().toISOString(),
          createdBy: user.uid,
          ...(imageUrl && { imageUrl })
        });

        // Send in-app notification + browser push to ALL members (including creator to confirm it works)
        if (sendPush) {
          try {
            const allUsers = await dataService.getUsers(user.groupId);
            const memberUids = allUsers.filter(u => u.active).map(u => u.uid);
            if (memberUids.length > 0) {
              await notificationService.createNotification(
                memberUids,
                user.groupId,
                'notice',
                `📌 Nuevo aviso: ${title}`,
                desc.length > 100 ? desc.substring(0, 100) + '...' : desc
              );
            }
          } catch (_) {}
        }
      }

      resetForm();
      await loadNotices();
    } catch (err) {
      alert('Error al guardar aviso');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (notice: Notice) => {
    setTitle(notice.title);
    setDesc(notice.description);
    setEditingId(notice.id);
    setImageFile(null);
    setImagePreview(null);
    setExistingImageUrl(notice.imageUrl || null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteClick = (id: string) => {
    setDeletingId(id);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    setNotices(prev => prev.filter(n => n.id !== deletingId));
    setShowDeleteModal(false);
    try {
      await dataService.deleteNotice(user.groupId, deletingId);
      if (editingId === deletingId) resetForm();
    } catch (err) {
      console.error(err);
      await loadNotices();
      alert('Error eliminando aviso');
    } finally {
      setDeletingId(null);
    }
  };

  // Send push notification for an existing notice
  const handleSendPushForNotice = async (notice: Notice) => {
    try {
      const allUsers = await dataService.getUsers(user.groupId);
      const memberUids = allUsers.filter(u => u.active).map(u => u.uid);
      if (memberUids.length > 0) {
        await notificationService.createNotification(
          memberUids,
          user.groupId,
          'notice',
          `📌 ${notice.title}`,
          notice.description.length > 100 ? notice.description.substring(0, 100) + '...' : notice.description
        );
        alert(`Notificación enviada a ${memberUids.length} miembro(s).`);
      } else {
        alert('No hay miembros a quienes notificar.');
      }
    } catch (err) {
      alert('Error enviando notificación.');
    }
  };

  return (
    <div className="p-4 pb-24 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Avisos y Noticias</h2>
        {isAdmin && (
          <button
            onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}
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

          {/* Image Upload */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Imagen (opcional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="w-full text-sm text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:font-bold file:bg-indigo-700 file:text-white hover:file:bg-indigo-600 cursor-pointer"
            />
            {(imagePreview || existingImageUrl) && (
              <div className="mt-2 relative">
                <img
                  src={imagePreview || existingImageUrl!}
                  alt="Vista previa"
                  className="max-h-40 rounded border border-logia-700 object-contain"
                />
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setImagePreview(null); setExistingImageUrl(null); }}
                  className="absolute top-1 right-1 bg-red-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold"
                  title="Quitar imagen"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          {/* Send push toggle */}
          {!editingId && (
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setSendPush(p => !p)}
                className={`w-10 h-5 rounded-full transition-colors ${sendPush ? 'bg-indigo-600' : 'bg-gray-600'} relative`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${sendPush ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-gray-300">Enviar notificación push al publicar</span>
            </label>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={resetForm} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded">Cancelar</button>
            <button type="submit" disabled={submitting} className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded">
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
              {/* Notice image */}
              {notice.imageUrl && (
                <div
                  className="w-full cursor-pointer overflow-hidden"
                  onClick={() => setViewingImage(notice.imageUrl!)}
                >
                  <img
                    src={notice.imageUrl}
                    alt={notice.title}
                    className="w-full object-cover max-h-56"
                  />
                </div>
              )}
              <div className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-xl font-bold text-white">{notice.title}</h3>
                  {isAdmin && (
                    <div className="flex gap-1 ml-2">
                      <button
                        onClick={() => handleSendPushForNotice(notice)}
                        className="text-indigo-400 hover:text-indigo-300 p-1"
                        title="Enviar notificación push"
                      >
                        🔔
                      </button>
                      <button onClick={() => handleEdit(notice)} className="text-indigo-400 hover:text-indigo-300 p-1" title="Editar Aviso">✏️</button>
                      <button onClick={() => handleDeleteClick(notice.id)} className="text-red-400 hover:text-red-300 p-1" title="Eliminar Aviso">🗑️</button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mb-4 font-mono">
                  {new Date(notice.date).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{notice.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image Viewer Modal */}
      {viewingImage && (
        <div
          className="fixed inset-0 bg-black/95 flex items-center justify-center z-[200] p-4 cursor-pointer"
          onClick={() => setViewingImage(null)}
        >
          <img src={viewingImage} alt="Imagen completa" className="max-w-full max-h-full object-contain rounded" />
          <button className="absolute top-4 right-4 text-white text-3xl font-bold">×</button>
        </div>
      )}

      {/* DELETE MODAL */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-6">
          <div className="bg-logia-800 border border-red-500 p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
            <div className="text-4xl mb-4">🗑️</div>
            <h3 className="text-xl font-bold text-white mb-2">¿Eliminar este aviso?</h3>
            <p className="text-gray-400 mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 py-3 bg-gray-700 text-white rounded font-bold">Cancelar</button>
              <button onClick={handleConfirmDelete} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded font-bold">Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notices;
