import { collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
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
  const targetDescription = (receipt.conceptDescription || '').trim().toLowerCase();

  const ordered = [...ledgers].sort((a, b) => {
    const aTarget = a.period === targetPeriod ? 0 : 1;
    const bTarget = b.period === targetPeriod ? 0 : 1;
    return aTarget - bTarget || a.period.localeCompare(b.period);
  });

  let remaining = Math.max(0, Number(receipt.amount) || 0);
  if (remaining <= 0) {
    for (const row of ordered) {
      const fee = (row.payment.extraFees || []).find(item =>
        !item.forgiven &&
        ((targetId && item.id === targetId) ||
         (targetDescription && item.description.trim().toLowerCase() === targetDescription))
      );
      if (fee) {
        remaining = Math.max(0, Number(fee.amount) - Number(fee.paid || 0));
        break;
      }
    }
  }

  const result: ExtraAllocationResult = { applied: 0, unapplied: 0, allocations: [] };

  const candidates: Array<{ row: typeof ordered[number]; fee: IndividualExtraFee; target: boolean }> = [];
  for (const row of ordered) {
    for (const fee of row.payment.extraFees || []) {
      if (fee.forgiven || Number(fee.paid || 0) >= Number(fee.amount || 0)) continue;
      const target = Boolean(
        (targetId && fee.id === targetId) ||
        (!targetId && targetDescription && fee.description.trim().toLowerCase() === targetDescription && (!targetPeriod || row.period === targetPeriod))
      );
      candidates.push({ row, fee, target });
    }
  }
  candidates.sort((a, b) => Number(b.target) - Number(a.target) || a.row.period.localeCompare(b.row.period));

  const changed = new Map<string, { ref: typeof ordered[number]['ref']; payment: Payment; fees: IndividualExtraFee[] }>();

  for (const candidate of candidates) {
    if (remaining <= 0) break;
    const key = candidate.row.period;
    const state = changed.get(key) || {
      ref: candidate.row.ref,
      payment: candidate.row.payment,
      fees: (candidate.row.payment.extraFees || []).map(item => ({ ...item })),
    };
    const fee = state.fees.find(item => item.id === candidate.fee.id);
    if (!fee) continue;
    const debt = Math.max(0, Number(fee.amount) - Number(fee.paid || 0));
    const applied = Math.min(remaining, debt);
    if (applied <= 0) continue;
    fee.paid = Number(fee.paid || 0) + applied;
    remaining -= applied;
    result.applied += applied;
    result.allocations.push({ period: key, feeId: fee.id, description: fee.description, amount: applied });
    changed.set(key, state);
  }

  for (const [period, state] of changed) {
    const totalExtra = state.fees.reduce((sum, fee) => sum + (fee.forgiven ? 0 : Number(fee.amount || 0)), 0);
    const totalPaidExtra = state.fees.reduce((sum, fee) => sum + Number(fee.paid || 0), 0);
    const regular = paidRegular(state.payment);
    const regularCovered = regular >= Number(state.payment.amount || 0);
    const extraCovered = totalExtra <= 0 || totalPaidExtra >= totalExtra;
    await updateDoc(state.ref, {
      extraFees: state.fees,
      extraAmount: state.fees.reduce((sum, fee) => sum + Number(fee.amount || 0), 0),
      paidExtra: totalPaidExtra,
      paidRegular: regular,
      paid: regular + totalPaidExtra,
      regularCovered,
      extraCovered,
      status: regularCovered && extraCovered ? 'Pagado' : (regular > 0 || totalPaidExtra > 0 ? 'Parcial' : 'Pendiente'),
      paymentDate: approvalDate,
      comments: state.payment.comments ? `${state.payment.comments} | Aprobado ${approvalDate}` : `Aprobado ${approvalDate}`,
    });
  }

  result.unapplied = remaining;
  return result;
}
