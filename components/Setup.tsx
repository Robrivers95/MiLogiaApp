
import React, { useState } from 'react';
import { saveFirebaseConfig } from '../services/firebase';

const Setup: React.FC = () => {
  const [configInput, setConfigInput] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    setError('');
    if (!configInput.trim()) {
      setError('Por favor pega la configuración.');
      return;
    }

    const success = saveFirebaseConfig(configInput);
    if (!success) {
      setError('El formato no es válido. Asegúrate de copiar solo el objeto JSON (entre llaves {}).');
    }
  };

  return (
    <div className="min-h-screen bg-logia-900 flex flex-col items-center justify-center p-4 text-gray-200">
      <div className="w-full max-w-2xl bg-logia-800 rounded-xl border border-logia-700 shadow-2xl p-8">
        <h1 className="text-3xl font-bold text-logia-accent mb-4 text-center">Conectar con Firebase</h1>
        
        <div className="space-y-4 mb-6 text-sm text-gray-400">
          <p>Para que la app funcione con tus usuarios de <strong>RegistroLogia</strong>, necesitamos las credenciales de conexión.</p>
          <ol className="list-decimal list-inside space-y-2 ml-2">
            <li>Ve a la <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-indigo-400 underline">Consola de Firebase</a>.</li>
            <li>Selecciona tu proyecto.</li>
            <li>Ve a <strong>Configuración del proyecto</strong> (icono de engranaje).</li>
            <li>Baja hasta "Tus apps" y selecciona la app Web (<code>&lt;/&gt;</code>).</li>
            <li>Copia el objeto <code>firebaseConfig</code> completo.</li>
          </ol>
        </div>

        <div className="relative mb-6">
          <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Pegar Configuración JSON aquí:</label>
          <textarea
            value={configInput}
            onChange={(e) => setConfigInput(e.target.value)}
            className="w-full h-48 bg-logia-900 border border-logia-700 rounded-lg p-4 font-mono text-xs text-green-400 focus:ring-2 focus:ring-logia-accent outline-none"
            placeholder={`{
  "apiKey": "...",
  "authDomain": "...",
  "projectId": "...",
  "storageBucket": "...",
  "messagingSenderId": "...",
  "appId": "..."
}`}
          />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-200 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleSave}
          className="w-full bg-logia-accent hover:bg-logia-accentHover text-white font-bold py-4 rounded-lg transition-all transform active:scale-[0.98]"
        >
          Guardar y Conectar
        </button>
        
        <p className="text-center text-xs text-gray-600 mt-4">
          Esta configuración se guardará solo en tu navegador.
        </p>
      </div>
    </div>
  );
};

export default Setup;
