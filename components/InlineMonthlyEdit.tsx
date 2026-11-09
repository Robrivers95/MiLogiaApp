import React,{useState} from 'react';
import type {Payment} from '../types';
export default function InlineMonthlyEdit({payment,onSave}:{payment:Payment;onSave:(paid:number,date:string,reason:string)=>Promise<void>}){
 const [open,setOpen]=useState(false),[paid,setPaid]=useState(''),[date,setDate]=useState(''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const amount=Number(paid),valid=paid!==''&&Number.isFinite(amount)&&amount>=0&&amount<=payment.amount;
 const reset=()=>{setConfirmed(false);setError('');};
 return <div>{!open?<button type="button" onClick={()=>{setPaid(String(payment.paidRegular??Math.min(payment.paid||0,payment.amount)));setDate((payment.paymentDate||'').slice(0,10));setReason('');reset();setOpen(true);}} className="p-3 border border-indigo-700 rounded-lg text-indigo-200">Corregir abono</button>:<div className="space-y-3 min-w-0 border border-indigo-700 rounded-lg p-3">
 <p className="font-bold">Corregir {payment.period}</p><p>Cuota mensual: ${payment.amount.toFixed(2)}</p>
 <fieldset disabled={busy} className="space-y-3"><label className="block">Total realmente abonado en este mes<input aria-label="Total abonado del mes" type="number" min="0" step="0.01" value={paid} onChange={e=>{setPaid(e.target.value);reset();}} className="block w-full bg-logia-900 border border-logia-700 rounded-lg p-3"/></label><p className="text-xs text-gray-400">Es el total correcto del mes, no un abono adicional.</p>
 <label className="block">Fecha del depósito<input aria-label="Fecha del abono corregido" type="date" value={date} onChange={e=>{setDate(e.target.value);reset();}} className="block w-full bg-logia-900 rounded-lg p-3"/></label>
 <label className="block">Motivo de la corrección<input value={reason} onChange={e=>{setReason(e.target.value);reset();}} placeholder="Ej. Se registró completo, pero solo abonó $200" className="block w-full bg-logia-900 rounded-lg p-3"/></label></fieldset>
 {valid?<p className="font-bold">Quedará {amount>=payment.amount?'pagado':amount>0?'parcial':'pendiente'} · Debe: ${(payment.amount-amount).toFixed(2)}</p>:<p className="text-amber-300">Escribe un monto entre $0 y ${payment.amount.toFixed(2)}.</p>}
 <label className="flex gap-2"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo el monto, fecha y saldo que quedarán.</label>
 {error&&<p role="alert" className="text-red-300">{error}</p>}
 <button disabled={busy||!valid||!confirmed||!reason.trim()} onClick={async()=>{setBusy(true);setError('');try{await onSave(amount,date,reason);setOpen(false);}catch(e:any){setError(e.message||'No se pudo guardar.');}finally{setBusy(false);}}} className="p-3 bg-green-700 rounded-lg disabled:opacity-40">Guardar corrección</button><button disabled={busy} onClick={()=>setOpen(false)} className="p-3 border border-logia-700 rounded-lg">Cancelar</button>
 </div>}</div>;
}
