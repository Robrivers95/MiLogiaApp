import type { User } from "../types";
import {
  captureAuthority,
  reviewedTasks,
} from "../functions/src/meetingCapturePolicy";
export type TaskProposal = {
  id: string;
  title: string;
  description: string;
  kind: "task" | "agreement" | "commitment";
  assigneeIds: string[];
  dueDate: string;
  assignmentMode: "individual" | "team";
  sourceQuote?: string;
  selected: boolean;
};
export const canCapture = (u: User) =>
  !!u.groupId && captureAuthority(u, u.groupId);
export const blankTask = (): TaskProposal => ({
  id: crypto.randomUUID(),
  title: "",
  description: "",
  kind: "task",
  assigneeIds: [],
  dueDate: "",
  assignmentMode: "individual",
  selected: true,
});
export const confirmationPayload = (tasks: TaskProposal[]) =>
  reviewedTasks(tasks.filter((t) => t.selected));
export const captureToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const captureError = (e: unknown) => {
  const code = (e as any)?.code;
  return [
    "functions/not-found",
    "functions/unavailable",
    "functions/internal",
  ].includes(code)
    ? "El servicio de captura aún no está publicado o no responde. El texto se conserva; puedes preparar las tareas manualmente y reintentar después."
    : e instanceof Error
      ? e.message
      : "No se pudo completar la operación.";
};
