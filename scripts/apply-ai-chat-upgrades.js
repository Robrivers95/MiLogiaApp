import fs from 'node:fs';

const patch = (path, transform) => {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(path, after);
    console.log(`✓ Actualizado ${path}`);
  }
};

patch('components/Admin.tsx', source => {
  if (!source.includes("logia-admin-tab")) {
    source = source.replace(
      "  const [activeTab, setActiveTab] = useState<Tab>('dashboard');",
      "  const [activeTab, setActiveTab] = useState<Tab>('dashboard');\n\n  useEffect(() => {\n    const handleAITab = (event: Event) => {\n      const tab = (event as CustomEvent<{ tab?: Tab }>).detail?.tab;\n      if (tab) {\n        setActiveTab(tab);\n        window.scrollTo({ top: 0, behavior: 'smooth' });\n      }\n    };\n    window.addEventListener('logia-admin-tab', handleAITab);\n    return () => window.removeEventListener('logia-admin-tab', handleAITab);\n  }, []);"
    );
  }
  return source;
});

patch('components/AdminAIAssistant.tsx', source => source
  .replace("String(error.message).includes('10 consultas')", "String(error.message).includes('consultas de IA por hoy')")
  .replace('Máximo 10 consultas de IA al día', 'Máximo 30 consultas de IA al día')
);

patch('functions/src/index.ts', source => {
  source = source.replace(
    "'manual-merge', 'receipts', 'debt-notify', 'member-pending',\n  'broadcast-matrix', 'register-payment'",
    "'manual-merge', 'receipts', 'debt-notify', 'member-pending', 'active-notices', 'active-tasks',\n  'broadcast-matrix', 'register-payment'"
  );

  source = source.replace(
    "        ['member-pending', 'consultar cuánto debe y qué tareas pendientes tiene un miembro'],",
    "        ['member-pending', 'consultar cuánto debe y qué tareas pendientes tiene un miembro'],\n        ['active-notices', 'consultar cuáles avisos están activos o publicados'],\n        ['active-tasks', 'consultar cuáles tareas siguen activas o pendientes'],"
  );

  source = source.replace(/const DAILY_AI_LIMIT = \d+;/, 'const DAILY_AI_LIMIT = 30;');

  if (!source.includes('const DAILY_AI_LIMIT = 30;')) {
    source = source.replace(
      "const isAllowedAction = (value: unknown): value is AllowedAction =>\n  typeof value === 'string' && (ALLOWED_ACTIONS as readonly string[]).includes(value);",
      "const isAllowedAction = (value: unknown): value is AllowedAction =>\n  typeof value === 'string' && (ALLOWED_ACTIONS as readonly string[]).includes(value);\n\nconst DAILY_AI_LIMIT = 30;\n\nconst consumeDailyAIQuery = async (uid: string) => {\n  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());\n  const ref = admin.firestore().doc(`aiUsage/${uid}_${day}`);\n  return admin.firestore().runTransaction(async transaction => {\n    const snap = await transaction.get(ref);\n    const used = Number(snap.data()?.count || 0);\n    if (used >= DAILY_AI_LIMIT) return { allowed: false, used, remaining: 0, limit: DAILY_AI_LIMIT };\n    const next = used + 1;\n    transaction.set(ref, { uid, day, count: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });\n    return { allowed: true, used: next, remaining: DAILY_AI_LIMIT - next, limit: DAILY_AI_LIMIT };\n  });\n};"
    );
  }

  source = source.replace(
    /Ya alcanzaste el límite de \d+ consultas de IA por hoy\./g,
    'Ya alcanzaste el límite de 30 consultas de IA por hoy.'
  );

  if (!source.includes('const rateLimit = await consumeDailyAIQuery(decoded.uid);')) {
    source = source.replace(
      "      const apiKey = process.env.GEMINI_API_KEY;\n      if (!apiKey) throw new Error('GEMINI_API_KEY no está configurada');",
      "      const rateLimit = await consumeDailyAIQuery(decoded.uid);\n      if (!rateLimit.allowed) {\n        res.status(429).json({ error: 'Ya alcanzaste el límite de 30 consultas de IA por hoy. Podrás volver a consultar mañana.', rateLimit });\n        return;\n      }\n\n      const apiKey = process.env.GEMINI_API_KEY;\n      if (!apiKey) throw new Error('GEMINI_API_KEY no está configurada');"
    );

    source = source.replace(
      "      res.status(200).json(result);",
      "      res.status(200).json({ ...result, rateLimit });"
    );
  }

  return source;
});

console.log('✓ Mejoras del chatbot de IA aplicadas');