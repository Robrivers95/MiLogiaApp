import {auth,db} from './firebase';
import {doc,runTransaction} from 'firebase/firestore';
import {assignMonthlyQuota,monthlyPrice} from './monthlyQuotas';
export const monthlyQuotaApi={assign:async(groupId:string,memberIds:string[],period:string,expectedAmount:number,confirmed:boolean)=>{
 if(!confirmed)throw Error('Confirma el mes y los miembros seleccionados.');
 const ids=[...new Set(memberIds)];
 if(!groupId||groupId.includes('/')||!ids.length||ids.length>60||ids.some(id=>!id||id.includes('/')))throw Error('Selecciona entre 1 y 60 miembros de esta logia.');
 const result=await runTransaction(db,async tx=>{
  const uid=auth.currentUser?.uid;if(!uid)throw Error('Inicia sesión.');
  const [actor,group]=await Promise.all([tx.get(doc(db,'users',uid)),tx.get(doc(db,'groups',groupId))]);
  const a=actor.data();if(!actor.exists()||!a.active||!['admin','master'].includes(a.role)||(a.role!=='master'&&a.groupId!==groupId)||!group.exists()||group.data().active===false)throw Error('Solo administradores de una logia activa pueden asignar cuotas.');
  const amount=monthlyPrice(group.data(),period);if(amount!==expectedAmount)throw Error('El precio cambió. Actualiza y confirma de nuevo.');
  const members=await Promise.all(ids.map(id=>tx.get(doc(db,'users',id))));
  const refs=ids.map(id=>doc(db,'users',id,'ledger',period)),ledgers=await Promise.all(refs.map(ref=>tx.get(ref)));
  if(members.some(m=>!m.exists()||m.data().groupId!==groupId)||ledgers.some(l=>l.exists()&&l.data().groupId&&l.data().groupId!==groupId))throw Error('Un miembro o una cuota no pertenece a esta logia.');
  let created=0;ledgers.forEach((ledger,i)=>{const next=assignMonthlyQuota(ledger.exists()?{...ledger.data(),period} as any:undefined,period,amount,uid);if(next){tx.set(refs[i],JSON.parse(JSON.stringify({...next,groupId})));created++;}});
  return {created,existing:ids.length-created};
 });
 window.dispatchEvent(new CustomEvent('finance-updated',{detail:{groupId}}));return result;
}};
