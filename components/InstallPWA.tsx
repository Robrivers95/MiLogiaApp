import React, { useEffect, useState } from 'react';
import { requestNotificationPermission, areNotificationsEnabled } from '../services/notifications';

interface Props {
  userId: string;
}

const InstallPWA: React.FC<Props> = ({ userId }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [requestingNotifications, setRequestingNotifications] = useState(false);

  useEffect(() => {
    // Detectar iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(iOS);

    // Verificar si ya está instalada
    const installed = window.matchMedia('(display-mode: standalone)').matches;
    setIsInstalled(installed);

    // Si ya está instalada, no mostrar banner
    if (installed) {
      setShowBanner(false);
      return;
    }

    // En iOS, mostrar banner después de 3 segundos
    if (iOS) {
      const timer = setTimeout(() => {
        const dismissed = localStorage.getItem('pwa-install-dismissed');
        if (!dismissed) {
          setShowBanner(true);
        }
      }, 3000);
      return () => clearTimeout(timer);
    }

    // En Android/Chrome, esperar evento beforeinstallprompt
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (!dismissed) {
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    setNotificationsEnabled(areNotificationsEnabled());
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (!deferredPrompt) {
      return;
    }

    setInstalling(true);

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('PWA instalada');
        setShowBanner(false);
        localStorage.setItem('pwa-install-dismissed', 'true');
      }
      
      setDeferredPrompt(null);
    } catch (error) {
      console.error('Error instalando PWA:', error);
    } finally {
      setInstalling(false);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  const handleEnableNotifications = async () => {
    setRequestingNotifications(true);
    try {
      const token = await requestNotificationPermission(userId);
      if (token) {
        setNotificationsEnabled(true);
      }
    } catch (error) {
      console.error('Error activando notificaciones:', error);
    } finally {
      setRequestingNotifications(false);
    }
  };

  if (isInstalled || !showBanner) {
    return null;
  }

  return (
    <>
      {/* Banner de Instalación */}
      <div className="fixed bottom-20 left-0 right-0 z-50 px-4 animate-slide-up">
        <div className="max-w-2xl mx-auto bg-gradient-to-r from-logia-accent to-indigo-600 rounded-xl shadow-2xl p-4 border-2 border-logia-gold/30">
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 text-white/80 hover:text-white text-xl"
            aria-label="Cerrar"
          >
            ✕
          </button>
          
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 bg-white/20 rounded-full p-3">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            
            <div className="flex-1">
              <h3 className="text-white font-bold text-lg">¡Instala MiLogia App!</h3>
              <p className="text-white/90 text-sm">
                {isIOS 
                  ? 'Acceso rápido desde tu pantalla de inicio'
                  : 'Instala nuestra app en tu dispositivo'
                }
              </p>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleInstallClick}
                disabled={installing}
                className="bg-white text-logia-accent font-bold px-6 py-3 rounded-lg hover:bg-gray-100 transition-all shadow-lg disabled:opacity-50 whitespace-nowrap"
              >
                {installing ? (
                  <span className="animate-spin">⌛</span>
                ) : (
                  isIOS ? 'Ver Cómo' : 'Instalar'
                )}
              </button>
              <button
                onClick={handleDismiss}
                className="text-white/90 hover:text-white font-semibold px-4 py-3 rounded-lg hover:bg-white/10 transition-all"
              >
                Luego
              </button>
            </div>
          </div>

          {/* Notificaciones - Mostrar después de instalar o si ya está instalado */}
          {!notificationsEnabled && (
            <div className="mt-3 pt-3 border-t border-white/20">
              <button
                onClick={handleEnableNotifications}
                disabled={requestingNotifications}
                className="w-full bg-white/20 hover:bg-white/30 text-white font-semibold py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {requestingNotifications ? (
                  <>
                    <span className="animate-spin">⌛</span>
                    Activando...
                  </>
                ) : (
                  <>
                    🔔 Activar Notificaciones
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal iOS con Instrucciones */}
      {showIOSModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
          <div className="bg-logia-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-logia-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">Instalar en iOS</h3>
              <button
                onClick={() => setShowIOSModal(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-logia-900 rounded-lg p-4 border border-logia-700">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-logia-accent rounded-full flex items-center justify-center text-white font-bold">
                    1
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-semibold">Toca el botón de Compartir</p>
                    <p className="text-gray-400 text-sm mt-1">
                      El icono <span className="inline-block bg-blue-500 rounded px-2 py-1 text-white text-xs">⬆️</span> en la barra inferior de Safari
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-logia-900 rounded-lg p-4 border border-logia-700">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-logia-accent rounded-full flex items-center justify-center text-white font-bold">
                    2
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-semibold">Desliza y busca</p>
                    <p className="text-gray-400 text-sm mt-1">
                      "Añadir a la pantalla de inicio" o "Add to Home Screen"
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-logia-900 rounded-lg p-4 border border-logia-700">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-logia-accent rounded-full flex items-center justify-center text-white font-bold">
                    3
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-semibold">Toca "Añadir"</p>
                    <p className="text-gray-400 text-sm mt-1">
                      La app aparecerá en tu pantalla de inicio
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-3 mt-4">
                <p className="text-green-300 text-sm text-center">
                  ✨ Una vez instalada, abre desde tu pantalla de inicio
                </p>
              </div>

              <button
                onClick={() => setShowIOSModal(false)}
                className="w-full bg-logia-accent hover:bg-logia-accent/80 text-white font-bold py-3 rounded-lg transition-all"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InstallPWA;
