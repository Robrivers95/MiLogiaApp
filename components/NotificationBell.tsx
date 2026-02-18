
import React, { useEffect, useState, useRef } from 'react';
import { User, AppNotification } from '../types';
import { notificationService } from '../services/api';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';

interface Props {
  user: User;
}

const TYPE_ICONS: Record<string, string> = {
  attendance: '✅',
  trivia: '🧠',
  notice: '📢',
  profile_edit: '📝',
  payment: '💰'
};

const NotificationBell: React.FC<Props> = ({ user }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [permissionAsked, setPermissionAsked] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Solicitar permiso al navegador la primera vez que el usuario interactúa
  useEffect(() => {
    if (permissionAsked) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      // Pedir permiso de forma no intrusiva después de 3 segundos
      const timer = setTimeout(async () => {
        const granted = await notificationService.requestPermission();
        await notificationService.savePermissionStatus(user.uid, granted);
        setPermissionAsked(true);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setPermissionAsked(true);
    }
  }, [user.uid, permissionAsked]);

  // Escuchar en tiempo real las notificaciones no leídas
  useEffect(() => {
    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => d.data() as AppNotification);
      setNotifications(list);

      // Mostrar notificación nativa del navegador para las nuevas
      if (list.length > prevCountRef.current && prevCountRef.current !== -1) {
        const newest = list[0];
        if (newest) {
          notificationService.showBrowserNotification(newest.title, newest.body, newest.type);
        }
      }
      prevCountRef.current = list.length;
    }, () => {
      // Error silencioso (permisos Firestore, etc.)
    });

    // Evitar la notificación en el primer render
    prevCountRef.current = -1;
    setTimeout(() => {
      prevCountRef.current = 0;
    }, 2000);

    return () => unsub();
  }, [user.uid]);

  // Cerrar panel al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleOpen = () => setOpen(prev => !prev);

  const handleMarkRead = async (notif: AppNotification) => {
    await notificationService.markRead(user.uid, notif.id);
  };

  const handleMarkAllRead = async () => {
    await notificationService.markAllRead(user.uid);
    setOpen(false);
  };

  const unreadCount = notifications.length;

  return (
    <div className="relative" ref={panelRef}>
      {/* Campana */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-full hover:bg-logia-700 transition-colors"
        title="Notificaciones"
        aria-label={`${unreadCount} notificaciones sin leer`}
      >
        <span className="text-xl select-none">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-lg animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel desplegable */}
      {open && (
        <div className="absolute right-0 top-12 w-80 max-h-[420px] bg-logia-800 border border-logia-700 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-logia-700 bg-logia-900">
            <h3 className="font-bold text-white text-sm">Notificaciones</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-indigo-400 hover:text-indigo-200 underline"
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                <div className="text-3xl mb-2">🔕</div>
                <p className="text-sm">Sin notificaciones</p>
              </div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  className="flex gap-3 px-4 py-3 border-b border-logia-700/50 hover:bg-logia-700/30 cursor-pointer"
                  onClick={() => handleMarkRead(notif)}
                >
                  <div className="text-2xl flex-shrink-0 mt-0.5">
                    {TYPE_ICONS[notif.type] || '🔔'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold leading-tight truncate">
                      {notif.title}
                    </p>
                    <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">
                      {notif.body}
                    </p>
                    <p className="text-gray-600 text-[10px] mt-1">
                      {new Date(notif.createdAt).toLocaleString('es-MX', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <button
                    className="text-gray-500 hover:text-green-400 text-lg flex-shrink-0 self-start"
                    title="Marcar como leída"
                    onClick={e => { e.stopPropagation(); handleMarkRead(notif); }}
                  >
                    ✓
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
