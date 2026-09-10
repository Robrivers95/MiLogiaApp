import type {
  IndividualExtraFee,
  Payment,
  PaymentMovement,
  PaymentMovementApplication,
  PaymentReceipt,
  TreasuryEntry,
  User,
} from '../types';
import { auth, db, storage } from './firebase';
import { normalizePayment } from './paymentAccounting';
import { movementApplicationMatches, type ContributionContext } from './paymentMovementAccounting';
import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';

const money = (value: unknown): number => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) throw new Error('El monto debe ser un número positivo o cero.');
  return Math.round(n * 100) / 100;
};

const normalize = (value?: string): string => (value || '').trim().toLocaleLowerCase('es-MX');

const getPaidRegular = (payment: Payment): number =>
  payment.paidRegular !== undefined
    ? money(payment.paidRegular)
    : Math.min(money(payment.paid), money(payment.amount));

const getExtraFees = (payment: Payment): IndividualExtraFee[] =>
  Array.isArray(payment.extraFees)
    ? payment.extraFees.map(fee => ({ ...fee, amount: money(fee.amount), paid: money(fee.paid) }))
    : [];

const buildMovement = (input: Omit<PaymentMovement, 'createdAt'>): PaymentMovement => ({
  ...input,
  amount: money(input.amount),
  appliedAmount: money(input.appliedAmount),
  excessAmount: money(input.excessAmount),
  ledgerOffsetAmount: money(input.ledgerOffsetAmount),
  ledgerDeltaAmount: money(input.ledgerDeltaAmount),
  createdAt: new Date().toISOString(),
});

const appendLedgerComment = (current: string | undefined, text: string): string =>
  current ? `${current} | ${text}` : text;

const priceForPeriod = (groupData: any, period: string): number => {
  const history = Array.isArray(groupData?.priceHistory) ? [...groupData.priceHistory] : [];
  history.sort((a: any, b: any) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  const applicable = history.find((item: any) => String(item.startDate || '') <= period);
  return money(applicable?.amount ?? groupData?.membershipFee ?? 0);
};

const extensionFor = (file: File): string => {
  if (file.type === 'application/pdf') return 'pdf';
  const fromName = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromName && fromName.length <= 5) return fromName;
  return 'jpg';
};

async function uploadMovementFiles(groupId: string, movementId: string, files: File[]): Promise<string[]> {
  if (!files.length) return [];
  return Promise.all(files.map(async (file, index) => {
    const fileRef = storageRef(
      storage,
      `groups/${groupId}/payment-movements/${movementId}_${index}.${extensionFor(file)}`
    );
    await uploadBytes(fileRef, file, file.type ? { contentType: file.type } : undefined);
    return getDownloadURL(fileRef);
  }));
}

