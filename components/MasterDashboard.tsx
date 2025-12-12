
import React, { useState, useEffect } from 'react';
import { Group } from '../types';
import { dataService } from '../services/api';

interface Props {
  onSelectGroup: (group: Group) => void;
  onLogout: () => void;
}

const MasterDashboard: React.FC<Props> = ({ onSelectGroup, onLogout }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = await dataService.getAllGroups();
        setGroups(list);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-logia-900 p-6">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-white">Panel Maestro</h1>
          <button onClick={onLogout} className="text-gray-300 hover:text-white border border-gray-600 px-3 py-1 rounded">
            Cerrar Sesión
          </button>
        </header>

        {loading ? (
          <div className="text-gray-400">Cargando logias…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map(g => (
              <button
                key={g.id}
                onClick={() => onSelectGroup(g)}
                className="bg-logia-800 border border-logia-700 rounded p-4 text-left hover:bg-logia-700"
              >
                <div className="text-white font-bold">{g.name}</div>
                <div className="text-gray-400 text-sm">{g.description || 'Sin descripción'}</div>
              </button>
            ))}
            {groups.length === 0 && (
              <div className="text-gray-400">No hay logias registradas.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MasterDashboard;
