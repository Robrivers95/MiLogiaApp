import MemberAccountTable from './MemberAccountTable';
import InlineMonthlyEdit from './InlineMonthlyEdit';
import React,{useState,useRef} from 'react';
import type {Payment,PaymentReceipt} from '../types';
import {incomeTargets} from '../services/incomeSelection';
import {memberEvidence} from '../services/memberPresentation';
import MemberEvidence from './MemberEvidence';
const money=(n:number)=>n.toLocaleString('es-MX',{style:'currency',currency:'MXN'});
export default function MemberAccount({payments,receipts,onQuota,onCorrect,onRegister}:{payments:Payment[];receipts:PaymentReceipt[];onRegister?:(target:ReturnType<typeof incomeTargets>[number],included:boolean)=>void;onCorrect?:(payment:Payment,paid:number,date:string,reason:string)=>Promise<void>;onQuota?:(period:string,kind:'regular'|'extra',feeId?:string,concept?:string)=>void}){
 const editor=useRef<HTMLDivElement>(null);const [editRevision,setEditRevision]=useState(0);
 const [editPeriod,setEditPeriod]=useState('');
 const editablePayment=payments.find(p=>p.period===editPeriod)||[...payments].sort((a,b)=>b.period.localeCompare(a.period))[0];
 const [monthFilter,setMonthFilter]=useState('all');
 const [view,setView]=useState('quotas'),[search,setSearch]=useState(''),[year,setYear]=useState('all'),[onlyDebt,setOnlyDebt]=useState(false);
 let targets:ReturnType<typeof incomeTargets>;try{targets=incomeTargets(payments);}catch{return <p role="alert" className="text-sm text-red-300">Hay montos inválidos en el historial. Revisa las correcciones de cuotas antes de registrar abonos.</p>;}
 const evidence=memberEvidence(payments,receipts);
 const missing=[...new Set(receipts.filter(r=>r.status!=='rejected').flatMap(r=>r.receiptType==='cuota_mensual'?(r.periods||[]):[]))].filter(period=>!targets.some(t=>t.kind==='regular'&&t.period===period));
 const years=[...new Set([...targets.map(t=>t.period.slice(0,4)),...missing.map(p=>p.slice(0,4))])].sort().reverse();
 const rows=targets.filter(t=>(monthFilter==='all'||t.period===monthFilter)&&(year==='all'||t.period.startsWith(year))&&(!onlyDebt||t.balance>0));
 const query=search.toLocaleLowerCase('es').trim();
 const items=evidence.filter(e=>(monthFilter==='all'||e.periods.includes(monthFilter))&&(year==='all'||e.periods.some(p=>p.startsWith(year)))&&[e.id,e.reference,e.originalReference,e.date,e.comments,e.concept,...e.periods].join(' ').toLocaleLowerCase('es').includes(query));
 return <section aria-label="Estado de cuenta del miembro" className="space-y-3 min-w-0">
  <div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg bg-logia-900 p-3"><p className="text-xs text-gray-400">Pagado en cuotas</p><b className="text-green-300">{money(targets.reduce((s,t)=>s+t.paid,0))}</b></div><div className="rounded-lg bg-logia-900 p-3"><p className="text-xs text-gray-400">Saldo de cuotas registradas</p><b className="text-amber-300">{money(targets.reduce((s,t)=>s+t.balance,0))}</b></div></div>
   {onCorrect&&editablePayment&&(view==='movements'||editRevision>0)&&<div ref={editor} className="scroll-mt-4 rounded-lg border border-indigo-700 p-3 space-y-3"><p className="font-bold">Corregir un pago mensual</p><label className="block">Mes a corregir<select aria-label="Mes a corregir" value={editablePayment.period} onChange={e=>setEditPeriod(e.target.value)} className="block w-full min-w-0 bg-logia-900 rounded-lg p-3">{[...payments].sort((a,b)=>b.period.localeCompare(a.period)).map(p=><option key={p.period} value={p.period}>{p.period}</option>)}</select></label><p className="text-xs">Cuota: ${editablePayment.amount.toFixed(2)} · Abonado: ${Number(editablePayment.paidRegular??Math.min(editablePayment.paid||0,editablePayment.amount)).toFixed(2)}</p><InlineMonthlyEdit key={editablePayment.period+editRevision} startOpen={editRevision>0} payment={editablePayment} onSave={(paid,date,reason)=>onCorrect(editablePayment,paid,date,reason)}/></div>}
  <nav aria-label="Vista del estado de cuenta" className="flex flex-wrap gap-2">{[['quotas','Cuotas y saldos'],['movements','Abonos y transferencias']].map(([id,label])=><button type="button" key={id} onClick={()=>setView(id)} aria-pressed={view===id} className={`rounded-lg p-3 text-sm ${view===id?'bg-indigo-600':'border border-logia-700'}`}>{label}</button>)}</nav>
  <label className="block text-sm">Año <select aria-label="Año del estado de cuenta" value={year} onChange={e=>{setYear(e.target.value);setMonthFilter('all');}} className="bg-logia-900 border border-logia-700 rounded-lg p-2"><option value="all">Todos</option>{years.map(y=><option key={y}>{y}</option>)}</select></label>
  <label className="block text-sm">Mes<select aria-label="Mes del estado de cuenta" value={monthFilter} onChange={e=>setMonthFilter(e.target.value)} className="block w-full min-w-0 bg-logia-900 border border-logia-700 rounded-lg p-3"><option value="all">Todos los meses</option>{[...new Set(targets.filter(t=>year==='all'||t.period.startsWith(year)).map(t=>t.period))].sort().reverse().map(p=><option key={p} value={p}>{p}</option>)}</select></label>
  {missing.filter(p=>year==='all'||p.startsWith(year)).length>0&&<div className="rounded-lg border border-amber-700 p-3 text-xs text-amber-200"><p>Hay comprobantes para meses sin cuota mensual asignada. El envío de un comprobante todavía no confirma un pago.</p>{missing.filter(p=>year==='all'||p.startsWith(year)).map(p=><p key={p} className="mt-1">{p} · Sin cuota asignada</p>)}<p className="mt-2">Puedes crear esa mensualidad para este miembro y revisar su comprobante.</p></div>}
  {view==='movements'?<><label className="block text-sm">Buscar fecha, mes o folio<input aria-label="Buscar abonos del miembro" value={search} onChange={e=>setSearch(e.target.value)} className="block w-full min-w-0 bg-logia-900 border border-logia-700 rounded-lg p-3 mt-1"/></label><p className="text-xs text-gray-400">Cada transferencia se muestra una sola vez. Un acumulado antiguo sin comprobante no permite reconstruir la fecha ni el folio de cada parcialidad.</p><MemberEvidence items={items} onCorrectPeriod={onCorrect?(period)=>{if(!payments.some(p=>p.period===period))return;setEditPeriod(period);setEditRevision(n=>n+1);requestAnimationFrame(()=>editor.current?.scrollIntoView({behavior:'smooth',block:'start'}));}:undefined}/></>:<>
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={onlyDebt} onChange={e=>setOnlyDebt(e.target.checked)}/>Solo cuotas con adeudo</label>
   <MemberAccountTable rows={rows} payments={payments} receipts={receipts} onRegister={onRegister} onQuota={onQuota} onCorrect={onCorrect?(period)=>{setEditPeriod(period);setEditRevision(n=>n+1);requestAnimationFrame(()=>editor.current?.scrollIntoView({behavior:'smooth',block:'start'}));}:undefined}/>
   <p className="text-xs text-gray-400">Los comentarios de creación de cuotas no son pagos. Consulta las fechas, parcialidades y referencias en el detalle de cada cuota.</p>
  </>}
 </section>;
}
