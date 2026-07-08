import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, BibliotecaTrazado, BibliotecaComment, BibliotecaDegree } from '../types';
import { bibliotecaService } from '../services/api';
import { dataService } from '../services/api';
import RetejeModal from './RetejeModal';

// ─── CONSTANTES ────────────────────────────────────────────────────────────

const DEGREE_ORDER: BibliotecaDegree[] = ['aprendiz', 'companero', 'maestro'];

const DEGREE_LABELS: Record<BibliotecaDegree, string> = {
  aprendiz:  '📜 Aprendiz',
  companero: '📐 Compañero',
  maestro:   '🔑 Maestro',
};

const DEGREE_BADGE: Record<BibliotecaDegree, string> = {
  aprendiz:  'bg-yellow-900/60 text-yellow-300 border-yellow-700',
  companero: 'bg-blue-900/60 text-blue-300 border-blue-700',
  maestro:   'bg-purple-900/60 text-purple-300 border-purple-700',
};

const DEGREE_DOT: Record<BibliotecaDegree, string> = {
  aprendiz:  'bg-yellow-400',
  companero: 'bg-blue-400',
  maestro:   'bg-purple-500',
};

/** Formatea timestamp a fecha legible */
function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: '2-digit',
  });
}

/** Grados base que puede ver un usuario según su grado de perfil (sin reteje) */
function getBaseDegrees(userDegree: BibliotecaDegree | undefined): BibliotecaDegree[] {
  switch (userDegree) {
    case 'maestro':   return ['aprendiz', 'companero', 'maestro'];
    case 'companero': return ['aprendiz', 'companero'];
    default:          return ['aprendiz'];
  }
}

/** Clave de localStorage para recordar reteje aprobado por grado */
const retejeKey = (uid: string, degree: BibliotecaDegree) =>
  `reteje_${uid}_${degree}`;

// ─── TIPOS LOCALES ─────────────────────────────────────────────────────────

interface Props {
  user: User;
}

type ModalState = 'none' | 'reteje' | 'detail' | 'viewer' | 'upload' | 'comments' | 'admin-questions';

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────

