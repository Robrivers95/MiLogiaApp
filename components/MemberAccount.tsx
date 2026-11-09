import InlineMonthlyEdit from './InlineMonthlyEdit';
import React,{useState,useRef} from 'react';
import type {Payment,PaymentReceipt} from '../types';
import {incomeTargets} from '../services/incomeSelection';
import {memberEvidence,receiptMatchesConcept} from '../services/memberPresentation';
import MemberEvidence from './MemberEvidence';
const money=(n:number)=>n.toLocaleString('es-MX',{style:'currency',currency:'MXN'});
export default function MemberAccount({payments,receipts,onQuota,onCorrect}:{payments:Payment[];receipts:PaymentReceipt[];onCorrect?:(payment:Payment,paid:number,date:string,reason:string)=>Promise<void>;onQuota?:(period:string,kind:'regular'|'extra',feeId?:string,concept?:string)=>void}){
 const [expanded,setExpanded]=useState<string[]>([]);
 const editor=useRef<HTMLDivElement>(null);const [editRevision,setEditRevision]=useState(0);
 const [editPeriod,setEditPeriod]=useState('');
 const editablePayment=payments.find(p=>p.period===editPeriod)||[...payments].sort((a,b)=>b.period.localeCompare(a.period))[0];
 const [view,setView]=useState('quotas'),[search,setSearch]=useState(''),[year,setYear]=useState('all'),[onlyDebt,setOnlyDebt]=useState(false);
 let targets:ReturnType<typeof incomeTargets>;try{targets=incomeTargets(payments);}catch{return <p role="alert" className="text-sm text-red-300">Hay montos inválidos en el historial. Revisa las correcciones de cuotas antes de registrar abonos.</p>;}
 const evidence=memberEvidence(payments,receipts);
 const missing=[...new Set(receipts.filter(r=>r.status!=='rejected').flatMap(r=>r.receiptType==='cuota_mensual'?(r.periods||[]):[]))].filter(period=>!targets.some(t=>t.kind==='regular'&&t.period===period));
 const years=[...new Set([...targets.map(t=>t.period.slice(0,4)),...missing.map(p=>p.slice(0,4))])].sort().reverse();
 const rows=targets.filter(t=>(year==='all'||t.period.startsWith(year))&&(!onlyDebt||t.balance>0));
 const query=search.toLocaleLowerCase('es').trim();
 const items=evidence.filter(e=>(year==='all'||e.periods.some(p=>p.startsWith(year)))&&[e.id,e.reference,e.originalReference,e.date,e.comments,e.concept,...e.periods].join(' ').toLocaleLowerCase('es').includes(query));
 return <section aria-label="Estado de cuenta del miembro" className="space-y-3 min-w-0">
  <div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg bg-logia-900 p-3"><p className="text-xs text-gray-400">Pagado en cuotas</p><b className="text-green-300">{money(targets.reduce((s,t)=>s+t.paid,0))}</b></div><div className="rounded-lg bg-logia-900 p-3"><p className="text-xs text-gray-400">Saldo de cuotas registradas</p><b className="text-amber-300">{money(targets.reduce((s,t)=>s+t.balance,0))}</b></div></div>
   {onCorrect&&editablePayment&&<div ref={editor} className="scroll-mt-4 rounded-lg border border-indigo-700 p-3 space-y-3"><p className="font-bold">Corregir un pago mensual</p><label className="block">Mes a corregir<select aria-label="Mes a corregir" value={editablePayment.period} onChange={e=>setEditPeriod(e.target.value)} className="block w-full min-w-0 bg-logia-900 rounded-lg p-3">{[...payments].sort((a,b)=>b.period.localeCompare(a.period)).map(p=><option key={p.period} value={p.period}>{p.period}</option>)}</select></label><p className="text-xs">Cuota: ${editablePayment.amount.toFixed(2)} · Abonado: ${Number(editablePayment.paidRegular??Math.min(editablePayment.paid||0,editablePayment.amount)).toFixed(2)}</p><InlineMonthlyEdit key={editablePayment.period+editRevision} startOpen={editRevision>0} payment={editablePayment} onSave={(paid,date,reason)=>onCorrect(editablePayment,paid,date,reason)}/></div>}
  <nav aria-label="Vista del estado de cuenta" className="flex flex-wrap gap-2">{[['quotas','Cuotas y saldos'],['movements','Abonos y transferencias']].map(([id,label])=><button type="button" key={id} onClick={()=>setView(id)} aria-pressed={view===id} className={`rounded-lg p-3 text-sm ${view===id?'bg-indigo-600':'border border-logia-700'}`}>{label}</button>)}</nav>
  <label className="block text-sm">Año <select aria-label="Año del estado de cuenta" value={year} onChange={e=>setYear(e.target.value)} className="bg-logia-900 border border-logia-700 rounded-lg p-2"><option value="all">Todos</option>{years.map(y=><option key={y}>{y}</option>)}</select></label>
  {missing.filter(p=>year==='all'||p.startsWith(year)).length>0&&<div className="rounded-lg border border-amber-700 p-3 text-xs text-amber-200"><p>Hay comprobantes para meses sin cuota mensual asignada. El envío de un comprobante todavía no confirma un pago.</p>{missing.filter(p=>year==='all'||p.startsWith(year)).map(p=><p key={p} className="mt-1">{p} · Sin cuota asignada</p>)}<p className="mt-2">Puedes crear esa mensualidad para este miembro y revisar su comprobante.</p></div>}
  {view==='movements'?<><label className="block text-sm">Buscar fecha, mes o folio<input aria-label="Buscar abonos del miembro" value={search} onChange={e=>setSearch(e.target.value)} className="block w-full min-w-0 bg-logia-900 border border-logia-700 rounded-lg p-3 mt-1"/></label><p className="text-xs text-gray-400">Cada transferencia se muestra una sola vez. Un acumulado antiguo sin comprobante no permite reconstruir la fecha ni el folio de cada parcialidad.</p><MemberEvidence items={items} onCorrectPeriod={onCorrect?(period)=>{if(!payments.some(p=>p.period===period))return;setEditPeriod(period);setEditRevision(n=>n+1);editor.current?.scrollIntoView({behavior:'smooth',block:'start'});}:undefined}/></>:<>
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={onlyDebt} onChange={e=>setOnlyDebt(e.target.checked)}/>Solo cuotas con adeudo</label>
   <div className="space-y-3" aria-label="Cuotas con detalle de abonos">{rows.map(t=>{
    const matching=receipts.filter(r=>receiptMatchesConcept(r,t.period,t.kind,t.feeId,t.concept));
    const detail=memberEvidence(payments.filter(p=>p.period===t.period),matching).filter(e=>e.id.startsWith('receipt-')||e.id.startsWith('ledger-')||(e.id.startsWith('balance-')&&e.concept===(t.kind==='regular'?'Cuota mensual':t.concept)));
    return <article key={t.key} className="rounded-lg border border-logia-700 p-3 space-y-3"><div className="flex flex-wrap justify-between gap-2"><div><b>{t.period} · {t.concept}</b></div><b className={t.balance?'text-amber-300':'text-green-300'}>{t.forgiven?'Perdonada':!t.balance?'Pagada':t.paid?'Parcial':'Pendiente'}</b></div>
    <div className="grid grid-cols-3 gap-2 text-sm"><div>Cuota<p>{money(t.amount)}</p></div><div>Pagado<p className="text-green-300">{money(t.paid)}</p></div><div>Pendiente<p className="text-amber-300">{money(t.balance)}</p></div></div>
    <button type="button" aria-expanded={expanded.includes(t.key)} onClick={()=>setExpanded(old=>old.includes(t.key)?old.filter(k=>k!==t.key):[...old,t.key])} className="rounded-lg bg-indigo-600 p-3 text-sm">{expanded.includes(t.key)?'Ocultar detalle':'Ver abonos y referencias'}</button>
    {t.kind==='regular'&&onCorrect&&<button type="button" onClick={()=>{setEditPeriod(t.period);setEditRevision(n=>n+1);editor.current?.scrollIntoView({behavior:'smooth',block:'start'});}} className="p-3 border border-indigo-700 rounded-lg text-sm">Corregir total de este mes</button>}
    {expanded.includes(t.key)&&<div className="border-t border-logia-700 pt-3 space-y-3"><MemberEvidence items={detail}/>{(payments.find(p=>p.period===t.period)?.correctionHistory||[]).length>0&&<details><summary>Historial de cambios manuales del mes</summary>{payments.find(p=>p.period===t.period)!.correctionHistory!.map((c,i)=><p key={i} className="text-xs mt-2">{c.at.slice(0,10)} · Total del mes: {money(c.before)} → {money(c.after)} · Fecha registrada: {c.afterDate?.slice(0,10)||'sin fecha'} · {c.reason}</p>)}</details>}
    <p className="text-xs text-gray-400">El total pagado proviene del registro de cuotas. Los comprobantes son su evidencia; no se suman otra vez.</p>
    {onQuota&&<button type="button" onClick={()=>onQuota(t.period,t.kind,t.feeId,t.concept)} className="p-3 border border-logia-700 rounded-lg">Gestionar este concepto</button>}</div>}</article>;
   })}{!rows.length&&<p>No hay cuotas para este filtro.</p>}</div>
   <p className="text-xs text-gray-400">Los comentarios de creación de cuotas no son pagos. Para fechas, parcialidades y referencias consulta Abonos y transferencias.</p>
  </>}
 </section>;
}
