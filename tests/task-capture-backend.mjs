import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";
import { createRequire } from "node:module";
const store = new Map();
let queue = Promise.resolve(),
  time = Date.now(),
  providerCalls = 0,
  providerStatus = 200,
  providerOutput,
  captured;
const snap = (path) => ({
  id: path.split("/").at(-1),
  exists: store.has(path),
  data: () => structuredClone(store.get(path)),
});
const ref = (path) => ({
  path,
  id: path.split("/").at(-1),
  get: async () => snap(path),
});
const query = (path, filters = [], max = Infinity) => ({
  where: (field, op, value) => query(path, [...filters, [field, op, value]], max),
  limit: (n) => query(path, filters, n),
  get: async () => ({
    docs: [...store.keys()].filter(k => k.startsWith(path + "/") && !k.slice(path.length+1).includes("/") &&
      filters.every(([field, op, expected]) => {
        const value = field.split('.').reduce((obj, key) => obj?.[key], store.get(k));
        return op === 'in' ? expected.includes(value) : value === expected;
      })
    ).slice(0,max).map(snap),
  }),
});
const db = {
  doc: ref,
  collection: query,
  runTransaction: (callback) => {
    const result = queue.then(async () => {
      const writes = [];
      const tx = {
        get: async (r) => { assert.equal(writes.length,0,'transactions read before writing');return r.path ? snap(r.path) : r.get(); },
        set: (r, v) => writes.push([r.path, v]),
        update: (r, v) => writes.push([r.path, { ...store.get(r.path), ...v }]),
        delete: r => writes.push([r.path, undefined]),
      };
      const result = await callback(tx);
      writes.forEach(([k, v]) => v===undefined?store.delete(k):store.set(k, structuredClone(v)));
      return result;
    });
    queue = result.catch(() => {});
    return result;
  },
};
const proofs=new Map();
const storage=()=>({bucket:()=>({name:'test-bucket',file:path=>({bucket:{name:'test-bucket'},save:async(bytes)=>proofs.set(path,bytes),delete:async()=>proofs.delete(path)})})});
class HttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
class FakeDate extends Date {
  static now() {
    return time;
  }
}
const functions = {
  region: () => ({ runWith: () => ({ https: { onCall: (fn) => fn } }) }),
  https: { HttpsError },
};
const built = await build({
  entryPoints: ["functions/src/meetingCapture.ts"],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  plugins: [
    {
      name: "mock-server",
      setup(b) {
        b.onResolve(
          { filter: /^(firebase-admin|firebase-functions)$/ },
          (args) => ({ path: args.path, namespace: "mock" }),
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
          contents:
            args.path === "firebase-admin"
              ? "export const storage=globalThis.__storage;export const firestore=Object.assign(()=>globalThis.__db,{FieldValue:{delete:()=>null}});"
              : "export const {region,https}=globalThis.__functions;",
        }));
      },
    },
  ],
});
const context = {
  module: { exports: {} },
  require: createRequire(import.meta.url),
  __db: db,
  __storage:storage,
  Buffer,
  __functions: functions,
  Date: FakeDate,
  Set,
  Map,
  AbortSignal,
  process: { env: { GEMINI_API_KEY: "AQ.synthetic-test-key-no-provider" } },
  fetch: async (url, options) => {
    providerCalls++;
    captured = { url, options };
    return {
      ok: providerStatus === 200,
      status: providerStatus,
      json: async () => ({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(providerOutput) }] },
          },
        ],
      }),
    };
  },
};
vm.runInNewContext(built.outputFiles[0].text, context);
const call = context.module.exports.captureWithAI;
for (const [id, role, groupId, extra] of [
  ["member", "member", "lodge", {}],
  ["admin", "admin", "lodge", {}],
  ["master", "master", "", {}],
  ["sec", "member", "lodge", { lodgeRole: "secretario" }],
  ["foreign", "member", "other", {}],
  ["viewer", "viewer", "lodge", {}],
  ["off", "member", "lodge", { active: false }],
])
  store.set("users/" + id, {
    uid: id,
    name: id,
    role,
    groupId,
    active: true,
    email: "private-email-must-not-be-sent",
    ...extra,
  });
