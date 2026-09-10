from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def write(rel, text):
    (ROOT / rel).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 match, found {count}')
    return text.replace(old, new, 1)


# -----------------------------------------------------------------------------
# types.ts — preserve actual receipt amount separately from amount applied.
# -----------------------------------------------------------------------------
types = read('types.ts')
if 'ledgerIncluded?: boolean;' not in types:
    types = replace_once(
        types,
        "  appliedAmount?: number;       // Monto realmente aplicado al saldo al aprobar\n",
        "  appliedAmount?: number;       // Monto realmente aplicado al saldo al aprobar\n  unappliedAmount?: number;     // Diferencia entre recibido y aplicado (excedente)\n  ledgerIncluded?: boolean;     // true si es desglose histórico ya incluido en el acumulado\n",
        'types receipt audit fields'
    )
write('types.ts', types)


# -----------------------------------------------------------------------------
# Payments.tsx — allow members to report the REAL amount even above the target.
# -----------------------------------------------------------------------------
payments = read('components/Payments.tsx')
payments = payments.replace(
    ".filter(fee => !fee.forgiven && Number(fee.paid || 0) < Number(fee.amount || 0))",
    ".filter(fee => !fee.forgiven)",
)
payments = payments.replace(
    "      if (paid < amount) {\n        return [{\n          period: payment.period,\n          feeId: 'legacy',\n          description: payment.extraDescription || 'Cuota Extra',\n          amount,\n          paid,\n          balance: Math.max(0, amount - paid),\n          legacy: true,\n        }];\n      }",
    "      return [{\n        period: payment.period,\n        feeId: 'legacy',\n        description: payment.extraDescription || 'Cuota Extra',\n        amount,\n        paid,\n        balance: Math.max(0, amount - paid),\n        legacy: true,\n      }];",
)

old_validation = """      if (selectedExtraAvailableBalance <= 0) {
        setReceiptMsg({ text: 'El saldo disponible ya está cubierto por pagos o comprobantes en revisión.', type: 'error' });
        return;
      }
      if (declaredAmount > selectedExtraAvailableBalance + 0.009) {
        setReceiptMsg({ text: `El monto excede el saldo disponible de $${selectedExtraAvailableBalance.toFixed(2)}.`, type: 'error' });
        return;
      }
"""
if old_validation in payments:
    payments = payments.replace(old_validation, "")

payments = payments.replace(
    "                  max={receiptType === 'concepto_adicional' && selectedExtraFeeOption ? selectedExtraAvailableBalance : undefined}\n",
    "",
)
payments = payments.replace(
    "✅ No tienes cuotas extras con saldo pendiente.",
    "✅ No tienes cuotas extras disponibles.",
)
payments = payments.replace(
    "Selecciona una cuota pendiente...",
    "Selecciona una cuota...",
)
payments = payments.replace(
    "                          ⏳ Hay ${pendingReportedForSelectedExtra.toFixed(2)} en comprobantes pendientes de revisión. Disponible para reportar ahora: ${selectedExtraAvailableBalance.toFixed(2)}.",
    "                          ⏳ Hay ${pendingReportedForSelectedExtra.toFixed(2)} en comprobantes pendientes de revisión. Reporta siempre el monto real transferido, aunque supere la meta.",
)
payments = payments.replace(
    ": ' Al ser aprobado, el monto se sumará únicamente a la cuota extra seleccionada; podrás subir otro comprobante por el saldo restante.'}",
    ": ' Al aprobarse se aplicará únicamente a la cuota extra seleccionada hasta cubrir su deuda; cualquier diferencia quedará registrada como excedente del mismo concepto.'}",
)
write('components/Payments.tsx', payments)


# -----------------------------------------------------------------------------
# services/api.ts — admin can create transaction receipts; approvals keep
# declared amount, apply only real debt, and preserve the difference as excess.
# -----------------------------------------------------------------------------
api = read('services/api.ts')

