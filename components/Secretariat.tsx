import React, { useEffect, useRef, useState } from "react";
import type { User } from "../types";
import type {
  MeetingDraft,
  MeetingField,
  MeetingSpeaker,
  AudioTake,
} from "../services/meetingModel";
import {
  newMeeting,
  canUseSecretariat,
  clock,
  uid,
  speakerAt,
  meetingTextExport,
} from "../services/meetingModel";
import {
  saveMeetingLocal,
  listMeetingsLocal,
  meetingAudio,
  downloadMeetingFile,
} from "../services/meetingLocal";
import { MeetingRecorder } from "../services/meetingRecorder";
import { meetingCloud } from "../services/meetingCloud";
import {
  meetingAudioCloud,
  audioFingerprint,
} from "../services/meetingAudioCloud";
import CaptureAssistant from "./CaptureAssistant";
import SecretariatAdvanced from "./SecretariatAdvanced";
const field =
  "w-full min-w-0 rounded-lg border border-logia-700 bg-logia-900 p-3 text-base";
const button =
  "rounded-lg border border-logia-700 px-3 py-3 text-sm font-semibold disabled:opacity-40";
const transcript = (d: MeetingDraft) =>
  d.texts
    .map(
      (t) =>
        `${t.atMs === null ? "" : `[${clock(t.atMs)}] `}${t.speaker?.name || "Sin identificar"}: ${t.text}`,
    )
    .join("\n\n");
