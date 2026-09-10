import fs from 'node:fs';

const path = 'components/Admin.tsx';
let source = fs.readFileSync(path, 'utf8');

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
}

fs.writeFileSync(path, source);
console.log('✓ Validación V3: estructura JSX de Tesorería normalizada');
