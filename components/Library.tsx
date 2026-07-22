import React, { useEffect, useMemo, useState } from 'react';
import { User, MasonicDegree } from '../types';
import { db, storage } from '../services/firebase';
import { addDoc, arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useReadOnly } from '../contexts/ReadOnlyContext';

type LibraryComment = { id?: string; userId: string; userName: string; text: string; createdAt?: string };
type LibraryPost = {
  id: string; sourceCollection: string; title: string; description: string; pdfUrl: string; fileName?: string;
  authorId: string; authorName: string; authorDegree?: string; documentDegree?: string;
  groupId?: string; groupName?: string; createdAt?: any; likes: string[]; comments: LibraryComment[];
};
interface Props { user: User }
type SortMode = 'recent' | 'likes' | 'author' | 'lodge';

const COLLECTIONS = ['libraryPosts', 'biblioteca', 'bibliotecaAlejandria', 'library', 'publications', 'documents'];
const RANK: Record<string, number> = { aprendiz: 1, companero: 2, compañero: 2, maestro: 3 };
const LABEL: Record<string, string> = { aprendiz: 'Aprendiz', companero: 'Compañero', compañero: 'Compañero', maestro: 'Maestro' };
const STYLE: Record<string, { border: string; badge: string; accent: string }> = {
  aprendiz: { border: 'border-blue-600', badge: 'bg-blue-900/70 text-blue-200 border-blue-600', accent: 'text-blue-300' },
  companero: { border: 'border-green-600', badge: 'bg-green-900/70 text-green-200 border-green-600', accent: 'text-green-300' },
  maestro: { border: 'border-red-600', badge: 'bg-red-900/70 text-red-200 border-red-600', accent: 'text-red-300' },
};

const degreeOf = (value?: string): MasonicDegree => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'maestro') return 'maestro';
  if (normalized === 'companero' || normalized === 'compañero') return 'companero';
  return 'aprendiz';
};
const timeOf = (value: any): number => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const normalizePost = (sourceCollection: string, id: string, raw: any): LibraryPost | null => {
  const pdfUrl = raw.pdfUrl || raw.fileUrl || raw.downloadUrl || raw.url || raw.pdf || '';
  if (!pdfUrl) return null;
  const likes = Array.isArray(raw.likes) ? raw.likes : Array.isArray(raw.likedBy) ? raw.likedBy : [];
  const comments = Array.isArray(raw.comments) ? raw.comments : [];
  return {
    id, sourceCollection,
    title: raw.title || raw.name || raw.documentTitle || raw.fileName || 'Documento sin título',
    description: raw.description || raw.summary || raw.content || '', pdfUrl, fileName: raw.fileName || raw.filename,
    authorId: raw.authorId || raw.userId || raw.createdBy || '',
    authorName: raw.authorName || raw.userName || raw.createdByName || raw.author || 'Usuario',
    authorDegree: raw.authorDegree || raw.degree || raw.masonicDegree,
    documentDegree: raw.documentDegree || raw.workDegree || raw.targetDegree || raw.grade || raw.authorDegree || raw.degree || 'aprendiz',
    groupId: raw.groupId || raw.lodgeId, groupName: raw.groupName || raw.lodgeName || raw.logiaName,
    createdAt: raw.createdAt || raw.date || raw.uploadedAt,
    likes: likes.filter((value: unknown) => typeof value === 'string'),
    comments: comments.map((comment: any, index: number) => ({
      id: comment.id || `${id}-${index}`, userId: comment.userId || comment.uid || '',
      userName: comment.userName || comment.name || 'Usuario', text: comment.text || comment.comment || '',
      createdAt: comment.createdAt || comment.date,
    })).filter((comment: LibraryComment) => comment.text),
  };
};

