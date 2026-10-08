import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
const {chromium}=await import(process.env.LOGIA_PLAYWRIGHT_MODULE || 'playwright');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5181'],{stdio:'ignore'});let browser;
try {
  for(let attempt=0;attempt<100;attempt++){try{await fetch('http://127.0.0.1:5181/tests/quick-finance.html');break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
  browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));mkdirSync('test-results',{recursive:true});
  for(const role of ['admin','master'])for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:844});await page.goto(`http://127.0.0.1:5181/tests/quick-finance.html?role=${role}`);
    await page.getByRole('button',{name:'Captura rápida de dinero',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Captura rápida',exact:true});await dialog.waitFor();
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('[role="dialog"]')).position!=='static' || getComputedStyle(document.querySelector('[role="dialog"]').parentElement).position==='fixed');
    await page.getByLabel('Monto',{exact:true}).fill('125.50');await page.getByLabel('Fecha',{exact:true}).fill('2026-09-15');await page.getByLabel('Nota opcional',{exact:true}).fill('Material de prueba');
    await page.getByLabel('Cuenta o caja opcional',{exact:true}).selectOption('cash');
    await page.getByLabel('Foto de cámara o galería (opcional)',{exact:true}).setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')});
    assert.ok(await dialog.evaluate(element=>element.scrollWidth<=innerWidth),`capture fits ${width}`);
    await page.getByRole('button',{name:'Guardar pendiente',exact:true}).click();await page.getByText('Captura guardada.',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>window.__saves),1);
    await page.getByRole('button',{name:/Gasto.*Material de prueba/}).click();
    await page.getByLabel('Concepto',{exact:true}).fill('Material definitivo');await page.getByRole('button',{name:'Completar movimiento',exact:true}).click();await page.getByText('Movimiento completado.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'← Volver a capturas',exact:true}).click();await page.getByRole('button',{name:/Gasto.*Material definitivo.*Completado/}).waitFor();
    await page.getByRole('button',{name:'Nueva captura',exact:true}).click();await page.getByLabel('Tipo',{exact:true}).selectOption('income');await page.getByLabel('Monto',{exact:true}).fill('200');await page.getByLabel('Miembro opcional',{exact:true}).selectOption('member');await page.getByRole('button',{name:'Guardar pendiente',exact:true}).click();await page.getByText('Captura guardada.',{exact:false}).waitFor();
    await page.getByRole('button',{name:/Ingreso.*Pendiente de completar/}).click();
    await page.getByLabel('Cuota, mes y año',{exact:true}).selectOption(JSON.stringify(['2027-09','fee']));
    assert.ok(await dialog.evaluate(element=>element.scrollWidth<=innerWidth),`completion fits ${width}`);
    await page.screenshot({path:`test-results/quick-finance-${role}-${width}.png`});
    await page.getByRole('button',{name:'Registrar abono con este ingreso',exact:true}).click();await page.getByText('Abono registrado en Gestión de miembros.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__applies),1);await page.getByRole('button',{name:/Ingreso.*Aplicado a cuota/}).waitFor();
    await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert.equal(await page.getByRole('button',{name:'Captura rápida de dinero',exact:true}).evaluate(element=>document.activeElement===element),true);
  }
  for(const role of ['member','viewer']){await page.goto(`http://127.0.0.1:5181/tests/quick-finance.html?role=${role}`);await page.getByRole('heading').waitFor();assert.equal(await page.getByRole('button',{name:'Captura rápida de dinero',exact:true}).count(),0);}
  await page.goto('http://127.0.0.1:5181/tests/quick-finance.html?role=admin&readonly=1');await page.getByRole('heading').waitFor();assert.equal(await page.getByRole('button',{name:'Captura rápida de dinero',exact:true}).count(),0);assert.deepEqual(errors,[]);
  console.log('Quick finance browser passed: Admin/Master desktop and 390/320 mobile, editable date, photo, pending/completion, September quota, denied roles/read-only, focus restoration.');
}finally{await browser?.close();server.kill();}
