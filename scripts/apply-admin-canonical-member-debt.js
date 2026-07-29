import fs from 'node:fs';

const path = 'components/Admin.tsx';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes("import { adminAIService } from '../services/adminAI';")) {
  source = source.replace(
    "import { dataService, generateTriviaWithAI, authService, notificationService } from '../services/api';",
    "import { dataService, generateTriviaWithAI, authService, notificationService } from '../services/api';\nimport { adminAIService } from '../services/adminAI';"
  );
}

const legacyBlock = `        const stats: any = {};
        for (const u of data) {
            const s = await dataService.getUserFinancialStats(u.uid, filterStart, filterEnd);
            stats[u.uid] = s;
        }
        setUserStats(stats);`;

const previousCanonicalBlock = `        const statsEntries = await Promise.all(data.map(async u => {
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

const resilientBlock = `        const statsEntries = await Promise.all(data.map(async u => {
            const legacyStats = await dataService.getUserFinancialStats(u.uid, filterStart, filterEnd);
            try {
                const canonicalSummary = await adminAIService.getUserPendingSummary(user.groupId, u);
                const totalDebtRegular = Number(canonicalSummary.regularDebt) || 0;
                const totalDebtExtra = Number(canonicalSummary.extraDebt) || 0;
                return [u.uid, {
                    ...legacyStats,
                    totalDebtRegular,
                    totalDebtExtra,
                    totalDebt: totalDebtRegular + totalDebtExtra,
                }] as const;
            } catch (canonicalError) {
                console.error(\`Error calculando deuda canónica de \${u.name}:\`, canonicalError);
                return [u.uid, legacyStats] as const;
            }
        }));
        setUserStats(Object.fromEntries(statsEntries));`;

if (source.includes(legacyBlock)) {
  source = source.replace(legacyBlock, resilientBlock);
} else if (source.includes(previousCanonicalBlock)) {
  source = source.replace(previousCanonicalBlock, resilientBlock);
} else if (!source.includes('Error calculando deuda canónica de')) {
  throw new Error('No se encontró el bloque de estadísticas de Gestión de Miembros.');
}

source = source.replace(
  '${stats.totalDebt}',
  '${Number(stats.totalDebtRegular || 0) + Number(stats.totalDebtExtra || 0)}'
);

if (!source.includes("${Number(stats.totalDebtRegular || 0) + Number(stats.totalDebtExtra || 0)}")) {
  throw new Error('No se pudo asegurar la celda Deuda Total.');
}

fs.writeFileSync(path, source);
console.log('✓ Columna Deuda Total usa deuda normal + extraordinaria del cálculo canónico');
