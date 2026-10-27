import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,rmSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const dashboard = "import React,{useState} from 'react';import Recovery from "+JSON.stringify(process.cwd()+'/components/MemberAccessRecovery.tsx')+";export default function Dashboard(){const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Abrir recuperación</button>{open&&<Recovery member={{uid:'member-test',name:'Miembro de prueba'}} groupId=\"test\" onClose={()=>setOpen(false)}/>}</>}";
const sources={
 'firebase/auth':"export function onIdTokenChanged(auth,callback){window.__tokenObserver=callback;queueMicrotask(()=>callback(auth.currentUser));return()=>{};}",
 'firebase/firestore':"export const doc=(db,...parts)=>({path:parts.join('/'),id:parts.at(-1)});export function onSnapshot(ref,callback){let stopped=false;queueMicrotask(()=>{if(!stopped)callback({id:ref.id,exists:()=>true,data:()=>ref.path.startsWith('accountSecurity/')?{mustChangePassword:false}:{active:true,name:'Logia de prueba'}});});return()=>{stopped=true;};}",
 firebase:"export const isConfigured=true,db={};export const auth={currentUser:{uid:'admin-test',email:'admin@example.test'},signOut:async()=>{}};",
 api:"export const dataService={getUserProfile:async()=>{window.__profileReads=(window.__profileReads||0)+1;await new Promise(r=>setTimeout(r,30));return {uid:'admin-test',name:'Admin',role:'admin',active:true,groupId:'test'};}};",
 features:"export const MEMBER_ACCESS_ENABLED=true;",
 lodgeIdentity:"export const validLodgeLogo=()=>false;",
 memberAccess:"export const temporaryMemberPassword=()=> 'G-TemporalPrueba123';export const memberAccessService={inspect:async()=>({userId:'member-test',email:'member@example.test'}),reset:async()=>{window.__tokenObserver({uid:'admin-test',email:'admin@example.test'});await new Promise(r=>setTimeout(r,80));window.__resetCompleted=true;},finish:async()=>{}};",
 Layout:"export default function Layout({children}){return <main>{children}</main>;}",
 Dashboard:dashboard
};
const stubRoutes=['Auth','Payments','Attendance','Admin','Profile','Setup','Notices','MasterDashboard','PendingApproval','Library','Secretariat','CaptureAssistant'];
await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import App from './App';createRoot(document.getElementById('root')).render(<App/>);",resolveDir:process.cwd(),loader:'tsx'},outfile:'tests/session-browser.js',bundle:true,format:'esm',plugins:[{name:'isolated-app-session',setup(b){
 b.onResolve({filter:/^firebase\/(auth|firestore)$|\/(firebase|api|features|lodgeIdentity|memberAccess)$|\/(Auth|Layout|Dashboard|Payments|Attendance|Admin|Profile|Setup|Notices|MasterDashboard|PendingApproval|Library|Secretariat|CaptureAssistant)$/},args=>({path:args.path.startsWith('firebase/')?args.path:args.path.split('/').at(-1),namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},args=>({loader:'tsx',resolveDir:process.cwd(),contents:stubRoutes.includes(args.path)?"import React from 'react';export default function Route(){return <p>Ingresar</p>;}":(args.path==='Layout'?"import React from 'react';":'')+sources[args.path]}));
}}]});
writeFileSync('tests/session-browser.html',readFileSync('tests/member-ui.html','utf8').replace('/tests/member-ui-fixture.tsx','/tests/session-browser.js'));
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5184'],{stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{await fetch('http://127.0.0.1:5184/tests/session-browser.html');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5184/tests/session-browser.html');await page.getByRole('button',{name:'Abrir recuperación'}).click();await page.getByText('member@example.test',{exact:true}).waitFor();await page.getByLabel('Contraseña temporal',{exact:true}).fill('G-PreservarTemporal123');
 await page.evaluate(()=>window.__tokenObserver({uid:'admin-test',email:'admin@example.test'}));await page.waitForFunction(()=>window.__profileReads>=2);await page.getByRole('dialog').waitFor();assert.equal(await page.getByLabel('Contraseña temporal',{exact:true}).inputValue(),'G-PreservarTemporal123','token refresh preserves the open dialog and chosen credential');
 await page.getByLabel('Confirmé que esta cuenta').check();await page.getByLabel('Tu contraseña de administrador',{exact:true}).fill('AdminPrueba2026');await page.getByRole('button',{name:'Asignar contraseña temporal'}).click();await page.getByText(/Contraseña temporal asignada/).waitFor();assert.equal(await page.evaluate(()=>window.__resetCompleted),true);assert.equal(await page.getByLabel('Contraseña temporal',{exact:true}).inputValue(),'G-PreservarTemporal123');assert.equal(await page.getByRole('dialog').count(),1);assert.deepEqual(errors,[]);
 console.log('Real App session regression passed: token refresh and administrator reauthentication preserve the recovery dialog, temporary credential and confirmed result. No Firebase accounts were touched.');
}finally{await browser?.close();server.kill();for(const file of ['tests/session-browser.js','tests/session-browser.html'])rmSync(file,{force:true});}
