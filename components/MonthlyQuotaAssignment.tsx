import React,{useState} from 'react';
import type {User,PriceHistoryEntry} from '../types';
import {monthlyPrice} from '../services/monthlyQuotas';
import {monthlyQuotaApi} from '../services/monthlyQuotaApi';
export default function MonthlyQuotaAssignment({groupId,members,history,initialMember,initialPeriod='',readOnly,onChanged}:{groupId:string;members:User[];history:PriceHistoryEntry[];initialMember?:string;initialPeriod?:string;readOnly:boolean;onChanged:()=>Promise<void>}){
 const [period,setPeriod]=useState(initialPeriod),[ids,setIds]=useState<string[]>(initialMember?[initialMember]:[]),[search,setSearch]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 let amount=0,error='';try{amount=monthlyPrice({priceHistory:history},period);}catch(e:any){error=e.message;}
 const chosen=members.filter(m=>ids.includes(m.uid));
 return <section aria-label="Asignar mensualidad a miembros" className="rounded-xl border border-logia-700 p-4 space-y-3 min-w-0">
  <div><h4 className="font-bold">Crear mensualidad para miembros seleccionados</h4><p className="text-xs text-gray-400 mt-1">Puedes crear diciembre u otro mes futuro. Solo genera la cuota; no registra dinero ni modifica cuotas ya asignadas.</p></div>
  <fieldset disabled={busy||readOnly} className="space-y-3 min-w-0">
   <label className="block text-sm">Mes de la cuota<input aria-label="Mes de nueva mensualidad" type="month" value={period} onChange={e=>{setPeriod(e.target.value);setConfirmed(false);setMessage('');}} className="block w-full bg-logia-900 border border-logia-700 p-3 rounded-lg mt-1"/></label>
   {!initialMember&&<><label className="block text-sm">Buscar miembro<input aria-label="Buscar destinatarios de mensualidad" value={search} onChange={e=>setSearch(e.target.value)} className="block w-full bg-logia-900 border border-logia-700 p-3 rounded-lg mt-1"/></label><div className="max-h-48 overflow-auto space-y-1">{members.filter(m=>m.name.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))).map(m=><label className="flex gap-2 p-2 text-sm" key={m.uid}><input aria-label={`Asignar mensualidad a ${m.name}`} type="checkbox" checked={ids.includes(m.uid)} onChange={e=>{setIds(e.target.checked?[...ids,m.uid]:ids.filter(id=>id!==m.uid));setConfirmed(false);}}/>{m.name}{!m.active?' · Inactivo':''}</label>)}</div><button type="button" className="text-xs text-indigo-300 p-2" onClick={()=>{setIds(members.filter(m=>m.active).map(m=>m.uid));setConfirmed(false);}}>Seleccionar todos los activos</button><button type="button" className="text-xs text-gray-400 p-2" onClick={()=>{setIds([]);setConfirmed(false);}}>Limpiar selección</button></>}
   {amount>0?<p className="text-sm">Cuota: <b>${amount.toFixed(2)}</b> por miembro · {chosen.length} seleccionado(s)</p>:<p className="text-xs text-amber-300">{period?error:'Elige mes y año.'}</p>}
   {!!chosen.length&&<p className="text-xs text-gray-300 break-words">{chosen.map(m=>m.name).join(', ')}</p>}
   <label className="flex gap-2 text-sm"><input aria-label="Confirmar nueva mensualidad" type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo crear {period||'el mes indicado'} únicamente para estos miembros.</label>
   <button type="button" disabled={!confirmed||!ids.length||!amount||ids.length>60} className="rounded-lg bg-indigo-600 p-3 text-sm disabled:opacity-40" onClick={async()=>{if(busy)return;setBusy(true);setMessage('');try{const r=await monthlyQuotaApi.assign(groupId,ids,period,amount,true);setConfirmed(false);setMessage(`${r.created} cuota(s) creada(s). ${r.existing} ya existían y se conservaron.`);await onChanged();}catch(e:any){setMessage(e.message);}finally{setBusy(false);}}}>{busy?'Creando…':'Crear mensualidad seleccionada'}</button>
  </fieldset>{message&&<p role="status" className="text-sm text-indigo-200">{message}</p>}
 </section>;
}
