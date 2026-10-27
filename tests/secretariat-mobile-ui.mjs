import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";
const people = Array.from({ length: 35 }, (_, i) => ({
  uid: "m" + i,
  name: i === 0 ? "Abraham Moreno" : i === 1 ? "Carlos Ríos" : "Hermano " + i,
  role: "member",
  active: true,
  groupId: "test",
}));
const cloudMock = `export const meetingCloud={members:async()=>${JSON.stringify(people)},present:async()=>['m0','m1'],aiStatus:async()=>true,list:async()=>[],save:async d=>{window.__savedMeeting=d;return 1;},organize:async d=>{window.__summaryCalls=(window.__summaryCalls||0)+1;return {fields:d.fields.filter(f=>!f.manualOnly&&f.origin!=='manual').map(f=>({id:f.id,value:'Resumen actualizado',evidenceIds:d.texts.map(t=>t.id)}))}}};`;
const audioMock = `import {meetingAudio} from ${JSON.stringify(process.cwd() + "/services/meetingLocal.ts")};export const meetingAudioCloud={status:async()=>true,start:async(d,id,progress)=>{const key='job:'+id;if(!sessionStorage.getItem(key)){for(const take of d.takes){const blob=await meetingAudio(d.id,take.id,take.mime);if(!blob.size)throw Error('No audio');}window.__requestedAudioFields=d.fields.length;window.__audioUploads=(window.__audioUploads||0)+d.takes.length;window.__generationCalls=(window.__generationCalls||0)+1;const result={texts:d.takes.map((take,i)=>({id:'text'+i,atMs:take.offsetMs,text:'Texto original del audio '+(i+1),speaker:null,source:'import'})),originalTranscript:d.takes.map((take,i)=>'Texto original del audio '+(i+1)).join('\\n\\n'),fields:d.fields.map(f=>({id:f.id,value:'Resumen de '+f.title,evidenceIds:['text0']}))};sessionStorage.setItem(key,JSON.stringify({state:'done',uid:d.ownerUid,input:{fields:d.fields},result}));}progress(100);if(window.__disconnectOnce){window.__disconnectOnce=false;throw Error("Se perdió la conexión. Reconecta la transcripción.");}return {jobId:id};},watch:(id,receive)=>{const timer=setTimeout(()=>receive(JSON.parse(sessionStorage.getItem('job:'+id))),80);return()=>clearTimeout(timer);}};export const audioFingerprint=d=>JSON.stringify({takes:d.takes,fields:d.fields.map(f=>({id:f.id,title:f.title,instruction:f.instruction}))});`;
await build({
  entryPoints: ["tests/secretariat-mobile-fixture.tsx"],
  outfile: "tests/secretariat-mobile-browser.js",
  bundle: true,
  format: "esm",
  plugins: [
    {
      name: "mobile-services",
      setup(b) {
        b.onResolve(
          { filter: /\/(meetingCloud|meetingAudioCloud|taskCaptureCloud)$/ },
          (args) => ({ path: args.path, namespace: "mock" }),
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
          resolveDir: process.cwd(),
          contents: args.path.endsWith("meetingAudioCloud")
            ? audioMock
            : args.path.endsWith("taskCaptureCloud")
              ? "export const taskCaptureCloud={};"
              : cloudMock,
        }));
      },
    },
  ],
});
writeFileSync(
  "tests/secretariat-mobile-browser.html",
  readFileSync("tests/member-ui.html", "utf8")
    .replace(
      "/tests/member-ui-fixture.tsx",
      "/tests/secretariat-mobile-browser.js",
    )
    .replace(
      "</head>",
      '<link rel="stylesheet" href="/tests/secretariat-mobile-browser.css"></head>',
    ),
);
if (process.env.LOGIA_TEST_BUILD_ONLY) {
  for (const suffix of ["js", "html", "css"])
    rmSync("tests/secretariat-mobile-browser." + suffix, { force: true });
  console.log("Mobile fixture bundle passed.");
  process.exit(0);
}
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5188"],
  { stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(
        "http://127.0.0.1:5188/tests/secretariat-mobile-browser.html",
      );
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
  let allowSummary = true;
  page.on("dialog", (d) => allowSummary ? d.accept() : d.dismiss());
  mkdirSync("test-results", { recursive: true });
  await page.addInitScript(() => {
    const Original = window.MediaRecorder;
    window.MediaRecorder = class extends Original {
      constructor(...args) {
        super(...args);
        window.__nativeRecorder = this;
      }
    };
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
  const url = "http://127.0.0.1:5188/tests/secretariat-mobile-browser.html";
  await page.goto(url);
  await page
    .getByRole("button", { name: "Nueva reunión", exact: true })
    .click();
  const recorder = page.getByRole("region", { name: "Grabadora", exact: true });
  await page.getByLabel("Ver subtítulos en vivo", { exact: false }).check();
  await recorder.getByRole("button", { name: "Grabar", exact: true }).click();
  await recorder
    .getByRole("button", { name: "Terminar audio", exact: true })
    .waitFor();
  await page.waitForFunction(() => window.__speech);
  await page.evaluate(() => {
    const result = Object.assign(
      [{ transcript: "Se escucha bien la reunión" }],
      { isFinal: false },
    );
    window.__speech.onspeechstart();
    window.__speech.onresult({ resultIndex: 0, results: [result] });
  });
  await page
    .getByLabel("Subtítulos en vivo", { exact: true })
    .getByText("Se escucha bien la reunión", { exact: true })
    .waitFor();
  await page.evaluate(() => {
    const result = Object.assign(
      [{ transcript: "Se escucha bien la reunión" }],
      { isFinal: true },
    );
    window.__speech.onresult({ resultIndex: 0, results: [result] });
  });
  await recorder.getByRole("button", { name: /Habla:/ }).click();
  await page
    .getByRole("dialog", { name: "Quién está hablando", exact: true })
    .waitFor();
  assert.ok(
    await page
      .getByRole("dialog")
      .evaluate((e) => e.getBoundingClientRect().height <= innerHeight * 0.81),
  );
  await page.getByRole("button", { name: "Presentes", exact: true }).click();
  await page.getByRole("button", { name: "Carlos Ríos", exact: true }).click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.waitForTimeout(700);
  await recorder.getByRole("button", { name: "Pausar", exact: true }).click();
  await page.waitForFunction(() => window.__nativeRecorder.state === "paused");
  const before = await page
    .getByLabel("Duración de la reunión", { exact: true })
    .textContent();
  await page.waitForTimeout(1100);
  assert.equal(
    await page
      .getByLabel("Duración de la reunión", { exact: true })
      .textContent(),
    before,
  );
  assert.equal(
    await recorder
      .getByRole("button", { name: "Terminar audio", exact: true })
      .isEnabled(),
    true,
  );
  await recorder
    .getByRole("button", { name: "Continuar", exact: true })
    .click();
  await page.waitForFunction(
    () => window.__nativeRecorder.state === "recording",
  );
  await page.waitForTimeout(500);
  await recorder.getByRole("button", { name: "Pausar", exact: true }).click();
  await recorder
    .getByRole("button", { name: "Terminar audio", exact: true })
    .click();
  await recorder
    .getByRole("button", { name: "Grabar otro audio", exact: true })
    .waitFor();
  await recorder
    .getByRole("button", { name: "Grabar otro audio", exact: true })
    .click();
  await recorder
    .getByRole("button", { name: "Terminar audio", exact: true })
    .waitFor();
  await page.waitForTimeout(600);
  await recorder
    .getByRole("button", { name: "Terminar audio", exact: true })
    .click();
  await recorder
    .getByRole("button", { name: "Grabar otro audio", exact: true })
    .waitFor();
  await page.getByText("Audios guardados (2)", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Transcripción completa", {exact:true}).count(), 1);
  assert.equal(await page.getByLabel("Resumen de IA", {exact:true}).inputValue(), "");
  assert.equal(await page.evaluate(() => window.__generationCalls || 0), 0, "recording does not call Gemini");
  assert.equal(await page.evaluate(() => window.__summaryCalls || 0), 0, "recording does not create a summary");

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const box = await recorder
      .getByRole("button", { name: "Grabar otro audio", exact: true })
      .boundingBox();
    assert.ok(
      box.y + box.height < 844 - 64,
      "primary recorder control visible without scrolling " + width,
    );
    await page.screenshot({
      path: "test-results/secretariat-mobile-" + width + ".png",
      fullPage: true,
    });
  }
  await page.getByText("Audios guardados (2)", { exact: true }).click();
  await page
    .getByRole("link", { name: "Descargar audio 1", exact: true })
    .waitFor();
  const pendingDownload = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Descargar audio 2", exact: true })
    .click();
  const download = await pendingDownload;
  assert.ok(
    readFileSync(await download.path()).length > 100,
    "second audio is a real independently downloadable recording",
  );
  assert.equal(await page.getByRole("button", {name:"Resumir con IA",exact:true}).isDisabled(), true);
  await page.getByText("Primero pulsa Terminar tenida.", {exact:false}).waitFor();
  await page.getByRole("button", {name:"Terminar tenida",exact:true}).click();
  await page.getByText("Tenida terminada", {exact:true}).waitFor();
  await page.getByText("Falta transcribir los audios.", {exact:false}).waitFor();
  assert.equal(await page.evaluate(() => window.__summaryCalls || 0), 0);
  await page.evaluate(() => {window.__disconnectOnce=true;});
  await page
    .getByRole("button", { name: "Transcribir audios", exact: true })
    .click();
  await page.getByRole("alert").filter({hasText:"Se perdió la conexión"}).waitFor();
  await page.getByRole("button", {name:"Reconectar transcripción",exact:true}).click();

  await page
    .getByText("Transcripción completa guardada.", {
      exact: false,
    })
    .waitFor();
  assert.equal(await page.evaluate(() => window.__generationCalls), 1);
  assert.equal(await page.evaluate(() => window.__audioUploads), 2);
  assert.equal(await page.evaluate(() => window.__requestedAudioFields), 0, "audio transcription does not request a summary");
  assert.equal(await page.evaluate(() => window.__summaryCalls || 0), 0);
  assert.equal(await page.getByLabel("Resumen de IA", {exact:true}).inputValue(), "");
  assert.match(await page.getByLabel("Transcripción completa", {exact:true}).inputValue(), /audio 1[\s\S]*audio 2/);
  allowSummary = false;
  await page.getByRole("button", {name:"Resumir con IA",exact:true}).click();
  assert.equal(await page.evaluate(() => window.__summaryCalls || 0), 0, "canceling end-of-meeting confirmation never calls IA");
  allowSummary = true;
  await page.getByRole("button", {name:"Resumir con IA",exact:true}).click();
  await page.getByText("Resumen de IA guardado.", {exact:false}).waitFor();
  assert.equal(await page.evaluate(() => window.__summaryCalls), 1);
  assert.equal(await page.evaluate(() => window.__generationCalls), 1, "summary uses text without reprocessing audio");
  assert.match(await page.getByLabel("Resumen de IA", {exact:true}).inputValue(), /Resumen actualizado/);
  await page.getByRole("button", {name:"Revisar acta y tareas",exact:true}).click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page
    .getByLabel("Editar Trazados expuestos", { exact: true })
    .fill("Informe corregido a mano");
  await page
    .getByRole("navigation", { name: "Pasos de secretaría" })
    .getByRole("button", { name: "Transcripción", exact: true })
    .click();
  assert.match(await page.getByLabel("Transcripción completa", {exact:true}).inputValue(), /Texto original del audio 1/);
  assert.equal(await page.getByLabel("Transcripción completa", {exact:true}).evaluate(e=>e.readOnly), true);
  assert.match(await page.getByLabel("Resumen de IA", {exact:true}).inputValue(), /Informe corregido a mano/);
  assert.doesNotMatch(await page.getByLabel("Transcripción completa", {exact:true}).inputValue(), /Informe corregido a mano/);
  const transcriptDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar", exact: true }).click();
  assert.match(
    readFileSync(await (await transcriptDownload).path(), "utf8"),
    /audio 1[\s\S]*audio 2/,
  );
  await page.waitForTimeout(500);
  await page.reload();
  await page
    .getByRole("navigation", { name: "Pasos de secretaría" })
    .getByRole("button", { name: "Acta y tareas", exact: true })
    .click();
  await page.getByText("Informe corregido a mano", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.__generationCalls || 0),
    0,
    "reload uses the stored result without another generation",
  );
  await page
    .getByRole("navigation", { name: "Pasos de secretaría" })
    .getByRole("button", { name: "Grabar", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", {
        name: "Audios transcritos",
        exact: true,
      })
      .isDisabled(),
    true,
  );
  assert.equal(await recorder.getByRole("button", {name:"Grabar otro audio",exact:true}).isDisabled(), true, "finished meeting remains finished after reload");
  await recorder.getByRole("button", {name:"Continuar tenida",exact:true}).click();
  await page.getByText("Tenida en curso. Puedes grabar otro audio sin perder los anteriores.", {exact:true}).waitFor();
  assert.equal(
    await recorder
      .getByRole("button", { name: "Grabar otro audio", exact: true })
      .isEnabled(),
    true,
  );
  await recorder.getByRole("button", {name:"Grabar otro audio",exact:true}).click();
  await recorder.getByRole("button", {name:"Terminar audio",exact:true}).waitFor();
  await page.waitForTimeout(400);
  await recorder.getByRole("button", {name:"Pausar",exact:true}).click();
  await recorder.getByRole("button", {name:"Terminar tenida",exact:true}).click();
  await recorder.getByRole("button", {name:"Grabar otro audio",exact:true}).waitFor();
  assert.equal(await page.getByRole("button", {name:"Resumir con IA",exact:true}).isDisabled(), true, "new untranscribed audio must be included before another summary");
  assert.match(await page.getByLabel("Resumen de IA", {exact:true}).inputValue(), /Informe corregido a mano/, "previous acta survives extra audio");
  assert.equal(await page.evaluate(() => window.__summaryCalls || 0), 0);
  assert.equal(await page.evaluate(() => window.__generationCalls || 0), 0);
  await page.getByText("Tenida terminada", {exact:true}).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Compact secretary browser passed: visible mobile controls, real native pause/resume and finish while paused, second audio preserved/downloadable, live interim captions, present-member picker, transcription-only multi-audio generation, explicit persisted meeting end (including paused recording), exact request reconnect after lost response, confirmed text-only summary, two visible read-only text boxes and editable acta, durable reload without another model call and 320/390/1440 widths.",
  );
} finally {
  await browser?.close();
  server.kill();
  for (const suffix of ["js", "html", "css"])
    rmSync("tests/secretariat-mobile-browser." + suffix, { force: true });
}
