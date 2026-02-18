
import React from 'react';
import { User } from '../types';
import InstallPrompt from './InstallPrompt';
import NotificationBell from './NotificationBell';

interface Props {
  user: User;
  currentView: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  onExitGroup?: () => void; // Optional for Master Role
  children: React.ReactNode;
}

const Layout: React.FC<Props> = ({ user, currentView, onNavigate, onLogout, onExitGroup, children }) => {
  const [showInstallModal, setShowInstallModal] = React.useState(false);
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [canInstall, setCanInstall] = React.useState(false);

  // Listen for beforeinstallprompt event
  React.useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    // If we can trigger native install prompt, do it
    if (deferredPrompt && canInstall) {
      try {
        // Show the native install prompt
        await deferredPrompt.prompt();
        
        // Wait for user's response
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
          console.log('User accepted the install prompt');
        }
        
        // Clear the prompt
        setDeferredPrompt(null);
        setCanInstall(false);
      } catch (error) {
        console.error('Error showing install prompt:', error);
        // If error, show manual instructions
        setShowInstallModal(true);
      }
    } else {
      // Can't trigger native prompt, show manual instructions
      setShowInstallModal(true);
    }
  };
  
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
        <div className="flex gap-2 items-center">
            <NotificationBell user={user} />
            <button 
              onClick={handleInstallClick}
              className="text-sm px-3 py-1 rounded border border-green-700 bg-green-900 text-green-200 hover:bg-green-800 flex items-center gap-1"
              title="Instalar aplicación"
            >
              <span>📱</span>
              <span className="hidden sm:inline">{canInstall ? 'Instalar Ahora' : 'Instalar App'}</span>
            </button>
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

      {/* Version Indicator */}
      <div className="fixed bottom-20 left-2 text-[10px] text-gray-600 font-mono bg-logia-900/80 px-2 py-1 rounded border border-logia-700/50 z-10">
        v3.5.0
      </div>

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

      {/* Install Prompt */}
      <InstallPrompt />

      {/* Install Instructions Modal */}
      {showInstallModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowInstallModal(false)}>
          <div className="bg-logia-800 rounded-xl max-w-lg w-full border border-logia-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">📱 Instalar Mi Logia</h3>
                <button onClick={() => setShowInstallModal(false)} className="text-gray-400 hover:text-white text-2xl">&times;</button>
              </div>

              <div className="space-y-4 text-gray-300 text-sm">
                <p className="text-indigo-300 font-medium">
                  Instala la app en tu dispositivo para acceso rápido y mejor experiencia.
                </p>

                {/* Android Chrome */}
                <div className="bg-logia-900 p-4 rounded-lg border border-logia-700">
                  <h4 className="font-bold text-white mb-2">📱 Android (Chrome):</h4>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Toca el menú <strong>⋮</strong> (arriba derecha)</li>
                    <li>Selecciona <strong>"Añadir a pantalla de inicio"</strong> o <strong>"Instalar app"</strong></li>
                    <li>Confirma y listo ✅</li>
                  </ol>
                </div>

                {/* iPhone Safari */}
                <div className="bg-logia-900 p-4 rounded-lg border border-logia-700">
                  <h4 className="font-bold text-white mb-2">📱 iPhone (Safari):</h4>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Toca el botón <strong>Compartir</strong> <span className="inline-block">📤</span> (abajo)</li>
                    <li>Desplázate y toca <strong>"Añadir a pantalla de inicio"</strong></li>
                    <li>Toca <strong>"Añadir"</strong> arriba derecha ✅</li>
                  </ol>
                </div>

                {/* Desktop */}
                <div className="bg-logia-900 p-4 rounded-lg border border-logia-700">
                  <h4 className="font-bold text-white mb-2">💻 Computadora:</h4>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>En Chrome: Busca el ícono <strong>⊕</strong> en la barra de direcciones</li>
                    <li>Haz clic en <strong>"Instalar"</strong></li>
                    <li>La app se abrirá en su propia ventana ✅</li>
                  </ol>
                </div>

                <div className="bg-blue-900/30 border border-blue-600/50 rounded-lg p-3 mt-4">
                  <p className="text-blue-200 text-xs">
                    💡 <strong>Ventajas:</strong> Acceso más rápido, notificaciones, funciona sin internet (algunos datos), y ocupa menos espacio que una app tradicional.
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setShowInstallModal(false)}
                className="w-full mt-6 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
