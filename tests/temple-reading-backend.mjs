import assert from 'node:assert/strict';import vm from 'node:vm';import {createRequire} from 'node:module';import {build} from 'esbuild';import {createHash} from 'node:crypto';
const nodeRequire=createRequire(import.meta.url);let profile={role:'member',active:true,groupId:'lodge'},security={},reads=[];
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
const builder={region(){return this;},runWith(){return this;},https:{HttpsError,onCall:fn=>fn}},admin={firestore:()=>({doc:path=>({get:async()=>{reads.push(path);return {exists:!path.startsWith('users/')||!!profile,data:()=>path.startsWith('users/')?profile:security};}})})};
const bundle=await build({entryPoints:['functions/src/templeReading.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['firebase-functions','firebase-admin']});
const context={module:{exports:{}},Buffer,__dirname:process.cwd()+'/functions/lib',require:name=>name==='firebase-functions'?builder:name==='firebase-admin'?admin:nodeRequire(name)};vm.runInNewContext(bundle.outputFiles[0].text,context);
const call=context.module.exports.templeReadingService,auth={auth:{uid:'member',token:{auth_time:1000}}};
await assert.rejects(call({action:'pdf'},{}),e=>e.code==='unauthenticated');assert.equal(reads.length,0);
await assert.rejects(call({action:'anything',path:'../../secret'},auth),e=>e.code==='invalid-argument');
const pdf=await call({action:'pdf'},auth);assert.equal(pdf.pages,101);const bytes=Buffer.from(pdf.pdfBase64,'base64');assert.equal(bytes.length,756720);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.equal(createHash('sha256').update(bytes).digest('hex'),pdf.sha256);
profile={role:'member',active:false,groupId:'lodge'};await assert.rejects(call({action:'pdf'},auth),e=>e.code==='permission-denied');
profile={role:'member',active:true};await assert.rejects(call({action:'pdf'},auth),e=>e.code==='permission-denied');
profile={role:'member',active:true,groupId:'lodge'};security={mustChangePassword:true};await assert.rejects(call({action:'pdf'},auth),e=>e.code==='permission-denied');
security={validAfterSeconds:1001};await assert.rejects(call({action:'pdf'},auth),e=>e.code==='permission-denied');
security={};profile={role:'master',active:false};assert.equal((await call({action:'pdf'},auth)).sha256,pdf.sha256);
assert.ok(reads.every(path=>path==='users/member'||path==='accountSecurity/member'));
console.log('Bundled first-degree reader passed: original 101-page PDF/hash, active member/Master gate, unknown action/anonymous/inactive/no-lodge/revoked/password-change denial, fixed file and no cloud writes.');
