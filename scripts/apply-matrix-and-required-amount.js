import fs from 'node:fs';

const patch = (path, transform) => {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(path, after);
    console.log(`✓ Actualizado ${path}`);
  }
};

patch('components/Payments.tsx', source => {
  if (!source.includes("Ingresa el monto transferido; puede ser un abono parcial.")) {
    source = source.replace(
      "    if (receiptFiles.length === 0 || !receiptTransferDate) {\n      setReceiptMsg({ text: 'Adjunta al menos un comprobante y la fecha de transferencia.', type: 'error' });\n      return;\n    }",
      "    if (receiptFiles.length === 0 || !receiptTransferDate) {\n      setReceiptMsg({ text: 'Adjunta al menos un comprobante y la fecha de transferencia.', type: 'error' });\n      return;\n    }\n    if (!receiptAmount || !Number.isFinite(Number(receiptAmount)) || Number(receiptAmount) <= 0) {\n      setReceiptMsg({ text: 'Ingresa el monto transferido; puede ser un abono parcial.', type: 'error' });\n      return;\n    }"
    );

    source = source.replace(
      'Monto transferido (opcional)',
      'Monto transferido *'
    );

    source = source.replace(
      '<input\n                  type="number" min="0" step="0.01"\n                  value={receiptAmount}',
      '<input\n                  type="number" min="0.01" step="0.01" required\n                  value={receiptAmount}'
    );

    source = source.replace(
      "        amount: receiptAmount ? Number(receiptAmount) : undefined,",
      "        amount: Number(receiptAmount),"
    );

    source = source.replace(
      "                {receiptType === 'cuota_mensual' && receiptPeriods.length > 1 && receiptAmount && (\n                  <p className=\"text-xs text-gray-500 mt-1\">💡 El monto se distribuirá cronológicamente: primero los meses más antiguos.</p>\n                )}",
      "                {receiptType === 'cuota_mensual' && receiptPeriods.length > 1 && receiptAmount && (\n                  <p className=\"text-xs text-gray-500 mt-1\">💡 El monto se distribuirá cronológicamente: primero los meses más antiguos. También se permiten parcialidades.</p>\n                )}\n                {receiptType === 'concepto_adicional' && receiptAmount && (\n                  <p className=\"text-xs text-gray-500 mt-1\">💡 Se aplicará primero a la cuota seleccionada; cualquier sobrante irá a otras cuotas extraordinarias pendientes.</p>\n                )}"
    );
  }
  return source;
});

