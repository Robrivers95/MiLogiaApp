import React, { useMemo, useRef, useState } from 'react';
import { User } from '../types';

interface Props {
  user: User;
  onNavigate: (view: string) => void;
}

type AssistantCommand = {
  id: string;
  title: string;
  examples: string[];
  adminTab?: string;
  buttonLabels?: string[];
  writeAction?: boolean;
};

const COMMANDS: AssistantCommand[] = [
  { id: 'dashboard', title: 'Abrir resumen administrativo', examples: ['abre el panel de administrador', 'muéstrame el resumen'], adminTab: 'dashboard', buttonLabels: ['Resumen', 'Panel'] },
  { id: 'requests', title: 'Revisar solicitudes pendientes', examples: ['abre solicitudes', 'muéstrame solicitudes pendientes'], adminTab: 'requests', buttonLabels: ['Solicitudes'] },
  { id: 'users', title: 'Administrar miembros', examples: ['abre miembros', 'buscar miembros'], adminTab: 'users', buttonLabels: ['Miembros', 'Usuarios'] },
  { id: 'fees', title: 'Administrar cuotas normales y extraordinarias', examples: ['abre cuotas', 'abre cuotas extraordinarias'], adminTab: 'fees', buttonLabels: ['Cuotas'] },
  { id: 'attendance', title: 'Registrar o consultar asistencia', examples: ['abre asistencia', 'registra asistencia'], adminTab: 'attendance', buttonLabels: ['Asistencia'] },
  { id: 'trivia', title: 'Crear y administrar trivias', examples: ['abre trivias', 'crea una trivia'], adminTab: 'trivia', buttonLabels: ['Trivia', 'Trivias'] },
  { id: 'treasury', title: 'Registrar ingresos o gastos de tesorería', examples: ['abre tesorería', 'registra un gasto'], adminTab: 'treasury', buttonLabels: ['Tesorería'] },
  { id: 'notices', title: 'Crear y administrar avisos', examples: ['abre avisos', 'crea un aviso'], adminTab: 'notices', buttonLabels: ['Avisos'] },
  { id: 'tasks', title: 'Crear y administrar tareas', examples: ['abre tareas', 'asigna una tarea'], adminTab: 'tasks', buttonLabels: ['Tareas'] },
  { id: 'banks', title: 'Consultar y actualizar bancos o efectivo', examples: ['abre bancos', 'actualiza saldo bancario'], adminTab: 'banks', buttonLabels: ['Bancos', 'Saldos'] },
  { id: 'visits', title: 'Administrar solicitudes de visita', examples: ['abre visitas', 'solicita una visita'], adminTab: 'visits', buttonLabels: ['Visitas'] },
  { id: 'payment-matrix', title: 'Abrir matriz de pagos', examples: ['abre matriz de pagos', 'muéstrame la matriz'], adminTab: 'payment-matrix', buttonLabels: ['Matriz de pagos', 'Matriz'] },
  { id: 'create-user', title: 'Crear un miembro', examples: ['abre crear usuario', 'crea un miembro'], adminTab: 'create-user', buttonLabels: ['Crear usuario', 'Nuevo usuario'] },
  { id: 'manual-merge', title: 'Vincular usuarios temporales', examples: ['abre vincular usuarios', 'combina usuario temporal'], adminTab: 'manual-merge', buttonLabels: ['Vincular usuarios', 'Fusión manual'] },
  { id: 'receipts', title: 'Revisar comprobantes', examples: ['abre comprobantes', 'revisa comprobantes pendientes'], adminTab: 'receipts', buttonLabels: ['Comprobantes'] },
  { id: 'debt-notify', title: 'Enviar recordatorios de adeudo', examples: ['abre recordatorios de adeudo', 'notifica adeudos'], adminTab: 'debt-notify', buttonLabels: ['Notificar adeudos', 'Adeudos'] },
  { id: 'register-payment', title: 'Preparar registro de cuota normal o extraordinaria', examples: ['registra tres meses para Juan', 'registra una cuota extraordinaria para Pedro'], adminTab: 'payment-matrix', buttonLabels: ['Matriz de pagos', 'Matriz'], writeAction: true },
];

const normalize = (value: string) => value
  .toLocaleLowerCase('es-MX')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const clickAdminControl = (labels: string[]) => {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], a'));
  const normalizedLabels = labels.map(normalize);
  const target = candidates.find(element => {
    const text = normalize(element.innerText || element.getAttribute('aria-label') || '');
    return normalizedLabels.some(label => text === label || text.includes(label));
  });
  target?.click();
  return Boolean(target);
};

