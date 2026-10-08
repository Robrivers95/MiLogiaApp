import type { FinanceProject, Payment, TreasuryEntry, User } from '../types';
import { countsInTreasury } from './quickFinance';

const cents = (value: unknown) => {
  const n=Number(value);return Number.isFinite(n) && n>0 ? Math.round(n*100) : 0;
};
const key = (value: string) => value.trim().toLocaleLowerCase('es-MX');
export const validReportPeriod = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export const reportPeriod = (entry: TreasuryEntry, basis: 'quota'|'date'='quota') => {
  const period=basis==='quota' && entry.quotaPeriod ? entry.quotaPeriod : (entry.date || '').slice(0,7);
  return validReportPeriod(period) ? period : '';
};
export const reportClass = (entry: TreasuryEntry) => entry.quotaKind || (entry.type==='income' ? 'other' : 'expense');
export const reportClassLabel = (entry: TreasuryEntry) => ({regular:'Cuota normal',extra:'Cuota extraordinaria',unclassified:'Cuota sin desglose',other:'Otro ingreso',expense:'Gasto'}[reportClass(entry)]);
export const reportConcept = (entry: TreasuryEntry) => entry.quotaConcept || entry.description;
export const reportCategoryLabel = (entry: TreasuryEntry) => entry.quotaKind ? reportClassLabel(entry) : entry.category.replace(/_/g,' ');
export const reportProjects = (entry: TreasuryEntry) => entry.reportProjects?.length ? entry.reportProjects : entry.projectId ? [{id:entry.projectId,name:entry.projectName || entry.projectId}] : [];

/** Read-only breakdown. Never infer an extraordinary project's identity from its month. */
export function quotaReportRows(member: Pick<User,'uid'|'name'>, source: Payment, groupId: string, projects: FinanceProject[]=[]): TreasuryEntry[] {
  if(source.groupId && source.groupId!==groupId)return [];
  const total=cents(source.paid);
  if(total<=0)return [];
  const fees=source.extraFees?.length ? source.extraFees : [];
  const knownExtra=fees.length ? fees.reduce((sum,fee)=>sum+cents(fee.paid),0) : source.paidExtra===undefined ? undefined : cents(source.paidExtra);
  const regular=source.paidRegular === undefined ? knownExtra===undefined ? Math.min(total,cents(source.amount)) : Math.min(Math.max(0,total-knownExtra),cents(source.amount)) : cents(source.paidRegular);
  const extra=knownExtra===undefined ? (cents(source.extraAmount)>0 || source.extraDescription ? Math.max(0,total-regular) : 0) : knownExtra;
  const base={groupId,date:source.paymentDate ? source.paymentDate.slice(0,10) : 'Sin fecha',type:'income' as const,createdBy:member.uid,createdAt:0,quotaPeriod:source.period,memberId:member.uid,memberName:member.name};
  const build=(kind: TreasuryEntry['quotaKind'],amount: number,concept: string,id: string,note?: string): TreasuryEntry => {
    const matches=kind==='extra' ? projects.filter(project=>(!project.groupId || project.groupId===groupId) && project.linkedExtraConcepts?.some(value=>key(value)===key(concept))) : [];
    return {...base,id:`quota_${encodeURIComponent(member.uid)}_${source.period}_${kind}_${encodeURIComponent(id)}`,category:kind==='extra'?'cuota_extra':'otro',quotaKind:kind,quotaConcept:concept,...(kind==='extra'?{quotaFeeId:id}:{}),description:`${concept} · ${member.name} · ${source.period}`,amount:amount/100,allocations:[{source:'cuotas',amount:amount/100}],reportProjects:matches.map(project=>({id:project.id,name:project.name})),reportNote:note || 'Acumulado del mes en la matriz de pagos; no representa un depósito individual.'};
  };
  if(regular+extra>total)return [build('unclassified',total,'Cuota sin desglose','total','El desglose guardado excede el total pagado. Se conserva el total original; revisa la matriz de pagos.')];
  const rows: TreasuryEntry[]=[];
  if(regular>0)rows.push(build('regular',regular,'Cuota normal','regular'));
  if(fees.length)fees.forEach((fee,index)=>{const paid=cents(fee.paid);if(paid>0)rows.push({...build('extra',paid,fee.description || 'Cuota extraordinaria',`${fee.id || 'extra'}-${index}`,fee.forgiven?'Abono voluntario a cuota perdonada; acumulado del mes en la matriz de pagos.':undefined),quotaFeeId:fee.id});});
  else if(extra>0)rows.push(build('extra',extra,source.extraDescription || 'Cuota extraordinaria','legacy'));
  const remainder=total-regular-extra;
  if(remainder>0)rows.push(build('unclassified',remainder,'Cuota sin desglose','remainder','El total pagado incluye un importe sin desglose suficiente. Se conserva sin asignarlo a un concepto ni proyecto.'));
  return rows;
}

