import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {mayRecover,validNewPassword} from './accessPolicy';

const callable=functions.region('us-central1').runWith({timeoutSeconds:60,memory:'256MB',maxInstances:3});
const fail=(code:functions.https.FunctionsErrorCode,message:string):never=>{throw new functions.https.HttpsError(code,message);};
const identifier=(value:unknown)=>typeof value==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : fail('invalid-argument','Identificador inválido.');

export const adminMemberAccess=callable.https.onCall(async(data,context)=>{
  if(!context.auth) return fail('unauthenticated','Inicia sesión como administrador.');
  const actorId=context.auth.uid;const groupId=identifier(data?.groupId);const targetId=identifier(data?.userId);
  if(!['inspect','reset'].includes(data?.action))return fail('invalid-argument','Acción no válida.');
  const db=admin.firestore();const auth=admin.auth();const security=db.doc(`accountSecurity/${targetId}`);
  const [actorSnap,targetSnap,groupSnap,actorSecurity]=await Promise.all([db.doc(`users/${actorId}`).get(),db.doc(`users/${targetId}`).get(),db.doc(`groups/${groupId}`).get(),db.doc(`accountSecurity/${actorId}`).get()]);
  if(!actorSnap.exists || !targetSnap.exists || !mayRecover(actorSnap.data() || {},targetSnap.data() || {},actorId,targetId,groupId))return fail('permission-denied','Solo puedes recuperar cuentas de miembros de tu logia. Las cuentas Master y tu propia cuenta están protegidas.');
  if(actorSecurity.data()?.mustChangePassword)return fail('permission-denied','Cambia primero tu contraseña temporal.');
  if(!groupSnap.exists || groupSnap.data()?.active===false)return fail('failed-precondition','La logia está en modo solo lectura.');
  if(targetId.startsWith('temp_'))return fail('failed-precondition','Este miembro no tiene una cuenta vinculada. Usa Vincular cuenta real.');
  let account:admin.auth.UserRecord;
  try{account=await auth.getUser(targetId);}catch(error){return fail('not-found','No se encontró una cuenta de acceso vinculada a este miembro.');}
  if(account.disabled)return fail('failed-precondition','La cuenta está deshabilitada. No se cambia su contraseña.');
  if(!account.email || !account.providerData.some(provider=>provider.providerId==='password'))return fail('failed-precondition','La cuenta no usa correo y contraseña. Revisa su método de acceso.');
  if(data.action==='inspect')return {userId:targetId,email:account.email,name:targetSnap.data()?.name || '',mustChangePassword:(await security.get()).data()?.mustChangePassword===true};
  if(data.confirmIdentity!==true || !validNewPassword(data.temporaryPassword))return fail('invalid-argument','Confirma la identidad e indica una contraseña temporal de 10 a 128 caracteres con letras y números.');
  const authTime=Number(context.auth.token.auth_time || 0);
  if(Date.now()/1000-authTime>600)return fail('failed-precondition','Confirma de nuevo tu contraseña de administrador para continuar.');
  const operationId=identifier(data.operationId);const now=Date.now();let priorRequired=false;
  const alreadyDone=await db.runTransaction(async tx=>{
    const current=await tx.get(security);const value=current.data();
    if(value?.operationId===operationId && value?.status==='ready')return true;
    if((value?.status==='resetting' || value?.status==='changing') && now-Number(value.operationAt || 0)<120000)return fail('aborted','Ya hay una recuperación en curso. Espera y actualiza.');
    if(value?.lastResetAt && now-Number(value.lastResetAt)<60000)return fail('resource-exhausted','Espera un minuto antes de generar otra contraseña para este miembro.');
    priorRequired=value?.mustChangePassword===true;
    tx.set(security,{groupId,mustChangePassword:true,status:'resetting',operationId,operationAt:now,resetBy:actorId},{merge:true});return false;
  });
  if(alreadyDone)return {userId:targetId,email:account.email,mustChangePassword:true};
  let passwordUpdated=false;
  try{
    await auth.updateUser(targetId,{password:data.temporaryPassword});passwordUpdated=true;
    await auth.revokeRefreshTokens(targetId);
    const readyAt=Date.now();
    await db.runTransaction(async tx=>{
      const current=await tx.get(security);if(current.data()?.operationId!==operationId)return fail('aborted','La recuperación cambió. Actualiza la consulta.');
      tx.update(security,{mustChangePassword:true,status:'ready',lastResetAt:readyAt,validAfterSeconds:Math.floor(readyAt/1000),operationAt:readyAt});
      tx.set(db.doc(`accountRecoveryAudit/${targetId}_${operationId}`),{action:'temporary_password_set',groupId,targetId,actorId,at:readyAt});
    });
    return {userId:targetId,email:account.email,mustChangePassword:true};
  }catch(error){
    await db.runTransaction(async tx=>{const current=await tx.get(security);if(current.data()?.operationId===operationId)tx.update(security,{status:'failed',mustChangePassword:passwordUpdated || priorRequired,operationAt:Date.now()});}).catch(()=>{});
    functions.logger.error('Member recovery failed',{targetId,actorId,code:(error as {code?:string}).code || 'unknown',passwordUpdated});
    return fail('internal',passwordUpdated?'La contraseña fue actualizada, pero no se confirmó el cierre de la operación. Conserva la temporal e intenta iniciar sesión con ella.':'No se pudo actualizar la contraseña. No se confirmó ningún cambio.');
  }
});

