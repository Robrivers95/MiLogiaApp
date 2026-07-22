import fs from 'node:fs';

const replaceOrFail = (text, search, replacement, label) => {
  if (!text.includes(search)) throw new Error(`No se encontró bloque: ${label}`);
  return text.replace(search, replacement);
};

let types = fs.readFileSync('types.ts', 'utf8');
if (!types.includes('leaveDate?: string;')) {
  types = replaceOrFail(types,
`  masonicRejoinDate?: string; // YYYY-MM-DD (Used for billing calculation)`,
`  masonicRejoinDate?: string; // YYYY-MM-DD (Used for billing calculation)
  leaveDate?: string; // YYYY-MM-DD: fecha de baja; conserva historial y detiene cargos/notificaciones`, 'leaveDate');
}
fs.writeFileSync('types.ts', types);

let api = fs.readFileSync('services/api.ts', 'utf8');
if (!api.includes('const isBillableForPeriod')) {
  api = api.replace('export const dataService = {', `const isBillableForPeriod = (u: User, period: string) => {
  if (!u.active) return false;
  const periodStart = period + '-01';
  const periodEnd = period + '-31';
  if (u.masonicRejoinDate && u.masonicRejoinDate > periodEnd) return false;
  if (u.leaveDate && u.leaveDate < periodStart) return false;
  return true;
};

export const dataService = {`);
}
api = api.replaceAll('const activeUsers = users.filter(u => u.active);', 'const activeUsers = users.filter(u => isBillableForPeriod(u, period));');
api = replaceOrFail(api,
`    // 1. In-app notifications in Firestore
    const batch = writeBatch(db);
    for (const uid of uids) {`,
`    // 1. Excluir usuarios inactivos o dados de baja.
    const userDocs = await Promise.all(uids.map(uid => getDoc(doc(db, 'users', uid))));
    const eligibleUids = uids.filter((uid, index) => {
      const data = userDocs[index]?.data() as User | undefined;
      return !!data && data.active !== false && !data.leaveDate;
    });
    if (eligibleUids.length === 0) return;
    const batch = writeBatch(db);
    for (const uid of eligibleUids) {`, 'notification filter');
api = api.replace("const tokenDocs = await Promise.all(uids.map(uid => getDoc(doc(db, 'users', uid))));", "const tokenDocs = await Promise.all(eligibleUids.map(uid => getDoc(doc(db, 'users', uid))));");
fs.writeFileSync('services/api.ts', api);

let admin = fs.readFileSync('components/Admin.tsx', 'utf8');
admin = replaceOrFail(admin,
`  const handleToggleActive = async (uid: string, current: boolean) => {
    if (isReadOnly) return;
    
    // Find the user to check if they need groupId assignment
    const targetUser = users.find(u => u.uid === uid);
    
    // If activating a user without groupId, assign them to this group
    if (!current && targetUser && !targetUser.groupId) {
      await dataService.assignUserToGroup(uid, user.groupId);
      console.log("Assigned user to groupId:", user.groupId);
    }
    
    await dataService.updateUserStatus(uid, !current);
    loadUsers();
    showMessage(current ? 'Usuario desactivado' : 'Usuario aceptado y activado');
  };`,
`  const handleToggleActive = async (uid: string, current: boolean) => {
    if (isReadOnly) return;
    const targetUser = users.find(u => u.uid === uid);
    if (!current && targetUser && !targetUser.groupId) await dataService.assignUserToGroup(uid, user.groupId);
    if (current) {
      const leaveDate = window.prompt('Fecha de baja (YYYY-MM-DD). El historial contable se conservará:', targetUser?.leaveDate || new Date().toISOString().slice(0, 10));
      if (!leaveDate) return;
      await dataService.updateUser(uid, { active: false, leaveDate });
      showMessage('Usuario dado de baja; conserva historial y ya no recibe cargos ni notificaciones.');
    } else {
      const rejoinDate = window.prompt('Fecha de reingreso (YYYY-MM-DD). Las cuotas correrán desde esta fecha:', targetUser?.masonicRejoinDate || new Date().toISOString().slice(0, 10));
      if (!rejoinDate) return;
      await dataService.updateUser(uid, { active: true, masonicRejoinDate: rejoinDate, leaveDate: undefined });
      showMessage('Usuario reactivado desde la fecha de reingreso.');
    }
    await loadUsers();
  };`, 'toggle active');
admin = admin.replaceAll("users.filter(u => u.active && u.role === 'member')", "users.filter(u => u.active && u.role !== 'viewer')");
admin = admin.replace(`<span className="text-sm text-gray-200">{u.name || u.email}</span>`, `<span className="text-sm text-gray-200 flex-1">{u.name || u.email}</span><span className={Number(userStats[u.uid]?.totalDebt || 0) > 0 ? 'text-[10px] px-2 py-1 rounded bg-yellow-900/40 text-yellow-300' : 'text-[10px] px-2 py-1 rounded bg-green-900/40 text-green-300'}>{Number(userStats[u.uid]?.totalDebt || 0) > 0 ? '$' + Number(userStats[u.uid]?.totalDebt || 0).toFixed(2) + ' pendiente' : 'Sin deuda'}</span>`);
admin = admin.replace(`{!u.active && <span className="ml-2 text-xs text-gray-500">(Inactivo)</span>}`, `{!u.active && <span className="ml-2 text-xs text-gray-500">(Inactivo{u.leaveDate ? ' · Baja ' + u.leaveDate : ''})</span>}`);
fs.writeFileSync('components/Admin.tsx', admin);

let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '4.0.0';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
let layout = fs.readFileSync('components/Layout.tsx', 'utf8');
layout = layout.replace(/v3\.9\.0/g, 'v4.0.0');
fs.writeFileSync('components/Layout.tsx', layout);
console.log('Member lifecycle improvements applied.');
