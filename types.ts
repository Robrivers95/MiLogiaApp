
export type Role = 'master' | 'admin' | 'member' | 'viewer';

export type MasonicDegree = 'aprendiz' | 'companero' | 'maestro';

export type LodgeRole = 
  | 'venerable' 
  | 'primer_vigilante' 
  | 'segundo_vigilante' 
  | 'orador' 
  | 'secretario' 
  | 'tesorero' 
  | 'hospitalario' 
  | 'maestro_ceremonias' 
  | 'experto' 
  | 'guarda_templo_interior' 
  | 'guarda_templo_exterior' 
  | 'sin_cargo'
  | 'otro';

export interface RpgCharacter {
  name: string;
  level: number;
  xp: number;
  xpNext: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  magicLevel: number;
  attack: number;
  defense: number;
  vocation?: 'guerrero' | 'paladin' | 'mago' | 'constructor';
}

export interface User {
  uid: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  groupId: string;
  joinDate: string; // App Join Date (ISO)
  
  // Extended Profile
  profession?: string;
  job?: string;
  workAddress?: string; // New field
  city?: string;
  state?: string;
  country?: string;
  
  // Masonic Dates (Admin only edit)
  masonicJoinDate?: string; // YYYY-MM-DD
  masonicRejoinDate?: string; // YYYY-MM-DD (Used for billing calculation)
  
  // Masonic Status
  degree?: MasonicDegree;
  numericDegree?: number;
  lodgeRole?: LodgeRole;
  
  profileEditable: boolean;
  rpg?: RpgCharacter;
  totalPoints?: number;
  lastLogin?: string; 
}

export interface Notice {
  id: string;
  groupId: string;
  title: string;
  description: string;
  imageUrl?: string;       // Base64 image
  sendPushOnCreate?: boolean; // Whether to send push notification
  date: string; // ISO
  createdBy: string;
}

export interface PaymentReceipt {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  periods: string[];           // Array de YYYY-MM que desea pagar
  transferDate: string;        // ISO fecha/hora de la transferencia
  receiptImageUrl: string;     // URL de imagen en Firebase Storage
  amount?: number;             // Monto declarado (opcional)
  receiptType: 'cuota_mensual' | 'concepto_adicional'; // Tipo de pago
  conceptDescription?: string; // Descripción para "concepto_adicional"
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;         // ISO
  reviewedAt?: string;         // ISO
  reviewedBy?: string;         // UID del admin
  reviewComments?: string;
}

export interface Task {
  id: string;
  groupId: string;
  title: string;
  description?: string;
  assignedTo?: string; // User UID
  assignedToName?: string; // User name for display
  completed: boolean;
  completedAt?: string; // ISO
  completedBy?: string; // User UID
  createdAt: string; // ISO
  createdBy: string;
  createdByName?: string;
}

export interface IndividualExtraFee {
  id: string; // Unique identifier for this extra fee item
  description: string; // Description (e.g., "Cena anual", "Evento especial")
  amount: number; // Amount for this specific extra fee
  paid: number; // Amount paid for this specific extra fee
  createdAt: string; // ISO Date when this was added
  createdBy?: string; // UID of who created it
}

export interface Payment {
  period: string; // YYYY-MM
  amount: number; // Base Amount (cuota mensual)
  
  // LEGACY: Single extra fee (mantener para compatibilidad)
  extraAmount?: number; // Extra Fee (cuota extraordinaria)
  extraDescription?: string; // Reason for extra fee
  
  // v3.1.0: Multiple individual extra fees
  extraFees?: IndividualExtraFee[]; // Array of individual extra fees
  
  paid: number; // DEPRECATED: Total paid (mantener por compatibilidad)
  paidRegular?: number; // Paid for regular monthly fee
  paidExtra?: number; // Paid for extra fee (suma de todos los extra fees individuales)
  status: 'Pendiente' | 'Parcial' | 'Pagado';
  comments: string;
  paymentDate?: string | null; // ISO Date
  groupId?: string; // Logia/Group ID para filtrado
  regularCovered?: boolean; // Si la cuota mensual está cubierta
  extraCovered?: boolean; // Si la cuota extraordinaria está cubierta
  adminReceiptUrl?: string; // URL de comprobante subido por el admin
}

