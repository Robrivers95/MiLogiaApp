import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
const records=new Map();let failCommit=false;let lock=Promise.resolve();
const copy=value=>structuredClone(value);
const ref=(...args)=>{const path=args.slice(1).join('/');return {path,id:path.split('/').at(-1)};};
const snap=reference=>({id:reference.id,exists:()=>records.has(reference.path),data:()=>copy(records.get(reference.path))});
const firestore={doc:ref,collection:ref,query:(reference,...conditions)=>({...reference,conditions}),where:(...condition)=>condition,
 getDocs:async reference=>{const docs=[...records.keys()].filter(path=>path.startsWith(reference.path+'/') && !path.slice(reference.path.length+1).includes('/') && (reference.conditions || []).every(([key,operator,value])=>records.get(path)[key]===value)).map(path=>snap({path,id:path.split('/').at(-1)}));return {docs,forEach:callback=>docs.forEach(callback)};},getDoc:async reference=>snap(reference),
 runTransaction:async(_db,callback)=>{const next=lock.then(async()=>{const writes=[];const transaction={get:async reference=>{assert.equal(writes.length,0,'Firestore reads must precede all writes');return snap(reference);},set:(reference,value)=>writes.push([reference.path,copy(value)]),update:(reference,value)=>{assert.ok(records.has(reference.path));writes.push([reference.path,{...records.get(reference.path),...copy(value)}]);}};const result=await callback(transaction);if(failCommit && writes.length){failCommit=false;throw Error('commit failed');}for(const [path,value] of writes)records.set(path,value);return result;});lock=next.catch(()=>{});return next;}};
