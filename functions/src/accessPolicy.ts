export interface RecoveryProfile {role?:string;groupId?:string;active?:boolean;}
export function mayRecover(actor:RecoveryProfile,target:RecoveryProfile,actorId:string,targetId:string,groupId:string){
  return !!groupId && actor.active!==false && actorId!==targetId && ['admin','master'].includes(actor.role || '') && (actor.role==='master' || actor.groupId===groupId) && target.groupId===groupId && target.role!=='master' && (actor.role==='master' || target.role==='member' || target.role==='viewer');
}
export function validNewPassword(value:unknown):value is string{return typeof value==='string' && value.length>=10 && value.length<=128 && /[A-Za-z]/.test(value) && /[0-9]/.test(value) && !/[\r\n\0]/.test(value);}
