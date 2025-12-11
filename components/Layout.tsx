
import React from 'react';
import { User } from '../types';

interface Props {
  user: User;
  currentView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  onExitGroup?: () => void; // Optional for Master Role
  children: React.ReactNode;
}

const Layout: React.FC<Props> = ({ user, currentView, onNavigate, onLogout, onExitGroup, children }) => {
  
  const navItems = [
    { id: 'home', label: 'Inicio', icon: '🏠' },
    { id: 'notices', label: 'Avisos', icon: '📢' },
    { id: 'payments', label: 'Pagos', icon: '💰' },
    { id: 'attendance', label: 'Asist.', icon: '📅' },
    // RPG hidden
    { id: 'trivia', label: 'Trivia', icon: '❓' },
  ];

  if (user.role === 'admin' || user.role === 'viewer' || user.role === 'master') {
    navItems.push({ id: 'admin', label: 'Admin', icon: '⚙️' });
  }

  return (
    <div className="min-h-screen bg-logia-900 text-gray-100 font-sans relative">
      {/* Top Bar */}
      <header className="bg-logia-800 border-b border-logia-700 p-4 flex justify-between items-center sticky top-0 z-20 shadow-md">
        <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-indigo-400">Mi Logia</h1>
            {user.role === 'master' && onExitGroup && (
                <button 
                  onClick={onExitGroup}
                  className="bg-indigo-900 hover:bg-indigo-800 text-indigo-200 text-xs px-2 py-1 rounded border border-indigo-700"
                >
                    &larr; Volver al Panel
                </button>
            )}
        </div>
        <div className="flex gap-2">
            <button 
            onClick={() => onNavigate('profile')}
            className={`text-sm px-3 py-1 rounded border border-logia-700 ${currentView === 'profile' ? 'bg-logia-accent text-white' : 'bg-logia-900 text-gray-400'}`}
            >
            Mi Perfil
            </button>
            <button 
            onClick={onLogout}
            className="text-sm text-gray-400 hover:text-white border border-logia-700 px-3 py-1 rounded bg-logia-900"
            >
            Salir
            </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-3xl mx-auto min-h-[calc(100vh-140px)]">
        {children}
      </main>

      {/* Bottom Nav (Mobile First) */}
      <nav className="fixed bottom-0 left-0 w-full bg-logia-800 border-t border-logia-700 pb-safe z-30 overflow-x-auto">
        <div className="max-w-3xl mx-auto flex justify-between items-center h-16 min-w-[350px]">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center justify-center w-full min-w-[60px] h-full transition-colors ${
                currentView === item.id ? 'text-logia-accent' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <span className="text-xl mb-1">{item.icon}</span>
              <span className="text-[10px] font-medium uppercase tracking-wide">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default Layout;
