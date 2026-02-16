import React, { useEffect, useState } from 'react';
import { User, Payment, IndividualExtraFee } from '../types';
import { dataService } from '../services/api';

interface Props {
  user: User;
}

interface PaymentRow {
  period: string;
  periodDisplay: string;
  regularAmount: number;
  regularPaid: number;
  regularBalance: number;
  extraFee?: IndividualExtraFee | { description: string; amount: number; paid: number; id: string };
  extraBalance: number;
  totalBalance: number;
  isMainRow: boolean;
  paymentDate?: string | null;
  comments?: string;
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
  
  const formatPeriod = (period: string): string => {
    const [year, month] = period.split('-');
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  };
  
  const buildPaymentRows = (payment: Payment): PaymentRow[] => {
    const rows: PaymentRow[] = [];
    const periodDisplay = formatPeriod(payment.period);
    
    // Calculate regular balance
    const regularPaid = payment.paidRegular || 0;
    const regularBalance = payment.amount - regularPaid;
    
    // Main row with regular fee
    const mainRow: PaymentRow = {
      period: payment.period,
      periodDisplay,
      regularAmount: payment.amount,
      regularPaid,
      regularBalance,
      extraBalance: 0,
      totalBalance: regularBalance,
      isMainRow: true,
      paymentDate: payment.paymentDate,
      comments: payment.comments
    };
    
    // Check for individual extra fees (v3.1.0)
    if (payment.extraFees && payment.extraFees.length > 0) {
      // First extra fee goes on main row
      const firstExtraFee = payment.extraFees[0];
      const firstExtraBalance = firstExtraFee.amount - firstExtraFee.paid;
      mainRow.extraFee = firstExtraFee;
      mainRow.extraBalance = firstExtraBalance;
      mainRow.totalBalance = regularBalance + firstExtraBalance;
      rows.push(mainRow);
      
      // Additional extra fees get their own rows
      for (let i = 1; i < payment.extraFees.length; i++) {
        const extraFee = payment.extraFees[i];
        const extraBalance = extraFee.amount - extraFee.paid;
        rows.push({
          period: payment.period,
          periodDisplay,
          regularAmount: 0, // No regular amount on extra rows
          regularPaid: 0,
          regularBalance: 0,
          extraFee,
          extraBalance,
          totalBalance: extraBalance,
          isMainRow: false
        });
      }
    } else if (payment.extraAmount && payment.extraAmount > 0) {
      // Legacy single extra fee
      const extraPaid = payment.paidExtra || 0;
      const extraBalance = payment.extraAmount - extraPaid;
      mainRow.extraFee = {
        id: 'legacy',
        description: payment.extraDescription || 'Cuota Extra',
        amount: payment.extraAmount,
        paid: extraPaid
      };
      mainRow.extraBalance = extraBalance;
      mainRow.totalBalance = regularBalance + extraBalance;
      rows.push(mainRow);
    } else {
      // No extra fees
      rows.push(mainRow);
    }
    
    return rows;
  };
  
  // Build all rows
  const allRows: PaymentRow[] = payments.flatMap(p => buildPaymentRows(p));
  
  // Calculate summary
  const summary = {
    totalRegularDebt: allRows.filter(r => r.isMainRow).reduce((sum, r) => sum + r.regularBalance, 0),
    totalExtraDebt: allRows.reduce((sum, r) => sum + r.extraBalance, 0),
    totalDebt: allRows.reduce((sum, r) => sum + r.totalBalance, 0),
    pendingCount: allRows.filter(r => r.isMainRow && r.totalBalance > 0).length
  };

