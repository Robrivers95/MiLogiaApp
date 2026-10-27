import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { createHash, randomUUID } from "crypto";
import {
  AUDIO_BUCKET,
  canAnalyzeMeeting,
  safeId,
  providerMime,
  validateAudioInput,
  audioInstructions,
  validateAudioResult,
} from "./meetingAudioPolicy";
const fail = (
  code: functions.https.FunctionsErrorCode,
  message: string,
): never => {
  throw new functions.https.HttpsError(code, message);
};
async function authority(uid: string, groupId: string, authTime: number) {
  const db = admin.firestore(),
    [actor, group, security] = await Promise.all([
      db.doc(`users/${uid}`).get(),
      db.doc(`groups/${groupId}`).get(),
      db.doc(`accountSecurity/${uid}`).get(),
    ]);
  if (
    !actor.exists ||
    actor.data()?.active !== true ||
    !canAnalyzeMeeting(actor.data() || {}, groupId) ||
    security.data()?.mustChangePassword ||
    authTime < Number(security.data()?.validAfterSeconds || 0)
  )
    return fail(
      "permission-denied",
      "Este proceso requiere Secretaría, Admin o Admin Master de la logia.",
    );
  if (!group.exists || group.data()?.active === false)
    return fail("failed-precondition", "La logia está en modo solo lectura.");
}
export const meetingAudioService = functions
  .region("us-central1")
  .runWith({ timeoutSeconds: 60, memory: "256MB", maxInstances: 3 })
  .https.onCall(async (data, context) => {
    if (!context.auth) return fail("unauthenticated", "Inicia sesión.");
    if (!safeId(data?.groupId))
      return fail("invalid-argument", "Selecciona la logia.");
    const uid = context.auth.uid,
      authTime = Number(context.auth.token.auth_time || 0);
    await authority(uid, data.groupId, authTime);
    const configured = !!(process.env.GEMINI_API_KEY || process.env.API_KEY);
    if (data.action === "status") return { configured };
    if (data.action !== "start" || !configured)
      return fail(
        "failed-precondition",
        "La conexión de audio con IA aún no está configurada.",
      );
    let input: ReturnType<typeof validateAudioInput>;
    try {
      input = validateAudioInput(data, uid);
    } catch (e) {
      return fail("invalid-argument", (e as Error).message);
    }
    if (Buffer.byteLength(JSON.stringify(input)) > 180000)
      return fail(
        "invalid-argument",
        "Hay demasiadas marcas o instrucciones para esta reunión.",
      );
    const db = admin.firestore(),
      job = db.doc(`meetingAudioJobs/${data.requestId}`),
      hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(job);
      if (existing.exists) {
        if (existing.data()?.uid !== uid || existing.data()?.hash !== hash)
          return fail(
            "permission-denied",
            "El identificador pertenece a otro proceso.",
          );
        return;
      }
      const recent = db.doc(`meetingAudioRequestLocks/${uid}`),
        previous = await tx.get(recent);
      if (Date.now() - Number(previous.data()?.startedAt || 0) < 60000)
        return fail(
          "resource-exhausted",
          "Espera un minuto antes de iniciar otro análisis.",
        );
      tx.set(recent, { startedAt: Date.now() });
      tx.set(job, {
        uid,
        groupId: input.groupId,
        authTime,
        hash,
        input,
        state: "queued",
        createdAt: Date.now(),
      });
    });
    return { jobId: data.requestId };
  });