export const finishMemberPasswordChange=callable.https.onCall(async(data,context)=>{
  if(!context.auth)return fail('unauthenticated','Inicia sesión con tu contraseña temporal.');
  if(!validNewPassword(data?.newPassword))return fail('invalid-argument','Elige al menos 10 caracteres con letras y números.');
  const uid=context.auth.uid;const db=admin.firestore();const target=db.doc(`accountSecurity/${uid}`);const now=Date.now();
  const previous=await db.runTransaction(async tx=>{
    const snapshot=await tx.get(target);const value=snapshot.data();
    if(!value?.mustChangePassword)return fail('failed-precondition','Esta cuenta no tiene un cambio de contraseña pendiente.');
    if(Number(context.auth?.token.auth_time || 0)<Number(value.validAfterSeconds || 0))return fail('unauthenticated','Vuelve a iniciar sesión con la contraseña temporal.');
    if(['changing','resetting'].includes(value.status) && now-Number(value.operationAt || 0)<120000)return fail('aborted','Ya hay un cambio en curso. Espera e intenta de nuevo.');
    tx.update(target,{status:'changing',operationAt:now});return value;
  });
  try{
    await admin.auth().updateUser(uid,{password:data.newPassword});
    await admin.auth().revokeRefreshTokens(uid);
    await db.runTransaction(async tx=>{
      const current=await tx.get(target);if(current.data()?.operationId!==previous.operationId || current.data()?.status!=='changing')return fail('aborted','Se inició otra recuperación. Vuelve a entrar.');
      const completedAt=Date.now();tx.update(target,{mustChangePassword:false,status:'complete',completedAt,validAfterSeconds:Math.floor(completedAt/1000)});
      tx.set(db.collection('accountRecoveryAudit').doc(),{action:'member_password_changed',groupId:previous.groupId,targetId:uid,actorId:uid,at:completedAt});
    });
    return {success:true};
  }catch(error){
    await db.runTransaction(async tx=>{const current=await tx.get(target);if(current.data()?.operationId===previous.operationId && current.data()?.status==='changing')tx.update(target,{status:'ready',mustChangePassword:true,operationAt:Date.now()});}).catch(()=>{});
    functions.logger.error('Member password completion failed',{uid,code:(error as {code?:string}).code || 'unknown'});
    return fail('internal','No se pudo confirmar el cambio. Si ya se actualizó la contraseña, vuelve a entrar con la nueva e intenta completar el proceso.');
  }
});
