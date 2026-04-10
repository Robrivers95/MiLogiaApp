
import { User, Payment, IndividualExtraFee, Trivia, TriviaAnswer, Fee, Attendance, RpgCharacter, PriceHistoryEntry, TreasuryEntry, FundSource, TreasuryAllocation, Notice, Task, Group, VisitRequest, VisitMessage, BankBalance, ExtraFee, AppNotification, NotificationType } from '../types';
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
  deleteField,
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
    
    // --- MERGE WITH EXISTING USER DATA (v3.0.1) ---
    // Check if an admin created a user profile with this email
    const usersQuery = query(collection(db, "users"), where("email", "==", email));
    const existingUsers = await getDocs(usersQuery);
    
    let existingUserData: any = null;
    let tempUidToDelete: string | null = null;
    
    existingUsers.forEach(doc => {
      // Found a user with this email but different UID (created by admin)
      if (doc.id !== uid && doc.id.startsWith('temp_')) {
        existingUserData = doc.data();
        tempUidToDelete = doc.id;
      }
    });
    // -----------------------------------------------
    
    // --- SUPER ADMIN CHECK ---
    const role = email === 'robrivers95@gmail.com' ? 'master' : (existingUserData?.role || 'member');
    // -------------------------

    const newUser: User = {
      uid,
      name: existingUserData?.name || name,
      email,
      role: role,
      active: existingUserData?.active ?? false,
      groupId: existingUserData?.groupId || groupId,
      joinDate: existingUserData?.joinDate || new Date().toISOString(),
      profileEditable: true,
      rpg: existingUserData?.rpg || { ...INITIAL_RPG, name: name.split(' ')[0] },
      totalPoints: existingUserData?.totalPoints || 0,
      // Only include optional fields if they have a value (Firestore rejects undefined)
      ...(existingUserData?.degree !== undefined && { degree: existingUserData.degree }),
      ...(existingUserData?.lodgeRole !== undefined && { lodgeRole: existingUserData.lodgeRole }),
      ...(existingUserData?.numericDegree !== undefined && { numericDegree: existingUserData.numericDegree }),
      ...(existingUserData?.profession !== undefined && { profession: existingUserData.profession }),
      ...(existingUserData?.job !== undefined && { job: existingUserData.job }),
      ...(existingUserData?.workAddress !== undefined && { workAddress: existingUserData.workAddress }),
      ...(existingUserData?.city !== undefined && { city: existingUserData.city }),
      ...(existingUserData?.state !== undefined && { state: existingUserData.state }),
      ...(existingUserData?.country !== undefined && { country: existingUserData.country }),
      ...(existingUserData?.masonicJoinDate !== undefined && { masonicJoinDate: existingUserData.masonicJoinDate }),
      ...(existingUserData?.masonicRejoinDate !== undefined && { masonicRejoinDate: existingUserData.masonicRejoinDate }),
    };
    
    await setDoc(doc(db, "users", uid), newUser);
    await updateProfile(userCredential.user, { displayName: newUser.name });
    
    // If there was a temp user, copy subcollections and delete temp user
    if (tempUidToDelete) {
      try {
        // Copy ledger
        const ledgerSnap = await getDocs(collection(db, "users", tempUidToDelete, "ledger"));
        for (const ldoc of ledgerSnap.docs) {
          await setDoc(doc(db, "users", uid, "ledger", ldoc.id), ldoc.data());
        }
        
        // Copy attendance
        const attSnap = await getDocs(collection(db, "users", tempUidToDelete, "attendance"));
        for (const adoc of attSnap.docs) {
          await setDoc(doc(db, "users", uid, "attendance", adoc.id), adoc.data());
        }
        
        // Delete temp user
        await deleteDoc(doc(db, "users", tempUidToDelete));
      } catch (e) {
        console.error("Error merging temp user data:", e);
      }
    }
    
    return newUser;
  },

  resetPassword: async (email: string): Promise<void> => {
    try {
      const { sendPasswordResetEmail } = await import('firebase/auth');
      await sendPasswordResetEmail(auth, email);
    } catch (e: any) {
      console.error('Error sending password reset email', e);
      throw e;
    }
  },

  // Admin creates a user without Firebase Auth (user will register later themselves)
  // Manual merge: admin manually links a temp user with a real registered user
  manualMergeUsers: async (tempUserId: string, realUserId: string): Promise<void> => {
    try {
      // Get both users
      const tempUserDoc = await getDoc(doc(db, "users", tempUserId));
      const realUserDoc = await getDoc(doc(db, "users", realUserId));

      if (!tempUserDoc.exists()) {
        throw new Error("Usuario temporal no encontrado");
      }
      if (!realUserDoc.exists()) {
        throw new Error("Usuario real no encontrado");
      }

      const tempUser = tempUserDoc.data() as User;
      const realUser = realUserDoc.data() as User;

      // Validate that tempUser is actually a temp user
      if (!tempUserId.startsWith('temp_')) {
        throw new Error("El primer usuario debe ser un usuario temporal");
      }

      // Copy ledger from temp to real user
      const tempLedgerRef = collection(db, "users", tempUserId, "ledger");
      const tempLedgerSnapshot = await getDocs(tempLedgerRef);
      
      for (const ledgerDoc of tempLedgerSnapshot.docs) {
        const ledgerData = ledgerDoc.data();
        const realLedgerRef = doc(db, "users", realUserId, "ledger", ledgerDoc.id);
        await setDoc(realLedgerRef, ledgerData);
      }

      // Copy attendance from temp to real user
      const tempAttendanceRef = collection(db, "users", tempUserId, "attendance");
      const tempAttendanceSnapshot = await getDocs(tempAttendanceRef);
      
      for (const attendanceDoc of tempAttendanceSnapshot.docs) {
        const attendanceData = attendanceDoc.data();
        const realAttendanceRef = doc(db, "users", realUserId, "attendance", attendanceDoc.id);
        await setDoc(realAttendanceRef, attendanceData);
      }

      // Update real user profile with any missing data from temp user
      const updates: Partial<User> = {};
      if (tempUser.degree && !realUser.degree) {
        updates.degree = tempUser.degree;
      }
      if (tempUser.phoneNumber && !realUser.phoneNumber) {
        updates.phoneNumber = tempUser.phoneNumber;
      }

      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, "users", realUserId), updates as any);
      }

      // Delete the temp user
      await deleteDoc(doc(db, "users", tempUserId));

      console.log(`Successfully merged temp user ${tempUserId} into ${realUserId}`);
    } catch (e: any) {
      console.error("Error in manual merge:", e);
      throw new Error(`Error al vincular usuarios: ${e.message}`);
    }
  },

  createUserByAdmin: async (email: string, name: string, role: string, degree: string, groupId: string): Promise<User> => {
    // Create a temporary UID based on email
    const tempUid = `temp_${email.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
    
    const newUser: User = {
      uid: tempUid,
      name,
      email,
      role: role as 'member' | 'admin' | 'master',
      active: false,
      groupId: groupId,
      joinDate: new Date().toISOString(),
      profileEditable: true,
      degree: degree,
      rpg: { ...INITIAL_RPG, name: name.split(' ')[0] },
      totalPoints: 0
    };
    
    await setDoc(doc(db, "users", tempUid), newUser);
    return newUser;
  },

  // Upload app icon (Master only) - Using Firestore with base64
  uploadAppIcon: async (file: File, size: '192' | '512'): Promise<void> => {
    try {
      // Convert image to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Save to Firestore in appConfig collection
      const configRef = doc(db, "appConfig", "icons");
      const configSnap = await getDoc(configRef);
      
      const currentData = configSnap.exists() ? configSnap.data() : {};
      
      await setDoc(configRef, {
        ...currentData,
        [`icon${size}`]: base64,
        updatedAt: new Date().toISOString()
      }, { merge: true });

    } catch (e: any) {
      console.error("Error uploading app icon:", e);
      throw new Error(`Error subiendo icono: ${e.message}`);
    }
  },

  // Get app icon base64 data
  getAppIcon: async (size: '192' | '512'): Promise<string | null> => {
    try {
      const configRef = doc(db, "appConfig", "icons");
      const configSnap = await getDoc(configRef);
      
      if (!configSnap.exists()) {
        return null;
      }
      
      const data = configSnap.data();
      return data[`icon${size}`] || null;
    } catch (e: any) {
      console.error("Error getting app icon:", e);
      return null;
    }
  }
};

export const dataService = {
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
    const newGroup = {
      name,
      description,
      createdAt: Date.now(),
      priceHistory: [],
      active: true
    };
    const docRef = await addDoc(collection(db, "groups"), newGroup);
    return { id: docRef.id, ...newGroup };
  },

  updateGroup: async (groupId: string, data: Partial<Group>) => {
    if (!groupId) return;
    const ref = doc(db, "groups", groupId);
    await updateDoc(ref, data);
  },

  deleteGroup: async (groupId: string) => {
    if (!groupId) return;
    const ref = doc(db, "groups", groupId);
    await deleteDoc(ref);
  },

  toggleGroupStatus: async (groupId: string, active: boolean) => {
    if (!groupId) return;
    const ref = doc(db, "groups", groupId);
    await updateDoc(ref, { 
      active, 
      suspendedAt: active ? deleteField() : new Date().toISOString() 
    });
  },

  getGroupDetails: async (groupId: string): Promise<Group | null> => {
    if (!groupId) return null;
    const snap = await getDoc(doc(db, "groups", groupId));
    return snap.exists() ? { id: snap.id, ...snap.data() } as Group : null;
  },

  getUserProfile: async (uid: string): Promise<User | null> => {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      return snap.exists() ? snap.data() as User : null;
    } catch (e) {
      console.error("Error fetching user profile", e);
      return null;
    }
  },

  updateUser: async (uid: string, data: Partial<User>) => {
    await updateDoc(doc(db, "users", uid), data);
  },

  getPriceHistory: async (groupId: string): Promise<PriceHistoryEntry[]> => {
    try {
      const snap = await getDoc(doc(db, "groups", groupId));
      if (snap.exists() && snap.data().priceHistory) {
        return snap.data().priceHistory.sort((a: PriceHistoryEntry, b: PriceHistoryEntry) => 
          a.startDate.localeCompare(b.startDate)
        );
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
        
        // v3.0.0: Separate tracking for regular vs extra fees
        let totalPaidRegular = 0;
        let totalPaidExtra = 0;
        let totalBilledRegular = 0;
        let totalBilledExtra = 0;
        
        snap.forEach(doc => {
            const p = doc.data() as Payment;
            
            if (startPeriod && p.period < startPeriod) return;
            if (endPeriod && p.period > endPeriod) return;

            // FIX: Force Number() casting to prevent string concatenation
            const amt = Number(p.amount) || 0;
            const extra = Number(p.extraAmount) || 0;
            
            // v3.0.0: Use new separate payment fields if available, fallback to legacy 'paid'
            let paidReg = 0;
            let paidExt = 0;
            if (p.paidRegular !== undefined || p.paidExtra !== undefined) {
                paidReg = Number(p.paidRegular) || 0;
                paidExt = Number(p.paidExtra) || 0;
            } else {
                // Legacy: use old 'paid' field - assume it covers regular first, then extra
                const legacyPaid = Number(p.paid) || 0;
                if (legacyPaid <= amt) {
                    paidReg = legacyPaid;
                    paidExt = 0;
                } else {
                    paidReg = amt;
                    paidExt = legacyPaid - amt;
                }
            }
            
            const totalAmount = amt + extra;
            const totalPaidAmt = paidReg + paidExt;
            
            totalBilled += totalAmount;
            totalPaid += totalPaidAmt;
            totalDebt += (totalAmount - totalPaidAmt);
            
            totalBilledRegular += amt;
            totalBilledExtra += extra;
            totalPaidRegular += paidReg;
            totalPaidExtra += paidExt;
        });
        
        return { 
            totalPaid, 
            totalDebt, 
            totalBilled,
            totalPaidRegular,
            totalPaidExtra,
            totalBilledRegular,
            totalBilledExtra,
            totalDebtRegular: totalBilledRegular - totalPaidRegular,
            totalDebtExtra: totalBilledExtra - totalPaidExtra
        };
    } catch (error) {
        return { 
            totalPaid: 0, 
            totalDebt: 0, 
            totalBilled: 0,
            totalPaidRegular: 0,
            totalPaidExtra: 0,
            totalBilledRegular: 0,
            totalBilledExtra: 0,
            totalDebtRegular: 0,
            totalDebtExtra: 0
        };
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
                // Period doesn't exist, create it
                newBatch.set(ref, {
                    period,
                    amount,
                    paid: 0,
                    paidRegular: 0,
                    paidExtra: 0,
                    status: 'Pendiente',
                    comments: 'Generado auto',
                    groupId: user.groupId,
                    regularCovered: false,
                    extraCovered: true
                });
                opCount++;
            } else {
                const existing = existingMap.get(period)!;
                
                // IMPORTANT: Don't modify periods that are already fully paid
                // This protects advanced payments from being overwritten
                if (existing.regularCovered || existing.status === 'Pagado') {
                    // Period is already paid, skip it
                    continue;
                }
                
                // Only update amount if status is not 'Pagado' and amount changed
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
                extraAmount: Number(data.extraAmount) || 0,
                extraFees: data.extraFees || [] // Ensure extraFees is always an array
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
  
  // Get all attendance dates from a group (all meetings registered)
  getAllAttendanceDates: async (groupId: string): Promise<string[]> => {
    if (!groupId) return [];
    try {
        const users = await dataService.getUsers(groupId);
        const datesSet = new Set<string>();
        
        for (const user of users) {
            const attendance = await dataService.getAttendance(user.uid);
            attendance.forEach(a => datesSet.add(a.date));
        }
        
        return Array.from(datesSet).sort().reverse();
    } catch (e) {
        console.error('Error getting all attendance dates:', e);
        return [];
    }
  },
  
  // Get full attendance for a user including absences
  getFullAttendance: async (uid: string, groupId: string, joinDate?: string): Promise<Attendance[]> => {
    if (!uid || !groupId) return [];
    try {
        // Get all meeting dates
        const allDates = await dataService.getAllAttendanceDates(groupId);
        
        // Get user's attendance records
        const userAttendance = await dataService.getAttendance(uid);
        const attendedDates = new Set(userAttendance.map(a => a.date));
        
        // Filter dates after user's join date if provided
        const relevantDates = joinDate 
            ? allDates.filter(date => date >= joinDate)
            : allDates;
        
        // Build full attendance list
        return relevantDates.map(date => ({
            date,
            attended: attendedDates.has(date)
        }));
    } catch (e) {
        console.error('Error getting full attendance:', e);
        return [];
    }
  },
  
  getAttendanceListForDate: async (groupId: string, date: string): Promise<{name: string, attended: boolean, uid: string}[]> => {
      const users = await dataService.getUsers(groupId);
      // Incluir usuarios que estaban activos en esa fecha según su masonicRejoinDate
      const eligibleUsers = users.filter(u => {
          if (!u.groupId || u.groupId !== groupId) return false;
          // Si tiene fecha de reingreso, debe ser anterior o igual a la fecha consultada
          if (u.masonicRejoinDate) {
              return u.masonicRejoinDate <= date;
          }
          // Si no tiene fecha de reingreso pero está activo, incluirlo
          return u.active;
      }).sort((a,b) => a.name.localeCompare(b.name));
      
      const results: {name: string, attended: boolean, uid: string}[] = [];
      
      for(const u of eligibleUsers) {
          const ref = doc(db, "users", u.uid, "attendance", date);
          const snap = await getDoc(ref);
          results.push({
              name: u.name,
              attended: snap.exists() && snap.data().attended === true,
              uid: u.uid
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
      
      // Get all unique dates sorted chronologically
      const uniqueDates = Array.from(new Set(allRecords.map(r => r.date))).sort();
      
      // Build lookup map: date_uid -> bool
      const lookup = new Map<string, boolean>();
      allRecords.forEach(r => lookup.set(`${r.date}_${r.uid}`, r.attended));

      // CSV Format: Nombre,Fecha,Asistencia (1=asistió, 0=no asistió pero estaba inscrito)
      const csvRows = ["Nombre,Fecha,Asistencia"];
      
      uniqueDates.forEach(date => {
          activeUsers.forEach(u => {
              const attended = lookup.get(`${date}_${u.uid}`);
              // Si hay registro de ese día, ponemos 1 si asistió, 0 si no
              // Si no hay registro, significa que no estaba inscrito aún en esa fecha
              if (attended !== undefined) {
                  const value = attended ? 1 : 0;
                  csvRows.push(`"${u.name}",${date},${value}`);
              }
          });
      });
      
      return csvRows.join('\n');
  },
  
  getUsers: async (groupId: string): Promise<User[]> => {
    if (!groupId) return [];
    try {
      console.log("getUsers: Fetching users for groupId:", groupId);
      
      // Query 1: Users with matching groupId
      const q1 = query(collection(db, "users"), where("groupId", "==", groupId));
      const snapshot1 = await getDocs(q1);
      
      // Query 2: Users with empty or missing groupId (pending assignment)
      const q2 = query(collection(db, "users"), where("groupId", "==", ""));
      const snapshot2 = await getDocs(q2);
      
      console.log("getUsers: Found", snapshot1.docs.length, "users with groupId");
      console.log("getUsers: Found", snapshot2.docs.length, "users without groupId");
      
      const users = [
        ...snapshot1.docs.map(d => d.data() as User),
        ...snapshot2.docs.map(d => d.data() as User)
      ];
      
      users.forEach(data => {
        console.log("User:", data.name, "- active:", data.active, "- role:", data.role, "- groupId:", data.groupId || "(empty)");
      });
      
      return users;
    } catch (e) {
      console.error("Error in getUsers:", e);
      throw e;
    }
  },

  updateUserStatus: async (uid: string, active: boolean) => {
    await updateDoc(doc(db, "users", uid), { active });
  },

  assignUserToGroup: async (uid: string, groupId: string) => {
    await updateDoc(doc(db, "users", uid), { groupId });
  },

  recordAttendance: async (date: string, uidsPresent: string[]) => {
    // Esta función solo registra a los presentes
    // Los ausentes simplemente no tendrán registro para esa fecha
    const batch = writeBatch(db);
    for (const uid of uidsPresent) {
      const ref = doc(db, "users", uid, "attendance", date);
      batch.set(ref, {
        date,
        attended: true
      }, { merge: true });
    }
    await batch.commit();
  },

  deleteAttendance: async (uid: string, date: string) => {
    const ref = doc(db, "users", uid, "attendance", date);
    await deleteDoc(ref);
  },

  deleteAttendanceForAllUsers: async (groupId: string, date: string) => {
    // Obtiene TODOS los usuarios del grupo (activos e inactivos)
    const allUsers = await dataService.getUsers(groupId);
    const batch = writeBatch(db);
    
    for (const user of allUsers) {
      const ref = doc(db, "users", user.uid, "attendance", date);
      batch.delete(ref);
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

  getActiveTrivia: async (groupId: string): Promise<Trivia | null> => {
    if (!groupId) return null;
    try {
      const q = query(
        collection(db, "trivias"),
        where("groupId", "==", groupId),
        orderBy("createdAt", "desc"),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      return snapshot.docs[0].data() as Trivia;
    } catch (e) {
      console.error("Error fetching active trivia", e);
      return null;
    }
  },

  getUserAnswer: async (uid: string, triviaId: string): Promise<TriviaAnswer | undefined> => {
    if (!uid || !triviaId) return undefined;
    try {
      const docRef = doc(db, "users", uid, "triviaAnswers", triviaId);
      const snap = await getDoc(docRef);
      return snap.exists() ? snap.data() as TriviaAnswer : undefined;
    } catch (e) {
      console.error("Error fetching user answer", e);
      return undefined;
    }
  },

  submitAnswer: async (uid: string, triviaId: string, answerIndex: number): Promise<TriviaAnswer> => {
    if (!uid || !triviaId) throw new Error("Missing uid or triviaId");
    
    console.log("submitAnswer called with:", { uid, triviaId, answerIndex });
    
    // Get the trivia to check correct answer
    const triviaQuery = query(collection(db, "trivias"), where("id", "==", triviaId), limit(1));
    const triviaSnap = await getDocs(triviaQuery);
    
    if (triviaSnap.empty) throw new Error("Trivia not found");
    
    const trivia = triviaSnap.docs[0].data() as Trivia;
    const correct = answerIndex === trivia.correctIndex;
    const points = correct ? 10 : 0;

    console.log("Answer evaluation:", { correct, points, correctIndex: trivia.correctIndex, answerIndex });

    const answer: TriviaAnswer = {
      uid,
      triviaId,
      answerIndex,
      correct,
      points,
      answeredAt: new Date().toISOString()
    };

    // Save answer
    try {
      const answerRef = doc(db, "users", uid, "triviaAnswers", triviaId);
      console.log("Saving answer to:", answerRef.path);
      await setDoc(answerRef, answer);
      console.log("Answer saved successfully");
    } catch (e) {
      console.error("Error saving answer:", e);
      throw new Error("Error guardando respuesta: " + ((e as any)?.message || e));
    }

    // Update total points if correct
    if (correct) {
      try {
        const userRef = doc(db, "users", uid);
        console.log("Updating totalPoints for user:", uid);
        await updateDoc(userRef, {
          totalPoints: increment(points)
        });
        console.log("Points updated successfully");
      } catch (e) {
        console.error("Error updating points:", e);
        throw new Error("Error actualizando puntos: " + ((e as any)?.message || e));
      }
    }

    return answer;
  },

  getLeaderboard: async (groupId?: string): Promise<{name: string, points: number}[]> => {
    try {
      let q;
      if (groupId) {
        // Try with groupId filter first
        q = query(
          collection(db, "users"),
          where("groupId", "==", groupId),
          where("totalPoints", ">", 0),
          orderBy("totalPoints", "desc"),
          limit(10)
        );
      } else {
        q = query(
          collection(db, "users"),
          where("totalPoints", ">", 0),
          orderBy("totalPoints", "desc"),
          limit(10)
        );
      }
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => {
        const data = d.data() as User;
        return { name: data.name, points: data.totalPoints || 0 };
      });
    } catch (e) {
      console.error("Error fetching leaderboard", e);
      // If composite index error, try without groupId filter
      if (groupId && (e as any)?.message?.includes('index')) {
        console.warn("Composite index missing, fetching all users");
        try {
          const q = query(
            collection(db, "users"),
            where("totalPoints", ">", 0),
            orderBy("totalPoints", "desc"),
            limit(10)
          );
          const snapshot = await getDocs(q);
          const allUsers = snapshot.docs.map(d => {
            const data = d.data() as User;
            return { name: data.name, points: data.totalPoints || 0, groupId: data.groupId };
          });
          // Filter by groupId locally
          return allUsers.filter(u => u.groupId === groupId).map(u => ({name: u.name, points: u.points}));
        } catch (e2) {
          console.error("Fallback also failed", e2);
          return [];
        }
      }
      return [];
    }
  },

  deleteTrivia: async (triviaId: string) => {
    if (!triviaId) return;
    const ref = doc(db, "trivias", triviaId);
    await deleteDoc(ref);
  },

  getAllTrivias: async (groupId: string): Promise<Trivia[]> => {
    if (!groupId) return [];
    try {
      const q = query(
        collection(db, "trivias"),
        where("groupId", "==", groupId),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as Trivia);
    } catch (e) {
      console.error("Error fetching all trivias", e);
      return [];
    }
  },

  resetTriviaAnswersForUser: async (uid: string) => {
    if (!uid) return;
    try {
      const answersQuery = query(collection(db, "users", uid, "triviaAnswers"));
      const snapshot = await getDocs(answersQuery);
      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    } catch (e) {
      console.error("Error resetting trivia answers", e);
    }
  },

  resetAllTriviaAnswers: async (groupId: string) => {
    if (!groupId) return;
    try {
      const users = await dataService.getUsers(groupId);
      const batch = writeBatch(db);
      for (const user of users) {
        // Reset trivia answers
        await dataService.resetTriviaAnswersForUser(user.uid);
        // Reset total points to 0
        const userRef = doc(db, "users", user.uid);
        batch.update(userRef, { totalPoints: 0 });
      }
      await batch.commit();
    } catch (e) {
      console.error("Error resetting all trivia answers", e);
    }
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
  },

  // --- TASKS ---
  getTasks: async (groupId: string): Promise<Task[]> => {
    if (!groupId) return [];
    try {
      const q = query(collection(db, "groups", groupId, "tasks"));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(d => ({id: d.id, ...d.data()} as Task));
      // Sort by: incomplete first, then by creation date
      return list.sort((a,b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
    } catch (e) {
      return [];
    }
  },

  createTask: async (task: Omit<Task, 'id'>) => {
    const ref = doc(collection(db, "groups", task.groupId, "tasks"));
    await setDoc(ref, {
      ...task,
      id: ref.id
    });
  },

  updateTask: async (groupId: string, taskId: string, data: Partial<Task>) => {
    const ref = doc(db, "groups", groupId, "tasks", taskId);
    await updateDoc(ref, data);
  },

  deleteTask: async (groupId: string, taskId: string) => {
    const ref = doc(db, "groups", groupId, "tasks", taskId);
    await deleteDoc(ref);
  },

  toggleTaskComplete: async (groupId: string, taskId: string, completed: boolean, userUid: string) => {
    const ref = doc(db, "groups", groupId, "tasks", taskId);
    const updateData: any = { completed };
    if (completed) {
      updateData.completedAt = new Date().toISOString();
      updateData.completedBy = userUid;
    } else {
      updateData.completedAt = deleteField();
      updateData.completedBy = deleteField();
    }
    await updateDoc(ref, updateData);
  },

  // VISIT REQUESTS
  createVisitRequest: async (request: Omit<VisitRequest, 'id' | 'createdAt' | 'messages'>) => {
    try {
      const ref = doc(collection(db, "visitRequests"));
      await setDoc(ref, {
        ...request,
        id: ref.id,
        createdAt: Date.now(),
        messages: []
      });
      return ref.id;
    } catch (e) {
      console.error("Error creating visit request:", e);
      const errorMsg = (e as any)?.message || '';
      if (errorMsg.includes('permission') || errorMsg.includes('Missing or insufficient')) {
        throw new Error("Error de permisos: Contacta al administrador para configurar las reglas de Firestore");
      }
      throw e;
    }
  },

  getVisitRequestsForGroup: async (groupId: string): Promise<VisitRequest[]> => {
    try {
      // Get requests where the group is either sender or receiver
      const sentQ = query(collection(db, "visitRequests"), where("fromGroupId", "==", groupId));
      const receivedQ = query(collection(db, "visitRequests"), where("toGroupId", "==", groupId));
      
      const [sentSnap, receivedSnap] = await Promise.all([
        getDocs(sentQ),
        getDocs(receivedQ)
      ]);
      
      const requests: VisitRequest[] = [];
      sentSnap.docs.forEach(d => requests.push(d.data() as VisitRequest));
      receivedSnap.docs.forEach(d => requests.push(d.data() as VisitRequest));
      
      // Sort by creation date descending
      return requests.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      console.error("Error fetching visit requests", e);
      return [];
    }
  },

  updateVisitRequestStatus: async (requestId: string, status: 'accepted' | 'rejected' | 'completed') => {
    const ref = doc(db, "visitRequests", requestId);
    await updateDoc(ref, { status });
  },

  addMessageToVisitRequest: async (requestId: string, message: Omit<VisitMessage, 'id' | 'timestamp'>) => {
    const ref = doc(db, "visitRequests", requestId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Visit request not found");
    
    const request = snap.data() as VisitRequest;
    const newMessage: VisitMessage = {
      ...message,
      id: `msg_${Date.now()}`,
      timestamp: Date.now()
    };
    
    const updatedMessages = [...(request.messages || []), newMessage];
    await updateDoc(ref, { messages: updatedMessages });
  },

  deleteVisitRequest: async (requestId: string) => {
    const ref = doc(db, "visitRequests", requestId);
    await deleteDoc(ref);
  },

  // Bank Balances
  getBankBalances: async (groupId: string): Promise<BankBalance[]> => {
    const q = query(
      collection(db, "bankBalances"),
      where("groupId", "==", groupId)
    );
    const snapshot = await getDocs(q);
    // Sort in memory instead of using orderBy (to avoid composite index requirement)
    const balances = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BankBalance));
    return balances.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
  },

  createBankBalance: async (balance: Omit<BankBalance, 'id'>): Promise<string> => {
    const ref = await addDoc(collection(db, "bankBalances"), balance);
    return ref.id;
  },

  updateBankBalance: async (id: string, balance: Partial<BankBalance>) => {
    const ref = doc(db, "bankBalances", id);
    await updateDoc(ref, balance);
  },

  deleteBankBalance: async (id: string) => {
    const ref = doc(db, "bankBalances", id);
    await deleteDoc(ref);
  },

  // EXTRA FEES MANAGEMENT
  getExtraFees: async (groupId: string): Promise<ExtraFee[]> => {
    const q = query(
      collection(db, "extraFees"),
      where("groupId", "==", groupId)
    );
    const snapshot = await getDocs(q);
    const fees = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ExtraFee));
    return fees.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  createExtraFee: async (fee: Omit<ExtraFee, 'id'>): Promise<string> => {
    const ref = await addDoc(collection(db, "extraFees"), fee);
    return ref.id;
  },

  deleteExtraFee: async (extraFeeId: string, appliedToUsers: string[], period: string, amount: number) => {
    // 1. Eliminar el registro de extraFee
    await deleteDoc(doc(db, "extraFees", extraFeeId));
    
    // 2. Revertir el monto de los ledgers de los usuarios
    const chunkSize = 450;
    for (let i = 0; i < appliedToUsers.length; i += chunkSize) {
      const chunk = appliedToUsers.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      let hasOps = false;

      for (const uid of chunk) {
        const ledgerRef = doc(db, "users", uid, "ledger", period);
        const ledgerSnap = await getDoc(ledgerRef);
        
        if (ledgerSnap.exists()) {
          const currentExtra = ledgerSnap.data().extraAmount || 0;
          const newExtra = Math.max(0, currentExtra - amount);
          
          if (newExtra === 0) {
            // Si no queda extraAmount, eliminar esos campos
            batch.update(ledgerRef, {
              extraAmount: deleteField(),
              extraDescription: deleteField()
            });
          } else {
            // Si aún queda monto, solo restar
            batch.update(ledgerRef, {
              extraAmount: newExtra
            });
          }
          hasOps = true;
        }
      }
      
      if (hasOps) {
        await batch.commit();
      }
    }
  },

  updateExtraFee: async (extraFeeId: string, updates: { description?: string; amount?: number }, oldAmount: number, appliedToUsers: string[], period: string) => {
    // 1. Actualizar el registro de extraFee
    await updateDoc(doc(db, "extraFees", extraFeeId), updates);
    
    // 2. Si cambió el monto, actualizar los ledgers
    if (updates.amount !== undefined && updates.amount !== oldAmount) {
      const amountDiff = updates.amount - oldAmount;
      const chunkSize = 450;
      
      for (let i = 0; i < appliedToUsers.length; i += chunkSize) {
        const chunk = appliedToUsers.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        let hasOps = false;

        for (const uid of chunk) {
          const ledgerRef = doc(db, "users", uid, "ledger", period);
          batch.set(ledgerRef, {
            period,
            extraAmount: increment(amountDiff)
          }, { merge: true });
          hasOps = true;
        }
        
        if (hasOps) {
          await batch.commit();
        }
      }
    }
  },

  assignExtraFeeToUser: async (
    groupId: string,
    uid: string,
    userName: string,
    period: string,
    amount: number,
    description: string,
    createdBy: string,
    createdByName: string
  ): Promise<string> => {
    // 1. Crear registro en extraFees
    const extraFee: Omit<ExtraFee, 'id'> = {
      groupId,
      period,
      amount,
      description,
      type: 'individual',
      targetUserId: uid,
      targetUserName: userName,
      createdBy,
      createdByName,
      createdAt: new Date().toISOString(),
      appliedToUsers: [uid]
    };
    
    const extraFeeId = await dataService.createExtraFee(extraFee);
    
    // 2. Aplicar al ledger del usuario como IndividualExtraFee
    const ledgerRef = doc(db, "users", uid, "ledger", period);
    
    // Get current payment to retrieve existing extraFees
    const currentDoc = await getDoc(ledgerRef);
    const currentPayment = currentDoc.exists() ? currentDoc.data() as Payment : null;
    
    // Create new individual extra fee
    const newExtraFee: IndividualExtraFee = {
      id: `extra_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      description: description,
      amount: amount,
      paid: 0,
      createdAt: new Date().toISOString(),
      createdBy: createdBy
    };
    
    // Add to existing extraFees array or create new one
    const currentExtraFees = currentPayment?.extraFees || [];
    const updatedExtraFees = [...currentExtraFees, newExtraFee];
    
    // Calculate totals
    const totalExtraAmount = updatedExtraFees.reduce((sum, fee) => sum + fee.amount, 0);
    const totalExtraPaid = updatedExtraFees.reduce((sum, fee) => sum + fee.paid, 0);
    
    // Update payment with extraFees array
    await setDoc(ledgerRef, {
      period,
      extraFees: updatedExtraFees,
      extraAmount: totalExtraAmount, // Keep legacy field updated
      paidExtra: totalExtraPaid,
      extraCovered: totalExtraPaid >= totalExtraAmount
    }, { merge: true });
    
    return extraFeeId;
  },

  assignExtraFeeToAllNew: async (
    groupId: string,
    period: string,
    amount: number,
    description: string,
    createdBy: string,
    createdByName: string
  ): Promise<string> => {
    const users = await dataService.getUsers(groupId);
    const activeUsers = users.filter(u => u.active);
    const appliedToUsers = activeUsers.map(u => u.uid);
    
    // 1. Crear registro en extraFees
    const extraFee: Omit<ExtraFee, 'id'> = {
      groupId,
      period,
      amount,
      description,
      type: 'mass',
      createdBy,
      createdByName,
      createdAt: new Date().toISOString(),
      appliedToUsers
    };
    
    const extraFeeId = await dataService.createExtraFee(extraFee);
    
    // 2. Aplicar a ledgers de usuarios activos
    const chunkSize = 450;
    for (let i = 0; i < activeUsers.length; i += chunkSize) {
      const chunk = activeUsers.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      let hasOps = false;

      for (const u of chunk) {
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
    
    return extraFeeId;
  },

  // v3.2.0: Apply individual extra fees to all active users
  assignIndividualExtraFeeToAll: async (
    groupId: string,
    period: string,
    amount: number,
    description: string,
    createdBy: string,
    createdByName: string
  ): Promise<string> => {
    const users = await dataService.getUsers(groupId);
    const activeUsers = users.filter(u => u.active);
    const appliedToUsers = activeUsers.map(u => u.uid);
    
    // 1. Create record in extraFees collection
    const extraFee: Omit<ExtraFee, 'id'> = {
      groupId,
      period,
      amount,
      description,
      type: 'mass',
      createdBy,
      createdByName,
      createdAt: new Date().toISOString(),
      appliedToUsers
    };
    
    const extraFeeId = await dataService.createExtraFee(extraFee);
    
    // 2. Apply to ledgers of active users as individual extra fees
    const chunkSize = 450;
    for (let i = 0; i < activeUsers.length; i += chunkSize) {
      const chunk = activeUsers.slice(i, i + chunkSize);

      for (const u of chunk) {
        const ref = doc(db, "users", u.uid, "ledger", period);
        
        // Get current payment
        const currentDoc = await getDoc(ref);
        const currentPayment = currentDoc.exists() ? currentDoc.data() as Payment : null;
        
        // Create new individual extra fee
        const newExtraFee: IndividualExtraFee = {
          id: `extra_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          description: description,
          amount: amount,
          paid: 0,
          createdAt: new Date().toISOString(),
          createdBy: createdBy
        };
        
        // Add to existing extraFees array or create new one
        const currentExtraFees = currentPayment?.extraFees || [];
        const updatedExtraFees = [...currentExtraFees, newExtraFee];
        
        // Calculate totals
        const totalExtraAmount = updatedExtraFees.reduce((sum, fee) => sum + fee.amount, 0);
        const totalExtraPaid = updatedExtraFees.reduce((sum, fee) => sum + fee.paid, 0);
        
        // Update payment
        await setDoc(ref, {
          period,
          extraFees: updatedExtraFees,
          extraAmount: totalExtraAmount, // Keep legacy field updated
          paidExtra: totalExtraPaid,
          extraCovered: totalExtraPaid >= totalExtraAmount
        }, { merge: true });
      }
    }
    
    return extraFeeId;
  },

  // Migration function: Convert old extraAmount format to new extraFees array format
  migrateExtraFeesToNewFormat: async (groupId: string): Promise<{
    totalUsers: number;
    totalPayments: number;
    migratedPayments: number;
    errors: string[];
  }> => {
    const errors: string[] = [];
    let totalUsers = 0;
    let totalPayments = 0;
    let migratedPayments = 0;

    try {
      // Get all users from the group
      const users = await dataService.getUsers(groupId);
      totalUsers = users.length;

      console.log(`🔄 Starting migration for ${totalUsers} users...`);

      // Process each user
      for (const user of users) {
        try {
          // Get all payments for this user
          const ledgerSnapshot = await getDocs(collection(db, "users", user.uid, "ledger"));
          
          for (const paymentDoc of ledgerSnapshot.docs) {
            totalPayments++;
            const payment = paymentDoc.data() as Payment;
            const period = paymentDoc.id;

            // Check if this payment needs migration
            const hasOldExtraAmount = payment.extraAmount && payment.extraAmount > 0;
            const hasNoExtraFees = !payment.extraFees || payment.extraFees.length === 0;

            if (hasOldExtraAmount && hasNoExtraFees) {
              console.log(`  📝 Migrating ${user.name} - ${period}: $${payment.extraAmount}`);

              // Create IndividualExtraFee from old data
              const newExtraFee: IndividualExtraFee = {
                id: `migrated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                description: payment.extraDescription || 'Cuota Extraordinaria (Migrado)',
                amount: Number(payment.extraAmount) || 0,
                paid: Number(payment.paidExtra) || 0,
                createdAt: new Date().toISOString(),
                createdBy: 'system_migration'
              };

              // Update the payment with new format
              const ledgerRef = doc(db, "users", user.uid, "ledger", period);
              await updateDoc(ledgerRef, {
                extraFees: [newExtraFee],
                // Keep legacy fields for compatibility
                extraAmount: newExtraFee.amount,
                paidExtra: newExtraFee.paid,
                extraCovered: newExtraFee.paid >= newExtraFee.amount
              });

              migratedPayments++;
              console.log(`    ✅ Migrated successfully`);
            }
          }
        } catch (userError: any) {
          const errorMsg = `Error processing user ${user.name}: ${userError.message}`;
          console.error(`  ❌ ${errorMsg}`);
          errors.push(errorMsg);
        }
      }

      console.log(`\n✨ Migration complete!`);
      console.log(`   Total users: ${totalUsers}`);
      console.log(`   Total payments: ${totalPayments}`);
      console.log(`   Migrated payments: ${migratedPayments}`);
      console.log(`   Errors: ${errors.length}`);

      return {
        totalUsers,
        totalPayments,
        migratedPayments,
        errors
      };
    } catch (error: any) {
      console.error('💥 Migration failed:', error);
      errors.push(`Migration failed: ${error.message}`);
      return {
        totalUsers,
        totalPayments,
        migratedPayments,
        errors
      };
    }
  }
};