store.set("groups/lodge", { active: true });
const actor = (id) => ({
  auth: { uid: id, token: { auth_time: Math.floor(time / 1000) } },
});
const base = { groupId: "lodge" },
  task = {
    id: "proposal",
    title: "Revisar compras",
    description: "Compra para visita",
    kind: "commitment",
    assigneeIds: ["member"],
    dueDate: "2026-11-15",
    assignmentMode: "individual",
  };
const reject = async (fn, code) => assert.rejects(fn, (e) => e.code === code);
const count = () =>
  [...store.keys()].filter((k) => k.startsWith("groups/lodge/tasks/")).length;
await reject(() => call({ ...base, action: "status" }, {}), "unauthenticated");
for (const id of ["foreign", "viewer", "off"])
  await reject(
    () => call({ ...base, action: "status" }, actor(id)),
    "permission-denied",
  );
assert.equal(
  (await call({ ...base, action: "status" }, actor("sec"))).configured,
  true,
);
context.process.env = {};
assert.equal(
  (await call({ ...base, action: "status" }, actor("member"))).configured,
  false,
);
await reject(
  () =>
    call(
      {
        ...base,
        action: "analyze",
        mode: "tasks",
        text: "Un acuerdo",
        date: "2026-10-27",
      },
      actor("member"),
    ),
  "failed-precondition",
);
context.process.env = { GEMINI_API_KEY: "AQ.synthetic-test-key-no-provider" };
await reject(
  () =>
    call(
      { ...base, action: "confirmTasks", requestId: "r1", tasks: [task] },
      actor("member"),
    ),
  "failed-precondition",
);
assert.equal(count(), 0);
await reject(
  () =>
    call(
      {
        ...base,
        action: "confirmTasks",
        confirmed: true,
        requestId: "r1",
        tasks: [{ ...task, assigneeIds: ["foreign"] }],
      },
      actor("member"),
    ),
  "failed-precondition",
);
assert.equal(count(), 0);
const confirmed = {
  ...base,
  action: "confirmTasks",
  confirmed: true,
  requestId: "r1",
  tasks: [{ ...task, title: "Título corregido", assigneeIds: ["sec"] }],
};
const [first, retry] = await Promise.all([
  call(confirmed, actor("member")),
  call(confirmed, actor("member")),
]);
assert.equal(count(), 1);
assert.equal(JSON.stringify(first.taskIds), JSON.stringify(retry.taskIds));
assert.equal(retry.alreadySaved, true);
const saved = store.get("groups/lodge/tasks/" + first.taskIds[0]);
assert.equal(saved.assignedTo, "sec");
assert.equal(saved.title, "Título corregido");
assert.equal(saved.createdBy, "member");
assert.equal(saved.confirmedBy, "member");
await reject(
  () => call({ ...confirmed, tasks: [task] }, actor("member")),
  "failed-precondition",
);
assert.equal(count(), 1);
const team = await call(
  {
    ...confirmed,
    requestId: "team",
    tasks: [
      { ...task, assigneeIds: ["member", "sec"], assignmentMode: "team" },
    ],
  },
  actor("sec"),
);
assert.equal(team.taskIds.length, 1);
const separate = await call(
  {
    ...confirmed,
    requestId: "separate",
    tasks: [{ ...task, assigneeIds: ["member", "sec"] }],
  },
  actor("admin"),
);
assert.equal(separate.taskIds.length, 2);
const before = count();
store.set("accountSecurity/member", { mustChangePassword: true });
await reject(
  () => call({ ...confirmed, requestId: "blocked" }, actor("member")),
  "permission-denied",
);
store.delete("accountSecurity/member");
store.set("accountSecurity/member", {
  validAfterSeconds: Math.floor(time / 1000) + 10,
});
await reject(
  () => call({ ...confirmed, requestId: "blocked" }, actor("member")),
  "permission-denied",
);
store.delete("accountSecurity/member");
store.set("groups/lodge", { active: false });
await reject(
  () => call({ ...confirmed, requestId: "blocked" }, actor("master")),
  "failed-precondition",
);
store.set("groups/lodge", { active: true });
assert.equal(count(), before);
await reject(
  () =>
    call(
      {
        ...base,
        action: "setTaskComplete",
        taskId: first.taskIds[0],
        completed: true,
      },
      actor("sec"),
    ),
  "invalid-argument",
);
await reject(
  () =>
    call(
      {
        ...base,
        action: "setTaskComplete",
        confirmed: true,
        taskId: first.taskIds[0],
        completed: true,
      },
      actor("off"),
    ),
  "permission-denied",
);
await call(
  {
    ...base,
    action: "setTaskComplete",
    confirmed: true,
    taskId: first.taskIds[0],
    completed: true,
  },
  actor("sec"),
);
assert.equal(
  store.get("groups/lodge/tasks/" + first.taskIds[0]).completed,
  true,
);
const analysis = {
  ...base,
  action: "analyze",
  mode: "tasks",
  text: "Carlos confirmará el lugar.",
  date: "2026-10-27",
};
providerOutput = {
  tasks: [
    { ...task, assigneeIds: [], sourceQuote: "Carlos confirmará el lugar." },
  ],
};
const prepared = await call(analysis, actor("member"));
assert.equal(prepared.tasks.length, 1);
assert.equal(prepared.tasks[0].assigneeIds.length, 0);
assert.equal(count(), before, "analysis never writes tasks");
assert.ok(!captured.options.body.includes("private-email-must-not-be-sent"));
assert.equal(
  captured.options.headers["x-goog-api-key"],
  "AQ.synthetic-test-key-no-provider",
);
await reject(() => call(analysis, actor("member")), "resource-exhausted");
time += 61000;
providerOutput.tasks[0].assigneeIds = ["foreign"];
await reject(() => call(analysis, actor("member")), "failed-precondition");
assert.equal(count(), before);
time += 61000;
providerOutput.tasks[0].assigneeIds = [];
providerOutput.tasks[0].sourceQuote = "Acuerdo inventado";
await reject(() => call(analysis, actor("member")), "failed-precondition");
await reject(
  () => call({ ...analysis, mode: "finance" }, actor("member")),
  "permission-denied",
);
time += 61000;
providerOutput = {
  finance: {
    type: "income",
    amount: 500,
    date: "",
    memberId: "member",
    paymentMethod: "cash",
    notes: "Cuota septiembre 2026",
    sourceQuote: "Juan abonó 500",
  },
};
const finance = await call(
  { ...analysis, mode: "finance", text: "Juan abonó 500" },
  actor("admin"),
);
assert.equal(finance.finance.amount, 500);
assert.equal(count(), before);
assert.equal(
  [...store.keys()].filter((k) => k.includes("/treasury/")).length,
  0,
  "finance analysis never writes money",
);
time += 61000;
providerStatus = 429;
await reject(() => call(analysis, actor("sec")), "resource-exhausted");
assert.equal(store.get("secretariatAnalysisLocks/sec").inProgress, false);
assert.ok(providerCalls >= 5);
console.log(
  "Capture callable passed: explicit confirmation, corrected assignments, atomic/idempotent retries, groups/roles/suspension/session guards, individual/team creation, authorized completion, source validation and no task or money writes during AI analysis. No real model/accounts were used.",
);

