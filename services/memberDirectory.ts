import { User } from '../types';
export type MemberSort = 'name' | 'debt' | 'newest';
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
export function searchMembers(users: User[], query: string, sort: MemberSort, stats: Record<string, { totalDebt: number }>) {
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  return users.filter(user => {
    const text = normalize([user.name, user.email, user.uid, user.degree, user.lodgeRole].filter(Boolean).join(' '));
    return terms.every(term => text.includes(term));
  }).sort((a, b) => {
    if (sort === 'debt') { const difference = Number(stats[b.uid]?.totalDebt || 0) - Number(stats[a.uid]?.totalDebt || 0); if (difference) return difference; }
    if (sort === 'newest') { const difference = String(b.joinDate || '').localeCompare(String(a.joinDate || '')); if (difference) return difference; }
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) || a.uid.localeCompare(b.uid);
  });
}
export function memberPage<T>(members: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(members.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { rows: members.slice((current - 1) * size, current * size), current, pages };
}
