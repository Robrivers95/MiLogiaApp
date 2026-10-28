import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import {chromium,webkit,devices} from 'playwright';

const api=`
const params=new URLSearchParams(location.search);
window.__member={uid:'brother',name:'Hermano Prueba',email:'hermano@example.test',role:'member',active:false,groupId:'lodge',joinDate:'2026-01-01'};
window.__statusWrites=[];window.__failStatus=params.has('error');if(params.has('reactivation'))window.__member.leaveDate='2026-08-01';
const methods={
 getUsers:async()=>[structuredClone(window.__member)],getUserFinancialStats:async()=>({totalDebt:0,totalPaid:0,totalBilled:0}),
 getGlobalFinancials:async()=>({income:0,expense:0}),getAllPaidQuotas:async()=>0,
 changeMemberStatus:async(groupId,uid,active,date)=>{window.__statusWrites.push({groupId,uid,active,date});await new Promise(r=>setTimeout(r,60));if(window.__failStatus){const e=new Error('denied');e.code='permission-denied';throw e;}window.__member={...window.__member,active,masonicRejoinDate:date};delete window.__member.leaveDate;}
};
export const dataService=new Proxy(methods,{get:(target,key)=>target[key] || (async()=>[])});
export const authService={},notificationService={},generateTriviaWithAI=async()=>[];
`;
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Admin from './components/Admin';import {ReadOnlyProvider} from './contexts/ReadOnlyContext';const params=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(<ReadOnlyProvider value={params.has('suspended')}><Admin user={{uid:'actor',name:'Administrador',role:params.get('role') || 'master',active:true,groupId:'lodge',joinDate:'2026-01-01'}}/></ReadOnlyProvider>);`,loader:'tsx',resolveDir:process.cwd()},outfile:'tests/admission-browser.js',bundle:true,format:'esm',plugins:[{name:'isolated-admission',setup(builder){
 builder.onResolve({filter:/\/adminNavigation$/},()=>({path:process.cwd()+'/components/adminNavigation.ts'}));
 builder.onResolve({filter:/\/api$/},()=>({path:'api',namespace:'mock'}));
 builder.onResolve({filter:/\/firebase$/},()=>({path:'config',namespace:'mock'}));
 builder.onResolve({filter:/^firebase\/firestore$/},()=>({path:'firestore',namespace:'mock'}));
 builder.onResolve({filter:/\/(CaptureAssistant|WhatsAppReminders|ExistingFeeAssignment|AdminPaymentEvidenceModal|AdminProjects|TreasuryReport|MemberAccessRecovery)$/},()=>({path:'empty',namespace:'mock'}));
 builder.onLoad({filter:/.*/,namespace:'mock'},args=>({loader:'tsx',contents:args.path==='api'?api:args.path==='config'?'export const db={};':args.path==='firestore'?'export const doc=()=>({}),deleteDoc=async()=>{},collection=()=>({}),getDocs=async()=>({docs:[]}),getDoc=async()=>({exists:()=>false});':'export default function Empty(){return null;}'}));
}}]});
writeFileSync('tests/admission-browser.html',readFileSync('tests/member-ui.html','utf8').replace('/tests/member-ui-fixture.tsx','/tests/admission-browser.js'));
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5190'],{stdio:'ignore'});let browser;
try{
 for(let i=0;i<80;i++){try{await fetch('http://127.0.0.1:5190/tests/admission-browser.html');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 const engine=process.env.LOGIA_ADMISSION_BROWSER==='webkit'?webkit:chromium;
 browser=await engine.launch();const page=await browser.newPage({...devices['iPhone 13']}),errors=[];page.on('pageerror',e=>errors.push(e.message));let nativeDialogs=0;page.on('dialog',async dialog=>{nativeDialogs++;await dialog.dismiss();});
 // Simulate a browser/installed app that silently suppresses native popups.
 await page.addInitScript(()=>{window.prompt=()=>null;window.confirm=()=>false;window.alert=()=>{};});
 const openRequests=async(query='')=>{await page.goto('http://127.0.0.1:5190/tests/admission-browser.html'+query);await page.getByRole('button',{name:/^Miembros/}).click();await page.getByRole('navigation',{name:'Opciones de Miembros'}).getByRole('button',{name:/^Solicitudes/}).click();await page.getByRole('button',{name:'✅ Dar Entrada',exact:true}).waitFor();};
 const openDate=async()=>{await page.getByRole('button',{name:'✅ Dar Entrada',exact:true}).click();await page.getByRole('dialog',{name:'Dar entrada al hermano',exact:true}).waitFor();};
 for(const role of ['master','admin']){
  await openRequests('?role='+role);await openDate();
  assert.equal(await page.evaluate(()=>window.__statusWrites.length),0,'opening confirmation writes nothing');
  if(role==='master'){mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/member-admission-'+engine.name()+'.png'});}
  await page.getByLabel('Fecha de entrada',{exact:true}).fill('');await page.getByRole('dialog').getByRole('button',{name:'Confirmar entrada',exact:true}).click();await page.getByRole('alert').filter({hasText:'Selecciona una fecha para continuar.'}).waitFor();assert.equal(await page.evaluate(()=>window.__statusWrites.length),0,'empty dates have visible validation and never write');
  await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(await page.evaluate(()=>window.__statusWrites.length),0,'canceling writes nothing');
  await openDate();await page.getByLabel('Fecha de entrada',{exact:true}).fill('2026-09-15');
  await page.getByRole('dialog').getByRole('button',{name:'Confirmar entrada',exact:true}).click();await page.getByText('Hermano aceptado y activado en la logia.',{exact:true}).waitFor();await page.getByText('✨ No hay solicitudes pendientes.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog').count(),0,'successful confirmation closes');
  assert.deepEqual(await page.evaluate(()=>window.__statusWrites),[{groupId:'lodge',uid:'brother',active:true,date:'2026-09-15'}],role+' sends the selected lodge and confirmed date exactly once');
 }
 await openRequests('?error');await openDate();await page.getByLabel('Fecha de entrada',{exact:true}).fill('2026-10-27');await page.getByRole('dialog').getByRole('button',{name:'Confirmar entrada',exact:true}).click();await page.getByRole('dialog').getByRole('alert').filter({hasText:'No se pudo guardar: tu sesión no tiene permiso'}).waitFor();
 assert.equal(await page.getByRole('dialog').getByRole('button',{name:'Confirmar entrada',exact:true}).isEnabled(),true,'failed request can be retried');assert.equal(await page.evaluate(()=>window.__member.active),false,'failure does not pretend the admission succeeded');assert.equal(await page.getByLabel('Fecha de entrada',{exact:true}).inputValue(),'2026-10-27','failure preserves selected date');
 await page.evaluate(()=>{window.__failStatus=false;});await page.getByRole('dialog').getByRole('button',{name:'Confirmar entrada',exact:true}).click();await page.getByText('✨ No hay solicitudes pendientes.',{exact:true}).waitFor();
 await page.goto('http://127.0.0.1:5190/tests/admission-browser.html?reactivation');await page.getByRole('button',{name:/^Miembros/}).click();await page.getByRole('button',{name:/^Filtros/}).click();await page.getByRole('combobox',{name:/^Estado/}).selectOption('inactive');await page.getByRole('button',{name:/^Hermano Prueba/}).click();
 await page.getByRole('button',{name:'Reactivar miembro',exact:true}).click();await page.getByRole('dialog',{name:'Reactivar miembro',exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(await page.getByLabel('Ficha del miembro',{exact:true}).count(),1,'closing confirmation preserves the open member profile');
 await page.getByRole('button',{name:'Reactivar miembro',exact:true}).click();await page.getByLabel('Fecha de reingreso',{exact:true}).fill('2026-10-27');await page.getByRole('dialog').getByRole('button',{name:'Confirmar reingreso',exact:true}).click();await page.getByText('Usuario reactivado desde la fecha de reingreso.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__member.active),true);
 await openRequests('?role=viewer');assert.equal(await page.getByRole('button',{name:'✅ Dar Entrada',exact:true}).isDisabled(),true);
 await openRequests('?role=admin&suspended');assert.equal(await page.getByRole('button',{name:'✅ Dar Entrada',exact:true}).isDisabled(),true);
 assert.equal(nativeDialogs,0,'admission and reactivation never depend on native browser dialogs');assert.deepEqual(errors,[]);console.log(engine.name()+' real Admin mobile UI passed with native popups suppressed: visible dated Master/admin confirmation, cancel without writes, persistent error/date and retry, reactivation over member detail, read-only guards and no unhandled errors.');
}finally{await browser?.close();server.kill();for(const suffix of ['js','html'])rmSync('tests/admission-browser.'+suffix,{force:true});}
