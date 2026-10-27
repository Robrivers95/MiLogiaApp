import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
  canAnalyzeMeeting,
  validateMeetingInput,
  validateMeetingResult,
  meetingInstructions,
} from "./meetingPolicy";
const fail = (
  code: functions.https.FunctionsErrorCode,
  message: string,
): never => {
  throw new functions.https.HttpsError(code, message);
};
export const organizeMeetingMinutes = functions
  .region("us-central1")
  .runWith({ timeoutSeconds: 120, memory: "256MB", maxInstances: 3 })
  .https.onCall(async (data, context) => {
    if (!context.auth)
      return fail("unauthenticated", "Inicia sesión para preparar el acta.");
    const uid = context.auth.uid;
    const groupId = data?.groupId;
    if (typeof groupId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(groupId))
      return fail("invalid-argument", "Selecciona una logia válida.");
    const db = admin.firestore();
    const [actor, group, security] = await Promise.all([
      db.doc(`users/${uid}`).get(),
      db.doc(`groups/${groupId}`).get(),
      db.doc(`accountSecurity/${uid}`).get(),
    ]);
    if (
      !actor.exists ||
      !canAnalyzeMeeting(actor.data() || {}, groupId) ||
      security.data()?.mustChangePassword ||
      Number(context.auth.token.auth_time || 0) <
        Number(security.data()?.validAfterSeconds || 0)
    )
      return fail(
        "permission-denied",
        "La organización de actas requiere autorización de Secretaría, Admin o Master de esta logia.",
      );
    if (
      !group.exists ||
      (group.data()?.active === false && actor.data()?.role !== "master")
    )
      return fail("failed-precondition", "La logia está en modo solo lectura.");
    const key = process.env.GEMINI_API_KEY || process.env.API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
    if (data.action === "status") return { configured: !!key };
    if (!key)
      return fail(
        "failed-precondition",
        "La IA de actas todavía no está configurada por el administrador. Tu transcripción sigue guardada; puedes preparar una solicitud para otra herramienta de IA.",
      );
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(model))
      return fail(
        "failed-precondition",
        "Revisa la configuración del modelo de IA.",
      );
    let validated: ReturnType<typeof validateMeetingInput>;
    try {
      validated = validateMeetingInput(data);
    } catch (e) {
      return fail("invalid-argument", (e as Error).message);
    }
    const lock = db.doc(`secretariatAnalysisLocks/${uid}`);
    const operationId = db.collection("secretariatAnalysisLocks").doc().id;
    const now = Date.now();
    await db.runTransaction(async (tx) => {
      const previous = (await tx.get(lock)).data();
      if (previous?.inProgress && now - Number(previous.startedAt) < (previous.kind === "audio" ? 600000 : 120000))
        return fail(
          "aborted",
          "Ya hay un análisis en curso. Espera a que termine.",
        );
      if (now - Number(previous?.startedAt || 0) < 60000)
        return fail(
          "resource-exhausted",
          "Espera un minuto antes de volver a analizar.",
        );
      tx.set(lock, {
        operationId,
        groupId,
        inProgress: true,
        startedAt: now,
        characters: validated.size,
        fieldCount: data.fields.length,
      });
    });
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify(meetingInstructions(data)),
          signal: AbortSignal.timeout(85000),
        },
      );
      if (!response.ok) {
        functions.logger.warn("Meeting AI provider rejected request", {
          status: response.status,
          uid,
          groupId,
          operationId,
        });
        return fail(
          response.status === 429
            ? "resource-exhausted"
            : "failed-precondition",
          response.status === 429
            ? "La IA alcanzó su límite de uso. Conserva el texto e intenta más tarde."
            : "El proveedor de IA no aceptó la solicitud. El administrador debe revisar la conexión y el modelo; el borrador sigue guardado.",
        );
      }
      const result = (await response.json()) as any;
      const candidate = result.candidates?.[0];
      if (candidate?.finishReason && candidate.finishReason !== "STOP")
        return fail(
          "failed-precondition",
          "La IA no terminó el acta completa. Reduce el texto o los campos y vuelve a analizar.",
        );
      const text = candidate?.content?.parts
        ?.filter((p: any) => typeof p.text === "string" && !p.thought)
        .map((p: any) => p.text)
        .join("");
      let output;
      try {
        output = validateMeetingResult(
          JSON.parse(text || ""),
          data.fields,
          validated.ids,
        );
      } catch {
        return fail(
          "failed-precondition",
          "La respuesta de IA no cumple el formato del acta. Tus campos y transcripción se conservaron.",
        );
      }
      return output;
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.warn("Meeting AI request failed", {
        uid,
        groupId,
        operationId,
        code: (error as any)?.name || "unknown",
      });
      return fail(
        "unavailable",
        "El análisis no terminó. Tu texto sigue guardado; puedes intentarlo más tarde.",
      );
    } finally {
      await db
        .runTransaction(async (tx) => {
          const current = await tx.get(lock);
          if (current.data()?.operationId === operationId)
            tx.update(lock, { inProgress: false, completedAt: Date.now() });
        })
        .catch(() => {});
    }
  });
