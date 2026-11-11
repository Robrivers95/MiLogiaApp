import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
const {chromium}=await import(process.env.LOGIA_PLAYWRIGHT_MODULE || 'playwright');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5182'],{stdio:'ignore'});let browser;
try {
  for(let attempt=0;attempt<100;attempt++){try{await fetch('http://127.0.0.1:5182/tests/treasury-report.html');break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
  browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));mkdirSync('test-results',{recursive:true});
  await page.addInitScript(()=>{const create=URL.createObjectURL;URL.createObjectURL=blob=>{blob.text().then(text=>window.__csv=text);return create(blob);};});
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:844});await page.goto('http://127.0.0.1:5182/tests/treasury-report.html');
    await page.getByText('1–25 de 122 registros',{exact:true}).waitFor();
    await page.waitForFunction(()=>getComputedStyle(document.body).backgroundColor==='rgb(15, 23, 42)' && getComputedStyle(document.querySelector('table').parentElement).display===(innerWidth>=768?'block':'none'));
    assert.equal(await page.getByRole('table').isVisible(),width>=768);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`report fits ${width}`);
    await page.getByRole('button',{name:'Siguiente',exact:true}).click();await page.getByText('26–50 de 122 registros',{exact:true}).waitFor();
    await page.getByLabel('Año del reporte',{exact:true}).selectOption('2027');await page.getByLabel('Mes del reporte',{exact:true}).selectOption('2027-09');await page.getByLabel('Clase de ingreso',{exact:true}).selectOption('regular');
    await page.getByText('1–25 de 60 registros',{exact:true}).waitFor();
    if(width<768){assert.equal(await page.getByRole('article').count(),25);assert.match(await page.getByRole('article').first().textContent(),/Cuota normal.*100\.00.*2027-09/);}
    await page.getByLabel('Clase de ingreso',{exact:true}).selectOption('extra');await page.getByLabel('Concepto de cuota extraordinaria',{exact:true}).selectOption('Cena anual');await page.getByLabel('Proyecto del movimiento',{exact:true}).selectOption('cactus');
    await page.getByText('1–25 de 60 registros',{exact:true}).waitFor();
    if(width<768){assert.match(await page.getByRole('article').first().textContent(),/Cuota extraordinaria.*Cena anual.*Evento Cactus 2/);assert.equal(await page.getByRole('article').filter({hasText:'Cuota normal'}).count(),0);}
    await page.getByRole('button',{name:'Descargar CSV filtrado',exact:true}).click();await page.waitForFunction(()=>typeof window.__csv==='string');
    const csv=await page.evaluate(()=>window.__csv);assert.equal(csv.split('\r\n').length,61,'CSV exports every filtered page');assert.ok(csv.includes('"Cuota extraordinaria"'));assert.ok(!csv.includes('"Cuota normal"'));assert.ok(csv.includes('"Evento Cactus 2"'));assert.ok(csv.includes('"2027-09","2027-09","2027-10-03"'));
    await page.screenshot({path:`test-results/treasury-report-${width}.png`});
    await page.getByLabel('Buscar miembro o concepto en tesorería',{exact:true}).fill('Miembro 059');await page.getByText('1–1 de 1 registros',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Corregir pago / fecha',exact:true}).click();assert.equal(await page.evaluate(()=>window.__edits.length),1);
    await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await page.getByLabel('Mes según',{exact:true}).selectOption('date');await page.getByLabel('Mes del reporte',{exact:true}).selectOption('2027-10');await page.getByText('1–25 de 120 registros',{exact:true}).waitFor();
    await page.getByLabel('Tipo de movimiento',{exact:true}).selectOption('expense');await page.getByText('No hay registros para estos filtros.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Descargar CSV filtrado',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await page.getByLabel('Tipo de movimiento',{exact:true}).selectOption('expense');await page.getByText('1–1 de 1 registros',{exact:true}).waitFor();
  }
  await page.goto('http://127.0.0.1:5182/tests/treasury-report.html?readonly=1');await page.getByLabel('Clase de ingreso',{exact:true}).selectOption('extra');assert.equal(await page.getByRole('button',{name:'Corregir pago / fecha',exact:true}).first().isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Descargar CSV filtrado',exact:true}).isEnabled(),true);assert.deepEqual(errors,[]);
  console.log('Treasury browser passed: 122 split rows, paging, month/year/class/concept/project/search/date filters, all-page CSV, linked projects, no overflow at 1440/390/320, existing correction actions and read-only exports.');
}finally{await browser?.close();server.kill();}
