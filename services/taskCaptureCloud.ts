import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import type { User, Task } from "../types";
import type { TaskProposal } from "./taskCapture";
const call = async (data: any) =>
  (
    await httpsCallable(
      getFunctions(undefined, "us-central1"),
      "captureWithAI",
    )(data)
  ).data as any;
export const taskCaptureCloud = {
  status: async (groupId: string) =>
    (await call({ groupId, action: "status" })).configured === true,
  members: async (groupId: string): Promise<User[]> => {
    const rows = await getDocs(
      query(collection(db, "users"), where("groupId", "==", groupId)),
    );
    return rows.docs
      .map((d) => ({ ...d.data(), uid: d.id }) as User)
      .filter(
        (u) =>
          u.active === true && u.role !== "viewer" && u.groupId === groupId,
      )
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  },
  tasks: async (groupId: string): Promise<Task[]> => {
    const rows = await getDocs(collection(db, "groups", groupId, "tasks"));
    return rows.docs
      .map((d) => ({ ...d.data(), id: d.id }) as Task)
      .sort(
        (a, b) =>
          Number(a.completed) - Number(b.completed) ||
          b.createdAt.localeCompare(a.createdAt),
      );
  },
  analyze: async (
    groupId: string,
    text: string,
    date: string,
    mode: "tasks" | "finance",
  ) => call({ action: "analyze", groupId, text, date, mode }),
  confirm: async (
    groupId: string,
    requestId: string,
    tasks: Omit<TaskProposal, "selected" | "sourceQuote">[],
  ) =>
    call({
      action: "confirmTasks",
      confirmed: true,
      groupId,
      requestId,
      tasks,
    }),
  complete: async (groupId: string, taskId: string, completed: boolean) =>
    call({
      action: "setTaskComplete",
      confirmed: true,
      groupId,
      taskId,
      completed,
    }),
};
