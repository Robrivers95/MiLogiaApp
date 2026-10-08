import React from 'react';
import { createRoot } from 'react-dom/client';
import QuickFinance from '../components/QuickFinance';
import { quickFinanceService } from '../services/quickFinanceApi';
import type { TreasuryEntry, User } from '../types';
const params=new URLSearchParams(location.search);
const user={uid:'admin',role:params.get('role') || 'admin',active:true,groupId:'logia',name:'Administrador'} as User;
let entries: TreasuryEntry[]=[];
(window as any).__saves=0;(window as any).__applies=0;
quickFinanceService.options=async()=>({members:[{uid:'member',name:'Miembro de prueba'} as User],accounts:[{id:'cash',name:'Caja',amount:1000,type:'cash',groupId:'logia',lastUpdated:'2026-09-01',updatedBy:'admin'}]});
quickFinanceService.list=async()=>entries;
quickFinanceService.save=async(groupId,id,input,photo)=>{
  (window as any).__saves++;await new Promise(resolve=>setTimeout(resolve,200));
  if(!entries.some(entry=>entry.id===id))entries.push({...input,id,groupId,createdBy:'admin',createdAt:Date.now(),description:input.notes || 'Captura pendiente de completar',category:'otro',allocations:[{source:'tesoro_general',amount:input.amount}],quickStatus:'pending',memberName:'Miembro de prueba',receiptImageUrls:photo?['https://example.test/photo.jpg']:[]});
};
quickFinanceService.complete=async(_groupId,id,details)=>{entries=entries.map(entry=>entry.id===id?{...entry,...details,quickStatus:'completed'}:entry);};
quickFinanceService.payments=async()=>[{period:'2027-09',amount:500,paid:0,status:'Pendiente',comments:'',extraFees:[{id:'fee',description:'Cuota creada en febrero',amount:700,paid:0,createdAt:''}]}];
quickFinanceService.apply=async(_groupId,id,_uid,period,feeId)=>{(window as any).__applies++;entries=entries.map(entry=>entry.id===id?{...entry,quickStatus:'applied',appliedPeriod:period,appliedFeeId:feeId,memberName:'Miembro de prueba'}:entry);};
createRoot(document.getElementById('root')!).render(<div><h1>Mi Logia · pruebas de captura</h1><QuickFinance user={user} suspended={params.has('readonly')}/></div>);
