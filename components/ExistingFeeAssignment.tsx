import React, { useEffect, useState } from 'react';
import type { Payment, User } from '../types';
import { ExistingFeeTemplate, hasAssignedFee } from '../services/extraFeeLifecycle';
import { memberMoney } from '../services/memberPresentation';
export default function ExistingFeeAssignment({ templates, members, ledgers, initialConcept, onAssign, onClose }: {
  templates: ExistingFeeTemplate[]; members: User[]; ledgers: Record<string,Payment[]>; initialConcept: string;
  onAssign: (template: ExistingFeeTemplate, uids: string[]) => Promise<{created:number;skipped:number;failed:string[]}>; onClose: () => void;
}) {
  const [key,setKey]=useState(templates.find(fee=>fee.description===initialConcept)?.key || templates[0]?.key || '');
  const template=templates.find(fee=>fee.key===key);
  const [query,setQuery]=useState('');const [selected,setSelected]=useState<string[]>([]);
  const [forgiven,setForgiven]=useState(!!template?.forgiven);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  useEffect(()=>{setSelected([]);setForgiven(!!template?.forgiven);setMessage('');},[key]);
  const search=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const eligible=template ? members.filter(member=>!hasAssignedFee(ledgers[member.uid] || [],template)) : [];
  const matches=eligible.filter(member=>search(`${member.name} ${member.email}`).includes(search(query)));
  const visible=matches.slice(0,100);
  return <section aria-label="Asignar cuota existente" className="mb-4 p-4 rounded-xl border border-indigo-700 bg-logia-900 space-y-4">
    <div className="flex gap-3 justify-between items-start"><div><h4 className="font-bold">Asignar cuota existente</h4><p className="text-xs text-gray-400 mt-1">Agrega a quienes faltaron sin crear otra cuota ni duplicar asignaciones.</p></div><button disabled={busy} onClick={onClose} className="p-3 rounded-lg border border-logia-700 text-sm">Cerrar</button></div>
    <label className="block text-xs text-gray-400">Cuota y período<select disabled={busy} value={key} onChange={event=>setKey(event.target.value)} className="block w-full mt-1 p-3 bg-logia-800 border border-logia-700 rounded-lg text-white text-sm"><option value="">Selecciona una cuota</option>{templates.map(fee=><option key={fee.key} value={fee.key}>{fee.description} · {fee.period} · {memberMoney(fee.amount)}{fee.forgiven ? ' · Perdonada' : ''}</option>)}</select></label>
    {!templates.length && <p className="text-sm text-gray-400">No hay cuotas extraordinarias en el año seleccionado.</p>}
    {template && <>
      <label className="flex gap-2 items-start text-sm"><input type="checkbox" checked={forgiven} disabled={busy} onChange={event=>setForgiven(event.target.checked)} className="mt-1" />Asignar sin adeudo (perdonada; acepta abonos voluntarios)</label>
      <p className="text-xs text-gray-400">{forgiven ? 'Se conserva el monto original y el adeudo será $0.' : `Se asignará un adeudo de ${memberMoney(template.amount)} a cada miembro seleccionado.`} Las otras cuotas y pagos se conservan.</p>
      <label className="block text-xs text-gray-400">Buscar miembro sin esta cuota<input disabled={busy} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Nombre o correo" className="block w-full p-3 mt-1 bg-logia-800 border border-logia-700 rounded-lg text-white text-sm" /></label>
      <div className="flex flex-wrap gap-3 text-xs items-center"><span>{eligible.length} sin asignar · {selected.length} seleccionados</span><button disabled={busy} onClick={()=>setSelected(previous=>[...new Set([...previous,...visible.map(member=>member.uid)])])} className="p-3 border border-logia-700 rounded-lg">Seleccionar visibles</button><button disabled={busy} onClick={()=>setSelected([])} className="p-3">Limpiar selección</button></div>
      <div className="max-h-64 overflow-y-auto space-y-2">{visible.map(member=><label key={member.uid} className="flex gap-3 p-3 bg-logia-800 rounded-lg text-sm"><input disabled={busy} type="checkbox" checked={selected.includes(member.uid)} onChange={event=>setSelected(previous=>event.target.checked ? [...previous,member.uid] : previous.filter(uid=>uid!==member.uid))} /><span className="min-w-0 break-words">{member.name}<span className="block text-xs text-gray-400 break-all">{member.email}{!member.active ? ' · Inactivo' : ''}</span></span></label>)}</div>
      {!matches.length && <p className="text-sm text-gray-400">No hay miembros pendientes de asignar con esta búsqueda.</p>}
      {matches.length>100 && <p className="text-xs text-gray-400">Mostrando 100 de {matches.length}. Usa la búsqueda para encontrar a otro miembro.</p>}
      <button disabled={busy || !selected.length} onClick={async()=>{setBusy(true);setMessage('');try{const result=await onAssign({...template,forgiven},selected);setMessage(`${result.created} asignados · ${result.skipped} ya tenían la cuota${result.failed.length ? ` · No se pudo asignar a: ${result.failed.join(', ')}` : ''}`);setSelected(result.failed.length ? selected.filter(uid=>result.failed.includes(members.find(member=>member.uid===uid)?.name || uid)) : []);}catch(error){setMessage(error instanceof Error ? error.message : 'No se pudo asignar la cuota. Intenta de nuevo.');}finally{setBusy(false);}}} className="w-full sm:w-auto p-3 bg-indigo-600 rounded-lg text-sm disabled:opacity-40">{busy ? 'Asignando…' : `Asignar a ${selected.length} miembro(s)`}</button>
    </>}
    {message && <p role="status" className="text-sm text-indigo-200 break-words">{message}</p>}
  </section>;
}
