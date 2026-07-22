import fs from 'node:fs';

const file = 'components/Admin.tsx';
let text = fs.readFileSync(file, 'utf8');

// 1) Solo los registros nuevos sin fecha de baja son solicitudes pendientes.
text = text.replace(
  /const pendingUsers = users\.filter\(u => !u\.active(?: && !u\.leaveDate)?\);/,
  'const pendingUsers = users.filter(u => !u.active && !u.leaveDate);'
);

// 2) Etiqueta visual correcta para pendientes vs. miembros dados de baja.
text = text.replaceAll(
  '{!u.active && <span className="text-[10px] bg-red-600 text-white px-1.5 rounded">PENDIENTE</span>}',
  '{!u.active && <span className="text-[10px] bg-gray-700 text-gray-200 px-1.5 rounded">{u.leaveDate ? `INACTIVO · ${u.leaveDate}` : \'PENDIENTE\'}</span>}'
);

// 3) Mantener edición disponible para miembros inactivos.
if (!text.includes('title="Editar fechas y perfil"')) {
  const inactiveButtonRegex = /\{!u\.active \? \(\s*<button[\s\S]*?✅ ACTIVAR[\s\S]*?<\/button>\s*\) : \(/;
  const replacement = `{!u.active ? (\n                                                  <>\n                                                    <button onClick={() => handleToggleActive(u.uid, u.active)} title="Reactivar miembro" className="px-3 py-1.5 bg-green-600 rounded hover:bg-green-500 text-white font-bold text-xs">\n                                                        ✅ REACTIVAR\n                                                    </button>\n                                                    <button onClick={() => setEditingUserProfile(u)} title="Editar fechas y perfil" className="p-1.5 bg-blue-600 rounded hover:bg-blue-500 text-white">\n                                                        ✏️\n                                                    </button>\n                                                  </>\n                                              ) : (`;
  if (!inactiveButtonRegex.test(text)) throw new Error('No se encontró el bloque de acciones de usuario inactivo.');
  text = text.replace(inactiveButtonRegex, replacement);
}

// 4) Agregar fecha de baja y control de estado al modal de edición.
if (!text.includes('Los inactivos conservan todo su historial')) {
  const lifecycleRegex = /<div className="grid grid-cols-2 gap-4">\s*<div>\s*<label className="text-xs text-gray-400 uppercase">Iniciación Masónica<\/label>[\s\S]*?<label className="text-xs text-gray-400 uppercase">Último Reingreso \(Cobro\)<\/label>[\s\S]*?<\/div>\s*<\/div>/;
  const replacement = `<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">\n                      <div>\n                          <label className="text-xs text-gray-400 uppercase">Iniciación Masónica</label>\n                          <input type="date" value={editingUserProfile.masonicJoinDate || ''} onChange={e => setEditingUserProfile({...editingUserProfile, masonicJoinDate: e.target.value})} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />\n                      </div>\n                      <div>\n                          <label className="text-xs text-gray-400 uppercase">Fecha de baja</label>\n                          <input type="date" value={editingUserProfile.leaveDate || ''} onChange={e => setEditingUserProfile({...editingUserProfile, leaveDate: e.target.value || undefined})} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />\n                      </div>\n                      <div>\n                          <label className="text-xs text-gray-400 uppercase">Último Reingreso (Cobro)</label>\n                          <input type="date" value={editingUserProfile.masonicRejoinDate || ''} onChange={e => setEditingUserProfile({...editingUserProfile, masonicRejoinDate: e.target.value})} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />\n                      </div>\n                  </div>\n                  <div className="bg-logia-900 border border-logia-700 rounded p-3 flex items-center justify-between gap-3">\n                    <div>\n                      <p className="text-sm font-bold text-white">Estado del miembro</p>\n                      <p className="text-xs text-gray-500">Los inactivos conservan todo su historial y no aparecen como solicitudes.</p>\n                    </div>\n                    <button type="button" onClick={() => setEditingUserProfile({...editingUserProfile, active: !editingUserProfile.active})} className={editingUserProfile.active ? 'px-3 py-2 rounded bg-green-700 text-white text-xs font-bold' : 'px-3 py-2 rounded bg-gray-700 text-white text-xs font-bold'}>\n                      {editingUserProfile.active ? 'ACTIVO' : 'INACTIVO'}\n                    </button>\n                  </div>`;
  if (!lifecycleRegex.test(text)) throw new Error('No se encontró el bloque de fechas del modal de edición.');
  text = text.replace(lifecycleRegex, replacement);
}

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
