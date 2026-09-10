import React, { useMemo, useState } from 'react';
import type { PaymentMovement, PaymentReceipt } from '../types';
import { paymentMovementService } from '../services/paymentMovements';
import {
  buildContributionSummary,
  movementApplicationMatches,
  receiptMatchesContribution,
  type ContributionContext,
} from '../services/paymentMovementAccounting';

export type PaymentMovementContext = ContributionContext & {
  userName: string;
  concept: string;
  targetAmount: number;
  ledgerPaid: number;
};

type Props = {
  groupId: string;
  adminUid: string;
  context: PaymentMovementContext;
  movements: PaymentMovement[];
  receipts: PaymentReceipt[];
  readOnly: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

const money = (value: unknown) => Number(value || 0).toLocaleString('es-MX', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PaymentMovementModal: React.FC<Props> = ({
  groupId,
  adminUid,
  context,
  movements,
  receipts,
  readOnly,
  onClose,
  onChanged,
}) => {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [comments, setComments] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [historicalIncluded, setHistoricalIncluded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const scopedMovements = useMemo(
    () => movements.filter(item => movementApplicationMatches(item, context)),
    [movements, context.userId, context.period, context.feeType, context.feeId, context.concept]
  );
  const scopedReceipts = useMemo(
    () => receipts.filter(item => receiptMatchesContribution(item, context)),
    [receipts, context.userId, context.period, context.feeType, context.feeId, context.concept]
  );
  const summary = useMemo(() => buildContributionSummary({
    targetAmount: context.targetAmount,
    ledgerPaid: context.ledgerPaid,
    movements,
    receipts,
    context,
  }), [context, movements, receipts]);

  const handleCreate = async () => {
    if (readOnly) return;
    const numericAmount = Number(amount || 0);
    if ((!numericAmount || numericAmount < 0) && !comments.trim() && files.length === 0) {
      setMessage({ type: 'error', text: 'Indica un monto o agrega un comentario/comprobante.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const movement = await paymentMovementService.createAdminMovement({
        groupId,
        userId: context.userId,
        userName: context.userName,
        period: context.period,
        feeType: context.feeType,
        feeId: context.feeId,
        concept: context.concept,
        amount: numericAmount,
        date,
        comments,
        files,
        historicalIncluded,
        createdBy: adminUid,
      });
      setAmount('');
      setComments('');
      setFiles([]);
      setHistoricalIncluded(false);
      setMessage({
        type: 'success',
        text: movement.kind === 'note'
          ? 'Nota/evidencia guardada.'
          : `Movimiento guardado: $${money(movement.amount)} recibido, $${money(movement.appliedAmount)} aplicado${movement.excessAmount > 0 ? `, $${money(movement.excessAmount)} excedente` : ''}.`,
      });
      await onChanged();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'No se pudo guardar el movimiento.' });
    } finally {
      setSaving(false);
    }
  };

  const setReconciliation = async (movement: PaymentMovement, status: 'pending' | 'matched' | 'difference') => {
    if (readOnly) return;
    const reference = status === 'pending'
      ? ''
      : (window.prompt('Referencia del estado de cuenta / banco:', movement.bankReference || '') ?? movement.bankReference ?? '');
    try {
      await paymentMovementService.updateMovementReconciliation(groupId, movement.id, status, reference, adminUid);
      await onChanged();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'No se pudo actualizar la conciliación.' });
    }
  };

  const editMetadata = async (movement: PaymentMovement) => {
    if (readOnly) return;
    const nextDate = window.prompt('Fecha del movimiento (YYYY-MM-DD):', movement.date) ?? movement.date;
    const nextComments = window.prompt('Comentario:', movement.comments || '') ?? (movement.comments || '');
    try {
      await paymentMovementService.updateMovementMetadata(groupId, movement.id, {
        date: nextDate,
        comments: nextComments,
      });
      await onChanged();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'No se pudo editar el movimiento.' });
    }
  };

  const linkedMovementReceiptIds = new Set(scopedMovements.map(item => item.receiptId).filter(Boolean));
  const historicalReceipts = scopedReceipts.filter(receipt => !linkedMovementReceiptIds.has(receipt.id));

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[130] p-3" onClick={onClose}>
      <div className="bg-logia-800 w-full max-w-4xl max-h-[94vh] overflow-y-auto rounded-xl border border-purple-600/50 shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-logia-900 border-b border-logia-700 p-4 flex justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-purple-300 font-bold">Movimientos por concepto</p>
            <h3 className="text-lg font-bold text-white">{context.concept}</h3>
            <p className="text-xs text-gray-400">{context.userName} · {context.period} · {context.feeType === 'extra' ? 'Cuota extraordinaria' : 'Cuota mensual'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl h-fit">×</button>
        </div>

        <div className="p-4 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-lg bg-logia-900 border border-logia-700 p-3">
              <p className="text-[10px] uppercase text-gray-500">Meta / cargo</p>
              <p className="text-lg font-bold text-white">${money(summary.target)}</p>
            </div>
            <div className="rounded-lg bg-logia-900 border border-blue-800 p-3">
              <p className="text-[10px] uppercase text-blue-400">Aportado real</p>
              <p className="text-lg font-bold text-blue-300">${money(summary.received)}</p>
            </div>
            <div className="rounded-lg bg-logia-900 border border-red-900 p-3">
              <p className="text-[10px] uppercase text-gray-500">Pendiente</p>
              <p className="text-lg font-bold text-red-300">${money(summary.pending)}</p>
            </div>
            <div className={`rounded-lg bg-logia-900 border p-3 ${summary.excess > 0 ? 'border-orange-700' : 'border-logia-700'}`}>
              <p className="text-[10px] uppercase text-gray-500">Excedente / aportación extra</p>
              <p className={`text-lg font-bold ${summary.excess > 0 ? 'text-orange-300' : 'text-gray-400'}`}>${money(summary.excess)}</p>
            </div>
          </div>

          {!readOnly && (
            <div className="rounded-xl border border-purple-700/40 bg-purple-950/20 p-4 space-y-3">
              <div>
                <h4 className="font-bold text-white">Agregar abono, comentario o evidencia</h4>
                <p className="text-xs text-gray-400">Cada registro conserva su propia fecha y comprobante para poder compararlo contra el estado de cuenta.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Monto recibido</label>
                  <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white" />
                  <p className="text-[10px] text-gray-500 mt-1">Puede ser mayor que la deuda. El exceso queda ligado a este mismo concepto.</p>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Fecha real del abono</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Comentario</label>
                <textarea value={comments} onChange={e => setComments(e.target.value)} rows={2} placeholder="Ej. Transferencia Mercado Pago, efectivo, referencia, quién entregó..." className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Fotos / comprobantes</label>
                <input type="file" multiple accept="image/*,application/pdf" onChange={e => setFiles(Array.from(e.target.files || []))} className="w-full text-xs text-gray-300 file:bg-purple-700 file:text-white file:border-0 file:rounded file:px-3 file:py-2" />
                {files.length > 0 && <p className="text-xs text-gray-400 mt-1">{files.length} archivo(s) seleccionado(s)</p>}
              </div>
              <label className="flex gap-2 items-start rounded-lg bg-logia-900/70 border border-yellow-800/50 p-3 cursor-pointer">
                <input type="checkbox" checked={historicalIncluded} onChange={e => setHistoricalIncluded(e.target.checked)} className="mt-0.5" />
                <span className="text-xs text-gray-300">
                  <strong className="text-yellow-300">Este abono histórico ya estaba incluido en “Pagado”.</strong><br />
                  Úsalo al desglosar pagos viejos en varias fechas. El sistema crea la transacción para conciliación pero no vuelve a incrementar el acumulado.
                </span>
              </label>
              {message && <div className={`rounded p-2 text-sm ${message.type === 'success' ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>{message.text}</div>}
              <button onClick={handleCreate} disabled={saving} className="w-full bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-bold rounded py-2.5">
                {saving ? 'Guardando...' : '＋ Guardar movimiento / evidencia'}
              </button>
            </div>
          )}

          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-bold text-white">Movimientos identificados</h4>
              <span className="text-xs text-gray-500">{scopedMovements.length}</span>
            </div>
            {scopedMovements.length === 0 ? (
              <div className="rounded-lg border border-logia-700 bg-logia-900/50 p-4 text-sm text-gray-500">
                Todavía no hay movimientos individuales. El monto histórico sigue conservado en el acumulado y no se modifica.
              </div>
            ) : (
              <div className="space-y-2">
                {scopedMovements.map(movement => (
                  <div key={movement.id} className="rounded-lg border border-logia-700 bg-logia-900/70 p-3">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <p className="font-bold text-white">{movement.kind === 'note' ? '📝 Nota / evidencia' : `💵 $${money(movement.amount)}`}</p>
                        <p className="text-xs text-gray-400">{movement.date} · aplicado ${money(movement.appliedAmount)}{movement.excessAmount > 0 ? ` · extra ${money(movement.excessAmount)}` : ''}</p>
                        {movement.ledgerDeltaAmount === 0 && Number(movement.ledgerOffsetAmount || 0) > 0 && (
                          <p className="text-[10px] text-yellow-400">Histórico: ya estaba incluido en el acumulado.</p>
                        )}
                        {movement.comments && <p className="text-sm text-gray-300 mt-1">{movement.comments}</p>}
                        {movement.bankReference && <p className="text-xs text-blue-300 mt-1">Ref. banco: {movement.bankReference}</p>}
                      </div>
                      <div className="flex flex-wrap gap-1 h-fit">
                        <button onClick={() => editMetadata(movement)} disabled={readOnly} className="text-[10px] px-2 py-1 rounded bg-logia-700 text-gray-200 disabled:opacity-40">✏️ Datos</button>
                        <button onClick={() => setReconciliation(movement, movement.reconciliationStatus === 'matched' ? 'pending' : 'matched')} disabled={readOnly} className={`text-[10px] px-2 py-1 rounded ${movement.reconciliationStatus === 'matched' ? 'bg-blue-700 text-white' : 'bg-slate-700 text-gray-200'} disabled:opacity-40`}>
                          {movement.reconciliationStatus === 'matched' ? '✅ Conciliado' : '🏦 Conciliar'}
                        </button>
                        <button onClick={() => setReconciliation(movement, 'difference')} disabled={readOnly} className="text-[10px] px-2 py-1 rounded bg-orange-900/60 text-orange-200 disabled:opacity-40">⚠️ Diferencia</button>
                      </div>
                    </div>
                    {(movement.receiptUrls || []).length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(movement.receiptUrls || []).map((url, index) => (
                          <button key={`${movement.id}-${index}`} onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} className="text-[10px] px-2 py-1 rounded bg-blue-900/50 border border-blue-700 text-blue-200">
                            🧾 Comprobante {index + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {historicalReceipts.length > 0 && (
            <div className="rounded-xl border border-blue-900/60 bg-blue-950/20 p-3">
              <h4 className="text-sm font-bold text-blue-200 mb-2">Comprobantes aprobados anteriores al nuevo historial</h4>
              <p className="text-xs text-gray-400 mb-2">Se usan como evidencia para mostrar el total aportado cuando es mayor que el acumulado aplicado, pero no se convierten automáticamente en depósitos para evitar duplicar históricos.</p>
              <div className="space-y-1">
                {historicalReceipts.map(receipt => (
                  <div key={receipt.id} className="flex flex-wrap justify-between gap-2 text-xs bg-logia-900/60 rounded p-2">
                    <span className="text-gray-300">{(receipt.transferDate || '').slice(0, 10) || 'Sin fecha'} · ${money(receipt.amount)}</span>
                    <span className="text-gray-500">Aplicado: ${money(receipt.appliedAmount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentMovementModal;
