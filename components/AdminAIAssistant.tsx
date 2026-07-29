import React, { useMemo, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { User, Notice, Task } from '../types';
import { adminAIService } from '../services/adminAI';
import { auth, db } from '../services/firebase';

interface Props {
  user: User;
  onNavigate: (view: string) => void;
}

type AssistantCommand = {
  id: string;
  title: string;
  examples: string[];
  keywords: string[];
  adminTab?: string;
  writeAction?: boolean;
};

type AIIntent = {
  action: string;
  confidence: number;
  parameters?: { memberName?: string; year?: number; months?: number; paymentType?: 'regular' | 'extra' };
  alternatives?: Array<{ action: string; confidence: number }>;
  clarification?: string;
  rateLimit?: { used: number; remaining: number; limit: number };
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  actions?: AssistantCommand[];
};

type PendingAction = { type: 'broadcast-matrix'; year: number } | null;

const COMMANDS: AssistantCommand[] = [
  { id: 'dashboard', title: 'Abrir resumen administrativo', examples: ['abre el panel de administrador'], keywords: ['panel', 'resumen', 'administracion'], adminTab: 'dashboard' },
  { id: 'requests', title: 'Revisar solicitudes pendientes', examples: ['muéstrame las solicitudes pendientes'], keywords: ['solicitudes', 'aprobaciones'], adminTab: 'requests' },
  { id: 'users', title: 'Abrir Gestión de miembros', examples: ['abre la lista de miembros'], keywords: ['miembros', 'usuarios', 'hermanos'], adminTab: 'users' },
  { id: 'fees', title: 'Abrir Gestión de cuotas', examples: ['abre las cuotas extraordinarias'], keywords: ['cuotas', 'extraordinarias', 'mensualidad'], adminTab: 'fees' },
  { id: 'attendance', title: 'Abrir Asistencia', examples: ['quiero tomar asistencia'], keywords: ['asistencia', 'lista de asistencia', 'presentes', 'faltas'], adminTab: 'attendance' },
  { id: 'trivia', title: 'Abrir Trivias', examples: ['quiero crear una trivia'], keywords: ['trivia', 'cuestionario'], adminTab: 'trivia' },
  { id: 'treasury', title: 'Abrir Tesorería', examples: ['quiero registrar un gasto'], keywords: ['tesoreria', 'gasto', 'ingreso'], adminTab: 'treasury' },
  { id: 'notices', title: 'Abrir Avisos', examples: ['quiero publicar un aviso'], keywords: ['aviso', 'anuncio'], adminTab: 'notices' },
  { id: 'tasks', title: 'Abrir Tareas', examples: ['quiero asignar una tarea'], keywords: ['tarea', 'actividad'], adminTab: 'tasks' },
  { id: 'banks', title: 'Abrir Bancos y efectivo', examples: ['abre los saldos bancarios'], keywords: ['banco', 'saldo', 'efectivo'], adminTab: 'banks' },
  { id: 'visits', title: 'Abrir Visitas', examples: ['quiero solicitar una visita'], keywords: ['visita', 'visitantes'], adminTab: 'visits' },
  { id: 'payment-matrix', title: 'Abrir Matriz de pagos', examples: ['muéstrame la matriz de pagos'], keywords: ['matriz', 'tabla de pagos'], adminTab: 'payment-matrix' },
  { id: 'create-user', title: 'Crear un miembro', examples: ['quiero agregar un nuevo miembro'], keywords: ['crear usuario', 'nuevo miembro'], adminTab: 'create-user' },
  { id: 'manual-merge', title: 'Vincular usuarios temporales', examples: ['quiero vincular un usuario temporal'], keywords: ['vincular', 'fusionar'], adminTab: 'manual-merge' },
  { id: 'receipts', title: 'Revisar comprobantes', examples: ['muéstrame los comprobantes pendientes'], keywords: ['comprobante', 'recibo', 'transferencia'], adminTab: 'receipts' },
  { id: 'debt-notify', title: 'Abrir recordatorios de adeudo', examples: ['quiero avisar a quienes deben'], keywords: ['notificar deuda', 'recordatorio'], adminTab: 'debt-notify' },
  { id: 'member-pending', title: 'Consultar adeudo y pendientes de un miembro', examples: ['¿cuánto debe Luis Luna?'], keywords: ['cuanto debe', 'deuda de', 'pendientes de'] },
  { id: 'active-notices', title: 'Consultar avisos activos', examples: ['¿qué avisos están activos?'], keywords: ['avisos activos', 'avisos vigentes', 'que avisos'] },
  { id: 'active-tasks', title: 'Consultar tareas activas', examples: ['¿qué tareas están activas?'], keywords: ['tareas activas', 'tareas pendientes', 'que tareas'] },
  { id: 'broadcast-matrix', title: 'Enviar matriz al buzón de todos', examples: ['envía la matriz a todos'], keywords: ['enviar matriz', 'compartir matriz'], writeAction: true },
  { id: 'register-payment', title: 'Preparar registro de una cuota', examples: ['registra tres meses para Juan'], keywords: ['registrar pago', 'registra cuota'], adminTab: 'payment-matrix', writeAction: true },
];

const COMMAND_BY_ID = new Map(COMMANDS.map(command => [command.id, command]));
const INTENT_ENDPOINT = 'https://us-central1-registrologia.cloudfunctions.net/interpretAdminIntent';
const normalize = (value: string) => value.toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP_WORDS = new Set(['abre', 'abrir', 'quiero', 'muestrame', 'dime', 'por', 'favor', 'el', 'la', 'los', 'las', 'de', 'del', 'para', 'una', 'un', 'que', 'cual', 'cuales']);
const tokens = (value: string) => normalize(value).split(' ').filter(word => word.length > 2 && !STOP_WORDS.has(word));
const scoreCommand = (input: string, command: AssistantCommand) => {
  const normalizedInput = normalize(input);
  const inputTokens = new Set(tokens(input));
  let score = 0;
  for (const phrase of [...command.keywords, ...command.examples]) {
    const normalizedPhrase = normalize(phrase);
    if (normalizedInput.includes(normalizedPhrase)) score += 10;
    for (const word of tokens(phrase)) if (inputTokens.has(word)) score += 2;
  }
  return score;
};
const rankCommands = (input: string) => COMMANDS.map(command => ({ command, score: scoreCommand(input, command) })).sort((a, b) => b.score - a.score);
const extractMemberName = (instruction: string) => {
  const cleaned = instruction.trim().replace(/[?.!,;:]+$/g, '');
  for (const pattern of [/(?:cuanto|cuánto)\s+(?:debe|adeuda|tiene pendiente)\s+(.+)$/i, /(?:que|qué)\s+(?:debe|adeuda)\s+(.+)$/i, /(?:deudas?|adeudos?|pendientes|saldo pendiente)\s+(?:de|del|para)\s+(.+)$/i]) {
    const match = cleaned.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
};

const AdminAIAssistant: React.FC<Props> = ({ user, onNavigate }) => {
  const allowed = user.role === 'admin' || user.role === 'master';
  const [open, setOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [listening, setListening] = useState(false);
  const [working, setWorking] = useState(false);
  const [input, setInput] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 'welcome', role: 'assistant', text: 'Hola. Puedo llevarte a una sección o consultar información de la logia. Prueba: “¿Cuánto debe Luis Luna?” o “Quiero tomar asistencia”.' }]);
  const recognitionRef = useRef<any>(null);
  const helpCommands = useMemo(() => COMMANDS.filter(command => command.id !== 'register-payment'), []);

  if (!allowed) return null;

  const addAssistant = (text: string, actions?: AssistantCommand[]) => setMessages(prev => [...prev, { id: `${Date.now()}-a`, role: 'assistant', text, actions }]);

  const navigateAdmin = (tab: string, title: string) => {
    onNavigate('admin');
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('logia-admin-tab', { detail: { tab } })), 80);
    addAssistant(`Listo. Te llevé a ${title}.`);
    setOpen(false);
  };

  const queryMemberPending = async (instruction: string, parameterName?: string) => {
    const memberName = parameterName || extractMemberName(instruction);
    if (!memberName) return addAssistant('Dime el nombre del miembro. Por ejemplo: “¿Cuánto debe Luis Luna?”');
    const resolution = await adminAIService.resolveUser(user.groupId, memberName);
    if (!resolution.match) {
      if (resolution.alternatives.length) {
        const actions = resolution.alternatives.slice(0, 3).map(member => ({ id: `member:${member.uid}`, title: member.name, examples: [], keywords: [] }));
        return addAssistant('Encontré varias coincidencias. Selecciona a la persona correcta:', actions);
      }
      return addAssistant(`No encontré a “${memberName}” en esta logia.`);
    }
    const summary = await adminAIService.getUserPendingSummary(user.groupId, resolution.match);
    addAssistant(adminAIService.formatPendingSummary(summary), [COMMAND_BY_ID.get('users')!]);
  };

  const queryActiveNotices = async () => {
    const snap = await getDocs(collection(db, 'groups', user.groupId, 'notices'));
    const notices = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notice)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!notices.length) return addAssistant('No hay avisos publicados actualmente.', [COMMAND_BY_ID.get('notices')!]);
    addAssistant(`Hay ${notices.length} aviso(s):\n${notices.slice(0, 8).map((n, i) => `${i + 1}. ${n.title}${n.date ? ` — ${n.date}` : ''}`).join('\n')}`, [COMMAND_BY_ID.get('notices')!]);
  };

  const queryActiveTasks = async () => {
    const snap = await getDocs(collection(db, 'groups', user.groupId, 'tasks'));
    const tasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task)).filter(task => !task.completed);
    if (!tasks.length) return addAssistant('No hay tareas activas.', [COMMAND_BY_ID.get('tasks')!]);
    addAssistant(`Hay ${tasks.length} tarea(s) activa(s):\n${tasks.slice(0, 10).map((t, i) => `${i + 1}. ${t.title}${t.assignedToName ? ` — ${t.assignedToName}` : ''}`).join('\n')}`, [COMMAND_BY_ID.get('tasks')!]);
  };

  const executeCommand = async (command: AssistantCommand, originalText: string, parameters?: AIIntent['parameters']) => {
    if (command.id.startsWith('member:')) {
      const member = (await adminAIService.resolveUser(user.groupId, command.title)).match;
      if (member) {
        const summary = await adminAIService.getUserPendingSummary(user.groupId, member);
        addAssistant(adminAIService.formatPendingSummary(summary), [COMMAND_BY_ID.get('users')!]);
      }
      return;
    }
    if (command.id === 'member-pending') return queryMemberPending(originalText, parameters?.memberName);
    if (command.id === 'active-notices') return queryActiveNotices();
    if (command.id === 'active-tasks') return queryActiveTasks();
    if (command.id === 'broadcast-matrix') {
      const yearMatch = normalize(originalText).match(/20\d{2}/);
      const year = parameters?.year || (yearMatch ? Number(yearMatch[0]) : new Date().getFullYear());
      setPendingAction({ type: 'broadcast-matrix', year });
      return addAssistant(`Entendí que quieres enviar la matriz de ${year} al buzón de todos. Esta acción requiere confirmación.`);
    }
    if (command.adminTab) return navigateAdmin(command.adminTab, command.title);
    addAssistant('Esta función todavía no tiene una acción segura asociada.');
  };

  const interpretWithGemini = async (instruction: string): Promise<AIIntent> => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('La sesión no está disponible');
    const idToken = await currentUser.getIdToken();
    const response = await fetch(INTENT_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ instruction, groupId: user.groupId }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.details || payload?.error || `HTTP ${response.status}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  const executeLocalFallback = async (text: string) => {
    const ranked = rankCommands(text);
    const best = ranked[0];
    const second = ranked[1];
    if (best && best.score >= 8 && best.score >= (second?.score || 0) + 3) return executeCommand(best.command, text);
    const top = ranked.filter(item => item.score > 0).slice(0, 3).map(item => item.command);
    addAssistant(top.length ? 'No pude consultar a Gemini. Estas son las funciones más cercanas:' : 'No pude identificar una función relacionada.', top);
  };

  const execute = async (text: string) => {
    const clean = text.trim();
    if (!clean || working) return;
    setMessages(prev => [...prev, { id: `${Date.now()}-u`, role: 'user', text: clean }]);
    setInput('');
    setWorking(true);
    try {
      const intent = await interpretWithGemini(clean);
      if (intent.rateLimit) setRemaining(intent.rateLimit.remaining);
      const command = COMMAND_BY_ID.get(intent.action);
      if (command && intent.confidence >= 0.78) await executeCommand(command, clean, intent.parameters);
      else {
        const alternatives = (intent.alternatives || []).map(item => COMMAND_BY_ID.get(item.action)).filter((item): item is AssistantCommand => Boolean(item)).slice(0, 3);
        addAssistant(intent.clarification || 'No estoy completamente seguro. Elige la opción más cercana:', alternatives);
      }
    } catch (error: any) {
      console.warn('Gemini intent fallback:', error);
      if (error?.status === 429 && String(error.message).includes('10 consultas')) addAssistant(error.message);
      else await executeLocalFallback(clean);
    } finally {
      setWorking(false);
    }
  };

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    setWorking(true);
    try {
      const result = await adminAIService.broadcastPaymentMatrix(user, pendingAction.year);
      addAssistant(`Listo. Envié la matriz de ${pendingAction.year} al buzón de ${result.recipients} usuarios activos.`);
      setPendingAction(null);
    } catch (error: any) { addAssistant(`No pude completar la acción: ${error?.message || 'error desconocido'}.`); }
    finally { setWorking(false); }
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return addAssistant('El reconocimiento de voz no está disponible en este navegador.');
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-MX'; recognition.interimResults = false; recognition.continuous = false;
    recognition.onstart = () => setListening(true); recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); addAssistant('No pude escuchar la instrucción.'); };
    recognition.onresult = (event: any) => { const text = event.results?.[0]?.[0]?.transcript || ''; setInput(text); void execute(text); };
    recognitionRef.current = recognition; recognition.start();
  };

  return <>
    <button type="button" onClick={() => setOpen(value => !value)} className="fixed bottom-24 right-5 z-50 h-14 w-14 rounded-full bg-amber-500 text-logia-950 shadow-xl border-2 border-amber-200 flex items-center justify-center text-2xl" aria-label="Abrir asistente de IA">✦</button>
    {open && <div className="fixed inset-x-2 bottom-40 sm:left-auto sm:right-4 sm:w-[430px] z-50 rounded-2xl border border-amber-500/40 bg-logia-900 text-white shadow-2xl overflow-hidden">
      <div className="p-3 border-b border-white/10 flex items-center justify-between"><div><p className="font-bold">Asistente de Mi Logia</p><p className="text-[11px] text-white/60">{remaining === null ? 'Máximo 10 consultas de IA al día' : `${remaining} consultas de IA disponibles hoy`}</p></div><button onClick={() => setShowHelp(true)} className="text-xs underline">Ayuda</button></div>
      <div className="h-72 overflow-y-auto p-3 space-y-3 bg-black/10">
        {messages.map(message => <div key={message.id} className={message.role === 'user' ? 'ml-10 rounded-2xl rounded-br-sm bg-amber-500 text-logia-950 p-3 text-sm' : 'mr-5 rounded-2xl rounded-bl-sm bg-white/10 p-3 text-sm'}>
          <p className="whitespace-pre-line">{message.text}</p>
          {message.actions?.length ? <div className="mt-2 flex flex-wrap gap-2">{message.actions.map(action => <button key={action.id} onClick={() => void executeCommand(action, input)} className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">{action.title}</button>)}</div> : null}
        </div>)}
        {working && <div className="mr-20 rounded-2xl bg-white/10 p-3 text-sm text-white/60">Pensando…</div>}
      </div>
      <div className="p-3 border-t border-white/10"><div className="flex gap-2"><textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void execute(input); } }} rows={2} placeholder="Escribe o dicta una instrucción…" className="flex-1 resize-none rounded-xl bg-black/20 border border-white/15 p-2 text-sm"/><button onClick={startListening} disabled={working} className="w-11 rounded-xl bg-white/10">{listening ? '…' : '🎙️'}</button><button onClick={() => void execute(input)} disabled={!input.trim() || working} className="w-12 rounded-xl bg-amber-500 text-logia-950 font-bold disabled:opacity-40">➤</button></div>
      {pendingAction && <div className="grid grid-cols-2 gap-2 mt-2"><button onClick={() => setPendingAction(null)} className="rounded-xl bg-white/10 py-2 text-sm">Cancelar</button><button onClick={() => void confirmPendingAction()} className="rounded-xl bg-red-600 py-2 text-sm font-bold">Confirmar</button></div>}</div>
    </div>}
    {showHelp && <div className="fixed inset-0 z-[60] bg-black/70 p-4 flex items-center justify-center" onClick={() => setShowHelp(false)}><div className="max-w-2xl w-full max-h-[85vh] overflow-y-auto rounded-2xl bg-logia-900 text-white border border-amber-500/40 p-5" onClick={e => e.stopPropagation()}><div className="flex justify-between mb-4"><div><h2 className="text-xl font-bold">¿Qué puede hacer?</h2><p className="text-sm text-white/60">Navegar y consultar; las acciones sensibles piden confirmación.</p></div><button onClick={() => setShowHelp(false)}>✕</button></div><div className="space-y-2">{helpCommands.map(command => <div key={command.id} className="rounded-xl bg-white/5 p-3"><p className="font-semibold">{command.title}</p><p className="text-sm text-white/60">“{command.examples[0]}”</p></div>)}</div></div></div>}
  </>;
};

export default AdminAIAssistant;
