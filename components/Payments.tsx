import React, { useEffect, useState } from 'react';
import { User, Payment, IndividualExtraFee } from '../types';
import { dataService } from '../services/api';

interface Props {
  user: User;
}

const Payments: React.FC<Props> = ({ user }) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());

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
  
  const toggleExpand = (period: string) => {
    const newSet = new Set(expandedPeriods);
    if (newSet.has(period)) {
      newSet.delete(period);
    } else {
      newSet.add(period);
    }
    setExpandedPeriods(newSet);
  };
  
  const calculateTotalDue = (p: Payment) => {
    let total = p.amount;
    
    // Add individual extra fees if they exist (v3.1.0)
    if (p.extraFees && p.extraFees.length > 0) {
      total += p.extraFees.reduce((sum, fee) => sum + fee.amount, 0);
    } else if (p.extraAmount) {
      // Legacy: single extra amount
      total += p.extraAmount;
    }
    
    return total;
  };
  
  const calculateTotalPaid = (p: Payment) => {
    return (p.paidRegular || 0) + (p.paidExtra || 0);
  };

  const summary = {
    // v3.0.0: Use regularCovered to determine if monthly fee is pending
    pendingCount: payments.filter(p => {
      //  If regularCovered exists, use it; otherwise fallback to status
      if (p.regularCovered !== undefined) {
        return !p.regularCovered;
      }
      return p.status === 'Pendiente';
    }).length,
    totalDebt: payments.reduce((acc, p) => acc + (calculateTotalDue(p) - calculateTotalPaid(p)), 0),
    paidCount: payments.filter(p => p.status === 'Pagado').length
  };

  return (
    <div className="p-4 space-y-6 pb-24">
      <h2 className="text-2xl font-bold text-white mb-4">Mis Pagos</h2>
      
      {/* Summary Card */}
      <div className="bg-logia-800 rounded-xl p-5 border border-logia-700 shadow-lg grid grid-cols-2 gap-4">
        <div>
          <p className="text-gray-400 text-xs">Saldo Pendiente</p>
          <p className={`text-2xl font-bold ${summary.totalDebt > 0 ? 'text-logia-danger' : 'text-logia-success'}`}>
            ${summary.totalDebt.toFixed(2)}
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
             const totalPaid = calculateTotalPaid(pay);
             const balance = totalDue - totalPaid;
             const isExpanded = expandedPeriods.has(pay.period);
             const hasExtraFees = pay.extraFees && pay.extraFees.length > 0;
             
             return (
            <div key={pay.period} className="bg-logia-800 rounded-lg border border-logia-700 overflow-hidden">
              {/* Main Row */}
              <div 
                className="p-4 flex justify-between items-center cursor-pointer hover:bg-logia-700/30 transition-colors"
                onClick={() => hasExtraFees && toggleExpand(pay.period)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-lg font-bold text-indigo-200">{pay.period}</p>
                    {hasExtraFees && (
                      <button className="text-indigo-400 text-sm">
                        {isExpanded ? '▼' : '▶'} {pay.extraFees!.length} cuota(s) extra
                      </button>
                    )}
                  </div>
                  
                  {/* Regular Fee */}
                  <div className="text-xs text-gray-400 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span>Cuota Mensual: ${pay.amount.toFixed(2)}</span>
                      {pay.paidRegular !== undefined && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          pay.regularCovered ? 'bg-green-600/30 text-green-400' : 'bg-red-600/30 text-red-400'
                        }`}>
                          Pagado: ${pay.paidRegular.toFixed(2)}
                        </span>
                      )}
                    </div>
                    
                    {/* Extra Fees Summary */}
                    {hasExtraFees && (
                      <div className="flex items-center gap-2">
                        <span className="text-purple-400">
                          Cuotas Extras: ${pay.extraFees!.reduce((sum, f) => sum + f.amount, 0).toFixed(2)}
                        </span>
                        {pay.paidExtra !== undefined && pay.paidExtra > 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-600/30 text-purple-400">
                            Pagado: ${pay.paidExtra.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                    
                    {/* Legacy single extra fee */}
                    {!hasExtraFees && pay.extraAmount && pay.extraAmount > 0 && (
                      <div className="text-purple-400">
                        Cuota Extra: ${pay.extraAmount.toFixed(2)}
                        {pay.extraDescription && <span className="ml-2 text-purple-300">({pay.extraDescription})</span>}
                      </div>
                    )}
                  </div>
                  
                  {/* Totals */}
                  <div className="mt-2 flex items-center gap-4 text-sm">
                    <span className="font-bold text-white">Total: ${totalDue.toFixed(2)}</span>
                    <span className="text-green-400">Pagado: ${totalPaid.toFixed(2)}</span>
                    <span className={`font-bold ${balance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      Saldo: ${balance.toFixed(2)}
                    </span>
                  </div>
                  
                  {pay.comments && <p className="text-xs text-gray-500 mt-1 italic">"{pay.comments}"</p>}
                </div>
                
                <div className="text-right ml-4">
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
              
              {/* Expanded Detail (show individual extra fees) */}
              {isExpanded && hasExtraFees && (
                <div className="border-t border-logia-700 bg-logia-900/50 p-4 space-y-2">
                  <p className="text-xs font-bold text-purple-300 uppercase mb-2">Desglose de Cuotas Extras:</p>
                  {pay.extraFees!.map((fee, idx) => (
                    <div key={fee.id} className="flex justify-between items-center bg-logia-800 p-2 rounded border border-purple-600/30">
                      <div className="flex-1">
                        <p className="text-sm text-white font-medium">{fee.description}</p>
                        <p className="text-xs text-gray-400">
                          Agregado: {new Date(fee.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-purple-400">${fee.amount.toFixed(2)}</p>
                        {fee.paid > 0 && (
                          <p className="text-xs text-green-400">Pagado: ${fee.paid.toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )})
        )}
      </div>
    </div>
  );
};

export default Payments;
