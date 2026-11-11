from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

admin_path = ROOT / 'components/Admin.tsx'
admin = admin_path.read_text(encoding='utf-8')
old = 'const actualPaid = appliedPaid + receiptExcess;'
new = 'const actualPaid = appliedPaid > billed ? appliedPaid : appliedPaid + receiptExcess;'
count = admin.count(old)
if count != 4:
    raise RuntimeError(f'Admin actualPaid formula: expected 4 matches, found {count}')
admin = admin.replace(old, new)
admin_path.write_text(admin, encoding='utf-8')

modal_path = ROOT / 'components/AdminPaymentEvidenceModal.tsx'
modal = modal_path.read_text(encoding='utf-8')
old_modal = """  const received = Math.max(0, Number(context.ledgerPaid || 0)) + approvedExcess;
  const target = Math.max(0, Number(context.targetAmount || 0));
  const pending = Math.max(0, target - Math.max(0, Number(context.ledgerPaid || 0)));
"""
new_modal = """  const target = Math.max(0, Number(context.targetAmount || 0));
  const ledgerPaid = Math.max(0, Number(context.ledgerPaid || 0));
  // Legacy/manual ledgers may already store the full overpayment. In that case
  // the receipt excess is evidence of the same money and must not be added twice.
  const received = ledgerPaid > target ? ledgerPaid : ledgerPaid + approvedExcess;
  const pending = Math.max(0, target - ledgerPaid);
"""
if old_modal not in modal:
    raise RuntimeError('Evidence modal received formula marker not found')
modal = modal.replace(old_modal, new_modal, 1)
modal_path.write_text(modal, encoding='utf-8')

print('✓ Historical overpayment evidence no longer double-counts ledger amounts above target')