const findCommand = (spoken: string) => {
  const value = normalize(spoken);
  if (!value) return null;
  if (value.includes('matriz') && value.includes('pago')) return COMMANDS.find(c => c.id === 'payment-matrix')!;
  if ((value.includes('registra') || value.includes('registrar')) && (value.includes('mes') || value.includes('cuota'))) return COMMANDS.find(c => c.id === 'register-payment')!;
  return COMMANDS.find(command =>
    command.examples.some(example => {
      const words = normalize(example).split(' ').filter(word => word.length > 3);
      return words.some(word => value.includes(word));
    })
  ) || null;
};

const AdminAIAssistant: React.FC<Props> = ({ user, onNavigate }) => {
  const allowed = user.role === 'admin' || user.role === 'master';
  const [open, setOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [message, setMessage] = useState('');
  const recognitionRef = useRef<any>(null);
  const commands = useMemo(() => COMMANDS.filter(command => command.id !== 'register-payment'), []);

  if (!allowed) return null;

  const execute = (text: string) => {
    const command = findCommand(text);
    if (!command) {
      setMessage('No reconocí esa instrucción. Abre la ayuda para consultar ejemplos.');
      return;
    }

    onNavigate('admin');
    window.setTimeout(() => {
      const clicked = clickAdminControl(command.buttonLabels || []);
      if (command.writeAction) {
        sessionStorage.setItem('logia_ai_payment_draft', JSON.stringify({
          instruction: text,
          createdAt: new Date().toISOString(),
          createdBy: user.uid,
          status: 'pending_confirmation'
        }));
        setMessage(clicked
          ? 'Abrí la matriz y guardé la instrucción como borrador. No se modificó ningún registro sin confirmación.'
          : 'Guardé la instrucción como borrador seguro. Abre la matriz de pagos para revisarla.');
      } else {
        setMessage(clicked ? `Listo: ${command.title}.` : `Abrí Administración. Selecciona “${command.title}”.`);
      }
    }, 250);
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
      execute(text);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="fixed bottom-24 right-5 z-50 h-14 w-14 rounded-full bg-amber-500 text-logia-950 shadow-xl border-2 border-amber-200 flex items-center justify-center text-2xl"
        aria-label="Abrir asistente de IA"
        title="Asistente de IA para administradores"
      >
        ✦
      </button>

      {open && (
        <div className="fixed bottom-40 right-4 z-50 w-[min(92vw,390px)] rounded-2xl border border-amber-500/40 bg-logia-900 text-white shadow-2xl overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <p className="font-bold">Asistente administrativo</p>
              <p className="text-xs text-white/60">Solo disponible para Admin y Master</p>
            </div>
            <button type="button" onClick={() => setShowHelp(true)} className="text-sm underline">¿Qué puede hacer la IA por mí?</button>
          </div>
          <div className="p-4 space-y-3">
            <textarea
              value={transcript}
              onChange={event => setTranscript(event.target.value)}
              placeholder="Ejemplo: abre la matriz de pagos"
              className="w-full min-h-20 rounded-xl bg-black/20 border border-white/15 p-3 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={startListening} className="rounded-xl bg-amber-500 text-logia-950 font-bold py-3">
                {listening ? 'Escuchando…' : '🎙️ Hablar'}
              </button>
              <button type="button" onClick={() => execute(transcript)} disabled={!transcript.trim()} className="rounded-xl bg-white/10 py-3 disabled:opacity-40">
                Ejecutar
              </button>
            </div>
            {message && <p className="text-sm rounded-xl bg-white/5 p-3">{message}</p>}
            <p className="text-[11px] text-white/50">Las acciones que cambian información se preparan como borrador y requieren confirmación. La IA nunca concede permisos ni omite las reglas existentes.</p>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 z-[60] bg-black/70 p-4 flex items-center justify-center" onClick={() => setShowHelp(false)}>
          <div className="max-w-2xl w-full max-h-[85vh] overflow-y-auto rounded-2xl bg-logia-900 text-white border border-amber-500/40 p-5" onClick={event => event.stopPropagation()}>
            <div className="flex justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-bold">¿Qué puede hacer la IA por mí?</h2>
                <p className="text-sm text-white/60">Comandos disponibles en Administración</p>
              </div>
              <button type="button" onClick={() => setShowHelp(false)} aria-label="Cerrar">✕</button>
            </div>
            <div className="space-y-3">
              {commands.map(command => (
                <div key={command.id} className="rounded-xl bg-white/5 p-3">
                  <p className="font-semibold">{command.title}</p>
                  <p className="text-sm text-white/60">Di: “{command.examples[0]}”</p>
                </div>
              ))}
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
                <p className="font-semibold">Registro de cuotas por voz</p>
                <p className="text-sm text-white/70">Puedes decir “registra tres meses para Fulanito” o indicar que se trata de una cuota extraordinaria. Por seguridad, la instrucción queda como borrador hasta que se valide la persona, los periodos, el tipo de cuota y los posibles conflictos.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminAIAssistant;
