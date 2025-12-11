
import { User, Payment, Trivia, TriviaAnswer, Fee, Attendance, RpgCharacter, PriceHistoryEntry, TreasuryEntry, FundSource, TreasuryAllocation, Notice, Group } from '../types';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth, db } from './firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile 
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  increment,
  writeBatch,
  addDoc
} from "firebase/firestore";

const INITIAL_RPG: RpgCharacter = {
  name: 'Iniciado',
  level: 1,
  xp: 0,
  xpNext: 100,
  hp: 100,
  maxHp: 100,
  mana: 50,
  maxMana: 50,
  magicLevel: 0,
  attack: 10,
  defense: 5,
};

// --- Service Methods ---

export const authService = {
  signIn: async (email: string, password: string): Promise<User> => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;
    
    const userRef = doc(db, "users", uid);
    const userDoc = await getDoc(userRef);
    
    let userData: User;

    if (!userDoc.exists()) {
      // Legacy or unexpected state: authenticated but no doc. 
      // We return a skeleton, but app should handle "no group" state.
      const name = userCredential.user.displayName || email.split('@')[0];
      userData = {
        uid,
        name,
        email,
        role: 'member',
        active: false, 
        groupId: '', // Pending assignment
        joinDate: new Date().toISOString(),
        profileEditable: true,
        rpg: { ...INITIAL_RPG, name: name.split(' ')[0] },
        totalPoints: 0
      };
      // We do NOT save automatically here to avoid overwriting registration logic with empty group
    } else {
      userData = userDoc.data() as User;
      
      let dirty = false;
      if (!userData.uid) { userData.uid = uid; dirty = true; }
      if (!userData.rpg) { userData.rpg = { ...INITIAL_RPG }; dirty = true; }
      
      // --- SUPER ADMIN AUTO-PROMOTION ---
      if (email === 'robrivers95@gmail.com' && userData.role !== 'master') {
          userData.role = 'master';
          dirty = true;
      }
      // ----------------------------------

      if (dirty) {
          await setDoc(userRef, userData, { merge: true });
      }
    }
    return userData;
  },
  
  register: async (name: string, email: string, password: string, groupId: string): Promise<User> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;
    
    // --- SUPER ADMIN CHECK ---
    const role = email === 'robrivers95@gmail.com' ? 'master' : 'member';
    // -------------------------

    const newUser: User = {
      uid,
      name,
      email,
      role: role,
      active: false,
      groupId: groupId,
      joinDate: new Date().toISOString(),
      profileEditable: true,
      rpg: { ...INITIAL_RPG, name: name.split(' ')[0] },
      totalPoints: 0
    };
    
    await setDoc(doc(db, "users", uid), newUser);
    await updateProfile(userCredential.user, { displayName: name });
    
    return newUser;
  }
};

