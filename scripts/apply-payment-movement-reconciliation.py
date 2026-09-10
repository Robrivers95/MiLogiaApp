from pathlib import Path
import re


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'No se encontró marcador: {label}')
    return text.replace(old, new, 1)


def regex_once(text, pattern, replacement, label):
    out, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'No se pudo reemplazar {label}; coincidencias={count}')
    return out

# -----------------------------------------------------------------------------
# TYPES
# -----------------------------------------------------------------------------
types = read('types.ts')
if 'export interface PaymentMovement {' not in types:
    block = '''export interface PaymentMovementApplication {
  period: string;
  feeType: 'regular' | 'extra';
  feeId?: string;
  concept: string;
  appliedAmount: number;
}

export interface PaymentMovement {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD: fecha real del banco/efectivo
  kind?: 'payment' | 'note';
  amount: number; // dinero/aportación realmente recibida; puede superar la deuda
  appliedAmount: number; // parte atribuida al cargo/meta
  excessAmount: number; // aportación sobre la meta/deuda
  ledgerOffsetAmount: number; // parte ya representada en el acumulado legacy
  ledgerDeltaAmount: number; // incremento hecho al ledger por este movimiento
  applications: PaymentMovementApplication[];
  comments?: string;
  receiptUrls?: string[];
  receiptId?: string;
  source: 'admin' | 'member_receipt';
  reconciliationStatus?: 'pending' | 'matched' | 'difference';
  bankReference?: string;
  reconciledAt?: string | null;
  reconciledBy?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

'''
    types = replace_once(types, 'export interface PaymentReceipt {', block + 'export interface PaymentReceipt {', 'PaymentReceipt para insertar PaymentMovement')

if '  memberComments?: string;' not in types:
    types = replace_once(types, '  appliedAmount?: number;       // Monto realmente aplicado al saldo al aprobar\n', '  appliedAmount?: number;       // Monto realmente aplicado al saldo al aprobar\n  unappliedAmount?: number;     // Parte recibida que excede la deuda/meta\n  movementId?: string;          // Movimiento bancario/caja generado al aprobar\n  memberComments?: string;      // Nota enviada junto con el comprobante\n', 'campos de trazabilidad de PaymentReceipt')

if "'cuota_regular'" not in types:
    types = types.replace("category: 'saco_beneficencia' | 'cuota_extra'", "category: 'saco_beneficencia' | 'cuota_regular' | 'cuota_extra'", 1)

if '  paymentMovementId?: string;' not in types:
    types = replace_once(types, '  createdAt: number;\n}\n\nexport interface VisitRequest', '''  createdAt: number;
  quotaType?: 'regular' | 'extra' | 'unclassified' | 'manual';
  quotaConcept?: string;
  period?: string;
  memberId?: string;
  memberName?: string;
  receiptUrls?: string[];
  paymentMovementId?: string;
  bankReference?: string;
  reconciliationStatus?: 'pending' | 'matched' | 'difference';
}

export interface VisitRequest''', 'metadatos de TreasuryEntry')
write('types.ts', types)
print('✓ types.ts: movimientos y excedentes agregados')

# -----------------------------------------------------------------------------
# API: delegate receipt approval and Treasury projection to atomic movement service
# -----------------------------------------------------------------------------
api = read('services/api.ts')
if "from './paymentMovements'" not in api:
    api = replace_once(api, "import { normalizePayment, correctAppliedPayment } from './paymentAccounting';", "import { normalizePayment, correctAppliedPayment } from './paymentAccounting';\nimport { paymentMovementService } from './paymentMovements';", 'import paymentMovementService')

