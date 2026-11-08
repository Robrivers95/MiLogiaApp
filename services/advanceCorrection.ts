import {auth,db} from './firebase';
import {doc,runTransaction} from 'firebase/firestore';
import type {Payment,PaymentReceipt} from '../types';
import {normalizePayment} from './paymentAccounting';
import {assignMonthlyQuota,monthlyPrice} from './monthlyQuotas';
import {validCaptureDate} from './quickFinance';
const cents=(n:number)=>Math.round(n*100);
export function advanceSources(payments:Payment[],receipts:PaymentReceipt[]){
 const ledger=payments.flatMap(p=>{const raw=Number(p.paidRegular??(!p.extraAmount&&!p.extraFees?.length&&!p.paidExtra?p.paid:0)),amount=(cents(raw)-cents(p.amount))/100;return amount>0?[{kind:'ledger' as const,id:p.period,amount,date:(p.paymentDate||'').slice(0,10),label:`Excedente en ${p.period}`}]:[];});
 const proofs=receipts.filter(r=>r.status==='approved'&&r.receiptType==='cuota_mensual'&&!r.ledgerIncluded&&!(r as any).unappliedEntryId&&Number(r.unappliedAmount)>0&&r.appliedAmount!==undefined&&cents(Number(r.amount))-cents(Number(r.appliedAmount))===cents(Number(r.unappliedAmount))).map(r=>({kind:'receipt' as const,id:r.id,amount:Number(r.unappliedAmount),date:(r.transferDate||'').slice(0,10),label:`Comprobante ${r.periods.join(', ')} · ${r.bankReference||r.id.slice(0,8)}`}));
 return [...proofs,...ledger.filter(l=>!receipts.some(r=>r.status==='approved'&&Number(r.unappliedAmount)>0&&(r.periods||[]).includes(l.id)))];
}
export interface AdvanceRequest {groupId:string;memberId:string;sourceKind:'receipt'|'ledger';sourceId:string;periods:string[];date:string;operationId:string;}
export async function correctAdvance(input:AdvanceRequest,expected?:string){
 const {groupId,memberId,sourceId,sourceKind,operationId}=input;
 if([groupId,memberId,sourceId,operationId].some(v=>!/^[-\w]{1,128}$/.test(v))||!['receipt','ledger'].includes(sourceKind))throw Error('Selecciona el miembro y el saldo de origen.');
 const periods=[...new Set(input.periods)].sort();if(!periods.length||periods.length>12||periods.length!==input.periods.length||periods.some(p=>!/^\d{4}-(0[1-9]|1[0-2])$/.test(p))||(sourceKind==='ledger'&&periods.includes(sourceId)))throw Error('Selecciona meses de destino distintos del origen.');
 const date=validCaptureDate(input.date);
 const result=await runTransaction(db,async tx=>{
  const by=auth.currentUser?.uid;if(!by)throw Error('Inicia sesión.');
  const sourceRef=sourceKind==='receipt'?doc(db,'groups',groupId,'paymentReceipts',sourceId):doc(db,'users',memberId,'ledger',sourceId);
  const [actor,group,member,source]=await Promise.all([tx.get(doc(db,'users',by)),tx.get(doc(db,'groups',groupId)),tx.get(doc(db,'users',memberId)),tx.get(sourceRef)]);
  const a=actor.data();if(!actor.exists()||!a.active||!['admin','master'].includes(a.role)||(a.role!=='master'&&a.groupId!==groupId)||!group.exists()||group.data().active===false||!member.exists()||member.data().groupId!==groupId)throw Error('Solo administradores de esta logia activa pueden corregir anticipos.');
  if(!source.exists())throw Error('El registro de origen ya no existe.');const raw=source.data();
  if(raw.groupId&&raw.groupId!==groupId)throw Error('El origen no pertenece a esta logia.');
  const previous=(raw.advanceCorrections||[]).find((c:any)=>c.id===operationId);
  if(previous){if(previous.request!==JSON.stringify({...input,periods}))throw Error('La corrección ya se confirmó con otros datos.');return {...previous.plan,alreadyApplied:true};}
  const sourcePayment=sourceKind==='ledger'?{...raw,period:sourceId} as Payment:undefined;
  const eligible=advanceSources(sourcePayment?[sourcePayment]:[],sourceKind==='receipt'?[{...raw,id:sourceId} as PaymentReceipt]:[]).find(s=>s.kind===sourceKind&&s.id===sourceId);
  if(!eligible||(sourceKind==='receipt'&&raw.userId!==memberId))throw Error('Este saldo ya se aplicó o requiere una revisión manual de sus comprobantes.');
  if(eligible.date&&eligible.date!==date)throw Error('Conserva la fecha original del depósito.');
  const refs=periods.map(p=>doc(db,'users',memberId,'ledger',p)),snaps=await Promise.all(refs.map(ref=>tx.get(ref)));
  if(snaps.some(s=>s.exists()&&s.data().groupId&&s.data().groupId!==groupId))throw Error('Una cuota pertenece a otra logia.');
  if(sourceKind==='receipt'){const origins=[...new Set((raw.periods||[]).filter((p:string)=>!periods.includes(p)))];const originLedgers=await Promise.all(origins.map((p:string)=>tx.get(doc(db,'users',memberId,'ledger',p))));if(advanceSources(originLedgers.filter(l=>l.exists()).map(l=>({...l.data(),period:l.id} as Payment)),[]).length)throw Error('El origen también tiene un excedente en cuotas. Revisa el registro para no aplicar el mismo dinero dos veces.');}
  let remaining=cents(eligible.amount);
  const changes=snaps.map((snap,i)=>{
   const old=snap.exists()?{...snap.data(),period:periods[i]} as Payment:undefined;
   const base=!old||!Number(old.amount)?assignMonthlyQuota(old,periods[i],monthlyPrice(group.data(),periods[i]),by)!:old;
   const payment=normalizePayment(base),applied=Math.min(remaining,Math.max(0,cents(payment.amount)-cents(payment.paidRegular||0)));remaining-=applied;
   if(applied<=0)throw Error('Un mes seleccionado ya está cubierto o sobra en el reparto.');
   return {period:periods[i],amount:applied/100,created:!old||!Number(old.amount),payment:normalizePayment({...payment,groupId,paidRegular:((cents(payment.paidRegular||0)+applied)/100),paymentDate:date,comments:[payment.comments,`Reaplicación de anticipo ${operationId}: +$${(applied/100).toFixed(2)} · depósito ${date} · origen ${sourceId}`].filter(Boolean).join(' | ')})};
  });
  const plan={available:eligible.amount,date,allocations:changes.map(c=>({period:c.period,amount:c.amount,created:c.created})),remaining:remaining/100};
  if(remaining>0)throw Error('Los meses seleccionados no alcanzan para aplicar todo el excedente. Agrega los meses faltantes.');
  const fingerprint=JSON.stringify(plan);
  if(!expected)return {...plan,fingerprint};
  if(expected!==fingerprint)throw Error('Los saldos o las cuotas cambiaron. Revisa otra vez antes de confirmar.');
  const correction={id:operationId,request:JSON.stringify({...input,periods}),plan:{...plan,fingerprint},by,at:new Date().toISOString()};
  if(sourceKind==='receipt'){
   const allocations=changes.map(c=>({period:c.period,amount:c.amount}));
   tx.update(sourceRef,{appliedAmount:Math.round((Number(raw.appliedAmount)+eligible.amount)*100)/100,unappliedAmount:0,periods:[...new Set([...(raw.periods||[]),...periods])].sort(),periodAllocations:[...(raw.periodAllocations||[]),...allocations],...(raw.quotaAllocations?{quotaAllocations:[...raw.quotaAllocations,...allocations.map(a=>({...a,kind:'regular',concept:'Cuota mensual'}))]}:{}),advanceCorrections:[...(raw.advanceCorrections||[]),correction]});
  }else{
   const corrected=normalizePayment({...sourcePayment!,paidRegular:Number(sourcePayment!.paidRegular??sourcePayment!.paid)-eligible.amount,paidExtra:sourcePayment!.paidExtra??0,comments:[sourcePayment!.comments,`Anticipo reaplicado ${operationId}: $${eligible.amount.toFixed(2)} a ${periods.join(', ')} · depósito ${date}`].filter(Boolean).join(' | ')});
   tx.set(sourceRef,JSON.parse(JSON.stringify({...corrected,advanceCorrections:[...(raw.advanceCorrections||[]),correction]})));
  }
  changes.forEach((change,i)=>tx.set(refs[i],JSON.parse(JSON.stringify(change.payment))));
  return {...plan,fingerprint};
 });
 if(expected)window.dispatchEvent(new CustomEvent('finance-updated',{detail:{groupId}}));return result;
}
