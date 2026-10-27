import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";
const code = await build({
  entryPoints: ["functions/src/meetingAudioPolicy.ts"],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
});
const context = { module: { exports: {} }, Date, Set };
vm.runInNewContext(code.outputFiles[0].text, context);
const p = context.module.exports;
const take = (id, offsetMs = 0) => ({
  id,
  offsetMs,
  durationMs: 2000,
  mime: "audio/mp4;codecs=mp4a.40.2",
  size: 100,
  path: `meetingAudio/lodge/sec/meeting/${id}`,
});
const input = p.validateAudioInput(
  {
    groupId: "lodge",
    meetingId: "meeting",
    requestId: "job",
    title: "Tenida",
    date: "2026-10-27",
    notes: "",
    takes: [take("a"), take("b", 2000)],
    fields: [
      {
        id: "agreements",
        title: "Acuerdos",
        instruction: "Solo acuerdos aprobados",
      },
    ],
    marks: [
      { atMs: 0, speaker: { uid: "sec", name: "Secretario" } },
      { atMs: 2000, speaker: { uid: "carlos", name: "Carlos" } },
    ],
  },
  "sec",
);
assert.equal(p.providerMime(input.takes[0].mime), "audio/m4a");
const result = {
  transcript: [
    { id: "t1", takeId: "a", startMs: 0, text: "Primer audio." },
    { id: "t2", takeId: "b", startMs: 50, text: "Segundo audio." },
  ],
  fields: [{ id: "agreements", value: "Sin acuerdos", evidenceIds: ["t2"] }],
};
const value = p.validateAudioResult(result, input);
assert.equal(value.texts[1].atMs, 2050);
assert.equal(value.texts[1].speaker.name, "Carlos");
assert.ok(value.originalTranscript.includes("Primer audio."));
assert.ok(value.originalTranscript.includes("Segundo audio."));
assert.throws(() =>
  p.validateAudioInput(
    {
      ...input,
      requestId: "j",
      takes: [{ ...take("a"), path: "meetingAudio/other/sec/meeting/a" }],
    },
    "sec",
  ),
);
assert.throws(() =>
  p.validateAudioInput(
    { ...input, requestId: "j", takes: [take("a"), take("b", 0)] },
    "sec",
  ),
);
assert.throws(() =>
  p.validateAudioInput(
    {
      ...input,
      requestId: "j",
      takes: [{ ...take("a"), size: 61 * 1024 * 1024 }],
    },
    "sec",
  ),
);
assert.throws(() =>
  p.validateAudioResult(
    { ...result, transcript: [result.transcript[1], result.transcript[0]] },
    input,
  ),
);
assert.throws(() =>
  p.validateAudioResult(
    { ...result, transcript: [{ ...result.transcript[0], startMs: 999999 }] },
    input,
  ),
);
assert.throws(() =>
  p.validateAudioResult(
    {
      ...result,
      fields: [
        { id: "agreements", value: "Inventado", evidenceIds: ["unknown"] },
      ],
    },
    input,
  ),
);
const prompt = p.audioInstructions(input, [
  {
    uri: "https://generativelanguage.googleapis.com/v1beta/files/a",
    mime: "audio/m4a",
  },
  {
    uri: "https://generativelanguage.googleapis.com/v1beta/files/b",
    mime: "audio/m4a",
  },
]);
assert.equal(
  prompt.contents[0].parts.filter((part) => part.fileData).length,
  2,
);
assert.ok(prompt.generationConfig.responseSchema.properties.transcript);
assert.ok(prompt.generationConfig.responseSchema.properties.fields);
console.log(
  "Audio policy passed: MP4/M4A normalization, ordered multi-take inputs, bounded private paths, speaker timing, original transcript and evidence-backed summary from one request.",
);
