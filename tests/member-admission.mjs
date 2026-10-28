import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {initializeApp} from 'firebase/app';
import {getFirestore,doc,updateDoc} from 'firebase/firestore';

// Reproduce the reported failure with the actual SDK, before any network write.
const validationDb=getFirestore(initializeApp({projectId:'demo-member-admission'},'member-admission-validation'));
await assert.rejects(async()=>updateDoc(doc(validationDb,'users/pending'),{active:true,masonicRejoinDate:'2026-10-27',leaveDate:undefined}),/Unsupported field value: undefined/);

const store=new Map(),deletion={__delete:true};let failCommit=false,writes=0;
const reference=(_db,...parts)=>({path:parts.join('/'),id:parts.at(-1)});
const snapshot=ref=>({exists:()=>store.has(ref.path),data:()=>structuredClone(store.get(ref.path))});
const apply=(ref,patch)=>{const data=structuredClone(store.get(ref.path));for(const [key,value] of Object.entries(patch)){assert.notEqual(value,undefined,'no undefined values reach Firebase');if(value?.__delete)delete data[key];else data[key]=value;}return data;};
const mocks={auth:{currentUser:{uid:'actor'}},db:{},storage:{},firestore:{doc:reference,deleteField:()=>deletion,
 runTransaction:async(_db,callback)=>{const pending=[];const result=await callback({get:async ref=>snapshot(ref),update:(ref,patch)=>pending.push([ref.path,apply(ref,patch)])});if(failCommit){failCommit=false;throw new Error('permission-denied');}for(const [path,data] of pending){store.set(path,data);writes++;}return result;}
}};
const names=['doc','getDoc','setDoc','updateDoc','deleteDoc','deleteField','collection','query','where','getDocs','orderBy','limit','increment','writeBatch','addDoc','runTransaction'];
const bundled=await build({entryPoints:['services/api.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'firebase-test',setup(builder){
 builder.onResolve({filter:/^firebase\//},args=>({path:args.path,namespace:'mock'}));
 builder.onResolve({filter:/^\.\/firebase$/},()=>({path:'config',namespace:'mock'}));
 builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='config'?'export const {auth,db,storage}=globalThis.__mocks;':args.path==='firebase/firestore'?names.map(name=>`export const ${name}=globalThis.__mocks.firestore.${name} || (()=>{});`).join('\n'):args.path==='firebase/storage'?'export const ref=()=>{};export const uploadBytes=()=>{};export const getDownloadURL=()=>{};':'export const signInWithEmailAndPassword=()=>{};export const createUserWithEmailAndPassword=()=>{};export const updateProfile=()=>{};export const getAuth=()=>{};export const signOut=()=>{};export const sendPasswordResetEmail=()=>{};'}));
}}]});
const exports={},context={module:{exports},exports,__mocks:mocks,console,setTimeout,clearTimeout,Date};vm.runInNewContext(bundled.outputFiles[0].text,context);
const {dataService}=context.module.exports;
const original={uid:'brother',name:'Hermano',role:'member',active:false,groupId:'lodge',joinDate:'2026-01-01',degree:'aprendiz',totalPoints:50};
const ledger={amount:500,paid:300,extraFees:[{id:'fee',amount:100,paid:0}]};
for(const role of ['master','admin']){
 store.set('users/actor',{uid:'actor',role,active:true,groupId:role==='master'?'other':'lodge'});
 store.set('users/brother',structuredClone(original));store.set('users/brother/ledger/2026-09',structuredClone(ledger));
 await dataService.changeMemberStatus('lodge','brother',true,'2026-09-15');
 assert.deepEqual(store.get('users/brother'),{...original,active:true,masonicRejoinDate:'2026-09-15'},`${role} can approve a pending member in the selected lodge`);
 await dataService.changeMemberStatus('lodge','brother',false,'2026-10-01');assert.equal(store.get('users/brother').leaveDate,'2026-10-01');assert.equal(store.get('users/brother').active,false);
 await dataService.changeMemberStatus('lodge','brother',true,'2026-10-27');assert.equal(store.get('users/brother').active,true);assert.equal('leaveDate' in store.get('users/brother'),false,'reactivation must actually clear the previous leave date');
 assert.deepEqual(store.get('users/brother/ledger/2026-09'),ledger,'all historical accounting remains untouched');
}
for(const actor of [{role:'viewer',active:true,groupId:'lodge'},{role:'member',active:true,groupId:'lodge'},{role:'admin',active:true,groupId:'other'},{role:'admin',active:false,groupId:'lodge'}]){
 store.set('users/actor',actor);await assert.rejects(dataService.changeMemberStatus('lodge','brother',true,'2026-10-27'),/administrador/);
}
store.set('users/actor',{role:'admin',active:true,groupId:'lodge'});store.set('users/brother',{...original,groupId:'other'});
await assert.rejects(dataService.changeMemberStatus('lodge','brother',true,'2026-10-27'),/otra logia/);
store.set('users/brother',{...original,role:'master'});await assert.rejects(dataService.changeMemberStatus('lodge','brother',true,'2026-10-27'),/administrador/);
store.set('users/brother',{...original,groupId:''});await assert.rejects(dataService.changeMemberStatus('lodge','brother',true,'2026-10-27'),/no tiene logia/);
store.set('users/actor',{role:'master',active:true,groupId:''});
failCommit=true;await assert.rejects(dataService.changeMemberStatus('lodge','brother',true,'2026-10-27'),/permission-denied/);
assert.equal(store.get('users/brother').groupId,'','failed activation must not assign a lodge separately');assert.equal(store.get('users/brother').active,false);
await dataService.changeMemberStatus('lodge','brother',true,'2026-10-27');assert.equal(store.get('users/brother').groupId,'lodge');assert.equal(store.get('users/brother').active,true);
const writesBefore=writes;
for(const date of ['2026-02-30','2026-13-01','2026-2-1','no es fecha',''])await assert.rejects(dataService.changeMemberStatus('lodge','brother',true,date),/fecha válida/);
assert.equal(writes,writesBefore,'invalid dates must never write');
await assert.rejects(dataService.changeMemberStatus('lodge','missing',true,'2026-10-27'),/No se encontró/);
console.log('Member admission passed: original SDK failure reproduced, Master and lodge admin approvals, dated reactivation/deletion, unchanged ledgers, role/group guards, atomic assignment/failure and date validation. No production profiles were changed.');
