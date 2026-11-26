import type {BankMovement} from './meetingBankStatement';

export type CsvMapping = {
 reference:number;date:number;amount:number;payer:number;direction:number;
 mode:''|'signed'|'credit'|'typed';dateOrder:'DMY'|'MDY';
};
export type CsvInput={text:string;headerLine:number;separator:string;mapping:CsvMapping};
type CsvRow={cells:string[];line:number;raw:string};
const separators=[';',',','\t','|'];
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const aliases={
 reference:['folio','referencia','reference','reference id','reference number','bank reference','referencia bancaria','folio bancario','numero de referencia','clave de rastreo','clave rastreo','tracking key','tracking id','transaction id','id transaccion','id de transaccion','id de operacion','id operacion','numero de operacion','operation id','operation number','folio de la operacion','folio de operacion','folio de transferencia','referencia de la operacion','referencia de transferencia','numero de folio','numero folio','nro referencia','folio referencia','codigo de referencia','transaction reference','transfer reference','tracking number'],
 date:['fecha','date','release date','fecha operacion','fecha de operacion','fecha de la operacion','fecha del movimiento','fecha movimiento','fecha de pago','fecha aplicacion','fecha de aplicacion','fecha valor','transaction date','operation date','fecha y hora','fecha y hora de operacion','movement date','booking date','posting date','value date','fecha de deposito','fecha de transaccion'],
 amount:['transaction net amount','importe neto','monto neto','monto del movimiento','importe del movimiento','importe','monto','amount','transaction amount','net amount','importe mxn','monto mxn','abono','abonos','importe abono','monto abono','importe del abono','deposito','depositos','ingreso','ingresos','credito','credit','credits','credit amount','deposit amount','deposits'],
 payer:['ordenante','nombre del ordenante','nombre ordenante','pagador','payer','payer name','sender','sender name','remitente','nombre del remitente','contraparte','counterparty'],
 direction:['transaction type','tipo de movimiento','tipo movimiento','tipo','tipo de operacion','tipo operacion','tipo de transaccion','movement type','operation type','direction','naturaleza','descripcion','descripcion del movimiento','description','concepto'],
};
const currencyNames=['moneda','currency','currency code','codigo moneda','codigo de moneda'];
const creditNames=['abono','abonos','importe abono','monto abono','importe del abono','deposito','depositos','ingreso','ingresos','credito','credit','credits','credit amount','deposit amount','deposits'];
const signedNames=['transaction net amount','importe neto','monto neto','net amount'];
const fields=['reference','date','amount','payer','direction'] as const;
export const csvFields=fields;
const empty:CsvMapping={reference:-1,date:-1,amount:-1,payer:-1,direction:-1,mode:'',dateOrder:'DMY'};

// Preserve literal rows for evidence, including quoted separators and line breaks.
function parseRows(text:string,separator:string):CsvRow[]{
 const input=text.replace(/^\uFEFF/,'');
 const rows:CsvRow[]=[];let row:string[]=[],cell='',quoted=false,closed=false,line=1,startLine=1,start=0;
 const push=(end:number)=>{
  row.push(cell.trim());const raw=input.slice(start,end).trim();
  if(row.some(Boolean))rows.push({cells:row,line:startLine,raw});
  row=[];cell='';closed=false;
 };
 for(let i=0;i<input.length;i++){
  const c=input[i];
  if(quoted){
   if(c==='"'&&input[i+1]==='"'){cell+='"';i++;}
   else if(c==='"'){quoted=false;closed=true;}
   else{if(c==='\n'||c==='\r'&&input[i+1]!=='\n')line++;cell+=c;}
  }else if(c==='\n'||c==='\r'){
   push(i);if(c==='\r'&&input[i+1]==='\n')i++;
   line++;startLine=line;start=i+1;
  }else if(c===separator){row.push(cell.trim());cell='';closed=false;}
  else if(c==='"'&&!closed&&!cell.trim()){quoted=true;cell='';}
  else if(c==='"'||closed&&c.trim())throw Error(`CSV, línea ${line}: revisa las comillas o el separador de columnas.`);
  else if(!closed)cell+=c;
 }
 if(quoted)throw Error(`CSV, línea ${startLine}: hay un campo entre comillas sin cerrar.`);
 if(start<input.length)push(input.length);
 return rows;
}

