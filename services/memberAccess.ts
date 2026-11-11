import {EmailAuthProvider,reauthenticateWithCredential,signInWithEmailAndPassword} from 'firebase/auth';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {auth} from './firebase';
const invoke=async<T,>(name:string,data:unknown):Promise<T>=>{
  try{return (await httpsCallable<unknown,T>(getFunctions(undefined,'us-central1'),name)(data)).data;}
  catch(error){const e=error as {code?:string;message?:string};if(['functions/not-found','functions/unavailable','functions/internal'].includes(e.code || '') && (!e.message || e.message==='internal'))throw Error('El servicio de recuperación no respondió. No se confirmó el cambio; conserva la contraseña temporal y vuelve a consultar.');throw error;}
};
export interface MemberAccessInfo {userId:string;email:string;name:string;mustChangePassword:boolean;}
export const memberAccessService={
  inspect:(groupId:string,userId:string)=>invoke<MemberAccessInfo>('adminMemberAccess',{action:'inspect',groupId,userId}),
  reset:async(groupId:string,userId:string,temporaryPassword:string,adminPassword:string,operationId:string)=>{
    if(!auth.currentUser?.email)throw Error('Vuelve a iniciar sesión como administrador.');
    await reauthenticateWithCredential(auth.currentUser,EmailAuthProvider.credential(auth.currentUser.email,adminPassword));
    await auth.currentUser.getIdToken(true);
    return invoke<MemberAccessInfo>('adminMemberAccess',{action:'reset',groupId,userId,temporaryPassword,confirmIdentity:true,operationId});
  },
  finish:async(newPassword:string)=>{
    const email=auth.currentUser?.email;if(!email)throw Error('Vuelve a entrar con tu contraseña temporal.');
    await invoke('finishMemberPasswordChange',{newPassword});
    await signInWithEmailAndPassword(auth,email,newPassword);
  }
};
export function temporaryMemberPassword(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';const bytes=crypto.getRandomValues(new Uint8Array(18));return 'G-'+Array.from(bytes,value=>alphabet[value%alphabet.length]).join('')+'8a';}
