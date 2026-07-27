import React, { useMemo, useRef, useState } from 'react';
import { User } from '../types';
import { adminAIService } from '../services/adminAI';
import { auth } from '../services/firebase';

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
  buttonLabels?: string[];
  writeAction?: boolean;
};

type AIIntent = {
  action: string;
  confidence: number;
  parameters?: {
    memberName?: string;
    year?: number;
    months?: number;
    paymentType?: 'regular' | 'extra';
  };
  alternatives?: Array<{ action: string; confidence: number }>;
  clarification?: string;
};

type PendingAction = { type: 'broadcast-matrix'; year: number } | null;

const COMMANDS: AssistantCommand[] = [
  { id: 'dashboard', title: 'Abrir el resumen administrativo', examples: ['abre el panel de administrador', 'llévame al resumen'], keywords: ['panel', 'resumen', 'inicio administrativo', 'administracion'], adminTab: 'dashboard' },
  { id: 'requests', title: 'Revisar solicitudes pendientes', examples: ['muéstrame las solicitudes pendientes'], keywords: ['solicitudes', 'aprobaciones', 'pendientes de aprobar'], adminTab: 'requests', buttonLabels: ['Solicitudes'] },
  { id: 'users', title: 'Administrar miembros', examples: ['abre la lista de miembros'], keywords: ['miembros', 'usuarios', 'persona', 'hermanos'], adminTab: 'users', buttonLabels: ['Miembros', 'Usuarios'] },
  { id: 'fees', title: 'Administrar cuotas normales y extraordinarias', examples: ['abre las cuotas extraordinarias'], keywords: ['cuotas', 'extraordinarias', 'mensualidad', 'cobros'], adminTab: 'fees', buttonLabels: ['Cuotas'] },
  { id: 'attendance', title: 'Abrir asistencia', examples: ['quiero registrar asistencia'], keywords: ['asistencia', 'asistieron', 'falta', 'presentes'], adminTab: 'attendance', buttonLabels: ['Asistencia'] },
  { id: 'trivia', title: 'Crear o administrar trivias', examples: ['quiero crear una trivia'], keywords: ['trivia', 'pregunta', 'cuestionario'], adminTab: 'trivia', buttonLabels: ['Trivia', 'Trivias'] },
  { id: 'treasury', title: 'Abrir tesorería', examples: ['quiero registrar un gasto'], keywords: ['tesoreria', 'gasto', 'ingreso', 'movimiento', 'dinero'], adminTab: 'treasury', buttonLabels: ['Tesorería'] },
  { id: 'notices', title: 'Crear o administrar avisos', examples: ['quiero publicar un aviso'], keywords: ['aviso', 'anuncio', 'comunicado', 'publicar'], adminTab: 'notices', buttonLabels: ['Avisos'] },
  { id: 'tasks', title: 'Crear o administrar tareas', examples: ['quiero asignar una tarea'], keywords: ['tarea', 'pendiente', 'asignar', 'actividad'], adminTab: 'tasks', buttonLabels: ['Tareas'] },
  { id: 'banks', title: 'Consultar o actualizar bancos y efectivo', examples: ['abre los saldos bancarios'], keywords: ['banco', 'saldo', 'efectivo', 'cuenta bancaria'], adminTab: 'banks', buttonLabels: ['Bancos', 'Saldos'] },
  { id: 'visits', title: 'Administrar solicitudes de visita', examples: ['quiero solicitar una visita'], keywords: ['visita', 'visitantes', 'otra logia'], adminTab: 'visits', buttonLabels: ['Visitas'] },
  { id: 'payment-matrix', title: 'Abrir la matriz de pagos', examples: ['muéstrame la matriz de pagos'], keywords: ['matriz', 'tabla de pagos', 'quien debe', 'estado de pagos'], adminTab: 'payment-matrix', buttonLabels: ['Matriz de pagos', 'Matriz'] },
  { id: 'create-user', title: 'Crear un miembro', examples: ['quiero agregar un nuevo miembro'], keywords: ['crear usuario', 'nuevo miembro', 'agregar persona', 'alta usuario'], adminTab: 'create-user', buttonLabels: ['Crear usuario', 'Nuevo usuario'] },
  { id: 'manual-merge', title: 'Vincular usuarios temporales', examples: ['quiero vincular un usuario temporal'], keywords: ['vincular', 'fusionar', 'combinar usuario', 'usuario temporal'], adminTab: 'manual-merge', buttonLabels: ['Vincular usuarios', 'Fusión manual'] },
  { id: 'receipts', title: 'Revisar comprobantes', examples: ['muéstrame los comprobantes pendientes'], keywords: ['comprobante', 'recibo', 'transferencia', 'evidencia de pago'], adminTab: 'receipts', buttonLabels: ['Comprobantes'] },
  { id: 'debt-notify', title: 'Enviar recordatorios de adeudo', examples: ['quiero avisar a quienes deben'], keywords: ['notificar deuda', 'recordatorio', 'avisar adeudo', 'cobrar'], adminTab: 'debt-notify', buttonLabels: ['Notificar adeudos', 'Adeudos'] },
  { id: 'member-pending', title: 'Consultar cuánto debe y qué tiene pendiente un miembro', examples: ['¿cuánto debe Luis Luna?', 'dime los pendientes de Juan Pérez'], keywords: ['cuanto debe', 'deuda de', 'adeudo de', 'pendientes de', 'que debe', 'saldo pendiente'] },
  { id: 'broadcast-matrix', title: 'Enviar la matriz de pagos al buzón de todos', examples: ['envía la matriz de pagos a todos'], keywords: ['enviar matriz', 'mandar matriz', 'buzon de todos', 'compartir matriz'], writeAction: true },
  { id: 'register-payment', title: 'Preparar el registro de una cuota', examples: ['registra tres meses para Juan'], keywords: ['registrar pago', 'registra cuota', 'pago de meses', 'abonar cuota'], adminTab: 'payment-matrix', buttonLabels: ['Matriz de pagos', 'Matriz'], writeAction: true },
];

