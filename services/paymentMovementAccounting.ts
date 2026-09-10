import type { PaymentMovement, PaymentReceipt } from '../types';

export type ContributionContext = {
  userId: string;
  period: string;
  feeType: 'regular' | 'extra';
  feeId?: string;
  concept?: string;
};

const money = (value: unknown): number => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.max(0, n) * 100) / 100;
};

const normalize = (value?: string): string => (value || '').trim().toLocaleLowerCase('es-MX');

export const movementApplicationMatches = (
  movement: PaymentMovement,
  context: ContributionContext
): boolean => {
  if (movement.userId !== context.userId) return false;
  return (movement.applications || []).some(application => {
    if (application.period !== context.period || application.feeType !== context.feeType) return false;
    if (context.feeType === 'regular') return true;
    if (context.feeId && context.feeId !== 'legacy' && application.feeId) {
      return application.feeId === context.feeId;
    }
    return normalize(application.concept) === normalize(context.concept);
  });
};

export const receiptMatchesContribution = (
  receipt: PaymentReceipt,
  context: ContributionContext
): boolean => {
  if (receipt.userId !== context.userId || receipt.status !== 'approved') return false;
  if (context.feeType === 'regular') {
    return receipt.receiptType === 'cuota_mensual' &&
      (receipt.periods || []).length === 1 &&
      receipt.periods[0] === context.period;
  }
  if (receipt.receiptType !== 'concepto_adicional') return false;
  const period = receipt.extraFeePeriod || receipt.periods?.[0];
  if (period !== context.period) return false;
  if (context.feeId && context.feeId !== 'legacy' && receipt.extraFeeId && receipt.extraFeeId !== 'legacy') {
    return receipt.extraFeeId === context.feeId;
  }
  return normalize(receipt.conceptDescription) === normalize(context.concept);
};

/**
 * Separates charge/debt from cash received.
 *
 * ledgerPaid is the accumulated value already present in the legacy ledger. New
 * movements carry ledgerOffsetAmount to identify how much of that aggregate is
 * represented by a concrete transaction. This lets us split historical totals
 * into real deposits without double counting them.
 */
export const buildContributionSummary = ({
  targetAmount,
  ledgerPaid,
  movements,
  receipts = [],
  context,
}: {
  targetAmount: number;
  ledgerPaid: number;
  movements: PaymentMovement[];
  receipts?: PaymentReceipt[];
  context: ContributionContext;
}) => {
  const scopedMovements = movements.filter(movement => movementApplicationMatches(movement, context));
  const representedInLedger = scopedMovements.reduce(
    (sum, movement) => sum + money(movement.ledgerOffsetAmount ?? movement.appliedAmount),
    0
  );
  const legacyBaseline = Math.max(0, money(ledgerPaid) - representedInLedger);
  const movementCash = scopedMovements.reduce((sum, movement) => sum + money(movement.amount), 0);
  let received = legacyBaseline + movementCash;

  // Historical approved receipts predate PaymentMovement. They are read-only
  // evidence here: use the greater supported amount rather than adding it, so a
  // receipt cannot double count an aggregate that already included that money.
  const linkedReceiptIds = new Set(scopedMovements.map(movement => movement.receiptId).filter(Boolean));
  const historicalReceiptCash = receipts
    .filter(receipt => !linkedReceiptIds.has(receipt.id) && receiptMatchesContribution(receipt, context))
    .reduce((sum, receipt) => sum + money(receipt.amount), 0);
  received = Math.max(received, historicalReceiptCash);

  const target = money(targetAmount);
  const appliedToTarget = Math.min(target, money(ledgerPaid));
  const pending = Math.max(0, target - appliedToTarget);
  const excess = Math.max(0, received - target);

  return {
    target,
    received: money(received),
    appliedToTarget: money(appliedToTarget),
    pending: money(pending),
    excess: money(excess),
    legacyBaseline: money(legacyBaseline),
    movements: scopedMovements,
    historicalReceiptCash: money(historicalReceiptCash),
  };
};
