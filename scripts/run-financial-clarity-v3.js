import fs from 'node:fs';

const adminPath = 'components/Admin.tsx';
const source = fs.readFileSync(adminPath, 'utf8');

// apply-financial-clarity-v3.js modifica Admin.tsx en sitio. Si un build anterior
// alcanzó a aplicar V3 pero falló después, un segundo npm run build ya no contiene
// los marcadores de la tabla original. En ese caso no debemos volver a aplicar V3.
const v3AlreadyApplied =
  source.includes('getMatrixCellAmountsV3') &&
  source.includes('COMPROBANTES DE CELDA V3') &&
  source.includes('Vista de cada cuadro');

if (v3AlreadyApplied) {
  console.log('✓ Claridad financiera V3 ya estaba aplicada; se omite reaplicación');
} else {
  await import('./apply-financial-clarity-v3.js');
}
