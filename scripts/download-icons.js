import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { writeFileSync } from "fs";

const firebaseConfig = {
  apiKey: "AIzaSyASWup-3BsCi9zvIZYb_6BfM2mvkv5frgg",
  authDomain: "registrologia.firebaseapp.com",
  projectId: "registrologia",
  storageBucket: "registrologia.firebasestorage.app",
  messagingSenderId: "635701699225",
  appId: "1:635701699225:web:0edf683ec4a6816a96ce08",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function downloadIcons() {
  try {
    console.log('📥 Descargando iconos desde Firestore...');
    
    const configRef = doc(db, "appConfig", "icons");
    const configSnap = await getDoc(configRef);
    
    if (!configSnap.exists()) {
      console.log('⚠️  No hay iconos personalizados. Usando iconos por defecto.');
      process.exit(0);
    }
    
    const data = configSnap.data();
    
    // Save icon-192.png
    if (data.icon192) {
      const base64Data = data.icon192.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      writeFileSync('public/icons/icon-192.png', buffer);
      console.log('✅ icon-192.png generado');
    }
    
    // Save icon-512.png
    if (data.icon512) {
      const base64Data = data.icon512.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      writeFileSync('public/icons/icon-512.png', buffer);
      console.log('✅ icon-512.png generado');
    }
    
    console.log('🎉 Iconos descargados exitosamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error descargando iconos:', error);
    console.log('⚠️  Usando iconos por defecto');
    process.exit(0); // No falla el build
  }
}

downloadIcons();
