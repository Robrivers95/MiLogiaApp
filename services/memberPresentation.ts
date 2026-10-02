import type { Payment, User } from '../types';
import { normalizePayment } from './paymentAccounting';
export interface MemberStats {
  totalPaid: number; totalDebt: number; totalBilled: number;
  totalPaidRegular?: number; totalPaidExtra?: number; totalBilledRegular?: number; totalBilledExtra?: number;
}
export const memberStatus = (member: User) => member.active ? 'Activo' : member.leaveDate ? 'Inactivo' : 'Pendiente';
export const accountStatus = (member: User) => member.uid.startsWith('temp_') ? 'Sin cuenta vinculada' : 'Cuenta vinculada';
export const memberMoney = (value: number) => value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
export const degreeLabel = (degree?: string) => ({ aprendiz: 'Aprendiz', companero: 'Compañero', maestro: 'Maestro' }[degree || ''] || 'Sin grado');
export const roleLabel = (role: string) => ({ member: 'Miembro', admin: 'Administrador', viewer: 'Observador', master: 'Maestro del sistema' }[role] || role);
export function paymentHistoryRows(payments: Payment[]) {
  return [...payments].sort((a, b) => b.period.localeCompare(a.period)).flatMap(source => {
    const payment = normalizePayment(source);
    const rows = [{ period: payment.period, concept: 'Cuota mensual', amount: payment.amount, paid: payment.paidRegular || 0, balance: Math.max(0, payment.amount - (payment.paidRegular || 0)), forgiven: false }];
    if (payment.extraFees?.length) {
      rows.push(...payment.extraFees.map(fee => ({ period: payment.period, concept: fee.description, amount: fee.amount, paid: fee.paid, balance: fee.forgiven ? 0 : Math.max(0, fee.amount - fee.paid), forgiven: Boolean(fee.forgiven) })));
    } else if (payment.extraAmount) {
      rows.push({ period: payment.period, concept: payment.extraDescription || 'Cuota extraordinaria', amount: payment.extraAmount, paid: payment.paidExtra || 0, balance: Math.max(0, payment.extraAmount - (payment.paidExtra || 0)), forgiven: false });
    }
    return rows;
  });
}
