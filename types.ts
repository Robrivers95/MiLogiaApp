
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
  imageUrl?: string;
  date: string; // ISO
  createdBy: string;
}

export interface Payment {
  period: string; // YYYY-MM
  amount: number; // Base Amount
  extraAmount?: number; // Extra Fee
  extraDescription?: string; // Reason for extra fee
  paid: number;
  status: 'Pendiente' | 'Parcial' | 'Pagado';
  comments: string;
  paymentDate?: string | null; // ISO Date
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
