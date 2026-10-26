import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth, db } from "./firebase";
import type { User } from "../types";
import type { MeetingDraft, MeetingField } from "./meetingModel";
export const meetingCloud = {
  members: async (groupId: string): Promise<User[]> => {
    const snapshot = await getDocs(
      query(collection(db, "users"), where("groupId", "==", groupId)),
    );
    return snapshot.docs
      .map((d) => ({ ...d.data(), uid: d.id }) as User)
      .filter((u) => u.active && u.groupId === groupId)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  },
  present: async (members: User[], date: string) => {
    const result: string[] = [];
    for (let i = 0; i < members.length; i += 20) {
      await Promise.all(
        members.slice(i, i + 20).map(async (member) => {
          const snapshot = await getDoc(
            doc(db, "users", member.uid, "attendance", date),
          );
          if (snapshot.data()?.attended === true) result.push(member.uid);
        }),
      );
    }
    return result;
  },
  list: async (groupId: string) => {
    const result = await getDocs(collection(db, "groups", groupId, "minutes"));
    return result.docs
      .map((d) => d.data() as MeetingDraft)
      .filter((d) => d.schemaVersion === 1 && d.groupId === groupId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
  save: async (draft: MeetingDraft) => {
    if (!auth.currentUser)
      throw Error("Inicia sesión para guardar en la logia.");
    const cloud = { ...draft, takes: [] };
    if (new TextEncoder().encode(JSON.stringify(cloud)).length > 750000)
      throw Error(
        "El acta es demasiado extensa para guardar en una sola ficha. Descarga el respaldo.",
      );
    const actorUid = auth.currentUser.uid;
    return runTransaction(db, async (tx) => {
      const ref = doc(db, "groups", draft.groupId, "minutes", draft.id);
      const current = await tx.get(ref);
      const version = current.exists()
        ? Number(current.data().cloudVersion || 0)
        : 0;
      if (current.exists() && version !== (draft.cloudVersion || 0))
        throw Error(
          "Otra persona actualizó esta acta. Descarga tu respaldo y trae la versión de la logia en otro borrador antes de guardar.",
        );
      tx.set(ref, { ...cloud, cloudVersion: version + 1, savedBy: actorUid });
      return version + 1;
    });
  },
  organize: async (
    draft: MeetingDraft,
  ): Promise<{
    fields: Pick<MeetingField, "id" | "value" | "evidenceIds">[];
  }> => {
    try {
      return (
        await httpsCallable(
          getFunctions(undefined, "us-central1"),
          "organizeMeetingMinutes",
        )({
          groupId: draft.groupId,
          date: draft.date,
          title: draft.title,
          texts: draft.texts,
          fields: draft.fields
            .filter((f) => !f.manualOnly && f.origin !== "manual")
            .map(({ id, title, instruction }) => ({ id, title, instruction })),
          notes: draft.notes,
        })
      ).data as any;
    } catch (error) {
      const code = (error as any).code || "";
      if (
        [
          "functions/not-found",
          "functions/unavailable",
          "functions/internal",
        ].includes(code)
      )
        throw Error(
          "La conexión de IA del acta aún no está disponible. Tu texto sigue guardado; puedes copiar la solicitud para analizarla en tu herramienta de IA.",
        );
      throw error;
    }
  },
};
