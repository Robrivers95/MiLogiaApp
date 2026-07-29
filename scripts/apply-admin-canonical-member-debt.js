import fs from 'node:fs';

const path = 'components/Admin.tsx';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes("import { adminAIService } from '../services/adminAI';")) {
  source = source.replace(
    "import { dataService, generateTriviaWithAI, authService, notificationService } from '../services/api';",
    "import { dataService, generateTriviaWithAI, authService, notificationService } from '../services/api';\nimport { adminAIService } from '../services/adminAI';"
  );
}

const oldBlock = `        const stats: any = {};
        for (const u of data) {
            const s = await dataService.getUserFinancialStats(u.uid, filterStart, filterEnd);
            stats[u.uid] = s;
        }
        setUserStats(stats);`;

const newBlock = `        const statsEntries = await Promise.all(data.map(async u => {
            const [legacyStats, canonicalSummary] = await Promise.all([
                dataService.getUserFinancialStats(u.uid, filterStart, filterEnd),
                adminAIService.getUserPendingSummary(user.groupId, u),
            ]);
            const canonicalRegularDebt = canonicalSummary.regularDebt;
            const canonicalExtraDebt = canonicalSummary.extraDebt;
            return [u.uid, {
                ...legacyStats,
                totalDebtRegular: canonicalRegularDebt,
                totalDebtExtra: canonicalExtraDebt,
                totalDebt: canonicalRegularDebt + canonicalExtraDebt,
            }] as const;
        }));
        setUserStats(Object.fromEntries(statsEntries));`;

if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
} else if (!source.includes('canonicalSummary.regularDebt')) {
  throw new Error('No se encontró el bloque de estadísticas de Gestión de Miembros.');
}

fs.writeFileSync(path, source);
console.log('✓ Gestión de Miembros usa el mismo adeudo canónico que la IA');