approve_pattern = r"  approvePaymentReceipt: async \(\n    receipt: PaymentReceipt,\n    reviewerUid: string\n  \): Promise<void> => \{[\s\S]*?\n  \},\n\n  rejectPaymentReceipt: async \("
approve_replacement = '''  approvePaymentReceipt: async (
    receipt: PaymentReceipt,
    reviewerUid: string
  ): Promise<void> => {
    const result = await paymentMovementService.approveReceipt(receipt, reviewerUid);
    try {
      const declared = Number(receipt.amount || result.movement?.amount || result.appliedAmount || 0);
      const target = receipt.receiptType === 'concepto_adicional'
        ? `“${receipt.conceptDescription || 'cuota extraordinaria'}”`
        : `los períodos ${(receipt.periods || []).join(', ')}`;
      const excessText = result.excessAmount > 0
        ? ` Excedente/aportación adicional: $${result.excessAmount.toFixed(2)}.`
        : '';
      await notificationService.createNotification(
        [receipt.userId],
        receipt.groupId,
        'payment_receipt',
        '✅ Comprobante aprobado',
        `Tu comprobante para ${target} fue aprobado. Recibido: $${declared.toFixed(2)}; aplicado a deuda/meta: $${result.appliedAmount.toFixed(2)}.${excessText}`
      );
    } catch (_) {}
  },

  rejectPaymentReceipt: async ('''
api = regex_once(api, approve_pattern, approve_replacement, 'approvePaymentReceipt')

# Replace detailed quota projection + getAllPaidQuotas as a pair, preserving next method.
quota_pattern = r"  getDetailedQuotaTransactions: async \(groupId: string\): Promise<TreasuryEntry\[]> => \{[\s\S]*?\n  \},\n  \n  getAllPaidQuotas: async \(groupId: string\): Promise<number> => \{[\s\S]*?\n  \},"
quota_replacement = '''  getDetailedQuotaTransactions: async (groupId: string): Promise<TreasuryEntry[]> => {
      return paymentMovementService.getDetailedQuotaTransactions(groupId);
  },
  
  getAllPaidQuotas: async (groupId: string): Promise<number> => {
      return paymentMovementService.getAllReceivedQuotas(groupId);
  },'''
api = regex_once(api, quota_pattern, quota_replacement, 'proyección de cuotas en Tesorería')
write('services/api.ts', api)
print('✓ services/api.ts: aprobación atómica + movimientos reales')

# -----------------------------------------------------------------------------
# MEMBER PAYMENT FORM: allow over-target contributions + comments
# -----------------------------------------------------------------------------
payments = read('components/Payments.tsx')
if "const [receiptComments, setReceiptComments]" not in payments:
    payments = replace_once(payments, "  const [receiptAmount, setReceiptAmount] = useState('');", "  const [receiptAmount, setReceiptAmount] = useState('');\n  const [receiptComments, setReceiptComments] = useState('');", 'state receiptComments')

payments = payments.replace(
    ".filter(fee => !fee.forgiven && Number(fee.paid || 0) < Number(fee.amount || 0))",
    ".filter(fee => !fee.forgiven)"
)
# Legacy extras: make them selectable even when the target is already covered.
payments = re.sub(
    r"      if \(paid < amount\) \{\n        return \[\{([\s\S]*?)\n        \}\];\n      \}\n    \}\n    return \[\];",
    r"      return [{\1\n      }];\n    }\n    return [];",
    payments,
    count=1,
)

# Remove the two legacy blocks that prohibited over-reporting.
payments = re.sub(r"      if \(selectedExtraAvailableBalance <= 0\) \{[\s\S]*?\n      \}\n", "", payments, count=1)
payments = re.sub(r"      if \(declaredAmount > selectedExtraAvailableBalance \+ 0\.009\) \{[\s\S]*?\n      \}\n", "", payments, count=1)
payments = payments.replace("                  max={receiptType === 'concepto_adicional' && selectedExtraFeeOption ? selectedExtraAvailableBalance : undefined}\n", "")
payments = payments.replace(
    "                          ⏳ Hay ${pendingReportedForSelectedExtra.toFixed(2)} en comprobantes pendientes de revisión. Disponible para reportar ahora: ${selectedExtraAvailableBalance.toFixed(2)}.",
    "                          ⏳ Hay ${pendingReportedForSelectedExtra.toFixed(2)} en comprobantes pendientes. Puedes reportar el monto real transferido aunque supere el saldo; el excedente quedará como aportación adicional al mismo concepto."
)

