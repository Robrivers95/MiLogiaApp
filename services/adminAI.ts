import { collection, doc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { db, storage } from './firebase';
import { Payment, Task, User } from '../types';

const normalize = (value: string) => value
  .toLocaleLowerCase('es-MX')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export type UserPendingSummary = {
  user: User;
  regularDebt: number;
  extraDebt: number;
  debtPeriods: Array<{ period: string; regular: number; extra: number; concepts: string[] }>;
  pendingTasks: Task[];
};

const money = (amount: number) => amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

export const adminAIService = {
  resolveUser: async (groupId: string, spokenName: string): Promise<{ match?: User; alternatives: User[] }> => {
    const snap = await getDocs(query(collection(db, 'users'), where('groupId', '==', groupId)));
    const users = snap.docs.map(item => ({ uid: item.id, ...item.data() } as User));
    const wanted = normalize(spokenName);
    const exact = users.find(item => normalize(item.name) === wanted || normalize(item.email) === wanted);
    if (exact) return { match: exact, alternatives: [exact] };

    const words = wanted.split(' ').filter(Boolean);
    const scored = users
      .map(item => {
        const name = normalize(item.name);
        const score = words.reduce((total, word) => total + (name.includes(word) ? 1 : 0), 0);
        return { item, score };
      })
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'es-MX'));

    const alternatives = scored.slice(0, 5).map(result => result.item);
    return alternatives.length === 1 ? { match: alternatives[0], alternatives } : { alternatives };
  },

  getUserPendingSummary: async (groupId: string, member: User): Promise<UserPendingSummary> => {
    const [ledgerSnap, taskSnap] = await Promise.all([
      getDocs(collection(db, 'users', member.uid, 'ledger')),
      getDocs(collection(db, 'groups', groupId, 'tasks')),
    ]);

    const debtPeriods: UserPendingSummary['debtPeriods'] = [];
    let regularDebt = 0;
    let extraDebt = 0;

    ledgerSnap.docs.forEach(item => {
      const payment = { period: item.id, ...item.data() } as Payment;
      const regularPending = Math.max(0, Number(payment.amount || 0) - Number(payment.paidRegular ?? payment.paid ?? 0));
      const individualExtras = (payment.extraFees || [])
        .filter(fee => !fee.forgiven)
        .map(fee => ({ description: fee.description, pending: Math.max(0, Number(fee.amount || 0) - Number(fee.paid || 0)) }));
      const legacyExtra = Math.max(0, Number(payment.extraAmount || 0) - Number(payment.paidExtra || 0));
      const extraPending = individualExtras.reduce((sum, fee) => sum + fee.pending, 0) || legacyExtra;
      const concepts = individualExtras.filter(fee => fee.pending > 0).map(fee => fee.description);

      if (regularPending > 0 || extraPending > 0) {
        debtPeriods.push({ period: payment.period, regular: regularPending, extra: extraPending, concepts });
        regularDebt += regularPending;
        extraDebt += extraPending;
      }
    });

    const pendingTasks = taskSnap.docs
      .map(item => ({ id: item.id, ...item.data() } as Task))
      .filter(task => !task.completed && (
        task.assignedTo === member.uid ||
        task.assignedToMany?.includes(member.uid)
      ));

    debtPeriods.sort((a, b) => a.period.localeCompare(b.period));
    return { user: member, regularDebt, extraDebt, debtPeriods, pendingTasks };
  },

  formatPendingSummary: (summary: UserPendingSummary): string => {
    const total = summary.regularDebt + summary.extraDebt;
    const debtLines = summary.debtPeriods.slice(0, 12).map(item => {
      const parts = [];
      if (item.regular > 0) parts.push(`normal ${money(item.regular)}`);
      if (item.extra > 0) parts.push(`extraordinaria ${money(item.extra)}${item.concepts.length ? ` (${item.concepts.join(', ')})` : ''}`);
      return `${item.period}: ${parts.join(' y ')}`;
    });
    const taskLines = summary.pendingTasks.slice(0, 8).map(task => task.title);

    return [
      `${summary.user.name} tiene un adeudo total de ${money(total)}: ${money(summary.regularDebt)} en cuotas normales y ${money(summary.extraDebt)} en extraordinarias.`,
      debtLines.length ? `Periodos pendientes: ${debtLines.join('; ')}.` : 'No tiene cuotas pendientes.',
      taskLines.length ? `Tareas pendientes: ${taskLines.join('; ')}.` : 'No tiene tareas pendientes.',
    ].join(' ');
  },

  createPaymentMatrixImage: async (groupId: string, year: number): Promise<Blob> => {
    const usersSnap = await getDocs(query(collection(db, 'users'), where('groupId', '==', groupId), where('active', '==', true)));
    const users = usersSnap.docs.map(item => ({ uid: item.id, ...item.data() } as User)).sort((a, b) => a.name.localeCompare(b.name, 'es-MX'));
    const ledgers = await Promise.all(users.map(async member => {
      const snap = await getDocs(collection(db, 'users', member.uid, 'ledger'));
      const byPeriod = new Map(snap.docs.map(item => [item.id, { period: item.id, ...item.data() } as Payment]));
      return { member, byPeriod };
    }));

    const rowHeight = 34;
    const nameWidth = 250;
    const monthWidth = 68;
    const width = nameWidth + monthWidth * 12 + 24;
    const height = 92 + rowHeight * Math.max(1, ledgers.length) + 28;
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo generar la imagen de la matriz.');
    ctx.scale(2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(`Matriz de pagos ${year}`, 12, 30);
    ctx.font = '12px Arial';
    ctx.fillStyle = '#4b5563';
    ctx.fillText(`Generada ${new Date().toLocaleString('es-MX')}`, 12, 50);

    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const headerY = 66;
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(12, headerY, width - 24, rowHeight);
    ctx.fillStyle = '#111827';
    ctx.fillText('Miembro', 20, headerY + 21);
    months.forEach((month, index) => ctx.fillText(month, nameWidth + index * monthWidth + 18, headerY + 21));

    ledgers.forEach(({ member, byPeriod }, rowIndex) => {
      const y = headerY + rowHeight + rowIndex * rowHeight;
      ctx.fillStyle = rowIndex % 2 === 0 ? '#ffffff' : '#f9fafb';
      ctx.fillRect(12, y, width - 24, rowHeight);
      ctx.fillStyle = '#111827';
      ctx.font = '12px Arial';
      ctx.fillText(member.name.slice(0, 34), 20, y + 21);
      months.forEach((_, monthIndex) => {
        const period = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
        const payment = byPeriod.get(period);
        const regularPaid = Number(payment?.paidRegular ?? payment?.paid ?? 0);
        const regularDue = Number(payment?.amount || 0);
        const status = regularDue > 0 && regularPaid >= regularDue ? 'Pagado' : regularPaid > 0 ? 'Parcial' : 'Pendiente';
        const x = nameWidth + monthIndex * monthWidth + 10;
        ctx.fillStyle = status === 'Pagado' ? '#166534' : status === 'Parcial' ? '#92400e' : '#991b1b';
        ctx.fillText(status === 'Pagado' ? '✓' : status === 'Parcial' ? '◐' : '•', x + 18, y + 21);
      });
    });

    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo convertir la matriz a imagen.')), 'image/png'));
  },

  broadcastPaymentMatrix: async (actor: User, year: number): Promise<{ recipients: number; imageUrl: string }> => {
    if (actor.role !== 'admin' && actor.role !== 'master') throw new Error('Solo administradores pueden enviar la matriz.');
    const blob = await adminAIService.createPaymentMatrixImage(actor.groupId, year);
    const path = `groups/${actor.groupId}/payment-matrix/${year}-${Date.now()}.png`;
    const fileRef = storageRef(storage, path);
    await uploadBytes(fileRef, blob, { contentType: 'image/png' });
    const imageUrl = await getDownloadURL(fileRef);

    const usersSnap = await getDocs(query(collection(db, 'users'), where('groupId', '==', actor.groupId), where('active', '==', true)));
    const recipients = usersSnap.docs.map(item => item.id);
    for (let offset = 0; offset < recipients.length; offset += 400) {
      const batch = writeBatch(db);
      recipients.slice(offset, offset + 400).forEach(uid => {
        const notificationRef = doc(collection(db, 'users', uid, 'notifications'));
        batch.set(notificationRef, {
          id: notificationRef.id,
          uid,
          groupId: actor.groupId,
          type: 'payment_matrix',
          title: `Matriz de pagos ${year}`,
          body: 'Consulta la imagen actualizada de la matriz de pagos de la logia.',
          imageUrl,
          attachmentType: 'image',
          read: false,
          createdAt: Date.now(),
          createdBy: actor.uid,
        });
      });
      await batch.commit();
    }

    return { recipients: recipients.length, imageUrl };
  },
};
