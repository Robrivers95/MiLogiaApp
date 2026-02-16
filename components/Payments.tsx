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
        <div className="bg-logia-800 rounded-xl border border-logia-700 overflow-hidden">
          {/* Table Header */}
          <div className="bg-logia-900 p-3 grid grid-cols-12 gap-2 text-xs font-bold text-gray-400 uppercase border-b border-logia-700">
            <div className="col-span-3">Mes / Año</div>
            <div className="col-span-2 text-right">Cuota Regular</div>
            <div className="col-span-3">Cuota Extra</div>
            <div className="col-span-2 text-right">Pagado</div>
            <div className="col-span-2 text-right">Saldo</div>
          </div>
          
          {/* Table Body */}
          <div className="divide-y divide-logia-700">
            {allRows.map((row, idx) => {
              const isExpanded = expandedPeriods.has(row.period);
              const hasDetails = row.isMainRow && (row.paymentDate || row.comments);
              
              return (
                <React.Fragment key={`${row.period}-${idx}`}>
                  <div 
                    className={`p-3 grid grid-cols-12 gap-2 ${hasDetails ? 'cursor-pointer hover:bg-logia-700/30' : ''} ${row.isMainRow ? '' : 'bg-purple-900/10'}`}
                    onClick={() => hasDetails && toggleExpand(row.period)}
                  >
                    {/* Period Column */}
                    <div className="col-span-3 flex items-center gap-2">
                      <span className={`text-sm ${row.isMainRow ? 'font-bold text-indigo-300' : 'text-gray-400 text-xs'}`}>
                        {row.isMainRow ? row.periodDisplay : `↳ ${row.periodDisplay}`}
                      </span>
                      {hasDetails && (
                        <span className="text-xs text-indigo-400">{isExpanded ? '▼' : '▶'}</span>
                      )}
                    </div>
                    
                    {/* Regular Fee Column */}
                    <div className="col-span-2 text-right">
                      {row.regularAmount > 0 ? (
                        <div className="text-sm">
                          <div className="text-white font-medium">${row.regularAmount.toFixed(2)}</div>
                          {row.regularPaid > 0 && (
                            <div className="text-xs text-green-400">-${row.regularPaid.toFixed(2)}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </div>
                    
                    {/* Extra Fee Column */}
                    <div className="col-span-3">
                      {row.extraFee ? (
                        <div className="text-sm">
                          <div className="text-purple-300 font-medium">{row.extraFee.description}</div>
                          <div className="text-xs text-gray-400">${row.extraFee.amount.toFixed(2)}</div>
                        </div>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </div>
                    
                    {/* Paid Column */}
                    <div className="col-span-2 text-right">
                      <div className="text-sm">
                        {row.regularPaid > 0 && (
                          <div className="text-green-400">${row.regularPaid.toFixed(2)}</div>
                        )}
                        {row.extraFee && row.extraFee.paid > 0 && (
                          <div className="text-green-400">${row.extraFee.paid.toFixed(2)}</div>
                        )}
                        {row.regularPaid === 0 && (!row.extraFee || row.extraFee.paid === 0) && (
                          <span className="text-gray-600">$0.00</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Balance Column */}
                    <div className="col-span-2 text-right">
                      <span className={`text-sm font-bold ${row.totalBalance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        ${row.totalBalance.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Expanded Details */}
                  {isExpanded && hasDetails && (
                    <div className="bg-logia-900/50 p-3 border-t border-logia-700 text-xs">
                      {row.paymentDate && (
                        <div className="mb-1">
                          <span className="text-gray-400">Fecha de Pago: </span>
                          <span className="text-white">{new Date(row.paymentDate).toLocaleDateString('es-ES')}</span>
                        </div>
                      )}
                      {row.comments && (
                        <div>
                          <span className="text-gray-400">Comentarios: </span>
                          <span className="text-white italic">"{row.comments}"</span>
                        </div>
                      )}
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
