
import React from 'react';
import { User } from '../types';

interface Props {
  user: User;
  onLogout: () => void;
}

const PendingApproval: React.FC<Props> = ({ user, onLogout }) => {
  return (
    <div className="min-h-screen bg-logia-900 flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-logia-800 p-8 rounded-xl border border-logia-700 shadow-2xl max-w-md w-full animate-fade-in-up">
        <div className="text-6xl mb-6">🏛️</div>
        <h2 className="text-2xl font-bold text-white mb-2">Solicitud Enviada</h2>
        <p className="text-indigo-400 font-bold mb-6 text-sm uppercase tracking-widest">
            En Pasos Perdidos
        </p>
        
        <div className="bg-logia-900 p-4 rounded-lg border border-logia-700 mb-6 text-left">
            <p className="text-gray-400 text-xs uppercase mb-1">Candidato</p>
            <p className="text-white font-bold text-lg mb-3">{user.name}</p>
            
            <p className="text-gray-400 text-xs uppercase mb-1">Estado</p>
            <span className="inline-block bg-yellow-900/50 text-yellow-500 text-xs px-2 py-1 rounded border border-yellow-700">
                ⏳ Pendiente de Aprobación
            </span>
        </div>

        <p className="text-gray-300 text-sm mb-8 leading-relaxed">
          Tu solicitud ha sido registrada en el sistema. <br/><br/>
          Por seguridad, no podrás acceder a la información de la Logia hasta que el <strong>Venerable Maestro</strong> o el <strong>Secretario</strong> verifiquen tu identidad y activen tu cuenta.
        </p>

        <button 
          onClick={onLogout}
          className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded transition-colors"
        >
          Cerrar Sesión y Esperar
        </button>
      </div>
    </div>
  );
};

export default PendingApproval;