// Multi-income drafts are persisted separately from all financial records.
providerStatus=200;
store.set('users/juan',{name:'Juan Pérez',role:'member',active:true,groupId:'lodge'});
store.set('users/carlos',{name:'Carlos Ríos',role:'member',active:true,groupId:'lodge'});
const importText='Juan Pérez pagó 100 de septiembre. Carlos Ríos pagó 200 de septiembre.';
const row=(payerName,amount,sourceQuote)=>({payerName,amount,sourceQuote,date:'2026-10-29',period:'2026-09',kind:'regular',concept:'Cuota septiembre',paymentMethod:'transfer',reference:''});
providerOutput={incomes:[row('Juan Pérez',100,'Juan Pérez pagó 100 de septiembre.'),row('Carlos Ríos',200,'Carlos Ríos pagó 200 de septiembre.')]};
const incoming={action:'analyzeIncome',groupId:'lodge',requestId:'import-text',date:'2026-10-29',text:importText,images:[]};
const callsBefore=providerCalls,financialBefore=[...store.keys()].filter(k=>k.includes('/ledger/')||k.includes('/treasury/')||k.includes('/paymentReceipts/')).length;
const imported=await call(incoming,actor('master'));assert.equal(imported.ids.length,2);
const drafts=imported.ids.map(id=>store.get('groups/lodge/incomeDrafts/'+id));assert.equal(drafts[0].memberId,'juan');assert.equal(drafts[1].memberId,'carlos');assert.ok(drafts.every(d=>d.status==='pending'));
assert.equal([...store.keys()].filter(k=>k.includes('/ledger/')||k.includes('/treasury/')||k.includes('/paymentReceipts/')).length,financialBefore,'analysis never publishes money');
await call(incoming,actor('master'));assert.equal(providerCalls,callsBefore+1,'lost-response retry reuses analysis and draft ids');
await reject(()=>call({...incoming,text:'Other input'},actor('master')),'failed-precondition');
await reject(()=>call({...incoming,requestId:'not-admin'},actor('member')),'permission-denied');
const png=Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
const pictured=await call({...incoming,requestId:'import-image',text:'',images:[{mimeType:'image/png',data:png}]},actor('admin'));
assert.equal(pictured.ids.length,2);assert.equal(proofs.size,1,'one original-image copy backs both drafts');
const pictureDraft=store.get('groups/lodge/incomeDrafts/'+pictured.ids[0]);assert.equal(pictureDraft.receiptImageUrls.length,1);assert.equal(pictureDraft.possibleDuplicate,true,'repeat imports are flagged');
const body=JSON.parse(captured.options.body);assert.equal(body.contents[0].parts[1].inlineData.mimeType,'image/png');assert.equal(body.contents[0].parts[1].inlineData.data,png);
// Analyze the same photo with Gemini without persisting the bank statement.
const storedBefore=proofs.size;
const writtenRequest={...incoming,requestId:'image-written-only',text:'',images:[{mimeType:'image/png',data:png}],retainImages:false};
const written=await call(writtenRequest,actor('admin'));
assert.equal(proofs.size,storedBefore,'written-only analysis never uploads the photo');
assert.equal(written.ids.length,2);
for(const id of written.ids){const draft=store.get('groups/lodge/incomeDrafts/'+id);assert.equal(draft.receiptImageUrls.length,0);assert.ok(draft.sourceQuote);assert.equal(draft.sourceText,'');}
assert.equal(JSON.parse(captured.options.body).contents[0].parts[1].inlineData.data,png,'Gemini still receives the photo');
const callsAfterWritten=providerCalls;await call(writtenRequest,actor('admin'));assert.equal(providerCalls,callsAfterWritten);
await reject(()=>call({...writtenRequest,retainImages:true},actor('admin')),'failed-precondition');
await reject(()=>call({...incoming,requestId:'invalid-retention',retainImages:'false'},actor('admin')),'invalid-argument');
await reject(()=>call({...incoming,requestId:'invalid-image',images:[{mimeType:'image/png',data:'AAAA'}]},actor('admin')),'invalid-argument');
providerOutput={incomes:[row('Juan',100,'Juan Pérez pagó 100 de septiembre.')]};store.set('users/juan2',{name:'Juan López',role:'member',active:true,groupId:'lodge'});
const ambiguous=await call({...incoming,requestId:'ambiguous'},actor('admin'));assert.equal(store.get('groups/lodge/incomeDrafts/'+ambiguous.ids[0]).memberId,'','ambiguous names require manual correction');
console.log('Income import backend passed: separate text/image rows, only pending drafts, shared proof storage, idempotent retries, duplicate warning, ambiguous names, roles and invalid image guards.');