export async function googleFile(
  buffer: Buffer,
  mime: string,
  key: string,
  label: string,
) {
  const start = await fetch(
    "https://generativelanguage.googleapis.com/upload/v1beta/files",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "Content-Type": "application/json",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(buffer.length),
        "X-Goog-Upload-Header-Content-Type": mime,
      },
      body: JSON.stringify({ file: { display_name: label } }),
      signal: AbortSignal.timeout(30000),
    },
  );
  const location = start.headers.get("x-goog-upload-url");
  if (!start.ok || !location)
    throw Error("No se pudo preparar el audio con Google.");
  const parsed = new URL(location);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "generativelanguage.googleapis.com"
  )
    throw Error("Destino de carga no válido.");
  const uploaded = await fetch(location, {
    method: "POST",
    headers: {
      "Content-Type": mime,
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: buffer as any,
    signal: AbortSignal.timeout(60000),
  });
  if (!uploaded.ok) throw Error("No se pudo enviar el audio a Google.");
  const body: any = await uploaded.json(),
    file = body.file;
  if (
    !/^files\/[A-Za-z0-9_-]+$/.test(file?.name) ||
    typeof file.uri !== "string" ||
    !file.uri.startsWith("https://generativelanguage.googleapis.com/")
  )
    throw Error("Google no confirmó el audio.");
  return file;
}
export const processMeetingAudio = functions
  .region("us-central1")
  .runWith({ timeoutSeconds: 540, memory: "1GB", maxInstances: 2 })
  .firestore.document("meetingAudioJobs/{jobId}")
  .onCreate(async (snapshot) => {
    const db = admin.firestore(),
      job = snapshot.ref,
      initial = snapshot.data();
    const claimed = await db.runTransaction(async (tx) => {
      const current = await tx.get(job);
      if (current.data()?.state !== "queued") return false;
      tx.update(job, { state: "preparing", startedAt: Date.now() });
      return true;
    });
    if (!claimed) return;
    const key = process.env.GEMINI_API_KEY || process.env.API_KEY || "",
      model = process.env.GEMINI_MODEL || "gemini-flash-latest";
    const deadline = Date.now() + 450000;
    const googleFiles: { name: string; uri: string; mime: string }[] = [];
    const lease = db.doc(`secretariatAnalysisLocks/${initial.uid}`),
      operationId = randomUUID();
    let ownsLease = false;
    try {
      await authority(initial.uid, initial.groupId, initial.authTime);
      const input = validateAudioInput(
        { ...initial.input, requestId: snapshot.id },
        initial.uid,
      );
      if (!key || !/^[A-Za-z0-9._-]{1,100}$/.test(model))
        throw Error("Revisa la configuración de IA.");
      await db.runTransaction(async (tx) => {
        const old = (await tx.get(lease)).data();
        if (old?.inProgress && Date.now() - Number(old.startedAt) < 600000)
          throw Error(
            "Ya hay otro análisis en curso. Espera antes de volver a intentar.",
          );
        tx.set(lease, { inProgress: true, kind: 'audio', startedAt: Date.now(), operationId });
      });
      ownsLease = true;
      const bucket = admin.storage().bucket(AUDIO_BUCKET);
      // Check every object before sending any bytes to the provider.
      const metadata = await Promise.all(
        input.takes.map(async (t: any) => {
          const [m] = await bucket.file(t.path).getMetadata();
          if (
            Number(m.size) !== t.size ||
            Number(m.size) > 60 * 1024 * 1024 ||
            providerMime(String(m.contentType)) !== providerMime(t.mime)
          )
            throw Error("El audio subido no coincide con el guardado.");
          return m;
        }),
      );
      for (let i = 0; i < input.takes.length; i++) {
        if (Date.now() > deadline - 30000)
          throw Error(
            "Google tardó demasiado preparando los audios. Divide la reunión.",
          );
        const take = input.takes[i];
        const [buffer] = await bucket
          .file(take.path, { generation: metadata[i].generation })
          .download();
        const file = await googleFile(
          buffer,
          providerMime(take.mime),
          key,
          `reunion-${snapshot.id}-${i + 1}`,
        );
        googleFiles.push({
          name: file.name,
          uri: file.uri,
          mime: providerMime(take.mime),
        });
        // Audio is usually immediately active, but processing files must be awaited.
        let state = file.state;
        for (let n = 0; state === "PROCESSING" && n < 15; n++) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${file.name}`,
            {
              headers: { "x-goog-api-key": key },
              signal: AbortSignal.timeout(10000),
            },
          );
          if (!response.ok) throw Error("No se pudo comprobar el audio.");
          state = ((await response.json()) as any).state;
        }
        if (state && state !== "ACTIVE")
          throw Error("Google todavía no pudo preparar uno de los audios.");
      }
      await job.update({ state: "transcribing" });
      // Exactly one generation request produces both the original transcript and acta.
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(audioInstructions(input, googleFiles)),
          signal: AbortSignal.timeout(
            Math.max(1000, Math.min(360000, deadline - Date.now())),
          ),
        },
      );
      if (!response.ok)
        throw Error(
          response.status === 429
            ? "Google alcanzó el límite del plan. Conserva los audios e intenta más tarde."
            : "Google no aceptó el análisis de audio. Revisa el modelo y la conexión.",
        );
      const body: any = await response.json(),
        candidate = body.candidates?.[0];
      if (candidate?.finishReason !== "STOP")
        throw Error(
          "La respuesta no alcanzó a transcribir la reunión completa. No se guardó una versión recortada; divide los audios.",
        );
      const text = candidate.content?.parts
        ?.filter((p: any) => !p.thought && typeof p.text === "string")
        .map((p: any) => p.text)
        .join("");
      const result = validateAudioResult(JSON.parse(text || ""), input);
      if (Buffer.byteLength(JSON.stringify(result)) > 700000)
        throw Error(
          "La transcripción es demasiado extensa para esta acta. Divide los audios.",
        );
      await authority(initial.uid, initial.groupId, initial.authTime);
      await job.update({ state: "done", result, completedAt: Date.now() });
    } catch (e) {
      const known = e instanceof Error ? e.message : "";
      const message =
        /^(Google |No se pudo |El audio |La respuesta |La transcripción |Transcripción |Divide |Revisa |Ya hay |Este proceso |La logia |Faltan |Formato |Destino )/.test(
          known,
        )
          ? known
          : "No se pudo completar el análisis. Los audios locales se conservan; revisa la conexión o intenta otra vez.";
      await job.update({
        state: "failed",
        error: message,
        completedAt: Date.now(),
      });
    } finally {
      await Promise.allSettled(
        googleFiles.map((file) =>
          fetch(
            `https://generativelanguage.googleapis.com/v1beta/${file.name}`,
            {
              method: "DELETE",
              headers: { "x-goog-api-key": key },
              signal: AbortSignal.timeout(10000),
            },
          ),
        ),
      );
      if (ownsLease)
        await db
          .runTransaction(async (tx) => {
            const current = await tx.get(lease);
            if (current.data()?.operationId === operationId)
              tx.update(lease, { inProgress: false });
          })
          .catch(() => {});
    }
  });
