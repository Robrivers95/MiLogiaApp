import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import {chromium} from 'playwright';
await build({entryPoints:['tests/temple-explorer-fixture.tsx'],outfile:'tests/temple-explorer-browser.js',bundle:true,format:'esm'});
writeFileSync('tests/temple-explorer-browser.html',readFileSync('tests/member-ui.html','utf8').replace('/tests/member-ui-fixture.tsx','/tests/temple-explorer-browser.js').replace('</head>','<link rel="stylesheet" href="/tests/temple-explorer-browser.css"></head>'));
const cleanup=()=>{for(const suffix of ['js','html','css'])rmSync('tests/temple-explorer-browser.'+suffix,{force:true});};
if(process.env.LOGIA_TEST_BUILD_ONLY){cleanup();console.log('Temple explorer fixture bundled.');process.exit(0);}
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5189'],{stdio:'ignore'});
let browser;
try{
 for(let i=0;i<80;i++){try{await fetch('http://127.0.0.1:5189/tests/temple-explorer-browser.html');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5189/tests/temple-explorer-browser.html');
 const board=page.getByRole('region',{name:'Templo interactivo de Aprendiz'}),avatar=page.getByTestId('temple-avatar');
 await board.focus();
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowUp');
 assert.equal(await avatar.getAttribute('data-x'),'3');assert.equal(await avatar.getAttribute('data-y'),'11');
 await page.keyboard.press('ArrowLeft');assert.equal(await avatar.getAttribute('data-x'),'3','cannot walk through a column');
 await page.getByRole('button',{name:'Aprender',exact:true}).click();
 const lesson=page.getByRole('dialog');await lesson.getByRole('heading',{name:'Columna B',exact:true}).waitFor();
 assert.match(await lesson.innerText(),/Fuerza/);
 assert.doesNotMatch(await lesson.innerText(),/Compañero|Maestro|segundo grado|tercer grado|contraseñ|palabra de paso/i);
 await page.keyboard.press('Escape');assert.equal(await lesson.count(),0);
 await page.getByText('Recorrido de Aprendiz · 1/6 puntos',{exact:true}).waitFor();
 await page.reload();await page.getByText('Recorrido de Aprendiz · 1/6 puntos',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Volver a la entrada',exact:true}).click();
 const left=page.getByRole('button',{name:'Mover izquierda',exact:true});await left.click();assert.equal(await avatar.getAttribute('data-x'),'4','pointer control moves one tile');
 await left.hover();await page.mouse.down();await page.waitForTimeout(380);await page.mouse.up();
 const x=await avatar.getAttribute('data-x');await page.waitForTimeout(250);assert.equal(await avatar.getAttribute('data-x'),x,'release stops held movement');
 for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const box=await page.getByRole('button',{name:'Aprender',exact:true}).boundingBox();assert.ok(box.y+box.height<780,'mobile controls fit above bottom navigation');
   mkdirSync('test-results',{recursive:true});await page.screenshot({path:`test-results/temple-explorer-${width}.png`,fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log('Temple explorer passed: keyboard and pointer movement, collision, nearby B lesson, introductory-only content, persisted progress, hold/release and 320/390/1440 layout.');
}finally{await browser?.close();server.kill();cleanup();}
