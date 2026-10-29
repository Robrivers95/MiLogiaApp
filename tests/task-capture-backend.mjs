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
const query = (path) => ({
  where: () => query(path),
  limit: () => query(path),
  get: async () => ({
    docs: [...store.keys()]
      .filter(
        (k) =>
          k.startsWith(path + "/") &&
          !k.slice(path.length+1).includes("/") &&
          store.get(k).groupId === "lodge",
      )
      .map(snap),
  }),
});
const db = {
  doc: ref,
  collection: query,
  runTransaction: (callback) => {
    const result = queue.then(async () => {
      const writes = [];
      const tx = {
        get: async (r) => snap(r.path),
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
await reject(()=>call({...incoming,requestId:'invalid-image',images:[{mimeType:'image/png',data:'AAAA'}]},actor('admin')),'invalid-argument');
providerOutput={incomes:[row('Juan',100,'Juan Pérez pagó 100 de septiembre.')]};store.set('users/juan2',{name:'Juan López',role:'member',active:true,groupId:'lodge'});
const ambiguous=await call({...incoming,requestId:'ambiguous'},actor('admin'));assert.equal(store.get('groups/lodge/incomeDrafts/'+ambiguous.ids[0]).memberId,'','ambiguous names require manual correction');
console.log('Income import backend passed: separate text/image rows, only pending drafts, shared proof storage, idempotent retries, duplicate warning, ambiguous names, roles and invalid image guards.');
