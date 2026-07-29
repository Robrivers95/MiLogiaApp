import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { ExtraFee, IndividualExtraFee, Payment, User } from '../types';

interface Props { user: User; currentView: string; }

const CompactExtraFeeAssignment: React.FC<Props> = ({ user, currentView }) => {
  const canEdit = user.role === 'admin' || user.role === 'master';
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<User[]>([]);
  const [concepts, setConcepts] = useState<ExtraFee[]>([]);
  const [memberId, setMemberId] = useState('');
  const [conceptId, setConceptId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open || !user.groupId) return;
    const load = async () => {
      setBusy(true);
      setMessage('');
      try {
        const [usersSnap, conceptsSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'extraFees')),
        ]);
        const memberRows = usersSnap.docs
          .map(item => ({ ...(item.data() as User), uid: item.id }))
          .filter(item => item.groupId === user.groupId && item.active !== false)
          .sort((a, b) => a.name.localeCompare(b.name));
        const conceptRows = conceptsSnap.docs
          .map(item => ({ id: item.id, ...(item.data() as Omit<ExtraFee, 'id'>) }))
          .filter(item => item.groupId === user.groupId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setMembers(memberRows);
        setConcepts(conceptRows);
      } catch (error) {
        console.error('Error loading extra fee assignment data', error);
        setMessage('No fue posible cargar los conceptos existentes.');
      } finally {
        setBusy(false);
      }
    };
    void load();
  }, [open, user.groupId]);

  const assign = async () => {
    if (!memberId || !conceptId) return;
    const concept = concepts.find(item => item.id === conceptId);
    const member = members.find(item => item.uid === memberId);
    if (!concept || !member) return;
    if ((concept.appliedToUsers || []).includes(memberId)) {
      setMessage('Ese miembro ya tiene asignada esta cuota.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const ledgerRef = doc(db, 'users', memberId, 'ledger', concept.period);
      const ledgerSnap = await getDoc(ledgerRef);
      const current = ledgerSnap.exists() ? ledgerSnap.data() as Payment : null;
      const existingFees = Array.isArray(current?.extraFees) ? current!.extraFees! : [];
      const duplicated = existingFees.some(fee => fee.conceptId === concept.id || (
        fee.description.trim().toLowerCase() === concept.description.trim().toLowerCase() &&
        Number(fee.amount) === Number(concept.amount)
      ));
      if (duplicated) {
        setMessage('El cargo ya existe en el detalle de este miembro.');
        return;
      }

      const newFee: IndividualExtraFee = {
        id: `extra_${Date.now()}_${memberId}`,
        conceptId: concept.id,
        description: concept.description,
        amount: Number(concept.amount) || 0,
        paid: 0,
        createdAt: new Date().toISOString(),
        createdBy: user.uid,
        receiptUrls: [],
      };
      const extraFees = [...existingFees, newFee];
      const extraAmount = extraFees.filter(fee => !fee.forgiven).reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0);
      const paidExtra = extraFees.reduce((sum, fee) => sum + (Number(fee.paid) || 0), 0);

      await setDoc(ledgerRef, {
        period: concept.period,
        amount: Number(current?.amount) || 0,
        paid: Number(current?.paid) || 0,
        paidRegular: Number(current?.paidRegular) || 0,
        paidExtra,
        extraAmount,
        extraFees,
        status: current?.status || 'Pendiente',
        comments: current?.comments || 'Cuota extraordinaria asignada',
        groupId: user.groupId,
        regularCovered: current?.regularCovered || false,
        extraCovered: paidExtra >= extraAmount,
      }, { merge: true });

      await updateDoc(doc(db, 'extraFees', concept.id), {
        appliedToUsers: [...(concept.appliedToUsers || []), memberId],
        type: 'mass',
      });
      setConcepts(prev => prev.map(item => item.id === concept.id
        ? { ...item, appliedToUsers: [...(item.appliedToUsers || []), memberId], type: 'mass' }
        : item));
      setMessage(`Cuota agregada a ${member.name}.`);
    } catch (error) {
      console.error('Error assigning existing extra fee', error);
      setMessage('No se pudo asignar la cuota. Revisa tus permisos.');
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit || currentView !== 'admin') return null;

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="fixed left-3 bottom-24 z-40 w-11 h-11 rounded-full bg-amber-600 hover:bg-amber-500 text-white shadow-xl font-bold text-lg"
      title="Asignar cuota extraordinaria existente"
      aria-label="Asignar cuota extraordinaria existente"
    >⭐</button>
    {open && <div className="fixed inset-0 z-[85] bg-black/75 p-3 flex items-end sm:items-center justify-center">
      <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-logia-900 border border-logia-700 p-4 text-white space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-start gap-3">
          <div><h2 className="font-bold text-lg">Asignar cuota existente</h2><p className="text-xs text-gray-400">Agrega otro miembro al mismo concepto, sin crear una cuota duplicada.</p></div>
          <button onClick={() => setOpen(false)} className="text-xl">✕</button>
        </div>
        {message && <p className="rounded-lg bg-white/5 p-3 text-sm">{message}</p>}
        <label className="block text-sm">Miembro
          <select value={memberId} onChange={e => setMemberId(e.target.value)} className="mt-1 block w-full rounded-lg bg-logia-800 border border-logia-700 p-2">
            <option value="">Seleccionar miembro</option>
            {members.map(member => <option key={member.uid} value={member.uid}>{member.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">Concepto extraordinario
          <select value={conceptId} onChange={e => setConceptId(e.target.value)} className="mt-1 block w-full rounded-lg bg-logia-800 border border-logia-700 p-2">
            <option value="">Seleccionar concepto</option>
            {concepts.map(concept => <option key={concept.id} value={concept.id}>{concept.period} · {concept.description} · ${Number(concept.amount).toFixed(2)}</option>)}
          </select>
        </label>
        <button onClick={() => void assign()} disabled={busy || !memberId || !conceptId} className="w-full rounded-lg bg-green-600 p-3 font-bold disabled:opacity-40">
          {busy ? 'Procesando…' : 'Agregar al mismo concepto'}
        </button>
      </div>
    </div>}
  </>;
};

export default CompactExtraFeeAssignment;