providerOutput={incomes:[row('Carlos Ríos',200,'Carlos Ríos pagó 200 de septiembre.')]};
const pdf=Buffer.from('%PDF-1.4\nmock statement').toString('base64');
const beforePdf=proofs.size;
const pdfRequest={...incoming,requestId:'pdf-import',text:'',images:[],documents:[{mimeType:'application/pdf',data:pdf}],retainImages:false};
const pdfResult=await call(pdfRequest,actor('admin'));
assert.equal(pdfResult.ids.length,1);assert.equal(proofs.size,beforePdf,'PDF never stored');
assert.equal(store.get('groups/lodge/incomeDrafts/'+pdfResult.ids[0]).status,'pending');
assert.equal(JSON.parse(captured.options.body).contents[0].parts[1].inlineData.mimeType,'application/pdf');
const afterPdf=providerCalls;await call(pdfRequest,actor('admin'));assert.equal(providerCalls,afterPdf);
await reject(()=>call({...pdfRequest,requestId:'bad-pdf',documents:[{mimeType:'application/pdf',data:'AAAA'}]},actor('admin')),'invalid-argument');
await reject(()=>call({...pdfRequest,requestId:'too-many-files',documents:Array(5).fill(pdfRequest.documents[0])},actor('admin')),'invalid-argument');
console.log('PDF callable passed: native Gemini document, text-only draft, invalid PDF guard and idempotent retry.');

