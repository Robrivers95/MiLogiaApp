import React, { useEffect, useState } from 'react';
import type { Payment, Role, User } from '../types';
import { accountStatus, degreeLabel, memberMoney, memberStatus, MemberStats, paymentHistoryRows, roleLabel } from '../services/memberPresentation';
export interface MemberActions {
  edit: (member: User) => void;
  payments: (uid: string) => void;
  advance: (member: User) => void;
  role: (uid: string, role: Role) => void;
  status: (uid: string, active: boolean) => Promise<void>;
  link: () => void;
}
interface Props { member: User; currentUser: User; stats?: MemberStats; statsLoading: boolean; readOnly: boolean; actions: MemberActions; loadHistory: (uid: string) => Promise<Payment[]>; revision: number; onClose: () => void; }
export default function MemberDetail({ member, currentUser, stats, statsLoading, readOnly, actions, loadHistory, revision, onClose }: Props) {
  const [tab, setTab] = useState<'profile' | 'history'>('profile');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [changingStatus, setChangingStatus] = useState(false);
  useEffect(() => { setTab('profile'); setPayments([]); setError(''); }, [member.uid]);
  useEffect(() => {
    if (tab !== 'history') return;
    let canceled = false;
    setLoading(true); setError(''); setPayments([]);
    loadHistory(member.uid).then(result => { if (!canceled) setPayments(result); })
      .catch(() => { if (!canceled) setError('No se pudo cargar el historial. Intenta de nuevo.'); })
      .finally(() => { if (!canceled) setLoading(false); });
    return () => { canceled = true; };
  }, [member.uid, tab, revision, retry, loadHistory]);
  let history: ReturnType<typeof paymentHistoryRows> = [];
  let historyError = error;
  try { history = paymentHistoryRows(payments); } catch { historyError = 'Hay un registro con montos inválidos. Revisa los pagos de este miembro.'; }
  const displayMoney = (value?: number) => statsLoading ? 'Actualizando…' : value == null ? 'Sin calcular' : memberMoney(value);
  return <aside className="member-detail fixed inset-0 z-40 bg-logia-900 overflow-y-auto lg:static lg:z-auto lg:rounded-xl lg:border lg:border-logia-700 lg:bg-logia-800 min-w-0" aria-label="Ficha del miembro">
    <div className="sticky top-0 bg-logia-800 border-b border-logia-700 p-4 flex gap-3 justify-between items-start z-10">
      <div className="min-w-0"><p className="text-xs text-indigo-300">Ficha del miembro</p><h3 className="text-lg font-bold break-words">{member.name}</h3><p className="text-xs text-gray-400 break-all">{member.email}</p></div>
      <button onClick={onClose} className="shrink-0 p-3 rounded-lg border border-logia-700" aria-label="Cerrar ficha">Cerrar</button>
    </div>
    <div className="p-4 space-y-5 pb-10">
      <div className="flex flex-wrap gap-2 text-xs"><span className={`rounded-full px-3 py-1 ${member.active ? 'bg-green-900 text-green-200' : 'bg-amber-900 text-amber-200'}`}>{memberStatus(member)}</span><span className="border border-logia-700 rounded-full px-3 py-1">{accountStatus(member)}</span></div>
      <div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-logia-900 p-3"><p className="text-xs text-gray-400">Adeudo</p><p className="font-bold text-red-300 break-words">{displayMoney(stats?.totalDebt)}</p></div><div className="rounded-lg bg-logia-900 p-3"><p className="text-xs text-gray-400">Pagado</p><p className="font-bold text-green-300 break-words">{displayMoney(stats?.totalPaid)}</p></div></div>
      <nav className="flex gap-2" aria-label="Secciones de la ficha">{(['profile', 'history'] as const).map(id => <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} className={`flex-1 p-3 rounded-lg text-sm ${tab === id ? 'bg-indigo-600' : 'border border-logia-700'}`}>{id === 'profile' ? 'Perfil y acciones' : 'Historial de cuotas'}</button>)}</nav>
      {tab === 'profile' ? <>
        <dl className="grid grid-cols-2 gap-4 text-sm">{[['Grado', degreeLabel(member.degree)], ['Cargo', (member.lodgeRole || 'Sin cargo').replace(/_/g, ' ')], ['Ingreso a la app', member.joinDate?.slice(0, 10) || 'Sin fecha'], ['Iniciación', member.masonicJoinDate || 'Sin fecha'], ['Último reingreso', member.masonicRejoinDate || 'Sin fecha'], ['Fecha de baja', member.leaveDate || 'Sin baja'], ['Ciudad', member.city || 'Sin registrar'], ['Profesión', member.profession || 'Sin registrar']].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-gray-400">{label}</dt><dd className="break-words mt-1 capitalize">{value}</dd></div>)}</dl>
        <label className="block text-xs text-gray-400">Rol en la aplicación<select value={member.role} disabled={readOnly || member.uid === currentUser.uid || member.role === 'master'} onChange={event => actions.role(member.uid, event.target.value as Role)} className="block mt-1 w-full rounded-lg border border-logia-700 bg-logia-900 p-3 text-sm text-white disabled:opacity-60"><option value="member">Miembro</option><option value="admin">Administrador</option><option value="viewer">Observador</option>{member.role === 'master' && <option value="master">{roleLabel('master')}</option>}</select></label>
        {readOnly && <p className="text-xs text-amber-300">Solo lectura. Puedes consultar la ficha y el historial.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2"><button disabled={readOnly} onClick={() => actions.edit(member)} className="rounded-lg bg-indigo-600 p-3 text-sm disabled:opacity-40">Editar perfil</button><button disabled={readOnly} onClick={() => actions.payments(member.uid)} className="rounded-lg border border-logia-700 p-3 text-sm disabled:opacity-40">Gestionar pagos</button><button disabled={readOnly || !member.active} onClick={() => actions.advance(member)} className="rounded-lg border border-logia-700 p-3 text-sm disabled:opacity-40">Registrar anticipo</button>{member.uid.startsWith('temp_') && <button disabled={readOnly} onClick={actions.link} className="rounded-lg border border-indigo-700 text-indigo-300 p-3 text-sm disabled:opacity-40">Vincular cuenta real</button>}</div>
        <div className="border-t border-logia-700 pt-4"><p className="text-xs text-gray-400 mb-3">La baja conserva el historial. La fecha de reingreso determina desde cuándo se cobran las cuotas.</p><button disabled={readOnly || changingStatus} onClick={async () => { setChangingStatus(true); try { await actions.status(member.uid, member.active); } catch { setError('No se pudo cambiar el estado. Intenta de nuevo.'); } finally { setChangingStatus(false); } }} className={`w-full p-3 rounded-lg border text-sm disabled:opacity-40 ${member.active ? 'border-red-900 text-red-300' : 'border-green-800 text-green-300'}`}>{changingStatus ? 'Procesando…' : member.active ? 'Dar de baja' : member.leaveDate ? 'Reactivar miembro' : 'Dar entrada al miembro'}</button>{error && <p className="text-xs text-red-300 mt-2">{error}</p>}</div>
      </> : <div className="space-y-3">
        <p className="text-xs text-gray-400">Historial completo. Los saldos del resumen corresponden al período seleccionado en el directorio.</p>
        {loading ? <p role="status">Cargando historial…</p> : historyError ? <div><p className="text-red-300 text-sm">{historyError}</p><button onClick={() => setRetry(value => value + 1)} className="p-3 border border-logia-700 rounded-lg mt-2">Reintentar</button></div> : history.length ? history.map((row, index) => <article key={`${row.period}-${index}`} className="rounded-lg border border-logia-700 p-3"><div className="flex justify-between gap-2 text-sm"><strong>{row.concept}</strong><span className="shrink-0 text-indigo-300">{row.period}</span></div><dl className="grid grid-cols-3 gap-2 mt-3 text-xs"><div><dt className="text-gray-400">Cuota</dt><dd className="break-words mt-1">{memberMoney(row.amount)}</dd></div><div><dt className="text-gray-400">Pagado</dt><dd className="text-green-300 break-words mt-1">{memberMoney(row.paid)}</dd></div><div><dt className="text-gray-400">Saldo</dt><dd className="text-red-300 break-words mt-1">{memberMoney(row.balance)}</dd></div></dl>{row.forgiven && <p className="mt-2 text-xs text-amber-300">Cuota perdonada</p>}</article>) : <p className="text-sm text-gray-400">No hay cuotas registradas para este miembro.</p>}
      </div>}
    </div>
  </aside>;
}