function selectColumns(headers:string[]):CsvMapping{
 const result={...empty},names=headers.map(norm);
 for(const field of fields){
  const positions=names.flatMap((name,i)=>aliases[field].includes(name)?[i]:[]);
  if(field==='amount'){
   const credit=positions.filter(i=>creditNames.includes(names[i]));
   if(credit.length===1){result.amount=credit[0];result.mode='credit';continue;}
  }
  if(positions.length===1)result[field]=positions[0];
 }
 if(result.amount>=0&&!result.mode){
  if(signedNames.includes(names[result.amount])&&result.direction===-1)result.mode='signed';
  else if(result.direction>=0)result.mode='typed';
 }
 return result;
}

export function inspectBankCsv(text:string,headerLine?:number,preferred?:string){
 const options:{headers:string[];headerLine:number;separator:string;mapping:CsvMapping;sample:string[];score:number;ambiguousDate:boolean}[]=[];
 let detail='';
 for(const separator of preferred?[preferred]:separators){
  if(!separators.includes(separator))continue;
  try{
   const data=parseRows(text,separator);
   for(let i=0;i<Math.min(50,data.length);i++){
    const h=data[i],next=data[i+1];
    if(headerLine!==undefined&&h.line!==headerLine)continue;
    if(!next||h.cells.length<3||h.cells.length>100||h.raw.toLowerCase().startsWith('sep='))continue;
    const mapping=selectColumns(h.cells);
    let ambiguousDate=false;
    if(mapping.date>=0){
     const samples=data.slice(i+1,i+31).filter(r=>r.cells.length===h.cells.length).map(r=>/^(\d{1,2})[/-](\d{1,2})[/-]\d{4}(?=\s|T|$)/.exec(r.cells[mapping.date]));
     const mdy=samples.some(d=>d&&Number(d[1])<=12&&Number(d[2])>12);
     const dmy=samples.some(d=>d&&Number(d[1])>12&&Number(d[2])<=12);
     if(mdy&&!dmy)mapping.dateOrder='MDY';
     const originalMercadoPago=['release date','transaction net amount','reference id','transaction type'].every(name=>h.cells.map(norm).includes(name));
     ambiguousDate=!originalMercadoPago&&(mdy===dmy)&&samples.some(d=>d&&Number(d[1])!==Number(d[2]));

    }
    const matches=fields.filter(k=>mapping[k]>=0).length;
    const core=['reference','date','amount'].filter(k=>mapping[k as 'reference']>=0).length;
    const sameWidth=data.slice(i+1,i+5).filter(r=>r.cells.length===h.cells.length).length;
    const score=core*100+matches*10+Math.min(sameWidth,4)*4+(h.cells.some(c=>/[A-Za-zÀ-ÿ]/.test(c))?3:0)-i*.01;
    options.push({headers:h.cells,headerLine:h.line,separator,mapping,sample:next.cells,score,ambiguousDate});
   }
  }catch(e){detail=(e as Error).message;}
 }
 const best=options.sort((a,b)=>b.score-a.score)[0];
 if(!best)throw Error(detail||'No encontré un encabezado seguido de filas. El CSV necesita columnas de folio, fecha e importe.');
 return best;
}
// Pasted plain prose should never open the column picker. For pasted tables
// require recognizable financial headings; uploaded CSVs always allow mapping.
export function recognizeBankCsvText(text:string){
 if(!/[\r\n]/.test(text)||!/[;,\t|]/.test(text))return null;
 let candidate:ReturnType<typeof inspectBankCsv>;
 try{candidate=inspectBankCsv(text);}catch{return null;}
 const {reference,date,amount}=candidate.mapping;
 if([reference,date,amount].filter(i=>i>=0).length>=2)return candidate;
 // Also catch ambiguous aliases such as 'Fecha operación' and 'Fecha valor'
 // without interpreting free-form descriptions as arbitrary notes.
 const names=candidate.headers.map(norm);
 return ['reference','date','amount'].filter(k=>names.some(n=>aliases[k as 'reference'].includes(n))).length>=2?candidate:null;
}
export const csvIsReady=(m:CsvMapping)=>{
 const columns=fields.map(k=>m[k]).filter(i=>i>=0);
 return m.reference>=0&&m.date>=0&&m.amount>=0&&!!m.mode&&(m.mode!=='typed'||m.direction>=0)&&new Set(columns).size===columns.length;
};