function SavedAudio({
  draftId,
  take,
  index,
}: {
  draftId: string;
  take: AudioTake;
  index: number;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let canceled = false,
      url = "";
    void meetingAudio(draftId, take.id, take.mime)
      .then((blob) => {
        if (!blob.size)
          throw Error("No hay audio disponible en este dispositivo.");
        if (canceled) return;
        url = URL.createObjectURL(blob);
        setUrl(url);
      })
      .catch((e) => setError(e.message));
    return () => {
      canceled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [draftId, take.id, take.mime]);
  return (
    <div className="space-y-2 border-t border-logia-700 pt-3">
      <p className="text-sm">
        Audio {index + 1} · {clock(take.durationMs)}{" "}
        {!take.complete && "· Recuperado: revisa que se escuche"}
      </p>
      {error && <p className="text-amber-300 text-sm">{error}</p>}
      {url && (
        <>
          <audio
            controls
            preload="metadata"
            src={url}
            className="w-full"
            aria-label={`Escuchar audio ${index + 1}`}
          />
          <a
            className="inline-block text-sm text-indigo-300 underline p-1"
            href={url}
            download={`audio-${index + 1}.${take.mime.includes("mp4") ? "m4a" : "webm"}`}
          >
            Descargar audio {index + 1}
          </a>
        </>
      )}
    </div>
  );
}
export default function Secretariat({
  user,
  suspended = false,
}: {
  user: User;
  suspended?: boolean;
}) {
  const [draft, setDraft] = useState<MeetingDraft>(),
    [drafts, setDrafts] = useState<MeetingDraft[]>([]),
    [ready, setReady] = useState(false);
  const dref = useRef<MeetingDraft>(),
    alive = useRef(true),
    saving = useRef(Promise.resolve()),
    saveTimer = useRef<any>(),
    recorder = useRef<MeetingRecorder>(),
    flight = useRef(false);
  const [status, setStatus] = useState<
      "idle" | "starting" | "recording" | "paused" | "stopping"
    >("idle"),
    statusRef = useRef(status);
  statusRef.current = status;
  const [elapsed, setElapsed] = useState(0),
    [level, setLevel] = useState(0),
    [captions, setCaptions] = useState(false),
    [caption, setCaption] = useState("");
  const [tab, setTab] = useState<"record" | "transcript" | "report">("record"),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [upload, setUpload] = useState(0);
  const [people, setPeople] = useState<User[]>([]),
    [speaker, setSpeaker] = useState<MeetingSpeaker | null>(null),
    [speakerSheet, setSpeakerSheet] = useState(false),
    [search, setSearch] = useState(""),
    [onlyPresent, setOnlyPresent] = useState(false),
    [library, setLibrary] = useState(false);
  const [job, setJob] = useState<any>(),
    [now, setNow] = useState(Date.now()),
    [audioReady, setAudioReady] = useState<boolean | null>(null),
    [editing, setEditing] = useState(false),
    [taskCapture, setTaskCapture] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [backup, setBackup] = useState<{ take: AudioTake; blob: Blob }>();
  const [review, setReview] = useState(false),
    [audioListOpen, setAudioListOpen] = useState(false);
  const advancedRef = useRef(false);
  advancedRef.current = advanced;
  const allowed = canUseSecretariat(user),
    active = status !== "idle";
  const timedOut =
    job &&
    ["preparing", "transcribing"].includes(job.state) &&
    now - Number(job.startedAt) > 600000;
  const processing =
    !!draft?.audioJob?.started &&
    !draft.audioJob.applied &&
    !["failed", "missing"].includes(job?.state) &&
    !timedOut;
  const waitingToConfirm =
    !!draft?.audioJob &&
    !draft.audioJob.applied &&
    job?.state !== "failed" &&
    !timedOut;
  const locked = active || busy || processing || waitingToConfirm || suspended;
  const persist = () => {
    const value = dref.current;
    if (!value) return Promise.resolve();
    const next = saving.current
      .catch(() => {})
      .then(() => saveMeetingLocal(value))
      .then(() => {
        if (alive.current)
          setDrafts((list) =>
            [value, ...list.filter((d) => d.id !== value.id)].sort(
              (a, b) => b.updatedAt - a.updatedAt,
            ),
          );
      });
    saving.current = next;
    return next;
  };
  const change = (edit: (d: MeetingDraft) => MeetingDraft) => {
    const old = dref.current;
    if (!old) return;
    const next = {
      ...edit(old),
      updatedAt: Date.now(),
      revision: old.revision + 1,
    };
    delete next.reviewedAt;
    dref.current = next;
    if (alive.current) {
      setDraft(next);
      setReview(false);
    }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      () =>
        void persist().catch((e) => {
          if (alive.current) setError(e.message);
        }),
      250,
    );
  };
  const open = (d: MeetingDraft) => {
    dref.current = d;
    setDraft(d);
    setElapsed(d.durationMs || 0);
    setSpeaker(speakerAt(d.marks, d.durationMs) || null);
    setJob(undefined);
    setError("");
    setNotice("");
    setLibrary(false);
    setTab("record");
    setTaskCapture(false);
    setBackup(undefined);
    setOnlyPresent(false);
    setSearch("");
  };
  const checkAI = async () => {
    setAudioReady(null);
    try {
      const value = await meetingAudioCloud.status(user.groupId);
      if (alive.current) setAudioReady(value);
    } catch {
      if (alive.current) setAudioReady(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    let canceled = false;
    if (!allowed) return;
    void listMeetingsLocal(user.uid, user.groupId)
      .then((list) => {
        if (canceled) return;
        setDrafts(list);
        if (list[0]) open(list[0]);
        setReady(true);
      })
      .catch((e) => {
        if (!canceled) setError(e.message);
      });
    void meetingCloud
      .members(user.groupId)
      .then((m) => {
        if (!canceled) setPeople(m);
      })
      .catch(() => {
        if (!canceled) setNotice("Puedes grabar sin elegir quién habla.");
      });
    void checkAI();
    return () => {
      canceled = true;
      alive.current = false;
      clearTimeout(saveTimer.current);
      recorder.current?.dispose();
      if (!advancedRef.current) void persist().catch(() => {});
    };
  }, [user.uid, user.groupId, allowed]);
  useEffect(() => {
    if (status !== "recording") return;
    const timer = setInterval(
      () => setElapsed(recorder.current?.elapsed() || 0),
      250,
    );
    return () => clearInterval(timer);
  }, [status]);
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [processing]);
  useEffect(() => {
    const guard = (event: Event) => {
      if (statusRef.current !== "idle" || flight.current) {
        event.preventDefault();
        setError(
          "Termina el audio antes de salir. Puedes grabar otro después.",
        );
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (statusRef.current !== "idle" || flight.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("logia-before-navigate", guard);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("logia-before-navigate", guard);
      window.removeEventListener("beforeunload", unload);
    };
  }, []);
  useEffect(() => {
    const current = draft?.audioJob;
    if (advanced || !current?.started || !allowed) return;
    return meetingAudioCloud.watch(
      current.id,
      (value) => {
        if (!alive.current || dref.current?.audioJob?.id !== current.id) return;
        setJob(value);
        if (value.state === "done" && !dref.current.audioJob.applied) {
          const result = value.result;
          if (
            !Array.isArray(result?.texts) ||
            !Array.isArray(result?.fields) ||
            typeof result.originalTranscript !== "string"
          ) {
            setError("No se pudo leer el resultado. Conserva los audios.");
            return;
          }
          const ids = new Set(value.input?.fields?.map((f: any) => f.id) || []);
          change((d) => ({
            ...d,
            texts: result.texts,
            originalTranscript: result.originalTranscript,
            transcriptSource: "audio",
            fields: d.fields.map((f) => {
              const found = result.fields.find((r: any) => r.id === f.id);
              return found &&
                ids.has(f.id) &&
                !f.manualOnly &&
                f.origin !== "manual"
                ? { ...f, ...found, origin: "ai" }
                : f;
            }),
            processedTakeIds: d.takes.map((t) => t.id),
            audioJob: { ...d.audioJob!, applied: true },
          }));
          void persist().catch((e) => setError(e.message));
          setNotice(
            "Transcripción completa guardada. El resumen solo se genera cuando pulses Resumir con IA.",
          );
          setTab("transcript");
        }
        if (value.state === "failed")
          setError(
            value.error ||
              "No se pudo completar el proceso. Los audios se conservan.",
          );
      },
      (e) => {
        if (alive.current) {
          setError(e.message);
          setJob({ state: "missing" });
        }
      },
    );
  }, [draft?.audioJob?.id, draft?.audioJob?.started, allowed, advanced]);
  const action = async (work: () => Promise<void>) => {
    if (flight.current || suspended) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const make = () =>
    action(async () => {
      await persist();
      const next = newMeeting(user.uid, user.groupId);
      await saveMeetingLocal(next);
      open(next);
    });
  const start = async () => {
    if (statusRef.current !== "idle" || locked || !dref.current) return;
    setError("");
    setNotice("");
    setCaption("");
    recorder.current?.dispose();
    const r = new MeetingRecorder({
      draft: () => dref.current!,
      change,
      persist,
      meter: (v) => {
        if (alive.current) setLevel(v);
      },
      caption: (t) => {
        if (alive.current) setCaption(t.slice(-180));
      },
      warning: (t) => {
        if (alive.current) setNotice(t);
      },
      backup: (take, blob) => {
        if (alive.current) setBackup({ take, blob });
      },
      state: (value) => {
        if (recorder.current !== r) return;
        statusRef.current = value;
        if (!alive.current) return;
        setStatus(value);
        if (value === "paused") setElapsed(recorder.current?.elapsed() || 0);
        if (value === "idle") {
          setElapsed(dref.current?.durationMs || 0);
          setLevel(0);
          if (dref.current?.takes.length)
            setNotice(
              (current) =>
                current ||
                "Audio guardado. Puedes grabar otro o transcribirlo sin generar el resumen.",
            );
          const d = dref.current;
          if (
            d &&
            d.transcriptSource !== "audio" &&
            d.texts.some((t) => t.source === "dictation")
          ) {
            change((old) => ({
              ...old,
              originalTranscript: transcript(old),
              transcriptSource: "browser",
            }));
            void persist().catch((e) => setError(e.message));
          }
        }
      },
    });
    recorder.current = r;
    change((d) => ({
      ...d,
      marks: [...d.marks, { id: uid(), atMs: d.durationMs || 0, speaker }],
    }));
    try {
      await r.start(captions);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const mark = (person: User | null) => {
    const value = person ? { uid: person.uid, name: person.name } : null;
    setSpeaker(value);
    if (["recording", "paused"].includes(status))
      change((d) => ({
        ...d,
        marks: [
          ...d.marks,
          {
            id: uid(),
            atMs: recorder.current?.elapsed() || d.durationMs,
            speaker: value,
          },
        ],
      }));
    setSpeakerSheet(false);
  };
  const process = () =>
    action(async () => {
      const d = { ...dref.current!, fields: [] };
      const fingerprint = audioFingerprint(d),
        failed = job?.state === "failed" || timedOut;
      const previous = d.audioJob;
      if (
        failed &&
        !window.confirm(
          "Este intento no terminó. Volver a analizar puede consumir datos y tokens nuevamente. ¿Reintentar?",
        )
      )
        return;
      const requestId =
        previous?.fingerprint === fingerprint && !failed ? previous.id : uid();
      setUpload(0);
      change((old) => ({
        ...old,
        audioJob: { id: requestId, fingerprint, started: false },
      }));
      await persist();
      await meetingAudioCloud.start(d, requestId, (n) => {
        if (alive.current) setUpload(n);
      });
      change((old) => ({
        ...old,
        audioJob: { id: requestId, fingerprint, started: true },
      }));
      await persist();
      setJob({ state: "queued" });
    });
  const updateReport = () =>
    action(async () => {
      const snapshot = dref.current!;
      if (snapshot.takes.some((t) => !snapshot.processedTakeIds?.includes(t.id)))
        throw Error("Primero transcribe los audios pendientes para incluir toda la tenida.");
      if (!snapshot.texts.length)
        throw Error("Primero obtén una transcripción.");
      if (!window.confirm("¿Ya terminó la tenida? Se generará el resumen con IA usando la transcripción actual. Los campos corregidos manualmente se conservan.")) return;
      const result = await meetingCloud.organize(snapshot);
      change((d) => ({
        ...d,
        fields: d.fields.map((f) => {
          const value = result.fields.find((r) => r.id === f.id);
          return value && !f.manualOnly && f.origin !== "manual"
            ? { ...f, ...value, origin: "ai" }
            : f;
        }),
      }));
      await persist();
      setNotice("Resumen de IA guardado. Revisa el informe antes de confirmar tareas.");
      setTab("transcript");
    });
  const patchField = (id: string, patch: Partial<MeetingField>) =>
    change((d) => ({
      ...d,
      fields: d.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  const saveCloud = () =>
    action(async () => {
      const version = await meetingCloud.save(dref.current!);
      const next = { ...dref.current!, cloudVersion: version };
      dref.current = next;
      setDraft(next);
      await persist();
      setNotice("Transcripción e informe guardados en la logia.");
    });
  const exportText = (value: string, name: string) =>
    downloadMeetingFile(
      new Blob([value], { type: "text/plain;charset=utf-8" }),
      `${name}-${draft?.date}.txt`,
    );
  if (!allowed)
    return (
      <p className="p-4">
        Este apartado requiere Secretario, Admin o Admin Master.
      </p>
    );
  if (advanced)
    return (
      <SecretariatAdvanced
        user={user}
        suspended={suspended}
        onSimple={(value) => {
          setAdvanced(false);
          if (value) open(value);
          void listMeetingsLocal(user.uid, user.groupId).then(setDrafts);
        }}
      />
    );
  const speechAvailable =
    typeof window !== "undefined" &&
    !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  const visible = people.filter(
    (p) =>
      (!onlyPresent || draft?.presentUids.includes(p.uid)) &&
      p.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")),
  );
  const originalText = draft ? (draft.transcriptSource === "audio" ? draft.originalTranscript || transcript(draft) : transcript(draft) || draft.originalTranscript || "") : "";
  const reportExists = draft?.fields.some((f) => f.value.trim());
  const allAudiosProcessed =
    !!draft?.takes.length &&
    draft.takes.every((t) => draft.processedTakeIds?.includes(t.id));
  return (
    <div className="p-3 space-y-3 pb-6" aria-label="Secretaría simple">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-lg">Secretaría y actas</h2>
        <div className="flex gap-1">
          <button
            className={button}
            disabled={locked || !ready}
            onClick={() => setLibrary(true)}
          >
            Mis reuniones
          </button>
          <button
            className={button}
            disabled={locked || !ready}
            onClick={() => void make()}
          >
            Nueva
          </button>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="text-red-200 text-sm bg-red-950/50 rounded-lg p-3 break-words"
        >
          {error}
        </p>
      )}
      {notice && (
        <div
          role="status"
          className="flex gap-2 items-start text-sm text-emerald-200"
        >
          <p className="flex-1">{notice}</p>
          <button
            className="px-2"
            aria-label="Cerrar aviso"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      {suspended && <p className="text-amber-300 text-sm">Solo lectura.</p>}
      {!draft ? (
        <div className="rounded-xl border border-logia-700 bg-logia-800 p-5 space-y-4">
          <p>
            Graba y transcribe la reunión. Cuando termine la tenida, pulsa Resumir con IA; después podrás revisar el acta y confirmar sus tareas.
          </p>
          <button
            className={button + " bg-indigo-700 w-full"}
            disabled={!ready || suspended || busy}
            onClick={() => void make()}
          >
            Nueva reunión
          </button>
        </div>
      ) : (
        <>
          <nav
            className="grid grid-cols-3 rounded-xl border border-logia-700 overflow-hidden"
            aria-label="Pasos de secretaría"
          >
            {(
              [
                ["record", "Grabar"],
                ["transcript", "Transcripción"],
                ["report", "Acta y tareas"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={
                  "px-1 py-3 text-sm " +
                  (tab === id
                    ? "bg-indigo-800 text-white"
                    : "bg-logia-800 text-gray-300")
                }
                aria-current={tab === id ? "step" : undefined}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "record" && (
            <>
              <div
                className="bg-logia-800 border border-logia-700 rounded-xl p-4 space-y-3"
                aria-label="Grabadora"
                role="region"
              >
                <div className="flex justify-between text-xs text-gray-400 gap-2">
                  <span className="truncate">
                    {draft.title} · {draft.date}
                  </span>
                  <span className="shrink-0">
                    {draft.takes.length} audio(s)
                  </span>
                </div>
                <div className="text-center">
                  <p className="text-xs uppercase tracking-wide text-gray-300">
                    {status === "recording"
                      ? "Grabando"
                      : status === "paused"
                        ? "En pausa"
                        : status === "starting"
                          ? "Esperando micrófono"
                          : status === "stopping"
                            ? "Guardando audio"
                            : draft.takes.length
                              ? "Audio guardado"
                              : "Listo para grabar"}
                  </p>
                  <p
                    className="text-4xl font-mono my-2"
                    aria-label="Duración de la reunión"
                  >
                    {clock(elapsed)}
                  </p>
                </div>
                <div
                  className="h-1.5 rounded bg-logia-900 overflow-hidden"
                  aria-label="Nivel del micrófono"
                >
                  <div
                    className="h-full bg-emerald-400 transition-all"
                    style={{ width: `${status === "recording" ? level : 0}%` }}
                  />
                </div>
                {["recording", "paused"].includes(status) ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={button + " bg-indigo-700"}
                      onClick={() => {
                        if (status === "paused") recorder.current?.resume();
                        else recorder.current?.pause();
                      }}
                    >
                      {status === "paused" ? "Continuar" : "Pausar"}
                    </button>
                    <button
                      className={button + " bg-red-700"}
                      onClick={() => recorder.current?.stop()}
                    >
                      Terminar audio
                    </button>
                  </div>
                ) : status === "starting" ? (
                  <button
                    className={button + " w-full"}
                    onClick={() => {
                      recorder.current?.dispose();
                      setStatus("idle");
                      statusRef.current = "idle";
                    }}
                  >
                    Cancelar inicio
                  </button>
                ) : (
                  <button
                    className={button + " bg-red-700 w-full"}
                    disabled={locked}
                    onClick={() => void start()}
                  >
                    {status === "stopping"
                      ? "Guardando…"
                      : draft.takes.length
                        ? "Grabar otro audio"
                        : "Grabar"}
                  </button>
                )}
                <button
                  className={
                    button + " w-full text-left flex justify-between gap-2"
                  }
                  disabled={
                    busy ||
                    suspended ||
                    status === "starting" ||
                    status === "stopping"
                  }
                  onClick={() => setSpeakerSheet(true)}
                >
                  <span className="truncate">
                    Habla: {speaker?.name || "Sin identificar"}
                  </span>
                  <span className="shrink-0 text-indigo-300">Cambiar</span>
                </button>
                {!active && (
                  <label className="flex gap-2 text-sm items-start">
                    <input
                      type="checkbox"
                      disabled={locked || !speechAvailable}
                      checked={captions}
                      onChange={(e) => setCaptions(e.target.checked)}
                    />
                    <span>
                      Ver subtítulos en vivo{" "}
                      <span className="block text-xs text-gray-400">
                        {speechAvailable
                          ? "Opcional. Depende del navegador y puede usar internet."
                          : "No disponible aquí; podrás transcribir al terminar."}
                      </span>
                    </span>
                  </label>
                )}
                {captions && active && (
                  <div
                    aria-live="polite"
                    aria-label="Subtítulos en vivo"
                    className="rounded-lg bg-logia-900 p-3 text-base min-h-16 max-h-28 overflow-y-auto"
                  >
                    {caption || "El texto aparecerá aquí mientras hablas…"}
                  </div>
                )}
              </div>
              {backup && (
                <button
                  className={button + " bg-amber-800 w-full"}
                  onClick={() =>
                    downloadMeetingFile(
                      backup.blob,
                      `respaldo-audio.${backup.take.mime.includes("mp4") ? "m4a" : "webm"}`,
                    )
                  }
                >
                  Descargar respaldo de audio no guardado
                </button>
              )}
              {busy && (
                <p role="status" className="text-indigo-200 text-sm">
                  {upload < 100
                    ? `Subiendo audios: ${upload}%`
                    : "Preparando el proceso…"}
                </p>
              )}
              {processing && (
                <div
                  role="status"
                  className="bg-indigo-950/40 border border-indigo-700 rounded-lg p-3 text-sm"
                >
                  {job?.state === "transcribing"
                    ? "Transcribiendo los audios…"
                    : job?.state === "preparing"
                      ? "Preparando los audios…"
                      : "Proceso en espera…"}
                  <p className="text-xs text-gray-400 mt-1">
                    Puedes volver después; el resultado se conserva sin repetir
                    el análisis.
                  </p>
                </div>
              )}
              {timedOut && (
                <p className="text-amber-300 text-sm">
                  El proceso no terminó a tiempo. Los audios se conservan;
                  puedes intentar de nuevo.
                </p>
              )}
              {draft.takes.length > 0 && status === "idle" && !processing && (
                <>
                  <button
                    className={button + " bg-emerald-700 w-full"}
                    disabled={
                      active ||
                      busy ||
                      processing ||
                      suspended ||
                      audioReady !== true ||
                      !!backup ||
                      allAudiosProcessed
                    }
                    onClick={() => void process()}
                  >
                    {allAudiosProcessed
                      ? "Audios transcritos"
                      : job?.state === "failed" || timedOut
                        ? "Reintentar transcripción"
                        : draft.audioJob && !draft.audioJob.started
                          ? "Continuar proceso"
                          : "Transcribir audios"}
                  </button>
                  <p className="text-xs text-gray-400">
                    Solo obtiene la transcripción; no genera el resumen. Puedes
                    seguir grabando después. Usa internet y tokens según la duración.
                  </p>
                </>
              )}
              {audioReady === false && (
                <p className="text-sm text-amber-200">
                  No se pudo comprobar la conexión de audio con IA.{" "}
                  <button
                    className="underline"
                    disabled={busy}
                    onClick={() => void checkAI()}
                  >
                    Comprobar conexión
                  </button>
                </p>
              )}
              {draft.takes.length > 0 && (
                <details
                  onToggle={(e) => setAudioListOpen(e.currentTarget.open)}
                  className="rounded-lg border border-logia-700 p-3"
                >
                  <summary className="text-sm cursor-pointer">
                    Audios guardados ({draft.takes.length})
                  </summary>
                  <div className="space-y-3 mt-3">
                    {audioListOpen &&
                      draft.takes.map((take, i) =>
                        take.complete || status === "idle" ? (
                          <SavedAudio
                            key={take.id}
                            draftId={draft.id}
                            take={take}
                            index={i}
                          />
                        ) : (
                          <p key={take.id} className="text-sm">
                            Audio {i + 1} en grabación.
                          </p>
                        ),
                      )}
                  </div>
                </details>
              )}
              <details className="rounded-lg border border-logia-700 p-3">
                <summary className="text-sm cursor-pointer">
                  Nombre y fecha
                </summary>
                <fieldset disabled={locked} className="space-y-3 mt-3">
                  <label className="block text-sm">
                    Nombre
                    <input
                      className={field}
                      value={draft.title}
                      maxLength={160}
                      onChange={(e) =>
                        change((d) => ({ ...d, title: e.target.value }))
                      }
                    />
                  </label>
                  <label className="block text-sm">
                    Fecha
                    <input
                      className={field}
                      type="date"
                      value={draft.date}
                      onChange={(e) =>
                        change((d) => ({ ...d, date: e.target.value }))
                      }
                    />
                  </label>
                </fieldset>
              </details>
            </>
          )}
          {(tab === "record" || tab === "transcript") && (
            <div className="space-y-3" aria-label="Transcripción y resumen">
              <section className="rounded-xl border border-logia-700 bg-logia-800 p-3 space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <h3 className="font-bold">Transcripción completa</h3>
                  <button className={button}
                    disabled={!draft.originalTranscript && !draft.texts.length}
                    onClick={() => exportText(originalText, "transcripcion-original")}>
                    Descargar
                  </button>
                </div>
                <textarea aria-label="Transcripción completa" className={field + " leading-relaxed resize-y"}
                  rows={tab === "record" ? 4 : 8} readOnly
                  value={originalText}
                  placeholder="Aquí aparecerá la transcripción literal. Pulsa Transcribir audios después de guardar un audio, o activa los subtítulos en vivo antes de grabar." />
                {tab === "transcript" && (busy || processing) && <p role="status" className="text-sm text-indigo-200">{processing ? "Transcribiendo audios…" : "Procesando…"}</p>}
                <p className="text-xs text-gray-400">Texto original, separado del resumen. Puede contener errores de reconocimiento; el audio es la referencia.</p>
                {draft.takes.length > 0 && !allAudiosProcessed && (
                  <p className="text-amber-200 text-sm">Hay audios pendientes de transcribir. El texto mostrado puede estar incompleto.</p>
                )}
                {tab === "transcript" && draft.takes.length > 0 && !allAudiosProcessed && (
                  <button className={button + " w-full bg-emerald-700"}
                    disabled={active || busy || processing || suspended || audioReady !== true || !!backup}
                    onClick={() => void process()}>Transcribir audios</button>
                )}
              </section>
              <section className="rounded-xl border border-indigo-700 bg-logia-800 p-3 space-y-2">
                <h3 className="font-bold">Resumen de IA</h3>
                <textarea aria-label="Resumen de IA" className={field + " leading-relaxed resize-y"}
                  rows={tab === "record" ? 4 : 8} readOnly
                  value={draft.fields.filter((f) => f.value.trim()).map((f) => f.title + "\n" + f.value).join("\n\n")}
                  placeholder="Todavía no hay resumen. Cuando termine la tenida, pulsa Resumir con IA." />
                <button className={button + " w-full bg-indigo-700"}
                  disabled={locked || !draft.texts.length || (draft.takes.length > 0 && !allAudiosProcessed)}
                  onClick={() => void updateReport()}>
                  {busy ? "Procesando…" : "Resumir con IA"}
                </button>
                <p className="text-xs text-gray-400">Solo se genera al pulsar el botón y confirmar que terminó la tenida. Usa el texto, sin volver a enviar el audio.</p>
                {reportExists && <button className={button + " w-full"} onClick={() => setTab("report")}>Revisar acta y tareas</button>}
              </section>
            </div>
          )}
          {tab === "report" && (
            <div className="space-y-3">
              <div className="flex justify-between gap-2 items-center">
                <h3 className="font-bold">Informe de la reunión</h3>
                <button
                  className={button}
                  disabled={locked}
                  onClick={() => setEditing((v) => !v)}
                >
                  {editing ? "Ver informe" : "Editar"}
                </button>
              </div>
              {!reportExists && (
                <p className="text-sm text-gray-400">
                  Transcribe los audios y pulsa Resumir con IA cuando termine la tenida. También puedes completar el acta manualmente.
                </p>
              )}
              <button className={button + " w-full bg-indigo-700"}
                disabled={locked || !draft.texts.length || (draft.takes.length > 0 && !allAudiosProcessed)}
                onClick={() => void updateReport()}>Resumir con IA</button>
              {draft.fields.map((f) => (
                <section
                  key={f.id}
                  className="rounded-xl border border-logia-700 bg-logia-800 p-4"
                >
                  <h4 className="text-indigo-200 font-semibold text-sm mb-2">
                    {f.title}
                  </h4>
                  {editing ? (
                    <textarea
                      aria-label={`Editar ${f.title}`}
                      className={field}
                      value={f.value}
                      rows={3}
                      maxLength={12000}
                      disabled={locked}
                      onChange={(e) =>
                        patchField(f.id, {
                          value: e.target.value,
                          origin: "manual",
                        })
                      }
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                      {f.value || "Pendiente"}
                    </p>
                  )}
                </section>
              ))}
              <label className="block text-sm">
                Notas adicionales
                <textarea
                  className={field}
                  rows={2}
                  maxLength={10000}
                  disabled={locked}
                  value={draft.notes}
                  onChange={(e) =>
                    change((d) => ({ ...d, notes: e.target.value }))
                  }
                />
              </label>
              <label className="flex gap-2 text-sm items-start">
                <input
                  type="checkbox"
                  disabled={locked || !reportExists}
                  checked={review || !!draft.reviewedAt}
                  onChange={(e) => {
                    setReview(e.target.checked);
                    if (!e.target.checked && draft.reviewedAt)
                      change((d) => ({ ...d }));
                  }}
                />
                <span>Revisé el informe, los nombres y los acuerdos.</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={button + " bg-indigo-700"}
                  disabled={locked || (!review && !draft.reviewedAt)}
                  onClick={() =>
                    void action(async () => {
                      const next = {
                        ...dref.current!,
                        reviewedAt: new Date().toISOString(),
                      };
                      dref.current = next;
                      setDraft(next);
                      await persist();
                      setNotice("Informe marcado como revisado.");
                    })
                  }
                >
                  Marcar revisado
                </button>
                <button
                  className={button}
                  disabled={!reportExists}
                  onClick={() =>
                    exportText(
                      `${draft.title}\nFecha: ${draft.date}\n${draft.reviewedAt ? "Revisado por Secretaría" : "BORRADOR PENDIENTE DE REVISIÓN"}\n\n` +
                        draft.fields
                          .map((f) => f.title + "\n" + (f.value || "Pendiente"))
                          .join("\n\n") +
                        "\n\nNotas\n" +
                        draft.notes,
                      "informe",
                    )
                  }
                >
                  Descargar informe
                </button>
              </div>
              <button
                className={button + " w-full bg-emerald-800"}
                disabled={locked || !reportExists}
                onClick={() => setTaskCapture((v) => !v)}
              >
                {taskCapture
                  ? "Cerrar tareas"
                  : "Preparar tareas de los acuerdos"}
              </button>
              {taskCapture && (
                <CaptureAssistant
                  key={draft.id}
                  user={user}
                  suspended={suspended || active || processing}
                  embedded
                  initialText={draft.fields
                    .filter((f) => /acuerd|comprom/i.test(f.title))
                    .map((f) => f.title + "\n" + f.value)
                    .join("\n\n")}
                />
              )}
              <details className="rounded-lg border border-logia-700 p-3">
                <summary className="text-sm cursor-pointer">
                  Formato del informe
                </summary>
                <fieldset disabled={locked} className="space-y-3 mt-3">
                  {draft.fields.map((f, i) => (
                    <details
                      key={f.id}
                      className="border border-logia-700 rounded p-3"
                    >
                      <summary className="text-sm">
                        {i + 1}. {f.title}
                      </summary>
                      <div className="space-y-2 mt-2">
                        <label className="block text-sm">
                          Título del punto
                          <input
                            className={field}
                            maxLength={100}
                            value={f.title}
                            onChange={(e) =>
                              patchField(f.id, { title: e.target.value })
                            }
                          />
                        </label>
                        <label className="block text-sm">
                          Qué debe recopilar la IA
                          <textarea
                            className={field}
                            maxLength={1000}
                            value={f.instruction}
                            onChange={(e) =>
                              patchField(f.id, { instruction: e.target.value })
                            }
                          />
                        </label>
                        <label className="flex gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={f.manualOnly}
                            onChange={(e) =>
                              patchField(f.id, { manualOnly: e.target.checked })
                            }
                          />
                          Solo llenado manual
                        </label>
                        {f.origin === "manual" && (
                          <button
                            className={button}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "¿Permitir que la IA sustituya este campo en el próximo análisis?",
                                )
                              )
                                patchField(f.id, { origin: "empty" });
                            }}
                          >
                            Permitir volver a analizar este punto
                          </button>
                        )}
                        <button
                          className={button + " text-red-300"}
                          onClick={() => {
                            if (
                              window.confirm("¿Quitar este punto del informe?")
                            )
                              change((d) => ({
                                ...d,
                                fields: d.fields.filter((x) => x.id !== f.id),
                              }));
                          }}
                        >
                          Quitar punto
                        </button>
                      </div>
                    </details>
                  ))}
                  <button
                    className={button}
                    disabled={draft.fields.length >= 15}
                    onClick={() =>
                      change((d) => ({
                        ...d,
                        fields: [
                          ...d.fields,
                          {
                            id: uid(),
                            title: "Nuevo punto",
                            instruction: "",
                            manualOnly: false,
                            value: "",
                            origin: "empty",
                            evidenceIds: [],
                          },
                        ],
                      }))
                    }
                  >
                    Añadir punto
                  </button>
                  <button
                    className={button + " w-full"}
                    disabled={!draft.texts.length}
                    onClick={() => void updateReport()}
                  >
                    Actualizar informe usando solo el texto
                  </button>
                  <p className="text-xs text-gray-400">
                    Los puntos corregidos manualmente se conservan. La
                    transcripción original no se modifica.
                  </p>
                </fieldset>
              </details>
            </div>
          )}
          {!active && (
            <details className="border border-logia-700 rounded-lg p-3">
              <summary className="text-sm cursor-pointer">
                Guardar, respaldos y más opciones
              </summary>
              <div className="space-y-2 mt-3">
                <button
                  className={button + " w-full"}
                  disabled={locked}
                  onClick={() => void saveCloud()}
                >
                  Guardar transcripción e informe en la logia
                </button>
                <button
                  className={button + " w-full"}
                  onClick={() =>
                    downloadMeetingFile(
                      new Blob([JSON.stringify(draft, null, 2)], {
                        type: "application/json",
                      }),
                      `respaldo-${draft.date}.json`,
                    )
                  }
                >
                  Descargar respaldo de texto
                </button>
                <button
                  className={button + " w-full"}
                  disabled={locked}
                  onClick={() =>
                    void action(async () => {
                      await persist();
                      setAdvanced(true);
                    })
                  }
                >
                  Importar texto y opciones avanzadas
                </button>
              </div>
            </details>
          )}
        </>
      )}
      {speakerSheet && (
        <div
          className="fixed inset-0 z-[140] bg-black/70 flex items-end sm:items-center justify-center"
        >
          <div role="dialog" aria-modal="true" aria-label="Quién está hablando" className="bg-logia-800 border border-logia-700 rounded-t-2xl sm:rounded-2xl p-4 w-full sm:max-w-lg max-h-[80dvh] flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold">Quién está hablando</h3>
              <button className={button} onClick={() => setSpeakerSheet(false)}>
                Cerrar
              </button>
            </div>
            <input
              aria-label="Buscar hermano"
              className={field}
              placeholder="Buscar hermano"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                className={button + (!onlyPresent ? " bg-indigo-700" : "")}
                onClick={() => setOnlyPresent(false)}
              >
                Miembros activos
              </button>
              <button
                className={button + (onlyPresent ? " bg-indigo-700" : "")}
                onClick={() => {
                  setOnlyPresent(true);
                  void meetingCloud
                    .present(people, draft!.date)
                    .then((ids) => change((d) => ({ ...d, presentUids: ids })))
                    .catch(() =>
                      setNotice(
                        "No se pudo consultar la asistencia. Usa miembros activos.",
                      ),
                    );
                }}
              >
                Presentes
              </button>
            </div>
            <div className="overflow-y-auto min-h-0 space-y-1">
              <button
                className={button + " w-full text-left"}
                onClick={() => mark(null)}
              >
                Sin identificar
              </button>
              {visible.map((p) => (
                <button
                  key={p.uid}
                  className={
                    button +
                    " w-full text-left " +
                    (speaker?.uid === p.uid ? "bg-indigo-800" : "")
                  }
                  onClick={() => mark(p)}
                >
                  {p.name}
                </button>
              ))}
              {!visible.length && (
                <p className="text-sm text-gray-400 p-3">
                  No hay presentes registrados o coincidencias. Puedes usar los
                  miembros activos. Asistencia sigue en su apartado habitual.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {library && (
        <div
          className="fixed inset-0 z-[140] bg-black/70 flex items-center justify-center p-3"
        >
          <div role="dialog" aria-modal="true" aria-label="Mis reuniones" className="rounded-xl border border-logia-700 bg-logia-800 p-4 w-full max-w-lg max-h-[80dvh] flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h3 className="font-bold">Mis reuniones</h3>
              <button className={button} onClick={() => setLibrary(false)}>
                Cerrar
              </button>
            </div>
            <div className="overflow-y-auto space-y-2">
              {drafts.map((d) => (
                <button
                  key={d.id}
                  className={button + " w-full text-left"}
                  onClick={() =>
                    void action(async () => {
                      await persist();
                      const list = await listMeetingsLocal(
                        user.uid,
                        user.groupId,
                      );
                      open(list.find((x) => x.id === d.id) || d);
                    })
                  }
                >
                  {d.title} · {d.date}
                  <span className="block text-xs text-gray-400">
                    {d.takes.length} audio(s) · {clock(d.durationMs)}
                  </span>
                </button>
              ))}
              {!drafts.length && (
                <p className="text-sm text-gray-400">
                  Todavía no hay reuniones en este dispositivo.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
