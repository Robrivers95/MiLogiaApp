
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

// --- CONFIGURACIÓN DE FIREBASE PARA REGISTROLOGIA ---
const firebaseConfig = {
  apiKey: "AIzaSyASWup-3BsCi9zvIZYb_6BfM2mvkv5frgg", // Si tienes errores de autenticación, verifica esta Key en tu consola
  authDomain: "registrologia.firebaseapp.com",
  projectId: "registrologia",
  storageBucket: "registrologia.firebasestorage.app",
  messagingSenderId: "635701699225",
  appId: "1:635701699225:web:0edf683ec4a6816a96ce08",
  measurementId: "G-BL97DVCY3F"
};

// Inicialización de la App (Singleton)
let app: FirebaseApp;
try {
    if (!getApps().length) {
        app = initializeApp(firebaseConfig);
    } else {
        app = getApp();
    }
} catch (e) {
    console.error("Error inicializando Firebase:", e);
    // Fallback por si acaso
    if (getApps().length > 0) {
        app = getApps()[0];
    } else {
        throw e;
    }
}

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

// Indicamos que ya está configurada para saltar la pantalla de Setup
export const isConfigured = true;

// Funciones legacy para compatibilidad con componentes antiguos
export const saveFirebaseConfig = (config: string) => true;
export const resetFirebaseConfig = () => {};
