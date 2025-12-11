
import React, { useState, useEffect } from 'react';
import { authService, dataService } from '../services/api';
import { User, Group } from '../types';

interface Props {
  onLogin: (user: User) => void;
}

const Auth: React.FC<Props> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Rule Helper State
  const [showRules, setShowRules] = useState(false);

  // Detect current domain for Firebase Config helper
  const [detectedDomain, setDetectedDomain] = useState('');

  useEffect(() => {
      // Intentar obtener el hostname
      const host = window.location.hostname;
      setDetectedDomain(host || 'Desconocido');

      if (isRegistering) {
        loadGroups();
    }
  }, [isRegistering]);

  const loadGroups = () => {
    setLoadingGroups(true);
    dataService.getAllGroups().then(gs => {
        setGroups(gs);
        if (gs.length > 0) setSelectedGroupId(gs[0].id);
        setLoadingGroups(false);
    }).catch(err => {
        console.error("Error loading groups for dropdown", err);
        setLoadingGroups(false);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let user;
      if (isRegistering) {
        if (!name || !email || !password) throw new Error("Todos los campos son requeridos");
        // Check explicitly if a group was selected
        if (!selectedGroupId && groups.length > 0) throw new Error("Selecciona una Logia");
        
        user = await authService.register(name, email, password, selectedGroupId);
      } else {
        if (!email || !password) throw new Error("Por favor ingresa tu correo y contraseña.");
        user = await authService.signIn(email, password);
      }
      onLogin(user);
    } catch (err: any) {
      console.error("Auth Error:", err);
      let msg = err.message || "Error desconocido";
      
      // Friendly error mapping
      if (msg.includes("auth/invalid-credential") || msg.includes("auth/user-not-found") || msg.includes("auth/wrong-password")) {
          msg = "Email o contraseña incorrectos.";
      } else if (msg.includes("auth/email-already-in-use")) {
          msg = "Este email ya está registrado. Intenta iniciar sesión.";
      } else if (msg.includes("auth/network-request-failed")) {
          msg = "⚠️ ERROR DE CONEXIÓN O DOMINIO. Verifica tu internet y la configuración de Firebase.";
      } else if (msg.includes("auth/too-many-requests")) {
          msg = "Demasiados intentos fallidos. Intenta más tarde.";
      } else if (msg.includes("auth/invalid-api-key")) {
          msg = "Configuración inválida: API Key incorrecta.";
      } else if (msg.includes("Credenciales requeridas")) {
          msg = "Por favor ingresa tu correo y contraseña.";
      }

      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-logia-900 p-4">
      
      {/* DOMAIN HELPER - TOP VISIBILITY */}
      <div className="w-full max-w-md mb-6 bg-yellow-900/40 border border-yellow-500/50 p-4 rounded-xl text-center shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500"></div>
          <p className="text-[10px] text-yellow-400 uppercase font-bold mb-2 tracking-widest">
              Configuración Firebase Necesaria
          </p>
          <p className="text-xs text-gray-300 mb-3 leading-relaxed">
              Para que la app funcione en esta vista previa, debes autorizar este dominio en tu consola Firebase:
          </p>
          <div className="bg-black/60 p-3 rounded flex justify-between items-center group cursor-pointer hover:bg-black/80 transition-colors border border-yellow-500/30"
               onClick={() => {
                   navigator.clipboard.writeText(detectedDomain);
                   alert("Dominio copiado: " + detectedDomain);
               }}
          >
              <code className="text-sm text-green-400 font-mono select-all break-all font-bold">{detectedDomain}</code>
              <span className="text-gray-400 text-xs ml-2 bg-gray-800 px-2 py-1 rounded border border-gray-600">COPIAR</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-2">
            (Ve a Authentication {'>'} Settings {'>'} Authorized Domains y pega esto)
          </p>
      </div>

      <div className="w-full max-w-md bg-logia-800 rounded-xl shadow-2xl p-8 border border-logia-700 relative z-10">
        <h1 className="text-3xl font-bold text-center text-indigo-400 mb-2">Mi Logia</h1>
        <p className="text-center text-gray-400 mb-8">
          {isRegistering ? 'Solicita tu ingreso' : 'Bienvenido, Hermano'}
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-200 p-3 rounded mb-4 text-sm break-words animate-pulse font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegistering && (
            <>
                <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Nombre Completo</label>
                <input
                    type="text"
                    required
                    className="w-full bg-logia-900 border border-logia-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-logia-accent outline-none"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                />
                </div>
                <div>
                <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-gray-300">Selecciona tu Logia</label>
                    <button type="button" onClick={loadGroups} className="text-xs text-indigo-400 hover:text-white underline">Recargar lista</button>
                </div>
                {loadingGroups ? (
                    <div className="text-gray-500 text-sm animate-pulse">Buscando logias activas...</div>
                ) : (
                    <select 
                        required
                        value={selectedGroupId}
                        onChange={e => setSelectedGroupId(e.target.value)}
                        className="w-full bg-logia-900 border border-logia-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-logia-accent outline-none"
                    >
                        {groups.length === 0 ? (
                            <option value="">(Error de permisos o lista vacía)</option>
                        ) : (
                            groups.map(g => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                            ))
                        )}
                    </select>
                )}
                {groups.length === 0 && !loadingGroups && (
                    <div className="mt-2 bg-red-900/20 border border-red-500/30 p-2 rounded">
                        <p className="text-[10px] text-red-300 mb-1">
                            * No aparecen Logias. Probablemente falten permisos de lectura pública.
                        </p>
                        <button 
                            type="button" 
                            onClick={() => setShowRules(true)}
                            className="text-[10px] bg-red-600 text-white px-2 py-1 rounded hover:bg-red-500 w-full"
                        >
                            Ver Reglas Necesarias (Firestore)
                        </button>
                    </div>
                )}
                </div>
            </>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input
              type="email"
              required
              className="w-full bg-logia-900 border border-logia-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-logia-accent outline-none"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Contraseña</label>
            <input
              type="password"
              required
              className="w-full bg-logia-900 border border-logia-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-logia-accent outline-none"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="******"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-logia-accent hover:bg-logia-accentHover text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 mt-4"
          >
            {loading ? 'Conectando...' : (isRegistering ? 'Registrarse' : 'Entrar')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
            className="text-indigo-400 hover:text-indigo-300 text-sm"
          >
            {isRegistering ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
          </button>
        </div>
      </div>

      {/* RULES HELPER MODAL */}
      {showRules && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="bg-logia-800 w-full max-w-2xl rounded-xl border border-logia-700 p-6 relative shadow-2xl">
                <button onClick={() => setShowRules(false)} className="absolute top-4 right-4 text-white hover:text-gray-300">✕</button>
                <h3 className="text-xl font-bold text-white mb-4">Reglas de Seguridad Requeridas</h3>
                <p className="text-sm text-gray-400 mb-4">
                    Para que los usuarios nuevos puedan ver la lista de Logias al registrarse, debes permitir la lectura pública de la colección `groups`. Copia esto en tu consola Firebase:
                </p>
                <div className="relative">
                    <pre className="bg-black p-4 rounded text-green-400 text-xs overflow-x-auto select-all border border-gray-700 font-mono">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helpers
    function isSignedIn() { return request.auth != null; }
    function isAdmin() { 
      return isSignedIn() && 
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'master']; 
    }

    // USER RULES
    match /users/{userId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && request.auth.uid == userId || isAdmin();
      match /ledger/{docId} { allow read: if isSignedIn(); allow write: if isAdmin(); }
      match /attendance/{docId} { allow read: if isSignedIn(); allow write: if isAdmin(); }
    }
    
    // GROUPS (LODGES) - PUBLIC READ ALLOWED
    match /groups/{groupId} {
      allow read: if true;  // <--- IMPORTANTE: PUBLIC READ
      allow write: if isAdmin();
      
      match /treasury/{docId} { allow read: if isSignedIn(); allow write: if isAdmin(); }
      match /notices/{noticeId} { allow read: if isSignedIn(); allow write: if isAdmin(); }
    }
    
    // TRIVIA
    match /trivias/{triviaId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
      match /answers/{userId} { allow read: if isSignedIn(); allow write: if isSignedIn(); }
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
    function isAdmin() { 
      return isSignedIn() && 
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'master']; 
    }

    match /users/{userId} {
      allow read: if isSignedIn();
      allow write: if isSignedIn() && request.auth.uid == userId || isAdmin();
      match /ledger/{docId} { allow read: if isSignedIn(); allow write: if isAdmin(); }
      match /attendance/{docId} { allow read: if isSignedIn(); allow write: if isAdmin(); }
    }
    
    match /groups/{groupId} {
      allow read: if true;
      allow write: if isAdmin();
      
      match /treasury/{docId} { allow read: if isSignedIn(); allow write: if isAdmin(); }
      match /notices/{noticeId} { allow read: if isSignedIn(); allow write: if isAdmin(); }
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
                            alert("Reglas copiadas");
                        }}
                        className="absolute top-2 right-2 bg-indigo-600 text-white text-xs px-2 py-1 rounded"
                    >
                        Copiar
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default Auth;
