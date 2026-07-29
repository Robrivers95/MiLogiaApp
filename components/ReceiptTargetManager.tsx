import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Payment, PaymentReceipt, User } from '../types';

interface Props { user: User; currentView: string; }
interface ExtraOption { key: string; period: string; feeId: string; description: string; balance: number; }

const ReceiptTargetManager: React.FC<Props> = ({ user, currentView }) => {
  const canEdit = user.role === 'admin' || user.role === 'master';
  const [open, setOpen] = useState(false);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [selectedReceiptId, setSelectedReceiptId] = useState('');
  const [options, setOptions] = useState<ExtraOption[]>([]);
  const [selectedTarget, setSelectedTarget] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!canEdit || currentView !== 'admin') return;
    const attach = () => {
      const heading = Array.from(document.querySelectorAll<HTMLElement>('h3')).find(node => node.textContent?.includes('Revisar Comprobantes'));
      if (!heading || heading.parentElement?.querySelector('[data-target-manager]')) return;
      const btn = document.createElement('button');
      btn.dataset.targetManager = 'true';
      btn.textContent = '🎯 Corregir cuota destino';
      btn.className = 'ml-2 bg-purple-700 hover:bg-purple-600 text-white px-3 py-1.5 rounded text-xs font-bold';
      btn.onclick = () => setOpen(true);
      heading.parentElement?.appendChild(btn);
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [canEdit, currentView]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const snap = await getDocs(collection(db, 'groups', user.groupId, 'paymentReceipts'));
      setReceipts(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<PaymentReceipt, 'id'>) }))
        .filter(r => r.status === 'pending' && r.receiptType === 'concepto_adicional')
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)));
    })();
  }, [open, user.groupId]);

  useEffect(() => {
    if (!selectedReceiptId) { setOptions([]); return; }
    const receipt = receipts.find(r => r.id === selectedReceiptId);
    if (!receipt) return;
    void (async () => {
      const ledger = await getDocs(collection(db, 'users', receipt.userId, 'ledger'));
      const rows: ExtraOption[] = [];
      ledger.docs.forEach(d => {
        const p = d.data() as Payment;
        (p.extraFees || []).forEach(f => {
          const balance = f.forgiven ? 0 : Math.max(0, Number(f.amount) - Number(f.paid || 0));
          if (balance > 0) rows.push({ key: `${d.id}::${f.id}`, period: d.id, feeId: f.id, description: f.description, balance });
        });
      });
      rows.sort((a, b) => a.period.localeCompare(b.period));
      setOptions(rows);
      const current = rows.find(o => o.feeId === (receipt.targetExtraFeeId || receipt.conceptId));
      setSelectedTarget(current?.key || rows[0]?.key || '');
    })();
  }, [selectedReceiptId, receipts]);

  const selectedReceipt = useMemo(() => receipts.find(r => r.id === selectedReceiptId), [receipts, selectedReceiptId]);

  const save = async () => {
    const target = options.find(o => o.key === selectedTarget);
    if (!selectedReceipt || !target) return;
    await updateDoc(doc(db, 'groups', selectedReceipt.groupId, 'paymentReceipts', selectedReceipt.id), {
      periods: [target.period],
      conceptDescription: target.description,
      conceptId: target.feeId,
      targetExtraFeeId: target.feeId,
      targetExtraFeePeriod: target.period,
    });
    setMessage('Destino corregido. Ya puedes aprobar el comprobante.');
    setReceipts(prev => prev.map(r => r.id === selectedReceipt.id ? { ...r, periods: [target.period], conceptDescription: target.description, conceptId: target.feeId, targetExtraFeeId: target.feeId, targetExtraFeePeriod: target.period } : r));
  };

  if (!open) return null;
  return <div className="fixed inset-0 z-[110] bg-black/80 p-3 overflow-y-auto">
    <div className="max-w-xl mx-auto mt-10 rounded-2xl border border-purple-500/40 bg-logia-900 p-4 text-white space-y-4">
      <div className="flex justify-between"><div><h2 className="text-lg font-bold">🎯 Corregir cuota destino</h2><p className="text-xs text-gray-400">Selecciona el comprobante y la cuota extraordinaria correcta antes de aprobar.</p></div><button onClick={() => setOpen(false)}>✕</button></div>
      {message && <p className="rounded bg-green-900/30 p-2 text-sm text-green-300">{message}</p>}
      <label className="block text-sm">Comprobante pendiente
        <select className="mt-1 w-full rounded bg-logia-800 p-2" value={selectedReceiptId} onChange={e => setSelectedReceiptId(e.target.value)}>
          <option value="">Seleccionar</option>
          {receipts.map(r => <option key={r.id} value={r.id}>{r.userName} · ${Number(r.amount || 0).toFixed(2)} · {r.conceptDescription || 'Sin concepto'}</option>)}
        </select>
      </label>
      {selectedReceipt && <label className="block text-sm">Aplicar primero a
        <select className="mt-1 w-full rounded bg-logia-800 p-2" value={selectedTarget} onChange={e => setSelectedTarget(e.target.value)}>
          {options.map(o => <option key={o.key} value={o.key}>{o.period} · {o.description} · pendiente ${o.balance.toFixed(2)}</option>)}
        </select>
      </label>}
      <p className="text-xs text-gray-400">Si el monto excede esa cuota, el sobrante se aplicará a otras cuotas extraordinarias pendientes, de la más antigua a la más reciente. El excedente final quedará registrado en el comprobante.</p>
      <div className="flex gap-2"><button onClick={() => setOpen(false)} className="flex-1 rounded bg-gray-700 py-2">Cerrar</button><button onClick={() => void save()} disabled={!selectedTarget} className="flex-1 rounded bg-purple-700 py-2 font-bold disabled:opacity-40">Guardar destino</button></div>
    </div>
  </div>;
};

export default ReceiptTargetManager;
