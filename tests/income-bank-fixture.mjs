export const bankCsv=`INITIAL_BALANCE;CREDITS;DEBITS;FINAL_BALANCE
1,000.00;1,601.25;-100.00;2,501.25

RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE
01-10-2026;Transferencia recibida Juan Pérez;900000000001;800.00;1,800.00
02-10-2026;Ganancias;900000000002;1.25;1,801.25
03-10-2026;Transferencia enviada Proveedor;900000000003;-100.00;1,701.25
04-10-2026;Transferencia recibida Carlos Ríos;900000000004;400.00;2,101.25
04-10-2026;Transferencia recibida Carlos Ríos;900000000005;400.00;2,501.25`;
// Minimal valid PDF for browser extraction and scanned-document fallback tests.
export function makePdf(lines){
 const stream='BT /F1 10 Tf 40 760 Td '+lines.map((line,i)=>(i?'0 -14 Td ':'')+'('+line.replace(/[\\()]/g,'\\$&')+') Tj').join('\n')+' ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
 let pdf='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(pdf);
}
export const bankPdfText=`ESTADO DE SALDOS Y MOVIMIENTOS Mercado Pago
01-10-2026 Transferencia recibida Juan Perez 900000000001 $ 800.00 $ 1,800.00
02-10-2026 Ganancias 90000000000\n2 $ 1.25 $ 1,801.25
03-10-2026 Transferencia enviada Proveedor 900000000003 $ -100.00 $ 1,701.25
04-10-2026 Transferencia recibida Carlos Rios 900000000004 $ 400.00 $ 2,101.25
Transferencia recibida
2/2
Fecha Descripción ID de la
operación Valor Saldo
04-10-2026 Carlos Rios 900000000005 $ 400.00 $ 2,501.25`;