if 'createAdminPaymentReceipt: async' not in api:
    marker = "  getPaymentReceipts: async (groupId: string): Promise<PaymentReceipt[]> => {"
    admin_method = r'''  /** Admin registra una transacción/evidencia para cualquier miembro sin perder el monto real. */
  createAdminPaymentReceipt: async (
    imageFiles: File[],
    receipt: Omit<PaymentReceipt, 'id' | 'status' | 'submittedAt'>,
    reviewerUid: string,
    alreadyIncluded: boolean = false
  ): Promise<string> => {
    if (!receipt.groupId) throw new Error('Sin grupo asignado.');
    if (!receipt.userId) throw new Error('Selecciona un miembro.');

    const ref = doc(collection(db, 'groups', receipt.groupId, 'paymentReceipts'));
    const files = Array.isArray(imageFiles) ? imageFiles : [];
    const uploadedUrls = await Promise.all(files.map(async (file, i) => {
      const ext = file.type === 'application/pdf' ? 'pdf' : 'jpg';
      const imgRef = storageRef(storage, `groups/${receipt.groupId}/receipts/${ref.id}_${i}.${ext}`);
      await uploadBytes(imgRef, file);
      return getDownloadURL(imgRef);
    }));

    const amount = Math.max(0, Number(receipt.amount) || 0);
    const now = new Date().toISOString();
    const directApproval = alreadyIncluded || amount <= 0;
    const raw: PaymentReceipt = {
      ...receipt,
      id: ref.id,
      amount,
      receiptImageUrl: uploadedUrls[0] || '',
      receiptImageUrls: uploadedUrls,
      status: directApproval ? 'approved' : 'pending',
      submittedAt: now,
      ...(directApproval ? {
        reviewedAt: now,
        reviewedBy: reviewerUid,
        appliedAmount: alreadyIncluded ? amount : 0,
        unappliedAmount: 0,
        ...(alreadyIncluded ? { ledgerIncluded: true } : {}),
      } : {}),
    };
    const cleanData = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined));
    await setDoc(ref, cleanData);

    if (!directApproval) {
      try {
        await dataService.approvePaymentReceipt(raw, reviewerUid);
      } catch (error) {
        await deleteDoc(ref).catch(() => {});
        throw error;
      }
    }
    return ref.id;
  },

'''
    if marker not in api:
        raise RuntimeError('api createAdminPaymentReceipt insertion marker not found')
    api = api.replace(marker, admin_method + marker, 1)

# Paid extra may already be covered; additional real contributions are valid evidence.
api = api.replace(
    "        if (balance <= 0) {\n          throw new Error('Esta cuota extra ya está pagada al 100%.');\n        }\n\n        appliedAmount = Math.min(declaredAmount, balance);",
    "        appliedAmount = Math.min(declaredAmount, balance);",
    1,
)
api = api.replace(
    "        if (balance <= 0) throw new Error('Esta cuota extra ya está pagada al 100%.');\n        appliedAmount = Math.min(declaredAmount, balance);",
    "        appliedAmount = Math.min(declaredAmount, balance);",
    1,
)

# Preserve the actual proof amount and its unapplied/excess difference.
old_approval_update = """    await updateDoc(receiptRef, {
      status: 'approved',
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewerUid,
      appliedAmount,
      ...(currentReceipt.extraFeeId ? { extraFeeId: currentReceipt.extraFeeId } : {}),
      ...(currentReceipt.extraFeePeriod ? { extraFeePeriod: currentReceipt.extraFeePeriod } : {}),
    });"""
new_approval_update = """    const declaredReceiptAmount = Math.max(0, Number(currentReceipt.amount) || 0);
    const unappliedAmount = Math.max(0, declaredReceiptAmount - appliedAmount);
    await updateDoc(receiptRef, {
      status: 'approved',
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewerUid,
      appliedAmount,
      unappliedAmount,
      ...(currentReceipt.extraFeeId ? { extraFeeId: currentReceipt.extraFeeId } : {}),
      ...(currentReceipt.extraFeePeriod ? { extraFeePeriod: currentReceipt.extraFeePeriod } : {}),
    });"""
if old_approval_update in api:
    api = api.replace(old_approval_update, new_approval_update, 1)
elif 'const unappliedAmount = Math.max(0, declaredReceiptAmount - appliedAmount);' not in api:
    raise RuntimeError('api final approval update marker not found')

api = api.replace(
    "        ? `tu pago de \"${currentReceipt.conceptDescription || 'cuota extra'}\" por $${appliedAmount.toFixed(2)}`",
    "        ? `tu comprobante de \"${currentReceipt.conceptDescription || 'cuota extra'}\" por $${Number(currentReceipt.amount || 0).toFixed(2)} (aplicado $${appliedAmount.toFixed(2)})`",
)
write('services/api.ts', api)


