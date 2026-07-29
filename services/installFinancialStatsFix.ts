import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { dataService } from './api';
import type { IndividualExtraFee, Payment } from '../types';

/**
 * Corrige el cálculo histórico sin migrar ni reescribir datos productivos.
 * Algunas cuotas creadas desde la matriz guardan el detalle en extraFees[]
 * y el campo legado extraAmount puede quedar en cero o desactualizado.
 */
export const installFinancialStatsFix = () => {
  dataService.getUserFinancialStats = async (uid: string, startPeriod?: string, endPeriod?: string) => {
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'ledger'));
      let totalPaidRegular = 0;
      let totalPaidExtra = 0;
      let totalBilledRegular = 0;
      let totalBilledExtra = 0;

      snap.forEach(document => {
        const payment = { ...document.data(), period: document.id } as Payment;
        if (startPeriod && payment.period < startPeriod) return;
        if (endPeriod && payment.period > endPeriod) return;

        const regularAmount = Number(payment.amount) || 0;
        const fees: IndividualExtraFee[] = Array.isArray(payment.extraFees) ? payment.extraFees : [];
        const extraAmount = fees.length > 0
          ? fees.filter(fee => !fee.forgiven).reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0)
          : (Number(payment.extraAmount) || 0);

        let paidRegular = 0;
        let paidExtra = 0;
        if (payment.paidRegular !== undefined || payment.paidExtra !== undefined) {
          paidRegular = Number(payment.paidRegular) || 0;
          paidExtra = fees.length > 0
            ? fees.reduce((sum, fee) => sum + (Number(fee.paid) || 0), 0)
            : (Number(payment.paidExtra) || 0);
        } else {
          const legacyPaid = Number(payment.paid) || 0;
          paidRegular = Math.min(legacyPaid, regularAmount);
          paidExtra = Math.max(0, legacyPaid - regularAmount);
        }

        totalBilledRegular += regularAmount;
        totalBilledExtra += extraAmount;
        totalPaidRegular += paidRegular;
        totalPaidExtra += paidExtra;
      });

      const totalBilled = totalBilledRegular + totalBilledExtra;
      const totalPaid = totalPaidRegular + totalPaidExtra;
      return {
        totalPaid,
        totalDebt: Math.max(0, totalBilled - totalPaid),
        totalBilled,
        totalPaidRegular,
        totalPaidExtra,
        totalBilledRegular,
        totalBilledExtra,
        totalDebtRegular: Math.max(0, totalBilledRegular - totalPaidRegular),
        totalDebtExtra: Math.max(0, totalBilledExtra - totalPaidExtra),
      };
    } catch (error) {
      console.error('Error calculating corrected financial stats', error);
      return {
        totalPaid: 0,
        totalDebt: 0,
        totalBilled: 0,
        totalPaidRegular: 0,
        totalPaidExtra: 0,
        totalBilledRegular: 0,
        totalBilledExtra: 0,
        totalDebtRegular: 0,
        totalDebtExtra: 0,
      };
    }
  };
};
