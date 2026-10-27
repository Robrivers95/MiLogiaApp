import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['services/templeExplorer.ts'],bundle:true,write:false,format:'cjs',platform:'node'});
const context={module:{exports:{}}};vm.runInNewContext(bundle.outputFiles[0].text,context);
const {TEMPLE_POINTS:points,TEMPLE_START:start,templeStep:step,nearbyTemplePoint:near}=context.module.exports;
assert.equal(points.length,6);assert.equal(new Set(points.map(p=>p.id)).size,6);
for(const p of points){assert.equal(p.grade,1);assert.ok(p.text&&p.reflection);assert.doesNotMatch(p.text,/compañero|maestro|segundo grado|tercer grado|contraseñ|palabra de paso/i);}
const queue=[start],seen=new Set([`${start.x},${start.y}`]),reachable=new Set();
for(let i=0;i<queue.length;i++){
 const p=queue[i],lesson=near(p);if(lesson)reachable.add(lesson.id);
 for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const n=step(p,dx,dy),key=`${n.x},${n.y}`;
  assert.ok(n.x>=1&&n.x<=9&&n.y>=1&&n.y<=12);
  assert.equal(points.some(s=>s.x===n.x&&s.y===n.y),false);
  if(!seen.has(key)){seen.add(key);queue.push(n);}
 }
}
assert.equal(reachable.size,points.length,'every lesson is reachable without walking through furniture');
assert.equal(step(start,1,1),start,'no diagonal jump through obstacles');
console.log('Apprentice temple passed: all six introductory lessons reachable, furniture/wall collisions, no diagonal bypass and no higher-degree lessons.');