if 'memberComments: receiptComments.trim()' not in payments:
    payments = replace_once(payments, "        conceptDescription: receiptType === 'concepto_adicional' ? conceptDescription.trim() : undefined,", "        conceptDescription: receiptType === 'concepto_adicional' ? conceptDescription.trim() : undefined,\n        memberComments: receiptComments.trim() || undefined,", 'comentario al enviar comprobante')
if "setReceiptComments('');" not in payments:
    payments = replace_once(payments, "      setReceiptAmount('');", "      setReceiptAmount('');\n      setReceiptComments('');", 'reset receiptComments')

comment_ui_marker = '''              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  Comprobantes <span className="text-red-400">*</span>'''
if 'Comentario / referencia para Tesorería' not in payments:
    comment_ui = '''              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Comentario / referencia para Tesorería</label>
                <textarea
                  value={receiptComments}
                  onChange={e => setReceiptComments(e.target.value)}
                  rows={2}
                  placeholder="Ej. referencia SPEI, Mercado Pago, nota del abono..."
                  className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white text-sm"
                />
              </div>

'''
    payments = replace_once(payments, comment_ui_marker, comment_ui + comment_ui_marker, 'textarea comentario comprobante')

payments = payments.replace(
    ": ' Al ser aprobado, el monto se sumará únicamente a la cuota extra seleccionada; podrás subir otro comprobante por el saldo restante.'}",
    ": ' Al aprobarse se registrará el monto REAL recibido. Solo la parte pendiente se aplicará a la deuda; cualquier excedente permanecerá ligado a este mismo concepto como aportación adicional.'}"
)
write('components/Payments.tsx', payments)
print('✓ Payments.tsx: aportaciones sobre meta + comentario habilitados')

# -----------------------------------------------------------------------------
# ADMIN: matrix summary, per-concept movement modal, member-management entry points
# -----------------------------------------------------------------------------
admin = read('components/Admin.tsx')
if "PaymentMovement } from '../types'" not in admin and "PaymentMovement," not in admin.split('\n', 3)[1]:
    admin = admin.replace('ExtraFee, PaymentReceipt } from \'../types\';', 'ExtraFee, PaymentReceipt, PaymentMovement } from \'../types\';', 1)
if "from './PaymentMovementModal'" not in admin:
    admin = admin.replace("import { useReadOnly } from '../contexts/ReadOnlyContext';", "import { useReadOnly } from '../contexts/ReadOnlyContext';\nimport PaymentMovementModal, { type PaymentMovementContext } from './PaymentMovementModal';\nimport { paymentMovementService } from '../services/paymentMovements';\nimport { buildContributionSummary } from '../services/paymentMovementAccounting';", 1)

state_marker = "  const [reconcilingMatrixConcept, setReconcilingMatrixConcept] = useState(false);"
if "const [paymentMovements, setPaymentMovements]" not in admin:
    admin = replace_once(admin, state_marker, state_marker + "\n  const [paymentMovements, setPaymentMovements] = useState<PaymentMovement[]>([]);\n  const [paymentMovementContext, setPaymentMovementContext] = useState<PaymentMovementContext | null>(null);", 'state paymentMovements')

load_marker = "  const loadPaymentReceipts = async () => {"
if "const loadPaymentMovements = async () =>" not in admin:
    load_fn = '''  const loadPaymentMovements = async () => {
    if (!user.groupId) return;
    try {
      setPaymentMovements(await paymentMovementService.getMovements(user.groupId));
    } catch (e) {
      console.error('Error loading payment movements', e);
    }
  };

'''
    admin = replace_once(admin, load_marker, load_fn + load_marker, 'loadPaymentMovements')

admin = admin.replace(
    "      if (activeTab === 'payment-matrix') {\n          loadAllLedgers();\n          loadPaymentReceipts();\n      }",
    "      if (activeTab === 'payment-matrix') {\n          loadAllLedgers();\n          loadPaymentReceipts();\n          loadPaymentMovements();\n      }",
    1,
)
admin = admin.replace(
    "          loadTreasury()\n      ]);",
    "          loadTreasury(),\n          loadPaymentMovements()\n      ]);",
    1,
)

