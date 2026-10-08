import type { Payment, TreasuryEntry } from '../types';
import { normalizePayment } from './paymentAccounting';
import { applyExtraReceipt } from './extraFeeLifecycle';

export const countsInTreasury = (entry: TreasuryEntry) => entry.quickStatus !== 'applied';
export const localFinanceDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
};
export function captureAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) throw new Error('Indica un monto positivo con máximo dos decimales.');
  return Math.round(amount * 100) / 100;
}
export function validCaptureDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0,10) !== date) throw new Error('Indica una fecha válida.');
  return date;
}
export function applyCapture(source: Payment, entry: TreasuryEntry, feeId?: string) {
  if (!entry.quickStatus || entry.quickStatus === 'applied' || entry.type !== 'income') throw new Error('Este movimiento no es un ingreso disponible.');
  const amount = captureAmount(entry.amount);
  let payment = normalizePayment(source);
  let voluntary = false;
  if (feeId) {
    const result = applyExtraReceipt(payment, { amount, extraFeeId: feeId, conceptDescription: feeId === 'legacy' ? payment.extraDescription || 'Cuota Extra' : '', receiptType: 'concepto_adicional' } as any);
    if (Math.abs(result.appliedAmount - amount) > 0.001) throw new Error('El ingreso excede el saldo de esta cuota. Selecciona una cuota con saldo suficiente.');
    payment = result.payment; voluntary = result.voluntary;
  } else {
    const debt = Math.max(0, payment.amount - payment.paidRegular!);
    if (amount > debt) throw new Error('El ingreso excede el saldo mensual. Selecciona una cuota con saldo suficiente.');
    payment = normalizePayment({...payment, paidRegular: payment.paidRegular! + amount});
  }
  return { payment: {...payment, paymentDate: entry.date, comments: `${source.comments || ''}${source.comments ? ' | ' : ''}Captura ${entry.id}: +$${amount.toFixed(2)} (${entry.date})`}, voluntary };
}
