import type {User} from '../types';
const words=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(t=>t.length>1&&!['transferencia','recibida','pago','spei','banco','cuota','cuotas','de','del','la','el','por','mxn','sr','senor','hno','hermano'].includes(t)&&!/^\d+$/.test(t));
export function incomeMemberCandidates(observed:string,members:User[]){
 const wanted=[...new Set(words(observed))];if(!wanted.length)return [];
 return members.map(member=>{const tokens=words(member.name),common=wanted.filter(t=>tokens.includes(t)).length;return {member,common,score:common/Math.max(wanted.length,tokens.length)};}).filter(c=>c.common>=2).sort((a,b)=>b.score-a.score||b.common-a.common||a.member.name.localeCompare(b.member.name,'es')).slice(0,5).map(c=>c.member);
}
export const incomeSearchText=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