handler_marker = "  const handleOpenPayments = async (uid: string) => {"
if "const openPaymentMovementContext =" not in admin:
    handlers = '''  const openPaymentMovementContext = (
      uid: string,
      memberName: string,
      payment: Payment,
      feeType: 'regular' | 'extra',
      feeId?: string,
      concept?: string
  ) => {
      if (feeType === 'regular') {
          setPaymentMovementContext({
              userId: uid,
              userName: memberName,
              period: payment.period,
              feeType: 'regular',
              concept: 'Cuota mensual',
              targetAmount: Number(payment.amount) || 0,
              ledgerPaid: Number(payment.paidRegular ?? payment.paid ?? 0) || 0,
          });
          return;
      }
      const fee = payment.extraFees?.find(item => feeId ? item.id === feeId : item.description === concept);
      const legacy = !payment.extraFees?.length && Number(payment.extraAmount) > 0;
      setPaymentMovementContext({
          userId: uid,
          userName: memberName,
          period: payment.period,
          feeType: 'extra',
          feeId: fee?.id || (legacy ? 'legacy' : feeId),
          concept: fee?.description || payment.extraDescription || concept || 'Cuota Extra',
          targetAmount: Number(fee?.amount ?? payment.extraAmount ?? 0) || 0,
          ledgerPaid: Number(fee?.paid ?? payment.paidExtra ?? 0) || 0,
      });
  };

  const refreshPaymentMovementData = async () => {
      await Promise.all([
          loadPaymentMovements(),
          loadAllLedgers(),
          loadPaymentReceipts(),
          loadTreasury(),
          loadUsers(),
          loadDashboardStats(),
      ]);
      if (editingUserLedger) {
          setEditPayments(await dataService.getPayments(editingUserLedger));
      }
  };

'''
    admin = replace_once(admin, handler_marker, handlers + handler_marker, 'handlers movimientos')

# Ensure Gestión de Pagos opens with current movement records too.
admin = admin.replace(
    "      setEditPayments(payments);\n      setEditingUserLedger(uid);",
    "      setEditPayments(payments);\n      setEditingUserLedger(uid);\n      await loadPaymentMovements();",
    1,
)

# Add regular monthly movement button to each editable period row.
regular_actions = '''                                     <div className="flex gap-1 mt-3 md:mt-0">
                                         <button 
                                            onClick={() => handleSavePaymentRow(p)}'''
if 'title="Abonos y comprobantes de la cuota mensual"' not in admin:
    replacement = '''                                     <div className="flex gap-1 mt-3 md:mt-0">
                                         <button
                                            onClick={() => editingUserLedger && openPaymentMovementContext(editingUserLedger, users.find(item => item.uid === editingUserLedger)?.name || 'Miembro', p, 'regular')}
                                            className="bg-indigo-700 hover:bg-indigo-600 text-white p-1 rounded text-xs px-2 h-8 flex items-center"
                                            title="Abonos y comprobantes de la cuota mensual"
                                         >
                                             🧾
                                         </button>
                                         <button 
                                            onClick={() => handleSavePaymentRow(p)}'''
    admin = replace_once(admin, regular_actions, replacement, 'botón movimientos cuota mensual')

# Add movement button to every individual extra concept.
extra_action_marker = '''                                                             <div className="flex gap-1">
                                                                 <button
                                                                     onClick={() => handleEditIndividualExtraFee(p.period, fee.id, fee.description, fee.amount)}'''
if 'title="Abonos, fechas, comentarios y comprobantes"' not in admin:
    replacement = '''                                                             <div className="flex gap-1">
                                                                 <button
                                                                     onClick={() => editingUserLedger && openPaymentMovementContext(editingUserLedger, users.find(item => item.uid === editingUserLedger)?.name || 'Miembro', p, 'extra', fee.id, fee.description)}
                                                                     className="bg-purple-700 hover:bg-purple-600 text-white p-1 rounded text-xs"
                                                                     title="Abonos, fechas, comentarios y comprobantes"
                                                                 >
                                                                     🧾
                                                                 </button>
                                                                 <button
                                                                     onClick={() => handleEditIndividualExtraFee(p.period, fee.id, fee.description, fee.amount)}'''
    admin = replace_once(admin, extra_action_marker, replacement, 'botón movimientos cuota extra')

