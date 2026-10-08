import { auth, db, storage } from './firebase';
import { collection, doc, getDocs, query, where, runTransaction } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { BankBalance, Payment, PaymentReceipt, TreasuryEntry, User } from '../types';
import { applyCapture, captureAmount, validCaptureDate } from './quickFinance';

export interface CaptureInput {
  type: 'income' | 'expense'; amount: number; date: string; notes: string;
  memberId: string; paymentMethod: 'cash' | 'card' | 'transfer'; accountId: string;
}
const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
// Re-read authority in the same transaction as every mutation.
async function authority(transaction: any, groupId: string) {
  if (!auth.currentUser?.uid || !groupId || groupId.includes('/')) throw new Error('Inicia sesión y selecciona una Logia.');
  const actorSnap = await transaction.get(doc(db,'users',auth.currentUser.uid));
  const groupSnap = await transaction.get(doc(db,'groups',groupId));
  const actor = actorSnap.data() as User;
  if (!actorSnap.exists() || !['admin','master'].includes(actor.role) || actor.active === false || (actor.role !== 'master' && actor.groupId !== groupId)) throw new Error('Solo Admin y Admin master pueden capturar movimientos de esta Logia.');
  if (!groupSnap.exists() || groupSnap.data().active === false) throw new Error('La Logia está en modo solo lectura.');
  return auth.currentUser.uid;
}
const entryRef = (groupId: string, id: string) => {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Identificador de captura inválido.');
  return doc(db,'groups',groupId,'treasury',id);
};
const changed = (groupId: string) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('finance-updated',{detail:{groupId}}));
};
export const quickFinanceService = {
  list: async (groupId: string): Promise<TreasuryEntry[]> => {
    await runTransaction(db,transaction => authority(transaction,groupId));
    const snapshot = await getDocs(collection(db,'groups',groupId,'treasury'));
    return snapshot.docs.map(item => ({...item.data(),id:item.id} as TreasuryEntry)).filter(entry => !!entry.quickStatus).sort((a,b)=>b.createdAt-a.createdAt);
  },
  options: async (groupId: string) => {
    await runTransaction(db,transaction => authority(transaction,groupId));
    const [members,accounts] = await Promise.all([
      getDocs(query(collection(db,'users'),where('groupId','==',groupId))),
      getDocs(query(collection(db,'bankBalances'),where('groupId','==',groupId)))
    ]);
    return {members:members.docs.map(item=>({...item.data(),uid:item.id} as User)).sort((a,b)=>a.name.localeCompare(b.name)),accounts:accounts.docs.map(item=>({...item.data(),id:item.id} as BankBalance))};
  },
  payments: async (groupId: string, uid: string): Promise<Payment[]> => {
    await runTransaction(db,async transaction=>{
      await authority(transaction,groupId);
      const member = await transaction.get(doc(db,'users',uid));
      if (!member.exists() || member.data().groupId !== groupId) throw new Error('El miembro no pertenece a esta Logia.');
    });
    const snapshot = await getDocs(collection(db,'users',uid,'ledger'));
    return snapshot.docs.map(item=>({...item.data(),period:item.id} as Payment)).filter(item=>!item.groupId || item.groupId === groupId).sort((a,b)=>b.period.localeCompare(a.period));
  },
  save: async (groupId: string, id: string, input: CaptureInput, photo?: File) => {
    const target = entryRef(groupId,id);
    const amount = captureAmount(input.amount); const date = validCaptureDate(input.date);
    if (!['income','expense'].includes(input.type) || !['cash','card','transfer'].includes(input.paymentMethod)) throw new Error('Tipo o método inválido.');
    await runTransaction(db,transaction=>authority(transaction,groupId));
    let urls: string[] = [];
    if (photo) {
      if (!photo.type.startsWith('image/') || photo.size > 8*1024*1024) throw new Error('Selecciona una imagen de máximo 8 MB.');
      // A retry gets its own object: never overwrite evidence of a committed capture.
      const attachment = ref(storage,`groups/${groupId}/receipts/quick-${id}-${crypto.randomUUID()}`);
      await uploadBytes(attachment,photo); urls = [await getDownloadURL(attachment)];
    }
    await runTransaction(db,async transaction=>{
      const by = await authority(transaction,groupId);
      const previous = await transaction.get(target);
      if (previous.exists()) {
        if (!previous.data().quickStatus || previous.data().createdBy !== by) throw new Error('La captura ya existe.');
        const stored = previous.data();
        if (stored.amount !== amount || stored.date !== date || stored.type !== input.type || (stored.memberId || '') !== input.memberId || (stored.accountId || '') !== input.accountId || stored.paymentMethod !== input.paymentMethod || (stored.notes || '') !== input.notes.trim()) throw new Error('Esta captura ya está guardada con otros datos. Revísala en Capturas.');
        return; // Lost response or simultaneous taps cannot count twice.
      }
      let memberName = ''; let accountName = ''; let account: BankBalance | undefined;
      if (input.memberId) {
        if (input.type !== 'income') throw new Error('Solo un ingreso puede vincularse a un miembro.');
        const member = await transaction.get(doc(db,'users',input.memberId));
        if (!member.exists() || member.data().groupId !== groupId) throw new Error('El miembro no pertenece a esta Logia.');
        memberName = member.data().name;
      }
      if (input.accountId) {
        const accountSnap = await transaction.get(doc(db,'bankBalances',input.accountId));
        if (!accountSnap.exists() || accountSnap.data().groupId !== groupId) throw new Error('La cuenta no pertenece a esta Logia.');
        account = accountSnap.data() as BankBalance; accountName = account.name;
        if (!Number.isFinite(Number(account.amount))) throw new Error('El saldo actual de la cuenta no es válido.');
      }
      const entry: TreasuryEntry = {id,groupId,date,type:input.type,amount,description:input.notes.trim() || 'Captura pendiente de completar',category:'otro',allocations:[{source:'tesoro_general',amount}],createdBy:by,createdAt:Date.now(),quickStatus:'pending',notes:input.notes.trim(),memberId:input.memberId,memberName,paymentMethod:input.paymentMethod,accountId:input.accountId,accountName,receiptImageUrls:urls};
      transaction.set(target,clean(entry));
      if (account) transaction.update(doc(db,'bankBalances',input.accountId),{amount:Math.round((Number(account.amount)+(input.type === 'income' ? amount : -amount))*100)/100,updatedBy:by});
    });
    changed(groupId);
  },
  complete: async (groupId: string, id: string, details: {description: string;category: TreasuryEntry['category'];payee:string;notes:string}) => {
    if (!details.description.trim()) throw new Error('Escribe el concepto.');
    if (!['saco_beneficencia','cuota_extra','evento','donacion','gasto_operativo','gasto_social','compra_material','otro'].includes(details.category)) throw new Error('Selecciona una categoría válida.');
    await runTransaction(db,async transaction=>{
      const by = await authority(transaction,groupId); const target = entryRef(groupId,id); const current = await transaction.get(target);
      if (!current.exists() || !current.data().quickStatus || current.data().quickStatus === 'applied') throw new Error('Esta captura no está disponible para completar.');
      transaction.update(target,{...details,description:details.description.trim(),quickStatus:'completed',completedBy:by,updatedAt:Date.now()});
    }); changed(groupId);
  },
  apply: async (groupId: string, id: string, uid: string, period: string, feeId?: string) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Selecciona el mes y año de la cuota.');
    await runTransaction(db,async transaction=>{
      const by = await authority(transaction,groupId); const target = entryRef(groupId,id); const current = await transaction.get(target);
      if (!current.exists()) throw new Error('La captura ya no existe.');
      const entry = {...current.data(),id} as TreasuryEntry;
      if (entry.quickStatus === 'applied') {
        if (entry.memberId !== uid || entry.appliedPeriod !== period || (entry.appliedFeeId || '') !== (feeId || '')) throw new Error('Este ingreso ya se aplicó a otra cuota.');
        return;
      }
      if (entry.projectId) throw new Error('Retira el vínculo con el proyecto antes de aplicar a una cuota.');
      if (entry.memberId && entry.memberId !== uid) throw new Error('El ingreso está vinculado a otro miembro.');
      const member = await transaction.get(doc(db,'users',uid));
      const ledgerRef = doc(db,'users',uid,'ledger',period); const ledger = await transaction.get(ledgerRef);
      if (!member.exists() || member.data().groupId !== groupId) throw new Error('El miembro no pertenece a esta Logia.');
      if (!ledger.exists() || (ledger.data().groupId && ledger.data().groupId !== groupId)) throw new Error('No existe esta cuota para el miembro.');
      const proofRef = doc(db,'groups',groupId,'paymentReceipts',`quick-${id}`); const proof = await transaction.get(proofRef);
      if (proof.exists()) throw new Error('Ya existe un comprobante enlazado. Actualiza la consulta.');
      const source = {...ledger.data(),period} as Payment; const result = applyCapture(source,entry,feeId);
      const now = new Date().toISOString();
      const receipt: PaymentReceipt = {id:`quick-${id}`,groupId,userId:uid,userName:member.data().name,periods:[period],transferDate:entry.date,receiptImageUrl:entry.receiptImageUrls?.[0] || '',receiptImageUrls:entry.receiptImageUrls || [],amount:entry.amount,receiptType:feeId ? 'concepto_adicional' : 'cuota_mensual',...(feeId ? {extraFeeId:feeId,extraFeePeriod:period,conceptDescription:feeId === 'legacy' ? source.extraDescription || 'Cuota Extra' : source.extraFees?.find(fee=>fee.id === feeId)?.description} : {}),appliedAmount:entry.amount,unappliedAmount:0,voluntaryContribution:result.voluntary,ledgerIncluded:true,status:'approved',submittedAt:now,reviewedAt:now,reviewedBy:by,quickMovementId:id};
      transaction.update(ledgerRef,clean(result.payment)); transaction.set(proofRef,clean(receipt));
      transaction.update(target,{quickStatus:'applied',memberId:uid,memberName:member.data().name,appliedPeriod:period,appliedFeeId:feeId || '',completedBy:by,updatedAt:Date.now()});
      // No second cash/account mutation: only the classification changes.
    }); changed(groupId);
  }
};
