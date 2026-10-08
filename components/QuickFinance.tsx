import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BankBalance, Payment, TreasuryEntry, User } from '../types';
import { quickFinanceService, CaptureInput } from '../services/quickFinanceApi';
import { captureAmount, validCaptureDate, localFinanceDate } from '../services/quickFinance';
import { normalizePayment } from '../services/paymentAccounting';
import { feeOptions } from '../services/extraFeeLifecycle';

const field = 'w-full min-w-0 bg-logia-900 border border-logia-700 rounded-lg p-3 text-white';
const button = 'rounded-lg bg-indigo-600 p-3 font-semibold disabled:opacity-40';
const money = (n: number) => n.toLocaleString('es-MX',{style:'currency',currency:'MXN'});
const empty = (): CaptureInput => ({type:'expense',amount:0,date:localFinanceDate(),notes:'',memberId:'',paymentMethod:'cash',accountId:''});
interface Props { user: User; suspended?: boolean }

export default function QuickFinance({user,suspended}: Props) {
  const allowed = ['admin','master'].includes(user.role) && user.active !== false && !!user.groupId && !suspended;
  const [open,setOpen] = useState(false); const [tab,setTab] = useState<'new'|'history'>('new');
  const [input,setInput] = useState(empty); const [photo,setPhoto] = useState<File>();
  const [entries,setEntries] = useState<TreasuryEntry[]>([]); const [members,setMembers] = useState<User[]>([]); const [accounts,setAccounts] = useState<BankBalance[]>([]);
  const [selected,setSelected] = useState<TreasuryEntry>(); const [description,setDescription] = useState('');
  const [category,setCategory] = useState<TreasuryEntry['category']>('otro'); const [payee,setPayee] = useState(''); const [notes,setNotes] = useState('');
  const [memberId,setMemberId] = useState(''); const [payments,setPayments] = useState<Payment[]>([]); const [quota,setQuota] = useState('');
  const [busy,setBusy] = useState(false); const [loading,setLoading] = useState(false); const [error,setError] = useState(''); const [message,setMessage] = useState('');
  const captureId = useRef(''); const inFlight = useRef(false); const panel = useRef<HTMLDivElement>(null); const opener = useRef<HTMLButtonElement>(null);
  const requestSequence = useRef(0); const [locked,setLocked] = useState(false);
  const changeInput = (patch: Partial<CaptureInput>) => { setInput(value=>({...value,...patch})); setError(''); };
  const select = (entry: TreasuryEntry) => {if(entry.id === captureId.current){captureId.current='';setLocked(false);setInput(empty());setPhoto(undefined);}setSelected(entry);setDescription(entry.description);setCategory(entry.category);setPayee(entry.payee || '');setNotes(entry.notes || '');setMemberId(entry.memberId || '');setQuota('');setError('');};
  const refresh = async () => {
    const sequence = ++requestSequence.current;setLoading(true);
    try {
      const [list,options] = await Promise.all([quickFinanceService.list(user.groupId),quickFinanceService.options(user.groupId)]);
      if(sequence === requestSequence.current){setEntries(list);setMembers(options.members);setAccounts(options.accounts);}
      return list;
    } finally {if(sequence === requestSequence.current)setLoading(false);}
  };
  useEffect(()=>{
    if(!open || !allowed)return;
    void refresh().catch(e=>setError(e.message));
  },[open,allowed,user.groupId]);
  useEffect(()=>{
    if(!allowed)return;
    const edit = (event: Event) => {setOpen(true);setTab('history');const id=(event as CustomEvent).detail?.id;void refresh().then(list=>{const entry=list.find(item=>item.id===id);if(entry)select(entry);}).catch(e=>setError(e.message));};
    window.addEventListener('open-quick-finance',edit);return()=>window.removeEventListener('open-quick-finance',edit);
  },[allowed,user.groupId]);
  useEffect(()=>{
    setPayments([]);setQuota('');let active=true;
    if(open && selected?.type === 'income' && selected.quickStatus !== 'applied' && memberId){setLoading(true);quickFinanceService.payments(user.groupId,memberId).then(list=>{if(active)setPayments(list);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});}
    return()=>{active=false;};
  },[memberId,selected?.id,open,user.groupId]);
  const close = () => {if(!inFlight.current){setOpen(false);setSelected(undefined);setError('');setMessage('');opener.current?.focus();}};
  useEffect(()=>{
    if(!open || !allowed)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';panel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='Tab'){
        const items=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]') || []).filter(item=>item.offsetParent!==null);
        const first=items[0],last=items[items.length-1];
        if(event.shiftKey && (document.activeElement===first || document.activeElement===panel.current)){event.preventDefault();last?.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };window.addEventListener('keydown',key);return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',key);};
  },[open,allowed]);
  const action = async (work: ()=>Promise<void>, success: string) => {
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{await work();setMessage(success);await refresh();}catch(e){setError(e instanceof Error ? e.message : 'No se pudo guardar. Intenta nuevamente.');}
    finally{inFlight.current=false;setBusy(false);}
  };
  const save = () => action(async()=>{
    captureAmount(input.amount);validCaptureDate(input.date);
    if(photo && (!photo.type.startsWith('image/') || photo.size > 8*1024*1024)) throw new Error('Selecciona una imagen de máximo 8 MB.');
    if(!captureId.current)captureId.current=crypto.randomUUID();
    setLocked(true);
    await quickFinanceService.save(user.groupId,captureId.current,input,photo);
    captureId.current='';setLocked(false);setInput(empty());setPhoto(undefined);setTab('history');
  },'Captura guardada. Ya está incluida en tesorería y puedes completarla después.');
  const quotaOptions = payments.flatMap(source=>{
    const p=normalizePayment(source);const debt=Math.max(0,p.amount-p.paidRegular!);
    return [...(debt>0 ? [{value:JSON.stringify([p.period,'']),label:`${p.period} · Mensual · saldo ${money(debt)}`}]:[]),...feeOptions([p]).map(fee=>({value:JSON.stringify([fee.period,fee.feeId]),label:`${fee.period} · ${fee.description} · ${fee.forgiven || fee.balance===0 ? 'abono voluntario' : `saldo ${money(fee.balance)}`}`}))];
  });
  if(!allowed)return null;
  return <>
    <button ref={opener} type="button" aria-label="Captura rápida de dinero" onClick={()=>{setOpen(true);setError('');setMessage('');}} className="fixed right-4 z-40 w-12 h-12 rounded-full bg-emerald-600 text-white text-2xl shadow-lg border border-emerald-400" style={{bottom:'calc(5rem + env(safe-area-inset-bottom))'}}>$</button>
    {open && createPortal(<div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-3" onClick={event=>{if(event.target===event.currentTarget)close();}}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="quick-finance-title" tabIndex={-1} className="w-full max-w-xl max-h-[90dvh] overflow-y-auto bg-logia-800 border border-logia-700 rounded-xl p-4 space-y-4">
        <div className="flex justify-between items-center gap-2"><h2 id="quick-finance-title" className="text-xl font-bold">Captura rápida</h2><button disabled={busy} type="button" onClick={close} aria-label="Cerrar captura rápida" className="p-2">✕</button></div>
        <div className="flex gap-2"><button disabled={busy} className={tab==='new'?button:'p-3'} onClick={()=>{setTab('new');setSelected(undefined);}}>Nueva captura</button><button disabled={busy} className={tab==='history'?button:'p-3'} onClick={()=>{setTab('history');setSelected(undefined);}}>Capturas</button></div>
        {error && <p role="alert" className="text-red-300">{error}</p>}{message && <p role="status" className="text-emerald-300">{message}</p>}
        {loading && <p role="status" className="text-gray-400">Cargando…</p>}
        {tab==='new' ? <form onSubmit={e=>{e.preventDefault();void save();}} className="space-y-3">
          <fieldset disabled={busy} className="space-y-3 min-w-0">
            <label className="block">Tipo<select className={field} value={input.type} onChange={e=>changeInput({type:e.target.value as CaptureInput['type'],memberId:''})}><option value="expense">Gasto</option><option value="income">Ingreso</option></select></label>
            <label className="block">Monto<input className={field} type="number" inputMode="decimal" min="0.01" max="999999999" step="0.01" required value={input.amount || ''} onChange={e=>changeInput({amount:Number(e.target.value)})}/></label>
            <label className="block">Fecha<input className={field} type="date" required value={input.date} onChange={e=>changeInput({date:e.target.value})}/></label>
            <label className="block">Nota opcional<textarea className={field} maxLength={2000} value={input.notes} onChange={e=>changeInput({notes:e.target.value})}/></label>
            <label className="block">Método<select className={field} value={input.paymentMethod} onChange={e=>changeInput({paymentMethod:e.target.value as CaptureInput['paymentMethod']})}><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option></select></label>
            {input.type==='income' && <label className="block">Miembro opcional<select className={field} value={input.memberId} onChange={e=>changeInput({memberId:e.target.value})}><option value="">Sin miembro</option>{members.map(member=><option key={member.uid} value={member.uid}>{member.name}</option>)}</select></label>}
            <label className="block">Cuenta o caja opcional<select className={field} value={input.accountId} onChange={e=>changeInput({accountId:e.target.value})}><option value="">Solo tesorería</option>{accounts.map(account=><option key={account.id} value={account.id}>{account.name} · {money(account.amount)}</option>)}</select></label>
            <p className="text-xs text-gray-400">Se incluye en tesorería al guardar. Si eliges una cuenta o caja, suma o resta al saldo actual una sola vez. Para un movimiento ya incluido en ese saldo, elige Solo tesorería.</p>
            <label className="block">Foto de cámara o galería (opcional)<input className={field} type="file" accept="image/*" onChange={e=>setPhoto(e.target.files?.[0])}/></label>
          </fieldset>
          {locked && !busy && <p className="text-sm text-amber-300">No se confirmó el guardado. Reintenta o revisa esta captura en Capturas antes de registrar otro movimiento.</p>}
          <button className={`${button} w-full`} disabled={busy || loading} type="submit">{busy?'Guardando…':locked?'Reintentar guardado':'Guardar pendiente'}</button>
        </form> : selected ? <div className="space-y-3">
          <button disabled={busy} className="text-indigo-300 p-2" onClick={()=>setSelected(undefined)}>← Volver a capturas</button>
          <p className="font-bold">{selected.type==='income'?'Ingreso':'Gasto'} · {money(selected.amount)} · {selected.date}</p>
          <p className="text-sm text-gray-400">{selected.accountName || 'Solo tesorería'} · {selected.paymentMethod==='cash'?'Efectivo':selected.paymentMethod==='card'?'Tarjeta':'Transferencia'}</p>
          {selected.receiptImageUrls?.map((url,index)=><a key={url} className="inline-block underline text-indigo-300 p-2" href={url} target="_blank" rel="noopener noreferrer">Ver foto {index+1}</a>)}
          {selected.quickStatus==='applied' ? <p className="text-emerald-300">Aplicado a {selected.memberName} en {selected.appliedPeriod}. Ya está registrado en Gestión de miembros. El dinero se contó una sola vez.</p> : <>
            <form onSubmit={e=>{e.preventDefault();void action(async()=>{await quickFinanceService.complete(user.groupId,selected.id,{description,category,payee,notes});setSelected({...selected,description,category,payee,notes,quickStatus:'completed'});},'Movimiento completado.');}} className="space-y-3">
              <fieldset disabled={busy} className="space-y-3 min-w-0">
                <label className="block">Concepto<input className={field} required maxLength={300} value={description} onChange={e=>setDescription(e.target.value)}/></label>
                <label className="block">Categoría<select className={field} value={category} onChange={e=>setCategory(e.target.value as TreasuryEntry['category'])}>{[['otro','Otro'],['gasto_operativo','Gasto operativo'],['gasto_social','Gasto social'],['compra_material','Compra de material'],['saco_beneficencia','Beneficencia'],['cuota_extra','Cuota extra'],['evento','Evento'],['donacion','Donación']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
                <label className="block">{selected.type==='expense'?'Pagado a':'Recibido de'} (opcional)<input className={field} maxLength={300} value={payee} onChange={e=>setPayee(e.target.value)}/></label>
                <label className="block">Notas<textarea className={field} maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
              </fieldset><button type="submit" className={button} disabled={busy}>Completar movimiento</button>
            </form>
            {selected.type==='income' && <section className="border-t border-logia-700 pt-4 space-y-3"><h3 className="font-bold">Aplicar este ingreso a una cuota</h3><p className="text-xs text-gray-400">Se registra un abono por el monto completo. No vuelvas a capturarlo como pago manual.</p>
              <label className="block">Miembro<select className={field} disabled={busy || !!selected.memberId} value={memberId} onChange={e=>setMemberId(e.target.value)}><option value="">Selecciona un miembro</option>{members.map(member=><option key={member.uid} value={member.uid}>{member.name}</option>)}</select></label>
              <label className="block">Cuota, mes y año<select className={field} disabled={busy || loading} value={quota} onChange={e=>setQuota(e.target.value)}><option value="">Selecciona una cuota</option>{quotaOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              {memberId && !loading && quotaOptions.length===0 && <p className="text-sm text-gray-400">No hay cuotas disponibles. Asigna primero la cuota desde Gestión de miembros.</p>}
              <button disabled={busy || loading || !memberId || !quota} className={button} onClick={()=>{const [period,feeId]=JSON.parse(quota);void action(async()=>{await quickFinanceService.apply(user.groupId,selected.id,memberId,period,feeId || undefined);setSelected(undefined);},'Abono registrado en Gestión de miembros.');}}>Registrar abono con este ingreso</button>
            </section>}
          </>}
        </div> : <div className="space-y-2">
          <p className="text-sm text-gray-400">Pendientes de completar: {entries.filter(entry=>entry.quickStatus==='pending').length}. Todos los movimientos guardados ya se incluyen en el saldo.</p>
          {!loading && entries.length===0 && <p>No hay capturas todavía.</p>}
          {entries.map(entry=><button key={entry.id} type="button" className="w-full text-left border border-logia-700 p-3 rounded-lg break-words" onClick={()=>select(entry)}><span className="block font-semibold">{entry.type==='income'?'Ingreso':'Gasto'} · {money(entry.amount)} · {entry.date}</span><span className="block text-sm">{entry.description}</span><span className="block text-xs text-indigo-300">{entry.quickStatus==='pending'?'Pendiente de completar':entry.quickStatus==='applied'?`Aplicado a cuota · ${entry.memberName} · ${entry.appliedPeriod}`:'Completado'}</span></button>)}
        </div>}
      </div>
    </div>,document.body)}
  </>;
}
