export const captureId = (s: unknown): s is string =>
  typeof s === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(s);
export function captureDate(s: unknown, optional = true): string {
  if (optional && (s === "" || s == null)) return "";
  if (
    typeof s !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    new Date(s + "T12:00:00Z").toISOString().slice(0, 10) !== s
  )
    throw Error("Revisa la fecha.");
  return s;
}
const str = (s: unknown, max: number, required = false) => {
  if (typeof s !== "string" || s.length > max || (required && !s.trim()))
    throw Error("Revisa el título o la descripción de la propuesta.");
  return s.trim();
};
export function captureAuthority(actor: any, groupId: string) {
  return (
    actor?.active === true &&
    actor.role !== "viewer" &&
    ["master", "admin", "member"].includes(actor.role) &&
    (actor.role === "master" || actor.groupId === groupId)
  );
}
export function reviewedTasks(value: any) {
  if (!Array.isArray(value) || !value.length || value.length > 12)
    throw Error("Confirma entre una y doce propuestas.");
  const ids = new Set<string>();
  return value.map((p: any) => {
    if (!captureId(p?.id) || ids.has(p.id))
      throw Error("Identificador de propuesta inválido o repetido.");
    ids.add(p.id);
    if (
      !Array.isArray(p.assigneeIds) ||
      !p.assigneeIds.length ||
      p.assigneeIds.length > 10 ||
      p.assigneeIds.some((id: any) => !captureId(id)) ||
      new Set(p.assigneeIds).size !== p.assigneeIds.length
    )
      throw Error("Selecciona entre uno y diez responsables por propuesta.");
    if (
      !["task", "agreement", "commitment"].includes(p.kind) ||
      !["individual", "team"].includes(p.assignmentMode)
    )
      throw Error("Revisa el tipo de tarea.");
    return {
      id: p.id as string,
      title: str(p.title, 160, true),
      description: str(p.description, 4000),
      assigneeIds: [...p.assigneeIds] as string[],
      dueDate: captureDate(p.dueDate),
      kind: p.kind as "task" | "agreement" | "commitment",
      assignmentMode: p.assignmentMode as "team" | "individual",
    };
  });
}
export function taskSuggestions(
  output: any,
  text: string,
  allowed: Set<string>,
) {
  if (!Array.isArray(output?.tasks) || output.tasks.length > 12)
    throw Error("Respuesta de tareas inválida.");
  return output.tasks.map((p: any) => {
    const quote = str(p.sourceQuote, 1500, true);
    if (!text.includes(quote))
      throw Error("La propuesta no tiene respaldo en el texto.");
    if (
      !Array.isArray(p.assigneeIds) ||
      p.assigneeIds.length > 10 ||
      new Set(p.assigneeIds).size !== p.assigneeIds.length ||
      p.assigneeIds.some((id: any) => !allowed.has(id))
    )
      throw Error("La IA devolvió responsables que no pertenecen a la logia.");
    if (!["task", "agreement", "commitment"].includes(p.kind))
      throw Error("Tipo de propuesta inválido.");
    return {
      title: str(p.title, 160, true),
      description: str(p.description, 4000),
      kind: p.kind,
      assigneeIds: p.assigneeIds,
      dueDate: captureDate(p.dueDate),
      sourceQuote: quote,
      assignmentMode: p.assigneeIds.length > 1 ? "team" : "individual",
    };
  });
}
export function financeSuggestion(
  output: any,
  text: string,
  allowed: Set<string>,
) {
  const f = output?.finance;
  if (
    !f ||
    !["income", "expense"].includes(f.type) ||
    typeof f.amount !== "number" ||
    !Number.isFinite(f.amount) ||
    f.amount <= 0 ||
    f.amount > 999999999 ||
    !["cash", "card", "transfer", ""].includes(f.paymentMethod) ||
    (f.memberId && !allowed.has(f.memberId))
  )
    throw Error("Revisa el monto, miembro y método del movimiento.");
  const sourceQuote = str(f.sourceQuote, 1500, true);
  if (!text.includes(sourceQuote))
    throw Error("El movimiento no tiene respaldo en el texto.");
  return {
    type: f.type,
    amount: Math.round(f.amount * 100) / 100,
    date: captureDate(f.date),
    memberId: f.memberId || "",
    paymentMethod: f.paymentMethod,
    notes: str(f.notes, 2000),
    sourceQuote,
  };
}

export function captureResponseSchema(mode: "tasks" | "finance") {
  const string = { type: "STRING" };
  const taskProperties = {
    title: string,
    description: string,
    kind: { type: "STRING", enum: ["task", "agreement", "commitment"] },
    assigneeIds: { type: "ARRAY", items: string },
    dueDate: string,
    sourceQuote: string,
  };
  const financeProperties = {
    type: { type: "STRING", enum: ["income", "expense"] },
    amount: { type: "NUMBER" },
    date: string,
    memberId: string,
    paymentMethod: { type: "STRING", enum: ["cash", "card", "transfer", ""] },
    notes: string,
    sourceQuote: string,
  };
  return mode === "tasks"
    ? {
        type: "OBJECT",
        properties: {
          tasks: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: taskProperties,
              required: Object.keys(taskProperties),
            },
          },
        },
        required: ["tasks"],
      }
    : {
        type: "OBJECT",
        properties: {
          finance: {
            type: "OBJECT",
            properties: financeProperties,
            required: Object.keys(financeProperties),
          },
        },
        required: ["finance"],
      };
}