const {bankCsv,bankPdfText}=await import('./income-bank-fixture.mjs');
providerStatus=429;
const importBank={...incoming,text:bankCsv,requestId:'bank-csv-corrected',images:[],retainImages:false};
const beforeMoney=[...store].filter(([path])=>path.includes('/ledger/')||path.includes('/treasury/')||path.includes('/paymentReceipts/'));
const bankRead=await call(importBank,actor('admin'));
assert.equal(bankRead.bankRead,true);assert.equal(bankRead.aiUsed,false);assert.equal(bankRead.ids.length,3);
const movements=Array.from(bankRead.ids,id=>store.get('groups/lodge/incomeDrafts/'+id));
assert.equal(movements.reduce((s,r)=>s+r.amount,0),1600);assert.deepEqual(movements.map(r=>r.date),['2026-10-01','2026-10-04','2026-10-04']);assert.ok(movements.every(r=>r.period===''&&r.status==='pending'&&!r.receiptImageUrls.length));
assert.deepEqual(movements.map(r=>r.reference),['900000000001','900000000004','900000000005']);assert.equal(movements.filter(r=>r.amount===400).length,2,'same payer/amount with different references stays separate');
assert.deepEqual([...store].filter(([path])=>path.includes('/ledger/')||path.includes('/treasury/')||path.includes('/paymentReceipts/')),beforeMoney,'bank reading writes no money');
const pdfAgain=await call({...importBank,text:bankPdfText,requestId:'same-bank-as-pdf'},actor('master'));
assert.deepEqual(Array.from(pdfAgain.ids),Array.from(bankRead.ids),'CSV and multi-page PDF reuse drafts by operation reference across admins');
assert.equal(new Set(pdfAgain.ids).size,3);
const collision=await call({...importBank,requestId:'bank-reference-conflict',text:bankCsv.replace(';800.00;',';900.00;')},actor('admin'));
assert.deepEqual(Array.from(collision.conflicts),['900000000001']);assert.equal(collision.created,0);assert.equal(collision.existing,2);
console.log('Bank CSV/PDF passed: exact dates/amounts/references, omitted returns/outgoings, separate equal payments, cross-admin deduplication, Gemini quota fallback, no financial writes.');

const combinedBank=await call({...importBank,text:bankCsv+'\n'+bankPdfText,requestId:'same-bank-two-files'},actor('admin'));assert.equal(combinedBank.ids.length,3);assert.deepEqual(Array.from(combinedBank.ids),Array.from(bankRead.ids),'PDF+CSV in one import deduplicate accents and references');

