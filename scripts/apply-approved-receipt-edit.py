from pathlib import Path

root = Path(__file__).resolve().parents[1]
api_path = root / 'services' / 'api.ts'
admin_path = root / 'components' / 'Admin.tsx'

api = api_path.read_text()
admin = admin_path.read_text()

old_api = '''  /** Admin edita un comprobante antes de aprobarlo */
  updatePaymentReceipt: async (
    groupId: string,
    receiptId: string,
    updates: Partial<PaymentReceipt>
  ): Promise<void> => {
    const ref = doc(db, "groups", groupId, "paymentReceipts", receiptId);
    // Only allow updating these fields
    const allowed: (keyof PaymentReceipt)[] = ['periods', 'amount', 'receiptType', 'conceptDescription', 'transferDate'];
    const clean = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k as keyof PaymentReceipt) && updates[k as keyof PaymentReceipt] !== undefined)
    );
    await updateDoc(ref, clean);
  },
'''

new_api = '''  /**
   * Admin edita un comprobante.
   * - Pendiente/rechazado: puede corregir los campos normales.
   * - Aprobado de cuota extra: permite corregir el monto y recalcula automáticamente
   *   appliedAmount + ledger usando TODOS los comprobantes aprobados de esa cuota.
   * - Aprobado mensual: permite corregir metadatos, pero no el monto porque no se guarda
   *   el desglose exacto por período de aprobaciones históricas.
   */
  updatePaymentReceipt: async (
    groupId: string,
    receiptId: string,
    updates: Partial<PaymentReceipt>
  ): Promise<void> => {
    const ref = doc(db, "groups", groupId, "paymentReceipts", receiptId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('El comprobante ya no existe.');

    const current = { id: snap.id, ...snap.data() } as PaymentReceipt;
    const allowed: (keyof PaymentReceipt)[] = ['periods', 'amount', 'receiptType', 'conceptDescription', 'transferDate'];
    const clean = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k as keyof PaymentReceipt) && updates[k as keyof PaymentReceipt] !== undefined)
    ) as Partial<PaymentReceipt>;

    // Pending/rejected records have not credited the ledger, so a normal edit is safe.
    if (current.status !== 'approved') {
      await updateDoc(ref, clean);
      return;
    }

    const normalize = (value?: string) => (value || '').trim().toLocaleLowerCase('es-MX');

    // An approved monthly receipt cannot safely have its amount redistributed without
    // a historical per-period allocation. Metadata edits are still allowed.
    if (current.receiptType !== 'concepto_adicional') {
      if (clean.amount !== undefined && Number(clean.amount) !== Number(current.amount || 0)) {
        throw new Error('Para un comprobante mensual ya aprobado, corrige el pago desde Gestión de Pagos. El histórico no puede redistribuir ese monto con seguridad.');
      }
      const metadataOnly: Partial<PaymentReceipt> = {};
      if (clean.transferDate !== undefined) metadataOnly.transferDate = clean.transferDate;
      if (Object.keys(metadataOnly).length > 0) await updateDoc(ref, metadataOnly);
      return;
    }

    // Once an extra-fee receipt is approved, keep its accounting target fixed.
    if (clean.receiptType && clean.receiptType !== current.receiptType) {
      throw new Error('No puedes cambiar el tipo de un comprobante ya aprobado.');
    }
    if (clean.conceptDescription !== undefined && normalize(clean.conceptDescription) !== normalize(current.conceptDescription)) {
      throw new Error('No puedes cambiar el concepto de un comprobante ya aprobado. Corrige solo el monto.');
    }

    const targetPeriod = current.extraFeePeriod || current.periods?.[0];
    if (!targetPeriod) throw new Error('El comprobante aprobado no tiene período de cuota extra asociado.');
    if (clean.periods?.length && !clean.periods.includes(targetPeriod)) {
      throw new Error('No puedes mover a otro período un comprobante ya aprobado.');
    }

    const correctedAmount = clean.amount !== undefined ? Number(clean.amount) : Number(current.amount || 0);
    if (!Number.isFinite(correctedAmount) || correctedAmount <= 0) {
      throw new Error('El monto corregido debe ser mayor a cero.');
    }

    // Save the corrected receipt value first so the recalculation reads the new truth.
    await updateDoc(ref, {
      amount: correctedAmount,
      ...(clean.transferDate !== undefined ? { transferDate: clean.transferDate } : {})
    });

    const ledgerRef = doc(db, 'users', current.userId, 'ledger', targetPeriod);
    const ledgerSnap = await getDoc(ledgerRef);
    if (!ledgerSnap.exists()) throw new Error(`No existe el ledger ${targetPeriod} del miembro.`);
    const payment = ledgerSnap.data() as Payment;
    const fees: IndividualExtraFee[] = Array.isArray(payment.extraFees)
      ? payment.extraFees.map(f => ({ ...f, amount: Number(f.amount) || 0, paid: Number(f.paid) || 0 }))
      : [];

    let feeIndex = current.extraFeeId && current.extraFeeId !== 'legacy'
      ? fees.findIndex(f => f.id === current.extraFeeId)
      : -1;
    if (feeIndex < 0 && current.conceptDescription) {
      feeIndex = fees.findIndex(f => normalize(f.description) === normalize(current.conceptDescription));
    }

    const allReceipts = await dataService.getPaymentReceipts(groupId);
    const correctedReceipts = allReceipts
      .map(r => r.id === receiptId ? { ...r, amount: correctedAmount } : r)
      .filter(r => {
        if (r.status !== 'approved' || r.userId !== current.userId || r.receiptType !== 'concepto_adicional') return false;
        const samePeriod = (r.extraFeePeriod || r.periods?.[0]) === targetPeriod;
        if (!samePeriod) return false;
        if (feeIndex >= 0 && r.extraFeeId && r.extraFeeId !== 'legacy') return r.extraFeeId === fees[feeIndex].id;
        return normalize(r.conceptDescription) === normalize(current.conceptDescription);
      })
      .sort((a, b) => (a.reviewedAt || a.submittedAt).localeCompare(b.reviewedAt || b.submittedAt));

    const regularAmount = Number(payment.amount) || 0;
    const paidRegular = payment.paidRegular !== undefined
      ? Number(payment.paidRegular) || 0
      : Math.min(Number(payment.paid) || 0, regularAmount);
    const regularCovered = !!payment.regularCovered || paidRegular >= regularAmount;
    const correctionDate = new Date().toISOString().split('T')[0];

    const applyReceiptsAgainstCap = async (cap: number): Promise<number> => {
      let remaining = Math.max(0, cap);
      let totalApplied = 0;
      for (const r of correctedReceipts) {
        const declared = Math.max(0, Number(r.amount) || 0);
        const applied = Math.min(declared, remaining);
        remaining -= applied;
        totalApplied += applied;
        if (Number(r.appliedAmount ?? -1) !== applied) {
          await updateDoc(doc(db, 'groups', groupId, 'paymentReceipts', r.id), { appliedAmount: applied });
        }
      }
      return totalApplied;
    };

    if (feeIndex >= 0) {
      const targetFee = fees[feeIndex];
      const totalApplied = await applyReceiptsAgainstCap(targetFee.amount);
      fees[feeIndex] = { ...targetFee, paid: totalApplied };

      const totalExtraAmount = fees.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0);
      const totalExtraPaid = fees.reduce((sum, fee) => sum + (Number(fee.paid) || 0), 0);
      const extraCovered = fees.every(fee => !!fee.forgiven || (Number(fee.paid) || 0) >= (Number(fee.amount) || 0));
      const status: Payment['status'] = regularCovered && extraCovered
        ? 'Pagado'
        : (paidRegular > 0 || totalExtraPaid > 0) ? 'Parcial' : 'Pendiente';

      await updateDoc(ledgerRef, {
        extraFees: fees,
        extraAmount: totalExtraAmount,
        paidExtra: totalExtraPaid,
        paidRegular,
        paid: paidRegular + totalExtraPaid,
        regularCovered,
        extraCovered,
        status,
        comments: payment.comments
          ? `${payment.comments} | Corrección comprobante ${receiptId}: $${correctedAmount.toFixed(2)} (${correctionDate})`
          : `Corrección comprobante ${receiptId}: $${correctedAmount.toFixed(2)} (${correctionDate})`
      });
    } else {
      // Legacy extraAmount/extraDescription.
      const legacyCap = Number(payment.extraAmount) || 0;
      if (legacyCap <= 0) throw new Error('No se encontró la cuota extra asociada al comprobante aprobado.');
      const totalApplied = await applyReceiptsAgainstCap(legacyCap);
      const extraCovered = totalApplied >= legacyCap;
      const status: Payment['status'] = regularCovered && extraCovered
        ? 'Pagado'
        : (paidRegular > 0 || totalApplied > 0) ? 'Parcial' : 'Pendiente';

      await updateDoc(ledgerRef, {
        paidExtra: totalApplied,
        paidRegular,
        paid: paidRegular + totalApplied,
        regularCovered,
        extraCovered,
        status,
        comments: payment.comments
          ? `${payment.comments} | Corrección comprobante ${receiptId}: $${correctedAmount.toFixed(2)} (${correctionDate})`
          : `Corrección comprobante ${receiptId}: $${correctedAmount.toFixed(2)} (${correctionDate})`
      });
    }
  },
'''

