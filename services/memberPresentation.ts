import type { Payment, PaymentReceipt, User } from '../types';
import { normalizePayment } from './paymentAccounting';
export interface MemberStats {
  totalPaid: number; totalDebt: number; totalBilled: number;
  totalPaidRegular?: number; totalPaidExtra?: number; totalBilledRegular?: number; totalBilledExtra?: number;
}
export const memberStatus = (member: User) => member.active ? 'Activo' : member.leaveDate ? 'Inactivo' : 'Pendiente';
export const accountStatus = (member: User) => member.uid.startsWith('temp_') ? 'Sin cuenta vinculada' : 'Cuenta vinculada';
export const memberMoney = (value: number) => value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
export const degreeLabel = (degree?: string) => ({ aprendiz: 'Aprendiz', companero: 'Compañero', maestro: 'Maestro' }[degree || ''] || 'Sin grado');
export const roleLabel = (role: string) => ({ member: 'Miembro', admin: 'Administrador', viewer: 'Observador', master: 'Maestro del sistema' }[role] || role);
export function paymentHistoryRows(payments: Payment[]) {
  return [...payments].sort((a, b) => b.period.localeCompare(a.period)).flatMap(source => {
    const payment = normalizePayment(source);
    const rows = [{ period: payment.period, concept: 'Cuota mensual', amount: payment.amount, paid: payment.paidRegular || 0, balance: Math.max(0, payment.amount - (payment.paidRegular || 0)), forgiven: false, registeredAt: payment.paymentDate || '', comments: payment.comments || '' }];
    if (payment.extraFees?.length) {
      rows.push(...payment.extraFees.map(fee => ({ period: payment.period, concept: fee.description, amount: fee.amount, paid: fee.paid, balance: fee.forgiven ? 0 : Math.max(0, fee.amount - fee.paid), forgiven: Boolean(fee.forgiven), registeredAt: payment.paymentDate || '', comments: payment.comments || '' })));
    } else if (payment.extraAmount) {
      rows.push({ period: payment.period, concept: payment.extraDescription || 'Cuota extraordinaria', amount: payment.extraAmount, paid: payment.paidExtra || 0, balance: Math.max(0, payment.extraAmount - (payment.paidExtra || 0)), forgiven: false, registeredAt: payment.paymentDate || '', comments: payment.comments || '' });
    }
    return rows;
  });
}

// Evidence is descriptive only: never add receipt amounts to the accounting ledger.
export function memberEvidence(payments: Payment[], receipts: PaymentReceipt[]) {
  const items = receipts.map(receipt => ({
    reference:receipt.bankReference||'',originalReference:receipt.bankOriginalReference||'',
    allocations:receipt.quotaAllocations||(receipt.receiptType==='cuota_mensual'?receipt.periodAllocations?.map(a=>({...a,kind:'regular' as const,concept:'Cuota mensual'})):undefined)||[],
    id: `receipt-${receipt.id}`, periods: receipt.extraFeePeriod ? [receipt.extraFeePeriod] : receipt.periods || [],
    concept: receipt.quotaAllocations?.some(a=>a.kind==='extra') && receipt.quotaAllocations.length>1 ? 'Depósito repartido entre cuotas' : receipt.receiptType === 'concepto_adicional' ? receipt.conceptDescription || 'Cuota extraordinaria' : 'Cuota mensual',
    date: receipt.transferDate || '', status: receipt.status as string,
    amount: receipt.amount, applied: receipt.appliedAmount,unapplied:receipt.unappliedAmount, comments: receipt.reviewComments || '',
    source: receipt.incomeDraftId?'Estado de cuenta / captura revisada':receipt.quickMovementId?'Captura de tesorería':'Comprobante / abono registrado',
    urls: [...new Set([...(receipt.receiptImageUrls || []), receipt.receiptImageUrl].filter(Boolean))]
  }));
  for (const payment of payments) {
    const urls = [...new Set([payment.adminReceiptUrl, payment.receiptImageBase64].filter(Boolean) as string[])];
    if (urls.length) items.push({reference:'',originalReference:'',allocations:[], id: `ledger-${payment.period}`, periods: [payment.period], concept: 'Adjunto del registro mensual', date: payment.paymentDate || '', status: 'registered', amount: undefined, applied: undefined,unapplied:undefined, comments: payment.comments || '', source: 'Adjunto registrado por administración', urls });
  }
  for(const source of payments){
   const payment=normalizePayment(source);
   const concepts=[{kind:'regular' as const,feeId:undefined as string|undefined,concept:'Cuota mensual',paid:payment.paidRegular||0},...(payment.extraFees?.length?payment.extraFees.map(f=>({kind:'extra' as const,feeId:f.id,concept:f.description,paid:f.paid})):[{kind:'extra' as const,feeId:'legacy',concept:payment.extraDescription||'Cuota extraordinaria',paid:payment.paidExtra||0}])];
   for(const c of concepts)if(c.paid>0&&!receipts.some(r=>r.status==='approved'&&receiptMatchesConcept(r,payment.period,c.kind,c.feeId,c.concept))){
    items.push({id:`balance-${payment.period}-${c.kind}-${c.feeId||''}`,periods:[payment.period],concept:c.concept,date:payment.paymentDate||'',status:'registered',amount:c.paid,applied:c.paid,unapplied:undefined,reference:'',originalReference:'',allocations:[],comments:`Acumulado registrado, no un abono nuevo. No se conserva un desglose individual de los depósitos.${payment.paymentDate?' Última fecha registrada: '+payment.paymentDate.slice(0,10)+'.':''}${payment.comments?' Notas: '+payment.comments:''}`,source:'Saldo pagado registrado sin comprobante individual',urls:[]});
   }
  }
  return items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}



export function receiptMatchesConcept(receipt:PaymentReceipt,period:string,kind:'regular'|'extra',feeId?:string,concept?:string){
 if(receipt.quotaAllocations)return receipt.quotaAllocations.some(a=>a.period===period&&a.kind===kind&&(kind==='regular'||a.feeId===feeId||(!a.feeId&&a.concept===concept)));
 const months=receipt.extraFeePeriod?[receipt.extraFeePeriod]:receipt.periods||[];
 return months.includes(period)&&(kind==='regular'?receipt.receiptType==='cuota_mensual':receipt.receiptType==='concepto_adicional'&&(receipt.extraFeeId===feeId||(!receipt.extraFeeId&&receipt.conceptDescription===concept)));
}
