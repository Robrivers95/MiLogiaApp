import fs from 'node:fs';

const file = 'components/Admin.tsx';
let text = fs.readFileSync(file, 'utf8');

const replaceOnce = (search, replacement, label) => {
  if (!text.includes(search)) throw new Error(`No se encontró bloque: ${label}`);
  text = text.replace(search, replacement);
};

replaceOnce(
  "  const pendingUsers = users.filter(u => !u.active);",
  "  const pendingUsers = users.filter(u => !u.active && !u.leaveDate);",
  'pending users filter'
);

text = text.replaceAll(
  "{!u.active && <span className=\"text-[10px] bg-red-600 text-white px-1.5 rounded\">PENDIENTE</span>}",
  "{!u.active && <span className=\"text-[10px] bg-gray-700 text-gray-200 px-1.5 rounded\">{u.leaveDate ? `INACTIVO · ${u.leaveDate}` : 'PENDIENTE'}</span>}"
);

replaceOnce(
`                                             {!u.active ? (
                                                  <button onClick={() => handleToggleActive(u.uid, u.active)} title="Reactivar / Aceptar" className="px-3 py-1.5 bg-green-600 rounded hover:bg-green-500 text-white font-bold text-xs">
                                                      ✅ ACTIVAR
                                                  </button>
                                              ) : (
                                                  <>
                                                     <button onClick={() => handleToggleActive(u.uid, u.active)} title="Desactivar / Dar de Baja" className="p-1.5 bg-logia-900 border border-logia-700 rounded hover:bg-red-900/30 text-gray-400">
                                                         🚫
                                                     </button>
                                                     <button onClick={() => handleOpenPayments(u.uid)} title="Gestionar Pagos" className="p-1.5 bg-yellow-600 rounded hover:bg-yellow-500 text-white">
                                                         💰
                                                     </button>
                                                     <button onClick={() => handleOpenAdvancedPayment(u)} title="Pagos Anticipados (Multi-mes)" className="p-1.5 bg-purple-600 rounded hover:bg-purple-500 text-white">
                                                         📅
                                                     </button>
                                                     <button onClick={() => setEditingUserProfile(u)} title="Editar Perfil" className="p-1.5 bg-blue-600 rounded hover:bg-blue-500 text-white">
                                                         ✏️
                                                     </button>
                                                  </>
                                              )}`,
`                                             {!u.active ? (
                                                  <>
                                                    <button onClick={() => handleToggleActive(u.uid, u.active)} title="Reactivar miembro" className="px-3 py-1.5 bg-green-600 rounded hover:bg-green-500 text-white font-bold text-xs">
                                                        ✅ REACTIVAR
                                                    </button>
                                                    <button onClick={() => setEditingUserProfile(u)} title="Editar fechas y perfil" className="p-1.5 bg-blue-600 rounded hover:bg-blue-500 text-white">
                                                        ✏️
                                                    </button>
                                                  </>
                                              ) : (
                                                  <>
                                                     <button onClick={() => handleToggleActive(u.uid, u.active)} title="Desactivar / Dar de Baja" className="p-1.5 bg-logia-900 border border-logia-700 rounded hover:bg-red-900/30 text-gray-400">
                                                         🚫
                                                     </button>
                                                     <button onClick={() => handleOpenPayments(u.uid)} title="Gestionar Pagos" className="p-1.5 bg-yellow-600 rounded hover:bg-yellow-500 text-white">
                                                         💰
                                                     </button>
                                                     <button onClick={() => handleOpenAdvancedPayment(u)} title="Pagos Anticipados (Multi-mes)" className="p-1.5 bg-purple-600 rounded hover:bg-purple-500 text-white">
                                                         📅
                                                     </button>
                                                     <button onClick={() => setEditingUserProfile(u)} title="Editar Perfil" className="p-1.5 bg-blue-600 rounded hover:bg-blue-500 text-white">
                                                         ✏️
                                                     </button>
                                                  </>
                                              )}`,
  'inactive action buttons'
);

replaceOnce(
`                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="text-xs text-gray-400 uppercase">Iniciación Masónica</label>
                          <input type="date" value={editingUserProfile.masonicJoinDate || ''} onChange={e => setEditingUserProfile({...editingUserProfile, masonicJoinDate: e.target.value})} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
                      </div>
                      <div>
                          <label className="text-xs text-gray-400 uppercase">Último Reingreso (Cobro)</label>
                          <input type="date" value={editingUserProfile.masonicRejoinDate || ''} onChange={e => setEditingUserProfile({...editingUserProfile, masonicRejoinDate: e.target.value})} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
                      </div>
                  </div>`,
`                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                          <label className="text-xs text-gray-400 uppercase">Iniciación Masónica</label>
                          <input type="date" value={editingUserProfile.masonicJoinDate || ''} onChange={e => setEditingUserProfile({...editingUserProfile, masonicJoinDate: e.target.value})} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
                      </div>
                      <div>
                          <label className="text-xs text-gray-400 uppercase">Fecha de baja</label>
                          <input type="date" value={editingUserProfile.leaveDate || ''} onChange={e => setEditingUserProfile({...editingUserProfile, leaveDate: e.target.value || undefined})} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
                      </div>
                      <div>
                          <label className="text-xs text-gray-400 uppercase">Último Reingreso (Cobro)</label>
                          <input type="date" value={editingUserProfile.masonicRejoinDate || ''} onChange={e => setEditingUserProfile({...editingUserProfile, masonicRejoinDate: e.target.value})} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
                      </div>
                  </div>
                  <div className="bg-logia-900 border border-logia-700 rounded p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-white">Estado del miembro</p>
                      <p className="text-xs text-gray-500">Los inactivos conservan todo su historial y no aparecen como solicitudes.</p>
                    </div>
                    <button type="button" onClick={() => setEditingUserProfile({...editingUserProfile, active: !editingUserProfile.active})} className={editingUserProfile.active ? 'px-3 py-2 rounded bg-green-700 text-white text-xs font-bold' : 'px-3 py-2 rounded bg-gray-700 text-white text-xs font-bold'}>
                      {editingUserProfile.active ? 'ACTIVO' : 'INACTIVO'}
                    </button>
                  </div>`,
  'edit lifecycle fields'
);

fs.writeFileSync(file, text);

for (const packageFile of ['package.json', 'package-lock.json']) {
  let pkg = fs.readFileSync(packageFile, 'utf8');
  pkg = pkg.replaceAll('"version": "4.0.0"', '"version": "4.0.1"');
  fs.writeFileSync(packageFile, pkg);
}

let layout = fs.readFileSync('components/Layout.tsx', 'utf8');
layout = layout.replace('v4.0.0', 'v4.0.1');
fs.writeFileSync('components/Layout.tsx', layout);

console.log('Inactive lifecycle UI applied.');
