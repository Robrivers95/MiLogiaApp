import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";
import { createRequire } from "node:module";
const store = new Map();
let queue = Promise.resolve(),
  time = Date.now(),
  modelCalls = 0,
  uploads = 0,
  deletes = 0,
  providerStatus = 200,
  finish = "STOP",
  badMetadata = false;
const snap = (path) => ({
  id: path.split("/").at(-1),
  ref: ref(path),
  exists: store.has(path),
  data: () => structuredClone(store.get(path)),
});
const ref = (path) => ({
  path,
  id: path.split("/").at(-1),
  get: async () => snap(path),
  update: async (patch) =>
    store.set(path, structuredClone({ ...store.get(path), ...patch })),
});
const db = {
  doc: ref,
  runTransaction: (callback) => {
    const next = queue.then(async () => {
      const writes = [];
      const tx = {
        get: async (r) => snap(r.path),
        set: (r, v) => writes.push([r.path, v]),
        update: (r, v) => writes.push([r.path, { ...store.get(r.path), ...v }]),
      };
      const result = await callback(tx);
      writes.forEach(([k, v]) => store.set(k, structuredClone(v)));
      return result;
    });
    queue = next.catch(() => {});
    return next;
  },
};
class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
class FakeDate extends Date {
  static now() {
    return time;
  }
}
const builder = {
  https: { onCall: (fn) => fn },
  firestore: { document: () => ({ onCreate: (fn) => fn }) },
};
const functions = {
  region: () => ({ runWith: () => builder }),
  https: { HttpsError },
};
const code = await build({
  entryPoints: ["functions/src/meetingAudio.ts"],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  plugins: [
    {
      name: "isolated-audio-sdk",
      setup(b) {
        b.onResolve(
          { filter: /^(firebase-admin|firebase-functions)$/ },
          (args) => ({ path: args.path, namespace: "mock" }),
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
          contents:
            args.path === "firebase-admin"
              ? "export const firestore=()=>globalThis.__db;export const storage=()=>globalThis.__storage;"
              : "export const {region,https}=globalThis.__functions;",
        }));
      },
    },
  ],
});
const output = {
  transcript: [
    { id: "t1", takeId: "a", startMs: 0, text: "Se acordó revisar el acta." },
    { id: "t2", takeId: "b", startMs: 0, text: "Carlos confirmará el lugar." },
  ],
  fields: [
    {
      id: "agreements",
      value: "Revisar acta y confirmar lugar.",
      evidenceIds: ["t1", "t2"],
    },
  ],
};
const context = {
  module: { exports: {} },
  require: createRequire(import.meta.url),
  Buffer,
  URL,
  Date: FakeDate,
  Set,
  Promise,
  AbortSignal,
  setTimeout,
  __db: db,
  __functions: functions,
  __storage: {
    bucket: () => ({
      file: (path) => ({
        getMetadata: async () => [
          {
            size: badMetadata ? 999 : 100,
            contentType: "audio/mp4",
            generation: "1",
          },
        ],
        download: async () => [Buffer.alloc(100)],
      }),
    }),
  },
  process: { env: { GEMINI_API_KEY: "AQ.synthetic-test-only" } },
  fetch: async (url, options = {}) => {
    if (options.method === "DELETE") {
      deletes++;
      return { ok: true };
    }
    if (url.endsWith("/upload/v1beta/files"))
      return {
        ok: true,
        headers: {
          get: () =>
            "https://generativelanguage.googleapis.com/upload/test-session",
        },
      };
    if (url.includes("/upload/test-session")) {
      uploads++;
      assert.equal(options.headers["Content-Type"], "audio/m4a");
      return {
        ok: true,
        json: async () => ({
          file: {
            name: "files/test-" + uploads,
            uri:
              "https://generativelanguage.googleapis.com/v1beta/files/test-" +
              uploads,
            state: "ACTIVE",
          },
        }),
      };
    }
    if (url.includes(":generateContent")) {
      modelCalls++;
      const request = JSON.parse(options.body);
      assert.equal(
        request.contents[0].parts.filter((p) => p.fileData).length,
        2,
        "all takes are included in one generation",
      );
      return {
        ok: providerStatus === 200,
        status: providerStatus,
        json: async () => ({
          candidates: [
            {
              finishReason: finish,
              content: { parts: [{ text: JSON.stringify(output) }] },
            },
          ],
        }),
      };
    }
    throw Error("Unexpected provider request");
  },
};
vm.runInNewContext(code.outputFiles[0].text, context);
const { meetingAudioService: start, processMeetingAudio: process } =
  context.module.exports;
for (const [id, role, groupId, extra] of [
  ["sec", "member", "lodge", { lodgeRole: "secretario" }],
  ["admin", "admin", "lodge", {}],
  ["master", "master", "", {}],
  ["member", "member", "lodge", {}],
  ["foreign", "admin", "other", {}],
])
  store.set("users/" + id, { role, groupId, active: true, ...extra });
