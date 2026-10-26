import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";
const store = new Map();
let queue = Promise.resolve(),
  time = Date.now(),
  counter = 0,
  calls = 0,
  providerStatus = 200,
  captured;
const ref = (path) => ({
  path,
  id: path.split("/").at(-1),
  get: async () => snap(path),
});
const snap = (path) => ({
  exists: store.has(path),
  data: () => structuredClone(store.get(path)),
});
const db = {
  doc: ref,
  collection: (path) => ({ doc: () => ref(path + "/" + ++counter) }),
  runTransaction: (callback) => {
    const result = queue.then(async () => {
      const writes = [];
      const tx = {
        get: async (r) => snap(r.path),
        set: (r, value) => writes.push([r.path, value]),
        update: (r, value) =>
          writes.push([r.path, { ...store.get(r.path), ...value }]),
      };
      const value = await callback(tx);
      writes.forEach(([path, data]) => store.set(path, structuredClone(data)));
      return value;
    });
    queue = result.catch(() => {});
    return result;
  },
};
class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const functions = {
  region: () => ({ runWith: () => ({ https: { onCall: (fn) => fn } }) }),
  https: { HttpsError },
  logger: { warn: () => {} },
};
const bundled = await build({
  entryPoints: ["functions/src/meetingMinutes.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  plugins: [
    {
      name: "mock-sdk",
      setup(b) {
        b.onResolve(
          { filter: /^(firebase-admin|firebase-functions)$/ },
          (args) => ({ path: args.path, namespace: "mock" }),
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
          contents:
            args.path === "firebase-admin"
              ? "export const firestore=()=>globalThis.__db;"
              : "export const {region,https,logger}=globalThis.__functions;",
        }));
      },
    },
  ],
});
class FakeDate extends Date {
  static now() {
    return time;
  }
}
const context = {
  module: { exports: {} },
  __db: db,
  __functions: functions,
  process: { env: { GEMINI_API_KEY: "test-key-no-real-provider" } },
  Date: FakeDate,
  AbortSignal,
  fetch: async (url, options) => {
    calls++;
    captured = { url, options };
    return {
      ok: providerStatus === 200,
      status: providerStatus,
      json: async () => ({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    fields: [{ id: "f", value: "No consta", evidenceIds: [] }],
                  }),
                },
              ],
            },
          },
        ],
      }),
    };
  },
};
vm.runInNewContext(bundled.outputFiles[0].text, context);
const call = context.module.exports.organizeMeetingMinutes;
store.set("users/sec", {
  role: "member",
  lodgeRole: "secretario",
  groupId: "lodge",
  active: true,
});
store.set("users/member", { role: "member", groupId: "lodge", active: true });
store.set("users/admin", { role: "admin", groupId: "lodge", active: true });
store.set("users/master", { role: "master", active: true });
store.set("groups/lodge", { active: true });
const actor = (uid) => ({
  auth: { uid, token: { auth_time: Math.floor(time / 1000) } },
});
const data = {
  groupId: "lodge",
  date: "2026-10-26",
  title: "Tenida",
  notes: "",
  texts: [
    {
      id: "t",
      atMs: 0,
      speaker: { uid: "member", name: "Hermano" },
      text: "Propongo revisar el calendario.",
    },
  ],
  fields: [
    {
      id: "f",
      title: "Acuerdos",
      instruction: "Extraer solo acuerdos adoptados.",
    },
  ],
};
await assert.rejects(call(data, {}), (e) => e.code === "unauthenticated");
await assert.rejects(
  call(data, actor("member")),
  (e) => e.code === "permission-denied",
);
await assert.rejects(
  call({ ...data, groupId: "foreign" }, actor("admin")),
  (e) => e.code === "permission-denied",
);
assert.equal(
  (await call({ groupId: "lodge", action: "status" }, actor("sec"))).configured,
  true,
);
delete context.process.env.GEMINI_API_KEY;
await assert.rejects(
  call(data, actor("sec")),
  (e) => e.code === "failed-precondition",
);
assert.equal(calls, 0);
context.process.env.GEMINI_API_KEY = "test-key-no-real-provider";
await assert.rejects(
  call({ ...data, fields: [] }, actor("sec")),
  (e) => e.code === "invalid-argument",
);
const result = await call(data, actor("sec"));
assert.equal(result.fields[0].id, "f");
assert.equal(calls, 1);
const request = JSON.parse(captured.options.body);
assert.equal(request.contents.length, 1);
assert.ok(!JSON.stringify(request).includes("inlineData"));
assert.ok(
  !JSON.stringify([...store]).includes(data.texts[0].text),
  "meeting transcript is not logged or stored in server locks",
);
assert.equal(store.get("secretariatAnalysisLocks/sec").inProgress, false);
await assert.rejects(
  call(data, actor("sec")),
  (e) => e.code === "resource-exhausted",
);
store.set("accountSecurity/admin", { mustChangePassword: true });
await assert.rejects(
  call(data, actor("admin")),
  (e) => e.code === "permission-denied",
);
store.set("accountSecurity/admin", {
  mustChangePassword: false,
  validAfterSeconds: Math.floor(time / 1000) + 100,
});
await assert.rejects(
  call(data, actor("admin")),
  (e) => e.code === "permission-denied",
);
time += 61000;
providerStatus = 429;
await assert.rejects(
  call(data, actor("sec")),
  (e) => e.code === "resource-exhausted",
);
assert.equal(store.get("secretariatAnalysisLocks/sec").inProgress, false);
store.set("groups/lodge", { active: false });
await assert.rejects(
  call(data, actor("sec")),
  (e) => e.code === "failed-precondition",
);
providerStatus = 200;
await call(data, actor("master"));
assert.equal(calls, 3);
console.log(
  "Secretariat backend passed: authenticated secretary/admin/master only, group/session/suspension guards, configuration without fake results, bounded input, text-only provider call, validated output, cooldown and cleanup, no transcript or credentials in state.",
);
