import {csvIsReady,recognizeBankCsvText,readBankCsv,namedBankDate,isBankCsvYear} from './meetingBankCsv';
import type {BankCsvFolioIssue,CsvInput,CsvMapping} from './meetingBankCsv';
// Mercado Pago exports: preserve operation IDs, dates and amounts exactly.
export interface BankMovement {payerName:string;amount:number;date:string;period:string;kind:string;concept:string;reference:string;paymentMethod:string;sourceQuote:string;}
export type BankImportFolioIssue=BankCsvFolioIssue&{file:number};
export const BANK_TEXT_LIMIT=128000;
export const BANK_INCOME_LIMIT=120;

const columns=['RELEASE_DATE','TRANSACTION_TYPE','REFERENCE_ID','TRANSACTION_NET_AMOUNT'] as const;
const field=(value:string)=>value.trim().replace(/^\uFEFF/,'');
function cells(line:string,separator:string):string[]{
 const result:string[]=[];let value='',quoted=false,closed=false;
 for(let i=0;i<line.length;i++){
  const c=line[i];
  if(quoted){
   if(c==='"'&&line[i+1]==='"'){value+='"';i++;}
   else if(c==='"'){quoted=false;closed=true;}
   else value+=c;
  }else if(c===separator){result.push(field(value));value='';closed=false;}
  else if(c==='"'&&!closed&&!value.trim()){quoted=true;value='';}
  else if(c==='"'||closed&&c.trim())throw Error('Hay comillas fuera de lugar.');
  else if(!closed)value+=c;
 }
 if(quoted)throw Error('Hay un campo entre comillas sin cerrar. Revisa las comillas del archivo.');
 return [...result,field(value)];
}
function csvHeader(line:string){
 if(!columns.every(c=>line.toUpperCase().includes(c)))return null;
 for(const separator of [';',',','\t']){
  try{
   const names=cells(line,separator).map(s=>s.toUpperCase());
   if(columns.every(c=>names.filter(n=>n===c).length===1))return {separator,length:names.length,indices:columns.map(c=>names.indexOf(c))};
  }catch{}
 }
 return null;
}
export const isMercadoPagoPdf=(text:string)=>/ESTADO DE SALDOS Y MOVIMIENTOS/i.test(text)&&/Mercado\s+Pago/i.test(text);
export const hasBankCsvHeader=(text:string)=>text.split(/\r\n|\n|\r/).some(line=>csvHeader(line)!==null);