const COMMAND_BY_ID = new Map(COMMANDS.map(command => [command.id, command]));
const INTENT_ENDPOINT = 'https://us-central1-registrologia.cloudfunctions.net/interpretAdminIntent';

const normalize = (value: string) => value
  .toLocaleLowerCase('es-MX')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const STOP_WORDS = new Set(['abre', 'abrir', 'quiero', 'muestrame', 'dime', 'por', 'favor', 'el', 'la', 'los', 'las', 'de', 'del', 'para', 'una', 'un', 'que', 'cual', 'cuales']);
const tokens = (value: string) => normalize(value).split(' ').filter(word => word.length > 2 && !STOP_WORDS.has(word));

const scoreCommand = (input: string, command: AssistantCommand) => {
  const normalizedInput = normalize(input);
  const inputTokens = new Set(tokens(input));
  let score = 0;
  for (const phrase of [...command.keywords, ...command.examples]) {
    const normalizedPhrase = normalize(phrase);
    if (normalizedInput.includes(normalizedPhrase)) score += 10;
    for (const word of tokens(phrase)) {
      if (inputTokens.has(word)) score += 2;
      else if ([...inputTokens].some(inputWord => inputWord.startsWith(word) || word.startsWith(inputWord))) score += 1;
    }
  }
  return score;
};

const rankCommands = (input: string) => COMMANDS
  .map(command => ({ command, score: scoreCommand(input, command) }))
  .sort((a, b) => b.score - a.score);

const extractMemberName = (instruction: string) => {
  const cleaned = instruction.trim().replace(/[?.!,;:]+$/g, '');
  const patterns = [
    /(?:cuanto|cuánto)\s+(?:debe|adeuda|tiene pendiente)\s+(.+)$/i,
    /(?:que|qué)\s+(?:debe|adeuda)\s+(.+)$/i,
    /(?:deudas?|adeudos?|pendientes|saldo pendiente)\s+(?:de|del|para)\s+(.+)$/i,
    /(?:pendientes)\s+(?:tiene|de)\s+(.+)$/i,
    /(?:usuario|miembro|hermano)\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
};

const clickExactAdminControl = (labels: string[]) => {
  const forbidden = ['volver al panel', 'cerrar sesion', 'salir', 'eliminar', 'suspender', 'activar'];
  const expected = labels.map(normalize);
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], a'));
  const target = candidates.find(element => {
    const text = normalize(element.innerText || element.getAttribute('aria-label') || '');
    if (forbidden.some(item => text.includes(item))) return false;
    return expected.includes(text);
  });
  target?.click();
  return Boolean(target);
};