# Clarify the old aggregate edit field is only a legacy/correction tool.
admin = admin.replace(
    '<label className="text-[9px] text-gray-500 uppercase">Pagado</label>\n                                                                 <input ',
    '<label className="text-[9px] text-gray-500 uppercase">Acumulado / ajuste</label>\n                                                                 <input ',
    1,
)

# Replace matrix cell return with visible contribution summary and context-aware click.
old_cell = '''                                            return (
                                                <td 
                                                    key={idx} 
                                                    className={`p-2 text-center border border-logia-700 transition-colors ${cellClass}`}
                                                    onClick={() => paymentData && handleOpenMatrixModal(u.uid, u.name, period)}
                                                    title={cellTitle}
                                                >
                                                    {cellText}
                                                </td>
                                            );'''
if 'Aportó ${matrixContribution.received.toFixed(0)}' not in admin:
    new_cell = '''                                            const selectedMatrixExtra = matrixFilter === 'extra' && matrixExtraDesc
                                                ? paymentData?.extraFees?.find(item => item.description === matrixExtraDesc)
                                                : undefined;
                                            const selectedMatrixLegacy = matrixFilter === 'extra' && matrixExtraDesc && !paymentData?.extraFees?.length && Number(paymentData?.extraAmount || 0) > 0 &&
                                                (paymentData?.extraDescription || 'Cuota Extra') === matrixExtraDesc;
                                            const matrixContribution = paymentData && matrixFilter === 'extra' && matrixExtraDesc && (selectedMatrixExtra || selectedMatrixLegacy)
                                                ? buildContributionSummary({
                                                    targetAmount: Number(selectedMatrixExtra?.amount ?? paymentData.extraAmount ?? 0),
                                                    ledgerPaid: Number(selectedMatrixExtra?.paid ?? paymentData.paidExtra ?? 0),
                                                    movements: paymentMovements,
                                                    receipts: paymentReceipts as PaymentReceipt[],
                                                    context: {
                                                        userId: u.uid,
                                                        period,
                                                        feeType: 'extra',
                                                        feeId: selectedMatrixExtra?.id || (selectedMatrixLegacy ? 'legacy' : undefined),
                                                        concept: matrixExtraDesc,
                                                    },
                                                })
                                                : null;
                                            return (
                                                <td 
                                                    key={idx} 
                                                    className={`p-2 text-center border border-logia-700 transition-colors ${cellClass}`}
                                                    onClick={() => {
                                                        if (!paymentData) return;
                                                        if (matrixFilter === 'extra' && matrixExtraDesc && (selectedMatrixExtra || selectedMatrixLegacy)) {
                                                            openPaymentMovementContext(u.uid, u.name, paymentData, 'extra', selectedMatrixExtra?.id || (selectedMatrixLegacy ? 'legacy' : undefined), matrixExtraDesc);
                                                        } else {
                                                            handleOpenMatrixModal(u.uid, u.name, period);
                                                        }
                                                    }}
                                                    title={matrixContribution
                                                        ? `Aportado $${matrixContribution.received.toFixed(2)} · Meta $${matrixContribution.target.toFixed(2)} · Extra $${matrixContribution.excess.toFixed(2)}`
                                                        : cellTitle}
                                                >
                                                    <div className="font-bold">{cellText}</div>
                                                    {matrixContribution && (
                                                        <div className="mt-1 text-[9px] leading-tight whitespace-nowrap">
                                                            <div>Aportó <strong>${matrixContribution.received.toFixed(0)}</strong></div>
                                                            <div className="opacity-80">Meta ${matrixContribution.target.toFixed(0)}</div>
                                                            {matrixContribution.excess > 0 && (
                                                                <div className="text-orange-200 font-bold">Extra +${matrixContribution.excess.toFixed(0)}</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            );'''
    admin = replace_once(admin, old_cell, new_cell, 'celda de matriz con aportación real')

