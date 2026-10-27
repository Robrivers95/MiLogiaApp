import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
const bundled = await build({
  entryPoints: ["services/taskCapture.ts"],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
});
const context = { module: { exports: {} }, crypto: webcrypto, Date, Set };
vm.runInNewContext(bundled.outputFiles[0].text, context);
const m = context.module.exports;
const t = {
  ...m.blankTask(),
  title: "Organizar visita",
  description: "Confirmar lugar",
  assigneeIds: ["carlos"],
  dueDate: "2026-11-15",
};
assert.equal(m.confirmationPayload([t])[0].title, t.title);
assert.throws(
  () => m.confirmationPayload([{ ...t, assigneeIds: [] }]),
  /responsables/,
);
assert.throws(
  () => m.confirmationPayload([{ ...t, dueDate: "2026-02-30" }]),
  /fecha/,
);
assert.throws(() => m.confirmationPayload([t, t]), /repetido/);
assert.throws(() => m.confirmationPayload([{ ...t, selected: false }]), /doce/);
assert.equal(
  m.confirmationPayload([{ ...t, sourceQuote: "Texto privado del acta" }])[0]
    .sourceQuote,
  undefined,
  "private source is not persisted in shared tasks",
);
assert.equal(
  m.confirmationPayload([
    { ...t, assigneeIds: ["abraham"], description: "Cambió el responsable" },
  ])[0].assigneeIds[0],
  "abraham",
);
for (const role of ["admin", "master", "member"])
  assert.equal(m.canCapture({ role, active: true, groupId: "lodge" }), true);
for (const user of [
  { role: "viewer", active: true, groupId: "lodge" },
  { role: "member", active: false, groupId: "lodge" },
  { role: "member", active: true, groupId: "" },
])
  assert.equal(m.canCapture(user), false);
console.log(
  "Task capture domain passed: corrected payloads, required assignees, calendar dates, duplicate proposals, source minimization and active roles.",
);
