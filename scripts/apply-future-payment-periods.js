import fs from 'node:fs';

const path = 'services/api.ts';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes('const getMembershipFeeForPeriod = async')) {
  source = source.replace(
    'export const dataService = {',
    `const getMembershipFeeForPeriod = async (groupId: string, period: string): Promise<number> => {
  const groupSnap = await getDoc(doc(db, 'groups', groupId));
  if (!groupSnap.exists()) return 0;
  const group = groupSnap.data() as Group & { membershipFee?: number };
  const history = Array.isArray(group.priceHistory) ? [...group.priceHistory] : [];
  const applicable = history
    .filter(item => item?.startDate && item.startDate <= period)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  return Number(applicable?.amount ?? group.membershipFee ?? 0) || 0;
};

const ensureApprovedFutureMonthlyPeriods = async (uid: string): Promise<void> => {
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) return;
  const user = userSnap.data() as User;
  if (!user.groupId) return;

  const receiptsSnap = await getDocs(query(
    collection(db, 'groups', user.groupId, 'paymentReceipts'),
    where('userId', '==', uid),
    where('status', '==', 'approved')
  ));

  for (const receiptDoc of receiptsSnap.docs) {
    const receipt = { id: receiptDoc.id, ...receiptDoc.data() } as PaymentReceipt;
    if (receipt.receiptType !== 'cuota_mensual' || !Array.isArray(receipt.periods) || receipt.periods.length === 0) continue;

    const sortedPeriods = [...new Set(receipt.periods)].sort();
    let remaining = receipt.amount && Number(receipt.amount) > 0 ? Number(receipt.amount) : Number.POSITIVE_INFINITY;
    const approvalDate = receipt.reviewedAt?.slice(0, 10) || receipt.transferDate || new Date().toISOString().slice(0, 10);

    for (const period of sortedPeriods) {
      const feeAmount = await getMembershipFeeForPeriod(user.groupId, period);
      if (feeAmount <= 0) continue;

      const plannedAmount = Number.isFinite(remaining) ? Math.min(remaining, feeAmount) : feeAmount;
      if (Number.isFinite(remaining)) remaining = Math.max(0, remaining - feeAmount);

      const ledgerRef = doc(db, 'users', uid, 'ledger', period);
      const ledgerSnap = await getDoc(ledgerRef);
      if (ledgerSnap.exists()) continue;

      const covered = plannedAmount >= feeAmount;
      await setDoc(ledgerRef, {
        period,
        amount: feeAmount,
        paidRegular: plannedAmount,
        paid: plannedAmount,
        paidExtra: 0,
        regularCovered: covered,
        extraCovered: true,
        status: covered ? 'Pagado' : plannedAmount > 0 ? 'Parcial' : 'Pendiente',
        comments: 'Periodo futuro recuperado desde comprobante aprobado',
        paymentDate: plannedAmount > 0 ? approvalDate : null,
        groupId: user.groupId,
        sourceReceiptId: receipt.id,
      });
    }
  }
};

export const dataService = {`
  );
}

source = source.replace(
  `  getPayments: async (uid: string): Promise<Payment[]> => {
    if (!uid) return [];
    try {
        const snapshot = await getDocs(collection(db, "users", uid, "ledger"));`,
  `  getPayments: async (uid: string): Promise<Payment[]> => {
    if (!uid) return [];
    try {
        await ensureApprovedFutureMonthlyPeriods(uid);
        const snapshot = await getDocs(collection(db, "users", uid, "ledger"));`
);

source = source.replace(
  `            const groupSnap = await getDoc(doc(db, "groups", receipt.groupId));
            const feeAmount = groupSnap.exists() ? (groupSnap.data().membershipFee || 0) : 0;`,
  `            const feeAmount = await getMembershipFeeForPeriod(receipt.groupId, period);`
);

source = source.replace(
  `            const groupSnap = await getDoc(doc(db, "groups", receipt.groupId));
            const feeAmount = groupSnap.exists() ? (groupSnap.data().membershipFee || 0) : 0;`,
  `            const feeAmount = await getMembershipFeeForPeriod(receipt.groupId, period);`
);

fs.writeFileSync(path, source);
console.log('✓ Pagos futuros y conciliación de comprobantes aprobados aplicados');
