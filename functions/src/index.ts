import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

/**
 * Cloud Function para enviar notificaciones push
 * Endpoint: https://us-central1-registrologia.cloudfunctions.net/sendNotification
 */
export const sendNotification = functions.https.onRequest(async (req, res) => {
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

    const responses = await Promise.allSettled(
      tokens.map((token: string) => admin.messaging().send({ ...message, token }))
    );

    const successCount = responses.filter(r => r.status === 'fulfilled').length;
    const failureCount = responses.filter(r => r.status === 'rejected').length;

    res.status(200).json({ success: true, successCount, failureCount, total: tokens.length });
  } catch (error) {
    console.error('Error enviando notificaciones:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/** Cloud Function para enviar notificación a un grupo específico. */
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

    const usersSnapshot = await admin.firestore()
      .collection('users')
      .where('groupId', '==', groupId)
      .where('active', '==', true)
      .get();

    const tokens: string[] = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.fcmToken) tokens.push(userData.fcmToken);
    });

    if (tokens.length === 0) {
      res.status(200).json({ success: true, message: 'No hay usuarios con tokens en este grupo', successCount: 0 });
      return;
    }

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

    const responses = await Promise.allSettled(
      tokens.map((token: string) => admin.messaging().send({ ...message, token }))
    );

    const successCount = responses.filter(r => r.status === 'fulfilled').length;
    const failureCount = responses.filter(r => r.status === 'rejected').length;
    res.status(200).json({ success: true, successCount, failureCount, total: tokens.length });
  } catch (error) {
    console.error('Error enviando notificaciones al grupo:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

const ALLOWED_ACTIONS = [
  'dashboard', 'requests', 'users', 'fees', 'attendance', 'trivia', 'treasury',
  'notices', 'tasks', 'banks', 'visits', 'payment-matrix', 'create-user',
  'manual-merge', 'receipts', 'debt-notify', 'member-pending',
  'broadcast-matrix', 'register-payment'
] as const;

type AllowedAction = typeof ALLOWED_ACTIONS[number];

type IntentResult = {
  action: AllowedAction | 'unknown';
  confidence: number;
  parameters: {
    memberName?: string;
    year?: number;
    months?: number;
    paymentType?: 'regular' | 'extra';
  };
  alternatives: Array<{ action: AllowedAction; confidence: number }>;
  clarification?: string;
};

const isAllowedAction = (value: unknown): value is AllowedAction =>
  typeof value === 'string' && (ALLOWED_ACTIONS as readonly string[]).includes(value);

/**
 * Interpreta lenguaje natural, pero solo puede devolver acciones incluidas en ALLOWED_ACTIONS.
 * No lee ni escribe registros de negocio. La app sigue ejecutando y validando cada acción.
 */
export const interpretAdminIntent = functions
  .runWith({ secrets: ['GEMINI_API_KEY'], timeoutSeconds: 30, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Método no permitido' });
      return;
    }

    try {
      const authorization = req.get('Authorization') || '';
      if (!authorization.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Falta autenticación' });
        return;
      }

      const decoded = await admin.auth().verifyIdToken(authorization.slice(7));
      const userSnap = await admin.firestore().doc(`users/${decoded.uid}`).get();
      const profile = userSnap.data();
      if (!profile || !['admin', 'master'].includes(profile.role)) {
        res.status(403).json({ error: 'Solo Admin y Master pueden usar el asistente' });
        return;
      }

      const instruction = String(req.body?.instruction || '').trim().slice(0, 1000);
      const groupId = String(req.body?.groupId || '').trim();
      if (!instruction || !groupId) {
        res.status(400).json({ error: 'Faltan instruction o groupId' });
        return;
      }
      if (profile.role !== 'master' && profile.groupId !== groupId) {
        res.status(403).json({ error: 'La logia no corresponde al usuario' });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY no está configurada');

      const catalog = [
        ['dashboard', 'abrir resumen administrativo'],
        ['requests', 'revisar solicitudes pendientes'],
        ['users', 'administrar o consultar miembros'],
        ['fees', 'administrar cuotas normales o extraordinarias'],
        ['attendance', 'registrar o consultar asistencia'],
        ['trivia', 'crear o administrar trivias'],
        ['treasury', 'registrar o consultar ingresos y gastos'],
        ['notices', 'crear o administrar avisos'],
        ['tasks', 'crear, asignar o consultar tareas'],
        ['banks', 'consultar o actualizar bancos y efectivo'],
        ['visits', 'administrar solicitudes de visita'],
        ['payment-matrix', 'abrir matriz de pagos'],
        ['create-user', 'crear un miembro'],
        ['manual-merge', 'vincular usuarios temporales'],
        ['receipts', 'revisar comprobantes'],
        ['debt-notify', 'enviar recordatorios de adeudo'],
        ['member-pending', 'consultar cuánto debe y qué tareas pendientes tiene un miembro'],
        ['broadcast-matrix', 'enviar imagen de la matriz al buzón de todos'],
        ['register-payment', 'preparar registro de cuota normal o extraordinaria']
      ].map(([id, description]) => `${id}: ${description}`).join('\n');

      const prompt = `Eres un clasificador de intenciones para Mi Logia App.\n` +
        `Solo puedes elegir acciones del catálogo. Nunca inventes acciones y nunca ejecutes nada.\n` +
        `Si la petición pregunta cuánto debe una persona o qué pendientes tiene, usa member-pending y extrae memberName.\n` +
        `Si la intención es clara, confidence debe ser >= 0.85. Si es ambigua, usa unknown y entrega hasta 3 alternatives.\n` +
        `Catálogo:\n${catalog}\n\nInstrucción del usuario: ${JSON.stringify(instruction)}`;

      const geminiResponse = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0,
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  action: { type: 'STRING' },
                  confidence: { type: 'NUMBER' },
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      memberName: { type: 'STRING' },
                      year: { type: 'INTEGER' },
                      months: { type: 'INTEGER' },
                      paymentType: { type: 'STRING' }
                    }
                  },
                  alternatives: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        action: { type: 'STRING' },
                        confidence: { type: 'NUMBER' }
                      },
                      required: ['action', 'confidence']
                    }
                  },
                  clarification: { type: 'STRING' }
                },
                required: ['action', 'confidence', 'parameters', 'alternatives']
              }
            }
          })
        }
      );

      if (!geminiResponse.ok) {
        const details = await geminiResponse.text();
        throw new Error(`Gemini respondió ${geminiResponse.status}: ${details.slice(0, 300)}`);
      }

      const payload: any = await geminiResponse.json();
      const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('Gemini no devolvió una intención');
      const raw = JSON.parse(rawText);

      const result: IntentResult = {
        action: isAllowedAction(raw.action) ? raw.action : 'unknown',
        confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
        parameters: {
          ...(typeof raw.parameters?.memberName === 'string' && { memberName: raw.parameters.memberName.trim().slice(0, 150) }),
          ...(Number.isInteger(raw.parameters?.year) && { year: raw.parameters.year }),
          ...(Number.isInteger(raw.parameters?.months) && { months: raw.parameters.months }),
          ...(['regular', 'extra'].includes(raw.parameters?.paymentType) && { paymentType: raw.parameters.paymentType })
        },
        alternatives: Array.isArray(raw.alternatives)
          ? raw.alternatives
              .filter((item: any) => isAllowedAction(item?.action))
              .slice(0, 3)
              .map((item: any) => ({ action: item.action, confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)) }))
          : [],
        ...(typeof raw.clarification === 'string' && { clarification: raw.clarification.slice(0, 300) })
      };

      res.status(200).json(result);
    } catch (error) {
      console.error('Error interpretando intención:', error);
      res.status(500).json({
        error: 'No fue posible interpretar la instrucción',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