const csvHeader='"REFERENCE_ID","TRANSACTION_NET_AMOUNT","RELEASE_DATE","TRANSACTION_TYPE"';
const line=(ref,amount,date='2026-10-08')=>`"${ref}","${amount}","${date}","Transferencia recibida Juan Pérez"`;
const existingReceipt='000000000000000000000010';
const existingTreasury='000000000000000000000011';
const legacyPending='000000000000000000000012';
const conflictRef='000000000000000000000013';
const foreignReference='000000000000000000000014';
const olderDraft='000000000000000000000015';
store.set('groups/lodge/paymentReceipts/older-proof',{status:'approved',bankOriginalReference:existingReceipt,amount:1200.5,transferDate:'2026-10-08'});
store.set('groups/lodge/treasury/older-deposit',{type:'income',bankReference:existingTreasury,amount:30,date:'2026-10-08'});
store.set('groups/lodge/paymentReceipts/pending-upload',{status:'pending',bankReference:legacyPending,amount:20,transferDate:'2026-10-08'});
store.set('groups/lodge/treasury/different-amount',{type:'income',bankReference:conflictRef,amount:9999,date:'2026-10-08'});
store.set('groups/other/paymentReceipts/foreign-proof',{status:'approved',bankReference:foreignReference,amount:25,transferDate:'2026-10-08'});
for(let i=0;i<505;i++)store.set('groups/lodge/incomeDrafts/filler-'+i,{status:'rejected'});
store.set('groups/lodge/incomeDrafts/old-beyond-list-limit',{status:'approved',reference:'old-edit',approvedReview:{reference:olderDraft},amount:15,date:'2026-10-08'});
const fresh=Array.from({length:63},(_,i)=>line(String(7700000000000+i),'100.00','8/10/2026'));
const csvRows=[line(existingReceipt,'1,200.50'),line(existingTreasury,'30,00'),line(legacyPending,'20'),line(conflictRef,'10'),line(foreignReference,'25'),line(olderDraft,'15'),...fresh,fresh[0]];
const largeText=['CSV octubre.csv:',csvHeader,...csvRows].join('\r\n');
const beforeBankProvider=providerCalls;delete context.process.env.GEMINI_API_KEY;
const largerInput={...importBank,requestId:'larger-quoted-bank',text:largeText};
const importResult=await call(largerInput,actor('admin'));assert.equal(importResult.created,64);assert.equal(importResult.existing,4);assert.equal(importResult.repeatedRows,1);assert.deepEqual(Array.from(importResult.conflicts),[conflictRef]);assert.equal(providerCalls,beforeBankProvider,'structured bank import never calls Gemini');
assert.ok(importResult.ids.includes('old-beyond-list-limit'));assert.ok(Array.from(importResult.ids,id=>store.get('groups/lodge/incomeDrafts/'+id)).some(r=>r.reference===foreignReference),'same reference in another lodge is isolated');
assert.ok(Array.from(importResult.ids,id=>store.get('groups/lodge/incomeDrafts/'+id)).filter(r=>r.status==='pending').every(r=>r.sourceText===''&&r.sourceQuote.includes(r.reference)));
const sameRetry=await call(largerInput,actor('admin'));assert.deepEqual(JSON.parse(JSON.stringify(sameRetry)),JSON.parse(JSON.stringify(importResult)));
const duplicateBank=await call({...largerInput,requestId:'larger-reimport'},actor('master'));assert.equal(duplicateBank.created,0);assert.equal(duplicateBank.existing,68);
for(const [suffix,broken,expected] of [
 ['bad-date',line(foreignReference,'25','31/02/2026'),/línea 3.*fecha/],
 ['lost-folio',line('7.7E+12','25'),/línea 3.*folio/],
 ['missing-field','2026-10-08,25',/línea 3.*columnas/],
]){
 const before=[...store];
 await assert.rejects(call({...largerInput,requestId:suffix,text:['CSV otro.csv:',csvHeader,broken].join('\n')},actor('admin')),e=>e.code==='invalid-argument'&&expected.test(e.message));
 assert.deepEqual([...store],before,'invalid CSV creates no requests or drafts');
}
const beyondOldTextLimit=await call({...largerInput,requestId:'over-old-text-limit',text:'Nota de referencia '.repeat(1100)+'\n'+largeText},actor('master'));assert.equal(beyondOldTextLimit.created,0);
const concurrentText=csvHeader+'\n'+line('000000000000000000000099','250.00');
const concurrent=await Promise.all(['admin','master'].map(uid=>call({...largerInput,requestId:'concurrent-'+uid,text:concurrentText},actor(uid))));
assert.equal(concurrent.reduce((s,r)=>s+r.created,0),1);assert.equal(concurrent.reduce((s,r)=>s+r.existing,0),1);
console.log('CSV reconciliation passed: flexible headers/dates/amounts, over 30 deposits, exact folios across drafts/receipts/treasury, conflicts isolated, repeat and concurrent imports, no Gemini dependency, and actionable row errors without writes.');

