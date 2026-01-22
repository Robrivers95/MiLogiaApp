
import React, { useState, useEffect } from 'react';
import { User, Payment, PriceHistoryEntry, Role, MasonicDegree, LodgeRole, TreasuryEntry, FundSource, TreasuryAllocation, Notice, Trivia, VisitRequest, Group, BankBalance, ExtraFee } from '../types';
import { dataService, generateTriviaWithAI, authService } from '../services/api';
import { doc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';


interface Props {
  user: User;
}

type Tab = 'dashboard' | 'requests' | 'users' | 'fees' | 'attendance' | 'trivia' | 'treasury' | 'notices' | 'banks' | 'visits' | 'payment-matrix' | 'create-user';

const Admin: React.FC<Props> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false); 
  const [applyingExtra, setApplyingExtra] = useState(false);
  
  // Financial Stats Cache
  const [userStats, setUserStats] = useState<Record<string, { 
    totalPaid: number; 
    totalDebt: number; 
    totalBilled: number;
    totalPaidRegular?: number;
    totalPaidExtra?: number;
    totalBilledRegular?: number;
    totalBilledExtra?: number;
    totalDebtRegular?: number;
    totalDebtExtra?: number;
  }>>({});
  
  // Dashboard Stats
  const [dashboardStart, setDashboardStart] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)); // Jan 1st
  const [dashboardEnd, setDashboardEnd] = useState(new Date().toISOString().slice(0, 10)); // Today
  const [dashboardData, setDashboardData] = useState({ income: 0, expense: 0 });
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  // Filters (Users Tab)
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active'); // Default to active users only

  // Clock State
  const [mxTime, setMxTime] = useState('');

  // Fees History State
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [newPricePeriod, setNewPricePeriod] = useState('');
  const [newPriceAmount, setNewPriceAmount] = useState(0);
  const [deletingPriceDate, setDeletingPriceDate] = useState<string | null>(null);
  const [showDeletePriceModal, setShowDeletePriceModal] = useState(false);
  
  // Extra Fee State
  const [extraFeePeriod, setExtraFeePeriod] = useState('');
  const [extraFeeAmount, setExtraFeeAmount] = useState(0);
  const [extraFeeDesc, setExtraFeeDesc] = useState('');

  // Trivia State
  const [triviaQ, setTriviaQ] = useState('');
  const [triviaOpts, setTriviaOpts] = useState(['', '', '', '']);
  const [triviaCorrect, setTriviaCorrect] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [allTrivias, setAllTrivias] = useState<Trivia[]>([]);
  const [showDeleteTriviaModal, setShowDeleteTriviaModal] = useState(false);
  const [deletingTriviaId, setDeletingTriviaId] = useState<string | null>(null);

  // Attendance State
  const [attDate, setAttDate] = useState(new Date().toISOString().split('T')[0]);
  const [attSelected, setAttSelected] = useState<Set<string>>(new Set());
  const [attHistory, setAttHistory] = useState<string[]>([]);
  const [viewingAttDate, setViewingAttDate] = useState<string | null>(null);
  const [attDetailList, setAttDetailList] = useState<{name: string, attended: boolean, uid: string}[]>([]);
  const [editingAttDate, setEditingAttDate] = useState<string | null>(null);
  const [editAttSelected, setEditAttSelected] = useState<Set<string>>(new Set());
  const [showDeleteAttModal, setShowDeleteAttModal] = useState(false);
  const [deletingAttDate, setDeletingAttDate] = useState<string | null>(null);

  // Treasury State
  const [treasuryEntries, setTreasuryEntries] = useState<TreasuryEntry[]>([]);
  const [combinedTreasuryHistory, setCombinedTreasuryHistory] = useState<TreasuryEntry[]>([]); // Includes Quotas
  const [treasuryBalance, setTreasuryBalance] = useState({ general: 0, charity: 0, quotas: 0 });
  const [editingTreasuryId, setEditingTreasuryId] = useState<string | null>(null);
  const [newTransType, setNewTransType] = useState<'income' | 'expense'>('income');
  const [newTransAmount, setNewTransAmount] = useState(0);
  const [newTransDesc, setNewTransDesc] = useState('');
  const [newTransCat, setNewTransCat] = useState('saco_beneficencia');
  const [newTransDate, setNewTransDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [allocations, setAllocations] = useState<TreasuryAllocation[]>([]);
  const [allocSource, setAllocSource] = useState<FundSource>('tesoro_general');
  const [allocAmount, setAllocAmount] = useState(0);

  // Treasury Delete Modal
  const [deletingTreasuryId, setDeletingTreasuryId] = useState<string | null>(null);
  const [showDeleteTreasuryModal, setShowDeleteTreasuryModal] = useState(false);

  // Notices State
  const [notices, setNotices] = useState<Notice[]>([]);
  const [newNoticeTitle, setNewNoticeTitle] = useState('');
  const [newNoticeContent, setNewNoticeContent] = useState('');
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [deletingNoticeId, setDeletingNoticeId] = useState<string | null>(null);
  const [showDeleteNoticeModal, setShowDeleteNoticeModal] = useState(false);

  // Visit Requests State
  const [visitRequests, setVisitRequests] = useState<VisitRequest[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [newVisitToGroupId, setNewVisitToGroupId] = useState('');
  const [newVisitDate, setNewVisitDate] = useState('');
  const [newVisitCount, setNewVisitCount] = useState(1);
  const [newVisitMessage, setNewVisitMessage] = useState('');
  const [viewingVisitRequest, setViewingVisitRequest] = useState<VisitRequest | null>(null);
  const [newChatMessage, setNewChatMessage] = useState('');
  const [deletingVisitId, setDeletingVisitId] = useState<string | null>(null);
  const [showDeleteVisitModal, setShowDeleteVisitModal] = useState(false);

  // Bank Balances State
  const [bankBalances, setBankBalances] = useState<BankBalance[]>([]);
  const [showBankForm, setShowBankForm] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [bankFormData, setBankFormData] = useState({
    type: 'bank' as 'bank' | 'cash',
    name: '',
    amount: 0,
    comment: ''
  });

  // Extra Fees Management State
  const [extraFees, setExtraFees] = useState<ExtraFee[]>([]);
  const [showExtraFeeHistory, setShowExtraFeeHistory] = useState(false);
  const [extraFeeType, setExtraFeeType] = useState<'mass' | 'individual'>('mass');
  const [selectedUserForFee, setSelectedUserForFee] = useState<string>('');
  const [deletingExtraFeeId, setDeletingExtraFeeId] = useState<string | null>(null);
  const [showDeleteExtraFeeModal, setShowDeleteExtraFeeModal] = useState(false);
  const [editingExtraFeeId, setEditingExtraFeeId] = useState<string | null>(null);
  const [editExtraFeeData, setEditExtraFeeData] = useState({ description: '', amount: 0 });
  const [showEditExtraFeeModal, setShowEditExtraFeeModal] = useState(false);

  // Create User State
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('member');
  const [newUserDegree, setNewUserDegree] = useState<MasonicDegree>('aprendiz');
  const [creatingUser, setCreatingUser] = useState(false);

  // Payment Matrix State
  const [matrixYear, setMatrixYear] = useState(new Date().getFullYear());
  const [matrixMonths] = useState(['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']);
  const [allUserLedgers, setAllUserLedgers] = useState<Record<string, Payment[]>>({});


  // Modals
  const [editingUserLedger, setEditingUserLedger] = useState<string | null>(null);
  const [editPayments, setEditPayments] = useState<Payment[]>([]);
  const [editingUserProfile, setEditingUserProfile] = useState<User | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [screenshotUser, setScreenshotUser] = useState<User | null>(null);
  
  // Edit Price Modal
  const [showEditPriceModal, setShowEditPriceModal] = useState(false);
  const [editPriceData, setEditPriceData] = useState<PriceHistoryEntry>({ startDate: '', amount: 0 });
  const [originalEditDate, setOriginalEditDate] = useState('');

  // PERMISSIONS
  const isReadOnly = user.role === 'viewer';
  
  // Calculate pending users
  const pendingUsers = users.filter(u => !u.active);

  useEffect(() => {
    if (user.groupId) {
      refreshAllData();
    }
    const timer = setInterval(() => {
        setMxTime(new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, [user.groupId, filterStart, filterEnd]);

  useEffect(() => {
      if (activeTab === 'attendance') {
          loadAttendanceHistory();
      }
      if (activeTab === 'dashboard') {
          loadDashboardStats();
      }
      if (activeTab === 'treasury') {
          loadTreasury();
      }
      if (activeTab === 'notices') {
          loadNotices();
      }
      if (activeTab === 'trivia') {
          loadTrivias();
      }
      if (activeTab === 'visits') {
          loadVisits();
          loadAllGroups();
      }
      if (activeTab === 'banks') {
          loadBankBalances();
      }
      if (activeTab === 'requests') {
          loadUsers();
      }
      if (activeTab === 'fees') {
          loadExtraFees();
      }
      if (activeTab === 'payment-matrix') {
          loadAllLedgers();
      }
  }, [activeTab, dashboardStart, dashboardEnd]);

  const refreshAllData = async () => {
      setLoading(true);
      await Promise.all([
          loadUsers(),
          loadPriceHistory(),
          loadTreasury()
      ]);
      setLoading(false);
  };

  const loadUsers = async () => {
    try {
        const data = await dataService.getUsers(user.groupId);
        // Sort: Inactive first, then by name
        data.sort((a, b) => {
           if (a.active !== b.active) return a.active ? 1 : -1;
           return a.name.localeCompare(b.name);
        });
        setUsers(data);
        
        const stats: any = {};
        for (const u of data) {
            const s = await dataService.getUserFinancialStats(u.uid, filterStart, filterEnd);
            stats[u.uid] = s;
        }
        setUserStats(stats);

    } catch (e) {
        console.error("Error loading users", e);
        showMessage("Error cargando usuarios. Revisa Reglas.", 'error');
    }
  };

  const loadAllLedgers = async () => {
    try {
        const ledgers: Record<string, Payment[]> = {};
        for (const u of users) {
            const paymentsSnap = await getDocs(collection(db, "users", u.uid, "ledger"));
            ledgers[u.uid] = paymentsSnap.docs.map(doc => ({ ...doc.data(), period: doc.id } as Payment));
        }
        setAllUserLedgers(ledgers);
    } catch (e) {
        console.error("Error loading ledgers", e);
    }
  };

  const loadPriceHistory = async () => {
    if (!user.groupId) return;
    try {
        const history = await dataService.getPriceHistory(user.groupId);
        setPriceHistory(history);
    } catch (e) {
        console.error("Error loading price history", e);
    }
  };

  const loadDashboardStats = async () => {
      if (!user.groupId) return;
      setLoadingDashboard(true);
      try {
          const stats = await dataService.getGlobalFinancials(user.groupId, dashboardStart, dashboardEnd);
          setDashboardData(stats);
          // Also load bank balances to show in dashboard
          const balances = await dataService.getBankBalances(user.groupId);
          setBankBalances(balances);
      } catch (e) {
          console.error(e);
      } finally {
          setLoadingDashboard(false);
      }
  };

  const loadTreasury = async () => {
      try {
          const entries = await dataService.getTreasuryEntries(user.groupId);
          setTreasuryEntries(entries);
          const quotaTransactions = await dataService.getDetailedQuotaTransactions(user.groupId);
          
          const combined = [...entries, ...quotaTransactions].sort((a, b) => {
               return b.date.localeCompare(a.date);
          });
          setCombinedTreasuryHistory(combined);
          
          const totalQuotasFromUsers = await dataService.getAllPaidQuotas(user.groupId);
          
          let generalInc = 0; let generalExp = 0;
          let charityInc = 0; let charityExp = 0;
          let quotasInc = 0; let quotasExp = 0;

          entries.forEach(e => {
              const allocs = e.allocations && e.allocations.length > 0 
                ? e.allocations 
                : [{ source: (e as any).source || 'tesoro_general', amount: e.amount } as TreasuryAllocation];
              
              allocs.forEach(alloc => {
                  if (alloc.source === 'tesoro_general') {
                      if (e.type === 'income') generalInc += alloc.amount;
                      else generalExp += alloc.amount;
                  } else if (alloc.source === 'beneficencia') {
                      if (e.type === 'income') charityInc += alloc.amount;
                      else charityExp += alloc.amount;
                  } else if (alloc.source === 'cuotas') {
                      if (e.type === 'income') quotasInc += alloc.amount;
                      else quotasExp += alloc.amount;
                  }
              });
          });

          setTreasuryBalance({
              general: generalInc - generalExp,
              charity: charityInc - charityExp,
              quotas: totalQuotasFromUsers + quotasInc - quotasExp 
          });

      } catch (e) {
          console.error(e);
          showMessage("Error cargando Tesorería.", 'error');
      }
  };
  
  const loadAttendanceHistory = async () => {
      const dates = new Set<string>();
      for(const u of users) {
          const att = await dataService.getAttendance(u.uid);
          att.forEach(a => dates.add(a.date));
      }
      setAttHistory(Array.from(dates).sort().reverse());
  };

  const loadNotices = async () => {
      try {
          const data = await dataService.getNotices(user.groupId);
          setNotices(data);
      } catch (e) {
          console.error("Error cargando avisos", e);
          showMessage("Error cargando avisos", 'error');
      }
  };

  const loadTrivias = async () => {
      try {
          const data = await dataService.getAllTrivias(user.groupId);
          setAllTrivias(data);
      } catch (e) {
          console.error("Error cargando trivias", e);
          showMessage("Error cargando trivias", 'error');
      }
  };

  const loadVisits = async () => {
      try {
          const data = await dataService.getVisitRequestsForGroup(user.groupId);
          setVisitRequests(data);
      } catch (e) {
          console.error("Error cargando solicitudes de visita", e);
          showMessage("Error cargando solicitudes de visita", 'error');
      }
  };

  const loadAllGroups = async () => {
      try {
          const data = await dataService.getAllGroups();
          setAllGroups(data);
      } catch (e) {
          console.error("Error cargando logias", e);
      }
  };

  const loadBankBalances = async () => {
      try {
          const data = await dataService.getBankBalances(user.groupId);
          setBankBalances(data);
      } catch (e) {
          console.error("Error cargando balances bancarios", e);
      }
  };

  const handleBankFormSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
          const balance: Omit<BankBalance, 'id'> = {
              groupId: user.groupId,
              type: bankFormData.type,
              name: bankFormData.name,
              amount: Number(bankFormData.amount),
              lastUpdated: new Date().toISOString(),
              updatedBy: user.uid,
              ...(bankFormData.comment && { comment: bankFormData.comment })
          };

          console.log('Guardando balance:', balance); // Debug log

          if (editingBankId) {
              await dataService.updateBankBalance(editingBankId, balance);
              showMessage("Balance actualizado", "success");
          } else {
              await dataService.createBankBalance(balance);
              showMessage("Balance agregado", "success");
          }

          resetBankForm();
          await loadBankBalances();
          await loadDashboardStats(); // Refresh dashboard to show new total
      } catch (e) {
          console.error("Error guardando balance", e);
          showMessage("Error guardando balance", "error");
      }
  };

  const handleEditBank = (balance: BankBalance) => {
      setEditingBankId(balance.id);
      setBankFormData({
          type: balance.type,
          name: balance.name,
          amount: balance.amount,
          comment: balance.comment || ''
      });
      setShowBankForm(true);
  };

  const handleDeleteBank = async (id: string) => {
      if (!confirm('¿Eliminar este registro bancario?')) return;
      try {
          await dataService.deleteBankBalance(id);
          showMessage("Registro eliminado", "success");
          await loadBankBalances();
          await loadDashboardStats(); // Refresh dashboard
      } catch (e) {
          console.error("Error eliminando balance", e);
          showMessage("Error eliminando balance", "error");
      }
  };

  const resetBankForm = () => {
      setShowBankForm(false);
      setEditingBankId(null);
      setBankFormData({
          type: 'bank',
          name: '',
          amount: 0,
          comment: ''
      });
  };

  const getTotalBankBalance = () => {
      return bankBalances.reduce((acc, b) => acc + b.amount, 0);
  };

  // EXTRA FEES HANDLERS
  const loadExtraFees = async () => {
      try {
          const data = await dataService.getExtraFees(user.groupId);
          setExtraFees(data);
      } catch (e) {
          console.error("Error cargando cuotas extraordinarias", e);
      }
  };

  const handleSaveExtraFee = async () => {
      if (isReadOnly || !extraFeePeriod || extraFeeAmount === 0 || extraFeeAmount === undefined || extraFeeAmount === null) {
          showMessage("Completa período y monto válido (puede ser negativo para descuentos)", 'error');
          return;
      }

      if (extraFeeType === 'individual' && !selectedUserForFee) {
          showMessage("Selecciona un usuario", 'error');
          return;
      }

      try {
          setApplyingExtra(true);
          
          if (extraFeeType === 'mass') {
              await dataService.assignExtraFeeToAllNew(
                  user.groupId!,
                  extraFeePeriod,
                  extraFeeAmount,
                  extraFeeDesc,
                  user.uid,
                  user.name
              );
              showMessage("Cuota extraordinaria masiva aplicada");
          } else {
              const targetUser = users.find(u => u.uid === selectedUserForFee);
              if (!targetUser) {
                  showMessage("Usuario no encontrado", 'error');
                  return;
              }
              await dataService.assignExtraFeeToUser(
                  user.groupId!,
                  targetUser.uid,
                  targetUser.name,
                  extraFeePeriod,
                  extraFeeAmount,
                  extraFeeDesc,
                  user.uid,
                  user.name
              );
              showMessage(`Cuota aplicada a ${targetUser.name}`);
          }
          
          setExtraFeePeriod('');
          setExtraFeeAmount(0);
          setExtraFeeDesc('');
          setSelectedUserForFee('');
          await loadUsers();
          await loadExtraFees();
      } catch (e) {
          console.error(e);
          showMessage("Error aplicando cuota extraordinaria", 'error');
      } finally {
          setApplyingExtra(false);
      }
  };

  const handleDeleteExtraFee = (extraFee: ExtraFee) => {
      setDeletingExtraFeeId(extraFee.id);
      setShowDeleteExtraFeeModal(true);
  };

  const executeDeleteExtraFee = async () => {
      if (!deletingExtraFeeId) return;
      const extraFee = extraFees.find(f => f.id === deletingExtraFeeId);
      if (!extraFee) return;

      try {
          await dataService.deleteExtraFee(
              extraFee.id,
              extraFee.appliedToUsers,
              extraFee.period,
              extraFee.amount
          );
          showMessage("Cuota extraordinaria eliminada y revertida", "success");
          setShowDeleteExtraFeeModal(false);
          setDeletingExtraFeeId(null);
          await loadUsers();
          await loadExtraFees();
      } catch (e) {
          console.error("Error eliminando cuota", e);
          showMessage("Error eliminando cuota", "error");
      }
  };

  const handleEditExtraFee = (extraFee: ExtraFee) => {
      setEditingExtraFeeId(extraFee.id);
      setEditExtraFeeData({
          description: extraFee.description,
          amount: extraFee.amount
      });
      setShowEditExtraFeeModal(true);
  };

  const executeEditExtraFee = async () => {
      if (!editingExtraFeeId) return;
      const extraFee = extraFees.find(f => f.id === editingExtraFeeId);
      if (!extraFee) return;

      try {
          await dataService.updateExtraFee(
              extraFee.id,
              editExtraFeeData,
              extraFee.amount,
              extraFee.appliedToUsers,
              extraFee.period
          );
          showMessage("Cuota extraordinaria actualizada", "success");
          setShowEditExtraFeeModal(false);
          setEditingExtraFeeId(null);
          await loadUsers();
          await loadExtraFees();
      } catch (e) {
          console.error("Error actualizando cuota", e);
          showMessage("Error actualizando cuota", "error");
      }
  };
  
  // ... (Other functions remain the same) ...
  const handleViewAttDetail = async (date: string) => {
      setViewingAttDate(date);
      setAttDetailList([]);
      try {
          const list = await dataService.getAttendanceListForDate(user.groupId, date);
          setAttDetailList(list);
      } catch (e) {
          showMessage("Error cargando detalle", "error");
      }
  };

  const getFilteredUsers = () => {
      return users.filter(u => {
          if (filterStatus === 'active' && !u.active) return false;
          if (filterStatus === 'inactive' && u.active) return false;
          // Note: Pending users are active=false, so 'inactive' filter captures them in Users tab if needed, 
          // but Requests tab is better.
          if (filterRole !== 'all' && u.role !== filterRole) return false;
          return true;
      });
  };

  const filteredUsers = getFilteredUsers();
  const grandTotalDebt = filteredUsers.reduce((sum, u) => sum + Number(userStats[u.uid]?.totalDebt || 0), 0);
  
  // ... (Keep existing helpers: loadPriceHistory, showMessage, handleToggleActive, etc.)
  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
      setMsg(text);
      setMsgType(type);
      setTimeout(() => setMsg(''), 4000);
  };

  const handleToggleActive = async (uid: string, current: boolean) => {
    if (isReadOnly) return;
    
    // Find the user to check if they need groupId assignment
    const targetUser = users.find(u => u.uid === uid);
    
    // If activating a user without groupId, assign them to this group
    if (!current && targetUser && !targetUser.groupId) {
      await dataService.assignUserToGroup(uid, user.groupId);
      console.log("Assigned user to groupId:", user.groupId);
    }
    
    await dataService.updateUserStatus(uid, !current);
    loadUsers();
    showMessage(current ? 'Usuario desactivado' : 'Usuario aceptado y activado');
  };
  
  const handleChangeRole = async (uid: string, newRole: Role) => {
      if (isReadOnly) return;
      if (uid === user.uid) {
          showMessage("No puedes cambiar tu propio rol.", 'error');
          return;
      }
      try {
          await dataService.updateUser(uid, { role: newRole });
          loadUsers();
          showMessage(`Rol actualizado a ${newRole}`);
      } catch (e) {
          showMessage("Error actualizando rol", 'error');
      }
  };

  const handleDownloadCSV = () => {
      try {
          // Headers
          const headers = "Nombre,Email,Rol,Estado,Ciudad,Grado,Fecha Ingreso,Total Pagado,Total Deuda,Total Facturado\n";
          
          // Data rows
          const rows = filteredUsers.map(u => {
              const stats = userStats[u.uid] || { totalPaid: 0, totalDebt: 0, totalBilled: 0 };
              return `"${u.name}","${u.email}","${u.role}","${u.active ? 'Activo' : 'Inactivo'}","${u.city || 'N/A'}","${u.masonicDegree || 'N/A'}","${u.joinDate?.slice(0,10) || 'N/A'}",${stats.totalPaid},${stats.totalDebt},${stats.totalBilled}`;
          }).join('\n');
          
          const csv = headers + rows;
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `miembros_${user.groupId}_${new Date().toISOString().slice(0,10)}.csv`;
          a.click();
          URL.revokeObjectURL(url);
          showMessage("CSV descargado exitosamente", 'success');
      } catch (e) {
          console.error(e);
          showMessage("Error descargando CSV", 'error');
      }
  };
  
  const handleSendEmail = (u: User) => { /* ... */ };
  const handleAddAllocation = () => {
      if (allocAmount <= 0) return;
      setAllocations([...allocations, { source: allocSource, amount: allocAmount }]);
      setAllocAmount(0);
  };
  const handleRemoveAllocation = (idx: number) => {
      const n = [...allocations];
      n.splice(idx, 1);
      setAllocations(n);
  };
  const handleSaveTransaction = async () => {
      if (isReadOnly || !newTransAmount || !newTransDesc) {
          showMessage("Completa todos los campos", 'error');
          return;
      }
      try {
          setIsSubmitting(true);
          const entry: Omit<TreasuryEntry, 'id' | 'createdAt'> = {
              groupId: user.groupId!,
              date: newTransDate,
              type: newTransType as 'income' | 'expense',
              category: newTransCat,
              description: newTransDesc,
              amount: newTransAmount,
              allocations: allocations.length > 0 ? allocations : [{ source: 'tesoro_general', amount: newTransAmount }],
              createdBy: user.uid
          };
          if (editingTreasuryId) {
              await dataService.updateTreasuryEntry({ ...entry, id: editingTreasuryId } as TreasuryEntry);
              showMessage("Movimiento actualizado");
          } else {
              await dataService.addTreasuryEntry(entry);
              showMessage("Movimiento registrado");
          }
          setEditingTreasuryId(null);
          setNewTransAmount(0);
          setNewTransDesc('');
          setNewTransType('income');
          setNewTransCat('evento');
          setAllocations([]);
          await loadTreasury();
      } catch (e) {
          console.error(e);
          showMessage("Error guardando movimiento", 'error');
      } finally {
          setIsSubmitting(false);
      }
  };
  const handleDeleteTransaction = (id: string, e: React.MouseEvent) => {
      e.stopPropagation(); e.preventDefault(); 
      if (isReadOnly) return;
      setDeletingTreasuryId(id);
      setShowDeleteTreasuryModal(true);
  };
  const handleExecuteDeleteTreasury = async () => {
      if (!deletingTreasuryId) return;
      try {
          await dataService.deleteTreasuryEntry(user.groupId!, deletingTreasuryId);
          showMessage("Movimiento eliminado");
          setShowDeleteTreasuryModal(false);
          setDeletingTreasuryId(null);
          await loadTreasury();
      } catch (e) {
          console.error(e);
          showMessage("Error eliminando movimiento", 'error');
      }
  };
  const handleEditTransaction = (t: TreasuryEntry, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (isReadOnly) return;
      setEditingTreasuryId(t.id);
      setNewTransDate(t.date);
      setNewTransType(t.type as 'income' | 'expense');
      setNewTransCat(t.category);
      setNewTransDesc(t.description);
      setNewTransAmount(t.amount);
      setAllocations(t.allocations || []);
  };
  const handleDownloadTreasuryCSV = async () => {
      try {
          const entries = await dataService.getTreasuryEntries(user.groupId!);
          const quotas = await dataService.getDetailedQuotaTransactions(user.groupId!);
          const combined = [...entries, ...quotas].sort((a, b) => b.date.localeCompare(a.date));
          
          // Build CSV with multiple rows per entry if it has multiple allocations
          const csvRows: string[] = ["Fecha,Tipo,Categoría,Descripción,Monto,Origen/Destino Fondos,Monto Asignado"];
          
          combined.forEach(e => {
              const baseInfo = `${e.date},"${e.type}","${e.category}","${e.description}",${e.amount}`;
              
              // Check if entry has allocations
              if (e.allocations && e.allocations.length > 0) {
                  // Create one row per allocation
                  e.allocations.forEach(alloc => {
                      csvRows.push(`${baseInfo},"${alloc.source}",${alloc.amount}`);
                  });
              } else {
                  // No allocations, just add a single row with empty allocation columns
                  csvRows.push(`${baseInfo},"N/A",0`);
              }
          });
          
          const csv = csvRows.join('\n');
          
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `tesoreria_${user.groupId}_${new Date().toISOString().slice(0,10)}.csv`;
          a.click();
          URL.revokeObjectURL(url);
      } catch (e) {
          console.error(e);
          showMessage("Error descargando CSV", 'error');
      }
  };
  const handleAddPriceChange = async () => {
      if (isReadOnly || !newPricePeriod || newPriceAmount <= 0) {
          showMessage("Completa período y monto válido", 'error');
          return;
      }
      try {
          setIsSubmitting(true);
          const entry: PriceHistoryEntry = { startDate: newPricePeriod, amount: newPriceAmount };
          await dataService.addPriceChange(user.groupId!, entry);
          showMessage("Precio de cuota actualizado");
          setNewPricePeriod('');
          setNewPriceAmount(0);
          await loadPriceHistory();
      } catch (e) {
          console.error(e);
          showMessage("Error guardando precio", 'error');
      } finally {
          setIsSubmitting(false);
      }
  };
  const handleOpenEditPrice = (h: PriceHistoryEntry) => {
      setEditPriceData(h);
      setOriginalEditDate(h.startDate);
      setShowEditPriceModal(true);
  };
  const handleUpdatePrice = async () => {
      if (isReadOnly || !editPriceData.startDate || editPriceData.amount <= 0) {
          showMessage("Datos inválidos", 'error');
          return;
      }
      try {
          setIsSubmitting(true);
          await dataService.updatePriceChange(user.groupId!, originalEditDate, editPriceData);
          showMessage("Precio actualizado");
          setShowEditPriceModal(false);
          await loadPriceHistory();
      } catch (e) {
          console.error(e);
          showMessage("Error actualizando precio", 'error');
      } finally {
          setIsSubmitting(false);
      }
  };
  const handleConfirmDeletePrice = (date: string) => {
      setDeletingPriceDate(date);
      setShowDeletePriceModal(true);
  };
  const handleExecuteDeletePrice = async () => {
      if (!deletingPriceDate) return;
      try {
          setIsSubmitting(true);
          await dataService.removePriceChange(user.groupId!, deletingPriceDate);
          showMessage("Precio eliminado");
          setShowDeletePriceModal(false);
          setDeletingPriceDate(null);
          await loadPriceHistory();
      } catch (e) {
          console.error(e);
          showMessage("Error eliminando precio", 'error');
      } finally {
          setIsSubmitting(false);
      }
  };
  const handleSyncDebts = async () => {
      if (isReadOnly || priceHistory.length === 0) {
          showMessage("No hay precios configurados", 'error');
          return;
      }
      try {
          setSyncing(true);
          let totalOps = 0;
          for (const u of filteredUsers) {
              // Ensure user has the correct groupId for this lodge
              const userWithGroup = { ...u, groupId: user.groupId };
              const ops = await dataService.syncUserDebts(userWithGroup, priceHistory);
              totalOps += ops;
          }
          showMessage(`Sincronización completada: ${totalOps} registros generados`);
          await loadUsers();
      } catch (e) {
          console.error(e);
          showMessage("Error sincronizando deudas", 'error');
      } finally {
          setSyncing(false);
      }
  };
  const handleUpdateUserProfile = async () => {
      if (!editingUserProfile) return;
      try {
          await dataService.updateUser(editingUserProfile.uid, {
              name: editingUserProfile.name,
              email: editingUserProfile.email,
              role: editingUserProfile.role,
              degree: editingUserProfile.degree,
              numericDegree: editingUserProfile.numericDegree,
              lodgeRole: editingUserProfile.lodgeRole,
              masonicJoinDate: editingUserProfile.masonicJoinDate,
              masonicRejoinDate: editingUserProfile.masonicRejoinDate
          });
          showMessage("Perfil actualizado");
          setEditingUserProfile(null);
          await loadUsers();
      } catch (e) {
          console.error(e);
          showMessage("Error actualizando perfil", 'error');
      }
  };
  const handleOpenPayments = async (uid: string) => {
      const payments = await dataService.getPayments(uid);
      setEditPayments(payments);
      setEditingUserLedger(uid);
  };
  const handleSavePaymentRow = async (p: Payment) => {
      if (isReadOnly || !editingUserLedger) return;
      try {
          await dataService.updatePayment(editingUserLedger, p);
          showMessage("Pago guardado");
          const payments = await dataService.getPayments(editingUserLedger);
          setEditPayments(payments);
          await loadUsers();
      } catch (e) {
          console.error(e);
          showMessage("Error guardando pago", 'error');
      }
  };
  const handleDeletePaymentRow = async (period: string) => {
      if (isReadOnly || !editingUserLedger) return;
      try {
          await dataService.deletePayment(editingUserLedger, period);
          showMessage("Pago eliminado");
          const payments = await dataService.getPayments(editingUserLedger);
          setEditPayments(payments);
          await loadUsers();
      } catch (e) {
          console.error(e);
          showMessage("Error eliminando pago", 'error');
      }
  };
  const handleDownloadAttendanceCSV = async () => {
      try {
          showMessage("Generando CSV histórico de asistencia...", 'success');
          const csv = await dataService.generateDetailedAttendanceCSV(user.groupId!, users);
          
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `asistencia_historica_${user.groupId}_${new Date().toISOString().slice(0,10)}.csv`;
          a.click();
          URL.revokeObjectURL(url);
          showMessage("CSV descargado exitosamente", 'success');
      } catch (e) {
          console.error(e);
          showMessage("Error descargando CSV", 'error');
      }
  };
  const handleRecordAttendance = async () => {
      if (isReadOnly || attSelected.size === 0) {
          showMessage("Selecciona al menos un usuario", 'error');
          return;
      }
      try {
          const date = attDate;
          const uidsPresent = Array.from(attSelected);
          await dataService.recordAttendance(date, uidsPresent);
          showMessage("Asistencia registrada");
          setAttSelected(new Set());
          setAttDate(new Date().toISOString().split('T')[0]);
          await loadAttendanceHistory();
          await loadUsers();
      } catch (e) {
          console.error(e);
          showMessage("Error registrando asistencia", 'error');
      }
  };

  const handleEditAttendance = async (date: string) => {
      setEditingAttDate(date);
      try {
          const list = await dataService.getAttendanceListForDate(user.groupId, date);
          const presentUids = list.filter(item => item.attended).map(item => item.uid);
          setEditAttSelected(new Set(presentUids));
          setAttDetailList(list);
      } catch (e) {
          showMessage("Error cargando asistencia", 'error');
      }
  };

  const handleSaveEditedAttendance = async () => {
      if (isReadOnly || !editingAttDate) return;
      try {
          const uidsPresent = Array.from(editAttSelected);
          await dataService.recordAttendance(editingAttDate, uidsPresent);
          showMessage("Asistencia actualizada");
          setEditingAttDate(null);
          setEditAttSelected(new Set());
          await loadAttendanceHistory();
          await loadUsers();
          if (viewingAttDate) {
              await handleViewAttDetail(viewingAttDate);
          }
      } catch (e) {
          console.error(e);
          showMessage("Error actualizando asistencia", 'error');
      }
  };

  const handleDeleteAttendance = (date: string) => {
      setDeletingAttDate(date);
      setShowDeleteAttModal(true);
  };

  const executeDeleteAttendance = async () => {
      if (isReadOnly || !deletingAttDate) return;
      try {
          // Eliminar de TODOS los usuarios, no solo los actuales
          await dataService.deleteAttendanceForAllUsers(user.groupId, deletingAttDate);
          showMessage("Asistencia eliminada");
          setShowDeleteAttModal(false);
          setDeletingAttDate(null);
          setViewingAttDate(null);
          await loadAttendanceHistory();
          await loadUsers();
      } catch (e) {
          console.error(e);
          showMessage("Error eliminando asistencia", 'error');
      }
  };

  // NOTICES HANDLERS
  const handleSaveNotice = async () => {
      if (isReadOnly || !newNoticeTitle || !newNoticeContent) {
          showMessage("Completa título y contenido", 'error');
          return;
      }
      try {
          setIsSubmitting(true);
          if (editingNotice) {
              await dataService.updateNotice(user.groupId, editingNotice.id, {
                  title: newNoticeTitle,
                  content: newNoticeContent,
                  date: new Date().toISOString().split('T')[0]
              });
              showMessage("Aviso actualizado");
          } else {
              await dataService.createNotice({
                  groupId: user.groupId,
                  title: newNoticeTitle,
                  content: newNoticeContent,
                  date: new Date().toISOString().split('T')[0]
              });
              showMessage("Aviso creado");
          }
          setNewNoticeTitle('');
          setNewNoticeContent('');
          setEditingNotice(null);
          await loadNotices();
      } catch (e) {
          console.error(e);
          showMessage("Error guardando aviso", 'error');
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleEditNotice = (notice: Notice) => {
      setEditingNotice(notice);
      setNewNoticeTitle(notice.title);
      setNewNoticeContent(notice.content);
  };

  const handleDeleteNotice = (id: string) => {
      setDeletingNoticeId(id);
      setShowDeleteNoticeModal(true);
  };

  const handleExecuteDeleteNotice = async () => {
      if (!deletingNoticeId) return;
      try {
          await dataService.deleteNotice(user.groupId, deletingNoticeId);
          showMessage("Aviso eliminado");
          setShowDeleteNoticeModal(false);
          setDeletingNoticeId(null);
          await loadNotices();
      } catch (e) {
          console.error(e);
          showMessage("Error eliminando aviso", 'error');
      }
  };

  const handleCancelEditNotice = () => {
      setEditingNotice(null);
      setNewNoticeTitle('');
      setNewNoticeContent('');
  };

  // TRIVIA HANDLERS
  const handleDeleteTrivia = (triviaId: string) => {
      setDeletingTriviaId(triviaId);
      setShowDeleteTriviaModal(true);
  };

  const handleExecuteDeleteTrivia = async () => {
      if (!deletingTriviaId) return;
      try {
          await dataService.deleteTrivia(deletingTriviaId);
          showMessage("Trivia eliminada");
          setShowDeleteTriviaModal(false);
          setDeletingTriviaId(null);
          await loadTrivias();
      } catch (e) {
          console.error(e);
          showMessage("Error eliminando trivia", 'error');
      }
  };

  const handleResetAllAnswers = async () => {
      if (!confirm('¿Estás seguro de resetear TODAS las respuestas de trivia para todos los usuarios? Esta acción no se puede deshacer.')) {
          return;
      }
      try {
          await dataService.resetAllTriviaAnswers(user.groupId);
          showMessage("Respuestas de trivia reseteadas para todos los usuarios");
      } catch (e) {
          console.error(e);
          showMessage("Error reseteando respuestas", 'error');
      }
  };

  const handleRejectUser = async (uid: string) => {
      if (!confirm('¿Estás seguro de rechazar esta solicitud? El usuario será eliminado del sistema.')) {
          return;
      }
      try {
          // Delete user document from Firestore
          await deleteDoc(doc(db, "users", uid));
          showMessage("Solicitud rechazada y usuario eliminado");
          await loadUsers();
      } catch (e) {
          console.error(e);
          showMessage("Error rechazando solicitud", 'error');
      }
  };

  // VISIT REQUESTS HANDLERS
  const handleCreateVisitRequest = async () => {
      if (isReadOnly || !newVisitToGroupId || !newVisitDate || newVisitCount < 1 || !newVisitMessage) {
          showMessage("Completa todos los campos", 'error');
          return;
      }
      
      if (!user.groupId) {
          showMessage("Error: No tienes una logia asignada", 'error');
          return;
      }
      
      try {
          const currentGroup = await dataService.getGroupDetails(user.groupId);
          const targetGroup = allGroups.find(g => g.id === newVisitToGroupId);
          
          if (!currentGroup) {
              showMessage("Error: No se pudo obtener info de tu logia", 'error');
              console.error("Current group not found:", user.groupId);
              return;
          }
          
          if (!targetGroup) {
              showMessage("Error: Logia destino no encontrada", 'error');
              console.error("Target group not found:", newVisitToGroupId);
              return;
          }

          await dataService.createVisitRequest({
              fromGroupId: user.groupId,
              fromGroupName: currentGroup.name,
              toGroupId: newVisitToGroupId,
              toGroupName: targetGroup.name,
              requestedBy: user.uid,
              requestedByName: user.name,
              visitDate: newVisitDate,
              numberOfVisitors: newVisitCount,
              message: newVisitMessage,
              status: 'pending'
          });

          showMessage("Solicitud de visita enviada");
          setNewVisitToGroupId('');
          setNewVisitDate('');
          setNewVisitCount(1);
          setNewVisitMessage('');
          await loadVisits();
      } catch (e) {
          console.error("Error creating visit request:", e);
          const errorMsg = (e as any)?.message || "Error creando solicitud";
          showMessage(errorMsg, 'error');
      }
  };

  const handleUpdateVisitStatus = async (requestId: string, status: 'accepted' | 'rejected' | 'completed') => {
      if (isReadOnly) return;
      try {
          await dataService.updateVisitRequestStatus(requestId, status);
          showMessage(`Solicitud ${status === 'accepted' ? 'aceptada' : status === 'rejected' ? 'rechazada' : 'completada'}`);
          await loadVisits();
          if (viewingVisitRequest && viewingVisitRequest.id === requestId) {
              setViewingVisitRequest(null);
          }
      } catch (e) {
          console.error(e);
          showMessage("Error actualizando estado", 'error');
      }
  };

  const handleSendVisitMessage = async () => {
      if (!viewingVisitRequest || !newChatMessage.trim()) return;
      try {
          await dataService.addMessageToVisitRequest(viewingVisitRequest.id, {
              senderId: user.uid,
              senderName: user.name,
              text: newChatMessage
          });
          setNewChatMessage('');
          // Reload the specific request
          const updated = await dataService.getVisitRequestsForGroup(user.groupId);
          const updatedRequest = updated.find(r => r.id === viewingVisitRequest.id);
          if (updatedRequest) {
              setViewingVisitRequest(updatedRequest);
          }
          await loadVisits();
      } catch (e) {
          console.error(e);
          showMessage("Error enviando mensaje", 'error');
      }
  };

  const handleDeleteVisit = (requestId: string) => {
      setDeletingVisitId(requestId);
      setShowDeleteVisitModal(true);
  };

  const handleExecuteDeleteVisit = async () => {
      if (!deletingVisitId) return;
      try {
          await dataService.deleteVisitRequest(deletingVisitId);
          showMessage("Solicitud eliminada");
          setShowDeleteVisitModal(false);
          setDeletingVisitId(null);
          setViewingVisitRequest(null);
          await loadVisits();
      } catch (e) {
          console.error(e);
          showMessage("Error eliminando solicitud", 'error');
      }
  };

  const handleCreateUser = async () => {
      if (!newUserName.trim()) {
          showMessage("El nombre es requerido", 'error');
          return;
      }
      
      // Generate temporary email if not provided
      const email = newUserEmail.trim() || `temp_${Date.now()}@pending.com`;
      
      setCreatingUser(true);
      try {
          await authService.createUserByAdmin(
              email,
              newUserName.trim(),
              newUserRole,
              newUserDegree.trim(),
              user.groupId || ''
          );
          const hasRealEmail = newUserEmail.trim() && !newUserEmail.includes('temp_');
          if (hasRealEmail) {
              showMessage("✅ Usuario creado. Cuando se registre con este correo, se vincularán automáticamente sus datos.");
          } else {
              showMessage("✅ Usuario creado con email temporal. Sus datos se vincularán cuando se registre con su correo real.");
          }
          setNewUserName('');
          setNewUserEmail('');
          setNewUserRole('member');
          setNewUserDegree('aprendiz');
          await loadUsers();
      } catch (e: any) {
          console.error(e);
          showMessage(e.message || "Error creando usuario", 'error');
      } finally {
          setCreatingUser(false);
      }
  };

  const handleToggleMatrixPayment = async (uid: string, period: string) => {
      if (isReadOnly) return;
      
      try {
          // Get current payment for this period from ledger
          const paymentsSnap = await getDocs(collection(db, "users", uid, "ledger"));
          let payment: Payment | null = null;
          
          paymentsSnap.forEach(doc => {
              if (doc.id === period) {
                  payment = doc.data() as Payment;
              }
          });
          
          if (!payment) {
              showMessage("No hay cuota registrada para este período", 'error');
              return;
          }
          
          const newCoveredStatus = !payment.regularCovered;
          const newPaidRegular = newCoveredStatus ? payment.amount : 0;
          
          const updatedPayment: Payment = {
              ...payment,
              paidRegular: newPaidRegular,
              regularCovered: newCoveredStatus,
              // Update legacy 'paid' field for backward compatibility
              paid: newPaidRegular + (payment.paidExtra || 0)
          };
          
          await dataService.updatePayment(uid, updatedPayment);
          
          showMessage(newCoveredStatus ? "✅ Marcado como pagado" : "⏳ Marcado como pendiente");
          await loadAllLedgers(); // Reload ledgers to update matrix
          await loadUsers(); // Reload stats
      } catch (e) {
          console.error(e);
          showMessage("Error actualizando pago", 'error');
      }
  };

  // Dashboard Chart Calculation
  const dbInc = Number(dashboardData.income) || 0;
  const dbExp = Number(dashboardData.expense) || 0;
  const maxVal = Math.max(dbInc, dbExp, 1);
  const heightInc = dbInc > 0 ? (dbInc / maxVal) * 100 : 0;
  const heightExp = dbExp > 0 ? (dbExp / maxVal) * 100 : 0;
  const balance = dbInc - dbExp;
  
  const activeUsers = users.filter(u => u.active).length;

  return (
    <div className="pb-24">
      {/* HEADER */}
      <div className="bg-logia-800 p-4 border-b border-logia-700 flex justify-between items-center sticky top-0 z-10 shadow-md">
        <div className="flex items-center gap-2">
            <h2 className="text-xl md:text-2xl font-bold text-white">Admin</h2>
            <button onClick={() => setShowRules(true)} className="ml-2 bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-xs font-bold text-gray-200 border border-gray-600 flex items-center gap-1">
                🛡️ Reglas
            </button>
            <button onClick={refreshAllData} className="bg-logia-700 hover:bg-logia-600 p-2 rounded text-white text-sm" title="Refrescar Datos">
                🔄
            </button>
        </div>
        <div className="flex flex-col items-end">
             {/* Pending Badge */}
            <div className="text-xl md:text-3xl font-mono text-white font-bold tracking-widest leading-none">
                {mxTime || "--:--:--"}
            </div>
            <div className="text-[8px] md:text-[10px] text-gray-400 uppercase tracking-widest">Hora CDMX</div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex overflow-x-auto p-2 gap-2 bg-logia-900 border-b border-logia-700 no-scrollbar">
        <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${
              activeTab === 'dashboard' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-400 hover:bg-logia-700'
            }`}
        >
            Resumen
        </button>

        <button
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors relative ${
              activeTab === 'requests' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-400 hover:bg-logia-700'
            }`}
        >
            Solicitudes
            {pendingUsers.length > 0 && (
                <span className="ml-2 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full animate-pulse border border-red-400">
                    {pendingUsers.length}
                </span>
            )}
        </button>

        {[
            {id: 'users', label: 'Miembros'},
            {id: 'fees', label: 'Cuotas'},
            {id: 'attendance', label: 'Asistencia'},
            {id: 'trivia', label: 'Trivia'},
            {id: 'notices', label: 'Avisos'},
            {id: 'treasury', label: 'Tesorería'},
            {id: 'banks', label: 'Bancos'},
            {id: 'visits', label: 'Visitas'},
            {id: 'payment-matrix', label: 'Matriz de Pagos'},
            {id: 'create-user', label: 'Crear Usuario'}
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as Tab)}
            className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${
              activeTab === t.id ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-400 hover:bg-logia-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* NOTIFICATIONS */}
      {msg && (
        <div className={`fixed top-4 right-4 p-4 rounded shadow-2xl z-50 border animate-bounce
          ${msgType === 'success' ? 'bg-green-900/90 border-green-500 text-green-200' : 'bg-red-900/90 border-red-500 text-red-200'}`}>
          {msg}
        </div>
      )}

      <div className="p-4">
        
        {/* --- DASHBOARD TAB --- */}
        {activeTab === 'dashboard' && (
            <div className="space-y-6">
                 {/* Pending Users Card */}
                 {pendingUsers.length > 0 && (
                    <div className="bg-red-900/20 border border-red-500 rounded-xl p-4 flex justify-between items-center animate-pulse">
                        <div>
                            <h3 className="text-red-400 font-bold text-lg">⚠️ Solicitudes Pendientes</h3>
                            <p className="text-gray-400 text-sm">Hay {pendingUsers.length} persona(s) solicitando ingresar a esta Logia.</p>
                        </div>
                        <button 
                            onClick={() => { setActiveTab('requests'); }}
                            className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded shadow-lg"
                        >
                            Ver Solicitudes
                        </button>
                    </div>
                )}

                <h3 className="text-lg font-bold text-white">Resumen General</h3>
                
                {/* Simplified Dashboard - v3.0.0: Removed chart, only numeric cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-logia-800 p-4 rounded-xl border border-logia-700 text-center">
                        <p className="text-xs text-gray-400 uppercase">Miembros Activos</p>
                        <p className="text-2xl font-bold text-white">{activeUsers}</p>
                    </div>
                    <div className="bg-logia-800 p-4 rounded-xl border border-logia-700 text-center">
                         <p className="text-xs text-gray-400 uppercase">Balance Global (Histórico)</p>
                         <p className="text-2xl font-bold text-blue-400">
                             ${(treasuryBalance.general + treasuryBalance.charity + treasuryBalance.quotas).toLocaleString()}
                         </p>
                    </div>
                    <div className="bg-gradient-to-br from-green-900/40 to-green-800/30 p-4 rounded-xl border border-green-500/50 text-center shadow-lg">
                         <p className="text-xs text-green-300 uppercase">💰 Bancos + Efectivo</p>
                         <p className="text-2xl font-bold text-white">
                             ${getTotalBankBalance().toLocaleString()}
                         </p>
                    </div>
                    <div className="bg-logia-800 p-4 rounded-xl border border-logia-700 text-center">
                         <p className="text-xs text-gray-400 uppercase">Deuda Total (Histórica)</p>
                         <p className="text-2xl font-bold text-red-400">
                             ${grandTotalDebt.toLocaleString()}
                         </p>
                    </div>
                </div>
            </div>
        )}

        {/* --- REQUESTS TAB (SOLICITUDES) --- */}
        {activeTab === 'requests' && (
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white">Solicitudes de Ingreso</h3>
                    <button onClick={loadUsers} className="text-xs text-indigo-400 underline">Actualizar Lista</button>
                </div>
                
                {pendingUsers.length === 0 ? (
                    <div className="bg-logia-800 p-8 rounded-xl border border-dashed border-gray-600 text-center">
                        <p className="text-gray-400 text-lg">✨ No hay solicitudes pendientes.</p>
                        <p className="text-gray-600 text-sm mt-2">Los nuevos usuarios que se registren en esta logia aparecerán aquí.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {pendingUsers.map(u => (
                            <div key={u.uid} className="bg-logia-800 border-l-4 border-l-yellow-500 rounded-xl p-6 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
                                <div className="flex-1">
                                    <h4 className="text-xl font-bold text-white">{u.name}</h4>
                                    <p className="text-gray-400 text-sm">{u.email}</p>
                                    <p className="text-xs text-gray-500 mt-2">Registrado: {new Date(u.joinDate).toLocaleDateString()}</p>
                                    {!u.groupId && (
                                        <p className="text-xs text-orange-400 mt-1 font-semibold">⚠️ Sin logia asignada - se asignará al aceptar</p>
                                    )}
                                </div>
                                <div className="flex gap-3">
                                    <button 
                                        onClick={() => handleToggleActive(u.uid, u.active)}
                                        className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-6 rounded shadow-lg transform active:scale-95 transition-all"
                                    >
                                        ✅ Dar Entrada
                                    </button>
                                    <button 
                                        onClick={() => handleRejectUser(u.uid)}
                                        disabled={isReadOnly}
                                        className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded shadow-lg transform active:scale-95 transition-all disabled:opacity-50"
                                    >
                                        ❌ Rechazar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

        {/* --- USERS TAB (MIEMBROS ACTIVOS) --- */}
        {activeTab === 'users' && (
            <div className="space-y-4">
               {/* ... (Same user management UI) ... */}
               <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-white">Gestión de Miembros</h3>
                <div className="flex gap-2">
                    <button onClick={handleDownloadCSV} className="px-3 py-1 bg-green-700 rounded text-xs hover:bg-green-600">
                        📥 Exportar CSV
                    </button>
                </div>
             </div>
             {/* ... (Filters, Stats, Table) ... */}
             <div className="bg-logia-800 p-3 rounded-lg border border-logia-700 grid grid-cols-2 md:grid-cols-4 gap-3">
                 <div>
                     <label className="text-[10px] text-gray-400 uppercase">Desde (Mes)</label>
                     <input type="month" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="w-full bg-logia-900 border border-logia-700 rounded p-1 text-sm text-white" />
                 </div>
                 <div>
                     <label className="text-[10px] text-gray-400 uppercase">Hasta (Mes)</label>
                     <input type="month" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="w-full bg-logia-900 border border-logia-700 rounded p-1 text-sm text-white" />
                 </div>
                 <div>
                     <label className="text-[10px] text-gray-400 uppercase">Rol</label>
                     <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="w-full bg-logia-900 border border-logia-700 rounded p-1 text-sm text-white">
                         <option value="all">Todos</option>
                         <option value="member">Miembros</option>
                         <option value="admin">Admins</option>
                         <option value="viewer">Observadores</option>
                     </select>
                 </div>
                 <div>
                     <label className="text-[10px] text-gray-400 uppercase">Estado</label>
                     <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full bg-logia-900 border border-logia-700 rounded p-1 text-sm text-white">
                         <option value="active">Activos (Default)</option>
                         <option value="all">Todos (Inc. Pendientes)</option>
                         <option value="inactive">Inactivos</option>
                     </select>
                 </div>
             </div>
             
             <div className="overflow-x-auto bg-logia-800 rounded-xl border border-logia-700 shadow-lg">
                 <table className="w-full text-left text-sm text-gray-300 min-w-[1000px]">
                     <thead className="bg-logia-900 text-xs uppercase text-gray-500 font-bold">
                         <tr>
                             <th className="p-3">Nombre / Email</th>
                             <th className="p-3">Grado / Cargo</th>
                             <th className="p-3">Trabajo</th>
                             <th className="p-3">Rol App</th>
                             <th className="p-3 text-right">Cuota Mensual</th>
                             <th className="p-3 text-right">Cuota Extra</th>
                             <th className="p-3 text-right">Pagado Mensual</th>
                             <th className="p-3 text-right">Pagado Extra</th>
                             <th className="p-3 text-right">Deuda Total</th>
                             <th className="p-3 text-center">Acciones</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-logia-700">
                         {filteredUsers.map(u => {
                             const stats = userStats[u.uid] || { 
                                 totalPaid: 0, 
                                 totalDebt: 0, 
                                 totalBilledRegular: 0, 
                                 totalBilledExtra: 0,
                                 totalPaidRegular: 0,
                                 totalPaidExtra: 0
                             };
                             return (
                                 <tr key={u.uid} className={`hover:bg-logia-700/50 transition-colors ${!u.active ? 'bg-red-900/10 opacity-70' : ''}`}>
                                     <td className="p-3">
                                         <div className="font-bold text-white flex items-center gap-2">
                                             {u.name}
                                             {!u.active && <span className="text-[10px] bg-red-600 text-white px-1.5 rounded">PENDIENTE</span>}
                                         </div>
                                         <div className="text-xs text-gray-500">{u.email}</div>
                                     </td>
                                     <td className="p-3">
                                         <div className="text-indigo-300">{u.degree ? `${u.degree} (${u.numericDegree || '-'})` : '-'}</div>
                                         <div className="text-xs text-gray-400">{u.lodgeRole || 'Sin cargo'}</div>
                                     </td>
                                     <td className="p-3 text-xs">
                                         <div className="text-white">{u.job || '-'}</div>
                                         <div className="text-gray-500 truncate max-w-[100px]" title={u.workAddress}>{u.workAddress || ''}</div>
                                     </td>
                                     <td className="p-3">
                                         <select 
                                            value={u.role} 
                                            onChange={(e) => handleChangeRole(u.uid, e.target.value as Role)}
                                            disabled={isReadOnly || u.uid === user.uid}
                                            className="bg-logia-900 border border-logia-700 rounded p-1 text-xs outline-none"
                                         >
                                             <option value="member">Miembro</option>
                                             <option value="admin">Admin</option>
                                             <option value="viewer">Observador</option>
                                         </select>
                                     </td>
                                     <td className="p-3 text-right font-mono text-gray-300">
                                         ${stats.totalBilledRegular || 0}
                                     </td>
                                     <td className="p-3 text-right font-mono text-gray-300">
                                         ${stats.totalBilledExtra || 0}
                                     </td>
                                     <td className="p-3 text-right font-mono text-green-400">
                                         ${stats.totalPaidRegular || 0}
                                     </td>
                                     <td className="p-3 text-right font-mono text-green-400">
                                         ${stats.totalPaidExtra || 0}
                                     </td>
                                     <td className="p-3 text-right font-mono font-bold text-red-400">
                                         ${stats.totalDebt}
                                     </td>
                                     <td className="p-3 flex justify-center gap-2">
                                         {!u.active ? (
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
                                                <button onClick={() => setEditingUserProfile(u)} title="Editar Perfil" className="p-1.5 bg-blue-600 rounded hover:bg-blue-500 text-white">
                                                    ✏️
                                                </button>
                                             </>
                                         )}
                                     </td>
                                 </tr>
                             );
                         })}
                     </tbody>
                 </table>
             </div>
            </div>
        )}

        {/* --- FEES, ATTENDANCE, TRIVIA, TREASURY are largely unchanged but included implicitly --- */}
        {activeTab === 'fees' && (
             <div className="space-y-8">
                {/* 1. Price History */}
                <div className="bg-logia-800 rounded-xl p-6 border border-logia-700 shadow-lg">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                        <span className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center mr-3 text-sm">1</span>
                        Historial de Precios (Cuota Mensual)
                    </h3>
                    
                    <div className="flex gap-2 mb-4">
                        <input 
                            type="month" 
                            value={newPricePeriod}
                            onChange={e => setNewPricePeriod(e.target.value)}
                            disabled={isReadOnly || isSubmitting}
                            className="bg-logia-900 border border-logia-700 rounded p-2 text-white outline-none"
                        />
                        <input 
                            type="number" 
                            placeholder="$ Monto"
                            value={newPriceAmount}
                            onChange={e => setNewPriceAmount(Number(e.target.value))}
                            disabled={isReadOnly || isSubmitting}
                            className="bg-logia-900 border border-logia-700 rounded p-2 text-white outline-none w-32"
                        />
                        <button 
                            onClick={handleAddPriceChange}
                            disabled={isReadOnly || isSubmitting}
                            className="bg-green-600 hover:bg-green-500 text-white px-4 rounded font-bold disabled:opacity-50"
                        >
                            {isSubmitting ? '...' : '+ Agregar'}
                        </button>
                    </div>

                    <div className="space-y-2">
                        {priceHistory.map((h, idx) => (
                            <div key={h.startDate} className="flex items-center justify-between bg-logia-900 p-3 rounded border border-logia-700">
                                <div>
                                    <span className="text-indigo-400 font-mono font-bold">{h.startDate}</span>
                                    <span className="text-gray-400 text-sm mx-2">en adelante:</span>
                                    <span className="text-green-400 font-bold">${h.amount}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleOpenEditPrice(h)}
                                        disabled={isReadOnly}
                                        className="text-gray-400 hover:text-white p-2 bg-logia-800 rounded border border-logia-700"
                                        title="Editar"
                                    >
                                        ✏️
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleConfirmDeletePrice(h.startDate);
                                        }}
                                        disabled={isReadOnly}
                                        className="text-white p-2 bg-red-600 rounded border border-red-700 hover:bg-red-500 cursor-pointer z-10 w-10 h-10 flex items-center justify-center shadow-md active:scale-95"
                                        title="Eliminar"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. Sync Debts */}
                <div className="bg-logia-800 rounded-xl p-6 border border-logia-700 shadow-lg">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                        <span className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center mr-3 text-sm">2</span>
                        Sincronizar Deudas Mensuales
                    </h3>
                    <p className="text-xs text-gray-400 mb-4">Genera los registros de deuda pendientes para todos los usuarios ACTIVOS según el historial de precios.</p>
                    <button 
                        onClick={handleSyncDebts}
                        disabled={syncing || isReadOnly || priceHistory.length === 0}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-6 rounded-lg w-full md:w-auto disabled:opacity-50 flex items-center justify-center gap-2 transform active:scale-95 transition-all"
                    >
                        {syncing ? (
                           <>
                             <span className="animate-spin">⌛</span> Procesando...
                           </>
                        ) : '🔄 Sincronizar Ahora'}
                    </button>
                </div>

                {/* 3. Extra Fees */}
                <div className="bg-logia-800 rounded-xl p-6 border border-logia-700 shadow-lg border-l-4 border-l-purple-500">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-white flex items-center">
                            <span className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center mr-3 text-sm">3</span>
                            Cuotas Extraordinarias
                        </h3>
                        <button 
                            onClick={() => setShowExtraFeeHistory(!showExtraFeeHistory)}
                            className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded text-sm font-semibold"
                        >
                            {showExtraFeeHistory ? '➕ Nueva Cuota' : '📋 Ver Historial'}
                        </button>
                    </div>

                    {!showExtraFeeHistory ? (
                        <>
                            {/* Tipo de cuota */}
                            <div className="mb-4">
                                <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Tipo de Cuota</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            value="mass" 
                                            checked={extraFeeType === 'mass'}
                                            onChange={() => setExtraFeeType('mass')}
                                            disabled={isReadOnly || applyingExtra}
                                            className="text-purple-600"
                                        />
                                        <span className="text-white">Masiva (Todos los activos)</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            value="individual" 
                                            checked={extraFeeType === 'individual'}
                                            onChange={() => setExtraFeeType('individual')}
                                            disabled={isReadOnly || applyingExtra}
                                            className="text-purple-600"
                                        />
                                        <span className="text-white">Individual</span>
                                    </label>
                                </div>
                            </div>

                            {/* Selector de usuario si es individual */}
                            {extraFeeType === 'individual' && (
                                <div className="mb-3">
                                    <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Seleccionar Usuario</label>
                                    <select 
                                        value={selectedUserForFee}
                                        onChange={(e) => setSelectedUserForFee(e.target.value)}
                                        disabled={isReadOnly || applyingExtra}
                                        className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white"
                                    >
                                        <option value="">-- Selecciona un usuario --</option>
                                        {users.filter(u => u.active).map(u => (
                                            <option key={u.uid} value={u.uid}>{u.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                                <input 
                                    type="month" 
                                    value={extraFeePeriod} 
                                    onChange={e => setExtraFeePeriod(e.target.value)}
                                    disabled={isReadOnly || applyingExtra}
                                    className="bg-logia-900 border border-logia-700 rounded p-2 text-white"
                                />
                                <input 
                                    type="number" 
                                    step="any"
                                    placeholder="Monto (+ cargo, - descuento)"
                                    value={extraFeeAmount} 
                                    onChange={e => setExtraFeeAmount(Number(e.target.value))}
                                    disabled={isReadOnly || applyingExtra}
                                    className="bg-logia-900 border border-logia-700 rounded p-2 text-white"
                                />
                                <input 
                                    type="text" 
                                    placeholder="Concepto (Ej. Cena, Descuento)"
                                    value={extraFeeDesc} 
                                    onChange={e => setExtraFeeDesc(e.target.value)}
                                    disabled={isReadOnly || applyingExtra}
                                    className="bg-logia-900 border border-logia-700 rounded p-2 text-white"
                                />
                            </div>
                            <p className="text-xs text-yellow-400 mb-3">
                                💡 Tip: Para ajustar errores de redondeo, puedes copiar el monto exacto de la deuda y aplicarlo como descuento negativo (Ej: -0.980000000000182)
                            </p>
                            <button 
                                onClick={handleSaveExtraFee}
                                disabled={isReadOnly || applyingExtra}
                                className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded w-full disabled:opacity-50"
                            >
                                {applyingExtra ? 'Aplicando...' : 'Aplicar Cuota Extra'}
                            </button>
                        </>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-xs text-gray-400 mb-3">Historial de cuotas extraordinarias aplicadas. Puedes editarlas o eliminarlas (se revertirán los cambios en los ledgers).</p>
                            
                            {extraFees.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">No hay cuotas extraordinarias registradas</p>
                            ) : (
                                extraFees.map(fee => (
                                    <div key={fee.id} className="bg-logia-900 p-4 rounded border border-logia-700">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${fee.type === 'mass' ? 'bg-purple-600' : 'bg-blue-600'}`}>
                                                        {fee.type === 'mass' ? 'MASIVA' : 'INDIVIDUAL'}
                                                    </span>
                                                    <span className="text-indigo-400 font-mono font-bold">{fee.period}</span>
                                                    <span className={`font-bold ${fee.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                        {fee.amount >= 0 ? '+' : ''}${fee.amount}
                                                    </span>
                                                    {fee.amount < 0 && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">DESCUENTO</span>}
                                                </div>
                                                <p className="text-white font-semibold">{fee.description || 'Sin descripción'}</p>
                                                {fee.type === 'individual' && fee.targetUserName && (
                                                    <p className="text-sm text-blue-400">👤 {fee.targetUserName}</p>
                                                )}
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Aplicada a {fee.appliedToUsers.length} usuario(s) • Por {fee.createdByName} • {new Date(fee.createdAt).toLocaleDateString('es-ES')}
                                                </p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => handleEditExtraFee(fee)}
                                                    disabled={isReadOnly}
                                                    className="text-gray-400 hover:text-white p-2 bg-logia-800 rounded border border-logia-700"
                                                    title="Editar"
                                                >
                                                    ✏️
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteExtraFee(fee)}
                                                    disabled={isReadOnly}
                                                    className="text-white p-2 bg-red-600 rounded hover:bg-red-500"
                                                    title="Eliminar y Revertir"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        )}
        {/* Attendance, Trivia, Treasury Tabs logic follows same pattern as Users/Fees */}
        {activeTab === 'attendance' && (
             <div className="space-y-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-white">Control de Asistencia</h3>
                    <button onClick={handleDownloadAttendanceCSV} className="bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded text-xs flex items-center gap-2">
                        📥 Exportar Historial CSV
                    </button>
                </div>
                
                <div className="bg-logia-800 rounded-xl p-6 border border-logia-700 shadow-lg">
                    <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Fecha de Reunión</label>
                    <input 
                        type="date" 
                        value={attDate} 
                        onChange={(e) => setAttDate(e.target.value)} 
                        className="bg-logia-900 border border-logia-700 rounded p-3 text-white w-full mb-4"
                    />

                    <p className="text-xs font-bold uppercase text-gray-400 mb-2">Seleccionar Asistentes (Solo Activos)</p>
                    <div className="max-h-60 overflow-y-auto bg-logia-900 rounded border border-logia-700 p-2 space-y-1 mb-4">
                        {users.filter(u => u.active).map(u => (
                            <label key={u.uid} className="flex items-center space-x-3 p-2 hover:bg-logia-800 rounded cursor-pointer">
                                <input 
                                    type="checkbox"
                                    checked={attSelected.has(u.uid)}
                                    onChange={(e) => {
                                        const newSet = new Set(attSelected);
                                        if (e.target.checked) newSet.add(u.uid);
                                        else newSet.delete(u.uid);
                                        setAttSelected(newSet);
                                    }}
                                    disabled={isReadOnly}
                                    className="w-5 h-5 accent-indigo-500"
                                />
                                <span className="text-gray-300">{u.name}</span>
                            </label>
                        ))}
                    </div>

                    <button 
                        onClick={handleRecordAttendance}
                        disabled={isReadOnly || attSelected.size === 0}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded disabled:opacity-50"
                    >
                        Guardar Asistencia ({attSelected.size})
                    </button>
                </div>
                
                <div className="bg-logia-800 rounded-xl p-6 border border-logia-700 shadow-lg">
                     <h4 className="text-sm font-bold text-gray-300 mb-4 border-b border-logia-700 pb-2">Historial de Fechas</h4>
                     <div className="space-y-2 max-h-64 overflow-y-auto">
                         {attHistory.length === 0 ? (
                             <p className="text-gray-500 text-sm italic">No hay registros anteriores.</p>
                         ) : (
                             attHistory.map(date => (
                                 <div key={date} className="flex justify-between items-center bg-logia-900 p-3 rounded border border-logia-700">
                                     <span className="text-indigo-300 font-mono">{date}</span>
                                     <button 
                                       onClick={() => handleViewAttDetail(date)}
                                       className="text-gray-400 hover:text-white bg-logia-800 px-3 py-1 rounded text-xs flex items-center gap-2 border border-logia-700 hover:bg-logia-700"
                                     >
                                         👁️ Ver Detalle
                                     </button>
                                 </div>
                             ))
                         )}
                     </div>
                </div>
            </div>
        )}

        {activeTab === 'trivia' && (
             <div className="space-y-6">
                 <h3 className="text-lg font-bold text-white">Gestión de Trivia</h3>

                 <div className="bg-logia-800 rounded-xl p-6 border border-logia-700 shadow-lg space-y-4">
                     <h4 className="text-md font-bold text-white mb-4">Nueva Trivia Semanal</h4>
                     
                     <div className="space-y-3">
                         <input 
                            type="text" 
                            placeholder="Pregunta" 
                            value={triviaQ}
                            onChange={e => setTriviaQ(e.target.value)}
                            disabled={isReadOnly}
                            className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                         />
                         {triviaOpts.map((opt, idx) => (
                             <div key={idx} className="flex gap-2 items-center">
                                 <input 
                                    type="radio" 
                                    name="correctOpt" 
                                    checked={triviaCorrect === idx}
                                    onChange={() => setTriviaCorrect(idx)}
                                    disabled={isReadOnly}
                                    className="w-4 h-4 accent-green-500"
                                 />
                                 <input 
                                    type="text" 
                                    placeholder={`Opción ${idx + 1}`}
                                    value={opt}
                                    onChange={e => {
                                        const newOpts = [...triviaOpts];
                                        newOpts[idx] = e.target.value;
                                        setTriviaOpts(newOpts);
                                    }}
                                    disabled={isReadOnly}
                                    className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm"
                                 />
                             </div>
                         ))}
                     </div>
                     
                     <div className="flex gap-4 mt-4">
                         <button 
                            onClick={async () => {
                                if (isReadOnly) return;
                                setAiLoading(true);
                                try {
                                    const aiData = await generateTriviaWithAI();
                                    if (aiData.question) setTriviaQ(aiData.question);
                                    if (aiData.options) setTriviaOpts(aiData.options);
                                    if (typeof aiData.correctIndex === 'number') setTriviaCorrect(aiData.correctIndex);
                                } catch (e) {
                                    showMessage('Error generando con IA', 'error');
                                } finally {
                                    setAiLoading(false);
                                }
                            }}
                            disabled={aiLoading || isReadOnly}
                            className="flex-1 bg-purple-700 hover:bg-purple-600 text-white font-bold py-3 rounded disabled:opacity-50"
                         >
                            {aiLoading ? '✨ Generando...' : '✨ Generar con IA'}
                         </button>
                         
                         <button 
                            onClick={async () => {
                                if (isReadOnly) return;
                                if (!triviaQ || triviaOpts.some(o => !o)) {
                                    showMessage('Completa todos los campos', 'error');
                                    return;
                                }
                                try {
                                    await dataService.createTrivia({
                                        groupId: user.groupId,
                                        week: new Date().toISOString().slice(0, 10), // Simple week ID
                                        question: triviaQ,
                                        options: triviaOpts,
                                        correctIndex: triviaCorrect
                                    });
                                    showMessage('Trivia publicada!');
                                    setTriviaQ('');
                                    setTriviaOpts(['','','','']);
                                    await loadTrivias();
                                } catch (e) {
                                    showMessage('Error publicando', 'error');
                                }
                            }}
                            disabled={isReadOnly}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded disabled:opacity-50"
                         >
                            Publicar Trivia
                         </button>
                     </div>
                 </div>

                 {/* Trivia Management Section */}
                 <div className="bg-logia-800 rounded-xl border border-logia-700 shadow-lg overflow-hidden">
                     <div className="p-4 border-b border-logia-700 flex justify-between items-center">
                         <h4 className="font-bold text-white">Trivias Publicadas</h4>
                         <button 
                             onClick={handleResetAllAnswers}
                             disabled={isReadOnly}
                             className="bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold px-3 py-2 rounded disabled:opacity-50"
                             title="Resetear todas las respuestas de todos los usuarios (Nuevo Periodo/Temporada)"
                         >
                             🔄 Resetear Temporada
                         </button>
                     </div>
                     <div className="p-4 space-y-3">
                         {allTrivias.length === 0 ? (
                             <p className="text-gray-400 text-center py-4">No hay trivias publicadas</p>
                         ) : (
                             allTrivias.map(trivia => (
                                 <div key={trivia.id} className="bg-logia-900 p-4 rounded border border-logia-700 flex flex-col gap-2">
                                     <div className="flex justify-between items-start gap-2">
                                         <div className="flex-1">
                                             <h5 className="font-bold text-white text-lg">{trivia.question}</h5>
                                             <p className="text-xs text-gray-400 mb-2">{trivia.week}</p>
                                             <div className="space-y-1 text-sm">
                                                 {trivia.options.map((opt, idx) => (
                                                     <div key={idx} className={`${idx === trivia.correctIndex ? 'text-green-400 font-bold' : 'text-gray-400'}`}>
                                                         {String.fromCharCode(65 + idx)}. {opt} {idx === trivia.correctIndex && '✓'}
                                                     </div>
                                                 ))}
                                             </div>
                                         </div>
                                         <div className="flex gap-2">
                                             <button 
                                                 onClick={() => handleDeleteTrivia(trivia.id)}
                                                 disabled={isReadOnly}
                                                 className="text-white p-2 bg-red-600 rounded border border-red-700 hover:bg-red-500"
                                                 title="Eliminar Trivia"
                                             >
                                                 🗑️
                                             </button>
                                         </div>
                                     </div>
                                 </div>
                             ))
                         )}
                     </div>
                 </div>
             </div>
        )}

        {activeTab === 'notices' && (
             <div className="space-y-6">
                <h3 className="text-lg font-bold text-white">Gestión de Avisos</h3>
                
                <div className="bg-logia-800 rounded-xl p-6 border border-logia-700 shadow-lg">
                    <h4 className="text-md font-bold text-white mb-4">{editingNotice ? 'Editar Aviso' : 'Crear Nuevo Aviso'}</h4>
                    
                    <div className="space-y-3">
                        <input 
                            type="text" 
                            placeholder="Título del Aviso" 
                            value={newNoticeTitle}
                            onChange={e => setNewNoticeTitle(e.target.value)}
                            disabled={isReadOnly}
                            className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white font-bold"
                        />
                        <textarea 
                            placeholder="Contenido del Aviso..." 
                            value={newNoticeContent}
                            onChange={e => setNewNoticeContent(e.target.value)}
                            disabled={isReadOnly}
                            rows={5}
                            className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                        />
                        
                        <div className="flex gap-3">
                            <button 
                                onClick={handleSaveNotice}
                                disabled={isReadOnly || isSubmitting}
                                className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded disabled:opacity-50"
                            >
                                {isSubmitting ? 'Guardando...' : (editingNotice ? 'Actualizar Aviso' : 'Crear Aviso')}
                            </button>
                            {editingNotice && (
                                <button 
                                    onClick={handleCancelEditNotice}
                                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded"
                                >
                                    Cancelar
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-logia-800 rounded-xl border border-logia-700 shadow-lg overflow-hidden">
                    <div className="p-4 border-b border-logia-700">
                        <h4 className="font-bold text-white">Avisos Publicados</h4>
                    </div>
                    <div className="p-4 space-y-3">
                        {notices.length === 0 ? (
                            <p className="text-gray-400 text-center py-4">No hay avisos publicados</p>
                        ) : (
                            notices.map(notice => (
                                <div key={notice.id} className="bg-logia-900 p-4 rounded border border-logia-700 flex flex-col gap-2">
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex-1">
                                            <h5 className="font-bold text-white text-lg">{notice.title}</h5>
                                            <p className="text-xs text-gray-400">{notice.date}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => handleEditNotice(notice)}
                                                disabled={isReadOnly}
                                                className="text-gray-400 hover:text-white p-2 bg-logia-800 rounded border border-logia-700"
                                                title="Editar"
                                            >
                                                ✏️
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteNotice(notice.id)}
                                                disabled={isReadOnly}
                                                className="text-white p-2 bg-red-600 rounded border border-red-700 hover:bg-red-500"
                                                title="Eliminar"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-gray-300 text-sm whitespace-pre-wrap">{notice.content}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'treasury' && (
             <div className="space-y-6">
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-blue-900/40 p-3 rounded-lg border border-blue-500/30 text-center">
                        <p className="text-[10px] text-blue-300 uppercase tracking-wider mb-1">Balance Global</p>
                        <p className="text-xl font-bold text-white">${(treasuryBalance.general + treasuryBalance.charity + treasuryBalance.quotas).toLocaleString()}</p>
                    </div>
                    <div className="bg-green-900/40 p-3 rounded-lg border border-green-500/30 text-center">
                        <p className="text-[10px] text-green-300 uppercase tracking-wider mb-1">Fondo Cuotas</p>
                        <p className="text-lg font-bold text-white">${treasuryBalance.quotas.toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-800 p-3 rounded-lg border border-gray-600/30 text-center">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Tesoro General</p>
                        <p className="text-lg font-bold text-white">${treasuryBalance.general.toLocaleString()}</p>
                    </div>
                    <div className="bg-purple-900/40 p-3 rounded-lg border border-purple-500/30 text-center">
                        <p className="text-[10px] text-purple-300 uppercase tracking-wider mb-1">Beneficencia</p>
                        <p className="text-lg font-bold text-white">${treasuryBalance.charity.toLocaleString()}</p>
                    </div>
                </div>

                <div className="bg-logia-800 rounded-xl p-6 border border-logia-700 shadow-lg">
                    <h3 className="text-lg font-bold text-white mb-4">Registrar Movimiento Manual</h3>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <button 
                            onClick={() => setNewTransType('income')}
                            disabled={isReadOnly}
                            className={`p-2 rounded text-sm font-bold border ${newTransType === 'income' ? 'bg-green-600 border-green-500 text-white' : 'bg-logia-900 border-logia-700 text-gray-400'}`}
                        >
                            Ingreso (+)
                        </button>
                        <button 
                            onClick={() => setNewTransType('expense')}
                            disabled={isReadOnly}
                            className={`p-2 rounded text-sm font-bold border ${newTransType === 'expense' ? 'bg-red-600 border-red-500 text-white' : 'bg-logia-900 border-logia-700 text-gray-400'}`}
                        >
                            Gasto (-)
                        </button>
                    </div>

                    <div className="space-y-3">
                        <input type="date" value={newTransDate} onChange={e => setNewTransDate(e.target.value)} disabled={isReadOnly} className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white" />
                        
                        <div>
                             <label className="text-xs uppercase text-gray-400 mb-1 block font-bold">Concepto Estandarizado (Gasto/Ingreso)</label>
                             <select value={newTransCat} onChange={e => setNewTransCat(e.target.value)} disabled={isReadOnly} className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white">
                                <option value="saco_beneficencia">Saco Beneficencia</option>
                                <option value="cuota_extra">Cuota Extra</option>
                                <option value="evento">Evento / Rifa</option>
                                <option value="donacion">Donación</option>
                                <option value="gasto_operativo">Gasto Operativo</option>
                                <option value="gasto_social">Gasto Social / Ágape</option>
                                <option value="compra_material">Materiales / Insumos</option>
                                <option value="otro">Otro</option>
                            </select>
                        </div>

                        <input 
                            type="text" 
                            placeholder="Descripción" 
                            value={newTransDesc} 
                            onChange={e => setNewTransDesc(e.target.value)} 
                            disabled={isReadOnly}
                            className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                        />
                        
                        <input 
                            type="number" 
                            placeholder="Monto Total" 
                            value={newTransAmount || ''} 
                            onChange={e => setNewTransAmount(Number(e.target.value))} 
                            disabled={isReadOnly}
                            className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white font-bold"
                        />

                        {/* Allocations */}
                        <div className="bg-logia-900 p-3 rounded border border-logia-700 mt-2">
                             <p className="text-xs uppercase text-gray-400 mb-2 font-bold">Origen de Fondos / Destino de Fondo</p>
                             <div className="flex gap-2 mb-2">
                                 <select 
                                     value={allocSource} 
                                     onChange={e => setAllocSource(e.target.value as any)} 
                                     disabled={isReadOnly}
                                     className="bg-logia-800 border border-logia-700 rounded p-2 text-white text-xs flex-1"
                                 >
                                     <option value="tesoro_general">Tesoro General</option>
                                     <option value="beneficencia">Fondo Beneficencia</option>
                                     <option value="cuotas">Fondo Cuotas</option>
                                 </select>
                                 <input 
                                     type="number" 
                                     placeholder="$" 
                                     value={allocAmount || ''} 
                                     onChange={e => setAllocAmount(Number(e.target.value))}
                                     disabled={isReadOnly}
                                     className="bg-logia-800 border border-logia-700 rounded p-2 text-white text-xs w-20"
                                 />
                                 <button onClick={handleAddAllocation} disabled={isReadOnly} className="bg-gray-700 px-3 rounded text-white text-xs font-bold">+</button>
                             </div>
                             
                             <div className="space-y-1">
                                 {allocations.map((a, idx) => (
                                     <div key={idx} className="flex justify-between items-center text-xs bg-logia-800 p-2 rounded">
                                         <span>{a.source === 'tesoro_general' ? '🏛️ Tesoro' : a.source === 'beneficencia' ? '🤝 Beneficencia' : '💰 Cuotas'}</span>
                                         <div className="flex items-center gap-2">
                                             <span className="font-bold text-white">${a.amount}</span>
                                             <button onClick={() => handleRemoveAllocation(idx)} className="text-red-400 font-bold">x</button>
                                         </div>
                                     </div>
                                 ))}
                                 <div className="text-right text-xs text-gray-400 pt-1">
                                     Total Asignado: <span className={allocations.reduce((x,y)=>x+y.amount,0) === newTransAmount ? "text-green-400" : "text-red-400"}>${allocations.reduce((x,y)=>x+y.amount,0)}</span> / ${newTransAmount}
                                 </div>
                             </div>
                        </div>

                        <button 
                            onClick={handleSaveTransaction}
                            disabled={isSubmitting || isReadOnly}
                            className={`w-full font-bold py-3 rounded transition-colors ${newTransType === 'income' ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'}`}
                        >
                            {isSubmitting ? 'Guardando...' : (editingTreasuryId ? 'Actualizar Movimiento' : 'Registrar Movimiento')}
                        </button>
                        
                        {editingTreasuryId && (
                            <button onClick={() => {
                                setEditingTreasuryId(null);
                                setNewTransAmount(0);
                                setNewTransDesc('');
                                setAllocations([]);
                            }} className="w-full text-xs text-gray-400 underline">Cancelar Edición</button>
                        )}
                    </div>
                </div>

                <div className="bg-logia-800 rounded-xl border border-logia-700 shadow-lg overflow-hidden">
                    <div className="p-4 border-b border-logia-700 flex justify-between items-center">
                        <h3 className="font-bold text-white">Historial de Movimientos (Incluye Cuotas)</h3>
                        <button onClick={handleDownloadTreasuryCSV} className="text-xs bg-green-700 px-2 py-1 rounded text-white">📥 CSV Detallado</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-300">
                            <thead className="bg-logia-900 text-xs uppercase text-gray-500">
                                <tr>
                                    <th className="p-3">Fecha</th>
                                    <th className="p-3">Tipo</th>
                                    <th className="p-3">Concepto</th>
                                    <th className="p-3">Descripción</th>
                                    <th className="p-3 text-right">Monto</th>
                                    <th className="p-3 text-center">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-logia-700">
                                {combinedTreasuryHistory.map((t) => {
                                    const isQuota = t.id.startsWith('quota_');
                                    return (
                                        <tr key={t.id} className={`hover:bg-logia-700/50 ${isQuota ? 'bg-logia-900/30 text-gray-400 italic' : ''}`}>
                                            <td className="p-3 whitespace-nowrap">{t.date}</td>
                                            <td className="p-3 text-xs uppercase">{isQuota ? 'CUOTA' : (t.type === 'income' ? 'INGRESO' : 'GASTO')}</td>
                                            <td className="p-3 text-xs uppercase">{t.category.replace('_', ' ')}</td>
                                            <td className="p-3">{t.description}</td>
                                            <td className={`p-3 text-right font-bold ${t.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                                                {t.type === 'income' ? '+' : '-'}${t.amount}
                                            </td>
                                            <td className="p-3 flex justify-center gap-2">
                                                {!isQuota ? (
                                                    <>
                                                        <button 
                                                        type="button"
                                                        onClick={(e) => handleEditTransaction(t, e)} 
                                                        className="text-gray-400 hover:text-white p-1"
                                                        title="Editar"
                                                        >
                                                        ✏️
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => handleDeleteTransaction(t.id, e)} 
                                                            className="text-white p-2 bg-red-600 rounded border border-red-700 hover:bg-red-500 cursor-pointer w-8 h-8 flex items-center justify-center shadow-md"
                                                            title="Eliminar"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </>
                                                ) : (
                                                    <span className="text-[10px] text-gray-600">Automático</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {/* --- BANKS TAB (BANCOS Y EFECTIVO) --- */}
        {activeTab === 'banks' && (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white">Gestión de Bancos y Efectivo</h3>
                    <button 
                        onClick={() => setShowBankForm(!showBankForm)}
                        disabled={isReadOnly}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded font-bold disabled:opacity-50"
                    >
                        {showBankForm ? 'Cancelar' : '+ Agregar Registro'}
                    </button>
                </div>

                {/* Total Balance Card */}
                <div className="bg-gradient-to-r from-green-900/40 to-green-800/40 rounded-xl p-6 border border-green-500/50 shadow-lg">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-xs text-green-300 uppercase tracking-wider mb-1">Balance Total Disponible</p>
                            <p className="text-3xl font-bold text-white">${getTotalBankBalance().toLocaleString()}</p>
                        </div>
                        <div className="text-4xl">💰</div>
                    </div>
                </div>

                {/* Form */}
                {showBankForm && (
                    <form onSubmit={handleBankFormSubmit} className="bg-logia-800 rounded-xl p-6 border border-logia-700 shadow-lg space-y-4">
                        <h4 className="text-md font-bold text-white">{editingBankId ? 'Editar Registro' : 'Nuevo Registro Bancario'}</h4>
                        
                        <div>
                            <label className="text-xs text-gray-400 uppercase block mb-1">Tipo</label>
                            <select
                                value={bankFormData.type}
                                onChange={e => setBankFormData({...bankFormData, type: e.target.value as 'bank' | 'cash'})}
                                className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                                required
                            >
                                <option value="bank">Banco</option>
                                <option value="cash">Efectivo</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-xs text-gray-400 uppercase block mb-1">
                                {bankFormData.type === 'bank' ? 'Nombre del Banco' : 'Descripción'}
                            </label>
                            <input
                                type="text"
                                value={bankFormData.name}
                                onChange={e => setBankFormData({...bankFormData, name: e.target.value})}
                                placeholder={bankFormData.type === 'bank' ? 'Ej: Banco Santander' : 'Ej: Efectivo en Caja Chica'}
                                className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                                required
                            />
                        </div>

                        <div>
                            <label className="text-xs text-gray-400 uppercase block mb-1">Monto Actual</label>
                            <input
                                type="number"
                                step="0.01"
                                value={bankFormData.amount}
                                onChange={e => setBankFormData({...bankFormData, amount: Number(e.target.value)})}
                                className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                                required
                            />
                        </div>

                        <div>
                            <label className="text-xs text-gray-400 uppercase block mb-1">Comentario (Opcional)</label>
                            <textarea
                                value={bankFormData.comment}
                                onChange={e => setBankFormData({...bankFormData, comment: e.target.value})}
                                placeholder="Notas adicionales sobre este balance..."
                                className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white h-20"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={resetBankForm}
                                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isReadOnly}
                                className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded disabled:opacity-50"
                            >
                                {editingBankId ? 'Actualizar' : 'Guardar'}
                            </button>
                        </div>
                    </form>
                )}

                {/* Balances List */}
                <div className="space-y-4">
                    <h4 className="font-bold text-white">Registros Bancarios</h4>
                    
                    {bankBalances.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">No hay registros bancarios aún</p>
                    ) : (
                        <div className="grid gap-4">
                            {bankBalances.map(balance => (
                                <div key={balance.id} className="bg-logia-800 rounded-xl p-5 border border-logia-700 shadow-lg">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-2xl">{balance.type === 'bank' ? '🏦' : '💵'}</span>
                                                <div>
                                                    <h5 className="text-lg font-bold text-white">{balance.name}</h5>
                                                    <p className="text-xs text-gray-400">
                                                        {balance.type === 'bank' ? 'Cuenta Bancaria' : 'Efectivo'}
                                                    </p>
                                                </div>
                                            </div>
                                            <p className="text-2xl font-bold text-green-400 mb-2">
                                                ${balance.amount.toLocaleString()}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                Actualizado: {new Date(balance.lastUpdated).toLocaleDateString('es-ES', {
                                                    day: 'numeric',
                                                    month: 'long',
                                                    year: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </p>
                                            {balance.comment && (
                                                <p className="text-sm text-gray-400 mt-2 italic">"{balance.comment}"</p>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => handleEditBank(balance)}
                                                disabled={isReadOnly}
                                                className="text-indigo-400 hover:text-indigo-300 p-2 disabled:opacity-50"
                                                title="Editar"
                                            >
                                                ✏️
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteBank(balance.id)}
                                                disabled={isReadOnly}
                                                className="text-red-400 hover:text-red-300 p-2 disabled:opacity-50"
                                                title="Eliminar"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* --- VISITS TAB (SOLICITUDES DE VISITA) --- */}
        {activeTab === 'visits' && (
            <div className="space-y-6">
                <h3 className="text-lg font-bold text-white">Solicitudes de Visita entre Logias</h3>
                
                {/* Create New Visit Request */}
                <div className="bg-logia-800 rounded-xl p-6 border border-logia-700 shadow-lg">
                    <h4 className="text-md font-bold text-white mb-4">Solicitar Visita a otra Logia</h4>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-gray-400 uppercase block mb-1">Logia a Visitar</label>
                            <select 
                                value={newVisitToGroupId}
                                onChange={e => setNewVisitToGroupId(e.target.value)}
                                disabled={isReadOnly}
                                className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                            >
                                <option value="">Seleccionar Logia...</option>
                                {allGroups.filter(g => g.id !== user.groupId).map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-gray-400 uppercase block mb-1">Fecha de Visita</label>
                                <input 
                                    type="date"
                                    value={newVisitDate}
                                    onChange={e => setNewVisitDate(e.target.value)}
                                    disabled={isReadOnly}
                                    className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 uppercase block mb-1">Número de Visitantes</label>
                                <input 
                                    type="number"
                                    min="1"
                                    value={newVisitCount}
                                    onChange={e => setNewVisitCount(Number(e.target.value))}
                                    disabled={isReadOnly}
                                    className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-gray-400 uppercase block mb-1">Mensaje / Detalles</label>
                            <textarea 
                                value={newVisitMessage}
                                onChange={e => setNewVisitMessage(e.target.value)}
                                disabled={isReadOnly}
                                rows={3}
                                placeholder="Escribe detalles de la visita..."
                                className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"
                            />
                        </div>
                        <button 
                            onClick={handleCreateVisitRequest}
                            disabled={isReadOnly || isSubmitting}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded disabled:opacity-50"
                        >
                            Enviar Solicitud
                        </button>
                    </div>
                </div>

                {/* Visit Requests List */}
                <div className="bg-logia-800 rounded-xl border border-logia-700 shadow-lg overflow-hidden">
                    <div className="p-4 border-b border-logia-700">
                        <h4 className="font-bold text-white">Historial de Solicitudes</h4>
                    </div>
                    <div className="p-4 space-y-3">
                        {visitRequests.length === 0 ? (
                            <p className="text-gray-400 text-center py-4">No hay solicitudes de visita</p>
                        ) : (
                            visitRequests.map(request => {
                                const isReceived = request.toGroupId === user.groupId;
                                const isSent = request.fromGroupId === user.groupId;
                                
                                return (
                                    <div key={request.id} className={`bg-logia-900 p-4 rounded border ${
                                        request.status === 'pending' ? 'border-yellow-500' :
                                        request.status === 'accepted' ? 'border-green-500' :
                                        request.status === 'rejected' ? 'border-red-500' :
                                        'border-gray-700'
                                    }`}>
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className={`text-xs px-2 py-1 rounded ${
                                                        request.status === 'pending' ? 'bg-yellow-900/50 text-yellow-400' :
                                                        request.status === 'accepted' ? 'bg-green-900/50 text-green-400' :
                                                        request.status === 'rejected' ? 'bg-red-900/50 text-red-400' :
                                                        'bg-gray-700 text-gray-400'
                                                    }`}>
                                                        {request.status === 'pending' ? '⏳ Pendiente' :
                                                         request.status === 'accepted' ? '✅ Aceptada' :
                                                         request.status === 'rejected' ? '❌ Rechazada' :
                                                         '✔️ Completada'}
                                                    </span>
                                                    <span className="text-xs text-gray-500">
                                                        {isReceived ? `📥 Recibida de` : `📤 Enviada a`}
                                                    </span>
                                                </div>
                                                <h5 className="font-bold text-white text-lg">
                                                    {isReceived ? request.fromGroupName : request.toGroupName}
                                                </h5>
                                                <p className="text-sm text-gray-400">Fecha: {request.visitDate}</p>
                                                <p className="text-sm text-gray-400">Visitantes: {request.numberOfVisitors}</p>
                                                <p className="text-sm text-gray-300 mt-2">{request.message}</p>
                                                <p className="text-xs text-gray-500 mt-1">Por: {request.requestedByName}</p>
                                            </div>
                                            <div className="flex gap-2 flex-col">
                                                <button 
                                                    onClick={() => setViewingVisitRequest(request)}
                                                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded"
                                                >
                                                    💬 Ver Chat
                                                </button>
                                                {isReceived && request.status === 'pending' && !isReadOnly && (
                                                    <>
                                                        <button 
                                                            onClick={() => handleUpdateVisitStatus(request.id, 'accepted')}
                                                            className="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded"
                                                        >
                                                            ✅ Aceptar
                                                        </button>
                                                        <button 
                                                            onClick={() => handleUpdateVisitStatus(request.id, 'rejected')}
                                                            className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded"
                                                        >
                                                            ❌ Rechazar
                                                        </button>
                                                    </>
                                                )}
                                                {request.status === 'accepted' && !isReadOnly && (
                                                    <button 
                                                        onClick={() => handleUpdateVisitStatus(request.id, 'completed')}
                                                        className="text-xs bg-gray-600 hover:bg-gray-500 text-white px-3 py-2 rounded"
                                                    >
                                                        ✔️ Completada
                                                    </button>
                                                )}
                                                {(request.status === 'completed' || request.status === 'rejected') && !isReadOnly && (
                                                    <button 
                                                        onClick={() => handleDeleteVisit(request.id)}
                                                        className="text-xs bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded"
                                                    >
                                                        🗑️ Eliminar
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* PAYMENT MATRIX TAB */}
        {activeTab === 'payment-matrix' && (
            <div className="space-y-6">
                <div className="bg-logia-800 border border-logia-700 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4">📊 Matriz de Pagos</h3>
                    <p className="text-gray-400 mb-6 text-sm">
                        Vista rápida de los pagos mensuales. Haz clic en una celda para marcar como pagado.
                    </p>
                    
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-300 mb-2">Año</label>
                        <input
                            type="number"
                            value={matrixYear}
                            onChange={(e) => setMatrixYear(Number(e.target.value))}
                            min="2020"
                            max="2100"
                            className="w-32 px-4 py-2 bg-logia-900 border border-logia-700 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-logia-900">
                                    <th className="p-2 text-left text-gray-400 font-bold border border-logia-700">Miembro</th>
                                    {matrixMonths.map((month, idx) => (
                                        <th key={idx} className="p-2 text-center text-gray-400 font-bold border border-logia-700 min-w-[60px]">
                                            {month}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.filter(u => u.active).map(u => (
                                    <tr key={u.uid} className="hover:bg-logia-700/30">
                                        <td className="p-2 text-white font-medium border border-logia-700 whitespace-nowrap">
                                            {u.name}
                                        </td>
                                        {matrixMonths.map((month, idx) => {
                                            const monthNum = (idx + 1).toString().padStart(2, '0');
                                            const period = `${matrixYear}-${monthNum}`;
                                            const userLedger = allUserLedgers[u.uid] || [];
                                            const paymentData = userLedger.find(p => p.period === period);
                                            const isPaid = paymentData?.regularCovered || false;
                                            
                                            return (
                                                <td 
                                                    key={idx} 
                                                    className={`p-2 text-center border border-logia-700 cursor-pointer transition-colors ${
                                                        isPaid ? 'bg-green-600 text-white' : 'bg-red-900/30 text-gray-400'
                                                    } hover:brightness-110`}
                                                    onClick={() => handleToggleMatrixPayment(u.uid, period)}
                                                    title={isPaid ? 'Pagado' : 'Pendiente'}
                                                >
                                                    {isPaid ? '✓' : '✗'}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    
                    <div className="mt-4 flex gap-4 text-xs">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-green-600 rounded"></div>
                            <span className="text-gray-400">Pagado</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-red-900/30 rounded border border-logia-700"></div>
                            <span className="text-gray-400">Pendiente</span>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* CREATE USER TAB */}
        {activeTab === 'create-user' && (
            <div className="space-y-6">
                <div className="bg-logia-800 border border-logia-700 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4">👤 Crear Nuevo Usuario</h3>
                    <p className="text-gray-400 mb-6 text-sm">
                        Crea un usuario que aún no tiene cuenta. Cuando la persona se registre con su correo real, 
                        <strong className="text-indigo-400"> todos los datos se vincularán automáticamente</strong>.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Nombre Completo</label>
                            <input
                                type="text"
                                value={newUserName}
                                onChange={(e) => setNewUserName(e.target.value)}
                                placeholder="Juan Pérez García"
                                className="w-full px-4 py-2 bg-logia-900 border border-logia-700 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Correo Electrónico (Opcional)</label>
                            <input
                                type="email"
                                value={newUserEmail}
                                onChange={(e) => setNewUserEmail(e.target.value)}
                                placeholder="correo@ejemplo.com (opcional)"
                                className="w-full px-4 py-2 bg-logia-900 border border-logia-700 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">Si no lo conoces, déjalo vacío. Se asignará uno temporal.</p>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Rol</label>
                            <select
                                value={newUserRole}
                                onChange={(e) => setNewUserRole(e.target.value)}
                                className="w-full px-4 py-2 bg-logia-900 border border-logia-700 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="member">Miembro</option>
                                <option value="admin">Administrador</option>
                                <option value="master">Master</option>
                            </select>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Grado</label>
                            <input
                                type="text"
                                value={newUserDegree}
                                onChange={(e) => setNewUserDegree(e.target.value)}
                                placeholder="Aprendiz, Compañero, Maestro..."
                                className="w-full px-4 py-2 bg-logia-900 border border-logia-700 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                    
                    <button
                        onClick={handleCreateUser}
                        disabled={creatingUser || !newUserName.trim()}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors"
                    >
                        {creatingUser ? 'Creando...' : '✅ Crear Usuario'}
                    </button>
                </div>
            </div>
        )}

      </div>
      
      {/* VISIT REQUEST CHAT MODAL */}
      {viewingVisitRequest && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
              <div className="bg-logia-800 w-full max-w-2xl rounded-xl border border-logia-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-4 border-b border-logia-700 bg-logia-900">
                      <div className="flex justify-between items-start">
                          <div>
                              <h3 className="font-bold text-white text-lg">
                                  {viewingVisitRequest.fromGroupName} → {viewingVisitRequest.toGroupName}
                              </h3>
                              <p className="text-xs text-gray-400">Fecha: {viewingVisitRequest.visitDate} | Visitantes: {viewingVisitRequest.numberOfVisitors}</p>
                          </div>
                          <button onClick={() => setViewingVisitRequest(null)} className="text-gray-400 hover:text-white text-2xl">×</button>
                      </div>
                  </div>
                  
                  <div className="p-4 overflow-y-auto flex-1 space-y-3 bg-logia-900">
                      {(viewingVisitRequest.messages || []).length === 0 ? (
                          <p className="text-gray-500 text-center py-8">No hay mensajes aún. Inicia la conversación.</p>
                      ) : (
                          viewingVisitRequest.messages.map(msg => (
                              <div key={msg.id} className={`p-3 rounded ${
                                  msg.senderId === user.uid ? 'bg-indigo-900/50 ml-8' : 'bg-logia-800 mr-8'
                              }`}>
                                  <p className="text-xs text-gray-400 mb-1">{msg.senderName} • {new Date(msg.timestamp).toLocaleString('es-MX')}</p>
                                  <p className="text-white">{msg.text}</p>
                              </div>
                          ))
                      )}
                  </div>
                  
                  <div className="p-4 border-t border-logia-700 bg-logia-800">
                      <div className="flex gap-2">
                          <input 
                              type="text"
                              value={newChatMessage}
                              onChange={e => setNewChatMessage(e.target.value)}
                              onKeyPress={e => e.key === 'Enter' && handleSendVisitMessage()}
                              placeholder="Escribe un mensaje..."
                              className="flex-1 bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm"
                          />
                          <button 
                              onClick={handleSendVisitMessage}
                              disabled={!newChatMessage.trim()}
                              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 rounded disabled:opacity-50"
                          >
                              Enviar
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
      
      {/* ATTENDANCE DETAIL MODAL - same logic */}
      {viewingAttDate && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-logia-800 w-full max-w-md rounded-xl border border-logia-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-4 border-b border-logia-700 flex justify-between items-center bg-logia-900">
                      <h3 className="font-bold text-white">Asistencia: <span className="text-indigo-400">{viewingAttDate}</span></h3>
                      <button onClick={() => setViewingAttDate(null)} className="text-gray-400 hover:text-white text-xl">×</button>
                  </div>
                  <div className="p-4 overflow-y-auto flex-1">
                      <table className="w-full text-sm">
                          <thead>
                              <tr className="text-gray-500 text-xs uppercase border-b border-gray-700">
                                  <th className="text-left py-2">Nombre</th>
                                  <th className="text-right py-2">Estatus</th>
                              </tr>
                          </thead>
                          <tbody>
                              {attDetailList.length === 0 ? (
                                  <tr><td colSpan={2} className="text-center py-4 text-gray-500">Cargando...</td></tr>
                              ) : (
                                  attDetailList.map((item, idx) => (
                                      <tr key={idx} className="border-b border-gray-700/50">
                                          <td className="py-2 text-white">{item.name}</td>
                                          <td className={`py-2 text-right font-bold ${item.attended ? 'text-green-400' : 'text-red-400'}`}>
                                              {item.attended ? 'ASISTIO' : 'FALTA'}
                                          </td>
                                      </tr>
                                  ))
                              )}
                          </tbody>
                      </table>
                  </div>
                  <div className="p-4 border-t border-logia-700 flex gap-2">
                      <button
                          onClick={() => {
                              handleEditAttendance(viewingAttDate);
                          }}
                          className="flex-1 bg-indigo-700 hover:bg-indigo-600 text-white px-4 py-2 rounded font-semibold"
                      >
                          ✏️ Editar
                      </button>
                      <button
                          onClick={() => handleDeleteAttendance(viewingAttDate)}
                          className="flex-1 bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded font-semibold"
                      >
                          🗑️ Eliminar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* EDIT ATTENDANCE MODAL */}
      {editingAttDate && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-logia-800 w-full max-w-md rounded-xl border border-logia-700 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-4 border-b border-logia-700 flex justify-between items-center bg-logia-900">
                      <h3 className="font-bold text-white">Editar Asistencia: <span className="text-indigo-400">{editingAttDate}</span></h3>
                      <button onClick={() => setEditingAttDate(null)} className="text-gray-400 hover:text-white text-xl">×</button>
                  </div>
                  <div className="p-4 overflow-y-auto flex-1">
                      <p className="text-gray-400 text-sm mb-4">Marca quiénes asistieron ese día:</p>
                      <div className="space-y-2">
                          {attDetailList.map((item) => (
                              <label key={item.uid} className="flex items-center gap-3 p-2 rounded hover:bg-logia-700/50 cursor-pointer">
                                  <input
                                      type="checkbox"
                                      checked={editAttSelected.has(item.uid)}
                                      onChange={(e) => {
                                          const newSet = new Set(editAttSelected);
                                          if (e.target.checked) {
                                              newSet.add(item.uid);
                                          } else {
                                              newSet.delete(item.uid);
                                          }
                                          setEditAttSelected(newSet);
                                      }}
                                      className="w-4 h-4"
                                  />
                                  <span className="text-white">{item.name}</span>
                              </label>
                          ))}
                      </div>
                  </div>
                  <div className="p-4 border-t border-logia-700 flex gap-2">
                      <button
                          onClick={() => setEditingAttDate(null)}
                          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded font-semibold"
                      >
                          Cancelar
                      </button>
                      <button
                          onClick={handleSaveEditedAttendance}
                          className="flex-1 bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded font-semibold"
                      >
                          💾 Guardar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* DELETE ATTENDANCE CONFIRMATION MODAL */}
      {showDeleteAttModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-logia-800 w-full max-w-sm rounded-xl border border-red-700 shadow-2xl p-6">
                  <h3 className="text-xl font-bold text-red-400 mb-4">⚠️ Confirmar Eliminación</h3>
                  <p className="text-gray-300 mb-6">
                      ¿Estás seguro que deseas eliminar el registro de asistencia del <span className="font-bold text-white">{deletingAttDate}</span>?
                  </p>
                  <p className="text-sm text-gray-400 mb-6">Esta acción no se puede deshacer.</p>
                  <div className="flex gap-3">
                      <button
                          onClick={() => {
                              setShowDeleteAttModal(false);
                              setDeletingAttDate(null);
                          }}
                          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded font-semibold"
                      >
                          Cancelar
                      </button>
                      <button
                          onClick={executeDeleteAttendance}
                          className="flex-1 bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded font-semibold"
                      >
                          Eliminar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* EDIT USER PROFILE MODAL - same logic */}
      {editingUserProfile && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-logia-800 w-full max-w-lg rounded-xl border border-logia-700 shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
             <button onClick={() => setEditingUserProfile(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white">✕</button>
             <h3 className="text-xl font-bold text-white mb-6">Editar Perfil: {editingUserProfile.name}</h3>
             
             <div className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                     <div>
                         <label className="text-xs text-gray-400 uppercase">Iniciación Masónica</label>
                         <input type="date" value={editingUserProfile.masonicJoinDate || ''} onChange={e => setEditingUserProfile({...editingUserProfile, masonicJoinDate: e.target.value})} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
                     </div>
                     <div>
                         <label className="text-xs text-gray-400 uppercase">Último Reingreso (Cobro)</label>
                         <input type="date" value={editingUserProfile.masonicRejoinDate || ''} onChange={e => setEditingUserProfile({...editingUserProfile, masonicRejoinDate: e.target.value})} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
                     </div>
                 </div>
                 {/* ...rest of fields... */}
                 <div className="grid grid-cols-2 gap-4">
                     <div>
                         <label className="text-xs text-gray-400 uppercase">Grado</label>
                         <select value={editingUserProfile.degree || ''} onChange={e => setEditingUserProfile({...editingUserProfile, degree: e.target.value as MasonicDegree})} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm">
                             <option value="">Seleccionar</option>
                             <option value="aprendiz">Aprendiz</option>
                             <option value="companero">Compañero</option>
                             <option value="maestro">Maestro</option>
                         </select>
                     </div>
                     <div>
                         <label className="text-xs text-gray-400 uppercase">Grado Numérico</label>
                         <input type="number" min="1" max="33" value={editingUserProfile.numericDegree || ''} onChange={e => setEditingUserProfile({...editingUserProfile, numericDegree: Number(e.target.value)})} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
                     </div>
                 </div>

                 <div>
                     <label className="text-xs text-gray-400 uppercase">Cargo / Oficio</label>
                     <select value={editingUserProfile.lodgeRole || 'sin_cargo'} onChange={e => setEditingUserProfile({...editingUserProfile, lodgeRole: e.target.value as LodgeRole})} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm">
                         <option value="venerable">Venerable Maestro</option>
                         {/* ...other options... */}
                         <option value="primer_vigilante">Primer Vigilante</option>
                         <option value="segundo_vigilante">Segundo Vigilante</option>
                         <option value="orador">Orador</option>
                         <option value="secretario">Secretario</option>
                         <option value="tesorero">Tesorero</option>
                         <option value="hospitalario">Hospitalario</option>
                         <option value="maestro_ceremonias">Maestro Ceremonias</option>
                         <option value="experto">Experto</option>
                         <option value="guarda_templo_interior">Guarda Templo Int.</option>
                         <option value="guarda_templo_exterior">Guarda Templo Ext.</option>
                         <option value="sin_cargo">Sin Cargo</option>
                         <option value="otro">Otro</option>
                     </select>
                 </div>
                 
                 <div className="pt-4 flex gap-4">
                     <button onClick={handleUpdateUserProfile} disabled={isReadOnly} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded">Guardar Cambios</button>
                 </div>
             </div>
          </div>
        </div>
      )}

      {/* EDIT PAYMENTS MODAL - same logic */}
      {editingUserLedger && (
         <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
             <div className="bg-logia-800 w-full max-w-2xl rounded-xl border border-logia-700 shadow-2xl flex flex-col max-h-[90vh]">
                 <div className="p-4 border-b border-logia-700 flex justify-between items-center bg-logia-900 rounded-t-xl">
                     <h3 className="font-bold text-white">Gestión de Pagos</h3>
                     <button onClick={() => setEditingUserLedger(null)} className="text-gray-400 hover:text-white text-xl">×</button>
                 </div>
                 <div className="overflow-y-auto p-4 space-y-2 flex-1">
                     <p className="text-xs text-gray-500 mb-2">Registra monto recibido y fecha exacta de pago.</p>
                     {editPayments.map(p => {
                         const total = p.amount + (p.extraAmount || 0);
                         return (
                             <div key={p.period} className="bg-logia-900 p-3 rounded border border-logia-700 flex flex-col gap-2">
                                 <div className="flex justify-between items-center">
                                     <div className="font-bold text-indigo-300">{p.period}</div>
                                     <div className="text-xs text-gray-400">
                                         Base: ${p.amount} {p.extraAmount ? `+ Extra: $${p.extraAmount}` : ''} = <span className="text-white font-bold">${total}</span>
                                     </div>
                                 </div>
                                 
                                 <div className="flex flex-wrap items-center gap-2">
                                     <div className="flex flex-col">
                                         <label className="text-[9px] text-gray-500 uppercase">Pago Mensual</label>
                                         <input 
                                            type="number" 
                                            placeholder="$0" 
                                            value={p.paidRegular ?? 0} 
                                            onChange={(e) => {
                                                const valStr = e.target.value;
                                                const val = valStr === '' ? 0 : parseFloat(valStr);
                                                const newPaidReg = isNaN(val) ? 0 : val;
                                                setEditPayments(prev => prev.map(x => x.period === p.period ? {
                                                    ...x, 
                                                    paidRegular: newPaidReg,
                                                    regularCovered: newPaidReg >= x.amount,
                                                    paid: newPaidReg + (x.paidExtra || 0)
                                                } : x));
                                            }}
                                            onFocus={(e) => e.target.select()}
                                            disabled={isReadOnly}
                                            className="w-20 bg-logia-800 border border-logia-600 rounded p-1 text-white text-right"
                                         />
                                     </div>
                                     <div className="flex flex-col">
                                         <label className="text-[9px] text-gray-500 uppercase">Pago Extra</label>
                                         <input 
                                            type="number" 
                                            placeholder="$0" 
                                            value={p.paidExtra ?? 0} 
                                            onChange={(e) => {
                                                const valStr = e.target.value;
                                                const val = valStr === '' ? 0 : parseFloat(valStr);
                                                const newPaidExtra = isNaN(val) ? 0 : val;
                                                setEditPayments(prev => prev.map(x => x.period === p.period ? {
                                                    ...x, 
                                                    paidExtra: newPaidExtra,
                                                    extraCovered: newPaidExtra >= (x.extraAmount || 0),
                                                    paid: (x.paidRegular || 0) + newPaidExtra
                                                } : x));
                                            }}
                                            onFocus={(e) => e.target.select()}
                                            disabled={isReadOnly}
                                            className="w-20 bg-logia-800 border border-logia-600 rounded p-1 text-white text-right"
                                         />
                                     </div>
                                     {/* ...rest of payment row... */}
                                     <div className="flex flex-col">
                                         <label className="text-[9px] text-gray-500 uppercase">Fecha Recepción</label>
                                         <input 
                                             type="date"
                                             value={p.paymentDate ? p.paymentDate.slice(0, 10) : ''}
                                             onChange={(e) => {
                                                 const d = e.target.value;
                                                 setEditPayments(prev => prev.map(x => x.period === p.period ? {...x, paymentDate: d ? new Date(d).toISOString() : null} : x));
                                             }}
                                             disabled={isReadOnly}
                                             className="bg-logia-800 border border-logia-600 rounded p-1 text-white text-xs w-32"
                                         />
                                     </div>

                                     <div className="flex flex-col flex-1">
                                         <label className="text-[9px] text-gray-500 uppercase">Comentarios</label>
                                         <input 
                                            type="text" 
                                            placeholder="Ej. Transferencia..." 
                                            value={p.comments || ''} 
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setEditPayments(prev => prev.map(x => x.period === p.period ? {...x, comments: val} : x));
                                            }}
                                            disabled={isReadOnly}
                                            className="w-full bg-logia-800 border border-logia-600 rounded p-1 text-white text-xs"
                                         />
                                     </div>

                                     <div className="flex gap-1 mt-3 md:mt-0">
                                         <button 
                                            onClick={() => handleSavePaymentRow(p)} 
                                            disabled={isReadOnly}
                                            className="bg-green-600 hover:bg-green-500 text-white p-1 rounded text-xs px-2 h-8 flex items-center"
                                            title="Guardar Cambios"
                                         >
                                             💾
                                         </button>
                                         <button 
                                            onClick={() => handleDeletePaymentRow(p.period)} 
                                            disabled={isReadOnly}
                                            className="bg-red-600 hover:bg-red-500 text-white p-1 rounded text-xs px-2 h-8 flex items-center"
                                            title="Eliminar Registro"
                                         >
                                             🗑️
                                         </button>
                                     </div>
                                 </div>
                             </div>
                         );
                     })}
                 </div>
             </div>
         </div>
      )}

      {/* SECURITY RULES MODAL */}
      {showRules && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-logia-800 w-full max-w-3xl rounded-xl border border-logia-700 shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
             <button onClick={() => setShowRules(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">✕</button>
             <h3 className="text-xl font-bold text-white mb-4">Reglas de Seguridad (Firestore)</h3>
             <p className="text-gray-400 text-sm mb-4">
                 Para permitir el registro de usuarios en las logias, copia este código en tu consola de Firebase:
             </p>
             <div className="relative">
                 <pre className="bg-black p-4 rounded text-green-400 text-xs overflow-x-auto select-all border border-gray-700">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isOwner(userId) { return isSignedIn() && request.auth.uid == userId; }
    
    // PERMITE ESCRITURA A 'ADMIN' O 'MASTER'
    function isAdmin() { 
      return isSignedIn() && 
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'master']; 
    }

    // USUARIOS
    match /users/{userId} {
      allow read: if isSignedIn();
      allow write: if isOwner(userId) || isAdmin();
      
      match /ledger/{docId} { 
        allow read: if isSignedIn();
        allow write: if isAdmin(); 
      }
      match /attendance/{docId} { 
        allow read: if isSignedIn();
        allow write: if isAdmin(); 
      }
    }
    
    // LOGIAS (Grupos) - Permitir lectura pública para el registro
    match /groups/{groupId} {
      allow read: if true; // <--- CAMBIO: Permitir ver lista al registrarse
      allow write: if isAdmin(); // Solo admin crea grupos
      
      match /treasury/{docId} {
        allow read: if isSignedIn();
        allow write: if isAdmin();
      }
      
      match /notices/{noticeId} {
        allow read: if isSignedIn();
        allow write: if isAdmin();
      }
    }
    
    // TRIVIA
    match /trivias/{triviaId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
      match /answers/{userId} {
         allow read: if isSignedIn();
         allow write: if isOwner(userId) || isAdmin();
      }
    }
  }
}`}
                 </pre>
                 <button 
                  onClick={() => {
                      navigator.clipboard.writeText(`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isOwner(userId) { return isSignedIn() && request.auth.uid == userId; }
    function isAdmin() { 
      return isSignedIn() && 
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'master']; 
    }

    match /users/{userId} {
      allow read: if isSignedIn();
      allow write: if isOwner(userId) || isAdmin();
      
      match /ledger/{docId} { 
        allow read: if isSignedIn();
        allow write: if isAdmin(); 
      }
      match /attendance/{docId} { 
        allow read: if isSignedIn();
        allow write: if isAdmin(); 
      }
    }
    
    match /groups/{groupId} {
      allow read: if true;
      allow write: if isAdmin();
      
      match /treasury/{docId} {
        allow read: if isSignedIn();
        allow write: if isAdmin();
      }
      
      match /notices/{noticeId} {
        allow read: if isSignedIn();
        allow write: if isAdmin();
      }
    }
    
    match /trivias/{triviaId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
      match /answers/{userId} {
         allow read: if isSignedIn();
         allow write: if isOwner(userId) || isAdmin();
      }
    }
  }
}`);
                      alert("Reglas copiadas al portapapeles");
                  }}
                  className="absolute top-2 right-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1 rounded"
                >
                    Copiar
                </button>
             </div>
          </div>
        </div>
      )}

      {/* ... (Other Modals: Screenshot, DeletePrice, DeleteTreasury, EditPrice are the same as before) ... */}
      {/* SCREENSHOT DASHBOARD MODAL */}
      {screenshotUser && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-4" onClick={() => setScreenshotUser(null)}>
           <div className="bg-white text-slate-900 w-full max-w-md rounded-none shadow-2xl p-8 relative" onClick={e => e.stopPropagation()}>
               <div className="border-b-4 border-slate-900 pb-4 mb-6">
                   <h1 className="text-3xl font-bold uppercase tracking-tighter">Estado de Cuenta</h1>
                   <p className="text-slate-500 text-sm">Logia Masónica</p>
               </div>
               
               <div className="flex justify-between items-end mb-8">
                   <div>
                       <p className="text-xs uppercase font-bold text-slate-400">Miembro</p>
                       <h2 className="text-2xl font-bold">{screenshotUser.name}</h2>
                       <p className="text-sm">{screenshotUser.email}</p>
                   </div>
                   <div className="text-right">
                       <p className="text-xs uppercase font-bold text-slate-400">Fecha Corte</p>
                       <p className="text-lg font-mono">{new Date().toLocaleDateString()}</p>
                   </div>
               </div>
               
               <div className="bg-slate-100 p-6 rounded-lg mb-8">
                   <p className="text-center text-sm uppercase font-bold text-slate-500 mb-2">Saldo Pendiente Total</p>
                   <p className="text-center text-5xl font-black text-slate-900">
                       ${(userStats[screenshotUser.uid]?.totalDebt || 0).toLocaleString()}
                   </p>
               </div>
               
               <div className="grid grid-cols-2 gap-4 text-center text-sm">
                   <div>
                       <p className="font-bold text-slate-500">Total Pagado Histórico</p>
                       <p className="font-mono">${(userStats[screenshotUser.uid]?.totalPaid || 0).toLocaleString()}</p>
                   </div>
                   <div>
                       <p className="font-bold text-slate-500">Total Facturado</p>
                       <p className="font-mono">${(userStats[screenshotUser.uid]?.totalBilled || 0).toLocaleString()}</p>
                   </div>
               </div>
               
               <div className="mt-8 text-center text-xs text-slate-400">
                   <p>Favor de realizar su pago a la brevedad.</p>
               </div>
           </div>
        </div>
      )}
      
      {/* DELETE PRICE CONFIRM MODAL */}
      {showDeletePriceModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-6">
            <div className="bg-logia-800 border border-red-500 p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
                <div className="text-4xl mb-4">⚠️</div>
                <h3 className="text-xl font-bold text-white mb-2">¿Eliminar precio histórico?</h3>
                <p className="text-gray-400 mb-6">
                    Estás a punto de borrar la cuota del periodo: <span className="text-white font-bold">{deletingPriceDate}</span>.
                </p>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowDeletePriceModal(false)}
                        className="flex-1 py-3 bg-gray-700 text-white rounded font-bold"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleExecuteDeletePrice}
                        className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded font-bold"
                    >
                        Sí, Eliminar
                    </button>
                </div>
            </div>
        </div>
      )}
      
      {/* DELETE TREASURY CONFIRM MODAL */}
      {showDeleteTreasuryModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-6">
            <div className="bg-logia-800 border border-red-500 p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
                <div className="text-4xl mb-4">🗑️</div>
                <h3 className="text-xl font-bold text-white mb-2">¿Eliminar Movimiento?</h3>
                <p className="text-gray-400 mb-6">
                    Esta acción es irreversible y afectará el Balance Global.
                </p>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowDeleteTreasuryModal(false)}
                        className="flex-1 py-3 bg-gray-700 text-white rounded font-bold"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleExecuteDeleteTreasury}
                        className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded font-bold"
                    >
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
      )}
      
      {/* EDIT PRICE MODAL */}
      {showEditPriceModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-logia-800 w-full max-w-sm rounded-xl border border-logia-700 shadow-2xl p-6">
                  <h3 className="text-lg font-bold text-white mb-4">Editar Precio Histórico</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs text-gray-400 uppercase">Periodo Inicio</label>
                          <input 
                            type="month" 
                            value={editPriceData.startDate} 
                            onChange={e => setEditPriceData({...editPriceData, startDate: e.target.value})}
                            className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white"
                          />
                      </div>
                      <div>
                          <label className="text-xs text-gray-400 uppercase">Monto</label>
                          <input 
                            type="number" 
                            value={editPriceData.amount} 
                            onChange={e => setEditPriceData({...editPriceData, amount: Number(e.target.value)})}
                            className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white"
                          />
                      </div>
                      <div className="flex gap-2 pt-2">
                          <button onClick={() => setShowEditPriceModal(false)} className="flex-1 bg-gray-700 py-2 rounded text-white">Cancelar</button>
                          <button onClick={handleUpdatePrice} className="flex-1 bg-green-600 hover:bg-green-500 py-2 rounded text-white font-bold">Guardar</button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* DELETE NOTICE CONFIRM MODAL */}
      {showDeleteNoticeModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-6">
            <div className="bg-logia-800 border border-red-500 p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
                <div className="text-4xl mb-4">⚠️</div>
                <h3 className="text-xl font-bold text-white mb-2">¿Eliminar Aviso?</h3>
                <p className="text-gray-400 mb-6">
                    Esta acción es irreversible.
                </p>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowDeleteNoticeModal(false)}
                        className="flex-1 py-3 bg-gray-700 text-white rounded font-bold"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleExecuteDeleteNotice}
                        className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded font-bold"
                    >
                        Sí, Eliminar
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* DELETE TRIVIA CONFIRM MODAL */}
      {showDeleteTriviaModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-6">
            <div className="bg-logia-800 border border-red-500 p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
                <div className="text-4xl mb-4">⚠️</div>
                <h3 className="text-xl font-bold text-white mb-2">¿Eliminar Trivia?</h3>
                <p className="text-gray-400 mb-6">
                    Esta acción eliminará la pregunta y todas las respuestas asociadas.
                </p>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowDeleteTriviaModal(false)}
                        className="flex-1 py-3 bg-gray-700 text-white rounded font-bold"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleExecuteDeleteTrivia}
                        className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded font-bold"
                    >
                        Sí, Eliminar
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* DELETE VISIT REQUEST CONFIRM MODAL */}
      {showDeleteVisitModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-6">
            <div className="bg-logia-800 border border-red-500 p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
                <div className="text-4xl mb-4">⚠️</div>
                <h3 className="text-xl font-bold text-white mb-2">¿Eliminar Solicitud de Visita?</h3>
                <p className="text-gray-400 mb-6">
                    Esta acción eliminará la solicitud y todo el historial de chat asociado.
                </p>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowDeleteVisitModal(false)}
                        className="flex-1 py-3 bg-gray-700 text-white rounded font-bold"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleExecuteDeleteVisit}
                        className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded font-bold"
                    >
                        Sí, Eliminar
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* DELETE EXTRA FEE CONFIRM MODAL */}
      {showDeleteExtraFeeModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-6">
            <div className="bg-logia-800 border border-red-500 p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
                <div className="text-4xl mb-4">⚠️</div>
                <h3 className="text-xl font-bold text-white mb-2">¿Eliminar Cuota Extraordinaria?</h3>
                <p className="text-gray-400 mb-6">
                    Esta acción eliminará el registro y revertirá los montos en los ledgers de los usuarios afectados.
                </p>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowDeleteExtraFeeModal(false)}
                        className="flex-1 py-3 bg-gray-700 text-white rounded font-bold"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={executeDeleteExtraFee}
                        className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded font-bold"
                    >
                        Sí, Eliminar y Revertir
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* EDIT EXTRA FEE MODAL */}
      {showEditExtraFeeModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-6">
            <div className="bg-logia-800 border border-purple-500 p-6 rounded-xl max-w-md w-full shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-white">Editar Cuota Extraordinaria</h3>
                    <button 
                        onClick={() => setShowEditExtraFeeModal(false)}
                        className="text-gray-400 hover:text-white text-2xl"
                    >
                        ×
                    </button>
                </div>
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Monto</label>
                        <input 
                            type="number"
                            value={editExtraFeeData.amount}
                            onChange={e => setEditExtraFeeData({...editExtraFeeData, amount: Number(e.target.value)})}
                            className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Descripción</label>
                        <input 
                            type="text"
                            value={editExtraFeeData.description}
                            onChange={e => setEditExtraFeeData({...editExtraFeeData, description: e.target.value})}
                            className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white"
                        />
                    </div>
                </div>
                <div className="flex gap-3 mt-6">
                    <button 
                        onClick={() => setShowEditExtraFeeModal(false)}
                        className="flex-1 py-3 bg-gray-700 text-white rounded font-bold"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={executeEditExtraFee}
                        className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold"
                    >
                        Guardar Cambios
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default Admin;
