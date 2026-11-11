import type {Payment,PriceHistoryEntry} from '../types';
import {normalizePayment} from './paymentAccounting';
export function monthlyPrice(group:{priceHistory?:PriceHistoryEntry[];membershipFee?:number},period:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error('Selecciona un mes y año válidos.');
 const history=[...(group.priceHistory||[])].sort((a,b)=>b.startDate.localeCompare(a.startDate));
 const amount=Number(history.find(p=>p.startDate<=period)?.amount ?? (history.length?0:group.membershipFee));
 if(!Number.isFinite(amount)||amount<=0||Math.abs(amount*100-Math.round(amount*100))>.00001)throw Error('Configura el precio mensual vigente para ese mes en Cuotas.');
 return Math.round(amount*100)/100;
}
export function assignMonthlyQuota(existing:Payment|undefined,period:string,amount:number,by:string):Payment|null{
 if(existing&&Number(existing.amount)>0)return null;
 const base=existing?normalizePayment(existing):undefined;
 return normalizePayment({...base,period,amount,paid:base?.paid||0,comments:existing?.comments||'',groupId:existing?.groupId,
  ...(existing?{}:{paidRegular:0,paidExtra:0,paymentDate:null}),quotaCreatedAt:new Date().toISOString(),quotaCreatedBy:by});
}
