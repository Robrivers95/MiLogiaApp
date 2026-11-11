import {auth,db} from './firebase';
import {doc,runTransaction} from 'firebase/firestore';
import {monthlyPrice,assignMonthlyQuota} from './monthlyQuotas';
import {normalizePayment} from './paymentAccounting';
import {validCaptureDate,captureAmount} from './quickFinance';
import type {Payment,PaymentReceipt} from '../types';
export async function approveMonthlyReceipt(groupId:string,receiptId:string,reviewerUid:string,recoverApproved=false){
 return runTransaction(db,async tx=>{
  if(!auth.currentUser||auth.currentUser.uid!==reviewerUid)throw Error('Inicia sesión con la cuenta revisora.');
  const receiptRef=doc(db,'groups',groupId,'paymentReceipts',receiptId);
  const [actor,group,proof]=await Promise.all([tx.get(doc(db,'users',reviewerUid)),tx.get(doc(db,'groups',groupId)),tx.get(receiptRef)]);
  const a=actor.data();if(!actor.exists()||!a.active||!['admin','master'].includes(a.role)||(a.role!=='master'&&a.groupId!==groupId)||!group.exists()||group.data().active===false)throw Error('Solo administradores de una logia activa pueden aprobar pagos.');
  if(!proof.exists())throw Error('El comprobante ya no existe.');const r=proof.data() as PaymentReceipt;
  const recovery=r.status==='approved'&&recoverApproved;
  if(r.status==='approved'&&!recovery)return null;
  if(recovery&&(r.ledgerIncluded||r.quotaAllocations||Number(r.appliedAmount)!==0||!(Number(r.amount)>0)||Number(r.unappliedAmount)!==Number(r.amount)))throw Error('Este comprobante requiere una conciliación manual; ya tiene una aplicación o no conserva su saldo sin aplicar.');
  if((r.status!=='pending'&&!recovery)||r.receiptType!=='cuota_mensual')throw Error('El comprobante cambió. Actualiza la consulta.');
  const periods=[...new Set(r.periods||[])].sort();if(!periods.length||periods.length>36||periods.some(p=>!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)))throw Error('Revisa los meses del comprobante.');
  const date=validCaptureDate((r.transferDate||'').slice(0,10));
  const member=await tx.get(doc(db,'users',r.userId));if(!member.exists()||member.data().groupId!==groupId)throw Error('El miembro no pertenece a esta logia.');
  const refs=periods.map(p=>doc(db,'users',r.userId,'ledger',p)),ledgers=await Promise.all(refs.map(ref=>tx.get(ref)));
  if(ledgers.some(s=>s.exists()&&s.data().groupId&&s.data().groupId!==groupId))throw Error('Una cuota pertenece a otra logia.');
  if(recovery&&ledgers.some(l=>l.exists()&&(normalizePayment(l.data() as Payment).paidRegular||0)>0))throw Error('Ya hay pagos en uno de estos meses. Revisa el historial antes de aplicar este comprobante.');
  const declared=r.amount!==undefined&&r.amount!==null;let remaining=declared?captureAmount(r.amount):0;
  const changes:{index:number;payment:Payment}[]=[],allocations:{period:string;amount:number}[]=[];
  for(let i=0;i<periods.length;i++){
   if(declared&&remaining<=0)break;
   const old=ledgers[i].exists()?{...ledgers[i].data(),period:periods[i]} as Payment:undefined;
   const source=!old||!Number(old.amount)?assignMonthlyQuota(old,periods[i],monthlyPrice(group.data(),periods[i]),reviewerUid)!:old;
   const payment=normalizePayment(source),debt=Math.max(0,payment.amount-(payment.paidRegular||0));
   const amount=declared?Math.min(remaining,debt):debt;if(amount<=0)continue;
   const next=normalizePayment({...payment,groupId,paidRegular:Math.round(((payment.paidRegular||0)+amount)*100)/100,paymentDate:date,
    comments:[payment.comments,`Abono ${receiptId}: +$${amount.toFixed(2)} (${date})${r.bankReference?' · Folio '+r.bankReference:''}`].filter(Boolean).join(' | ')});
   changes.push({index:i,payment:next});allocations.push({period:periods[i],amount});remaining=Math.round((remaining-amount)*100)/100;
  }
  const appliedAmount=allocations.reduce((s,a)=>Math.round((s+a.amount)*100)/100,0);
  if(!appliedAmount)throw Error('No hay saldo mensual al que aplicar este comprobante. Revisa la selección.');
  for(const change of changes)tx.set(refs[change.index],JSON.parse(JSON.stringify(change.payment)));
  tx.update(receiptRef,{status:'approved',reviewedAt:new Date().toISOString(),reviewedBy:reviewerUid,appliedAmount,unappliedAmount:declared?Math.max(0,remaining):0,
   ...(recovery?{recoveredAt:new Date().toISOString(),recoveredBy:reviewerUid,previousAppliedAmount:0}:{}),
   periodAllocations:allocations,quotaAllocations:allocations.map(a=>({...a,kind:'regular',concept:'Cuota mensual'}))});
  return {appliedAmount,receipt:r};
 });
}
