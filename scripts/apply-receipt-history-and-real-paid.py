from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADMIN = ROOT / 'components' / 'Admin.tsx'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)


text = ADMIN.read_text(encoding='utf-8')

# -----------------------------------------------------------------------------
# 1) Receipt history UI state: each receipt can be expanded/collapsed, and the
#    whole filtered result can be expanded/collapsed in one click.
# -----------------------------------------------------------------------------
text = replace_once(
    text,
    "  const [receiptFilter, setReceiptFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');\n  // Edit receipt before approving",
    "  const [receiptFilter, setReceiptFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');\n  const [expandedReceiptIds, setExpandedReceiptIds] = useState<Set<string>>(new Set());\n  // Edit receipt before approving",
    'receipt expanded state'
)

# -----------------------------------------------------------------------------
# 2) Matrix helper: approved receipts are the source of truth whenever they
#    exist. Legacy receipts without a period are used only when the concept is
#    unambiguous for that member/year.
# -----------------------------------------------------------------------------
marker = "  const handleDownloadMatrixCSV = () => {"
helper = r'''  const getApprovedExtraReceiptTotal = (
      memberUid: string,
      period: string,
      description: string,
      feeId?: string
  ): { total: number; count: number } => {
      const normalizedDescription = normalizeConcept(description);
      const memberLedger = allUserLedgers[memberUid] || [];
      const matchingConceptPeriods = memberLedger.filter(payment => {
          if (!payment.period.startsWith(String(matrixYear))) return false;
          if (payment.extraFees?.length) {
              return payment.extraFees.some(fee => normalizeConcept(fee.description) === normalizedDescription);
          }
          return Number(payment.extraAmount) > 0 &&
              normalizeConcept(payment.extraDescription || 'Cuota Extra') === normalizedDescription;
      });

      const matchingReceipts = (paymentReceipts as PaymentReceipt[]).filter(receipt => {
          if (receipt.userId !== memberUid || receipt.status !== 'approved') return false;
          if (receipt.receiptType !== 'concepto_adicional') return false;
          if (normalizeConcept(receipt.conceptDescription) !== normalizedDescription) return false;

          if (feeId && receipt.extraFeeId) return receipt.extraFeeId === feeId;
          if (receipt.extraFeePeriod) return receipt.extraFeePeriod === period;
          if (receipt.periods?.length) return receipt.periods.includes(period);

          // Legacy: without period/fee id, infer only if this concept appears once
          // for this member in the selected year.
          return matchingConceptPeriods.length === 1 && matchingConceptPeriods[0].period === period;
      });

      return {
          total: matchingReceipts.reduce(
              (sum, receipt) => sum + (Number(receipt.appliedAmount ?? receipt.amount) || 0),
              0
          ),
          count: matchingReceipts.length
      };
  };

'''
text = replace_once(text, marker, helper + marker, 'matrix approved receipt helper')

# -----------------------------------------------------------------------------
# 3) CSV filtered extra fee: use real approved receipt amount if evidence exists.
# -----------------------------------------------------------------------------
old_csv = r'''                  if (fee) {
                      billed = Number(fee.amount) || 0;
                      paid = Number(fee.paid) || 0;
                      pending = fee.forgiven ? 0 : Math.max(0, billed - paid);
                      status = fee.forgiven ? 'Perdonado' : pending <= 0 ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente';
                  } else if (payment && legacyMatch) {
                      billed = Number(payment.extraAmount) || 0;
                      paid = Number(payment.paidExtra) || 0;
                      pending = Math.max(0, billed - paid);
                      status = pending <= 0 ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente';
                  }'''
