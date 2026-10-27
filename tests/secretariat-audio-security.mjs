import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { ref, uploadBytes, getBytes, updateMetadata } from "firebase/storage";
const env = await initializeTestEnvironment({
  projectId: "demo-mi-logia-security",
  firestore: {
    rules: readFileSync("firestore.rules", "utf8"),
    host: "127.0.0.1",
    port: 8085,
  },
  storage: {
    rules: readFileSync("storage.rules", "utf8"),
    host: "127.0.0.1",
    port: 9199,
  },
});
try {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [id, data] of Object.entries({
      sec: {
        role: "member",
        lodgeRole: "secretario",
        groupId: "lodge",
        active: true,
      },
      other: {
        role: "member",
        lodgeRole: "secretario",
        groupId: "lodge",
        active: true,
      },
      foreign: { role: "member", groupId: "other", active: true },
    }))
      await setDoc(doc(db, "users", id), data);
    await setDoc(doc(db, "groups/lodge"), { active: true });
    await setDoc(doc(db, "meetingAudioJobs/job"), {
      uid: "sec",
      groupId: "lodge",
      state: "done",
      result: { originalTranscript: "Texto privado" },
    });
  });
  await env.withSecurityRulesDisabled(async ctx=>{
    await uploadBytes(ref(ctx.storage(),'templeStudy/liturgia-primer-grado.pdf'),new Uint8Array([37,80,68,70]),{contentType:'application/pdf'});
  });
  const reader=env.authenticatedContext('reader').storage();
  await assertSucceeds(getBytes(ref(reader,'templeStudy/liturgia-primer-grado.pdf')));
  await assertFails(getBytes(ref(env.unauthenticatedContext().storage(),'templeStudy/liturgia-primer-grado.pdf')));
  await assertFails(uploadBytes(ref(reader,'templeStudy/liturgia-primer-grado.pdf'),new Uint8Array([1]),{contentType:'application/pdf'}));
  await assertFails(uploadBytes(ref(reader,'templeStudy/other.pdf'),new Uint8Array([1]),{contentType:'application/pdf'}));
  const sec = env.authenticatedContext("sec", { auth_time: 1000 }),
    other = env.authenticatedContext("other", { auth_time: 1000 }),
    foreign = env.authenticatedContext("foreign", { auth_time: 1000 });
  const secDb = sec.firestore(),
    otherDb = other.firestore(),
    foreignDb = foreign.firestore();
  const secStorage = sec.storage(),
    otherStorage = other.storage(),
    foreignStorage = foreign.storage();
  const path = "meetingAudio/lodge/sec/meeting/take";
  await assertSucceeds(
    uploadBytes(ref(secStorage, path), new Uint8Array([1, 2, 3]), {
      contentType: "audio/mp4;codecs=mp4a.40.2",
    }),
  );
  await assertSucceeds(getBytes(ref(secStorage, path)));
  await assertFails(getBytes(ref(otherStorage, path)));
  await assertFails(getBytes(ref(foreignStorage, path)));
  await assertFails(
    getBytes(ref(env.unauthenticatedContext().storage(), path)),
  );
  await assertFails(
    uploadBytes(ref(otherStorage, path + "2"), new Uint8Array([1]), {
      contentType: "audio/webm",
    }),
  );
  await assertFails(
    uploadBytes(ref(secStorage, path), new Uint8Array([4, 5, 6]), {
      contentType: "audio/mp4",
    }),
  );
  await assertFails(
    updateMetadata(ref(secStorage, path), { contentType: "audio/webm" }),
  );
  await assertFails(
    uploadBytes(ref(secStorage, path + "pdf"), new Uint8Array([1]), {
      contentType: "application/pdf",
    }),
  );
  await assertSucceeds(getDoc(doc(secDb, "meetingAudioJobs/job")));
  await assertFails(getDoc(doc(otherDb, "meetingAudioJobs/job")));
  await assertFails(getDoc(doc(foreignDb, "meetingAudioJobs/job")));
  await assertFails(
    setDoc(doc(secDb, "meetingAudioJobs/forged"), {
      uid: "sec",
      groupId: "lodge",
      state: "done",
    }),
  );
  // Existing receipt uploads keep their previous behavior.
  await assertSucceeds(
    uploadBytes(ref(secStorage, "receipts/test.png"), new Uint8Array([1]), {
      contentType: "image/png",
    }),
  );
  console.log(
    "Audio security emulator passed: owner-only immutable audio, no catch-all bypass, private server-only jobs, denied foreign/anonymous reads, legacy receipts unchanged.",
  );
  assert.ok(true);
} finally {
  await env.cleanup();
}
