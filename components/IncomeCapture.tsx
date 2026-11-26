import {bankStatement,BANK_INCOME_LIMIT,BANK_TEXT_LIMIT} from '../functions/src/meetingBankStatement';
import type {BankImportFolioIssue} from '../functions/src/meetingBankStatement';
import {bankCsvNeedsYear,csvIsReady,inspectBankCsv,isBankCsvYear,recognizeBankCsvText} from '../functions/src/meetingBankCsv';
import type {CsvInput,CsvMapping} from '../functions/src/meetingBankCsv';
import {incomeCsvText,isIncomeCsv} from '../services/incomeCsv';
import BankCsvColumns,{BankCsvPlan} from './BankCsvColumns';
import {incomeAllocation} from '../services/incomeAllocation';
import React,{useEffect,useRef,useState} from 'react';
import type {User,BankBalance} from '../types';
import {incomeAttachments} from '../services/incomeAttachments';
import {incomeCaptureApi,IncomeDraft,IncomeReview} from '../services/incomeCaptureApi';
import {localFinanceDate} from '../services/quickFinance';
import {feeOptions} from '../services/extraFeeLifecycle';
import IncomeMemberMatrix,{IncomeMemberSummary} from './IncomeMemberMatrix';
import {applyIncomeSelections,incomeTargets} from '../services/incomeSelection';
import {useIncomeLedgers} from '../services/useIncomeLedgers';
import {incomeMemberCandidates,incomeSearchText} from '../services/incomeMatching';
const field='block w-full min-w-0 rounded-lg bg-logia-900 border border-logia-700 p-3 text-base mt-1';
const button='rounded-lg border border-logia-700 p-3 text-sm disabled:opacity-40';
export default function IncomeCapture({user,suspended=false,onBusyChange}:{user:User;suspended?:boolean;onBusyChange?:(busy:boolean)=>void}){
 const [text,setText]=useState(''),[files,setFiles]=useState<File[]>([]),[date,setDate]=useState(localFinanceDate),[rows,setRows]=useState<IncomeDraft[]>([]),[members,setMembers]=useState<User[]>([]),[accounts,setAccounts]=useState<BankBalance[]>([]),[selected,setSelected]=useState<IncomeDraft>(),[review,setReview]=useState<IncomeReview>(),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[filter,setFilter]=useState('pending'),[confirmReject,setConfirmReject]=useState(false),[frozen,setFrozen]=useState<IncomeReview>();
 const [retainImages,setRetainImages]=useState(false);
 const [version,setVersion]=useState(0),[search,setSearch]=useState(''),[memberSearch,setMemberSearch]=useState('');
 const {ledgers,errors:ledgerErrors}=useIncomeLedgers(user.groupId,[...rows.map(r=>(r as any).approvedReview?.memberId||r.memberId),review?.memberId||''],version);
 const payments=ledgers[review?.memberId||'']||[],paymentsReady=!!review?.memberId&&Object.prototype.hasOwnProperty.call(ledgers,review.memberId);
 const through=localFinanceDate().slice(0,7);
 const fileInput=useRef<HTMLInputElement>(null);
 const [csvPlans,setCsvPlans]=useState<BankCsvPlan[]|null>(null);
 const [conflicts,setConflicts]=useState<string[]>([]);
 const [folioWarnings,setFolioWarnings]=useState<{issues:BankImportFolioIssue[];files:string[];usable:number}|null>(null);
 const [skipInvalidFolios,setSkipInvalidFolios]=useState(false);
 const clearFolioWarnings=()=>{setFolioWarnings(null);setSkipInvalidFolios(false);};
 const request=useRef(''),flight=useRef(false);const allowed=['admin','master'].includes(user.role)&&user.active!==false&&!suspended;
 const refresh=async()=>{const [list,options]=await Promise.all([incomeCaptureApi.list(user.groupId),incomeCaptureApi.options(user.groupId)]);setRows(list);setMembers(options.members);setAccounts(options.accounts);setVersion(v=>v+1);};
 useEffect(()=>{if(allowed)void refresh().catch(e=>setError(e.message));},[user.uid,user.groupId,allowed]);
 const run=async(work:()=>Promise<void>)=>{if(flight.current||!allowed)return;flight.current=true;setBusy(true);onBusyChange?.(true);setError('');setNotice('');try{await work();}catch(e:any){setError(!e?.message||['internal','invalid-argument','failed-precondition','Bad Request'].includes(e.message)?'No se pudo analizar o guardar la solicitud. Revisa las columnas y conserva el folio como texto si estás importando un CSV.':e.message);}finally{flight.current=false;setBusy(false);onBusyChange?.(false);}};
 const update=(patch:Partial<IncomeReview>)=>{if(frozen)return;setReview(old=>old?{...old,...patch}:old);setReviewed(false);setError('');};
 const open=(draft:IncomeDraft)=>{setSelected(draft);setMemberSearch('');setReview((draft as any).approvedReview||{reference:draft.reference||'',...(draft.kind!=='other'?{allocations:[],allowUnapplied:false}:{}),memberId:draft.memberId,amount:draft.amount,date:draft.date,period:draft.period,kind:draft.kind==='other'?'other':'regular',feeId:'',concept:draft.concept||'',paymentMethod:draft.paymentMethod,accountId:''});setReviewed(false);setError('');setConfirmReject(false);setFrozen(undefined);try{const pending=JSON.parse(localStorage.getItem(`income-confirm:${user.uid}:${user.groupId}:${draft.id}`)||'null');if(pending){setReview(pending);setFrozen(pending);setReviewed(true);}}catch{}};


 const propose=()=>{if(!review||frozen||!paymentsReady)return;const plan=incomeAllocation(payments,review.amount,undefined,review.period);if(!plan.allocations.length){setError('No hay cuotas normales pendientes desde ese mes. Puedes elegir otras cuotas en la matriz.');return;}const targets=incomeTargets(payments);update({period:plan.allocations[0].period,periods:plan.allocations.map(a=>a.period),allocations:plan.allocations.map(a=>({...a,kind:'regular' as const,expectedBalance:targets.find(t=>t.period===a.period&&t.kind==='regular')!.balance}))});};
 const custom=review?.kind!=='other'&&review?.allocations!==undefined;
 let selectionPreview:ReturnType<typeof applyIncomeSelections>|undefined,selectionError='';
 if(custom&&selected?.status==='pending'&&paymentsReady){try{selectionPreview=applyIncomeSelections(payments,review!.amount,review!.allocations,review!.allowUnapplied===true,review!.date,'preview');}catch(e:any){selectionError=e.message;}}
 const allocationPreview=selected?.status==='pending'&&review?.kind==='regular'&&!custom?incomeAllocation(payments,review.amount,review.periods?.length?review.periods:[review.period]):null;
 const save=()=>run(async()=>{if(!selected||!review||!reviewed)throw Error('Revisa los datos y marca la confirmación.');const key=`income-confirm:${user.uid}:${user.groupId}:${selected.id}`,payload=frozen||{...review,...(allocationPreview?{periodAmounts:allocationPreview.allocations.map(a=>a.amount)}:{})};localStorage.setItem(key,JSON.stringify(payload));setFrozen(payload);
  try{await incomeCaptureApi.approve(user.groupId,selected.id,payload,true);}catch(e){try{const state=await incomeCaptureApi.state(user.groupId,selected.id);if(state==='pending'){localStorage.removeItem(key);setFrozen(undefined);}}catch{}throw e;}
  localStorage.removeItem(key);setFrozen(undefined);setSelected(undefined);setReview(undefined);await refresh();setNotice(selectionPreview?.unapplied?'Ingreso aprobado. El folio quedó guardado y el remanente se conserva en Capturas como saldo sin aplicar.':'Ingreso aprobado y registrado. El folio y el reparto quedaron guardados.');});
 const loadCsvPlans=async()=>{
  if(csvPlans)return csvPlans;
  const plans=await Promise.all(files.filter(isIncomeCsv).map(async file=>{
   const source=await incomeCsvText(file);
   return {...inspectBankCsv(source),text:source,name:file.name};
  }));
  if(text.length<=BANK_TEXT_LIMIT){
   const pasted=recognizeBankCsvText(text);
   // A complete original export, including its summary section, also works here.
   if(pasted)plans.push({...pasted,text,name:'CSV pegado'});
  }
  return plans;
 };
 const changeCsv=(index:number,patch:Partial<CsvMapping>)=>{
  setCsvPlans(current=>current?.map((plan,i)=>{
   if(i!==index)return plan;
   const mapping={...plan.mapping,...patch};
   const needsYear=patch.date===undefined?plan.needsYear:bankCsvNeedsYear(plan.text,plan.headerLine,plan.separator,mapping.date);
   return {...plan,...(patch.dateOrder?{ambiguousDate:false}:{}),mapping,needsYear,year:needsYear?plan.year:undefined};
  })||null);
  request.current='';setError('');clearFolioWarnings();
 };
 const changeCsvYear=(index:number,year:string)=>{
  setCsvPlans(current=>current?.map((plan,i)=>i===index?{...plan,year}:plan)||null);
  request.current='';setError('');clearFolioWarnings();
 };
 const analyze=()=>run(async()=>{
  setConflicts([]);
  if(!text.trim()&&!files.length)throw Error('Agrega texto, fotos, Excel, CSV o PDF.');
  const plans=await loadCsvPlans();
  if(plans.some(plan=>!csvIsReady(plan.mapping)||plan.ambiguousDate)){
   setCsvPlans(plans);
   setError('Revisa las columnas y el formato de fecha. Elige columnas distintas para el folio, la fecha y el importe, e indica cómo identificar los abonos. Todavía no se crearon solicitudes.');
   return;
  }
  if(plans.some(plan=>plan.needsYear&&!isBankCsvYear(plan.year))){
   setCsvPlans(plans);
   setError('Algunas fechas del CSV tienen día y mes, pero no año. Indica el año del archivo para continuar.');
   return;
  }
  const otherFiles=files.filter(file=>!isIncomeCsv(file));
  if(plans.length&&otherFiles.some(file=>!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf'))throw Error('Analiza el CSV por separado de fotos y Excel para mantener la conciliación por folio.');
  const pasted=plans.some(plan=>plan.name==='CSV pegado'&&plan.text===text);
  const prepared=await incomeAttachments(otherFiles,pasted?'':text,plans.length>0);
  if(plans.length&&(prepared.images.length||prepared.documents.length))throw Error('El PDF no tiene texto legible. Analiza el CSV por separado del PDF escaneado.');
  const csvFiles:CsvInput[]=plans.map(({text,headerLine,separator,mapping,needsYear,year})=>({text,headerLine,separator,mapping,...(needsYear?{year}:{})}));
  if(prepared.text.length+csvFiles.reduce((sum,file)=>sum+file.text.length,0)>BANK_TEXT_LIMIT)throw Error('Divide los movimientos en partes y conserva el encabezado de cada CSV.');
  const previewFiles=csvFiles.map(file=>({...file,skipInvalidFolios:true}));
  const preview=csvFiles.length?bankStatement('',previewFiles):null;
  if(preview?.invalidFolios.length){
   setCsvPlans(plans);
   setFolioWarnings({issues:preview.invalidFolios,files:plans.map(plan=>plan.name),usable:preview.incomes.length});
   if(!preview.incomes.length||!skipInvalidFolios){
    setError(preview.incomes.length?'Algunos ingresos no tienen un folio completo. Corrige esas filas o confirma que quieres preparar solo los ingresos con folio utilizable.':'Ningún ingreso de este CSV tiene un folio utilizable. Consigue los folios completos y vuelve a subir el archivo.');
    return;
   }
  }
  request.current ||= crypto.randomUUID();
  const result=await incomeCaptureApi.analyze(user.groupId,request.current,prepared.text,date,prepared.images,retainImages,prepared.documents,preview?.invalidFolios.length?previewFiles:csvFiles);
  await refresh();
  setText('');setFiles([]);setCsvPlans(null);clearFolioWarnings();if(fileInput.current)fileInput.current.value='';request.current='';
  if(result.bankRead&&result.created!==undefined){
   const conflicts=result.conflicts||[];
   const excluded=result.invalidFolios||preview?.invalidFolios.length||0;
   setConflicts(conflicts);setFilter('pending');
   setNotice(`Solicitudes nuevas: ${result.created}. Movimientos que ya tenían registro o solicitud: ${result.existing||0}. Filas repetidas en el archivo: ${result.repeatedRows||0}. Operaciones no consideradas (egresos, rendimientos u otras): ${result.ignored||0}. ${excluded?'Ingresos omitidos por folio incompleto: '+excluded+'. ':''}${conflicts.length?`Folios con datos distintos: ${conflicts.length}; no se importaron. `:''}No se registró dinero. ${result.created?'Revisa y aprueba las solicitudes nuevas.':''}`);
  }else setNotice(result.ids?.length?(result.bankRead?'Lectura bancaria lista. Revisa las solicitudes pendientes.':'Análisis listo. Revisa cada solicitud antes de aprobar.'):'No se identificaron ingresos. No se registró dinero.');
 });
 if(!allowed)return <p className="p-3 text-amber-200">La captura de ingresos requiere Admin o Admin Master y una logia activa.</p>;
 return <section aria-label="Ingresos con IA" className="space-y-4 min-w-0">
  <div><h3 className="text-xl font-bold">Conciliar ingresos con Gemini</h3><p className="text-sm text-gray-400">Texto, fotos, Excel (.xlsx), CSV o PDF de transferencias y estados de cuenta. Cada pago genera una solicitud. Solo se registra al aprobarla.</p></div>
  {error&&<p role="alert" className="rounded border border-red-600 bg-red-900/30 p-3 break-words">{error}</p>}{notice&&<p role="status" className="text-green-300">{notice}</p>}
  {!!conflicts.length&&<details className="rounded-lg border border-amber-600 p-3 text-amber-200"><summary>Ver folios con datos distintos</summary><p>Compara la fecha y el importe con el registro existente antes de corregirlo.</p><ul className="list-disc pl-5">{conflicts.map(ref=><li key={ref}>{ref}</li>)}</ul></details>}
  {!selected&&<>
   <fieldset disabled={busy} className="rounded-xl border border-logia-700 p-4 space-y-3">
    <label className="block">Texto o explicación<textarea aria-label="Texto de ingresos" className={field} rows={4} value={text} onChange={e=>{setText(e.target.value);setCsvPlans(null);clearFolioWarnings();request.current='';}} placeholder="Ej. Juan Pérez pagó $500 de septiembre y Carlos Ríos $700 de la cuota extraordinaria…"/></label>
    <label className="block">Fotos, Excel, CSV o PDF (hasta 4)<input ref={fileInput} aria-label="Archivos de ingresos" className={field} type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp,.xlsx,.csv,text/csv,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>{const next=Array.from(e.target.files||[]);if(next.length>4){setError('Selecciona hasta cuatro archivos.');e.target.value='';return;}setFiles(next);setCsvPlans(null);clearFolioWarnings();setError('');request.current='';}}/></label>
    <p className="text-xs text-gray-400">CSV con folio, fecha e importe: hasta {BANK_INCOME_LIMIT} transferencias por análisis. PDF y Excel: máximo 2 MB por archivo. Excel debe ser .xlsx; convierte los .xls antiguos. Por defecto solo se guardan los datos escritos, sin adjuntar el estado de cuenta.</p>
    {files.map((f,i)=><p className="text-xs break-words" key={i}>{f.name}</p>)}
    <label className="flex items-start gap-2"><input aria-label="Guardar imágenes como comprobantes" type="checkbox" checked={retainImages} onChange={e=>{setRetainImages(e.target.checked);request.current='';}}/>Guardar también las imágenes como comprobantes</label>
    <p className="text-xs text-gray-400">El CSV se concilia por folio sin Gemini. Puedes ajustar las columnas si tu banco usa otros nombres. La IA interpreta otros textos o fotos y busca coincidencias en el directorio. Por defecto se conserva solo el detalle escrito de cada movimiento; la foto no se guarda. Revisa las dudas antes de aprobar.</p>
    {files.some(isIncomeCsv)&&!csvPlans&&<button type="button" className={button} onClick={()=>void run(async()=>setCsvPlans(await loadCsvPlans()))}>Revisar columnas del CSV</button>}
    {csvPlans?.map((plan,i)=><BankCsvColumns key={i} plan={plan} onChange={patch=>changeCsv(i,patch)} onYearChange={year=>changeCsvYear(i,year)}/>)}
    {folioWarnings&&<div className="rounded-lg border border-amber-600 p-3 space-y-2 text-amber-100">
     <p className="text-sm">Ingresos con folio utilizable: {folioWarnings.usable}. Ingresos que requieren el folio original: {folioWarnings.issues.length}.</p>
     <details className="text-sm"><summary>Ver filas que requieren corrección</summary><ul className="list-disc pl-5">
      {folioWarnings.files.map((name,i)=>{
       const issues=folioWarnings.issues.filter(issue=>issue.file===i);
       return issues.length?<li className="break-words" key={i}>{name}: {issues.map(issue=>'línea '+issue.line+' ('+(issue.reason==='scientific'?'notación científica':issue.reason==='missing'?'sin folio':'folio inválido')+')').join(', ')}</li>:null;
      })}
     </ul></details>
     {folioWarnings.usable>0&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={skipInvalidFolios} onChange={e=>{setSkipInvalidFolios(e.target.checked);request.current='';setError('');}}/>Preparar solo los ingresos con folio utilizable</label>}
    </div>}
    <label className="block">Fecha de referencia<input aria-label="Fecha de referencia de ingresos" className={field} type="date" value={date} onChange={e=>{setDate(e.target.value);request.current='';}}/></label>
    <button className={button+' bg-indigo-600'} onClick={analyze}>{busy?'Analizando…':'Interpretar y preparar solicitudes'}</button>
   </fieldset>
   <div className="flex gap-2 items-center"><label>Ver<select aria-label="Estado de solicitudes de ingreso" className={field} value={filter} disabled={busy} onChange={e=>setFilter(e.target.value)}><option value="pending">Pendientes</option><option value="approved">Aprobadas</option><option value="rejected">Rechazadas</option></select></label><button disabled={busy} className={button} onClick={()=>void run(refresh)}>Actualizar solicitudes</button></div>
   <label className="block text-sm">Buscar por hermano o folio<input aria-label="Buscar solicitudes por hermano o folio" className={field} placeholder="Nombre, referencia o ID de transferencia" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   {rows.filter(r=>r.status===filter&&incomeSearchText([r.payerName,members.find(m=>m.uid===((r as any).approvedReview?.memberId||r.memberId))?.name,r.reference,(r as any).approvedReview?.reference,r.date].join(' ')).includes(incomeSearchText(search))).map(r=>{const saved=(r as any).approvedReview,memberId=saved?.memberId||r.memberId;return <article key={r.id} className="rounded-xl border border-logia-700 bg-logia-800 p-4 space-y-2 break-words"><h4 className="font-bold">{members.find(m=>m.uid===memberId)?.name||r.payerName||'Hermano por identificar'} · ${(saved?.amount??r.amount).toFixed(2)}</h4><p>{saved?.period||r.period||'Mes por definir'} · {saved?.concept||r.concept||'Concepto por definir'}</p><p className="text-xs text-gray-300">Depósito: {r.date||'Por confirmar'} · Folio: {(r as any).approvedReview?.reference||r.reference||'No identificado'}</p>{memberId&&(ledgers[memberId]?<IncomeMemberSummary payments={ledgers[memberId]} through={through} compact/>:<p className="text-xs text-gray-400">{ledgerErrors[memberId]||'Consultando meses pagados y cuotas pendientes…'}</p>)}{r.possibleDuplicate&&<p className="text-amber-300">Posible duplicado: compara con tus registros antes de aprobar.</p>}<p className="text-xs text-gray-400">{r.warnings?.join(' ')}</p><button className={button} disabled={busy} onClick={()=>open(r)}>{r.status==='pending'?'Revisar solicitud':'Ver registro'}</button></article>;})}
   {!rows.some(r=>r.status===filter)&&<p className="text-sm text-gray-400">No hay solicitudes en este estado.</p>}
  </>}
  {selected&&review&&<div aria-label="Revisión del ingreso" className="space-y-4 rounded-xl border border-logia-700 bg-logia-800 p-4">
   <h4 className="font-bold">Revisa el ingreso de {selected.payerName||'hermano por identificar'}</h4>
   {selected.possibleDuplicate&&<p role="alert" className="text-amber-300">Posible duplicado. Verifica que este pago no se haya registrado antes.</p>}
   <blockquote className="text-sm text-gray-300 whitespace-pre-wrap break-words border-l-2 pl-3">{selected.sourceQuote}</blockquote>
   {selected.sourceText&&<details><summary>Texto original completo</summary><p className="text-sm whitespace-pre-wrap">{selected.sourceText}</p></details>}
   <p className="text-xs text-gray-400">{selected.receiptImageUrls?.length?'Las imágenes se vincularán al comprobante al aprobar.':'Se conserva el dato escrito de cada movimiento, sin archivo adjunto.'}</p><div className="flex flex-wrap gap-2">{selected.receiptImageUrls?.map((url,i)=><a key={url} href={url} target="_blank" rel="noreferrer" className="underline text-indigo-300">Ver comprobante {i+1}</a>)}</div>
   <fieldset disabled={busy||!!frozen||selected.status!=='pending'} className="space-y-3 min-w-0 max-w-full">
    <label className="block">Buscar hermano<input aria-label="Buscar hermano del ingreso" className={field} placeholder="Nombre o apellido del directorio" value={memberSearch} onChange={e=>setMemberSearch(e.target.value)}/></label>
    <label className="block">Hermano<select aria-label="Hermano del ingreso" className={field} value={review.memberId} onChange={e=>{update({memberId:e.target.value,feeId:'',periods:undefined,allocations:review.kind==='regular'?[]:undefined,allowUnapplied:false});}}><option value="">Seleccionar hermano</option>{members.filter(m=>m.uid===review.memberId||incomeSearchText(m.name).includes(incomeSearchText(memberSearch))).map(m=><option key={m.uid} value={m.uid}>{m.name}{!m.active?' (inactivo)':''}</option>)}</select></label>
    {!review.memberId&&<div className="flex flex-wrap gap-2">{incomeMemberCandidates(selected.payerName,members).map(m=><button type="button" className={button} key={m.uid} onClick={()=>update({memberId:m.uid,feeId:'',periods:undefined,allocations:review.kind==='regular'?[]:undefined,allowUnapplied:false})}>Revisar coincidencia: {m.name}</button>)}</div>}
    {review.memberId&&<div className="rounded-lg border border-indigo-500/40 p-3 space-y-3">
     {paymentsReady?<IncomeMemberSummary payments={payments} through={through}/>:<p role="status">{ledgerErrors[review.memberId]||'Cargando el historial y los saldos del hermano…'}</p>}
     <button type="button" disabled={busy||!!frozen} className={button} onClick={()=>{setReviewed(false);setVersion(v=>v+1);}}>Actualizar saldos del hermano</button>
    </div>}
    <p className="text-xs text-gray-300">Fecha bancaria detectada: {selected.date||'No identificada'} · Folio original: <span className="break-all">{selected.reference||'No identificado'}</span></p>
    <label className="block">Folio o referencia de transferencia<input aria-label="Folio de transferencia" className={field} type="text" maxLength={180} value={review.reference??selected.reference??''} onChange={e=>update({reference:e.target.value})}/></label>
    <label className="block">Monto<input aria-label="Monto del ingreso" className={field} type="number" min="0.01" step="0.01" value={review.amount||''} onChange={e=>update({amount:Number(e.target.value)})}/></label>
    <label className="block">Fecha del pago<input aria-label="Fecha del pago" className={field} type="date" value={review.date} onChange={e=>update({date:e.target.value})}/></label>
    <label className="block">{review.kind==='regular'?'Mes inicial para proponer (opcional)':'Mes de aplicación'}<input aria-label="Mes de aplicación" className={field} type="month" value={review.period} onChange={e=>update({period:e.target.value,...(!custom?{feeId:'',periods:[]}:{})})}/></label>
    <label className="block">Tipo de concepto<select aria-label="Tipo de concepto" className={field} value={review.kind} onChange={e=>update({kind:e.target.value as IncomeReview['kind'],feeId:'',periods:undefined,allocations:e.target.value==='regular'?[]:undefined,allowUnapplied:false})}><option value="regular">Elegir cuotas normales y extraordinarias</option><option value="extra">Una cuota extraordinaria (selección directa)</option><option value="other">Otro ingreso</option></select></label>
    {review.kind==='regular'&&<div className="rounded-lg border border-logia-700 p-3 space-y-3">
     <button type="button" className={button} disabled={!paymentsReady||busy||!!frozen} onClick={propose}>Proponer meses pendientes</button>
     {paymentsReady&&<IncomeMemberMatrix payments={payments} received={review.amount} selections={review.allocations||[]} through={through} disabled={busy||!!frozen||selected.status!=='pending'} onChange={allocations=>update({allocations,periods:[...new Set(allocations.map(a=>a.period))].sort()})}/>}
     {review.allocations?.map(a=><p key={`${a.period}-${a.kind}-${a.feeId||''}`} className="text-xs text-indigo-200">{a.period}: ${a.amount.toFixed(2)}{a.kind==='extra'?' · Cuota extraordinaria':''}</p>)}
     {selected.status==='pending'&&<label className="flex items-start gap-2"><input aria-label="Conservar saldo sin aplicar" type="checkbox" checked={review.allowUnapplied===true} onChange={e=>update({allowUnapplied:e.target.checked})}/>Conservar cualquier remanente como saldo sin aplicar. No se abona a meses que no seleccione; se podrá completar desde Capturas.</label>}
     {selectionError&&<p className="text-sm text-amber-200">{selectionError}</p>}
     {selected.status==='approved'&&review.allowUnapplied&&<p className="text-amber-200">El remanente se conserva como una captura pendiente, con el mismo folio bancario.</p>}
    </div>}
    {review.kind==='extra'&&<label className="block">Cuota extraordinaria<select aria-label="Cuota extraordinaria del ingreso" className={field} value={review.feeId} onChange={e=>{const f=feeOptions(payments).find(f=>f.period===review.period&&f.feeId===e.target.value);update({feeId:e.target.value,...(f?{concept:f.description}:{})});}}><option value="">Selecciona la cuota asignada</option>{feeOptions(payments).filter(f=>f.period===review.period).map(f=><option key={f.feeId} value={f.feeId}>{f.description} · saldo ${f.balance.toFixed(2)}{f.forgiven?' (perdonada)':''}</option>)}</select></label>}
    <label className="block">Concepto<input aria-label="Concepto del ingreso" className={field} maxLength={500} value={review.concept} onChange={e=>update({concept:e.target.value})}/></label>
    <label className="block">Método<select aria-label="Método del ingreso" className={field} value={review.paymentMethod} onChange={e=>update({paymentMethod:e.target.value as IncomeReview['paymentMethod']})}><option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option></select></label>
    <label className="block">Cuenta o caja a incrementar<select aria-label="Cuenta del ingreso" className={field} value={review.accountId} onChange={e=>update({accountId:e.target.value})}><option value="">No actualizar un saldo de cuenta</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   </fieldset>
   {selected.status==='pending'&&<><label className="flex items-start gap-2"><input aria-label="Confirmo los datos del ingreso" type="checkbox" checked={reviewed} disabled={busy||!!frozen} onChange={e=>setReviewed(e.target.checked)}/>Revisé hermano, folio, monto, fecha y el importe destinado a cada cuota. Autorizo registrar este ingreso.</label><button disabled={busy||!reviewed||(!frozen&&(!!allocationPreview?.remaining||custom&&(!paymentsReady||!!selectionError)))} className={button+' bg-green-700'} onClick={save}>{busy?'Guardando…':frozen?'Reintentar la misma aprobación':'Aprobar y registrar ingreso'}</button>{!frozen&&<button className={button+' text-red-300'} disabled={busy} onClick={()=>setConfirmReject(true)}>Rechazar solicitud</button>}{confirmReject&&!frozen&&<div className="border border-red-700 p-3"><p>¿Rechazar este borrador sin registrar dinero?</p><button disabled={busy} className={button} onClick={()=>void run(async()=>{await incomeCaptureApi.reject(user.groupId,selected.id);setSelected(undefined);await refresh();setNotice('Solicitud rechazada.');})}>Confirmar rechazo</button></div>}</>}
   <button disabled={busy} className={button} onClick={()=>{setSelected(undefined);setReview(undefined);setFrozen(undefined);}}>Volver a solicitudes</button>
  </div>}
 </section>;
}

