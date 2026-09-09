import { collection, getDocs, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { IndividualExtraFee, Payment, PaymentReceipt } from '../types';

export interface ExtraAllocationResult {
  applied: number;
  unapplied: number;
  allocations: Array<{ period: string; feeId: string; description: string; amount: number }>;
}

const paidRegular = (payment: Payment): number => {
  if (payment.paidRegular !== undefined) return Number(payment.paidRegular) || 0;
  return Math.min(Number(payment.paid) || 0, Number(payment.amount) || 0);
};

const unique = (values: Array<string | undefined>): string[] =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value))));

/**
 * Aplica un comprobante de cuota extraordinaria SOLO a la cuota seleccionada.
 * Si el comprobante excede el saldo, el excedente se conserva en el recibo como
 * unappliedAmount; nunca se mueve silenciosamente a otra deuda.
 */
export async function applyExtraReceiptPayment(
  receipt: PaymentReceipt,
  approvalDate: string
): Promise<ExtraAllocationResult> {
  const snap = await getDocs(collection(db, 'users', receipt.userId, 'ledger'));
  const ledgers = snap.docs
    .map(item => ({ ref: item.ref, period: item.id, payment: item.data() as Payment }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const targetPeriod = receipt.targetExtraFeePeriod || receipt.periods?.[0] || '';
  const targetId = receipt.targetExtraFeeId || receipt.conceptId || '';
  const targetDescription = (receipt.conceptDescription || '').trim().toLocaleLowerCase('es-MX');
  const receiptUrls = unique([
    ...(receipt.receiptImageUrls || []),
    receipt.receiptImageUrl,
  ]);

  let row = targetPeriod ? ledgers.find(item => item.period === targetPeriod) : undefined;

  // Compatibilidad con comprobantes históricos sin período exacto: solo inferir
  // cuando existe una única coincidencia inequívoca.
  if (!row) {
    const matches = ledgers.filter(item => {
      const fees = item.payment.extraFees || [];
      if (targetId && fees.some(fee => fee.id === targetId)) return true;
      if (targetDescription && fees.some(fee => fee.description.trim().toLocaleLowerCase('es-MX') === targetDescription)) return true;
      if (!fees.length && Number(item.payment.extraAmount) > 0 && targetDescription) {
        return (item.payment.extraDescription || 'Cuota Extra').trim().toLocaleLowerCase('es-MX') === targetDescription;
      }
      return false;
    });
    if (matches.length === 1) row = matches[0];
  }

  if (!row) {
    throw new Error('No se pudo identificar de forma segura la cuota extraordinaria a la que pertenece este comprobante.');
  }

  const payment = row.payment;
  const regular = paidRegular(payment);
  const regularCovered = regular >= Number(payment.amount || 0);
  const declared = Math.max(0, Number(receipt.amount) || 0);
  const result: ExtraAllocationResult = { applied: 0, unapplied: 0, allocations: [] };

  if (payment.extraFees && payment.extraFees.length > 0) {
    const fees: IndividualExtraFee[] = payment.extraFees.map(item => ({
      ...item,
      amount: Number(item.amount) || 0,
      paid: Number(item.paid) || 0,
    }));

    let index = targetId ? fees.findIndex(fee => fee.id === targetId) : -1;
    if (index < 0 && targetDescription) {
      const descriptionMatches = fees
        .map((fee, i) => ({ fee, i }))
        .filter(({ fee }) => fee.description.trim().toLocaleLowerCase('es-MX') === targetDescription);
      if (descriptionMatches.length === 1) index = descriptionMatches[0].i;
    }
    if (index < 0) throw new Error('La cuota extraordinaria seleccionada ya no existe en el ledger del miembro.');

    const fee = fees[index];
    const debt = fee.forgiven ? 0 : Math.max(0, fee.amount - fee.paid);
    const amountToProcess = declared > 0 ? declared : debt;
    const applied = Math.min(amountToProcess, debt);

    fees[index] = {
      ...fee,
      paid: Math.min(fee.amount, fee.paid + applied),
      receiptUrls: unique([...(fee.receiptUrls || []), ...receiptUrls]),
      receiptIds: unique([...(fee.receiptIds || []), receipt.id]),
    } as IndividualExtraFee;

    const totalExtraAmount = fees.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalPaidExtra = fees.reduce((sum, item) => sum + Number(item.paid || 0), 0);
    const activeExtraDebt = fees.reduce(
      (sum, item) => sum + (item.forgiven ? 0 : Math.max(0, Number(item.amount || 0) - Number(item.paid || 0))),
      0
    );
    const extraCovered = activeExtraDebt <= 0;

    await updateDoc(row.ref, {
      extraFees: fees,
      extraAmount: totalExtraAmount,
      paidExtra: totalPaidExtra,
      paidRegular: regular,
      paid: regular + totalPaidExtra,
      regularCovered,
      extraCovered,
      status: regularCovered && extraCovered ? 'Pagado' : (regular > 0 || totalPaidExtra > 0 ? 'Parcial' : 'Pendiente'),
      paymentDate: applied > 0 ? approvalDate : (payment.paymentDate || null),
      comments: payment.comments
        ? `${payment.comments} | Comprobante ${receipt.id}: +$${applied.toFixed(2)} a ${fee.description} (${approvalDate})`
        : `Comprobante ${receipt.id}: +$${applied.toFixed(2)} a ${fee.description} (${approvalDate})`,
    });

    result.applied = applied;
    result.unapplied = Math.max(0, amountToProcess - applied);
    if (applied > 0) {
      result.allocations.push({ period: row.period, feeId: fee.id, description: fee.description, amount: applied });
    }
    return result;
  }

  // Compatibilidad con cuota extraordinaria legacy (extraAmount/extraDescription).
  const legacyAmount = Math.max(0, Number(payment.extraAmount) || 0);
  if (legacyAmount <= 0) throw new Error('No existe una cuota extraordinaria en el período seleccionado.');

  const legacyPaid = Math.max(0, Number(payment.paidExtra) || 0);
  const debt = Math.max(0, legacyAmount - legacyPaid);
  const amountToProcess = declared > 0 ? declared : debt;
  const applied = Math.min(amountToProcess, debt);
  const newPaidExtra = Math.min(legacyAmount, legacyPaid + applied);
  const extraCovered = newPaidExtra >= legacyAmount;

  await updateDoc(row.ref, {
    paidExtra: newPaidExtra,
    paidRegular: regular,
    paid: regular + newPaidExtra,
    regularCovered,
    extraCovered,
    extraReceiptUrls: unique([...(payment.extraReceiptUrls || []), ...receiptUrls]),
    extraReceiptIds: unique([...(payment.extraReceiptIds || []), receipt.id]),
    status: regularCovered && extraCovered ? 'Pagado' : (regular > 0 || newPaidExtra > 0 ? 'Parcial' : 'Pendiente'),
    paymentDate: applied > 0 ? approvalDate : (payment.paymentDate || null),
    comments: payment.comments
      ? `${payment.comments} | Comprobante ${receipt.id}: +$${applied.toFixed(2)} a ${payment.extraDescription || 'Cuota Extra'} (${approvalDate})`
      : `Comprobante ${receipt.id}: +$${applied.toFixed(2)} a ${payment.extraDescription || 'Cuota Extra'} (${approvalDate})`,
  });

  result.applied = applied;
  result.unapplied = Math.max(0, amountToProcess - applied);
  if (applied > 0) {
    result.allocations.push({
      period: row.period,
      feeId: 'legacy',
      description: payment.extraDescription || 'Cuota Extra',
      amount: applied,
    });
  }
  return result;
}
