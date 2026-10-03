import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
// Execute the real API against an in-memory transactional store; no production Firebase writes.
const store=new Map();let failCommit=false;let lock=Promise.resolve();
const clone=value=>structuredClone(value);
const ref=(...args)=>{const path=args.slice(1).join('/');return {path,id:path.split('/').at(-1)};};
const snap=reference=>({id:reference.id,exists:()=>store.has(reference.path),data:()=>clone(store.get(reference.path))});
const firestore={doc:ref,getDoc:async reference=>snap(reference),updateDoc:async(reference,value)=>store.set(reference.path,{...store.get(reference.path),...clone(value)}),
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
