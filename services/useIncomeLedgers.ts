import {useEffect,useState} from 'react';
import type {Payment} from '../types';
import {incomeCaptureApi} from './incomeCaptureApi';
export function useIncomeLedgers(groupId:string,memberIds:string[],version:number){
 const [ledgers,setLedgers]=useState<Record<string,Payment[]>>({}),[errors,setErrors]=useState<Record<string,string>>({});
 const ids=[...new Set(memberIds.filter(Boolean))].sort(),key=ids.join('|');
 useEffect(()=>{setLedgers({});setErrors({});},[groupId,version]);
 useEffect(()=>{
  let active=true;
  for(const id of ids)void incomeCaptureApi.payments(groupId,id).then(rows=>{if(active)setLedgers(old=>({...old,[id]:rows}));}).catch(e=>{if(active)setErrors(old=>({...old,[id]:e.message||'No se pudieron cargar las cuotas.'}));});
  return ()=>{active=false;};
 },[groupId,key,version]);
 return {ledgers,errors};
}