const flexInput=(suffix,text,csvFiles=[])=>({...importBank,requestId:'flex-'+suffix,text,csvFiles});
const fromCsv=(text,headerLine,separator,mapping)=>({text,headerLine,separator,mapping:{reference:-1,date:-1,amount:-1,payer:-1,direction:-1,mode:'signed',dateOrder:'DMY',...mapping}});
const spanish=[
 'Estado de cuenta de prueba',
 'Clave de rastreo;Cargo;Nombre del ordenante;Fecha del movimiento;Abonos;Moneda',
 '  000ABC-001  ;;Juan Pérez;2026-10-23 21:05:00;1.200,50;MXN',
 'NO-IMPORTAR;400;Carlos Ríos;2026-10-24;;MXN',
 '900000000001;;Juan Pérez;2026-10-01;800;MXN',
].join('\n');
const spanishResult=await call(flexInput('spanish',spanish),actor('admin'));
assert.equal(spanishResult.created,1);assert.equal(spanishResult.existing,1);assert.equal(spanishResult.ignored,1);
const deposit=Array.from(spanishResult.ids,id=>store.get('groups/lodge/incomeDrafts/'+id)).find(d=>d.reference==='000ABC-001');
assert.equal(deposit.date,'2026-10-23');assert.equal(deposit.amount,1200.5);assert.equal(deposit.memberId,'juan');assert.equal(deposit.status,'pending');
const english=[
 'Transaction ID,Operation Type,Amount,Posting Date,Sender Name',
 '000ABC-001,Incoming transfer,"+1,200.50",10/23/2026,Juan Pérez',
 'NOT-IN,Outgoing transfer,200,10/23/2026,Carlos Ríos',
 '000ABC-002,Credit,800.01,10/24/2026,"Carlos, Ríos"',
].join('\r\n');
const englishResult=await call(flexInput('english',english),actor('master'));
assert.equal(englishResult.created,1);assert.equal(englishResult.existing,1);assert.equal(englishResult.ignored,1);
const englishDeposit=Array.from(englishResult.ids,id=>store.get('groups/lodge/incomeDrafts/'+id)).find(d=>d.reference==='000ABC-002');
assert.equal(englishDeposit.date,'2026-10-24');assert.equal(englishDeposit.amount,800.01);assert.equal(englishDeposit.memberId,'carlos');
const custom='Encabezado introductorio\nDía|ID único|Pesos\n2026/11/03|000-REF-Z1|400.00\n2026/11/04|OUT| -100.00';
const mapped=fromCsv(custom,2,'|',{reference:1,date:0,amount:2});
const reviewed=await call(flexInput('manual','',[mapped]),actor('admin'));assert.equal(reviewed.created,1);assert.equal(reviewed.ignored,1);
const manualDraft=store.get('groups/lodge/incomeDrafts/'+reviewed.ids[0]);
assert.equal(manualDraft.reference,'000-REF-Z1');assert.equal(manualDraft.status,'pending');assert.equal(manualDraft.period,'');assert.equal(manualDraft.memberId,'');
assert.match(manualDraft.sourceQuote,/000-REF-Z1/);
const mappedSame=await call(flexInput('manual-other-admin','',[mapped]),actor('master'));assert.equal(mappedSame.created,0);assert.equal(mappedSame.existing,1);
const ambiguousDateCsv='Fecha,Referencia,Abonos\n11/03/2026,000-REF-Z1,400.00';
await assert.rejects(call(flexInput('ambiguous-date',ambiguousDateCsv),actor('admin')),e=>e.code==='invalid-argument'&&/formato de fecha/.test(e.message));
const explicitDate=await call(flexInput('mapped-date','',[fromCsv(ambiguousDateCsv,1,',',{reference:1,date:0,amount:2,mode:'credit',dateOrder:'MDY'})]),actor('admin'));
assert.equal(explicitDate.created,0);assert.equal(explicitDate.existing,1);
const bankSame=['RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT','01-10-2026;SPEI recibido Juan Pérez;900000000001;800'].join('\n');
const newBankLabel=await call(flexInput('updated-bank-label','',[fromCsv(bankSame,1,';',{reference:2,date:0,amount:3,direction:1,mode:'typed'})]),actor('admin'));
assert.equal(newBankLabel.created,0);assert.equal(newBankLabel.existing,1);
for(const [suffix,bankArgs,reason] of [
 ['missing-ref',[spanish.replace('000ABC-001',''),[]],/línea 3.*folio/],
 ['rounded-ref',[spanish.replace('000ABC-001','2.123E+11'),[]],/línea 3.*folio/],
 ['not-mxn',[spanish.replace(';MXN',';USD'),[]],/línea 3.*moneda/],
 ['conflicting-refs',['',[mapped,{...mapped,text:custom.replace('400.00','500.00')}]],/mismo folio/],
 ['same-column',['',[{...mapped,mapping:{...mapped.mapping,reference:2}}]],/columnas/],
]){
 const before=[...store];
 await assert.rejects(call(flexInput(suffix,...bankArgs),actor('admin')),e=>e.code==='invalid-argument'&&reason.test(e.message));
 assert.deepEqual([...store],before,'invalid mapping or folio writes nothing');
}
assert.equal(providerCalls,beforeBankProvider,'every CSV was read without an AI key or provider call');
assert.deepEqual([...store].filter(([path])=>path.includes('/ledger/')||path.includes('/treasury/')||path.includes('/paymentReceipts/')).filter(entry=>!['older-proof','older-deposit','pending-upload','different-amount','foreign-proof'].includes(entry[0].split('/').pop())),beforeMoney);
console.log('Multiple bank CSV formats passed: Spanish and English headers, unknown columns explicitly mapped, date ambiguity, exact alphanumeric/zero-prefixed folios, old drafts across formats, outgoings ignored and no money posted.');

