import type {Payment} from '../types';
import {normalizePayment} from './paymentAccounting';
import {feeOptions} from './extraFeeLifecycle';
import {applyCapture,captureAmount} from './quickFinance';
export interface IncomeSelection {period:string;kind:'regular'|'extra';feeId?:string;amount:number;expectedBalance?:number;}
export interface IncomeTarget {key:string;period:string;kind:'regular'|'extra';feeId?:string;concept:string;amount:number;paid:number;balance:number;forgiven:boolean;}
const cents=(value:number)=>Math.round(value*100);
export const incomeTargetKey=(row:Pick<IncomeSelection,'period'|'kind'|'feeId'>)=>JSON.stringify([row.period,row.kind,row.kind==='extra'?row.feeId:'']);
export function incomeTargets(payments:Payment[]):IncomeTarget[]{
 return payments.flatMap(source=>{
  const p=normalizePayment(source);
  const regular:IncomeTarget={key:incomeTargetKey({period:p.period,kind:'regular'}),period:p.period,kind:'regular',concept:'Cuota normal',amount:p.amount,paid:p.paidRegular!,balance:Math.max(0,cents(p.amount)-cents(p.paidRegular!))/100,forgiven:false};
  return [...(p.amount>0||p.paidRegular!>0?[regular]:[]),...feeOptions([p]).map(f=>({key:incomeTargetKey({period:f.period,kind:'extra',feeId:f.feeId}),period:f.period,kind:'extra' as const,feeId:f.feeId,concept:f.description,amount:f.amount,paid:f.paid,balance:Math.round(f.balance*100)/100,forgiven:f.forgiven}))];
 }).sort((a,b)=>a.period.localeCompare(b.period)||Number(a.kind==='extra')-Number(b.kind==='extra')||a.concept.localeCompare(b.concept,'es'));
}
export function memberIncomeSummary(payments:Payment[],through:string){
 const targets=incomeTargets(payments),regular=targets.filter(t=>t.kind==='regular');
 const current=targets.filter(t=>t.period<=through);
 return {paidMonths:regular.filter(t=>t.balance===0).map(t=>t.period),partialMonths:regular.filter(t=>t.period<=through&&t.paid>0&&t.balance>0).map(t=>t.period),pendingMonths:regular.filter(t=>t.period<=through&&t.balance>0).map(t=>t.period),regularBalance:current.filter(t=>t.kind==='regular').reduce((s,t)=>s+cents(t.balance),0)/100,extraBalance:current.filter(t=>t.kind==='extra').reduce((s,t)=>s+cents(t.balance),0)/100,futureBalance:targets.filter(t=>t.period>through).reduce((s,t)=>s+cents(t.balance),0)/100};
}
export function normalizeIncomeSelections(value:unknown):IncomeSelection[]{
 if(!Array.isArray(value)||value.length>72)throw Error('Selecciona hasta 72 cuotas para el depósito.');
 const keys=new Set<string>();
 return value.map((row:any)=>{
  if(!row||!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.period)||!['regular','extra'].includes(row.kind)||row.kind==='extra'&&(typeof row.feeId!=='string'||!row.feeId||row.feeId.length>250))throw Error('Revisa las cuotas y los meses seleccionados.');
  const item:IncomeSelection={period:row.period,kind:row.kind,...(row.kind==='extra'?{feeId:row.feeId}:{}),amount:captureAmount(row.amount),...(row.expectedBalance!==undefined?{expectedBalance:captureAmount(row.expectedBalance)}:{})};
  const key=incomeTargetKey(item);if(keys.has(key))throw Error('Una cuota está seleccionada más de una vez.');keys.add(key);return item;
 }).sort((a,b)=>incomeTargetKey(a).localeCompare(incomeTargetKey(b)));
}
export function applyIncomeSelections(payments:Payment[],received:number,raw:unknown,allowUnapplied:boolean,date:string,receiptId:string){
 const amount=captureAmount(received),selections=normalizeIncomeSelections(raw),targets=incomeTargets(payments);
 const appliedCents=selections.reduce((s,a)=>s+cents(a.amount),0),unappliedCents=cents(amount)-appliedCents;
 if(unappliedCents<0)throw Error('La aplicación supera el depósito recibido.');
 if(unappliedCents>0&&!allowUnapplied)throw Error('Falta repartir parte del depósito. Selecciona cuotas o confirma dejar ese saldo sin aplicar.');
 const changed=new Map<string,Payment>();
 const allocations=selections.map(a=>{
  const target=targets.find(t=>t.key===incomeTargetKey(a));
  if(!target)throw Error('Una cuota seleccionada ya no existe. Actualiza los saldos.');
  if(target.forgiven||target.balance<=0)throw Error('Una cuota seleccionada ya está cubierta o perdonada. Actualiza los saldos.');
  if(a.expectedBalance!==undefined&&cents(target.balance)!==cents(a.expectedBalance))throw Error('Los saldos cambiaron. Actualiza y revisa la aplicación antes de confirmar.');
  if(cents(a.amount)>cents(target.balance))throw Error('El abono supera el saldo de una cuota. Actualiza los saldos.');
  const source=changed.get(a.period)||payments.find(p=>p.period===a.period)!;
  const result=applyCapture(source,{id:receiptId,type:'income',quickStatus:'pending',amount:a.amount,date} as any,a.kind==='extra'?a.feeId:undefined);
  changed.set(a.period,result.payment);
  return {...a,concept:target.concept};
 });
 return {allocations,payments:[...changed.values()],applied:appliedCents/100,unapplied:unappliedCents/100};
}
