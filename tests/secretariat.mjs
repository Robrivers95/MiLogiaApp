import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
async function bundled(path) {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
  });
  const context = {
    module: { exports: {} },
    crypto: webcrypto,
    Date,
    Set,
    Number,
    JSON,
  };
  vm.runInNewContext(result.outputFiles[0].text, context);
  return context.module.exports;
}
const m = await bundled("services/meetingModel.ts");
const p = await bundled("functions/src/meetingPolicy.ts");
const mark = (atMs, uid) => ({
  id: String(atMs) + uid,
  atMs,
  speaker: uid ? { uid, name: uid } : null,
});
const marks = [mark(0, "a"), mark(2000, "b"), mark(2000, "c")];
assert.equal(
  m.speakerAt(marks, 2000).uid,
  "c",
  "latest selection wins equal timestamps",
);
assert.equal(m.speakerAt(marks, 1500).uid, "a");
assert.equal(m.speakerAt(marks, -1), null);
const srt = m.parseTranscript(
  "1\n00:00:01,000 --> 00:00:03,000\nIdea expuesta.\n\n2\n00:00:04,000 --> 00:00:06,000\nComentario.",
  marks,
);
assert.equal(srt.length, 2);
assert.equal(srt[0].speaker.uid, "a");
assert.equal(srt[1].speaker.uid, "c");
assert.equal(
  m.parseTranscript(
    "WEBVTT\n\n00:01.000 --> 00:02.000\nComentario",
    marks,
    3000,
  )[0].speaker.uid,
  "c",
);
assert.equal(m.parseTranscript("Texto sin tiempos.", marks)[0].speaker, null);
const long = m.parseTranscript("x".repeat(10000), []);
assert.equal(long.length, 2);
assert.ok(long.every((t) => t.text.length <= 8000));
assert.throws(() => m.parseTranscript("x".repeat(120001), []));
const d = m.newMeeting("owner", "group");
d.texts = srt;
d.fields[0].value = "Mi corrección";
d.fields[0].origin = "manual";
d.fields[1].manualOnly = true;
const prompt = m.meetingPrompt(d);
assert.ok(!prompt.includes(d.fields[0].id));
assert.ok(!prompt.includes(d.fields[1].id));
assert.ok(prompt.includes("No inventes"));
const restored = m.restoreMeetingBackup(
  JSON.stringify(d),
  "new-owner",
  "group",
);
assert.equal(restored.ownerUid, "new-owner");
assert.notEqual(restored.id, d.id);
assert.equal(restored.takes.length, 0);
assert.equal(restored.fields[0].origin, "manual");
assert.throws(() =>
  m.restoreMeetingBackup(JSON.stringify(d), "owner", "foreign"),
);
assert.throws(() =>
  m.restoreMeetingBackup(
    JSON.stringify({ ...d, fields: null }),
    "owner",
    "group",
  ),
);
assert.equal(
  p.canAnalyzeMeeting(
    { role: "member", groupId: "g", active: true, lodgeRole: "secretario" },
    "g",
  ),
  true,
);
for (const actor of [
  { role: "member", groupId: "g" },
  { role: "viewer", groupId: "g" },
  { role: "admin", groupId: "foreign" },
  { role: "member", groupId: "g", active: false, lodgeRole: "secretario" },
])
  assert.equal(p.canAnalyzeMeeting(actor, "g"), false);
assert.equal(p.canAnalyzeMeeting({ role: "master" }, "g"), true);
const input = {
  groupId: "g",
  title: "Tenida",
  date: "2026-10-26",
  notes: "",
  texts: srt,
  fields: [{ id: "f", title: "Acuerdos", instruction: "Extrae acuerdos." }],
};
const { ids } = p.validateMeetingInput(input);
assert.throws(() =>
  p.validateMeetingInput({ ...input, texts: [srt[0], srt[0]] }),
);
assert.throws(() => p.validateMeetingInput({ ...input, fields: [] }));
assert.throws(() =>
  p.validateMeetingResult(
    { fields: [{ id: "other", value: "x", evidenceIds: [] }] },
    input.fields,
    ids,
  ),
);
assert.throws(() =>
  p.validateMeetingResult(
    { fields: [{ id: "f", value: "x", evidenceIds: ["invented"] }] },
    input.fields,
    ids,
  ),
);
assert.equal(
  p.validateMeetingResult(
    { fields: [{ id: "f", value: "No consta", evidenceIds: [] }] },
    input.fields,
    ids,
  ).fields[0].value,
  "No consta",
);
const payload = JSON.stringify(p.meetingInstructions(input));
assert.ok(payload.includes("BORRADOR"));
assert.ok(payload.includes("No inventes"));
assert.ok(
  !payload.includes("inlineData"),
  "organizer receives text, never recorded audio",
);
console.log(
  "Secretariat domain passed: speaker boundaries/ties, timed/plain/offset/long imports, private backup restore, manual field preservation, role/group guards, bounded input, evidence validation and text-only AI prompt.",
);