export interface TreasuryReportFilters {
  year: string; month: string; basis: 'quota'|'date'; direction: 'all'|'income'|'expense';
  incomeClass: 'all'|'regular'|'extra'|'other'|'unclassified'; concept: string; project: string; search: string;
}
export const emptyTreasuryFilters = (): TreasuryReportFilters => ({year:'',month:'',basis:'quota',direction:'all',incomeClass:'all',concept:'',project:'',search:''});
export function filterTreasuryReport(entries: TreasuryEntry[],filters: TreasuryReportFilters) {
  const search=key(filters.search);
  return entries.filter(countsInTreasury).filter(entry=>{
    const period=reportPeriod(entry,filters.basis);
    if(filters.year && !period.startsWith(`${filters.year}-`))return false;
    if(filters.month && period!==filters.month)return false;
    if(filters.direction!=='all' && entry.type!==filters.direction)return false;
    if(filters.incomeClass!=='all' && reportClass(entry)!==filters.incomeClass)return false;
    if(filters.concept && (entry.quotaKind!=='extra' || key(reportConcept(entry))!==key(filters.concept)))return false;
    const projects=reportProjects(entry);
    if(filters.project==='unlinked' && projects.length)return false;
    if(filters.project && filters.project!=='unlinked' && !projects.some(project=>project.id===filters.project))return false;
    return !search || key([entry.memberName || '',reportConcept(entry),entry.description,...projects.map(project=>project.name)].join(' ')).includes(search);
  }).sort((a,b)=>reportPeriod(b,filters.basis).localeCompare(reportPeriod(a,filters.basis)) || (a.memberName || '').localeCompare(b.memberName || '','es') || Number(a.quotaKind!=='regular')-Number(b.quotaKind!=='regular') || reportConcept(a).localeCompare(reportConcept(b),'es') || a.id.localeCompare(b.id));
}
export function treasuryReportTotals(entries: TreasuryEntry[]) {
  let income=0,expense=0,regular=0,extra=0;
  for(const entry of entries){if(!countsInTreasury(entry))continue;const amount=cents(entry.amount);if(entry.type==='expense')expense+=amount;else{income+=amount;if(entry.quotaKind==='regular')regular+=amount;if(entry.quotaKind==='extra')extra+=amount;}}
  return {income:income/100,expense:expense/100,regular:regular/100,extra:extra/100,balance:(income-expense)/100};
}
const csvCell = (value: string) => {
  // Excel must treat all textual fields as text, including member-entered notes.
  const text=/^[\s]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${text.replace(/"/g,'""')}"`;
};
export function treasuryReportCsv(entries: TreasuryEntry[],basis:'quota'|'date'='quota') {
  const header=['Mes','Mes de cuota','Fecha de registro','Tipo','Clase','Categoría','Miembro','Concepto','Proyecto','Monto','Tesoro general','Beneficencia','Fondo cuotas','Observaciones'];
  const lines=entries.filter(countsInTreasury).map(entry=>{
    const funds=(source: string)=>((entry.allocations?.length ? entry.allocations : [{source:(entry as any).source || 'tesoro_general',amount:entry.amount}]).filter(allocation=>allocation.source===source).reduce((sum,allocation)=>sum+cents(allocation.amount),0)/100).toFixed(2);
    const fields=[reportPeriod(entry,basis) || 'Sin mes',entry.quotaPeriod || '',entry.date,entry.type==='income'?'Ingreso':'Gasto',reportClassLabel(entry),reportCategoryLabel(entry),entry.memberName || '',reportConcept(entry),reportProjects(entry).map(project=>project.name).join(' / ')].map(csvCell);
    return [...fields,(cents(entry.amount)/100).toFixed(2),funds('tesoro_general'),funds('beneficencia'),funds('cuotas'),csvCell(entry.reportNote || entry.notes || '')].join(',');
  });
  return '\uFEFF'+[header.map(csvCell).join(','),...lines].join('\r\n');
}