new_csv = r'''                  if (fee) {
                      billed = Number(fee.amount) || 0;
                      const receiptEvidence = getApprovedExtraReceiptTotal(member.uid, period, fee.description, fee.id);
                      paid = receiptEvidence.count > 0
                          ? Math.min(billed, receiptEvidence.total)
                          : (Number(fee.paid) || 0);
                      pending = fee.forgiven ? 0 : Math.max(0, billed - paid);
                      status = fee.forgiven ? 'Perdonado' : pending <= 0 ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente';
                  } else if (payment && legacyMatch) {
                      billed = Number(payment.extraAmount) || 0;
                      const description = payment.extraDescription || 'Cuota Extra';
                      const receiptEvidence = getApprovedExtraReceiptTotal(member.uid, period, description);
                      paid = receiptEvidence.count > 0
                          ? Math.min(billed, receiptEvidence.total)
                          : (Number(payment.paidExtra) || 0);
                      pending = Math.max(0, billed - paid);
                      status = pending <= 0 ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente';
                  }'''
text = replace_once(text, old_csv, new_csv, 'matrix CSV real approved amount')

# -----------------------------------------------------------------------------
# 4) Matrix cells: same source-of-truth rule as CSV.
# -----------------------------------------------------------------------------
old_cell = r'''                                                    } else {
                                                        const covered = ef.paid >= ef.amount;
                                                        const partial = !covered && ef.paid > 0;
                                                        if (covered) { cellClass = 'bg-purple-600 text-white cursor-pointer hover:brightness-110'; cellTitle = `Pagado $${ef.amount}`; cellText = '✓'; }
                                                        else if (partial) { cellClass = 'bg-purple-900/60 text-purple-200 cursor-pointer hover:brightness-110'; cellTitle = `Parcial: $${ef.paid.toFixed(0)} / $${ef.amount}`; cellText = '½'; }
                                                        else { cellClass = 'bg-red-900/30 text-gray-400 cursor-pointer hover:brightness-110'; cellTitle = `Pendiente: $${ef.amount}`; cellText = '✗'; }
                                                    }
                                                } else if (legacyMatch) {
                                                    const paidExtra = paymentData.paidExtra || 0;
                                                    const covered = paidExtra >= (paymentData.extraAmount || 0);
                                                    const partial = !covered && paidExtra > 0;
                                                    if (covered) { cellClass = 'bg-purple-600 text-white cursor-pointer hover:brightness-110'; cellTitle = `Pagado $${paymentData.extraAmount}`; cellText = '✓'; }
                                                    else if (partial) { cellClass = 'bg-purple-900/60 text-purple-200 cursor-pointer hover:brightness-110'; cellTitle = `Parcial: $${paidExtra.toFixed(0)} / $${paymentData.extraAmount}`; cellText = '½'; }
                                                    else { cellClass = 'bg-red-900/30 text-gray-400 cursor-pointer hover:brightness-110'; cellTitle = `Pendiente: $${paymentData.extraAmount}`; cellText = '✗'; }
                                                }'''
new_cell = r'''                                                    } else {
                                                        const receiptEvidence = getApprovedExtraReceiptTotal(u.uid, period, ef.description, ef.id);
                                                        const effectivePaid = receiptEvidence.count > 0
                                                            ? Math.min(Number(ef.amount) || 0, receiptEvidence.total)
                                                            : (Number(ef.paid) || 0);
                                                        const covered = effectivePaid >= ef.amount;
                                                        const partial = !covered && effectivePaid > 0;
                                                        if (covered) { cellClass = 'bg-purple-600 text-white cursor-pointer hover:brightness-110'; cellTitle = `Pagado $${effectivePaid.toFixed(0)} / $${ef.amount}`; cellText = '✓'; }
                                                        else if (partial) { cellClass = 'bg-purple-900/60 text-purple-200 cursor-pointer hover:brightness-110'; cellTitle = `Parcial: $${effectivePaid.toFixed(0)} / $${ef.amount}`; cellText = '½'; }
                                                        else { cellClass = 'bg-red-900/30 text-gray-400 cursor-pointer hover:brightness-110'; cellTitle = `Pendiente: $${ef.amount}`; cellText = '✗'; }
                                                    }
                                                } else if (legacyMatch) {
                                                    const extraAmount = Number(paymentData.extraAmount) || 0;
                                                    const description = paymentData.extraDescription || 'Cuota Extra';
                                                    const receiptEvidence = getApprovedExtraReceiptTotal(u.uid, period, description);
                                                    const paidExtra = receiptEvidence.count > 0
                                                        ? Math.min(extraAmount, receiptEvidence.total)
                                                        : (Number(paymentData.paidExtra) || 0);
                                                    const covered = paidExtra >= extraAmount;
                                                    const partial = !covered && paidExtra > 0;
                                                    if (covered) { cellClass = 'bg-purple-600 text-white cursor-pointer hover:brightness-110'; cellTitle = `Pagado $${paidExtra.toFixed(0)} / $${extraAmount}`; cellText = '✓'; }
                                                    else if (partial) { cellClass = 'bg-purple-900/60 text-purple-200 cursor-pointer hover:brightness-110'; cellTitle = `Parcial: $${paidExtra.toFixed(0)} / $${extraAmount}`; cellText = '½'; }
                                                    else { cellClass = 'bg-red-900/30 text-gray-400 cursor-pointer hover:brightness-110'; cellTitle = `Pendiente: $${extraAmount}`; cellText = '✗'; }
                                                }'''
