import {auth,db} from './firebase';
import {doc,runTransaction} from 'firebase/firestore';
import {normalizePayment} from './paymentAccounting';
import {validCaptureDate} from './quickFinance';
import type {Payment} from '../types';
export async function correctManualMonthly(groupId:string,memberId:string,previous:Payment,paid:number,date:string,reason:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(previous.period)||[groupId,memberId].some(s=>!s||s.includes('/'))||!Number.isFinite(paid)||paid<0||Math.abs(paid*100-Math.round(paid*100))>.00001||!reason.trim()||reason.length>500)throw Error('Revisa el monto y el motivo de la corrección.');
 const depositDate=date?validCaptureDate(date):null;if(paid>0&&!depositDate)throw Error('Indica la fecha del depósito.');
 await runTransaction(db,async tx=>{
  const uid=auth.currentUser?.uid;if(!uid)throw Error('Inicia sesión.');
  const ref=doc(db,'users',memberId,'ledger',previous.period);
  const [actor,group,member,snap]=await Promise.all([tx.get(doc(db,'users',uid)),tx.get(doc(db,'groups',groupId)),tx.get(doc(db,'users',memberId)),tx.get(ref)]);
  const a=actor.data();if(!actor.exists()||!a.active||!['admin','master'].includes(a.role)||(a.role!=='master'&&a.groupId!==groupId)||!group.exists()||group.data().active===false||!member.exists()||member.data().groupId!==groupId||!snap.exists())throw Error('No tienes permiso para corregir este registro.');
  const raw={...snap.data(),period:previous.period} as Payment,live=normalizePayment(raw),old=normalizePayment(previous);
  if(raw.groupId&&raw.groupId!==groupId)throw Error('La cuota pertenece a otra logia.');
  if(live.amount!==old.amount||live.paidRegular!==old.paidRegular||(raw.paymentDate||'')!==(previous.paymentDate||''))throw Error('El registro cambió. Actualiza la consulta y revisa de nuevo.');
  if(paid>live.amount)throw Error('El abono excede la cuota; usa la corrección de anticipos para repartirlo.');
  const next=normalizePayment({...live,paidRegular:paid,paymentDate:depositDate});
  tx.update(ref,JSON.parse(JSON.stringify({...next,correctionHistory:[...(raw.correctionHistory||[]),{at:new Date().toISOString(),by:uid,reason:reason.trim(),before:live.paid,after:next.paid,beforeDate:raw.paymentDate||null,afterDate:depositDate}]})));
 });
 window.dispatchEvent(new CustomEvent('finance-updated',{detail:{groupId}}));
}
