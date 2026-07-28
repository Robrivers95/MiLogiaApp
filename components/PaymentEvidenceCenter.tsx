import React, { useEffect, useMemo, useState } from 'react';
import { User, Payment, ExtraFee, IndividualExtraFee, PaymentReceipt } from '../types';
import { db, storage } from '../services/firebase';
import { collection, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

interface Props { user: User; currentView: string; }

type EvidenceItem = { url: string; label: string; source: 'member' | 'admin' | 'legacy'; createdAt?: string };
type ConceptRow = ExtraFee & { discovered?: boolean };

const safeKey = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const conceptKey = (period: string, description: string, amount: number) => `${period}__${safeKey(description)}__${Number(amount).toFixed(2)}`;

const PaymentEvidenceCenter: React.FC<Props> = ({ user, currentView }) => {
  const canEdit = user.role === 'admin' || user.role === 'master';
  const canInspectAll = canEdit || user.role === 'viewer';
  const visibleInCurrentArea = currentView === 'admin' || currentView === 'payments';
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUid, setSelectedUid] = useState(user.uid);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [concepts, setConcepts] = useState<ConceptRow[]>([]);
  const [selectedConceptId, setSelectedConceptId] = useState('');
  const [filesByTarget, setFilesByTarget] = useState<Record<string, File[]>>({});
  const [message, setMessage] = useState('');

  const selectedUser = useMemo(() => users.find(item => item.uid === selectedUid) || user, [users, selectedUid, user]);

  const loadUsers = async () => {
    if (!canInspectAll) { setUsers([user]); setSelectedUid(user.uid); return; }
    const snap = await getDocs(collection(db, 'users'));
    const list = snap.docs.map(d => ({ ...(d.data() as User), uid: d.id })).filter(item => item.groupId === user.groupId);
    setUsers(list.sort((a, b) => a.name.localeCompare(b.name)));
    if (!list.some(item => item.uid === selectedUid)) setSelectedUid(list[0]?.uid || user.uid);
  };

  const loadConcepts = async () => {
    const snap = await getDocs(collection(db, 'extraFees'));
    const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ExtraFee, 'id'>) })).filter(item => item.groupId === user.groupId);
    setConcepts(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  };

  const loadMember = async (uid: string) => {
    setLoading(true);
    try {
      const [ledgerSnap, receiptsSnap] = await Promise.all([
        getDocs(collection(db, 'users', uid, 'ledger')),
        getDocs(collection(db, 'paymentReceipts')),
      ]);
      const ledger = ledgerSnap.docs.map(d => ({ ...(d.data() as Payment), period: d.id })).sort((a, b) => b.period.localeCompare(a.period));
      const receiptList = receiptsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<PaymentReceipt, 'id'>) }))
        .filter(item => item.groupId === user.groupId && item.userId === uid);
      setPayments(ledger);
      setReceipts(receiptList);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (open) void Promise.all([loadUsers(), loadConcepts()]); }, [open]);
  useEffect(() => { if (open && selectedUid) void loadMember(selectedUid); }, [open, selectedUid]);

  const regularEvidence = (payment: Payment): EvidenceItem[] => {
    const list: EvidenceItem[] = [];
    (payment.regularReceiptUrls || []).forEach(url => list.push({ url, label: 'Adjunto administrativo', source: 'admin' }));
    if (payment.adminReceiptUrl && !list.some(item => item.url === payment.adminReceiptUrl)) list.push({ url: payment.adminReceiptUrl, label: 'Comprobante administrativo anterior', source: 'legacy' });
    if (payment.receiptImageBase64 && !list.some(item => item.url === payment.receiptImageBase64)) list.push({ url: payment.receiptImageBase64, label: 'Comprobante anterior', source: 'legacy' });
    receipts.filter(r => r.receiptType === 'cuota_mensual' && r.periods.includes(payment.period)).forEach(r => {
      const urls = r.receiptImageUrls?.length ? r.receiptImageUrls : [r.receiptImageUrl].filter(Boolean);
      urls.forEach(url => list.push({ url, label: `Subido por el miembro · ${r.status}`, source: 'member', createdAt: r.submittedAt }));
    });
    return list;
  };

  const extraEvidence = (payment: Payment, fee: IndividualExtraFee): EvidenceItem[] => {
    const list = (fee.receiptUrls || []).map(url => ({ url, label: 'Comprobante de cuota extraordinaria', source: 'admin' as const }));
    receipts.filter(r => r.receiptType === 'concepto_adicional' && r.periods.includes(payment.period) && safeKey(r.conceptDescription || '') === safeKey(fee.description)).forEach(r => {
      const urls = r.receiptImageUrls?.length ? r.receiptImageUrls : [r.receiptImageUrl].filter(Boolean);
      urls.forEach(url => list.push({ url, label: `Subido por el miembro · ${r.status}`, source: 'member', createdAt: r.submittedAt }));
    });
    return list;
  };

  const uploadFiles = async (target: string, files: File[]) => {
    const urls: string[] = [];
    for (const file of files) {
      const path = `payment-evidence/${user.groupId}/${selectedUid}/${target}/${Date.now()}-${safeKey(file.name)}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file);
      urls.push(await getDownloadURL(fileRef));
    }
    return urls;
  };

  const addRegularEvidence = async (payment: Payment) => {
    const key = `regular-${payment.period}`;
    const files = filesByTarget[key] || [];
    if (!canEdit || files.length === 0) return;
    const urls = await uploadFiles(key, files);
    await setDoc(doc(db, 'users', selectedUid, 'ledger', payment.period), { regularReceiptUrls: [...(payment.regularReceiptUrls || []), ...urls] }, { merge: true });
    setFilesByTarget(prev => ({ ...prev, [key]: [] }));
    setMessage('Comprobantes de cuota normal guardados.');
    await loadMember(selectedUid);
  };

  const addExtraEvidence = async (payment: Payment, fee: IndividualExtraFee) => {
    const key = `extra-${payment.period}-${fee.id}`;
    const files = filesByTarget[key] || [];
    if (!canEdit || files.length === 0) return;
    const urls = await uploadFiles(key, files);
    const extraFees = (payment.extraFees || []).map(item => item.id === fee.id ? { ...item, receiptUrls: [...(item.receiptUrls || []), ...urls] } : item);
    await setDoc(doc(db, 'users', selectedUid, 'ledger', payment.period), { extraFees }, { merge: true });
    setFilesByTarget(prev => ({ ...prev, [key]: [] }));
    setMessage('Comprobantes de cuota extraordinaria guardados.');
    await loadMember(selectedUid);
  };

  const reconcileConcepts = async () => {
    if (!canEdit) return;
    setLoading(true);
    try {
      const allUsersSnap = await getDocs(collection(db, 'users'));
      const groupUsers = allUsersSnap.docs.map(d => ({ ...(d.data() as User), uid: d.id })).filter(item => item.groupId === user.groupId);
      const found = new Map<string, { period: string; description: string; amount: number; uids: string[] }>();
      for (const member of groupUsers) {
        const ledger = await getDocs(collection(db, 'users', member.uid, 'ledger'));
        for (const ledgerDoc of ledger.docs) {
          const payment = ledgerDoc.data() as Payment;
          for (const fee of payment.extraFees || []) {
            const key = fee.conceptId || conceptKey(ledgerDoc.id, fee.description, fee.amount);
            const row = found.get(key) || { period: ledgerDoc.id, description: fee.description, amount: fee.amount, uids: [] };
            if (!row.uids.includes(member.uid)) row.uids.push(member.uid);
            found.set(key, row);
          }
          if ((!payment.extraFees || payment.extraFees.length === 0) && payment.extraAmount && payment.extraAmount !== 0) {
            const description = payment.extraDescription || 'Cuota extraordinaria';
            const key = conceptKey(ledgerDoc.id, description, payment.extraAmount);
            const row = found.get(key) || { period: ledgerDoc.id, description, amount: payment.extraAmount, uids: [] };
            if (!row.uids.includes(member.uid)) row.uids.push(member.uid);
            found.set(key, row);
          }
        }
      }
      for (const [key, row] of found) {
        await setDoc(doc(db, 'extraFees', key), {
          groupId: user.groupId, period: row.period, amount: row.amount, description: row.description,
          type: row.uids.length > 1 ? 'mass' : 'individual', appliedToUsers: row.uids,
          createdBy: user.uid, createdByName: user.name, createdAt: new Date().toISOString()
        }, { merge: true });
        for (const memberUid of row.uids) {
          const ledger = await getDocs(collection(db, 'users', memberUid, 'ledger'));
          const currentDoc = ledger.docs.find(item => item.id === row.period);
          if (!currentDoc) continue;
          const current = currentDoc.data() as Payment;
          const normalized = current.extraFees?.length
            ? current.extraFees.map(fee => conceptKey(row.period, fee.description, fee.amount) === key ? { ...fee, conceptId: key } : fee)
            : [{ id: `extra_${Date.now()}_${memberUid}`, conceptId: key, description: row.description, amount: row.amount, paid: current.paidExtra || 0, createdAt: new Date().toISOString(), createdBy: user.uid, receiptUrls: [] }];
          await setDoc(doc(db, 'users', memberUid, 'ledger', row.period), { extraFees: normalized }, { merge: true });
        }
      }
      setMessage(`Se sincronizaron ${found.size} conceptos con Gestión de pagos.`);
      await Promise.all([loadConcepts(), loadMember(selectedUid)]);
    } finally { setLoading(false); }
  };

  const addSelectedMemberToConcept = async () => {
    if (!canEdit || !selectedConceptId || !selectedUid) return;
    const concept = concepts.find(item => item.id === selectedConceptId);
    if (!concept) return;
    if (concept.appliedToUsers.includes(selectedUid)) { setMessage('Ese miembro ya tiene asignado el concepto.'); return; }
    const paymentRef = doc(db, 'users', selectedUid, 'ledger', concept.period);
    const current = payments.find(item => item.period === concept.period);
    const existingFees = current?.extraFees || [];
    if (existingFees.some(fee => fee.conceptId === concept.id || conceptKey(concept.period, fee.description, fee.amount) === concept.id)) {
      setMessage('El cargo ya existe para ese miembro.'); return;
    }
    const newFee: IndividualExtraFee = { id: `extra_${Date.now()}_${selectedUid}`, conceptId: concept.id, description: concept.description, amount: concept.amount, paid: 0, createdAt: new Date().toISOString(), createdBy: user.uid, receiptUrls: [] };
    const extraFees = [...existingFees, newFee];
    await setDoc(paymentRef, {
      period: concept.period, amount: current?.amount || 0, paid: current?.paid || 0, paidRegular: current?.paidRegular || 0,
      paidExtra: extraFees.reduce((sum, fee) => sum + Number(fee.paid || 0), 0), extraFees,
      extraAmount: extraFees.reduce((sum, fee) => sum + Number(fee.amount || 0), 0),
      status: current?.status || 'Pendiente', comments: current?.comments || 'Cuota extraordinaria asignada', groupId: user.groupId,
      regularCovered: current?.regularCovered || false, extraCovered: false
    }, { merge: true });
    await updateDoc(doc(db, 'extraFees', concept.id), { appliedToUsers: [...concept.appliedToUsers, selectedUid], type: 'mass' });
    setMessage(`${concept.description} fue agregada a ${selectedUser.name}.`);
    await Promise.all([loadConcepts(), loadMember(selectedUid)]);
  };

  const renderGallery = (items: EvidenceItem[]) => items.length ? (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">{items.map((item, index) => (
      <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-white/10 bg-black/20">
        <img src={item.url} alt={item.label} className="w-full h-24 object-cover" />
        <span className="block p-1 text-[10px] text-white/65">{item.label}</span>
      </a>
    ))}</div>
  ) : <p className="text-xs text-white/40 mt-2">Sin comprobantes adjuntos.</p>;

  if (!visibleInCurrentArea) return null;

  const isAdminArea = currentView === 'admin';
  const triggerLabel = isAdminArea ? '📎 Gestión de cuotas y comprobantes' : '📎 Ver comprobantes de mis pagos';

  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-24 left-4 z-40 rounded-xl bg-sky-600 hover:bg-sky-500 text-white shadow-xl px-4 py-3 font-bold text-sm" title={triggerLabel}>{triggerLabel}</button>
    {open && <div className="fixed inset-0 z-[70] bg-black/75 p-3 overflow-y-auto">
      <div className="max-w-5xl mx-auto bg-logia-900 text-white border border-white/10 rounded-2xl p-4 space-y-4">
        <div className="flex justify-between gap-3"><div><h2 className="text-xl font-bold">{isAdminArea ? 'Gestión de cuotas y comprobantes' : 'Comprobantes de mis pagos'}</h2><p className="text-xs text-white/55">Las fotografías se muestran separadas por cuota normal y por cada concepto extraordinario.</p></div><button onClick={() => setOpen(false)}>✕</button></div>
        {message && <p className="rounded-lg bg-white/5 p-3 text-sm">{message}</p>}
        {canInspectAll && <div className="flex flex-wrap gap-2 items-end">
          <label className="text-sm flex-1 min-w-64">Miembro<select value={selectedUid} onChange={e => setSelectedUid(e.target.value)} className="block w-full mt-1 bg-black/30 rounded-lg p-2">{users.map(item => <option key={item.uid} value={item.uid}>{item.name}</option>)}</select></label>
          {canEdit && <button onClick={() => void reconcileConcepts()} disabled={loading} className="rounded-lg bg-amber-600 px-3 py-2 font-bold">Sincronizar conceptos existentes</button>}
        </div>}
        {canEdit && <div className="rounded-xl bg-white/5 p-3 flex flex-wrap gap-2 items-end">
          <label className="text-sm flex-1 min-w-64">Agregar una cuota extraordinaria existente a {selectedUser.name}<select value={selectedConceptId} onChange={e => setSelectedConceptId(e.target.value)} className="block w-full mt-1 bg-black/30 rounded-lg p-2"><option value="">Seleccionar concepto</option>{concepts.map(item => <option key={item.id} value={item.id}>{item.period} · {item.description} · ${item.amount.toFixed(2)} ({item.appliedToUsers.length} miembros)</option>)}</select></label>
          <button onClick={() => void addSelectedMemberToConcept()} disabled={!selectedConceptId} className="rounded-lg bg-green-600 px-3 py-2 font-bold disabled:opacity-40">Agregar al mismo concepto</button>
        </div>}
        {loading ? <p>Cargando…</p> : <div className="space-y-4">{payments.map(payment => {
          const regular = regularEvidence(payment);
          return <div key={payment.period} className="rounded-xl border border-white/10 p-3 bg-white/[0.03]">
            <h3 className="font-bold">{payment.period} · Cuota normal</h3>
            {renderGallery(regular)}
            {canEdit && <div className="flex flex-wrap gap-2 mt-2"><input type="file" accept="image/*" multiple onChange={e => setFilesByTarget(prev => ({ ...prev, [`regular-${payment.period}`]: Array.from(e.target.files || []) }))} /><button onClick={() => void addRegularEvidence(payment)} className="rounded bg-sky-700 px-3 py-1 text-sm">Adjuntar imágenes</button></div>}
            {(payment.extraFees || []).map(fee => { const key = `extra-${payment.period}-${fee.id}`; return <div key={fee.id} className="mt-4 ml-3 border-l-2 border-amber-500/50 pl-3"><h4 className="font-semibold text-amber-300">Extra: {fee.description} · ${fee.amount.toFixed(2)}</h4>{renderGallery(extraEvidence(payment, fee))}{canEdit && <div className="flex flex-wrap gap-2 mt-2"><input type="file" accept="image/*" multiple onChange={e => setFilesByTarget(prev => ({ ...prev, [key]: Array.from(e.target.files || []) }))} /><button onClick={() => void addExtraEvidence(payment, fee)} className="rounded bg-amber-700 px-3 py-1 text-sm">Adjuntar al concepto</button></div>}</div> })}
          </div>})}</div>}
      </div>
    </div>}
  </>;
};

export default PaymentEvidenceCenter;
