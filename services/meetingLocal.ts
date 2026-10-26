import type { MeetingDraft } from "./meetingModel";
const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("mi-logia-secretaria", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("drafts", { keyPath: "id" });
      request.result.createObjectStore("chunks", {
        keyPath: ["draftId", "takeId", "sequence"],
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        Error(
          "No se pudo abrir el guardado local. Revisa el espacio disponible y los permisos del navegador.",
        ),
      );
  });
async function transact<T>(
  store: string,
  mode: IDBTransactionMode,
  work: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let request: IDBRequest<T>;
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(
        Error(
          "No se pudo guardar en este dispositivo. Descarga un respaldo antes de cerrar.",
        ),
      );
    };
    try {
      request = work(tx.objectStore(store));
    } catch {
      tx.abort();
      db.close();
      reject(
        Error(
          "No se pudo guardar en este dispositivo. Descarga un respaldo antes de cerrar.",
        ),
      );
    }
  });
}
export const saveMeetingLocal = (draft: MeetingDraft) =>
  transact("drafts", "readwrite", (s) => s.put(draft));
export async function listMeetingsLocal(ownerUid: string, groupId: string) {
  return (
    await transact<MeetingDraft[]>("drafts", "readonly", (s) => s.getAll())
  )
    .filter((d) => d.ownerUid === ownerUid && d.groupId === groupId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export const saveMeetingChunk = (
  draftId: string,
  takeId: string,
  sequence: number,
  blob: Blob,
) =>
  transact("chunks", "readwrite", (s) =>
    s.put({ draftId, takeId, sequence, blob }),
  );
export async function meetingAudio(
  draftId: string,
  takeId: string,
  mime: string,
) {
  const chunks = await transact<{ blob: Blob }[]>("chunks", "readonly", (s) =>
    s.getAll(
      IDBKeyRange.bound(
        [draftId, takeId, 0],
        [draftId, takeId, Number.MAX_SAFE_INTEGER],
      ),
    ),
  );
  return new Blob(
    chunks.map((c) => c.blob),
    { type: mime },
  );
}
export async function deleteMeetingLocal(id: string) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["drafts", "chunks"], "readwrite");
    tx.objectStore("drafts").delete(id);
    const cursor = tx
      .objectStore("chunks")
      .openCursor(
        IDBKeyRange.bound([id, "", 0], [id, "\uffff", Number.MAX_SAFE_INTEGER]),
      );
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (c) {
        c.delete();
        c.continue();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(Error("No se pudo eliminar el borrador local."));
    };
  });
}
export function downloadMeetingFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