const money=(value:string)=>{
 const raw=value.trim();
 const wrapped=raw.startsWith('(')&&raw.endsWith(')');
 const plain=wrapped?raw.slice(1,-1).trim():raw;
 if(wrapped&&/[-+]/.test(plain))throw Error('el monto de la operación no es válido.');
 const clean=(wrapped?'-':'')+plain.replace(/^(?:MXN|MX\$)\s*|\s*MXN$/gi,'').replace(/^([+-]?)\s*\$\s*/,'$1').replace(/^\+/,'');
 let normalized:string;
 if(/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(clean))normalized=clean.replace(/,/g,'');
 else if(/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(clean))normalized=clean.replace(/\./g,'').replace(',','.');
 else throw Error('el monto de la operación no es válido.');
 const amount=Number(normalized);
 if(!Number.isFinite(amount)||Math.abs(amount)>999999999)throw Error('el monto de la operación está fuera de rango.');
 return amount;
};
const date=(value:string,order:CsvMapping['dateOrder']='DMY',year?:string)=>{
 const printed=value.trim().replace(/[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s?(?:Z|[+-]\d{2}:?\d{2}|AM|PM))?$/i,'');
 const parts=/^(\d{1,2})([-/])(\d{1,2})\2(\d{4})$/.exec(printed);
 const ymd=/^(\d{4})([-/])(\d{1,2})\2(\d{1,2})$/.exec(printed);
 const named=namedBankDate(printed);
 const dateYear=named?.year||year;
 if(named&&!isBankCsvYear(dateYear))throw Error('la fecha del movimiento no trae año. Indica el año de las fechas del CSV.');
 const iso=named?dateYear+'-'+named.month.padStart(2,'0')+'-'+named.day.padStart(2,'0'):ymd?`${ymd[1]}-${ymd[3].padStart(2,'0')}-${ymd[4].padStart(2,'0')}`:parts?`${parts[4]}-${parts[order==='DMY'?3:1].padStart(2,'0')}-${parts[order==='DMY'?1:3].padStart(2,'0')}`:printed;
 const timestamp=Date.parse(iso+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!Number.isFinite(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==iso)throw Error('la fecha de la operación no es válida.');
 return iso;
};
export function bankStatement(text:string,files:CsvInput[]=[]):{incomes:BankMovement[];ignored:number;repeatedRows:number;invalidFolios:BankImportFolioIssue[]}|null{
 const lines=text.split(/\r\n|\n|\r/);
 const csv=lines.some(line=>csvHeader(line)!==null);
 const pdf=isMercadoPagoPdf(text);
 const structured=files.map(file=>readBankCsv(file,money,date));
 if(!csv&&!pdf&&!files.length){
  const candidate=recognizeBankCsvText(text);
  if(!candidate)return null;
  if(!csvIsReady(candidate.mapping)||candidate.ambiguousDate||candidate.needsYear)throw Error('Adjunta el CSV para confirmar sus columnas, el formato de fecha o el año.');
  structured.push(readBankCsv({...candidate,text},money,date));
 }
 const candidates:{day:string;description:string;reference:string;amount:string;quote:string;line?:number}[]=[];
 if(csv){
  let header:ReturnType<typeof csvHeader>=null,csvRows=0;
  for(let i=0;i<lines.length;i++){
   const line=field(lines[i]);
   if(!line)continue;
   const next=csvHeader(line);
   if(next){header=next;continue;}
   if(/^(?:CSV|PDF|Excel) .+:$|^ESTADO DE SALDOS Y MOVIMIENTOS\b|^sep=[;,\t]$|^["\s]*INITIAL_BALANCE["\s]*[;,\t]/i.test(line)){header=null;continue;}
   if(!header)continue;
   try{
    const parts=cells(line,header.separator);
    if(parts.length!==header.length)throw Error('las columnas no coinciden con el encabezado. Revisa el separador y conserva una columna para el folio.');
    const [day,description,reference,amount]=header.indices.map(index=>parts[index]);
    date(day);money(amount);
    if(!description)throw Error('falta la descripción de la operación.');
    candidates.push({day,description,reference,amount,quote:line,line:i+1});csvRows++;
   }catch(e){throw Error(`CSV, línea ${i+1}: ${(e as Error).message}`);}
  }
  if(!csvRows)throw Error('El CSV tiene encabezado, pero no contiene movimientos.');
 }
 if(pdf){
  const normalized=text.replace(/^\s*\d+\/\d+\s*$/gm,'').replace(/Fecha\s+Descripción\s+ID de la\s*operación\s+Valor\s+Saldo/g,'').replace(/Fecha de generación:[\s\S]*?mercadopago\.com\.mx\/c\/ifpetyc\./g,'').replace(/Transferencia\s+recibida\s+(\d{2}-\d{2}-\d{4})/g,'$1 Transferencia recibida');
  const pattern=/(\d{2}-\d{2}-\d{4})\s+((?:Transferencia|Ganancias?|Pago)[^;]*?)\s+(\d[\d\s]{7,50})\s+\$\s*(-?[\d,]+\.\d{2})\s+\$\s*-?[\d,]+\.\d{2}/g;
  for(const match of normalized.matchAll(pattern))candidates.push({day:match[1],description:match[2].replace(/\s+/g,' ').trim(),reference:match[3].replace(/\s/g,''),amount:match[4],quote:match[0]});
  // Never silently omit received transfers from a partially read PDF.
  const expected=(text.match(/Transferencia\s+recibida/gi)||[]).length;
  const actual=candidates.filter(c=>/^Transferencia\s+recibida\b/i.test(c.description)).length;
  if(actual<expected)throw Error('No se pudieron leer todas las transferencias del PDF. Prueba el CSV de Mercado Pago.');
 }
 const incomes:BankMovement[]=[],seen=new Map<string,string>(),invalidFolios:BankImportFolioIssue[]=[];let ignored=0,repeatedRows=0;
 const add=(movement:BankMovement)=>{
  const identity=JSON.stringify([movement.date,movement.amount]);
  if(seen.has(movement.reference)){
   if(seen.get(movement.reference)!==identity)throw Error('El mismo folio aparece con fecha o importe distintos en los archivos. Corrige esas filas y reintenta.');
   repeatedRows++;return;
  }
  seen.set(movement.reference,identity);incomes.push(movement);
 };
 for(const c of candidates){
  const amount=money(c.amount),day=date(c.day);
  if(amount<=0||!/^Transferencia\s+recibida\b/i.test(c.description)){ignored++;continue;}
  if(!/^\d{8,40}$/.test(c.reference))throw Error(c.line?`CSV, línea ${c.line}: el folio debe conservar sus dígitos originales. Evita volver a guardar el archivo en Excel si cambió el folio a notación científica.`:'Referencia bancaria inválida.');
  const payerName=c.description.replace(/^Transferencia\s+recibida\s*/i,'').trim();
  if(!payerName)throw Error('Hay una transferencia sin nombre de ordenante.');
  let sourceQuote=c.quote;
  if(!text.includes(sourceQuote)){
   const found=new RegExp(c.reference.split('').join('\\s*')).exec(text);
   if(!found)throw Error('No se pudo comprobar la referencia en el PDF original.');
   const dates=[...text.slice(0,found.index).matchAll(/\d{2}-\d{2}-\d{4}/g)];
   const start=dates[dates.length-1]?.index??found.index;
   const tail=/^[\s\S]*?\$\s*-?[\d,]+\.\d{2}\s+\$\s*-?[\d,]+\.\d{2}/.exec(text.slice(found.index+found[0].length));
   sourceQuote=text.slice(start,found.index+found[0].length+(tail?.[0].length||0));
  }
  add({payerName,amount,date:day,period:'',kind:'regular',concept:'Transferencia recibida · concepto por confirmar',reference:c.reference,paymentMethod:'transfer',sourceQuote});
 }
 structured.forEach((parsed,file)=>{ignored+=parsed.ignored;parsed.incomes.forEach(add);parsed.invalidFolios.forEach(issue=>invalidFolios.push({...issue,file}));});
 if(incomes.length>BANK_INCOME_LIMIT)throw Error(`Se detectaron ${incomes.length} transferencias. Importa hasta ${BANK_INCOME_LIMIT} por análisis, conservando el encabezado.`);
 return {incomes,ignored,repeatedRows,invalidFolios};
}
