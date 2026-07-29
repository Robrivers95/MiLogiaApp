import fs from 'node:fs';

const patch = (path, transform) => {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after);
};

patch('types.ts', source => {
  if (!source.includes('targetExtraFeeId?: string;')) {
    source = source.replace('  conceptId?: string;\n', '  conceptId?: string;\n  targetExtraFeeId?: string;\n  targetExtraFeePeriod?: string;\n  memberComments?: string;\n  unappliedAmount?: number;\n  allocationSummary?: Array<{ period: string; feeId: string; description: string; amount: number }>;\n');
  }
  return source;
});

patch('components/Payments.tsx', source => {
  if (!source.includes('selectedExtraFeeKey')) {
    source = source.replace(
      "  const [conceptDescription, setConceptDescription] = useState('');\n",
      "  const [conceptDescription, setConceptDescription] = useState('');\n  const [selectedExtraFeeKey, setSelectedExtraFeeKey] = useState('');\n  const [receiptNotes, setReceiptNotes] = useState('');\n"
    );

    source = source.replace(
      "  // Multiple receipts per period\n",
      `  const pendingExtraOptions = payments.flatMap(payment => (payment.extraFees || [])\n    .filter(fee => !fee.forgiven && Number(fee.paid || 0) < Number(fee.amount || 0))\n    .map(fee => ({\n      key: \`${'${payment.period}'}::\${fee.id}\`,\n      period: payment.period,\n      feeId: fee.id,\n      description: fee.description,\n      balance: Math.max(0, Number(fee.amount) - Number(fee.paid || 0)),\n    })))\n    .sort((a, b) => a.period.localeCompare(b.period));\n\n  // Multiple receipts per period\n`
    );

    source = source.replace(
      "    if (receiptType === 'concepto_adicional' && !conceptDescription.trim()) {\n      setReceiptMsg({ text: 'Escribe la descripción del concepto.', type: 'error' });\n      return;\n    }",
      "    if (receiptType === 'concepto_adicional' && !selectedExtraFeeKey) {\n      setReceiptMsg({ text: 'Selecciona la cuota extraordinaria a la que corresponde el pago.', type: 'error' });\n      return;\n    }"
    );

    source = source.replace(
      "    setSubmittingReceipt(true);\n    try {\n      await dataService.submitPaymentReceipt(receiptFiles, {",
      "    const selectedExtra = pendingExtraOptions.find(item => item.key === selectedExtraFeeKey);\n    setSubmittingReceipt(true);\n    try {\n      await dataService.submitPaymentReceipt(receiptFiles, {"
    );

    source = source.replace(
      "        periods: receiptPeriods,\n",
      "        periods: receiptType === 'concepto_adicional' && selectedExtra ? [selectedExtra.period] : receiptPeriods,\n"
    );
    source = source.replace(
      "        conceptDescription: receiptType === 'concepto_adicional' ? conceptDescription.trim() : undefined,\n",
      "        conceptDescription: receiptType === 'concepto_adicional' ? selectedExtra?.description : undefined,\n        conceptId: receiptType === 'concepto_adicional' ? selectedExtra?.feeId : undefined,\n        targetExtraFeeId: receiptType === 'concepto_adicional' ? selectedExtra?.feeId : undefined,\n        targetExtraFeePeriod: receiptType === 'concepto_adicional' ? selectedExtra?.period : undefined,\n        memberComments: receiptNotes.trim() || undefined,\n"
    );
    source = source.replace(
      "      setConceptDescription('');\n",
      "      setConceptDescription('');\n      setSelectedExtraFeeKey('');\n      setReceiptNotes('');\n"
    );

    source = source.replace(
      "onChange={() => { setReceiptType('cuota_mensual'); setReceiptPeriods([]); }}",
      "onChange={() => { setReceiptType('cuota_mensual'); setReceiptPeriods([]); setSelectedExtraFeeKey(''); }}"
    );
    source = source.replace(
      "onChange={() => { setReceiptType('concepto_adicional'); setReceiptPeriods([]); }}",
      "onChange={() => { setReceiptType('concepto_adicional'); setReceiptPeriods([]); setSelectedExtraFeeKey(''); }}"
    );

    const oldExtraBlock = /\{\/\* Descripción \(solo para concepto adicional\) \*\/\}[\s\S]*?\{\/\* Selección de meses \*\/\}/;
    source = source.replace(oldExtraBlock, `{/* Selección de cuota extraordinaria */}\n              {receiptType === 'concepto_adicional' && (\n                <div className=\"space-y-3\">\n                  <div>\n                    <label className=\"block text-xs font-bold text-gray-400 uppercase mb-2\">\n                      Cuota extraordinaria pendiente <span className=\"text-red-400\">*</span>\n                    </label>\n                    <select value={selectedExtraFeeKey} onChange={e => {\n                      setSelectedExtraFeeKey(e.target.value);\n                      const selected = pendingExtraOptions.find(item => item.key === e.target.value);\n                      setConceptDescription(selected?.description || '');\n                    }} className=\"w-full bg-logia-900 border border-logia-700 rounded p-3 text-white\">\n                      <option value=\"\">Selecciona una cuota</option>\n                      {pendingExtraOptions.map(item => (\n                        <option key={item.key} value={item.key}>{formatPeriod(item.period)} · {item.description} · pendiente $ {item.balance.toFixed(2)}</option>\n                      ))}\n                    </select>\n                    {pendingExtraOptions.length === 0 && <p className=\"text-xs text-gray-500 mt-1\">No tienes cuotas extraordinarias pendientes.</p>}\n                  </div>\n                  <div>\n                    <label className=\"block text-xs font-bold text-gray-400 uppercase mb-2\">Descripción o detalle adicional (opcional)</label>\n                    <textarea value={receiptNotes} onChange={e => setReceiptNotes(e.target.value)} rows={3}\n                      placeholder=\"Puedes conservar aquí cualquier explicación o detalle del pago.\"\n                      className=\"w-full bg-logia-900 border border-logia-700 rounded p-3 text-white\" />\n                  </div>\n                </div>\n              )}\n\n              {/* Selección de meses */}`);
  }
  return source;
});

patch('services/api.ts', source => {
  if (!source.includes("from './extraReceiptAllocator'")) {
    source = source.replace(
      "import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';\n",
      "import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';\nimport { applyExtraReceiptPayment } from './extraReceiptAllocator';\n"
    );
  }

  if (!source.includes('allocationResult = await applyExtraReceiptPayment')) {
    source = source.replace(
      "      if (receipt.amount && Number(receipt.amount) > 0) {\n",
      "      if (receipt.receiptType === 'concepto_adicional') {\n        const allocationResult = await applyExtraReceiptPayment(receipt, approvalDate);\n        await updateDoc(receiptRef, {\n          unappliedAmount: allocationResult.unapplied,\n          allocationSummary: allocationResult.allocations,\n        });\n      } else if (receipt.amount && Number(receipt.amount) > 0) {\n"
    );
  }

  source = source.replace(
    "const allowed: (keyof PaymentReceipt)[] = ['periods', 'amount', 'receiptType', 'conceptDescription', 'transferDate'];",
    "const allowed: (keyof PaymentReceipt)[] = ['periods', 'amount', 'receiptType', 'conceptDescription', 'conceptId', 'targetExtraFeeId', 'targetExtraFeePeriod', 'memberComments', 'transferDate'];"
  );
  return source;
});

console.log('✓ Mejoras de pagos y cuotas extraordinarias aplicadas');
