import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value, 'utf8');
const replaceOnce = (source, oldValue, newValue, label) => {
  const count = source.split(oldValue).length - 1;
  if (count !== 1) throw new Error(`${label}: se esperaba 1 coincidencia y se encontraron ${count}`);
  return source.replace(oldValue, newValue);
};

// ---------------------------------------------------------------------------
// types.ts
// ---------------------------------------------------------------------------
let types = read('types.ts');
if (!types.includes('export interface FinanceProject')) {
  types = replaceOnce(
    types,
    `export interface TreasuryEntry {\n  id: string;\n  groupId: string;\n  date: string; // YYYY-MM-DD\n  type: TransactionType;\n  category: 'saco_beneficencia' | 'cuota_extra' | 'evento' | 'donacion' | 'gasto_operativo' | 'gasto_social' | 'compra_material' | 'otro';\n  description: string;\n  amount: number;\n  allocations: TreasuryAllocation[]; // Multi-source split\n  createdBy: string;\n  createdAt: number;\n}\n`,
    `export interface TreasuryEntry {\n  id: string;\n  groupId: string;\n  date: string; // YYYY-MM-DD\n  type: TransactionType;\n  category: 'saco_beneficencia' | 'cuota_extra' | 'evento' | 'donacion' | 'gasto_operativo' | 'gasto_social' | 'compra_material' | 'otro';\n  description: string;\n  amount: number;\n  allocations: TreasuryAllocation[]; // Multi-source split\n  createdBy: string;\n  createdAt: number;\n  projectId?: string; // Proyecto financiero asociado, sin duplicar el movimiento\n  projectName?: string;\n  notes?: string;\n  receiptImageUrls?: string[];\n  updatedAt?: number;\n}\n\nexport interface FinanceProject {\n  id: string;\n  groupId: string;\n  name: string;\n  description: string;\n  status: 'active' | 'closed';\n  startDate: string; // YYYY-MM-DD\n  endDate?: string;\n  linkedExtraConcepts: string[]; // Cuotas extraordinarias que alimentan ingresos del proyecto\n  createdBy: string;\n  createdAt: number;\n  updatedAt: number;\n}\n`,
    'types TreasuryEntry / FinanceProject'
  );
  write('types.ts', types);
}

// ---------------------------------------------------------------------------
// Admin.tsx — only add a tab/menu/render. Do not touch Matrix or Treasury UI.
// ---------------------------------------------------------------------------
let admin = read('components/Admin.tsx');
if (!admin.includes("from './AdminProjects'")) {
  admin = replaceOnce(
    admin,
    `import AdminPaymentEvidenceModal, { type AdminPaymentEvidenceContext } from './AdminPaymentEvidenceModal';\n`,
    `import AdminPaymentEvidenceModal, { type AdminPaymentEvidenceContext } from './AdminPaymentEvidenceModal';\nimport AdminProjects from './AdminProjects';\n`,
    'AdminProjects import'
  );
}

if (!admin.includes("| 'projects'")) {
  admin = replaceOnce(
    admin,
    `type Tab = 'dashboard' | 'requests' | 'users' | 'fees' | 'attendance' | 'trivia' | 'treasury' | 'notices' | 'tasks' | 'banks' | 'visits' | 'payment-matrix' | 'create-user' | 'manual-merge' | 'receipts' | 'debt-notify';`,
    `type Tab = 'dashboard' | 'requests' | 'users' | 'fees' | 'attendance' | 'trivia' | 'treasury' | 'projects' | 'notices' | 'tasks' | 'banks' | 'visits' | 'payment-matrix' | 'create-user' | 'manual-merge' | 'receipts' | 'debt-notify';`,
    'Admin projects tab type'
  );
}

if (!admin.includes('📁 Proyectos')) {
  const banksButton = `                <button\n                  onClick={() => { setActiveTab('banks'); setShowMenu(false); }}\n                  className={\`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors mt-2 \${\n                    activeTab === 'banks' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'\n                  }\`}\n                >\n                  🏛️ Bancos\n                </button>`;
  const projectButton = `                <button\n                  onClick={() => { setActiveTab('projects'); setShowMenu(false); }}\n                  className={\`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors mt-2 \${\n                    activeTab === 'projects' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'\n                  }\`}\n                >\n                  📁 Proyectos\n                </button>\n`;
  admin = replaceOnce(admin, banksButton, projectButton + banksButton, 'Admin projects menu button');
}

if (!admin.includes("<AdminProjects user={user} readOnly={isReadOnly}")) {
  admin = replaceOnce(
    admin,
    `        {activeTab === 'treasury' && (`,
    `        {/* PROJECT FINANCE TAB */}\n        {activeTab === 'projects' && (\n          <AdminProjects user={user} readOnly={isReadOnly} />\n        )}\n\n        {activeTab === 'treasury' && (`,
    'Admin projects render'
  );
}
write('components/Admin.tsx', admin);

// ---------------------------------------------------------------------------
// Firestore rules — projects are admin-managed. Treasury already has its rule.
// ---------------------------------------------------------------------------
let rules = read('firestore.rules');
if (!rules.includes('match /projects/{projectId}')) {
  rules = replaceOnce(
    rules,
    `      match /treasury/{entryId} {\n        allow read: if isSignedIn();\n        allow write: if isAdminOrMaster() && (isMaster() || isGroupActive(groupId));\n      }\n`,
    `      match /treasury/{entryId} {\n        allow read: if isSignedIn();\n        allow write: if isAdminOrMaster() && (isMaster() || isGroupActive(groupId));\n      }\n\n      match /projects/{projectId} {\n        allow read: if isSignedIn();\n        allow write: if isAdminOrMaster() && (isMaster() || isGroupActive(groupId));\n      }\n`,
    'Firestore projects rule'
  );
  write('firestore.rules', rules);
}

console.log('✓ Módulo financiero de Proyectos integrado sin reemplazar Matriz ni Tesorería');