  return (
    <div className="p-4 space-y-6 pb-24">
      <h2 className="text-2xl font-bold text-white mb-4">Mis Pagos</h2>
      
      {/* Summary Card */}
      <div className="bg-logia-800 rounded-xl p-5 border border-logia-700 shadow-lg">
        <div className="grid grid-cols-3 gap-4 mb-3">
          <div>
            <p className="text-gray-400 text-xs">Deuda Cuota Regular</p>
            <p className={`text-xl font-bold ${summary.totalRegularDebt > 0 ? 'text-orange-400' : 'text-logia-success'}`}>
              ${summary.totalRegularDebt.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Deuda Cuotas Extras</p>
            <p className={`text-xl font-bold ${summary.totalExtraDebt > 0 ? 'text-purple-400' : 'text-logia-success'}`}>
              ${summary.totalExtraDebt.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Saldo Total</p>
            <p className={`text-2xl font-bold ${summary.totalDebt > 0 ? 'text-logia-danger' : 'text-logia-success'}`}>
              ${summary.totalDebt.toFixed(2)}
            </p>
          </div>
        </div>
        <div className="text-right">
           <p className="text-gray-400 text-xs">Meses con Saldo Pendiente</p>
           <p className="text-lg font-bold text-white">{summary.pendingCount}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-gray-400">Cargando historial...</p>
      ) : allRows.length === 0 ? (
        <p className="text-center text-gray-400 bg-logia-800/50 p-4 rounded-lg">No hay registros de pagos.</p>
      ) : (
        <div className="bg-logia-800 rounded-lg border border-logia-700 overflow-hidden shadow-lg">
          {/* Table Header - Estilo Excel */}
          <div className="bg-gradient-to-r from-indigo-900 to-indigo-800 p-3 grid grid-cols-12 gap-1 text-xs font-bold text-gray-200 uppercase border-b-2 border-indigo-600">
            <div className="col-span-3 pl-2">Período</div>
            <div className="col-span-2 text-right pr-2">Cuota Regular</div>
            <div className="col-span-2 text-right pr-2">Cuota Extra</div>
            <div className="col-span-2 text-right pr-2">Pagado</div>
            <div className="col-span-2 text-right pr-2">Saldo</div>
            <div className="col-span-1 text-center">Info</div>
          </div>
          
          {/* Table Body - Estilo Excel */}
          <div className="divide-y divide-logia-700">
            {allRows.map((row, idx) => {
              const isExpanded = expandedPeriods.has(row.period);
              const hasDetails = row.isMainRow && (row.paymentDate || row.comments || row.extraFee);
              
              return (
                <React.Fragment key={`${row.period}-${idx}`}>
                  <div 
                    className={`grid grid-cols-12 gap-1 items-center hover:bg-logia-700/20 transition-colors ${
                      row.isMainRow ? 'bg-logia-800/80' : 'bg-logia-900/50'
                    } ${idx % 2 === 0 ? 'bg-opacity-50' : ''}`}
                  >
                    {/* Period Column */}
                    <div className="col-span-3 py-3 pl-2 border-r border-logia-700/50">
                      <span className={`text-sm ${row.isMainRow ? 'font-bold text-indigo-300' : 'text-gray-400 text-xs pl-4'}`}>
                        {row.isMainRow ? row.periodDisplay : `↳ ${row.periodDisplay}`}
                      </span>
                    </div>
                    
                    {/* Regular Fee Column */}
                    <div className="col-span-2 py-3 pr-2 text-right border-r border-logia-700/50">
                      {row.regularAmount > 0 ? (
                        <div className="text-sm tabular-nums">
                          <div className="text-white font-medium">${row.regularAmount.toFixed(2)}</div>
                          {row.regularPaid > 0 && (
                            <div className="text-xs text-green-400">-${row.regularPaid.toFixed(2)}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-600 text-sm">—</span>
                      )}
                    </div>
                    
                    {/* Extra Fee Column - SOLO MONTO */}
                    <div className="col-span-2 py-3 pr-2 text-right border-r border-logia-700/50">
                      {row.extraFee ? (
                        <div className="text-sm tabular-nums">
                          <div className="text-purple-300 font-medium">${row.extraFee.amount.toFixed(2)}</div>
                          {row.extraFee.paid > 0 && (
                            <div className="text-xs text-green-400">-${row.extraFee.paid.toFixed(2)}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-600 text-sm">—</span>
                      )}
                    </div>
                    
                    {/* Paid Column */}
                    <div className="col-span-2 py-3 pr-2 text-right border-r border-logia-700/50">
                      <div className="text-sm tabular-nums">
                        {(row.regularPaid > 0 || (row.extraFee && row.extraFee.paid > 0)) ? (
                          <div className="text-green-400 font-medium">
                            ${(row.regularPaid + (row.extraFee?.paid || 0)).toFixed(2)}
                          </div>
                        ) : (
                          <span className="text-gray-600">$0.00</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Balance Column */}
                    <div className="col-span-2 py-3 pr-2 text-right border-r border-logia-700/50">
                      <span className={`text-sm font-bold tabular-nums ${row.totalBalance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        ${row.totalBalance.toFixed(2)}
                      </span>
                    </div>
                    
                    {/* Info Button Column */}
                    <div className="col-span-1 py-3 text-center">
                      {hasDetails && (
                        <button
                          onClick={() => toggleExpand(row.period)}
                          className="text-indigo-400 hover:text-indigo-300 text-xs font-bold"
                          title="Ver detalles"
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Expanded Details */}
                  {isExpanded && hasDetails && (
                    <div className="bg-logia-900 border-t border-b-2 border-indigo-600/30">
                      <div className="p-4 space-y-3">
                        <p className="text-xs font-bold text-indigo-400 uppercase mb-2">📋 Detalles del Período</p>
                        
                        {/* Payment Info */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {row.paymentDate && (
                            <div className="bg-logia-800/50 p-2 rounded border border-logia-700">
                              <span className="text-gray-400 text-xs block">Fecha de Pago:</span>
                              <span className="text-white font-medium">{new Date(row.paymentDate).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                            </div>
                          )}
                          {row.comments && (
                            <div className="bg-logia-800/50 p-2 rounded border border-logia-700">
                              <span className="text-gray-400 text-xs block">Comentarios:</span>
                              <span className="text-white font-medium italic">"{row.comments}"</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Extra Fee Description */}
                        {row.extraFee && (
                          <div className="bg-purple-900/20 p-3 rounded border border-purple-600/30">
                            <span className="text-purple-400 text-xs font-bold block mb-1">Descripción de Cuota Extra:</span>
                            <span className="text-purple-200 text-sm font-medium">{row.extraFee.description}</span>
                            <div className="mt-2 flex gap-4 text-xs">
                              <span className="text-gray-400">Monto: <span className="text-purple-300 font-bold">${row.extraFee.amount.toFixed(2)}</span></span>
                              <span className="text-gray-400">Pagado: <span className="text-green-400 font-bold">${row.extraFee.paid.toFixed(2)}</span></span>
                              <span className="text-gray-400">Pendiente: <span className={`font-bold ${row.extraBalance > 0 ? 'text-red-400' : 'text-green-400'}`}>${row.extraBalance.toFixed(2)}</span></span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Payments;
