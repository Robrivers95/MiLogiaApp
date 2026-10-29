export const incomeName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
export function incomeRows(output: any, roster: {id:string;name:string}[], text: string, hasImages: boolean) {
  if (!Array.isArray(output?.incomes) || output.incomes.length > 30) throw Error('La respuesta debe contener hasta 30 ingresos separados.');
  return (output.incomes as any[]).map((row: any) => {
    const str=(key:string,max=1000)=>typeof row?.[key]==='string'?row[key].trim().slice(0,max):'';
    const payerName=str('payerName',180), quote=str('sourceQuote'), tokens=incomeName(payerName).split(' ').filter(t=>t.length>1);
    const matches=tokens.length?roster.filter(p=>tokens.every(t=>incomeName(p.name).split(' ').includes(t))):[];
    const amount=Number(row?.amount), warnings: string[]=[];
    if (!hasImages && (!quote || !text.includes(quote))) throw Error('No se pudo comprobar un movimiento en el texto original.');
    if (matches.length!==1) warnings.push(matches.length?'Nombre ambiguo: selecciona al hermano.':'Sin coincidencia segura: selecciona al hermano.');
    if (!Number.isFinite(amount)||amount<=0||amount>999999999||Math.abs(amount*100-Math.round(amount*100))>.00001) warnings.push('Revisa el monto.');
    const period=/^\d{4}-(0[1-9]|1[0-2])$/.test(str('period'))?str('period'):'';
    if (!period) warnings.push('Selecciona el mes y año de aplicación.');
    const date=str('date',10);let validDate='';try {if (/^\d{4}-\d{2}-\d{2}$/.test(date)&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date)validDate=date;}catch{}
    if (!validDate) warnings.push('Selecciona la fecha del ingreso.');
    return {payerName,memberId:matches.length===1?matches[0].id:'',amount:Number.isFinite(amount)&&amount>0?Math.round(amount*100)/100:0,date:validDate,period,kind:['regular','extra','other'].includes(row?.kind)?row.kind:'regular',concept:str('concept',250),reference:str('reference',180),paymentMethod:['cash','card','transfer'].includes(row?.paymentMethod)?row.paymentMethod:'transfer',sourceQuote:quote,warnings};
  });
}
