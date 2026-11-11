import type { Payment, PaymentReceipt, IndividualExtraFee, ExtraFee } from '../types';
import { normalizePayment } from './paymentAccounting';
const conceptKey = (value: string) => value.trim().toLocaleLowerCase('es-MX');
export interface ExistingFeeTemplate { key: string; period: string; description: string; amount: number; forgiven: boolean; registryId?: string; assignmentPeriod?: string; }
export function assignmentPeriod(template: ExistingFeeTemplate) {
  const period = template.assignmentPeriod ?? template.period;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Selecciona un mes y año válidos para asignar la cuota.');
  return period;
}
export function feeOptions(payments: Payment[]) {
  return payments.flatMap(source => {
    const payment = normalizePayment(source);
    const fees = payment.extraFees?.length ? payment.extraFees : payment.extraAmount ? [{id:'legacy',description:payment.extraDescription || 'Cuota Extra',amount:payment.extraAmount,paid:payment.paidExtra || 0,createdAt:''}] : [];
    return fees.map(fee => ({period:payment.period,feeId:fee.id,sourceFeeId:('sourceFeeId' in fee ? fee.sourceFeeId : undefined),description:fee.description,amount:fee.amount,paid:fee.paid,balance:fee.forgiven ? 0 : Math.max(0,fee.amount-fee.paid),forgiven:!!fee.forgiven,legacy:fee.id==='legacy'}));
  }).sort((a,b)=>b.period.localeCompare(a.period)||a.description.localeCompare(b.description));
}
export function existingFeeTemplates(ledgers: Record<string, Payment[]>, registry: ExtraFee[], year: number) {
  const templates = new Map<string, ExistingFeeTemplate>();
  const add = (period: string, description: string, amount: number, forgiven: boolean, registryId?: string) => {
    if (!period.startsWith(`${year}-`) || amount <= 0) return;
    const key = `${period}|${conceptKey(description)}|${amount}`;
    const previous = templates.get(key);
    templates.set(key,{key,period,description,amount,forgiven:previous ? previous.forgiven && forgiven : forgiven,registryId:registryId || previous?.registryId});
  };
  Object.values(ledgers).forEach(payments => feeOptions(payments).forEach(fee=>add(fee.period,fee.description,fee.amount,fee.forgiven)));
  registry.forEach(fee=> { const key=`${fee.period}|${conceptKey(fee.description)}|${fee.amount}`; if(templates.has(key)) templates.get(key)!.registryId=fee.id; else add(fee.period,fee.description,fee.amount,false,fee.id); });
  return [...templates.values()].sort((a,b)=>b.period.localeCompare(a.period)||a.description.localeCompare(b.description));
}
export function hasAssignedFee(payments: Payment[], template: ExistingFeeTemplate) {
  return feeOptions(payments).some(fee=>(template.registryId && fee.sourceFeeId===template.registryId) || fee.feeId===`assigned-${encodeURIComponent(template.key)}` || ((fee.period===template.period || fee.period===assignmentPeriod(template)) && conceptKey(fee.description)===conceptKey(template.description)));
}
export function assignExistingFee(source: Payment | undefined, template: ExistingFeeTemplate, creatorUid: string, now: string): Payment | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(template.period) || !Number.isFinite(template.amount) || template.amount <= 0 || !template.description.trim()) throw new Error('La cuota no es válida.');
  const period = assignmentPeriod(template);
  if (source && source.period !== period) throw new Error('El período no coincide.');
  if (source && hasAssignedFee([source], template)) return null;
  const payment = normalizePayment(source || {period,amount:0,paid:0,status:'Pendiente',comments:''});
  // Preserve a legacy extra before appending: never lose its payments or substitute its amount.
  const fees: IndividualExtraFee[] = payment.extraFees?.length ? [...payment.extraFees] : payment.extraAmount ? [{id:`legacy-${template.period}`,description:payment.extraDescription || 'Cuota Extra',amount:payment.extraAmount,paid:payment.paidExtra || 0,createdAt:now}] : [];
  fees.push({id:`assigned-${encodeURIComponent(template.key)}`,description:template.description,amount:template.amount,paid:0,createdAt:now,createdBy:creatorUid,...(template.registryId ? {sourceFeeId:template.registryId} : {}),...(template.forgiven ? {forgiven:true,forgivenAt:now,forgivenBy:creatorUid,forgivenNote:'Asignada sin adeudo'} : {})});
  return normalizePayment({...payment,extraFees:fees});
}
export function applyExtraReceipt(source: Payment, receipt: PaymentReceipt) {
  const payment=normalizePayment(source);
  const declared=Number(receipt.amount);
  if (!Number.isFinite(declared) || declared <= 0) throw new Error('Indica un monto mayor a cero.');
  let fees=payment.extraFees?.map(fee=>({...fee})) || [];
  let feeId='legacy'; let paid=payment.paidExtra || 0; let amount=payment.extraAmount || 0; let forgiven=false;
  let index=-1;
  if(fees.length) {
    const matches=fees.map((fee,index)=>({fee,index})).filter(({fee})=>receipt.extraFeeId && receipt.extraFeeId!=='legacy' ? fee.id===receipt.extraFeeId : conceptKey(fee.description)===conceptKey(receipt.conceptDescription || ''));
    if(matches.length!==1) throw new Error('No se encontró una cuota extra única para este comprobante.');
    index=matches[0].index; const fee=matches[0].fee;
    feeId=fee.id;paid=fee.paid;amount=fee.amount;forgiven=!!fee.forgiven;
  } else if(amount<=0 || (receipt.conceptDescription && conceptKey(receipt.conceptDescription)!==conceptKey(payment.extraDescription || 'Cuota Extra'))) throw new Error('La cuota extra no coincide con el comprobante.');
  const voluntary=forgiven || paid>=amount;
  const appliedAmount=Math.round((voluntary ? declared : Math.min(declared,Math.max(0,amount-paid)))*100)/100;
  if(index>=0) fees[index].paid=paid+appliedAmount;
  const updated=normalizePayment({...payment,...(fees.length ? {extraFees:fees} : {paidExtra:paid+appliedAmount})});
  return {payment:updated,appliedAmount,feeId,voluntary};
}
