import {doc,runTransaction} from 'firebase/firestore';
import {auth,db} from './firebase';
import type {Group} from '../types';

export async function readLodgeLogo(file:File):Promise<string>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>8*1024*1024)throw Error('Elige una foto JPG, PNG o WebP de máximo 8 MB.');
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();img.src=url;await img.decode();
    if(!img.width || !img.height)throw Error('No se pudo leer la imagen.');
    const scale=Math.min(256/img.width,256/img.height,1);const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('No se pudo preparar la imagen.');ctx.fillStyle='#f3f1e9';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.85);
  }finally{URL.revokeObjectURL(url);}
}
export async function saveLodgeLogo(groupId:string,logoImageUrl:string){
  if(logoImageUrl && (!logoImageUrl.startsWith('data:image/jpeg;base64,') || logoImageUrl.length>150000))throw Error('La imagen del logo no es válida o es demasiado grande.');
  if(!auth.currentUser || !groupId)throw Error('Inicia sesión en tu logia.');
  const uid=auth.currentUser.uid;
  await runTransaction(db,async tx=>{
    const actor=await tx.get(doc(db,'users',uid));const target=doc(db,'groups',groupId);const group=await tx.get(target);
    const data=actor.data();
    if(!data || !['admin','master'].includes(data.role) || data.active===false || (data.role!=='master' && data.groupId!==groupId))throw Error('Solo el Admin de esta logia o Admin master puede cambiar el logo.');
    if(!group.exists() || group.data().active===false)throw Error('La logia está en modo solo lectura.');
    tx.update(target,{logoImageUrl,logoUpdatedAt:Date.now(),logoUpdatedBy:uid});
  });
  window.dispatchEvent(new CustomEvent('lodge-identity-updated',{detail:{groupId}}));
}
export const validLodgeLogo=(group:Pick<Group,'logoImageUrl'>)=>!!group.logoImageUrl && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(group.logoImageUrl) && group.logoImageUrl.length<=150000;
