import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const output = mkdtempSync(join(tmpdir(), 'logia-accounting-'));
try {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', 'tests/paymentAccounting.test.ts', 'tests/paymentMovementAccounting.test.ts', 'services/paymentAccounting.ts', 'services/paymentMovementAccounting.ts', 'types.ts', '--module', 'commonjs', '--target', 'es2020', '--esModuleInterop', '--skipLibCheck', '--outDir', output], { stdio: 'inherit' });
  execFileSync(process.execPath, [join(output, 'tests/paymentAccounting.test.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [join(output, 'tests/paymentMovementAccounting.test.js')], { stdio: 'inherit' });
} finally { rmSync(output, { recursive: true, force: true }); }
