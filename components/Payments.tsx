import React, { useEffect, useState } from 'react';
import { User, Payment, IndividualExtraFee, PaymentReceipt } from '../types';
import { dataService } from '../services/api';

interface Props {
  user: User;
}

interface PaymentRow {
  period: string;
  periodDisplay: string;
  regularAmount: number;
  regularPaid: number;
  regularBalance: number;
  extraFee?: IndividualExtraFee | { description: string; amount: number; paid: number; id: string };
  extraBalance: number;
  totalBalance: number;
  isMainRow: boolean;
  paymentDate?: string | null;
  comments?: string;
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const formatPeriod = (period: string): string => {
  const [year, month] = period.split('-');
  return `${MONTH_NAMES[parseInt(month) - 1]} ${year}`;
};

const Payments: React.FC<Props> = ({ user }) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());

  // Comprobante state
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptPeriods, setReceiptPeriods] = useState<string[]>([]);
  const [receiptTransferDate, setReceiptTransferDate] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptAmount, setReceiptAmount] = useState('');
  const [submittingReceipt, setSubmittingReceipt] = useState(false);
  const [receiptMsg, setReceiptMsg] = useState<{text: string; type: 'success'|'error'} | null>(null);

  useEffect(() => {
    const load = async () => {
      const [data, recs] = await Promise.all([
        dataService.getPayments(user.uid),
        dataService.getUserPaymentReceipts(user.uid, user.groupId)
      ]);
      const filtered = data.filter(p => !p.groupId || p.groupId === user.groupId);
      setPayments(filtered.sort((a, b) => b.period.localeCompare(a.period)));
      setReceipts(recs);
      setLoading(false);
    };
    load();
  }, [user.uid, user.groupId]);

  const toggleExpand = (period: string) => {
    const newSet = new Set(expandedPeriods);
    if (newSet.has(period)) newSet.delete(period);
    else newSet.add(period);
    setExpandedPeriods(newSet);
  };

  const buildPaymentRows = (payment: Payment): PaymentRow[] => {
    const rows: PaymentRow[] = [];
    const periodDisplay = formatPeriod(payment.period);
    const regularPaid = payment.paidRegular !== undefined ? payment.paidRegular : (Number(payment.paid) || 0);
    const regularBalance = payment.amount - regularPaid;

    const mainRow: PaymentRow = {
      period: payment.period,
      periodDisplay,
      regularAmount: payment.amount,
      regularPaid,
      regularBalance,
      extraBalance: 0,
      totalBalance: regularBalance,
      isMainRow: true,
      paymentDate: payment.paymentDate,
      comments: payment.comments
    };

    if (payment.extraFees && payment.extraFees.length > 0) {
      const first = payment.extraFees[0];
      const firstBalance = first.amount - first.paid;
      mainRow.extraFee = first;
      mainRow.extraBalance = firstBalance;
      mainRow.totalBalance = regularBalance + firstBalance;
      rows.push(mainRow);
      for (let i = 1; i < payment.extraFees.length; i++) {
        const ef = payment.extraFees[i];
        const bal = ef.amount - ef.paid;
        rows.push({
          period: payment.period, periodDisplay, regularAmount: 0,
          regularPaid: 0, regularBalance: 0,
          extraFee: ef, extraBalance: bal, totalBalance: bal, isMainRow: false
        });
      }
    } else if (payment.extraAmount && payment.extraAmount > 0) {
      const extraPaid = payment.paidExtra || 0;
      const extraBal = payment.extraAmount - extraPaid;
      mainRow.extraFee = { id: 'legacy', description: payment.extraDescription || 'Cuota Extra', amount: payment.extraAmount, paid: extraPaid };
      mainRow.extraBalance = extraBal;
      mainRow.totalBalance = regularBalance + extraBal;
      rows.push(mainRow);
    } else {
      rows.push(mainRow);
    }
    return rows;
  };

  const allRows: PaymentRow[] = payments.flatMap(p => buildPaymentRows(p));

  const summary = {
    totalRegularDebt: allRows.filter(r => r.isMainRow).reduce((s, r) => s + r.regularBalance, 0),
    totalExtraDebt: allRows.reduce((s, r) => s + r.extraBalance, 0),
    totalDebt: allRows.reduce((s, r) => s + r.totalBalance, 0),
    pendingCount: allRows.filter(r => r.isMainRow && r.totalBalance > 0).length
  };

  const pendingPeriods = payments
    .filter(p => {
      const reg = p.paidRegular !== undefined ? p.paidRegular : (Number(p.paid) || 0);
      const regularBalance = Math.max(0, p.amount - reg);
      let extraBalance = 0;
      if (p.extraFees && p.extraFees.length > 0) {
        extraBalance = p.extraFees.reduce((s, ef) => s + Math.max(0, ef.amount - ef.paid), 0);
      } else if (p.extraAmount) {
        extraBalance = Math.max(0, p.extraAmount - (p.paidExtra || 0));
      }
      return regularBalance > 0 || extraBalance > 0;
    })
    .map(p => p.period);

  const receiptByPeriod = (period: string): PaymentReceipt | undefined =>
    receipts.find(r => r.periods.includes(period));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setReceiptPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleTogglePeriod = (period: string) => {
    setReceiptPeriods(prev =>
      prev.includes(period) ? prev.filter(p => p !== period) : [...prev, period]
    );
  };

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptFile || receiptPeriods.length === 0 || !receiptTransferDate) {
      setReceiptMsg({ text: 'Completa todos los campos requeridos.', type: 'error' });
      return;
    }
    if (!user.groupId) {
      setReceiptMsg({ text: 'Error: tu cuenta no está asociada a un grupo. Contacta al administrador.', type: 'error' });
      return;
    }
    setSubmittingReceipt(true);
    try {
      const base64 = await dataService.compressImageToBase64(receiptFile);
      await dataService.submitPaymentReceipt({
        groupId: user.groupId,
        userId: user.uid,
        userName: user.name || user.email,
        periods: receiptPeriods,
        transferDate: receiptTransferDate,
        receiptImageBase64: base64,
        amount: receiptAmount ? Number(receiptAmount) : undefined,
        status: 'pending',
        submittedAt: new Date().toISOString()
      });
      // Show success immediately after submit succeeds
      setReceiptMsg({ text: '✅ Comprobante enviado. El administrador lo revisará pronto.', type: 'success' });
      setReceiptPeriods([]);
      setReceiptTransferDate('');
      setReceiptFile(null);
      setReceiptPreview(null);
      setReceiptAmount('');
      // Refresh receipts list non-critically (don't show error if this fails)
      dataService.getUserPaymentReceipts(user.uid, user.groupId)
        .then(recs => setReceipts(recs))
        .catch(() => {});
      setTimeout(() => { setShowReceiptModal(false); setReceiptMsg(null); }, 2800);
    } catch (err: any) {
      console.error('Receipt submit error:', err);
      const errMsg = err?.code === 'permission-denied'
        ? 'Sin permisos. Recarga la app e intenta de nuevo.'
        : `Error al enviar: ${err.message || err}`;
      setReceiptMsg({ text: errMsg, type: 'error' });
    } finally {
      setSubmittingReceipt(false);
    }
  };

  const statusBadge = (r: PaymentReceipt) => {
    if (r.status === 'pending') return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-700/40 text-yellow-300 font-bold">⏳ En revisión</span>;
    if (r.status === 'approved') return <span className="text-xs px-2 py-0.5 rounded-full bg-green-700/40 text-green-300 font-bold">✅ Aprobado</span>;
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-700/40 text-red-300 font-bold">❌ Rechazado</span>;
  };

  return (
    <div className="p-4 space-y-6 pb-24">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Mis Pagos</h2>
        <button
          onClick={() => { setShowReceiptModal(true); setReceiptMsg(null); }}
          className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
        >
          📤 Reportar Pago
        </button>
      </div>

      {/* Summary Card */}
      <div className="bg-logia-800 rounded-xl p-5 border border-logia-700 shadow-lg">
        <div className="grid grid-cols-3 gap-4 mb-3">
          <div>
            <p className="text-gray-400 text-xs">Cuota Regular Pendiente</p>
            <p className={`text-xl font-bold ${summary.totalRegularDebt > 0 ? 'text-orange-400' : 'text-green-400'}`}>
              ${summary.totalRegularDebt.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Cuotas Extras Pendientes</p>
            <p className={`text-xl font-bold ${summary.totalExtraDebt > 0 ? 'text-purple-400' : 'text-green-400'}`}>
              ${summary.totalExtraDebt.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Saldo Total</p>
            <p className={`text-2xl font-bold ${summary.totalDebt > 0 ? 'text-red-400' : 'text-green-400'}`}>
              ${summary.totalDebt.toFixed(2)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-gray-400 text-xs">Meses con Saldo Pendiente</p>
          <p className="text-lg font-bold text-white">{summary.pendingCount}</p>
        </div>
      </div>

      {/* Pending receipts banner */}
      {receipts.filter(r => r.status === 'pending').length > 0 && (
        <div className="bg-yellow-900/30 border border-yellow-600/40 rounded-xl p-4 flex items-center gap-3">
          <span className="text-2xl">⏳</span>
          <div>
            <p className="text-yellow-300 font-bold text-sm">Comprobante(s) en revisión</p>
            <p className="text-yellow-200/70 text-xs">
              Tienes {receipts.filter(r => r.status === 'pending').length} comprobante(s) pendiente(s) de aprobación.
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-gray-400">Cargando historial...</p>
      ) : allRows.length === 0 ? (
        <p className="text-center text-gray-400 bg-logia-800/50 p-4 rounded-lg">No hay registros de pagos.</p>
      ) : (
        <div className="bg-logia-800 rounded-lg border border-logia-700 overflow-hidden shadow-lg">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-900 to-indigo-800 p-3 grid grid-cols-12 gap-1 text-xs font-bold text-gray-200 uppercase border-b-2 border-indigo-600">
            <div className="col-span-3 pl-2">Período</div>
            <div className="col-span-2 text-center">Cuota</div>
            <div className="col-span-2 text-center">Pagado</div>
            <div className="col-span-2 text-center">Extra</div>
            <div className="col-span-2 text-center">Saldo</div>
            <div className="col-span-1 text-center">Ver</div>
          </div>

          <div className="divide-y divide-logia-700">
            {allRows.map((row, idx) => {
              const isExpanded = expandedPeriods.has(row.period);
              const receipt = row.isMainRow ? receiptByPeriod(row.period) : undefined;
              const hasDetails = row.isMainRow && (row.paymentDate || row.comments || row.extraFee || receipt);

              return (
                <React.Fragment key={`${row.period}-${idx}`}>
                  <div className={`grid grid-cols-12 gap-1 items-center hover:bg-logia-700/20 transition-colors ${row.isMainRow ? '' : 'bg-logia-900/40'}`}>
                    {/* Period */}
                    <div className="col-span-3 py-3 pl-2 border-r border-logia-700/50">
                      <span className={`text-sm ${row.isMainRow ? 'font-bold text-indigo-300' : 'text-gray-400 text-xs pl-2'}`}>
                        {row.isMainRow ? row.periodDisplay : `↳ ${row.periodDisplay}`}
                      </span>
                      {receipt && row.isMainRow && (
                        <div className="mt-0.5">{statusBadge(receipt)}</div>
                      )}
                    </div>

                    {/* Cuota regular */}
                    <div className="col-span-2 py-3 text-center border-r border-logia-700/50">
                      {row.regularAmount > 0 ? (
                        <span className="text-sm font-medium text-white tabular-nums">${row.regularAmount.toFixed(2)}</span>
                      ) : (
                        <span className="text-gray-600 text-sm">—</span>
                      )}
                    </div>

                    {/* Pagado */}
                    <div className="col-span-2 py-3 text-center border-r border-logia-700/50">
                      {row.regularPaid > 0 ? (
                        <span className="text-sm font-medium text-green-400 tabular-nums">${row.regularPaid.toFixed(2)}</span>
                      ) : (
                        <span className="text-gray-600 text-sm">$0.00</span>
                      )}
                    </div>

                    {/* Extra */}
                    <div className="col-span-2 py-3 text-center border-r border-logia-700/50">
                      {row.extraFee ? (
                        <div className="text-xs tabular-nums">
                          <div className="text-purple-300 font-medium">${row.extraFee.amount.toFixed(2)}</div>
                          {row.extraFee.paid > 0 && <div className="text-green-400">-${row.extraFee.paid.toFixed(2)}</div>}
                        </div>
                      ) : (
                        <span className="text-gray-600 text-sm">—</span>
                      )}
                    </div>

                    {/* Saldo */}
                    <div className="col-span-2 py-3 text-center border-r border-logia-700/50">
                      <span className={`text-sm font-bold tabular-nums ${row.totalBalance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        ${row.totalBalance.toFixed(2)}
                      </span>
                    </div>

                    {/* Toggle */}
                    <div className="col-span-1 py-3 text-center">
                      {hasDetails && (
                        <button onClick={() => toggleExpand(row.period)} className="text-indigo-400 hover:text-indigo-300 text-xs font-bold" title="Ver detalles">
                          {isExpanded ? '▼' : '▶'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Details */}
                  {isExpanded && hasDetails && (
                    <div className="bg-logia-900 border-t border-b-2 border-indigo-600/30">
                      <div className="p-4 space-y-3">
                        <p className="text-xs font-bold text-indigo-400 uppercase mb-2">📋 Detalles del Período</p>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {row.paymentDate && (
                            <div className="bg-logia-800/50 p-2 rounded border border-logia-700">
                              <span className="text-gray-400 text-xs block">Fecha de Pago Registrada:</span>
                              <span className="text-white font-medium">
                                {new Date(row.paymentDate).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
                              </span>
                            </div>
                          )}
                          {row.comments && (
                            <div className="bg-logia-800/50 p-2 rounded border border-logia-700">
                              <span className="text-gray-400 text-xs block">Comentarios:</span>
                              <span className="text-white font-medium italic">"{row.comments}"</span>
                            </div>
                          )}
                        </div>

                        {row.extraFee && (
                          <div className="bg-purple-900/20 p-3 rounded border border-purple-600/30">
                            <span className="text-purple-400 text-xs font-bold block mb-1">Cuota Extra: {row.extraFee.description}</span>
                            <div className="flex gap-4 text-xs">
                              <span className="text-gray-400">Monto: <span className="text-purple-300 font-bold">${row.extraFee.amount.toFixed(2)}</span></span>
                              <span className="text-gray-400">Pagado: <span className="text-green-400 font-bold">${row.extraFee.paid.toFixed(2)}</span></span>
                              <span className="text-gray-400">Pendiente: <span className={`font-bold ${row.extraBalance > 0 ? 'text-red-400' : 'text-green-400'}`}>${row.extraBalance.toFixed(2)}</span></span>
                            </div>
                          </div>
                        )}

                        {receipt && (
                          <div className={`p-3 rounded border ${receipt.status === 'approved' ? 'border-green-600/40 bg-green-900/20' : receipt.status === 'rejected' ? 'border-red-600/40 bg-red-900/20' : 'border-yellow-600/40 bg-yellow-900/20'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-gray-300 uppercase">📄 Comprobante Enviado</span>
                              {statusBadge(receipt)}
                            </div>
                            <p className="text-xs text-gray-400">
                              Transferencia: <span className="text-white">{new Date(receipt.transferDate).toLocaleString('es-ES')}</span>
                            </p>
                            {receipt.amount && (
                              <p className="text-xs text-gray-400">
                                Monto declarado: <span className="text-white font-bold">${Number(receipt.amount).toFixed(2)}</span>
                              </p>
                            )}
                            {receipt.reviewComments && (
                              <p className="text-xs text-red-300 mt-1">Comentario: "{receipt.reviewComments}"</p>
                            )}
                            {receipt.receiptImageBase64 && (
                              <div className="mt-2">
                                <img
                                  src={receipt.receiptImageBase64}
                                  alt="Comprobante"
                                  className="max-w-full rounded border border-logia-700 max-h-48 object-contain cursor-pointer"
                                  onClick={() => window.open(receipt.receiptImageBase64, '_blank')}
                                />
                                <p className="text-xs text-gray-500 mt-1">Toca la imagen para verla completa</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* ── MODAL: Reportar Pago ── */}
      {showReceiptModal && (
        <div className="fixed inset-0 bg-black/90 flex items-start justify-center z-[100] p-4 overflow-y-auto">
          <div className="bg-logia-800 border border-green-600/40 p-6 rounded-xl w-full max-w-lg shadow-2xl my-4">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-bold text-white">📤 Reportar Pago</h3>
              <button onClick={() => setShowReceiptModal(false)} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>

            {receiptMsg && (
              <div className={`mb-4 p-3 rounded text-sm font-medium ${receiptMsg.type === 'success' ? 'bg-green-900/50 text-green-300 border border-green-600/40' : 'bg-red-900/50 text-red-300 border border-red-600/40'}`}>
                {receiptMsg.text}
              </div>
            )}

            <form onSubmit={handleSubmitReceipt} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  Meses que estás pagando <span className="text-red-400">*</span>
                </label>
                {pendingPeriods.length === 0 ? (
                  <p className="text-gray-500 text-sm">No tienes meses pendientes de pago.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {pendingPeriods.map(period => (
                      <label key={period} className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${receiptPeriods.includes(period) ? 'border-green-500 bg-green-900/30' : 'border-logia-700 bg-logia-900/50'}`}>
                        <input type="checkbox" checked={receiptPeriods.includes(period)} onChange={() => handleTogglePeriod(period)} className="accent-green-500" />
                        <span className="text-sm text-white">{formatPeriod(period)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  Fecha y hora de la transferencia <span className="text-red-400">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={receiptTransferDate}
                  onChange={e => setReceiptTransferDate(e.target.value)}
                  className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Monto transferido (opcional)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={receiptAmount}
                  onChange={e => setReceiptAmount(e.target.value)}
                  placeholder="Ej: 250.00"
                  className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  Foto del comprobante <span className="text-red-400">*</span>
                </label>
                <input
                  type="file" accept="image/*" capture="environment"
                  onChange={handleFileChange}
                  className="w-full text-sm text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-bold file:bg-indigo-700 file:text-white hover:file:bg-indigo-600 cursor-pointer"
                  required
                />
                {receiptPreview && (
                  <div className="mt-2">
                    <img src={receiptPreview} alt="Vista previa" className="max-h-40 rounded border border-logia-700 object-contain" />
                  </div>
                )}
              </div>

              <div className="bg-yellow-900/20 border border-yellow-600/30 rounded p-3 text-xs text-yellow-200">
                ⚠️ Enviar este comprobante <strong>no confirma tu pago automáticamente</strong>. El administrador lo revisará y aprobará. Recibirás una notificación cuando sea revisado.
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowReceiptModal(false)} className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingReceipt || receiptPeriods.length === 0}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-bold"
                >
                  {submittingReceipt ? 'Enviando...' : '📤 Enviar Comprobante'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payments;
