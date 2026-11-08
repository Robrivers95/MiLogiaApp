import {auth,db} from './firebase';
import {doc,runTransaction} from 'firebase/firestore';
import {captureAmount,validCaptureDate} from './quickFinance';
import type {StatementExpense} from './statementExpenses';
import type {TreasuryEntry} from '../types';
export const statementExpenseApi={approve:async(groupId:string,row:StatementExpense,details:{description:string;category:TreasuryEntry['category'];payee:string;accountId:string},confirmed:boolean)=>{
 if(!confirmed)throw Error('Revisa y confirma el gasto antes de registrarlo.');
 if(!groupId||groupId.includes('/')||!/^\d{8,40}$/.test(row.reference))throw Error('Referencia bancaria inválida.');
 const amount=captureAmount(row.amount),date=validCaptureDate(row.date);
 if(!details.description.trim()||details.description.length>500||details.payee.length>200||!['gasto_operativo','gasto_social','compra_material','otro'].includes(details.category)||details.accountId.includes('/'))throw Error('Revisa concepto, categoría y cuenta del gasto.');
 const id=`bank-exp-mp-${row.reference}`;
 const result=await runTransaction(db,async tx=>{
  const uid=auth.currentUser?.uid;if(!uid)throw Error('Inicia sesión.');
  const target=doc(db,'groups',groupId,'treasury',id);
  const [actor,group,previous]=await Promise.all([tx.get(doc(db,'users',uid)),tx.get(doc(db,'groups',groupId)),tx.get(target)]);
  const a=actor.data();if(!actor.exists()||!a.active||!['admin','master'].includes(a.role)||(a.role!=='master'&&a.groupId!==groupId)||!group.exists()||group.data().active===false)throw Error('Solo administradores de una logia activa pueden registrar gastos.');
  if(previous.exists()){
   const p=previous.data();if(p.type!=='expense'||p.amount!==amount||p.date!==date||p.bankReference!==row.reference)throw Error('La referencia ya existe con otros datos. Revísala en Tesorería.');
   return {existing:true};
  }
  const accountRef=details.accountId?doc(db,'bankBalances',details.accountId):undefined;
  const account=accountRef?await tx.get(accountRef):undefined;
  if(account&&(!account.exists()||account.data().groupId!==groupId||!Number.isFinite(Number(account.data().amount))))throw Error('La cuenta no pertenece a esta logia o su saldo no es válido.');
  tx.set(target,{id,groupId,date,type:'expense',amount,description:details.description.trim(),category:details.category,payee:details.payee.trim(),allocations:[{source:'tesoro_general',amount}],createdBy:uid,createdAt:Date.now(),quickStatus:'completed',paymentMethod:'transfer',accountId:details.accountId,accountName:account?.data().name||'',bankReference:row.reference,bankOriginalReference:row.reference,bankDepositDate:date,bankSource:'mercadopago',notes:row.sourceQuote,sourceDescription:row.description});
  if(account&&accountRef)tx.update(accountRef,{amount:Math.round((Number(account.data().amount)-amount)*100)/100,updatedBy:uid});
  return {existing:false};
 });window.dispatchEvent(new CustomEvent('finance-updated',{detail:{groupId}}));return result;
}};
