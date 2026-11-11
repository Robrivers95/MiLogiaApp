import MemberAccountTable from './MemberAccountTable';
import React,{useState} from 'react';
import type {Payment,PaymentReceipt} from '../types';
import {incomeTargets} from '../services/incomeSelection';
import type {IncomeTarget} from '../services/incomeSelection';
import type {QuotaCorrectionValues} from '../services/quotaCorrection';
import {memberEvidence,receiptMatchesConcept} from '../services/memberPresentation';
import MemberEvidence from './MemberEvidence';
const money=(n:number)=>n.toLocaleString('es-MX',{style:'currency',currency:'MXN'});
export default function MemberAccount({payments,receipts,onQuota,onCorrect,onRegister,onEditQuota}:{payments:Payment[];receipts:PaymentReceipt[];onEditQuota?:(t:IncomeTarget,v:QuotaCorrectionValues,previous?:Payment)=>Promise<void>;onRegister?:(target:IncomeTarget,included:boolean)=>void;onCorrect?:(payment:Payment,paid:number,date:string,reason:string)=>Promise<void>;onQuota?:(period:string,kind:'regular'|'extra',feeId?:string,concept?:string)=>void}){
 const [monthFilter,setMonthFilter]=useState('all'),[search,setSearch]=useState(''),[year,setYear]=useState('all'),[onlyDebt,setOnlyDebt]=useState(false);
 let targets:IncomeTarget[];try{targets=incomeTargets(payments);}catch{return <p role="alert" className="text-sm text-red-300">Hay montos inválidos en el historial. Revisa las correcciones de cuotas antes de registrar abonos.</p>;}
 const missing=[...new Set(receipts.filter(r=>r.status!=='rejected').flatMap(r=>r.extraFeePeriod?[r.extraFeePeriod]:(r.periods||[])))].filter(period=>!targets.some(t=>t.period===period));
 const years=[...new Set([...targets.map(t=>t.period.slice(0,4)),...missing.map(p=>p.slice(0,4))])].sort().reverse();
 const query=search.toLocaleLowerCase('es').trim();
 const evidence=memberEvidence(payments,receipts);
 const rows=targets.filter(t=>(monthFilter==='all'||t.period===monthFilter)&&(year==='all'||t.period.startsWith(year))&&(!onlyDebt||t.balance>0)&&(!query||[t.period,t.concept,...evidence.filter(e=>e.periods.includes(t.period)).flatMap(e=>[e.reference,e.originalReference,e.date,e.comments,e.id])].join(' ').toLocaleLowerCase('es').includes(query)));
 const unmatchedIds=new Set(receipts.filter(r=>!targets.some(t=>receiptMatchesConcept(r,t.period,t.kind,t.feeId,t.concept))).map(r=>'receipt-'+r.id));
 const orphan=evidence.filter(e=>unmatchedIds.has(e.id)&&(year==='all'||e.periods.some(p=>p.startsWith(year)))&&(monthFilter==='all'||e.periods.includes(monthFilter))&&[e.id,e.reference,e.originalReference,e.date,e.comments,e.concept,...e.periods].join(' ').toLocaleLowerCase('es').includes(query));
 return <section aria-label="Estado de cuenta del miembro" className="space-y-3 min-w-0">
 <div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg bg-logia-900 p-3"><p className="text-xs text-gray-400">Pagado en cuotas</p><b className="text-green-300">{money(targets.reduce((s,t)=>s+t.paid,0))}</b></div><div className="rounded-lg bg-logia-900 p-3"><p className="text-xs text-gray-400">Saldo de cuotas registradas</p><b className="text-amber-300">{money(targets.reduce((s,t)=>s+t.balance,0))}</b></div></div>
 <div className="flex flex-wrap gap-3 items-end"><label className="block text-sm">Año <select aria-label="Año del estado de cuenta" value={year} onChange={e=>{setYear(e.target.value);setMonthFilter('all');}} className="bg-logia-900 border border-logia-700 rounded-lg p-2"><option value="all">Todos</option>{years.map(y=><option key={y}>{y}</option>)}</select></label><label className="block text-sm flex-1 min-w-0">Mes<select aria-label="Mes del estado de cuenta" value={monthFilter} onChange={e=>setMonthFilter(e.target.value)} className="block w-full min-w-0 bg-logia-900 border border-logia-700 rounded-lg p-3"><option value="all">Todos los meses</option>{[...new Set([...targets.map(t=>t.period),...missing])].filter(p=>year==='all'||p.startsWith(year)).sort().reverse().map(p=><option key={p} value={p}>{p}</option>)}</select></label></div>
 <label className="block text-sm">Buscar mes, fecha o referencia<input aria-label="Buscar abonos del miembro" value={search} onChange={e=>setSearch(e.target.value)} className="block w-full min-w-0 bg-logia-900 border border-logia-700 rounded-lg p-3"/></label>
 <label className="flex gap-2 text-sm"><input type="checkbox" checked={onlyDebt} onChange={e=>setOnlyDebt(e.target.checked)}/>Solo cuotas con adeudo</label>
 <MemberAccountTable rows={rows} payments={payments} receipts={receipts} onRegister={onRegister} onQuota={onQuota} onEditQuota={onEditQuota} onCorrect={onCorrect?async(period,v,previous)=>{const p=previous||payments.find(p=>p.period===period);if(p)await onCorrect(p,v.paid,v.date,v.reason);}:undefined}/>
 {!!orphan.length&&<div className="border border-amber-700 rounded-lg p-3 space-y-2"><b>Comprobantes sin cuota asignada</b><p className="text-xs">Todavía no hay una cuota para aplicar estos comprobantes. Enviarlos no confirma un pago.</p>{missing.map(p=><p key={p} className="text-xs">{p} · Sin cuota asignada</p>)}<MemberEvidence items={orphan}/></div>}
 </section>;
}