text = replace_once(text, old_cell, new_cell, 'matrix cells real approved amount')

# -----------------------------------------------------------------------------
# 5) Receipt list toolbar: make the list explicitly historical and add controls
#    to expand/collapse every filtered receipt.
# -----------------------------------------------------------------------------
old_toolbar = r'''              {/* Filtro */}
              <div className="flex gap-2 flex-wrap mb-4">
                {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
                  <button key={f} onClick={() => setReceiptFilter(f)}
                    className={`px-3 py-1 rounded text-sm font-bold transition-colors ${receiptFilter === f ? 'bg-logia-accent text-white' : 'bg-logia-900 text-gray-400 hover:bg-logia-700'}`}>
                    {f === 'pending' ? '⏳ Pendientes' : f === 'approved' ? '✅ Aprobados' : f === 'rejected' ? '❌ Rechazados' : '📋 Todos'}
                  </button>
                ))}
                <button onClick={loadPaymentReceipts} className="ml-auto px-3 py-1 rounded text-sm bg-logia-900 text-gray-400 hover:bg-logia-700">
                  🔄 Actualizar
                </button>
              </div>'''
new_toolbar = r'''              {/* Filtro / histórico */}
              <div className="flex gap-2 flex-wrap mb-2">
                {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
                  <button key={f} onClick={() => setReceiptFilter(f)}
                    className={`px-3 py-1 rounded text-sm font-bold transition-colors ${receiptFilter === f ? 'bg-logia-accent text-white' : 'bg-logia-900 text-gray-400 hover:bg-logia-700'}`}>
                    {f === 'pending' ? '⏳ Pendientes' : f === 'approved' ? '✅ Aprobados' : f === 'rejected' ? '❌ Rechazados' : '📚 Histórico completo'}
                  </button>
                ))}
                <button onClick={loadPaymentReceipts} className="ml-auto px-3 py-1 rounded text-sm bg-logia-900 text-gray-400 hover:bg-logia-700">
                  🔄 Actualizar
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
                <span className="text-gray-500">Cada registro puede abrirse o cerrarse.</span>
                <button
                  onClick={() => {
                    const ids = paymentReceipts
                      .filter(r => receiptFilter === 'all' || r.status === receiptFilter)
                      .map(r => r.id);
                    setExpandedReceiptIds(new Set(ids));
                  }}
                  className="px-2 py-1 rounded bg-logia-900 border border-logia-700 text-gray-300 hover:bg-logia-700"
                >
                  ▼ Expandir todos
                </button>
                <button
                  onClick={() => setExpandedReceiptIds(new Set())}
                  className="px-2 py-1 rounded bg-logia-900 border border-logia-700 text-gray-300 hover:bg-logia-700"
                >
                  ▲ Contraer todos
                </button>
              </div>'''
text = replace_once(text, old_toolbar, new_toolbar, 'receipt history toolbar')

