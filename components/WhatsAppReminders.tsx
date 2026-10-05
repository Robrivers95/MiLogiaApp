import React, { useId, useState } from 'react';
import type { User } from '../types';
import { canUseWhatsApp, normalizeWhatsAppPhone, whatsappChatUrl, whatsappMessage, WhatsAppPreparation } from '../services/whatsappReminders';
import { memberMoney } from '../services/memberPresentation';

export default function WhatsAppReminders({ user, suspended, prepare, saveContact }: {
  user: User; suspended: boolean; prepare: () => Promise<WhatsAppPreparation>;
  saveContact: (uid: string, phone: string, permitted: boolean) => Promise<void>;
}) {
  const allowed = canUseWhatsApp(user, suspended);
  const batchMessageId = useId();
  const [data,setData] = useState<WhatsAppPreparation | null>(null);
  const [selected,setSelected] = useState<string[]>([]);
  const [queue,setQueue] = useState<string[]>([]);
  const [index,setIndex] = useState(0);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [batchMessage,setBatchMessage] = useState('');
  const [instructions,setInstructions] = useState('');
  const [query,setQuery] = useState('');
  const [phone,setPhone] = useState('');
  const [permitted,setPermitted] = useState(false);
  const [opened,setOpened] = useState<string[]>([]);
  const current = data?.recipients.find(recipient => recipient.member.uid === queue[index]);
  const setCurrent = (uids: string[], position: number) => {
    setQueue(uids);setIndex(position);setError('');
    const member = data?.recipients.find(recipient => recipient.member.uid === uids[position])?.member;
    setPhone(member?.phoneNumber || '');setPermitted(member?.whatsappRemindersAllowed === true);
  };
  const load = async () => {
    if (!allowed) return;
    setBusy(true);setError('');setData(null);setQueue([]);setOpened([]);
    try { const result=await prepare();setData(result);setSelected(result.recipients.filter(recipient=>!recipient.error).map(recipient=>recipient.member.uid)); }
    catch(error){setError(error instanceof Error ? error.message : 'No se pudo consultar el adeudo.');}
    finally{setBusy(false);}
  };
  let url='';let message='';
  if (current && !current.error) {
    try { message=whatsappMessage(current.member,data!.groupName,current.reminder,instructions,batchMessage);if (current.member.whatsappRemindersAllowed && phone === (current.member.phoneNumber || '') && permitted) url=whatsappChatUrl(current.member.phoneNumber || '',message); } catch { /* Invalid contact must be corrected before opening. */ }
  }
  const control='w-full rounded-lg bg-logia-900 border border-logia-700 p-3 text-sm text-white';
  return <section aria-label="Cobros por WhatsApp" className="bg-logia-800 border border-logia-700 rounded-xl p-4 space-y-4 min-w-0">
    <div><h3 className="text-lg font-bold">Cobros por WhatsApp</h3><p className="text-xs text-gray-400 mt-2">Abre el chat de cada miembro con su nombre y adeudo. Solo pulsas Enviar en WhatsApp, regresas aquí y pasas al siguiente. Se usa el WhatsApp activo en tu dispositivo.</p></div>
    <button disabled={!allowed || busy} onClick={load} className="rounded-lg bg-green-700 p-3 text-sm disabled:opacity-40">{busy ? 'Consultando saldos…' : data ? 'Actualizar saldos de WhatsApp' : 'Preparar cobros por WhatsApp'}</button>
    {!allowed && <p className="text-xs text-amber-300">Disponible exclusivamente para Admin y Master en una Logia activa. Visores y otros niveles no pueden usarlo.</p>}
    {allowed && <>
      <div>
        <label htmlFor={batchMessageId} className="block text-xs text-gray-400">Mensaje previo para todos (opcional)</label><textarea id={batchMessageId} value={batchMessage} onChange={event=>setBatchMessage(event.target.value)} rows={3} className={`${control} mt-1`} placeholder="Hola hermano, me pidieron recordarte tu pago. ¿Me podrías compartir una fecha de compromiso?" />
        <p className="text-xs text-gray-400 mt-2">Escríbelo una vez por tanda. Se coloca antes del nombre, las cuotas y el total de cada miembro. Puedes modificarlo antes de abrir cada chat; si lo dejas vacío se usa el mensaje habitual.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-300 break-words">{error}</p>}
      {data && <>
        <p className="text-xs text-gray-400">{data.groupName} · Saldos consultados: {new Date(data.calculatedAt).toLocaleString('es-MX')}. No incluye cuotas futuras ni perdonadas.</p>
        {!data.recipients.length ? <p className="text-sm text-green-300">No hay miembros activos con adeudo pendiente.</p> : queue.length ? current && <div className="space-y-4">
          <div><p className="text-xs text-indigo-300">Miembro {index+1} de {queue.length}</p><h4 className="text-lg font-bold break-words">{current.member.name}</h4><p className="text-sm">Adeudo: <strong className="text-red-300">{memberMoney(current.reminder.total)}</strong></p></div>
          <label className="block text-xs text-gray-400">WhatsApp del miembro<input type="tel" inputMode="tel" value={phone} onChange={event=>setPhone(event.target.value)} placeholder="10 dígitos de México o +código de país" className={`${control} mt-1`} /></label>
          <label className="flex gap-2 items-start text-sm"><input type="checkbox" checked={permitted} onChange={event=>setPermitted(event.target.checked)} className="mt-1" />El miembro aceptó recibir recordatorios por WhatsApp.</label>
          <button disabled={busy} onClick={async()=>{if(!allowed)return;setBusy(true);setError('');try{const normalized=normalizeWhatsAppPhone(phone);await saveContact(current.member.uid,normalized,permitted);setData(previous=>previous && {...previous,recipients:previous.recipients.map(recipient=>recipient.member.uid===current.member.uid ? {...recipient,member:{...recipient.member,phoneNumber:normalized,whatsappRemindersAllowed:permitted}} : recipient)});setPhone(normalized);}catch(error){setError(error instanceof Error ? error.message : 'No se pudo guardar el teléfono.');}finally{setBusy(false);}}} className="p-3 rounded-lg border border-logia-700 text-sm disabled:opacity-40">Guardar teléfono y autorización</button>
          <label className="block text-xs text-gray-400">Instrucciones de pago para todos (opcional)<textarea value={instructions} onChange={event=>setInstructions(event.target.value)} rows={2} className={`${control} mt-1`} placeholder="Cuenta bancaria, referencia o indicaciones" /></label>
          <div className="bg-logia-900 rounded-lg p-3"><p className="text-xs text-gray-400 mb-2">Mensaje preparado · destino: {current.member.phoneNumber || 'sin teléfono'}</p><p className="text-sm whitespace-pre-wrap break-words">{message}</p></div>
          <button disabled={!url || busy} onClick={()=>{if(!allowed || !url)return;window.open(url,'_blank','noopener,noreferrer');setOpened(previous=>[...new Set([...previous,current.member.uid])]);}} className="w-full bg-green-700 rounded-lg p-3 text-sm font-bold disabled:opacity-40">Abrir WhatsApp de {current.member.name}</button>
          {!url && <p className="text-xs text-amber-300">Guarda un teléfono válido y la autorización para habilitar el chat.</p>}
          {opened.includes(current.member.uid) && <p role="status" className="text-xs text-green-300">Chat abierto. Esto no confirma que hayas enviado el mensaje.</p>}
          <div className="flex flex-wrap gap-2"><button disabled={index===0 || busy} onClick={()=>setCurrent(queue,index-1)} className="p-3 rounded-lg border border-logia-700 text-sm disabled:opacity-40">Anterior miembro</button><button disabled={index===queue.length-1 || busy} onClick={()=>setCurrent(queue,index+1)} className="p-3 rounded-lg border border-indigo-700 text-sm disabled:opacity-40">Siguiente miembro</button><button onClick={()=>setQueue([])} className="p-3 text-sm text-indigo-300">Volver a selección</button></div>
        </div> : <div className="space-y-3">
          <label className="block text-xs text-gray-400">Buscar deudor<input value={query} onChange={event=>setQuery(event.target.value)} className={`${control} mt-1`} placeholder="Nombre del miembro" /></label>
          <div className="flex flex-wrap gap-2"><button onClick={()=>setSelected(data.recipients.filter(recipient=>!recipient.error).map(recipient=>recipient.member.uid))} className="p-3 rounded-lg border border-logia-700 text-sm">Seleccionar todos</button><button onClick={()=>setSelected([])} className="p-3 text-sm">Limpiar selección</button></div>
          <div className="max-h-80 overflow-y-auto space-y-2">{data.recipients.filter(recipient=>recipient.member.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(recipient=><label key={recipient.member.uid} className="flex gap-3 p-3 rounded-lg bg-logia-900 text-sm"><input disabled={!!recipient.error} type="checkbox" checked={selected.includes(recipient.member.uid)} onChange={event=>setSelected(previous=>event.target.checked ? [...previous,recipient.member.uid] : previous.filter(uid=>uid!==recipient.member.uid))} /><span className="min-w-0 break-words flex-1">{recipient.member.name}<span className="block text-xs text-gray-400">{recipient.error || `${memberMoney(recipient.reminder.total)} · ${recipient.member.phoneNumber || 'Falta teléfono'}${recipient.member.whatsappRemindersAllowed ? '' : ' · Falta autorización'}`}</span></span></label>)}</div>
          <button disabled={!selected.length} onClick={()=>setCurrent(selected,0)} className="w-full sm:w-auto p-3 rounded-lg bg-indigo-600 text-sm disabled:opacity-40">Comenzar recorrido ({selected.length})</button>
        </div>}
      </>}
    </>}
  </section>;
}
