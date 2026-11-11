// Mercado Pago exports: preserve operation IDs, dates and amounts exactly.
export interface BankMovement {payerName:string;amount:number;date:string;period:string;kind:string;concept:string;reference:string;paymentMethod:string;sourceQuote:string;}
const money=(s:string)=>{const clean=s.replace(/\$/g,'').trim();if(!/^-?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/.test(clean))throw Error('Monto bancario inválido.');return Number(clean.replace(/,/g,''));};
const date=(s:string)=>{const [d,m,y]=s.split('-');const value=`${y}-${m}-${d}`;if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error('Fecha bancaria inválida.');return value;};
export function bankStatement(text:string):{incomes:BankMovement[];ignored:number}|null{
 const csv=/RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE/i.test(text);
 const pdf=/ESTADO DE SALDOS Y MOVIMIENTOS/i.test(text)&&/Mercado\s+Pago/i.test(text);
 if(!csv&&!pdf)return null;
 const candidates:{day:string;description:string;reference:string;amount:string;quote:string}[]=[];
 if(csv){
  for(const line of text.split(/\r?\n/)){
   const parts=line.trim().split(';').map(s=>s.trim().replace(/^"(.*)"$/,'$1'));
   if(parts.length!==5||!/^\d{2}-\d{2}-\d{4}$/.test(parts[0]))continue;
   // Validate every row, including excluded outgoing transfers and returns.
   date(parts[0]);money(parts[3]);money(parts[4]);
   candidates.push({day:parts[0],description:parts[1],reference:parts[2],amount:parts[3],quote:line.trim()});
  }
  if(!candidates.length)throw Error('No se encontraron movimientos válidos en el CSV.');
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
 const incomes:BankMovement[]=[],seen=new Map<string,string>();let ignored=0;
 for(const c of candidates){
  const amount=money(c.amount),day=date(c.day);
  if(amount<=0||!/^Transferencia\s+recibida\b/i.test(c.description)){ignored++;continue;}
  if(!/^\d{8,40}$/.test(c.reference))throw Error('Referencia bancaria inválida.');
  const payerName=c.description.replace(/^Transferencia\s+recibida\s*/i,'').trim();
  if(!payerName)throw Error('Hay una transferencia sin nombre de ordenante.');
  const identity=JSON.stringify([payerName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase(),day,amount]);
  if(seen.has(c.reference)){if(seen.get(c.reference)!==identity)throw Error('La misma referencia aparece con datos distintos. Revisa los archivos.');continue;}
  seen.set(c.reference,identity);
  let sourceQuote=c.quote;
  if(!text.includes(sourceQuote)){
   const found=new RegExp(c.reference.split('').join('\\s*')).exec(text);
   if(!found)throw Error('No se pudo comprobar la referencia en el PDF original.');
   const dates=[...text.slice(0,found.index).matchAll(/\d{2}-\d{2}-\d{4}/g)];
   const start=dates[dates.length-1]?.index??found.index;
   const tail=/^[\s\S]*?\$\s*-?[\d,]+\.\d{2}\s+\$\s*-?[\d,]+\.\d{2}/.exec(text.slice(found.index+found[0].length));
   sourceQuote=text.slice(start,found.index+found[0].length+(tail?.[0].length||0));
  }
  incomes.push({payerName,amount,date:day,period:'',kind:'regular',concept:'Transferencia recibida · concepto por confirmar',reference:c.reference,paymentMethod:'transfer',sourceQuote});
 }
 if(incomes.length>30)throw Error('Hay más de 30 ingresos. Divide el estado de cuenta en varios análisis.');
 return {incomes,ignored};
}
