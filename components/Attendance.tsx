import React, { useEffect, useState } from 'react';
import { User, Attendance } from '../types';
import { dataService } from '../services/api';

interface Props {
  user: User;
}

const AttendanceView: React.FC<Props> = ({ user }) => {
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAttendance = async () => {
    setLoading(true);
    // Get full attendance including absences
    const data = await dataService.getFullAttendance(
      user.uid, 
      user.groupId || '', 
      user.masonicJoinDate || user.masonicRejoinDate
    );
    setRecords(data.sort((a, b) => b.date.localeCompare(a.date)));
    setLoading(false);
  };

  useEffect(() => {
    loadAttendance();
  }, [user.uid, user.groupId]);

  const presentCount = records.filter(r => r.attended).length;
  const absentCount = records.filter(r => !r.attended).length;
  const totalCount = records.length;
  const percentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  return (
    <div className="p-4 space-y-6 pb-24">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Mi Asistencia</h2>
        <button 
          onClick={loadAttendance}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-sm font-medium"
        >
          🔄 Actualizar
        </button>
      </div>
      
      <div className="bg-logia-800 rounded-xl p-6 border border-logia-700 flex items-center justify-between">
        <div>
            <p className="text-gray-400 text-sm">Tasa de Asistencia</p>
            <p className="text-3xl font-bold text-indigo-400">{percentage}%</p>
        </div>
        <div className="text-right space-y-1">
             <p className="text-sm text-green-400">✅ Presente: {presentCount}</p>
             <p className="text-sm text-red-400">❌ Ausente: {absentCount}</p>
             <p className="text-sm text-gray-400 border-t border-logia-700 pt-1">📊 Total: {totalCount}</p>
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
           <p className="text-center text-gray-400">Cargando...</p>
        ) : records.length === 0 ? (
           <p className="text-center text-gray-400">No hay registros de asistencia.</p>
        ) : (
           records.map((rec) => {
             // Parsear fecha como local para evitar problemas de zona horaria
             const [year, month, day] = rec.date.split('-').map(Number);
             const localDate = new Date(year, month - 1, day);
             
             return (
               <div key={rec.date} className="bg-logia-800 p-3 rounded-lg flex items-center justify-between border border-logia-700/50">
                  <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${rec.attended ? 'bg-logia-success' : 'bg-logia-danger'}`}></div>
                      <p className="text-gray-200 font-medium">{localDate.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}</p>
                  </div>
                  <span className={`text-sm font-semibold ${rec.attended ? 'text-logia-success' : 'text-logia-danger'}`}>
                      {rec.attended ? 'Presente' : 'Ausente'}
                  </span>
               </div>
             );
           })
        )}
      </div>
    </div>
  );
};

export default AttendanceView;