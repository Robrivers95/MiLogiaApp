
import React, { useState, useEffect } from 'react';
import { authService, dataService } from '../services/api';
import { User, Group } from '../types';

interface Props {
  onLogin: (user: User) => void;
}

const Auth: React.FC<Props> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');

  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isRegistering) {
      (async () => {
        try {
          setLoadingGroups(true);
          const gs = await dataService.getAllGroups();
          setGroups(gs);
          if (gs.length > 0) setSelectedGroupId(gs[0].id);
        } catch (e) {
          console.error(e);
        } finally {
          setLoadingGroups(false);
        }
      })();
    }
  }, [isRegistering]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let u: User;
      if (isRegistering) {
        if (!name || !email || !password) throw new Error('Completa todos los campos');
        if (!selectedGroupId && groups.length > 0) throw new Error('Selecciona una Logia');
        u = await authService.register(name, email, password, selectedGroupId);
      } else {
        if (!email || !password) throw new Error('Ingresa tu correo y contraseña');
        u = await authService.signIn(email, password);
      }
      onLogin(u);
    } catch (err: any) {
      console.error('Auth Error:', err);
      const msg = err?.message || 'Error de autenticación';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    try {
      const value = email || prompt('Ingresa tu correo:') || '';
      if (!value) return;
      await authService.resetPassword(value.trim());
      alert('Si el correo existe, se te envió un enlace.');
    } catch (e: any) {
      alert('No se pudo enviar el correo: ' + (e.message || e));
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-logia-900 p-4">
      <div className="w-full max-w-md bg-logia-800 rounded-xl shadow-2xl p-8 border border-logia-700">
        <h1 className="text-3xl font-bold text-center text-indigo-400 mb-2">Mi Logia</h1>
        <p className="text-center text-gray-400 mb-8">
          {isRegistering ? 'Solicita tu ingreso' : 'Bienvenido, Hermano'}
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-200 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegistering && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Nombre Completo</label>
              <input
                type="text"
                required
                className="w-full bg-logia-900 border border-logia-700 rounded-lg p-3 text-white"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Correo</label>
            <input
              type="email"
              required
              className="w-full bg-logia-900 border border-logia-700 rounded-lg p-3 text-white"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tucorreo@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Contraseña</label>
            <input
              type="password"
              required
              className="w-full bg-logia-900 border border-logia-700 rounded-lg p-3 text-white"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="******"
            />
          </div>

          {isRegistering && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Logia</label>
              <select
                className="w-full bg-logia-900 border border-logia-700 rounded-lg p-3 text-white"
                value={selectedGroupId}
                onChange={e => setSelectedGroupId(e.target.value)}
                disabled={loadingGroups}
              >
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-logia-accent hover:bg-logia-accentHover text-white font-bold py-3 rounded-lg disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Procesando…' : (isRegistering ? 'Registrarme' : 'Entrar')}
          </button>
        </form>

        <div className="mt-4 flex justify-between text-sm">
          <button onClick={() => setIsRegistering(r => !r)} className="text-indigo-300 hover:text-indigo-200">
            {isRegistering ? 'Ya tengo cuenta' : 'Crear cuenta'}
          </button>
          <button onClick={handleResetPassword} className="text-gray-300 hover:text-white">
            Recuperar contraseña
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
