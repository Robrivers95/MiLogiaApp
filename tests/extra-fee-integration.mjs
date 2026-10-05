import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
// Execute the real API against an in-memory transactional store; no production Firebase writes.
const store=new Map();let failCommit=false;let lock=Promise.resolve();
const clone=value=>structuredClone(value);
const ref=(...args)=>{const path=args.slice(1).join('/');return {path,id:path.split('/').at(-1)};};
const snap=reference=>({id:reference.id,exists:()=>store.has(reference.path),data:()=>clone(store.get(reference.path))});
const firestore={doc:ref,collection:ref,query:(reference,...conditions)=>({...reference,conditions}),where:(...condition)=>condition,
 getDocs:async reference=>{const docs=[...store.keys()].filter(path=>path.startsWith(`${reference.path}/`) && !path.slice(reference.path.length+1).includes('/') && (reference.conditions || []).every(([field,operator,value])=>store.get(path)[field]===value)).map(path=>snap({path,id:path.split('/').at(-1)}));return {docs,forEach:callback=>docs.forEach(callback)};},
 getDoc:async reference=>snap(reference),updateDoc:async(reference,value)=>store.set(reference.path,{...store.get(reference.path),...clone(value)}),
 runTransaction:async(_db,callback)=>{const next=lock.then(async()=>{const writes=[];const transaction={get:async reference=>snap(reference),set:(reference,value)=>writes.push([reference.path,clone(value)]),update:(reference,value)=>writes.push([reference.path,{...store.get(reference.path),...clone(value)}])};const result=await callback(transaction);if(failCommit){failCommit=false;throw new Error('simulated commit failure');}for(const [path,value] of writes)store.set(path,value);return result;});lock=next.catch(()=>{});return next;}};
