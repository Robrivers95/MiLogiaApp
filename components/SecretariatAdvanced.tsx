import React, { useEffect, useRef, useState } from "react";
import CaptureAssistant from "./CaptureAssistant";
import type { User } from "../types";
import {
  MeetingDraft,
  MeetingSpeaker,
  MeetingField,
  MeetingText,
  canUseSecretariat,
  newMeeting,
  uid,
  clock,
  parseTranscript,
  meetingPrompt,
  meetingTextExport,
  restoreMeetingBackup,
} from "../services/meetingModel";
import {
  saveMeetingLocal,
  listMeetingsLocal,
  meetingAudio,
  downloadMeetingFile,
  deleteMeetingLocal,
} from "../services/meetingLocal";
import { MeetingRecorder } from "../services/meetingRecorder";
import { meetingCloud } from "../services/meetingCloud";
const input =
  "w-full rounded-lg border border-logia-700 bg-logia-900 p-3 text-base";
const button =
  "rounded-lg border border-logia-700 p-3 text-sm disabled:opacity-40";
export default function Secretariat({
  user,
  suspended = false,
  onSimple,
}: {
  user: User;
  suspended?: boolean;
  onSimple?: (draft: MeetingDraft | undefined) => void;
}) {
  const [taskCapture, setTaskCapture] = useState(false);
  const [draft, setDraft] = useState<MeetingDraft>();
  const draftRef = useRef<MeetingDraft>();
  const [drafts, setDrafts] = useState<MeetingDraft[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [onlyPresent, setOnlyPresent] = useState(false);
  const [tab, setTab] = useState("record");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "starting" | "recording" | "paused" | "stopping"
  >("idle");
  const statusRef = useRef(status);
  statusRef.current = status;
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [dictate, setDictate] = useState(false);
  const [selected, setSelected] = useState<MeetingSpeaker | null>(null);
  const [paste, setPaste] = useState("");
  const [backup, setBackup] = useState<{ take: any; blob: Blob }>();
  const [review, setReview] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const checkAI = async () => {
    setAiReady(null);
    try {
      setAiReady(await meetingCloud.aiStatus(user.groupId));
    } catch {
      setAiReady(false);
    }
  };
  const [importOffset, setImportOffset] = useState("0");
  const [copyPrompt, setCopyPrompt] = useState(false);
  const recorder = useRef<MeetingRecorder>();
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const saving = useRef(Promise.resolve());
  const alive = useRef(true);
  const persist = () => {
    const d = draftRef.current;
    if (!d) return Promise.resolve();
    const operation = saving.current
      .catch(() => {})
      .then(() => saveMeetingLocal(d))
      .then(() => {
        if (alive.current) {
          setSaved("Guardado en este dispositivo");
          setDrafts((list) =>
            [d, ...list.filter((item) => item.id !== d.id)].sort(
              (a, b) => b.updatedAt - a.updatedAt,
            ),
          );
        }
      });
    saving.current = operation;
    return operation;
  };
  const change = (edit: (d: MeetingDraft) => MeetingDraft) => {
    const old = draftRef.current;
    if (!old) return;
    const next = edit(old);
    if (next === old) return;
    const updated = {
      ...next,
      updatedAt: Date.now(),
      revision: old.revision + 1,
      reviewedAt: undefined,
    };
    delete updated.reviewedAt;
    draftRef.current = updated;
    setDraft(updated);
    setReview(false);
    setSaved("Guardando…");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(
      () =>
        void persist().catch((e) => {
          setSaved("No guardado");
          setError(e.message);
        }),
      300,
    );
  };
  const open = (value: MeetingDraft) => {
    draftRef.current = value;
    setDraft(value);
    setSelected(null);
    setElapsed(value.durationMs || 0);
    setError("");
    setNotice("");
    setReview(false);
    setBackup(undefined);
    setTab("record");
  };
  useEffect(() => {
    let canceled = false;
    alive.current = true;
    let stopAI = false;
    meetingCloud
      .aiStatus(user.groupId)
      .then((value) => {
        if (!stopAI) setAiReady(value);
      })
      .catch(() => {
        if (!stopAI) setAiReady(false);
      });
    (async () => {
      try {
        const list = await listMeetingsLocal(user.uid, user.groupId);
        if (canceled) return;
        setDrafts(list);
        setReady(true);
        const interrupted = list.filter((d) =>
          d.takes.some((t) => !t.complete),
        );
        if (interrupted.length)
          setNotice(
            "Hay un audio que no alcanzó a cerrarse. Ábrelo y descarga los fragmentos recuperados para revisarlos.",
          );
      } catch (e) {
        if (!canceled) setError((e as Error).message);
      }
      try {
        const people = await meetingCloud.members(user.groupId);
        if (!canceled) setMembers(people);
      } catch {
        if (!canceled)
          setNotice(
            "No se pudo cargar la lista de miembros. Puedes grabar con turnos sin identificar y asignarlos después.",
          );
      }
    })();
    return () => {
      canceled = true;
      stopAI = true;
      alive.current = false;
      clearTimeout(saveTimer.current);
      recorder.current?.dispose();
      void persist().catch(() => {});
    };
  }, [user.uid, user.groupId]);
  useEffect(() => {
    const guard = (event: Event) => {
      if (statusRef.current !== "idle") {
        event.preventDefault();
        setError(
          "Pausa o termina la grabación antes de cambiar de sección o cerrar sesión.",
        );
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (statusRef.current !== "idle") {
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
    if (status !== "recording") return;
    const timer = setInterval(
      () => setElapsed(recorder.current?.elapsed() || 0),
      250,
    );
    return () => clearInterval(timer);
  }, [status]);
  if (!canUseSecretariat(user))
    return (
      <p className="p-5 text-red-300">
        Este apartado requiere autorización de Secretario, Admin o Master.
      </p>
    );
  const locked = busy || status !== "idle" || suspended;
  const refresh = async () =>
    setDrafts(await listMeetingsLocal(user.uid, user.groupId));
  const make = async () => {
    try {
      await persist();
      const next = newMeeting(user.uid, user.groupId);
      await saveMeetingLocal(next);
      open(next);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const memberSpeaker = (id: string) => {
    const u = members.find((m) => m.uid === id);
    return u ? { uid: u.uid, name: u.name } : null;
  };
  const mark = (speaker: MeetingSpeaker | null) => {
    setSelected(speaker);
    if (status === "recording")
      change((d) => ({
        ...d,
        marks: [
          ...d.marks,
          { id: uid(), atMs: recorder.current?.elapsed() || 0, speaker },
        ],
      }));
  };
  const start = async () => {
    setError("");
    setNotice("");
    setCopyPrompt(false);
    const d = draftRef.current;
    if (!d) return;
    recorder.current?.dispose();
    const r = new MeetingRecorder({
      draft: () => draftRef.current!,
      change,
      warning: setNotice,
      state: (value) => {
        statusRef.current = value;
        setStatus(value);
      },
      meter: setLevel,
      backup: (take, blob) => setBackup({ take, blob }),
      persist,
    });
    recorder.current = r;
    change((old) => ({
      ...old,
      marks: [
        ...old.marks,
        { id: uid(), atMs: old.durationMs || 0, speaker: selected },
      ],
    }));
    try {
      await r.start(dictate);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const importText = (text: string) => {
    try {
      const blocks = parseTranscript(
        text,
        draftRef.current!.marks,
        Number(importOffset),
      );
      if (draftRef.current!.texts.length + blocks.length > 1200)
        throw Error("Hay demasiados segmentos; divide la transcripción.");
      if (
        draftRef.current!.texts.reduce((n, t) => n + t.text.length, 0) +
          text.length >
        120000
      )
        throw Error("La transcripción supera el límite de esta acta.");
      change((d) => ({ ...d, texts: [...d.texts, ...blocks] }));
      setPaste("");
      setNotice(
        "Texto añadido. El texto sin tiempos requiere asignar el hablante manualmente. Los tiempos SRT/VTT se comparan con el inicio total de la grabación.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const fieldChange = (id: string, patch: Partial<MeetingField>) =>
    change((d) => ({
      ...d,
      fields: d.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  const analyze = async () => {
    const snapshot = draftRef.current!;
    if (!snapshot.texts.some((t) => t.text.trim())) {
      setError("Primero añade o transcribe las intervenciones.");
      return;
    }
    if (!snapshot.fields.some((f) => !f.manualOnly && f.origin !== "manual")) {
      setError(
        "Añade al menos un campo para extraer. Los campos que ya editaste manualmente se conservan.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await persist();
      const result = await meetingCloud.organize(snapshot);
      if (draftRef.current!.revision !== snapshot.revision)
        throw Error(
          "El acta cambió durante el análisis. Repite el análisis para usar la versión actual.",
        );
      const allowed = new Set(
        snapshot.fields
          .filter((f) => !f.manualOnly && f.origin !== "manual")
          .map((f) => f.id),
      );
      const evidence = new Set(snapshot.texts.map((t) => t.id));
      if (
        !Array.isArray(result.fields) ||
        result.fields.some(
          (f) =>
            !allowed.has(f.id) ||
            typeof f.value !== "string" ||
            !Array.isArray(f.evidenceIds) ||
            f.evidenceIds.some((id) => !evidence.has(id)),
        )
      )
        throw Error(
          "La respuesta de IA no tiene el formato esperado. Se conservaron tus datos.",
        );
      change((d) => ({
        ...d,
        fields: d.fields.map((f) => {
          const value = result.fields.find((r) => r.id === f.id);
          return value && allowed.has(f.id)
            ? { ...f, ...value, origin: "ai" }
            : f;
        }),
      }));
      await persist();
      setNotice(
        "Borrador de IA listo. Revisa nombres, comentarios, acuerdos y compromisos antes de aprobar.",
      );
    } catch (e) {
      setError((e as Error).message);
      setCopyPrompt(true);
    } finally {
      setBusy(false);
    }
  };
  const visible = members.filter(
    (m) =>
      (!onlyPresent || draft?.presentUids.includes(m.uid)) &&
      m.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es")),
  );
  return (
    <div className="p-4 space-y-4 pb-8">
      {onSimple && (
        <button
          className={button}
          disabled={locked}
          onClick={async () => {
            await persist();
            onSimple(draftRef.current);
          }}
        >
          ← Volver a vista simple
        </button>
      )}
      <div className="flex flex-wrap justify-between gap-3 items-center">
        <div>
          <h2 className="text-2xl font-bold">Secretaría · Actas de tenida</h2>
          <p className="text-sm text-gray-400">
            Audio, turnos, transcripción y un formato que tú defines.
          </p>
        </div>
        <button
          className={button}
          disabled={!ready || locked}
          onClick={() => void make()}
        >
          Nueva tenida
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="p-3 bg-red-950/60 text-red-200 rounded-lg break-words"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="p-3 bg-logia-800 border border-logia-700 text-gray-200 rounded-lg text-sm"
        >
          {notice}
        </p>
      )}
      <details className="bg-logia-800 border border-logia-700 rounded-lg p-3">
        <summary className="cursor-pointer font-semibold">
          Mis borradores en este dispositivo ({drafts.length})
        </summary>
        <div className="space-y-2 mt-3">
          {drafts.map((item) => (
            <div key={item.id} className="flex gap-2">
              <button
                disabled={busy || status !== "idle"}
                className={button + " flex-1 text-left min-w-0 break-words"}
                onClick={async () => {
                  try {
                    await persist();
                    const items = await listMeetingsLocal(
                      user.uid,
                      user.groupId,
                    );
                    const latest = items.find((d) => d.id === item.id);
                    if (latest) open(latest);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {item.date} · {item.title}
              </button>
              <button
                disabled={locked}
                className={button}
                aria-label={`Eliminar borrador ${item.title}`}
                onClick={async () => {
                  if (
                    !confirm(
                      "¿Eliminar el borrador y su audio de este dispositivo? Las copias descargadas o guardadas en la logia permanecen.",
                    )
                  )
                    return;
                  try {
                    await deleteMeetingLocal(item.id);
                    if (draft?.id === item.id) {
                      draftRef.current = undefined;
                      setDraft(undefined);
                    }
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Eliminar
              </button>
            </div>
          ))}
          <button
            disabled={locked}
            className={button}
            onClick={() => void refresh().catch((e) => setError(e.message))}
          >
            Actualizar borradores
          </button>
          <label className="block text-sm mt-3">
            Restaurar respaldo de acta (JSON)
            <input
              aria-label="Restaurar respaldo de acta"
              type="file"
              accept=".json,application/json"
              disabled={locked || !ready}
              className="block w-full mt-2 text-sm"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  if (f.size > 1000000) throw Error("El respaldo supera 1 MB.");
                  await persist();
                  const restored = restoreMeetingBackup(
                    await f.text(),
                    user.uid,
                    user.groupId,
                  );
                  await saveMeetingLocal(restored);
                  open(restored);
                  await refresh();
                  setNotice(
                    "Se restauró una copia del texto, formato y turnos. Los archivos de audio se conservan por separado.",
                  );
                } catch (error) {
                  setError((error as Error).message);
                }
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </details>
      {!draft ? (
        <section className="bg-logia-800 rounded-xl p-5 space-y-3">
          <p>
            Crea una tenida para comenzar. El audio se conserva en este
            dispositivo; descarga un respaldo al terminar.
          </p>
          <button
            disabled={busy}
            className={button}
            onClick={async () => {
              setBusy(true);
              try {
                const items = await meetingCloud.list(user.groupId);
                if (!items.length)
                  setNotice("Todavía no hay actas guardadas en la logia.");
                const local = await listMeetingsLocal(user.uid, user.groupId);
                for (const item of items)
                  if (!local.some((d) => d.id === item.id))
                    await saveMeetingLocal({
                      ...item,
                      ownerUid: user.uid,
                      takes: [],
                    });
                if (items.length)
                  setNotice(
                    "Actas nuevas traídas. Los borradores locales existentes se conservaron para proteger tus cambios.",
                  );
                await refresh();
              } catch {
                setError(
                  "No se pudo consultar el archivo de la logia. El acceso del secretario y las reglas deben estar publicados. Puedes trabajar con borradores locales.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Traer actas de la logia
          </button>
        </section>
      ) : (
        <>
          <div className="bg-logia-800 p-4 rounded-xl border border-logia-700 space-y-3">
            <label className="block text-sm">
              Título de la tenida
              <input
                aria-label="Título de la tenida"
                className={input}
                value={draft.title}
                maxLength={160}
                disabled={locked}
                onChange={(e) =>
                  change((d) => ({ ...d, title: e.target.value }))
                }
              />
            </label>
            <label className="block text-sm">
              Fecha de la tenida
              <input
                aria-label="Fecha de la tenida"
                type="date"
                className={input}
                value={draft.date}
                disabled={locked}
                onChange={(e) =>
                  change((d) => ({
                    ...d,
                    date: e.target.value,
                    presentUids: [],
                  }))
                }
              />
            </label>
            <p className="text-xs text-gray-400">
              {saved || "Borrador local"}
              {draft.reviewedAt ? " · Revisado" : " · Pendiente de revisión"}
            </p>
          </div>
          <div
            role="tablist"
            aria-label="Preparar acta"
            className="grid grid-cols-3 gap-2"
          >
            {[
              ["record", "Grabar y turnos"],
              ["text", "Transcripción"],
              ["format", "Formato y acta"],
            ].map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={
                  button +
                  (tab === id
                    ? " bg-indigo-600 font-semibold"
                    : " bg-logia-800")
                }
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "record" && (
            <div className="space-y-4">
              <section className="bg-logia-800 p-4 rounded-xl border border-logia-700 space-y-3">
                <p className="text-3xl font-mono" aria-label="Tiempo de audio">
                  {clock(elapsed)}
                </p>
                <div
                  role="meter"
                  aria-label="Nivel del micrófono"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(level)}
                  className="h-2 bg-logia-900 rounded overflow-hidden"
                >
                  <div
                    className="h-full bg-green-400"
                    style={{ width: `${level}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={button + " bg-indigo-600 font-semibold"}
                    disabled={locked || !ready}
                    onClick={() => void start()}
                  >
                    {draft.takes.length
                      ? "Continuar grabación"
                      : "Grabar audio"}
                  </button>
                  <button
                    className={button + " bg-red-950/60"}
                    disabled={status !== "recording"}
                    onClick={() => recorder.current?.stop()}
                  >
                    Pausar y guardar tramo
                  </button>
                  <span role="status" className="p-3 text-sm">
                    {status === "recording"
                      ? "Grabando"
                      : status === "starting"
                        ? "Preparando micrófono…"
                        : status === "stopping"
                          ? "Cerrando y guardando audio…"
                          : "Audio detenido"}
                  </span>
                </div>
                <label className="flex gap-2 items-start text-sm">
                  <input
                    type="checkbox"
                    checked={dictate}
                    disabled={locked}
                    onChange={(e) => setDictate(e.target.checked)}
                  />
                  Transcribir con el navegador mientras grabo
                </label>
                <p className="text-xs text-gray-400">
                  El dictado no usa tokens de la IA del acta. Depende del
                  navegador, puede necesitar internet y enviar audio a su
                  proveedor de reconocimiento. Si no funciona, conserva el audio
                  e importa una transcripción.
                </p>
                <p className="text-xs text-gray-400">
                  Mantén esta pantalla abierta durante la grabación. Activa No
                  molestar y prueba antes el micrófono. El navegador puede
                  interrumpir el audio al bloquear la pantalla, recibir llamadas
                  o desconectar el micrófono.
                </p>
                {backup && (
                  <button
                    className={button + " bg-amber-950 text-amber-100"}
                    onClick={() =>
                      downloadMeetingFile(
                        backup.blob,
                        `respaldo-audio.${backup.take.mime.includes("mp4") ? "m4a" : "webm"}`,
                      )
                    }
                  >
                    Descargar respaldo de audio pendiente
                  </button>
                )}
                {draft.takes.map((take, i) => (
                  <div
                    key={take.id}
                    className="flex flex-wrap gap-2 items-center justify-between border-t border-logia-700 pt-2 text-sm"
                  >
                    <span>
                      Tramo {i + 1} · {clock(take.durationMs)}
                      {!take.complete ? " · Recuperado o sin cerrar" : ""}
                    </span>
                    <button
                      className={button}
                      disabled={status !== "idle"}
                      onClick={async () => {
                        try {
                          const blob = await meetingAudio(
                            draft.id,
                            take.id,
                            take.mime,
                          );
                          if (!blob.size)
                            throw Error("Este tramo no tiene audio guardado.");
                          downloadMeetingFile(
                            blob,
                            `tenida-${draft.date}-tramo-${i + 1}.${take.mime.includes("mp4") ? "m4a" : "webm"}`,
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Descargar audio
                    </button>
                  </div>
                ))}
              </section>
              <section className="bg-logia-800 p-4 rounded-xl border border-logia-700 space-y-3">
                <h3 className="font-bold text-lg">¿Quién tiene la palabra?</h3>
                <p className="text-sm text-indigo-200">
                  Seleccionado: {selected?.name || "Sin identificar"}
                </p>
                <input
                  aria-label="Buscar hablante"
                  placeholder="Buscar hermano…"
                  value={search}
                  className={input}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    className={button}
                    disabled={locked}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const ids = await meetingCloud.present(
                          members,
                          draft.date,
                        );
                        change((d) => ({ ...d, presentUids: ids }));
                        setOnlyPresent(true);
                        setNotice(
                          ids.length
                            ? `${ids.length} presentes tomados de Asistencia. Puedes ajustar la selección.`
                            : "No hay presentes registrados para esta fecha. Marca los asistentes manualmente.",
                        );
                      } catch {
                        setError(
                          "No se pudo consultar Asistencia. Puedes marcar presentes manualmente.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Tomar presentes de Asistencia
                  </button>
                  <label className="flex gap-2 items-center text-sm">
                    <input
                      type="checkbox"
                      checked={onlyPresent}
                      onChange={(e) => setOnlyPresent(e.target.checked)}
                    />
                    Solo presentes ({draft.presentUids.length})
                  </label>
                </div>
                <button
                  className={button}
                  disabled={busy || suspended}
                  onClick={() => mark(null)}
                >
                  Sin identificar / intervención general
                </button>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                  {visible.map((member) => (
                    <div
                      key={member.uid}
                      className="flex gap-2 items-center border border-logia-700 rounded-lg p-2"
                    >
                      <input
                        aria-label={`Presente: ${member.name}`}
                        type="checkbox"
                        checked={draft.presentUids.includes(member.uid)}
                        disabled={busy || suspended}
                        onChange={(e) =>
                          change((d) => ({
                            ...d,
                            presentUids: e.target.checked
                              ? [...d.presentUids, member.uid]
                              : d.presentUids.filter((id) => id !== member.uid),
                          }))
                        }
                      />
                      <button
                        disabled={
                          busy ||
                          suspended ||
                          status === "stopping" ||
                          status === "starting"
                        }
                        aria-pressed={selected?.uid === member.uid}
                        className={
                          "flex-1 text-left p-2 rounded break-words min-w-0 " +
                          (selected?.uid === member.uid ? "bg-indigo-600" : "")
                        }
                        onClick={() =>
                          mark({ uid: member.uid, name: member.name })
                        }
                      >
                        {member.name}
                      </button>
                    </div>
                  ))}
                </div>
                {!visible.length && (
                  <p className="text-sm text-gray-400">
                    No hay miembros que coincidan. Puedes quitar el filtro de
                    presentes.
                  </p>
                )}
                <details>
                  <summary className="cursor-pointer text-sm">
                    Turnos guardados ({draft.marks.length})
                  </summary>
                  <div className="space-y-2 mt-2">
                    {draft.marks.map((m) => (
                      <div
                        key={m.id}
                        className="flex flex-wrap gap-2 text-sm items-center"
                      >
                        <span>{clock(m.atMs)}</span>
                        <select
                          aria-label={`Hablante del turno ${clock(m.atMs)}`}
                          disabled={locked}
                          className={input + " flex-1 min-w-0"}
                          value={m.speaker?.uid || ""}
                          onChange={(e) =>
                            change((d) => ({
                              ...d,
                              marks: d.marks.map((x) =>
                                x.id === m.id
                                  ? {
                                      ...x,
                                      speaker: memberSpeaker(e.target.value),
                                    }
                                  : x,
                              ),
                            }))
                          }
                        >
                          <option value="">Sin identificar</option>
                          {members.map((u) => (
                            <option key={u.uid} value={u.uid}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    Corregir un turno no cambia automáticamente las
                    intervenciones ya transcritas: revísalas en Transcripción.
                  </p>
                </details>
              </section>
            </div>
          )}
          {tab === "text" && (
            <section className="space-y-4">
              <div className="bg-logia-800 p-4 rounded-xl space-y-3">
                <p className="text-sm">
                  Importa TXT, SRT o VTT, o pega texto. Los archivos sin tiempos
                  requieren asignación manual de hablantes.
                </p>
                <label className="block text-sm">
                  Los tiempos del archivo corresponden a
                  <select
                    aria-label="Inicio de los tiempos importados"
                    className={input}
                    value={importOffset}
                    disabled={locked}
                    onChange={(e) => setImportOffset(e.target.value)}
                  >
                    <option value="0">Inicio de toda la grabación</option>
                    {draft.takes
                      .filter((t) => t.offsetMs > 0)
                      .map((t, i) => (
                        <option key={t.id} value={String(t.offsetMs)}>
                          Tramo que inicia en {clock(t.offsetMs)}
                        </option>
                      ))}
                  </select>
                </label>
                <input
                  aria-label="Importar transcripción"
                  type="file"
                  accept=".txt,.srt,.vtt,text/plain,text/vtt"
                  disabled={locked}
                  className="block w-full text-sm"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      if (f.size > 1024 * 1024)
                        throw Error(
                          "La transcripción debe pesar menos de 1 MB.",
                        );
                      importText(await f.text());
                    } catch (error) {
                      setError((error as Error).message);
                    }
                    e.target.value = "";
                  }}
                />
                <textarea
                  aria-label="Pegar transcripción"
                  className={input}
                  rows={4}
                  disabled={locked}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  maxLength={120000}
                  placeholder="Pega aquí el texto de tu herramienta de transcripción…"
                />
                <button
                  className={button}
                  disabled={locked || !paste.trim()}
                  onClick={() => importText(paste)}
                >
                  Añadir texto a la transcripción
                </button>
                <button
                  className={button + " ml-2"}
                  disabled={locked || draft.texts.length >= 1200}
                  onClick={() =>
                    change((d) => ({
                      ...d,
                      texts: [
                        ...d.texts,
                        {
                          id: uid(),
                          atMs: null,
                          speaker: selected,
                          text: "",
                          source: "manual",
                        },
                      ],
                    }))
                  }
                >
                  Añadir intervención manual
                </button>
                <p className="text-xs text-gray-400">
                  El dictado tiene tiempos aproximados. Revisa la atribución si
                  cambiaste de hablante a mitad de una frase.
                </p>
              </div>
              {draft.texts.map((block, i) => (
                <article
                  key={block.id}
                  className="bg-logia-800 border border-logia-700 rounded-xl p-4 space-y-2"
                >
                  <div className="flex gap-2 justify-between items-center">
                    <span className="text-xs text-gray-400">
                      Intervención {i + 1} ·{" "}
                      {block.atMs === null ? "Sin tiempo" : clock(block.atMs)}
                    </span>
                    <button
                      className="text-red-300 p-2 text-sm"
                      disabled={locked}
                      aria-label={`Eliminar intervención ${i + 1}`}
                      onClick={() => {
                        if (
                          confirm(
                            "¿Eliminar esta intervención del texto? El audio permanece.",
                          )
                        )
                          change((d) => ({
                            ...d,
                            texts: d.texts.filter((t) => t.id !== block.id),
                          }));
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                  <select
                    aria-label={`Hablante de intervención ${i + 1}`}
                    className={input}
                    value={block.speaker?.uid || ""}
                    disabled={locked}
                    onChange={(e) =>
                      change((d) => ({
                        ...d,
                        texts: d.texts.map((t) =>
                          t.id === block.id
                            ? { ...t, speaker: memberSpeaker(e.target.value) }
                            : t,
                        ),
                      }))
                    }
                  >
                    <option value="">Sin identificar</option>
                    {block.speaker &&
                      !members.some((m) => m.uid === block.speaker!.uid) && (
                        <option value={block.speaker.uid}>
                          {block.speaker.name}
                        </option>
                      )}
                    {members.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <textarea
                    aria-label={`Texto de intervención ${i + 1}`}
                    value={block.text}
                    rows={3}
                    maxLength={8000}
                    disabled={locked}
                    className={input}
                    onChange={(e) =>
                      change((d) => ({
                        ...d,
                        texts: d.texts.map((t) =>
                          t.id === block.id
                            ? { ...t, text: e.target.value, source: "manual" }
                            : t,
                        ),
                      }))
                    }
                  />
                </article>
              ))}
              {!draft.texts.length && (
                <p className="p-4 text-gray-400">
                  Todavía no hay texto. Graba con dictado o importa una
                  transcripción.
                </p>
              )}
            </section>
          )}
          {tab === "format" && (
            <section className="space-y-4">
              <p className="text-sm text-gray-300">
                Define los puntos que debe recopilar la IA. Puedes cambiarlos al
                inicio o antes del análisis. Los resultados que edites
                manualmente se conservan en los siguientes análisis.
              </p>
              {draft.fields.map((field, i) => (
                <article
                  key={field.id}
                  className="bg-logia-800 border border-logia-700 rounded-xl p-4 space-y-3"
                >
                  <div className="flex gap-2">
                    <input
                      aria-label={`Título del campo ${i + 1}`}
                      value={field.title}
                      maxLength={100}
                      disabled={locked}
                      className={input}
                      onChange={(e) =>
                        fieldChange(field.id, { title: e.target.value })
                      }
                    />
                    <button
                      className={button}
                      aria-label={`Quitar campo ${i + 1}`}
                      disabled={locked}
                      onClick={() => {
                        if (
                          !field.value ||
                          confirm(
                            "¿Quitar este campo y su contenido del borrador?",
                          )
                        )
                          change((d) => ({
                            ...d,
                            fields: d.fields.filter((f) => f.id !== field.id),
                          }));
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <label className="flex gap-2 text-sm items-center">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={field.manualOnly}
                      onChange={(e) =>
                        fieldChange(field.id, { manualOnly: e.target.checked })
                      }
                    />
                    Solo llenado manual
                  </label>
                  {!field.manualOnly && (
                    <label className="block text-sm">
                      Qué debe extraer la IA
                      <textarea
                        aria-label={`Instrucciones del campo ${i + 1}`}
                        value={field.instruction}
                        maxLength={1000}
                        disabled={locked}
                        rows={2}
                        className={input}
                        onChange={(e) =>
                          fieldChange(field.id, { instruction: e.target.value })
                        }
                      />
                    </label>
                  )}
                  <label className="block text-sm">
                    Contenido del acta
                    <textarea
                      aria-label={`Contenido del campo ${i + 1}`}
                      value={field.value}
                      rows={4}
                      maxLength={12000}
                      disabled={locked}
                      className={input}
                      onChange={(e) =>
                        fieldChange(field.id, {
                          value: e.target.value,
                          origin: "manual",
                          evidenceIds: [],
                        })
                      }
                    />
                  </label>
                  <p className="text-xs text-gray-400">
                    {field.origin === "ai"
                      ? "Borrador generado por IA"
                      : field.origin === "manual"
                        ? "Editado manualmente; se conserva al analizar"
                        : "Pendiente"}
                  </p>
                  {field.evidenceIds.length > 0 && (
                    <p className="text-xs text-indigo-200">
                      Sustento:{" "}
                      {field.evidenceIds
                        .map(
                          (id) =>
                            `intervención ${draft.texts.findIndex((t) => t.id === id) + 1}`,
                        )
                        .join(", ")}
                    </p>
                  )}
                  {field.origin === "manual" && !field.manualOnly && (
                    <button
                      className={button}
                      disabled={locked}
                      onClick={() => {
                        if (
                          confirm(
                            "¿Limpiar este contenido para permitir una nueva extracción con IA?",
                          )
                        )
                          fieldChange(field.id, {
                            value: "",
                            origin: "empty",
                            evidenceIds: [],
                          });
                      }}
                    >
                      Limpiar para volver a extraer
                    </button>
                  )}
                </article>
              ))}
              <div className="flex flex-wrap gap-2">
                <button
                  className={button}
                  disabled={locked || draft.fields.length >= 15}
                  onClick={() =>
                    change((d) => ({
                      ...d,
                      fields: [
                        ...d.fields,
                        {
                          id: uid(),
                          title: "Nuevo punto",
                          instruction:
                            "Describe qué debe recopilar aquí la IA.",
                          manualOnly: false,
                          value: "",
                          origin: "empty",
                          evidenceIds: [],
                        },
                      ],
                    }))
                  }
                >
                  Añadir punto al formato
                </button>
                <button
                  className={button}
                  disabled={locked}
                  onClick={async () => {
                    try {
                      await persist();
                      const next = newMeeting(user.uid, user.groupId);
                      next.fields = draft.fields.map((f) => ({
                        ...f,
                        id: uid(),
                        value: "",
                        origin: "empty",
                        evidenceIds: [],
                      }));
                      await saveMeetingLocal(next);
                      open(next);
                      await refresh();
                      setNotice(
                        "Nueva tenida creada con este formato, sin copiar contenidos ni grabaciones anteriores.",
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Usar este formato en otra tenida
                </button>
                <button
                  className={button + " bg-indigo-600 font-semibold"}
                  disabled={locked || !draft.texts.length || aiReady !== true}
                  onClick={() => void analyze()}
                >
                  {busy ? "Analizando…" : "Organizar texto con IA"}
                </button>
                <button
                  className={button}
                  disabled={locked || !draft.texts.length}
                  onClick={() => setCopyPrompt((v) => !v)}
                >
                  Preparar solicitud para otra IA
                </button>
              </div>
              {aiReady !== true && (
                <div className="bg-logia-800 border border-logia-700 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-gray-300">
                    {aiReady === null
                      ? "Comprobando la conexión de IA…"
                      : "La organización automática de actas está pendiente de conexión o configuración. Puedes llenar los campos o preparar una solicitud para otra IA."}
                  </p>
                  <button
                    className={button}
                    disabled={busy || aiReady === null}
                    onClick={() => void checkAI()}
                  >
                    Comprobar conexión de IA
                  </button>
                </div>
              )}
              {copyPrompt && (
                <div className="bg-logia-800 rounded-xl p-4 space-y-2">
                  <p className="text-sm">
                    Incluye solo texto, hablantes y campos pendientes. Puedes
                    copiarlo a tu herramienta de IA y pegar el resultado en los
                    campos del acta.
                  </p>
                  <textarea
                    aria-label="Solicitud de análisis para IA"
                    readOnly
                    rows={6}
                    className={input}
                    value={meetingPrompt(draft)}
                  />
                  <button
                    className={button}
                    onClick={() =>
                      downloadMeetingFile(
                        new Blob([meetingPrompt(draft)], {
                          type: "text/plain;charset=utf-8",
                        }),
                        `solicitud-acta-${draft.date}.txt`,
                      )
                    }
                  >
                    Descargar solicitud
                  </button>
                </div>
              )}
              <div className="bg-logia-800 p-4 rounded-xl space-y-3">
                <button
                  className={button}
                  disabled={locked}
                  onClick={() => setTaskCapture((value) => !value)}
                >
                  {taskCapture
                    ? "Cerrar preparación de tareas"
                    : "Preparar tareas de acuerdos y compromisos"}
                </button>
                {taskCapture && (
                  <CaptureAssistant
                    key={draft.id}
                    user={user}
                    suspended={suspended}
                    embedded
                    initialText={draft.fields
                      .filter((f) => /acuerd|comprom/i.test(f.title))
                      .map((f) => f.title + "\n" + f.value)
                      .join("\n\n")}
                  />
                )}
              </div>
              <div className="bg-logia-800 p-4 rounded-xl space-y-3">
                <label className="block text-sm">
                  Notas adicionales del secretario
                  <textarea
                    aria-label="Notas adicionales del secretario"
                    rows={4}
                    maxLength={10000}
                    value={draft.notes}
                    disabled={locked}
                    className={input}
                    onChange={(e) =>
                      change((d) => ({ ...d, notes: e.target.value }))
                    }
                  />
                </label>
                <label className="flex gap-2 items-start text-sm">
                  <input
                    type="checkbox"
                    checked={review}
                    disabled={locked}
                    onChange={(e) => setReview(e.target.checked)}
                  />
                  Revisé los nombres, intervenciones, acuerdos y compromisos de
                  este borrador.
                </label>
                <button
                  className={button}
                  disabled={
                    locked ||
                    !review ||
                    !draft.fields.some((f) => f.value.trim())
                  }
                  onClick={async () => {
                    const next = {
                      ...draftRef.current!,
                      reviewedAt: new Date().toISOString(),
                      updatedAt: Date.now(),
                    };
                    draftRef.current = next;
                    setDraft(next);
                    try {
                      await persist();
                      setNotice(
                        "Acta marcada como revisada. Guarda una copia en la logia o descarga el respaldo.",
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Marcar acta revisada
                </button>
              </div>
            </section>
          )}
          <section className="bg-logia-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                className={button}
                disabled={busy || status !== "idle"}
                onClick={() => {
                  downloadMeetingFile(
                    new Blob([meetingTextExport(draft)], {
                      type: "text/plain;charset=utf-8",
                    }),
                    `acta-${draft.date}.txt`,
                  );
                }}
              >
                Descargar acta y transcripción
              </button>
              <button
                className={button}
                disabled={busy || status !== "idle"}
                onClick={() =>
                  downloadMeetingFile(
                    new Blob([JSON.stringify(draft, null, 2)], {
                      type: "application/json",
                    }),
                    `respaldo-acta-${draft.date}.json`,
                  )
                }
              >
                Descargar respaldo editable
              </button>
              <button
                className={button}
                disabled={locked}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await persist();
                    const version = await meetingCloud.save(draftRef.current!);
                    const synced = {
                      ...draftRef.current!,
                      cloudVersion: version,
                    };
                    draftRef.current = synced;
                    setDraft(synced);
                    await persist();
                    setNotice(
                      "Texto del acta guardado en la logia. El audio permanece en este dispositivo; descarga sus tramos como respaldo.",
                    );
                  } catch (e) {
                    setError(
                      "No se pudo guardar en la logia. " +
                        ((e as Error).message ||
                          "Revisa la conexión y los permisos."),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Guardar texto en la logia
              </button>
            </div>
            <p className="text-xs text-gray-400">
              El audio se guarda localmente y se descarga por tramos. Guardar en
              la logia comparte el texto con Secretaría, Admin y Master; no
              publica el audio.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
