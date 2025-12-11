
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

const CONFIG_KEY = 'logia_firebase_config';

// Configuración proporcionada por el usuario para RegistroLogia
const defaultFirebaseConfig = {
  apiKey: "AIzaSyASWup-3BsCi9zvIZYb_6BfM2mvkv5frgg",
  authDomain: "registrologia.firebaseapp.com",
  projectId: "registrologia",
  storageBucket: "registrologia.firebasestorage.app",
  messagingSenderId: "635701699225",
  appId: "1:635701699225:web:0edf683ec4a6816a96ce08",
  measurementId: "G-BL97DVCY3F"
};

// 1. Intentar cargar configuración guardada o usar la default
const savedConfigStr = localStorage.getItem(CONFIG_KEY);
let firebaseConfig = defaultFirebaseConfig;
let isConfigured = true; // Asumimos true porque ya tenemos credenciales válidas en el código

try {
  if (savedConfigStr) {
    const parsed = JSON.parse(savedConfigStr);
    if (parsed.apiKey) {
        firebaseConfig = parsed;
    }
  }
} catch (e) {
  console.error("Error parsing saved config", e);
}

// 3. Inicializar Firebase (Singleton)
let app: FirebaseApp;
try {
    if (!getApps().length) {
        app = initializeApp(firebaseConfig);
    } else {
        app = getApp();
    }
} catch (e) {
    console.error("Firebase initialization error:", e);
    // Fallback
    app = getApps()[0] || undefined as unknown as FirebaseApp; 
}

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

// 4. Helpers para la UI de Configuración (por si quieres cambiar de proyecto en el futuro)
export const saveFirebaseConfig = (configText: string): boolean => {
  try {
    // Limpiar el string por si el usuario copió "const firebaseConfig = "
    let jsonStr = configText;
    if (jsonStr.includes('=')) {
        jsonStr = jsonStr.split('=')[1].trim();
        if (jsonStr.endsWith(';')) jsonStr = jsonStr.slice(0, -1);
    }
    
    const config = JSON.parse(jsonStr);
    
    if (!config.apiKey) throw new Error("Falta apiKey en el JSON");
    
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    window.location.reload(); // Recargar para aplicar cambios
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
};

export const resetFirebaseConfig = () => {
  localStorage.removeItem(CONFIG_KEY);
  window.location.reload();
};

export { isConfigured };
