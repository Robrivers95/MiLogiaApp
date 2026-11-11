import { getFunctions, httpsCallable } from "firebase/functions";
import { ref, getMetadata, uploadBytesResumable } from "firebase/storage";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, storage, db } from "./firebase";
import { meetingAudio } from "./meetingLocal";
import type { MeetingDraft } from "./meetingModel";
const call = async (data: any) =>
  (
    await httpsCallable(
      getFunctions(undefined, "us-central1"),
      "meetingAudioService",
    )(data)
  ).data as any;
export const audioFingerprint = (d: MeetingDraft) =>
  JSON.stringify({
    title: d.title,
    date: d.date,
    notes: d.notes,
    takes: d.takes.map(({ id, durationMs, offsetMs, mime }) => ({
      id,
      durationMs,
      offsetMs,
      mime,
    })),
    marks: d.marks,
    fields: d.fields
      .filter((f) => !f.manualOnly && f.origin !== "manual")
      .map(({ id, title, instruction }) => ({ id, title, instruction })),
  });
export const meetingAudioCloud = {
  status: async (groupId: string) =>
    (await call({ action: "status", groupId })).configured === true,
  start: async (
    d: MeetingDraft,
    requestId: string,
    progress: (n: number) => void,
  ) => {
    if (!auth.currentUser || auth.currentUser.uid !== d.ownerUid)
      throw Error("Abre una reunión propia para procesar sus audios.");
    const audios = await Promise.all(
      d.takes.map(async (take) => ({
        take,
        blob: await meetingAudio(d.id, take.id, take.mime),
      })),
    );
    const total = audios.reduce((n, a) => n + a.blob.size, 0);
    let uploaded = 0;
    if (
      !audios.length ||
      audios.length > 20 ||
      audios.some((a) => !a.blob.size || a.blob.size > 60 * 1024 * 1024) ||
      total > 120 * 1024 * 1024 ||
      d.durationMs > 10800000
    )
      throw Error(
        "Revisa los audios: máximo 60 MB por audio, 120 MB y tres horas por reunión.",
      );
    const takes = [];
    for (const { take, blob } of audios) {
      const path = `meetingAudio/${d.groupId}/${d.ownerUid}/${d.id}/${take.id}`,
        target = ref(storage, path);
      let exists = false;
      try {
        const old = await getMetadata(target);
        if (old.size !== blob.size)
          throw Error(
            "El audio subido tiene otro tamaño. Conserva el original y crea una nueva reunión.",
          );
        exists = true;
      } catch (e) {
        if ((e as any).code !== "storage/object-not-found") throw e;
      }
      if (!exists)
        await new Promise<void>((resolve, reject) => {
          const upload = uploadBytesResumable(target, blob, {
            contentType: take.mime,
            customMetadata: { meetingId: d.id, takeId: take.id },
          });
          upload.on(
            "state_changed",
            (s) =>
              progress(
                Math.round((100 * (uploaded + s.bytesTransferred)) / total),
              ),
            reject,
            () => resolve(),
          );
        });
      uploaded += blob.size;
      progress(Math.round((100 * uploaded) / total));
      takes.push({ ...take, path, size: blob.size });
    }
    return call({
      action: "start",
      requestId,
      groupId: d.groupId,
      meetingId: d.id,
      title: d.title,
      date: d.date,
      notes: d.notes,
      takes,
      marks: d.marks,
      fields: d.fields
        .filter((f) => !f.manualOnly && f.origin !== "manual")
        .map(({ id, title, instruction }) => ({ id, title, instruction })),
    });
  },
  watch: (id: string, receive: (job: any) => void, error: (e: Error) => void) =>
    onSnapshot(
      doc(db, "meetingAudioJobs", id),
      (snapshot) => {
        receive(snapshot.exists() ? snapshot.data() : { state: "missing" });
      },
      error,
    ),
};
