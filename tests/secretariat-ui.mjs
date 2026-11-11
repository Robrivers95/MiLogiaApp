import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";
const mock = `export const meetingCloud={aiStatus:async()=>!location.search.includes('ai-disabled'),members:async()=>Array.from({length:35},(_,i)=>({uid:'m'+i,name:i===0?'Abraham Moreno':i===1?'Carlos Ríos':'Hermano '+i,active:true,groupId:'test',role:'member'})),present:async()=>['m0','m1'],list:async()=>[],save:async()=>1,organize:async(d)=>{if(location.search.includes('ai-unavailable'))throw Error('Conexión de IA no configurada');window.__analyses=(window.__analyses||0)+1;window.__analysisText=JSON.stringify(d.texts);return {fields:d.fields.filter(f=>!f.manualOnly&&f.origin!=='manual').map(f=>({id:f.id,value:'Borrador de '+f.title,evidenceIds:d.texts.length?[d.texts[0].id]:[]}))};}};`;
await build({
  entryPoints: ["tests/secretariat-fixture.tsx"],
  outfile: "tests/secretariat-browser.js",
  bundle: true,
  format: "esm",
  plugins: [
    {
      name: "isolated-meeting-cloud",
      setup(b) {
        b.onResolve({ filter: /\/(meetingCloud|taskCaptureCloud)$/ }, (args) => ({
          path: args.path,
          namespace: "mock",
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
          contents: args.path.endsWith("taskCaptureCloud") ? "export const taskCaptureCloud={};" : mock,
        }));
      },
    },
  ],
});
writeFileSync(
  "tests/secretariat-browser.html",
  readFileSync("tests/member-ui.html", "utf8")
    .replace("/tests/member-ui-fixture.tsx", "/tests/secretariat-browser.js")
    .replace("<body>", '<body class="temple-shell">')
    .replace(
      "</head>",
      '<link rel="stylesheet" href="/tests/secretariat-browser.css"></head>',
    ),
);
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5186"],
  { stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch("http://127.0.0.1:5186/tests/secretariat-browser.html");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  mkdirSync("test-results", { recursive: true });
  await page.addInitScript(() => {
    window.SpeechRecognition = class {
      start() {
        window.__speech = this;
      }
      stop() {
        this.onend?.();
      }
      abort() {}
    };
  });
  const url = "http://127.0.0.1:5186/tests/secretariat-browser.html";
  await page.goto(url);
  await page.getByRole("button", { name: "Nueva tenida", exact: true }).click();
  await page
    .getByLabel("Título de la tenida", { exact: true })
    .fill("Tenida de prueba");
  await page
    .getByRole("button", { name: "Tomar presentes de Asistencia" })
    .click();
  await page
    .getByRole("button", { name: "Abraham Moreno", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Hermano 2", exact: true }).count(),
    0,
  );
  await page
    .getByRole("button", { name: "Abraham Moreno", exact: true })
    .click();
  await page.getByLabel("Transcribir con el navegador mientras grabo").check();
  await page.getByRole("button", { name: "Grabar audio", exact: true }).click();
  await page.getByText("Grabando", { exact: true }).waitFor();
  await page.waitForFunction(() => window.__speech);
  await page.evaluate(() => {
    window.__speech.onspeechstart();
    window.__speech.onresult({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: "Exposición de la virtud." }], {
          isFinal: false,
        }),
      ],
    });
  });
  await page.getByRole("button", { name: "Carlos Ríos", exact: true }).click();
  await page.evaluate(() =>
    window.__speech.onresult({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: "Exposición de la virtud." }], {
          isFinal: true,
        }),
      ],
    }),
  );
  assert.equal(
    await page.evaluate(() =>
      window.dispatchEvent(
        new Event("logia-before-navigate", { cancelable: true }),
      ),
    ),
    false,
  );
  await page
    .getByRole("alert")
    .filter({ hasText: "Pausa o termina" })
    .waitFor();
  await page.screenshot({
    path: "test-results/secretariat-recorder-390.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Transcripción", exact: true }).click();
  assert.equal(
    await page
      .getByLabel("Hablante de intervención 1", { exact: true })
      .inputValue(),
    "m0",
    "late final dictation retains original speaker",
  );
  await page.getByRole("tab", { name: "Grabar y turnos", exact: true }).click();
  await page.getByRole("button", { name: "Pausar y guardar tramo" }).click();
  await page.getByText("Audio detenido", { exact: true }).waitFor();
  await page
    .getByText("Guardado en este dispositivo", { exact: false })
    .first()
    .waitFor();
  const audioDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar audio", exact: true })
    .click();
  const audio = await audioDownload;
  assert.ok(
    statSync(await audio.path()).size > 100,
    "real browser MediaRecorder audio persisted in IndexedDB",
  );
  await page.reload();
  await page.getByText(/Mis borradores/).click();
  await page
    .getByRole("button", { name: /^\d{4}-\d{2}-\d{2} · Tenida de prueba$/ })
    .click();
  assert.equal(
    await page.getByLabel("Título de la tenida", { exact: true }).inputValue(),
    "Tenida de prueba",
  );
  await page.getByRole("tab", { name: "Transcripción", exact: true }).click();
  assert.equal(
    await page
      .getByLabel("Hablante de intervención 1", { exact: true })
      .inputValue(),
    "m0",
  );
  await page
    .getByLabel("Pegar transcripción", { exact: true })
    .fill(
      "Carlos propone organizar una visita.\n\nAbraham acepta coordinarla el viernes.",
    );
  await page
    .getByRole("button", { name: "Añadir texto a la transcripción" })
    .click();
  assert.equal(
    await page
      .getByLabel("Hablante de intervención 2", { exact: true })
      .inputValue(),
    "",
  );
  await page
    .getByLabel("Hablante de intervención 2", { exact: true })
    .selectOption("m1");
  await page.getByRole("tab", { name: "Formato y acta", exact: true }).click();
  await page.getByRole("button", { name: "Añadir punto al formato" }).click();
  await page
    .getByLabel("Título del campo 6", { exact: true })
    .fill("Observaciones del secretario");
  await page
    .getByLabel("Contenido del campo 6", { exact: true })
    .fill("Texto manual que se conserva.");
  await page.getByLabel("Solo llenado manual", { exact: true }).last().check();
  await page.getByRole("button", { name: "Organizar texto con IA" }).click();
  await page.getByText(/Borrador de IA listo/).waitFor();
  assert.equal(
    await page
      .getByLabel("Contenido del campo 6", { exact: true })
      .inputValue(),
    "Texto manual que se conserva.",
  );
  assert.equal(
    await page
      .getByLabel("Contenido del campo 1", { exact: true })
      .inputValue(),
    "Borrador de Trazados expuestos",
  );
  await page
    .getByLabel("Contenido del campo 1", { exact: true })
    .fill("Título corregido por el secretario.");
  await page.getByRole("button", { name: "Organizar texto con IA" }).click();
  await page.waitForFunction(() => window.__analyses === 2);
  assert.equal(
    await page
      .getByLabel("Contenido del campo 1", { exact: true })
      .inputValue(),
    "Título corregido por el secretario.",
  );
  await page.getByLabel("Revisé los nombres, intervenciones").check();
  await page.getByRole("button", { name: "Marcar acta revisada" }).click();
  await page.getByText(/Acta marcada como revisada/).waitFor();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar respaldo editable" })
    .click();
  const file = await download;
  const backup = JSON.parse(readFileSync(await file.path(), "utf8"));
  assert.equal(backup.fields[5].value, "Texto manual que se conserva.");
  assert.equal(backup.texts[0].speaker.name, "Abraham Moreno");
  assert.ok(backup.reviewedAt);
  assert.ok(backup.durationMs > 0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `secretary editor fits ${width}`,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/secretariat-${width}.png` });
  }
  if (
    !(await page
      .getByLabel("Restaurar respaldo de acta", { exact: true })
      .isVisible())
  )
    await page.getByText(/Mis borradores/).click();
  await page
    .getByLabel("Restaurar respaldo de acta", { exact: true })
    .setInputFiles({
      name: "acta.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await page.getByText(/Se restauró una copia/).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Descargar audio", exact: true })
      .count(),
    0,
    "restoring text never fabricates audio files",
  );
  await page.goto(url + "?suspended=1");
  assert.equal(
    await page
      .getByRole("button", { name: "Nueva tenida", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByText(/Mis borradores/).click();
  await page
    .getByRole("button", { name: /^\d{4}-\d{2}-\d{2} · Tenida de prueba$/ })
    .first()
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Descargar respaldo editable" })
      .isEnabled(),
    true,
    "read-only mode permits safety exports",
  );
  await page.goto(url + "?ai-unavailable");
  await page.getByRole("button", { name: "Nueva tenida", exact: true }).click();
  await page.getByRole("tab", { name: "Transcripción", exact: true }).click();
  await page
    .getByLabel("Pegar transcripción", { exact: true })
    .fill("Propuesta que todavía no es un acuerdo.");
  await page
    .getByRole("button", { name: "Añadir texto a la transcripción" })
    .click();
  await page.getByRole("tab", { name: "Formato y acta", exact: true }).click();
  await page.getByRole("button", { name: "Organizar texto con IA" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Conexión de IA no configurada" })
    .waitFor();
  assert.ok(
    (
      await page
        .getByLabel("Solicitud de análisis para IA", { exact: true })
        .inputValue()
    ).includes("Propuesta que todavía no es un acuerdo."),
  );
  assert.equal(
    await page
      .getByLabel("Contenido del campo 1", { exact: true })
      .inputValue(),
    "",
    "missing backend never fabricates an acta",
  );
  await page.goto(url + "?ai-disabled");
  await page.getByRole("button", { name: "Nueva tenida", exact: true }).click();
  await page.getByRole("tab", { name: "Formato y acta", exact: true }).click();
  await page
    .getByText(/La organización automática de actas está pendiente/)
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Organizar texto con IA", exact: true })
      .isDisabled(),
    true,
  );
  await page.goto(url + "?owner=another-secretary");
  await page.getByRole("button", { name: "Nueva tenida" }).waitFor();
  assert.match(
    await page.getByText(/Mis borradores/).textContent(),
    /\(0\)/,
    "local drafts are isolated by account",
  );
  await page.goto(url + "?denied=1");
  await page.getByText(/Este apartado requiere autorización/).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Nueva tenida" }).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Secretariat UI passed: real microphone/MediaRecorder audio saved and downloaded, late speaker attribution, navigation guard, IndexedDB reload, attendance filter, modular extraction/manual protection, review and backup restore, account isolation and 1440/390/320 layouts.",
  );
} finally {
  await browser?.close();
  server.kill();
  for (const f of [
    "tests/secretariat-browser.js",
    "tests/secretariat-browser.css",
    "tests/secretariat-browser.html",
  ])
    rmSync(f, { force: true });
}
