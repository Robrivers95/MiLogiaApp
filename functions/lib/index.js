"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotificationToGroup = exports.sendNotification = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
/**
 * Cloud Function para enviar notificaciones push
 * Endpoint: https://us-central1-registrologia.cloudfunctions.net/sendNotification
 */
exports.sendNotification = functions.https.onRequest(async (req, res) => {
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
        const responses = await Promise.allSettled(tokens.map((token) => admin.messaging().send(Object.assign(Object.assign({}, message), { token }))));
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
    }
    catch (error) {
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
exports.sendNotificationToGroup = functions.https.onRequest(async (req, res) => {
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
        const tokens = [];
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
        const responses = await Promise.allSettled(tokens.map((token) => admin.messaging().send(Object.assign(Object.assign({}, message), { token }))));
        const successCount = responses.filter(r => r.status === 'fulfilled').length;
        const failureCount = responses.filter(r => r.status === 'rejected').length;
        console.log(`Notificaciones al grupo ${groupId}: ${successCount} exitosas, ${failureCount} fallidas`);
        res.status(200).json({
            success: true,
            successCount,
            failureCount,
            total: tokens.length
        });
    }
    catch (error) {
        console.error('Error enviando notificaciones al grupo:', error);
        res.status(500).json({
            error: 'Error interno del servidor',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
//# sourceMappingURL=index.js.map