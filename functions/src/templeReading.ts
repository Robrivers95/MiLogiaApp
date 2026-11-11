import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {readFileSync} from 'fs';
import {join} from 'path';
import {createHash} from 'crypto';
const PDF_SHA='eca9fa5e4cc9b2028e4d9297ba064006d568a8a74736199ecd0bf06224b0f117';
export const templeReadingService=functions.region('us-central1').runWith({timeoutSeconds:30,memory:'256MB',maxInstances:3}).https.onCall(async(data,context)=>{
 if(!context.auth)throw new functions.https.HttpsError('unauthenticated','Inicia sesión para abrir la liturgia.');
 if(data?.action!=='pdf')throw new functions.https.HttpsError('invalid-argument','Selecciona la liturgia de primer grado.');
 const db=admin.firestore(),uid=context.auth.uid;
 const [actor,security]=await Promise.all([db.doc(`users/${uid}`).get(),db.doc(`accountSecurity/${uid}`).get()]);
 const p=actor.data(),s=security.data();
 if(!actor.exists||!p||(p.role!=='master'&&(p.active!==true||!p.groupId))||s?.mustChangePassword||Number(context.auth.token.auth_time||0)<Number(s?.validAfterSeconds||0))
  throw new functions.https.HttpsError('permission-denied','Tu sesión requiere un miembro activo o Admin Master.');
 // A fixed, bundled first-degree file: no caller-supplied path, cloud object,
 // document write, shared download token or elevated storage permission.
 const bytes=readFileSync(join(__dirname,'../assets/liturgia-primer-grado.pdf'));
 if(bytes.length!==756720||createHash('sha256').update(bytes).digest('hex')!==PDF_SHA)
  throw new functions.https.HttpsError('internal','No se pudo verificar la copia de la liturgia.');
 return {pdfBase64:bytes.toString('base64'),sha256:PDF_SHA,byteLength:bytes.length,pages:101,mime:'application/pdf'};
});