const mocks={firestore,auth:{currentUser:{uid:'admin'}},db:{},storage:{}};
const firebaseExports=['doc','getDoc','setDoc','updateDoc','deleteDoc','deleteField','collection','query','where','getDocs','orderBy','limit','increment','writeBatch','addDoc','runTransaction'];
const bundled=await build({entryPoints:['services/api.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'firebase-test',setup(builder){
 builder.onResolve({filter:/^firebase\//},args=>({path:args.path,namespace:'mock'}));
 builder.onResolve({filter:/^\.\/firebase$/},()=>({path:'config',namespace:'mock'}));
 builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='config' ? 'export const {auth,db,storage}=globalThis.__mocks;' : args.path==='firebase/firestore' ? firebaseExports.map(name=>`export const ${name}=globalThis.__mocks.firestore.${name} || (()=>{});`).join('\n') : args.path==='firebase/storage' ? 'export const ref=()=>{};export const uploadBytes=()=>{};export const getDownloadURL=()=>{};' : 'export const signInWithEmailAndPassword=()=>{};export const createUserWithEmailAndPassword=()=>{};export const updateProfile=()=>{};export const getAuth=()=>{};export const signOut=()=>{};export const sendPasswordResetEmail=()=>{};'}));
}}]});
const exports={};const context={module:{exports},exports,__mocks:mocks,console,setTimeout,clearTimeout,Date};vm.runInNewContext(bundled.outputFiles[0].text,context);const {dataService,notificationService}=context.module.exports;notificationService.createNotification=async()=>{};
const ledgerPath='users/member/ledger/2026-09',receiptPath='groups/logia/paymentReceipts/proof';
const base={period:'2026-09',groupId:'logia',amount:0,paid:0,status:'Pagado',comments:'',extraFees:[{id:'event',description:'Evento',amount:2000,paid:0,forgiven:true,forgivenAt:'2026-09-01',forgivenNote:'Cierre',createdAt:''}]};
const receipt={id:'proof',groupId:'logia',userId:'member',userName:'Miembro',periods:['2026-09'],extraFeePeriod:'2026-09',extraFeeId:'event',receiptType:'concepto_adicional',conceptDescription:'Evento',amount:1000,status:'pending',transferDate:'2026-09-25',submittedAt:'2026-09-25',receiptImageUrl:'https://example.test/proof.jpg'};
store.set(ledgerPath,clone(base));store.set(receiptPath,clone(receipt));
failCommit=true;await assert.rejects(dataService.approvePaymentReceipt(receipt,'admin'),/simulated/);
assert.deepEqual(store.get(ledgerPath),base,'failed approval must not partially credit the ledger');assert.equal(store.get(receiptPath).status,'pending');
await Promise.all([dataService.approvePaymentReceipt(receipt,'admin'),dataService.approvePaymentReceipt(receipt,'admin')]);
assert.equal(store.get(ledgerPath).extraFees[0].paid,1000,'concurrent/repeated approval counts once');assert.equal(store.get(ledgerPath).extraFees[0].forgiven,true);assert.equal(store.get(ledgerPath).status,'Pagado');assert.equal(store.get(receiptPath).appliedAmount,1000);assert.equal(store.get(receiptPath).status,'approved');
await dataService.approvePaymentReceipt(receipt,'admin');assert.equal(store.get(ledgerPath).paidExtra,1000);
await dataService.updatePaymentReceipt('logia','proof',{amount:2500});assert.equal(store.get(ledgerPath).extraFees[0].paid,2500,'correcting a voluntary receipt can exceed original amount');assert.equal(store.get(ledgerPath).extraFees[0].forgiven,true);
const template={key:'2026-09|cena|500',period:'2026-09',description:'Cena',amount:500,forgiven:false,registryId:'original'};
store.set('users/new',{groupId:'logia'});store.set('extraFees/original',{groupId:'logia',appliedToUsers:['member'],period:template.period,description:template.description,amount:template.amount});
assert.equal(await dataService.assignExistingExtraFee('logia','new',template,'admin'),true);assert.equal(await dataService.assignExistingExtraFee('logia','new',template,'admin'),false);
assert.equal(store.get('users/new/ledger/2026-09').amount,0,'assigning an extra must not create a monthly charge');assert.equal(store.get('users/new/ledger/2026-09').extraFees.length,1);assert.deepEqual([...store.get('extraFees/original').appliedToUsers],['member','new']);
store.set('users/other',{groupId:'other'});await assert.rejects(dataService.assignExistingExtraFee('logia','other',template,'admin'),/Logia/);assert.equal(store.has('users/other/ledger/2026-09'),false);
console.log('Real API integration passed: atomic approval/failure, concurrency/idempotency, voluntary correction, late assignment, registry and group isolation.');
store.set('users/admin',{role:'admin',active:true,groupId:'logia'});store.set('groups/logia',{name:'Logia Prueba',active:true});
store.set('users/member',{uid:'member',name:'Miembro',role:'member',active:true,groupId:'logia'});
await dataService.saveWhatsAppContact('logia','member','8112345678',true);assert.equal(store.get('users/member').phoneNumber,'528112345678');assert.equal(store.get('users/member').whatsappRemindersAllowed,true);
await assert.rejects(dataService.saveWhatsAppContact('logia','other','8112345678',true),/Logia/);
for(const role of ['viewer','member']){store.set('users/admin',{role,active:true,groupId:'logia'});await assert.rejects(dataService.saveWhatsAppContact('logia','member','8112345678',true),/administradores/);await assert.rejects(dataService.prepareWhatsAppReminders('logia'),/administradores/);}
store.set('users/admin',{role:'admin',active:true,groupId:'other'});
await assert.rejects(dataService.saveWhatsAppContact('logia','member','8112345678',true),/administradores/);
store.set('users/admin',{role:'master',active:true,groupId:''});
await dataService.saveWhatsAppContact('logia','member','8187654321',true);
assert.equal(store.get('users/member').phoneNumber,'528187654321','Master can save in selected lodge without belonging to it');
await dataService.prepareWhatsAppReminders('logia');
await assert.rejects(dataService.saveWhatsAppContact('logia','other','8112345678',true),/Logia/);
store.set('users/admin',{role:'admin',active:true,groupId:'logia'});store.set('users/new',{uid:'new',name:'Nuevo',role:'member',active:true,groupId:'logia'});
const reminders=await dataService.prepareWhatsAppReminders('logia');assert.equal(reminders.groupName,'Logia Prueba');assert.equal(reminders.recipients.length,1,'forgiven debt is excluded and other Logias stay isolated');assert.equal(reminders.recipients[0].member.uid,'new');assert.equal(reminders.recipients[0].reminder.total,500);
store.set('groups/logia',{active:false});await assert.rejects(dataService.prepareWhatsAppReminders('logia'),/activa/);
console.log('WhatsApp real API guards passed: strict admin-only, consent/contact saving, own-group debts and suspended Logia.');
const february={key:'2026-02|evento anual|700',period:'2026-02',description:'Evento anual',amount:700,forgiven:false,registryId:'feb-event',assignmentPeriod:'2027-09'};
store.set('extraFees/feb-event',{groupId:'logia',period:'2026-02',description:'Evento anual',amount:700,appliedToUsers:[]});
for(const uid of ['late-a','late-b','late-c']) {
 store.set(`users/${uid}`,{groupId:'logia',name:uid,active:true,role:'member'});
 assert.equal(await dataService.assignExistingExtraFee('logia',uid,february,'admin'),true);
 assert.equal(store.has(`users/${uid}/ledger/2026-02`),false,'do not charge source month');
 const payments=await dataService.getPayments(uid,true);
 assert.equal(payments[0].period,'2027-09');assert.equal(payments[0].extraFees[0].sourceFeeId,'feb-event');
 const totals=await dataService.getUserFinancialStats(uid,undefined,undefined,true);
 assert.equal(totals.totalDebt,700,'new assignments appear in member financial summary');
 assert.equal(totals.totalBilledExtra,700);
 assert.equal(await dataService.assignExistingExtraFee('logia',uid,{...february,assignmentPeriod:'2028-01'},'admin'),false,'same source fee cannot be duplicated in another year');
}
assert.equal(store.get('extraFees/feb-event').appliedToUsers.length,3);
await assert.rejects(dataService.assignExistingExtraFee('logia','late-a',{...february,assignmentPeriod:''},'admin'),/mes y año/);
console.log('Late fee assignment passed: February source -> September of another year, three members visible through real history/stats, original month unchanged, cross-period duplicates blocked.');
