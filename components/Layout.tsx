import React from 'react';
import { User } from '../types';
import NavIcon from './NavIcon';
import NotificationBell from './NotificationBell';
import QuickFinance from './QuickFinance';

interface Props {
  user: User;
  currentView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  onExitGroup?: () => void;
  children: React.ReactNode;
  suspended?: boolean;
  groupName?: string;
}

const Layout: React.FC<Props> = ({ user, currentView, onNavigate, onLogout, onExitGroup, children, suspended, groupName }) => {
  const [showMore, setShowMore] = React.useState(false);
  const [showCommunity, setShowCommunity] = React.useState(false);
  React.useEffect(() => { setShowMore(false); setShowCommunity(false); }, [currentView]);
  React.useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setShowMore(false); setShowCommunity(false); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  const [showInstallModal, setShowInstallModal] = React.useState(false);
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [canInstall, setCanInstall] = React.useState(false);

  React.useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt && canInstall) {
      try {
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        setDeferredPrompt(null);
        setCanInstall(false);
      } catch (error) {
        console.error('Error showing install prompt:', error);
        setShowInstallModal(true);
      }
    } else setShowInstallModal(true);
  };

  const canManage = ['admin', 'viewer', 'master'].includes(user.role);
  const navItems = [
    { id: 'home', label: 'Inicio', icon: 'home' },
    { id: 'payments', label: 'Mis pagos', icon: 'payments' },
    { id: 'community', label: 'Comunidad', icon: 'community' },
    { id: 'library', label: 'Biblioteca', icon: 'library' },
    ...(canManage ? [{ id: 'admin', label: 'Gestionar', icon: 'admin' }] : []),
  ];
  const communityActive = ['notices', 'attendance'].includes(currentView);
  const navigate = (id: string) => { if (id === 'community') { setShowCommunity(value => !value); setShowMore(false); } else { onNavigate(id); setShowMore(false); setShowCommunity(false); } };

  return (
    <div className="min-h-screen bg-logia-900 text-gray-100 font-sans relative">
      <header className="bg-logia-800 border-b border-logia-700 px-4 py-3 sticky top-0 z-20 shadow-md">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-3">
          <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="text-lg font-bold text-indigo-400">Mi Logia</h1><span className="text-[10px] text-gray-400">V2 Beta</span></div>{groupName && <p className="text-xs text-gray-400 truncate max-w-[52vw] sm:max-w-md">{groupName}</p>}</div>
          <div className="flex gap-2 items-center shrink-0"><NotificationBell user={user} onNavigate={onNavigate} /><button onClick={() => { setShowMore(value => !value); setShowCommunity(false); }} aria-label="Opciones de cuenta" aria-expanded={showMore} className="p-2 border border-logia-700 rounded-lg text-gray-300"><NavIcon name="menu" /></button></div>
        </div>
        {showMore && <div className="absolute right-3 top-full mt-2 w-64 bg-logia-800 rounded-xl border border-logia-700 shadow-2xl p-2 z-40" aria-label="Opciones de cuenta">
          <p className="px-3 py-2 text-sm text-gray-400 truncate">{user.name}</p>
          <button onClick={() => navigate('profile')} className="block w-full text-left p-3 rounded hover:bg-logia-700">Mi perfil</button>
          <button onClick={() => { setShowMore(false); void handleInstallClick(); }} className="block w-full text-left p-3 rounded hover:bg-logia-700">{canInstall ? 'Instalar ahora' : 'Instalar aplicación'}</button>
          {user.role === 'master' && onExitGroup && <button onClick={onExitGroup} className="block w-full text-left p-3 rounded hover:bg-logia-700">Cambiar de Logia</button>}
          <button onClick={onLogout} className="block w-full text-left p-3 rounded text-red-300 hover:bg-logia-700">Cerrar sesión</button>
        </div>}
      </header>

      {suspended && <div className="bg-red-900/80 border-b border-red-700 px-4 py-3 text-center sticky top-[60px] z-20"><p className="text-red-100 text-sm font-bold">⚠️ La fecha de pago expiró, comunícate con el administrador{' '}<a href="https://wa.me/528611013113" target="_blank" rel="noopener noreferrer" className="underline text-white">+52 8611013113</a></p><p className="text-red-300 text-xs mt-1">Modo solo lectura — No se pueden realizar cambios</p></div>}

      <main className={`w-full mx-auto min-h-[calc(100vh-140px)] pb-24 ${currentView === 'admin' ? 'max-w-7xl' : 'max-w-4xl'}`}>{children}</main>
      <QuickFinance key={`${user.uid}:${user.groupId}:${user.role}`} user={user} suspended={!!suspended} />
      {showCommunity && <section className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:w-80 bg-logia-800 border border-logia-700 rounded-xl shadow-2xl z-40 p-3" aria-label="Comunidad">
        <div className="flex items-center justify-between px-2 py-2"><h2 className="font-bold">Comunidad</h2><button onClick={() => setShowCommunity(false)} className="text-gray-400 p-2" aria-label="Cerrar comunidad">×</button></div>
        <button onClick={() => navigate('notices')} className="w-full text-left rounded-lg p-3 hover:bg-logia-700"><span className="block text-sm font-semibold">Avisos</span><span className="text-xs text-gray-400">Comunicados de la Logia</span></button>
        <button onClick={() => navigate('attendance')} className="w-full text-left rounded-lg p-3 hover:bg-logia-700"><span className="block text-sm font-semibold">Mi asistencia</span><span className="text-xs text-gray-400">Consulta tus reuniones</span></button>
      </section>}
      <nav className="fixed bottom-0 left-0 w-full bg-logia-800 border-t border-logia-700 z-30" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Navegación principal">
        <div className="max-w-4xl mx-auto flex items-center h-16">
          {navItems.map(item => { const active = currentView === item.id || (item.id === 'community' && communityActive); return <button key={item.id} aria-current={active ? 'page' : undefined} aria-expanded={item.id === 'community' ? showCommunity : undefined} onClick={() => navigate(item.id)} className={`flex flex-1 flex-col items-center justify-center gap-1 h-full transition-colors text-xs ${active ? 'text-indigo-300 bg-indigo-900/20' : 'text-gray-400 hover:text-gray-200'}`}><NavIcon name={item.icon} /><span>{item.label}</span></button>; })}
        </div>
      </nav>

      {showInstallModal && <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowInstallModal(false)}><div className="bg-logia-800 rounded-xl max-w-lg w-full border border-logia-700 shadow-2xl" onClick={event => event.stopPropagation()}><div className="p-6"><div className="flex justify-between items-center mb-4"><h3 className="text-xl font-bold text-white">📱 Instalar Mi Logia</h3><button onClick={() => setShowInstallModal(false)} className="text-gray-400 hover:text-white text-2xl">&times;</button></div><div className="space-y-4 text-gray-300 text-sm"><p className="text-indigo-300 font-medium">Instala la app en tu dispositivo para acceso rápido y mejor experiencia.</p><div className="bg-logia-900 p-4 rounded-lg border border-logia-700"><h4 className="font-bold text-white mb-2">📱 Android (Chrome):</h4><ol className="list-decimal list-inside space-y-1 text-xs"><li>Toca el menú <strong>⋮</strong>.</li><li>Selecciona <strong>Añadir a pantalla de inicio</strong> o <strong>Instalar app</strong>.</li><li>Confirma.</li></ol></div><div className="bg-logia-900 p-4 rounded-lg border border-logia-700"><h4 className="font-bold text-white mb-2">📱 iPhone (Safari):</h4><ol className="list-decimal list-inside space-y-1 text-xs"><li>Toca Compartir.</li><li>Selecciona <strong>Añadir a pantalla de inicio</strong>.</li><li>Toca <strong>Añadir</strong>.</li></ol></div></div><button onClick={() => setShowInstallModal(false)} className="w-full mt-6 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg">Entendido</button></div></div></div>}
    </div>
  );
};

export default Layout;
