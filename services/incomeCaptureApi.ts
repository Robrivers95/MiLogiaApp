import {incomeAllocation} from './incomeAllocation';
import {auth,db} from './firebase';
import {collection,doc,getDocs,getDocFromServer,runTransaction} from 'firebase/firestore';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {quickFinanceService} from './quickFinanceApi';
import {applyCapture,captureAmount,validCaptureDate} from './quickFinance';
import type {Payment,PaymentReceipt,TreasuryEntry,User} from '../types';
export interface IncomeDraft {id:string;groupId:string;status:'pending'|'approved'|'rejected';payerName:string;memberId:string;amount:number;date:string;period:string;kind:'regular'|'extra'|'other';concept:string;reference:string;paymentMethod:'cash'|'card'|'transfer';sourceQuote:string;sourceText:string;receiptImageUrls:string[];warnings:string[];possibleDuplicate:boolean;createdAt:number;}
export interface IncomeReview {periodAmounts?:number[];periods?:string[];memberId:string;amount:number;date:string;period:string;kind:IncomeDraft['kind'];feeId:string;concept:string;paymentMethod:IncomeDraft['paymentMethod'];accountId:string;}
const clean=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
async function authority(tx:any,groupId:string){
 if(!auth.currentUser||!/^[-\w]{1,128}$/.test(groupId))throw Error('Selecciona una logia e inicia sesión.');
 const [a,g]=await Promise.all([tx.get(doc(db,'users',auth.currentUser.uid)),tx.get(doc(db,'groups',groupId))]);const actor=a.data() as User;
 if(!a.exists()||!['admin','master'].includes(actor.role)||!actor.active||(actor.role!=='master'&&actor.groupId!==groupId)||!g.exists()||g.data().active===false)throw Error('Solo Admin y Admin Master de una logia activa pueden aprobar ingresos.');return auth.currentUser.uid;
}
const draftRef=(groupId:string,id:string)=>{if(!/^[-\w]{1,128}$/.test(id))throw Error('Solicitud inválida.');return doc(db,'groups',groupId,'incomeDrafts',id);};
export const incomeCaptureApi={
 state:async(groupId:string,id:string)=>(await getDocFromServer(draftRef(groupId,id))).data()?.status,
 options:quickFinanceService.options,payments:quickFinanceService.payments,
 analyze:async(groupId:string,requestId:string,text:string,date:string,images:{mimeType:string;data:string}[],retainImages=false,documents:{mimeType:string;data:string}[]=[])=> (await httpsCallable(getFunctions(undefined,'us-central1'),'captureWithAI',{timeout:120000})({action:'analyzeIncome',groupId,requestId,text,date,images,documents,retainImages})).data,
 list:async(groupId:string):Promise<IncomeDraft[]>=>{await runTransaction(db,tx=>authority(tx,groupId));const rows=await getDocs(collection(db,'groups',groupId,'incomeDrafts'));return rows.docs.map(d=>({...d.data(),id:d.id} as IncomeDraft)).sort((a,b)=>b.createdAt-a.createdAt);},
 reject:async(groupId:string,id:string)=>runTransaction(db,async tx=>{const by=await authority(tx,groupId),ref=draftRef(groupId,id),snap=await tx.get(ref);if(!snap.exists()||snap.data().status==='approved')throw Error('Esta solicitud ya se aprobó o no existe.');tx.update(ref,{status:'rejected',reviewedBy:by,reviewedAt:Date.now()});}),
 approve:async(groupId:string,id:string,review:IncomeReview,confirmed:boolean)=>{
  if(confirmed!==true)throw Error('Revisa y confirma antes de registrar.');
  const amount=captureAmount(review.amount),date=validCaptureDate(review.date);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(review.period)||!['regular','extra','other'].includes(review.kind)||!['cash','card','transfer'].includes(review.paymentMethod)||!review.memberId||review.memberId.includes('/')||review.concept.trim().length>500||!review.concept.trim())throw Error('Revisa miembro, mes, concepto y método de pago.');
  if(review.kind==='extra'&&!review.feeId)throw Error('Selecciona la cuota extraordinaria exacta.');
  if(review.periods!==undefined&&(!Array.isArray(review.periods)||review.periods.length>36||review.periods.some(p=>typeof p!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(p))||new Set(review.periods).size!==review.periods.length))throw Error('Revisa los meses seleccionados.');
  const periods=review.kind==='regular'&&review.periods?.length?[...review.periods].sort():[review.period];
  if(periods[0]!==review.period)throw Error('El mes inicial debe coincidir con el reparto.');
  if(periods.length>1&&(!Array.isArray(review.periodAmounts)||review.periodAmounts.length!==periods.length||review.periodAmounts.some(a=>!Number.isFinite(a)||a<=0)))throw Error('Revisa el importe de cada mes antes de confirmar.');
  const payload=clean({...review,...(review.periods!==undefined?{periods:review.kind==='regular'?periods:[]}:{}),amount,date,concept:review.concept.trim()});
  await runTransaction(db,async tx=>{
   const by=await authority(tx,groupId),ref=draftRef(groupId,id),snap=await tx.get(ref);
   if(!snap.exists())throw Error('La solicitud ya no existe.');const source=snap.data() as IncomeDraft;
   if(source.status==='approved'){if(JSON.stringify((source as any).approvedReview?.periods??[])!==JSON.stringify(payload.periods??[])||JSON.stringify((source as any).approvedReview?.periodAmounts??[])!==JSON.stringify(payload.periodAmounts??[])||!Object.keys(payload).every(key=>(Array.isArray((payload as any)[key])?JSON.stringify((source as any).approvedReview?.[key])===JSON.stringify((payload as any)[key]):(source as any).approvedReview?.[key]===(payload as any)[key])))throw Error('Esta solicitud ya se aprobó con otros datos. Actualiza la lista.');return;}
   if(source.status!=='pending')throw Error('La solicitud no está pendiente.');
   const member=await tx.get(doc(db,'users',review.memberId));if(!member.exists()||member.data().groupId!==groupId)throw Error('El hermano no pertenece a esta logia.');
   let account:any;let accountRef:any;
   if(review.accountId){if(review.accountId.includes('/'))throw Error('Cuenta inválida.');accountRef=doc(db,'bankBalances',review.accountId);account=await tx.get(accountRef);if(!account.exists()||account.data().groupId!==groupId||!Number.isFinite(Number(account.data().amount)))throw Error('Cuenta bancaria inválida.');}
   const receiptId=`ai-${id}`,urls=source.receiptImageUrls||[],now=new Date().toISOString();
   const writtenDetail=`Captura IA revisada: ${payload.concept}. Referencia: ${source.reference||''}. Detalle del movimiento: ${(source.sourceQuote||'').slice(0,1000)}`;
   if(review.kind==='other'){
    const entryRef=doc(db,'groups',groupId,'treasury',receiptId),existing=await tx.get(entryRef);if(existing.exists())throw Error('Ya existe el ingreso vinculado.');
    tx.set(entryRef,clean({id:receiptId,groupId,date,quotaPeriod:review.period,type:'income',amount,description:payload.concept,category:'otro',allocations:[{source:'tesoro_general',amount}],createdBy:by,createdAt:Date.now(),memberId:review.memberId,memberName:member.data().name,paymentMethod:review.paymentMethod,receiptImageUrls:urls,notes:writtenDetail,incomeDraftId:id,accountId:review.accountId}));
   }else{
    const ledgerRefs=periods.map(period=>doc(db,'users',review.memberId,'ledger',period)),proofRef=doc(db,'groups',groupId,'paymentReceipts',receiptId);
    const [ledgers,proof]=await Promise.all([Promise.all(ledgerRefs.map(ref=>tx.get(ref))),tx.get(proofRef)]);
    if(ledgers.some(ledger=>!ledger.exists()||(ledger.data().groupId&&ledger.data().groupId!==groupId)))throw Error('No existe esa cuota para este hermano y mes. Corrige la selección.');if(proof.exists())throw Error('Ya existe el comprobante. Actualiza la lista.');
    const payments=ledgers.map((ledger,i)=>({...ledger.data(),period:periods[i]} as Payment)),feeId=review.kind==='extra'?review.feeId:undefined;
    const plan=review.kind==='regular'?incomeAllocation(payments,amount,periods):{allocations:[{period:review.period,amount}],remaining:0};
    if(review.kind==='regular'&&review.periodAmounts&&JSON.stringify(review.periodAmounts)!==JSON.stringify(plan.allocations.map(a=>a.amount)))throw Error('Los saldos cambiaron. Actualiza los meses y revisa de nuevo el reparto antes de confirmar.');
    if(plan.remaining>0)throw Error('El ingreso excede el saldo mensual de los meses seleccionados. Agrega más meses o corrige el monto.');
    if(plan.allocations.length!==periods.length)throw Error('Selecciona solo meses con saldo que se cubran con este pago.');
    const results=plan.allocations.map(a=>({period:a.period,...applyCapture(payments.find(p=>p.period===a.period)!,{id:receiptId,type:'income',quickStatus:'pending',amount:a.amount,date} as TreasuryEntry,feeId)}));
    const receipt:PaymentReceipt={id:receiptId,groupId,userId:review.memberId,userName:member.data().name,periods:plan.allocations.map(a=>a.period),periodAllocations:plan.allocations,transferDate:date,amount,receiptImageUrl:urls[0]||'',receiptImageUrls:urls,receiptType:feeId?'concepto_adicional':'cuota_mensual',...(feeId?{extraFeeId:feeId,extraFeePeriod:review.period,conceptDescription:payload.concept}:{}),appliedAmount:amount,unappliedAmount:0,ledgerIncluded:true,voluntaryContribution:results.some(r=>r.voluntary),status:'approved',submittedAt:now,reviewedAt:now,reviewedBy:by,reviewComments:writtenDetail};
    results.forEach(result=>tx.update(ledgerRefs[periods.indexOf(result.period)],clean(result.payment)));tx.set(proofRef,clean(receipt));
   }
   if(account)tx.update(accountRef,{amount:Math.round((Number(account.data().amount)+amount)*100)/100,updatedBy:by});
   tx.update(ref,{status:'approved',reviewedBy:by,reviewedAt:Date.now(),approvedReview:payload,receiptId});
  });
  window.dispatchEvent(new CustomEvent('finance-updated',{detail:{groupId}}));
 }
};
export async function incomeImage(file:File):Promise<{mimeType:string;data:string}>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024)throw Error('Selecciona JPG, PNG o WebP de máximo 15 MB.');
 const url=URL.createObjectURL(file);try{const image=new Image();image.src=url;await image.decode();const scale=Math.min(1,1800/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);const ctx=canvas.getContext('2d');if(!ctx)throw Error('No se pudo preparar la imagen.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',.85).split(',')[1];if(data.length>2600000)throw Error('La imagen es muy pesada. Usa un recorte más pequeño.');return {mimeType:'image/jpeg',data};}finally{URL.revokeObjectURL(url);}
}