export function readBankCsv(input:CsvInput,money:(s:string)=>number,date:(s:string,order?:CsvMapping['dateOrder'])=>string):{incomes:BankMovement[];ignored:number}{
 const {text,headerLine,separator,mapping:m}=input;
 if(!separators.includes(separator)||!Number.isInteger(headerLine)||headerLine<1||!m||!['signed','credit','typed'].includes(m.mode)||!['DMY','MDY'].includes(m.dateOrder)||!csvIsReady(m))throw Error('Selecciona las columnas de folio, fecha e importe y cómo identificar los abonos.');
 const rows=parseRows(text,separator),index=rows.findIndex(r=>r.line===headerLine),header=rows[index]?.cells;
 if(!header||!rows[index+1]||header.length<3||header.length>100)throw Error('El encabezado seleccionado no tiene movimientos debajo.');
 const chosen=fields.map(k=>m[k]);
 const selected=chosen.filter(n=>n>=0);
 if(chosen.some(n=>!Number.isInteger(n)||n< -1||n>=header.length)||new Set(selected).size!==selected.length)throw Error('Elige una columna distinta para cada dato del CSV.');
 const names=header.map(norm);
 const currencyColumn=names.findIndex(name=>currencyNames.includes(name));
 const incomes:BankMovement[]=[];let ignored=0;
 for(const row of rows.slice(index+1)){
  if(row.cells.length===names.length&&row.cells.every((c,i)=>norm(c)===names[i]))continue;
  try{
   if(row.cells.length!==names.length)throw Error('el número de columnas no coincide con el encabezado.');
   const direction=row.cells[m.direction]||'',label=norm(direction);
   const raw=row.cells[m.amount];
   if(m.mode==='credit'&&!raw){ignored++;continue;}
   const amount=money(raw);
   if(amount<=0){ignored++;continue;}
   if(m.mode==='typed'){
    const income=/\b(?:abono|abonos|deposito|depositos|credito|credit|ingreso|income|deposit|transferencia (?:recibida|entrante)|traspaso (?:recibido|entrante)|pago recibido|spei (?:recibido|entrante)|incoming|received|haber)\b/.test(label);
    const outgoing=/\b(?:devolucion|reembolso|reversal|refund|devuelto|reverso|cargo|cargos|debito|debit|compra|comision|egreso|retiro|withdrawal|transferencia enviada|spei enviado|enviada|enviado|outgoing|sent|saldo|ganancia|ganancias|rendimiento|interes|intereses|interest)\b/.test(label);
    if(outgoing){ignored++;continue;}
    if(!income)throw Error(`no pude distinguir si es un abono o cargo. Selecciona una columna de abonos o un importe con signo.`);
   }
   const currency=row.cells[currencyColumn];
   if(currency&&!['mxn','mxp','pesos','peso mexicano','pesos mexicanos','484'].includes(norm(currency)))throw Error('la moneda del abono no es MXN. Importa los pagos en pesos mexicanos por separado.');
   const reference=row.cells[m.reference];
   if(!reference||reference.length>180||/[\x00-\x1f\x7f]/.test(reference)||/^[-+]?\d+(?:[.,]\d+)?e[+-]?\d+$/i.test(reference))throw Error('el folio falta o no conserva su formato original. Guárdalo como texto, sin notación científica.');
   const bankDate=date(row.cells[m.date],m.dateOrder);
   const recognizedPayer=/^(?:transferencia\s+(?:recibida|entrante)|pago\s+recibido|spei\s+(?:recibido|entrante)|traspaso\s+(?:recibido|entrante))\s*[:–—-]?\s+(.+)$/i.exec(direction);
   const payerName=row.cells[m.payer]||recognizedPayer?.[1]?.trim()||'';
   incomes.push({payerName,amount,date:bankDate,period:'',kind:'regular',concept:'Transferencia recibida · concepto por confirmar',reference,paymentMethod:'transfer',sourceQuote:row.raw});
  }catch(e){throw Error(`CSV, línea ${row.line}: ${(e as Error).message}`);}
 }
 return {incomes,ignored};
}
