import WhatsAppReminders from '../components/WhatsAppReminders';
import { debtReminder } from '../services/whatsappReminders';
import ExistingFeeAssignment from '../components/ExistingFeeAssignment';
import { existingFeeTemplates, assignExistingFee } from '../services/extraFeeLifecycle';
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import MemberManagement, { MemberFilters } from '../components/MemberManagement';
import { searchMembers } from '../services/memberDirectory';
import type { User, Payment, PaymentReceipt } from '../types';
const initialMembers = Array.from({length:137}, (_,index) => ({ uid: `test_${index}`, name:`Miembro ${String(index).padStart(3,'0')}`, email:`miembro${index}@example.test`, active:true, role:'member', groupId:'test', joinDate:'2026-09-01', profileEditable:true } as User));
const stats=Object.fromEntries(initialMembers.map(member=>[member.uid,{totalDebt:30,totalPaid:120,totalBilled:150}]));
(window as any).__historyRequests = 0;
(window as any).__exportedCount = 0;
const loadHistory=async () => { (window as any).__historyRequests++; return [{period:'2026-09',amount:100,extraAmount:50,extraDescription:'Evento legado',paid:120,adminReceiptUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9l8AAAAASUVORK5CYII=',paymentDate:'2026-09-10'} as Payment]; };
const loadReceipts = async (uid: string) => {
 (window as any).__receiptRequests = ((window as any).__receiptRequests || 0)+1;
 if (new URLSearchParams(location.search).has('receipt-error')) throw new Error('offline');
 return [{id:'r1',userId:uid,groupId:'test',userName:uid,periods:['2026-09','2026-08'],transferDate:'2026-09-09',submittedAt:'2026-09-09',receiptType:'cuota_mensual',status:'pending',amount:75,receiptImageUrl:'https://example.test/proof.pdf',receiptImageUrls:['https://example.test/proof.pdf','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9l8AAAAASUVORK5CYII=']} as PaymentReceipt];
};
function Fixture() {
 const [members,setMembers]=useState(initialMembers);
 const [,setTick]=useState(0);
 useEffect(()=>{(window as any).__rerender=()=>setTick(value=>value+1);return ()=>{delete (window as any).__rerender;};},[]);
 const [assignmentLedgers,setAssignmentLedgers]=useState<Record<string,Payment[]>>({test_0:[{period:'2026-09',amount:0,paid:0,status:'Pagado',comments:'',extraFees:[{id:'event',description:'Evento perdonado',amount:2000,paid:0,forgiven:true,createdAt:''},{id:'dinner',description:'Cena',amount:500,paid:0,createdAt:''}]}]});

 const [filters,setFilters]=useState<MemberFilters>({query:'',sort:'name',role:'all',status:'active',start:'',end:''});
 const results=useMemo(()=>searchMembers(members.filter(member=>(filters.status==='all'||(filters.status==='active'?member.active:!member.active))&&(filters.role==='all'||member.role===filters.role)),filters.query,filters.sort,stats),[members,filters]);
 const currentUser={...members[136],role:'admin'} as User;
 if(new URLSearchParams(location.search).has('whatsapp')) {
   const role=new URLSearchParams(location.search).get('role') || 'admin';
   return <div className="p-4 max-w-3xl mx-auto"><WhatsAppReminders user={{...currentUser,role:role as User['role']}} suspended={new URLSearchParams(location.search).has('suspended')}
     prepare={async()=>{(window as any).__prepared=((window as any).__prepared || 0)+1;return {groupName:'Logia Prueba',calculatedAt:new Date().toISOString(),recipients:[
       {member:{...members[0],name:'José Ríos',phoneNumber:'528112345678',whatsappRemindersAllowed:true},reminder:debtReminder([{period:'2026-09',amount:100,paid:40} as Payment],'test','2026-10')},
       {member:{...members[1],name:'Ana López',phoneNumber:'',whatsappRemindersAllowed:false},reminder:debtReminder([{period:'2026-09',amount:200,paid:0} as Payment],'test','2026-10')}
     ]};}}
     saveContact={async(uid,phone,permitted)=>{(window as any).__saved={uid,phone,permitted};}} /></div>;
 }
 if(new URLSearchParams(location.search).has('assignment')) return <div className="p-4 max-w-3xl mx-auto"><ExistingFeeAssignment templates={existingFeeTemplates(assignmentLedgers,[],2026)} members={members} ledgers={assignmentLedgers} initialConcept="Evento perdonado" onClose={()=>{}} onAssign={async(template,uids)=>{const updated={...assignmentLedgers};let created=0,skipped=0;for(const uid of uids){const payment=assignExistingFee(updated[uid]?.find(row=>row.period===template.period),template,'admin','2026-10-03');if(payment){updated[uid]=[payment];created++;}else skipped++;}setAssignmentLedgers(updated);(window as any).__assignmentLedgers=updated;return {created,skipped,failed:[]};}} /></div>;

 return <div className="p-4 max-w-7xl mx-auto"><MemberManagement members={results} allMembers={members} currentUser={currentUser} stats={stats} statsLoading={false} readOnly={new URLSearchParams(location.search).has('readonly')} filters={filters} onFilters={change=>setFilters(previous=>({...previous,...change}))} actions={{edit:()=>{},payments:()=>{},advance:()=>{},link:()=>{},role:(uid,role)=>setMembers(previous=>previous.map(member=>member.uid===uid?{...member,role}:member)),status:async(uid)=>setMembers(previous=>previous.map(member=>member.uid===uid?{...member,active:!member.active,leaveDate:'2026-10-02'}:member))}} loadHistory={loadHistory} loadReceipts={loadReceipts} onCreate={()=>{}} onRequests={()=>{}} pendingCount={0} onExport={async()=>{(window as any).__exportedCount=results.length;}} onRefresh={async()=>{}} /></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
