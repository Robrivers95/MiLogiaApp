import React from 'react';
import {csvFields,inspectBankCsv} from '../functions/src/meetingBankCsv';
import type {CsvMapping} from '../functions/src/meetingBankCsv';

export type BankCsvPlan=ReturnType<typeof inspectBankCsv>&{text:string;name:string;year?:string};
const labels={reference:'Folio o referencia',date:'Fecha del movimiento',amount:'Importe',payer:'Ordenante (opcional)',direction:'Tipo o descripción'};
const select='mt-1 block w-full min-w-0 rounded-lg border border-logia-700 bg-logia-900 p-2';
export default function BankCsvColumns({plan,onChange,onYearChange}:{plan:BankCsvPlan;onChange:(patch:Partial<CsvMapping>)=>void;onYearChange:(year:string)=>void}){
 return <section aria-label={'Columnas de '+plan.name} className="rounded-lg border border-indigo-500/60 p-3 space-y-3">
  <div><h4 className="font-bold break-all">{plan.name}</h4><p className="text-xs text-gray-300">Encabezado en la línea {plan.headerLine}. Las opciones muestran el nombre de la columna y un ejemplo de su primer valor.</p></div>
  {plan.needsYear&&<label className="block text-sm">
   Año de las fechas del CSV
   <input aria-label="Año de las fechas del CSV" className={select} type="text" inputMode="numeric" maxLength={4} placeholder="Ej. 2026" value={plan.year||''} onChange={e=>onYearChange(e.target.value.replace(/\D/g,''))}/>
   <span className="mt-1 block text-xs text-gray-300">Solo se usa para movimientos que vienen sin año. Si incluyen años distintos, sepáralos por año.</span>
  </label>}
  <div className="grid gap-3 sm:grid-cols-2">
   {csvFields.map(field=><label key={field} className="text-sm min-w-0">
    {labels[field]}{field==='direction'&&plan.mapping.mode!=='typed'?' (opcional)':''}<select aria-label={labels[field]+(field==='direction'&&plan.mapping.mode!=='typed'?' (opcional)':'')} className={select} value={plan.mapping[field]} onChange={e=>onChange({[field]:Number(e.target.value)})}>
     <option value={-1}>{field==='payer'?'Sin ordenante':field==='direction'&&plan.mapping.mode!=='typed'?'Sin tipo o descripción':'Elige una columna'}</option>
     {plan.headers.map((name,i)=><option key={i} value={i}>{i+1}. {name.slice(0,100)||'Sin título'}{plan.sample[i]?` — ${plan.sample[i].slice(0,55)}`:''}</option>)}
    </select>
   </label>)}
   <label className="text-sm">Cómo identificar los abonos
    <select aria-label="Cómo identificar los abonos" className={select} value={plan.mapping.mode} onChange={e=>onChange({mode:e.target.value as CsvMapping['mode']})}>
     <option value="">Selecciona cómo leer el importe</option><option value="credit">La columna elegida contiene solo abonos</option><option value="signed">Importe con signo: positivo = abono</option><option value="typed">La columna Tipo distingue abonos y cargos</option>
    </select>
   </label>
   <label className="text-sm">Formato de fecha corta
    <select aria-label="Formato de fecha corta" className={select} value={plan.ambiguousDate?'':plan.mapping.dateOrder} onChange={e=>onChange({dateOrder:e.target.value as CsvMapping['dateOrder']})}>
     {plan.ambiguousDate&&<option value="">Confirma el orden de la fecha</option>}<option value="DMY">Día / mes / año</option><option value="MDY">Mes / día / año</option>
    </select>
   </label>
  </div>
 </section>;
}
