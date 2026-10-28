import React, {useEffect, useRef, useState} from 'react';
import type {User} from '../types';

interface Props {
  member: User;
  initialDate: string;
  busy: boolean;
  error: string;
  onConfirm: (date: string) => Promise<void>;
  onClose: () => void;
}

export default function MemberStatusDialog({member, initialDate, busy, error, onConfirm, onClose}: Props) {
  const [date, setDate] = useState(initialDate);
  const [validation, setValidation] = useState('');
  const panel = useRef<HTMLFormElement>(null);
  const leaving = member.active;
  const rejoining = !leaving && !!member.leaveDate;
  const title = leaving ? 'Dar de baja al miembro' : rejoining ? 'Reactivar miembro' : 'Dar entrada al hermano';
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {document.body.style.overflow = overflow; previous?.focus();};
  }, []);
  return <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onKeyDown={event => {
    if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); if (!busy) onClose();}
    if (event.key === 'Tab') {
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)') || []);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
    }
  }}>
    <form ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="member-status-title" aria-describedby="member-status-description" aria-busy={busy} noValidate
      className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-xl border border-logia-700 bg-logia-800 p-5 shadow-2xl space-y-4"
      onSubmit={event => {event.preventDefault(); if (busy) return; if (!date) {setValidation('Selecciona una fecha para continuar.'); return;} setValidation(''); void onConfirm(date);}}>
      <h3 id="member-status-title" className="text-xl font-bold text-white">{title}</h3>
      <div className="min-w-0 break-words"><p className="font-semibold text-white">{member.name}</p><p className="text-sm text-gray-400">{member.email}</p></div>
      <p id="member-status-description" className="text-sm text-gray-300">{leaving
        ? 'La baja conserva sus pagos e historial. Confirma la fecha en que deja de estar activo.'
        : 'Confirma la fecha desde la que debe estar activo. Las cuotas correrán desde esa fecha y sus pagos anteriores se conservarán.'}</p>
      <label className="block text-sm text-gray-300">{leaving ? 'Fecha de baja' : rejoining ? 'Fecha de reingreso' : 'Fecha de entrada'}
        <input type="date" required value={date} disabled={busy} onChange={event => {setDate(event.target.value); setValidation('');}}
          className="block w-full min-w-0 rounded-lg border border-logia-700 bg-logia-900 p-3 mt-2 text-white" />
      </label>
      {(validation || error) && <p role="alert" className="rounded-lg border border-red-500/50 bg-red-900/30 p-3 text-sm text-red-200 break-words">{validation || error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-logia-700 p-3 text-white disabled:opacity-50">Cancelar</button>
        <button type="submit" disabled={busy} className="rounded-lg bg-green-600 p-3 font-semibold text-white disabled:opacity-50">{busy ? 'Guardando…' : leaving ? 'Confirmar baja' : rejoining ? 'Confirmar reingreso' : 'Confirmar entrada'}</button>
      </div>
    </form>
  </div>;
}
