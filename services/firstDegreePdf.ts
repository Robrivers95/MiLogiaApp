import {getFunctions,httpsCallable} from 'firebase/functions';
import {auth} from './firebase';
export const FIRST_DEGREE_SHA='eca9fa5e4cc9b2028e4d9297ba064006d568a8a74736199ecd0bf06224b0f117';
export async function loadFirstDegreePdf(){
 if(!auth.currentUser)throw Error('Inicia sesión para abrir la liturgia.');
 const result=await httpsCallable(getFunctions(undefined,'us-central1'),'templeReadingService')({action:'pdf'}),data=result.data as any;
 if(data?.sha256!==FIRST_DEGREE_SHA||data.byteLength!==756720||typeof data.pdfBase64!=='string'||data.pdfBase64.length!==1008960)throw Error('La copia del PDF no está completa.');
 const raw=atob(data.pdfBase64),buffer=new ArrayBuffer(raw.length),bytes=new Uint8Array(buffer);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==FIRST_DEGREE_SHA)throw Error('La copia del PDF no coincide con el original.');
 return URL.createObjectURL(new Blob([buffer],{type:'application/pdf'}));
}
