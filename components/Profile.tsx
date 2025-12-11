
import React, { useState } from 'react';
import { User } from '../types';
import { dataService } from '../services/api';

interface Props {
  user: User;
}

const Profile: React.FC<Props> = ({ user }) => {
  const [formData, setFormData] = useState({
    name: user.name || '',
    profession: user.profession || '',
    job: user.job || '',
    workAddress: user.workAddress || '',
    city: user.city || '',
    state: user.state || '',
    country: user.country || ''
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await dataService.updateUser(user.uid, formData);
      setMsg('✅ Perfil actualizado correctamente');
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setMsg('❌ Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 pb-24 space-y-6">
      <h2 className="text-2xl font-bold text-white mb-4">Mi Perfil</h2>
      
      {msg && <div className="p-3 rounded bg-gray-800 border border-gray-600 text-center text-white">{msg}</div>}

      <div className="bg-logia-800 rounded-xl p-6 border border-logia-700 space-y-4">
        
        <div>
          <label className="block text-gray-400 text-xs uppercase mb-1">Nombre Completo</label>
          <input 
            name="name" 
            value={formData.name} 
            onChange={handleChange}
            className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-400 text-xs uppercase mb-1">Profesión</label>
            <input 
              name="profession" 
              placeholder="Ej. Abogado, Ingeniero..."
              value={formData.profession} 
              onChange={handleChange}
              className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs uppercase mb-1">Trabajo / Empresa</label>
            <input 
              name="job" 
              placeholder="Ej. Director en Empresa X"
              value={formData.job} 
              onChange={handleChange}
              className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-gray-400 text-xs uppercase mb-1">Dirección de Trabajo / Ubicación</label>
          <input 
            name="workAddress" 
            placeholder="Calle, Número, Colonia o URL de Mapa"
            value={formData.workAddress} 
            onChange={handleChange}
            className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-gray-400 text-xs uppercase mb-1">Ciudad</label>
            <input 
              name="city" 
              value={formData.city} 
              onChange={handleChange}
              className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs uppercase mb-1">Estado</label>
            <input 
              name="state" 
              value={formData.state} 
              onChange={handleChange}
              className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
            />
          </div>
          <div>
            <label className="block text-gray-400 text-xs uppercase mb-1">País</label>
            <input 
              name="country" 
              value={formData.country} 
              onChange={handleChange}
              className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
            />
          </div>
        </div>

        <button 
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-logia-accent hover:bg-logia-accentHover text-white font-bold py-3 rounded transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>

      {/* Read Only Info */}
      <div className="bg-logia-800/50 rounded-xl p-4 border border-logia-700/50 text-sm text-gray-400">
         <p>📅 Fecha de ingreso a la App: {new Date(user.joinDate).toLocaleDateString()}</p>
         {user.masonicJoinDate && <p>🏗️ Iniciación Masónica: {user.masonicJoinDate}</p>}
         {user.masonicRejoinDate && <p>🔄 Último Reingreso: {user.masonicRejoinDate}</p>}
      </div>
    </div>
  );
};

export default Profile;