export const paymentMovementService = {
  getMovements: async (groupId: string): Promise<PaymentMovement[]> => {
    if (!groupId) return [];
    const snap = await getDocs(collection(db, 'groups', groupId, 'paymentMovements'));
    return snap.docs
      .map(item => ({ id: item.id, ...item.data() } as PaymentMovement))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  },

  getUserMovements: async (groupId: string, userId: string): Promise<PaymentMovement[]> => {
    if (!groupId || !userId) return [];
    const snap = await getDocs(query(
      collection(db, 'groups', groupId, 'paymentMovements'),
      where('userId', '==', userId)
    ));
    return snap.docs
      .map(item => ({ id: item.id, ...item.data() } as PaymentMovement))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  },

  /**
   * Registers one real-world movement. `historicalIncluded` means the cash was
   * already included in the aggregate ledger and is only being split into a
   * dated transaction now; the ledger is therefore NOT incremented again.
   */
  createAdminMovement: async (input: {
    groupId: string;
    userId: string;
    userName: string;
    period: string;
    feeType: 'regular' | 'extra';
    feeId?: string;
    concept: string;
    amount: number;
    date: string;
    comments?: string;
    files?: File[];
    historicalIncluded?: boolean;
    createdBy: string;
  }): Promise<PaymentMovement> => {
    const amount = money(input.amount);
    const comments = (input.comments || '').trim();
    const files = input.files || [];
    if (!input.groupId || !input.userId || !input.period || !input.date) throw new Error('Faltan datos del movimiento.');
    if (amount <= 0 && !comments && files.length === 0) {
      throw new Error('Indica un monto o agrega un comentario/comprobante.');
    }

    const movementRef = doc(collection(db, 'groups', input.groupId, 'paymentMovements'));
    const receiptUrls = await uploadMovementFiles(input.groupId, movementRef.id, files);
    const existingMovements = await paymentMovementService.getUserMovements(input.groupId, input.userId);
    const context: ContributionContext = {
      userId: input.userId,
      period: input.period,
      feeType: input.feeType,
      feeId: input.feeId,
      concept: input.concept,
    };
    const scopedExisting = existingMovements.filter(item => movementApplicationMatches(item, context));

    return runTransaction(db, async transaction => {
      const ledgerRef = doc(db, 'users', input.userId, 'ledger', input.period);
      const ledgerSnap = await transaction.get(ledgerRef);
      if (!ledgerSnap.exists()) throw new Error(`No existe el ledger ${input.period} para este miembro.`);
      const payment = ledgerSnap.data() as Payment;

      let ledgerConceptPaid = 0;
      let targetAmount = 0;
      let appliedAmount = 0;
      let ledgerDeltaAmount = 0;
      let ledgerOffsetAmount = 0;
      let updatedPayment = payment;
      let applicationFeeId = input.feeId;

      if (input.feeType === 'regular') {
        targetAmount = money(payment.amount);
        ledgerConceptPaid = getPaidRegular(payment);
        if (input.historicalIncluded) {
          const alreadyOffset = scopedExisting.reduce((sum, item) => sum + money(item.ledgerOffsetAmount), 0);
          ledgerOffsetAmount = Math.min(amount, Math.max(0, ledgerConceptPaid - alreadyOffset));
          const alreadyAttributed = scopedExisting.reduce((sum, item) => sum + money(item.appliedAmount), 0);
          appliedAmount = Math.min(amount, Math.max(0, targetAmount - alreadyAttributed));
        } else {
          appliedAmount = Math.min(amount, Math.max(0, targetAmount - ledgerConceptPaid));
          ledgerDeltaAmount = appliedAmount;
          ledgerOffsetAmount = appliedAmount;
          if (ledgerDeltaAmount > 0) {
            updatedPayment = normalizePayment({
              ...payment,
              paidRegular: ledgerConceptPaid + ledgerDeltaAmount,
              comments: appendLedgerComment(payment.comments, `Movimiento ${movementRef.id}: +$${ledgerDeltaAmount.toFixed(2)} cuota mensual (${input.date})`),
              paymentDate: input.date,
            });
          }
        }
      } else {
        const fees = getExtraFees(payment);
        if (fees.length) {
          let feeIndex = input.feeId && input.feeId !== 'legacy'
            ? fees.findIndex(fee => fee.id === input.feeId)
            : -1;
          if (feeIndex < 0) feeIndex = fees.findIndex(fee => normalize(fee.description) === normalize(input.concept));
          if (feeIndex < 0) throw new Error(`No se encontró la cuota extraordinaria "${input.concept}" en ${input.period}.`);
          const target = fees[feeIndex];
          if (target.forgiven && amount > 0) throw new Error('La cuota está perdonada/cerrada. Solo puedes agregar una nota con monto $0.');
          applicationFeeId = target.id;
          targetAmount = money(target.amount);
          ledgerConceptPaid = money(target.paid);

          if (input.historicalIncluded) {
            const alreadyOffset = scopedExisting.reduce((sum, item) => sum + money(item.ledgerOffsetAmount), 0);
            ledgerOffsetAmount = Math.min(amount, Math.max(0, ledgerConceptPaid - alreadyOffset));
            const alreadyAttributed = scopedExisting.reduce((sum, item) => sum + money(item.appliedAmount), 0);
            appliedAmount = Math.min(amount, Math.max(0, targetAmount - alreadyAttributed));
          } else {
            appliedAmount = Math.min(amount, Math.max(0, targetAmount - ledgerConceptPaid));
            ledgerDeltaAmount = appliedAmount;
            ledgerOffsetAmount = appliedAmount;
            if (ledgerDeltaAmount > 0) {
              fees[feeIndex] = { ...target, paid: ledgerConceptPaid + ledgerDeltaAmount };
              updatedPayment = normalizePayment({
                ...payment,
                extraFees: fees,
                comments: appendLedgerComment(payment.comments, `Movimiento ${movementRef.id} ${target.description}: +$${ledgerDeltaAmount.toFixed(2)} (${input.date})`),
                paymentDate: input.date,
              });
            }
          }
        } else {
          targetAmount = money(payment.extraAmount);
          if (targetAmount <= 0 || normalize(payment.extraDescription || 'Cuota Extra') !== normalize(input.concept)) {
            throw new Error(`No se encontró la cuota extraordinaria "${input.concept}" en ${input.period}.`);
          }
          applicationFeeId = 'legacy';
          ledgerConceptPaid = money(payment.paidExtra);
          if (input.historicalIncluded) {
            const alreadyOffset = scopedExisting.reduce((sum, item) => sum + money(item.ledgerOffsetAmount), 0);
            ledgerOffsetAmount = Math.min(amount, Math.max(0, ledgerConceptPaid - alreadyOffset));
            const alreadyAttributed = scopedExisting.reduce((sum, item) => sum + money(item.appliedAmount), 0);
            appliedAmount = Math.min(amount, Math.max(0, targetAmount - alreadyAttributed));
          } else {
            appliedAmount = Math.min(amount, Math.max(0, targetAmount - ledgerConceptPaid));
            ledgerDeltaAmount = appliedAmount;
            ledgerOffsetAmount = appliedAmount;
            if (ledgerDeltaAmount > 0) {
              updatedPayment = normalizePayment({
                ...payment,
                paidExtra: ledgerConceptPaid + ledgerDeltaAmount,
                comments: appendLedgerComment(payment.comments, `Movimiento ${movementRef.id} ${input.concept}: +$${ledgerDeltaAmount.toFixed(2)} (${input.date})`),
                paymentDate: input.date,
              });
            }
          }
        }
      }

      const excessAmount = Math.max(0, amount - appliedAmount);
      const application: PaymentMovementApplication = {
        period: input.period,
        feeType: input.feeType,
        ...(applicationFeeId ? { feeId: applicationFeeId } : {}),
        concept: input.concept,
        appliedAmount,
      };
      const movement = buildMovement({
        id: movementRef.id,
        groupId: input.groupId,
        userId: input.userId,
        userName: input.userName,
        date: input.date,
        kind: amount > 0 ? 'payment' : 'note',
        amount,
        appliedAmount,
        excessAmount,
        ledgerOffsetAmount,
        ledgerDeltaAmount,
        applications: [application],
        comments,
        receiptUrls,
        source: 'admin',
        reconciliationStatus: 'pending',
        createdBy: input.createdBy || auth.currentUser?.uid || '',
      });

      if (ledgerDeltaAmount > 0) {
        transaction.set(ledgerRef, {
          ...updatedPayment,
          correctionHistory: [
            ...(payment.correctionHistory || []),
            {
              at: new Date().toISOString(),
              by: input.createdBy || auth.currentUser?.uid || '',
              reason: `Movimiento ${movementRef.id}: ${comments || input.concept}`,
              before: money(payment.paid),
              after: money(updatedPayment.paid),
              beforeDate: payment.paymentDate || null,
              afterDate: input.date,
            },
          ],
        }, { merge: true });
      }
      transaction.set(movementRef, movement);
      return movement;
    });
  },

  /** Approves a receipt and creates its real-world movement atomically. */
  approveReceipt: async (receipt: PaymentReceipt, reviewerUid: string): Promise<{ movement: PaymentMovement | null; appliedAmount: number; excessAmount: number }> => {
    const receiptRef = doc(db, 'groups', receipt.groupId, 'paymentReceipts', receipt.id);
    const movementRef = doc(db, 'groups', receipt.groupId, 'paymentMovements', `receipt_${receipt.id}`);

    return runTransaction(db, async transaction => {
      const receiptSnap = await transaction.get(receiptRef);
      if (!receiptSnap.exists()) throw new Error('El comprobante ya no existe.');
      const current = { ...receipt, ...receiptSnap.data(), id: receiptSnap.id } as PaymentReceipt;
      const existingMovementSnap = await transaction.get(movementRef);
      if (current.status === 'approved') {
        return {
          movement: existingMovementSnap.exists() ? ({ id: existingMovementSnap.id, ...existingMovementSnap.data() } as PaymentMovement) : null,
          appliedAmount: money(current.appliedAmount),
          excessAmount: money(current.unappliedAmount ?? Math.max(0, money(current.amount) - money(current.appliedAmount))),
        };
      }
      if (existingMovementSnap.exists()) {
        const movement = { id: existingMovementSnap.id, ...existingMovementSnap.data() } as PaymentMovement;
        transaction.update(receiptRef, {
          status: 'approved', reviewedAt: new Date().toISOString(), reviewedBy: reviewerUid,
          appliedAmount: movement.appliedAmount, unappliedAmount: movement.excessAmount, movementId: movement.id,
        });
        return { movement, appliedAmount: movement.appliedAmount, excessAmount: movement.excessAmount };
      }

      const declared = money(current.amount);
      const applications: PaymentMovementApplication[] = [];
      let appliedTotal = 0;
      const transferDate = (current.transferDate || new Date().toISOString()).slice(0, 10);

      if (current.receiptType === 'concepto_adicional') {
        if (declared <= 0) throw new Error('El comprobante de cuota extra necesita un monto mayor a cero.');
        const period = current.extraFeePeriod || current.periods?.[0];
        if (!period) throw new Error('El comprobante no está ligado a un período de cuota extra.');
        const ledgerRef = doc(db, 'users', current.userId, 'ledger', period);
        const ledgerSnap = await transaction.get(ledgerRef);
        if (!ledgerSnap.exists()) throw new Error(`No existe el registro de pagos ${period} para este miembro.`);
        const payment = ledgerSnap.data() as Payment;
        const fees = getExtraFees(payment);
        let updated: Payment;
        let feeId = current.extraFeeId;
        let concept = current.conceptDescription || 'Cuota extraordinaria';

        if (fees.length) {
          let feeIndex = feeId && feeId !== 'legacy' ? fees.findIndex(fee => fee.id === feeId) : -1;
          if (feeIndex < 0) feeIndex = fees.findIndex(fee => normalize(fee.description) === normalize(concept));
          if (feeIndex < 0) throw new Error(`No se encontró la cuota extra "${concept}" en ${period}.`);
          const target = fees[feeIndex];
          if (target.forgiven) throw new Error('Esta cuota extra fue perdonada/cerrada.');
          feeId = target.id;
          concept = target.description;
          appliedTotal = Math.min(declared, Math.max(0, money(target.amount) - money(target.paid)));
          fees[feeIndex] = { ...target, paid: money(target.paid) + appliedTotal };
          updated = normalizePayment({
            ...payment,
            extraFees: fees,
            comments: appendLedgerComment(payment.comments, `Comprobante ${current.id} ${concept}: +$${appliedTotal.toFixed(2)} aplicado (${transferDate})`),
            paymentDate: transferDate,
          });
        } else {
          const target = money(payment.extraAmount);
          if (target <= 0) throw new Error('No existe una cuota extra en ese período.');
          if (current.conceptDescription && payment.extraDescription && normalize(current.conceptDescription) !== normalize(payment.extraDescription)) {
            throw new Error(`La cuota extra del período es "${payment.extraDescription}".`);
          }
          feeId = 'legacy';
          concept = payment.extraDescription || concept;
          const paid = money(payment.paidExtra);
          appliedTotal = Math.min(declared, Math.max(0, target - paid));
          updated = normalizePayment({
            ...payment,
            paidExtra: paid + appliedTotal,
            comments: appendLedgerComment(payment.comments, `Comprobante ${current.id} ${concept}: +$${appliedTotal.toFixed(2)} aplicado (${transferDate})`),
            paymentDate: transferDate,
          });
        }
        transaction.set(ledgerRef, updated, { merge: true });
        applications.push({ period, feeType: 'extra', feeId, concept, appliedAmount: appliedTotal });
        current.extraFeeId = feeId;
        current.extraFeePeriod = period;
      } else {
        const periods = Array.from(new Set(current.periods || [])).sort();
        if (!periods.length) throw new Error('Selecciona al menos un período mensual.');
        const groupRef = doc(db, 'groups', current.groupId);
        const groupSnap = await transaction.get(groupRef);
        const groupData = groupSnap.exists() ? groupSnap.data() : {};
        const ledgerRefs = periods.map(period => doc(db, 'users', current.userId, 'ledger', period));
        const ledgerSnaps = [];
        for (const ledgerRef of ledgerRefs) ledgerSnaps.push(await transaction.get(ledgerRef));

        let remaining = declared;
        const hasDeclared = declared > 0;
        for (let i = 0; i < periods.length; i++) {
          const period = periods[i];
          const ledgerRef = ledgerRefs[i];
          const ledgerSnap = ledgerSnaps[i];
          const feeAmount = ledgerSnap.exists() ? money(ledgerSnap.data().amount) : priceForPeriod(groupData, period);
          if (feeAmount <= 0) continue;
          const payment: Payment = ledgerSnap.exists()
            ? ({ ...ledgerSnap.data(), period } as Payment)
            : {
                period, amount: feeAmount, paid: 0, paidRegular: 0, paidExtra: 0,
                status: 'Pendiente', comments: '', paymentDate: null, groupId: current.groupId,
                regularCovered: false, extraCovered: true,
              };
          const paidRegular = getPaidRegular(payment);
          const debt = Math.max(0, feeAmount - paidRegular);
          const toApply = hasDeclared ? Math.min(remaining, debt) : debt;
          const updated = normalizePayment({
            ...payment,
            paidRegular: paidRegular + toApply,
            comments: appendLedgerComment(payment.comments, `Comprobante ${current.id}: +$${toApply.toFixed(2)} mensual (${transferDate})`),
            paymentDate: toApply > 0 ? transferDate : payment.paymentDate,
          });
          transaction.set(ledgerRef, updated, { merge: true });
          applications.push({ period, feeType: 'regular', concept: 'Cuota mensual', appliedAmount: toApply });
          appliedTotal += toApply;
          if (hasDeclared) remaining = Math.max(0, remaining - toApply);
        }
      }

      const movementAmount = declared > 0 ? declared : appliedTotal;
      const excessAmount = Math.max(0, movementAmount - appliedTotal);
      const receiptUrls = Array.from(new Set([...(current.receiptImageUrls || []), current.receiptImageUrl].filter(Boolean)));
      const movement = buildMovement({
        id: movementRef.id,
        groupId: current.groupId,
        userId: current.userId,
        userName: current.userName,
        date: transferDate,
        kind: 'payment',
        amount: movementAmount,
        appliedAmount: appliedTotal,
        excessAmount,
        ledgerOffsetAmount: appliedTotal,
        ledgerDeltaAmount: appliedTotal,
        applications,
        comments: current.memberComments || current.reviewComments || '',
        receiptUrls,
        receiptId: current.id,
        source: 'member_receipt',
        reconciliationStatus: 'pending',
        createdBy: reviewerUid,
      });

      transaction.set(movementRef, movement);
      transaction.update(receiptRef, {
        status: 'approved',
        reviewedAt: new Date().toISOString(),
        reviewedBy: reviewerUid,
        appliedAmount: appliedTotal,
        unappliedAmount: excessAmount,
        movementId: movement.id,
        ...(current.extraFeeId ? { extraFeeId: current.extraFeeId } : {}),
        ...(current.extraFeePeriod ? { extraFeePeriod: current.extraFeePeriod } : {}),
      });
      return { movement, appliedAmount: appliedTotal, excessAmount };
    });
  },

  updateMovementReconciliation: async (
    groupId: string,
    movementId: string,
    status: 'pending' | 'matched' | 'difference',
    bankReference: string,
    reviewerUid: string
  ) => {
    await updateDoc(doc(db, 'groups', groupId, 'paymentMovements', movementId), {
      reconciliationStatus: status,
      bankReference: (bankReference || '').trim(),
      reconciledAt: status === 'pending' ? null : new Date().toISOString(),
      reconciledBy: status === 'pending' ? '' : reviewerUid,
      updatedAt: new Date().toISOString(),
    });
  },

  updateMovementMetadata: async (
    groupId: string,
    movementId: string,
    updates: { date?: string; comments?: string; bankReference?: string }
  ) => {
    const clean: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (updates.date !== undefined) clean.date = updates.date;
    if (updates.comments !== undefined) clean.comments = updates.comments.trim();
    if (updates.bankReference !== undefined) clean.bankReference = updates.bankReference.trim();
    await updateDoc(doc(db, 'groups', groupId, 'paymentMovements', movementId), clean);
  },

  /**
   * Treasury projection: concrete movements first; only the ledger portion that
   * has not yet been represented by movements remains as a historical aggregate.
   */
  getDetailedQuotaTransactions: async (groupId: string): Promise<TreasuryEntry[]> => {
    if (!groupId) return [];
    const [usersSnap, movements] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('groupId', '==', groupId))),
      paymentMovementService.getMovements(groupId),
    ]);
    const rows: TreasuryEntry[] = [];

    movements.filter(item => money(item.amount) > 0).forEach(item => {
      const application = item.applications?.[0];
      rows.push({
        id: `movement_${item.id}`,
        groupId,
        date: item.date,
        type: 'income',
        category: application?.feeType === 'regular' ? 'cuota_regular' : 'cuota_extra',
        description: `${application?.concept || 'Aportación'} - ${item.userName}${item.comments ? ` · ${item.comments}` : ''}`,
        amount: money(item.amount),
        allocations: [{ source: 'cuotas', amount: money(item.amount) }],
        createdBy: item.userId,
        createdAt: Date.parse(item.createdAt || '') || 0,
        quotaType: application?.feeType || 'unclassified',
        quotaConcept: application?.concept || 'Aportación',
        period: application?.period,
        memberId: item.userId,
        memberName: item.userName,
        receiptUrls: item.receiptUrls || [],
        paymentMovementId: item.id,
        bankReference: item.bankReference,
        reconciliationStatus: item.reconciliationStatus,
      } as TreasuryEntry);
    });

    await Promise.all(usersSnap.docs.map(async userDoc => {
      const userData = userDoc.data() as User;
      const uid = userData.uid || userDoc.id;
      const ledgerSnap = await getDocs(collection(db, 'users', userDoc.id, 'ledger'));
      ledgerSnap.docs.forEach(ledgerDoc => {
        const payment = { period: ledgerDoc.id, ...ledgerDoc.data() } as Payment;
        const represented = movements
          .filter(item => item.userId === uid)
          .filter(item => (item.applications || []).some(application => application.period === payment.period))
          .reduce((sum, item) => sum + money(item.ledgerOffsetAmount), 0);
        const historical = Math.max(0, money(payment.paid) - represented);
        if (historical <= 0.009) return;
        rows.push({
          id: `quota_historical_${uid}_${payment.period}`,
          groupId,
          date: payment.paymentDate ? payment.paymentDate.slice(0, 10) : 'Sin Fecha',
          type: 'income',
          category: 'otro',
          description: `Acumulado histórico sin desglose ${payment.period} - ${userData.name || uid}`,
          amount: historical,
          allocations: [{ source: 'cuotas', amount: historical }],
          createdBy: uid,
          createdAt: 0,
          quotaType: 'unclassified',
          quotaConcept: 'Acumulado histórico sin desglose',
          period: payment.period,
          memberId: uid,
          memberName: userData.name || uid,
        } as TreasuryEntry);
      });
    }));

    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  },

  getAllReceivedQuotas: async (groupId: string): Promise<number> => {
    const rows = await paymentMovementService.getDetailedQuotaTransactions(groupId);
    return money(rows.reduce((sum, row) => sum + (row.type === 'income' ? money(row.amount) : 0), 0));
  },
};
