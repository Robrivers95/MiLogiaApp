
import React, { useEffect, useState } from 'react';
import { User, Task } from '../types';
import { dataService } from '../services/api';
import InstallPWA from './InstallPWA';

interface Props {
  user: User;
}

const Dashboard: React.FC<Props> = ({ user }) => {
  const [totalDebt, setTotalDebt] = useState(0);
  const [myTasks, setMyTasks] = useState<Task[]>([]);

  useEffect(() => {
    const loadDebt = async () => {
        const payments = await dataService.getPayments(user.uid);
        // Filter only payments from the user's own group
        const filtered = payments.filter(p => !p.groupId || p.groupId === user.groupId);
        const debt = filtered.reduce((acc, p) => acc + (p.amount - p.paid), 0);
        setTotalDebt(debt);
    };
    loadDebt();
  }, [user.uid, user.groupId]);

  useEffect(() => {
    const loadMyTasks = async () => {
      try {
        const allTasks = await dataService.getTasks(user.groupId);
        // Filter tasks assigned to current user and not completed
        const filtered = allTasks.filter(t => t.assignedTo === user.uid && !t.completed);
        setMyTasks(filtered);
      } catch (e) {
        console.error("Error cargando tareas", e);
      }
    };
    loadMyTasks();
  }, [user.uid, user.groupId]);

  const isMaster = user.role === 'master';

  return (
    <div className="p-4 space-y-6">
      
      {/* Header Card */}
      <div className="bg-gradient-to-r from-logia-800 to-indigo-900 rounded-xl p-6 shadow-lg border border-logia-700">
        <div className="flex items-center space-x-4">
          <div className="h-16 w-16 rounded-full bg-logia-700 flex items-center justify-center text-2xl font-bold text-logia-accent border-2 border-logia-accent">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{user.name}</h2>
            <p className="text-indigo-300 text-sm">{user.profession || user.email}</p>
            <div className="flex items-center mt-2 space-x-2">
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${user.active ? 'bg-logia-success/20 text-logia-success' : 'bg-logia-danger/20 text-logia-danger'}`}>
                {user.active ? 'Activo' : 'Inactivo'}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-logia-gold/20 text-logia-gold uppercase">
                {user.role}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Debt Alert Card - HIDDEN FOR MASTER (To prevent confusion about seeing personal debt in other lodges) */}
      {!isMaster && (
        <div className={`rounded-xl p-4 border shadow-lg flex justify-between items-center ${totalDebt > 0 ? 'bg-red-900/20 border-red-500/50' : 'bg-green-900/20 border-green-500/50'}`}>
            <div>
                <p className="text-xs uppercase tracking-wider text-gray-400">Saldo Pendiente al Día</p>
                <p className={`text-2xl font-bold ${totalDebt > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    ${totalDebt}
                </p>
            </div>
            <div className="text-3xl">
                {totalDebt > 0 ? '💸' : '✅'}
            </div>
        </div>
      )}

      {/* Install PWA Banner - Floating at bottom */}
      <InstallPWA userId={user.uid} />

      {isMaster && (
          <div className="bg-indigo-900/30 border border-indigo-500/30 p-4 rounded-lg">
              <h3 className="text-indigo-300 font-bold mb-1">👁️ Modo Maestro</h3>
              <p className="text-xs text-gray-400">
                  Estás visualizando esta Logia con permisos totales. <br/>
                  Usa la pestaña <strong>Admin</strong> para gestionar usuarios y finanzas.
              </p>
          </div>
      )}

      {!user.active && (
        <div className="bg-yellow-900/20 border border-yellow-600/50 text-yellow-200 p-4 rounded-lg text-center">
          <p>⚠️ Tu cuenta está pendiente de activación por el administrador.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        <div className="bg-logia-800 p-4 rounded-xl border border-logia-700 text-center">
            <p className="text-gray-400 text-xs uppercase">Ciudad / Ubicación</p>
            <p className="text-lg font-medium text-white truncate">{user.city || 'No definida'}</p>
        </div>
      </div>

      {/* My Tasks Section */}
      {myTasks.length > 0 && (
        <div className="bg-logia-800 rounded-xl p-4 border border-logia-700 shadow-lg">
          <h3 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
            📋 Mis Tareas Pendientes
            <span className="bg-logia-accent text-white text-xs px-2 py-1 rounded-full">{myTasks.length}</span>
          </h3>
          <div className="space-y-2">
            {myTasks.map(task => (
              <div key={task.id} className="bg-logia-900 p-3 rounded border border-logia-700">
                <h4 className="font-bold text-white text-sm">{task.title}</h4>
                {task.description && (
                  <p className="text-gray-400 text-xs mt-1">{task.description}</p>
                )}
                <p className="text-gray-500 text-xs mt-1">
                  Creada: {new Date(task.createdAt).toLocaleDateString('es-MX')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
