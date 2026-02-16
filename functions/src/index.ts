import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

/**
 * Cloud Function para enviar notificaciones push
 * Endpoint: https://us-central1-registrologia.cloudfunctions.net/sendNotification
 */
export const sendNotification = functions.https.onRequest(async (req, res) => {
  // Habilitar CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const { tokens, notification, data } = req.body;

    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      res.status(400).json({ error: 'Se requiere un array de tokens' });
      return;
    }

    if (!notification || !notification.title || !notification.body) {
      res.status(400).json({ error: 'Se requiere notification con title y body' });
      return;
    }

    // Construir el mensaje
    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
        icon: notification.icon || '/icon-192.png'
      },
      data: data || {},
      webpush: {
        fcmOptions: {
          link: 'https://registrologia.web.app'
        }
      }
    };

    // Enviar a todos los tokens
    const responses = await Promise.allSettled(
      tokens.map((token: string) => 
        admin.messaging().send({ ...message, token })
      )
    );

    // Contar éxitos y fallos
    const successCount = responses.filter(r => r.status === 'fulfilled').length;
    const failureCount = responses.filter(r => r.status === 'rejected').length;

    console.log(`Notificaciones enviadas: ${successCount} exitosas, ${failureCount} fallidas`);

    res.status(200).json({
      success: true,
      successCount,
      failureCount,
      total: tokens.length
    });

  } catch (error) {
    console.error('Error enviando notificaciones:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Cloud Function para enviar notificación a un grupo específico
 */
export const sendNotificationToGroup = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { groupId, notification, data } = req.body;

    if (!groupId) {
      res.status(400).json({ error: 'Se requiere groupId' });
      return;
    }

    // Obtener todos los usuarios activos del grupo
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .where('groupId', '==', groupId)
      .where('active', '==', true)
      .get();

    const tokens: string[] = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.fcmToken) {
        tokens.push(userData.fcmToken);
      }
    });

    if (tokens.length === 0) {
      res.status(200).json({
        success: true,
        message: 'No hay usuarios con tokens en este grupo',
        successCount: 0
      });
      return;
    }

    // Construir el mensaje
    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
        icon: notification.icon || '/icon-192.png'
      },
      data: data || {},
      webpush: {
        fcmOptions: {
          link: 'https://registrologia.web.app'
        }
      }
    };

    // Enviar a todos los tokens
    const responses = await Promise.allSettled(
      tokens.map((token: string) => 
        admin.messaging().send({ ...message, token })
      )
    );

    const successCount = responses.filter(r => r.status === 'fulfilled').length;
    const failureCount = responses.filter(r => r.status === 'rejected').length;

    console.log(`Notificaciones al grupo ${groupId}: ${successCount} exitosas, ${failureCount} fallidas`);

    res.status(200).json({
      success: true,
      successCount,
      failureCount,
      total: tokens.length
    });

  } catch (error) {
    console.error('Error enviando notificaciones al grupo:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
