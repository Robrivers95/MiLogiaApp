// A single opt-in provider smoke test using synthetic speech, never a real meeting.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { googleFile } = require("../functions/lib/meetingAudio.js");
const {
  validateAudioInput,
  audioInstructions,
  validateAudioResult,
} = require("../functions/lib/meetingAudioPolicy.js");
const key = process.env.MEETING_GEMINI_KEY,
  model = process.env.MEETING_GEMINI_MODEL || "gemini-flash-latest";
if (!key) throw Error("Missing server test key");
const buffer = Buffer.from(
  readFileSync("tests/fixtures/meeting-smoke.m4a.b64", "utf8").trim(),
  "base64",
);
let file;
try {
  file = await googleFile(buffer, "audio/m4a", key, "synthetic-meeting-smoke");
  const input = validateAudioInput(
    {
      groupId: "smoke",
      meetingId: "synthetic",
      requestId: "test",
      date: "2026-10-27",
      title: "Synthetic smoke",
      notes: "",
      takes: [
        {
          id: "take",
          path: "meetingAudio/smoke/test/synthetic/take",
          size: buffer.length,
          mime: "audio/mp4",
          offsetMs: 0,
          durationMs: 15000,
        },
      ],
      marks: [],
      fields: [
        {
          id: "summary",
          title: "Resumen",
          instruction: "Resume en una oración lo dicho. No inventes.",
        },
      ],
    },
    "test",
  );
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(
        audioInstructions(input, [{ uri: file.uri, mime: "audio/m4a" }]),
      ),
      signal: AbortSignal.timeout(180000),
    },
  );
  if (!response.ok) throw Error("Gemini audio smoke HTTP " + response.status);
  const body = await response.json(),
    candidate = body.candidates?.[0];
  if (candidate?.finishReason !== "STOP")
    throw Error("Synthetic audio result incomplete");
  const result = validateAudioResult(
    JSON.parse(
      candidate.content.parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join(""),
    ),
    input,
  );
  if (
    !/secret|report|Carlos/i.test(result.originalTranscript) ||
    !result.fields[0]?.value
  )
    throw Error("Synthetic speech did not yield a transcript and report");
  console.log(
    "Live Gemini audio smoke passed: synthetic M4A uploaded, transcribed and summarized in one generation request. No private recording or task was used.",
  );
} finally {
  if (file?.name)
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${file.name}`,
      { method: "DELETE", headers: { "x-goog-api-key": key } },
    );
}
