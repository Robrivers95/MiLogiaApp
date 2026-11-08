import React,{useMemo,useState} from 'react';
import type {Payment} from '../types';
import {incomeTargetKey,incomeTargets,memberIncomeSummary,IncomeSelection} from '../services/incomeSelection';
const money=(n:number)=>`$${n.toFixed(2)}`;
export function IncomeMemberSummary({payments,through,compact=false}:{payments:Payment[];through:string;compact?:boolean}){
 const summary=memberIncomeSummary(payments,through);
 if(compact)return <p className="text-xs text-gray-300">{summary.paidMonths.length} meses normales pagados · {summary.pendingMonths.length} pendientes hasta {through} · Normal {money(summary.regularBalance)} · Extras {money(summary.extraBalance)}</p>;
 return <div aria-label="Resumen de cuotas del hermano" className="space-y-2">
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm">{[['Meses normales pagados',summary.paidMonths.length],['Meses normales pendientes',summary.pendingMonths.length],['Saldo normal al mes actual',money(summary.regularBalance)],['Cuotas extras pendientes',money(summary.extraBalance)]].map(([label,value])=><div key={label} className="rounded-lg bg-logia-900 p-3"><p className="text-xs text-gray-400">{label}</p><b>{value}</b></div>)}</div>
  <p className="text-xs text-gray-400">Corte: {through}. Los meses pagados incluyen anticipos. Las cuotas futuras se muestran por separado: {money(summary.futureBalance)}.</p>
  <details><summary className="cursor-pointer text-sm">Ver meses pagados, parciales y pendientes</summary><div className="text-sm space-y-1 py-2"><p>Pagados: {summary.paidMonths.join(', ')||'Ninguno'}</p><p>Parciales: {summary.partialMonths.join(', ')||'Ninguno'}</p><p>Pendientes: {summary.pendingMonths.join(', ')||'Ninguno'}</p></div></details>
 </div>;
}
export default function IncomeMemberMatrix({payments,selections,received,onChange,disabled,through}:{payments:Payment[];selections:IncomeSelection[];received:number;onChange:(rows:IncomeSelection[])=>void;disabled:boolean;through:string}){
 const [year,setYear]=useState('all');const targets=useMemo(()=>incomeTargets(payments),[payments]);
 const years=[...new Set(targets.map(t=>t.period.slice(0,4)))].sort();
 const visible=targets.filter(t=>year==='all'||t.period.startsWith(year));
 const total=selections.reduce((sum,a)=>sum+Math.round(a.amount*100),0)/100;
 const toggle=(target:typeof targets[number],checked:boolean)=>{
  const next=selections.filter(a=>incomeTargetKey(a)!==target.key);
  if(checked){const available=Math.max(0,Math.round(received*100)-Math.round(next.reduce((s,a)=>s+a.amount,0)*100))/100;next.push({period:target.period,kind:target.kind,...(target.feeId?{feeId:target.feeId}:{}),amount:Math.min(target.balance,available),expectedBalance:target.balance});}
  onChange(next);
 };
 return <div className="space-y-3" aria-label="Matriz de cuotas para aplicar el depósito">
  <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="font-bold">Elige las cuotas y cuánto abonar a cada una</h5><label className="text-sm">Año <select aria-label="Año de cuotas del ingreso" className="rounded border border-logia-700 bg-logia-900 p-2" value={year} onChange={e=>setYear(e.target.value)}><option value="all">Todos</option>{years.map(y=><option key={y}>{y}</option>)}</select></label></div>
  <p className="text-xs text-gray-400">La fecha del depósito no elige el mes de cuota. Puedes mezclar cuotas normales y extraordinarias. Una selección manual no se cambia automáticamente.</p>
  <div className="max-h-96 overflow-auto rounded-lg border border-logia-700"><table className="w-full min-w-[660px] text-left text-sm"><thead className="sticky top-0 bg-logia-900"><tr>{['Aplicar','Mes / concepto','Cuota','Pagado','Debe','Estado','Abono de este depósito'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{visible.map(t=>{
   const selection=selections.find(a=>incomeTargetKey(a)===t.key),canSelect=t.balance>0&&!t.forgiven;
   const label=t.kind==='regular'?t.period:`${t.period} · ${t.concept}`;
   return <tr key={t.key} className="border-t border-logia-700"><td className="p-2"><input aria-label={`Aplicar ingreso a ${label}`} type="checkbox" checked={!!selection} disabled={disabled||!canSelect} onChange={e=>toggle(t,e.target.checked)}/></td><td className="p-2"><b>{t.period}</b><p className="text-xs text-gray-300">{t.concept}</p>{t.period>through&&<p className="text-xs text-indigo-300">Mes futuro</p>}</td><td className="p-2 tabular-nums">{money(t.amount)}</td><td className="p-2 tabular-nums">{money(t.paid)}</td><td className="p-2 tabular-nums">{money(t.balance)}</td><td className="p-2">{t.forgiven?'Perdonada':t.balance===0?'Pagado':t.paid>0?'Parcial':'Pendiente'}</td><td className="p-2"><input aria-label={`Importe a ${label}`} type="number" min="0.01" max={t.balance} step="0.01" className="w-28 rounded border border-logia-700 bg-logia-900 p-2 disabled:opacity-40" value={selection?selection.amount:''} disabled={disabled||!selection} onChange={e=>onChange(selections.map(a=>incomeTargetKey(a)===t.key?{...a,amount:Number(e.target.value)}:a))}/></td></tr>;
  })}{!visible.length&&<tr><td colSpan={7} className="p-3 text-gray-400">No hay cuotas registradas para este filtro. No se crean mensualidades automáticamente.</td></tr>}</tbody></table></div>
  <div className="flex flex-wrap gap-3 text-sm"><p>Recibido: <b>{money(received)}</b></p><p>Seleccionado: <b>{money(total)}</b></p><p className={total>received?'text-red-300':'text-amber-200'}>Sin aplicar: <b>{money(Math.round((received-total)*100)/100)}</b></p></div>
 </div>;
}
