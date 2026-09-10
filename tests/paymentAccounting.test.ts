import assert from 'node:assert/strict';
import { normalizePayment, correctAppliedPayment } from '../services/paymentAccounting';

const base = { period: '2026-09', amount: 400, paid: 0, comments: '', status: 'Pendiente' as const };
const paid = normalizePayment({ ...base, paidRegular: 400, paidExtra: 999, extraFees: [{ id: 'cactus2', description: 'Cactus 2', amount: 6000, paid: 4000, createdAt: '' }] });
assert.equal(paid.paidExtra, 4000);
assert.equal(paid.paid, 4400);
assert.equal(paid.status, 'Parcial');
// 4000 manual + 500 receipt: correcting the receipt to 300 preserves 4000.
assert.equal(correctAppliedPayment(4500, 6000, 500, 300), 4300);
assert.throws(() => correctAppliedPayment(4500, 4600, 500, 800));
assert.throws(() => correctAppliedPayment(300, 6000, 500, 300));
assert.throws(() => normalizePayment({ ...base, paidRegular: -1 }));
assert.throws(() => normalizePayment({ ...base, paidRegular: NaN }));
assert.equal(normalizePayment({ ...base, paid: 400 }).paidRegular, 400);
const forgiven = normalizePayment({ ...base, paidRegular: 400, extraFees: [{ id: 'event', description: 'Event', amount: 6000, paid: 1000, forgiven: true, createdAt: '' }] });
assert.equal(forgiven.paid, 1400); // forgiveness is never cash income
assert.equal(forgiven.status, 'Pagado');
console.log('Payment accounting regression tests passed');