store.set("groups/lodge", { active: true });
const actor = (uid) => ({
  auth: { uid, token: { auth_time: Math.floor(time / 1000) } },
});
const take = (id, offsetMs) => ({
  id,
  offsetMs,
  durationMs: 2000,
  mime: "audio/mp4",
  size: 100,
  path: `meetingAudio/lodge/sec/meeting/${id}`,
});
const data = {
  action: "start",
  requestId: "job1",
  groupId: "lodge",
  meetingId: "meeting",
  title: "Tenida",
  date: "2026-10-27",
  notes: "",
  takes: [take("a", 0), take("b", 2000)],
  marks: [],
  fields: [
    { id: "agreements", title: "Acuerdos", instruction: "Acuerdos aprobados" },
  ],
};
const reject = (fn, code) => assert.rejects(fn, (e) => e.code === code);
await reject(() => start(data, {}), "unauthenticated");
for (const id of ["member", "foreign"])
  await reject(() => start(data, actor(id)), "permission-denied");
assert.equal(
  (await start({ action: "status", groupId: "lodge" }, actor("sec")))
    .configured,
  true,
);
assert.equal(modelCalls, 0);
await reject(
  () =>
    start(
      {
        ...data,
        takes: [
          { ...data.takes[0], path: "meetingAudio/foreign/sec/meeting/a" },
        ],
      },
      actor("sec"),
    ),
  "invalid-argument",
);
await start(data, actor("sec"));
await start(data, actor("sec"));
assert.equal(store.get("meetingAudioJobs/job1").state, "queued");
assert.equal(
  modelCalls,
  0,
  "start only queues; no generation in mobile request",
);
await Promise.all([
  process(snap("meetingAudioJobs/job1")),
  process(snap("meetingAudioJobs/job1")),
]);
assert.equal(modelCalls, 1);
assert.equal(uploads, 2);
assert.equal(deletes, 2);
assert.equal(store.get("meetingAudioJobs/job1").state, "done");
assert.ok(
  store
    .get("meetingAudioJobs/job1")
    .result.originalTranscript.includes("Carlos"),
);
assert.equal(store.get("meetingAudioJobs/job1").result.fields.length, 1);
await start(data, actor("sec"));
await process(snap("meetingAudioJobs/job1"));
assert.equal(
  modelCalls,
  1,
  "lost response/repeated delivery reuses completed result",
);
await reject(
  () => start({ ...data, title: "Otro título" }, actor("sec")),
  "permission-denied",
);
time += 61000;
await start({ ...data, requestId: "wrong-size" }, actor("sec"));
badMetadata = true;
await process(snap("meetingAudioJobs/wrong-size"));
badMetadata = false;
assert.equal(store.get("meetingAudioJobs/wrong-size").state, "failed");
assert.equal(
  modelCalls,
  1,
  "invalid stored object rejected before provider calls",
);
time += 61000;
await start({ ...data, requestId: "revoked" }, actor("sec"));
store.set("accountSecurity/sec", { mustChangePassword: true });
await process(snap("meetingAudioJobs/revoked"));
store.delete("accountSecurity/sec");
assert.equal(store.get("meetingAudioJobs/revoked").state, "failed");
assert.equal(modelCalls, 1, "session revoked after queuing cannot process");
time += 61000;
await start({ ...data, requestId: "suspended" }, actor("sec"));
store.set("groups/lodge", { active: false });
await process(snap("meetingAudioJobs/suspended"));
store.set("groups/lodge", { active: true });
assert.equal(store.get("meetingAudioJobs/suspended").state, "failed");
assert.equal(modelCalls, 1);
time += 61000;
await start({ ...data, requestId: "quota" }, actor("sec"));
providerStatus = 429;
await process(snap("meetingAudioJobs/quota"));
assert.equal(store.get("meetingAudioJobs/quota").state, "failed");
assert.match(store.get("meetingAudioJobs/quota").error, /límite/);
assert.equal(store.get("secretariatAnalysisLocks/sec").inProgress, false);
providerStatus = 200;
time += 61000;
await start({ ...data, requestId: "truncated" }, actor("sec"));
finish = "MAX_TOKENS";
await process(snap("meetingAudioJobs/truncated"));
assert.equal(store.get("meetingAudioJobs/truncated").state, "failed");
assert.equal(
  store.get("meetingAudioJobs/truncated").result,
  undefined,
  "truncated transcript never presented as complete",
);
assert.equal([...store.keys()].filter((k) => k.includes("/tasks/")).length, 0);
assert.equal(
  [...store.keys()].filter((k) => k.includes("/treasury/")).length,
  0,
);
console.log(
  "Audio service passed: authorized private queue, one generation for multiple takes, duplicate delivery/result reuse, immutable object validation, revoked/suspended guards, quota errors, file cleanup, no truncated or fake results and no task/money writes.",
);
