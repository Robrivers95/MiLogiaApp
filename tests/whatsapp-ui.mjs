import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
const {chromium}=await import(process.env.LOGIA_PLAYWRIGHT_MODULE || 'playwright');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5180'],{stdio:'ignore'});
let browser;
try {
  for(let attempt=0;attempt<100;attempt++){try{await fetch('http://127.0.0.1:5180/tests/member-ui.html');break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
  browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.__opened=[];window.open=(url)=>{window.__opened.push(url);return null;};});
  mkdirSync('test-results',{recursive:true});
  for(const role of ['admin','master']) for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:844});
    await page.goto(`http://127.0.0.1:5180/tests/member-ui.html?whatsapp=1&role=${role}`);
    const prefix='Hola hermano, ¿me das una fecha de compromiso?\nGracias & saludos.';
    await page.getByLabel('Mensaje previo para todos (opcional)',{exact:true}).fill(prefix);
    await page.getByRole('button',{name:'Preparar cobros por WhatsApp',exact:true}).click();
    await page.getByRole('button',{name:'Comenzar recorrido (2)',exact:true}).click();
    await page.getByRole('button',{name:'Abrir WhatsApp de José Ríos',exact:true}).click();
    const first=await page.evaluate(()=>window.__opened[0]);assert.equal(new URL(first).pathname,'/528112345678');assert.ok(new URL(first).searchParams.get('text').includes('José Ríos'));assert.ok(new URL(first).searchParams.get('text').includes('$60.00'));assert.ok(new URL(first).searchParams.get('text').startsWith(prefix+'\n\nHola, José Ríos.'));
    await page.getByText('Chat abierto. Esto no confirma que hayas enviado el mensaje.').waitFor();
    await page.getByRole('button',{name:'Siguiente miembro',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Abrir WhatsApp de Ana López',exact:true}).isDisabled(),true);
    await page.getByLabel('WhatsApp del miembro',{exact:true}).fill('123');
    await page.getByRole('button',{name:'Guardar teléfono y autorización'}).click();await page.getByRole('alert').waitFor();
    await page.getByLabel('WhatsApp del miembro',{exact:true}).fill('81 8765 4321');
    await page.getByLabel('El miembro aceptó recibir recordatorios por WhatsApp.').check();
    await page.getByRole('button',{name:'Guardar teléfono y autorización'}).click();
    await page.getByRole('button',{name:'Abrir WhatsApp de Ana López',exact:true}).click();
    const second=await page.evaluate(()=>window.__opened[1]);assert.equal(new URL(second).pathname,'/528187654321');assert.ok(new URL(second).searchParams.get('text').includes('Ana López'));assert.ok(new URL(second).searchParams.get('text').startsWith(prefix+'\n\nHola, Ana López.'));
    await page.getByLabel('Mensaje previo para todos (opcional)',{exact:true}).fill('Nuevo mensaje para todos');
    await page.getByRole('button',{name:'Anterior miembro',exact:true}).click();
    await page.getByRole('button',{name:'Abrir WhatsApp de José Ríos',exact:true}).click();
    assert.ok(new URL(await page.evaluate(()=>window.__opened[2])).searchParams.get('text').startsWith('Nuevo mensaje para todos\n\nHola, José Ríos.'));
    await page.getByLabel('Mensaje previo para todos (opcional)',{exact:true}).fill('');
    await page.getByRole('button',{name:'Abrir WhatsApp de José Ríos',exact:true}).click();
    assert.ok(new URL(await page.evaluate(()=>window.__opened[3])).searchParams.get('text').startsWith('Hola, José Ríos.'));
    await page.getByRole('button',{name:'Siguiente miembro',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__saved.permitted),true);
    await page.getByLabel('WhatsApp del miembro',{exact:true}).fill('8111111111');assert.equal(await page.getByRole('button',{name:'Abrir WhatsApp de Ana López',exact:true}).isDisabled(),true,'unsaved edits cannot open another destination');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`WhatsApp flow fits ${width}`);
    await page.screenshot({path:`test-results/whatsapp-${role}-${width}.png`});
  }
  for(const role of ['viewer','member']){
    await page.goto(`http://127.0.0.1:5180/tests/member-ui.html?whatsapp=1&role=${role}`);
    assert.equal(await page.getByRole('button',{name:'Preparar cobros por WhatsApp',exact:true}).isDisabled(),true);
    assert.equal(await page.getByLabel('Mensaje previo para todos (opcional)',{exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>window.__prepared || 0),0,'blocked roles must not query members/debts');
    assert.equal(await page.getByRole('button',{name:/Abrir WhatsApp de/}).count(),0);
  }
  await page.goto('http://127.0.0.1:5180/tests/member-ui.html?whatsapp=1&suspended=1');assert.equal(await page.getByRole('button',{name:'Preparar cobros por WhatsApp',exact:true}).isDisabled(),true);
  assert.deepEqual(errors,[]);console.log('WhatsApp UI passed: named direct chats, prepared texts, contact/consent, queue, unsaved-edit guard, admin-only and 1440/390/320px. No real messages sent.');
}finally{await browser?.close();server.kill('SIGTERM');}
