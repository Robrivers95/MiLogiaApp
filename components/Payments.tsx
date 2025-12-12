
import React, { useEffect, useState } from 'react';
import { User, Payment } from '../types';
import { dataService } from '../services/api';

interface Props {
  user: User;
}

const Payments: React.FC<Props> = ({ user }) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const data = await dataService.getPayments(user.uid);
      // Filter only payments from the user's own group (to avoid showing debts from other lodges)
      const filtered = data.filter(p => !p.groupId || p.groupId === user.groupId);
      // Sort by period descending
      setPayments(filtered.sort((a, b) => b.period.localeCompare(a.period)));
      setLoading(false);
    };
    load();
  }, [user.uid, user.groupId]);
  
  const calculateTotalDue = (p: Payment) => p.amount + (p.extraAmount || 0);

  const summary = {
    pendingCount: payments.filter(p => p.status === 'Pendiente').length,
    totalDebt: payments.reduce((acc, p) => acc + (calculateTotalDue(p) - p.paid), 0),
    paidCount: payments.filter(p => p.status === 'Pagado').length
  };

  return (
    <div className="p-4 space-y-6 pb-24">
      <h2 className="text-2xl font-bold text-white mb-4">Mis Pagos</h2>
      
      {/* Summary Card */}
      <div className="bg-logia-800 rounded-xl p-5 border border-logia-700 shadow-lg grid grid-cols-2 gap-4">
        <div>
          <p className="text-gray-400 text-xs">Deuda Total</p>
          <p className={`text-2xl font-bold ${summary.totalDebt > 0 ? 'text-logia-danger' : 'text-logia-success'}`}>
            ${summary.totalDebt}
          </p>
        </div>
        <div className="text-right">
           <p className="text-gray-400 text-xs">Meses Pendientes</p>
           <p className="text-xl font-bold text-white">{summary.pendingCount}</p>
        </div>
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="text-center text-gray-400">Cargando historial...</p>
        ) : payments.length === 0 ? (
          <p className="text-center text-gray-400 bg-logia-800/50 p-4 rounded-lg">No hay registros de pagos.</p>
        ) : (
          payments.map((pay) => {
             const totalDue = calculateTotalDue(pay);
             return (
            <div key={pay.period} className="bg-logia-800 rounded-lg p-4 border border-logia-700 flex justify-between items-center">
              <div>
                <p className="text-lg font-bold text-indigo-200">{pay.period}</p>
                <p className="text-xs text-gray-400">
                  Cuota Base: ${pay.amount} 
                  {pay.extraAmount ? <span className="text-purple-400"> + Extra: ${pay.extraAmount}</span> : ''}
                </p>
                <p className="text-sm font-bold text-white mt-1">Total: ${totalDue} | Pagado: ${pay.paid}</p>
                
                {pay.extraDescription && <p className="text-xs text-purple-300 mt-1 font-medium">ℹ️ {pay.extraDescription}</p>}
                
                {pay.comments && <p className="text-xs text-gray-500 mt-1 italic">"{pay.comments}"</p>}
              </div>
              <div className="text-right">
                 <span className={`px-2 py-1 rounded text-xs font-bold uppercase
                   ${pay.status === 'Pagado' ? 'bg-logia-success/20 text-logia-success' : 
                     pay.status === 'Parcial' ? 'bg-orange-500/20 text-orange-400' : 
                     'bg-logia-danger/20 text-logia-danger'}`}>
                   {pay.status}
                 </span>
                 {pay.paymentDate && (
                   <p className="text-[10px] text-gray-500 mt-2">{new Date(pay.paymentDate).toLocaleDateString()}</p>
                 )}
              </div>
            </div>
          )})
        )}
      </div>
    </div>
  );
};

export default Payments;
