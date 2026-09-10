import assert from 'node:assert/strict';

// Keep the regression cases explicit and independent from Firebase.
const resolveActualContribution = (ledgerPaid, receipts) => {
  const clean = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
  return Math.max(clean(ledgerPaid), receipts.reduce((sum, value) => sum + clean(value), 0));
};

const summary = (linkedIncome, entries) => {
  const manualIncome = entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
  const expenses = entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  const totalIncome = linkedIncome + manualIncome;
  return { manualIncome, expenses, totalIncome, balance: totalIncome - expenses };
};

assert.equal(resolveActualContribution(2000, [4000]), 4000, 'overpayment evidence must not be capped to project target');
assert.equal(resolveActualContribution(4000, [4000]), 4000, 'historical ledger and receipt must not double count');
assert.equal(resolveActualContribution(4000, [1500, 1000]), 4000, 'ledger residual must preserve undocumented historical cash');
assert.equal(resolveActualContribution(2000, [1200, 1300]), 2500, 'multiple receipts may exceed the ledger-applied amount');

const result = summary(4000, [
  { type: 'income', amount: 1000 },
  { type: 'expense', amount: 2500 },
  { type: 'expense', amount: 500 },
]);
assert.deepEqual(result, { manualIncome: 1000, expenses: 3000, totalIncome: 5000, balance: 2000 });

console.log('Project finance accounting regression tests passed');
