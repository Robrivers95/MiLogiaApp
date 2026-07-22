import React, { useEffect, useMemo, useState } from 'react';
import { User } from '../types';
import { db, storage } from '../services/firebase';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useReadOnly } from '../contexts/ReadOnlyContext';

type LibraryComment = {
  id?: string;
  userId: string;
  userName: string;
  text: string;
  createdAt?: string;
};

type LibraryPost = {
  id: string;
  sourceCollection: string;
  title: string;
  description: string;
  pdfUrl: string;
  fileName?: string;
  authorId: string;
  authorName: string;
  authorDegree?: string;
  groupId?: string;
  groupName?: string;
  createdAt?: any;
  likes: string[];
  comments: LibraryComment[];
};

interface Props {
  user: User;
}

// The old feature is no longer present in the repository history. These aliases let the
// UI recover documents from the most likely legacy collection names without migrating or
// deleting any production data. New posts use `libraryPosts`.
const LIBRARY_COLLECTIONS = [
  'libraryPosts',
  'biblioteca',
  'bibliotecaAlejandria',
  'library',
  'publications',
  'documents',
];

const asDateValue = (value: any): number => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePost = (collectionName: string, id: string, raw: any): LibraryPost | null => {
  const pdfUrl = raw.pdfUrl || raw.fileUrl || raw.downloadUrl || raw.url || raw.pdf || '';
  if (!pdfUrl) return null;

  const rawLikes = Array.isArray(raw.likes) ? raw.likes : Array.isArray(raw.likedBy) ? raw.likedBy : [];
  const rawComments = Array.isArray(raw.comments) ? raw.comments : [];

  return {
    id,
    sourceCollection: collectionName,
    title: raw.title || raw.name || raw.documentTitle || raw.fileName || 'Documento sin título',
    description: raw.description || raw.summary || raw.content || '',
    pdfUrl,
    fileName: raw.fileName || raw.filename,
    authorId: raw.authorId || raw.userId || raw.createdBy || '',
    authorName: raw.authorName || raw.userName || raw.createdByName || raw.author || 'Usuario',
    authorDegree: raw.authorDegree || raw.degree || raw.masonicDegree,
    groupId: raw.groupId || raw.lodgeId,
    groupName: raw.groupName || raw.lodgeName || raw.logiaName,
    createdAt: raw.createdAt || raw.date || raw.uploadedAt,
    likes: rawLikes.filter((value: unknown) => typeof value === 'string'),
    comments: rawComments
      .map((comment: any, index: number) => ({
        id: comment.id || `${id}-${index}`,
        userId: comment.userId || comment.uid || '',
        userName: comment.userName || comment.name || 'Usuario',
        text: comment.text || comment.comment || '',
        createdAt: comment.createdAt || comment.date,
      }))
      .filter((comment: LibraryComment) => comment.text),
  };
};