# -----------------------------------------------------------------------------
# 6) Receipt cards: compact header is always visible; detail/actions are inside a
#    collapsible body. Pending receipts start expanded; historical receipts start
#    collapsed until the admin opens them.
# -----------------------------------------------------------------------------
old_map_start = r'''                      {filtered.map((receipt: any) => (
                        <div key={receipt.id} className={`rounded-lg border p-4 space-y-2 ${
                          receipt.status === 'pending' ? 'border-yellow-600/60 bg-yellow-900/10' :
                          receipt.status === 'approved' ? 'border-green-600/60 bg-green-900/10' :
                          'border-red-600/60 bg-red-900/10'
                        }`}>
                          <div className="flex flex-wrap justify-between items-start gap-2">
                            <div>
                              <p className="font-bold text-white">{receipt.userName}</p>
                              <p className="text-xs text-gray-400">Enviado: {new Date(receipt.submittedAt).toLocaleString('es-MX')}</p>
                              <p className="text-xs text-gray-400">Transferencia: {new Date(receipt.transferDate).toLocaleString('es-MX')}</p>
                              {receipt.receiptType === 'concepto_adicional'
                                ? <p className="text-sm text-gray-300 mt-1">Concepto: <span className="font-bold text-purple-300">{receipt.conceptDescription || '—'}</span></p>
                                : <p className="text-sm text-gray-300 mt-1">Períodos: <span className="font-bold text-white">{(receipt.periods || []).join(', ')}</span></p>
                              }
                              {receipt.amount && <p className="text-sm text-gray-300">Monto declarado: <span className="font-bold text-yellow-300">${Number(receipt.amount).toFixed(2)}</span></p>}
                              {receipt.appliedAmount !== undefined && <p className="text-sm text-gray-300">Monto aplicado: <span className="font-bold text-green-300">${Number(receipt.appliedAmount).toFixed(2)}</span></p>}
                            </div>
                            <div className="flex flex-col gap-2 items-end">
                              <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                                receipt.receiptType === 'concepto_adicional' ? 'bg-purple-800 text-purple-200' : 'bg-indigo-800 text-indigo-200'
                              }`}>
                                {receipt.receiptType === 'concepto_adicional' ? '💡 Concepto Adicional' : '📅 Cuota Mensual'}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                                receipt.status === 'pending' ? 'bg-yellow-700 text-yellow-100' :
                                receipt.status === 'approved' ? 'bg-green-700 text-green-100' :
                                'bg-red-700 text-red-100'
                              }`}>
                                {receipt.status === 'pending' ? '⏳ Pendiente' : receipt.status === 'approved' ? '✅ Aprobado' : '❌ Rechazado'}
                              </span>
                              {/* Mostrar todas las fotos/archivos adjuntos */}
                              {(() => {
                                const urls: string[] = receipt.receiptImageUrls?.length
                                  ? receipt.receiptImageUrls
                                  : receipt.receiptImageUrl ? [receipt.receiptImageUrl] : [];
                                return urls.length > 0 ? (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {urls.map((url: string, i: number) => (
                                      <button key={i} onClick={() => setViewingReceiptImage(url)}
                                        className="text-xs bg-logia-900 hover:bg-logia-700 text-blue-300 px-2 py-1 rounded border border-blue-600/40">
                                        🖼️ {urls.length > 1 ? `Foto ${i+1}` : 'Ver Foto'}
                                      </button>
                                    ))}
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          </div>'''
new_map_start = r'''                      {filtered.map((receipt: any) => {
                        const isExpanded = receipt.status === 'pending' || expandedReceiptIds.has(receipt.id);
                        return (
                        <div key={receipt.id} className={`rounded-lg border overflow-hidden ${
                          receipt.status === 'pending' ? 'border-yellow-600/60 bg-yellow-900/10' :
                          receipt.status === 'approved' ? 'border-green-600/60 bg-green-900/10' :
                          'border-red-600/60 bg-red-900/10'
                        }`}>
                          <button
                            type="button"
                            onClick={() => {
                              if (receipt.status === 'pending') return;
                              setExpandedReceiptIds(prev => {
                                const next = new Set(prev);
                                next.has(receipt.id) ? next.delete(receipt.id) : next.add(receipt.id);
                                return next;
                              });
                            }}
                            className={`w-full p-4 flex flex-wrap justify-between items-center gap-3 text-left ${receipt.status === 'pending' ? 'cursor-default' : 'hover:bg-logia-700/20'}`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-bold text-white">{receipt.userName}</p>
                                <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                                  receipt.status === 'pending' ? 'bg-yellow-700 text-yellow-100' :
                                  receipt.status === 'approved' ? 'bg-green-700 text-green-100' :
                                  'bg-red-700 text-red-100'
                                }`}>
                                  {receipt.status === 'pending' ? '⏳ Pendiente' : receipt.status === 'approved' ? '✅ Aprobado' : '❌ Rechazado'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-400 mt-1">
                                {receipt.receiptType === 'concepto_adicional'
                                  ? `${receipt.conceptDescription || 'Concepto adicional'} · ${receipt.extraFeePeriod || (receipt.periods || []).join(', ') || 'sin período'}`
                                  : `Cuota mensual · ${(receipt.periods || []).join(', ') || 'sin período'}`}
                                {receipt.amount ? ` · $${Number(receipt.amount).toFixed(2)}` : ''}
                              </p>
                              <p className="text-[11px] text-gray-500 mt-1">Enviado: {new Date(receipt.submittedAt).toLocaleString('es-MX')}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                                receipt.receiptType === 'concepto_adicional' ? 'bg-purple-800 text-purple-200' : 'bg-indigo-800 text-indigo-200'
                              }`}>
                                {receipt.receiptType === 'concepto_adicional' ? '💡 Extra' : '📅 Mensual'}
                              </span>
                              {receipt.status !== 'pending' && <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>}
                            </div>
                          </button>

                          {isExpanded && (
                          <div className="px-4 pb-4 space-y-2 border-t border-logia-700/50 pt-3">
                            <div className="flex flex-wrap justify-between items-start gap-2">
                              <div>
                                <p className="text-xs text-gray-400">Transferencia: {new Date(receipt.transferDate).toLocaleString('es-MX')}</p>
                                {receipt.receiptType === 'concepto_adicional'
                                  ? <p className="text-sm text-gray-300 mt-1">Concepto: <span className="font-bold text-purple-300">{receipt.conceptDescription || '—'}</span></p>
                                  : <p className="text-sm text-gray-300 mt-1">Períodos: <span className="font-bold text-white">{(receipt.periods || []).join(', ')}</span></p>
                                }
                                {receipt.amount && <p className="text-sm text-gray-300">Monto declarado: <span className="font-bold text-yellow-300">${Number(receipt.amount).toFixed(2)}</span></p>}
                                {receipt.appliedAmount !== undefined && <p className="text-sm text-gray-300">Monto aplicado: <span className="font-bold text-green-300">${Number(receipt.appliedAmount).toFixed(2)}</span></p>}
                              </div>
                              <div className="flex flex-col gap-2 items-end">
                                {/* Mostrar todas las fotos/archivos adjuntos */}
                                {(() => {
                                  const urls: string[] = receipt.receiptImageUrls?.length
                                    ? receipt.receiptImageUrls
                                    : receipt.receiptImageUrl ? [receipt.receiptImageUrl] : [];
                                  return urls.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {urls.map((url: string, i: number) => (
                                        <button key={i} onClick={() => setViewingReceiptImage(url)}
                                          className="text-xs bg-logia-900 hover:bg-logia-700 text-blue-300 px-2 py-1 rounded border border-blue-600/40">
                                          🖼️ {urls.length > 1 ? `Foto ${i+1}` : 'Ver Foto'}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null;
                                })()}
                              </div>
                            </div>'''
text = replace_once(text, old_map_start, new_map_start, 'receipt collapsible card start')

# Close the conditional body and block-bodied map callback.
old_map_end = r'''                          )}
                        </div>
                      ))}
                    </div>'''
new_map_end = r'''                          )}
                          </div>
                          )}
                        </div>
                        );
                      })}
                    </div>'''
text = replace_once(text, old_map_end, new_map_end, 'receipt collapsible card end')

ADMIN.write_text(text, encoding='utf-8')
print('Receipt history + real approved amount patch applied successfully.')
