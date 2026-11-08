export interface StatementExpense {reference:string;date:string;amount:number;description:string;sourceQuote:string;}
export function statementExpenses(text:string):StatementExpense[]{
 const csv=/RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE/i.test(text);
 const pdf=/ESTADO DE SALDOS Y MOVIMIENTOS/i.test(text)&&/Mercado\s+Pago/i.test(text);
 if(!csv&&!pdf)throw Error('Para detectar gastos usa el CSV o un PDF legible de Mercado Pago. También puedes registrar otro formato desde Nueva captura.');
 const candidates:{day:string;description:string;reference:string;amount:string;quote:string}[]=[];
 if(csv)for(const line of text.split(/\r?\n/)){
  const parts=line.trim().split(';').map(s=>s.trim().replace(/^"(.*)"$/,'$1'));
  if(parts.length===5&&/^\d{2}-\d{2}-\d{4}$/.test(parts[0]))candidates.push({day:parts[0],description:parts[1],reference:parts[2],amount:parts[3],quote:line});
 }
 if(pdf){
  const normalized=text.replace(/^\s*\d+\/\d+\s*$/gm,'').replace(/Fecha\s+Descripción\s+ID de la\s*operación\s+Valor\s+Saldo/g,'').replace(/Fecha de generación:[\s\S]*?mercadopago\.com\.mx\/c\/ifpetyc\./g,'');
  const pattern=/(\d{2}-\d{2}-\d{4})\s+((?:(?!\d{2}-\d{2}-\d{4})[^;])*?)\s+(\d[\d\s]{7,50})\s+\$\s*(-?[\d,]+\.\d{2})\s+\$\s*-?[\d,]+\.\d{2}/g;
  for(const m of normalized.matchAll(pattern))candidates.push({day:m[1],description:m[2].replace(/\s+/g,' ').trim(),reference:m[3].replace(/\s/g,''),amount:m[4],quote:m[0]});
 }
 if(!candidates.length)throw Error('No se pudieron leer los movimientos. Usa el CSV original de Mercado Pago.');
 const rows:StatementExpense[]=[],seen=new Map<string,string>();
 for(const c of candidates){
  if(!/^-?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/.test(c.amount))throw Error('Revisa el importe de una fila bancaria.');
  const signed=Number(c.amount.replace(/,/g,''));if(signed>=0)continue;
  const [d,m,y]=c.day.split('-'),date=`${y}-${m}-${d}`;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||!/^\d{8,40}$/.test(c.reference))throw Error('Revisa fecha y referencia de la salida bancaria.');
  const identity=JSON.stringify([date,-signed,c.description]);
  if(seen.has(c.reference)){if(seen.get(c.reference)!==identity)throw Error('La misma referencia de gasto tiene datos distintos.');continue;}
  seen.set(c.reference,identity);rows.push({reference:c.reference,date,amount:-signed,description:c.description,sourceQuote:c.quote});
 }
 if(rows.length>60)throw Error('Divide el estado de cuenta en bloques de hasta 60 salidas.');
 return rows;
}