// ─── NOTIFICATION SERVICE ────────────────────────────────────────────────────
export const notificationService = {

  /** Solicita permiso del navegador para mostrar notificaciones */
  requestPermission: async (): Promise<boolean> => {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  },

  /** Guarda/actualiza en Firestore si el usuario ha dado permiso */
  savePermissionStatus: async (uid: string, granted: boolean) => {
    try {
      await updateDoc(doc(db, 'users', uid), {
        notifPermission: granted,
        notifPermissionUpdatedAt: Date.now()
      });
    } catch (_) {}
  },

  /** Crea un documento de notificación en Firestore para uno o varios usuarios */
  createNotification: async (
    uids: string[],
    groupId: string,
    type: NotificationType,
    title: string,
    body: string
  ) => {
    const batch = writeBatch(db);
    for (const uid of uids) {
      const ref = doc(collection(db, 'users', uid, 'notifications'));
      const notif: AppNotification = {
        id: ref.id,
        uid,
        groupId,
        type,
        title,
        body,
        read: false,
        createdAt: Date.now()
      };
      batch.set(ref, notif);
    }
    await batch.commit();
  },

  /** Obtiene las notificaciones no leídas de un usuario */
  getUnread: async (uid: string): Promise<AppNotification[]> => {
    try {
      const q = query(
        collection(db, 'users', uid, 'notifications'),
        where('read', '==', false),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as AppNotification);
    } catch (_) {
      return [];
    }
  },

  /** Marca una notificación como leída */
  markRead: async (uid: string, notifId: string) => {
    await updateDoc(doc(db, 'users', uid, 'notifications', notifId), { read: true });
  },

  /** Marca todas las notificaciones como leídas */
  markAllRead: async (uid: string) => {
    const q = query(collection(db, 'users', uid, 'notifications'), where('read', '==', false));
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  },

  /** Muestra una notificación nativa del navegador */
  showBrowserNotification: (title: string, body: string, type: NotificationType) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const icons: Record<NotificationType, string> = {
      attendance: '/icons/icon-192.png',
      trivia: '/icons/icon-192.png',
      notice: '/icons/icon-192.png',
      profile_edit: '/icons/icon-192.png',
      payment: '/icons/icon-192.png'
    };
    try {
      new Notification(title, {
        body,
        icon: icons[type] || '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: type, // agrupa notificaciones del mismo tipo
        renotify: true
      });
    } catch (e) {
      console.warn('Browser notification failed:', e);
    }
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
