import type {Payment} from '../types';
import {normalizePayment} from './paymentAccounting';
export const incomeBalance=(payment:Payment)=>{const p=normalizePayment(payment);return Math.max(0,Math.round((p.amount-p.paidRegular!)*100)/100);};
export function incomeAllocation(payments:Payment[],amount:number,periods?:string[],start=''){
 let remaining=Math.round(amount*100);const allocations:{period:string;amount:number}[]=[];
 const ordered=[...payments].filter(p=>periods?periods.includes(p.period):(!start||p.period>=start)).sort((a,b)=>a.period.localeCompare(b.period));
 for(const payment of ordered){if(remaining<=0)break;const cents=Math.min(remaining,Math.round(incomeBalance(payment)*100));if(cents>0){allocations.push({period:payment.period,amount:cents/100});remaining-=cents;}}
 return {allocations,remaining:remaining/100};
}