const shortDates=[
 'Fecha,Tipo y contraparte,Concepto,Importe,Folio',
 '6-Nov,Gasto — Proveedor,Servicio,"(2,400.00)",2.30000E+14',
 '24-Nov,Ingreso — Juan Pérez,Cuota,"1,200.50",000-CSV-X9',
 '23-nov.,Ingreso — Carlos Ríos,Abono,100.50,8.12345E+12',
 '3-noviembre,Ingreso — Carlos Ríos,Cuota,400,000-REF-Z1',
 '4-Nov-2025,Ingreso — Carlos Ríos,Cuota,200,000-ISO-X9',
].join('\r\n');
const shortInput=fromCsv(shortDates,1,',',{reference:4,date:0,amount:3,direction:1,mode:'typed'});
const emptyBankWrites=[...store];
await assert.rejects(call(flexInput('no-csv-year','',[shortInput]),actor('admin')),e=>e.code==='invalid-argument'&&/línea 3.*no trae año/.test(e.message));
await assert.rejects(call(flexInput('no-skip-confirmation','',[{...shortInput,year:'2026'}]),actor('admin')),e=>e.code==='invalid-argument'&&/línea 4.*notación científica/.test(e.message));
assert.deepEqual([...store],emptyBankWrites,'no draft or other write before valid year and exclusion choice');
const shortReady={...shortInput,year:'2026',skipInvalidFolios:true};
const shortImported=await call(flexInput('short-dates','',[shortReady]),actor('admin'));
assert.equal(shortImported.ignored,1,'parenthesized withdrawal is not imported');
assert.equal(shortImported.invalidFolios,1,'scientific abbreviation is not an exact reference');
assert.equal(shortImported.created,2);assert.equal(shortImported.existing,1);
const shortCaptured=Array.from(shortImported.ids,id=>store.get('groups/lodge/incomeDrafts/'+id));
for(const [folio,date,amount,payer] of [['000-CSV-X9','2026-11-24',1200.5,'juan'],['000-ISO-X9','2025-11-04',200,'carlos']]){
 const d=shortCaptured.find(r=>r.reference===folio);
 assert.equal(d.date,date);assert.equal(d.amount,amount);assert.equal(d.memberId,payer);assert.equal(d.status,'pending');assert.equal(d.period,'');
}
const shortRepeated=await call(flexInput('short-dates-reimport','',[shortReady]),actor('master'));
assert.equal(shortRepeated.created,0);assert.equal(shortRepeated.existing,3);assert.equal(shortRepeated.invalidFolios,1);
assert.equal(providerCalls,beforeBankProvider);
assert.deepEqual([...store].filter(([path])=>path.includes('/ledger/')||path.includes('/treasury/')||path.includes('/paymentReceipts/')),emptyBankWrites.filter(([path])=>path.includes('/ledger/')||path.includes('/treasury/')||path.includes('/paymentReceipts/')));
console.log('Bank CSV with month names and accounting negatives passed: explicit missing year, exact statement year preserved when provided, separate type and concept, no abbreviated references booked, and repeated folio kept unique.');
