import {auth,db} from './firebase';
import {doc,runTransaction,collection,query,where,getDocs} from 'firebase/firestore';
import {normalizePayment} from './paymentAccounting';
import {receiptMatchesConcept} from './memberPresentation';
import {validCaptureDate} from './quickFinance';
import type {Payment,PaymentReceipt} from '../types';
export interface QuotaCorrectionValues {amount:number;paid:number;date:string;reason:string;forgiven:boolean;}
export async function correctQuotaRecord(groupId:string,memberId:string,previous:Payment,kind:'regular'|'extra',feeId:string|undefined,values:QuotaCorrectionValues){
 const {amount,paid,date,reason,forgiven}=values;
 if(!['regular','extra'].includes(kind)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(previous.period)||[groupId,memberId].some(s=>!s||s.includes('/'))||[amount,paid].some(n=>!Number.isFinite(n)||n<0||n>1e9||Math.abs(n*100-Math.round(n*100))>.00001)||!reason.trim()||reason.length>500||kind==='regular'&&forgiven)throw Error('Revisa los importes y el motivo de la corrección.');
 const depositDate=date?validCaptureDate(date):null;
 const getTarget=(p:Payment)=>kind==='regular'?{amount:p.amount,paid:p.paidRegular||0,forgiven:false,concept:'Cuota mensual'}:p.extraFees?.length?(()=>{const f=p.extraFees.find(f=>f.id===feeId);if(!f)throw Error('La cuota extraordinaria ya no existe.');return {...f,concept:f.description,forgiven:!!f.forgiven};})():{amount:p.extraAmount||0,paid:p.paidExtra||0,forgiven:false,concept:p.extraDescription||'Cuota Extra'};
 const old=getTarget(normalizePayment(previous));
 // A deposit date is needed for a new corrected positive balance, not to invent
 // dates for old aggregate balances which are unchanged by a charge correction.
 if(paid>0&&paid!==old.paid&&!depositDate)throw Error('Indica la fecha real del pago corregido.');
 if(paid>amount&&paid>old.paid)throw Error('Para un pago nuevo usa Registrar abono y reparte el excedente.');
 const proofs=await getDocs(query(collection(db,'groups',groupId,'paymentReceipts'),where('userId','==',memberId)));
 const proofRefs=proofs.docs.map(d=>doc(db,'groups',groupId,'paymentReceipts',d.id));
 await runTransaction(db,async tx=>{
  const uid=auth.currentUser?.uid;if(!uid)throw Error('Inicia sesión.');
  const ref=doc(db,'users',memberId,'ledger',previous.period);
  const [actor,group,member,snap,...proofSnapshots]=await Promise.all([tx.get(doc(db,'users',uid)),tx.get(doc(db,'groups',groupId)),tx.get(doc(db,'users',memberId)),tx.get(ref),...proofRefs.map(r=>tx.get(r))]);
  const a=actor.data();if(!actor.exists()||!a.active||!['admin','master'].includes(a.role)||(a.role!=='master'&&a.groupId!==groupId)||!group.exists()||group.data().active===false||!member.exists()||member.data().groupId!==groupId||!snap.exists())throw Error('No tienes permiso para corregir esta cuota.');
  const raw={...snap.data(),period:previous.period} as Payment,live=normalizePayment(raw),target=getTarget(live);
  if(raw.groupId&&raw.groupId!==groupId)throw Error('La cuota pertenece a otra logia.');
  if(target.amount!==old.amount||target.paid!==old.paid||target.forgiven!==old.forgiven||(raw.paymentDate||'')!==(previous.paymentDate||'')||JSON.stringify(raw.quotaCorrections||[])!==JSON.stringify(previous.quotaCorrections||[]))throw Error('El registro cambió. Actualiza la cuenta y revisa de nuevo.');
  const at=new Date().toISOString();
  const historicalReceiptIds=paid===target.paid?[]:proofSnapshots.filter(s=>s.exists()).filter(s=>{const r=s.data() as PaymentReceipt;return r.status==='approved'&&r.userId===memberId&&receiptMatchesConcept(r,previous.period,kind,feeId,target.concept);}).map(s=>s.id);
  let changed:Payment;
  if(kind==='regular')changed={...live,amount,paidRegular:paid};
  else if(live.extraFees?.length)changed={...live,extraFees:live.extraFees.map(f=>f.id===feeId?{...f,amount,paid,forgiven,...(forgiven?{forgivenAt:at,forgivenBy:uid,forgivenNote:reason.trim()}:{} )}:f)};
  else {if(forgiven)changed={...live,extraFees:[{id:'legacy',description:target.concept,amount,paid,forgiven:true,createdAt:at,forgivenAt:at,forgivenBy:uid,forgivenNote:reason.trim()}]};else changed={...live,extraAmount:amount,paidExtra:paid};}
  if(depositDate)changed.paymentDate=depositDate;
  const next=normalizePayment(changed);
  const audit={at,by:uid,kind,feeId:kind==='extra'?(feeId||'legacy'):null,concept:target.concept,beforeAmount:target.amount,afterAmount:amount,beforePaid:target.paid,afterPaid:paid,beforeForgiven:target.forgiven,afterForgiven:forgiven,reason:reason.trim(),historicalReceiptIds};
  tx.update(ref,JSON.parse(JSON.stringify({...next,quotaCorrections:[...(raw.quotaCorrections||[]),audit],correctionHistory:[...(raw.correctionHistory||[]),{at,by:uid,reason:`${target.concept}: ${reason.trim()}`,before:live.paid,after:next.paid}]})));
 });
 window.dispatchEvent(new CustomEvent('finance-updated',{detail:{groupId}}));
}