# -----------------------------------------------------------------------------
# firestore.rules — admins can create receipts for another member.
# -----------------------------------------------------------------------------
rules = read('firestore.rules')
rules = rules.replace(
    "        allow create: if isSignedIn() &&\n                         request.resource.data.userId == request.auth.uid;",
    "        allow create: if isSignedIn() &&\n                         (request.resource.data.userId == request.auth.uid || isAdminOrMaster());",
)
write('firestore.rules', rules)


# -----------------------------------------------------------------------------
# Admin.tsx — preserve ALL existing matrix filters/buttons. Add only:
# - Estado / Montos / Detalle selector
# - actual contributed + excess (without capping to debt)
# - receipt count per cell
# - transaction/evidence modal from Matrix and Gestión de Miembros
# -----------------------------------------------------------------------------
admin = read('components/Admin.tsx')

if "from './AdminPaymentEvidenceModal'" not in admin:
    admin = replace_once(
        admin,
        "import { useReadOnly } from '../contexts/ReadOnlyContext';\n",
        "import { useReadOnly } from '../contexts/ReadOnlyContext';\nimport AdminPaymentEvidenceModal, { type AdminPaymentEvidenceContext } from './AdminPaymentEvidenceModal';\n",
        'Admin evidence modal import'
    )

if 'matrixViewModeAudit' not in admin:
    admin = replace_once(
        admin,
        "  const [reconcilingMatrixConcept, setReconcilingMatrixConcept] = useState(false);\n",
        "  const [reconcilingMatrixConcept, setReconcilingMatrixConcept] = useState(false);\n  const [matrixViewModeAudit, setMatrixViewModeAudit] = useState<'status' | 'amount' | 'detail'>('amount');\n  const [paymentEvidenceContext, setPaymentEvidenceContext] = useState<AdminPaymentEvidenceContext | null>(null);\n",
        'Admin matrix audit states'
    )

