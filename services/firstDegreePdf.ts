import {doc,getDoc} from 'firebase/firestore';
import {auth,db} from './firebase';
export const FIRST_DEGREE_SHA='eca9fa5e4cc9b2028e4d9297ba064006d568a8a74736199ecd0bf06224b0f117';
export async function loadFirstDegreePdf(){
 if(!auth.currentUser)throw Error('Inicia sesión para abrir la liturgia.');
 const result=await getDoc(doc(db,'templeReadings','primer-grado'));
 if(!result.exists())throw Error('La liturgia aún no está disponible.');
 const data=result.data(),bytes:Uint8Array=data.pdfBytes?.toUint8Array?.();
 if(!bytes||bytes.length!==756720||data.sha256!==FIRST_DEGREE_SHA)throw Error('La copia del PDF no está completa.');
 const buffer=new ArrayBuffer(bytes.length);new Uint8Array(buffer).set(bytes);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==FIRST_DEGREE_SHA)throw Error('La copia del PDF no coincide con el original.');
 return URL.createObjectURL(new Blob([buffer],{type:'application/pdf'}));
}
