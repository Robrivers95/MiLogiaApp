import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { db, storage } from './firebase';
import type { FinanceProject, Payment, PaymentReceipt, TreasuryEntry, User } from '../types';
import { calculateProjectSummary, resolveActualContribution, type ProjectAccountingSummary } from './projectAccounting';

export interface ProjectIncomeLine {
  id: string;
  date: string;
  amount: number;
  memberName: string;
  memberId: string;
  concept: string;
  period: string;
  source: 'receipt' | 'historical-ledger';
  receiptUrls: string[];
  note?: string;
}

export interface ProjectSnapshot {
  linkedIncomeRows: ProjectIncomeLine[];
  treasuryEntries: TreasuryEntry[];
  summary: ProjectAccountingSummary;
}

const normalize = (value?: string) => (value || '').trim().toLocaleLowerCase('es-MX');
const positive = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const unique = (values: Array<string | undefined>) => Array.from(new Set(values.filter((value): value is string => Boolean(value))));

const receiptPeriodMatches = (receipt: PaymentReceipt, period: string) => {
  if ((receipt as any).extraFeePeriod) return (receipt as any).extraFeePeriod === period;
  if ((receipt as any).targetExtraFeePeriod) return (receipt as any).targetExtraFeePeriod === period;
  return (receipt.periods || []).includes(period);
};

const receiptConceptMatches = (receipt: PaymentReceipt, concept: string) => {
  if (normalize(receipt.conceptDescription) === normalize(concept)) return true;
  const allocations = (receipt as any).allocationSummary || [];
  return allocations.some((item: any) => normalize(item.description) === normalize(concept));
};

const receiptUrls = (receipt: PaymentReceipt): string[] =>
  unique([...(receipt.receiptImageUrls || []), receipt.receiptImageUrl]);

