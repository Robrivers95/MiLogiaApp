import React, { useEffect, useState, useRef } from 'react';
import { User, AppNotification } from '../types';
import { notificationService } from '../services/api';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';

interface Props {
  user: User;
  onNavigate?: (view: string) => void;
}

const TYPE_ICONS: Record<string, string> = {
  attendance: '✅', trivia: '🧠', notice: '📢', profile_edit: '📝',
  payment: '💰', payment_receipt: '🧾', payment_matrix: '📊', task: '📌',
};

const TYPE_TO_VIEW: Record<string, string> = {
  notice: 'notices', payment: 'payments', payment_receipt: 'payments',
  attendance: 'attendance', trivia: 'library', profile_edit: 'profile',
  payment_matrix: 'payments', task: 'home',
};

const destinationFor = (notif: AppNotification) =>
  ((notif as any).view as string | undefined) || TYPE_TO_VIEW[notif.type] || 'home';

const showNativeNotification = async (notif: AppNotification) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const view = destinationFor(notif);
  const imageUrl = (notif as any).imageUrl as string | undefined;
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(notif.title, {
        body: notif.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: `${notif.type}-${notif.id}`,
        data: { view, notificationId: notif.id, imageUrl },
        ...(imageUrl ? { image: imageUrl } : {}),
      } as NotificationOptions);
      return;
    }
    const nativeNotif = new Notification(notif.title, {
      body: notif.body,
      icon: '/icons/icon-192.png',
      tag: `${notif.type}-${notif.id}`,
    });
    nativeNotif.onclick = () => {
      window.focus();
      window.location.assign(`/?view=${encodeURIComponent(view)}`);
      nativeNotif.close();
    };
  } catch (error) {
    console.warn('No se pudo mostrar la notificación nativa', error);
  }
};

const NotificationBell: React.FC<Props> = ({ user, onNavigate }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [permissionAsked, setPermissionAsked] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (permissionAsked || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      const timer = setTimeout(async () => {
        const granted = await notificationService.requestPermission();
        await notificationService.savePermissionStatus(user.uid, granted);
        setPermissionAsked(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
    setPermissionAsked(true);
  }, [user.uid, permissionAsked]);

  useEffect(() => {
    const notificationsQuery = query(
      collection(db, 'users', user.uid, 'notifications'),
      where('read', '==', false), orderBy('createdAt', 'desc'), limit(30)
    );
    const unsub = onSnapshot(notificationsQuery, snap => {
      const list = snap.docs.map(item => item.data() as AppNotification);
      setNotifications(list);
      if (list.length > prevCountRef.current && prevCountRef.current !== -1) {
        const newest = list[0];
        if (newest) void showNativeNotification(newest);
      }
      prevCountRef.current = list.length;
    }, () => undefined);
    prevCountRef.current = -1;
    const timer = window.setTimeout(() => { prevCountRef.current = 0; }, 2000);
    return () => { window.clearTimeout(timer); unsub(); };
  }, [user.uid]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleNotifClick = async (notif: AppNotification) => {
    await notificationService.markRead(user.uid, notif.id);
    const imageUrl = (notif as any).imageUrl as string | undefined;
    if (imageUrl) { setPreviewImage(imageUrl); return; }
    setOpen(false);
    if (onNavigate) onNavigate(destinationFor(notif));
  };

  const handleMarkAllRead = async () => {
    await notificationService.markAllRead(user.uid);
    setOpen(false);
  };

  const unreadCount = notifications.length;
  return (
    <>
      <div className="relative" ref={panelRef}>
        <button onClick={() => setOpen(value => !value)} className="relative p-2 rounded-full hover:bg-logia-700 transition-colors" title="Notificaciones y buzón" aria-label={`${unreadCount} notificaciones sin leer`}>
          <span className="text-xl select-none">🔔</span>
          {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-lg animate-pulse">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </button>
        {open && (
          <div className="fixed right-2 top-[65px] w-80 max-w-[calc(100vw-1rem)] max-h-[70vh] bg-logia-800 border border-logia-700 rounded-xl shadow-2xl z-[200] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-logia-700 bg-logia-900">
              <div><h3 className="font-bold text-white text-sm">Buzón y notificaciones</h3><p className="text-[10px] text-gray-500">Avisos, tareas, comprobantes e imágenes</p></div>
              {unreadCount > 0 && <button onClick={handleMarkAllRead} className="text-xs text-indigo-400 hover:text-indigo-200 underline">Marcar todas como leídas</button>}
            </div>
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="text-center py-10 text-gray-500"><div className="text-3xl mb-2">🔕</div><p className="text-sm">Sin mensajes nuevos</p></div>
              ) : notifications.map(notif => {
                const imageUrl = (notif as any).imageUrl as string | undefined;
                return (
                  <div key={notif.id} className="flex gap-3 px-4 py-3 border-b border-logia-700/50 hover:bg-logia-700/30 cursor-pointer" onClick={() => handleNotifClick(notif)}>
                    <div className="text-2xl flex-shrink-0 mt-0.5">{TYPE_ICONS[notif.type] || '🔔'}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold leading-tight">{notif.title}</p>
                      <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{notif.body}</p>
                      {imageUrl && <div className="mt-2 rounded-lg overflow-hidden border border-white/10 bg-black/20"><img src={imageUrl} alt="Imagen adjunta" className="w-full h-24 object-cover" loading="lazy" /><p className="text-[10px] text-center py-1 text-amber-300">Toca para ver la imagen completa</p></div>}
                      <p className="text-gray-600 text-[10px] mt-1">{new Date(notif.createdAt).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <button className="text-gray-500 hover:text-green-400 text-lg flex-shrink-0 self-start" title="Marcar como leída" onClick={event => { event.stopPropagation(); void notificationService.markRead(user.uid, notif.id); }}>✓</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {previewImage && <div className="fixed inset-0 z-[300] bg-black/85 p-3 flex items-center justify-center" onClick={() => setPreviewImage(null)}><div className="max-w-6xl w-full max-h-[94vh] overflow-auto rounded-2xl bg-logia-900 border border-amber-500/40 p-3" onClick={event => event.stopPropagation()}><div className="flex justify-between items-center mb-2"><p className="text-white font-bold">Imagen recibida en el buzón</p><button className="text-white text-xl px-2" onClick={() => setPreviewImage(null)} aria-label="Cerrar">✕</button></div><img src={previewImage} alt="Matriz de pagos" className="max-w-none min-w-full h-auto rounded-lg bg-white" /></div></div>}
    </>
  );
};

export default NotificationBell;
