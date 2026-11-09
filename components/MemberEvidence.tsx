import React, { useEffect, useState } from 'react';
import { memberMoney, memberEvidence } from '../services/memberPresentation';
export default function MemberEvidence({ items,onCorrectPeriod }: { items: ReturnType<typeof memberEvidence>;onCorrectPeriod?:(period:string)=>void }) {
  const [preview, setPreview] = useState<{url: string; label: string} | null>(null);
  useEffect(() => {
    if (!preview) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopImmediatePropagation(); setPreview(null); } };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [preview]);
  const date = (value: string) => value ? value.slice(0,10) : 'Sin fecha registrada';
  return <div className="space-y-3">
    {items.length ? items.map(item => <article key={item.id} className="rounded-lg border border-logia-700 p-3 space-y-2 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><strong className="break-words">{item.concept}</strong><span className={item.status === 'pending' ? 'text-amber-300' : item.status === 'rejected' ? 'text-red-300' : 'text-green-300'}>{({pending:'En revisión',approved:'Aprobado',rejected:'Rechazado',registered:'Registrado en pagos'} as Record<string,string>)[item.status] || item.status}</span></div>
      <p className="text-xs text-gray-400">{item.source} · {item.id.startsWith('balance-')?'Última fecha registrada: ':''}{date(item.date)}</p>
      <p className="text-xs">Períodos: {item.periods.join(', ') || 'Sin período asociado'}</p>
      {item.id.startsWith('receipt-')&&<p className="text-xs text-gray-400 break-all">Folio interno: {item.id.slice(8)}</p>}
      {(item.reference||item.originalReference)&&<p className="text-xs text-indigo-200 break-all">Folio: {item.reference||item.originalReference}</p>}
      {item.originalReference&&item.reference&&item.originalReference!==item.reference&&<p className="text-xs text-gray-400 break-all">Folio bancario original: {item.originalReference}</p>}
      {item.allocations.map((a,i)=><p key={i} className="text-xs text-gray-300">{a.period} · {a.concept}: {memberMoney(a.amount)}</p>)}
      {onCorrectPeriod&&item.id.startsWith('receipt-')&&item.concept==='Cuota mensual'&&item.periods.map(period=><button type="button" key={period} onClick={()=>onCorrectPeriod(period)} className="rounded-lg bg-indigo-600 p-3 text-sm">Corregir mensualidad {period}</button>)}
      {item.amount != null && <p>{item.id.startsWith('balance-')?'Saldo registrado:':'Declarado:'} {memberMoney(Number(item.amount))}</p>}
      {item.applied != null && <p className="text-green-300">Aplicado al saldo: {memberMoney(Number(item.applied))}</p>}
      {!!item.unapplied&&<p className="text-xs text-amber-200">Sin aplicar al registrar este comprobante: {memberMoney(item.unapplied)}</p>}
      {item.status === 'pending' && <p className="text-xs text-amber-300">Pendiente de aprobación. Consulta el saldo registrado en cuotas.</p>}
      {item.status === 'rejected' && <p className="text-xs text-red-300">Este comprobante fue rechazado.</p>}
      {item.comments && <details className="text-xs text-gray-300"><summary className="cursor-pointer">Notas del comprobante</summary><p className="whitespace-pre-wrap break-words mt-2">{item.comments}</p></details>}
      {item.urls.length ? <div className="flex flex-wrap gap-2">{item.urls.map((url,index) => <button key={url} onClick={() => setPreview({url,label:`${item.concept} · ${item.periods.join(', ')} · Archivo ${index+1}`})} className="rounded-lg border border-indigo-700 text-indigo-200 p-3 text-sm">Ver comprobante {index+1}</button>)}</div> : <p className="text-xs text-gray-400">Sin archivo adjunto.</p>}
    </article>) : <p className="text-sm text-gray-400">No hay comprobantes asociados a esta consulta.</p>}
    {preview && <div role="dialog" aria-modal="true" aria-label="Visor de comprobante" className="fixed inset-0 z-[70] bg-logia-900 flex flex-col p-3 gap-3">
      <div className="flex gap-2 items-center justify-between"><p className="text-sm break-words min-w-0">{preview.label}</p><button autoFocus onClick={() => setPreview(null)} className="p-3 border border-logia-700 rounded-lg shrink-0">Cerrar comprobante</button></div>
      {/\.pdf(?:[?#]|$)|^data:application\/pdf/i.test(preview.url) ? <iframe title="Comprobante PDF" src={preview.url} className="w-full flex-1 min-h-0 bg-white rounded-lg" /> : <div className="flex-1 overflow-auto"><img src={preview.url} alt={preview.label} className="w-full h-auto" /><p className="text-xs text-gray-400 mt-3">Puedes ampliar con el gesto de zoom del celular.</p></div>}
      <a href={preview.url} target="_blank" rel="noopener noreferrer" className="p-3 rounded-lg border border-indigo-700 text-center text-indigo-200">Abrir archivo original</a>
    </div>}
  </div>;
}

