import React, { useMemo, useState } from 'react';
import type { PaymentReceipt } from '../types';
import { dataService } from '../services/api';

export interface AdminPaymentEvidenceContext {
  userId: string;
  userName: string;
  period: string;
  feeType: 'regular' | 'extra';
  feeId?: string;
  concept: string;
  targetAmount: number;
  ledgerPaid: number;
}

interface Props {
  groupId: string;
  adminUid: string;
  context: AdminPaymentEvidenceContext;
  receipts: PaymentReceipt[];
  readOnly: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

const normalize = (value?: string) => (value || '').trim().toLocaleLowerCase('es-MX');

const receiptMatches = (receipt: PaymentReceipt, context: AdminPaymentEvidenceContext) => {
  if (receipt.userId !== context.userId) return false;
  const periods = receipt.extraFeePeriod ? [receipt.extraFeePeriod] : (receipt.periods || []);
  if (!periods.includes(context.period)) return false;

  if (context.feeType === 'regular') return receipt.receiptType === 'cuota_mensual';
  if (receipt.receiptType !== 'concepto_adicional') return false;
  if (context.feeId && context.feeId !== 'legacy' && receipt.extraFeeId) {
    return receipt.extraFeeId === context.feeId;
  }
  return normalize(receipt.conceptDescription) === normalize(context.concept);
};

const receiptUrls = (receipt: PaymentReceipt) => {
  const urls = [...(receipt.receiptImageUrls || []), receipt.receiptImageUrl].filter(Boolean) as string[];
  return Array.from(new Set(urls));
};

const AdminPaymentEvidenceModal: React.FC<Props> = ({
  groupId,
  adminUid,
  context,
  receipts,
  readOnly,
  onClose,
  onChanged,
}) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [comments, setComments] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [alreadyIncluded, setAlreadyIncluded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const matchingReceipts = useMemo(
    () => receipts.filter(receipt => receiptMatches(receipt, context))
      .sort((a, b) => (b.transferDate || b.submittedAt || '').localeCompare(a.transferDate || a.submittedAt || '')),
    [receipts, context]
  );

  const approvedExcess = matchingReceipts
    .filter(receipt => receipt.status === 'approved' && !receipt.ledgerIncluded && receipt.appliedAmount !== undefined)
    .reduce((sum, receipt) => sum + Math.max(0, Number(receipt.amount || 0) - Number(receipt.appliedAmount || 0)), 0);

  const target = Math.max(0, Number(context.targetAmount || 0));
  const ledgerPaid = Math.max(0, Number(context.ledgerPaid || 0));
  // Legacy/manual ledgers may already store the full overpayment. In that case
  // the receipt excess is evidence of the same money and must not be added twice.
  const received = ledgerPaid > target ? ledgerPaid : ledgerPaid + approvedExcess;
  const pending = Math.max(0, target - ledgerPaid);
  const excess = Math.max(0, received - target);

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(event.target.files || []));
  };

  const handleSave = async () => {
    if (readOnly || saving) return;
    const numericAmount = amount.trim() === '' ? 0 : Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      setMessage({ type: 'error', text: 'El monto debe ser cero o mayor.' });
      return;
    }
    if (!date) {
      setMessage({ type: 'error', text: 'Indica la fecha real del movimiento.' });
      return;
    }
    if (numericAmount === 0 && !comments.trim() && files.length === 0) {
      setMessage({ type: 'error', text: 'Agrega un monto, comentario o comprobante.' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await dataService.createAdminPaymentReceipt(
        files,
        {
          groupId,
          userId: context.userId,
          userName: context.userName,
          periods: [context.period],
          transferDate: date,
          receiptImageUrl: '',
          receiptImageUrls: [],
          amount: numericAmount,
          receiptType: context.feeType === 'extra' ? 'concepto_adicional' : 'cuota_mensual',
          conceptDescription: context.feeType === 'extra' ? context.concept : undefined,
          extraFeeId: context.feeType === 'extra' ? context.feeId : undefined,
          extraFeePeriod: context.feeType === 'extra' ? context.period : undefined,
          reviewComments: comments.trim() || undefined,
        },
        adminUid,
        alreadyIncluded
      );
      setAmount('');
      setComments('');
      setFiles([]);
      setAlreadyIncluded(false);
      setMessage({ type: 'success', text: numericAmount > 0 ? 'Movimiento registrado.' : 'Nota/evidencia guardada.' });
      await onChanged();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'No se pudo registrar el movimiento.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[130] p-3" onClick={onClose}>
      <div className="bg-logia-800 w-full max-w-4xl max-h-[94vh] overflow-y-auto rounded-xl border border-purple-600/50 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-logia-900 border-b border-logia-700 p-4 flex justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-purple-300 font-bold">Detalle por transacción</p>
            <h3 className="text-lg font-bold text-white">{context.concept}</h3>
            <p className="text-xs text-gray-400">{context.userName} · {context.period} · {context.feeType === 'extra' ? 'Cuota extraordinaria' : 'Cuota mensual'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">×</button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
            <div className="bg-logia-900 border border-logia-700 rounded p-3"><p className="text-[10px] uppercase text-gray-500">Meta / cargo</p><p className="text-lg font-bold text-white">${target.toFixed(2)}</p></div>
            <div className="bg-logia-900 border border-green-700/50 rounded p-3"><p className="text-[10px] uppercase text-gray-500">Aportado real</p><p className="text-lg font-bold text-green-300">${received.toFixed(2)}</p></div>
            <div className="bg-logia-900 border border-red-700/50 rounded p-3"><p className="text-[10px] uppercase text-gray-500">Pendiente</p><p className="text-lg font-bold text-red-300">${pending.toFixed(2)}</p></div>
            <div className="bg-logia-900 border border-orange-700/50 rounded p-3"><p className="text-[10px] uppercase text-gray-500">Excedente</p><p className="text-lg font-bold text-orange-300">${excess.toFixed(2)}</p></div>
          </div>

          {!readOnly && (
            <div className="bg-logia-900/70 border border-logia-700 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="font-bold text-white">➕ Registrar transacción / evidencia</h4>
                <span className="text-[11px] text-gray-500">Puedes guardar solo comentario/foto dejando monto en $0.</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 uppercase block mb-1">Fecha real</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-logia-800 border border-logia-700 rounded p-2 text-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase block mb-1">Monto recibido</label>
                  <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full bg-logia-800 border border-logia-700 rounded p-2 text-white" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase block mb-1">Comentario</label>
                <textarea value={comments} onChange={e => setComments(e.target.value)} rows={2} placeholder="Ej: SPEI, efectivo, depósito parcial, referencia bancaria..." className="w-full bg-logia-800 border border-logia-700 rounded p-2 text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase block mb-1">Fotos / comprobantes</label>
                <input type="file" accept="image/*,application/pdf" multiple onChange={handleFiles} className="w-full text-sm text-gray-300" />
                {files.length > 0 && <p className="text-xs text-green-300 mt-1">{files.length} archivo(s) seleccionado(s)</p>}
              </div>
              <label className="flex items-start gap-2 text-xs text-yellow-200 bg-yellow-900/20 border border-yellow-700/40 rounded p-3 cursor-pointer">
                <input type="checkbox" checked={alreadyIncluded} onChange={e => setAlreadyIncluded(e.target.checked)} className="mt-0.5" />
                <span><strong>Este abono histórico ya estaba incluido en “Pagado”.</strong><br/>Úsalo al desglosar depósitos viejos para agregar fecha/comentario/foto sin volver a sumar el dinero al ledger.</span>
              </label>
              {message && <div className={`text-sm rounded p-2 ${message.type === 'success' ? 'bg-green-900/30 text-green-300 border border-green-700/40' : 'bg-red-900/30 text-red-300 border border-red-700/40'}`}>{message.text}</div>}
              <button onClick={handleSave} disabled={saving} className="w-full bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-bold rounded py-2">
                {saving ? 'Guardando...' : '💾 Guardar transacción'}
              </button>
            </div>
          )}

          <div>
            <h4 className="font-bold text-white mb-2">Historial ({matchingReceipts.length})</h4>
            {matchingReceipts.length === 0 ? (
              <p className="text-sm text-gray-500 bg-logia-900/50 rounded p-4">Todavía no hay transacciones/comprobantes individualizados para este concepto. El acumulado del ledger se conserva intacto.</p>
            ) : (
              <div className="space-y-2">
                {matchingReceipts.map(receipt => {
                  const declared = Number(receipt.amount || 0);
                  const applied = receipt.appliedAmount === undefined ? undefined : Number(receipt.appliedAmount || 0);
                  const receiptExcess = applied === undefined ? undefined : Math.max(0, declared - applied);
                  const urls = receiptUrls(receipt);
                  return (
                    <div key={receipt.id} className="bg-logia-900 border border-logia-700 rounded p-3">
                      <div className="flex justify-between items-start gap-2 flex-wrap">
                        <div>
                          <p className="text-sm font-bold text-white">{receipt.transferDate || receipt.submittedAt?.slice(0, 10) || 'Sin fecha'} · ${declared.toFixed(2)}</p>
                          <p className="text-xs text-gray-400">
                            {receipt.status === 'approved' ? '✅ Aprobado' : receipt.status === 'pending' ? '⏳ Pendiente' : '❌ Rechazado'}
                            {receipt.ledgerIncluded ? ' · Histórico ya incluido' : ''}
                          </p>
                          {applied !== undefined && <p className="text-xs text-gray-400">Aplicado a deuda: <span className="text-green-300">${applied.toFixed(2)}</span>{receiptExcess !== undefined && receiptExcess > 0 ? <span className="text-orange-300"> · Excedente ${receiptExcess.toFixed(2)}</span> : null}</p>}
                          {receipt.reviewComments && <p className="text-xs text-gray-300 mt-1 italic">“{receipt.reviewComments}”</p>}
                        </div>
                        {urls.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {urls.map((url, index) => (
                              <button key={url} onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} className="text-xs bg-blue-900/40 text-blue-300 border border-blue-700/40 rounded px-2 py-1">🧾 {urls.length > 1 ? `Archivo ${index + 1}` : 'Comprobante'}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPaymentEvidenceModal;
