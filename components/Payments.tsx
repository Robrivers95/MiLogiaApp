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
  receiptImageBase64?: string;
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

  // Year filter: current year ± 1 (3 years total)
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const availableYears = [currentYear - 1, currentYear, currentYear + 1];

  // Comprobante state
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptType, setReceiptType] = useState<'cuota_mensual' | 'concepto_adicional'>('cuota_mensual');
  const [conceptDescription, setConceptDescription] = useState('');
  const [receiptPeriods, setReceiptPeriods] = useState<string[]>([]);
  const [receiptTransferDate, setReceiptTransferDate] = useState('');
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);         // múltiples archivos
  const [receiptPreviews, setReceiptPreviews] = useState<string[]>([]);  // previews
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
      comments: payment.comments,
      receiptImageBase64: payment.receiptImageBase64
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

  // Filter rows by selected year
  const filteredRows = allRows.filter(r => r.period.startsWith(String(selectedYear)));

  const summary = {
    totalRegularDebt: allRows.filter(r => r.isMainRow).reduce((s, r) => s + r.regularBalance, 0),
    totalExtraDebt: allRows.reduce((s, r) => s + r.extraBalance, 0),
    totalDebt: allRows.reduce((s, r) => s + r.totalBalance, 0),
    pendingCount: allRows.filter(r => r.isMainRow && r.totalBalance > 0).length
  };

  // All months for cuota_mensual — incluye todos los meses del año seleccionado + los de años anteriores registrados
  const currentPeriod = new Date().toISOString().slice(0, 7);
  const allPeriods = Array.from(new Set([
    ...payments.map(p => p.period),
    currentPeriod,
    // Generar todos los meses del año seleccionado para que el usuario pueda pagar por adelantado
    ...Array.from({ length: 12 }, (_, i) => `${selectedYear}-${String(i + 1).padStart(2, '0')}`)
  ])).sort().reverse();

  // pendingPeriods only used as quick-filter label now; modal shows allPeriods for cuota_mensual too
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

  // Multiple receipts per period
  const receiptsByPeriod = (period: string): PaymentReceipt[] =>
    receipts.filter(r => r.periods.includes(period));

  // For the badge: show latest status
  const latestReceiptByPeriod = (period: string): PaymentReceipt | undefined => {
    const recs = receiptsByPeriod(period);
    return recs.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
  };

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>, append = false) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    const newFiles = append ? [...receiptFiles, ...selected] : selected;
    setReceiptFiles(newFiles);
    // Generate previews for image files
    const previewPromises = newFiles.map(f =>
      f.type.startsWith('image/') ? new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(f);
      }) : Promise.resolve('')
    );
    Promise.all(previewPromises).then(setReceiptPreviews);
    // Reset input value so the same file can be re-selected
    e.target.value = '';
  };

  const removeReceiptFile = (idx: number) => {
    setReceiptFiles(prev => prev.filter((_, i) => i !== idx));
    setReceiptPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleTogglePeriod = (period: string) => {
    setReceiptPeriods(prev =>
      prev.includes(period) ? prev.filter(p => p !== period) : [...prev, period]
    );
  };

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (receiptFiles.length === 0 || !receiptTransferDate) {
      setReceiptMsg({ text: 'Adjunta al menos un comprobante y la fecha de transferencia.', type: 'error' });
      return;
    }
    if (receiptType === 'cuota_mensual' && receiptPeriods.length === 0) {
      setReceiptMsg({ text: 'Selecciona al menos un mes para pagar.', type: 'error' });
      return;
    }
    if (receiptType === 'concepto_adicional' && !conceptDescription.trim()) {
      setReceiptMsg({ text: 'Escribe la descripción del concepto.', type: 'error' });
      return;
    }
    if (!user.groupId) {
      setReceiptMsg({ text: 'Error: tu cuenta no está asociada a un grupo. Contacta al administrador.', type: 'error' });
      return;
    }
    setSubmittingReceipt(true);
    try {
      await dataService.submitPaymentReceipt(receiptFiles, {
        groupId: user.groupId,
        userId: user.uid,
        userName: user.name || user.email,
        periods: receiptPeriods,
        transferDate: receiptTransferDate,
        receiptImageUrl: '',
        amount: receiptAmount ? Number(receiptAmount) : undefined,
        receiptType,
        conceptDescription: receiptType === 'concepto_adicional' ? conceptDescription.trim() : undefined,
        status: 'pending',
        submittedAt: new Date().toISOString()
      });
      setReceiptMsg({ text: '✅ Comprobante enviado. El administrador lo revisará pronto.', type: 'success' });
      setReceiptPeriods([]);
      setReceiptTransferDate('');
      setReceiptFiles([]);
      setReceiptPreviews([]);
      setReceiptAmount('');
      setReceiptType('cuota_mensual');
      setConceptDescription('');
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
        <>
          {/* Year selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 uppercase font-bold">Año:</span>
            {availableYears.map(y => (
              <button key={y} onClick={() => setSelectedYear(y)}
                className={`px-4 py-1 rounded-full text-sm font-bold transition-colors ${selectedYear === y ? 'bg-indigo-700 text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700 border border-logia-700'}`}>
                {y}
              </button>
            ))}
          </div>

          {/* Payment status grid */}
          {(() => {
            const months = Array.from({ length: 12 }, (_, i) => {
              const m = String(i + 1).padStart(2, '0');
              return `${selectedYear}-${m}`;
            });
            return (
              <div className="bg-logia-800/60 rounded-xl p-4 border border-logia-700">
                <p className="text-xs font-bold text-gray-400 uppercase mb-3">Línea de pagos {selectedYear}</p>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                  {months.map(period => {
                    const pmt = payments.find(p => p.period === period);
                    const reg = pmt ? (pmt.paidRegular !== undefined ? pmt.paidRegular : (Number(pmt.paid) || 0)) : 0;
                    const bal = pmt ? (pmt.amount - reg) : null;
                    const label = MONTH_NAMES[parseInt(period.slice(5)) - 1].slice(0, 3);
                    let color = 'bg-logia-900 text-gray-600 border-logia-700';
                    let title = `${label}: Sin registro`;
                    if (pmt) {
                      if (bal !== null && bal <= 0) { color = 'bg-green-700 text-green-100 border-green-600'; title = `${label}: Pagado`; }
                      else if (reg > 0) { color = 'bg-yellow-700 text-yellow-100 border-yellow-600'; title = `${label}: Parcial ($${bal?.toFixed(2)} pendiente)`; }
                      else { color = 'bg-red-800 text-red-200 border-red-700'; title = `${label}: Pendiente ($${pmt.amount})`; }
                    }
                    return (
                      <div key={period} title={title}
                        className={`rounded border p-1 text-center text-[10px] font-bold cursor-default select-none ${color}`}>
                        {label}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-3 mt-2 text-[10px] text-gray-400 flex-wrap">
                  <span><span className="inline-block w-3 h-3 rounded bg-green-700 mr-1 align-middle"></span>Pagado</span>
                  <span><span className="inline-block w-3 h-3 rounded bg-yellow-700 mr-1 align-middle"></span>Parcial</span>
                  <span><span className="inline-block w-3 h-3 rounded bg-red-800 mr-1 align-middle"></span>Pendiente</span>
                  <span><span className="inline-block w-3 h-3 rounded bg-logia-900 mr-1 align-middle border border-logia-700"></span>Sin registro</span>
                </div>
              </div>
            );
          })()}

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
            {filteredRows.length === 0 ? (
              <p className="text-center text-gray-500 py-6 text-sm">Sin registros para {selectedYear}</p>
            ) : filteredRows.map((row, idx) => {
              const isExpanded = expandedPeriods.has(row.period);
              const receipt = row.isMainRow ? latestReceiptByPeriod(row.period) : undefined;
              const allPeriodReceipts = row.isMainRow ? receiptsByPeriod(row.period) : [];
              const hasDetails = row.isMainRow && (row.paymentDate || row.comments || row.extraFee || allPeriodReceipts.length > 0 || receipt);

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

                        {allPeriodReceipts.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-gray-300 uppercase">📄 Comprobantes Enviados ({allPeriodReceipts.length})</p>
                            {allPeriodReceipts.sort((a,b) => b.submittedAt.localeCompare(a.submittedAt)).map((r) => (
                              <div key={r.id} className={`p-3 rounded border ${r.status === 'approved' ? 'border-green-600/40 bg-green-900/20' : r.status === 'rejected' ? 'border-red-600/40 bg-red-900/20' : 'border-yellow-600/40 bg-yellow-900/20'}`}>
                                <div className="flex items-center justify-between mb-1">
                                  {statusBadge(r)}
                                  <span className="text-xs text-gray-500">{new Date(r.submittedAt).toLocaleDateString('es-ES')}</span>
                                </div>
                                <p className="text-xs text-gray-400">
                                  Transferencia: <span className="text-white">{new Date(r.transferDate).toLocaleString('es-ES')}</span>
                                </p>
                                {r.amount && (
                                  <p className="text-xs text-gray-400">
                                    Monto: <span className="text-white font-bold">${Number(r.amount).toFixed(2)}</span>
                                  </p>
                                )}
                                {r.reviewComments && (
                                  <p className="text-xs text-red-300 mt-1">"{r.reviewComments}"</p>
                                )}
                                {r.receiptImageUrl && (
                                  <div className="mt-2">
                                    <img
                                      src={r.receiptImageUrl}
                                      alt="Comprobante"
                                      className="max-w-full rounded border border-logia-700 max-h-48 object-contain cursor-pointer"
                                      onClick={() => window.open(r.receiptImageUrl, '_blank')}
                                    />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Admin-attached receipt (stored directly on payment record).
                            Only show this if the member's PaymentReceipt entry doesn't already
                            display the same image (to avoid showing the same comprobante twice). */}
                        {row.receiptImageBase64 && !receipt?.receiptImageBase64 && (
                          <div className="p-3 rounded border border-blue-600/40 bg-blue-900/10">
                            <span className="text-xs font-bold text-blue-300 uppercase block mb-2">🧾 Comprobante Registrado por Admin</span>
                            {row.receiptImageBase64.startsWith('data:application/pdf') ? (
                              <a href={row.receiptImageBase64} target="_blank" rel="noreferrer" className="text-xs text-blue-400 underline">
                                📄 Ver PDF
                              </a>
                            ) : (
                              <div>
                                <img
                                  src={row.receiptImageBase64}
                                  alt="Comprobante admin"
                                  className="max-w-full rounded border border-logia-700 max-h-48 object-contain cursor-pointer"
                                  onClick={() => window.open(row.receiptImageBase64, '_blank')}
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
        </>
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

              {/* Tipo de pago */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  Tipo de pago <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center gap-2 p-3 rounded border cursor-pointer transition-colors ${receiptType === 'cuota_mensual' ? 'border-indigo-500 bg-indigo-900/30' : 'border-logia-700 bg-logia-900/50'}`}>
                    <input type="radio" name="receiptType" value="cuota_mensual" checked={receiptType === 'cuota_mensual'}
                      onChange={() => { setReceiptType('cuota_mensual'); setReceiptPeriods([]); }} className="accent-indigo-500" />
                    <div>
                      <span className="text-sm font-bold text-white block">📅 Cuota Mensual</span>
                      <span className="text-xs text-gray-400">Pago de mensualidad regular</span>
                    </div>
                  </label>
                  <label className={`flex items-center gap-2 p-3 rounded border cursor-pointer transition-colors ${receiptType === 'concepto_adicional' ? 'border-purple-500 bg-purple-900/30' : 'border-logia-700 bg-logia-900/50'}`}>
                    <input type="radio" name="receiptType" value="concepto_adicional" checked={receiptType === 'concepto_adicional'}
                      onChange={() => { setReceiptType('concepto_adicional'); setReceiptPeriods([]); }} className="accent-purple-500" />
                    <div>
                      <span className="text-sm font-bold text-white block">💡 Concepto Adicional</span>
                      <span className="text-xs text-gray-400">Cuota extra, evento, etc.</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Descripción (solo para concepto adicional) */}
              {receiptType === 'concepto_adicional' && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                    Descripción del concepto <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={conceptDescription}
                    onChange={e => setConceptDescription(e.target.value)}
                    placeholder="Ej: Cena anual, evento especial, cuota extraordinaria..."
                    className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                  />
                </div>
              )}

              {/* Selección de meses */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  {receiptType === 'cuota_mensual'
                    ? <>Meses que estás pagando <span className="text-red-400">*</span></>
                    : 'Período al que corresponde (opcional)'}
                </label>
                {receiptType === 'cuota_mensual' && allPeriods.length === 0 ? (
                  <p className="text-gray-500 text-sm bg-logia-900/50 p-3 rounded border border-logia-700">No hay períodos disponibles.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {(allPeriods).map(period => {
                      const isPending = pendingPeriods.includes(period);
                      return (
                      <label key={period} className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${receiptPeriods.includes(period)
                        ? (receiptType === 'cuota_mensual' ? 'border-green-500 bg-green-900/30' : 'border-purple-500 bg-purple-900/30')
                        : 'border-logia-700 bg-logia-900/50'}`}>
                        <input type="checkbox" checked={receiptPeriods.includes(period)} onChange={() => handleTogglePeriod(period)}
                          className={receiptType === 'cuota_mensual' ? 'accent-green-500' : 'accent-purple-500'} />
                        <span className="text-sm text-white">{formatPeriod(period)}</span>
                        {receiptType === 'cuota_mensual' && isPending && (
                          <span className="text-[9px] text-red-400 font-bold ml-auto">⚠️ pendiente</span>
                        )}
                      </label>
                      );
                    })}
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
                {receiptType === 'cuota_mensual' && receiptPeriods.length > 1 && receiptAmount && (
                  <p className="text-xs text-gray-500 mt-1">💡 El monto se distribuirá cronológicamente: primero los meses más antiguos.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                  Comprobantes <span className="text-red-400">*</span>
                  <span className="text-gray-500 normal-case font-normal ml-1">(puedes adjuntar varios)</span>
                </label>

                {/* Botones Cámara / Archivos */}
                <div className="flex gap-2 mb-3">
                  <label className="flex-1 flex items-center justify-center gap-2 bg-indigo-800 hover:bg-indigo-700 text-white text-sm font-bold py-2 px-3 rounded cursor-pointer">
                    📷 Cámara
                    <input type="file" accept="image/*" capture="environment"
                      className="hidden"
                      onChange={e => handleFilesChange(e, true)} />
                  </label>
                  <label className="flex-1 flex items-center justify-center gap-2 bg-logia-700 hover:bg-logia-600 text-white text-sm font-bold py-2 px-3 rounded cursor-pointer border border-logia-600">
                    📁 Archivos
                    <input type="file" accept="image/*,application/pdf" multiple
                      className="hidden"
                      onChange={e => handleFilesChange(e, true)} />
                  </label>
                </div>

                {/* Lista de archivos seleccionados */}
                {receiptFiles.length > 0 && (
                  <div className="space-y-2">
                    {receiptFiles.map((f, idx) => (
                      <div key={idx} className="flex items-start gap-2 bg-logia-900 rounded p-2 border border-logia-700">
                        {receiptPreviews[idx] ? (
                          <img src={receiptPreviews[idx]} alt={`Comprobante ${idx+1}`}
                            className="w-16 h-16 object-cover rounded border border-logia-600 flex-shrink-0" />
                        ) : (
                          <div className="w-16 h-16 flex items-center justify-center bg-logia-800 rounded border border-logia-600 flex-shrink-0 text-2xl">📄</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white truncate">{f.name}</p>
                          <p className="text-xs text-gray-500">{(f.size / 1024).toFixed(0)} KB</p>
                        </div>
                        <button type="button" onClick={() => removeReceiptFile(idx)}
                          className="text-red-400 hover:text-red-300 text-lg font-bold flex-shrink-0">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-yellow-900/20 border border-yellow-600/30 rounded p-3 text-xs text-yellow-200">
                ⚠️ El administrador revisará y aprobará el comprobante. Recibirás una notificación.
                {receiptType === 'cuota_mensual' && ' Al ser aprobado, tu saldo se actualizará automáticamente.'}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowReceiptModal(false)} className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded font-bold">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingReceipt}
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