if 'const getMatrixCellAudit' not in admin:
    helper_marker = "  const normalizeConcept = (value?: string) => (value || '').trim().toLocaleLowerCase('es-MX');\n"
    helper = r'''
  const getReceiptsForMatrixCellAudit = (uid: string, period: string): PaymentReceipt[] => {
      return (paymentReceipts as PaymentReceipt[]).filter(receipt => {
          if (receipt.userId !== uid) return false;
          const periods = receipt.extraFeePeriod ? [receipt.extraFeePeriod] : (receipt.periods || []);
          if (!periods.includes(period)) return false;
          if (matrixFilter === 'regular') return receipt.receiptType === 'cuota_mensual';
          if (matrixFilter === 'extra' && matrixExtraDesc) {
              if (receipt.receiptType !== 'concepto_adicional') return false;
              return normalizeConcept(receipt.conceptDescription) === normalizeConcept(matrixExtraDesc);
          }
          return true;
      }).sort((a, b) => (b.transferDate || b.submittedAt || '').localeCompare(a.transferDate || a.submittedAt || ''));
  };

  const getMatrixCellAudit = (uid: string, period: string) => {
      const payment = (allUserLedgers[uid] || []).find(item => item.period === period);
      const receipts = getReceiptsForMatrixCellAudit(uid, period);
      const receiptExcess = receipts
          .filter(receipt => receipt.status === 'approved' && !receipt.ledgerIncluded && receipt.appliedAmount !== undefined)
          .reduce((sum, receipt) => sum + Math.max(0, Number(receipt.amount || 0) - Number(receipt.appliedAmount || 0)), 0);

      if (!payment) return { billed: 0, appliedPaid: 0, actualPaid: receiptExcess, pending: 0, excess: receiptExcess, status: 'Sin cuota', receipts };

      if (matrixFilter === 'regular') {
          const billed = Math.max(0, Number(payment.amount) || 0);
          const appliedPaid = Math.max(0, Number(payment.paidRegular ?? payment.paid ?? 0));
          const actualPaid = appliedPaid + receiptExcess;
          const pending = Math.max(0, billed - appliedPaid);
          return { billed, appliedPaid, actualPaid, pending, excess: Math.max(0, actualPaid - billed), status: pending <= 0 ? 'Pagado' : appliedPaid > 0 ? 'Parcial' : 'Pendiente', receipts };
      }

      if (matrixFilter === 'extra' && matrixExtraDesc) {
          const fee = payment.extraFees?.find(item => normalizeConcept(item.description) === normalizeConcept(matrixExtraDesc));
          if (fee) {
              const billed = Math.max(0, Number(fee.amount) || 0);
              const appliedPaid = Math.max(0, Number(fee.paid) || 0);
              const actualPaid = appliedPaid + receiptExcess;
              const pending = fee.forgiven ? 0 : Math.max(0, billed - appliedPaid);
              return { billed, appliedPaid, actualPaid, pending, excess: Math.max(0, actualPaid - billed), status: fee.forgiven ? 'Perdonado' : pending <= 0 ? 'Pagado' : appliedPaid > 0 ? 'Parcial' : 'Pendiente', receipts };
          }
          const legacyMatch = !payment.extraFees?.length && Number(payment.extraAmount) > 0 && normalizeConcept(payment.extraDescription || 'Cuota Extra') === normalizeConcept(matrixExtraDesc);
          if (!legacyMatch) return { billed: 0, appliedPaid: 0, actualPaid: receiptExcess, pending: 0, excess: receiptExcess, status: 'Sin cuota', receipts };
          const billed = Math.max(0, Number(payment.extraAmount) || 0);
          const appliedPaid = Math.max(0, Number(payment.paidExtra) || 0);
          const actualPaid = appliedPaid + receiptExcess;
          const pending = Math.max(0, billed - appliedPaid);
          return { billed, appliedPaid, actualPaid, pending, excess: Math.max(0, actualPaid - billed), status: pending <= 0 ? 'Pagado' : appliedPaid > 0 ? 'Parcial' : 'Pendiente', receipts };
      }

      const fees = payment.extraFees || [];
      const regularBilled = Math.max(0, Number(payment.amount) || 0);
      const regularPaid = Math.max(0, Number(payment.paidRegular ?? payment.paid ?? 0));
      const extraBilled = fees.length ? fees.reduce((sum, fee) => sum + Math.max(0, Number(fee.amount) || 0), 0) : Math.max(0, Number(payment.extraAmount) || 0);
      const extraPaid = fees.length ? fees.reduce((sum, fee) => sum + Math.max(0, Number(fee.paid) || 0), 0) : Math.max(0, Number(payment.paidExtra) || 0);
      const pending = Math.max(0, regularBilled - regularPaid) + (fees.length
          ? fees.reduce((sum, fee) => sum + (fee.forgiven ? 0 : Math.max(0, Number(fee.amount || 0) - Number(fee.paid || 0))), 0)
          : Math.max(0, extraBilled - extraPaid));
      const billed = regularBilled + extraBilled;
      const appliedPaid = regularPaid + extraPaid;
      const actualPaid = appliedPaid + receiptExcess;
      return { billed, appliedPaid, actualPaid, pending, excess: Math.max(0, actualPaid - billed), status: pending <= 0 ? 'Pagado' : appliedPaid > 0 ? 'Parcial' : 'Pendiente', receipts };
  };

  const openPaymentEvidenceAudit = (uid: string, userName: string, payment: Payment, feeType: 'regular' | 'extra', feeId?: string, concept?: string) => {
      if (feeType === 'regular') {
          setPaymentEvidenceContext({
              userId: uid,
              userName,
              period: payment.period,
              feeType: 'regular',
              concept: 'Cuota mensual',
              targetAmount: Number(payment.amount) || 0,
              ledgerPaid: Number(payment.paidRegular ?? payment.paid ?? 0) || 0,
          });
          return;
      }
      const fee = payment.extraFees?.find(item => feeId ? item.id === feeId : normalizeConcept(item.description) === normalizeConcept(concept));
      const legacy = !payment.extraFees?.length && Number(payment.extraAmount) > 0;
      setPaymentEvidenceContext({
          userId: uid,
          userName,
          period: payment.period,
          feeType: 'extra',
          feeId: fee?.id || (legacy ? 'legacy' : feeId),
          concept: fee?.description || payment.extraDescription || concept || 'Cuota Extra',
          targetAmount: Number(fee?.amount ?? payment.extraAmount ?? 0) || 0,
          ledgerPaid: Number(fee?.paid ?? payment.paidExtra ?? 0) || 0,
      });
  };

  const refreshPaymentEvidenceAudit = async () => {
      await Promise.all([loadPaymentReceipts(), loadAllLedgers(), loadUsers(), loadTreasury(), loadDashboardStats()]);
      if (editingUserLedger) setEditPayments(await dataService.getPayments(editingUserLedger));
  };
'''
    if helper_marker not in admin:
        raise RuntimeError('Admin helper marker not found')
    admin = admin.replace(helper_marker, helper_marker + helper, 1)