if old_api not in api:
    raise SystemExit('API target block not found')
api = api.replace(old_api, new_api, 1)

old_save = '''  const saveReceiptEdit = async (receipt: any) => {
    setSavingReceiptEdit(true);
    try {
      await dataService.updatePaymentReceipt(receipt.groupId || user.groupId, receipt.id, {
        periods: editReceiptPeriods,
        amount: editReceiptAmount !== '' ? Number(editReceiptAmount) : undefined,
        receiptType: editReceiptType,
        conceptDescription: editReceiptType === 'concepto_adicional' ? editReceiptConcept : undefined,
      });
      cancelEditingReceipt();
      loadPaymentReceipts();
    } catch (e) {
      console.error("Error saving receipt edit", e);
    } finally {
      setSavingReceiptEdit(false);
    }
  };
'''

new_save = '''  const saveReceiptEdit = async (receipt: any) => {
    setSavingReceiptEdit(true);
    try {
      await dataService.updatePaymentReceipt(receipt.groupId || user.groupId, receipt.id, {
        periods: editReceiptPeriods,
        amount: editReceiptAmount !== '' ? Number(editReceiptAmount) : undefined,
        receiptType: editReceiptType,
        conceptDescription: editReceiptType === 'concepto_adicional' ? editReceiptConcept : undefined,
      });
      cancelEditingReceipt();
      await Promise.all([loadPaymentReceipts(), loadAllLedgers(), loadUsers()]);
      showMessage(
        receipt.status === 'approved'
          ? '✅ Comprobante aprobado corregido. El monto aplicado y el saldo fueron recalculados.'
          : '✅ Comprobante actualizado.',
        'success'
      );
    } catch (e: any) {
      console.error("Error saving receipt edit", e);
      showMessage(`Error al editar comprobante: ${e?.message || e}`, 'error');
    } finally {
      setSavingReceiptEdit(false);
    }
  };
'''

