import fs from 'node:fs';

const path = 'scripts/apply-financial-clarity-v3.js';
let source = fs.readFileSync(path, 'utf8');

const brokenAlt = "alt={`Comprobante ${'${index + 1}'}`}";
const safeAlt = "alt={'Comprobante ' + (index + 1)}";

if (source.includes(brokenAlt)) {
  source = source.replaceAll(brokenAlt, safeAlt);
  fs.writeFileSync(path, source);
  console.log('✓ Sintaxis V3 reparada antes de ejecutar el parche');
} else if (source.includes(safeAlt)) {
  console.log('✓ Sintaxis V3 ya estaba reparada');
} else {
  throw new Error('No se encontró el patrón esperado del alt de comprobante en V3');
}
