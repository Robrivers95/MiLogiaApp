const IncomeCapture = React.lazy(() => import('./IncomeCapture'));
import React, { useEffect, useRef, useState } from "react";
import type { User, Task } from "../types";
import {
  blankTask,
  canCapture,
  captureError,
  captureToday,
  confirmationPayload,
  TaskProposal,
} from "../services/taskCapture";
import { taskCaptureCloud } from "../services/taskCaptureCloud";
const field =
  "w-full min-w-0 rounded-lg bg-logia-900 border border-logia-700 p-3 text-base";
const button =
  "rounded-lg border border-logia-700 px-4 py-3 text-sm disabled:opacity-40";
const labels = {
  task: "Tarea",
  agreement: "Acuerdo",
  commitment: "Compromiso",
};
type Pending = {
  requestId: string;
  tasks: ReturnType<typeof confirmationPayload>;
};
export default function CaptureAssistant({
  user,
  suspended = false,
  initialText = "",
  embedded = false,
}: {
  user: User;
  suspended?: boolean;
  initialText?: string;
  embedded?: boolean;
}) {
  const storageKey = `logia-task-confirm:${user.uid}:${user.groupId}`;
  const [pending, setPending] = useState<Pending | undefined>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      return saved?.requestId && Array.isArray(saved.tasks) ? saved : undefined;
    } catch {
      return undefined;
    }
  });
  const [text, setText] = useState(initialText),
    [date, setDate] = useState(captureToday),
    [mode, setMode] = useState<"tasks" | "finance" | "income">("tasks");
  const [proposals, setProposals] = useState<TaskProposal[]>(() =>
    pending ? pending.tasks.map((t) => ({ ...t, selected: true })) : [],
  );
  const [members, setMembers] = useState<User[]>([]),
    [tasks, setTasks] = useState<Task[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [ai, setAI] = useState<boolean | null>(null),
    [statusChange, setStatusChange] = useState<Task>();
  const [serverReady, setServerReady] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState("");
  const inFlight = useRef(false),
    mounted = useRef(true),
    textRef = useRef(text);
  textRef.current = text;
  const allowed = canCapture(user),
    locked = busy || suspended || !!pending;
  const finance = ["admin", "master"].includes(user.role);
  const refresh = async () => {
    const list = await taskCaptureCloud.tasks(user.groupId);
    if (mounted.current) setTasks(list);
  };
  const checkAI = async () => {
    setAI(null);
    setServerReady(false);
    try {
      const ready = await taskCaptureCloud.status(user.groupId);
      if (mounted.current) {
        setAI(ready);
        setServerReady(true);
      }
    } catch {
      if (mounted.current) setAI(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    if (!allowed) return;
    void taskCaptureCloud
      .members(user.groupId)
      .then((list) => {
        if (mounted.current) setMembers(list);
      })
      .catch((e) => {
        if (mounted.current) setError(captureError(e));
      });
    if (!embedded)
      void refresh().catch((e) => {
        if (mounted.current) setError(captureError(e));
      });
    if (!suspended) void checkAI();
    return () => {
      mounted.current = false;
    };
  }, [user.uid, user.groupId, allowed, suspended]);
  const edit = (id: string, patch: Partial<TaskProposal>) => {
    if (locked) return;
    setProposals((list) =>
      list.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
    setReviewed(false);
    setError("");
  };
  const run = async (work: () => Promise<void>) => {
    if (inFlight.current || suspended) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      if (mounted.current) setError(captureError(e));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const analyze = () =>
    run(async () => {
      const source = text;
      if (!source.trim()) throw Error("Escribe el texto que quieres capturar.");
      if (
        proposals.length &&
        !window.confirm(
          "El nuevo análisis reemplazará las propuestas sin guardar. ¿Continuar?",
        )
      )
        return;
      const result = await taskCaptureCloud.analyze(
        user.groupId,
        source,
        date,
        mode === "income" ? "finance" : mode,
      );
      if (!mounted.current || textRef.current !== source) return;
      if (mode === "finance") {
        window.dispatchEvent(
          new CustomEvent("prepare-finance-capture", {
            detail: { groupId: user.groupId, proposal: result.finance },
          }),
        );
        setNotice(
          "Revisa el formulario de Captura rápida. Solo se guardará cuando confirmes allí; la cuota se elige después.",
        );
      } else {
        setProposals(
          result.tasks.map((t: TaskProposal) => ({ ...t, selected: true })),
        );
        setReviewed(false);
        setNotice(
          result.tasks.length
            ? "Propuestas listas. Corrige los datos y confirma cuáles guardar."
            : "No se identificaron tareas o acuerdos. Puedes añadirlos manualmente.",
        );
      }
    });
  const save = () =>
    run(async () => {
      if (!pending && !serverReady)
        throw Error(
          "La confirmación de tareas requiere publicar el servicio. Conserva tu borrador y comprueba la conexión.",
        );
      if (!pending && !reviewed)
        throw Error("Revisa las propuestas y marca la confirmación.");
      const request = pending || {
        requestId: crypto.randomUUID(),
        tasks: confirmationPayload(proposals),
      };
      // Freeze the exact confirmed payload across network retries and page reloads.
      sessionStorage.setItem(storageKey, JSON.stringify(request));
      setPending(request);
      let result;
      try {
        result = await taskCaptureCloud.confirm(
          user.groupId,
          request.requestId,
          request.tasks,
        );
      } catch (e) {
        // Only the server can prove that this request has no committed receipt.
        // Other failures keep the exact payload for an idempotent retry.
        if ((e as any)?.details?.safeToEdit === true) {
          sessionStorage.removeItem(storageKey);
          if (mounted.current) {
            setPending(undefined);
            setReviewed(false);
          }
        }
        throw e;
      }
      sessionStorage.removeItem(storageKey);
      if (mounted.current) {
        setPending(undefined);
        setProposals([]);
        setReviewed(false);
        setNotice(
          `${result.taskIds.length} tarea(s) guardada(s). Ya aparecen en Tareas e Inicio de los responsables.`,
        );
      }
      window.dispatchEvent(
        new CustomEvent("tasks-updated", { detail: { groupId: user.groupId } }),
      );
      if (!embedded) await refresh();
    });
  if (!allowed)
    return (
      <p className="p-4">
        Este apartado requiere una cuenta activa de la logia.
      </p>
    );
  const selected = proposals.filter((t) => t.selected);
  const visibleTasks = tasks.filter(
    (t) =>
      ["admin", "master"].includes(user.role) ||
      t.createdBy === user.uid ||
      t.assignedTo === user.uid ||
      t.assignedToMany?.includes(user.uid),
  );
  if (mode === 'income' && finance && !embedded) return <section className="p-4 space-y-4">
    <button className={button} onClick={()=>setMode('tasks')}>Volver a tareas y captura por texto</button>
    <React.Suspense fallback={<p>Cargando captura de ingresos…</p>}><IncomeCapture user={user} suspended={suspended}/></React.Suspense>
  </section>;
  return (
    <section
      className={embedded ? "space-y-4 min-w-0" : "p-4 space-y-4 min-w-0"}
      aria-label="Captura y tareas"
    >
      <div>
        <h2 className="text-xl font-bold">
          {embedded
            ? "Acuerdos y compromisos a tareas"
            : "Captura por texto y tareas"}
        </h2>
        <p className="text-sm text-gray-400">
          La IA prepara borradores. Revisa y corrige antes de confirmar. No se
          guarda ninguna tarea durante el análisis.
        </p>
      </div>
      {suspended && (
        <p className="text-amber-300">Logia en modo solo lectura.</p>
      )}
      {error && (
        <p role="alert" className="text-red-300 break-words">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-emerald-300">
          {notice}
        </p>
      )}
      {pending && (
        <div className="rounded border border-amber-600 p-3 text-amber-200">
          <p>
            Hay una confirmación pendiente de respuesta. Los datos quedaron
            bloqueados para evitar duplicados. Reintenta la misma confirmación.
          </p>
        </div>
      )}
      <fieldset
        disabled={locked}
        className="bg-logia-800 border border-logia-700 rounded-xl p-4 space-y-3 min-w-0"
      >
        {!embedded && finance && (
          <label className="block">
            Qué quieres preparar
            <select
              aria-label="Qué quieres preparar"
              className={field}
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as any);
                setReviewed(false);
              }}
            >
              <option value="tasks">Tareas, acuerdos y compromisos</option>
              <option value="income">Ingresos de HH: texto, fotos y solicitudes</option>
              <option value="finance">Ingreso o gasto individual para revisión</option>
            </select>
          </label>
        )}
        <label className="block">
          Fecha de referencia
          <input
            aria-label="Fecha de referencia"
            type="date"
            className={field}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="block">
          Texto para interpretar
          <textarea
            aria-label="Texto para interpretar"
            rows={5}
            maxLength={20000}
            className={field}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              mode === "tasks"
                ? "Se acordó que Carlos y Abraham organicen la visita. Carlos confirmará el lugar para el 15 de noviembre de 2026."
                : "Juan abonó $500 en efectivo para su cuota de septiembre de 2026."
            }
          />
        </label>
        {embedded && (
          <p className="text-xs text-gray-400">
            Este texto viene de los campos de acuerdos y compromisos del acta.
            Puedes corregirlo o pegar otros puntos antes del análisis. La
            transcripción completa no se envía aquí.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button + " bg-indigo-700"}
            disabled={ai !== true || !text.trim()}
            onClick={() => void analyze()}
          >
            {busy ? "Procesando…" : "Interpretar con IA"}
          </button>
          {mode === "tasks" && (
            <button
              className={button}
              disabled={proposals.length >= 12}
              onClick={() => {
                setProposals((list) => [...list, blankTask()]);
                setReviewed(false);
              }}
            >
              Añadir tarea manual
            </button>
          )}
        </div>
      </fieldset>
      {!suspended && (
        <p className="text-sm text-gray-400">
          {ai === null
            ? "Comprobando conexión de IA…"
            : ai
              ? "IA disponible. Los responsables deben pertenecer a esta logia."
              : "IA pendiente de publicación o configuración. Puedes preparar borradores manualmente."}{" "}
          <button
            disabled={busy}
            className="underline text-indigo-300"
            onClick={() => void checkAI()}
          >
            Comprobar conexión
          </button>
        </p>
      )}
      {proposals.length > 0 && (
        <div className="space-y-4">
          {!serverReady && !pending && (
            <p className="text-amber-300 text-sm">
              La confirmación está pendiente de conexión o publicación del
              servicio. Puedes editar el borrador; todavía no se pueden crear
              tareas desde este apartado.
            </p>
          )}
          <h3 className="font-bold">
            Revisar propuestas ({selected.length} seleccionadas)
          </h3>
          <label className="block text-sm">
            Buscar responsable
            <input
              aria-label="Buscar responsable"
              className={field}
              value={peopleSearch}
              onChange={(e) => setPeopleSearch(e.target.value)}
            />
          </label>
          {proposals.map((p, index) => (
            <fieldset
              key={p.id}
              disabled={locked}
              className="rounded-xl border border-logia-700 bg-logia-800 p-4 space-y-3 min-w-0"
              aria-label={`Propuesta ${index + 1}`}
            >
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={p.selected}
                  onChange={(e) => edit(p.id, { selected: e.target.checked })}
                />
                Incluir propuesta {index + 1}
              </label>
              {p.sourceQuote && (
                <blockquote className="text-sm text-gray-400 border-l-2 border-indigo-500 pl-3 whitespace-pre-wrap break-words">
                  {p.sourceQuote}
                </blockquote>
              )}
              <label className="block">
                Tipo
                <select
                  aria-label={`Tipo ${index + 1}`}
                  className={field}
                  value={p.kind}
                  onChange={(e) => edit(p.id, { kind: e.target.value as any })}
                >
                  {Object.entries(labels).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Título
                <input
                  aria-label={`Título ${index + 1}`}
                  className={field}
                  maxLength={160}
                  value={p.title}
                  onChange={(e) => edit(p.id, { title: e.target.value })}
                />
              </label>
              <label className="block">
                Descripción y detalles
                <textarea
                  aria-label={`Descripción ${index + 1}`}
                  className={field}
                  rows={3}
                  maxLength={4000}
                  value={p.description}
                  onChange={(e) => edit(p.id, { description: e.target.value })}
                />
              </label>
              <label className="block">
                Fecha límite (opcional)
                <input
                  aria-label={`Fecha límite ${index + 1}`}
                  className={field}
                  type="date"
                  value={p.dueDate}
                  onChange={(e) => edit(p.id, { dueDate: e.target.value })}
                />
              </label>
              <p className="text-sm text-indigo-300">
                Responsables:{" "}
                {p.assigneeIds
                  .map(
                    (id) =>
                      members.find((m) => m.uid === id)?.name ||
                      "Miembro no disponible",
                  )
                  .join(", ") || "Pendiente de seleccionar"}
              </p>
              <div
                className="max-h-48 overflow-y-auto space-y-1"
                role="group"
                aria-label={`Responsables ${index + 1}`}
              >
                {members
                  .filter(
                    (m) =>
                      !peopleSearch ||
                      m.name
                        .toLocaleLowerCase("es")
                        .includes(peopleSearch.toLocaleLowerCase("es")),
                  )
                  .map((m) => (
                    <label key={m.uid} className="flex gap-3 items-center p-2">
                      <input
                        type="checkbox"
                        checked={p.assigneeIds.includes(m.uid)}
                        onChange={(e) =>
                          edit(p.id, {
                            assigneeIds: e.target.checked
                              ? [...p.assigneeIds, m.uid]
                              : p.assigneeIds.filter((id) => id !== m.uid),
                          })
                        }
                      />
                      <span className="break-words min-w-0">{m.name}</span>
                    </label>
                  ))}
              </div>
              {p.assigneeIds.length > 1 && (
                <label className="block">
                  Asignación
                  <select
                    aria-label={`Asignación ${index + 1}`}
                    className={field}
                    value={p.assignmentMode}
                    onChange={(e) =>
                      edit(p.id, { assignmentMode: e.target.value as any })
                    }
                  >
                    <option value="individual">
                      Una tarea independiente por responsable
                    </option>
                    <option value="team">
                      Una tarea compartida por el equipo
                    </option>
                  </select>
                </label>
              )}
              <button
                className={button + " text-red-300"}
                onClick={() => {
                  setProposals((list) => list.filter((t) => t.id !== p.id));
                  setReviewed(false);
                }}
              >
                Descartar propuesta
              </button>
            </fieldset>
          ))}
          <label className="flex gap-3 items-start">
            <input
              disabled={locked}
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            <span>
              Revisé las tareas seleccionadas, sus responsables, detalles y
              fechas. Confirmo que se registren y se compartan con los miembros
              de la logia.
            </span>
          </label>
          <button
            className={button + " bg-emerald-700 w-full"}
            disabled={
              busy ||
              suspended ||
              (!pending && (!serverReady || !reviewed || !selected.length))
            }
            onClick={() => void save()}
          >
            {busy
              ? "Guardando…"
              : pending
                ? "Reintentar la misma confirmación"
                : "Confirmar y crear tareas"}
          </button>
        </div>
      )}
      {!embedded && (
        <div className="space-y-3">
          <div className="flex justify-between gap-2">
            <h3 className="font-bold">
              {finance
                ? "Tareas de la logia"
                : "Mis tareas y tareas que asigné"}
            </h3>
            <button
              className={button}
              disabled={busy}
              onClick={() => void run(refresh)}
            >
              Actualizar tareas
            </button>
          </div>
          {visibleTasks.length === 0 && (
            <p className="text-gray-400">No hay tareas para mostrar.</p>
          )}
          {visibleTasks.map((t) => (
            <article
              key={t.id}
              className="border border-logia-700 bg-logia-800 rounded-xl p-4 space-y-2 break-words"
            >
              <h4 className="font-bold">{t.title}</h4>
              <p className="text-sm whitespace-pre-wrap">{t.description}</p>
              <p className="text-sm text-indigo-300">
                {t.assignedToName ||
                  t.assignedToNames?.join(", ") ||
                  "Sin asignar"}
              </p>
              <p className="text-sm">
                {t.kind ? labels[t.kind] + " · " : ""}
                {t.completed ? "Completada" : "Pendiente"}
                {t.dueDate ? " · Límite: " + t.dueDate : ""}
              </p>
              <button
                className={button}
                disabled={
                  busy ||
                  suspended ||
                  (!finance &&
                    t.createdBy !== user.uid &&
                    t.assignedTo !== user.uid &&
                    !t.assignedToMany?.includes(user.uid))
                }
                onClick={() => setStatusChange(t)}
              >
                {t.completed ? "Reabrir tarea" : "Marcar completada"}
              </button>
            </article>
          ))}
        </div>
      )}
      {statusChange && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar estado de tarea"
          className="fixed inset-0 z-[150] bg-black/80 p-4 flex items-center justify-center"
        >
          <div className="bg-logia-800 border border-logia-700 rounded-xl p-5 space-y-4 w-full max-w-lg">
            <p>
              ¿Confirmas {statusChange.completed ? "reabrir" : "completar"} «
              {statusChange.title}»?
            </p>
            <div className="flex gap-3">
              <button
                disabled={busy}
                className={button}
                onClick={() => setStatusChange(undefined)}
              >
                Cancelar
              </button>
              <button
                disabled={busy || suspended}
                className={button + " bg-emerald-700"}
                onClick={() =>
                  void run(async () => {
                    await taskCaptureCloud.complete(
                      user.groupId,
                      statusChange.id,
                      !statusChange.completed,
                    );
                    setStatusChange(undefined);
                    await refresh();
                    window.dispatchEvent(
                      new CustomEvent("tasks-updated", {
                        detail: { groupId: user.groupId },
                      }),
                    );
                  })
                }
              >
                Confirmar cambio
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
