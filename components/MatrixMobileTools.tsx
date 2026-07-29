import React, { useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Payment, User } from '../types';

interface Props { user: User; currentView: string; }

const MatrixMobileTools: React.FC<Props> = ({ user, currentView }) => {
  useEffect(() => {
    if (currentView !== 'admin') return;
    let bypass = false;

    const exportVisibleMatrix = async (card: HTMLElement) => {
      const table = card.querySelector('table');
      if (!table) return;
      const rows = Array.from(table.querySelectorAll('tr')).filter(row => (row as HTMLElement).offsetParent !== null);
      const cells = rows.map(row => Array.from(row.querySelectorAll('th,td')).map(cell => (cell.textContent || '').trim()));
      if (!cells.length) return;
      const colCount = Math.max(...cells.map(row => row.length));
      const colW = 90, nameW = 230, rowH = 34, titleH = 62;
      const width = nameW + Math.max(1, colCount - 1) * colW;
      const height = titleH + cells.length * rowH + 20;
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif';
      const activeFilter = Array.from(card.querySelectorAll('button')).find(btn => btn.className.includes('bg-indigo-700') || btn.className.includes('bg-purple-700'))?.textContent?.trim() || 'Filtro actual';
      ctx.fillText(`Matriz de pagos ${activeFilter}`, 14, 26);
      ctx.fillStyle = '#9ca3af'; ctx.font = '12px sans-serif'; ctx.fillText(new Date().toLocaleString('es-MX'), 14, 46);
      cells.forEach((row, ri) => {
        const y = titleH + ri * rowH;
        ctx.fillStyle = ri === 0 ? '#1f2937' : ri % 2 ? '#172033' : '#111827';
        ctx.fillRect(0, y, width, rowH);
        row.forEach((text, ci) => {
          const x = ci === 0 ? 10 : nameW + (ci - 1) * colW;
          ctx.fillStyle = ri === 0 ? '#c7d2fe' : '#f3f4f6';
          ctx.font = ri === 0 ? 'bold 11px sans-serif' : '11px sans-serif';
          ctx.fillText(text.slice(0, ci === 0 ? 34 : 12), x, y + 22);
        });
      });
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      const file = new File([blob], `matriz-${Date.now()}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Matriz de pagos' });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
        URL.revokeObjectURL(url);
      }
    };

    const enhance = () => {
      const title = Array.from(document.querySelectorAll<HTMLElement>('h3')).find(node => node.textContent?.includes('Matriz de Pagos'));
      const card = title?.closest('.bg-logia-800') as HTMLElement | null;
      if (!card) return;
      const old = Array.from(card.querySelectorAll<HTMLButtonElement>('button')).find(btn => btn.textContent?.includes('Imagen'));
      if (old) old.style.display = 'none';
      if (!card.querySelector('[data-mobile-matrix-export]')) {
        const btn = document.createElement('button');
        btn.dataset.mobileMatrixExport = 'true';
        btn.textContent = '🖼️ Imagen del filtro';
        btn.className = 'bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-bold';
        btn.onclick = () => void exportVisibleMatrix(card);
        title?.parentElement?.querySelector('.flex.gap-2')?.appendChild(btn);
      }
    };

    const explainModal = async () => {
      if (bypass) return;
      const heading = Array.from(document.querySelectorAll<HTMLElement>('h3')).find(node => node.textContent?.includes('Registrar Pago'));
      const modal = heading?.closest('.fixed') as HTMLElement | null;
      if (!modal || modal.querySelector('[data-debt-breakdown]')) return;
      const text = modal.textContent || '';
      const member = text.match(/Miembro:\s*([^\n]+)/)?.[1]?.trim();
      const period = text.match(/Período:\s*(\d{4}-\d{2})/)?.[1];
      if (!member || !period) return;
      const users = await getDocs(collection(db, 'users'));
      const userDoc = users.docs.find(d => (d.data() as User).groupId === user.groupId && (d.data() as User).name.trim() === member);
      if (!userDoc) return;
      const ledger = await getDocs(collection(db, 'users', userDoc.id, 'ledger'));
      const payment = ledger.docs.find(d => d.id === period)?.data() as Payment | undefined;
      if (!payment) return;
      const regularPaid = Number(payment.paidRegular ?? payment.paid ?? 0);
      const regularDebt = Math.max(0, Number(payment.amount || 0) - regularPaid);
      const extras = (payment.extraFees || []).filter(f => !f.forgiven).map(f => ({ ...f, debt: Math.max(0, f.amount - f.paid) }));
      const box = document.createElement('div');
      box.dataset.debtBreakdown = 'true';
      box.className = 'rounded-lg border border-indigo-500/40 bg-indigo-950/40 p-3 text-sm space-y-1';
      box.innerHTML = `<div class="font-bold text-indigo-300">Desglose real del período</div><div>Cuota mensual pendiente: <b>$${regularDebt.toFixed(2)}</b></div>${extras.map(f => `<div>⭐ ${f.description}: <b>$${f.debt.toFixed(2)}</b> pendiente de $${f.amount.toFixed(2)}</div>`).join('') || '<div>Sin cuotas extraordinarias pendientes.</div>'}`;
      heading.parentElement?.parentElement?.insertBefore(box, heading.parentElement?.nextSibling || null);
    };

    enhance();
    const observer = new MutationObserver(() => { enhance(); void explainModal(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [currentView, user.groupId]);
  return null;
};

export default MatrixMobileTools;