export const dataService = {
  // GROUP / LODGE MANAGEMENT
  getAllGroups: async (): Promise<Group[]> => {
      try {
          const q = query(collection(db, "groups"));
          const snapshot = await getDocs(q);
          return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Group));
      } catch (e) {
          console.error("Error fetching groups", e);
          return [];
      }
  },

  createGroup: async (name: string, description: string): Promise<Group> => {
      const newGroup: Omit<Group, 'id'> = {
          name,
          description,
          createdAt: Date.now(),
          priceHistory: []
      };
      const docRef = await addDoc(collection(db, "groups"), newGroup);
      return { id: docRef.id, ...newGroup };
  },

  updateGroup: async (groupId: string, data: Partial<Group>): Promise<void> => {
      if (!groupId) return;
      const groupRef = doc(db, "groups", groupId);
      await updateDoc(groupRef, data);
  },

  getGroupDetails: async (groupId: string): Promise<Group | null> => {
      if (!groupId) return null;
      const snap = await getDoc(doc(db, "groups", groupId));
      if (snap.exists()) return { id: snap.id, ...snap.data() } as Group;
      return null;
  },

  // Profile Fetching
  getUserProfile: async (uid: string): Promise<User | null> => {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data() as User;
        if (!data.rpg) data.rpg = { ...INITIAL_RPG };
        
        // --- SUPER ADMIN RECOVERY ---
        // If the user is you, enforce Master role in DB if missing
        if (data.email === 'robrivers95@gmail.com' && data.role !== 'master') {
            console.log("Restoring Master Role privileges...");
            data.role = 'master';
            await updateDoc(doc(db, "users", uid), { role: 'master' });
        }
        // ----------------------------

        return data;
      }
      return null;
    } catch (e) {
      console.error("Error getting user profile:", e);
      return null;
    }
  },

  // RPG (Also used for Snake High Score)
  saveCharacter: async (uid: string, character: Partial<RpgCharacter>) => {
    if (!uid) return;
    try {
        const userRef = doc(db, "users", uid);
        await setDoc(userRef, { rpg: character }, { merge: true });
    } catch (e) {
        // Suppress permission error logs
    }
  },

  // Trivia
  getActiveTrivia: async (groupId: string): Promise<Trivia | null> => {
    if (!groupId) return null;
    try {
        const q = query(
          collection(db, "trivias"), 
          where("groupId", "==", groupId)
        );
        
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        
        // Client side sort to avoid index requirement
        const allTrivias = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Trivia));
        allTrivias.sort((a, b) => b.createdAt - a.createdAt);
        
        return allTrivias[0];
    } catch (error) {
        console.error("Error fetching trivia", error);
        return null;
    }
  },

  submitAnswer: async (uid: string, triviaId: string, answerIndex: number): Promise<TriviaAnswer> => {
    const triviaDoc = await getDoc(doc(db, "trivias", triviaId));
    if (!triviaDoc.exists()) throw new Error("Trivia no encontrada");
    
    const triviaData = triviaDoc.data() as Trivia;
    const isCorrect = triviaData.correctIndex === answerIndex;
    const points = isCorrect ? 10 : 0;
    
    const answer: TriviaAnswer = {
      uid,
      triviaId,
      answerIndex,
      correct: isCorrect,
      points,
      answeredAt: new Date().toISOString()
    };
    
    await setDoc(doc(db, "trivias", triviaId, "answers", uid), answer);

    if (points > 0) {
      await updateDoc(doc(db, "users", uid), {
        totalPoints: increment(points)
      });
    }
    
    return answer;
  },

  getUserAnswer: async (uid: string, triviaId: string): Promise<TriviaAnswer | undefined> => {
    const docRef = doc(db, "trivias", triviaId, "answers", uid);
    const snap = await getDoc(docRef);
    return snap.exists() ? (snap.data() as TriviaAnswer) : undefined;
  },

  getLeaderboard: async (): Promise<{name: string, points: number}[]> => {
    const q = query(
      collection(db, "users"),
      orderBy("totalPoints", "desc"),
      limit(10)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => {
      const u = d.data() as User;
      return { name: u.name, points: u.totalPoints || 0 };
    });
  },

  // User Management
  updateUser: async (uid: string, data: Partial<User>) => {
    await updateDoc(doc(db, "users", uid), data);
  },

  // Payments & Price History
  getPriceHistory: async (groupId: string): Promise<PriceHistoryEntry[]> => {
    if (!groupId) return [];
    try {
        const docRef = doc(db, "groups", groupId);
        const snap = await getDoc(docRef);
        if (snap.exists() && snap.data().priceHistory) {
            return snap.data().priceHistory as PriceHistoryEntry[];
        }
        return [];
    } catch (e) {
        console.error("Error fetching price history", e);
        return [];
    }
  },

  addPriceChange: async (groupId: string, entry: PriceHistoryEntry) => {
    const docRef = doc(db, "groups", groupId);
    const snap = await getDoc(docRef);
    let history: PriceHistoryEntry[] = [];
    
    if (snap.exists()) {
        if (snap.data().priceHistory) {
            history = snap.data().priceHistory;
        }
    } else {
        await setDoc(docRef, { name: "Logia Nueva", priceHistory: [] }, { merge: true });
    }
    
    // Remove duplicates if any
    history = history.filter(h => h.startDate !== entry.startDate);
    history.push(entry);
    history.sort((a, b) => a.startDate.localeCompare(b.startDate));
    
    await setDoc(docRef, { priceHistory: history }, { merge: true });
  },

  updatePriceChange: async (groupId: string, oldDate: string, newEntry: PriceHistoryEntry) => {
    const docRef = doc(db, "groups", groupId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;
    
    let history: PriceHistoryEntry[] = snap.data().priceHistory || [];
    // Filter out OLD date (strict string compare)
    history = history.filter(h => h.startDate.trim() !== oldDate.trim());
    // Also filter if new date already exists (overwrite case)
    history = history.filter(h => h.startDate.trim() !== newEntry.startDate.trim());
    
    history.push(newEntry);
    history.sort((a, b) => a.startDate.localeCompare(b.startDate));
    
    await updateDoc(docRef, { priceHistory: history });
  },

  removePriceChange: async (groupId: string, startDate: string) => {
    if (!groupId || !startDate) return;
    const docRef = doc(db, "groups", groupId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;
    
    let history: PriceHistoryEntry[] = snap.data().priceHistory || [];
    // Strict filter with trim safety to ensure deletion works
    const newHistory = history.filter(h => h.startDate.trim() !== startDate.trim());
    
    await updateDoc(docRef, { priceHistory: newHistory });
  },

  getUserFinancialStats: async (uid: string, startPeriod?: string, endPeriod?: string) => {
    try {
        const q = collection(db, "users", uid, "ledger");
        const snap = await getDocs(q);
        let totalPaid = 0;
        let totalDebt = 0;
        let totalBilled = 0;
        
        snap.forEach(doc => {
            const p = doc.data() as Payment;
            
            if (startPeriod && p.period < startPeriod) return;
            if (endPeriod && p.period > endPeriod) return;

            // FIX: Force Number() casting to prevent string concatenation
            const amt = Number(p.amount) || 0;
            const extra = Number(p.extraAmount) || 0;
            const pd = Number(p.paid) || 0;

            const totalAmount = amt + extra;
            
            totalBilled += totalAmount;
            totalPaid += pd;
            totalDebt += (totalAmount - pd);
        });
        
        return { totalPaid, totalDebt, totalBilled };
    } catch (error) {
        return { totalPaid: 0, totalDebt: 0, totalBilled: 0 };
    }
  },
  
  getGlobalFinancials: async (groupId: string, startDate: string, endDate: string) => {
      try {
          // 1. Treasury (Manual Entries)
          const tQ = query(collection(db, "groups", groupId, "treasury"));
          const tSnap = await getDocs(tQ);
          
          let treasuryIncome = 0;
          let treasuryExpense = 0;
          
          tSnap.forEach(doc => {
              const t = doc.data() as TreasuryEntry;
              if (t.date >= startDate && t.date <= endDate) {
                  if (t.type === 'income') treasuryIncome += (Number(t.amount) || 0);
                  else treasuryExpense += (Number(t.amount) || 0);
              }
          });

          // 2. User Payments (Iterate all active users to sum payments in range)
          const usersQ = query(collection(db, "users"), where("groupId", "==", groupId));
          const usersSnap = await getDocs(usersQ);
          
          let userPaymentsIncome = 0;
          
          const promises = usersSnap.docs.map(async (uDoc) => {
              try {
                const paymentsSnap = await getDocs(collection(db, "users", uDoc.id, "ledger"));
                let uTotal = 0;
                paymentsSnap.forEach(p => {
                    const pay = p.data() as Payment;
                    if (pay.paid > 0 && pay.paymentDate) {
                        const payDate = pay.paymentDate.slice(0, 10); // YYYY-MM-DD
                        if (payDate >= startDate && payDate <= endDate) {
                             uTotal += (Number(pay.paid) || 0);
                        }
                    }
                });
                return uTotal;
              } catch {
                return 0; 
              }
          });
          
          const userResults = await Promise.all(promises);
          userPaymentsIncome = userResults.reduce((a, b) => a + b, 0);
          
          return {
              income: treasuryIncome + userPaymentsIncome, // Total combined income
              expense: treasuryExpense // Total expenses
          };

      } catch (e) {
          console.error(e);
          return { income: 0, expense: 0 };
      }
  },

  // TREASURY
  addTreasuryEntry: async (entry: Omit<TreasuryEntry, 'id' | 'createdAt'>) => {
     const ref = doc(collection(db, "groups", entry.groupId, "treasury"));
     await setDoc(ref, {
         ...entry,
         id: ref.id,
         createdAt: Date.now()
     });
  },

  updateTreasuryEntry: async (entry: TreasuryEntry) => {
     const ref = doc(db, "groups", entry.groupId, "treasury", entry.id);
     await updateDoc(ref, {
        date: entry.date,
        type: entry.type,
        category: entry.category,
        description: entry.description,
        amount: Number(entry.amount),
        allocations: entry.allocations
     });
  },

  deleteTreasuryEntry: async (groupId: string, entryId: string) => {
     if (!entryId) throw new Error("Missing entry ID");
     const ref = doc(db, "groups", groupId, "treasury", entryId);
     await deleteDoc(ref);
  },

  getTreasuryEntries: async (groupId: string): Promise<TreasuryEntry[]> => {
      if (!groupId) return [];
      try {
        const q = query(collection(db, "groups", groupId, "treasury"));
        const snap = await getDocs(q);
        
        const entries = snap.docs.map(d => {
            const data = d.data();
            return { 
                ...data, 
                id: d.id, // Always use Firestore Document ID as the source of truth
                amount: Number(data.amount) || 0
            } as TreasuryEntry;
        });
        
        return entries.sort((a,b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
      } catch (e) {
          console.error("Error fetching treasury", e);
          return [];
      }
  },
  
  // Helper to transform individual user payments into Treasury-like entries for display/CSV
  getDetailedQuotaTransactions: async (groupId: string): Promise<TreasuryEntry[]> => {
      if (!groupId) return [];
      const usersQ = query(collection(db, "users"), where("groupId", "==", groupId));
      const usersSnap = await getDocs(usersQ);
      
      const allTransactions: TreasuryEntry[] = [];
      
      const promises = usersSnap.docs.map(async (uDoc) => {
          const u = uDoc.data() as User;
          try {
              const ledgerSnap = await getDocs(collection(db, "users", uDoc.id, "ledger"));
              ledgerSnap.forEach(d => {
                  const p = d.data() as Payment;
                  if (p.paid > 0) {
                      allTransactions.push({
                          id: `quota_${u.uid}_${p.period}`,
                          groupId: groupId,
                          date: p.paymentDate ? p.paymentDate.slice(0, 10) : 'Sin Fecha',
                          type: 'income',
                          category: 'cuota_extra', // Reuse category or map to specific label in UI
                          description: `Pago Cuota ${p.period} - ${u.name}`,
                          amount: Number(p.paid),
                          allocations: [{ source: 'cuotas', amount: Number(p.paid) }],
                          createdBy: u.uid,
                          createdAt: 0
                      } as any); // Cast to allow custom handling in UI
                  }
              });
          } catch (e) {
              // ignore permission error per user
          }
      });
      
      await Promise.all(promises);
      return allTransactions;
  },
  
  getAllPaidQuotas: async (groupId: string): Promise<number> => {
      if (!groupId) return 0;
      try {
          const usersQ = query(collection(db, "users"), where("groupId", "==", groupId));
          const usersSnap = await getDocs(usersQ);
          
          const promises = usersSnap.docs.map(async (uDoc) => {
              try {
                const paymentsSnap = await getDocs(collection(db, "users", uDoc.id, "ledger"));
                let uTotal = 0;
                paymentsSnap.forEach(p => {
                    uTotal += (Number(p.data().paid) || 0);
                });
                return uTotal;
              } catch {
                return 0; 
              }
          });
          
          const results = await Promise.all(promises);
          return results.reduce((a, b) => a + b, 0);
      } catch (e) {
          return 0;
      }
  },

  syncUserDebts: async (user: User, history: PriceHistoryEntry[]) => {
    // 1. Validation
    if (!user.active || history.length === 0 || !user.uid) return 0;

    // 2. Determine Start Date (Robust Parsing)
    let startStr = user.masonicRejoinDate || user.masonicJoinDate || user.joinDate;
    if (!startStr) startStr = new Date().toISOString();

    let startYear, startMonth, startDay;

    // Parse date
    if (startStr.includes('-') && !startStr.includes('T')) {
        const parts = startStr.split('-');
        startYear = parseInt(parts[0]);
        startMonth = parseInt(parts[1]);
        startDay = parseInt(parts[2]);
    } else {
        const d = new Date(startStr);
        if (isNaN(d.getTime())) {
            const now = new Date();
            startYear = now.getFullYear();
            startMonth = now.getMonth() + 1;
            startDay = now.getDate();
        } else {
            startYear = d.getFullYear();
            startMonth = d.getMonth() + 1;
            startDay = d.getDate();
        }
    }

    const cutoffDay = startDay; 
    
    // Current Date
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; 
    const currentDay = now.getDate();

    // 3. Fetch Existing Ledger
    const existingSnap = await getDocs(collection(db, "users", user.uid, "ledger"));
    const existingMap = new Map<string, Payment>();
    existingSnap.forEach(d => existingMap.set(d.id, d.data() as Payment));

    const newBatch = writeBatch(db);
    let opCount = 0;
    
    // 4. Iterate Logic
    let loopYear = startYear;
    let loopMonth = startMonth;
    let safeGuard = 0;

    while (safeGuard < 120) {
        safeGuard++;
        if (loopYear > currentYear || (loopYear === currentYear && loopMonth > currentMonth)) {
            break;
        }

        const monthStr = String(loopMonth).padStart(2, '0');
        const period = `${loopYear}-${monthStr}`;

        let shouldGenerate = true;
        if (loopYear === currentYear && loopMonth === currentMonth) {
            if (currentDay < cutoffDay) shouldGenerate = false;
        }

        if (shouldGenerate) {
            // Find Price
            const sortedHistory = [...history].sort((a,b) => b.startDate.localeCompare(a.startDate));
            const applicable = sortedHistory.find(h => h.startDate <= period);
            const basePrice = applicable ? applicable.amount : (sortedHistory.length > 0 ? sortedHistory[sortedHistory.length-1].amount : 0);
            const amount = Number(basePrice);

            const ref = doc(db, "users", user.uid, "ledger", period);

            if (!existingMap.has(period)) {
                newBatch.set(ref, {
                    period,
                    amount,
                    paid: 0,
                    status: 'Pendiente',
                    comments: 'Generado auto'
                });
                opCount++;
            } else {
                const existing = existingMap.get(period)!;
                if (existing.status !== 'Pagado' && Number(existing.amount) !== amount) {
                    newBatch.update(ref, { amount: amount });
                    opCount++;
                }
            }
        }

        loopMonth++;
        if (loopMonth > 12) {
            loopMonth = 1;
            loopYear++;
        }
    }
    
    if (opCount > 0) {
        await newBatch.commit();
    }
    return opCount;
  },

  assignExtraFeeToAll: async (groupId: string, period: string, amount: number, description: string) => {
    if (!groupId || !amount || !period) return;
    const users = await dataService.getUsers(groupId);
    
    const chunkSize = 450; 
    for (let i = 0; i < users.length; i += chunkSize) {
        const chunk = users.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        let hasOps = false;

        for (const u of chunk) {
            if (!u.active) continue;
            const ref = doc(db, "users", u.uid, "ledger", period);
            batch.set(ref, {
                period,
                extraAmount: increment(Number(amount)),
                extraDescription: description,
            }, { merge: true });
            hasOps = true;
        }
        if (hasOps) {
             await batch.commit();
        }
    }
  },

  getPayments: async (uid: string): Promise<Payment[]> => {
    if (!uid) return [];
    try {
        const snapshot = await getDocs(collection(db, "users", uid, "ledger"));
        return snapshot.docs.map(d => {
            const data = d.data();
            return {
                ...data,
                amount: Number(data.amount) || 0,
                paid: Number(data.paid) || 0,
                extraAmount: Number(data.extraAmount) || 0
            } as Payment;
        });
    } catch (e) {
        return [];
    }
  },

  updatePayment: async (uid: string, payment: Payment) => {
    const ref = doc(db, "users", uid, "ledger", payment.period);
    await setDoc(ref, payment, { merge: true });
  },

  deletePayment: async (uid: string, period: string) => {
    const ref = doc(db, "users", uid, "ledger", period);
    await deleteDoc(ref);
  },

  getAttendance: async (uid: string): Promise<Attendance[]> => {
    if (!uid) return [];
    try {
        const snapshot = await getDocs(collection(db, "users", uid, "attendance"));
        return snapshot.docs.map(d => d.data() as Attendance);
    } catch (e) {
        return [];
    }
  },
  
  getAttendanceListForDate: async (groupId: string, date: string): Promise<{name: string, attended: boolean}[]> => {
      const users = await dataService.getUsers(groupId);
      const activeUsers = users.filter(u => u.active).sort((a,b) => a.name.localeCompare(b.name));
      
      const results: {name: string, attended: boolean}[] = [];
      
      for(const u of activeUsers) {
          const ref = doc(db, "users", u.uid, "attendance", date);
          const snap = await getDoc(ref);
          results.push({
              name: u.name,
              attended: snap.exists() && snap.data().attended === true
          });
      }
      return results;
  },
  
  generateDetailedAttendanceCSV: async (groupId: string, users: User[]) => {
      const activeUsers = users.filter(u => u.active).sort((a,b) => a.name.localeCompare(b.name));
      const allRecords: {date: string, uid: string, attended: boolean}[] = [];
      
      // Fetch all attendance for all users
      for(const u of activeUsers) {
          const userAtt = await dataService.getAttendance(u.uid);
          userAtt.forEach(a => {
              allRecords.push({ date: a.date, uid: u.uid, attended: a.attended });
          });
      }
      
      // Get all unique dates
      const uniqueDates = Array.from(new Set(allRecords.map(r => r.date))).sort().reverse();
      
      // Build lookup map: date_uid -> bool
      const lookup = new Map<string, boolean>();
      allRecords.forEach(r => lookup.set(`${r.date}_${r.uid}`, r.attended));

      // HEADERS: Date, Name, Status
      const csvRows = ["Fecha,Nombre Completo,Estatus"];
      
      uniqueDates.forEach(date => {
          activeUsers.forEach(u => {
              const present = lookup.has(`${date}_${u.uid}`);
              const status = present ? "ASISTIO" : "FALTA";
              csvRows.push(`${date},"${u.name}","${status}"`);
          });
      });
      
      return csvRows.join('\n');
  },
  
  getUsers: async (groupId: string): Promise<User[]> => {
    if (!groupId) return [];
    const q = query(collection(db, "users"), where("groupId", "==", groupId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as User);
  },

  updateUserStatus: async (uid: string, active: boolean) => {
    await updateDoc(doc(db, "users", uid), { active });
  },

  recordAttendance: async (date: string, uidsPresent: string[]) => {
    const batch = writeBatch(db);
    for (const uid of uidsPresent) {
      const ref = doc(db, "users", uid, "attendance", date);
      batch.set(ref, {
        date,
        attended: true
      });
    }
    await batch.commit();
  },

  createTrivia: async (trivia: Omit<Trivia, 'id' | 'createdAt'>) => {
    if (!trivia.groupId) throw new Error("Group ID missing for trivia");
    const ref = doc(collection(db, "trivias"));
    await setDoc(ref, {
      ...trivia,
      id: ref.id,
      createdAt: Date.now()
    });
  },

  // --- NOTICES ---
  getNotices: async (groupId: string): Promise<Notice[]> => {
    if (!groupId) return [];
    try {
      const q = query(collection(db, "groups", groupId, "notices"));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(d => ({id: d.id, ...d.data()} as Notice));
      // Client sort by date desc
      return list.sort((a,b) => b.date.localeCompare(a.date));
    } catch (e) {
      // If permissions fail, return empty list gracefully instead of throwing
      // console.error(e); 
      return [];
    }
  },

  createNotice: async (notice: Omit<Notice, 'id'>) => {
     const ref = doc(collection(db, "groups", notice.groupId, "notices"));
     await setDoc(ref, {
       ...notice,
       id: ref.id
     });
  },

  updateNotice: async (groupId: string, noticeId: string, data: Partial<Notice>) => {
    const ref = doc(db, "groups", groupId, "notices", noticeId);
    await updateDoc(ref, data);
  },

  deleteNotice: async (groupId: string, noticeId: string) => {
    const ref = doc(db, "groups", groupId, "notices", noticeId);
    await deleteDoc(ref);
  }
};

export const generateTriviaWithAI = async (): Promise<Partial<Trivia>> => {
  // FALLBACK SEGURO: Si no hay API KEY real, devuelve datos dummy para que no falle.
  const apiKey = process.env.API_KEY || "TU_API_KEY_AQUI"; 
  
  if (!apiKey || apiKey === "TU_API_KEY_AQUI") {
    console.warn("Modo Offline: Usando trivia por defecto (Falta API Key)");
    // Simular retardo de red
    await new Promise(r => setTimeout(r, 1000));
    return {
      question: "¿Cuál de las siguientes NO es una de las 7 Artes Liberales?",
      options: ["Gramática", "Lógica", "Alquimia", "Astronomía"],
      correctIndex: 2
    };
  }
  
  const ai = new GoogleGenerativeAI({ apiKey });
  
  const prompt = `
    Genera una pregunta de trivia interesante y desafiante para un club de lectura adulto o logia masónica.
    Temas: Simbolismo, Historia Universal, Filosofía, Arte Liberal o Ciencia.
    El output debe ser un JSON.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctIndex: { type: Type.INTEGER, description: "Index 0-3 of the correct option" }
        },
        required: ["question", "options", "correctIndex"]
      }
    }
  });
  
  const text = response.text;
  if (!text) throw new Error("No response from AI");
  return JSON.parse(text);
};