# Always refresh receipts when opening member ledger details.
admin = admin.replace(
    "      setEditPayments(payments);\n      setEditingUserLedger(uid);\n  };\n  const handleSavePaymentRow",
    "      setEditPayments(payments);\n      setEditingUserLedger(uid);\n      await loadPaymentReceipts();\n  };\n  const handleSavePaymentRow",
    1,
)

# Add view selector without replacing the existing filter bar or table.
if 'Vista de cada cuadro' not in admin:
    selector_marker = "                    {/* ── PANEL: Cuota Extra Masiva ── */}"
    selector = '''                    <div className="mb-4 rounded-lg border border-logia-700 bg-logia-900/60 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold uppercase text-gray-400 mr-1">Vista de cada cuadro</span>
                            <button onClick={() => setMatrixViewModeAudit('status')} className={`px-3 py-1.5 rounded text-xs font-bold border ${matrixViewModeAudit === 'status' ? 'bg-indigo-700 border-indigo-500 text-white' : 'bg-logia-800 border-logia-700 text-gray-300'}`}>✓ Estado</button>
                            <button onClick={() => setMatrixViewModeAudit('amount')} className={`px-3 py-1.5 rounded text-xs font-bold border ${matrixViewModeAudit === 'amount' ? 'bg-green-700 border-green-500 text-white' : 'bg-logia-800 border-logia-700 text-gray-300'}`}>$ Montos</button>
                            <button onClick={() => setMatrixViewModeAudit('detail')} className={`px-3 py-1.5 rounded text-xs font-bold border ${matrixViewModeAudit === 'detail' ? 'bg-purple-700 border-purple-500 text-white' : 'bg-logia-800 border-logia-700 text-gray-300'}`}>▦ Detalle</button>
                            <span className="text-[11px] text-gray-500">El excedente se muestra aparte y nunca reduce la deuda por debajo de $0.</span>
                        </div>
                    </div>

'''
    if selector_marker not in admin:
        raise RuntimeError('Admin matrix selector marker not found')
    admin = admin.replace(selector_marker, selector + selector_marker, 1)

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
new_cell = '''                                            const matrixAudit = getMatrixCellAudit(u.uid, period);
                                            const selectedExtraFeeAudit = matrixFilter === 'extra' && matrixExtraDesc
                                                ? paymentData?.extraFees?.find(fee => normalizeConcept(fee.description) === normalizeConcept(matrixExtraDesc))
                                                : undefined;
                                            const selectedLegacyAudit = matrixFilter === 'extra' && matrixExtraDesc && !paymentData?.extraFees?.length && Number(paymentData?.extraAmount || 0) > 0 &&
                                                normalizeConcept(paymentData?.extraDescription || 'Cuota Extra') === normalizeConcept(matrixExtraDesc);
                                            const openEvidence = () => {
                                                if (!paymentData) return;
                                                if (matrixFilter === 'extra' && matrixExtraDesc && (selectedExtraFeeAudit || selectedLegacyAudit)) {
                                                    openPaymentEvidenceAudit(u.uid, u.name, paymentData, 'extra', selectedExtraFeeAudit?.id || (selectedLegacyAudit ? 'legacy' : undefined), matrixExtraDesc);
                                                } else {
                                                    openPaymentEvidenceAudit(u.uid, u.name, paymentData, 'regular');
                                                }
                                            };
                                            return (
                                                <td 
                                                    key={idx} 
                                                    className={`p-2 text-center border border-logia-700 transition-colors min-w-[92px] ${cellClass}`}
                                                    onClick={() => {
                                                        if (!paymentData) return;
                                                        if (matrixFilter === 'extra' && matrixExtraDesc && (selectedExtraFeeAudit || selectedLegacyAudit)) openEvidence();
                                                        else handleOpenMatrixModal(u.uid, u.name, period);
                                                    }}
                                                    title={`${cellTitle} · Aportado real $${matrixAudit.actualPaid.toFixed(2)} · Deuda $${matrixAudit.pending.toFixed(2)}${matrixAudit.excess > 0 ? ` · Excedente $${matrixAudit.excess.toFixed(2)}` : ''}`}
                                                >
                                                    {matrixViewModeAudit === 'status' ? (
                                                        <div className="font-bold text-base">{cellText}</div>
                                                    ) : matrixViewModeAudit === 'amount' ? (
                                                        <div className="leading-tight">
                                                            <div className="font-bold">${matrixAudit.actualPaid.toFixed(0)}</div>
                                                            <div className="text-[9px] opacity-80">deuda ${matrixAudit.pending.toFixed(0)}</div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-[9px] leading-tight text-left">
                                                            <div>Cargo <strong>${matrixAudit.billed.toFixed(0)}</strong></div>
                                                            <div>Aportó <strong>${matrixAudit.actualPaid.toFixed(0)}</strong></div>
                                                            <div>Deuda <strong>${matrixAudit.pending.toFixed(0)}</strong></div>
                                                        </div>
                                                    )}
                                                    {matrixAudit.excess > 0 && <div className="text-[9px] text-orange-200 font-bold mt-1">Extra +${matrixAudit.excess.toFixed(0)}</div>}
                                                    {matrixAudit.receipts.length > 0 && (
                                                        <button type="button" onClick={event => { event.stopPropagation(); openEvidence(); }} className="mt-1 text-[9px] bg-black/20 hover:bg-black/30 rounded px-1.5 py-0.5" title="Ver comprobantes y transacciones">
                                                            🧾 {matrixAudit.receipts.length}
                                                        </button>
                                                    )}
                                                </td>
                                            );'''