export interface PriceHistoryEntry {
  startDate: string; // YYYY-MM
  amount: number;
}

export interface Attendance {
  date: string; // YYYY-MM-DD
  attended: boolean;
  notes?: string;
}

export interface TriviaOption {
  text: string;
}

export interface Trivia {
  id: string;
  groupId: string;
  week: string; // YYYY-Www
  question: string;
  options: string[];
  correctIndex: number;
  createdAt: number;
}

export interface TriviaAnswer {
  uid: string;
  triviaId: string;
  answerIndex: number;
  correct: boolean;
  points: number;
  answeredAt: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  createdAt?: number;
  priceHistory?: PriceHistoryEntry[];
  active?: boolean;
  suspendedAt?: string;
}

export interface Fee {
  groupId: string;
  period: string;
  amount: number;
}

// --- TREASURY ---
export type TransactionType = 'income' | 'expense';
export type FundSource = 'tesoro_general' | 'beneficencia' | 'cuotas'; 

export interface TreasuryAllocation {
  source: FundSource;
  amount: number;
}

export interface TreasuryEntry {
  id: string;
  groupId: string;
  date: string; // YYYY-MM-DD
  type: TransactionType;
  category: 'saco_beneficencia' | 'cuota_extra' | 'evento' | 'donacion' | 'gasto_operativo' | 'gasto_social' | 'compra_material' | 'otro';
  description: string;
  amount: number;
  allocations: TreasuryAllocation[]; // Multi-source split
  createdBy: string;
  createdAt: number;
}

export interface VisitRequest {
  id: string;
  fromGroupId: string; // Logia que solicita la visita
  fromGroupName: string;
  toGroupId: string; // Logia que recibe la solicitud
  toGroupName: string;
  requestedBy: string; // uid del admin que solicita
  requestedByName: string;
  visitDate: string; // YYYY-MM-DD
  numberOfVisitors: number;
  message: string; // Mensaje inicial
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  createdAt: number;
  messages: VisitMessage[]; // Chat dentro de la solicitud
}

export interface VisitMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface BankBalance {
  id: string;
  groupId: string;
  type: 'bank' | 'cash'; // Banco o Efectivo
  name: string; // Nombre del banco o "Efectivo"
  amount: number;
  lastUpdated: string; // ISO date
  comment?: string;
  updatedBy: string; // uid del admin que actualizó
}

export interface ExtraFee {
  id: string;
  groupId: string;
  period: string; // YYYY-MM
  amount: number;
  description: string;
  type: 'mass' | 'individual'; // Masiva o individual
  targetUserId?: string; // Solo si es individual
  targetUserName?: string; // Solo si es individual
  createdBy: string;
  createdByName: string;
  createdAt: string; // ISO date
  appliedToUsers: string[]; // Lista de UIDs a los que se aplicó
}

// ─── BIBLIOTECA DE ALEJANDRÍA MASÓNICA ──────────────────────────────────────

export type BibliotecaDegree = 'aprendiz' | 'companero' | 'maestro';

export interface BibliotecaTrazado {
  id: string;
  title: string;
  description: string;
  pdfUrl: string;
  degree: BibliotecaDegree;          // Grado al que está dirigido
  uploaderUid: string;
  uploaderName: string;
  groupId: string;                   // Logia del autor
  groupName: string;
  isPublic: boolean;                 // true = todas las logias; false = solo su logia
  viewCount: number;
  likeCount: number;
  likedBy: string[];                 // UIDs que dieron like
  createdAt: number;                 // timestamp ms
}

export interface BibliotecaComment {
  id: string;
  trazadoId: string;
  uid: string;
  userName: string;
  groupName: string;
  text: string;
  createdAt: number;
}

// Preguntas del reteje por grado – administradas por el Master
export interface RetejeQuestion {
  id: string;
  degree: BibliotecaDegree;
  question: string;
  options: string[];       // 4 opciones
  correctIndex: number;   // índice 0‑3
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────

// In-app + browser notifications vía Firestore
export type NotificationType = 'attendance' | 'trivia' | 'notice' | 'profile_edit' | 'payment' | 'payment_receipt';

export interface AppNotification {
  id: string;
  uid: string;         // destinatario
  groupId: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: number;   // timestamp ms
}
