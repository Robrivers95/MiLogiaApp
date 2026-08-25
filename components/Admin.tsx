
import React, { useState, useEffect } from 'react';
import { User, Payment, IndividualExtraFee, PriceHistoryEntry, Role, MasonicDegree, LodgeRole, TreasuryEntry, FundSource, TreasuryAllocation, Notice, Task, Trivia, VisitRequest, Group, BankBalance, ExtraFee, PaymentReceipt } from '../types';
import { dataService, generateTriviaWithAI, authService, notificationService } from '../services/api';
import { doc, deleteDoc, collection, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useReadOnly } from '../contexts/ReadOnlyContext';


interface Props {
  user: User;
}

type Tab = 'dashboard' | 'requests' | 'users' | 'fees' | 'attendance' | 'trivia' | 'treasury' | 'notices' | 'tasks' | 'banks' | 'visits' | 'payment-matrix' | 'create-user' | 'manual-merge' | 'receipts' | 'debt-notify';

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
  const [attStats, setAttStats] = useState<Record<string, { total: number; present: number; absent: number; percentage: number }>>({});

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
  const [noticeImageFile, setNoticeImageFile] = useState<File | null>(null);
  const [noticeImagePreview, setNoticeImagePreview] = useState<string | null>(null);
  const [noticeSendPush, setNoticeSendPush] = useState(true);

  // Tasks State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskMode, setNewTaskMode] = useState<'individual' | 'team'>('individual');
  const [newTaskAssignees, setNewTaskAssignees] = useState<Set<string>>(new Set());
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [showDeleteTaskModal, setShowDeleteTaskModal] = useState(false);

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
  const [extraFeeType, setExtraFeeType] = useState<'mass' | 'individual' | 'mass-individual'>('mass');
  const [selectedUserForFee, setSelectedUserForFee] = useState<string>('');
  const [deletingExtraFeeId, setDeletingExtraFeeId] = useState<string | null>(null);
  const [showDeleteExtraFeeModal, setShowDeleteExtraFeeModal] = useState(false);
  const [editingExtraFeeId, setEditingExtraFeeId] = useState<string | null>(null);
  const [editExtraFeeData, setEditExtraFeeData] = useState({ description: '', amount: 0 });
  const [showEditExtraFeeModal, setShowEditExtraFeeModal] = useState(false);

  // Apply Monthly Fee State
  const [applyingMonthlyFee, setApplyingMonthlyFee] = useState(false);
  const [monthlyFeePeriod, setMonthlyFeePeriod] = useState('');

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
  const [matrixFilter, setMatrixFilter] = useState<'regular' | 'extra' | 'all'>('regular');
  const [matrixExtraDesc, setMatrixExtraDesc] = useState<string>('');
  const [showMatrixReceiptsModal, setShowMatrixReceiptsModal] = useState(false);
  const [reconcilingMatrixConcept, setReconcilingMatrixConcept] = useState(false);
  // Cuota extra masiva
  const [showBulkExtraPanel, setShowBulkExtraPanel] = useState(false);
  const [bulkExtraDesc, setBulkExtraDesc] = useState('');
  const [bulkExtraAmount, setBulkExtraAmount] = useState('');
  const [bulkExtraPeriod, setBulkExtraPeriod] = useState('');
  const [bulkExtraTargets, setBulkExtraTargets] = useState<'all' | 'select'>('all');
  const [bulkExtraSelected, setBulkExtraSelected] = useState<string[]>([]);
  const [creatingBulkExtra, setCreatingBulkExtra] = useState(false);
  const [bulkExtraMsg, setBulkExtraMsg] = useState<{text: string; type: 'success'|'error'} | null>(null);
  // Cerrar/perdonar cuota extra
  const [showForgivePanel, setShowForgivePanel] = useState(false);
  const [forgiveNote, setForgiveNote] = useState('');
  const [forgivePeriod, setForgivePeriod] = useState<string>('');
  const [forgivingFee, setForgivingFee] = useState(false);
  const [forgiveMsg, setForgiveMsg] = useState<{text: string; type: 'success'|'error'} | null>(null);
  // Mostrar cuotas extras cerradas en filtro
  const [showClosedExtraFilters, setShowClosedExtraFilters] = useState(false);

  // Manual Merge State
  const [tempUsers, setTempUsers] = useState<User[]>([]);
  const [selectedTempUser, setSelectedTempUser] = useState<string | null>(null);
  const [selectedRealUser, setSelectedRealUser] = useState<string | null>(null);
  const [mergingUsers, setMergingUsers] = useState(false);

  // Modals
  const [editingUserLedger, setEditingUserLedger] = useState<string | null>(null);
  const [editPayments, setEditPayments] = useState<Payment[]>([]);
  
  // Individual Extra Fees management (v3.1.0)
  const [addingExtraFeeForPeriod, setAddingExtraFeeForPeriod] = useState<string | null>(null);
  const [newExtraFeeDesc, setNewExtraFeeDesc] = useState('');
  const [newExtraFeeAmount, setNewExtraFeeAmount] = useState(0);
  
  // v3.2.0: Edit individual extra fees
  const [editingExtraFee, setEditingExtraFee] = useState<{ period: string; feeId: string } | null>(null);
  const [editExtraFeeDesc, setEditExtraFeeDesc] = useState('');
  const [editExtraFeeAmount, setEditExtraFeeAmount] = useState(0);
  
  // Advanced Payment Modal (Multi-month)
  const [showAdvancedPaymentModal, setShowAdvancedPaymentModal] = useState(false);
  const [advancedPaymentUser, setAdvancedPaymentUser] = useState<User | null>(null);
  const [advancedPaymentStartPeriod, setAdvancedPaymentStartPeriod] = useState('');
  const [advancedPaymentMonths, setAdvancedPaymentMonths] = useState(1);
  const [advancedPaymentAmount, setAdvancedPaymentAmount] = useState(0);
  const [advancedPaymentDate, setAdvancedPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [advancedPaymentComments, setAdvancedPaymentComments] = useState('');
  const [editingUserProfile, setEditingUserProfile] = useState<User | null>(null);
  
  // Expandible Users Table State (v3.3.0)
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [userPaymentsCache, setUserPaymentsCache] = useState<Record<string, Payment[]>>({});
  const [showRules, setShowRules] = useState(false);
  const [screenshotUser, setScreenshotUser] = useState<User | null>(null);
  
  // Edit Price Modal
  const [showEditPriceModal, setShowEditPriceModal] = useState(false);
  const [editPriceData, setEditPriceData] = useState<PriceHistoryEntry>({ startDate: '', amount: 0 });
  const [originalEditDate, setOriginalEditDate] = useState('');

  // Hamburger Menu State
  const [showMenu, setShowMenu] = useState(false);
  
  // Migration State (v3.4.2)
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    totalUsers: number;
    totalPayments: number;
    migratedPayments: number;
    errors: string[];
  } | null>(null);
  const [showMigrationModal, setShowMigrationModal] = useState(false);

  // Payment Receipts State
  const [paymentReceipts, setPaymentReceipts] = useState<any[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [receiptRejectId, setReceiptRejectId] = useState<string | null>(null);
  const [receiptRejectUserId, setReceiptRejectUserId] = useState<string>('');
  const [rejectComments, setRejectComments] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [viewingReceiptImage, setViewingReceiptImage] = useState<string | null>(null);
  const [receiptFilter, setReceiptFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [expandedReceiptIds, setExpandedReceiptIds] = useState<Set<string>>(new Set());
  // Edit receipt before approving
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [editReceiptPeriods, setEditReceiptPeriods] = useState<string[]>([]);
  const [editReceiptAmount, setEditReceiptAmount] = useState<string>('');
  const [editReceiptType, setEditReceiptType] = useState<'cuota_mensual' | 'concepto_adicional'>('cuota_mensual');
  const [editReceiptConcept, setEditReceiptConcept] = useState<string>('');
  const [savingReceiptEdit, setSavingReceiptEdit] = useState(false);
  // Admin manual receipt photo upload
  const [adminPhotoPaymentPeriod, setAdminPhotoPaymentPeriod] = useState<string | null>(null);
  const [adminPhotoFile, setAdminPhotoFile] = useState<File | null>(null);
  const [uploadingAdminPhoto, setUploadingAdminPhoto] = useState(false);

  // Matrix Payment Modal State
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  const [matrixModalUid, setMatrixModalUid] = useState<string>('');
  const [matrixModalUserName, setMatrixModalUserName] = useState<string>('');
  const [matrixModalPeriod, setMatrixModalPeriod] = useState<string>('');
  const [matrixModalPayment, setMatrixModalPayment] = useState<Payment | null>(null);
  const [matrixModalAmountPaid, setMatrixModalAmountPaid] = useState<string>('');
  const [matrixModalComments, setMatrixModalComments] = useState<string>('');
  const [matrixModalFile, setMatrixModalFile] = useState<File | null>(null);
  const [matrixModalPreview, setMatrixModalPreview] = useState<string | null>(null);
  const [savingMatrixPayment, setSavingMatrixPayment] = useState(false);

  // Debt Notification State
  const [debtNotifTarget, setDebtNotifTarget] = useState<'all' | 'selected'>('all');
  const [debtNotifSelected, setDebtNotifSelected] = useState<string[]>([]);
  const [sendingDebtNotif, setSendingDebtNotif] = useState(false);
  const [debtNotifMsg, setDebtNotifMsg] = useState<{text: string; type: 'success' | 'error'} | null>(null);

  // PERMISSIONS
  const suspended = useReadOnly();
  const isReadOnly = user.role === 'viewer' || suspended;
  
  // Calculate pending users
  const pendingUsers = users.filter(u => !u.active && !u.leaveDate);

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
      if (activeTab === 'tasks') {
          loadTasks();
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
          loadPaymentReceipts();
      }
      if (activeTab === 'manual-merge') {
          loadTempUsers();
      }
      if (activeTab === 'receipts') {
          loadPaymentReceipts();
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

  const loadTempUsers = async () => {
    try {
        const data = await dataService.getUsers(user.groupId);
        // Filter only temp users (uid starts with 'temp_')
        const tempUsersFiltered = data.filter(u => u.uid.startsWith('temp_'));
        setTempUsers(tempUsersFiltered);
    } catch (e) {
        console.error("Error loading temp users", e);
        showMessage("Error cargando usuarios temporales", 'error');
    }
  };

  const loadPaymentReceipts = async () => {
    setLoadingReceipts(true);
    try {
      const recs = await dataService.getPaymentReceipts(user.groupId);
      setPaymentReceipts(recs);
    } catch (e) {
      console.error("Error loading receipts", e);
    } finally {
      setLoadingReceipts(false);
    }
  };

  const startEditingReceipt = (receipt: any) => {
    setEditingReceiptId(receipt.id);
    setEditReceiptPeriods(receipt.periods || []);
    setEditReceiptAmount(receipt.amount != null ? String(receipt.amount) : '');
    setEditReceiptType(receipt.receiptType || 'cuota_mensual');
    setEditReceiptConcept(receipt.conceptDescription || '');
  };

  const cancelEditingReceipt = () => {
    setEditingReceiptId(null);
    setEditReceiptPeriods([]);
    setEditReceiptAmount('');
    setEditReceiptType('cuota_mensual');
    setEditReceiptConcept('');
  };

  const saveReceiptEdit = async (receipt: any) => {
    setSavingReceiptEdit(true);
    try {
      await dataService.updatePaymentReceipt(receipt.groupId || user.groupId, receipt.id, {
        periods: editReceiptPeriods,
        amount: editReceiptAmount !== '' ? Number(editReceiptAmount) : undefined,
        receiptType: editReceiptType,
        conceptDescription: editReceiptType === 'concepto_adicional' ? editReceiptConcept : undefined,
      });
      cancelEditingReceipt();
      loadPaymentReceipts();
    } catch (e) {
      console.error("Error saving receipt edit", e);
    } finally {
      setSavingReceiptEdit(false);
    }
  };

  const handleAdminPhotoUpload = async (memberId: string, period: string) => {
    if (!adminPhotoFile) return;
    setUploadingAdminPhoto(true);
    try {
      const url = await dataService.uploadAdminReceipt(memberId, period, user.groupId, adminPhotoFile);
      showMessage(`✅ Comprobante subido correctamente`, 'success');
      // Refresh ledger data
      setAllUserLedgers(prev => {
        const prevPayments = prev[memberId] || [];
        return {
          ...prev,
          [memberId]: prevPayments.map(p => p.period === period ? { ...p, adminReceiptUrl: url } : p)
        };
      });
      setAdminPhotoFile(null);
      setAdminPhotoPaymentPeriod(null);
    } catch (e) {
      showMessage('Error al subir la foto', 'error');
      console.error(e);
    } finally {
      setUploadingAdminPhoto(false);
    }
  };

  const loadAllLedgers = async () => {
    try {
        const results = await Promise.allSettled(
            users.map(async u => {
                const paymentsSnap = await getDocs(collection(db, "users", u.uid, "ledger"));
                const payments = paymentsSnap.docs.map(doc => ({ ...doc.data(), period: doc.id } as Payment));
                return [u.uid, payments] as [string, Payment[]];
            })
        );
        const ledgers: Record<string, Payment[]> = {};
        results.forEach(result => {
            if (result.status === 'fulfilled') {
                const [uid, payments] = result.value;
                ledgers[uid] = payments;
            }
        });
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
      try {
          // Fetch attendance for all users in parallel, handling individual failures gracefully
          const results = await Promise.allSettled(
              users.map(u => dataService.getAttendance(u.uid))
          );
          const allAttendanceArrays: import('../types').Attendance[][] = results.map((r, i) => {
              if (r.status === 'fulfilled') return r.value;
              console.warn(`Failed to load attendance for user ${users[i]?.uid}`, (r as PromiseRejectedResult).reason);
              return [];
          });

          // Collect all unique dates
          const dates = new Set<string>();
          allAttendanceArrays.forEach(attArr => attArr.forEach(a => dates.add(a.date)));
          const allDates = Array.from(dates).sort().reverse();
          setAttHistory(allDates);

          // Build per-user attendance lookup from already-fetched data
          const stats: Record<string, { total: number; present: number; absent: number; percentage: number }> = {};
          users.forEach((u, idx) => {
              const userAttendance = allAttendanceArrays[idx];
              const attendedDates = new Set(userAttendance.map(a => a.date));

              // Determine the user's join date for filtering
              const joinDate = u.masonicRejoinDate || u.masonicJoinDate;

              // Only count meetings that occurred after the user's join date
              const relevantDates = joinDate ? allDates.filter(d => d >= joinDate) : allDates;

              const present = relevantDates.filter(d => attendedDates.has(d)).length;
              const total = relevantDates.length;
              const absent = total - present;
              const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

              stats[u.uid] = { total, present, absent, percentage };
          });

          setAttStats(stats);
      } catch (e) {
          console.error('Error cargando historial de asistencia', e);
      }
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

  const loadTasks = async () => {
      try {
          const data = await dataService.getTasks(user.groupId);
          setTasks(data);
      } catch (e) {
          console.error("Error cargando tareas", e);
          showMessage("Error cargando tareas", 'error');
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
      if (isReadOnly) return;
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
  
  const handleMigrateExtraFees = async () => {
      if (isReadOnly) {
          showMessage("No tienes permisos para ejecutar migraciones", 'error');
          return;
      }
      
      if (!confirm('⚠️ MIGRACIÓN DE DATOS\n\nEsta operación convertirá todas las cuotas extraordinarias del formato antiguo al nuevo formato con array extraFees.\n\n¿Continuar?')) {
          return;
      }
      
      try {
          setIsMigrating(true);
          setShowMigrationModal(true);
          console.log('🚀 Iniciando migración de cuotas extraordinarias...');
          
          const result = await dataService.migrateExtraFeesToNewFormat(user.groupId);
          
          setMigrationResult(result);
          
          if (result.errors.length === 0) {
              showMessage(`✅ Migración completada: ${result.migratedPayments} pagos migrados`, 'success');
          } else {
              showMessage(`⚠️ Migración completada con ${result.errors.length} errores`, 'error');
          }
          
          // Reload data to reflect changes
          await loadUsers();
          
      } catch (e: any) {
          console.error('Error en migración:', e);
          showMessage(`Error en migración: ${e.message}`, 'error');
          setMigrationResult({
              totalUsers: 0,
              totalPayments: 0,
              migratedPayments: 0,
              errors: [e.message]
          });
      } finally {
          setIsMigrating(false);
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
          } else if (extraFeeType === 'mass-individual') {
              // v3.2.0: Apply individual extra fees to all users
              await dataService.assignIndividualExtraFeeToAll(
                  user.groupId!,
                  extraFeePeriod,
                  extraFeeAmount,
                  extraFeeDesc,
                  user.uid,
                  user.name
              );
              showMessage("Cuotas individuales aplicadas a todos los usuarios");
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
      if (isReadOnly || !deletingExtraFeeId) return;
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
    const targetUser = users.find(u => u.uid === uid);
    if (!current && targetUser && !targetUser.groupId) await dataService.assignUserToGroup(uid, user.groupId);
    if (current) {
      const leaveDate = window.prompt('Fecha de baja (YYYY-MM-DD). El historial contable se conservará:', targetUser?.leaveDate || new Date().toISOString().slice(0, 10));
      if (!leaveDate) return;
      await dataService.updateUser(uid, { active: false, leaveDate });
      showMessage('Usuario dado de baja; conserva historial y ya no recibe cargos ni notificaciones.');
    } else {
      const rejoinDate = window.prompt('Fecha de reingreso (YYYY-MM-DD). Las cuotas correrán desde esta fecha:', targetUser?.masonicRejoinDate || new Date().toISOString().slice(0, 10));
      if (!rejoinDate) return;
      await dataService.updateUser(uid, { active: true, masonicRejoinDate: rejoinDate, leaveDate: undefined });
      showMessage('Usuario reactivado desde la fecha de reingreso.');
    }
    await loadUsers();
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

  const handleDownloadCSV = async () => {
      try {
          // Headers con columnas detalladas por mes y concepto
          const headers = "Nombre,Email,Rol,Estado,Ciudad,Grado,Fecha Ingreso,Periodo,Año,Mes,Concepto,Cuota,Pagado,Deuda,Fecha Pago,Comentarios\n";
          
          const csvRows: string[] = [];
          
          // Para cada usuario, obtener sus pagos y crear filas por cada concepto
          for (const u of filteredUsers) {
              try {
                  // Obtener los pagos del usuario
                  const payments = await dataService.getPayments(u.uid);
                  
                  // Si tiene pagos, crear una fila por cada concepto (regular + extras)
                  if (payments.length > 0) {
                      // Ordenar por período
                      payments.sort((a, b) => a.period.localeCompare(b.period));
                      
                      for (const p of payments) {
                          // Parsear el período YYYY-MM
                          const [year, month] = p.period.split('-');
                          const monthName = new Date(parseInt(year), parseInt(month) - 1, 1)
                              .toLocaleString('es', { month: 'long' });
                          const monthCapitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                          const paymentDate = p.paymentDate ? p.paymentDate.slice(0, 10) : 'N/A';
                          const comments = p.comments || '';
                          
                          // Fila para cuota regular
                          const regularAmount = Number(p.amount) || 0;
                          const paidRegular = Number(p.paidRegular) || 0;
                          const regularDebt = regularAmount - paidRegular;
                          
                          const regularRow = [
                              `"${u.name}"`,
                              `"${u.email}"`,
                              `"${u.role}"`,
                              `"${u.active ? 'Activo' : 'Inactivo'}"`,
                              `"${u.city || 'N/A'}"`,
                              `"${u.degree || 'N/A'}"`,
                              `"${u.joinDate?.slice(0,10) || 'N/A'}"`,
                              `"${p.period}"`,
                              `"${year}"`,
                              `"${monthCapitalized}"`,
                              `"Cuota Regular"`,
                              regularAmount.toFixed(2),
                              paidRegular.toFixed(2),
                              regularDebt.toFixed(2),
                              `"${paymentDate}"`,
                              `"${comments}"`
                          ].join(',');
                          
                          csvRows.push(regularRow);
                          
                          // Filas para cuotas extras individuales (v3.1.0+)
                          if (p.extraFees && p.extraFees.length > 0) {
                              p.extraFees.forEach(fee => {
                                  const extraAmount = Number(fee.amount) || 0;
                                  const paidExtra = Number(fee.paid) || 0;
                                  const extraDebt = extraAmount - paidExtra;
                                  
                                  const extraRow = [
                                      `"${u.name}"`,
                                      `"${u.email}"`,
                                      `"${u.role}"`,
                                      `"${u.active ? 'Activo' : 'Inactivo'}"`,
                                      `"${u.city || 'N/A'}"`,
                                      `"${u.degree || 'N/A'}"`,
                                      `"${u.joinDate?.slice(0,10) || 'N/A'}"`,
                                      `"${p.period}"`,
                                      `"${year}"`,
                                      `"${monthCapitalized}"`,
                                      `"${fee.description}"`,
                                      extraAmount.toFixed(2),
                                      paidExtra.toFixed(2),
                                      extraDebt.toFixed(2),
                                      `"${paymentDate}"`,
                                      `"${comments}"`
                                  ].join(',');
                                  
                                  csvRows.push(extraRow);
                              });
                          }
                      }
                  } else {
                      // Si no tiene pagos, crear una fila con datos básicos del usuario
                      const row = [
                          `"${u.name}"`,
                          `"${u.email}"`,
                          `"${u.role}"`,
                          `"${u.active ? 'Activo' : 'Inactivo'}"`,
                          `"${u.city || 'N/A'}"`,
                          `"${u.degree || 'N/A'}"`,
                          `"${u.joinDate?.slice(0,10) || 'N/A'}"`,
                          '"N/A"',
                          '"N/A"',
                          '"N/A"',
                          '"Sin Datos"',
                          '0.00',
                          '0.00',
                          '0.00',
                          '"N/A"',
                          '""'
                      ].join(',');
                      
                      csvRows.push(row);
                  }
              } catch (e) {
                  console.error(`Error obteniendo pagos para ${u.name}:`, e);
                  // Continuar con el siguiente usuario en caso de error
              }
          }
          
          const csv = headers + csvRows.join('\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `miembros_detallado_${user.groupId}_${new Date().toISOString().slice(0,10)}.csv`;
          a.click();
          URL.revokeObjectURL(url);
          showMessage("CSV descargado exitosamente", 'success');
      } catch (e) {
          console.error(e);
          showMessage("Error descargando CSV", 'error');
      }
  };
  
  const normalizeConcept = (value?: string) => (value || '').trim().toLocaleLowerCase('es-MX');

  const getMatrixFilteredReceipts = (): PaymentReceipt[] => {
      if (matrixFilter !== 'extra' || !matrixExtraDesc) return [];
      return (paymentReceipts as PaymentReceipt[])
          .filter(receipt => {
              if (receipt.receiptType !== 'concepto_adicional') return false;
              if (normalizeConcept(receipt.conceptDescription) !== normalizeConcept(matrixExtraDesc)) return false;
              const receiptPeriod = receipt.extraFeePeriod || receipt.periods?.[0] || '';
              return !receiptPeriod || receiptPeriod.startsWith(String(matrixYear));
          })
          .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  };

  const getApprovedExtraReceiptTotal = (
      memberUid: string,
      period: string,
      description: string,
      feeId?: string
  ): { total: number; count: number } => {
      const normalizedDescription = normalizeConcept(description);
      const memberLedger = allUserLedgers[memberUid] || [];
      const matchingConceptPeriods = memberLedger.filter(payment => {
          if (!payment.period.startsWith(String(matrixYear))) return false;
          if (payment.extraFees?.length) {
              return payment.extraFees.some(fee => normalizeConcept(fee.description) === normalizedDescription);
          }
          return Number(payment.extraAmount) > 0 &&
              normalizeConcept(payment.extraDescription || 'Cuota Extra') === normalizedDescription;
      });

      const matchingReceipts = (paymentReceipts as PaymentReceipt[]).filter(receipt => {
          if (receipt.userId !== memberUid || receipt.status !== 'approved') return false;
          if (receipt.receiptType !== 'concepto_adicional') return false;
          if (normalizeConcept(receipt.conceptDescription) !== normalizedDescription) return false;

          if (feeId && receipt.extraFeeId) return receipt.extraFeeId === feeId;
          if (receipt.extraFeePeriod) return receipt.extraFeePeriod === period;
          if (receipt.periods?.length) return receipt.periods.includes(period);

          // Legacy: without period/fee id, infer only if this concept appears once
          // for this member in the selected year.
          return matchingConceptPeriods.length === 1 && matchingConceptPeriods[0].period === period;
      });

      return {
          total: matchingReceipts.reduce(
              (sum, receipt) => sum + (Number(receipt.appliedAmount ?? receipt.amount) || 0),
              0
          ),
          count: matchingReceipts.length
      };
  };

  const handleDownloadMatrixCSV = () => {
      const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      const activeUsers = filteredUsers.filter(u => u.active);
      const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const filterLabel = matrixFilter === 'regular'
          ? 'Cuota mensual'
          : matrixFilter === 'extra'
              ? matrixExtraDesc || 'Cuota extra'
              : 'General';

      const headers = [
          'Miembro', 'Concepto filtrado',
          ...months.flatMap(month => [`${month} Estado`, `${month} Cuota`, `${month} Pagado`, `${month} Pendiente`]),
          'Total Cuota', 'Total Pagado', 'Total Pendiente'
      ];

      const rows = activeUsers.map(member => {
          const ledger = allUserLedgers[member.uid] || [];
          let totalBilled = 0;
          let totalPaid = 0;
          let totalPending = 0;
          const monthCells: Array<string | number> = [];

          for (let i = 0; i < 12; i++) {
              const period = `${matrixYear}-${String(i + 1).padStart(2, '0')}`;
              const payment = ledger.find(p => p.period === period);
              let billed = 0;
              let paid = 0;
              let pending = 0;
              let status = 'Sin cuota';

              if (matrixFilter === 'regular') {
                  if (payment) {
                      billed = Number(payment.amount) || 0;
                      paid = Number(payment.paidRegular !== undefined ? payment.paidRegular : payment.paid) || 0;
                      pending = Math.max(0, billed - paid);
                      status = pending <= 0 ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente';
                  }
              } else if (matrixFilter === 'extra' && matrixExtraDesc) {
                  const fee = payment?.extraFees?.find(f => normalizeConcept(f.description) === normalizeConcept(matrixExtraDesc));
                  const legacyMatch = !payment?.extraFees?.length && Number(payment?.extraAmount) > 0 &&
                      normalizeConcept(payment?.extraDescription || 'Cuota Extra') === normalizeConcept(matrixExtraDesc);
                  if (fee) {
                      billed = Number(fee.amount) || 0;
                      const receiptEvidence = getApprovedExtraReceiptTotal(member.uid, period, fee.description, fee.id);
                      paid = receiptEvidence.count > 0
                          ? Math.min(billed, receiptEvidence.total)
                          : (Number(fee.paid) || 0);
                      pending = fee.forgiven ? 0 : Math.max(0, billed - paid);
                      status = fee.forgiven ? 'Perdonado' : pending <= 0 ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente';
                  } else if (payment && legacyMatch) {
                      billed = Number(payment.extraAmount) || 0;
                      const description = payment.extraDescription || 'Cuota Extra';
                      const receiptEvidence = getApprovedExtraReceiptTotal(member.uid, period, description);
                      paid = receiptEvidence.count > 0
                          ? Math.min(billed, receiptEvidence.total)
                          : (Number(payment.paidExtra) || 0);
                      pending = Math.max(0, billed - paid);
                      status = pending <= 0 ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente';
                  }
              } else if (payment) {
                  const regularBilled = Number(payment.amount) || 0;
                  const regularPaid = Number(payment.paidRegular !== undefined ? payment.paidRegular : payment.paid) || 0;
                  const fees = payment.extraFees || [];
                  const extraBilled = fees.length
                      ? fees.reduce((sum, fee) => sum + (Number(fee.amount) || 0), 0)
                      : (Number(payment.extraAmount) || 0);
                  const extraPaid = fees.length
                      ? fees.reduce((sum, fee) => sum + (Number(fee.paid) || 0), 0)
                      : (Number(payment.paidExtra) || 0);
                  const extraPending = fees.length
                      ? fees.reduce((sum, fee) => sum + (fee.forgiven ? 0 : Math.max(0, (Number(fee.amount) || 0) - (Number(fee.paid) || 0))), 0)
                      : Math.max(0, extraBilled - extraPaid);
                  billed = regularBilled + extraBilled;
                  paid = regularPaid + extraPaid;
                  pending = Math.max(0, regularBilled - regularPaid) + extraPending;
                  status = pending <= 0 ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente';
              }

              totalBilled += billed;
              totalPaid += paid;
              totalPending += pending;
              monthCells.push(status, billed.toFixed(2), paid.toFixed(2), pending.toFixed(2));
          }

          return [
              csvEscape(member.name),
              csvEscape(filterLabel),
              ...monthCells.map(csvEscape),
              totalBilled.toFixed(2), totalPaid.toFixed(2), totalPending.toFixed(2)
          ].join(',');
      });

      const csv = [headers.map(csvEscape).join(','), ...rows].join('\n');
      const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeConcept = filterLabel.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, '-').replace(/^-+|-+$/g, '');
      a.href = url;
      a.download = `matriz-${matrixYear}-${safeConcept || 'general'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showMessage(`CSV exportado: ${filterLabel}`, 'success');
  };

  const handleReconcileMatrixConcept = async () => {
      if (matrixFilter !== 'extra' || !matrixExtraDesc || isReadOnly) return;
      if (!window.confirm(
          `¿Recalcular los pagos de "${matrixExtraDesc}" en ${matrixYear} usando la suma de sus comprobantes APROBADOS?\n\n` +
          'Esto sirve para corregir registros antiguos que fueron marcados como 100% pagados por error.'
      )) return;
      setReconcilingMatrixConcept(true);
      try {
          const result = await dataService.reconcileExtraFeeFromReceipts(user.groupId, matrixExtraDesc, matrixYear);
          await Promise.all([loadAllLedgers(), loadUsers(), loadPaymentReceipts()]);
          showMessage(
              `✅ Reconciliación terminada: ${result.updated} registro(s) corregidos` +
              (result.skippedAmbiguous ? `; ${result.skippedAmbiguous} omitido(s) por período ambiguo.` : '.'),
              'success'
          );
      } catch (e: any) {
          showMessage(`Error al reconciliar: ${e?.message || e}`, 'error');
      } finally {
          setReconcilingMatrixConcept(false);
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
      if (isReadOnly || !deletingTreasuryId) return;
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

  const handleApplyMonthlyFee = async () => {
      if (isReadOnly || !monthlyFeePeriod || priceHistory.length === 0) {
          showMessage("Selecciona un periodo válido", 'error');
          return;
      }
      try {
          setApplyingMonthlyFee(true);
          
          // Find the applicable price for this period
          const sortedHistory = [...priceHistory].sort((a, b) => b.startDate.localeCompare(a.startDate));
          const applicable = sortedHistory.find(h => h.startDate <= monthlyFeePeriod);
          
          if (!applicable) {
              showMessage("No hay precio configurado para ese periodo", 'error');
              return;
          }
          
          let appliedCount = 0;
          
          // Apply to all active users who don't have the monthly fee for that period
          for (const u of filteredUsers.filter(usr => usr.active)) {
              const payments = await dataService.getPayments(u.uid);
              const existingPayment = payments.find(p => p.period === monthlyFeePeriod);
              
              // Check if monthly fee is missing (no payment record OR amount is 0)
              const needsMonthlyFee = !existingPayment || existingPayment.amount === 0;
              
              if (needsMonthlyFee) {
                  // If payment exists but amount is 0, update it
                  // If payment doesn't exist, create new one
                  const payment: Payment = existingPayment ? {
                      ...existingPayment,
                      amount: applicable.amount,
                      status: existingPayment.paid >= applicable.amount ? 'Pagado' : 'Pendiente',
                      regularCovered: existingPayment.paid >= applicable.amount,
                      comments: existingPayment.comments || `Cuota mensual aplicada retroactivamente`
                  } : {
                      period: monthlyFeePeriod,
                      amount: applicable.amount,
                      paid: 0,
                      paidRegular: 0,
                      paidExtra: 0,
                      status: 'Pendiente',
                      comments: `Cuota mensual aplicada retroactivamente`,
                      paymentDate: new Date().toISOString(),
                      groupId: user.groupId,
                      regularCovered: false,
                      extraCovered: true
                  };
                  
                  await dataService.updatePayment(u.uid, payment);
                  appliedCount++;
              }
          }
          
          showMessage(`✅ Cuota mensual aplicada a ${appliedCount} usuario(s)`);
          setMonthlyFeePeriod('');
          await loadUsers();
      } catch (e) {
          console.error(e);
          showMessage("Error aplicando cuota mensual", 'error');
      } finally {
          setApplyingMonthlyFee(false);
      }
  };
  const handleUpdateUserProfile = async () => {
      if (isReadOnly || !editingUserProfile) return;
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
          // Notificar al usuario que su perfil fue editado
          try {
            await notificationService.createNotification(
              [editingUserProfile.uid],
              user.groupId,
              'profile_edit',
              '📝 Tu perfil fue actualizado',
              `El administrador actualizó la información de tu cuenta`
            );
          } catch (_) {}
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
  
  // v3.1.0: Manejo de cuotas extras individuales
  const handleAddIndividualExtraFee = async (period: string) => {
      if (isReadOnly || !editingUserLedger || !newExtraFeeDesc.trim() || newExtraFeeAmount === 0) {
          showMessage("Completa descripción y monto", 'error');
          return;
      }
      
      try {
          // Find the payment for this period
          const currentPayment = editPayments.find(p => p.period === period);
          if (!currentPayment) {
              showMessage("Pago no encontrado", 'error');
              return;
          }
          
          // Create new extra fee object
          const newExtraFee: IndividualExtraFee = {
              id: `extra_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              description: newExtraFeeDesc.trim(),
              amount: newExtraFeeAmount,
              paid: 0,
              createdAt: new Date().toISOString(),
              createdBy: user.uid
          };
          
          // Add to payment's extraFees array
          const updatedExtraFees = currentPayment.extraFees ? [...currentPayment.extraFees, newExtraFee] : [newExtraFee];
          
          // Calculate new totals
          const totalExtraAmount = updatedExtraFees.reduce((sum, fee) => sum + fee.amount, 0);
          const totalExtraPaid = updatedExtraFees.reduce((sum, fee) => sum + fee.paid, 0);
          
          const updatedPayment: Payment = {
              ...currentPayment,
              extraFees: updatedExtraFees,
              extraAmount: totalExtraAmount, // Keep legacy field updated
              paidExtra: totalExtraPaid,
              paid: (currentPayment.paidRegular || 0) + totalExtraPaid,
              extraCovered: totalExtraPaid >= totalExtraAmount
          };
          
          await dataService.updatePayment(editingUserLedger, updatedPayment);
          showMessage("Cuota extra agregada ✅");
          
          // Reset form
          setNewExtraFeeDesc('');
          setNewExtraFeeAmount(0);
          setAddingExtraFeeForPeriod(null);
          
          // Reload payments
          const payments = await dataService.getPayments(editingUserLedger);
          setEditPayments(payments);
          await loadUsers();
      } catch (e) {
          console.error(e);
          showMessage("Error agregandocuota extra", 'error');
      }
  };
  
  const handleDeleteIndividualExtraFee = async (period: string, feeId: string) => {
      if (isReadOnly || !editingUserLedger) return;
      
      try {
          const currentPayment = editPayments.find(p => p.period === period);
          if (!currentPayment || !currentPayment.extraFees) return;
          
          // Remove the fee from the array
          const updatedExtraFees = currentPayment.extraFees.filter(f => f.id !== feeId);
          
          // Recalculate totals
          const totalExtraAmount = updatedExtraFees.reduce((sum, fee) => sum + fee.amount, 0);
          const totalExtraPaid = updatedExtraFees.reduce((sum, fee) => sum + fee.paid, 0);
          
          // Build update object without undefined fields
          const updatedPayment: Payment = {
              ...currentPayment,
              extraAmount: totalExtraAmount,
              paidExtra: totalExtraPaid,
              paid: (currentPayment.paidRegular || 0) + totalExtraPaid,
              extraCovered: totalExtraPaid >= totalExtraAmount
          };
          
          // Only include extraFees if there are items remaining
          if (updatedExtraFees.length > 0) {
              updatedPayment.extraFees = updatedExtraFees;
          } else {
              // Remove extraFees field from payment object
              delete (updatedPayment as any).extraFees;
          }
          
          // Update local state immediately for instant UI feedback
          setEditPayments(prev => prev.map(p => 
              p.period === period ? updatedPayment : p
          ));
          
          // Save to Firebase
          await dataService.updatePayment(editingUserLedger, updatedPayment);
          showMessage("Cuota extra eliminada");
          
          // Reload to ensure consistency
          const payments = await dataService.getPayments(editingUserLedger);
          setEditPayments(payments);
          await loadUsers();
      } catch (e) {
          console.error(e);
          showMessage("Error eliminando cuota extra", 'error');
      }
  };
  
  const handleUpdateIndividualExtraFeePaid = async (period: string, feeId: string, newPaid: number) => {
      if (isReadOnly || !editingUserLedger) return;
      
      try {
          const currentPayment = editPayments.find(p => p.period === period);
          if (!currentPayment || !currentPayment.extraFees) return;
          
          // Update the paid amount for the specific fee
          const updatedExtraFees = currentPayment.extraFees.map(f => 
              f.id === feeId ? { ...f, paid: newPaid } : f
          );
          
          // Recalculate totals
          const totalExtraAmount = updatedExtraFees.reduce((sum, fee) => sum + fee.amount, 0);
          const totalExtraPaid = updatedExtraFees.reduce((sum, fee) => sum + fee.paid, 0);
          
          const updatedPayment: Payment = {
              ...currentPayment,
              extraFees: updatedExtraFees,
              paidExtra: totalExtraPaid,
              paid: (currentPayment.paidRegular || 0) + totalExtraPaid,
              extraCovered: totalExtraPaid >= totalExtraAmount
          };
          
          // Update local state immediately for instant UI feedback
          setEditPayments(prev => prev.map(p => 
              p.period === period ? updatedPayment : p
          ));
          
          await dataService.updatePayment(editingUserLedger, updatedPayment);
          
          const payments = await dataService.getPayments(editingUserLedger);
          setEditPayments(payments);
          await loadUsers();
      } catch (e) {
          console.error(e);
          showMessage("Error actualizando pago", 'error');
      }
  };
  
  // v3.2.0: Edit individual extra fee (description and amount)
  const handleEditIndividualExtraFee = (period: string, feeId: string, currentDesc: string, currentAmount: number) => {
      setEditingExtraFee({ period, feeId });
      setEditExtraFeeDesc(currentDesc);
      setEditExtraFeeAmount(currentAmount);
  };
  
  const handleSaveEditedExtraFee = async () => {
      if (isReadOnly || !editingUserLedger || !editingExtraFee) return;
      if (!editExtraFeeDesc.trim() || editExtraFeeAmount === 0) {
          showMessage("Completa descripción y monto", 'error');
          return;
      }
      
      try {
          const currentPayment = editPayments.find(p => p.period === editingExtraFee.period);
          if (!currentPayment || !currentPayment.extraFees) return;
          
          // Update the description and amount for the specific fee
          const updatedExtraFees = currentPayment.extraFees.map(f => 
              f.id === editingExtraFee.feeId 
                  ? { ...f, description: editExtraFeeDesc.trim(), amount: editExtraFeeAmount } 
                  : f
          );
          
          // Recalculate totals
          const totalExtraAmount = updatedExtraFees.reduce((sum, fee) => sum + fee.amount, 0);
          const totalExtraPaid = updatedExtraFees.reduce((sum, fee) => sum + fee.paid, 0);
          
          const updatedPayment: Payment = {
              ...currentPayment,
              extraFees: updatedExtraFees,
              extraAmount: totalExtraAmount,
              paidExtra: totalExtraPaid,
              paid: (currentPayment.paidRegular || 0) + totalExtraPaid,
              extraCovered: totalExtraPaid >= totalExtraAmount
          };
          
          // Update local state immediately for instant UI feedback
          setEditPayments(prev => prev.map(p => 
              p.period === editingExtraFee.period ? updatedPayment : p
          ));
          
          // Reset edit state
          setEditingExtraFee(null);
          setEditExtraFeeDesc('');
          setEditExtraFeeAmount(0);
          
          await dataService.updatePayment(editingUserLedger, updatedPayment);
          showMessage("Cuota extra actualizada ✅");
          
          const payments = await dataService.getPayments(editingUserLedger);
          setEditPayments(payments);
          await loadUsers();
      } catch (e) {
          console.error(e);
          showMessage("Error actualizando cuota extra", 'error');
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
          // Enviar notificación a los presentes
          try {
            const dateFormatted = new Date(date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
            await notificationService.createNotification(
              uidsPresent,
              user.groupId,
              'attendance',
              '✅ Asistencia registrada',
              `Se registró tu asistencia a la tenida del ${dateFormatted}`
            );
          } catch (_) {}
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
          let imageUrl: string | undefined = editingNotice?.imageUrl;
          if (noticeImageFile) {
              imageUrl = await dataService.compressImageToBase64(noticeImageFile);
          }
          if (editingNotice) {
              await dataService.updateNotice(user.groupId, editingNotice.id, {
                  title: newNoticeTitle,
                  description: newNoticeContent,
                  date: new Date().toISOString(),
                  ...(imageUrl !== undefined && { imageUrl })
              });
              showMessage("Aviso actualizado");
          } else {
              await dataService.createNotice({
                  groupId: user.groupId,
                  title: newNoticeTitle,
                  description: newNoticeContent,
                  date: new Date().toISOString(),
                  createdBy: user.uid,
                  ...(imageUrl && { imageUrl })
              });
              // Enviar notificación a TODOS los miembros activos (incluyendo al admin)
              if (noticeSendPush) {
                  try {
                      const allUsers = await dataService.getUsers(user.groupId);
                      const uids = allUsers.filter(u => u.active).map(u => u.uid);
                      if (uids.length > 0) {
                          await notificationService.createNotification(
                              uids,
                              user.groupId,
                              'notice',
                              `📌 Nuevo aviso: ${newNoticeTitle}`,
                              newNoticeContent.length > 100 ? newNoticeContent.substring(0, 100) + '...' : newNoticeContent
                          );
                      }
                  } catch (_) {}
              }
              showMessage("Aviso creado y notificación enviada ✅");
          }
          setNewNoticeTitle('');
          setNewNoticeContent('');
          setNoticeImageFile(null);
          setNoticeImagePreview(null);
          setNoticeSendPush(true);
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
      setNewNoticeContent(notice.description);
      setNoticeImageFile(null);
      setNoticeImagePreview(null);
  };

  const handleDeleteNotice = (id: string) => {
      setDeletingNoticeId(id);
      setShowDeleteNoticeModal(true);
  };

  const handleExecuteDeleteNotice = async () => {
      if (isReadOnly || !deletingNoticeId) return;
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
      setNoticeImageFile(null);
      setNoticeImagePreview(null);
      setNoticeSendPush(true);
  };

  // TASKS HANDLERS
  const resetTaskForm = () => {
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskAssignee('');
      setNewTaskAssignees(new Set());
      setNewTaskMode('individual');
      setEditingTask(null);
  };

  const handleSaveTask = async () => {
      if (isReadOnly || !newTaskTitle.trim()) {
          showMessage('El título es obligatorio', 'error');
          return;
      }
      const selectedIds = editingTask
          ? (newTaskAssignee ? [newTaskAssignee] : [])
          : Array.from(newTaskAssignees);
      if (!editingTask && selectedIds.length === 0) {
          showMessage('Selecciona al menos un miembro', 'error');
          return;
      }
      try {
          setIsSubmitting(true);
          if (editingTask) {
              const assignedUser = newTaskAssignee ? users.find(u => u.uid === newTaskAssignee) : undefined;
              await dataService.updateTask(user.groupId, editingTask.id, {
                  title: newTaskTitle.trim(), description: newTaskDesc.trim(),
                  assignedTo: newTaskAssignee || undefined,
                  assignedToName: assignedUser?.name || undefined
              });
              showMessage('Tarea actualizada');
          } else if (newTaskMode === 'team') {
              const selectedUsers = users.filter(u => selectedIds.includes(u.uid));
              await dataService.createTask({
                  groupId: user.groupId, title: newTaskTitle.trim(), description: newTaskDesc.trim(),
                  assignmentMode: 'team', assignedToMany: selectedIds,
                  assignedToNames: selectedUsers.map(u => u.name), completed: false,
                  createdAt: new Date().toISOString(), createdBy: user.uid, createdByName: user.name
              });
              showMessage('Tarea de equipo creada para ' + selectedIds.length + ' miembros');
          } else {
              const batchId = 'task_batch_' + Date.now();
              await Promise.all(selectedIds.map(uid => {
                  const target = users.find(u => u.uid === uid);
                  return dataService.createTask({
                      groupId: user.groupId, title: newTaskTitle.trim(), description: newTaskDesc.trim(),
                      assignmentMode: 'individual', assignedTo: uid, assignedToName: target?.name,
                      batchId, completed: false, createdAt: new Date().toISOString(),
                      createdBy: user.uid, createdByName: user.name
                  });
              }));
              showMessage(selectedIds.length + ' tareas individuales creadas');
          }
          if (!editingTask && selectedIds.length > 0) {
              try {
                  await notificationService.createNotification(selectedIds, user.groupId, 'task', '✅ Nueva tarea asignada', newTaskTitle.trim());
              } catch (_) {}
          }
          resetTaskForm();
          await loadTasks();
      } catch (e) {
          console.error(e);
          showMessage('Error guardando tarea', 'error');
      } finally { setIsSubmitting(false); }
  };

  const handleToggleTask = async (taskId: string, currentCompleted: boolean) => {
      if (isReadOnly) return;
      try { await dataService.toggleTaskComplete(user.groupId, taskId, !currentCompleted, user.uid); await loadTasks(); }
      catch (e) { console.error(e); showMessage('Error actualizando tarea', 'error'); }
  };

  const handleEditTask = (task: Task) => {
      setEditingTask(task); setNewTaskTitle(task.title); setNewTaskDesc(task.description || '');
      setNewTaskAssignee(task.assignedTo || '');
  };
  const handleDeleteTask = (id: string) => { setDeletingTaskId(id); setShowDeleteTaskModal(true); };
  const handleExecuteDeleteTask = async () => {
      if (isReadOnly || !deletingTaskId) return;
      try { await dataService.deleteTask(user.groupId, deletingTaskId); showMessage('Tarea eliminada'); setShowDeleteTaskModal(false); setDeletingTaskId(null); await loadTasks(); }
      catch (e) { console.error(e); showMessage('Error eliminando tarea', 'error'); }
  };
  const handleCancelEditTask = resetTaskForm;

  // TRIVIA HANDLERS
  const handleDeleteTrivia = (triviaId: string) => {
      setDeletingTriviaId(triviaId);
      setShowDeleteTriviaModal(true);
  };

  const handleExecuteDeleteTrivia = async () => {
      if (isReadOnly || !deletingTriviaId) return;
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
      if (isReadOnly) return;
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
      if (isReadOnly) return;
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
      if (isReadOnly || !viewingVisitRequest || !newChatMessage.trim()) return;
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
      if (isReadOnly || !deletingVisitId) return;
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
      if (isReadOnly) return;
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

  const handleManualMerge = async () => {
      if (isReadOnly) return;
      if (!selectedTempUser || !selectedRealUser) {
          showMessage("Debes seleccionar ambos usuarios", 'error');
          return;
      }

      if (selectedTempUser === selectedRealUser) {
          showMessage("No puedes vincular un usuario consigo mismo", 'error');
          return;
      }

      const tempUser = tempUsers.find(u => u.uid === selectedTempUser);
      const realUser = users.find(u => u.uid === selectedRealUser);

      if (!tempUser || !realUser) {
          showMessage("Usuario no encontrado", 'error');
          return;
      }

      const confirmed = window.confirm(
          `¿Seguro que deseas vincular:\n\n` +
          `Usuario Temporal: ${tempUser.name} (${tempUser.email})\n` +
          `Usuario Real: ${realUser.name} (${realUser.email})\n\n` +
          `Se copiarán todos los pagos y asistencias del usuario temporal al real, y se eliminará el usuario temporal.`
      );

      if (!confirmed) return;

      setMergingUsers(true);
      try {
          await authService.manualMergeUsers(selectedTempUser, selectedRealUser);
          showMessage("✅ Usuarios vinculados exitosamente");
          setSelectedTempUser(null);
          setSelectedRealUser(null);
          await loadUsers();
      } catch (e: any) {
          console.error(e);
          showMessage(e.message || "Error vinculando usuarios", 'error');
      } finally {
          setMergingUsers(false);
      }
  };

  const handleOpenMatrixModal = async (uid: string, userName: string, period: string) => {
      if (isReadOnly) return;
      // Load current payment for this period
      const ledgerRef = doc(db, "users", uid, "ledger", period);
      const ledgerDoc = await getDoc(ledgerRef);
      if (!ledgerDoc.exists()) {
          showMessage("No hay cuota registrada para este período", 'error');
          return;
      }
      const payment = ledgerDoc.data() as Payment;
      setMatrixModalUid(uid);
      setMatrixModalUserName(userName);
      setMatrixModalPeriod(period);
      setMatrixModalPayment(payment);
      // Pre-fill amount with amount already paid (or full amount if currently covered)
      const currentPaid = payment.paidRegular !== undefined ? payment.paidRegular : (Number(payment.paid) || 0);
      setMatrixModalAmountPaid(currentPaid > 0 ? String(currentPaid) : '');
      setMatrixModalComments(payment.comments || '');
      setMatrixModalFile(null);
      setMatrixModalPreview(null);
      setShowMatrixModal(true);
  };

  const handleSaveMatrixPayment = async () => {
      if (!matrixModalPayment || !matrixModalUid || !matrixModalPeriod) return;
      if (isReadOnly) return;
      setSavingMatrixPayment(true);
      try {
          const totalAmount = Number(matrixModalPayment.amount) || 0;
          const inputAmount = matrixModalAmountPaid.trim() === '' ? totalAmount : Number(matrixModalAmountPaid);
          const paidRegular = Math.min(inputAmount, totalAmount);
          const regularCovered = paidRegular >= totalAmount;

          const currentPaidExtra = Number(matrixModalPayment.paidExtra) || 0;
          let totalExtraAmount = 0;
          if (matrixModalPayment.extraFees && matrixModalPayment.extraFees.length > 0) {
              totalExtraAmount = matrixModalPayment.extraFees.reduce((s, ef) => s + ef.amount, 0);
          } else if (matrixModalPayment.extraAmount) {
              totalExtraAmount = Number(matrixModalPayment.extraAmount);
          }
          const extraCovered = totalExtraAmount <= 0 || currentPaidExtra >= totalExtraAmount;

          const newStatus: Payment['status'] = regularCovered && extraCovered ? 'Pagado' : paidRegular > 0 ? 'Parcial' : 'Pendiente';

          let receiptImageBase64: string | undefined;
          if (matrixModalFile) {
              receiptImageBase64 = await dataService.compressImageToBase64(matrixModalFile);
          } else {
              receiptImageBase64 = matrixModalPayment.receiptImageBase64;
          }

          const updatedPayment: Payment = {
              ...matrixModalPayment,
              paidRegular,
              paid: paidRegular + currentPaidExtra,
              regularCovered,
              extraCovered,
              status: newStatus,
              comments: matrixModalComments || matrixModalPayment.comments || '',
              paymentDate: new Date().toISOString().split('T')[0],
              ...(receiptImageBase64 !== undefined ? { receiptImageBase64 } : {})
          };

          await dataService.updatePayment(matrixModalUid, updatedPayment);
          showMessage(regularCovered ? "✅ Marcado como pagado" : paidRegular > 0 ? "⏳ Pago parcial registrado" : "⏳ Marcado como pendiente");
          setShowMatrixModal(false);
          await loadAllLedgers();
          await loadUsers();
      } catch (e) {
          console.error(e);
          showMessage("Error actualizando pago", 'error');
      } finally {
          setSavingMatrixPayment(false);
      }
  };

  const handleOpenAdvancedPayment = (u: User) => {
      setAdvancedPaymentUser(u);
      setAdvancedPaymentStartPeriod(new Date().toISOString().slice(0, 7)); // YYYY-MM
      setAdvancedPaymentMonths(1);
      setAdvancedPaymentAmount(0);
      setAdvancedPaymentDate(new Date().toISOString().slice(0, 10));
      setAdvancedPaymentComments('');
      setShowAdvancedPaymentModal(true);
  };
  
  const toggleUserExpand = async (uid: string) => {
      const newSet = new Set(expandedUsers);
      if (newSet.has(uid)) {
          newSet.delete(uid);
      } else {
          newSet.add(uid);
          // Load payments if not already cached
          if (!userPaymentsCache[uid]) {
              try {
                  const payments = await dataService.getPayments(uid);
                  setUserPaymentsCache(prev => ({ ...prev, [uid]: payments }));
              } catch (e) {
                  console.error('Error loading payments for user:', e);
                  showMessage('Error cargando pagos del usuario', 'error');
                  return;
              }
          }
      }
      setExpandedUsers(newSet);
  };

  const handleSaveAdvancedPayment = async () => {
      if (!advancedPaymentUser || !advancedPaymentStartPeriod || advancedPaymentMonths < 1) {
          showMessage("Completa todos los campos", 'error');
          return;
      }

      if (isReadOnly) return;

      try {
          setIsSubmitting(true);
          
          // Parse start period
          const [startYear, startMonth] = advancedPaymentStartPeriod.split('-').map(Number);
          
          const history = await dataService.getPriceHistory(user.groupId);
          
          // Generate periods for the next N months
          const periods: string[] = [];
          for (let i = 0; i < advancedPaymentMonths; i++) {
              let year = startYear;
              let month = startMonth + i;
              
              while (month > 12) {
                  month -= 12;
                  year += 1;
              }
              
              const period = `${year}-${String(month).padStart(2, '0')}`;
              periods.push(period);
          }
          
          // For each period, create or update the payment record
          for (const period of periods) {
              // Find the applicable price for this period
              const sortedHistory = [...history].sort((a, b) => b.startDate.localeCompare(a.startDate));
              const applicable = sortedHistory.find(h => h.startDate <= period);
              const basePrice = applicable ? applicable.amount : (sortedHistory.length > 0 ? sortedHistory[sortedHistory.length - 1].amount : advancedPaymentAmount / advancedPaymentMonths);
              
              const amountForPeriod = Number(basePrice);
              
              // Create or update the payment
              const payment: Payment = {
                  period,
                  amount: amountForPeriod,
                  paid: amountForPeriod,
                  paidRegular: amountForPeriod,
                  paidExtra: 0,
                  status: 'Pagado',
                  comments: advancedPaymentComments || `Pago anticipado de ${advancedPaymentMonths} meses`,
                  paymentDate: advancedPaymentDate ? new Date(advancedPaymentDate).toISOString() : new Date().toISOString(),
                  groupId: user.groupId,
                  regularCovered: true,
                  extraCovered: true
              };
              
              await dataService.updatePayment(advancedPaymentUser.uid, payment);
          }
          
          showMessage(`✅ ${advancedPaymentMonths} ${advancedPaymentMonths === 1 ? 'mes' : 'meses'} registrado(s) como pagado(s)`);
          setShowAdvancedPaymentModal(false);
          await loadUsers();
          await loadAllLedgers();
      } catch (e) {
          console.error(e);
          showMessage("Error registrando pagos", 'error');
      } finally {
          setIsSubmitting(false);
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
      <div className="bg-logia-800 p-4 border-b border-logia-700 flex justify-between items-center sticky top-0 z-20 shadow-md">
        <div className="flex items-center gap-2">
            <button 
                onClick={() => setShowMenu(!showMenu)}
                className="bg-logia-700 hover:bg-logia-600 p-2 rounded text-white text-2xl"
                title="Menú"
            >
                ☰
            </button>
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

      {/* HAMBURGER MENU */}
      {showMenu && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-black/50 z-30"
            onClick={() => setShowMenu(false)}
          />
          
          {/* Menu Panel */}
          <div className="fixed left-0 top-0 h-full w-80 bg-logia-900 border-r border-logia-700 shadow-2xl z-40 overflow-y-auto">
            <div className="p-4 border-b border-logia-700 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Menú de Administración</h3>
              <button 
                onClick={() => setShowMenu(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Dashboard & Requests */}
              <div>
                <h4 className="text-xs uppercase text-gray-500 font-bold mb-2">General</h4>
                <button
                  onClick={() => { setActiveTab('dashboard'); setShowMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                    activeTab === 'dashboard' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'
                  }`}
                >
                  📊 Resumen
                </button>
                <button
                  onClick={() => { setActiveTab('requests'); setShowMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 mt-2 relative ${
                    activeTab === 'requests' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'
                  }`}
                >
                  📩 Solicitudes
                  {pendingUsers.length > 0 && (
                    <span className="ml-auto bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full">
                      {pendingUsers.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Financial */}
              <div>
                <h4 className="text-xs uppercase text-gray-500 font-bold mb-2">💰 Finanzas</h4>
                <button
                  onClick={() => { setActiveTab('fees'); setShowMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors ${
                    activeTab === 'fees' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'
                  }`}
                >
                  💳 Cuotas
                </button>
                <button
                  onClick={() => { setActiveTab('payment-matrix'); setShowMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors mt-2 ${
                    activeTab === 'payment-matrix' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'
                  }`}
                >
                  📊 Matriz de Pagos
                </button>
                <button
                  onClick={() => { setActiveTab('treasury'); setShowMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors mt-2 ${
                    activeTab === 'treasury' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'
                  }`}
                >
                  🏦 Tesorería
                </button>
                <button
                  onClick={() => { setActiveTab('banks'); setShowMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors mt-2 ${
                    activeTab === 'banks' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'
                  }`}
                >
                  🏛️ Bancos
                </button>
              </div>

              {/* Members & Activities */}
              <div>
                <h4 className="text-xs uppercase text-gray-500 font-bold mb-2">👥 Miembros</h4>
                <button
                  onClick={() => { setActiveTab('users'); setShowMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors ${
                    activeTab === 'users' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'
                  }`}
                >
                  👤 Gestión de Miembros
                </button>
                <button
                  onClick={() => { setActiveTab('attendance'); setShowMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors mt-2 ${
                    activeTab === 'attendance' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'
                  }`}
                >
                  📅 Asistencia
                </button>
                <button
                  onClick={() => { setActiveTab('create-user'); setShowMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors mt-2 ${
                    activeTab === 'create-user' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'
                  }`}
                >
                  ➕ Crear Usuario
                </button>
                <button
                  onClick={() => { setActiveTab('manual-merge'); setShowMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors mt-2 ${
                    activeTab === 'manual-merge' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'
                  }`}
                >
                  🔗 Vincular Usuarios
                </button>
              </div>

              {/* Communication & Activities */}
              <div>
                <h4 className="text-xs uppercase text-gray-500 font-bold mb-2">📢 Comunicación</h4>
                <button
                  onClick={() => { setActiveTab('notices'); setShowMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors ${
                    activeTab === 'notices' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'
                  }`}
                >
                  📰 Avisos
                </button>
                <button
                  onClick={() => { setActiveTab('tasks'); setShowMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors mt-2 ${
                    activeTab === 'tasks' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'
                  }`}
                >
                  ✅ Tareas
                </button>
                <button
                  onClick={() => { setActiveTab('visits'); setShowMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors mt-2 ${
                    activeTab === 'visits' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'
                  }`}
                >
                  🤝 Visitas
                </button>
              </div>

              {/* Pagos - nuevo */}
              <div>
                <h4 className="text-xs uppercase text-gray-500 font-bold mb-2">💸 Comprobantes</h4>
                <button
                  onClick={() => { setActiveTab('receipts'); loadPaymentReceipts(); setShowMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors ${
                    activeTab === 'receipts' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'
                  }`}
                >
                  🧾 Revisar Comprobantes
                </button>
                <button
                  onClick={() => { setActiveTab('debt-notify'); setShowMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors mt-2 ${
                    activeTab === 'debt-notify' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'
                  }`}
                >
                  🔔 Notificaciones de Deuda
                </button>
              </div>

              {/* Games */}
              <div>
                <h4 className="text-xs uppercase text-gray-500 font-bold mb-2">🎮 Actividades</h4>
                <button
                  onClick={() => { setActiveTab('trivia'); setShowMenu(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-bold transition-colors ${
                    activeTab === 'trivia' ? 'bg-logia-accent text-white' : 'bg-logia-800 text-gray-300 hover:bg-logia-700'
                  }`}
                >
                  🧠 Trivia
                </button>
              </div>
            </div>
          </div>
        </>
      )}

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
                 {/* Migration Tool Card (v3.4.2) */}
                 {user.role === 'admin' || user.role === 'master' ? (
                    <div className="bg-purple-900/20 border border-purple-500 rounded-xl p-4">
                        <div className="flex justify-between items-center mb-3">
                            <div>
                                <h3 className="text-purple-400 font-bold text-lg">🔄 Herramienta de Migración</h3>
                                <p className="text-gray-400 text-sm">Convierte cuotas extraordinarias al nuevo formato con desglose individual</p>
                            </div>
                            <button 
                                onClick={handleMigrateExtraFees}
                                disabled={isMigrating}
                                className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded shadow-lg transition-all disabled:cursor-not-allowed"
                            >
                                {isMigrating ? '⏳ Migrando...' : '▶️ Ejecutar Migración'}
                            </button>
                        </div>
                        <div className="text-xs text-gray-500 space-y-1">
                            <p>✅ Convierte automáticamente cuotas del formato antiguo (extraAmount) al nuevo (extraFees[])</p>
                            <p>✅ Preserva toda la información existente (montos, pagos, descripciones)</p>
                            <p>⚠️ Solo ejecutar una vez. Los registros ya migrados se omiten automáticamente.</p>
                        </div>
                    </div>
                 ) : null}
                 
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
                    <button onClick={() => { loadUsers(); setUserPaymentsCache({}); setExpandedUsers(new Set()); }} className="px-3 py-1 bg-logia-900 hover:bg-logia-700 rounded text-xs border border-logia-700 text-gray-300">
                        🔄 Actualizar
                    </button>
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
                             <th className="p-3 w-10"></th>
                             <th className="p-3">Nombre / Email</th>
                             <th className="p-3 hidden">Grado / Cargo</th>
                             <th className="p-3 hidden">Trabajo</th>
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
                             const isExpanded = expandedUsers.has(u.uid);
                             const userPayments = userPaymentsCache[u.uid] || [];
                             
                             // Build detailed payment breakdown for expanded view
                             const paymentDetails: Array<{
                                 period: string; 
                                 periodDisplay: string;
                                 concept: string; 
                                 amount: number; 
                                 paid: number;
                                 balance: number;
                             }> = [];
                             
                             if (isExpanded && userPayments.length > 0) {
                                 // Sort by period descending
                                 const sortedPayments = [...userPayments].sort((a, b) => b.period.localeCompare(a.period));
                                 
                                 sortedPayments.forEach(p => {
                                     const [year, month] = p.period.split('-');
                                     const monthName = new Date(parseInt(year), parseInt(month) - 1, 1)
                                         .toLocaleString('es', { month: 'long' });
                                     const periodDisplay = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
                                     
                                     // Add regular fee
                                     const regularAmount = Number(p.amount) || 0;
                                     const paidRegular = Number(p.paidRegular) || 0;
                                     paymentDetails.push({
                                         period: p.period,
                                         periodDisplay,
                                         concept: 'Cuota Regular',
                                         amount: regularAmount,
                                         paid: paidRegular,
                                         balance: regularAmount - paidRegular
                                     });
                                     
                                     // Add individual extra fees
                                     if (p.extraFees && Array.isArray(p.extraFees) && p.extraFees.length > 0) {
                                         p.extraFees.forEach(fee => {
                                             paymentDetails.push({
                                                 period: p.period,
                                                 periodDisplay,
                                                 concept: fee.description,
                                                 amount: fee.amount,
                                                 paid: fee.paid,
                                                 balance: fee.amount - fee.paid
                                             });
                                         });
                                     }
                                 });
                             }
                             
                             return (
                                 <React.Fragment key={u.uid}>
                                     {/* Main Row */}
                                     <tr className={`hover:bg-logia-700/50 transition-colors ${!u.active ? 'bg-red-900/10 opacity-70' : ''}`}>
                                         <td className="p-3">
                                             <button 
                                                 onClick={() => toggleUserExpand(u.uid)}
                                                 className="text-indigo-400 hover:text-indigo-300 font-bold"
                                                 title="Ver detalle de cuotas extras"
                                             >
                                                 {isExpanded ? '▼' : '▶'}
                                             </button>
                                         </td>
                                         <td className="p-3">
                                             <div className="font-bold text-white flex items-center gap-2">
                                                 {u.name}
                                                 {!u.active && <span className="text-[10px] bg-gray-700 text-gray-200 px-1.5 rounded">{u.leaveDate ? `INACTIVO · ${u.leaveDate}` : 'PENDIENTE'}</span>}
                                             </div>
                                             <div className="text-xs text-gray-500">{u.email}</div>
                                         </td>
                                         <td className="p-3 hidden">
                                             <div className="text-indigo-300">{u.degree ? `${u.degree} (${u.numericDegree || '-'})` : '-'}</div>
                                             <div className="text-xs text-gray-400">{u.lodgeRole || 'Sin cargo'}</div>
                                         </td>
                                         <td className="p-3 text-xs hidden">
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
                                                  <>
                                                    <button onClick={() => handleToggleActive(u.uid, u.active)} title="Reactivar miembro" className="px-3 py-1.5 bg-green-600 rounded hover:bg-green-500 text-white font-bold text-xs">
                                                        ✅ REACTIVAR
                                                    </button>
                                                    <button onClick={() => setEditingUserProfile(u)} title="Editar fechas y perfil" className="p-1.5 bg-blue-600 rounded hover:bg-blue-500 text-white">
                                                        ✏️
                                                    </button>
                                                  </>
                                              ) : (
                                                 <>
                                                    <button onClick={() => handleToggleActive(u.uid, u.active)} title="Desactivar / Dar de Baja" className="p-1.5 bg-logia-900 border border-logia-700 rounded hover:bg-red-900/30 text-gray-400">
                                                        🚫
                                                    </button>
                                                    <button onClick={() => handleOpenPayments(u.uid)} title="Gestionar Pagos" className="p-1.5 bg-yellow-600 rounded hover:bg-yellow-500 text-white">
                                                        💰
                                                    </button>
                                                    <button onClick={() => handleOpenAdvancedPayment(u)} title="Pagos Anticipados (Multi-mes)" className="p-1.5 bg-purple-600 rounded hover:bg-purple-500 text-white">
                                                        📅
                                                    </button>
                                                    <button onClick={() => setEditingUserProfile(u)} title="Editar Perfil" className="p-1.5 bg-blue-600 rounded hover:bg-blue-500 text-white">
                                                        ✏️
                                                    </button>
                                                 </>
                                             )}
                                         </td>
                                     </tr>
                                     
                                     {/* Expanded Detail Section - Excel-style table */}
                                     {isExpanded && (
                                         <tr className="bg-logia-900">
                                             <td colSpan={11} className="p-0">
                                                 <div className="p-4 border-t-2 border-indigo-600">
                                                     <h4 className="text-sm font-bold text-indigo-400 mb-3 flex items-center gap-2">
                                                         <span>📊</span> Detalle de Cuotas - {u.name}
                                                     </h4>
                                                     
                                                     {paymentDetails.length > 0 ? (
                                                         <div className="overflow-x-auto">
                                                             <table className="w-full text-xs border border-logia-700 rounded">
                                                                 <thead className="bg-logia-800">
                                                                     <tr className="border-b border-logia-700">
                                                                         <th className="p-2 text-left text-gray-400 font-bold uppercase w-32">Período</th>
                                                                         <th className="p-2 text-left text-gray-400 font-bold uppercase">Concepto</th>
                                                                         <th className="p-2 text-right text-gray-400 font-bold uppercase w-28">Facturado</th>
                                                                         <th className="p-2 text-right text-gray-400 font-bold uppercase w-28">Pagado</th>
                                                                         <th className="p-2 text-right text-gray-400 font-bold uppercase w-28">Deuda</th>
                                                                     </tr>
                                                                 </thead>
                                                                 <tbody className="divide-y divide-logia-700">
                                                                     {paymentDetails.map((detail, idx) => (
                                                                         <tr key={`${u.uid}-detail-${idx}`} className="hover:bg-logia-800/50">
                                                                             <td className="p-2 text-indigo-300 font-mono">
                                                                                 {detail.periodDisplay}
                                                                             </td>
                                                                             <td className="p-2 text-gray-300">
                                                                                 {detail.concept === 'Cuota Regular' ? (
                                                                                     <span className="text-blue-400 font-medium">📅 {detail.concept}</span>
                                                                                 ) : (
                                                                                     <span className="text-yellow-400">⭐ {detail.concept}</span>
                                                                                 )}
                                                                             </td>
                                                                             <td className="p-2 text-right font-mono text-gray-300">
                                                                                 ${detail.amount.toFixed(2)}
                                                                             </td>
                                                                             <td className="p-2 text-right font-mono text-green-400">
                                                                                 ${detail.paid.toFixed(2)}
                                                                             </td>
                                                                             <td className="p-2 text-right font-mono font-bold">
                                                                                 <span className={detail.balance > 0 ? 'text-red-400' : 'text-green-400'}>
                                                                                     ${detail.balance.toFixed(2)}
                                                                                 </span>
                                                                             </td>
                                                                         </tr>
                                                                     ))}
                                                                 </tbody>
                                                             </table>
                                                         </div>
                                                     ) : (
                                                         <p className="text-gray-500 text-xs italic py-4">
                                                             No hay registros de pagos para este miembro
                                                         </p>
                                                     )}
                                                 </div>
                                             </td>
                                         </tr>
                                     )}
                                 </React.Fragment>
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

                {/* 2.5 Apply Monthly Fee for Specific Period */}
                <div className="bg-logia-800 rounded-xl p-6 border border-logia-700 shadow-lg border-l-4 border-l-amber-500">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                        <span className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center mr-3 text-sm">📅</span>
                        Aplicar Cuota de Mes Específico
                    </h3>
                    <p className="text-xs text-gray-400 mb-4">
                        Aplica la cuota mensual de un periodo específico a todos los usuarios activos que <strong>no tengan</strong> ese periodo registrado. 
                        Útil para aplicar cuotas retroactivas (ej: aplicar Febrero cuando estamos en Marzo).
                    </p>
                    <div className="flex gap-3 items-end">
                        <div className="flex-1">
                            <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Seleccionar Mes</label>
                            <input 
                                type="month" 
                                value={monthlyFeePeriod}
                                onChange={e => setMonthlyFeePeriod(e.target.value)}
                                disabled={isReadOnly || applyingMonthlyFee || priceHistory.length === 0}
                                className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white outline-none"
                            />
                        </div>
                        <button 
                            onClick={handleApplyMonthlyFee}
                            disabled={applyingMonthlyFee || isReadOnly || priceHistory.length === 0 || !monthlyFeePeriod}
                            className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 transform active:scale-95 transition-all"
                        >
                            {applyingMonthlyFee ? (
                               <>
                                 <span className="animate-spin">⌛</span> Aplicando...
                               </>
                            ) : '✅ Aplicar Cuota del Mes'}
                        </button>
                    </div>
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
                                <div className="flex flex-col gap-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            value="mass" 
                                            checked={extraFeeType === 'mass'}
                                            onChange={() => setExtraFeeType('mass')}
                                            disabled={isReadOnly || applyingExtra}
                                            className="text-purple-600"
                                        />
                                        <span className="text-white">Masiva Legacy (extraAmount/extraDescription)</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            value="mass-individual" 
                                            checked={extraFeeType === 'mass-individual'}
                                            onChange={() => setExtraFeeType('mass-individual')}
                                            disabled={isReadOnly || applyingExtra}
                                            className="text-purple-600"
                                        />
                                        <span className="text-white">✨ Masiva Individual (Separadas, Editables)</span>
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
                                        <span className="text-white">Individual (Un solo usuario)</span>
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
                
                {/* Attendance Statistics by Member */}
                <div className="bg-logia-800 rounded-xl p-6 border border-logia-700 shadow-lg">
                    <h4 className="text-sm font-bold text-gray-300 mb-4 border-b border-logia-700 pb-2">📊 Estadísticas de Asistencia por Miembro</h4>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-logia-900 border-b-2 border-indigo-600">
                                <tr>
                                    <th className="text-left p-3 text-gray-300">Miembro</th>
                                    <th className="text-center p-3 text-gray-300">Total Reuniones</th>
                                    <th className="text-center p-3 text-gray-300">Asistencias</th>
                                    <th className="text-center p-3 text-gray-300">Ausencias</th>
                                    <th className="text-center p-3 text-gray-300">%</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-logia-700">
                                {users
                                    .sort((a, b) => {
                                        const statsA = attStats[a.uid] || { percentage: 0 };
                                        const statsB = attStats[b.uid] || { percentage: 0 };
                                        return statsB.percentage - statsA.percentage;
                                    })
                                    .map(u => {
                                        const stats = attStats[u.uid] || { total: 0, present: 0, absent: 0, percentage: 0 };
                                        return (
                                            <tr key={u.uid} className={`hover:bg-logia-700/30 ${u.active ? '' : 'opacity-50'}`}>
                                                <td className="p-3 text-white">
                                                    {u.name}
                                                    {!u.active && <span className="ml-2 text-xs text-gray-500">(Inactivo{u.leaveDate ? ' · Baja ' + u.leaveDate : ''})</span>}
                                                </td>
                                                <td className="text-center p-3 text-gray-300">{stats.total}</td>
                                                <td className="text-center p-3">
                                                    <span className="text-green-400 font-bold">{stats.present}</span>
                                                </td>
                                                <td className="text-center p-3">
                                                    <span className="text-red-400 font-bold">{stats.absent}</span>
                                                </td>
                                                <td className="text-center p-3">
                                                    <span className={`font-bold ${
                                                        stats.percentage >= 80 ? 'text-green-400' :
                                                        stats.percentage >= 60 ? 'text-yellow-400' :
                                                        'text-red-400'
                                                    }`}>
                                                        {stats.percentage}%
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
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
                                        week: new Date().toISOString().slice(0, 10),
                                        question: triviaQ,
                                        options: triviaOpts,
                                        correctIndex: triviaCorrect
                                    });
                                    showMessage('Trivia publicada!');
                                    // Notificar a todos los miembros del grupo
                                    try {
                                        const memberUids = users.filter(u => u.groupId === user.groupId && u.uid !== user.uid).map(u => u.uid);
                                        if (memberUids.length > 0) {
                                            await notificationService.createNotification(
                                                memberUids,
                                                user.groupId,
                                                'trivia',
                                                '🧠 Nueva Trivia disponible',
                                                `¡Hay una nueva pregunta de trivia esperándote! Respóndela en la app.`
                                            );
                                        }
                                    } catch (_) {}
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

                        {/* Imagen */}
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Imagen (opcional)</label>
                            <input
                                type="file"
                                accept="image/*"
                                disabled={isReadOnly}
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    setNoticeImageFile(file);
                                    const reader = new FileReader();
                                    reader.onloadend = () => setNoticeImagePreview(reader.result as string);
                                    reader.readAsDataURL(file);
                                }}
                                className="w-full text-sm text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:font-bold file:bg-indigo-700 file:text-white hover:file:bg-indigo-600 cursor-pointer"
                            />
                            {(noticeImagePreview || editingNotice?.imageUrl) && (
                                <div className="mt-2 relative inline-block">
                                    <img
                                        src={noticeImagePreview || editingNotice?.imageUrl}
                                        alt="Vista previa"
                                        className="max-h-36 rounded border border-logia-700 object-contain"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => { setNoticeImageFile(null); setNoticeImagePreview(null); }}
                                        className="absolute top-1 right-1 bg-red-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold"
                                    >×</button>
                                </div>
                            )}
                        </div>

                        {/* Toggle notificación push */}
                        {!editingNotice && (
                            <label className="flex items-center gap-3 cursor-pointer select-none">
                                <div
                                    onClick={() => setNoticeSendPush(p => !p)}
                                    className={`w-10 h-5 rounded-full transition-colors ${noticeSendPush ? 'bg-indigo-600' : 'bg-gray-600'} relative cursor-pointer`}
                                >
                                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${noticeSendPush ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </div>
                                <span className="text-sm text-gray-300">Enviar notificación a todos los miembros</span>
                            </label>
                        )}
                        
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
                                <div key={notice.id} className="bg-logia-900 rounded border border-logia-700 overflow-hidden">
                                    {notice.imageUrl && (
                                        <img src={notice.imageUrl} alt={notice.title} className="w-full max-h-48 object-cover" />
                                    )}
                                    <div className="p-4 flex flex-col gap-2">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="flex-1">
                                                <h5 className="font-bold text-white text-lg">{notice.title}</h5>
                                                <p className="text-xs text-gray-400">{new Date(notice.date).toLocaleDateString('es-ES', { year:'numeric', month:'long', day:'numeric' })}</p>
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
                                        <p className="text-gray-300 text-sm whitespace-pre-wrap">{notice.description}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'tasks' && (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-white">Gestión de Tareas</h3>
            <div className="bg-logia-800 rounded-xl p-5 border border-logia-700 shadow-lg space-y-4">
              <h4 className="font-bold text-white">{editingTask ? 'Editar tarea' : 'Asignar tarea'}</h4>
              <input type="text" placeholder="Título de la tarea *" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} disabled={isReadOnly} className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white font-bold" />
              <textarea placeholder="Descripción (opcional)" value={newTaskDesc} onChange={e => setNewTaskDesc(e.target.value)} disabled={isReadOnly} rows={3} className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white" />
              {!editingTask ? <>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setNewTaskMode('individual')} className={'p-3 rounded border text-sm font-bold ' + (newTaskMode === 'individual' ? 'bg-indigo-700 border-indigo-500 text-white' : 'bg-logia-900 border-logia-700 text-gray-300')}>👤 Individual masiva</button>
                  <button onClick={() => setNewTaskMode('team')} className={'p-3 rounded border text-sm font-bold ' + (newTaskMode === 'team' ? 'bg-purple-700 border-purple-500 text-white' : 'bg-logia-900 border-logia-700 text-gray-300')}>👥 Tarea de equipo</button>
                </div>
                <p className="text-xs text-gray-400">{newTaskMode === 'individual' ? 'Se creará una tarea independiente para cada miembro seleccionado.' : 'Se creará una sola tarea compartida por todo el equipo seleccionado.'}</p>
                <div className="flex gap-2">
                  <button onClick={() => setNewTaskAssignees(new Set(users.filter(u => u.active && u.role !== 'viewer').map(u => u.uid)))} className="text-xs bg-logia-900 border border-logia-700 px-3 py-2 rounded text-gray-300">Seleccionar todos</button>
                  <button onClick={() => setNewTaskAssignees(new Set())} className="text-xs bg-logia-900 border border-logia-700 px-3 py-2 rounded text-gray-300">Limpiar</button>
                </div>
                <div className="max-h-64 overflow-y-auto bg-logia-900 rounded border border-logia-700 p-2 space-y-1">
                  {users.filter(u => u.active && u.role !== 'viewer').map(u => <label key={u.uid} className="flex items-center gap-3 p-2 hover:bg-logia-800 rounded cursor-pointer"><input type="checkbox" checked={newTaskAssignees.has(u.uid)} onChange={e => { const next = new Set(newTaskAssignees); e.target.checked ? next.add(u.uid) : next.delete(u.uid); setNewTaskAssignees(next); }} className="w-5 h-5 accent-indigo-500" /><span className="text-gray-300">{u.name}</span></label>)}
                </div>
                <p className="text-xs text-indigo-300">{newTaskAssignees.size} miembro(s) seleccionado(s)</p>
              </> : <select value={newTaskAssignee} onChange={e => setNewTaskAssignee(e.target.value)} className="w-full bg-logia-900 border border-logia-700 rounded p-3 text-white"><option value="">Sin asignar</option>{users.filter(u => u.active && u.role !== 'viewer').map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}</select>}
              <div className="flex gap-3"><button onClick={handleSaveTask} disabled={isReadOnly || isSubmitting} className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded disabled:opacity-50">{isSubmitting ? 'Guardando...' : editingTask ? 'Actualizar tarea' : newTaskMode === 'team' ? 'Crear tarea de equipo' : 'Crear ' + newTaskAssignees.size + ' tarea(s)'}</button>{editingTask && <button onClick={handleCancelEditTask} className="flex-1 bg-gray-700 text-white font-bold py-3 rounded">Cancelar</button>}</div>
            </div>
            <div className="bg-logia-800 rounded-xl border border-logia-700 shadow-lg overflow-hidden">
              <div className="p-4 border-b border-logia-700"><h4 className="font-bold text-white">Lista de Tareas ({tasks.filter(t => !t.completed).length} pendientes / {tasks.filter(t => t.completed).length} completadas)</h4></div>
              <div className="p-4 space-y-2">{tasks.length === 0 ? <p className="text-gray-400 text-center py-4">No hay tareas creadas</p> : tasks.map(task => <div key={task.id} className={(task.completed ? 'bg-logia-900/50' : 'bg-logia-900') + ' border border-logia-700 p-4 rounded flex items-start gap-3'}><input type="checkbox" checked={task.completed} onChange={() => handleToggleTask(task.id, task.completed)} disabled={isReadOnly} className="mt-1 w-5 h-5" /><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h5 className={'font-bold ' + (task.completed ? 'text-gray-500 line-through' : 'text-white')}>{task.title}</h5>{task.assignmentMode === 'team' && <span className="text-[10px] bg-purple-900/50 text-purple-300 border border-purple-600/40 rounded px-2 py-1">👥 Equipo</span>}</div>{task.description && <p className="text-sm text-gray-400 mt-1">{task.description}</p>}<p className="text-xs text-blue-300 mt-2">{task.assignmentMode === 'team' ? 'Equipo: ' + (task.assignedToNames || []).join(', ') : task.assignedToName ? '👤 ' + task.assignedToName : 'Sin asignar'}</p></div><div className="flex gap-2"><button onClick={() => handleEditTask(task)} disabled={isReadOnly || task.assignmentMode === 'team'} className="p-2 bg-logia-800 rounded border border-logia-700 disabled:opacity-30">✏️</button><button onClick={() => handleDeleteTask(task.id)} disabled={isReadOnly} className="p-2 bg-red-600 rounded">🗑️</button></div></div>)}</div>
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
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                        <h3 className="text-xl font-bold text-white">📊 Matriz de Pagos</h3>
                        <div className="flex gap-2 flex-wrap">
                            <button onClick={loadAllLedgers} className="bg-logia-900 hover:bg-logia-700 text-gray-300 px-3 py-1 rounded text-xs border border-logia-700 flex items-center gap-1">
                                🔄 Actualizar
                            </button>
                            <button onClick={handleDownloadMatrixCSV} className="bg-green-800 hover:bg-green-700 text-white px-3 py-1 rounded text-xs border border-green-700 flex items-center gap-1">
                                📥 CSV filtrado
                            </button>
                            {matrixFilter === 'extra' && matrixExtraDesc && (
                                <>
                                    <button
                                        onClick={async () => { await loadPaymentReceipts(); setShowMatrixReceiptsModal(true); }}
                                        className="bg-purple-800 hover:bg-purple-700 text-white px-3 py-1 rounded text-xs border border-purple-700 flex items-center gap-1"
                                    >
                                        🧾 Comprobantes ({getMatrixFilteredReceipts().length})
                                    </button>
                                    <button
                                        onClick={handleReconcileMatrixConcept}
                                        disabled={reconcilingMatrixConcept || isReadOnly}
                                        title="Corrige pagos históricos usando los montos reales de comprobantes aprobados"
                                        className="bg-orange-800 hover:bg-orange-700 disabled:opacity-40 text-white px-3 py-1 rounded text-xs border border-orange-700 flex items-center gap-1"
                                    >
                                        {reconcilingMatrixConcept ? '⏳ Recalculando...' : '♻️ Reconciliar'}
                                    </button>
                                </>
                            )}
                            <button onClick={() => {
                                const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
                                const activeUsers = filteredUsers.filter(u => u.active);
                                const colW = 52, nameW = 175, rowH = 28, headerH = 45, legendH = 35, pad = 12;
                                const canvasW = nameW + colW * 12 + pad * 2;
                                const canvasH = headerH + rowH * activeUsers.length + legendH + pad;
                                const canvas = document.createElement('canvas');
                                canvas.width = canvasW; canvas.height = canvasH;
                                const ctx = canvas.getContext('2d')!;
                                // Background
                                ctx.fillStyle = '#1e2537'; ctx.fillRect(0, 0, canvasW, canvasH);
                                // Title
                                ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif';
                                ctx.fillText(`Matriz de Pagos ${matrixYear}`, pad, 20);
                                ctx.fillStyle = '#6b7280'; ctx.font = '10px sans-serif';
                                ctx.fillText(`Generado ${new Date().toLocaleDateString('es-MX')}`, pad, 35);
                                // Column headers
                                ctx.fillStyle = '#9ca3af'; ctx.font = 'bold 10px sans-serif';
                                months.forEach((m, i) => ctx.fillText(m, nameW + pad + i*colW + colW/2 - 10, headerH - 6));
                                // Rows
                                activeUsers.forEach((u, ri) => {
                                    const y = headerH + ri * rowH;
                                    const userLedger = allUserLedgers[u.uid] || [];
                                    // Alternating row bg
                                    ctx.fillStyle = ri % 2 === 0 ? '#252b3b' : '#1e2537';
                                    ctx.fillRect(0, y, canvasW, rowH);
                                    // Name
                                    ctx.fillStyle = '#e5e7eb'; ctx.font = '10px sans-serif';
                                    ctx.fillText(u.name.substring(0,24), pad, y + rowH/2 + 4);
                                    // Month cells
                                    months.forEach((_, mi) => {
                                        const period = `${matrixYear}-${String(mi+1).padStart(2,'0')}`;
                                        const p = userLedger.find(x => x.period === period);
                                        const x = nameW + pad + mi * colW;
                                        const cellPad = 2;
                                        if (!p) { ctx.fillStyle = '#374151'; }
                                        else if (p.regularCovered) {
                                            const hasExtra = (p.extraFees?.length && p.extraFees.some(ef => ef.paid < ef.amount)) || (p.extraAmount && (p.paidExtra||0) < p.extraAmount);
                                            ctx.fillStyle = hasExtra ? '#ca8a04' : '#16a34a';
                                        }
                                        else if ((p.paidRegular ?? 0) > 0) { ctx.fillStyle = '#b45309'; }
                                        else { ctx.fillStyle = '#7f1d1d'; }
                                        ctx.fillRect(x + cellPad, y + cellPad, colW - cellPad*2, rowH - cellPad*2);
                                        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif';
                                        const sym = !p ? '–' : p.regularCovered ? '✓' : (p.paidRegular ?? 0) > 0 ? '½' : '✗';
                                        ctx.fillText(sym, x + colW/2 - 4, y + rowH/2 + 4);
                                    });
                                });
                                // Legend
                                const ly = headerH + activeUsers.length * rowH + 8;
                                const legend = [{c:'#16a34a',l:'Pagado'},{c:'#ca8a04',l:'Pagado+Extra'},{c:'#b45309',l:'Parcial'},{c:'#7f1d1d',l:'Pendiente'},{c:'#374151',l:'Sin cuota'}];
                                legend.forEach((item, i) => {
                                    ctx.fillStyle = item.c; ctx.fillRect(pad + i*95, ly, 12, 12);
                                    ctx.fillStyle = '#9ca3af'; ctx.font = '9px sans-serif';
                                    ctx.fillText(item.l, pad + i*95 + 15, ly + 10);
                                });
                                const a = document.createElement('a'); a.href = canvas.toDataURL('image/png');
                                a.download = `matriz-${matrixYear}.png`; a.click();
                            }} className="bg-blue-800 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs border border-blue-700 flex items-center gap-1">
                                🖼️ Imagen
                            </button>
                        </div>
                    </div>
                    <p className="text-gray-400 mb-4 text-sm">
                        Vista rápida de los pagos mensuales. Haz clic en una celda para registrar o editar el pago.
                    </p>
                    
                    {/* Año + Filtro */}
                    <div className="flex flex-wrap gap-4 mb-5 items-end">
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1 uppercase">Año</label>
                            <input
                                type="number"
                                value={matrixYear}
                                onChange={(e) => setMatrixYear(Number(e.target.value))}
                                min="2020" max="2100"
                                className="w-28 px-3 py-2 bg-logia-900 border border-logia-700 rounded text-white text-sm focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-400 mb-1 uppercase">Filtrar por cuota</label>
                            <div className="flex flex-wrap gap-2">
                                {/* Cuota mensual */}
                                <button
                                    onClick={() => { setMatrixFilter('regular'); setMatrixExtraDesc(''); }}
                                    className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${matrixFilter === 'regular' ? 'bg-indigo-700 border-indigo-500 text-white' : 'bg-logia-900 border-logia-700 text-gray-300 hover:bg-logia-700'}`}
                                >
                                    📅 Cuota mensual
                                </button>
                                {/* Cuotas extraordinarias — solo activas por defecto */}
                                {(() => {
                                    const activeDescs = new Set<string>();   // tienen deuda activa
                                    const closedDescs = new Set<string>();   // todas pagadas/perdonadas

                                    for (const ledger of Object.values(allUserLedgers)) {
                                        for (const p of ledger) {
                                            if (!p.period.startsWith(String(matrixYear))) continue;
                                            if (p.extraFees?.length) {
                                                p.extraFees.forEach(ef => {
                                                    if (!ef.forgiven && ef.paid < ef.amount) {
                                                        activeDescs.add(ef.description);
                                                    } else {
                                                        // Solo agregar a cerradas si NO está ya en activas
                                                        if (!activeDescs.has(ef.description)) closedDescs.add(ef.description);
                                                    }
                                                });
                                            } else if (p.extraAmount && p.extraAmount > 0) {
                                                const desc = p.extraDescription || 'Cuota Extra';
                                                const debt = Math.max(0, p.extraAmount - (p.paidExtra || 0));
                                                if (debt > 0) activeDescs.add(desc);
                                                else if (!activeDescs.has(desc)) closedDescs.add(desc);
                                            }
                                        }
                                    }
                                    // Remove from closed anything that's also active
                                    activeDescs.forEach(d => closedDescs.delete(d));

                                    const visibleDescs = showClosedExtraFilters
                                        ? [...Array.from(activeDescs), ...Array.from(closedDescs)]
                                        : Array.from(activeDescs);

                                    return (
                                        <>
                                            {visibleDescs.map(desc => {
                                                const isClosed = !activeDescs.has(desc);
                                                return (
                                                    <button key={desc}
                                                        onClick={() => { setMatrixFilter('extra'); setMatrixExtraDesc(desc); }}
                                                        className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${
                                                            matrixFilter === 'extra' && matrixExtraDesc === desc
                                                                ? 'bg-purple-700 border-purple-500 text-white'
                                                                : isClosed
                                                                    ? 'bg-logia-900 border-logia-700 text-gray-500 line-through'
                                                                    : 'bg-logia-900 border-logia-700 text-gray-300 hover:bg-logia-700'
                                                        }`}
                                                    >
                                                        {isClosed ? '✓' : '⭐'} {desc}
                                                    </button>
                                                );
                                            })}
                                            {closedDescs.size > 0 && (
                                                <button
                                                    onClick={() => setShowClosedExtraFilters(p => !p)}
                                                    className="px-2 py-1 text-xs text-gray-500 hover:text-gray-300 underline"
                                                >
                                                    {showClosedExtraFilters ? 'Ocultar cerradas' : `ver ${closedDescs.size} cerrada${closedDescs.size > 1 ? 's' : ''}`}
                                                </button>
                                            )}
                                        </>
                                    );
                                })()}
                                {/* Sin filtro */}
                                <button
                                    onClick={() => { setMatrixFilter('all'); setMatrixExtraDesc(''); }}
                                    className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${matrixFilter === 'all' ? 'bg-gray-600 border-gray-500 text-white' : 'bg-logia-900 border-logia-700 text-gray-300 hover:bg-logia-700'}`}
                                >
                                    📊 General (todo)
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ── PANEL: Cuota Extra Masiva ── */}
                    <div className="border border-logia-700 rounded-lg overflow-hidden mb-4">
                        <button
                            onClick={() => setShowBulkExtraPanel(p => !p)}
                            className="w-full flex justify-between items-center px-4 py-3 bg-logia-900 hover:bg-logia-700 text-left"
                        >
                            <span className="text-white font-bold text-sm">⭐ Crear Cuota Extra Masiva</span>
                            <span className="text-gray-400 text-xs">{showBulkExtraPanel ? '▲ ocultar' : '▼ expandir'}</span>
                        </button>                        {showBulkExtraPanel && (
                            <div className="p-4 bg-logia-800/60 space-y-3">
                                <p className="text-gray-400 text-xs">Asigna una cuota extraordinaria a todos (o algunos) miembros en un mes específico. Aparecerá en el filtro de la matriz automáticamente.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="text-xs text-gray-400 uppercase font-bold block mb-1">Descripción *</label>
                                        <input type="text" value={bulkExtraDesc} onChange={e => setBulkExtraDesc(e.target.value)}
                                            placeholder="Ej: Cena anual 2026"
                                            className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-400 uppercase font-bold block mb-1">Monto *</label>
                                        <input type="number" min="0" step="0.01" value={bulkExtraAmount} onChange={e => setBulkExtraAmount(e.target.value)}
                                            placeholder="Ej: 500"
                                            className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-400 uppercase font-bold block mb-1">Período (mes) *</label>
                                        <input type="month" value={bulkExtraPeriod} onChange={e => setBulkExtraPeriod(e.target.value)}
                                            className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs text-gray-400 uppercase font-bold block mb-2">Aplicar a</label>
                                    <div className="flex gap-2 mb-2">
                                        <button onClick={() => setBulkExtraTargets('all')}
                                            className={`px-3 py-1 rounded text-xs font-bold border ${bulkExtraTargets === 'all' ? 'bg-indigo-700 border-indigo-500 text-white' : 'bg-logia-900 border-logia-700 text-gray-300'}`}>
                                            Todos los miembros activos
                                        </button>
                                        <button onClick={() => setBulkExtraTargets('select')}
                                            className={`px-3 py-1 rounded text-xs font-bold border ${bulkExtraTargets === 'select' ? 'bg-indigo-700 border-indigo-500 text-white' : 'bg-logia-900 border-logia-700 text-gray-300'}`}>
                                            Seleccionar
                                        </button>
                                    </div>
                                    {bulkExtraTargets === 'select' && (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-32 overflow-y-auto bg-logia-900/50 rounded p-2 border border-logia-700">
                                            {filteredUsers.filter(u => u.active).map(u => (
                                                <label key={u.uid} className="flex items-center gap-1 text-xs text-white cursor-pointer">
                                                    <input type="checkbox"
                                                        checked={bulkExtraSelected.includes(u.uid)}
                                                        onChange={() => setBulkExtraSelected(prev =>
                                                            prev.includes(u.uid) ? prev.filter(x => x !== u.uid) : [...prev, u.uid]
                                                        )}
                                                        className="accent-indigo-500" />
                                                    {u.name}
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {bulkExtraMsg && (
                                    <div className={`text-xs p-2 rounded ${bulkExtraMsg.type === 'success' ? 'bg-green-900/40 text-green-300 border border-green-700' : 'bg-red-900/40 text-red-300 border border-red-700'}`}>
                                        {bulkExtraMsg.text}
                                    </div>
                                )}

                                <button
                                    disabled={creatingBulkExtra || !bulkExtraDesc.trim() || !bulkExtraAmount || !bulkExtraPeriod || isReadOnly}
                                    onClick={async () => {
                                        if (!bulkExtraDesc.trim() || !bulkExtraAmount || !bulkExtraPeriod) return;
                                        setCreatingBulkExtra(true); setBulkExtraMsg(null);
                                        try {
                                            const targets = bulkExtraTargets === 'all'
                                                ? filteredUsers.filter(u => u.active).map(u => u.uid)
                                                : bulkExtraSelected;
                                            if (targets.length === 0) { setBulkExtraMsg({text:'Sin miembros seleccionados.', type:'error'}); return; }
                                            const { created, skipped } = await dataService.bulkCreateExtraFee(
                                                user.groupId, bulkExtraPeriod, bulkExtraDesc.trim(),
                                                Number(bulkExtraAmount), targets, user.uid
                                            );
                                            setBulkExtraMsg({ text: `✅ Cuota creada en ${created} miembro(s). ${skipped > 0 ? `${skipped} ya la tenían.` : ''}`, type: 'success' });
                                            setBulkExtraDesc(''); setBulkExtraAmount(''); setBulkExtraPeriod('');
                                            setBulkExtraSelected([]);
                                            loadAllLedgers();
                                        } catch(e: any) {
                                            setBulkExtraMsg({ text: `Error: ${e.message}`, type: 'error' });
                                        } finally { setCreatingBulkExtra(false); }
                                    }}
                                    className="bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white font-bold px-4 py-2 rounded text-sm"
                                >
                                    {creatingBulkExtra ? 'Creando...' : '⭐ Crear cuota para miembros'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ── PANEL: Cerrar TODAS las extras del año (legacy cleanup) ── */}
                    <div className="border border-red-800/40 rounded-lg overflow-hidden mb-4">
                        <button
                            className="w-full flex justify-between items-center px-4 py-3 bg-red-900/20 hover:bg-red-900/30 text-left"
                            onClick={() => { setMatrixExtraDesc(''); setMatrixFilter('all'); setShowForgivePanel(p => !p); }}
                        >
                            <span className="text-red-300 font-bold text-sm">🧹 Cerrar / Perdonar TODAS las cuotas extras del año {matrixYear}</span>
                            <span className="text-gray-400 text-xs">{(!matrixExtraDesc && showForgivePanel) ? '▲ ocultar' : '▼ expandir'}</span>
                        </button>
                        {!matrixExtraDesc && showForgivePanel && (
                            <div className="p-4 bg-logia-800/60 space-y-3">
                                <div className="bg-red-900/30 border border-red-700/40 rounded p-3 text-xs text-red-200">
                                    ⚠️ Esto perdonará TODAS las cuotas extras sin pagar de {matrixYear} para todos los miembros activos, sin importar la descripción. Los que pagaron se quedan como pagados. Ideal para limpiar cuotas legacy.
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-gray-400 uppercase font-bold block mb-1">Período (opcional)</label>
                                        <div className="flex gap-2">
                                            <button onClick={() => setForgivePeriod('')}
                                                className={'px-3 py-1 rounded text-xs font-bold border ' + (forgivePeriod === '' ? 'bg-red-700 border-red-600 text-white' : 'bg-logia-900 border-logia-700 text-gray-300')}>
                                                Todo el año {matrixYear}
                                            </button>
                                            <input type="month" value={forgivePeriod} onChange={e => setForgivePeriod(e.target.value)}
                                                className="flex-1 bg-logia-900 border border-logia-700 rounded p-1 text-white text-xs" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-400 uppercase font-bold block mb-1">Nota (opcional)</label>
                                        <input type="text" value={forgiveNote} onChange={e => setForgiveNote(e.target.value)}
                                            placeholder="Ej: Limpieza de cuotas legacy"
                                            className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-xs" />
                                    </div>
                                </div>
                                {forgiveMsg && (
                                    <div className={'text-xs p-2 rounded ' + (forgiveMsg.type === 'success' ? 'bg-green-900/40 text-green-300 border border-green-700' : 'bg-red-900/40 text-red-300 border border-red-700')}>
                                        {forgiveMsg.text}
                                    </div>
                                )}
                                <button
                                    disabled={forgivingFee || isReadOnly}
                                    onClick={async () => {
                                        const periodLabel = forgivePeriod ? 'del mes ' + forgivePeriod : 'de todo el año ' + matrixYear;
                                        if (!window.confirm('¿Perdonar TODAS las cuotas extras sin pagar ' + periodLabel + ' de todos los miembros activos?')) return;
                                        setForgivingFee(true); setForgiveMsg(null);
                                        try {
                                            const targets = filteredUsers.filter(u => u.active).map(u => u.uid);
                                            const count = await dataService.forgiveExtraFee(
                                                null,  // null = todas las descripciones
                                                forgivePeriod || null,
                                                forgivePeriod ? null : matrixYear,
                                                targets, user.uid, forgiveNote.trim()
                                            );
                                            setForgiveMsg({ text: '✅ ' + count + ' registro(s) perdonados. El filtro de cuotas activas se actualizará.', type: 'success' });
                                            setForgiveNote(''); setForgivePeriod('');
                                            loadAllLedgers();
                                        } catch(e: any) {
                                            setForgiveMsg({ text: 'Error: ' + (e?.message || e), type: 'error' });
                                        } finally { setForgivingFee(false); }
                                    }}
                                    className="bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white font-bold px-4 py-2 rounded text-sm"
                                >
                                    {forgivingFee ? 'Procesando...' : '🧹 Perdonar TODAS las extras sin pagar'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ── PANEL: Cerrar/Perdonar cuota extra específica ── */}
                    {matrixFilter === 'extra' && matrixExtraDesc && (
                        <div className="border border-orange-700/50 rounded-lg overflow-hidden mb-4">
                            <button
                                onClick={() => setShowForgivePanel(p => !p)}
                                className="w-full flex justify-between items-center px-4 py-3 bg-orange-900/30 hover:bg-orange-900/50 text-left"
                            >
                                <span className="text-orange-300 font-bold text-sm">🔒 Cerrar / Perdonar deuda: "{matrixExtraDesc}"</span>
                                <span className="text-gray-400 text-xs">{showForgivePanel ? '▲ ocultar' : '▼ expandir'}</span>
                            </button>
                            {showForgivePanel && (
                                <div className="p-4 bg-logia-800/60 space-y-3">
                                    <div className="bg-yellow-900/30 border border-yellow-700/40 rounded p-3 text-xs text-yellow-200">
                                        ⚠️ Esto perdona la deuda pendiente a los miembros que <strong>no pagaron</strong> esta cuota. El registro permanece con el monto original y la fecha de perdón, pero deja de contarse como deuda activa.
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs text-gray-400 uppercase font-bold block mb-1">Período a cerrar</label>
                                            <div className="flex gap-2">
                                                <button onClick={() => setForgivePeriod('')}
                                                    className={`px-3 py-1 rounded text-xs font-bold border ${forgivePeriod === '' ? 'bg-orange-700 border-orange-600 text-white' : 'bg-logia-900 border-logia-700 text-gray-300'}`}>
                                                    Todo el año {matrixYear}
                                                </button>
                                                <input type="month" value={forgivePeriod} onChange={e => setForgivePeriod(e.target.value)}
                                                    placeholder="Mes específico"
                                                    className="flex-1 bg-logia-900 border border-logia-700 rounded p-1 text-white text-xs" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-400 uppercase font-bold block mb-1">Nota (opcional)</label>
                                            <input type="text" value={forgiveNote} onChange={e => setForgiveNote(e.target.value)}
                                                placeholder="Ej: Cuota cerrada por acuerdo de asamblea"
                                                className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-xs" />
                                        </div>
                                    </div>

                                    {forgiveMsg && (
                                        <div className={`text-xs p-2 rounded ${forgiveMsg.type === 'success' ? 'bg-green-900/40 text-green-300 border border-green-700' : 'bg-red-900/40 text-red-300 border border-red-700'}`}>
                                            {forgiveMsg.text}
                                        </div>
                                    )}

                                    <button
                                        disabled={forgivingFee || isReadOnly}
                                        onClick={async () => {
                                            const periodLabel = forgivePeriod ? 'del mes ' + forgivePeriod : 'de todo el año ' + matrixYear;
                                            if (!window.confirm('\u00bfPerdonar la deuda de "' + matrixExtraDesc + '" ' + periodLabel + ' a todos los miembros que no pagaron?')) return;
                                            setForgivingFee(true); setForgiveMsg(null);
                                            try {
                                                const targets = filteredUsers.filter(u => u.active).map(u => u.uid);
                                                const count = await dataService.forgiveExtraFee(
                                                    matrixExtraDesc,
                                                    forgivePeriod || null,
                                                    forgivePeriod ? null : matrixYear,
                                                    targets,
                                                    user.uid,
                                                    forgiveNote.trim()
                                                );
                                                setForgiveMsg({ text: '\u2705 Deuda perdonada en ' + count + ' registro(s). Ya no aparece como deuda activa.', type: 'success' });
                                                setForgiveNote(''); setForgivePeriod('');
                                                loadAllLedgers();
                                            } catch(e: any) {
                                                setForgiveMsg({ text: 'Error: ' + (e?.message || e), type: 'error' });
                                            } finally { setForgivingFee(false); }
                                        }}
                                        className="bg-orange-700 hover:bg-orange-600 disabled:opacity-40 text-white font-bold px-4 py-2 rounded text-sm"
                                    >
                                        {forgivingFee ? 'Procesando...' : '\uD83D\uDD12 Perdonar deuda de "' + matrixExtraDesc + '"'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
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

                                            let cellClass = 'bg-logia-900/50 text-gray-600 cursor-default';
                                            let cellTitle = 'Sin cuota registrada';
                                            let cellText = '–';

                                            if (matrixFilter === 'regular') {
                                                // Solo cuota mensual regular
                                                if (!paymentData) { cellTitle = 'Sin cuota'; }
                                                else {
                                                    const isPaid = !!paymentData.regularCovered;
                                                    const paidReg = Number(paymentData.paidRegular ?? paymentData.paid ?? 0);
                                                    const isPartial = !isPaid && paidReg > 0;
                                                    if (isPaid) { cellClass = 'bg-green-600 text-white cursor-pointer hover:brightness-110'; cellTitle = `Pagado $${paymentData.amount}`; cellText = '✓'; }
                                                    else if (isPartial) { cellClass = 'bg-yellow-700/60 text-yellow-200 cursor-pointer hover:brightness-110'; cellTitle = `Parcial: $${paidReg.toFixed(0)} / $${paymentData.amount}`; cellText = '½'; }
                                                    else { cellClass = 'bg-red-900/30 text-gray-400 cursor-pointer hover:brightness-110'; cellTitle = `Pendiente: $${paymentData.amount}`; cellText = '✗'; }
                                                }
                                            } else if (matrixFilter === 'extra' && matrixExtraDesc) {
                                                // Cuota extraordinaria específica
                                                const ef = paymentData?.extraFees?.find(f => f.description === matrixExtraDesc);
                                                const legacyMatch = !paymentData?.extraFees?.length && paymentData?.extraAmount &&
                                                    (paymentData.extraDescription || 'Cuota Extra') === matrixExtraDesc;
                                                if (!paymentData || (!ef && !legacyMatch)) {
                                                    cellTitle = 'Sin esta cuota extra'; cellText = '–';
                                                } else if (ef) {
                                                    if (ef.forgiven) {
                                                        cellClass = 'bg-gray-700/60 text-gray-400 cursor-pointer hover:brightness-110';
                                                        cellTitle = `Perdonado — no pagó $${ef.amount}${ef.forgivenNote ? ` · ${ef.forgivenNote}` : ''}`;
                                                        cellText = '○';
                                                    } else {
                                                        const receiptEvidence = getApprovedExtraReceiptTotal(u.uid, period, ef.description, ef.id);
                                                        const effectivePaid = receiptEvidence.count > 0
                                                            ? Math.min(Number(ef.amount) || 0, receiptEvidence.total)
                                                            : (Number(ef.paid) || 0);
                                                        const covered = effectivePaid >= ef.amount;
                                                        const partial = !covered && effectivePaid > 0;
                                                        if (covered) { cellClass = 'bg-purple-600 text-white cursor-pointer hover:brightness-110'; cellTitle = `Pagado $${effectivePaid.toFixed(0)} / $${ef.amount}`; cellText = '✓'; }
                                                        else if (partial) { cellClass = 'bg-purple-900/60 text-purple-200 cursor-pointer hover:brightness-110'; cellTitle = `Parcial: $${effectivePaid.toFixed(0)} / $${ef.amount}`; cellText = '½'; }
                                                        else { cellClass = 'bg-red-900/30 text-gray-400 cursor-pointer hover:brightness-110'; cellTitle = `Pendiente: $${ef.amount}`; cellText = '✗'; }
                                                    }
                                                } else if (legacyMatch) {
                                                    const extraAmount = Number(paymentData.extraAmount) || 0;
                                                    const description = paymentData.extraDescription || 'Cuota Extra';
                                                    const receiptEvidence = getApprovedExtraReceiptTotal(u.uid, period, description);
                                                    const paidExtra = receiptEvidence.count > 0
                                                        ? Math.min(extraAmount, receiptEvidence.total)
                                                        : (Number(paymentData.paidExtra) || 0);
                                                    const covered = paidExtra >= extraAmount;
                                                    const partial = !covered && paidExtra > 0;
                                                    if (covered) { cellClass = 'bg-purple-600 text-white cursor-pointer hover:brightness-110'; cellTitle = `Pagado $${paidExtra.toFixed(0)} / $${extraAmount}`; cellText = '✓'; }
                                                    else if (partial) { cellClass = 'bg-purple-900/60 text-purple-200 cursor-pointer hover:brightness-110'; cellTitle = `Parcial: $${paidExtra.toFixed(0)} / $${extraAmount}`; cellText = '½'; }
                                                    else { cellClass = 'bg-red-900/30 text-gray-400 cursor-pointer hover:brightness-110'; cellTitle = `Pendiente: $${extraAmount}`; cellText = '✗'; }
                                                }
                                            } else {
                                                // General — todo combinado
                                                if (!paymentData) { cellTitle = 'Sin cuota'; }
                                                else {
                                                    const isPaid = !!paymentData.regularCovered;
                                                    const paidReg = Number(paymentData.paidRegular ?? paymentData.paid ?? 0);
                                                    const isPartial = !isPaid && paidReg > 0;
                                                    const extraDebt = paymentData.extraFees?.length
                                                        ? paymentData.extraFees.reduce((s, ef) => s + Math.max(0, ef.amount - ef.paid), 0)
                                                        : paymentData.extraAmount ? Math.max(0, paymentData.extraAmount - (paymentData.paidExtra || 0)) : 0;
                                                    const hasExtra = (paymentData.extraFees?.length || 0) > 0 || (paymentData.extraAmount || 0) > 0;
                                                    if (isPaid && (!hasExtra || extraDebt <= 0)) { cellClass = 'bg-green-600 text-white cursor-pointer hover:brightness-110'; cellTitle = 'Pagado (todo)'; cellText = '✓'; }
                                                    else if (isPaid && extraDebt > 0) { cellClass = 'bg-teal-700 text-white cursor-pointer hover:brightness-110'; cellTitle = `Cuota pagada, extra pendiente $${extraDebt.toFixed(0)}`; cellText = '✓*'; }
                                                    else if (isPartial) { cellClass = 'bg-yellow-700/60 text-yellow-200 cursor-pointer hover:brightness-110'; cellTitle = 'Parcial'; cellText = '½'; }
                                                    else { cellClass = 'bg-red-900/30 text-gray-400 cursor-pointer hover:brightness-110'; cellTitle = 'Pendiente'; cellText = '✗'; }
                                                }
                                            }
                                            
                                            return (
                                                <td 
                                                    key={idx} 
                                                    className={`p-2 text-center border border-logia-700 transition-colors ${cellClass}`}
                                                    onClick={() => paymentData && handleOpenMatrixModal(u.uid, u.name, period)}
                                                    title={cellTitle}
                                                >
                                                    {cellText}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    
                    <div className="mt-4 flex flex-wrap gap-4 text-xs">
                        {matrixFilter === 'extra'
                            ? <>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-purple-600 rounded"></div><span className="text-gray-400">Pagado</span></div>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-purple-900/60 rounded"></div><span className="text-gray-400">Parcial</span></div>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-red-900/30 rounded border border-logia-700"></div><span className="text-gray-400">Pendiente</span></div>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-gray-700/60 rounded"></div><span className="text-gray-400">○ Perdonado</span></div>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-logia-900/50 rounded border border-logia-700"></div><span className="text-gray-400">Sin esta cuota</span></div>
                            </>
                            : matrixFilter === 'all'
                            ? <>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-green-600 rounded"></div><span className="text-gray-400">Todo pagado</span></div>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-teal-700 rounded"></div><span className="text-gray-400">Cuota pagada, extra pendiente</span></div>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-yellow-700/60 rounded"></div><span className="text-gray-400">Parcial</span></div>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-red-900/30 rounded border border-logia-700"></div><span className="text-gray-400">Pendiente</span></div>
                            </>
                            : <>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-green-600 rounded"></div><span className="text-gray-400">Pagado</span></div>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-yellow-700/60 rounded"></div><span className="text-gray-400">Parcial</span></div>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-red-900/30 rounded border border-logia-700"></div><span className="text-gray-400">Pendiente</span></div>
                                <div className="flex items-center gap-2"><div className="w-4 h-4 bg-logia-900/50 rounded border border-logia-700"></div><span className="text-gray-400">Sin cuota</span></div>
                            </>
                        }
                    </div>
                </div>
            </div>
        )}

        {/* CREATE USER TAB */}
        {activeTab === 'create-user' && (
            <div className="space-y-6">
                <div className="bg-logia-800 border border-logia-700 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-white mb-4">👤 Crear Nuevo Usuario</h3>
                    <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4 mb-4">
                        <p className="text-yellow-200 text-sm font-medium mb-2">⚠️ Importante - Vinculación Automática:</p>
                        <ul className="text-yellow-100 text-xs space-y-1 list-disc list-inside">
                            <li><strong>Si conoces el email del miembro:</strong> Ingrésalo aquí. Cuando se registre con ese email, todos sus datos se vincularán automáticamente.</li>
                            <li><strong>Si NO conoces el email:</strong> Déjalo vacío. Tendrás que activar manualmente al usuario cuando se registre.</li>
                        </ul>
                    </div>
                    
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

        {/* MANUAL MERGE TAB */}
        {activeTab === 'manual-merge' && (
            <div className="space-y-6">
                <div className="bg-logia-800 rounded-xl p-6 border border-logia-700">
                    <h3 className="text-xl font-bold text-white mb-4">🔗 Vincular Usuarios Manualmente</h3>
                    
                    <div className="bg-blue-900/30 border border-blue-600/50 rounded-lg p-4 mb-6">
                        <p className="text-blue-200 text-sm font-medium mb-2">ℹ️ Acerca de esta herramienta:</p>
                        <ul className="text-blue-100 text-xs space-y-1 list-disc list-inside">
                            <li>Esta herramienta permite vincular usuarios temporales (creados sin email) con usuarios reales que ya se registraron.</li>
                            <li>Se copiarán todos los pagos, asistencias y datos del usuario temporal al usuario real.</li>
                            <li>El usuario temporal será eliminado después de la vinculación.</li>
                            <li><strong>Importante:</strong> Esta acción no se puede deshacer. Verifica bien antes de vincular.</li>
                        </ul>
                    </div>

                    {tempUsers.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-gray-400">✅ No hay usuarios temporales pendientes de vinculación.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    1. Selecciona el Usuario Temporal (con correo temp_)
                                </label>
                                <select
                                    value={selectedTempUser || ''}
                                    onChange={(e) => setSelectedTempUser(e.target.value || null)}
                                    className="w-full px-4 py-2 bg-logia-900 border border-logia-700 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">-- Selecciona un usuario temporal --</option>
                                    {tempUsers.map(u => (
                                        <option key={u.uid} value={u.uid}>
                                            {u.name} ({u.email})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    2. Selecciona el Usuario Real (registrado con email válido)
                                </label>
                                <select
                                    value={selectedRealUser || ''}
                                    onChange={(e) => setSelectedRealUser(e.target.value || null)}
                                    className="w-full px-4 py-2 bg-logia-900 border border-logia-700 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">-- Selecciona un usuario real --</option>
                                    {users
                                        .filter(u => !u.uid.startsWith('temp_'))
                                        .map(u => (
                                            <option key={u.uid} value={u.uid}>
                                                {u.name} ({u.email}) - {u.active ? '✅ Activo' : '⚠️ Inactivo'}
                                            </option>
                                        ))}
                                </select>
                            </div>

                            {selectedTempUser && selectedRealUser && (
                                <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4">
                                    <p className="text-yellow-200 text-sm font-medium mb-2">⚠️ Resumen de Vinculación:</p>
                                    <div className="text-yellow-100 text-xs space-y-1">
                                        <p><strong>Usuario Temporal:</strong> {tempUsers.find(u => u.uid === selectedTempUser)?.name}</p>
                                        <p><strong>Usuario Real:</strong> {users.find(u => u.uid === selectedRealUser)?.name}</p>
                                        <p className="mt-2 text-yellow-200">
                                            Se copiarán todos los datos del usuario temporal al real y se eliminará el usuario temporal.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={handleManualMerge}
                                disabled={mergingUsers || !selectedTempUser || !selectedRealUser}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors"
                            >
                                {mergingUsers ? '⏳ Vinculando usuarios...' : '🔗 Vincular Usuarios'}
                            </button>
                        </div>
                    )}
                </div>

                {tempUsers.length > 0 && (
                    <div className="bg-logia-800 rounded-xl p-6 border border-logia-700">
                        <h4 className="text-lg font-bold text-white mb-4">📋 Usuarios Temporales Pendientes</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-logia-700">
                                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">Nombre</th>
                                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">Email Temporal</th>
                                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">Grado</th>
                                        <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">Rol</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tempUsers.map(u => (
                                        <tr key={u.uid} className="border-b border-logia-700 hover:bg-logia-900">
                                            <td className="py-3 px-4 text-white">{u.name}</td>
                                            <td className="py-3 px-4 text-gray-400 text-sm">{u.email}</td>
                                            <td className="py-3 px-4 text-gray-400">{u.degree || 'N/A'}</td>
                                            <td className="py-3 px-4">
                                                <span className={`px-2 py-1 rounded text-xs ${
                                                    u.role === 'admin' ? 'bg-purple-500/20 text-purple-200' :
                                                    u.role === 'master' ? 'bg-yellow-500/20 text-yellow-200' :
                                                    'bg-green-500/20 text-green-200'
                                                }`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* --- RECEIPTS TAB --- */}
        {activeTab === 'receipts' && (
          <div className="space-y-4">
            <div className="bg-logia-800 rounded-xl p-4 border border-logia-700">
              <h3 className="text-xl font-bold text-white mb-4">🧾 Comprobantes de Pago</h3>

              {/* Filtro / histórico */}
              <div className="flex gap-2 flex-wrap mb-2">
                {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
                  <button key={f} onClick={() => setReceiptFilter(f)}
                    className={`px-3 py-1 rounded text-sm font-bold transition-colors ${receiptFilter === f ? 'bg-logia-accent text-white' : 'bg-logia-900 text-gray-400 hover:bg-logia-700'}`}>
                    {f === 'pending' ? '⏳ Pendientes' : f === 'approved' ? '✅ Aprobados' : f === 'rejected' ? '❌ Rechazados' : '📚 Histórico completo'}
                  </button>
                ))}
                <button onClick={loadPaymentReceipts} className="ml-auto px-3 py-1 rounded text-sm bg-logia-900 text-gray-400 hover:bg-logia-700">
                  🔄 Actualizar
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
                <span className="text-gray-500">Cada registro puede abrirse o cerrarse.</span>
                <button
                  onClick={() => {
                    const ids = paymentReceipts
                      .filter(r => receiptFilter === 'all' || r.status === receiptFilter)
                      .map(r => r.id);
                    setExpandedReceiptIds(new Set(ids));
                  }}
                  className="px-2 py-1 rounded bg-logia-900 border border-logia-700 text-gray-300 hover:bg-logia-700"
                >
                  ▼ Expandir todos
                </button>
                <button
                  onClick={() => setExpandedReceiptIds(new Set())}
                  className="px-2 py-1 rounded bg-logia-900 border border-logia-700 text-gray-300 hover:bg-logia-700"
                >
                  ▲ Contraer todos
                </button>
              </div>

              {loadingReceipts ? (
                <p className="text-center text-gray-400 py-8">Cargando...</p>
              ) : (
                (() => {
                  const filtered = paymentReceipts.filter(r => receiptFilter === 'all' || r.status === receiptFilter);
                  if (filtered.length === 0) return <p className="text-center text-gray-500 py-8">No hay comprobantes.</p>;
                  return (
                    <div className="space-y-3">
                      {filtered.map((receipt: any) => {
                        const isExpanded = receipt.status === 'pending' || expandedReceiptIds.has(receipt.id);
                        return (
                        <div key={receipt.id} className={`rounded-lg border overflow-hidden ${
                          receipt.status === 'pending' ? 'border-yellow-600/60 bg-yellow-900/10' :
                          receipt.status === 'approved' ? 'border-green-600/60 bg-green-900/10' :
                          'border-red-600/60 bg-red-900/10'
                        }`}>
                          <button
                            type="button"
                            onClick={() => {
                              if (receipt.status === 'pending') return;
                              setExpandedReceiptIds(prev => {
                                const next = new Set(prev);
                                next.has(receipt.id) ? next.delete(receipt.id) : next.add(receipt.id);
                                return next;
                              });
                            }}
                            className={`w-full p-4 flex flex-wrap justify-between items-center gap-3 text-left ${receipt.status === 'pending' ? 'cursor-default' : 'hover:bg-logia-700/20'}`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-bold text-white">{receipt.userName}</p>
                                <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                                  receipt.status === 'pending' ? 'bg-yellow-700 text-yellow-100' :
                                  receipt.status === 'approved' ? 'bg-green-700 text-green-100' :
                                  'bg-red-700 text-red-100'
                                }`}>
                                  {receipt.status === 'pending' ? '⏳ Pendiente' : receipt.status === 'approved' ? '✅ Aprobado' : '❌ Rechazado'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-400 mt-1">
                                {receipt.receiptType === 'concepto_adicional'
                                  ? `${receipt.conceptDescription || 'Concepto adicional'} · ${receipt.extraFeePeriod || (receipt.periods || []).join(', ') || 'sin período'}`
                                  : `Cuota mensual · ${(receipt.periods || []).join(', ') || 'sin período'}`}
                                {receipt.amount ? ` · $${Number(receipt.amount).toFixed(2)}` : ''}
                              </p>
                              <p className="text-[11px] text-gray-500 mt-1">Enviado: {new Date(receipt.submittedAt).toLocaleString('es-MX')}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-1 rounded-full font-bold ${
                                receipt.receiptType === 'concepto_adicional' ? 'bg-purple-800 text-purple-200' : 'bg-indigo-800 text-indigo-200'
                              }`}>
                                {receipt.receiptType === 'concepto_adicional' ? '💡 Extra' : '📅 Mensual'}
                              </span>
                              {receipt.status !== 'pending' && <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>}
                            </div>
                          </button>

                          {isExpanded && (
                          <div className="px-4 pb-4 space-y-2 border-t border-logia-700/50 pt-3">
                            <div className="flex flex-wrap justify-between items-start gap-2">
                              <div>
                                <p className="text-xs text-gray-400">Transferencia: {new Date(receipt.transferDate).toLocaleString('es-MX')}</p>
                                {receipt.receiptType === 'concepto_adicional'
                                  ? <p className="text-sm text-gray-300 mt-1">Concepto: <span className="font-bold text-purple-300">{receipt.conceptDescription || '—'}</span></p>
                                  : <p className="text-sm text-gray-300 mt-1">Períodos: <span className="font-bold text-white">{(receipt.periods || []).join(', ')}</span></p>
                                }
                                {receipt.amount && <p className="text-sm text-gray-300">Monto declarado: <span className="font-bold text-yellow-300">${Number(receipt.amount).toFixed(2)}</span></p>}
                                {receipt.appliedAmount !== undefined && <p className="text-sm text-gray-300">Monto aplicado: <span className="font-bold text-green-300">${Number(receipt.appliedAmount).toFixed(2)}</span></p>}
                              </div>
                              <div className="flex flex-col gap-2 items-end">
                                {/* Mostrar todas las fotos/archivos adjuntos */}
                                {(() => {
                                  const urls: string[] = receipt.receiptImageUrls?.length
                                    ? receipt.receiptImageUrls
                                    : receipt.receiptImageUrl ? [receipt.receiptImageUrl] : [];
                                  return urls.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {urls.map((url: string, i: number) => (
                                        <button key={i} onClick={() => setViewingReceiptImage(url)}
                                          className="text-xs bg-logia-900 hover:bg-logia-700 text-blue-300 px-2 py-1 rounded border border-blue-600/40">
                                          🖼️ {urls.length > 1 ? `Foto ${i+1}` : 'Ver Foto'}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null;
                                })()}
                              </div>
                            </div>

                          {/* INLINE EDIT FORM */}
                          {editingReceiptId === receipt.id && (
                            <div className="mt-3 bg-logia-900 rounded-lg p-3 border border-yellow-600/40 space-y-3">
                              <p className="text-yellow-300 font-bold text-sm">✏️ Editando comprobante</p>
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">Tipo</label>
                                <div className="flex gap-3">
                                  <label className="flex items-center gap-1 text-sm text-white">
                                    <input type="radio" checked={editReceiptType === 'cuota_mensual'}
                                      onChange={() => setEditReceiptType('cuota_mensual')} className="accent-yellow-400" />
                                    Cuota Mensual
                                  </label>
                                  <label className="flex items-center gap-1 text-sm text-white">
                                    <input type="radio" checked={editReceiptType === 'concepto_adicional'}
                                      onChange={() => setEditReceiptType('concepto_adicional')} className="accent-yellow-400" />
                                    Concepto Adicional
                                  </label>
                                </div>
                              </div>
                              {editReceiptType === 'concepto_adicional' && (
                                <div>
                                  <label className="text-xs text-gray-400 block mb-1">Descripción del concepto</label>
                                  <input type="text" value={editReceiptConcept} onChange={e => setEditReceiptConcept(e.target.value)}
                                    className="w-full bg-logia-800 text-white px-3 py-1 rounded border border-logia-700 text-sm" />
                                </div>
                              )}
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">Períodos (separados por coma, ej: 2025-01, 2025-02)</label>
                                <input type="text" value={editReceiptPeriods.join(', ')}
                                  onChange={e => setEditReceiptPeriods(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                  className="w-full bg-logia-800 text-white px-3 py-1 rounded border border-logia-700 text-sm" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 block mb-1">Monto declarado ($)</label>
                                <input type="number" value={editReceiptAmount} onChange={e => setEditReceiptAmount(e.target.value)}
                                  className="w-full bg-logia-800 text-white px-3 py-1 rounded border border-logia-700 text-sm" />
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => saveReceiptEdit(receipt)} disabled={savingReceiptEdit}
                                  className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white text-xs px-4 py-2 rounded font-bold">
                                  {savingReceiptEdit ? 'Guardando...' : '💾 Guardar cambios'}
                                </button>
                                <button onClick={cancelEditingReceipt}
                                  className="bg-logia-700 hover:bg-logia-600 text-gray-300 text-xs px-4 py-2 rounded">
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}

                          {receipt.reviewComments && (
                            <p className="text-xs text-gray-400 italic bg-logia-900 p-2 rounded">Comentario: {receipt.reviewComments}</p>
                          )}
                          {receipt.status === 'pending' && !isReadOnly && (
                            <div className="flex gap-2 pt-1 flex-wrap">
                              {editingReceiptId !== receipt.id && (
                                <button onClick={() => startEditingReceipt(receipt)}
                                  className="bg-yellow-700 hover:bg-yellow-600 text-white text-xs px-4 py-2 rounded font-bold">
                                  ✏️ Editar
                                </button>
                              )}
                              <button onClick={async () => {
                                const approvalLabel = receipt.receiptType === 'concepto_adicional'
                                  ? `${receipt.conceptDescription || 'Cuota extra'} · $${Number(receipt.amount || 0).toFixed(2)}`
                                  : (receipt.periods || []).join(', ');
                                if (!window.confirm(`¿Aprobar comprobante de ${receipt.userName} (${approvalLabel})?`)) return;
                                try {
                                  await dataService.approvePaymentReceipt(receipt, user.uid);
                                  showMessage('Comprobante aprobado ✅ El saldo del miembro se actualizó.', 'success');
                                  loadPaymentReceipts();
                                  // Refresh ledger & member data so Matriz de pagos and Gestión de Miembros reflect the change
                                  loadAllLedgers();
                                  loadUsers();
                                } catch(e: any) { showMessage(`Error al aprobar: ${e?.message || e}`, 'error'); }
                              }} className="bg-green-700 hover:bg-green-600 text-white text-xs px-4 py-2 rounded font-bold">
                                ✅ Aprobar
                              </button>
                              <button onClick={() => {
                                setReceiptRejectId(receipt.id);
                                setReceiptRejectUserId(receipt.userId);
                                setRejectComments('');
                                setShowRejectModal(true);
                              }} className="bg-red-700 hover:bg-red-600 text-white text-xs px-4 py-2 rounded font-bold">
                                ❌ Rechazar
                              </button>
                            </div>
                          )}
                          </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}

        {/* --- DEBT NOTIFY TAB --- */}
        {activeTab === 'debt-notify' && (
          <div className="space-y-4">
            <div className="bg-logia-800 rounded-xl p-4 border border-logia-700">
              <h3 className="text-xl font-bold text-white mb-2">🔔 Notificaciones de Deuda</h3>
              <p className="text-gray-400 text-sm mb-4">Envía recordatorios a los miembros indicando los meses que adeudan. Se envía una notificación in-app a cada usuario con su lista de períodos pendientes.</p>

              <div className="space-y-4">
                <div className="flex gap-3 flex-wrap">
                  <button onClick={() => setDebtNotifTarget('all')}
                    className={`px-4 py-2 rounded font-bold text-sm transition-colors ${debtNotifTarget === 'all' ? 'bg-logia-accent text-white' : 'bg-logia-900 text-gray-300 hover:bg-logia-700'}`}>
                    Todos los miembros
                  </button>
                  <button onClick={() => setDebtNotifTarget('selected')}
                    className={`px-4 py-2 rounded font-bold text-sm transition-colors ${debtNotifTarget === 'selected' ? 'bg-logia-accent text-white' : 'bg-logia-900 text-gray-300 hover:bg-logia-700'}`}>
                    Seleccionar miembros
                  </button>
                </div>

                {debtNotifTarget === 'selected' && (
                  <div className="bg-logia-900 rounded-lg p-3 max-h-64 overflow-y-auto space-y-1">
                    {users.filter(u => u.active && u.role !== 'viewer').map(u => (
                      <label key={u.uid} className="flex items-center gap-3 cursor-pointer hover:bg-logia-800 rounded px-2 py-1">
                        <input type="checkbox"
                          checked={debtNotifSelected.includes(u.uid)}
                          onChange={e => {
                            if (e.target.checked) setDebtNotifSelected(prev => [...prev, u.uid]);
                            else setDebtNotifSelected(prev => prev.filter(id => id !== u.uid));
                          }}
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-gray-200 flex-1">{u.name || u.email}</span>
                        <span
                          className={Number(userStats[u.uid]?.totalDebt || 0) > 0
                            ? 'text-[10px] px-2 py-1 rounded bg-yellow-900/40 text-yellow-300'
                            : 'text-[10px] px-2 py-1 rounded bg-green-900/40 text-green-300'}
                        >
                          {Number(userStats[u.uid]?.totalDebt || 0) > 0
                            ? `Debe $${Number(userStats[u.uid]?.totalDebt || 0).toFixed(2)}`
                            : 'Sin deuda'}
                        </span>
                      </label>
                    ))}
                    {users.filter(u => u.active && u.role !== 'viewer').length === 0 && (
                      <p className="text-gray-500 text-sm text-center py-4">No hay miembros activos.</p>
                    )}
                  </div>
                )}

                {debtNotifMsg && (
                  <div className={`p-3 rounded text-sm font-bold ${debtNotifMsg.type === 'success' ? 'bg-green-900/30 text-green-300 border border-green-600' : 'bg-red-900/30 text-red-300 border border-red-600'}`}>
                    {debtNotifMsg.text}
                  </div>
                )}

                <button
                  disabled={sendingDebtNotif || isReadOnly || (debtNotifTarget === 'selected' && debtNotifSelected.length === 0)}
                  onClick={async () => {
                    setSendingDebtNotif(true);
                    setDebtNotifMsg(null);
                    try {
                      const targetUids = debtNotifTarget === 'selected' ? debtNotifSelected : undefined;
                      const count = await dataService.sendDebtNotifications(user.groupId, user, targetUids);
                      setDebtNotifMsg({ text: `✅ Notificaciones enviadas a ${count} miembro(s) con pagos pendientes.`, type: 'success' });
                    } catch(e) {
                      setDebtNotifMsg({ text: '❌ Error al enviar notificaciones.', type: 'error' });
                    } finally {
                      setSendingDebtNotif(false);
                    }
                  }}
                  className="w-full py-3 bg-yellow-700 hover:bg-yellow-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors"
                >
                  {sendingDebtNotif ? '⏳ Enviando...' : '🔔 Enviar Recordatorios de Pago'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* FILTERED EXTRA-FEE RECEIPTS MODAL */}
      {showMatrixReceiptsModal && matrixFilter === 'extra' && matrixExtraDesc && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[110] p-4" onClick={() => setShowMatrixReceiptsModal(false)}>
          <div className="bg-logia-800 w-full max-w-3xl rounded-xl border border-purple-600/40 shadow-2xl max-h-[88vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-logia-700 bg-logia-900 flex justify-between items-center gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">🧾 Comprobantes: {matrixExtraDesc}</h3>
                <p className="text-xs text-gray-400">Año {matrixYear} · solo el concepto actualmente filtrado</p>
              </div>
              <button onClick={() => setShowMatrixReceiptsModal(false)} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3">
              {getMatrixFilteredReceipts().length === 0 ? (
                <p className="text-center text-gray-500 py-8">No hay comprobantes registrados para este concepto.</p>
              ) : getMatrixFilteredReceipts().map(receipt => {
                const urls = receipt.receiptImageUrls?.length
                  ? receipt.receiptImageUrls
                  : receipt.receiptImageUrl ? [receipt.receiptImageUrl] : [];
                return (
                  <div key={receipt.id} className={`rounded-lg border p-4 ${receipt.status === 'approved' ? 'border-green-700/50 bg-green-900/10' : receipt.status === 'pending' ? 'border-yellow-700/50 bg-yellow-900/10' : 'border-red-700/50 bg-red-900/10'}`}>
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <p className="font-bold text-white">{receipt.userName}</p>
                        <p className="text-xs text-gray-400">Período: {receipt.extraFeePeriod || (receipt.periods || []).join(', ') || 'Sin período (legacy)'}</p>
                        <p className="text-xs text-gray-400">Transferencia: {new Date(receipt.transferDate).toLocaleString('es-MX')}</p>
                        <p className="text-sm mt-1 text-gray-300">
                          Declarado: <strong className="text-yellow-300">${Number(receipt.amount || 0).toFixed(2)}</strong>
                          {receipt.appliedAmount !== undefined && <span> · Aplicado: <strong className="text-green-300">${Number(receipt.appliedAmount).toFixed(2)}</strong></span>}
                        </p>
                      </div>
                      <span className={`self-start text-xs px-2 py-1 rounded-full font-bold ${receipt.status === 'approved' ? 'bg-green-700 text-green-100' : receipt.status === 'pending' ? 'bg-yellow-700 text-yellow-100' : 'bg-red-700 text-red-100'}`}>
                        {receipt.status === 'approved' ? '✅ Aprobado' : receipt.status === 'pending' ? '⏳ En revisión' : '❌ Rechazado'}
                      </span>
                    </div>
                    {urls.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {urls.map((url, index) => {
                          const isPdf = url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('%2fpdf');
                          return isPdf ? (
                            <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs bg-blue-900/40 text-blue-300 border border-blue-700 px-3 py-2 rounded hover:bg-blue-900/60">
                              📄 Abrir comprobante {urls.length > 1 ? index + 1 : ''}
                            </a>
                          ) : (
                            <img key={url} src={url} alt={`Comprobante ${index + 1}`}
                              onClick={() => setViewingReceiptImage(url)}
                              className="w-24 h-24 object-cover rounded border border-logia-600 cursor-pointer hover:opacity-80" />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MATRIX PAYMENT MODAL */}
      {showMatrixModal && matrixModalPayment && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-logia-800 rounded-xl border border-logia-700 shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">💰 Registrar Pago</h3>
              <button onClick={() => setShowMatrixModal(false)} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>
            <div className="bg-logia-900 rounded p-3 text-sm space-y-1">
              <p className="text-gray-400">Miembro: <span className="text-white font-bold">{matrixModalUserName}</span></p>
              <p className="text-gray-400">Período: <span className="text-indigo-300 font-bold">{matrixModalPeriod}</span></p>
              <p className="text-gray-400">Cuota mensual: <span className="text-white font-bold">${Number(matrixModalPayment.amount).toFixed(2)}</span></p>
              <p className="text-gray-400">Ya pagado: <span className={`font-bold ${(matrixModalPayment.paidRegular || 0) > 0 ? 'text-green-400' : 'text-gray-500'}`}>${Number(matrixModalPayment.paidRegular !== undefined ? matrixModalPayment.paidRegular : matrixModalPayment.paid || 0).toFixed(2)}</span></p>
              <p className="text-gray-400">Estado actual: <span className={`font-bold ${matrixModalPayment.regularCovered ? 'text-green-400' : 'text-yellow-300'}`}>{matrixModalPayment.regularCovered ? '✅ Pagado' : '⏳ Pendiente/Parcial'}</span></p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                Monto pagado (deja vacío para marcar como pagado completo)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={matrixModalAmountPaid}
                onChange={e => setMatrixModalAmountPaid(e.target.value)}
                placeholder={`Total: $${Number(matrixModalPayment.amount).toFixed(2)}`}
                className="w-full px-3 py-2 bg-logia-900 border border-logia-700 rounded text-white text-sm focus:ring-2 focus:ring-indigo-500"
              />
              {matrixModalAmountPaid && Number(matrixModalAmountPaid) < Number(matrixModalPayment.amount) && (
                <p className="text-xs text-yellow-400 mt-1">⚠️ Pago parcial – no se marcará como pagado completo.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Comentario (opcional)</label>
              <input
                type="text"
                value={matrixModalComments}
                onChange={e => setMatrixModalComments(e.target.value)}
                placeholder="Ej: Pagó en efectivo, transferencia SPEI..."
                className="w-full px-3 py-2 bg-logia-900 border border-logia-700 rounded text-white text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Adjuntar comprobante (opcional)</label>
              {matrixModalPayment.receiptImageBase64 && !matrixModalFile && (
                <div className="mb-2">
                  <p className="text-xs text-green-400 mb-1">📄 Comprobante existente:</p>
                  <img
                    src={matrixModalPayment.receiptImageBase64}
                    alt="Comprobante actual"
                    className="max-h-24 rounded border border-logia-700 object-contain cursor-pointer"
                    onClick={() => setViewingReceiptImage(matrixModalPayment!.receiptImageBase64!)}
                  />
                </div>
              )}
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setMatrixModalFile(file);
                  if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onloadend = () => setMatrixModalPreview(reader.result as string);
                    reader.readAsDataURL(file);
                  } else {
                    setMatrixModalPreview(null);
                  }
                }}
                className="w-full text-sm text-gray-300 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-bold file:bg-indigo-700 file:text-white hover:file:bg-indigo-600 cursor-pointer"
              />
              {matrixModalFile && (
                <div className="mt-2">
                  {matrixModalPreview ? (
                    <img src={matrixModalPreview} alt="Vista previa" className="max-h-32 rounded border border-logia-700 object-contain" />
                  ) : (
                    <p className="text-xs text-green-400">📄 {matrixModalFile.name}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowMatrixModal(false)}
                className="flex-1 py-2 bg-logia-900 text-gray-300 rounded font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveMatrixPayment}
                disabled={savingMatrixPayment}
                className="flex-1 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white rounded font-bold"
              >
                {savingMatrixPayment ? 'Guardando...' : '💾 Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT RECEIPT MODAL */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-logia-800 rounded-xl border border-logia-700 shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">❌ Rechazar Comprobante</h3>
            <p className="text-gray-400 text-sm">Escribe el motivo del rechazo para notificar al miembro:</p>
            <textarea
              value={rejectComments}
              onChange={e => setRejectComments(e.target.value)}
              rows={3}
              placeholder="Ej: La imagen está borrosa o el monto no coincide..."
              className="w-full px-3 py-2 bg-logia-900 border border-logia-700 rounded text-white text-sm focus:ring-2 focus:ring-red-500 resize-none"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowRejectModal(false)} className="flex-1 py-2 bg-logia-900 text-gray-300 rounded font-bold">
                Cancelar
              </button>
              <button onClick={async () => {
                if (!receiptRejectId) return;
                try {
                  await dataService.rejectPaymentReceipt(user.groupId, receiptRejectId, receiptRejectUserId, user.uid, rejectComments);
                  showMessage('Comprobante rechazado', 'success');
                  setShowRejectModal(false);
                  loadPaymentReceipts();
                } catch(e) { showMessage('Error al rechazar', 'error'); }
              }} className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white rounded font-bold">
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT IMAGE VIEWER MODAL */}
      {viewingReceiptImage && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4 cursor-pointer"
          onClick={() => setViewingReceiptImage(null)}>
          <img src={viewingReceiptImage} alt="Comprobante" className="max-w-full max-h-full rounded-lg shadow-2xl object-contain" />
          <button className="absolute top-4 right-4 text-white text-3xl font-bold bg-black/40 w-10 h-10 rounded-full flex items-center justify-center">
            ✕
          </button>
        </div>
      )}
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
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                          <label className="text-xs text-gray-400 uppercase">Iniciación Masónica</label>
                          <input type="date" value={editingUserProfile.masonicJoinDate || ''} onChange={e => setEditingUserProfile({...editingUserProfile, masonicJoinDate: e.target.value})} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
                      </div>
                      <div>
                          <label className="text-xs text-gray-400 uppercase">Fecha de baja</label>
                          <input type="date" value={editingUserProfile.leaveDate || ''} onChange={e => setEditingUserProfile({...editingUserProfile, leaveDate: e.target.value || undefined})} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
                      </div>
                      <div>
                          <label className="text-xs text-gray-400 uppercase">Último Reingreso (Cobro)</label>
                          <input type="date" value={editingUserProfile.masonicRejoinDate || ''} onChange={e => setEditingUserProfile({...editingUserProfile, masonicRejoinDate: e.target.value})} className="w-full bg-logia-900 border border-logia-700 rounded p-2 text-white text-sm" />
                      </div>
                  </div>
                  <div className="bg-logia-900 border border-logia-700 rounded p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-white">Estado del miembro</p>
                      <p className="text-xs text-gray-500">Los inactivos conservan todo su historial y no aparecen como solicitudes.</p>
                    </div>
                    <button type="button" onClick={() => setEditingUserProfile({...editingUserProfile, active: !editingUserProfile.active})} className={editingUserProfile.active ? 'px-3 py-2 rounded bg-green-700 text-white text-xs font-bold' : 'px-3 py-2 rounded bg-gray-700 text-white text-xs font-bold'}>
                      {editingUserProfile.active ? 'ACTIVO' : 'INACTIVO'}
                    </button>
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

                                     {/* Admin receipt photo upload */}
                                     {!isReadOnly && (
                                       <div className="flex flex-col gap-1">
                                         <label className="text-[9px] text-gray-500 uppercase">Comprobante (foto)</label>
                                         {p.adminReceiptUrl && (
                                           <button onClick={() => setViewingReceiptImage(p.adminReceiptUrl!)}
                                             className="text-[10px] text-blue-400 hover:underline text-left">🖼️ Ver foto</button>
                                         )}
                                         {adminPhotoPaymentPeriod === p.period ? (
                                           <div className="flex flex-col gap-1">
                                             <input type="file" accept="image/*" onChange={e => setAdminPhotoFile(e.target.files?.[0] || null)}
                                               className="text-[10px] text-gray-300" />
                                             <div className="flex gap-1">
                                               <button onClick={() => {
                                                 if (adminPhotoFile && selectedMember) handleAdminPhotoUpload(selectedMember.uid, p.period);
                                               }} disabled={!adminPhotoFile || uploadingAdminPhoto}
                                                 className="text-[10px] bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white px-2 py-1 rounded">
                                                 {uploadingAdminPhoto ? '...' : '⬆️ Subir'}
                                               </button>
                                               <button onClick={() => { setAdminPhotoPaymentPeriod(null); setAdminPhotoFile(null); }}
                                                 className="text-[10px] bg-logia-700 text-gray-300 px-2 py-1 rounded">✕</button>
                                             </div>
                                           </div>
                                         ) : (
                                           <button onClick={() => { setAdminPhotoPaymentPeriod(p.period); setAdminPhotoFile(null); }}
                                             className="text-[10px] bg-logia-700 hover:bg-logia-600 text-gray-300 px-2 py-1 rounded w-fit">
                                             📎 {p.adminReceiptUrl ? 'Reemplazar' : 'Subir foto'}
                                           </button>
                                         )}
                                       </div>
                                     )}

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
                                 
                                  {/* v3.1.0: Individual Extra Fees Section */}
                                 {p.extraFees && p.extraFees.length > 0 && (
                                     <div className="mt-3 border-t border-purple-600/30 pt-3">
                                         <p className="text-xs font-bold text-purple-300 uppercase mb-2">Cuotas Extras Individuales:</p>
                                         <div className="space-y-2">
                                             {p.extraFees.map(fee => {
                                                 const isEditing = editingExtraFee?.period === p.period && editingExtraFee?.feeId === fee.id;
                                                 return (
                                                 <div key={fee.id} className="bg-logia-800/50 p-2 rounded border border-purple-600/30">
                                                     {isEditing ? (
                                                         // Edit mode
                                                         <div className="space-y-2">
                                                             <div className="flex flex-col gap-1">
                                                                 <label className="text-[9px] text-gray-400 uppercase">Descripción</label>
                                                                 <input
                                                                     type="text"
                                                                     value={editExtraFeeDesc}
                                                                     onChange={(e) => setEditExtraFeeDesc(e.target.value)}
                                                                     className="w-full bg-logia-900 border border-purple-600 rounded p-1 text-white text-sm"
                                                                 />
                                                             </div>
                                                             <div className="flex gap-2">
                                                                 <div className="flex flex-col flex-1">
                                                                     <label className="text-[9px] text-gray-400 uppercase">Monto</label>
                                                                     <input
                                                                         type="number"
                                                                         value={editExtraFeeAmount}
                                                                         onChange={(e) => setEditExtraFeeAmount(parseFloat(e.target.value) || 0)}
                                                                         className="w-full bg-logia-900 border border-purple-600 rounded p-1 text-white text-sm"
                                                                     />
                                                                 </div>
                                                                 <div className="flex gap-1 items-end">
                                                                     <button
                                                                         onClick={handleSaveEditedExtraFee}
                                                                         className="bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded text-xs"
                                                                     >
                                                                         💾 Guardar
                                                                     </button>
                                                                     <button
                                                                         onClick={() => {
                                                                             setEditingExtraFee(null);
                                                                             setEditExtraFeeDesc('');
                                                                             setEditExtraFeeAmount(0);
                                                                         }}
                                                                         className="bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded text-xs"
                                                                     >
                                                                         ✖️
                                                                     </button>
                                                                 </div>
                                                             </div>
                                                         </div>
                                                     ) : (
                                                         // View mode
                                                         <div className="flex items-center gap-2">
                                                             <div className="flex-1">
                                                                 <p className="text-sm text-white font-medium">{fee.description}</p>
                                                                 <p className="text-xs text-gray-400">${fee.amount.toFixed(2)}</p>
                                                             </div>
                                                             <div className="flex flex-col">
                                                                 <label className="text-[9px] text-gray-500 uppercase">Pagado</label>
                                                                 <input 
                                                                     type="number"
                                                                     value={fee.paid}
                                                                     onChange={(e) => {
                                                                         const val = parseFloat(e.target.value) || 0;
                                                                         handleUpdateIndividualExtraFeePaid(p.period, fee.id, val);
                                                                     }}
                                                                     disabled={isReadOnly}
                                                                     className="w-20 bg-logia-900 border border-purple-600 rounded p-1 text-white text-right text-xs"
                                                                 />
                                                             </div>
                                                             <div className="flex gap-1">
                                                                 <button
                                                                     onClick={() => handleEditIndividualExtraFee(p.period, fee.id, fee.description, fee.amount)}
                                                                     disabled={isReadOnly}
                                                                     className="bg-blue-600 hover:bg-blue-500 text-white p-1 rounded text-xs"
                                                                     title="Editar cuota extra"
                                                                 >
                                                                     ✏️
                                                                 </button>
                                                                 <button
                                                                     onClick={() => handleDeleteIndividualExtraFee(p.period, fee.id)}
                                                                     disabled={isReadOnly}
                                                                     className="bg-red-600 hover:bg-red-500 text-white p-1 rounded text-xs"
                                                                     title="Eliminar cuota extra"
                                                                 >
                                                                     🗑️
                                                                 </button>
                                                             </div>
                                                         </div>
                                                     )}
                                                 </div>
                                             )})}
                                         </div>
                                     </div>
                                 )}
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

      {/* ADVANCED PAYMENT MODAL (Multi-month) */}
      {showAdvancedPaymentModal && advancedPaymentUser && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-logia-800 w-full max-w-xl rounded-xl border border-logia-700 shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
             <button onClick={() => setShowAdvancedPaymentModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl">×</button>
             <h3 className="text-xl font-bold text-white mb-4">📅 Registrar Pagos Anticipados</h3>
             <p className="text-gray-400 text-sm mb-6">
                Registra múltiples meses pagados por adelantado para <span className="font-bold text-white">{advancedPaymentUser.name}</span>. 
                Estos meses quedarán marcados como pagados y no se duplicarán cuando hagas la sincronización masiva de cuotas.
             </p>
             
             <div className="space-y-4">
                 <div>
                     <label className="block text-sm font-medium text-gray-300 mb-2">Mes de Inicio (YYYY-MM)</label>
                     <input
                         type="month"
                         value={advancedPaymentStartPeriod}
                         onChange={(e) => setAdvancedPaymentStartPeriod(e.target.value)}
                         className="w-full px-4 py-2 bg-logia-900 border border-logia-700 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                     />
                     <p className="text-xs text-gray-500 mt-1">Ejemplo: Si pagas Enero a Junio, selecciona Enero</p>
                 </div>
                 
                 <div>
                     <label className="block text-sm font-medium text-gray-300 mb-2">Cantidad de Meses</label>
                     <input
                         type="number"
                         min="1"
                         max="24"
                         value={advancedPaymentMonths}
                         onChange={(e) => setAdvancedPaymentMonths(Number(e.target.value))}
                         className="w-full px-4 py-2 bg-logia-900 border border-logia-700 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                     />
                     <p className="text-xs text-gray-500 mt-1">Número de meses consecutivos pagados</p>
                 </div>
                 
                 <div>
                     <label className="block text-sm font-medium text-gray-300 mb-2">Fecha de Pago Recibido</label>
                     <input
                         type="date"
                         value={advancedPaymentDate}
                         onChange={(e) => setAdvancedPaymentDate(e.target.value)}
                         className="w-full px-4 py-2 bg-logia-900 border border-logia-700 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                     />
                 </div>
                 
                 <div>
                     <label className="block text-sm font-medium text-gray-300 mb-2">Comentarios (Opcional)</label>
                     <textarea
                         value={advancedPaymentComments}
                         onChange={(e) => setAdvancedPaymentComments(e.target.value)}
                         placeholder="Ej: Pago anticipado 6 meses por transferencia..."
                         rows={3}
                         className="w-full px-4 py-2 bg-logia-900 border border-logia-700 rounded-lg text-white focus:ring-2 focus:ring-indigo-500"
                     />
                 </div>

                 {advancedPaymentMonths > 0 && advancedPaymentStartPeriod && (
                     <div className="bg-indigo-900/30 border border-indigo-600/50 rounded-lg p-4">
                         <p className="text-indigo-200 text-sm font-medium mb-2">📋 Resumen:</p>
                         <p className="text-white text-sm">
                             Se registrarán <span className="font-bold">{advancedPaymentMonths} meses</span> como pagados, 
                             comenzando desde <span className="font-bold">{advancedPaymentStartPeriod}</span>
                         </p>
                         <p className="text-gray-400 text-xs mt-2">
                             Estos meses aparecerán como "Pagado" en la matriz de pagos y no se sobrescribirán durante la sincronización masiva.
                         </p>
                     </div>
                 )}
                 
                 <div className="pt-4 flex gap-4">
                     <button 
                         onClick={() => setShowAdvancedPaymentModal(false)}
                         className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded"
                     >
                         Cancelar
                     </button>
                     <button 
                         onClick={handleSaveAdvancedPayment} 
                         disabled={isReadOnly || isSubmitting || !advancedPaymentStartPeriod || advancedPaymentMonths < 1}
                         className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded disabled:opacity-50"
                     >
                         {isSubmitting ? 'Guardando...' : '💾 Guardar Pagos'}
                     </button>
                 </div>
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

      {/* DELETE TASK CONFIRM MODAL */}
      {showDeleteTaskModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-6">
            <div className="bg-logia-800 border border-red-500 p-6 rounded-xl max-w-sm w-full text-center shadow-2xl">
                <div className="text-4xl mb-4">⚠️</div>
                <h3 className="text-xl font-bold text-white mb-2">¿Eliminar Tarea?</h3>
                <p className="text-gray-400 mb-6">
                    Esta acción es irreversible.
                </p>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowDeleteTaskModal(false)}
                        className="flex-1 py-3 bg-gray-700 text-white rounded font-bold"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleExecuteDeleteTask}
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

      {/* MIGRATION RESULTS MODAL */}
      {showMigrationModal && migrationResult && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-6">
            <div className="bg-logia-800 border border-purple-500 p-6 rounded-xl max-w-lg w-full shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-white">📊 Resultados de Migración</h3>
                    <button 
                        onClick={() => setShowMigrationModal(false)}
                        className="text-gray-400 hover:text-white text-2xl"
                    >
                        ×
                    </button>
                </div>
                <div className="space-y-4">
                    <div className="bg-logia-900 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between">
                            <span className="text-gray-400">👥 Usuarios analizados:</span>
                            <span className="text-white font-bold">{migrationResult.totalUsers}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">📄 Pagos totales:</span>
                            <span className="text-white font-bold">{migrationResult.totalPayments}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">✅ Pagos migrados:</span>
                            <span className="text-green-400 font-bold">{migrationResult.migratedPayments}</span>
                        </div>
                        {migrationResult.errors.length > 0 && (
                            <div className="flex justify-between">
                                <span className="text-gray-400">❌ Errores:</span>
                                <span className="text-red-400 font-bold">{migrationResult.errors.length}</span>
                            </div>
                        )}
                    </div>
                    
                    {migrationResult.errors.length > 0 && (
                        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
                            <h4 className="text-red-400 font-bold mb-2">Errores encontrados:</h4>
                            <div className="text-xs text-gray-300 space-y-1 max-h-40 overflow-y-auto">
                                {migrationResult.errors.map((err, idx) => (
                                    <div key={idx}>• {err}</div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {migrationResult.migratedPayments > 0 && (
                        <div className="bg-green-900/20 border border-green-500 rounded-lg p-3 text-center">
                            <p className="text-green-400 font-bold">
                                ✅ Migración completada exitosamente
                            </p>
                            <p className="text-gray-400 text-sm mt-1">
                                Las cuotas extraordinarias ahora se mostrarán correctamente en la vista expandible
                            </p>
                        </div>
                    )}
                </div>
                <div className="mt-6">
                    <button 
                        onClick={() => setShowMigrationModal(false)}
                        className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default Admin;
