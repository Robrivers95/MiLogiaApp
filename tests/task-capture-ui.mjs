import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";
const captureMock = `
const members=[{uid:'member',name:'Abraham Moreno',active:true,groupId:'lodge'},{uid:'carlos',name:'Carlos Ríos',active:true,groupId:'lodge'}];
const saved=()=>JSON.parse(sessionStorage.getItem('__saved')||'[]');
export const taskCaptureCloud={status:async()=>!location.search.includes('ai-disabled'),members:async()=>members,tasks:async()=>saved(),analyze:async(_g,text,date,mode)=>{window.__analyses=(window.__analyses||0)+1;return mode==='finance'?{finance:{type:'income',amount:500,date:'2026-10-27',memberId:'member',paymentMethod:'cash',notes:'Cuota septiembre 2026'}}:{tasks:[{id:'proposal-1',title:'Organizar visita',description:'Confirmar el lugar',kind:'commitment',dueDate:'2026-11-15',assigneeIds:['member'],assignmentMode:'individual',sourceQuote:text}]};},confirm:async(_g,requestId,tasks)=>{window.__confirmedPayload={requestId,tasks};const receipts=JSON.parse(sessionStorage.getItem('__receipts')||'{}');if(receipts[requestId])return receipts[requestId];const result={taskIds:tasks.map(t=>t.id)};sessionStorage.setItem('__saved',JSON.stringify([...saved(),...tasks.map(t=>({id:t.id,title:t.title,description:t.description,assignedTo:t.assigneeIds[0],assignedToName:members.find(m=>m.uid===t.assigneeIds[0])?.name,createdBy:'member',createdAt:new Date().toISOString(),completed:false,dueDate:t.dueDate}))]));receipts[requestId]=result;sessionStorage.setItem('__receipts',JSON.stringify(receipts));await new Promise(r=>setTimeout(r,100));if(location.search.includes('uncertain')&&!sessionStorage.getItem('__uncertain')){sessionStorage.setItem('__uncertain','1');const error=Error('Respuesta interrumpida');error.code='functions/unavailable';throw error;}return result;},complete:async(_g,id,completed)=>{window.__completed=(window.__completed||0)+1;sessionStorage.setItem('__saved',JSON.stringify(saved().map(t=>t.id===id?{...t,completed}:t)));}};
`;
const financeMock = `export const quickFinanceService={options:async()=>({members:[{uid:'member',name:'Abraham Moreno'},{uid:'carlos',name:'Carlos Ríos'}],accounts:[]}),list:async()=>[],save:async(_g,_id,input)=>{window.__moneySaves=(window.__moneySaves||0)+1;window.__moneyPayload=input;},payments:async()=>[]};`;
await build({
  entryPoints: ["tests/task-capture-fixture.tsx"],
  outfile: "tests/task-capture-browser.js",
  bundle: true,
  format: "esm",
  plugins: [
    {
      name: "capture-service-mocks",
      setup(b) {
        b.onResolve(
          { filter: /\/(taskCaptureCloud|quickFinanceApi)$/ },
          (args) => ({ path: args.path, namespace: "mock" }),
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
          contents: args.path.endsWith("taskCaptureCloud")
            ? captureMock
            : financeMock,
        }));
      },
    },
  ],
});
writeFileSync(
  "tests/task-capture-browser.html",
  readFileSync("tests/member-ui.html", "utf8")
    .replace("/tests/member-ui-fixture.tsx", "/tests/task-capture-browser.js")
    .replace(
      "</head>",
      '<link rel="stylesheet" href="/tests/task-capture-browser.css"></head>',
    ),
);
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5187"],
  { stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch("http://127.0.0.1:5187/tests/task-capture-browser.html");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  mkdirSync("test-results", { recursive: true });
  const url = "http://127.0.0.1:5187/tests/task-capture-browser.html";
  const reset = async (query = "") => {
    await page.goto(url + query);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page
      .getByRole("heading", { name: "Captura por texto y tareas", exact: true })
      .waitFor();
  };
  const prepare = async () => {
    await page
      .getByLabel("Texto para interpretar", { exact: true })
      .fill("Abraham confirmará el lugar de la visita.");
    await page
      .getByRole("button", { name: "Interpretar con IA", exact: true })
      .click();
    await page.getByLabel("Título 1", { exact: true }).waitFor();
  };
  await reset();
  await prepare();
  assert.equal(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("__saved") || "[]").length,
    ),
    0,
    "analysis does not create tasks",
  );
  const confirm = page.getByRole("button", {
      name: "Confirmar y crear tareas",
      exact: true,
    }),
    review = page.getByLabel("Revisé las tareas seleccionadas", {
      exact: false,
    });
  assert.equal(await confirm.isDisabled(), true);
  await page
    .getByRole("group", { name: "Responsables 1", exact: true })
    .getByLabel("Abraham Moreno", { exact: true })
    .uncheck();
  await page
    .getByRole("group", { name: "Responsables 1", exact: true })
    .getByLabel("Carlos Ríos", { exact: true })
    .check();
  await page.getByLabel("Título 1", { exact: true }).fill("Visita corregida");
  await review.check();
  await page
    .getByLabel("Descripción 1", { exact: true })
    .fill("Llevar lista adicional");
  assert.equal(await review.isChecked(), false, "editing invalidates approval");
  assert.equal(await confirm.isDisabled(), true);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({
      path: "test-results/task-capture-" + width + ".png",
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "no horizontal overflow " + width,
    );
  }
  await review.check();
  await confirm.evaluate((button) => {
    button.click();
    button.click();
  });
  await page.getByText(/1 tarea\(s\) guardada/).waitFor();
  const payload = await page.evaluate(() => window.__confirmedPayload.tasks[0]);
  assert.equal(payload.title, "Visita corregida");
  assert.equal(payload.description, "Llevar lista adicional");
  assert.deepEqual(payload.assigneeIds, ["carlos"]);
  assert.equal(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("__saved")).length,
    ),
    1,
  );
  await page
    .getByRole("button", { name: "Marcar completada", exact: true })
    .click();
  assert.equal(await page.evaluate(() => window.__completed || 0), 0);
  await page
    .getByRole("button", { name: "Confirmar cambio", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reabrir tarea", exact: true })
    .waitFor();
  assert.equal(await page.evaluate(() => window.__completed), 1);
  await reset("?uncertain");
  await prepare();
  await review.check();
  await confirm.click();
  await page
    .getByRole("button", {
      name: "Reintentar la misma confirmación",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByLabel("Título 1", { exact: true }).isDisabled(),
    true,
  );
  await page.reload();
  await page
    .getByRole("button", {
      name: "Reintentar la misma confirmación",
      exact: true,
    })
    .click();
  await page.getByText(/1 tarea\(s\) guardada/).waitFor();
  assert.equal(
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("__saved")).length,
    ),
    1,
    "retry after committed response loss/reload never duplicates",
  );
  await reset("?ai-disabled");
  await page.getByText(/IA pendiente de publicación/).waitFor();
  await page
    .getByRole("button", { name: "Añadir tarea manual", exact: true })
    .click();
  await page.getByLabel("Título 1", { exact: true }).fill("Tarea manual");
  await page
    .getByRole("group", { name: "Responsables 1", exact: true })
    .getByLabel("Abraham Moreno", { exact: true })
    .check();
  await review.check();
  await confirm.click();
  await page.getByText(/1 tarea\(s\) guardada/).waitFor();
  assert.equal(await page.evaluate(() => window.__analyses || 0), 0);
  await reset("?role=admin");
  await page
    .getByLabel("Qué quieres preparar", { exact: true })
    .selectOption("finance");
  await page
    .getByLabel("Texto para interpretar", { exact: true })
    .fill("Juan abonó 500 para septiembre.");
  await page
    .getByRole("button", { name: "Interpretar con IA", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Captura rápida",
    exact: true,
  });
  await dialog.waitFor();
  assert.equal(await page.evaluate(() => window.__moneySaves || 0), 0);
  const moneyConfirm = page.getByRole("button", {
    name: "Confirmar y guardar captura",
    exact: true,
  });
  assert.equal(await moneyConfirm.isDisabled(), true);
  await page.getByLabel("Monto", { exact: true }).fill("650");
  await page
    .getByLabel("Miembro opcional", { exact: true })
    .selectOption("carlos");
  await page.getByLabel("Revisé y confirmo el monto", { exact: false }).check();
  await moneyConfirm.click();
  await page.getByText(/Captura guardada/).waitFor();
  assert.equal(await page.evaluate(() => window.__moneySaves), 1);
  assert.equal(await page.evaluate(() => window.__moneyPayload.amount), 650);
  assert.equal(
    await page.evaluate(() => window.__moneyPayload.memberId),
    "carlos",
  );
  await page.keyboard.press("Escape");
  await reset("?suspended");
  assert.equal(
    await page
      .getByRole("button", { name: "Añadir tarea manual", exact: true })
      .isDisabled(),
    true,
  );
  await reset("?role=viewer");
  await page
    .getByText("Este apartado requiere una cuenta activa de la logia.")
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Interpretar con IA", exact: true })
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser capture passed: no writes before approval, editable assignees/details, approval reset, double click protection, durable retry, manual fallback, task completion confirmation, reviewed finance handoff, role/suspension gates and 320/390/1440 widths.",
  );
} finally {
  await browser?.close();
  server.kill();
  for (const suffix of ["js", "html", "css"])
    rmSync("tests/task-capture-browser." + suffix, { force: true });
}