if old_cell in admin:
    admin = admin.replace(old_cell, new_cell, 1)
elif 'const matrixAudit = getMatrixCellAudit' not in admin:
    raise RuntimeError('Admin matrix cell marker not found')

# Add transaction/evidence button to regular monthly row in Gestión de Miembros.
regular_button_marker = '''                                     <div className="flex gap-1 mt-3 md:mt-0">
                                         <button 
                                            onClick={() => handleSavePaymentRow(p)}'''
if 'Abonos, fechas y comprobantes de la cuota mensual' not in admin:
    regular_button_replacement = '''                                     <div className="flex gap-1 mt-3 md:mt-0">
                                         <button
                                            onClick={() => editingUserLedger && openPaymentEvidenceAudit(editingUserLedger, users.find(item => item.uid === editingUserLedger)?.name || 'Miembro', p, 'regular')}
                                            className="bg-indigo-700 hover:bg-indigo-600 text-white p-1 rounded text-xs px-2 h-8 flex items-center"
                                            title="Abonos, fechas y comprobantes de la cuota mensual"
                                         >🧾</button>
                                         <button 
                                            onClick={() => handleSavePaymentRow(p)}'''
    if regular_button_marker not in admin:
        raise RuntimeError('Admin regular transaction button marker not found')
    admin = admin.replace(regular_button_marker, regular_button_replacement, 1)

# Add transaction/evidence button to every individual extra fee.
extra_button_marker = '''                                                             <div className="flex gap-1">
                                                                 <button
                                                                     onClick={() => handleEditIndividualExtraFee(p.period, fee.id, fee.description, fee.amount)}'''
if 'Abonos, fechas, comentarios y comprobantes' not in admin:
    extra_button_replacement = '''                                                             <div className="flex gap-1">
                                                                 <button
                                                                     onClick={() => editingUserLedger && openPaymentEvidenceAudit(editingUserLedger, users.find(item => item.uid === editingUserLedger)?.name || 'Miembro', p, 'extra', fee.id, fee.description)}
                                                                     className="bg-purple-700 hover:bg-purple-600 text-white p-1 rounded text-xs"
                                                                     title="Abonos, fechas, comentarios y comprobantes"
                                                                 >🧾</button>
                                                                 <button
                                                                     onClick={() => handleEditIndividualExtraFee(p.period, fee.id, fee.description, fee.amount)}'''
    if extra_button_marker not in admin:
        raise RuntimeError('Admin extra transaction button marker not found')
    admin = admin.replace(extra_button_marker, extra_button_replacement, 1)

# Render additive modal before the existing reject receipt modal.
if '{paymentEvidenceContext && (' not in admin:
    modal_marker = '      {/* REJECT RECEIPT MODAL */}'
    modal = '''      {paymentEvidenceContext && (
        <AdminPaymentEvidenceModal
          groupId={user.groupId}
          adminUid={user.uid}
          context={paymentEvidenceContext}
          receipts={paymentReceipts as PaymentReceipt[]}
          readOnly={isReadOnly}
          onClose={() => setPaymentEvidenceContext(null)}
          onChanged={refreshPaymentEvidenceAudit}
        />
      )}

'''
    if modal_marker not in admin:
        raise RuntimeError('Admin modal insertion marker not found')
    admin = admin.replace(modal_marker, modal + modal_marker, 1)

write('components/Admin.tsx', admin)
print('✓ Targeted payment evidence: preserved matrix filters, restored amount/detail views, added excess + transaction evidence')