const Library: React.FC<Props> = ({ user }) => {
  const isReadOnly = useReadOnly();
  const [posts, setPosts] = useState<LibraryPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});

  const loadLibrary = async () => {
    setLoading(true);
    try {
      const [groupsResult, ...collectionResults] = await Promise.allSettled([
        getDocs(collection(db, 'groups')),
        ...LIBRARY_COLLECTIONS.map(async collectionName => {
          try {
            return await getDocs(query(collection(db, collectionName), orderBy('createdAt', 'desc')));
          } catch {
            // Legacy collections may not have a createdAt index/field.
            return await getDocs(collection(db, collectionName));
          }
        }),
      ]);

      if (groupsResult.status === 'fulfilled') {
        const names: Record<string, string> = {};
        groupsResult.value.docs.forEach(groupDoc => {
          names[groupDoc.id] = String(groupDoc.data()?.name || groupDoc.id);
        });
        setGroupNames(names);
      }

      const recovered: LibraryPost[] = [];
      collectionResults.forEach((result, index) => {
        if (result.status !== 'fulfilled') return;
        const collectionName = LIBRARY_COLLECTIONS[index];
        result.value.docs.forEach(postDoc => {
          const post = normalizePost(collectionName, postDoc.id, postDoc.data());
          if (post) recovered.push(post);
        });
      });

      // Deduplicate aliases pointing to the same PDF while preserving the original document.
      const unique = new Map<string, LibraryPost>();
      recovered
        .sort((a, b) => asDateValue(b.createdAt) - asDateValue(a.createdAt))
        .forEach(post => {
          const key = post.pdfUrl || `${post.sourceCollection}/${post.id}`;
          if (!unique.has(key)) unique.set(key, post);
        });
      setPosts(Array.from(unique.values()));
    } catch (error) {
      console.error('Error loading library:', error);
      setMessage('No se pudo cargar la Biblioteca. Revisa las reglas de Firebase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLibrary();
  }, []);

  const currentGroupName = useMemo(
    () => groupNames[user.groupId] || user.groupId || 'Sin logia',
    [groupNames, user.groupId],
  );

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isReadOnly) return;
    if (!title.trim() || !pdfFile) {
      setMessage('Escribe un título y selecciona un archivo PDF.');
      return;
    }
    if (pdfFile.type !== 'application/pdf' && !pdfFile.name.toLowerCase().endsWith('.pdf')) {
      setMessage('Solo se permiten archivos PDF.');
      return;
    }

    setUploading(true);
    setMessage('');
    try {
      const safeName = pdfFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `library/${user.groupId || 'sin-logia'}/${user.uid}/${Date.now()}-${safeName}`;
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, pdfFile, { contentType: 'application/pdf' });
      const pdfUrl = await getDownloadURL(fileRef);

      await addDoc(collection(db, 'libraryPosts'), {
        title: title.trim(),
        description: description.trim(),
        pdfUrl,
        fileName: pdfFile.name,
        storagePath,
        authorId: user.uid,
        authorName: user.name,
        authorDegree: user.degree || '',
        groupId: user.groupId || '',
        groupName: currentGroupName,
        likes: [],
        comments: [],
        createdAt: serverTimestamp(),
      });

      setTitle('');
      setDescription('');
      setPdfFile(null);
      const input = document.getElementById('library-pdf-input') as HTMLInputElement | null;
      if (input) input.value = '';
      setMessage('PDF publicado correctamente.');
      await loadLibrary();
    } catch (error) {
      console.error('Error uploading PDF:', error);
      setMessage('No se pudo publicar el PDF. Revisa permisos de Firestore y Storage.');
    } finally {
      setUploading(false);
    }
  };

  const toggleLike = async (post: LibraryPost) => {
    if (isReadOnly) return;
    const liked = post.likes.includes(user.uid);
    try {
      await updateDoc(doc(db, post.sourceCollection, post.id), {
        likes: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
      });
      setPosts(current => current.map(item => item.id === post.id && item.sourceCollection === post.sourceCollection
        ? { ...item, likes: liked ? item.likes.filter(uid => uid !== user.uid) : [...item.likes, user.uid] }
        : item));
    } catch (error) {
      console.error('Error updating like:', error);
      setMessage('No se pudo guardar el Me gusta en este documento.');
    }
  };

  const addComment = async (post: LibraryPost) => {
    if (isReadOnly) return;
    const text = (commentDrafts[`${post.sourceCollection}/${post.id}`] || '').trim();
    if (!text) return;

    const comment: LibraryComment = {
      id: `${user.uid}-${Date.now()}`,
      userId: user.uid,
      userName: user.name,
      text,
      createdAt: new Date().toISOString(),
    };

    try {
      await updateDoc(doc(db, post.sourceCollection, post.id), {
        comments: arrayUnion(comment),
      });
      setPosts(current => current.map(item => item.id === post.id && item.sourceCollection === post.sourceCollection
        ? { ...item, comments: [...item.comments, comment] }
        : item));
      setCommentDrafts(current => ({ ...current, [`${post.sourceCollection}/${post.id}`]: '' }));
    } catch (error) {
      console.error('Error adding comment:', error);
      setMessage('No se pudo guardar el comentario en este documento.');
    }
  };

  return (
    <div className="p-4 pb-24 space-y-5">
      <div className="bg-logia-800 border border-logia-700 rounded-xl p-5">
        <h2 className="text-2xl font-bold text-indigo-300">📚 Biblioteca de Alejandría</h2>
        <p className="text-sm text-gray-400 mt-1">
          Comparte y consulta documentos de las logias registradas. Los documentos anteriores se recuperan sin migrarlos ni eliminarlos.
        </p>
      </div>

      {!isReadOnly && (
        <form onSubmit={handleUpload} className="bg-logia-800 border border-logia-700 rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-white">Publicar un PDF</h3>
          <input
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Título del documento"
            className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
          />
          <textarea
            value={description}
            onChange={event => setDescription(event.target.value)}
            placeholder="Descripción opcional"
            rows={3}
            className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
          />
          <input
            id="library-pdf-input"
            type="file"
            accept="application/pdf,.pdf"
            onChange={event => setPdfFile(event.target.files?.[0] || null)}
            className="w-full text-sm text-gray-300"
          />
          <p className="text-xs text-gray-500">
            Se publicará como {user.name} · {user.degree || 'grado no indicado'} · {currentGroupName}
          </p>
          <button
            type="submit"
            disabled={uploading}
            className="bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold px-4 py-2 rounded"
          >
            {uploading ? 'Subiendo…' : '⬆️ Publicar PDF'}
          </button>
        </form>
      )}

      {message && <div className="bg-blue-900/30 border border-blue-700 text-blue-200 rounded p-3 text-sm">{message}</div>}

      {loading ? (
        <div className="text-center text-gray-400 py-10">Cargando documentos…</div>
      ) : posts.length === 0 ? (
        <div className="bg-logia-800 border border-dashed border-logia-700 rounded-xl p-8 text-center text-gray-400">
          No se encontraron PDFs en las colecciones actuales o heredadas.
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map(post => {
            const key = `${post.sourceCollection}/${post.id}`;
            const liked = post.likes.includes(user.uid);
            return (
              <article key={key} className="bg-logia-800 border border-logia-700 rounded-xl p-5 space-y-3">
                <div>
                  <h3 className="text-lg font-bold text-white">{post.title}</h3>
                  <p className="text-xs text-indigo-300 mt-1">
                    {post.authorName} · {post.authorDegree || 'grado no indicado'} · {post.groupName || groupNames[post.groupId || ''] || 'Logia no indicada'}
                  </p>
                  {post.description && <p className="text-sm text-gray-300 mt-3 whitespace-pre-wrap">{post.description}</p>}
                </div>

                <div className="flex flex-wrap gap-2">
                  <a
                    href={post.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-blue-700 hover:bg-blue-600 text-white px-3 py-2 rounded text-sm"
                  >
                    📖 Leer PDF
                  </a>
                  <a
                    href={post.pdfUrl}
                    download={post.fileName || `${post.title}.pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-green-800 hover:bg-green-700 text-white px-3 py-2 rounded text-sm"
                  >
                    ⬇️ Descargar
                  </a>
                  <button
                    onClick={() => void toggleLike(post)}
                    disabled={isReadOnly}
                    className={`${liked ? 'bg-pink-700' : 'bg-logia-900'} border border-logia-700 hover:bg-pink-800 text-white px-3 py-2 rounded text-sm disabled:opacity-50`}
                  >
                    {liked ? '❤️' : '🤍'} {post.likes.length}
                  </button>
                </div>

                <div className="border-t border-logia-700 pt-3 space-y-2">
                  <p className="text-xs uppercase font-bold text-gray-500">Comentarios ({post.comments.length})</p>
                  {post.comments.map(comment => (
                    <div key={comment.id || `${comment.userId}-${comment.createdAt}`} className="bg-logia-900 rounded p-2 text-sm">
                      <span className="font-bold text-indigo-300">{comment.userName}: </span>
                      <span className="text-gray-300">{comment.text}</span>
                    </div>
                  ))}
                  {!isReadOnly && (
                    <div className="flex gap-2">
                      <input
                        value={commentDrafts[key] || ''}
                        onChange={event => setCommentDrafts(current => ({ ...current, [key]: event.target.value }))}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void addComment(post);
                          }
                        }}
                        placeholder="Escribe un comentario"
                        className="flex-1 bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm"
                      />
                      <button onClick={() => void addComment(post)} className="bg-indigo-700 hover:bg-indigo-600 text-white px-3 rounded text-sm">
                        Enviar
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Library;