const Biblioteca: React.FC<Props> = ({ user }) => {
  // Grados sin reteje (por grado de perfil)
  const baseDegrees = getBaseDegrees(user.degree);

  // Grados adicionales desbloqueados vía reteje (persistidos en localStorage)
  const [unlockedExtra, setUnlockedExtra] = useState<BibliotecaDegree[]>(() =>
    DEGREE_ORDER.filter(d =>
      !getBaseDegrees(user.degree).includes(d) &&
      localStorage.getItem(retejeKey(user.uid, d)) === '1'
    )
  );

  // Todos los grados accesibles actualmente
  const accessibleDegrees: BibliotecaDegree[] = [
    ...baseDegrees,
    ...unlockedExtra.filter(d => !baseDegrees.includes(d)),
  ];

  // Grados bloqueados (superiores al grado de perfil, aún no desbloqueados)
  const lockedDegrees = DEGREE_ORDER.filter(d => !accessibleDegrees.includes(d));

  // Grado objetivo del reteje (el grado superior que quiere desbloquear)
  const [retejeTargetDegree, setRetejeTargetDegree] = useState<BibliotecaDegree>('companero');

  const [modal, setModal] = useState<ModalState>('none');
  const [trazados, setTrazados] = useState<BibliotecaTrazado[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDegree, setFilterDegree] = useState<BibliotecaDegree | 'all'>('all');
  const [filterAuthor, setFilterAuthor] = useState('');
  const [filterLodge, setFilterLodge] = useState('');
  const [activeTrazado, setActiveTrazado] = useState<BibliotecaTrazado | null>(null);
  const [comments, setComments] = useState<BibliotecaComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [groupName, setGroupName] = useState('');

  // Upload form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    degree: (user.degree ?? 'aprendiz') as BibliotecaDegree,
    isPublic: true,
  });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    dataService.getGroupDetails(user.groupId).then(g => {
      if (g?.name) setGroupName(g.name);
    }).catch(() => {});
  }, [user.groupId]);

  const loadTrazados = async (degrees: BibliotecaDegree[]) => {
    setLoading(true);
    try {
      const data = await bibliotecaService.listTrazados(user.groupId, degrees);
      setTrazados(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrazados(accessibleDegrees);
  }, [accessibleDegrees.join(',')]);

  // Opciones de filtro derivadas dinámicamente
  const uniqueAuthors = useMemo(() =>
    [...new Set(trazados.map(t => t.uploaderName))].sort(),
    [trazados]
  );
  const uniqueLodges = useMemo(() =>
    [...new Set(trazados.map(t => t.groupName))].sort(),
    [trazados]
  );

  // ── Intentar ver un grado bloqueado ─────────────────────────────────────
  const handleLockedDegree = (degree: BibliotecaDegree) => {
    setRetejeTargetDegree(degree);
    setModal('reteje');
  };

  const handleRetejePass = () => {
    localStorage.setItem(retejeKey(user.uid, retejeTargetDegree), '1');
    setUnlockedExtra(prev => [...prev, retejeTargetDegree]);
    setFilterDegree(retejeTargetDegree); // Mostrar el grado recién desbloqueado
    setModal('none');
  };

  // ── Abrir detalle del trazado ────────────────────────────────────────────
  const handleOpenDetail = async (t: BibliotecaTrazado) => {
    setActiveTrazado(t);
    setModal('detail');
    bibliotecaService.registerView(t.id).catch(() => {});
    setTrazados(prev =>
      prev.map(x => x.id === t.id ? { ...x, viewCount: x.viewCount + 1 } : x)
    );
  };

  // Abrir visor PDF desde el modal de detalle
  const handleOpenPDF = () => setModal('viewer');

  // ── Like ────────────────────────────────────────────────────────────────
  const handleLike = async (t: BibliotecaTrazado, e: React.MouseEvent) => {
    e.stopPropagation();
    const hasLiked = t.likedBy.includes(user.uid);
    setTrazados(prev =>
      prev.map(x => x.id === t.id ? {
        ...x,
        likeCount: hasLiked ? x.likeCount - 1 : x.likeCount + 1,
        likedBy: hasLiked ? x.likedBy.filter(u => u !== user.uid) : [...x.likedBy, user.uid],
      } : x)
    );
    if (activeTrazado?.id === t.id) {
      setActiveTrazado(prev => prev ? {
        ...prev,
        likeCount: hasLiked ? prev.likeCount - 1 : prev.likeCount + 1,
        likedBy: hasLiked ? prev.likedBy.filter(u => u !== user.uid) : [...prev.likedBy, user.uid],
      } : null);
    }
    await bibliotecaService.toggleLike(t.id, user.uid, hasLiked);
  };

  // ── Comentarios ─────────────────────────────────────────────────────────
  const handleOpenComments = async (t: BibliotecaTrazado) => {
    setActiveTrazado(t);
    setModal('comments');
    setCommentLoading(true);
    try {
      const cs = await bibliotecaService.getComments(t.id);
      setComments(cs);
    } finally {
      setCommentLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!activeTrazado || !commentText.trim()) return;
    setCommentLoading(true);
    try {
      const c = await bibliotecaService.addComment(activeTrazado.id, {
        uid: user.uid,
        userName: user.name,
        groupName,
        text: commentText.trim(),
      });
      setComments(prev => [...prev, c]);
      setCommentText('');
    } finally {
      setCommentLoading(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!activeTrazado) return;
    await bibliotecaService.deleteComment(activeTrazado.id, commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  // ── Subir trazado ───────────────────────────────────────────────────────
  const handleUpload = async () => {
    setUploadError('');
    const file = fileRef.current?.files?.[0];
    if (!file) { setUploadError('Selecciona un archivo PDF.'); return; }
    if (file.type !== 'application/pdf') { setUploadError('El archivo debe ser un PDF.'); return; }
    if (file.size > 20 * 1024 * 1024) { setUploadError('El PDF no debe superar 20 MB.'); return; }
    if (!form.title.trim()) { setUploadError('El título es obligatorio.'); return; }
    if (!form.description.trim()) { setUploadError('La descripción es obligatoria.'); return; }

    setUploading(true);
    try {
      const nuevo = await bibliotecaService.uploadTrazado(file, {
        title: form.title.trim(),
        description: form.description.trim(),
        degree: form.degree,
        isPublic: form.isPublic,
        uploaderUid: user.uid,
        uploaderName: user.name,
        groupId: user.groupId,
        groupName,
      });
      setTrazados(prev => [nuevo, ...prev]);
      setForm({ title: '', description: '', degree: user.degree ?? 'aprendiz', isPublic: true });
      if (fileRef.current) fileRef.current.value = '';
      setModal('none');
    } catch (e: any) {
      setUploadError(e.message ?? 'Error al subir el trazado.');
    } finally {
      setUploading(false);
    }
  };

  // ── Eliminar trazado ────────────────────────────────────────────────────
  const handleDelete = async (t: BibliotecaTrazado) => {
    if (!confirm(`¿Eliminar el trazado "${t.title}"? Esta acción no se puede deshacer.`)) return;
    await bibliotecaService.deleteTrazado(t.id);
    setTrazados(prev => prev.filter(x => x.id !== t.id));
    if (modal === 'viewer' || modal === 'detail') setModal('none');
  };

  const canDelete = (t: BibliotecaTrazado) =>
    t.uploaderUid === user.uid || user.role === 'admin' || user.role === 'master';

  // ── Lista filtrada ───────────────────────────────────────────────────────
  const displayed = trazados.filter(t => {
    if (filterDegree !== 'all' && t.degree !== filterDegree) return false;
    if (filterAuthor && t.uploaderName !== filterAuthor) return false;
    if (filterLodge && t.groupName !== filterLodge) return false;
    return true;
  });

  const hasFilters = filterAuthor !== '' || filterLodge !== '' || filterDegree !== 'all';

  // ────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="text-center pt-2 pb-1">
        <h1 className="text-2xl font-bold text-indigo-300">📚 Biblioteca de Alejandría</h1>
        <p className="text-xs text-gray-400 mt-1">Masónica — Rito Escocés Antiguo y Aceptado</p>
      </div>

      {/* Reteje modal — solo se abre cuando intentan ver un grado superior */}
      {modal === 'reteje' && (
        <RetejeModal
          degree={retejeTargetDegree}
          onPass={handleRetejePass}
          onClose={() => setModal('none')}
        />
      )}

      {/* Fila superior: filtros de grado + botones de acción */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setFilterDegree('all')}
            className={`text-xs px-3 py-1 rounded-full border transition ${filterDegree === 'all' ? 'bg-indigo-700 border-indigo-500 text-white' : 'border-logia-700 text-gray-400 hover:text-white'}`}
          >
            Todos
          </button>
          {accessibleDegrees.map(d => (
            <button
              key={d}
              onClick={() => setFilterDegree(d)}
              className={`text-xs px-3 py-1 rounded-full border transition ${filterDegree === d ? 'bg-indigo-700 border-indigo-500 text-white' : 'border-logia-700 text-gray-400 hover:text-white'}`}
            >
              {DEGREE_LABELS[d]}
            </button>
          ))}
          {lockedDegrees.map(d => (
            <button
              key={d}
              onClick={() => handleLockedDegree(d)}
              title="Requiere reteje"
              className="text-xs px-3 py-1 rounded-full border border-logia-700 text-gray-600 hover:text-yellow-400 hover:border-yellow-700 transition flex items-center gap-1"
            >
              🔒 {DEGREE_LABELS[d].split(' ').slice(1).join(' ')}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setModal('upload')}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white border border-indigo-600 flex items-center gap-1"
          >
            ➕ Subir
          </button>
          {user.role === 'master' && (
            <button
              onClick={() => setModal('admin-questions')}
              className="text-xs px-3 py-1.5 rounded-lg bg-logia-800 hover:bg-logia-700 text-gray-300 border border-logia-700"
            >
              ⚙️ Reteje
            </button>
          )}
        </div>
      </div>

      {/* Filtros de autor y logia */}
      <div className="flex gap-2 flex-wrap items-center">
        <select
          value={filterAuthor}
          onChange={e => setFilterAuthor(e.target.value)}
          className="flex-1 min-w-0 bg-logia-800 border border-logia-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-indigo-500"
        >
          <option value="">Todos los autores</option>
          {uniqueAuthors.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          value={filterLodge}
          onChange={e => setFilterLodge(e.target.value)}
          className="flex-1 min-w-0 bg-logia-800 border border-logia-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-indigo-500"
        >
          <option value="">Todas las logias</option>
          {uniqueLodges.map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setFilterDegree('all'); setFilterAuthor(''); setFilterLodge(''); }}
            className="text-[10px] text-red-400 hover:text-red-300 shrink-0 underline"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Info de grado */}
      <div className="text-xs text-center text-gray-500">
        Tu grado: <span className="font-semibold text-indigo-300">{DEGREE_LABELS[user.degree ?? 'aprendiz']}</span>
        {lockedDegrees.length > 0 && (
          <span className="ml-2 text-yellow-700">· Toca 🔒 para rendir el reteje</span>
        )}
      </div>

      {/* Lista compacta */}
      {loading ? (
        <p className="text-center text-gray-400 py-8">Cargando trazados…</p>
      ) : displayed.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-3">📜</p>
          <p>{hasFilters ? 'No hay trazados con esos filtros.' : 'Aún no hay trazados en esta categoría.'}</p>
          {!hasFilters && <p className="text-xs mt-1">¡Sé el primero en contribuir!</p>}
        </div>
      ) : (
        <div className="space-y-1">
          {displayed.map(t => (
            <TrazadoRow
              key={t.id}
              t={t}
              user={user}
              onOpen={handleOpenDetail}
              onLike={handleLike}
              onComment={handleOpenComments}
              onDelete={canDelete(t) ? handleDelete : undefined}
            />
          ))}
          <p className="text-[10px] text-gray-600 text-right pt-1">{displayed.length} trazado{displayed.length !== 1 ? 's' : ''}</p>
        </div>
      )}

      {/* ── Modal: Detalle del trazado ──────────────────────────────────── */}
      {modal === 'detail' && activeTrazado && (
        <DetailModal
          t={activeTrazado}
          user={user}
          onClose={() => setModal('none')}
          onRead={handleOpenPDF}
          onLike={handleLike}
          onComment={handleOpenComments}
          onDelete={canDelete(activeTrazado) ? handleDelete : undefined}
        />
      )}

      {/* ── Modal: Visor de PDF ─────────────────────────────────────────── */}
      {modal === 'viewer' && activeTrazado && (
        <ViewerModal
          t={activeTrazado}
          user={user}
          onClose={() => setModal('none')}
          onLike={handleLike}
          onOpenComments={handleOpenComments}
          onDelete={canDelete(activeTrazado) ? handleDelete : undefined}
        />
      )}

      {/* ── Modal: Comentarios ──────────────────────────────────────────── */}
      {modal === 'comments' && activeTrazado && (
        <CommentsModal
          t={activeTrazado}
          user={user}
          comments={comments}
          loading={commentLoading}
          text={commentText}
          onTextChange={setCommentText}
          onAdd={handleAddComment}
          onDelete={handleDeleteComment}
          onClose={() => setModal('none')}
        />
      )}

      {/* ── Modal: Subir trazado ────────────────────────────────────────── */}
      {modal === 'upload' && (
        <UploadModal
          form={form}
          setForm={setForm}
          fileRef={fileRef}
          accessibleDegrees={accessibleDegrees}
          uploading={uploading}
          error={uploadError}
          onSubmit={handleUpload}
          onClose={() => { setModal('none'); setUploadError(''); }}
        />
      )}

      {/* ── Modal: Admin — Gestión de preguntas del reteje ─────────────── */}
      {modal === 'admin-questions' && (
        <AdminRetejeModal onClose={() => setModal('none')} />
      )}
    </div>
  );
};

// ─── SUB-COMPONENTES ───────────────────────────────────────────────────────

/** Fila compacta: punto de grado • título • logia • estadísticas • eliminar */
const TrazadoRow: React.FC<{
  t: BibliotecaTrazado;
  user: User;
  onOpen: (t: BibliotecaTrazado) => void;
  onLike: (t: BibliotecaTrazado, e: React.MouseEvent) => void;
  onComment: (t: BibliotecaTrazado) => void;
  onDelete?: (t: BibliotecaTrazado) => void;
}> = ({ t, user, onOpen, onLike, onComment, onDelete }) => {
  const liked = t.likedBy.includes(user.uid);

  return (
    <div
      className="flex items-center gap-2 px-3 py-2.5 bg-logia-800 border border-logia-700 rounded-lg hover:border-indigo-600 cursor-pointer transition"
      onClick={() => onOpen(t)}
    >
      {/* Punto de grado */}
      <span className={`w-2 h-2 rounded-full shrink-0 ${DEGREE_DOT[t.degree]}`} title={DEGREE_LABELS[t.degree]} />

      {/* Título */}
      <span className="flex-1 text-sm text-white font-medium truncate leading-none min-w-0">{t.title}</span>

      {/* Logia — con prefijo para que quede claro que es logia */}
      <span className="text-[10px] text-gray-500 shrink-0 truncate max-w-[110px]" title={t.groupName}>
        🏛 {t.groupName}
      </span>

      {/* Estadísticas + acciones — detenemos propagación */}
      <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
        <span className="text-[10px] text-gray-600 flex items-center gap-0.5">
          👁 {t.viewCount}
        </span>
        <button
          onClick={e => onLike(t, e)}
          className={`flex items-center gap-0.5 text-[10px] transition ${liked ? 'text-red-400' : 'text-gray-600 hover:text-red-400'}`}
        >
          {liked ? '❤️' : '🤍'} {t.likeCount}
        </button>
        <button
          onClick={e => { e.stopPropagation(); onComment(t); }}
          className="text-[11px] text-gray-600 hover:text-indigo-300 transition"
          title="Comentarios"
        >
          💬
        </button>
        {onDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(t); }}
            className="text-[11px] text-gray-500 hover:text-red-400 transition"
            title="Eliminar mi trazado"
          >
            🗑
          </button>
        )}
      </div>
    </div>
  );
};

