import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const output = mkdtempSync(join(tmpdir(), 'logia-directory-'));
try {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', 'tests/memberDirectory.test.ts', 'services/memberDirectory.ts', 'components/adminNavigation.ts', 'types.ts', '--module', 'commonjs', '--target', 'es2020', '--esModuleInterop', '--skipLibCheck', '--outDir', output], { stdio: 'inherit' });
  execFileSync(process.execPath, [join(output, 'tests/memberDirectory.test.js')], { stdio: 'inherit' });
} finally { rmSync(output, { recursive: true, force: true }); }