# Treasury wording: new rows are individual where available; legacy remains explicit.
admin = admin.replace(
    'Los pagos de miembros ya están incluidos en este balance. Registra aquí únicamente otros ingresos y egresos para evitar duplicarlos. Las filas de cuotas son acumulados mensuales; sus fechas no representan cada depósito bancario.',
    'Los pagos de miembros ya están incluidos en este balance. Los nuevos abonos aparecen por transacción con su fecha real; los importes antiguos que todavía no se han desglosado se identifican como “Acumulado histórico sin desglose”. Registra aquí únicamente otros ingresos y egresos para evitar duplicarlos.',
    1,
)

# Render movement modal once, outside the main tab content.
modal_marker = '      {/* FILTERED EXTRA-FEE RECEIPTS MODAL */}'
if '<PaymentMovementModal' not in admin:
    movement_modal = '''      {paymentMovementContext && (
        <PaymentMovementModal
          groupId={user.groupId}
          adminUid={user.uid}
          context={paymentMovementContext}
          movements={paymentMovements}
          receipts={paymentReceipts as PaymentReceipt[]}
          readOnly={isReadOnly}
          onClose={() => setPaymentMovementContext(null)}
          onChanged={refreshPaymentMovementData}
        />
      )}

'''
    admin = replace_once(admin, modal_marker, movement_modal + modal_marker, 'PaymentMovementModal render')

write('components/Admin.tsx', admin)
print('✓ Admin.tsx: matriz + Gestión de Miembros conectadas a movimientos')

# Fix operator precedence in newly-added component (kept here so CI validates source).
modal = read('components/PaymentMovementModal.tsx')
modal = modal.replace(
    "const nextComments = window.prompt('Comentario:', movement.comments || '') ?? movement.comments || '';",
    "const nextComments = window.prompt('Comentario:', movement.comments || '') ?? (movement.comments || '');"
)
write('components/PaymentMovementModal.tsx', modal)

# -----------------------------------------------------------------------------
# FIRESTORE RULES
# -----------------------------------------------------------------------------
rules = read('firestore.rules')
if 'match /paymentMovements/{movementId}' not in rules:
    receipt_block_end = '''      match /tasks/{taskId} {
        allow read: if isSignedIn();'''
    movement_rules = '''      match /paymentMovements/{movementId} {
        allow read: if isSignedIn() &&
                       (isAdminOrMaster() || resource.data.userId == request.auth.uid);
        allow create, update, delete: if isAdminOrMaster() && (isMaster() || isGroupActive(groupId));
      }

'''
    rules = replace_once(rules, receipt_block_end, movement_rules + receipt_block_end, 'reglas paymentMovements')
write('firestore.rules', rules)
print('✓ firestore.rules: paymentMovements protegido para Tesorería')

# -----------------------------------------------------------------------------
# ACCOUNTING TESTS
# -----------------------------------------------------------------------------
test_path = Path('tests/paymentMovementAccounting.test.ts')
test_path.write_text('''import assert from 'node:assert/strict';
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
''', encoding='utf-8')

runner = read('tests/run-accounting.mjs')
if 'paymentMovementAccounting.test.ts' not in runner:
    runner = runner.replace(
        "'tests/paymentAccounting.test.ts', 'services/paymentAccounting.ts', 'types.ts'",
        "'tests/paymentAccounting.test.ts', 'tests/paymentMovementAccounting.test.ts', 'services/paymentAccounting.ts', 'services/paymentMovementAccounting.ts', 'types.ts'"
    )
    runner = runner.replace(
        "execFileSync(process.execPath, [join(output, 'tests/paymentAccounting.test.js')], { stdio: 'inherit' });",
        "execFileSync(process.execPath, [join(output, 'tests/paymentAccounting.test.js')], { stdio: 'inherit' });\n  execFileSync(process.execPath, [join(output, 'tests/paymentMovementAccounting.test.js')], { stdio: 'inherit' });"
    )
write('tests/run-accounting.mjs', runner)
print('✓ pruebas contables de aportaciones/excedentes agregadas')

print('✓ PaymentMovement reconciliation patch complete')
