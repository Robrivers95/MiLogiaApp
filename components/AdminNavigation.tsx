import React, { useState } from 'react';
import { adminAreas, AdminTab, findAdminArea } from './adminNavigation';

interface Props { activeTab: AdminTab; onSelect: (tab: AdminTab) => void; pendingCount: number; readOnly: boolean; }
export default function AdminNavigation({ activeTab, onSelect, pendingCount, readOnly }: Props) {
  const [query, setQuery] = useState('');
  const area = findAdminArea(activeTab);
  const current = area.items.find(item => item.id === activeTab)!;
  const results = adminAreas.flatMap(group => group.items.map(item => ({ ...item, area: group.label })))
    .filter(item => `${item.label} ${item.description} ${item.area}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es').trim()));
  return <section className="bg-logia-800 border-b border-logia-700 p-4 space-y-3" aria-label="Administración de la Logia">
    <div className="flex flex-wrap gap-3 justify-between items-center">
      <div><p className="text-xs text-indigo-300">Administración / {area.label}</p><h2 className="text-xl font-bold">{current.label}</h2></div>
      <div className="flex gap-2 items-center"><span className="text-xs text-indigo-200 rounded-full border border-indigo-800 px-3 py-1">V2 Beta</span>{readOnly && <span className="text-xs text-amber-300">Solo lectura</span>}</div>
    </div>
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Áreas de administración">
      {adminAreas.map(group => <button key={group.id} aria-current={group.id === area.id ? 'page' : undefined} onClick={() => onSelect(group.items[0].id)} className={`shrink-0 rounded-lg px-4 py-2 text-sm ${group.id === area.id ? 'bg-indigo-600 text-white' : 'bg-logia-900 text-gray-300 hover:bg-logia-700'}`}>{group.label}{group.id === 'members' && pendingCount > 0 && <span className="ml-2 rounded-full bg-amber-900 px-2 text-amber-200">{pendingCount}</span>}</button>)}
    </div>
    <nav className="flex flex-wrap gap-2" aria-label={`Opciones de ${area.label}`}>
      {area.items.map(item => <button key={item.id} aria-current={item.id === activeTab ? 'page' : undefined} onClick={() => onSelect(item.id)} className={`rounded-md px-3 py-2 text-xs border ${item.id === activeTab ? 'border-indigo-400 text-indigo-200 bg-indigo-900/40' : 'border-logia-700 text-gray-300 hover:bg-logia-700'}`}>{item.label}{item.id === 'requests' && pendingCount > 0 ? ` (${pendingCount})` : ''}</button>)}
    </nav>
    <div className="flex flex-wrap gap-3 items-center justify-between"><p className="text-xs text-gray-400 flex-1 min-w-[180px]">{current.description}</p><label className="text-xs text-gray-400">Ir a una función<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Ej. cuotas, vincular, proyectos" className="block bg-logia-900 rounded border border-logia-700 px-3 py-2 text-sm text-white mt-1 w-full sm:w-64" /></label></div>
    {query.trim() && <div className="grid sm:grid-cols-2 gap-2" aria-live="polite">{results.length ? results.map(item => <button key={item.id} onClick={() => { onSelect(item.id); setQuery(''); }} className="text-left bg-logia-900 rounded p-3 hover:bg-logia-700"><span className="text-xs text-indigo-300">{item.area}</span><span className="block text-sm">{item.label}</span></button>) : <p className="text-sm text-gray-400">No se encontraron funciones.</p>}</div>}
  </section>;
}