patch('components/Admin.tsx', source => {
  if (!source.includes('Desglose según filtro activo')) {
    const oldSummary = `            <div className="bg-logia-900 rounded p-3 text-sm space-y-1">
              <p className="text-gray-400">Miembro: <span className="text-white font-bold">{matrixModalUserName}</span></p>
              <p className="text-gray-400">Período: <span className="text-indigo-300 font-bold">{matrixModalPeriod}</span></p>
              <p className="text-gray-400">Cuota mensual: <span className="text-white font-bold">${Number(matrixModalPayment.amount).toFixed(2)}</span></p>
              <p className="text-gray-400">Ya pagado: <span className={\`font-bold ${(matrixModalPayment.paidRegular || 0) > 0 ? 'text-green-400' : 'text-gray-500'}\`}>${Number(matrixModalPayment.paidRegular !== undefined ? matrixModalPayment.paidRegular : matrixModalPayment.paid || 0).toFixed(2)}</span></p>
              <p className="text-gray-400">Estado actual: <span className={\`font-bold ${matrixModalPayment.regularCovered ? 'text-green-400' : 'text-yellow-300'}\`}>{matrixModalPayment.regularCovered ? '✅ Pagado' : '⏳ Pendiente/Parcial'}</span></p>
            </div>`;

    const newSummary = `            <div className="bg-logia-900 rounded p-3 text-sm space-y-2">
              <p className="text-gray-400">Miembro: <span className="text-white font-bold">{matrixModalUserName}</span></p>
              <p className="text-gray-400">Período: <span className="text-indigo-300 font-bold">{matrixModalPeriod}</span></p>
              <p className="text-[10px] uppercase font-bold text-gray-500 pt-1">Desglose según filtro activo</p>
              {matrixFilter !== 'extra' && (() => {
                const regularPaid = Number(matrixModalPayment.paidRegular !== undefined ? matrixModalPayment.paidRegular : matrixModalPayment.paid || 0);
                const regularAmount = Number(matrixModalPayment.amount) || 0;
                const regularDebt = Math.max(0, regularAmount - regularPaid);
                return <div className="rounded border border-indigo-700/40 bg-indigo-900/20 p-2">
                  <div className="flex justify-between gap-2"><span className="text-indigo-200 font-bold">📅 Cuota mensual</span><span className={regularDebt > 0 ? 'text-red-300 font-bold' : 'text-green-300 font-bold'}>{regularDebt > 0 ? `Pendiente ${regularDebt.toFixed(2)}` : '✅ Pagada'}</span></div>
                  <p className="text-xs text-gray-400">Cargo ${regularAmount.toFixed(2)} · Pagado ${regularPaid.toFixed(2)}</p>
                </div>;
              })()}
              {matrixFilter !== 'regular' && (() => {
                const visibleFees = (matrixModalPayment.extraFees || []).filter(fee =>
                  matrixFilter === 'all' || fee.description === matrixExtraDesc
                );
                const legacyMatches = !matrixModalPayment.extraFees?.length && Number(matrixModalPayment.extraAmount || 0) > 0 &&
                  (matrixFilter === 'all' || (matrixModalPayment.extraDescription || 'Cuota Extra') === matrixExtraDesc);
                return <div className="space-y-2">
                  {visibleFees.map(fee => {
                    const debt = fee.forgiven ? 0 : Math.max(0, Number(fee.amount) - Number(fee.paid || 0));
                    return <div key={fee.id} className="rounded border border-purple-700/40 bg-purple-900/20 p-2">
                      <div className="flex justify-between gap-2"><span className="text-purple-200 font-bold">⭐ {fee.description}</span><span className={debt > 0 ? 'text-red-300 font-bold' : 'text-green-300 font-bold'}>{fee.forgiven ? '○ Perdonada' : debt > 0 ? `Pendiente ${debt.toFixed(2)}` : '✅ Pagada'}</span></div>
                      <p className="text-xs text-gray-400">Cargo ${Number(fee.amount).toFixed(2)} · Pagado ${Number(fee.paid || 0).toFixed(2)}</p>
                    </div>;
                  })}
                  {legacyMatches && (() => {
                    const debt = Math.max(0, Number(matrixModalPayment.extraAmount || 0) - Number(matrixModalPayment.paidExtra || 0));
                    return <div className="rounded border border-purple-700/40 bg-purple-900/20 p-2">
                      <div className="flex justify-between gap-2"><span className="text-purple-200 font-bold">⭐ {matrixModalPayment.extraDescription || 'Cuota Extra'}</span><span className={debt > 0 ? 'text-red-300 font-bold' : 'text-green-300 font-bold'}>{debt > 0 ? `Pendiente ${debt.toFixed(2)}` : '✅ Pagada'}</span></div>
                    </div>;
                  })()}
                  {visibleFees.length === 0 && !legacyMatches && <p className="text-xs text-gray-500 rounded border border-logia-700 p-2">Este miembro no tiene una cuota extraordinaria correspondiente al filtro seleccionado.</p>}
                </div>;
              })()}
            </div>`;

    source = source.replace(oldSummary, newSummary);

    source = source.replace(
      'Monto pagado (deja vacío para marcar como pagado completo)',
      `Monto recibido para la cuota mensual${matrixFilter === 'all' ? ' (las cuotas extras se muestran arriba)' : ''}`
    );
  }
  return source;
});

console.log('✓ Matriz detallada y monto obligatorio aplicados');
