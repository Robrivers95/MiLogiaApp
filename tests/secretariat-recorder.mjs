import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
const code = await build({
  entryPoints: ["services/meetingRecorder.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  plugins: [
    {
      name: "isolated-storage",
      setup(b) {
        b.onResolve({ filter: /\/meetingLocal$/ }, (args) => ({
          path: args.path,
          namespace: "mock",
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
          contents:
            "export const saveMeetingChunk=(...args)=>globalThis.__saveChunk(...args);",
        }));
      },
    },
  ],
});
let now = 0,
  failSave = false,
  stored = [],
  currentMedia,
  currentTrack,
  cancelPermission;
class FakeRecorder {
  static isTypeSupported(type) {
    return type === "audio/mp4";
  }
  constructor(stream, options) {
    this.mimeType = options.mimeType;
    this.state = "inactive";
    currentMedia = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable({ data: new Blob(["final-audio"]) });
    queueMicrotask(() => this.onstop());
  }
}
const context = {
  module: { exports: {} },
  crypto: webcrypto,
  performance: { now: () => now },
  MediaRecorder: FakeRecorder,
  Blob,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  navigator: {
    mediaDevices: {
      getUserMedia: async () => {
        if (cancelPermission)
          await new Promise((resolve) => {
            cancelPermission = resolve;
          });
        currentTrack = {
          stopped: false,
          stop() {
            this.stopped = true;
          },
        };
        return {
          getTracks: () => [currentTrack],
          getAudioTracks: () => [currentTrack],
        };
      },
    },
  },
  window: {},
  __saveChunk: async (...args) => {
    if (failSave) throw Error("quota");
    stored.push(args);
  },
};
vm.runInNewContext(code.outputFiles[0].text, context);
const Recorder = context.module.exports.MeetingRecorder;
function harness() {
  let draft = {
      id: "draft",
      durationMs: 1000,
      takes: [],
      marks: [],
      texts: [],
      revision: 0,
    },
    states = [],
    warnings = [],
    backups = [],
    persisted = 0,
    resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  const r = new Recorder({
    draft: () => draft,
    change: (edit) => {
      draft = edit(draft);
    },
    warning: (message) => warnings.push(message),
    state: (state) => {
      states.push(state);
      if (state === "idle") resolveDone();
    },
    meter: () => {},
    backup: (take, blob) => backups.push({ take, blob }),
    persist: async () => {
      persisted++;
    },
  });
  return {
    r,
    done,
    states,
    warnings,
    backups,
    get draft() {
      return draft;
    },
    get persisted() {
      return persisted;
    },
  };
}
let h = harness();
await h.r.start(false);
now = 1500;
currentMedia.ondataavailable({ data: new Blob(["partial-audio"]) });
for (let i = 0; i < 30 && h.draft.durationMs !== 2500; i++)
  await new Promise((resolve) => setTimeout(resolve, 1));
assert.equal(
  h.draft.durationMs,
  2500,
  "committed chunks persist their timeline before the recording ends",
);
assert.equal(h.draft.takes[0].complete, false);
now = 2500;
currentTrack.onended();
await h.done;
assert.equal(h.draft.durationMs, 3500);
assert.equal(h.draft.takes[0].complete, true);
assert.equal(currentTrack.stopped, true);
assert.equal(stored.length, 2);
assert.ok(h.warnings.some((m) => m.includes("interrumpió")));
assert.equal(h.backups.length, 0);
assert.ok(h.persisted >= 2);
failSave = true;
h = harness();
await h.r.start(false);
now += 1000;
currentMedia.ondataavailable({ data: new Blob(["middle-audio"]) });
await h.done;
assert.equal(h.draft.takes[0].complete, false);
assert.ok(h.backups[0].blob.size > 10);
assert.ok(h.warnings.some((m) => m.includes("respaldo")));
assert.equal(currentMedia.state, "inactive");
assert.equal(
  currentTrack.stopped,
  true,
  "storage error stops capture rather than continuing without saving",
);
failSave = false;
const original = context.navigator.mediaDevices.getUserMedia;
context.navigator.mediaDevices.getUserMedia = async () => {
  throw Error("permission denied");
};
h = harness();
await assert.rejects(h.r.start(false), /permission denied/);
assert.equal(h.states.at(-1), "idle");
context.navigator.mediaDevices.getUserMedia = original;
cancelPermission = true;
h = harness();
const pending = h.r.start(false);
h.r.dispose();
cancelPermission();
await pending;
assert.equal(
  currentTrack.stopped,
  true,
  "late permission grant after leaving never starts recording",
);
console.log(
  "Meeting recorder failure tests passed: disconnected microphone finalizes audio, quota failure stops and offers an in-memory backup, permission rejection resets controls, and late permissions cannot start abandoned capture.",
);