const AdminAIAssistant: React.FC<Props> = ({ user, onNavigate }) => {
  const allowed = user.role === 'admin' || user.role === 'master';
  const [open, setOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [listening, setListening] = useState(false);
  const [working, setWorking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [message, setMessage] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [suggestions, setSuggestions] = useState<AssistantCommand[]>([]);
  const recognitionRef = useRef<any>(null);
  const helpCommands = useMemo(() => COMMANDS.filter(command => command.id !== 'register-payment'), []);

  if (!allowed) return null;

  const queryMemberPending = async (memberNameOrInstruction: string) => {
    const memberName = extractMemberName(memberNameOrInstruction) || memberNameOrInstruction.trim();
    if (!memberName) {
      setMessage('Dime el nombre del miembro. Por ejemplo: “¿Cuánto debe Luis Luna?”');
      return;
    }
    setWorking(true);
    try {
      const resolution = await adminAIService.resolveUser(user.groupId, memberName);
      if (!resolution.match) {
        setMessage(resolution.alternatives.length
          ? `Encontré varias coincidencias: ${resolution.alternatives.map(item => item.name).join(', ')}. Indícame el nombre completo.`
          : `No encontré a “${memberName}” dentro de esta logia.`);
        return;
      }
      const summary = await adminAIService.getUserPendingSummary(user.groupId, resolution.match);
      setMessage(adminAIService.formatPendingSummary(summary));
    } catch (error: any) {
      setMessage(`No pude consultar los pendientes: ${error?.message || 'error desconocido'}.`);
    } finally {
      setWorking(false);
    }
  };

  const executeCommand = async (command: AssistantCommand, originalText: string, parameters?: AIIntent['parameters']) => {
    setSuggestions([]);
    setPendingAction(null);

    if (command.id === 'member-pending') {
      await queryMemberPending(parameters?.memberName || originalText);
      return;
    }

    if (command.id === 'broadcast-matrix') {
      const yearMatch = normalize(originalText).match(/20\d{2}/);
      const year = parameters?.year || (yearMatch ? Number(yearMatch[0]) : new Date().getFullYear());
      setPendingAction({ type: 'broadcast-matrix', year });
      setMessage(`Entendí que quieres enviar la matriz de pagos de ${year} al buzón de todos. Confirma para continuar.`);
      return;
    }

    onNavigate('admin');
    if (command.id === 'dashboard') {
      setMessage('Listo: abrí el resumen administrativo.');
      return;
    }

    window.setTimeout(() => {
      const clicked = clickExactAdminControl(command.buttonLabels || []);
      if (command.id === 'register-payment') {
        sessionStorage.setItem('logia_ai_payment_draft', JSON.stringify({
          instruction: originalText,
          interpretedParameters: parameters || {},
          createdAt: new Date().toISOString(),
          createdBy: user.uid,
          status: 'pending_confirmation',
        }));
        setMessage(clicked
          ? 'Abrí la matriz y preparé la instrucción como borrador. No se modificó ningún registro.'
          : 'Preparé la instrucción como borrador, pero no encontré de forma segura el control de la matriz.');
      } else {
        setMessage(clicked
          ? `Listo: ${command.title}.`
          : `Abrí Administración, pero no encontré de forma segura la pestaña “${command.title}”. No pulsé ningún otro botón.`);
      }
    }, 450);
  };

  const interpretWithGemini = async (instruction: string): Promise<AIIntent> => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('La sesión no está disponible');
    const idToken = await currentUser.getIdToken();
    const response = await fetch(INTENT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ instruction, groupId: user.groupId }),
    });
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload?.details || errorPayload?.error || `HTTP ${response.status}`);
    }
    return response.json();
  };

  const executeLocalFallback = async (text: string) => {
    const ranked = rankCommands(text);
    const best = ranked[0];
    const second = ranked[1];
    if (best && best.score >= 8 && best.score >= second.score + 3) {
      await executeCommand(best.command, text);
      return;
    }
    const top = ranked.filter(item => item.score > 0).slice(0, 3).map(item => item.command);
    setSuggestions(top);
    setMessage(top.length
      ? 'No pude usar Gemini. Estas son las funciones locales más cercanas:'
      : 'No pude usar Gemini ni identificar una función relacionada.');
  };

  const execute = async (text: string) => {
    setPendingAction(null);
    setSuggestions([]);
    if (!normalize(text)) return;
    setWorking(true);
    setMessage('Interpretando tu instrucción…');
    try {
      const intent = await interpretWithGemini(text);
      const command = COMMAND_BY_ID.get(intent.action);
      if (command && intent.confidence >= 0.82) {
        setWorking(false);
        await executeCommand(command, text, intent.parameters);
        return;
      }

      const alternatives = (intent.alternatives || [])
        .map(item => COMMAND_BY_ID.get(item.action))
        .filter((command): command is AssistantCommand => Boolean(command))
        .slice(0, 3);
      if (alternatives.length) {
        setSuggestions(alternatives);
        setMessage(intent.clarification || 'No tengo suficiente certeza. Elige la función que querías realizar:');
      } else {
        setMessage(intent.clarification || 'No encontré una función permitida suficientemente cercana.');
      }
    } catch (error: any) {
      console.warn('Gemini intent fallback:', error);
      await executeLocalFallback(text);
    } finally {
      setWorking(false);
    }
  };

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    setWorking(true);
    try {
      const result = await adminAIService.broadcastPaymentMatrix(user, pendingAction.year);
      setMessage(`Listo. Envié la matriz de pagos de ${pendingAction.year} al buzón de ${result.recipients} usuarios activos.`);
      setPendingAction(null);
    } catch (error: any) {
      setMessage(`No pude completar la acción: ${error?.message || 'error desconocido'}.`);
    } finally {
      setWorking(false);
    }
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessage('El reconocimiento de voz no está disponible en este navegador. Puedes escribir la instrucción.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-MX';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      setMessage('No pude escuchar la instrucción. Intenta otra vez o escríbela.');
    };
    recognition.onresult = (event: any) => {
      const text = event.results?.[0]?.[0]?.transcript || '';
      setTranscript(text);
      void execute(text);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(value => !value)} className="fixed bottom-24 right-5 z-50 h-14 w-14 rounded-full bg-amber-500 text-logia-950 shadow-xl border-2 border-amber-200 flex items-center justify-center text-2xl" aria-label="Abrir asistente de IA" title="Asistente de IA para administradores">✦</button>

      {open && (
        <div className="fixed bottom-40 right-4 z-50 w-[min(92vw,430px)] rounded-2xl border border-amber-500/40 bg-logia-900 text-white shadow-2xl overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3">
            <div><p className="font-bold">Asistente administrativo con Gemini</p><p className="text-xs text-white/60">Admin y Master · acciones controladas por la app</p></div>
            <button type="button" onClick={() => setShowHelp(true)} className="text-sm underline">¿Qué puede hacer la IA por mí?</button>
          </div>
          <div className="p-4 space-y-3">
            <textarea value={transcript} onChange={event => setTranscript(event.target.value)} placeholder="Ejemplo: dime cuánto debe Luis Luna" className="w-full min-h-20 rounded-xl bg-black/20 border border-white/15 p-3 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={startListening} disabled={working} className="rounded-xl bg-amber-500 text-logia-950 font-bold py-3 disabled:opacity-50">{listening ? 'Escuchando…' : '🎙️ Hablar'}</button>
              <button type="button" onClick={() => void execute(transcript)} disabled={!transcript.trim() || working} className="rounded-xl bg-white/10 py-3 disabled:opacity-40">{working ? 'Interpretando…' : 'Ejecutar'}</button>
            </div>
            {message && <p className="text-sm rounded-xl bg-white/5 p-3 whitespace-pre-line">{message}</p>}
            {suggestions.length > 0 && (
              <div className="space-y-2">
                {suggestions.map(command => (
                  <button key={command.id} type="button" onClick={() => void executeCommand(command, transcript)} className="w-full text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-3 text-sm">
                    <span className="font-semibold">{command.title}</span><span className="block text-xs text-white/55 mt-1">Sí, hacer esta función</span>
                  </button>
                ))}
              </div>
            )}
            {pendingAction && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPendingAction(null)} className="rounded-xl bg-white/10 py-2">Cancelar</button>
                <button type="button" onClick={() => void confirmPendingAction()} disabled={working} className="rounded-xl bg-red-600 py-2 font-bold disabled:opacity-50">Confirmar envío</button>
              </div>
            )}
            <p className="text-[11px] text-white/50">Gemini solo clasifica la intención y extrae parámetros. No tiene acceso directo a Firestore ni puede inventar funciones.</p>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 z-[60] bg-black/70 p-4 flex items-center justify-center" onClick={() => setShowHelp(false)}>
          <div className="max-w-2xl w-full max-h-[85vh] overflow-y-auto rounded-2xl bg-logia-900 text-white border border-amber-500/40 p-5" onClick={event => event.stopPropagation()}>
            <div className="flex justify-between gap-4 mb-4"><div><h2 className="text-xl font-bold">¿Qué puede hacer la IA por mí?</h2><p className="text-sm text-white/60">Funciones permitidas</p></div><button type="button" onClick={() => setShowHelp(false)} aria-label="Cerrar">✕</button></div>
            <div className="space-y-3">
              {helpCommands.map(command => <div key={command.id} className="rounded-xl bg-white/5 p-3"><p className="font-semibold">{command.title}</p><p className="text-sm text-white/60">Ejemplo: “{command.examples[0]}”</p></div>)}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminAIAssistant;
