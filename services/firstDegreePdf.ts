import {getBlob,ref} from 'firebase/storage';
import {auth,storage} from './firebase';
export const FIRST_DEGREE_PATH='templeStudy/liturgia-primer-grado.pdf';
export async function loadFirstDegreePdf(){
 if(!auth.currentUser)throw Error('Inicia sesión para abrir la liturgia.');
 const blob=await getBlob(ref(storage,FIRST_DEGREE_PATH),2*1024*1024);
 if(!blob.size)throw Error('El PDF no está disponible.');
 return URL.createObjectURL(new Blob([blob],{type:'application/pdf'}));
}
