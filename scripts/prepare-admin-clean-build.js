import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const path = 'components/Admin.tsx';
const source = fs.readFileSync(path, 'utf8');

// Los scripts financieros modifican Admin.tsx durante prebuild. Si un build
// anterior falló después de aplicar esos parches, el siguiente intento no debe
// volver a parchear el archivo ya transformado. Las siguientes marcas solo son
// generadas por nuestros scripts de build, por lo que indican un artefacto de
// una ejecución previa.
const generatedMarkers = [
  'COMPROBANTES DE CELDA V3',
  'getMatrixCellAmountsV3',
  'matrixEvidenceReceiptsV3',
  'data-financial-treasury-v2',
];

const looksGenerated = generatedMarkers.some(marker => source.includes(marker));

if (!looksGenerated) {
  console.log('✓ Admin.tsx parte de una fuente limpia');
  process.exit(0);
}

try {
  const cleanSource = execFileSync(
    'git',
    ['show', 'HEAD:components/Admin.tsx'],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
  );

  if (!cleanSource || cleanSource.length < 1000) {
    throw new Error('git show devolvió un Admin.tsx inesperadamente vacío');
  }

  fs.writeFileSync(path, cleanSource);
  console.log('✓ Admin.tsx restaurado desde HEAD para un build financiero limpio');
} catch (error) {
  console.error('No se pudo restaurar Admin.tsx antes del build:', error);
  process.exit(1);
}
