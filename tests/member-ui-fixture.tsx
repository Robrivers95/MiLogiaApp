import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import MemberManagement, { MemberFilters } from '../components/MemberManagement';
import { searchMembers } from '../services/memberDirectory';
import type { User, Payment } from '../types';
const initialMembers = Array.from({length:137}, (_,index) => ({ uid: `test_${index}`, name:`Miembro ${String(index).padStart(3,'0')}`, email:`miembro${index}@example.test`, active:true, role:'member', groupId:'test', joinDate:'2026-09-01', profileEditable:true } as User));
const stats=Object.fromEntries(initialMembers.map(member=>[member.uid,{totalDebt:30,totalPaid:120,totalBilled:150}]));
(window as any).__historyRequests = 0;
(window as any).__exportedCount = 0;
const loadHistory=async () => { (window as any).__historyRequests++; return [{period:'2026-09',amount:100,extraAmount:50,extraDescription:'Evento legado',paid:120} as Payment]; };
function Fixture() {
 const [members,setMembers]=useState(initialMembers);
 const [filters,setFilters]=useState<MemberFilters>({query:'',sort:'name',role:'all',status:'active',start:'',end:''});
 const results=useMemo(()=>searchMembers(members.filter(member=>(filters.status==='all'||(filters.status==='active'?member.active:!member.active))&&(filters.role==='all'||member.role===filters.role)),filters.query,filters.sort,stats),[members,filters]);
 const currentUser={...members[136],role:'admin'} as User;
 return <div className="p-4 max-w-7xl mx-auto"><MemberManagement members={results} allMembers={members} currentUser={currentUser} stats={stats} statsLoading={false} readOnly={new URLSearchParams(location.search).has('readonly')} filters={filters} onFilters={change=>setFilters(previous=>({...previous,...change}))} actions={{edit:()=>{},payments:()=>{},advance:()=>{},link:()=>{},role:(uid,role)=>setMembers(previous=>previous.map(member=>member.uid===uid?{...member,role}:member)),status:async(uid)=>setMembers(previous=>previous.map(member=>member.uid===uid?{...member,active:!member.active,leaveDate:'2026-10-02'}:member))}} loadHistory={loadHistory} onCreate={()=>{}} onRequests={()=>{}} pendingCount={0} onExport={async()=>{(window as any).__exportedCount=results.length;}} onRefresh={async()=>{}} /></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
