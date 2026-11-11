import React,{useState,useEffect} from 'react';
import type {Payment,PaymentReceipt} from '../types';
import {incomeTargets} from '../services/incomeSelection';
import {memberEvidence,receiptMatchesConcept,receiptBeforeQuotaCorrection} from '../services/memberPresentation';
import InlineQuotaEdit from './InlineQuotaEdit';
import type {QuotaCorrectionValues} from '../services/quotaCorrection';
import MemberEvidence from './MemberEvidence';
const money=(n:number)=>n.toLocaleString('es-MX',{style:'currency',currency:'MXN'});
type Target=ReturnType<typeof incomeTargets>[number];
export default function MemberAccountTable({rows,payments,receipts,onRegister,onCorrect,onQuota,onEditQuota}:{rows:Target[];payments:Payment[];receipts:PaymentReceipt[];onEditQuota?:(t:Target,v:QuotaCorrectionValues,previous?:Payment)=>Promise<void>;onRegister?:(t:Target,included:boolean)=>void;onCorrect?:(period:string,v:QuotaCorrectionValues,previous?:Payment)=>Promise<void>;onQuota?:(period:string,kind:'regular'|'extra',feeId?:string,concept?:string)=>void}){
 const [editSource,setEditSource]=useState<Payment>();
 const [editing,setEditing]=useState<string|null>(null);
 const [openMonths,setOpenMonths]=useState<string[]>([]);
 const [preview,setPreview]=useState<ReturnType<typeof memberEvidence>[number]|null>(null);
 const months=[...new Set(rows.map(t=>t.period))];
 useEffect(()=>{if(!preview)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!document.querySelector('[aria-label="Visor de comprobante"]')){event.stopImmediatePropagation();setPreview(null);}};window.addEventListener('keydown',close,true);return()=>window.removeEventListener('keydown',close,true);},[preview]);
 const cell=(label:string,value:React.ReactNode)=> <td data-label={label}><div className="min-w-0">{value}</div></td>;
 const renderQuota=(t:Target)=>{
  const matching=receipts.filter(r=>receiptMatchesConcept(r,t.period,t.kind,t.feeId,t.concept));
  const detail=memberEvidence(payments.filter(p=>p.period===t.period),matching).filter(e=>e.id.startsWith('receipt-')||e.id.startsWith('ledger-')||e.id===`balance-${t.period}-${t.kind}-${t.kind==='extra'?(t.feeId||'legacy'):''}`);
  let abono=0;
  return <tbody key={t.key} aria-label={`${t.period} · ${t.concept}`}><tr className="quota-line">
   {cell('Mes',t.period)}{cell('Cuota',<><span>{t.concept}</span><p className="sheet-muted">{t.kind==='regular'?'Cuota regular':'Cuota extraordinaria'} · {t.forgiven?'Perdonada':!t.balance?'Pagada':t.paid?'Parcial':'Pendiente'}</p>{(onEditQuota||onCorrect&&t.kind==='regular')&&<button type="button" onClick={()=>{setEditSource(payments.find(p=>p.period===t.period));setEditing(editing===t.key?null:t.key);}}>Editar cuota</button>}{onRegister&&t.balance>0&&!t.forgiven&&<button type="button" onClick={()=>onRegister(t,false)}>Registrar abono</button>}{onQuota&&!onRegister&&<button type="button" onClick={()=>onQuota(t.period,t.kind,t.feeId,t.concept)}>Registrar abono</button>}</>)}
   {['Abonos','Monto del abono','Fecha del abono','Comprobante del abono','Referencia bancaria','Comentarios del abono'].map(label=><React.Fragment key={label}>{cell(label,'—')}</React.Fragment>)}
   {cell('Deuda',money(t.amount))}{cell('Pago',<span className="sheet-paid">{money(t.paid)}</span>)}{cell('Neto',<span className="sheet-due">{money(t.balance)}</span>)}
  </tr>
  {editing===t.key&&<tr className="sheet-action-row"><td colSpan={11}><InlineQuotaEdit target={t} date={payments.find(p=>p.period===t.period)?.paymentDate||''} legacy={!onEditQuota} onClose={()=>setEditing(null)} onSave={async v=>{if(onEditQuota)await onEditQuota(t,v,editSource);else if(onCorrect)await onCorrect(t.period,v,editSource);}}/></td></tr>}
  {detail.map(e=>{
   const allocations=e.allocations.filter(a=>a.period===t.period&&(!('kind' in a)||a.kind===t.kind)&&(t.kind==='regular'||!('feeId' in a)||a.feeId===t.feeId||(!a.feeId&&a.concept===t.concept)));
   const allocated=allocations.length?allocations.reduce((s,a)=>s+a.amount,0):undefined;
   const amount=allocated??(e.periods.length===1?(e.applied??e.amount):undefined);
   const aggregate=e.id.startsWith('balance-'),attachment=e.id.startsWith('ledger-');
   const historical=e.id.startsWith('receipt-')&&receiptBeforeQuotaCorrection(payments.find(p=>p.period===t.period),e.id.slice(8),t.kind,t.feeId);
   if(!aggregate&&!attachment)abono++;
   return <tr key={e.id} className="payment-line">
    {cell('Mes','—')}{cell('Cuota','—')}{cell('Abonos',<><span>{aggregate?'Saldo acumulado sin desglose':attachment?'Adjunto mensual sin desglose':`Abono ${abono}`}</span><p className="sheet-muted">{historical?'Histórico anterior a corrección':e.status==='approved'?'Aprobado':e.status==='pending'?'En revisión':e.status==='rejected'?'Rechazado':'Registrado'}{e.id.startsWith('receipt-')?` · Folio interno: ${e.id.slice(8)}`:''}</p></>)}
    {cell('Monto del abono',<><span>{amount==null?'Sin desglose por cuota':money(amount)}</span>{e.amount!=null&&allocated!=null&&e.amount!==allocated&&<p className="sheet-muted">Depósito total: {money(e.amount)}</p>}{aggregate&&<p className="sheet-muted">Ya incluido en Pago</p>}{historical&&<p className="text-amber-200">Importe original; reemplazado por la corrección del saldo.</p>}</>)}
    {cell('Fecha del abono',<><span>{e.date?.slice(0,10)||'Sin fecha registrada'}</span>{aggregate&&<p className="sheet-muted">Última fecha registrada; no identifica cada depósito</p>}</>)}
    {cell('Comprobante del abono',e.urls.length?<button type="button" onClick={()=>setPreview(e)}>Ver {e.urls.length} archivo(s)</button>:'Sin archivo adjunto')}
    {cell('Referencia bancaria',e.reference||e.originalReference||'Sin referencia')}{cell('Comentarios del abono',<span className="whitespace-pre-wrap">{e.comments||'Sin comentarios'}</span>)}
    {cell('Deuda','—')}{cell('Pago','—')}{cell('Neto','—')}
   </tr>;
  })}
  {(onRegister&&t.paid>0||(payments.find(p=>p.period===t.period)?.quotaCorrections||[]).some(c=>c.kind===t.kind&&(t.kind==='regular'||c.feeId===t.feeId)))&&<tr className="sheet-action-row"><td colSpan={11}>{onRegister&&t.paid>0&&<button type="button" onClick={()=>onRegister(t,true)}>Añadir detalle al pago existente</button>}
  {(payments.find(p=>p.period===t.period)?.quotaCorrections||[]).filter(c=>c.kind===t.kind&&(t.kind==='regular'||c.feeId===t.feeId)).map((c,i)=><p key={i} className="sheet-muted">{c.at.slice(0,10)} · Cuota: {money(c.beforeAmount)} → {money(c.afterAmount)} · Pago: {money(c.beforePaid)} → {money(c.afterPaid)} · {c.reason}</p>)}
  </td></tr>}</tbody>;
 };
 return <div className="account-sheet">
 <style>{`
 .account-sheet{min-width:0}.account-sheet table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px}.account-sheet caption{text-align:left;font-weight:700;font-size:20px;padding:12px 0}.account-sheet th,.account-sheet td{padding:10px 7px;border:1px solid #456079;vertical-align:top;overflow-wrap:anywhere}.account-sheet th{background:#182b40;text-align:left;color:#e9d89f}.account-sheet .month-line{background:#142d46;font-weight:700}.account-sheet .month-line td{vertical-align:middle}.account-sheet .quota-line{background:#3b4d60;font-weight:600}.account-sheet .payment-line{background:#1a3047}.account-sheet button,.account-sheet a{display:inline-block;padding:8px;border:1px solid #6875b8;border-radius:6px;margin:3px 4px 3px 0;min-height:40px}.account-sheet .month-toggle{border:0;text-align:left;white-space:nowrap}.account-sheet .sheet-actions{font-weight:400}.account-sheet .sheet-muted{color:#bdcbd9;font-size:12px}.account-sheet .sheet-paid{color:#86efac}.account-sheet .sheet-due{color:#fcd34d}.account-sheet .sheet-action-row td{padding-top:4px;border-top:0;background:#283f58}
 @media(max-width:767px){
 .account-sheet table,.account-sheet tbody,.account-sheet tr,.account-sheet td{display:block;width:auto}.account-sheet thead{display:none}.account-sheet table{border:0}.account-sheet tbody{border:1px solid #456079;border-radius:8px;margin-bottom:10px;overflow:hidden}.account-sheet td{display:grid;grid-template-columns:minmax(0,110px) minmax(0,1fr);gap:8px;border:0;border-bottom:1px solid #354e66;padding:9px 12px}.account-sheet td:before{content:attr(data-label);color:#bdcbd9;font-weight:400}.account-sheet .sheet-action-row td{display:block}.account-sheet .sheet-action-row td:before{content:none}.account-sheet .payment-line{border-top:4px solid #456079}.account-sheet caption{display:block}.account-sheet .quota-line,.account-sheet .month-line{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.account-sheet .quota-line td,.account-sheet .month-line td{display:block;padding:9px}.account-sheet .quota-line td:before,.account-sheet .month-line td:before{display:block;font-size:12px}.account-sheet .quota-line td:nth-child(2),.account-sheet .month-line td:first-child{grid-column:1/-1}.account-sheet .quota-line td:first-child,.account-sheet .quota-line td:nth-child(n+3):nth-child(-n+8),.account-sheet .month-line td:nth-child(2){display:none}.account-sheet .month-line td:first-child:before{content:none}.account-sheet .payment-line td:nth-child(-n+2),.account-sheet .payment-line td:nth-child(n+9){display:none}
 }`}</style>
 <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>setOpenMonths(months)}>Expandir todos</button><button type="button" onClick={()=>setOpenMonths([])}>Contraer todos</button></div>
 <table aria-label="Tabla de meses, cuotas y abonos"><caption>Estado de cuenta · meses y abonos</caption><colgroup>{[7,14,10,8,9,9,11,10,7,7,8].map((w,i)=><col key={i} style={{width:w+'%'}}/>)}</colgroup><thead><tr>{['Mes','Cuota','Abonos','Monto del abono','Fecha del abono','Comprobante del abono','Código de referencia bancaria','Comentarios del abono','Deuda','Pago','Neto'].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead>
 {months.map(period=>{
  const targets=rows.filter(t=>t.period===period),open=openMonths.includes(period);
  const total=(field:'amount'|'paid'|'balance')=>Math.round(targets.reduce((s,t)=>s+t[field],0)*100)/100;
  return <React.Fragment key={period}><tbody aria-label={`Resumen ${period}`}><tr className="month-line">
   <td data-label="Mes" colSpan={2}><button type="button" className="month-toggle" aria-label={`${open?'Contraer':'Expandir'} mes ${period}`} aria-expanded={open} onClick={()=>setOpenMonths(old=>old.includes(period)?old.filter(p=>p!==period):[...old,period])}>{open?'▾':'▸'} {period}</button></td>
   <td colSpan={6}><span>{targets.length} concepto(s)</span><span className="sheet-muted"> · {open?'Pulsa el mes para contraer':'Pulsa el mes para ver cuotas y abonos'}</span></td>
   {cell('Deuda',money(total('amount')))}{cell('Pago',<span className="sheet-paid">{money(total('paid'))}</span>)}{cell('Neto',<span className="sheet-due">{money(total('balance'))}</span>)}
  </tr></tbody>{open&&targets.map(renderQuota)}</React.Fragment>;
 })}</table>{!rows.length&&<p>No hay cuotas para este filtro.</p>}
 <p className="sheet-muted mt-3">Deuda es el cargo original; Neto es lo pendiente. Los abonos ya están incluidos en Pago. Los comprobantes en revisión o rechazados no confirman un pago.</p>
 {preview&&<div role="dialog" aria-modal="true" aria-label="Detalle del comprobante" className="fixed inset-0 z-[60] bg-logia-900 overflow-y-auto p-4"><button type="button" onClick={()=>setPreview(null)}>Cerrar detalle</button><MemberEvidence items={[preview]}/></div>}
 </div>;
}
