import React,{useState} from 'react';
import type {IncomeTarget} from '../services/incomeSelection';
import type {QuotaCorrectionValues} from '../services/quotaCorrection';
const money=(n:number)=>n.toLocaleString('es-MX',{style:'currency',currency:'MXN'});
export default function InlineQuotaEdit({target,date,onSave,onClose,legacy=false}:{target:IncomeTarget;date:string;onSave:(v:QuotaCorrectionValues)=>Promise<void>;onClose:()=>void;legacy?:boolean}){
 const [amount,setAmount]=useState(String(target.amount)),[paid,setPaid]=useState(String(target.paid)),[when,setWhen]=useState(date.slice(0,10)),[reason,setReason]=useState(''),[forgiven,setForgiven]=useState(target.forgiven),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const reset=()=>{setConfirmed(false);setError('');};const charge=Number(amount),received=Number(paid),valid=amount!==''&&paid!==''&&[charge,received].every(n=>Number.isFinite(n)&&n>=0);
 const balance=forgiven?0:Math.max(0,charge-received);
 return <div aria-label={`Editar cuota ${target.period} ${target.concept}`} className="p-3 rounded-lg border border-indigo-500 space-y-3 text-sm">
 <b>{target.period} · {target.concept}</b><p>Corrige el total de esta cuota. Para registrar un depósito nuevo usa Registrar abono.</p>
 <fieldset disabled={busy} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <label>Importe de la cuota<input aria-label="Importe de la cuota" disabled={legacy} type="number" min="0" step="0.01" value={amount} onChange={e=>{setAmount(e.target.value);reset();}} className="block w-full p-3 bg-logia-900 rounded-lg"/></label>
 <label>Total realmente pagado<input aria-label="Total realmente pagado" type="number" min="0" step="0.01" value={paid} onChange={e=>{setPaid(e.target.value);reset();}} className="block w-full p-3 bg-logia-900 rounded-lg"/></label>
 <div><button type="button" onClick={()=>{setPaid('0');reset();}}>Quitar marca de pagado</button><p className="text-xs text-gray-400">Pon $0 si se marcó pagada por error.</p></div>
 {!legacy&&target.kind==='extra'&&<label className="flex gap-2 items-start"><input type="checkbox" checked={forgiven} onChange={e=>{setForgiven(e.target.checked);reset();}}/>Quitar adeudo de esta cuota (perdonarla). Conserva los abonos reales.</label>}
 <label>Fecha real del pago<input aria-label="Fecha del pago corregido" type="date" value={when} onChange={e=>{setWhen(e.target.value);reset();}} className="block w-full p-3 bg-logia-900 rounded-lg"/></label>
 <label>Motivo de la corrección<input aria-label="Motivo de la corrección" maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);reset();}} className="block w-full p-3 bg-logia-900 rounded-lg"/></label>
 </fieldset>
 {valid&&<p className="font-semibold">Quedará: {forgiven?'perdonada':received>=charge?'pagada':received>0?'parcial':'pendiente'} · Pago: {money(received)} · Neto: {money(balance)}{!forgiven&&received>charge?' · Excedente: '+money(received-charge):''}</p>}
 {received!==target.paid&&<p className="text-xs text-amber-200">Se corrige el saldo de la cuota. Los comprobantes anteriores se conservarán como historial; no se cambian depósitos de bancos ni movimientos de tesorería.</p>}
 <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo los importes y el saldo que quedarán.</label>
 {error&&<p role="alert" className="text-red-300">{error}</p>}
 <button type="button" disabled={busy||!valid||!confirmed||!reason.trim()} onClick={async()=>{setBusy(true);setError('');try{await onSave({amount:charge,paid:received,date:when,reason,forgiven});onClose();}catch(e:any){setError(e.message||'No se pudo guardar.');}finally{setBusy(false);}}}>Guardar cambios</button><button type="button" disabled={busy} onClick={onClose}>Cancelar</button>
 </div>;
}
