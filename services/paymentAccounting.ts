import type { Payment } from '../types';

const money = (value: unknown): number => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) throw new Error('Los montos deben ser números positivos o cero.');
  return Math.round(n * 100) / 100;
};

/** Correct only this receipt's contribution; other manual/approved payments survive. */
export function correctAppliedPayment(total: number, cap: number, previousApplied: number, correctedApplied: number): number {
  [total, cap, previousApplied, correctedApplied].forEach(money);
  if (previousApplied > total || correctedApplied <= 0) throw new Error('El monto aplicado no es consistente con el saldo; revisa el registro.');
  const result = Math.round((total - previousApplied + correctedApplied) * 100) / 100;
  if (result > cap) throw new Error('La corrección excede la cuota. Revisa los otros abonos antes de continuar.');
  return result;
}

/** Individual extra fees are authoritative; totals are derived once for every writer. */
export function normalizePayment(payment: Payment): Payment {
  const amount = money(payment.amount);
  const paidRegular = money(payment.paidRegular ?? Math.min(money(payment.paid), amount));
  const fees = payment.extraFees?.map(fee => ({ ...fee, amount: money(fee.amount), paid: money(fee.paid) }));
  const extraAmount = fees?.length ? money(fees.reduce((sum, fee) => sum + fee.amount, 0)) : money(payment.extraAmount);
  const paidExtra = fees?.length ? money(fees.reduce((sum, fee) => sum + fee.paid, 0)) : money(payment.paidExtra ?? Math.max(0, money(payment.paid) - paidRegular));
  const regularCovered = paidRegular >= amount;
  const extraCovered = fees?.length ? fees.every(fee => fee.forgiven || fee.paid >= fee.amount) : paidExtra >= extraAmount;
  const paid = money(paidRegular + paidExtra);
  return { ...payment, amount, paidRegular, extraAmount, paidExtra, paid, regularCovered, extraCovered,
    ...(fees ? { extraFees: fees } : {}),
    status: regularCovered && extraCovered ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente' };
}
