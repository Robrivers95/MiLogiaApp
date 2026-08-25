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


def replace_between(text, start, end, replacement, label):
    i = text.find(start)
    if i < 0:
        raise RuntimeError(f'{label}: start marker not found')
    j = text.find(end, i + len(start))
    if j < 0:
        raise RuntimeError(f'{label}: end marker not found')
    return text[:i] + replacement + text[j:]


def regex_once(text, pattern, replacement, label):
    out, count = re.subn(pattern, lambda _: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 regex match, found {count}')
    return out


# -----------------------------------------------------------------------------
# types.ts — tie receipts to a concrete extra-fee and record amount applied.
# -----------------------------------------------------------------------------
types = read('types.ts')
types = replace_once(
    types,
    "  conceptDescription?: string; // Descripción para \"concepto_adicional\"\n  status: 'pending' | 'approved' | 'rejected';",
    "  conceptDescription?: string; // Descripción para \"concepto_adicional\"\n  extraFeeId?: string;          // ID exacto de la cuota extra seleccionada\n  extraFeePeriod?: string;      // YYYY-MM del ledger donde vive la cuota extra\n  appliedAmount?: number;       // Monto realmente aplicado al saldo al aprobar\n  status: 'pending' | 'approved' | 'rejected';",
    'types PaymentReceipt fields'
)
write('types.ts', types)


# -----------------------------------------------------------------------------
# Payments.tsx — members select the exact outstanding extra fee, can report
# partial payments repeatedly, and cannot silently over-report the balance.
# -----------------------------------------------------------------------------
payments = read('components/Payments.tsx')
payments = replace_once(
    payments,
    "  const [conceptDescription, setConceptDescription] = useState('');\n  const [receiptPeriods, setReceiptPeriods] = useState<string[]>([]);",
    "  const [conceptDescription, setConceptDescription] = useState('');\n  const [selectedExtraFeeId, setSelectedExtraFeeId] = useState('');\n  const [selectedExtraFeePeriod, setSelectedExtraFeePeriod] = useState('');\n  const [receiptPeriods, setReceiptPeriods] = useState<string[]>([]);",
    'Payments selected extra fee state'
)

payments = replace_once(
    payments,
    "  // Multiple receipts per period\n",
    r'''  // Cuotas extra pendientes: el comprobante queda ligado a una cuota exacta.
  const pendingExtraFeeOptions: Array<{
    period: string;
    feeId: string;
    description: string;
    amount: number;
    paid: number;
    balance: number;
    legacy: boolean;
  }> = payments.flatMap(payment => {
    if (payment.extraFees && payment.extraFees.length > 0) {
      return payment.extraFees
        .filter(fee => !fee.forgiven && Number(fee.paid || 0) < Number(fee.amount || 0))
        .map(fee => ({
          period: payment.period,
          feeId: fee.id,
          description: fee.description,
          amount: Number(fee.amount) || 0,
          paid: Number(fee.paid) || 0,
          balance: Math.max(0, (Number(fee.amount) || 0) - (Number(fee.paid) || 0)),
          legacy: false,
        }));
    }
    if (Number(payment.extraAmount) > 0) {
      const paid = Number(payment.paidExtra) || 0;
      const amount = Number(payment.extraAmount) || 0;
      if (paid < amount) {
        return [{
          period: payment.period,
          feeId: 'legacy',
          description: payment.extraDescription || 'Cuota Extra',
          amount,
          paid,
          balance: Math.max(0, amount - paid),
          legacy: true,
        }];
      }
    }
    return [];
  }).sort((a, b) => b.period.localeCompare(a.period) || a.description.localeCompare(b.description));

  const selectedExtraFeeOption = pendingExtraFeeOptions.find(
    option => option.feeId === selectedExtraFeeId && option.period === selectedExtraFeePeriod
  );

  // Evita que dos comprobantes todavía pendientes reporten más que el saldo disponible.
  const pendingReportedForSelectedExtra = selectedExtraFeeOption
    ? receipts
        .filter(r =>
          r.status === 'pending' &&
          r.receiptType === 'concepto_adicional' &&
          (
            (r.extraFeeId && r.extraFeeId === selectedExtraFeeOption.feeId && r.extraFeePeriod === selectedExtraFeeOption.period) ||
            (!r.extraFeeId && r.conceptDescription?.trim().toLowerCase() === selectedExtraFeeOption.description.trim().toLowerCase() && r.periods?.includes(selectedExtraFeeOption.period))
          )
        )
        .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    : 0;

  const selectedExtraAvailableBalance = selectedExtraFeeOption
    ? Math.max(0, selectedExtraFeeOption.balance - pendingReportedForSelectedExtra)
    : 0;

  // Multiple receipts per period
''',
    'Payments pending extra fee options'
)

payments = replace_once(
    payments,
    "    if (receiptType === 'concepto_adicional' && !conceptDescription.trim()) {\n      setReceiptMsg({ text: 'Escribe la descripción del concepto.', type: 'error' });\n      return;\n    }",
    r'''    if (receiptType === 'concepto_adicional') {
      if (!selectedExtraFeeOption) {
        setReceiptMsg({ text: 'Selecciona la cuota extra que estás pagando.', type: 'error' });
        return;
      }
      const declaredAmount = Number(receiptAmount);
      if (!declaredAmount || declaredAmount <= 0) {
        setReceiptMsg({ text: 'Indica el monto exacto transferido para esta cuota extra.', type: 'error' });
        return;
      }
      if (selectedExtraAvailableBalance <= 0) {
        setReceiptMsg({ text: 'El saldo disponible ya está cubierto por pagos o comprobantes en revisión.', type: 'error' });
        return;
      }
      if (declaredAmount > selectedExtraAvailableBalance + 0.009) {
        setReceiptMsg({ text: `El monto excede el saldo disponible de $${selectedExtraAvailableBalance.toFixed(2)}.`, type: 'error' });
        return;
      }
    }''',
    'Payments concept validation'
)

payments = replace_once(
    payments,
    "        conceptDescription: receiptType === 'concepto_adicional' ? conceptDescription.trim() : undefined,\n        status: 'pending',",
    "        conceptDescription: receiptType === 'concepto_adicional' ? conceptDescription.trim() : undefined,\n        extraFeeId: receiptType === 'concepto_adicional' ? selectedExtraFeeId : undefined,\n        extraFeePeriod: receiptType === 'concepto_adicional' ? selectedExtraFeePeriod : undefined,\n        status: 'pending',",
    'Payments submit extra fee identity'
)

payments = replace_once(
    payments,
    "      setConceptDescription('');\n      dataService.getUserPaymentReceipts(user.uid, user.groupId)",
    "      setConceptDescription('');\n      setSelectedExtraFeeId('');\n      setSelectedExtraFeePeriod('');\n      dataService.getUserPaymentReceipts(user.uid, user.groupId)",
    'Payments reset extra selection'
)

payments = replace_once(
    payments,
    "                      onChange={() => { setReceiptType('cuota_mensual'); setReceiptPeriods([]); }} className=\"accent-indigo-500\" />",
    "                      onChange={() => { setReceiptType('cuota_mensual'); setReceiptPeriods([]); setSelectedExtraFeeId(''); setSelectedExtraFeePeriod(''); setConceptDescription(''); }} className=\"accent-indigo-500\" />",
    'Payments monthly radio reset'
)

payments = replace_once(
    payments,
    "                      onChange={() => { setReceiptType('concepto_adicional'); setReceiptPeriods([]); }} className=\"accent-purple-500\" />",
    "                      onChange={() => { setReceiptType('concepto_adicional'); setReceiptPeriods([]); setSelectedExtraFeeId(''); setSelectedExtraFeePeriod(''); setConceptDescription(''); }} className=\"accent-purple-500\" />",
    'Payments extra radio reset'
)

payments = replace_between(
    payments,
    "              {/* Descripción (solo para concepto adicional) */}",
    "              {/* Selección de meses */}",
    r'''              {/* Cuota extra exacta (solo para concepto adicional) */}
              {receiptType === 'concepto_adicional' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase">
                    Cuota extra a pagar <span className="text-red-400">*</span>
                  </label>
                  {pendingExtraFeeOptions.length === 0 ? (
                    <div className="bg-green-900/20 border border-green-600/30 rounded p-3 text-sm text-green-300">
                      ✅ No tienes cuotas extras con saldo pendiente.
                    </div>
                  ) : (
                    <select
                      value={selectedExtraFeeOption ? `${selectedExtraFeePeriod}|||${selectedExtraFeeId}` : ''}
                      onChange={e => {
                        const [period, feeId] = e.target.value.split('|||');
                        const option = pendingExtraFeeOptions.find(o => o.period === period && o.feeId === feeId);
                        if (!option) {
                          setSelectedExtraFeeId('');
                          setSelectedExtraFeePeriod('');
                          setConceptDescription('');
                          setReceiptPeriods([]);
                          return;
                        }
                        setSelectedExtraFeeId(option.feeId);
                        setSelectedExtraFeePeriod(option.period);
                        setConceptDescription(option.description);
                        setReceiptPeriods([option.period]);
                      }}
                      className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                    >
                      <option value="">Selecciona una cuota pendiente...</option>
                      {pendingExtraFeeOptions.map(option => (
                        <option key={`${option.period}-${option.feeId}`} value={`${option.period}|||${option.feeId}`}>
                          {option.description} · {formatPeriod(option.period)} · saldo ${option.balance.toFixed(2)}
                        </option>
                      ))}
                    </select>
                  )}

                  {selectedExtraFeeOption && (
                    <div className="bg-purple-900/20 border border-purple-600/30 rounded p-3 text-xs space-y-1">
                      <p className="text-purple-200 font-bold">{selectedExtraFeeOption.description}</p>
                      <div className="grid grid-cols-3 gap-2">
                        <span className="text-gray-400">Cuota<br/><strong className="text-white">${selectedExtraFeeOption.amount.toFixed(2)}</strong></span>
                        <span className="text-gray-400">Pagado<br/><strong className="text-green-400">${selectedExtraFeeOption.paid.toFixed(2)}</strong></span>
                        <span className="text-gray-400">Pendiente<br/><strong className="text-red-400">${selectedExtraFeeOption.balance.toFixed(2)}</strong></span>
                      </div>
                      {pendingReportedForSelectedExtra > 0 && (
                        <p className="text-yellow-300 pt-1">
                          ⏳ Hay ${pendingReportedForSelectedExtra.toFixed(2)} en comprobantes pendientes de revisión. Disponible para reportar ahora: ${selectedExtraAvailableBalance.toFixed(2)}.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

''',
    'Payments extra fee selector'
)

payments = replace_once(
    payments,
    "                        <input type=\"checkbox\" checked={receiptPeriods.includes(period)} onChange={() => handleTogglePeriod(period)}\n                          className={receiptType === 'cuota_mensual' ? 'accent-green-500' : 'accent-purple-500'} />",
    "                        <input type=\"checkbox\" checked={receiptPeriods.includes(period)} onChange={() => handleTogglePeriod(period)}\n                          disabled={receiptType === 'concepto_adicional'}\n                          className={receiptType === 'cuota_mensual' ? 'accent-green-500' : 'accent-purple-500'} />",
    'Payments disable period editing for linked extras'
)

payments = replace_once(
    payments,
    "                <label className=\"block text-xs font-bold text-gray-400 uppercase mb-2\">Monto transferido (opcional)</label>",
    "                <label className=\"block text-xs font-bold text-gray-400 uppercase mb-2\">\n                  Monto transferido {receiptType === 'concepto_adicional' ? <span className=\"text-red-400\">*</span> : <span className=\"text-gray-500 normal-case font-normal\">(opcional)</span>}\n                </label>",
    'Payments amount label'
)

payments = replace_once(
    payments,
    "                  type=\"number\" min=\"0\" step=\"0.01\"\n                  value={receiptAmount}",
    "                  type=\"number\" min=\"0\" step=\"0.01\"\n                  max={receiptType === 'concepto_adicional' && selectedExtraFeeOption ? selectedExtraAvailableBalance : undefined}\n                  required={receiptType === 'concepto_adicional'}\n                  value={receiptAmount}",
    'Payments amount max required'
)

payments = replace_once(
    payments,
    "                ⚠️ El administrador revisará y aprobará el comprobante. Recibirás una notificación.\n                {receiptType === 'cuota_mensual' && ' Al ser aprobado, tu saldo se actualizará automáticamente.'}",
    "                ⚠️ El administrador revisará y aprobará el comprobante. Recibirás una notificación.\n                {receiptType === 'cuota_mensual'\n                  ? ' Al ser aprobado, tu saldo mensual se actualizará automáticamente.'\n                  : ' Al ser aprobado, el monto se sumará únicamente a la cuota extra seleccionada; podrás subir otro comprobante por el saldo restante.'}",
    'Payments approval help text'
)
write('components/Payments.tsx', payments)


# -----------------------------------------------------------------------------
# services/api.ts — exact extra-fee application, cumulative partial payments,
# accurate stats, numeric normalization, and optional reconciliation for legacy
# receipts that were previously marked as 100% paid.
# -----------------------------------------------------------------------------
api = read('services/api.ts')

api = regex_once(
    api,
    r"  getUserFinancialStats: async \(uid: string, startPeriod\?: string, endPeriod\?: string\) => \{[\s\S]*?\n  \},\n  \n  getGlobalFinancials:",
    r'''  getUserFinancialStats: async (uid: string, startPeriod?: string, endPeriod?: string) => {
    try {
        const q = collection(db, "users", uid, "ledger");
        const snap = await getDocs(q);
        let totalPaid = 0;
        let totalDebt = 0;
        let totalBilled = 0;
        let totalPaidRegular = 0;
        let totalPaidExtra = 0;
        let totalBilledRegular = 0;
        let totalBilledExtra = 0;
        let totalDebtRegular = 0;
        let totalDebtExtra = 0;

        snap.forEach(docSnap => {
            const p = docSnap.data() as Payment;
            if (startPeriod && p.period < startPeriod) return;
            if (endPeriod && p.period > endPeriod) return;

            const regularAmount = Number(p.amount) || 0;
            let paidRegular = 0;
            if (p.paidRegular !== undefined) {
                paidRegular = Number(p.paidRegular) || 0;
            } else {
                const legacyPaid = Number(p.paid) || 0;
                paidRegular = Math.min(legacyPaid, regularAmount);
            }

            const hasIndividualExtras = Array.isArray(p.extraFees) && p.extraFees.length > 0;
            const extraBilled = hasIndividualExtras
                ? p.extraFees!.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0)
                : (Number(p.extraAmount) || 0);
            const paidExtra = hasIndividualExtras
                ? p.extraFees!.reduce((sum, fee) => sum + (Number(fee.paid) || 0), 0)
                : (Number(p.paidExtra) || 0);
            const regularDebt = Math.max(0, regularAmount - paidRegular);
            const extraDebt = hasIndividualExtras
                ? p.extraFees!.reduce((sum, fee) => sum + (fee.forgiven ? 0 : Math.max(0, (Number(fee.amount) || 0) - (Number(fee.paid) || 0))), 0)
                : Math.max(0, extraBilled - paidExtra);

            totalBilledRegular += regularAmount;
            totalBilledExtra += extraBilled;
            totalPaidRegular += paidRegular;
            totalPaidExtra += paidExtra;
            totalDebtRegular += regularDebt;
            totalDebtExtra += extraDebt;
            totalBilled += regularAmount + extraBilled;
            totalPaid += paidRegular + paidExtra;
            totalDebt += regularDebt + extraDebt;
        });

        return {
            totalPaid,
            totalDebt,
            totalBilled,
            totalPaidRegular,
            totalPaidExtra,
            totalBilledRegular,
            totalBilledExtra,
            totalDebtRegular,
            totalDebtExtra
        };
    } catch (error) {
        console.error('Error calculating user financial stats', error);
        return {
            totalPaid: 0,
            totalDebt: 0,
            totalBilled: 0,
            totalPaidRegular: 0,
            totalPaidExtra: 0,
            totalBilledRegular: 0,
            totalBilledExtra: 0,
            totalDebtRegular: 0,
            totalDebtExtra: 0
        };
    }
  },
  
  getGlobalFinancials:''',
    'api getUserFinancialStats'
)

api = replace_once(
    api,
    "                extraAmount: Number(data.extraAmount) || 0,\n                extraFees: data.extraFees || [] // Ensure extraFees is always an array",
    "                extraAmount: Number(data.extraAmount) || 0,\n                paidRegular: data.paidRegular !== undefined ? (Number(data.paidRegular) || 0) : undefined,\n                paidExtra: data.paidExtra !== undefined ? (Number(data.paidExtra) || 0) : undefined,\n                extraFees: Array.isArray(data.extraFees) ? data.extraFees.map((fee: IndividualExtraFee) => ({\n                    ...fee,\n                    amount: Number(fee.amount) || 0,\n                    paid: Number(fee.paid) || 0,\n                })) : [] // Normalize amounts so partial payments never become strings",
    'api getPayments normalization'
)

api = regex_once(
    api,
    r"  approvePaymentReceipt: async \([\s\S]*?\n  rejectPaymentReceipt: async \(",
    r'''  approvePaymentReceipt: async (
    receipt: PaymentReceipt,
    reviewerUid: string
  ): Promise<void> => {
    const receiptRef = doc(db, "groups", receipt.groupId, "paymentReceipts", receipt.id);
    const storedSnap = await getDoc(receiptRef);
    const currentReceipt = storedSnap.exists()
      ? ({ ...receipt, ...storedSnap.data(), id: storedSnap.id } as PaymentReceipt)
      : receipt;

    // Idempotency: the same receipt must never be credited twice.
    if (currentReceipt.status === 'approved') return;

    const approvalDate = new Date().toISOString().split('T')[0];
    const normalize = (value?: string) => (value || '').trim().toLocaleLowerCase('es-MX');
    const getPaidRegular = (p: Payment): number => {
      if (p.paidRegular !== undefined) return Number(p.paidRegular) || 0;
      return Math.min(Number(p.paid) || 0, Number(p.amount) || 0);
    };
    const getExtraFees = (p: Payment): IndividualExtraFee[] =>
      Array.isArray(p.extraFees)
        ? p.extraFees.map(f => ({ ...f, amount: Number(f.amount) || 0, paid: Number(f.paid) || 0 }))
        : [];
    const getPaidExtra = (p: Payment, fees = getExtraFees(p)): number =>
      fees.length > 0 ? fees.reduce((sum, fee) => sum + fee.paid, 0) : (Number(p.paidExtra) || 0);
    const extrasCovered = (p: Payment, fees = getExtraFees(p), paidExtra = getPaidExtra(p, fees)): boolean =>
      fees.length > 0
        ? fees.every(fee => !!fee.forgiven || fee.paid >= fee.amount)
        : (Number(p.extraAmount) || 0) <= 0 || paidExtra >= (Number(p.extraAmount) || 0);
    const computeStatus = (regularCovered: boolean, extraCovered: boolean, paidRegular: number, paidExtra: number): Payment['status'] =>
      regularCovered && extraCovered ? 'Pagado' : (paidRegular > 0 || paidExtra > 0) ? 'Parcial' : 'Pendiente';
    const buildComment = (existing: string | undefined, label: string): string =>
      existing ? `${existing} | ${label}` : label;

    let appliedAmount = 0;

    if (currentReceipt.receiptType === 'concepto_adicional') {
      const declaredAmount = Number(currentReceipt.amount) || 0;
      if (declaredAmount <= 0) {
        throw new Error('El comprobante de cuota extra necesita un monto mayor a cero.');
      }

      const targetPeriod = currentReceipt.extraFeePeriod || currentReceipt.periods?.[0];
      if (!targetPeriod) {
        throw new Error('El comprobante no está ligado a un período de cuota extra. Edítalo antes de aprobar.');
      }

      const ledgerRef = doc(db, "users", currentReceipt.userId, "ledger", targetPeriod);
      const ledgerSnap = await getDoc(ledgerRef);
      if (!ledgerSnap.exists()) {
        throw new Error(`No existe el registro de pagos ${targetPeriod} para este miembro.`);
      }

      const payment = ledgerSnap.data() as Payment;
      const paidRegular = getPaidRegular(payment);
      const regularCovered = !!payment.regularCovered || paidRegular >= (Number(payment.amount) || 0);
      const fees = getExtraFees(payment);

      if (fees.length > 0) {
        let feeIndex = currentReceipt.extraFeeId
          ? fees.findIndex(fee => fee.id === currentReceipt.extraFeeId)
          : -1;
        if (feeIndex < 0 && currentReceipt.conceptDescription) {
          feeIndex = fees.findIndex(fee => normalize(fee.description) === normalize(currentReceipt.conceptDescription));
        }
        if (feeIndex < 0) {
          throw new Error(`No se encontró la cuota extra "${currentReceipt.conceptDescription || 'seleccionada'}" en ${targetPeriod}.`);
        }

        const targetFee = fees[feeIndex];
        if (targetFee.forgiven) {
          throw new Error('Esta cuota extra fue perdonada/cerrada y ya no acepta pagos.');
        }
        const balance = Math.max(0, targetFee.amount - targetFee.paid);
        if (balance <= 0) {
          throw new Error('Esta cuota extra ya está pagada al 100%.');
        }

        appliedAmount = Math.min(declaredAmount, balance);
        fees[feeIndex] = { ...targetFee, paid: targetFee.paid + appliedAmount };

        const totalExtraAmount = fees.reduce((sum, fee) => sum + fee.amount, 0);
        const totalExtraPaid = fees.reduce((sum, fee) => sum + fee.paid, 0);
        const extraCovered = extrasCovered(payment, fees, totalExtraPaid);

        await updateDoc(ledgerRef, {
          extraFees: fees,
          extraAmount: totalExtraAmount, // keep legacy summaries synchronized
          paidExtra: totalExtraPaid,
          paidRegular,
          paid: paidRegular + totalExtraPaid,
          regularCovered,
          extraCovered,
          status: computeStatus(regularCovered, extraCovered, paidRegular, totalExtraPaid),
          paymentDate: approvalDate,
          comments: buildComment(payment.comments, `Pago ${currentReceipt.conceptDescription || targetFee.description}: +$${appliedAmount.toFixed(2)} (${approvalDate})`),
        });

        currentReceipt.extraFeeId = targetFee.id;
        currentReceipt.extraFeePeriod = targetPeriod;
      } else {
        // Backward compatibility with one legacy extraAmount/extraDescription.
        const legacyAmount = Number(payment.extraAmount) || 0;
        if (legacyAmount <= 0) throw new Error('No existe una cuota extra pendiente en ese período.');
        if (currentReceipt.conceptDescription && payment.extraDescription && normalize(currentReceipt.conceptDescription) !== normalize(payment.extraDescription)) {
          throw new Error(`La cuota extra del período es "${payment.extraDescription}", no "${currentReceipt.conceptDescription}".`);
        }
        const currentPaidExtra = Number(payment.paidExtra) || 0;
        const balance = Math.max(0, legacyAmount - currentPaidExtra);
        if (balance <= 0) throw new Error('Esta cuota extra ya está pagada al 100%.');
        appliedAmount = Math.min(declaredAmount, balance);
        const newPaidExtra = currentPaidExtra + appliedAmount;
        const extraCovered = newPaidExtra >= legacyAmount;

        await updateDoc(ledgerRef, {
          paidExtra: newPaidExtra,
          paidRegular,
          paid: paidRegular + newPaidExtra,
          regularCovered,
          extraCovered,
          status: computeStatus(regularCovered, extraCovered, paidRegular, newPaidExtra),
          paymentDate: approvalDate,
          comments: buildComment(payment.comments, `Pago ${currentReceipt.conceptDescription || payment.extraDescription || 'Cuota Extra'}: +$${appliedAmount.toFixed(2)} (${approvalDate})`),
        });
        currentReceipt.extraFeeId = currentReceipt.extraFeeId || 'legacy';
        currentReceipt.extraFeePeriod = targetPeriod;
      }
    } else {
      // Cuota mensual: el monto se aplica SOLO a mensualidades, nunca a cuotas extra.
      const sortedPeriods = [...(currentReceipt.periods || [])].sort();
      if (sortedPeriods.length === 0) throw new Error('Selecciona al menos un período mensual.');
      let remaining = Number(currentReceipt.amount) || 0;
      const hasDeclaredAmount = remaining > 0;

      for (const period of sortedPeriods) {
        if (hasDeclaredAmount && remaining <= 0) break;
        const ledgerRef = doc(db, "users", currentReceipt.userId, "ledger", period);
        const ledgerSnap = await getDoc(ledgerRef);

        if (!ledgerSnap.exists()) {
          const groupSnap = await getDoc(doc(db, "groups", currentReceipt.groupId));
          const feeAmount = groupSnap.exists() ? (Number(groupSnap.data().membershipFee) || 0) : 0;
          if (feeAmount <= 0) continue;
          const toApply = hasDeclaredAmount ? Math.min(remaining, feeAmount) : feeAmount;
          const covered = toApply >= feeAmount;
          await setDoc(ledgerRef, {
            period,
            amount: feeAmount,
            paidRegular: toApply,
            paid: toApply,
            paidExtra: 0,
            regularCovered: covered,
            extraCovered: true,
            status: covered ? 'Pagado' : 'Parcial',
            comments: buildComment('', `Pago mensual: +$${toApply.toFixed(2)} (${approvalDate})`),
            paymentDate: approvalDate,
            groupId: currentReceipt.groupId
          });
          appliedAmount += toApply;
          if (hasDeclaredAmount) remaining -= toApply;
          continue;
        }

        const payment = ledgerSnap.data() as Payment;
        const fees = getExtraFees(payment);
        const paidExtra = getPaidExtra(payment, fees);
        const extraCovered = extrasCovered(payment, fees, paidExtra);
        const currentPaidRegular = getPaidRegular(payment);
        const regularAmount = Number(payment.amount) || 0;
        const regularDebt = Math.max(0, regularAmount - currentPaidRegular);
        const toApply = hasDeclaredAmount ? Math.min(remaining, regularDebt) : regularDebt;
        const newPaidRegular = currentPaidRegular + toApply;
        const regularCovered = newPaidRegular >= regularAmount;

        await updateDoc(ledgerRef, {
          paidRegular: newPaidRegular,
          paidExtra,
          paid: newPaidRegular + paidExtra,
          regularCovered,
          extraCovered,
          status: computeStatus(regularCovered, extraCovered, newPaidRegular, paidExtra),
          paymentDate: approvalDate,
          comments: buildComment(payment.comments, `Pago mensual: +$${toApply.toFixed(2)} (${approvalDate})`),
        });
        appliedAmount += toApply;
        if (hasDeclaredAmount) remaining -= toApply;
      }
    }

    // Mark approved only after the ledger was updated successfully.
    await updateDoc(receiptRef, {
      status: 'approved',
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewerUid,
      appliedAmount,
      ...(currentReceipt.extraFeeId ? { extraFeeId: currentReceipt.extraFeeId } : {}),
      ...(currentReceipt.extraFeePeriod ? { extraFeePeriod: currentReceipt.extraFeePeriod } : {}),
    });

    try {
      const periodsStr = (currentReceipt.periods || []).join(', ');
      const label = currentReceipt.receiptType === 'concepto_adicional'
        ? `tu pago de "${currentReceipt.conceptDescription || 'cuota extra'}" por $${appliedAmount.toFixed(2)}`
        : `los períodos ${periodsStr}`;
      await notificationService.createNotification(
        [currentReceipt.userId],
        currentReceipt.groupId,
        'payment_receipt',
        '✅ Comprobante aprobado',
        `Tu comprobante de pago para ${label} fue aprobado y registrado en tu cuenta.`
      );
    } catch (_) {}
  },

  rejectPaymentReceipt: async (''',
    'api approvePaymentReceipt'
)

api = replace_once(
    api,
    "  // --- DEBT NOTIFICATIONS ---\n",
    r'''  /**
   * Recalcula una cuota extra seleccionada usando únicamente comprobantes aprobados.
   * Sirve para corregir datos históricos creados por la lógica anterior que marcaba
   * una cuota completa aunque el comprobante fuera parcial.
   */
  reconcileExtraFeeFromReceipts: async (
    groupId: string,
    description: string,
    year: number
  ): Promise<{ updated: number; skippedAmbiguous: number }> => {
    const normalize = (value?: string) => (value || '').trim().toLocaleLowerCase('es-MX');
    const receipts = (await dataService.getPaymentReceipts(groupId)).filter(r =>
      r.status === 'approved' &&
      r.receiptType === 'concepto_adicional' &&
      normalize(r.conceptDescription) === normalize(description) &&
      (Number(r.appliedAmount ?? r.amount) || 0) > 0
    );
    const groupUsers = await dataService.getUsers(groupId);
    let updated = 0;
    let skippedAmbiguous = 0;

    for (const member of groupUsers) {
      const memberReceipts = receipts.filter(r => r.userId === member.uid);
      if (memberReceipts.length === 0) continue;
      const payments = await dataService.getPayments(member.uid);
      const matchingPayments = payments.filter(p =>
        p.period.startsWith(String(year)) &&
        p.extraFees?.some(fee => normalize(fee.description) === normalize(description))
      );

      for (const payment of matchingPayments) {
        const fees = (payment.extraFees || []).map(fee => ({ ...fee }));
        const index = fees.findIndex(fee => normalize(fee.description) === normalize(description));
        if (index < 0) continue;
        const targetFee = fees[index];

        const matchingReceipts = memberReceipts.filter(r => {
          if (r.extraFeeId && r.extraFeeId === targetFee.id) return true;
          if (r.extraFeePeriod && r.extraFeePeriod === payment.period) return true;
          if (r.periods?.includes(payment.period)) return true;
          // Legacy receipts sometimes omitted the period. Infer only if unambiguous.
          if ((!r.periods || r.periods.length === 0) && !r.extraFeePeriod && matchingPayments.length === 1) return true;
          return false;
        });

        if (matchingReceipts.length === 0) {
          const hasAmbiguous = memberReceipts.some(r => (!r.periods || r.periods.length === 0) && !r.extraFeePeriod) && matchingPayments.length > 1;
          if (hasAmbiguous) skippedAmbiguous++;
          continue;
        }

        const receiptTotal = matchingReceipts.reduce(
          (sum, r) => sum + (Number(r.appliedAmount ?? r.amount) || 0),
          0
        );
        const correctedPaid = Math.min(Number(targetFee.amount) || 0, receiptTotal);
        if (Math.abs((Number(targetFee.paid) || 0) - correctedPaid) < 0.005) continue;

        fees[index] = { ...targetFee, paid: correctedPaid };
        const totalExtraAmount = fees.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0);
        const totalExtraPaid = fees.reduce((sum, fee) => sum + (Number(fee.paid) || 0), 0);
        const paidRegular = payment.paidRegular !== undefined
          ? (Number(payment.paidRegular) || 0)
          : Math.min(Number(payment.paid) || 0, Number(payment.amount) || 0);
        const regularCovered = !!payment.regularCovered || paidRegular >= (Number(payment.amount) || 0);
        const extraCovered = fees.every(fee => !!fee.forgiven || (Number(fee.paid) || 0) >= (Number(fee.amount) || 0));
        const status: Payment['status'] = regularCovered && extraCovered
          ? 'Pagado'
          : (paidRegular > 0 || totalExtraPaid > 0) ? 'Parcial' : 'Pendiente';

        await updateDoc(doc(db, 'users', member.uid, 'ledger', payment.period), {
          extraFees: fees,
          extraAmount: totalExtraAmount,
          paidExtra: totalExtraPaid,
          paidRegular,
          paid: paidRegular + totalExtraPaid,
          regularCovered,
          extraCovered,
          status,
        });
        updated++;
      }
    }

    return { updated, skippedAmbiguous };
  },

  // --- DEBT NOTIFICATIONS ---
''',
    'api reconciliation service'
)
write('services/api.ts', api)


# -----------------------------------------------------------------------------
# Admin.tsx — filtered matrix CSV, filtered concept receipts viewer, one-click
# reconciliation for already-corrupted historical partials, and clearer audit.
# -----------------------------------------------------------------------------
admin = read('components/Admin.tsx')
admin = replace_once(
    admin,
    "  const [matrixExtraDesc, setMatrixExtraDesc] = useState<string>('');\n  // Cuota extra masiva",
    "  const [matrixExtraDesc, setMatrixExtraDesc] = useState<string>('');\n  const [showMatrixReceiptsModal, setShowMatrixReceiptsModal] = useState(false);\n  const [reconcilingMatrixConcept, setReconcilingMatrixConcept] = useState(false);\n  // Cuota extra masiva",
    'Admin matrix receipt states'
)

admin = replace_once(
    admin,
    "      if (activeTab === 'payment-matrix') {\n          loadAllLedgers();\n      }",
    "      if (activeTab === 'payment-matrix') {\n          loadAllLedgers();\n          loadPaymentReceipts();\n      }",
    'Admin matrix loads receipts'
)

admin = replace_once(
    admin,
    "  const handleSendEmail = (u: User) => { /* ... */ };",
    r'''  const normalizeConcept = (value?: string) => (value || '').trim().toLocaleLowerCase('es-MX');

  const getMatrixFilteredReceipts = (): PaymentReceipt[] => {
      if (matrixFilter !== 'extra' || !matrixExtraDesc) return [];
      return (paymentReceipts as PaymentReceipt[])
          .filter(receipt => {
              if (receipt.receiptType !== 'concepto_adicional') return false;
              if (normalizeConcept(receipt.conceptDescription) !== normalizeConcept(matrixExtraDesc)) return false;
              const receiptPeriod = receipt.extraFeePeriod || receipt.periods?.[0] || '';
              return !receiptPeriod || receiptPeriod.startsWith(String(matrixYear));
          })
          .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  };

  const handleDownloadMatrixCSV = () => {
      const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      const activeUsers = filteredUsers.filter(u => u.active);
      const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const filterLabel = matrixFilter === 'regular'
          ? 'Cuota mensual'
          : matrixFilter === 'extra'
              ? matrixExtraDesc || 'Cuota extra'
              : 'General';

      const headers = [
          'Miembro', 'Concepto filtrado',
          ...months.flatMap(month => [`${month} Estado`, `${month} Cuota`, `${month} Pagado`, `${month} Pendiente`]),
          'Total Cuota', 'Total Pagado', 'Total Pendiente'
      ];

      const rows = activeUsers.map(member => {
          const ledger = allUserLedgers[member.uid] || [];
          let totalBilled = 0;
          let totalPaid = 0;
          let totalPending = 0;
          const monthCells: Array<string | number> = [];

          for (let i = 0; i < 12; i++) {
              const period = `${matrixYear}-${String(i + 1).padStart(2, '0')}`;
              const payment = ledger.find(p => p.period === period);
              let billed = 0;
              let paid = 0;
              let pending = 0;
              let status = 'Sin cuota';

              if (matrixFilter === 'regular') {
                  if (payment) {
                      billed = Number(payment.amount) || 0;
                      paid = Number(payment.paidRegular !== undefined ? payment.paidRegular : payment.paid) || 0;
                      pending = Math.max(0, billed - paid);
                      status = pending <= 0 ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente';
                  }
              } else if (matrixFilter === 'extra' && matrixExtraDesc) {
                  const fee = payment?.extraFees?.find(f => normalizeConcept(f.description) === normalizeConcept(matrixExtraDesc));
                  const legacyMatch = !payment?.extraFees?.length && Number(payment?.extraAmount) > 0 &&
                      normalizeConcept(payment?.extraDescription || 'Cuota Extra') === normalizeConcept(matrixExtraDesc);
                  if (fee) {
                      billed = Number(fee.amount) || 0;
                      paid = Number(fee.paid) || 0;
                      pending = fee.forgiven ? 0 : Math.max(0, billed - paid);
                      status = fee.forgiven ? 'Perdonado' : pending <= 0 ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente';
                  } else if (payment && legacyMatch) {
                      billed = Number(payment.extraAmount) || 0;
                      paid = Number(payment.paidExtra) || 0;
                      pending = Math.max(0, billed - paid);
                      status = pending <= 0 ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente';
                  }
              } else if (payment) {
                  const regularBilled = Number(payment.amount) || 0;
                  const regularPaid = Number(payment.paidRegular !== undefined ? payment.paidRegular : payment.paid) || 0;
                  const fees = payment.extraFees || [];
                  const extraBilled = fees.length
                      ? fees.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0)
                      : (Number(payment.extraAmount) || 0);
                  const extraPaid = fees.length
                      ? fees.reduce((sum, fee) => sum + (Number(fee.paid) || 0), 0)
                      : (Number(payment.paidExtra) || 0);
                  const extraPending = fees.length
                      ? fees.reduce((sum, fee) => sum + (fee.forgiven ? 0 : Math.max(0, (Number(fee.amount) || 0) - (Number(fee.paid) || 0))), 0)
                      : Math.max(0, extraBilled - extraPaid);
                  billed = regularBilled + extraBilled;
                  paid = regularPaid + extraPaid;
                  pending = Math.max(0, regularBilled - regularPaid) + extraPending;
                  status = pending <= 0 ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente';
              }

              totalBilled += billed;
              totalPaid += paid;
              totalPending += pending;
              monthCells.push(status, billed.toFixed(2), paid.toFixed(2), pending.toFixed(2));
          }

          return [
              csvEscape(member.name),
              csvEscape(filterLabel),
              ...monthCells.map(csvEscape),
              totalBilled.toFixed(2), totalPaid.toFixed(2), totalPending.toFixed(2)
          ].join(',');
      });

      const csv = [headers.map(csvEscape).join(','), ...rows].join('\n');
      const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeConcept = filterLabel.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, '-').replace(/^-+|-+$/g, '');
      a.href = url;
      a.download = `matriz-${matrixYear}-${safeConcept || 'general'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showMessage(`CSV exportado: ${filterLabel}`, 'success');
  };

  const handleReconcileMatrixConcept = async () => {
      if (matrixFilter !== 'extra' || !matrixExtraDesc || isReadOnly) return;
      if (!window.confirm(
          `¿Recalcular los pagos de "${matrixExtraDesc}" en ${matrixYear} usando la suma de sus comprobantes APROBADOS?\n\n` +
          'Esto sirve para corregir registros antiguos que fueron marcados como 100% pagados por error.'
      )) return;
      setReconcilingMatrixConcept(true);
      try {
          const result = await dataService.reconcileExtraFeeFromReceipts(user.groupId, matrixExtraDesc, matrixYear);
          await Promise.all([loadAllLedgers(), loadUsers(), loadPaymentReceipts()]);
          showMessage(
              `✅ Reconciliación terminada: ${result.updated} registro(s) corregidos` +
              (result.skippedAmbiguous ? `; ${result.skippedAmbiguous} omitido(s) por período ambiguo.` : '.'),
              'success'
          );
      } catch (e: any) {
          showMessage(`Error al reconciliar: ${e?.message || e}`, 'error');
      } finally {
          setReconcilingMatrixConcept(false);
      }
  };

  const handleSendEmail = (u: User) => { /* ... */ };''',
    'Admin matrix handlers'
)

admin = regex_once(
    admin,
    r'''                            <button onClick=\{\(\) => \{\n                                const months = \['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'\];[\s\S]*?                                📥 CSV\n                            </button>\n                            <button onClick=\{\(\) => \{\n                                const months''',
    r'''                            <button onClick={handleDownloadMatrixCSV} className="bg-green-800 hover:bg-green-700 text-white px-3 py-1 rounded text-xs border border-green-700 flex items-center gap-1">
                                📥 CSV filtrado
                            </button>
                            {matrixFilter === 'extra' && matrixExtraDesc && (
                                <>
                                    <button
                                        onClick={async () => { await loadPaymentReceipts(); setShowMatrixReceiptsModal(true); }}
                                        className="bg-purple-800 hover:bg-purple-700 text-white px-3 py-1 rounded text-xs border border-purple-700 flex items-center gap-1"
                                    >
                                        🧾 Comprobantes ({getMatrixFilteredReceipts().length})
                                    </button>
                                    <button
                                        onClick={handleReconcileMatrixConcept}
                                        disabled={reconcilingMatrixConcept || isReadOnly}
                                        title="Corrige pagos históricos usando los montos reales de comprobantes aprobados"
                                        className="bg-orange-800 hover:bg-orange-700 disabled:opacity-40 text-white px-3 py-1 rounded text-xs border border-orange-700 flex items-center gap-1"
                                    >
                                        {reconcilingMatrixConcept ? '⏳ Recalculando...' : '♻️ Reconciliar'}
                                    </button>
                                </>
                            )}
                            <button onClick={() => {
                                const months''',
    'Admin replace matrix CSV toolbar'
)

admin = replace_once(
    admin,
    "                              {receipt.amount && <p className=\"text-sm text-gray-300\">Monto declarado: <span className=\"font-bold text-yellow-300\">${receipt.amount}</span></p>}",
    "                              {receipt.amount && <p className=\"text-sm text-gray-300\">Monto declarado: <span className=\"font-bold text-yellow-300\">${Number(receipt.amount).toFixed(2)}</span></p>}\n                              {receipt.appliedAmount !== undefined && <p className=\"text-sm text-gray-300\">Monto aplicado: <span className=\"font-bold text-green-300\">${Number(receipt.appliedAmount).toFixed(2)}</span></p>}",
    'Admin receipt applied amount display'
)

admin = replace_once(
    admin,
    "                                if (!window.confirm(`¿Aprobar comprobante de ${receipt.userName} (${(receipt.periods || []).join(', ')})?`)) return;",
    "                                const approvalLabel = receipt.receiptType === 'concepto_adicional'\n                                  ? `${receipt.conceptDescription || 'Cuota extra'} · $${Number(receipt.amount || 0).toFixed(2)}`\n                                  : (receipt.periods || []).join(', ');\n                                if (!window.confirm(`¿Aprobar comprobante de ${receipt.userName} (${approvalLabel})?`)) return;",
    'Admin approval confirmation label'
)

admin = replace_once(
    admin,
    "                                } catch(e) { showMessage('Error al aprobar', 'error'); }",
    "                                } catch(e: any) { showMessage(`Error al aprobar: ${e?.message || e}`, 'error'); }",
    'Admin approval error detail'
)

admin = replace_once(
    admin,
    "      {/* MATRIX PAYMENT MODAL */}",
    r'''      {/* FILTERED EXTRA-FEE RECEIPTS MODAL */}
      {showMatrixReceiptsModal && matrixFilter === 'extra' && matrixExtraDesc && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[110] p-4" onClick={() => setShowMatrixReceiptsModal(false)}>
          <div className="bg-logia-800 w-full max-w-3xl rounded-xl border border-purple-600/40 shadow-2xl max-h-[88vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-logia-700 bg-logia-900 flex justify-between items-center gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">🧾 Comprobantes: {matrixExtraDesc}</h3>
                <p className="text-xs text-gray-400">Año {matrixYear} · solo el concepto actualmente filtrado</p>
              </div>
              <button onClick={() => setShowMatrixReceiptsModal(false)} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3">
              {getMatrixFilteredReceipts().length === 0 ? (
                <p className="text-center text-gray-500 py-8">No hay comprobantes registrados para este concepto.</p>
              ) : getMatrixFilteredReceipts().map(receipt => {
                const urls = receipt.receiptImageUrls?.length
                  ? receipt.receiptImageUrls
                  : receipt.receiptImageUrl ? [receipt.receiptImageUrl] : [];
                return (
                  <div key={receipt.id} className={`rounded-lg border p-4 ${receipt.status === 'approved' ? 'border-green-700/50 bg-green-900/10' : receipt.status === 'pending' ? 'border-yellow-700/50 bg-yellow-900/10' : 'border-red-700/50 bg-red-900/10'}`}>
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <p className="font-bold text-white">{receipt.userName}</p>
                        <p className="text-xs text-gray-400">Período: {receipt.extraFeePeriod || (receipt.periods || []).join(', ') || 'Sin período (legacy)'}</p>
                        <p className="text-xs text-gray-400">Transferencia: {new Date(receipt.transferDate).toLocaleString('es-MX')}</p>
                        <p className="text-sm mt-1 text-gray-300">
                          Declarado: <strong className="text-yellow-300">${Number(receipt.amount || 0).toFixed(2)}</strong>
                          {receipt.appliedAmount !== undefined && <span> · Aplicado: <strong className="text-green-300">${Number(receipt.appliedAmount).toFixed(2)}</strong></span>}
                        </p>
                      </div>
                      <span className={`self-start text-xs px-2 py-1 rounded-full font-bold ${receipt.status === 'approved' ? 'bg-green-700 text-green-100' : receipt.status === 'pending' ? 'bg-yellow-700 text-yellow-100' : 'bg-red-700 text-red-100'}`}>
                        {receipt.status === 'approved' ? '✅ Aprobado' : receipt.status === 'pending' ? '⏳ En revisión' : '❌ Rechazado'}
                      </span>
                    </div>
                    {urls.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {urls.map((url, index) => {
                          const isPdf = url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('%2fpdf');
                          return isPdf ? (
                            <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs bg-blue-900/40 text-blue-300 border border-blue-700 px-3 py-2 rounded hover:bg-blue-900/60">
                              📄 Abrir comprobante {urls.length > 1 ? index + 1 : ''}
                            </a>
                          ) : (
                            <img key={url} src={url} alt={`Comprobante ${index + 1}`}
                              onClick={() => setViewingReceiptImage(url)}
                              className="w-24 h-24 object-cover rounded border border-logia-600 cursor-pointer hover:opacity-80" />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MATRIX PAYMENT MODAL */}''',
    'Admin filtered receipts modal'
)
write('components/Admin.tsx', admin)

print('Extra-fee partial receipt changes applied successfully.')
