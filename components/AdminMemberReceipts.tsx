import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { PaymentReceipt, User } from '../types';

interface Props {
  user: User;
  currentView: string;
}

const receiptUrls = (receipt: PaymentReceipt): string[] => {
  if (receipt.receiptImageUrls?.length) return receipt.receiptImageUrls.filter(Boolean);
  return receipt.receiptImageUrl ? [receipt.receiptImageUrl] : [];
};

const AdminMemberReceipts: React.FC<Props> = ({ user, currentView }) => {
  const canInspect = ['admin', 'viewer', 'master'].includes(user.role);
  const [selectedMember, setSelectedMember] = useState<User | null>(null);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canInspect || currentView !== 'admin') return;

    const attachButtons = () => {
      const headings = Array.from(document.querySelectorAll<HTMLElement>('h4'))
        .filter(node => node.textContent?.includes('Detalle de Cuotas -'));

      headings.forEach(heading => {
        const container = heading.parentElement;
        if (!container || container.querySelector('[data-member-receipts-button]')) return;

        const memberName = (heading.textContent || '').split('Detalle de Cuotas -')[1]?.trim();
        if (!memberName) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.memberReceiptsButton = 'true';
        button.textContent = '📷 Ver comprobantes';
        button.className = 'ml-3 rounded-lg bg-sky-700 hover:bg-sky-600 text-white px-3 py-1.5 text-xs font-bold';
        button.onclick = async () => {
          setLoading(true);
          setError('');
          try {
            const usersSnap = await getDocs(collection(db, 'users'));
            const memberDoc = usersSnap.docs.find(docSnap => {
              const data = docSnap.data() as User;
              return data.groupId === user.groupId && data.name.trim() === memberName;
            });
            if (!memberDoc) throw new Error('No se encontró el miembro seleccionado.');

            const member = { ...(memberDoc.data() as User), uid: memberDoc.id };
            setSelectedMember(member);

            // Esta es la colección real usada por el flujo actual de comprobantes.
            const snap = await getDocs(collection(db, 'groups', user.groupId, 'paymentReceipts'));
            const rows = snap.docs
              .map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as Omit<PaymentReceipt, 'id'>) }))
              .filter(item => item.userId === member.uid)
              .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
            setReceipts(rows);
          } catch (e: any) {
            console.error('Error cargando comprobantes del miembro', e);
            setError(e?.message || 'No fue posible cargar los comprobantes.');
            setReceipts([]);
          } finally {
            setLoading(false);
          }
        };
        heading.appendChild(button);
      });
    };

    attachButtons();
    const observer = new MutationObserver(attachButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [canInspect, currentView, user.groupId]);

  const grouped = useMemo(() => {
    const map = new Map<string, PaymentReceipt[]>();
    receipts.forEach(receipt => {
      const concept = receipt.receiptType === 'cuota_mensual'
        ? `Cuota mensual · ${receipt.periods.join(', ') || 'Sin periodo'}`
        : `Cuota extraordinaria · ${receipt.conceptDescription || 'Sin concepto'}`;
      map.set(concept, [...(map.get(concept) || []), receipt]);
    });
    return Array.from(map.entries());
  }, [receipts]);

  if (!selectedMember && !loading && !error) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/80 p-3 overflow-y-auto">
      <div className="max-w-4xl mx-auto bg-logia-900 border border-logia-700 rounded-2xl p-4 text-white space-y-4">
        <div className="flex justify-between gap-3 items-start">
          <div>
            <h2 className="text-xl font-bold">📷 Comprobantes de {selectedMember?.name || 'miembro'}</h2>
            <p className="text-xs text-gray-400">Los mismos archivos que el miembro ve desde Mis pagos.</p>
          </div>
          <button onClick={() => { setSelectedMember(null); setReceipts([]); setError(''); }} className="text-xl">✕</button>
        </div>

        {loading && <p className="text-gray-300">Cargando comprobantes…</p>}
        {error && <p className="rounded-lg bg-red-900/40 border border-red-700 p-3 text-red-200">{error}</p>}

        {!loading && !error && grouped.length === 0 && (
          <p className="rounded-lg bg-white/5 p-4 text-gray-400">Este miembro no tiene comprobantes enviados.</p>
        )}

        {!loading && grouped.map(([concept, rows]) => (
          <section key={concept} className="rounded-xl border border-logia-700 bg-logia-800 p-3">
            <h3 className="font-bold text-indigo-300">{concept}</h3>
            <div className="space-y-3 mt-3">
              {rows.map(receipt => {
                const urls = receiptUrls(receipt);
                return (
                  <div key={receipt.id} className="rounded-lg bg-black/20 p-3">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mb-2">
                      <span>Transferencia: {receipt.transferDate ? new Date(receipt.transferDate).toLocaleDateString('es-MX') : 'Sin fecha'}</span>
                      <span>Estado: {receipt.status}</span>
                      {receipt.amount !== undefined && <span>Monto: ${Number(receipt.amount).toFixed(2)}</span>}
                    </div>
                    {urls.length ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {urls.map((url, index) => (
                          <a key={`${receipt.id}-${index}`} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-white/10">
                            <img src={url} alt={`Comprobante ${index + 1}`} className="w-full h-32 object-cover" />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">El registro existe, pero no contiene una URL de imagen.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default AdminMemberReceipts;