const mocks={firestore,auth:{currentUser:{uid:'admin'}},db:{},storage:{}};
const names=['doc','collection','query','where','getDocs','getDocFromServer','getDoc','runTransaction','setDoc','updateDoc','deleteDoc','deleteField','orderBy','limit','increment','writeBatch','addDoc'];
const bundle=await build({stdin:{contents:"export {incomeCaptureApi} from './services/incomeCaptureApi';export {quickFinanceService} from './services/quickFinanceApi'; export {dataService} from './services/api'; export {countsInTreasury,captureAmount,validCaptureDate} from './services/quickFinance';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'mock-firebase',setup(builder){builder.onResolve({filter:/^firebase\//},args=>({path:args.path,namespace:'mock'}));builder.onResolve({filter:/^\.\/firebase$/},()=>({path:'config',namespace:'mock'}));builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='config'?'export const {auth,db,storage}=globalThis.__mocks;':args.path==='firebase/firestore'?names.map(name=>`export const ${name}=globalThis.__mocks.firestore.${name} || (()=>{});`).join('\n'):args.path==='firebase/functions'?"export const getFunctions=()=>{};export const httpsCallable=()=>()=>{};":args.path==='firebase/storage'?"export const ref=(_storage,path)=>({path});export const uploadBytes=async()=>{};export const getDownloadURL=async()=> 'https://test.invalid/photo.jpg';":"export const signInWithEmailAndPassword=()=>{};export const createUserWithEmailAndPassword=()=>{};export const updateProfile=()=>{};export const getAuth=()=>{};export const signOut=()=>{};export const sendPasswordResetEmail=()=>{};"}));}}]});
const exports={};const context={exports,module:{exports},__mocks:mocks,console,Date,setTimeout,clearTimeout,crypto:{randomUUID:()=> 'photo-id'},window:{dispatchEvent:()=>{}},CustomEvent:class {constructor(type,data){this.type=type;this.detail=data.detail;}}};vm.runInNewContext(bundle.outputFiles[0].text,context);
const {quickFinanceService:service,dataService,countsInTreasury,captureAmount,validCaptureDate}=context.module.exports;

const api=context.module.exports.incomeCaptureApi;
records.set('users/admin',{role:'admin',active:true,groupId:'logia'});records.set('groups/logia',{active:true});
records.set('users/a',{name:'Juan',groupId:'logia',active:true});records.set('users/b',{name:'Carlos',groupId:'logia',active:true});records.set('users/foreign',{name:'Otro',groupId:'other'});
records.set('bankBalances/bank',{amount:1000,groupId:'logia'});
const ledger=id=>'users/'+id+'/ledger/2026-09';const seed={period:'2026-09',groupId:'logia',amount:500,paid:50,paidRegular:50,comments:'Anterior',extraFees:[{id:'extra',description:'Evento',amount:700,paid:0,createdAt:''}]};
for(const id of ['a','b'])records.set(ledger(id),copy(seed));
const draft=id=>'groups/logia/incomeDrafts/'+id;
for(const id of ['one','two','three','other'])records.set(draft(id),{status:'pending',receiptImageUrls:['https://proof.test/statement'],reference:'bank-ref'});
const review={memberId:'a',amount:100,date:'2026-10-29',period:'2026-09',kind:'regular',feeId:'',concept:'Cuota septiembre',paymentMethod:'transfer',accountId:'bank'};
await assert.rejects(api.approve('logia','one',review,false),/confirma/);assert.equal(records.get(ledger('a')).paid,50);
failCommit=true;await assert.rejects(api.approve('logia','one',review,true),/commit failed/);assert.equal(records.get(ledger('a')).paid,50);assert.equal(records.get(draft('one')).status,'pending');assert.equal(records.get('bankBalances/bank').amount,1000);
await Promise.all([api.approve('logia','one',review,true),api.approve('logia','one',review,true)]);
assert.equal(records.get(ledger('a')).paidRegular,150);assert.equal(records.get('bankBalances/bank').amount,1100);assert.equal(records.get(draft('one')).status,'approved');
const proof=records.get('groups/logia/paymentReceipts/ai-one');assert.equal(proof.receiptImageUrls[0],'https://proof.test/statement');assert.equal(proof.userId,'a');assert.equal(proof.periods[0],'2026-09');
assert.equal([...records.keys()].filter(k=>k.includes('/treasury/')).length,0,'quota income is not also posted as separate treasury income');
// Firestore maps reorder keys: identical retries must still match.
records.get(draft('one')).approvedReview=Object.fromEntries(Object.entries(review).sort(([a],[b])=>a.localeCompare(b)));
await api.approve('logia','one',review,true);assert.equal(records.get(ledger('a')).paidRegular,150);
await assert.rejects(api.approve('logia','one',{...review,amount:200},true),/otros datos/);
await api.approve('logia','two',{...review,memberId:'b',amount:300,kind:'extra',feeId:'extra',concept:'Evento',accountId:''},true);
assert.equal(records.get(ledger('b')).extraFees[0].paid,300);assert.equal(records.get(ledger('a')).extraFees[0].paid,0);assert.equal(records.get('bankBalances/bank').amount,1100);
await assert.rejects(api.approve('logia','three',{...review,memberId:'foreign'},true),/pertenece/);
await assert.rejects(api.approve('logia','three',{...review,period:'2026-02'},true),/No existe/);
await assert.rejects(api.approve('logia','three',{...review,amount:9999},true),/excede/);
await api.reject('logia','three');assert.equal(records.get(draft('three')).status,'rejected');await assert.rejects(api.approve('logia','three',review,true),/pendiente/);
await api.approve('logia','other',{...review,kind:'other',amount:50,accountId:''},true);assert.equal(records.get('groups/logia/treasury/ai-other').amount,50);
records.set('users/admin',{role:'member',active:true,groupId:'logia'});await assert.rejects(api.list('logia'),/Admin/);
records.set('users/admin',{role:'admin',active:true,groupId:'other'});await assert.rejects(api.list('logia'),/Admin/);
records.set('users/admin',{role:'master',active:true,groupId:''});assert.equal((await api.list('logia')).length,4);
console.log('Real income approval passed: explicit confirmation, corrected members/periods/concepts, proof linkage, atomic failure, concurrent retries and map-order idempotence, exact quota/account totals, rejection, missing/foreign quotas and role isolation.');
