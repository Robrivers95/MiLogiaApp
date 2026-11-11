import type { TreasuryEntry } from '../types';

export interface ProjectAccountingSummary {
  linkedIncome: number;
  manualIncome: number;
  expenses: number;
  totalIncome: number;
  balance: number;
  marginPct: number | null;
}

const money = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * La aportación real para una cuota vinculada es el mayor entre:
 *  - lo acumulado en el ledger histórico, y
 *  - el efectivo documentado por comprobantes aprobados.
 *
 * Esto evita dos errores opuestos:
 *  - perder excedentes cuando el ledger fue limitado a la meta;
 *  - duplicar el mismo dinero cuando el ledger ya contenía el excedente.
 */
export const resolveActualContribution = (
  ledgerPaid: number,
  approvedReceiptAmounts: number[]
): number => {
  const ledger = money(ledgerPaid);
  const documented = approvedReceiptAmounts.reduce((sum, amount) => sum + money(amount), 0);
  return Math.max(ledger, documented);
};

export const calculateProjectSummary = (
  linkedIncome: number,
  treasuryEntries: TreasuryEntry[]
): ProjectAccountingSummary => {
  const linked = money(linkedIncome);
  const manualIncome = treasuryEntries
    .filter(entry => entry.type === 'income')
    .reduce((sum, entry) => sum + money(entry.amount), 0);
  const expenses = treasuryEntries
    .filter(entry => entry.type === 'expense')
    .reduce((sum, entry) => sum + money(entry.amount), 0);
  const totalIncome = linked + manualIncome;
  const balance = totalIncome - expenses;
  const marginPct = totalIncome > 0 ? (balance / totalIncome) * 100 : null;

  return { linkedIncome: linked, manualIncome, expenses, totalIncome, balance, marginPct };
};
