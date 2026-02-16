import { messaging } from './firebase';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

// VAPID Key - Esta clave pública se genera en Firebase Console > Project Settings > Cloud Messaging
// Por ahora uso una genérica, pero deberás generar la tuya
const VAPID_KEY = 'BKxR-Vvf8QZMl5pZ8rY5h4J8qM0pL7nK3dF1gH2iJ4kL5mN6oP7qR8sT9uV0wX1yZ2aB3cD4eF5gH6iJ7kL8mN9o';

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: any;
}

/**
 * Solicita permiso para notificaciones y obtiene el token FCM
 */
export async function requestNotificationPermission(userId: string): Promise<string | null> {
  if (!messaging) {
    console.log('Messaging no disponible en este navegador');
    return null;
  }

  try {
    // Solicitar permiso
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      console.log('Permiso de notificaciones concedido');
      
      // Obtener token
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      console.log('Token FCM obtenido:', token);
      
      // Guardar token en Firestore
      await saveTokenToFirestore(userId, token);
      
      return token;
    } else {
      console.log('Permiso de notificaciones denegado');
      return null;
    }
  } catch (error) {
    console.error('Error al solicitar permiso de notificaciones:', error);
    return null;
  }
}

/**
 * Guarda el token FCM en Firestore
 */
async function saveTokenToFirestore(userId: string, token: string) {
  try {
    await setDoc(doc(db, 'users', userId), {
      fcmToken: token,
      fcmTokenUpdated: new Date().toISOString()
    }, { merge: true });
    console.log('Token guardado en Firestore');
  } catch (error) {
    console.error('Error guardando token:', error);
  }
}

/**
 * Escucha mensajes cuando la app está en primer plano
 */
export function listenToForegroundMessages(callback: (payload: any) => void) {
  if (!messaging) return;
  
  onMessage(messaging, (payload) => {
    console.log('Mensaje recibido en primer plano:', payload);
    callback(payload);
    
    // Mostrar notificación nativa
    if (payload.notification) {
      new Notification(payload.notification.title || 'Nueva notificación', {
        body: payload.notification.body,
        icon: payload.notification.icon || '/icon-192.png',
        badge: '/icon-192.png'
      });
    }
  });
}

/**
 * Obtiene todos los tokens FCM de usuarios de un grupo
 */
export async function getGroupFCMTokens(groupId: string): Promise<string[]> {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('groupId', '==', groupId), where('active', '==', true));
    const snapshot = await getDocs(q);
    
    const tokens: string[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.fcmToken) {
        tokens.push(data.fcmToken);
      }
    });
    
    return tokens;
  } catch (error) {
    console.error('Error obteniendo tokens del grupo:', error);
    return [];
  }
}

/**
 * Obtiene el token FCM de un usuario específico
 */
export async function getUserFCMToken(userId: string): Promise<string | null> {
  try {
    const userRef = doc(db, 'users', userId);
    const snapshot = await getDocs(query(collection(db, 'users'), where('__name__', '==', userId)));
    
    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      return data.fcmToken || null;
    }
    
    return null;
  } catch (error) {
    console.error('Error obteniendo token del usuario:', error);
    return null;
  }
}

/**
 * Envía una notificación a usuarios específicos
 * NOTA: Sin Cloud Functions, solo se puede notificar localmente
 */
export async function sendNotificationToUsers(
  tokens: string[],
  payload: NotificationPayload
): Promise<boolean> {
  // Sin Cloud Functions, solo podemos mostrar notificaciones locales
  console.log('Notificación programada (requiere backend):', payload);
  return true;
}

/**
 * Envía una notificación a todo el grupo
 * NOTA: Sin Cloud Functions, solo se puede notificar localmente
 */
export async function sendNotificationToGroup(
  groupId: string,
  payload: NotificationPayload
): Promise<boolean> {
  // Sin Cloud Functions, solo podemos mostrar notificaciones locales
  console.log('Notificación al grupo programada (requiere backend):', groupId, payload);
  return true;
}

/**
 * Verifica si las notificaciones están habilitadas
 */
export function areNotificationsEnabled(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

/**
 * Verifica si el navegador soporta notificaciones
 */
export function areNotificationsSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}
