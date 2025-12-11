import React, { useEffect, useState } from 'react';
import { User, Attendance } from '../types';
import { dataService } from '../services/api';

interface Props {
  user: User;
}

const AttendanceView: React.FC<Props> = ({ user }) => {
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const data = await dataService.getAttendance(user.uid);
      setRecords(data.sort((a, b) => b.date.localeCompare(a.date)));
      setLoading(false);
    };
    load();
  }, [user.uid]);

  const presentCount = records.filter(r => r.attended).length;
  const totalCount = records.length;
  const percentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  return (
    <div className="p-4 space-y-6 pb-24">
      <h2 className="text-2xl font-bold text-white mb-4">Mi Asistencia</h2>
      
      <div className="bg-logia-800 rounded-xl p-6 border border-logia-700 flex items-center justify-between">
        <div>
            <p className="text-gray-400 text-sm">Tasa de Asistencia</p>
            <p className="text-3xl font-bold text-indigo-400">{percentage}%</p>
        </div>
        <div className="text-right">
             <p className="text-sm text-gray-300">Asistencias: {presentCount}</p>
             <p className="text-sm text-gray-500">Total Reuniones: {totalCount}</p>
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
           <p className="text-center text-gray-400">Cargando...</p>
        ) : records.length === 0 ? (
           <p className="text-center text-gray-400">No hay registros de asistencia.</p>
        ) : (
           records.map((rec) => (
             <div key={rec.date} className="bg-logia-800 p-3 rounded-lg flex items-center justify-between border border-logia-700/50">
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${rec.attended ? 'bg-logia-success' : 'bg-logia-danger'}`}></div>
                    <p className="text-gray-200 font-medium">{new Date(rec.date).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}</p>
                </div>
                <span className={`text-sm font-semibold ${rec.attended ? 'text-logia-success' : 'text-logia-danger'}`}>
                    {rec.attended ? 'Presente' : 'Ausente'}
                </span>
             </div>
           ))
        )}
      </div>
    </div>
  );
};

export default AttendanceView;