import React, { useEffect, useMemo, useState } from 'react';
import { User, MasonicDegree } from '../types';
import { db, storage } from '../services/firebase';
import { addDoc, arrayRemove, arrayUnion, collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
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
const STYLE: Record<string, { border: string; badge: string; action: string }> = {
  aprendiz: { border: 'border-blue-600/70', badge: 'bg-blue-900/70 text-blue-200 border-blue-600', action: 'bg-blue-700 hover:bg-blue-600' },
  companero: { border: 'border-green-600/70', badge: 'bg-green-900/70 text-green-200 border-green-600', action: 'bg-green-700 hover:bg-green-600' },
  maestro: { border: 'border-red-600/70', badge: 'bg-red-900/70 text-red-200 border-red-600', action: 'bg-red-700 hover:bg-red-600' },
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
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const userDegree = degreeOf(user.degree);
  const userRank = RANK[userDegree];
  const currentGroupName = useMemo(() => groupNames[user.groupId] || user.groupId || 'Sin logia', [groupNames, user.groupId]);

  const loadLibrary = async () => {
    setLoading(true);
    try {
      const [groupsResult, ...collectionResults] = await Promise.allSettled([
        getDocs(collection(db, 'groups')),
        ...COLLECTIONS.map(async name => {
          try { return await getDocs(query(collection(db, name), orderBy('createdAt', 'desc'))); }
          catch { return await getDocs(collection(db, name)); }
        }),
      ]);
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
  useEffect(() => { void loadLibrary(); }, []);

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
    if (RANK[documentDegree] > userRank) { setMessage('No puedes publicar un trabajo de un grado superior al de tu perfil.'); return; }
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
        authorId: user.uid, authorName: user.name, authorDegree: userDegree, documentDegree,
        groupId: user.groupId || '', groupName: currentGroupName, likes: [], comments: [], createdAt: serverTimestamp(),
      });
      setTitle(''); setDescription(''); setPdfFile(null); setDocumentDegree(userDegree);
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
      setPosts(current => current.map(item => item.id === post.id && item.sourceCollection === post.sourceCollection
        ? { ...item, likes: liked ? item.likes.filter(uid => uid !== user.uid) : [...item.likes, user.uid] } : item));
    } catch { setMessage('No se pudo guardar el Me gusta.'); }
  };
  const addComment = async (post: LibraryPost) => {
    if (isReadOnly) return;
    const key = `${post.sourceCollection}/${post.id}`;
    const text = (commentDrafts[key] || '').trim();
    if (!text) return;
    const comment: LibraryComment = { id: `${user.uid}-${Date.now()}`, userId: user.uid, userName: user.name, text, createdAt: new Date().toISOString() };
    try {
      await updateDoc(doc(db, post.sourceCollection, post.id), { comments: arrayUnion(comment) });
      setPosts(current => current.map(item => item.id === post.id && item.sourceCollection === post.sourceCollection ? { ...item, comments: [...item.comments, comment] } : item));
      setCommentDrafts(current => ({ ...current, [key]: '' }));
    } catch { setMessage('No se pudo guardar el comentario.'); }
  };
  const openDocument = (post: LibraryPost, download: boolean) => {
    const degree = degreeOf(post.documentDegree);
    if (RANK[degree] > userRank) { setMessage(`Este trabajo es de grado ${LABEL[degree]}. Tu perfil no tiene autorización para abrirlo.`); return; }
    if (download) {
      const anchor = document.createElement('a'); anchor.href = post.pdfUrl; anchor.download = post.fileName || `${post.title}.pdf`; anchor.target = '_blank'; anchor.click();
    } else window.open(post.pdfUrl, '_blank', 'noopener,noreferrer');
  };

  return <div className="p-4 pb-24 space-y-4">
    <div className="bg-logia-800 border border-logia-700 rounded-xl p-5">
      <h2 className="text-2xl font-bold text-indigo-300">📚 Biblioteca de Alejandría</h2>
      <p className="text-sm text-gray-400 mt-1">Catálogo de trabajos de todas las logias. Tu grado actual: <strong>{LABEL[userDegree]}</strong>.</p>
    </div>

    {!isReadOnly && <details className="bg-logia-800 border border-logia-700 rounded-xl p-4">
      <summary className="font-bold text-white cursor-pointer">➕ Publicar un PDF</summary>
      <form onSubmit={upload} className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Título del documento" className="bg-logia-900 border border-logia-700 rounded p-3 text-white" />
        <select value={documentDegree} onChange={event => setDocumentDegree(event.target.value as MasonicDegree)} className="bg-logia-900 border border-logia-700 rounded p-3 text-white">
          <option value="aprendiz">Trabajo de Aprendiz</option>{userRank >= 2 && <option value="companero">Trabajo de Compañero</option>}{userRank >= 3 && <option value="maestro">Trabajo de Maestro</option>}
        </select>
        <textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Descripción opcional" rows={2} className="md:col-span-2 bg-logia-900 border border-logia-700 rounded p-3 text-white" />
        <input id="library-pdf-input" type="file" accept="application/pdf,.pdf" onChange={event => setPdfFile(event.target.files?.[0] || null)} className="text-sm text-gray-300" />
        <button type="submit" disabled={uploading} className="bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold px-4 py-2 rounded">{uploading ? 'Subiendo…' : '⬆️ Publicar PDF'}</button>
      </form>
    </details>}

    <div className="bg-logia-800 border border-logia-700 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
      <input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Buscar título, usuario o logia" className="lg:col-span-2 bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
      <select value={sortMode} onChange={event => setSortMode(event.target.value as SortMode)} className="bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm"><option value="recent">Más recientes</option><option value="likes">Más likes</option><option value="author">Por usuario</option><option value="lodge">Por logia</option></select>
      <select value={authorFilter} onChange={event => setAuthorFilter(event.target.value)} className="bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm"><option value="all">Todos los usuarios</option>{authors.map(author => <option key={author} value={author}>{author}</option>)}</select>
      <select value={lodgeFilter} onChange={event => setLodgeFilter(event.target.value)} className="bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm"><option value="all">Todas las logias</option>{lodges.map(lodge => <option key={lodge} value={lodge}>{lodge}</option>)}</select>
      <select value={degreeFilter} onChange={event => setDegreeFilter(event.target.value)} className="bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm"><option value="all">Todos los grados</option><option value="aprendiz">Aprendiz</option><option value="companero">Compañero</option><option value="maestro">Maestro</option></select>
      <button onClick={() => { setSearchText(''); setSortMode('recent'); setAuthorFilter('all'); setLodgeFilter('all'); setDegreeFilter('all'); }} className="bg-logia-900 border border-logia-700 rounded p-2 text-gray-300 text-sm">Limpiar filtros</button>
    </div>

    {message && <div className="bg-blue-900/30 border border-blue-700 text-blue-200 rounded p-3 text-sm">{message}</div>}
    {loading ? <div className="text-center text-gray-400 py-10">Cargando documentos…</div> : visiblePosts.length === 0 ? <div className="bg-logia-800 border border-dashed border-logia-700 rounded-xl p-8 text-center text-gray-400">No hay documentos que coincidan con los filtros.</div> : <>
      <p className="text-xs text-gray-500">{visiblePosts.length} documento(s)</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visiblePosts.map(post => {
          const key = `${post.sourceCollection}/${post.id}`;
          const degree = degreeOf(post.documentDegree); const style = STYLE[degree]; const allowed = RANK[degree] <= userRank;
          const liked = post.likes.includes(user.uid); const lodge = post.groupName || groupNames[post.groupId || ''] || 'Logia no indicada'; const expanded = expandedPost === key;
          return <article key={key} className={`bg-logia-800 border ${style.border} rounded-xl p-4 flex flex-col gap-3 shadow-md`}>
            <div className="flex justify-between gap-2 items-start"><h3 className="font-bold text-white leading-snug line-clamp-2">{post.title}</h3><span className={`shrink-0 text-[10px] px-2 py-1 rounded border ${style.badge}`}>{LABEL[degree]}</span></div>
            <div className="text-xs text-gray-400 space-y-1"><p className="truncate">👤 {post.authorName}</p><p className="truncate">🏛️ {lodge}</p></div>
            {!allowed && <p className="text-xs text-yellow-300 bg-yellow-900/30 border border-yellow-700 rounded p-2">🔒 Visible, pero requiere grado {LABEL[degree]}.</p>}
            <div className="grid grid-cols-2 gap-2 mt-auto">
              <button onClick={() => openDocument(post, false)} className={`${allowed ? style.action : 'bg-gray-700 hover:bg-gray-600'} text-white rounded px-2 py-2 text-xs font-bold`}>{allowed ? '📖 Abrir' : '🔒 Abrir'}</button>
              <button onClick={() => openDocument(post, true)} className={`${allowed ? 'bg-logia-900 hover:bg-logia-700' : 'bg-gray-700 hover:bg-gray-600'} border border-logia-700 text-white rounded px-2 py-2 text-xs font-bold`}>⬇️ Descargar</button>
              <button onClick={() => void toggleLike(post)} disabled={isReadOnly} className={`${liked ? 'bg-pink-700' : 'bg-logia-900'} border border-logia-700 text-white rounded px-2 py-2 text-xs`}>{liked ? '❤️' : '🤍'} {post.likes.length}</button>
              <button onClick={() => setExpandedPost(expanded ? null : key)} className="bg-logia-900 border border-logia-700 text-gray-200 rounded px-2 py-2 text-xs">💬 {post.comments.length}</button>
            </div>
            {expanded && <div className="border-t border-logia-700 pt-3 space-y-2">{post.description && <p className="text-xs text-gray-300">{post.description}</p>}{post.comments.map(comment => <div key={comment.id || `${comment.userId}-${comment.createdAt}`} className="bg-logia-900 rounded p-2 text-xs"><strong className="text-indigo-300">{comment.userName}:</strong> {comment.text}</div>)}{!isReadOnly && <div className="flex gap-1"><input value={commentDrafts[key] || ''} onChange={event => setCommentDrafts(current => ({ ...current, [key]: event.target.value }))} placeholder="Comentario" className="min-w-0 flex-1 bg-logia-900 border border-logia-700 rounded p-2 text-white text-xs" /><button onClick={() => void addComment(post)} className="bg-indigo-700 text-white rounded px-2 text-xs">Enviar</button></div>}</div>}
          </article>;
        })}
      </div>
    </>}
  </div>;
};

export default Library;
