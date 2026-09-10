import assert from 'node:assert/strict';
import type { PaymentMovement, PaymentReceipt } from '../types';
import { buildContributionSummary } from '../services/paymentMovementAccounting';

const ctx = { userId: 'u1', period: '2026-06', feeType: 'extra' as const, feeId: 'cactus2', concept: 'Evento cactus 2' };
const movement = (id: string, amount: number, applied: number, offset: number, date: string): PaymentMovement => ({
  id, groupId: 'g1', userId: 'u1', userName: 'Miembro', date, kind: 'payment', amount,
  appliedAmount: applied, excessAmount: Math.max(0, amount - applied), ledgerOffsetAmount: offset,
  ledgerDeltaAmount: applied, applications: [{ ...ctx, appliedAmount: applied }], source: 'admin',
  reconciliationStatus: 'pending', createdBy: 'admin', createdAt: `${date}T12:00:00.000Z`,
});

{
  const result = buildContributionSummary({ targetAmount: 2000, ledgerPaid: 4000, movements: [], context: ctx });
  assert.equal(result.received, 4000);
  assert.equal(result.pending, 0);
  assert.equal(result.excess, 2000);
}

{
  const result = buildContributionSummary({
    targetAmount: 2000, ledgerPaid: 1500,
    movements: [movement('m1', 1000, 1000, 1000, '2026-05-10')], context: ctx,
  });
  assert.equal(result.legacyBaseline, 500);
  assert.equal(result.received, 1500);
  assert.equal(result.pending, 500);
}

{
  const movements = [
    movement('m1', 500, 500, 500, '2026-04-01'),
    movement('m2', 700, 700, 700, '2026-05-01'),
    movement('m3', 2800, 800, 800, '2026-06-01'),
  ];
  const result = buildContributionSummary({ targetAmount: 2000, ledgerPaid: 2000, movements, context: ctx });
  assert.equal(result.received, 4000);
  assert.equal(result.excess, 2000);
  assert.equal(result.movements.length, 3);
}

{
  const receipt: PaymentReceipt = {
    id: 'legacy-r', groupId: 'g1', userId: 'u1', userName: 'Miembro', periods: ['2026-06'],
    transferDate: '2026-06-10', receiptImageUrl: '', amount: 4000, receiptType: 'concepto_adicional',
    conceptDescription: 'Evento cactus 2', extraFeeId: 'cactus2', extraFeePeriod: '2026-06',
    appliedAmount: 2000, status: 'approved', submittedAt: '2026-06-10T12:00:00.000Z',
  };
  const result = buildContributionSummary({ targetAmount: 2000, ledgerPaid: 2000, movements: [], receipts: [receipt], context: ctx });
  assert.equal(result.received, 4000);
  assert.equal(result.excess, 2000);
}

console.log('paymentMovementAccounting: OK');