export const projectFinanceService = {
  getProjects: async (groupId: string): Promise<FinanceProject[]> => {
    if (!groupId) return [];
    const snap = await getDocs(collection(db, 'groups', groupId, 'projects'));
    return snap.docs
      .map(item => ({ id: item.id, ...item.data() } as FinanceProject))
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  },

  createProject: async (project: Omit<FinanceProject, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    const ref = doc(collection(db, 'groups', project.groupId, 'projects'));
    const now = Date.now();
    await setDoc(ref, { ...project, id: ref.id, createdAt: now, updatedAt: now });
    return ref.id;
  },

  updateProject: async (project: FinanceProject): Promise<void> => {
    const ref = doc(db, 'groups', project.groupId, 'projects', project.id);
    await updateDoc(ref, {
      name: project.name,
      description: project.description || '',
      status: project.status,
      startDate: project.startDate,
      endDate: project.endDate || '',
      linkedExtraConcepts: project.linkedExtraConcepts || [],
      updatedAt: Date.now(),
    });
  },

  deleteProject: async (project: FinanceProject): Promise<void> => {
    const entries = await projectFinanceService.getProjectTreasuryEntries(project.groupId, project.id);
    if (entries.length > 0) {
      throw new Error('El proyecto tiene movimientos de Tesorería. Ciérralo o desvincula esos movimientos antes de eliminarlo.');
    }
    await deleteDoc(doc(db, 'groups', project.groupId, 'projects', project.id));
  },

  getAvailableExtraConcepts: async (groupId: string): Promise<string[]> => {
    if (!groupId) return [];
    const usersSnap = await getDocs(query(collection(db, 'users'), where('groupId', '==', groupId)));
    const concepts = new Set<string>();
    await Promise.all(usersSnap.docs.map(async userDoc => {
      const ledgerSnap = await getDocs(collection(db, 'users', userDoc.id, 'ledger'));
      ledgerSnap.forEach(paymentDoc => {
        const payment = paymentDoc.data() as Payment;
        if (payment.extraFees?.length) {
          payment.extraFees.forEach(fee => {
            if (fee.description?.trim()) concepts.add(fee.description.trim());
          });
        } else if (Number(payment.extraAmount) > 0 && payment.extraDescription?.trim()) {
          concepts.add(payment.extraDescription.trim());
        }
      });
    }));
    return Array.from(concepts).sort((a, b) => a.localeCompare(b, 'es'));
  },

  getProjectTreasuryEntries: async (groupId: string, projectId: string): Promise<TreasuryEntry[]> => {
    const snap = await getDocs(collection(db, 'groups', groupId, 'treasury'));
    return snap.docs
      .map(item => ({ id: item.id, ...item.data(), amount: Number(item.data().amount) || 0 } as TreasuryEntry))
      .filter(entry => entry.projectId === projectId)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  },

  getAssignableTreasuryEntries: async (groupId: string): Promise<TreasuryEntry[]> => {
    const snap = await getDocs(collection(db, 'groups', groupId, 'treasury'));
    return snap.docs
      .map(item => ({ id: item.id, ...item.data(), amount: Number(item.data().amount) || 0 } as TreasuryEntry))
      .filter(entry => !entry.projectId)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  },

  assignTreasuryEntry: async (groupId: string, entryId: string, project: FinanceProject): Promise<void> => {
    await updateDoc(doc(db, 'groups', groupId, 'treasury', entryId), {
      projectId: project.id,
      projectName: project.name,
    });
  },

  unassignTreasuryEntry: async (groupId: string, entryId: string): Promise<void> => {
    await updateDoc(doc(db, 'groups', groupId, 'treasury', entryId), {
      projectId: deleteField(),
      projectName: deleteField(),
    });
  },

  deleteProjectTreasuryEntry: async (groupId: string, entryId: string): Promise<void> => {
    await deleteDoc(doc(db, 'groups', groupId, 'treasury', entryId));
  },

  saveProjectTreasuryEntry: async (
    project: FinanceProject,
    entry: Omit<TreasuryEntry, 'id' | 'createdAt' | 'groupId' | 'projectId' | 'projectName'>,
    files: File[],
    existingId?: string
  ): Promise<string> => {
    const ref = existingId
      ? doc(db, 'groups', project.groupId, 'treasury', existingId)
      : doc(collection(db, 'groups', project.groupId, 'treasury'));

    const uploaded = await Promise.all((files || []).map(async (file, index) => {
      const extension = file.type === 'application/pdf' ? 'pdf' : (file.name.split('.').pop() || 'jpg');
      const fileRef = storageRef(
        storage,
        `groups/${project.groupId}/project-evidence/${project.id}/${ref.id}_${Date.now()}_${index}.${extension}`
      );
      await uploadBytes(fileRef, file);
      return getDownloadURL(fileRef);
    }));

    let previousUrls: string[] = [];
    if (existingId) {
      const existingEntries = await projectFinanceService.getProjectTreasuryEntries(project.groupId, project.id);
      previousUrls = existingEntries.find(item => item.id === existingId)?.receiptImageUrls || [];
    }

    const data = {
      ...entry,
      groupId: project.groupId,
      projectId: project.id,
      projectName: project.name,
      amount: positive(entry.amount),
      allocations: entry.allocations?.length ? entry.allocations : [{ source: 'tesoro_general', amount: positive(entry.amount) }],
      receiptImageUrls: [...previousUrls, ...uploaded],
      ...(existingId ? { updatedAt: Date.now() } : { id: ref.id, createdAt: Date.now() }),
    };

    if (existingId) await updateDoc(ref, data as any);
    else await setDoc(ref, data);
    return ref.id;
  },

  getProjectSnapshot: async (project: FinanceProject): Promise<ProjectSnapshot> => {
    const [usersSnap, receiptsSnap, treasuryEntries] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('groupId', '==', project.groupId))),
      getDocs(collection(db, 'groups', project.groupId, 'paymentReceipts')),
      projectFinanceService.getProjectTreasuryEntries(project.groupId, project.id),
    ]);

    const users = usersSnap.docs.map(item => ({ uid: item.id, ...item.data() } as User));
    const allReceipts = receiptsSnap.docs
      .map(item => ({ id: item.id, ...item.data() } as PaymentReceipt))
      .filter(receipt => receipt.status === 'approved' && receipt.receiptType === 'concepto_adicional');

    const linkedConcepts = (project.linkedExtraConcepts || []).map(normalize).filter(Boolean);
    const lines: ProjectIncomeLine[] = [];

    await Promise.all(users.map(async member => {
      const ledgerSnap = await getDocs(collection(db, 'users', member.uid, 'ledger'));
      ledgerSnap.forEach(paymentDoc => {
        const payment = { period: paymentDoc.id, ...paymentDoc.data() } as Payment;
        const candidates: Array<{ concept: string; ledgerPaid: number }> = [];

        if (payment.extraFees?.length) {
          payment.extraFees.forEach(fee => {
            if (linkedConcepts.includes(normalize(fee.description))) {
              candidates.push({ concept: fee.description, ledgerPaid: positive(fee.paid) });
            }
          });
        } else if (Number(payment.extraAmount) > 0) {
          const concept = payment.extraDescription || 'Cuota Extra';
          if (linkedConcepts.includes(normalize(concept))) {
            candidates.push({ concept, ledgerPaid: positive(payment.paidExtra) });
          }
        }

        candidates.forEach(candidate => {
          const matchingReceipts = allReceipts.filter(receipt =>
            receipt.userId === member.uid &&
            receiptPeriodMatches(receipt, payment.period) &&
            receiptConceptMatches(receipt, candidate.concept)
          );
          const receiptAmounts = matchingReceipts.map(receipt => positive(receipt.amount ?? receipt.appliedAmount));
          const actualContribution = resolveActualContribution(candidate.ledgerPaid, receiptAmounts);
          const documented = receiptAmounts.reduce((sum, amount) => sum + amount, 0);

          matchingReceipts.forEach(receipt => {
            const amount = positive(receipt.amount ?? receipt.appliedAmount);
            if (amount <= 0) return;
            lines.push({
              id: `receipt_${receipt.id}`,
              date: (receipt.transferDate || receipt.reviewedAt || receipt.submittedAt || payment.period).slice(0, 10),
              amount,
              memberName: member.name || member.email || member.uid,
              memberId: member.uid,
              concept: candidate.concept,
              period: payment.period,
              source: 'receipt',
              receiptUrls: receiptUrls(receipt),
              note: (receipt as any).memberComments || receipt.reviewComments || undefined,
            });
          });

          const residual = Math.max(0, actualContribution - documented);
          if (residual > 0.004) {
            lines.push({
              id: `ledger_${member.uid}_${payment.period}_${normalize(candidate.concept).replace(/[^a-z0-9]+/g, '-')}`,
              date: payment.paymentDate ? payment.paymentDate.slice(0, 10) : `${payment.period}-01`,
              amount: residual,
              memberName: member.name || member.email || member.uid,
              memberId: member.uid,
              concept: candidate.concept,
              period: payment.period,
              source: 'historical-ledger',
              receiptUrls: [],
              note: 'Saldo histórico registrado sin comprobante individual suficiente para explicar todo el acumulado.',
            });
          }
        });
      });
    }));

    lines.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
    const linkedIncome = lines.reduce((sum, line) => sum + positive(line.amount), 0);
    return {
      linkedIncomeRows: lines,
      treasuryEntries,
      summary: calculateProjectSummary(linkedIncome, treasuryEntries),
    };
  },
};
