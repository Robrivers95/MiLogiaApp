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
  joinDate: string;
  profession?: string;
  job?: string;
  workAddress?: string;
  city?: string;
  state?: string;
  country?: string;
  masonicJoinDate?: string;
  masonicRejoinDate?: string;
  leaveDate?: string;
  degree?: MasonicDegree;
  numericDegree?: number;
  lodgeRole?: LodgeRole;
  profileEditable: boolean;
  rpg?: RpgCharacter;
  totalPoints?: number;
  lastLogin?: string;
  phoneNumber?: string;
}

export interface Notice {
  id: string;
  groupId: string;
  title: string;
  description: string;
  imageUrl?: string;
  sendPushOnCreate?: boolean;
  date: string;
  createdBy: string;
}

export interface PaymentReceipt {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  periods: string[];
  transferDate: string;
  receiptImageUrl: string;
  receiptImageUrls?: string[];
  amount?: number;
  receiptType: 'cuota_mensual' | 'concepto_adicional';
  conceptDescription?: string;
  conceptId?: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewComments?: string;
}

export interface Task {
  id: string;
  groupId: string;
  title: string;
  description?: string;
  assignedTo?: string;
  assignedToName?: string;
  assignmentMode?: 'individual' | 'team';
  assignedToMany?: string[];
  assignedToNames?: string[];
  batchId?: string;
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
  createdAt: string;
  createdBy: string;
  createdByName?: string;
}

export interface IndividualExtraFee {
  id: string;
  conceptId?: string;
  description: string;
  amount: number;
  paid: number;
  createdAt: string;
  createdBy?: string;
  receiptUrls?: string[];
  forgiven?: boolean;
  forgivenAt?: string;
  forgivenBy?: string;
  forgivenNote?: string;
}

export interface Payment {
  period: string;
  amount: number;
  extraAmount?: number;
  extraDescription?: string;
  extraFees?: IndividualExtraFee[];
  paid: number;
  paidRegular?: number;
  paidExtra?: number;
  status: 'Pendiente' | 'Parcial' | 'Pagado';
  comments: string;
  paymentDate?: string | null;
  groupId?: string;
  regularCovered?: boolean;
  extraCovered?: boolean;
  regularReceiptUrls?: string[];
  adminReceiptUrl?: string;
  receiptImageBase64?: string;
}

export interface PriceHistoryEntry { startDate: string; amount: number; }
export interface Attendance { date: string; attended: boolean; notes?: string; }
export interface TriviaOption { text: string; }
export interface Trivia { id: string; groupId: string; week: string; question: string; options: string[]; correctIndex: number; createdAt: number; }
export interface TriviaAnswer { uid: string; triviaId: string; answerIndex: number; correct: boolean; points: number; answeredAt: string; }
export interface Group { id: string; name: string; description: string; createdAt?: number; priceHistory?: PriceHistoryEntry[]; active?: boolean; suspendedAt?: string; }
export interface Fee { groupId: string; period: string; amount: number; }
export type TransactionType = 'income' | 'expense';
export type FundSource = 'tesoro_general' | 'beneficencia' | 'cuotas';
export interface TreasuryAllocation { source: FundSource; amount: number; }
export interface TreasuryEntry { id: string; groupId: string; date: string; type: TransactionType; category: 'saco_beneficencia' | 'cuota_extra' | 'evento' | 'donacion' | 'gasto_operativo' | 'gasto_social' | 'compra_material' | 'otro'; description: string; amount: number; allocations: TreasuryAllocation[]; createdBy: string; createdAt: number; }
export interface VisitRequest { id: string; fromGroupId: string; fromGroupName: string; toGroupId: string; toGroupName: string; requestedBy: string; requestedByName: string; visitDate: string; numberOfVisitors: number; message: string; status: 'pending' | 'accepted' | 'rejected' | 'completed'; createdAt: number; messages: VisitMessage[]; }
export interface VisitMessage { id: string; senderId: string; senderName: string; text: string; timestamp: number; }
export interface BankBalance { id: string; groupId: string; type: 'bank' | 'cash'; name: string; amount: number; lastUpdated: string; comment?: string; updatedBy: string; }
export interface ExtraFee { id: string; groupId: string; period: string; amount: number; description: string; type: 'mass' | 'individual'; targetUserId?: string; targetUserName?: string; createdBy: string; createdByName: string; createdAt: string; appliedToUsers: string[]; }
export type NotificationType = 'attendance' | 'trivia' | 'notice' | 'profile_edit' | 'payment' | 'payment_receipt' | 'task';
export interface AppNotification { id: string; uid: string; groupId: string; type: NotificationType; title: string; body: string; read: boolean; createdAt: number; }