/** Modal de detalle: muestra toda la info antes de abrir el PDF */
const DetailModal: React.FC<{
  t: BibliotecaTrazado;
  user: User;
  onClose: () => void;
  onRead: () => void;
  onLike: (t: BibliotecaTrazado, e: React.MouseEvent) => void;
  onComment: (t: BibliotecaTrazado) => void;
  onDelete?: (t: BibliotecaTrazado) => void;
}> = ({ t, user, onClose, onRead, onLike, onComment, onDelete }) => {
  const liked = t.likedBy.includes(user.uid);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-logia-800 border border-logia-700 rounded-t-2xl sm:rounded-2xl w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-logia-700 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${DEGREE_BADGE[t.degree]}`}>
                {DEGREE_LABELS[t.degree]}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${t.isPublic ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-orange-900/40 text-orange-400 border-orange-800'}`}>
                {t.isPublic ? '🌐 Público' : '🔒 Solo mi logia'}
              </span>
            </div>
            <h2 className="text-white font-bold text-base leading-tight">{t.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl shrink-0 leading-none">&times;</button>
        </div>

        {/* Cuerpo */}
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-300 leading-relaxed">{t.description}</p>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>✍️ {t.uploaderName}</span>
            <span>🏛 {t.groupName}</span>
            <span>📅 {fmtDate(t.createdAt)}</span>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500 border-t border-logia-700 pt-2">
            <span>👁 {t.viewCount} vistas</span>
            <span>❤️ {t.likeCount} likes</span>
          </div>
        </div>

        {/* Acciones */}
        <div className="p-4 border-t border-logia-700 flex gap-2">
          <button
            onClick={onRead}
            className="flex-1 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-sm transition"
          >
            📖 Leer PDF
          </button>
          <button
            onClick={e => onLike(t, e)}
            className={`px-3 py-2.5 rounded-xl border text-sm transition ${liked ? 'border-red-700 text-red-400 bg-red-900/20' : 'border-logia-600 text-gray-400 hover:text-red-400 hover:border-red-800'}`}
          >
            {liked ? '❤️' : '🤍'}
          </button>
          <button
            onClick={() => onComment(t)}
            className="px-3 py-2.5 rounded-xl border border-logia-600 text-gray-400 hover:text-indigo-300 text-sm transition"
          >
            💬
          </button>
          {onDelete && (
            <button
              onClick={() => onDelete(t)}
              className="px-3 py-2.5 rounded-xl border border-logia-600 text-gray-500 hover:text-red-400 hover:border-red-800 text-sm transition"
              title="Eliminar mi trazado"
            >
              🗑
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const ViewerModal: React.FC<{
  t: BibliotecaTrazado;
  user: User;
  onClose: () => void;
  onLike: (t: BibliotecaTrazado, e: React.MouseEvent) => void;
  onOpenComments: (t: BibliotecaTrazado) => void;
  onDelete?: (t: BibliotecaTrazado) => void;
}> = ({ t, user, onClose, onLike, onOpenComments, onDelete }) => {
  const liked = t.likedBy.includes(user.uid);

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      <div className="bg-logia-800 border-b border-logia-700 p-3 flex items-center gap-3 shrink-0">
        <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">{t.title}</p>
          <p className="text-xs text-gray-400 truncate">{t.uploaderName} · {t.groupName}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={e => onLike(t, e)}
            className={`text-sm transition ${liked ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`}
          >
            {liked ? '❤️' : '🤍'} {t.likeCount}
          </button>
          <button
            onClick={() => onOpenComments(t)}
            className="text-sm text-gray-500 hover:text-indigo-300 transition"
          >
            💬
          </button>
          {onDelete && (
            <button onClick={() => onDelete(t)} className="text-sm text-gray-500 hover:text-red-400 transition">🗑</button>
          )}
        </div>
      </div>

      <div className="bg-logia-900 border-b border-logia-700 px-4 py-2 shrink-0">
        <p className="text-xs text-gray-300 leading-relaxed">{t.description}</p>
        <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
          <span>👁 {t.viewCount} vistas</span>
          <span>❤️ {t.likeCount} likes</span>
          <span className={`${DEGREE_BADGE[t.degree]} px-1.5 py-0.5 rounded-full border text-[9px]`}>
            {DEGREE_LABELS[t.degree]}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <iframe src={t.pdfUrl} className="w-full h-full border-0" title={t.title} />
      </div>

      <div className="bg-logia-800 border-t border-logia-700 p-2 text-center shrink-0">
        <a href={t.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:text-indigo-300 underline">
          Abrir en nueva pestaña / Descargar PDF
        </a>
      </div>
    </div>
  );
};

const CommentsModal: React.FC<{
  t: BibliotecaTrazado;
  user: User;
  comments: BibliotecaComment[];
  loading: boolean;
  text: string;
  onTextChange: (v: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}> = ({ t, user, comments, loading, text, onTextChange, onAdd, onDelete, onClose }) => (
  <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center">
    <div className="bg-logia-800 border border-logia-700 rounded-t-2xl sm:rounded-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
      <div className="p-4 border-b border-logia-700 flex justify-between items-center shrink-0">
        <h3 className="font-bold text-white text-sm">💬 Comentarios — {t.title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <p className="text-gray-400 text-sm text-center">Cargando…</p>
        ) : comments.length === 0 ? (
          <p className="text-gray-500 text-sm text-center">Sin comentarios aún.</p>
        ) : (
          comments.map(c => (
            <div key={c.id} className="bg-logia-900 rounded-lg p-3 space-y-1">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold text-indigo-300">{c.userName}</span>
                  <span className="text-[10px] text-gray-500 ml-1">· {c.groupName}</span>
                </div>
                {(c.uid === user.uid || user.role === 'admin' || user.role === 'master') && (
                  <button onClick={() => onDelete(c.id)} className="text-[10px] text-gray-600 hover:text-red-400">🗑</button>
                )}
              </div>
              <p className="text-xs text-gray-300">{c.text}</p>
            </div>
          ))
        )}
      </div>
      <div className="p-4 border-t border-logia-700 flex gap-2 shrink-0">
        <input
          type="text"
          value={text}
          onChange={e => onTextChange(e.target.value)}
          placeholder="Escribe un comentario…"
          maxLength={500}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && onAdd()}
          className="flex-1 bg-logia-900 border border-logia-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={onAdd}
          disabled={!text.trim() || loading}
          className="bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          Enviar
        </button>
      </div>
    </div>
  </div>
);

const UploadModal: React.FC<{
  form: { title: string; description: string; degree: BibliotecaDegree; isPublic: boolean };
  setForm: React.Dispatch<React.SetStateAction<{ title: string; description: string; degree: BibliotecaDegree; isPublic: boolean }>>;
  fileRef: React.RefObject<HTMLInputElement>;
  accessibleDegrees: BibliotecaDegree[];
  uploading: boolean;
  error: string;
  onSubmit: () => void;
  onClose: () => void;
}> = ({ form, setForm, fileRef, accessibleDegrees, uploading, error, onSubmit, onClose }) => (
  <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-logia-800 border border-logia-700 rounded-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
      <div className="p-4 border-b border-logia-700 flex justify-between items-center">
        <h3 className="font-bold text-white">📤 Subir Trazado Masónico</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Título *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            maxLength={120}
            placeholder="Ej: El simbolismo del Compás en el primer grado"
            className="w-full bg-logia-900 border border-logia-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Descripción *</label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            maxLength={600}
            rows={3}
            placeholder="Breve descripción del contenido del trazado…"
            className="w-full bg-logia-900 border border-logia-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Grado del trazado *</label>
          <select
            value={form.degree}
            onChange={e => setForm(f => ({ ...f, degree: e.target.value as BibliotecaDegree }))}
            className="w-full bg-logia-900 border border-logia-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            {accessibleDegrees.map(d => (
              <option key={d} value={d}>{DEGREE_LABELS[d]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Visibilidad</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="visibility" checked={form.isPublic} onChange={() => setForm(f => ({ ...f, isPublic: true }))} className="accent-indigo-500" />
              <span className="text-sm text-gray-200">🌐 Todas las logias</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="visibility" checked={!form.isPublic} onChange={() => setForm(f => ({ ...f, isPublic: false }))} className="accent-indigo-500" />
              <span className="text-sm text-gray-200">🔒 Solo mi logia</span>
            </label>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Archivo PDF * (máx. 20 MB)</label>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-logia-600 file:text-xs file:bg-logia-700 file:text-gray-200 hover:file:bg-logia-600 file:cursor-pointer"
          />
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button
          onClick={onSubmit}
          disabled={uploading}
          className="w-full py-3 rounded-xl bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold text-sm transition"
        >
          {uploading ? 'Subiendo…' : '📤 Publicar trazado'}
        </button>
      </div>
    </div>
  </div>
);

// ─── ADMIN: Gestión de preguntas del Reteje ────────────────────────────────

const DEGREE_KEYS: BibliotecaDegree[] = ['aprendiz', 'companero', 'maestro'];

const AdminRetejeModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [questions, setQuestions] = useState<import('../types').RetejeQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDeg, setActiveDeg] = useState<BibliotecaDegree>('aprendiz');
  const [form, setForm] = useState({ question: '', options: ['', '', '', ''], correctIndex: 0 });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const reload = async () => {
    setLoading(true);
    try { setQuestions(await bibliotecaService.getAllQuestions()); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const byDegree = questions.filter(q => q.degree === activeDeg);

  const handleSave = async () => {
    setErr('');
    if (!form.question.trim()) { setErr('Escribe la pregunta.'); return; }
    if (form.options.some(o => !o.trim())) { setErr('Completa todas las opciones.'); return; }
    setSaving(true);
    try {
      const nueva = await bibliotecaService.saveQuestion({
        degree: activeDeg,
        question: form.question.trim(),
        options: form.options.map(o => o.trim()),
        correctIndex: form.correctIndex,
      });
      setQuestions(prev => [...prev, nueva]);
      setForm({ question: '', options: ['', '', '', ''], correctIndex: 0 });
    } catch (e: any) {
      setErr(e.message ?? 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await bibliotecaService.deleteQuestion(id);
    setQuestions(prev => prev.filter(q => q.id !== id));
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-logia-800 border border-logia-700 rounded-2xl w-full max-w-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-logia-700 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-white">⚙️ Preguntas del Reteje</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
        </div>

        <div className="flex border-b border-logia-700 shrink-0">
          {DEGREE_KEYS.map(d => (
            <button key={d} onClick={() => setActiveDeg(d)}
              className={`flex-1 py-2 text-xs font-medium transition ${activeDeg === d ? 'text-white border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}`}>
              {DEGREE_LABELS[d]}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <p className="text-gray-400 text-sm text-center">Cargando…</p>
          ) : byDegree.length === 0 ? (
            <p className="text-gray-500 text-sm text-center">Sin preguntas para este grado aún.</p>
          ) : (
            byDegree.map((q, i) => (
              <div key={q.id} className="bg-logia-900 rounded-xl p-3 space-y-1">
                <div className="flex justify-between items-start">
                  <p className="text-xs font-semibold text-white">P{i + 1}. {q.question}</p>
                  <button onClick={() => handleDelete(q.id)} className="text-gray-600 hover:text-red-400 text-xs ml-2 shrink-0">🗑</button>
                </div>
                <ul className="space-y-0.5 mt-1">
                  {q.options.map((o, oi) => (
                    <li key={oi} className={`text-xs pl-2 ${oi === q.correctIndex ? 'text-green-400 font-semibold' : 'text-gray-400'}`}>
                      {['A', 'B', 'C', 'D'][oi]}. {o} {oi === q.correctIndex && '✅'}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}

          <div className="bg-logia-900 rounded-xl p-4 space-y-3 border border-logia-700">
            <p className="text-xs font-bold text-indigo-300">+ Nueva pregunta ({DEGREE_LABELS[activeDeg]})</p>
            <textarea
              value={form.question}
              onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
              placeholder="Escribe la pregunta…"
              rows={2}
              className="w-full bg-logia-800 border border-logia-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
            {form.options.map((opt, i) => (
              <div key={i} className="flex gap-2 items-center">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="correct" checked={form.correctIndex === i}
                    onChange={() => setForm(f => ({ ...f, correctIndex: i }))} className="accent-green-500" />
                  <span className="text-xs text-gray-400 w-4">{['A', 'B', 'C', 'D'][i]}.</span>
                </label>
                <input
                  type="text"
                  value={opt}
                  onChange={e => {
                    const opts = [...form.options];
                    opts[i] = e.target.value;
                    setForm(f => ({ ...f, options: opts }));
                  }}
                  placeholder={`Opción ${['A', 'B', 'C', 'D'][i]}`}
                  className="flex-1 bg-logia-800 border border-logia-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            ))}
            <p className="text-[10px] text-gray-500">Selecciona el radio de la opción correcta.</p>
            {err && <p className="text-red-400 text-xs">{err}</p>}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white text-xs font-bold"
            >
              {saving ? 'Guardando…' : '💾 Guardar pregunta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Biblioteca;