if old_save not in admin:
    raise SystemExit('Admin save block not found')
admin = admin.replace(old_save, new_save, 1)

admin = admin.replace('// Edit receipt before approving', '// Edit payment receipt (pending, rejected, or approved extra-fee correction)', 1)

old_form_title = '''                              <p className="text-yellow-300 font-bold text-sm">✏️ Editando comprobante</p>
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">Tipo</label>'''
new_form_title = '''                              <p className="text-yellow-300 font-bold text-sm">✏️ Editando comprobante</p>
                              {receipt.status === 'approved' && (
                                <div className="bg-blue-900/30 border border-blue-700/50 rounded p-2 text-xs text-blue-200">
                                  🔒 Ya está aprobado. El destino contable (tipo, concepto y período) queda bloqueado. Si corriges el monto de una cuota extra, se recalculará automáticamente el saldo y todos los montos aplicados de esa cuota.
                                </div>
                              )}
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">Tipo</label>'''
if old_form_title not in admin:
    raise SystemExit('Form title target not found')
admin = admin.replace(old_form_title, new_form_title, 1)

admin = admin.replace(
'''                                    <input type="radio" checked={editReceiptType === 'cuota_mensual'}
                                      onChange={() => setEditReceiptType('cuota_mensual')} className="accent-yellow-400" />''',
'''                                    <input type="radio" checked={editReceiptType === 'cuota_mensual'}
                                      disabled={receipt.status === 'approved'}
                                      onChange={() => setEditReceiptType('cuota_mensual')} className="accent-yellow-400 disabled:opacity-50" />''', 1)