const Library: React.FC<Props> = ({ user }) => {
  const isReadOnly = useReadOnly();
  const [posts, setPosts] = useState<LibraryPost[]>([]);
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  const [profileDegree, setProfileDegree] = useState<MasonicDegree>(degreeOf(user.degree));
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [documentDegree, setDocumentDegree] = useState<MasonicDegree>(degreeOf(user.degree));
  const [searchText, setSearchText] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [authorFilter, setAuthorFilter] = useState('all');
  const [lodgeFilter, setLodgeFilter] = useState('all');
  const [degreeFilter, setDegreeFilter] = useState('all');
  const [selectedPost, setSelectedPost] = useState<LibraryPost | null>(null);
  const [commentDraft, setCommentDraft] = useState('');

  const userRank = RANK[profileDegree];
  const currentGroupName = useMemo(() => groupNames[user.groupId] || user.groupId || 'Sin logia', [groupNames, user.groupId]);

  const loadLibrary = async () => {
    setLoading(true);
    try {
      const [profileResult, groupsResult, ...collectionResults] = await Promise.allSettled([
        getDoc(doc(db, 'users', user.uid)),
        getDocs(collection(db, 'groups')),
        ...COLLECTIONS.map(async name => {
          try { return await getDocs(query(collection(db, name), orderBy('createdAt', 'desc'))); }
          catch { return await getDocs(collection(db, name)); }
        }),
      ]);
      if (profileResult.status === 'fulfilled' && profileResult.value.exists()) {
        const currentDegree = degreeOf(profileResult.value.data()?.degree);
        setProfileDegree(currentDegree);
        setDocumentDegree(current => RANK[current] <= RANK[currentDegree] ? current : currentDegree);
      }
      if (groupsResult.status === 'fulfilled') {
        const names: Record<string, string> = {};
        groupsResult.value.docs.forEach(groupDoc => { names[groupDoc.id] = String(groupDoc.data()?.name || groupDoc.id); });
        setGroupNames(names);
      }
      const recovered: LibraryPost[] = [];
      collectionResults.forEach((result, index) => {
        if (result.status !== 'fulfilled') return;
        result.value.docs.forEach(postDoc => {
          const post = normalizePost(COLLECTIONS[index], postDoc.id, postDoc.data());
          if (post) recovered.push(post);
        });
      });
      const unique = new Map<string, LibraryPost>();
      recovered.sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt)).forEach(post => {
        if (!unique.has(post.pdfUrl)) unique.set(post.pdfUrl, post);
      });
      setPosts([...unique.values()]);
    } catch (error) {
      console.error(error); setMessage('No se pudo cargar la Biblioteca.');
    } finally { setLoading(false); }
  };
  useEffect(() => { void loadLibrary(); }, [user.uid]);

  const authors = useMemo(() => [...new Set(posts.map(post => post.authorName).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [posts]);
  const lodges = useMemo(() => [...new Set(posts.map(post => post.groupName || groupNames[post.groupId || ''] || 'Logia no indicada'))].sort((a, b) => a.localeCompare(b)), [posts, groupNames]);
  const visiblePosts = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    return posts.filter(post => {
      const lodge = post.groupName || groupNames[post.groupId || ''] || 'Logia no indicada';
      const degree = degreeOf(post.documentDegree);
      if (text && !`${post.title} ${post.authorName} ${lodge}`.toLowerCase().includes(text)) return false;
      if (authorFilter !== 'all' && post.authorName !== authorFilter) return false;
      if (lodgeFilter !== 'all' && lodge !== lodgeFilter) return false;
      if (degreeFilter !== 'all' && degree !== degreeFilter) return false;
      return true;
    }).sort((a, b) => {
      if (sortMode === 'likes') return b.likes.length - a.likes.length || timeOf(b.createdAt) - timeOf(a.createdAt);
      if (sortMode === 'author') return a.authorName.localeCompare(b.authorName) || a.title.localeCompare(b.title);
      if (sortMode === 'lodge') return (a.groupName || '').localeCompare(b.groupName || '') || a.title.localeCompare(b.title);
      return timeOf(b.createdAt) - timeOf(a.createdAt);
    });
  }, [posts, searchText, sortMode, authorFilter, lodgeFilter, degreeFilter, groupNames]);

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isReadOnly) return;
    if (!title.trim() || !pdfFile) { setMessage('Escribe un título, selecciona el grado y adjunta un PDF.'); return; }
    if (RANK[documentDegree] > userRank) { setMessage('No puedes publicar un trabajo de un grado superior al asignado en Gestión de miembros.'); return; }
    if (pdfFile.type !== 'application/pdf' && !pdfFile.name.toLowerCase().endsWith('.pdf')) { setMessage('Solo se permiten archivos PDF.'); return; }
    setUploading(true); setMessage('');
    try {
      const safeName = pdfFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `library/${user.groupId || 'sin-logia'}/${user.uid}/${Date.now()}-${safeName}`;
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, pdfFile, { contentType: 'application/pdf' });
      const pdfUrl = await getDownloadURL(fileRef);
      await addDoc(collection(db, 'libraryPosts'), {
        title: title.trim(), description: description.trim(), pdfUrl, fileName: pdfFile.name, storagePath,
        authorId: user.uid, authorName: user.name, authorDegree: profileDegree, documentDegree,
        groupId: user.groupId || '', groupName: currentGroupName, likes: [], comments: [], createdAt: serverTimestamp(),
      });
      setTitle(''); setDescription(''); setPdfFile(null); setDocumentDegree(profileDegree);
      const input = document.getElementById('library-pdf-input') as HTMLInputElement | null;
      if (input) input.value = '';
      setMessage('PDF publicado correctamente.'); await loadLibrary();
    } catch (error) { console.error(error); setMessage('No se pudo publicar el PDF.'); }
    finally { setUploading(false); }
  };

  const toggleLike = async (post: LibraryPost) => {
    if (isReadOnly) return;
    const liked = post.likes.includes(user.uid);
    try {
      await updateDoc(doc(db, post.sourceCollection, post.id), { likes: liked ? arrayRemove(user.uid) : arrayUnion(user.uid) });
      const nextLikes = liked ? post.likes.filter(uid => uid !== user.uid) : [...post.likes, user.uid];
      setPosts(current => current.map(item => item.id === post.id && item.sourceCollection === post.sourceCollection ? { ...item, likes: nextLikes } : item));
      setSelectedPost(current => current?.id === post.id && current.sourceCollection === post.sourceCollection ? { ...current, likes: nextLikes } : current);
    } catch { setMessage('No se pudo guardar el Me gusta.'); }
  };
  const addComment = async (post: LibraryPost) => {
    if (isReadOnly || !commentDraft.trim()) return;
    const comment: LibraryComment = { id: `${user.uid}-${Date.now()}`, userId: user.uid, userName: user.name, text: commentDraft.trim(), createdAt: new Date().toISOString() };
    try {
      await updateDoc(doc(db, post.sourceCollection, post.id), { comments: arrayUnion(comment) });
      const nextComments = [...post.comments, comment];
      setPosts(current => current.map(item => item.id === post.id && item.sourceCollection === post.sourceCollection ? { ...item, comments: nextComments } : item));
      setSelectedPost({ ...post, comments: nextComments });
      setCommentDraft('');
    } catch { setMessage('No se pudo guardar el comentario.'); }
  };
  const openDocument = (post: LibraryPost, download: boolean) => {
    const degree = degreeOf(post.documentDegree);
    if (RANK[degree] > userRank) { setMessage(`Este trabajo es de grado ${LABEL[degree]}. Tu grado asignado en Gestión de miembros es ${LABEL[profileDegree]}.`); return; }
    if (download) {
      const anchor = document.createElement('a'); anchor.href = post.pdfUrl; anchor.download = post.fileName || `${post.title}.pdf`; anchor.target = '_blank'; anchor.click();
    } else window.open(post.pdfUrl, '_blank', 'noopener,noreferrer');
  };

  return <div className="p-3 pb-24 space-y-3">
    <div className="bg-logia-800 border border-logia-700 rounded-xl p-4">
      <h2 className="text-xl font-bold text-indigo-300">📚 Biblioteca de Alejandría</h2>
      <p className="text-xs text-gray-400 mt-1">Tu grado actual, tomado de Gestión de miembros: <strong>{LABEL[profileDegree]}</strong>.</p>
    </div>

    {!isReadOnly && <details className="bg-logia-800 border border-logia-700 rounded-xl p-3">
      <summary className="font-bold text-sm text-white cursor-pointer">➕ Publicar un PDF</summary>
      <form onSubmit={upload} className="mt-3 grid grid-cols-1 gap-2">
        <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Título del documento" className="bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
        <select value={documentDegree} onChange={event => setDocumentDegree(event.target.value as MasonicDegree)} className="bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm">
          <option value="aprendiz">Trabajo de Aprendiz</option>{userRank >= 2 && <option value="companero">Trabajo de Compañero</option>}{userRank >= 3 && <option value="maestro">Trabajo de Maestro</option>}
        </select>
        <textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Descripción opcional" rows={2} className="bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
        <input id="library-pdf-input" type="file" accept="application/pdf,.pdf" onChange={event => setPdfFile(event.target.files?.[0] || null)} className="text-xs text-gray-300" />
        <button type="submit" disabled={uploading} className="bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold px-3 py-2 rounded text-sm">{uploading ? 'Subiendo…' : '⬆️ Publicar PDF'}</button>
      </form>
    </details>}

    <details className="bg-logia-800 border border-logia-700 rounded-xl p-3">
      <summary className="font-bold text-sm text-white cursor-pointer">🔎 Buscar y filtrar</summary>
      <div className="mt-3 grid grid-cols-1 gap-2">
        <input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Buscar título, usuario o logia" className="bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
        <select value={sortMode} onChange={event => setSortMode(event.target.value as SortMode)} className="bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm"><option value="recent">Más recientes</option><option value="likes">Más likes</option><option value="author">Por usuario</option><option value="lodge">Por logia</option></select>
        <select value={authorFilter} onChange={event => setAuthorFilter(event.target.value)} className="bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm"><option value="all">Todos los usuarios</option>{authors.map(author => <option key={author} value={author}>{author}</option>)}</select>
        <select value={lodgeFilter} onChange={event => setLodgeFilter(event.target.value)} className="bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm"><option value="all">Todas las logias</option>{lodges.map(lodge => <option key={lodge} value={lodge}>{lodge}</option>)}</select>
        <select value={degreeFilter} onChange={event => setDegreeFilter(event.target.value)} className="bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm"><option value="all">Todos los grados</option><option value="aprendiz">Aprendiz</option><option value="companero">Compañero</option><option value="maestro">Maestro</option></select>
        <button onClick={() => { setSearchText(''); setSortMode('recent'); setAuthorFilter('all'); setLodgeFilter('all'); setDegreeFilter('all'); }} className="bg-logia-900 border border-logia-700 rounded p-2 text-gray-300 text-sm">Limpiar filtros</button>
      </div>
    </details>

    {message && <div className="bg-blue-900/30 border border-blue-700 text-blue-200 rounded p-3 text-xs">{message}</div>}
    {loading ? <div className="text-center text-gray-400 py-10">Cargando documentos…</div> : visiblePosts.length === 0 ? <div className="bg-logia-800 border border-dashed border-logia-700 rounded-xl p-6 text-center text-gray-400 text-sm">No hay documentos que coincidan con los filtros.</div> : <>
      <p className="text-xs text-gray-500 px-1">{visiblePosts.length} documento(s)</p>
      <div className="space-y-2">
        {visiblePosts.map(post => {
          const degree = degreeOf(post.documentDegree); const style = STYLE[degree]; const allowed = RANK[degree] <= userRank;
          const lodge = post.groupName || groupNames[post.groupId || ''] || 'Logia no indicada';
          return <button key={`${post.sourceCollection}/${post.id}`} onClick={() => { setSelectedPost(post); setCommentDraft(''); }} className={`w-full text-left bg-logia-800 border-l-4 ${style.border} border-y border-r border-logia-700 rounded-lg px-3 py-2.5 active:bg-logia-700`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-white text-sm leading-tight truncate">{post.title}</h3>
                <p className="text-[11px] text-gray-400 truncate mt-1">{post.authorName} · {LABEL[degree]} · {lodge}</p>
              </div>
              <div className="shrink-0 text-[11px] text-gray-400 flex gap-2"><span>❤️ {post.likes.length}</span><span>💬 {post.comments.length}</span>{!allowed && <span title={`Requiere grado ${LABEL[degree]}`}>🔒</span>}</div>
            </div>
          </button>;
        })}
      </div>
    </>}

    {selectedPost && (() => {
      const degree = degreeOf(selectedPost.documentDegree); const style = STYLE[degree]; const allowed = RANK[degree] <= userRank;
      const lodge = selectedPost.groupName || groupNames[selectedPost.groupId || ''] || 'Logia no indicada';
      const liked = selectedPost.likes.includes(user.uid);
      return <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center" onClick={() => setSelectedPost(null)}>
        <div className={`bg-logia-800 w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border-t-4 ${style.border} p-4`} onClick={event => event.stopPropagation()}>
          <div className="flex justify-between gap-3 items-start">
            <div><h3 className="text-lg font-bold text-white">{selectedPost.title}</h3><p className="text-xs text-gray-400 mt-1">{selectedPost.authorName} · {lodge}</p></div>
            <button onClick={() => setSelectedPost(null)} className="text-2xl text-gray-400 px-2">×</button>
          </div>
          <span className={`inline-block mt-3 text-xs px-2 py-1 rounded border ${style.badge}`}>{LABEL[degree]}</span>
          {selectedPost.description && <p className="text-sm text-gray-300 mt-3 whitespace-pre-wrap">{selectedPost.description}</p>}
          {!allowed && <div className="mt-3 bg-yellow-900/30 border border-yellow-700 text-yellow-200 rounded p-3 text-sm">🔒 Este documento requiere grado {LABEL[degree]}. Tu grado asignado en Gestión de miembros es {LABEL[profileDegree]}.</div>}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button onClick={() => openDocument(selectedPost, false)} className={`${allowed ? 'bg-indigo-700 hover:bg-indigo-600' : 'bg-gray-700'} text-white rounded py-2 text-sm font-bold`}>{allowed ? '📖 Abrir' : '🔒 Abrir'}</button>
            <button onClick={() => openDocument(selectedPost, true)} className={`${allowed ? 'bg-green-800 hover:bg-green-700' : 'bg-gray-700'} text-white rounded py-2 text-sm font-bold`}>⬇️ Descargar</button>
            <button onClick={() => void toggleLike(selectedPost)} disabled={isReadOnly} className={`${liked ? 'bg-pink-700' : 'bg-logia-900'} border border-logia-700 text-white rounded py-2 text-sm`}>{liked ? '❤️ Me gusta' : '🤍 Me gusta'} ({selectedPost.likes.length})</button>
            <div className="bg-logia-900 border border-logia-700 text-gray-300 rounded py-2 text-sm text-center">💬 {selectedPost.comments.length}</div>
          </div>
          <div className="border-t border-logia-700 mt-4 pt-3 space-y-2">
            <h4 className="font-bold text-sm text-white">Comentarios</h4>
            {selectedPost.comments.length === 0 && <p className="text-xs text-gray-500">Aún no hay comentarios.</p>}
            {selectedPost.comments.map(comment => <div key={comment.id || `${comment.userId}-${comment.createdAt}`} className="bg-logia-900 rounded p-2 text-xs"><strong className={style.accent}>{comment.userName}:</strong> <span className="text-gray-300">{comment.text}</span></div>)}
            {!isReadOnly && <div className="flex gap-2"><input value={commentDraft} onChange={event => setCommentDraft(event.target.value)} placeholder="Escribe un comentario" className="min-w-0 flex-1 bg-logia-900 border border-logia-700 rounded p-2 text-white text-xs" /><button onClick={() => void addComment(selectedPost)} className="bg-indigo-700 text-white rounded px-3 text-xs">Enviar</button></div>}
          </div>
        </div>
      </div>;
    })()}
  </div>;
};

export default Library;
