import type { Payment, User } from '../types';
import { paymentHistoryRows, memberMoney } from './memberPresentation';

export const canUseWhatsApp = (user: User, suspended = false) => user.role === 'admin' && user.active && !!user.groupId && !suspended;
export function currentReminderPeriod(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone:'America/Monterrey', year:'numeric', month:'2-digit' }).formatToParts(date);
  return `${parts.find(part=>part.type==='year')!.value}-${parts.find(part=>part.type==='month')!.value}`;
}
export function normalizeWhatsAppPhone(value: string): string {
  if (!value.trim()) return '';
  if (!/^\+?[\d\s().-]+$/.test(value.trim())) throw new Error('Escribe un teléfono válido, sin extensiones.');
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10 && !value.trim().startsWith('+')) digits = `52${digits}`;
  // Mexico no longer uses the old +521 mobile prefix.
  if (digits.length === 13 && digits.startsWith('521')) digits = `52${digits.slice(3)}`;
  if (!/^[1-9]\d{6,14}$/.test(digits) || (digits.startsWith('52') && digits.length !== 12)) throw new Error('Usa 10 dígitos para México o +código de país y número.');
  return digits;
}
export function debtReminder(payments: Payment[], groupId: string, currentPeriod: string) {
  const rows = paymentHistoryRows(payments.filter(payment => (!payment.groupId || payment.groupId === groupId) && payment.period <= currentPeriod)).filter(row => row.balance > 0);
  const periods = [...new Set(rows.map(row => row.period))].sort();
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const labels = periods.map(period => `${months[Number(period.slice(5))-1]} ${period.slice(0,4)}`);
  const body = labels.length <= 3 ? `Meses pendientes: ${labels.join(', ')}` : `Tienes ${labels.length} meses pendientes de pago hasta la fecha.`;
  return { rows, periods, body, total: Math.round(rows.reduce((total,row) => total + row.balance, 0) * 100) / 100 };
}
export function whatsappMessage(member: User, groupName: string, reminder: ReturnType<typeof debtReminder>, instructions = '', batchMessage = '') {
  if (reminder.total <= 0) throw new Error('Este miembro no tiene adeudo pendiente.');
  return [...(batchMessage.trim() ? [batchMessage.trim(), ''] : []), `Hola, ${member.name || 'hermano'}.`, `Recordatorio de pago de ${groupName || 'tu Logia'}.`, reminder.body,
    `Adeudo pendiente: ${memberMoney(reminder.total)}.`, '', 'Detalle:',
    ...reminder.rows.map(row => `• ${row.period} · ${row.concept}: ${memberMoney(row.balance)}`), '',
    ...(instructions.trim() ? [instructions.trim(), ''] : []),
    'Si ya realizaste el pago, por favor comparte tu comprobante para revisarlo. Gracias.'
  ].join('\n');
}
export function whatsappChatUrl(phone: string, message: string): string {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) throw new Error('Falta el teléfono de WhatsApp.');
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
export interface WhatsAppRecipient { member: User; reminder: ReturnType<typeof debtReminder>; error?: string; }
export interface WhatsAppPreparation { groupName: string; recipients: WhatsAppRecipient[]; calculatedAt: string; }