admin = admin.replace(
'''                                    <input type="radio" checked={editReceiptType === 'concepto_adicional'}
                                      onChange={() => setEditReceiptType('concepto_adicional')} className="accent-yellow-400" />''',
'''                                    <input type="radio" checked={editReceiptType === 'concepto_adicional'}
                                      disabled={receipt.status === 'approved'}
                                      onChange={() => setEditReceiptType('concepto_adicional')} className="accent-yellow-400 disabled:opacity-50" />''', 1)
admin = admin.replace(
'''                                  <input type="text" value={editReceiptConcept} onChange={e => setEditReceiptConcept(e.target.value)}
                                    className="w-full bg-logia-800 text-white px-3 py-1 rounded border border-logia-700 text-sm" />''',
'''                                  <input type="text" value={editReceiptConcept} onChange={e => setEditReceiptConcept(e.target.value)}
                                    disabled={receipt.status === 'approved'}
                                    className="w-full bg-logia-800 text-white px-3 py-1 rounded border border-logia-700 text-sm disabled:opacity-60" />''', 1)
admin = admin.replace(
'''                                <input type="text" value={editReceiptPeriods.join(', ')}
                                  onChange={e => setEditReceiptPeriods(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                  className="w-full bg-logia-800 text-white px-3 py-1 rounded border border-logia-700 text-sm" />''',
'''                                <input type="text" value={editReceiptPeriods.join(', ')}
                                  disabled={receipt.status === 'approved'}
                                  onChange={e => setEditReceiptPeriods(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                  className="w-full bg-logia-800 text-white px-3 py-1 rounded border border-logia-700 text-sm disabled:opacity-60" />''', 1)
admin = admin.replace(
'''                                <input type="number" value={editReceiptAmount} onChange={e => setEditReceiptAmount(e.target.value)}
                                  className="w-full bg-logia-800 text-white px-3 py-1 rounded border border-logia-700 text-sm" />''',
'''                                <input type="number" min="0" step="0.01" value={editReceiptAmount} onChange={e => setEditReceiptAmount(e.target.value)}
                                  disabled={receipt.status === 'approved' && receipt.receiptType !== 'concepto_adicional'}
                                  className="w-full bg-logia-800 text-white px-3 py-1 rounded border border-logia-700 text-sm disabled:opacity-60" />
                                {receipt.status === 'approved' && receipt.receiptType === 'cuota_mensual' && (
                                  <p className="text-[11px] text-gray-500 mt-1">Para corregir un monto mensual ya aprobado usa Gestión de Pagos; aquí se evita redistribuir meses históricos accidentalmente.</p>
                                )}''', 1)

old_actions = '''                          {receipt.status === 'pending' && !isReadOnly && (
                            <div className="flex gap-2 pt-1 flex-wrap">
                              {editingReceiptId !== receipt.id && (
                                <button onClick={() => startEditingReceipt(receipt)}
                                  className="bg-yellow-700 hover:bg-yellow-600 text-white text-xs px-4 py-2 rounded font-bold">
                                  ✏️ Editar
                                </button>
                              )}
                              <button onClick={async () => {'''
new_actions = '''                          {!isReadOnly && editingReceiptId !== receipt.id && (
                            <div className="flex gap-2 pt-1 flex-wrap">
                              <button onClick={() => startEditingReceipt(receipt)}
                                className="bg-yellow-700 hover:bg-yellow-600 text-white text-xs px-4 py-2 rounded font-bold">
                                ✏️ Editar registro
                              </button>
                            </div>
                          )}
                          {receipt.status === 'pending' && !isReadOnly && (
                            <div className="flex gap-2 pt-1 flex-wrap">
                              <button onClick={async () => {'''
if old_actions not in admin:
    raise SystemExit('Action target not found')
admin = admin.replace(old_actions, new_actions, 1)

api_path.write_text(api)
admin_path.write_text(admin)
print('Approved receipt editing patch applied.')
