import fs from 'node:fs';

const path = 'components/Admin.tsx';
let source = fs.readFileSync(path, 'utf8');

// -----------------------------------------------------------------------------
// MATRIZ: un parche anterior envuelve la tabla original en
// {matrixViewMode === 'status' && (...)}. V3 reemplaza todo el contenido hasta
// la leyenda, por lo que puede quedar el opener huérfano. La tabla V3 ya decide
// internamente qué mostrar en cada celda, así que ese wrapper debe desaparecer.
// -----------------------------------------------------------------------------
const orphanStatusWrapper = "                    {matrixViewMode === 'status' && (\n                    <div className=\"overflow-x-auto\">\n                      <table className=\"w-full text-xs border-collapse\">";
const directV3Table = "                    <div className=\"overflow-x-auto\">\n                      <table className=\"w-full text-xs border-collapse\">";

if (source.includes(orphanStatusWrapper)) {
  source = source.replace(orphanStatusWrapper, directV3Table);
  console.log('✓ V3-FIX: wrapper huérfano de Matriz eliminado');
}

// V3 se creó inicialmente con un estado propio. Reutilizar el selector canónico
// matrixViewMode que ya aporta el centro de conciliación evita dos selectores.
source = source.replace(
  "  const [matrixViewModeV3, setMatrixViewModeV3] = useState<'status' | 'amount' | 'detail'>('status');\n",
  ''
);
source = source.replaceAll('matrixViewModeV3', 'matrixViewMode');
source = source.replaceAll('setMatrixViewModeV3', 'setMatrixViewMode');

// Eliminar únicamente el panel duplicado "Vista de cada cuadro" de V3. El panel
// previo "Vista de la matriz" permanece y controla las mismas tres vistas.
const duplicateViewLabel = '<span className="text-xs font-bold uppercase text-gray-400 mr-1">Vista de cada cuadro</span>';
const duplicateLabelIndex = source.indexOf(duplicateViewLabel);
if (duplicateLabelIndex >= 0) {
  const duplicateStart = source.lastIndexOf('                    <div className="mb-4 rounded-lg border border-logia-700 bg-logia-900/60 p-3">', duplicateLabelIndex);
  const duplicateEndMarker = '                    {/* ── PANEL: Cuota Extra Masiva ── */}';
  const duplicateEnd = source.indexOf(duplicateEndMarker, duplicateLabelIndex);
  if (duplicateStart >= 0 && duplicateEnd > duplicateStart) {
    source = source.slice(0, duplicateStart) + source.slice(duplicateEnd);
    console.log('✓ V3-FIX: selector duplicado de vista eliminado');
  }
}

// -----------------------------------------------------------------------------
// TESORERÍA: normalizar un cierre duplicado que puede quedar al sustituir la
// tarjeta del historial. No toca datos ni lógica, únicamente estructura JSX.
// -----------------------------------------------------------------------------
const banksMarker = '        {/* --- BANKS TAB (BANCOS Y EFECTIVO) --- */}';
const banksIndex = source.indexOf(banksMarker);
if (banksIndex < 0) throw new Error('V3-FIX: no se encontró la sección Bancos');

const beforeBanks = source.slice(0, banksIndex);
const tail = source.slice(banksIndex);
const duplicate = '                </div>\n                </div>\n            </div>\n        )}\n\n';
const corrected = '                </div>\n            </div>\n        )}\n\n';

const lastDuplicate = beforeBanks.lastIndexOf(duplicate);
if (lastDuplicate >= 0) {
  source = beforeBanks.slice(0, lastDuplicate) + corrected + beforeBanks.slice(lastDuplicate + duplicate.length) + tail;
  console.log('✓ V3-FIX: cierre duplicado de Tesorería eliminado');
}

// Validaciones estructurales mínimas para no reportar éxito si queda el patrón
// que provocó el fallo de esbuild.
if (source.includes(orphanStatusWrapper)) {
  throw new Error('V3-FIX: todavía existe el wrapper huérfano de Matriz');
}
if (!source.includes('Vista de la matriz') && !source.includes('Vista de celdas')) {
  throw new Error('V3-FIX: no quedó un selector visible de vista para la Matriz');
}

fs.writeFileSync(path, source);
console.log('✓ Validación V3: Matriz y Tesorería normalizadas para build');
