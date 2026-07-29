import fs from 'node:fs';

const path = 'services/api.ts';
let source = fs.readFileSync(path, 'utf8');

const startMarker = '  getUserFinancialStats: async (uid: string, startPeriod?: string, endPeriod?: string) => {';
const endMarker = '  getGlobalFinancials: async (groupId: string, startDate: string, endDate: string) => {';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker);

if (start === -1 || end === -1 || end <= start) {
  throw new Error('No se encontró getUserFinancialStats para aplicar la corrección.');
}

const replacement = `  getUserFinancialStats: async (uid: string, startPeriod?: string, endPeriod?: string) => {
    try {
      const snap = await getDocs(collection(db, "users", uid, "ledger"));
      let totalPaidRegular = 0;
      let totalPaidExtra = 0;
      let totalBilledRegular = 0;
      let totalBilledExtra = 0;
      let totalDebtRegular = 0;
      let totalDebtExtra = 0;

      snap.forEach(item => {
        const p = { period: item.id, ...item.data() } as Payment;
        const period = p.period || item.id;
        if (startPeriod && period < startPeriod) return;
        if (endPeriod && period > endPeriod) return;

        const regularAmount = Math.max(0, Number(p.amount) || 0);
        const legacyPaid = Math.max(0, Number(p.paid) || 0);
        const regularPaidRaw = p.paidRegular !== undefined
          ? Math.max(0, Number(p.paidRegular) || 0)
          : Math.min(legacyPaid, regularAmount);
        const regularPaid = Math.min(regularPaidRaw, regularAmount);
        const regularDebt = Math.max(0, regularAmount - regularPaid);

        let extraBilled = 0;
        let extraPaid = 0;
        let extraDebt = 0;

        if (Array.isArray(p.extraFees) && p.extraFees.length > 0) {
          p.extraFees.filter(fee => !fee.forgiven).forEach(fee => {
            const amount = Math.max(0, Number(fee.amount) || 0);
            const paid = Math.min(Math.max(0, Number(fee.paid) || 0), amount);
            extraBilled += amount;
            extraPaid += paid;
            extraDebt += Math.max(0, amount - paid);
          });
        } else {
          const amount = Math.max(0, Number(p.extraAmount) || 0);
          const fallbackPaidExtra = Math.max(0, legacyPaid - regularPaid);
          const paidRaw = p.paidExtra !== undefined
            ? Math.max(0, Number(p.paidExtra) || 0)
            : fallbackPaidExtra;
          const paid = Math.min(paidRaw, amount);
          extraBilled = amount;
          extraPaid = paid;
          extraDebt = Math.max(0, amount - paid);
        }

        totalBilledRegular += regularAmount;
        totalPaidRegular += regularPaid;
        totalDebtRegular += regularDebt;
        totalBilledExtra += extraBilled;
        totalPaidExtra += extraPaid;
        totalDebtExtra += extraDebt;
      });

      return {
        totalPaid: totalPaidRegular + totalPaidExtra,
        totalDebt: totalDebtRegular + totalDebtExtra,
        totalBilled: totalBilledRegular + totalBilledExtra,
        totalPaidRegular,
        totalPaidExtra,
        totalBilledRegular,
        totalBilledExtra,
        totalDebtRegular,
        totalDebtExtra,
      };
    } catch (error) {
      console.error('Error calculando resumen financiero del miembro:', error);
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
  },
  
`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(path, source);
console.log('✓ Resumen financiero de miembros unificado con ledger e IA');
